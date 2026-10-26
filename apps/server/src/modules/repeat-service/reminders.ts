// Repeat-service reminders (TSK-0114; HH-SCH-10, HH-COM-05, T67, OWN-DEC-113, OWN-DEC-78, OWN-DEC-124,
// FACT-REMINDER-CADENCES "Repeat service: on the customer-agreed schedule only ... staff-released", ENT-Message,
// RULE-NO-INVENTED-FACTS). See series.ts for the schedule itself.
// - A draft is prepared for each occurrence of a schedule whose customer wants reminders, on the occurrence's date
//   (PROPOSED: at the opening of contact.hours in the property's zone; no lead time is decided), once per date, and
//   released by staff (message.release_draft: the Owner, Office). Nothing is sent automatically
//   (reminders.cadences.repeatService: customer_agreed, staff).
// - Its wording is NOT CONFIGURED: no template of reminder.repeat_service is released, so a draft can be seen but never
//   released (TEMPLATE_NOT_CONFIGURED) until the Owner releases the wording. A reminder without approved wording is
//   never sent.
// - It is service communication the customer asked for (never marketing, so no marketing consent is needed): an opt-out
//   of optional follow-ups (service communication withdrawn on the channel, TSK-0113 preferences) stops it, checked when
//   the draft is prepared, when it is released and again right before it sends (sendPermission). Email only while texts
//   are off (OWN-DEC-190).
// - Stopped (never prepared, or cancelled): the schedule stopped, reminders turned off, the date no longer on the
//   schedule (changed), skipped, or already requested. Paused while any case is open on the schedule's project or on a
//   project an occurrence was requested in (OWN-DEC-124, HH-COM-05): the draft is kept, marked held, cannot be released,
//   and is offered again once every case is closed.
// - Queue: repeat_service_release (staff queue) while a prepared reminder of the project's schedule may be released.
import { randomUUID } from 'node:crypto'
import type { Tx } from '@handyhub/db'
import {
  isOccurrence,
  localDateOf,
  repeatReminderBlock,
  upcomingOccurrences,
  type RepeatReminderBlock,
} from '@handyhub/domain'
import type { StaffActor } from '@handyhub/policy'
import { sql } from 'kysely'
import { ApiError } from '../../api/errors.js'
import { audit } from '../../platform/audit.js'
import type { Automation, JobOutcome } from '../../platform/automation.js'
import { loadConfig, type Config } from '../../platform/config/index.js'
import { scheduleJob } from '../../platform/jobs.js'
import { currentContext } from '../../platform/request-context.js'
import { activeCaseCounts } from '../cases/active.js'
import {
  createDraft,
  currentConsent,
  currentTemplate,
  NOTIFICATION_RETRY,
  portalLink,
  present,
  releaseAutomation,
  releaseDraft,
  zonedTimeToUtc,
  type FailureItem,
  type RecordCheck,
  type ReleaseFailureItem,
  type ReleaseValues,
} from '../notifications/index.js'
import { openQueueItem, resolveQueueItem } from '../queue/items.js'
import {
  conflict,
  projectFacts,
  scheduleOf,
  seriesProjects,
  seriesRow,
  seriesTouchingProject,
  SERIES_LIMITS,
  type Reader,
  type SeriesRow,
} from './series.js'

export const REPEAT_REMINDER_KEY = 'reminder.repeat_service'
export const REPEAT_QUEUE_TYPE = 'repeat_service_release'
const RECORD_TYPE = 'service_series'
const PROCESS = 'system.repeat_service'
const HELD = 'held_case_active'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SUBJECT_RE = /^repeat_service:([0-9a-f-]{36}):(\d{4}-\d{2}-\d{2}):/i
/** The reasons that end a waiting draft (the date is no longer one the customer wants a reminder for). */
const ENDING: readonly RepeatReminderBlock[] = [
  'series_stopped',
  'reminders_off',
  'not_on_schedule',
  'occurrence_skipped',
  'occurrence_requested',
]

/** One reminder per date; a new subject only after an earlier one for the date was ended by the schedule. */
export const repeatSubjectKey = (seriesId: string, date: string) => `repeat_service:${seriesId}:${date}:${randomUUID()}`
const dateOf = (subjectKey: string) => SUBJECT_RE.exec(subjectKey)?.[2] ?? null
const requestIdOf = (fallback: string) => currentContext()?.requestId ?? fallback

/** Whether the reminder time is known: the repeat-service cadence and the contact hours are configured. */
export function reminderTimeConfigured(config: Config): boolean {
  return config.get('reminders.cadences').state === 'CONFIGURED' && config.get('contact.hours').state === 'CONFIGURED'
}

/** When a date's reminder is prepared: the opening of contact.hours in the zone (PROPOSED); null while NOT CONFIGURED. */
export function reminderDueAt(config: Config, date: string, zone: string): Date | null {
  const hours = config.get('contact.hours')
  if (!reminderTimeConfigured(config) || hours.state !== 'CONFIGURED') return null
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]
  const [hour = 0, minute = 0] = hours.value.open.split(':').map(Number)
  return zonedTimeToUtc({ year, month, day, hour, minute }, zone)
}

type DeliveryRow = {
  id: string
  subject_key: string
  state: string
  error_code: string | null
  scheduled_at: Date | null
  sent_at: Date | null
  cancelled_at: Date | null
  created_at: Date
}

async function deliveries(db: Reader, seriesId: string): Promise<(DeliveryRow & { date: string | null })[]> {
  const rows = (await db
    .selectFrom('platform.message_deliveries')
    .select(['id', 'subject_key', 'state', 'error_code', 'scheduled_at', 'sent_at', 'cancelled_at', 'created_at'])
    .where('record_type', '=', RECORD_TYPE)
    .where('record_id', '=', seriesId)
    .where('message_key', '=', REPEAT_REMINDER_KEY)
    .orderBy('seq')
    .execute()) as DeliveryRow[]
  return rows.map((r) => ({ ...r, date: dateOf(r.subject_key) }))
}

/** A delivery that counts as the date's reminder: anything but one the schedule itself ended. */
const counts = (d: DeliveryRow) => !(d.state === 'cancelled' && ENDING.includes(d.error_code as RepeatReminderBlock))

/** Why a reminder for this date may not go now (null: it may), from the records. */
export async function reminderProblem(db: Reader, s: SeriesRow, date: string): Promise<RepeatReminderBlock | null> {
  const schedule = await scheduleOf(db, s)
  const facts = await projectFacts(db, s.project_id)
  const email = facts?.email ?? null
  const cases = await activeCaseCounts(db, await seriesProjects(db, s))
  let open = 0
  for (const c of cases.values()) open += c.complaints + c.disputes + c.incidents
  return repeatReminderBlock({
    state: s.state,
    reminders: s.reminders,
    onSchedule: isOccurrence(schedule, date),
    occurrence: schedule.occurrences.find((o) => o.date === date)?.state ?? null,
    hasEmail: email !== null && email !== '',
    optedOut: email ? (await currentConsent(db, 'email', email, 'service_communication')) === 'withdrawn' : false,
    activeCases: open,
  })
}

async function notPrepared(tx: Tx, seriesId: string, date: string, reason: string, requestId: string) {
  await audit.record(tx, {
    actor: { kind: 'system', process: PROCESS },
    action: 'repeat_service.reminder_not_prepared',
    target: { type: RECORD_TYPE, id: seriesId },
    summary: { date, reason },
    requestId,
  })
}

const PREPARE_NAME = 'repeat_service.reminder_prepare'

/**
 * Schedules the preparation of the schedule's next reminder (one job per schedule version and date, at the date's
 * reminder time; now when that time has passed): the first upcoming occurrence that is not requested and has no
 * reminder yet. Nothing while the schedule is stopped, its reminders are off, its zone or the cadence is unknown.
 */
async function scheduleNextReminder(tx: Tx, s: SeriesRow, requestId: string): Promise<void> {
  if (s.state !== 'active' || !s.reminders) return
  const facts = await projectFacts(tx, s.project_id)
  const config = await loadConfig(tx)
  if (!facts?.time_zone) return
  const schedule = await scheduleOf(tx, s)
  const done = new Set((await deliveries(tx, s.id)).filter(counts).flatMap((d) => (d.date ? [d.date] : [])))
  const requested = new Set(schedule.occurrences.filter((o) => o.state === 'requested').map((o) => o.date))
  const next = upcomingOccurrences(schedule, localDateOf(new Date(), facts.time_zone), SERIES_LIMITS.upcoming).find(
    (d) => !done.has(d) && !requested.has(d),
  )
  if (!next) return
  const due = reminderDueAt(config, next, facts.time_zone)
  if (!due) return
  await scheduleJob(tx, repeatReminderAutomation(), {
    key: `${s.id}:${next}:v${s.version}`,
    runAt: due.getTime() > Date.now() ? due : new Date(),
    target: { type: RECORD_TYPE, id: s.id },
    payload: { date: next, version: s.version },
    requestId,
  })
}

/**
 * Prepares the reminder of one date, once (see the header): nothing before its time, nothing for a schedule changed
 * since the job was scheduled (the change scheduled its own), nothing while the cadence or the zone is unknown, nothing
 * the customer no longer wants or opted out of. Prepared while a case is open, held.
 */
export async function prepareRepeatReminder(
  tx: Tx,
  seriesId: string,
  input: { date: string; version: number },
  requestId: string,
): Promise<JobOutcome> {
  const s = await seriesRow(tx, seriesId, true)
  if (!s || s.version !== input.version) return 'cancelled'
  const facts = await projectFacts(tx, s.project_id)
  const config = await loadConfig(tx)
  const due = facts?.time_zone ? reminderDueAt(config, input.date, facts.time_zone) : null
  if (!facts?.time_zone || !due) {
    await notPrepared(tx, s.id, input.date, facts?.time_zone ? 'not_configured' : 'property_zone_unknown', requestId)
    return 'cancelled'
  }
  if (due.getTime() > Date.now()) {
    await scheduleJob(tx, repeatReminderAutomation(), {
      key: `${s.id}:${input.date}:v${s.version}:at:${due.getTime()}`,
      runAt: due,
      target: { type: RECORD_TYPE, id: s.id },
      payload: { date: input.date, version: s.version },
      requestId,
    })
    return 'cancelled'
  }
  if ((await deliveries(tx, s.id)).some((d) => d.date === input.date && counts(d))) {
    await syncRepeatReminders(tx, s.id)
    return 'cancelled'
  }
  const block = await reminderProblem(tx, s, input.date)
  if (block && block !== 'case_active') {
    await notPrepared(tx, s.id, input.date, block, requestId)
    // The next occurrence's reminder is still prepared on its own date.
    await scheduleNextAfter(tx, s, input.date, requestId)
    return 'cancelled'
  }
  const destination = {
    channel: 'email' as const,
    destination: facts.email as string,
    permission: facts.preferred_channel === 'email' ? ('preferred' as const) : ('permitted' as const),
  }
  const draft = await createDraft(tx, {
    config,
    messageKey: REPEAT_REMINDER_KEY,
    destination,
    recipient: { kind: 'customer_contact', id: facts.contact_id as string, destinations: [destination] },
    subjectKey: repeatSubjectKey(s.id, input.date),
    record: { type: RECORD_TYPE, id: s.id },
    values: {},
    projectId: s.project_id,
  })
  await audit.record(tx, {
    actor: { kind: 'system', process: PROCESS },
    action: 'repeat_service.reminder_prepared',
    target: { type: 'message_delivery', id: draft.id },
    summary: { seriesId: s.id, date: input.date, channel: 'email', held: block === 'case_active' },
    requestId,
  })
  await syncRepeatReminders(tx, s.id)
  return 'done'
}

/** The reminder job of the occurrence after `date` (a date the customer no longer wants a reminder for). */
async function scheduleNextAfter(tx: Tx, s: SeriesRow, date: string, requestId: string) {
  const facts = await projectFacts(tx, s.project_id)
  if (!facts?.time_zone || s.state !== 'active' || !s.reminders) return
  const schedule = await scheduleOf(tx, s)
  const next = upcomingOccurrences(schedule, date, SERIES_LIMITS.upcoming).find((d) => d > date)
  const due = next ? reminderDueAt(await loadConfig(tx), next, facts.time_zone) : null
  if (!next || !due) return
  await scheduleJob(tx, repeatReminderAutomation(), {
    key: `${s.id}:${next}:v${s.version}`,
    runAt: due.getTime() > Date.now() ? due : new Date(),
    target: { type: RECORD_TYPE, id: s.id },
    payload: { date: next, version: s.version },
    requestId,
  })
}

/** The schedule-triggered preparation of one date's repeat-service reminder (0124). */
export function repeatReminderAutomation(): Automation {
  return {
    name: PREPARE_NAME,
    trigger: {
      kind: 'schedule',
      description: 'one job per schedule version and occurrence date, at the opening of contact hours on that date',
    },
    identity: PROCESS,
    inputs: { description: 'the schedule (service_series target), the date and version (payload)', version: 1 },
    idempotency: 'one reminder draft per schedule and date (subject repeat_service:<series>:<date>:<id>)',
    effect: 'prepares the staff-released repeat-service reminder of an occurrence; never sends anything',
    retry: NOTIFICATION_RETRY,
    timeoutMs: 10_000,
    exceptionOwner: 'office',
    audit: { action: 'repeat_service.reminder_prepare' },
    handle: async ({ tx, job }) => {
      const id = job.target.id
      const date = job.payload['date']
      const version = job.payload['version']
      if (!id || !UUID_RE.test(id) || typeof date !== 'string' || typeof version !== 'number') return 'cancelled'
      return prepareRepeatReminder(tx, id, { date, version }, job.requestId)
    },
  }
}

/**
 * Keeps a schedule's reminder drafts, its staff queue item and its next reminder job in line with the records, in the
 * transaction of the change (a schedule change, a skip or link, a case opened or closed, a release): a draft the
 * customer no longer wants is cancelled with the reason; one is marked held while a case is open and offered again
 * once none is.
 */
export async function syncRepeatReminders(tx: Tx, seriesId: string): Promise<void> {
  const s = await seriesRow(tx, seriesId)
  if (!s) return
  const drafts = (await deliveries(tx, s.id)).filter((d) => d.state === 'draft' && d.date)
  let ready = false
  for (const d of drafts) {
    const block = await reminderProblem(tx, s, d.date as string)
    if (block === 'case_active') {
      if (d.error_code !== HELD)
        await tx
          .updateTable('platform.message_deliveries')
          .set({ error_code: HELD, updated_at: sql<Date>`now()` })
          .where('id', '=', d.id)
          .execute()
      continue
    }
    if (block && ENDING.includes(block)) {
      await tx
        .updateTable('platform.message_deliveries')
        .set({
          state: 'cancelled',
          error_code: block,
          cancelled_by: 'system',
          cancelled_at: sql<Date>`now()`,
          updated_at: sql<Date>`now()`,
        })
        .where('id', '=', d.id)
        .where('state', '=', 'draft')
        .execute()
      continue
    }
    if (d.error_code === HELD)
      await tx
        .updateTable('platform.message_deliveries')
        .set({ error_code: null, updated_at: sql<Date>`now()` })
        .where('id', '=', d.id)
        .execute()
    // An opt-out or a missing email is the send's own recheck; the draft stays for staff to see.
    if (block === null) ready = true
  }
  const facts = await projectFacts(tx, s.project_id)
  if (ready)
    await openQueueItem(tx, {
      type: REPEAT_QUEUE_TYPE,
      subjectId: s.project_id,
      reason: 'repeat_reminder_ready',
      projectId: s.project_id,
      reference: facts?.project_reference ?? null,
      status: s.state,
    })
  else await resolveQueueItem(tx, { type: REPEAT_QUEUE_TYPE, subjectId: s.project_id, resolution: 'no_draft' })
  await scheduleNextReminder(tx, s, requestIdOf(`repeat-service:${s.id}`))
}

/** syncRepeatReminders for the schedules a project's cases pause (a case opened, changed or closed on it). */
export async function syncProjectRepeatReminders(tx: Tx, projectId: string): Promise<void> {
  for (const id of await seriesTouchingProject(tx, projectId)) await syncRepeatReminders(tx, id)
}

// ------------------------------------------------------------------------------------------------ send time

/**
 * The send-time recheck of a released reminder (the service_series entry of the one notify.release registration):
 * a date the customer no longer wants a reminder for cancels it; an open case holds it (back to a draft for staff).
 */
export const repeatReminderRecordCheck: RecordCheck = async (tx, input) => {
  if (input.messageKey !== REPEAT_REMINDER_KEY) return 'current'
  const s = await seriesRow(tx, input.recordId)
  const date = dateOf(input.subjectKey)
  if (!s || !date) return { stale: 'series_not_found' }
  const block = await reminderProblem(tx, s, date)
  if (block === 'case_active') return { hold: 'case_active' }
  if (block && ENDING.includes(block)) return { stale: block }
  // Opt-outs and channel permission: the send's own recheck (sendPermission) suppresses it.
  return 'current'
}

/** The values of the reminder read when it sends: the project's portal page (where it can be requested again). */
export function repeatReminderValues(publicSiteUrl: string | undefined): ReleaseValues {
  return async (tx, row) => {
    if (row.message_key !== REPEAT_REMINDER_KEY) return undefined
    const id = SUBJECT_RE.exec(row.subject_key)?.[1]
    const s = id ? await seriesRow(tx, id) : null
    const facts = s ? await projectFacts(tx, s.project_id) : null
    if (!facts) return {}
    return present({ projectLink: portalLink(publicSiteUrl, facts.project_reference) })
  }
}

/** A failed reminder is a delivery issue for the project's responsible staff member (HH-COM-02). */
export const repeatReminderFailureItem: ReleaseFailureItem = async (tx, row): Promise<FailureItem | undefined> => {
  if (row.message_key !== REPEAT_REMINDER_KEY || row.record_type !== RECORD_TYPE || !row.record_id) return undefined
  const s = await seriesRow(tx, row.record_id)
  const facts = s ? await projectFacts(tx, s.project_id) : null
  if (!s || !facts) return undefined
  return { reference: facts.reference, projectId: s.project_id, assignedStaffId: facts.responsible_staff_id }
}

// ------------------------------------------------------------------------------------------------ staff actions

/** The scheduling declaration of notify.release (its senders are the worker's own; scheduling needs none). */
const RELEASE_JOB = releaseAutomation({ email: null, sms: null })

export async function reminderWordingReady(db: Reader): Promise<boolean> {
  return (await currentTemplate(db, REPEAT_REMINDER_KEY, 'email', 'en')) !== null
}

async function lockDraft(tx: Tx, seriesId: string, deliveryId: string) {
  if (!UUID_RE.test(deliveryId)) throw new ApiError('NOT_FOUND')
  const row = await tx
    .selectFrom('platform.message_deliveries')
    .select(['id', 'state', 'subject_key'])
    .where('id', '=', deliveryId)
    .where('record_type', '=', RECORD_TYPE)
    .where('record_id', '=', seriesId)
    .where('message_key', '=', REPEAT_REMINDER_KEY)
    .forUpdate()
    .executeTakeFirst()
  if (!row) throw new ApiError('NOT_FOUND')
  if (row.state !== 'draft') throw conflict('NOT_A_DRAFT', 'reminder')
  return { ...row, date: dateOf(row.subject_key) as string }
}

/**
 * Staff release a prepared reminder (message.release_draft): refused while its wording is NOT CONFIGURED, while a case
 * is open, or when the customer no longer wants it or opted out. Sent by notify.release at its release time and
 * rechecked then.
 */
export async function releaseRepeatReminder(
  tx: Tx,
  actor: StaffActor,
  seriesId: string,
  deliveryId: string,
): Promise<{ deliveryId: string; runAt: Date }> {
  const s = await seriesRow(tx, seriesId, true)
  if (!s) throw new ApiError('NOT_FOUND')
  const row = await lockDraft(tx, s.id, deliveryId)
  if (!(await reminderWordingReady(tx))) throw conflict('TEMPLATE_NOT_CONFIGURED', 'reminder')
  const block = await reminderProblem(tx, s, row.date)
  if (block) throw conflict(block.toUpperCase(), 'reminder')
  await tx
    .updateTable('platform.message_deliveries')
    .set({ error_code: null, updated_at: sql<Date>`now()` })
    .where('id', '=', row.id)
    .execute()
  const { runAt } = await releaseDraft(tx, {
    config: await loadConfig(tx),
    deliveryId: row.id,
    actor: { kind: 'staff', id: actor.userId, roles: [...actor.roles] },
    automation: RELEASE_JOB,
    requestId: requestIdOf(`repeat-reminder-release:${row.id}`),
  })
  await syncRepeatReminders(tx, s.id)
  return { deliveryId: row.id, runAt }
}

/** Staff decide not to send a prepared reminder: kept as cancelled (dismissed), never sent, never prepared again. */
export async function cancelRepeatReminder(
  tx: Tx,
  actor: StaffActor,
  seriesId: string,
  deliveryId: string,
): Promise<{ deliveryId: string }> {
  const s = await seriesRow(tx, seriesId, true)
  if (!s) throw new ApiError('NOT_FOUND')
  const row = await lockDraft(tx, s.id, deliveryId)
  await tx
    .updateTable('platform.message_deliveries')
    .set({
      state: 'cancelled',
      error_code: 'dismissed',
      cancelled_by: actor.userId,
      cancelled_at: sql<Date>`now()`,
      updated_at: sql<Date>`now()`,
    })
    .where('id', '=', row.id)
    .where('state', '=', 'draft')
    .execute()
  await syncRepeatReminders(tx, s.id)
  return { deliveryId: row.id }
}

// ------------------------------------------------------------------------------------------------ the staff view

export type ReminderView = {
  id: string
  date: string
  state: string
  /** Why it waits, stopped or failed (held_case_active, a stop reason, dismissed, a delivery error code). */
  reason: string | null
  scheduledAt: string | null
  sentAt: string | null
  cancelledAt: string | null
  createdAt: string
}

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null)

export async function remindersView(db: Reader, s: SeriesRow): Promise<ReminderView[]> {
  return (await deliveries(db, s.id)).map((d) => ({
    id: d.id,
    date: d.date ?? '',
    state: d.state,
    reason: d.error_code,
    scheduledAt: d.state === 'queued' && !d.sent_at ? iso(d.scheduled_at) : null,
    sentAt: iso(d.sent_at),
    cancelledAt: iso(d.cancelled_at),
    createdAt: new Date(d.created_at).toISOString(),
  }))
}
