// The automatic appointment reminder 24 hours before (TSK-0067, TSK-0121; HH-COM-11, HH-COM-05, HH-COM-06, HH-COM-15,
// T65, T41, C07, S06, OWN-DEC-153, OWN-DEC-107, OWN-DEC-151, OWN-DEC-158, OWN-DEC-159, FACT-REMINDER-CADENCES,
// ENT-Visit, ENT-Message, RULE-DECIDED-VALUES-ACTIVE, RULE-SERVER-AUTHZ, RULE-NO-INVENTED-FACTS).
// - Schedule: a visit becoming confirmed (appointment.reserved, estimate_visit.reserved) or a committed reschedule
//   (appointment.change_committed) runs appointment.reminder_schedule, which schedules the reminder of the visit's
//   current window (OWN-DEC-153 items 3 and 6): one queued delivery per destination (the email, and the mobile number,
//   whose text needs the SMS opt-in and waits for the recipient's permitted hours), due the configured elapsed hours
//   before the arrival window starts (reminders.cadences.appointment.hoursBefore, 24; elapsed time, so a DST change
//   never moves it by an hour, OWN-DEC-159 item 10), sent by its notify.release job. A visit booked less than that
//   ahead gets no "24-hour" reminder (booked_within_interval). While the cadence is NOT CONFIGURED nothing is
//   scheduled; no interval is made up. Nobody releases it (OWN-DEC-153).
// - Content: the owner's appointment_reminder wording (OWN-DEC-151) with the first name, the confirmed date, the
//   arrival window and its zone (the visit's own property zone) and the visit reference, read when it sends; never the
//   address (OWN-DEC-158).
// - Recheck (HH-COM-05, OWN-DEC-107 "suppress outdated, canceled, or duplicate reminders"): when it is scheduled and
//   again by the send job (the send-time record check of the one notify.release registration, automations.ts): the
//   visit must still be confirmed, at the window the reminder was scheduled for, before that window starts. Channel
//   permission and consent are rechecked at send (an SMS STOP suppresses a text).
// - A reschedule or a cancellation (TSK-0066) cancels the visit's waiting reminders in its own transaction, with the
//   reason and an audit event; the rescheduled visit gets a new reminder for its new window (recalculated). Any other
//   way a visit leaves 'confirmed' cancels them in the database (migration 0060). The delivery tuple (message, channel,
//   subject = visit and window version, destination) holds one row, so a window is reminded once per destination.
// - PROPOSED: a reassignment keeps the reminder (its date and window do not change).
import type { Db, Tx } from '@handyhub/db'
import { afterElapsedHours } from '@handyhub/domain'
import { sql } from 'kysely'
import { audit } from '../../platform/audit.js'
import type { Automation, JobOutcome } from '../../platform/automation.js'
import { loadConfig, type Config } from '../../platform/config/index.js'
import { currentContext } from '../../platform/request-context.js'
import {
  contactDestinations,
  firstNameOf,
  NOTIFICATION_RETRY,
  portalLink,
  present,
  scheduleAutomaticDelivery,
  visitNumberOf,
  visitWindowValues,
  type FailureItem,
  type RecordCheck,
  type ReleaseFailureItem,
  type ReleaseValues,
} from '../notifications/index.js'
import { resolveQueueItem } from '../queue/items.js'
import { storedWindow } from './visits.js'

type Reader = Db | Tx

export const APPOINTMENT_REMINDER_MESSAGE_KEY = 'reminder.appointment'
/** The queue item of the staff-released drafts before TSK-0121 (no longer opened). */
export const APPOINTMENT_REMINDER_ITEM = 'appointment_reminder'
const RECORD_TYPE = 'visit'
const PROCESS = 'system.appointment_reminders'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Why an appointment reminder is not scheduled or sent (HH-COM-11, OWN-DEC-107: outdated, canceled, duplicate). */
export const APPOINTMENT_REMINDER_STOP_REASONS = [
  'visit_canceled',
  'visit_rescheduled',
  'visit_en_route',
  'visit_arrived',
  'visit_completed',
  'visit_no_access',
  'visit_not_confirmed',
  'visit_started',
  // TSK-0121 (OWN-DEC-153): booked less than the interval ahead: no "24-hour" reminder.
  'booked_within_interval',
] as const
export type AppointmentReminderStopReason = (typeof APPOINTMENT_REMINDER_STOP_REASONS)[number]

/** One reminder per visit and window version: a rescheduled visit's reminder is a new subject. */
export const appointmentReminderSubject = (visitId: string, windowVersion: number) =>
  `appointment_reminder:${visitId}:w${windowVersion}`
export function windowVersionOf(subjectKey: string): number | null {
  const m = /:w(\d+)$/.exec(subjectKey)
  return m ? Number(m[1]) : null
}

export type AppointmentReminderCadence =
  | { readonly state: 'CONFIGURED'; readonly version: number; readonly proposed: boolean; readonly hoursBefore: number }
  | { readonly state: 'NOT_CONFIGURED'; readonly version: number | null }

/** The configured appointment-reminder interval (FACT-REMINDER-CADENCES); NOT CONFIGURED when the key is unset. */
export function appointmentReminderCadence(config: Config): AppointmentReminderCadence {
  const entry = config.get('reminders.cadences')
  if (entry.state !== 'CONFIGURED') return { state: 'NOT_CONFIGURED', version: entry.version }
  return {
    state: 'CONFIGURED',
    version: entry.version,
    proposed: entry.proposed,
    hoursBefore: entry.value.appointment.hoursBefore,
  }
}

/** When the reminder is due: the interval in elapsed hours before the arrival window starts (DST-safe). */
export function appointmentReminderDueAt(startsAt: Date, hoursBefore: number): Date {
  return afterElapsedHours(startsAt, -hoursBefore)
}

/** Whether a visit confirmed at `bookedAt` was booked at least the interval ahead (otherwise: no reminder). */
export function bookedAheadEnough(startsAt: Date, bookedAt: Date, hoursBefore: number): boolean {
  return appointmentReminderDueAt(startsAt, hoursBefore).getTime() >= bookedAt.getTime()
}

const STATE_STOPS: Readonly<Record<string, AppointmentReminderStopReason>> = {
  canceled: 'visit_canceled',
  en_route: 'visit_en_route',
  arrived: 'visit_arrived',
  completed: 'visit_completed',
  no_access: 'visit_no_access',
}

async function dbNow(db: Reader): Promise<Date> {
  const r = await sql<{ now: Date }>`SELECT now() AS now`.execute(db)
  return new Date((r.rows[0] as { now: Date }).now)
}

/**
 * The stop rule of a visit's reminder for one window version as the records are now (HH-COM-11): the reason it is not
 * scheduled or sent, or null while the visit is confirmed at that window and the window has not started.
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

/** Cancels one waiting reminder with its reason, audited as the system's stop. */
async function cancelAppointmentReminder(
  tx: Tx,
  row: { id: string; subject_key: string; channel: string },
  reason: string,
  requestId: string,
): Promise<boolean> {
  const done = await tx
    .updateTable('platform.message_deliveries')
    .set({
      state: 'cancelled',
      error_code: reason,
      cancelled_by: 'system',
      cancelled_at: sql<Date>`now()`,
      updated_at: sql<Date>`now()`,
    })
    .where('id', '=', row.id)
    .where((eb) =>
      eb.or([eb('state', '=', 'draft'), eb.and([eb('state', '=', 'queued'), eb('provider_message_id', 'is', null)])]),
    )
    .executeTakeFirst()
  if (Number(done.numUpdatedRows) === 0) return false
  await audit.record(tx, {
    actor: { kind: 'system', process: PROCESS },
    action: 'appointment_reminder.stop',
    target: { type: 'message_delivery', id: row.id },
    summary: {
      messageKey: APPOINTMENT_REMINDER_MESSAGE_KEY,
      windowVersion: windowVersionOf(row.subject_key),
      channel: row.channel,
      reason,
    },
    requestId,
  })
  await resolveQueueItem(tx, { type: 'delivery_failed', subjectId: row.id, resolution: 'cancelled' })
  return true
}

/**
 * Cancels the visit's waiting reminders whose stop rule now applies (HH-COM-11, OWN-DEC-153 items 4 and 6): called in
 * the transaction of each change that makes them outdated (a reschedule, after the window moved: the old window's
 * reminder; a cancellation, with its reason, just before the visit's state changes; the worker's On my way). A reminder
 * already with the provider is not touched. Returns how many were cancelled.
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
    if (await cancelAppointmentReminder(tx, row, reason, requestIdOf(`visit-reminder:${visitId}`))) cancelled++
  }
  return cancelled
}

/**
 * The send-time recheck of an appointment reminder (registered with the one notify.release automation): the visit is
 * still confirmed at the window the reminder was scheduled for and that window has not started.
 */
export const appointmentReminderRecordCheck: RecordCheck = async (tx, input) => {
  if (input.messageKey !== APPOINTMENT_REMINDER_MESSAGE_KEY) return 'current'
  const wv = windowVersionOf(input.subjectKey)
  if (wv === null || !UUID_RE.test(input.recordId)) return { stale: 'visit_not_confirmed' }
  const reason = await appointmentReminderStopReason(tx, input.recordId, wv, await dbNow(tx))
  return reason ? { stale: reason } : 'current'
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
      'c.full_name',
      'c.email',
      'c.phone_e164',
      'c.preferred_channel',
    ])
    .where('r.project_id', '=', projectId)
    .orderBy('r.submitted_at')
    .executeTakeFirst()
}

/** The delivery issue of a failed appointment reminder (HH-COM-02, OWN-DEC-107 "record delivery failures"). */
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
 * The values of the owner's appointment_reminder wording, read when it sends (TSK-0121, OWN-DEC-151, OWN-DEC-158): the
 * first name, the confirmed date, the arrival window and its zone (the visit's property zone, its short name at that
 * instant), the visit reference and the project link. Never the address.
 */
export function appointmentReminderValues(publicSiteUrl: string | undefined): ReleaseValues {
  return async (tx, row) => {
    if (row.message_key !== APPOINTMENT_REMINDER_MESSAGE_KEY) return undefined
    const visitId = /^appointment_reminder:([0-9a-f-]{36}):w\d+$/i.exec(row.subject_key)?.[1]
    if (!visitId || !UUID_RE.test(visitId)) return {}
    const v = await tx.selectFrom('work.visits').selectAll().where('id', '=', visitId).executeTakeFirst()
    if (!v) return {}
    const r = await requestFacts(tx, v.project_id)
    if (!r) return {}
    const w = visitWindowValues(storedWindow(v))
    return present({
      customerName: firstNameOf(r.full_name),
      date: w.visitDate,
      start: w.startTime,
      end: w.endTime,
      zone: w.timeZone,
      visitNumber: visitNumberOf(r.reference, v.number),
      projectLink: portalLink(publicSiteUrl, r.reference),
    })
  }
}

/**
 * Schedules the reminder of a visit's window (TSK-0121): unless a stop rule applies, the visit was booked less than the
 * interval ahead or the cadence is NOT CONFIGURED. The reminders of its earlier windows are cancelled first.
 */
export async function planAppointmentReminder(
  tx: Tx,
  input: { visitId: string; windowVersion: number; bookedAt: Date; requestId: string },
): Promise<JobOutcome> {
  // The visit's lock first (the order of every visit change), so a reschedule or cancellation serializes with it.
  const v = await tx
    .selectFrom('work.visits')
    .select(['id', 'project_id', 'state', 'window_version', 'starts_at'])
    .where('id', '=', input.visitId)
    .forUpdate()
    .executeTakeFirst()
  if (!v) return 'cancelled'
  await stopAppointmentReminders(tx, input.visitId)
  const config = await loadConfig(tx)
  const cadence = appointmentReminderCadence(config)
  const startsAt = new Date(v.starts_at)
  const reason =
    (await appointmentReminderStopReason(tx, input.visitId, input.windowVersion, await dbNow(tx))) ??
    (cadence.state === 'CONFIGURED' && !bookedAheadEnough(startsAt, input.bookedAt, cadence.hoursBefore)
      ? 'booked_within_interval'
      : null)
  if (reason || cadence.state !== 'CONFIGURED') {
    await audit.record(tx, {
      actor: { kind: 'system', process: PROCESS },
      action: 'appointment_reminder.not_scheduled',
      target: { type: RECORD_TYPE, id: input.visitId },
      summary: {
        messageKey: APPOINTMENT_REMINDER_MESSAGE_KEY,
        windowVersion: input.windowVersion,
        reason: reason ?? 'not_configured',
      },
      requestId: input.requestId,
    })
    return 'cancelled'
  }
  const r = await requestFacts(tx, v.project_id)
  if (!r) return 'cancelled'
  const scheduled = await scheduleAutomaticDelivery(tx, {
    config,
    messageKey: APPOINTMENT_REMINDER_MESSAGE_KEY,
    recipient: { kind: 'customer_contact', id: r.contactId, destinations: contactDestinations(r) },
    subjectKey: appointmentReminderSubject(input.visitId, input.windowVersion),
    record: { type: RECORD_TYPE, id: input.visitId },
    projectId: v.project_id,
    dueAt: appointmentReminderDueAt(startsAt, cadence.hoursBefore),
    requestId: input.requestId,
    process: PROCESS,
  })
  return scheduled.state === 'scheduled' ? 'done' : 'cancelled'
}

/** The committed events after which a visit's current window needs its reminder. */
export const REMINDER_SCHEDULE_EVENTS = [
  'appointment.reserved',
  'estimate_visit.reserved',
  'appointment.change_committed',
] as const

/**
 * A confirmed visit (or a committed reschedule) schedules the reminder of its current window, measured from when the
 * event was committed (the booking time). NOT CONFIGURED schedules nothing.
 */
export function appointmentReminderScheduleAutomation(): Automation {
  return {
    name: 'appointment.reminder_schedule',
    trigger: { kind: 'event', eventTypes: [...REMINDER_SCHEDULE_EVENTS] },
    identity: PROCESS,
    inputs: {
      description: 'the committed visit event and when it was committed; the visit and the cadence when it runs',
      version: 2,
    },
    idempotency: 'one delivery per visit, window version and destination (the delivery tuple)',
    effect: 'schedules the automatic reminder of a confirmed visit’s current window',
    retry: NOTIFICATION_RETRY,
    timeoutMs: 10_000,
    exceptionOwner: 'office',
    audit: { action: 'appointment_reminder.schedule' },
    handle: async ({ tx, job }): Promise<JobOutcome> => {
      const visitId = job.target.id
      if (!visitId || !UUID_RE.test(visitId)) return 'cancelled'
      const v = await tx
        .selectFrom('work.visits')
        .select(['window_version'])
        .where('id', '=', visitId)
        .executeTakeFirst()
      if (!v) return 'cancelled'
      // The booking time is when the confirming (or rescheduling) event was committed, not when the job runs.
      const ev = job.eventId
        ? await tx
            .selectFrom('platform.outbox_events')
            .select('created_at')
            .where('id', '=', job.eventId)
            .executeTakeFirst()
        : undefined
      return planAppointmentReminder(tx, {
        visitId,
        windowVersion: v.window_version,
        bookedAt: ev ? new Date(ev.created_at) : await dbNow(tx),
        requestId: job.requestId,
      })
    },
  }
}

/** Plans the reminder of a visit confirmed before TSK-0121 (migration 0075), for the window and booking time given. */
export function appointmentReminderPlanAutomation(): Automation {
  return {
    name: 'appointment.reminder_plan',
    trigger: { kind: 'schedule', description: 'one job per confirmed visit window to plan its reminder' },
    identity: PROCESS,
    inputs: {
      description: 'the visit (job target), its window version and booking time; the records then',
      version: 1,
    },
    idempotency: 'one delivery per visit, window version and destination (the delivery tuple)',
    effect: 'schedules the automatic reminder of a confirmed visit’s window',
    retry: NOTIFICATION_RETRY,
    timeoutMs: 10_000,
    exceptionOwner: 'office',
    audit: { action: 'appointment_reminder.plan' },
    handle: async ({ tx, job }): Promise<JobOutcome> => {
      const visitId = job.target.id
      const windowVersion = Number(job.payload['windowVersion'])
      const bookedAt = typeof job.payload['bookedAt'] === 'string' ? new Date(job.payload['bookedAt']) : null
      if (!visitId || !UUID_RE.test(visitId) || !Number.isInteger(windowVersion)) return 'cancelled'
      if (!bookedAt || Number.isNaN(bookedAt.getTime())) return 'cancelled'
      return planAppointmentReminder(tx, { visitId, windowVersion, bookedAt, requestId: job.requestId })
    },
  }
}

/** The appointment reminder automations. */
export function appointmentReminderAutomations(): Automation[] {
  return [appointmentReminderScheduleAutomation(), appointmentReminderPlanAutomation()]
}

type StaffRef = { id: string; name: string | null }

export type AppointmentReminderView = {
  id: string
  windowVersion: number | null
  /** Scheduled for the visit's current window. */
  current: boolean
  /** automatic (TSK-0121), or a staff-released draft from before it (kept as history). */
  release: 'automatic' | 'staff_released'
  state: string
  channel: string
  /** Why it stopped, was suppressed, failed or waits (a stop reason or a delivery error code). */
  reason: string | null
  /** When it is due (a text: the next allowed time of the recipient's permitted hours). */
  scheduledAt: string | null
  sentAt: string | null
  cancelledAt: string | null
  cancelledBy: StaffRef | 'system' | null
}

export type AppointmentRemindersView = {
  visitId: string
  visitState: string
  cadence: { state: 'CONFIGURED'; proposed: boolean; hoursBefore: number; dueAt: string } | { state: 'NOT_CONFIGURED' }
  /** The stop rule for the current window as the records are now: once set, its reminder is not sent. */
  stoppedBy: AppointmentReminderStopReason | null
  reminders: AppointmentReminderView[]
}

/**
 * The reminders of one visit for the staff screen: the interval and when the current window's reminder is due, whether
 * a stop rule applies now, and every delivery with what happened to it (the channel only; never the destination).
 */
export async function appointmentRemindersView(db: Reader, visitId: string): Promise<AppointmentRemindersView | null> {
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
      'release',
      'state',
      'channel',
      'error_code',
      'scheduled_at',
      'sent_at',
      'cancelled_by',
      'cancelled_at',
    ])
    .where('record_type', '=', RECORD_TYPE)
    .where('record_id', '=', visitId)
    .where('message_key', '=', APPOINTMENT_REMINDER_MESSAGE_KEY)
    .orderBy('seq')
    .execute()
  const ids = [...new Set(rows.map((r) => r.cancelled_by).filter((x): x is string => !!x && UUID_RE.test(x)))]
  const people = ids.length
    ? await db.selectFrom('identity.staff_users').select(['id', 'display_name']).where('id', 'in', ids).execute()
    : []
  const names = new Map(people.map((p) => [String(p.id), p.display_name]))
  const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null)
  return {
    visitId,
    visitState: v.state,
    cadence:
      cadence.state === 'CONFIGURED'
        ? {
            state: 'CONFIGURED',
            proposed: cadence.proposed,
            hoursBefore: cadence.hoursBefore,
            dueAt: appointmentReminderDueAt(new Date(v.starts_at), cadence.hoursBefore).toISOString(),
          }
        : { state: 'NOT_CONFIGURED' },
    stoppedBy,
    reminders: rows.map((r) => {
      const wv = windowVersionOf(r.subject_key)
      return {
        id: r.id,
        windowVersion: wv,
        current: wv === v.window_version,
        release: r.release === 'automatic' ? 'automatic' : 'staff_released',
        state: r.state,
        channel: r.channel,
        reason: r.error_code,
        // Due later only while it waits: once the provider accepted it, it reads as sent (sentAt).
        scheduledAt: r.state === 'queued' && !r.sent_at ? iso(r.scheduled_at) : null,
        sentAt: iso(r.sent_at),
        cancelledAt: iso(r.cancelled_at),
        cancelledBy:
          r.cancelled_by === 'system'
            ? 'system'
            : r.cancelled_by
              ? { id: r.cancelled_by, name: names.get(r.cancelled_by) ?? null }
              : null,
      }
    }),
  }
}
