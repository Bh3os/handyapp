// Appointment reminder drafts 24 hours before (TSK-0067; HH-COM-11, HH-COM-05, HH-COM-06, HH-COM-09, T65, C07, S06,
// OWN-DEC-78, OWN-DEC-107, FACT-REMINDER-CADENCES, ENT-Visit, ENT-Message, RULE-DECIDED-VALUES-ACTIVE,
// RULE-SERVER-AUTHZ, RULE-NO-INVENTED-FACTS).
// - Schedule: a visit becoming confirmed (appointment.reserved, estimate_visit.reserved) or a committed reschedule
//   (appointment.change_committed) runs appointment.reminder_schedule, which schedules one draft job for the visit's
//   current window at the configured interval before the arrival window starts (reminders.cadences.appointment
//   .hoursBefore: the owner's 24 hours, OWN-DEC-107). Confirmed less than that ahead, the job is due at once. While
//   the cadence is NOT CONFIGURED nothing is scheduled; no interval is made up.
// - Drafts, never sends (OWN-DEC-78): the job (appointment.reminder_draft) prepares one staff-released draft of
//   reminder.appointment holding the confirmed date and arrival window, the service address and the preparation steps
//   staff gave the customer with the offered windows (when there are none, nothing is made up), plus the project link
//   while the public site's address is configured. It opens the queue item appointment_reminder; nothing is sent
//   until a staff member releases the draft.
// - Release: a released appointment reminder sends inside the daily contact hours (HH-COM-09, the cadence's
//   contactHoursOnly): released outside them it waits for the next opening (notify.release, releaseTime).
// - Recheck (HH-COM-05, OWN-DEC-107 "suppress outdated, canceled, or duplicate reminders"): when the draft is prepared,
//   when staff release it and again by the send job (the send-time record check of the one notify.release
//   registration, automations.ts): the visit must still be confirmed, at the window the reminder was drafted for,
//   before that window starts; no reminder of the same window may already have been sent; the address and the
//   preparation steps must be the ones the draft holds. Channel permission and consent are rechecked at release and
//   at send (an SMS STOP suppresses a text).
// - A reschedule or a cancellation (TSK-0066) cancels the visit's waiting reminders (drafts, and released ones not yet
//   handed to the provider) in its own transaction, with the reason and an audit event; the rescheduled visit gets a
//   new draft for its new window. Any other way a visit leaves 'confirmed' cancels them in the database (migration
//   0060).
// - Wording: no template version of reminder.appointment is released (OQ-APPOINTMENT-REMINDER-WORDING), so a released
//   reminder is recorded as failed with template_not_configured and staff see the delivery issue, never a send.
// - PROPOSED (OQ-APPOINTMENT-REMINDER-WORDING): one draft per reminder on the customer's preferred channel (a text
//   when they prefer texts and may be texted now, otherwise email); a reassignment keeps the reminder (its date,
//   window, address and preparation do not change); Owner and Office release or dismiss (the roles that manage booked
//   visits); "approved preparation steps" are the preparation instructions staff wrote with the window offer.
import type { Db, Tx } from '@handyhub/db'
import { windowText } from '@handyhub/domain'
import { decide, type StaffActor } from '@handyhub/policy'
import { sql } from 'kysely'
import { audit } from '../../platform/audit.js'
import type { Automation, JobOutcome } from '../../platform/automation.js'
import { loadConfig, type Config } from '../../platform/config/index.js'
import { scheduleJob } from '../../platform/jobs.js'
import { currentContext } from '../../platform/request-context.js'
import {
  createDraft,
  NOTIFICATION_RETRY,
  sendPermission,
  type Destination,
  type FailureItem,
  type RecordCheck,
  type ReleaseFailureItem,
} from '../notifications/index.js'
import { openQueueItem, resolveQueueItem } from '../queue/items.js'
import { storedWindow } from './visits.js'

type Reader = Db | Tx

export const APPOINTMENT_REMINDER_MESSAGE_KEY = 'reminder.appointment'
export const APPOINTMENT_REMINDER_ITEM = 'appointment_reminder'
const RECORD_TYPE = 'visit'
const PROCESS = 'system.appointment_reminders'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Why an appointment reminder is not drafted or sent (HH-COM-11, OWN-DEC-107: outdated, canceled, duplicate). */
export const APPOINTMENT_REMINDER_STOP_REASONS = [
  'visit_canceled',
  'visit_rescheduled',
  'visit_en_route',
  'visit_arrived',
  'visit_completed',
  'visit_no_access',
  'visit_not_confirmed',
  'visit_started',
  'already_reminded',
  'details_changed',
] as const
export type AppointmentReminderStopReason = (typeof APPOINTMENT_REMINDER_STOP_REASONS)[number]

/** Staff dismissed the draft (PROPOSED: kept as cancelled, never sent). */
export const DISMISSED = 'dismissed'

/** One reminder per visit and window version: a rescheduled visit's reminder is a new subject. */
export const appointmentReminderSubject = (visitId: string, windowVersion: number) =>
  `appointment_reminder:${visitId}:w${windowVersion}`
export function windowVersionOf(subjectKey: string): number | null {
  const m = /:w(\d+)$/.exec(subjectKey)
  return m ? Number(m[1]) : null
}

export type AppointmentReminderCadence =
  | {
      readonly state: 'CONFIGURED'
      readonly version: number
      readonly proposed: boolean
      readonly hoursBefore: number
      readonly contactHoursOnly: boolean
    }
  | { readonly state: 'NOT_CONFIGURED'; readonly version: number | null }

/** The configured appointment-reminder interval (FACT-REMINDER-CADENCES); NOT CONFIGURED when the key is unset. */
export function appointmentReminderCadence(config: Config): AppointmentReminderCadence {
  const entry = config.get('reminders.cadences')
  if (entry.state !== 'CONFIGURED') return { state: 'NOT_CONFIGURED', version: entry.version }
  const c = entry.value.appointment
  return {
    state: 'CONFIGURED',
    version: entry.version,
    proposed: entry.proposed,
    hoursBefore: c.hoursBefore,
    contactHoursOnly: c.contactHoursOnly,
  }
}

const HOUR_MS = 3_600_000
/** When the draft is due: the interval before the arrival window starts, or at once when that time has passed. */
export function appointmentReminderDueAt(startsAt: Date, hoursBefore: number, now: Date): Date {
  const due = new Date(startsAt.getTime() - hoursBefore * HOUR_MS)
  return due.getTime() < now.getTime() ? now : due
}

const STATE_STOPS: Readonly<Record<string, AppointmentReminderStopReason>> = {
  canceled: 'visit_canceled',
  en_route: 'visit_en_route',
  arrived: 'visit_arrived',
  completed: 'visit_completed',
  no_access: 'visit_no_access',
}

/** The reminder's content: the confirmed date and arrival window, the address and the preparation steps. */
export type ReminderContent = { visitWindow: string; serviceAddress: string; preparationSteps: string | null }

/** The address as one line (street, unit, city, state and ZIP as the property record holds them). */
export function addressLine(p: { street: string; unit: string | null; city: string; state: string; zip: string }) {
  return [p.street, p.unit, `${p.city}, ${p.state.toUpperCase()} ${p.zip}`].filter((x) => x && x.trim()).join(', ')
}

/** The content of a visit's reminder from the records as they are now; null for an unknown visit. */
export async function reminderContent(db: Reader, visitId: string): Promise<ReminderContent | null> {
  const v = await db
    .selectFrom('work.visits as v')
    .innerJoin('crm.properties as p', 'p.id', 'v.property_id')
    .select([
      'v.local_date',
      'v.window_start',
      'v.window_end',
      'v.time_zone',
      'v.start_offset_minutes',
      'v.end_offset_minutes',
      'v.starts_at',
      'v.ends_at',
      'p.street',
      'p.unit',
      'p.city',
      'p.state',
      'p.zip',
    ])
    .where('v.id', '=', visitId)
    .executeTakeFirst()
  if (!v) return null
  // The preparation steps staff wrote with the offer the customer selected (shown in the portal's Appointments tab).
  const offer = await db
    .selectFrom('work.window_offers')
    .select('preparation_instructions')
    .where('visit_id', '=', visitId)
    .where('state', '=', 'selected')
    .orderBy('number', 'desc')
    .limit(1)
    .executeTakeFirst()
  return {
    // Customer messages are English (RULE-LANGUAGES).
    visitWindow: windowText(storedWindow(v), 'en-US'),
    serviceAddress: addressLine(v),
    preparationSteps: offer?.preparation_instructions ?? null,
  }
}

const contentValues = (c: ReminderContent): Record<string, string> => ({
  visitWindow: c.visitWindow,
  serviceAddress: c.serviceAddress,
  ...(c.preparationSteps ? { preparationSteps: c.preparationSteps } : {}),
})

/** Whether the stored draft values still match the address and preparation steps of the records now. */
function sameDetails(stored: unknown, now: ReminderContent): boolean {
  const s = (stored ?? {}) as Record<string, unknown>
  return s['serviceAddress'] === now.serviceAddress && (s['preparationSteps'] ?? null) === now.preparationSteps
}

async function dbNow(db: Reader): Promise<Date> {
  const r = await sql<{ now: Date }>`SELECT now() AS now`.execute(db)
  return new Date((r.rows[0] as { now: Date }).now)
}

/**
 * The stop rule of a visit's reminder for one window version as the records are now (HH-COM-11): the reason it is not
 * drafted or sent, or null while the visit is confirmed at that window and the window has not started.
 */
export async function appointmentReminderStopReason(
  db: Reader,
  visitId: string,
  windowVersion: number,
  now: Date,
): Promise<AppointmentReminderStopReason | null> {
  const v = await db
    .selectFrom('work.visits')
    .select(['state', 'window_version', 'starts_at'])
    .where('id', '=', visitId)
    .executeTakeFirst()
  if (!v) return 'visit_not_confirmed'
  if (v.state !== 'confirmed') return STATE_STOPS[v.state] ?? 'visit_not_confirmed'
  if (v.window_version !== windowVersion) return 'visit_rescheduled'
  if (new Date(v.starts_at).getTime() <= now.getTime()) return 'visit_started'
  return null
}

/** A reminder of the same visit and window already handed to the provider (a duplicate would follow). */
async function alreadyReminded(db: Reader, subjectKey: string, exceptId?: string): Promise<boolean> {
  let q = db
    .selectFrom('platform.message_deliveries')
    .select('id')
    .where('message_key', '=', APPOINTMENT_REMINDER_MESSAGE_KEY)
    .where('subject_key', '=', subjectKey)
    .where((eb) => eb.or([eb('state', 'in', ['sent', 'delivered']), eb('provider_message_id', 'is not', null)]))
  if (exceptId) q = q.where('id', '<>', exceptId)
  return (await q.limit(1).executeTakeFirst()) !== undefined
}

const requestIdOf = (fallback: string) => currentContext()?.requestId ?? fallback

const waitingRows = (tx: Tx, visitId: string) =>
  tx
    .selectFrom('platform.message_deliveries')
    .select(['id', 'subject_key', 'channel', 'state'])
    .where('record_type', '=', RECORD_TYPE)
    .where('record_id', '=', visitId)
    .where('message_key', '=', APPOINTMENT_REMINDER_MESSAGE_KEY)
    .where((eb) =>
      eb.or([eb('state', '=', 'draft'), eb.and([eb('state', '=', 'queued'), eb('provider_message_id', 'is', null)])]),
    )
    .orderBy('seq')
    .forUpdate()
    .execute()

/** Resolves the visit's queue item once none of its reminders is waiting for release. */
export async function syncAppointmentReminderItem(tx: Tx, visitId: string, resolution: string): Promise<void> {
  const waiting = await tx
    .selectFrom('platform.message_deliveries')
    .select('id')
    .where('record_type', '=', RECORD_TYPE)
    .where('record_id', '=', visitId)
    .where('message_key', '=', APPOINTMENT_REMINDER_MESSAGE_KEY)
    .where('state', '=', 'draft')
    .limit(1)
    .executeTakeFirst()
  if (!waiting) await resolveQueueItem(tx, { type: APPOINTMENT_REMINDER_ITEM, subjectId: visitId, resolution })
}

/**
 * Cancels one waiting reminder (a draft, or a released one not yet handed to the provider) with its reason, audited
 * by who cancelled it: the system for a stop rule, the staff member for a dismissal.
 */
export async function cancelAppointmentReminder(
  tx: Tx,
  row: { id: string; subject_key: string; channel: string },
  reason: string,
  by: { kind: 'system' } | { kind: 'staff'; id: string; roles: readonly string[] },
  requestId: string,
  options: { audit?: boolean } = {},
): Promise<boolean> {
  const done = await tx
    .updateTable('platform.message_deliveries')
    .set({
      state: 'cancelled',
      error_code: reason,
      cancelled_by: by.kind === 'staff' ? by.id : 'system',
      cancelled_at: sql<Date>`now()`,
      updated_at: sql<Date>`now()`,
    })
    .where('id', '=', row.id)
    .where((eb) =>
      eb.or([eb('state', '=', 'draft'), eb.and([eb('state', '=', 'queued'), eb('provider_message_id', 'is', null)])]),
    )
    .executeTakeFirst()
  if (Number(done.numUpdatedRows) === 0) return false
  if (options.audit === false) return true
  await audit.record(tx, {
    actor: by.kind === 'staff' ? by : { kind: 'system', process: PROCESS },
    action: by.kind === 'staff' ? 'appointment_reminder.dismiss' : 'appointment_reminder.stop',
    target: { type: 'message_delivery', id: row.id },
    summary: {
      messageKey: APPOINTMENT_REMINDER_MESSAGE_KEY,
      windowVersion: windowVersionOf(row.subject_key),
      channel: row.channel,
      reason,
    },
    requestId,
  })
  return true
}

/**
 * Cancels the visit's waiting reminders whose stop rule now applies (HH-COM-11): called in the transaction of each
 * change that makes them outdated (a reschedule, after the window moved: the old window's reminder). A cancellation
 * names its reason and calls this just before the visit's state changes, so the event is audited here rather than
 * left to the database backstop (migration 0060). A released reminder already with the provider is not touched.
 * Returns how many were cancelled.
 */
export async function stopAppointmentReminders(
  tx: Tx,
  visitId: string,
  options: { reason?: AppointmentReminderStopReason } = {},
): Promise<number> {
  const now = await dbNow(tx)
  let cancelled = 0
  for (const row of await waitingRows(tx, visitId)) {
    const wv = windowVersionOf(row.subject_key)
    const reason =
      options.reason ?? (wv === null ? 'visit_rescheduled' : await appointmentReminderStopReason(tx, visitId, wv, now))
    if (!reason) continue
    if (await cancelAppointmentReminder(tx, row, reason, { kind: 'system' }, requestIdOf(`visit-reminder:${visitId}`)))
      cancelled++
  }
  await syncAppointmentReminderItem(tx, visitId, 'stopped')
  return cancelled
}

/**
 * The send-time recheck of an appointment reminder (registered with the one notify.release automation): the visit is
 * still confirmed at the window the reminder was drafted for and that window has not started, no reminder of it was
 * already sent, and the address and preparation steps are the ones the reminder holds.
 */
export const appointmentReminderRecordCheck: RecordCheck = async (tx, input) => {
  if (input.messageKey !== APPOINTMENT_REMINDER_MESSAGE_KEY) return 'current'
  const wv = windowVersionOf(input.subjectKey)
  if (wv === null || !UUID_RE.test(input.recordId)) return { stale: 'visit_not_confirmed' }
  const reason = await appointmentReminderStopReason(tx, input.recordId, wv, await dbNow(tx))
  if (reason) return { stale: reason }
  if (await alreadyReminded(tx, input.subjectKey)) return { stale: 'already_reminded' }
  const content = await reminderContent(tx, input.recordId)
  const stored = await tx
    .selectFrom('platform.message_deliveries')
    .select('variables')
    .where('message_key', '=', APPOINTMENT_REMINDER_MESSAGE_KEY)
    .where('subject_key', '=', input.subjectKey)
    .where('state', '=', 'queued')
    .limit(1)
    .executeTakeFirst()
  if (!content || (stored && !sameDetails(stored.variables, content))) return { stale: 'details_changed' }
  return 'current'
}

/** The project's request facts the reminder needs (its contact, reference and responsible staff member). */
async function requestFacts(db: Reader, projectId: string) {
  return db
    .selectFrom('intake.requests as r')
    .innerJoin('crm.contacts as c', 'c.id', 'r.contact_id')
    .select([
      'r.reference',
      'r.responsible_staff_id',
      'c.id as contactId',
      'c.email',
      'c.phone_e164',
      'c.preferred_channel',
    ])
    .where('r.project_id', '=', projectId)
    .orderBy('r.submitted_at')
    .executeTakeFirst()
}

/** The delivery issue of a failed released appointment reminder (HH-COM-02, OWN-DEC-107 "record delivery failures"). */
export const appointmentReminderFailureItem: ReleaseFailureItem = async (tx, row): Promise<FailureItem | undefined> => {
  if (row.message_key !== APPOINTMENT_REMINDER_MESSAGE_KEY || row.record_type !== RECORD_TYPE || !row.record_id)
    return undefined
  if (!UUID_RE.test(row.record_id)) return undefined
  const v = await tx.selectFrom('work.visits').select('project_id').where('id', '=', row.record_id).executeTakeFirst()
  if (!v) return undefined
  const r = await requestFacts(tx, v.project_id)
  return { reference: r?.reference ?? null, projectId: v.project_id, assignedStaffId: r?.responsible_staff_id ?? null }
}

/**
 * The channel of a reminder (PROPOSED, as for the estimate reminders): a text when the customer prefers texts and may
 * be texted now (the SMS opt-in is current, no STOP), otherwise email.
 */
async function reminderDestination(
  tx: Tx,
  contact: { email: string; phone_e164: string; preferred_channel: string },
): Promise<Destination> {
  if (contact.preferred_channel === 'text' && contact.phone_e164) {
    const sms = await sendPermission(tx, {
      channel: 'sms',
      destination: contact.phone_e164,
      audience: 'customer',
      messageKey: APPOINTMENT_REMINDER_MESSAGE_KEY,
    })
    if (sms.allowed) return { channel: 'sms', destination: contact.phone_e164, permission: 'preferred' }
  }
  return {
    channel: 'email',
    destination: contact.email,
    permission: contact.preferred_channel === 'email' ? 'preferred' : 'permitted',
  }
}

export type AppointmentReminderDeps = {
  /** The public site's base URL for the project link; undefined while not configured (the link is left out). */
  publicSiteUrl?: string | undefined
}

/** One draft job per visit and window version: prepares the staff-released draft unless a stop rule applies. */
export function appointmentReminderDraftAutomation(deps: AppointmentReminderDeps = {}): Automation {
  return {
    name: 'appointment.reminder_draft',
    trigger: { kind: 'schedule', description: 'the reminder of a confirmed visit, before its arrival window' },
    identity: PROCESS,
    inputs: {
      description: 'the visit (job target) and the window version it was scheduled for; records read when it runs',
      version: 1,
    },
    idempotency: 'one job per visit and window version; one draft per window version, channel and destination',
    effect: 'prepares one staff-released appointment reminder draft and its queue item; never sends anything',
    retry: { maxAttempts: 5, baseDelayMs: 60_000, maxDelayMs: 3_600_000 },
    timeoutMs: 10_000,
    exceptionOwner: 'office',
    audit: { action: 'appointment_reminder.draft' },
    handle: async ({ tx, job }): Promise<JobOutcome> => {
      const visitId = job.target.id
      const windowVersion = Number(job.payload['windowVersion'])
      if (!visitId || !UUID_RE.test(visitId) || !Number.isInteger(windowVersion)) return 'cancelled'
      // The visit's lock first (the order of every visit change), so a reschedule or cancellation serializes with it.
      const v = await tx
        .selectFrom('work.visits')
        .select(['id', 'project_id', 'state', 'window_version', 'starts_at'])
        .where('id', '=', visitId)
        .forUpdate()
        .executeTakeFirst()
      if (!v) return 'cancelled'
      const now = await dbNow(tx)
      await stopAppointmentReminders(tx, visitId)
      const subjectKey = appointmentReminderSubject(visitId, windowVersion)
      const reason =
        (await appointmentReminderStopReason(tx, visitId, windowVersion, now)) ??
        ((await alreadyReminded(tx, subjectKey)) ? 'already_reminded' : null)
      if (reason) {
        await audit.record(tx, {
          actor: { kind: 'system', process: PROCESS },
          action: 'appointment_reminder.stop',
          target: { type: RECORD_TYPE, id: visitId },
          summary: { messageKey: APPOINTMENT_REMINDER_MESSAGE_KEY, windowVersion, reason, drafted: false },
          requestId: job.requestId,
        })
        return 'cancelled'
      }
      const r = await requestFacts(tx, v.project_id)
      const content = await reminderContent(tx, visitId)
      if (!r || !content) return 'cancelled'
      const destination = await reminderDestination(tx, r)
      const base = deps.publicSiteUrl?.replace(/\/$/, '')
      const draft = await createDraft(tx, {
        config: await loadConfig(tx),
        messageKey: APPOINTMENT_REMINDER_MESSAGE_KEY,
        destination,
        recipient: { kind: 'customer_contact', id: r.contactId, destinations: [destination] },
        subjectKey,
        record: { type: RECORD_TYPE, id: visitId },
        values: {
          ...contentValues(content),
          ...(base ? { projectLink: `${base}/portal/p/${encodeURIComponent(r.reference)}` } : {}),
        },
        projectId: v.project_id,
      })
      await openQueueItem(tx, {
        type: APPOINTMENT_REMINDER_ITEM,
        subjectId: visitId,
        reason: 'appointment_reminder',
        projectId: v.project_id,
        reference: r.reference,
        status: 'draft',
        // PROPOSED: due by the start of the arrival window.
        dueAt: new Date(v.starts_at),
      })
      await audit.record(tx, {
        actor: { kind: 'system', process: PROCESS },
        action: 'appointment_reminder.drafted',
        target: { type: 'message_delivery', id: draft.id },
        summary: {
          messageKey: APPOINTMENT_REMINDER_MESSAGE_KEY,
          visit: visitId,
          windowVersion,
          channel: destination.channel,
          preparationSteps: content.preparationSteps !== null,
        },
        requestId: job.requestId,
      })
      return 'done'
    },
  }
}

/** The committed events after which a visit's current window needs its reminder. */
export const REMINDER_SCHEDULE_EVENTS = [
  'appointment.reserved',
  'estimate_visit.reserved',
  'appointment.change_committed',
] as const

/**
 * A confirmed visit (or a committed reschedule) schedules the draft job of its current window at the configured
 * interval before the window starts, or at once when that time has passed. NOT CONFIGURED schedules nothing.
 */
export function appointmentReminderScheduleAutomation(draft: Automation): Automation {
  return {
    name: 'appointment.reminder_schedule',
    trigger: { kind: 'event', eventTypes: [...REMINDER_SCHEDULE_EVENTS] },
    identity: PROCESS,
    inputs: {
      description: 'the committed visit event; the visit and the cadence as they are when it runs',
      version: 1,
    },
    idempotency: 'one draft job per visit and window version (job key: visit and window version)',
    effect: 'schedules the reminder draft job of a confirmed visit’s current window',
    retry: NOTIFICATION_RETRY,
    timeoutMs: 10_000,
    exceptionOwner: 'office',
    audit: { action: 'appointment_reminder.schedule' },
    handle: async ({ tx, job, log }): Promise<JobOutcome> => {
      const visitId = job.target.id
      if (!visitId || !UUID_RE.test(visitId)) return 'cancelled'
      const v = await tx
        .selectFrom('work.visits')
        .select(['id', 'state', 'window_version', 'starts_at'])
        .where('id', '=', visitId)
        .executeTakeFirst()
      if (!v || v.state !== 'confirmed') return 'cancelled'
      const now = await dbNow(tx)
      if (new Date(v.starts_at).getTime() <= now.getTime()) return 'cancelled'
      const cadence = appointmentReminderCadence(await loadConfig(tx))
      if (cadence.state !== 'CONFIGURED') {
        log.warn({ visitId }, 'reminders.cadences is NOT CONFIGURED; no appointment reminder is scheduled')
        return 'cancelled'
      }
      await scheduleJob(tx, draft, {
        key: `${visitId}:w${v.window_version}`,
        runAt: appointmentReminderDueAt(new Date(v.starts_at), cadence.hoursBefore, now),
        payload: { windowVersion: v.window_version, cadenceVersion: cadence.version },
        target: { type: RECORD_TYPE, id: visitId },
        requestId: job.requestId,
      })
      return 'done'
    },
  }
}

/** The appointment reminder automations, wired together. */
export function appointmentReminderAutomations(deps: AppointmentReminderDeps = {}): Automation[] {
  const draft = appointmentReminderDraftAutomation(deps)
  return [appointmentReminderScheduleAutomation(draft), draft]
}

const allows = (actor: StaffActor, action: 'message.release_draft' | 'visit.reschedule', projectId: string) =>
  decide(actor, action, { projectId }, { now: new Date(), online: true }).effect === 'allow'

/**
 * Who may release or dismiss a visit's reminders (PROPOSED): message.release_draft together with visit.reschedule,
 * the roles that manage booked visits (Owner, Office).
 */
export function mayReleaseAppointmentReminder(actor: StaffActor, projectId: string): boolean {
  return allows(actor, 'message.release_draft', projectId) && allows(actor, 'visit.reschedule', projectId)
}

type StaffRef = { id: string; name: string | null }

export type AppointmentReminderView = {
  id: string
  windowVersion: number | null
  /** Drafted for the visit's current window. */
  current: boolean
  state: string
  channel: string
  /** Why it stopped, was dismissed, suppressed or not sent (a stop reason or a delivery error code). */
  reason: string | null
  content: ReminderContent
  draftedAt: string
  releasedAt: string | null
  releasedBy: StaffRef | null
  /** A released reminder waiting to send: when its send job runs (the next contact-hours opening, or now). */
  sendAt: string | null
  cancelledAt: string | null
  cancelledBy: StaffRef | 'system' | null
  actions: { release: boolean; dismiss: boolean }
}

export type AppointmentRemindersView = {
  visitId: string
  visitState: string
  cadence:
    | { state: 'CONFIGURED'; proposed: boolean; hoursBefore: number; contactHoursOnly: boolean; draftAt: string }
    | { state: 'NOT_CONFIGURED' }
  /** The stop rule for the current window as the records are now: once set, its reminder is not drafted or sent. */
  stoppedBy: AppointmentReminderStopReason | null
  reminders: AppointmentReminderView[]
}

/**
 * The reminders of one visit for the staff screen: the interval and when the current window's draft is due, whether
 * a stop rule applies now, and every reminder drafted with its content and what happened to it (the channel only;
 * the destination is not shown).
 */
export async function appointmentRemindersView(
  db: Reader,
  actor: StaffActor,
  visitId: string,
): Promise<AppointmentRemindersView | null> {
  const v = await db
    .selectFrom('work.visits')
    .select(['id', 'project_id', 'state', 'window_version', 'starts_at'])
    .where('id', '=', visitId)
    .executeTakeFirst()
  if (!v) return null
  const now = await dbNow(db)
  const cadence = appointmentReminderCadence(await loadConfig(db))
  const stoppedBy = await appointmentReminderStopReason(db, visitId, v.window_version, now)
  const rows = await db
    .selectFrom('platform.message_deliveries')
    .select([
      'id',
      'subject_key',
      'state',
      'channel',
      'error_code',
      'variables',
      'created_at',
      'queued_at',
      'released_by',
      'cancelled_by',
      'cancelled_at',
    ])
    .where('record_type', '=', RECORD_TYPE)
    .where('record_id', '=', visitId)
    .where('message_key', '=', APPOINTMENT_REMINDER_MESSAGE_KEY)
    .orderBy('seq')
    .execute()
  const ids = [
    ...new Set(rows.flatMap((r) => [r.released_by, r.cancelled_by]).filter((x): x is string => !!x && x !== 'system')),
  ].filter((x) => UUID_RE.test(x))
  const people = ids.length
    ? await db.selectFrom('identity.staff_users').select(['id', 'display_name']).where('id', 'in', ids).execute()
    : []
  const names = new Map(people.map((p) => [String(p.id), p.display_name]))
  const ref = (id: string | null) => (id ? { id, name: names.get(id) ?? null } : null)
  const queued = rows.filter((r) => r.state === 'queued').map((r) => `notify.release:${r.id}`)
  const jobs = queued.length
    ? await db
        .selectFrom('platform.jobs')
        .select(['job_key', 'run_at'])
        .where('job_key', 'in', queued)
        .where('state', 'in', ['queued', 'running'])
        .execute()
    : []
  const runAt = new Map(jobs.map((j) => [j.job_key, new Date(j.run_at).toISOString()]))
  const may = mayReleaseAppointmentReminder(actor, v.project_id)
  return {
    visitId,
    visitState: v.state,
    cadence:
      cadence.state === 'CONFIGURED'
        ? {
            state: 'CONFIGURED',
            proposed: cadence.proposed,
            hoursBefore: cadence.hoursBefore,
            contactHoursOnly: cadence.contactHoursOnly,
            draftAt: new Date(new Date(v.starts_at).getTime() - cadence.hoursBefore * HOUR_MS).toISOString(),
          }
        : { state: 'NOT_CONFIGURED' },
    stoppedBy,
    reminders: rows.map((r) => {
      const wv = windowVersionOf(r.subject_key)
      const s = (r.variables ?? {}) as Record<string, unknown>
      const current = wv === v.window_version
      return {
        id: r.id,
        windowVersion: wv,
        current,
        state: r.state,
        channel: r.channel,
        reason: r.error_code,
        content: {
          visitWindow: typeof s['visitWindow'] === 'string' ? s['visitWindow'] : '',
          serviceAddress: typeof s['serviceAddress'] === 'string' ? s['serviceAddress'] : '',
          preparationSteps: typeof s['preparationSteps'] === 'string' ? s['preparationSteps'] : null,
        },
        draftedAt: r.created_at.toISOString(),
        releasedAt: r.released_by && r.queued_at ? r.queued_at.toISOString() : null,
        releasedBy: ref(r.released_by),
        sendAt: r.state === 'queued' ? (runAt.get(`notify.release:${r.id}`) ?? null) : null,
        cancelledAt: r.cancelled_at?.toISOString() ?? null,
        cancelledBy: r.cancelled_by === 'system' ? 'system' : ref(r.cancelled_by),
        actions: {
          release: r.state === 'draft' && may && current && stoppedBy === null,
          dismiss: r.state === 'draft' && may,
        },
      }
    }),
  }
}

export { contentValues as reminderValues, sameDetails as reminderDetailsCurrent, alreadyReminded }
