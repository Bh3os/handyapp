// Privacy request acknowledgment, targets and deadlines (TSK-0136; HH-PRIV-07, OWN-DEC-175, OWN-DEC-205,
// FACT-PRIVACY-REQUEST-TARGETS, FACT-BUSINESS-CALENDAR, FACT-TIMEZONE, ENT-PrivacyRequest, ENT-QueueItem,
// RULE-HUMAN-REVIEW, OQ-PRIVACY-DEADLINE-DETAILS).
// - Dates: counted once, in the business time zone, when a request is received (in the submission's transaction), with
//   the business.calendar and privacy.request_targets versions in force, and kept on the request with those versions:
//   a later calendar change never moves them. The substantive acknowledgment is due by the end of the 3rd business day
//   after the receipt date; the internal target is the receipt date plus 30 calendar days (calendar arithmetic, so a
//   clock change never moves it). While a value is NOT CONFIGURED the request has no dates and says so.
// - Acknowledgments: the automatic acknowledgment is recorded at submission and shown in the portal (its message
//   wording is not given, OQ-MESSAGES-OUTSIDE-THE-21). PROPOSED: opening the Owner's review is the substantive
//   acknowledgment (the portal then shows the request under review with its target date).
// - The legal deadline is a separate field the Owner records from the attorney's definition, with a note; it is never
//   computed from the calendar or the target (OWN-DEC-205, RULE-HUMAN-REVIEW).
// - Extensions: an Owner decision on an open request, with the new date and the reason the customer is told (shown in
//   the portal: the notice message has no approved wording). PROPOSED: no limit on their number; the Owner confirms
//   the extension is legally permitted, which the software cannot check.
// - Overdue alerts: the request's item in Owner Decisions (privacy_request) carries the next deadline as its due time
//   and its reason says which date is due or overdue; a job at each deadline brings the item in line. Nothing is
//   rejected, closed or changed when a date passes: only the Owner decides (HH-PRIV-07).
import type { Db, Tx } from '@handyhub/db'
import {
  addLocalDays,
  endOfLocalDay,
  localDateOf,
  privacyDeadlineAlerts,
  privacyRequestDates,
  type BusinessCalendar,
  type PrivacyDeadlineAlert,
} from '@handyhub/domain'
import { sql } from 'kysely'
import { ApiError } from '../../api/errors.js'
import type { Automation } from '../../platform/automation.js'
import { loadConfig, type Config } from '../../platform/config/index.js'
import { scheduleJob } from '../../platform/jobs.js'
import { openQueueItem, resolveQueueItem } from '../queue/items.js'

type Reader = Db | Tx

export const PRIVACY_DEADLINE_AUTOMATION = 'privacy.request_deadlines'
export const PRIVACY_QUEUE_TYPE = 'privacy_request'
/** Longest note on a recorded legal deadline and longest extension reason (PROPOSED limits). */
export const DEADLINE_NOTE_MAX = 1000
/** How far ahead an extended target or a legal deadline may be (PROPOSED: a sanity bound, not a legal limit). */
export const DEADLINE_MAX_DAYS_AHEAD = 366

const OPEN_STATES = ['received', 'under_review'] as const
const isOpen = (state: string) => (OPEN_STATES as readonly string[]).includes(state)

export type DeadlineCounting =
  | {
      readonly state: 'CONFIGURED'
      readonly zone: string
      readonly calendar: BusinessCalendar
      readonly calendarVersion: number
      readonly substantiveAcknowledgmentBusinessDays: number
      readonly completionCalendarDays: number
      readonly targetsVersion: number
    }
  | { readonly state: 'NOT_CONFIGURED'; readonly missing: readonly string[] }

/** The configuration the dates are counted with, or the keys that are NOT CONFIGURED. */
export function deadlineCounting(config: Config): DeadlineCounting {
  const zone = config.get('business.timezone')
  const calendar = config.get('business.calendar')
  const targets = config.get('privacy.request_targets')
  if (zone.state !== 'CONFIGURED' || calendar.state !== 'CONFIGURED' || targets.state !== 'CONFIGURED')
    return {
      state: 'NOT_CONFIGURED',
      missing: [zone, calendar, targets].filter((e) => e.state !== 'CONFIGURED').map((e) => e.key),
    }
  return {
    state: 'CONFIGURED',
    zone: zone.value.zone,
    calendar: calendar.value,
    calendarVersion: calendar.version,
    substantiveAcknowledgmentBusinessDays: targets.value.substantiveAcknowledgmentBusinessDays,
    completionCalendarDays: targets.value.completionCalendarDays,
    targetsVersion: targets.version,
  }
}

type DatesRow = {
  id: string
  reference: string
  project_id: string
  state: string
  submitted_at: Date
  review_started_at: Date | null
  received_on: string | null
  time_zone: string | null
  calendar_version: number | null
  targets_version: number | null
  acknowledged_at: Date | null
  acknowledgment_due_on: string | null
  target_due_on: string | null
  legal_deadline_on: string | null
  legal_deadline_note: string | null
  legal_deadline_recorded_at: Date | null
}

const DATE_COLUMNS = [
  'id',
  'reference',
  'project_id',
  'state',
  'submitted_at',
  'review_started_at',
  'received_on',
  'time_zone',
  'calendar_version',
  'targets_version',
  'acknowledged_at',
  'acknowledgment_due_on',
  'target_due_on',
  'legal_deadline_on',
  'legal_deadline_note',
  'legal_deadline_recorded_at',
] as const

const day = (v: unknown): string | null => (v === null || v === undefined ? null : String(v).slice(0, 10))
const normal = (r: DatesRow): DatesRow => ({
  ...r,
  received_on: day(r.received_on),
  acknowledgment_due_on: day(r.acknowledgment_due_on),
  target_due_on: day(r.target_due_on),
  legal_deadline_on: day(r.legal_deadline_on),
})

async function datesRow(db: Reader, id: string, lock = false): Promise<DatesRow | null> {
  let q = db.selectFrom('privacy.privacy_requests').select(DATE_COLUMNS).where('id', '=', id)
  if (lock) q = q.forUpdate()
  const r = await q.executeTakeFirst()
  return r ? normal(r as DatesRow) : null
}

export type Extension = { previousTargetOn: string; targetOn: string; reason: string; decidedAt: Date }

async function extensionsOf(db: Reader, ids: readonly string[]): Promise<Map<string, Extension[]>> {
  const out = new Map<string, Extension[]>()
  if (ids.length === 0) return out
  const rows = await db
    .selectFrom('privacy.privacy_request_extensions')
    .select(['privacy_request_id', 'previous_target_on', 'target_on', 'reason', 'decided_at'])
    .where('privacy_request_id', 'in', [...ids])
    .orderBy('seq')
    .execute()
  for (const r of rows) {
    const list = out.get(r.privacy_request_id) ?? []
    list.push({
      previousTargetOn: day(r.previous_target_on) as string,
      targetOn: day(r.target_on) as string,
      reason: r.reason,
      decidedAt: r.decided_at,
    })
    out.set(r.privacy_request_id, list)
  }
  return out
}

/**
 * Records the dates of a request that has none yet, with the configuration in force (in the submission's transaction,
 * or for a request received before migration 0103, by its deadline job), and the automatic acknowledgment, which the
 * portal showed from submission. Returns whether the dates are recorded now.
 */
export async function recordRequestDates(tx: Tx, id: string, config?: Config): Promise<boolean> {
  const r = await datesRow(tx, id, true)
  if (!r) return false
  if (!isOpen(r.state)) return r.received_on !== null
  const counting = deadlineCounting(config ?? (await loadConfig(tx)))
  const set: Record<string, unknown> = {}
  // The stored receipt itself (a JavaScript date drops its microseconds).
  if (r.acknowledged_at === null) set['acknowledged_at'] = sql<Date>`submitted_at`
  if (r.received_on === null && counting.state === 'CONFIGURED') {
    const d = privacyRequestDates(r.submitted_at, counting.zone, counting.calendar, counting)
    Object.assign(set, {
      received_on: d.receivedOn,
      time_zone: counting.zone,
      calendar_version: counting.calendarVersion,
      targets_version: counting.targetsVersion,
      acknowledgment_due_on: d.acknowledgmentDueOn,
      target_due_on: d.targetDueOn,
    })
  }
  if (Object.keys(set).length) await tx.updateTable('privacy.privacy_requests').set(set).where('id', '=', id).execute()
  return r.received_on !== null || 'received_on' in set
}

export type RequestDeadlines = {
  state: 'CONFIGURED' | 'NOT_CONFIGURED'
  receivedOn: string | null
  zone: string | null
  calendarVersion: number | null
  targetsVersion: number | null
  /** The automatic acknowledgment (shown in the portal). */
  acknowledgedAt: Date | null
  acknowledgmentDueOn: string | null
  /** PROPOSED: the start of the Owner's review is the substantive acknowledgment. */
  substantiveAcknowledgedAt: Date | null
  /** The internal target as counted at receipt, and the one in force after any extension. */
  targetDueOn: string | null
  targetOn: string | null
  extensions: Extension[]
  legalDeadline: { on: string | null; note: string | null; recordedAt: Date | null }
  /** The business zone's date the alerts were read on. */
  today: string | null
  alerts: PrivacyDeadlineAlert[]
}

function deadlinesOf(r: DatesRow, extensions: Extension[], now: Date, zone: string | null): RequestDeadlines {
  const targetOn = extensions.at(-1)?.targetOn ?? r.target_due_on
  const z = r.time_zone ?? zone
  const today = z ? localDateOf(now, z) : null
  return {
    state: r.received_on === null ? 'NOT_CONFIGURED' : 'CONFIGURED',
    receivedOn: r.received_on,
    zone: r.time_zone,
    calendarVersion: r.calendar_version,
    targetsVersion: r.targets_version,
    acknowledgedAt: r.acknowledged_at,
    acknowledgmentDueOn: r.acknowledgment_due_on,
    substantiveAcknowledgedAt: r.review_started_at,
    targetDueOn: r.target_due_on,
    targetOn,
    extensions,
    legalDeadline: { on: r.legal_deadline_on, note: r.legal_deadline_note, recordedAt: r.legal_deadline_recorded_at },
    today,
    alerts:
      today === null
        ? []
        : privacyDeadlineAlerts(
            {
              open: isOpen(r.state),
              acknowledged: r.review_started_at !== null,
              acknowledgmentDueOn: r.acknowledgment_due_on,
              targetOn,
              legalDeadlineOn: r.legal_deadline_on,
            },
            today,
          ),
  }
}

/** The dates and alerts of these requests as they are at `now`. */
export async function requestDeadlines(
  db: Reader,
  ids: readonly string[],
  now = new Date(),
): Promise<Map<string, RequestDeadlines>> {
  const out = new Map<string, RequestDeadlines>()
  if (ids.length === 0) return out
  const rows = (await db
    .selectFrom('privacy.privacy_requests')
    .select(DATE_COLUMNS)
    .where('id', 'in', [...ids])
    .execute()) as DatesRow[]
  const extensions = await extensionsOf(
    db,
    rows.map((r) => r.id),
  )
  const counting = deadlineCounting(await loadConfig(db))
  const zone = counting.state === 'CONFIGURED' ? counting.zone : null
  for (const r of rows) out.set(r.id, deadlinesOf(normal(r), extensions.get(r.id) ?? [], now, zone))
  return out
}

export const PRIVACY_QUEUE_REASONS = [
  'privacy_acknowledgment_due',
  'privacy_acknowledgment_overdue',
  'privacy_completion_due',
  'privacy_completion_overdue',
  'privacy_legal_deadline_overdue',
  'privacy_dates_not_configured',
] as const
type QueueReason = (typeof PRIVACY_QUEUE_REASONS)[number]

/** The deadlines the item and the deadline jobs follow, in date order: the ones still to come and the ones passed. */
function pendingDeadlines(d: RequestDeadlines, reviewing: boolean): { kind: string; on: string }[] {
  const out: { kind: string; on: string }[] = []
  if (!reviewing && d.acknowledgmentDueOn) out.push({ kind: 'acknowledgment', on: d.acknowledgmentDueOn })
  if (d.targetOn) out.push({ kind: 'target', on: d.targetOn })
  if (d.legalDeadline.on) out.push({ kind: 'legal', on: d.legalDeadline.on })
  return out.sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : 0))
}

/**
 * Brings the request's Owner Decisions item in line with its dates at `now`: open while the request is open, due at
 * its next deadline (the end of that date in the business zone), its reason the most urgent alert or the next date
 * due; resolved once the request is decided. Schedules the deadline job for the next deadline still to come, so the
 * item says "overdue" when it passes. Idempotent: a replay changes nothing.
 */
export async function syncPrivacyDeadlineItem(
  tx: Tx,
  id: string,
  input: { now?: Date; requestId: string },
): Promise<'open' | 'resolved' | 'missing'> {
  const now = input.now ?? new Date()
  const r = await datesRow(tx, id)
  if (!r) return 'missing'
  if (!isOpen(r.state)) {
    await resolveQueueItem(tx, { type: PRIVACY_QUEUE_TYPE, subjectId: r.id, resolution: 'decided' })
    return 'resolved'
  }
  const extensions = (await extensionsOf(tx, [r.id])).get(r.id) ?? []
  const d = deadlinesOf(r, extensions, now, r.time_zone)
  const zone = r.time_zone
  const reviewing = r.review_started_at !== null
  const deadlines = zone ? pendingDeadlines(d, reviewing) : []
  const ends = deadlines.map((x) => ({ ...x, at: endOfLocalDay(x.on, zone as string) }))
  const next = ends.find((x) => x.at.getTime() > now.getTime())
  const reason: QueueReason =
    d.state === 'NOT_CONFIGURED'
      ? 'privacy_dates_not_configured'
      : d.alerts.includes('legal_deadline_overdue')
        ? 'privacy_legal_deadline_overdue'
        : d.alerts.includes('completion_overdue')
          ? 'privacy_completion_overdue'
          : d.alerts.includes('acknowledgment_overdue')
            ? 'privacy_acknowledgment_overdue'
            : reviewing
              ? 'privacy_completion_due'
              : 'privacy_acknowledgment_due'
  // Due at the earliest date passed (overdue), or else the next one.
  const due = ends.find((x) => x.at.getTime() <= now.getTime()) ?? next ?? null
  // The item shows the project's reference (the queue's references are project references); the request's own
  // reference is on its screen.
  const project = await tx
    .selectFrom('crm.projects')
    .select('reference')
    .where('id', '=', r.project_id)
    .executeTakeFirstOrThrow()
  await openQueueItem(tx, {
    type: PRIVACY_QUEUE_TYPE,
    subjectId: r.id,
    reason,
    projectId: r.project_id,
    reference: project.reference,
    status: r.state,
    dueAt: due?.at ?? null,
    openedAt: r.submitted_at,
  })
  if (next)
    await scheduleJob(tx, privacyDeadlineAutomation(), {
      key: `${r.id}:${next.kind}:${next.on}`,
      runAt: next.at,
      target: { type: 'privacy_request', id: r.id },
      requestId: input.requestId,
    })
  return 'open'
}

/**
 * The deadline job: records the dates of a request that has none yet (received before migration 0103), then brings its
 * Owner Decisions item in line. It never changes the request's state.
 */
export function privacyDeadlineAutomation(): Automation {
  return {
    name: PRIVACY_DEADLINE_AUTOMATION,
    trigger: {
      kind: 'schedule',
      description: 'at each deadline of an open privacy request, and once for each open request of migration 0103',
    },
    identity: 'system.privacy',
    inputs: { description: 'the privacy request (job target); the request and its dates as they are now', version: 1 },
    idempotency: 'one job per request, deadline and date; the item is one per request and a replay leaves it as it is',
    effect:
      "records a request's missing dates and keeps its Owner Decisions item in line; never closes or changes the request",
    retry: { maxAttempts: 5, baseDelayMs: 60_000, maxDelayMs: 3_600_000 },
    timeoutMs: 10_000,
    exceptionOwner: 'owner',
    audit: { action: 'privacy.deadline_check' },
    handle: async ({ tx, job }) => {
      const id = job.target.id
      if (!id) return 'cancelled'
      await recordRequestDates(tx, id)
      return (await syncPrivacyDeadlineItem(tx, id, { requestId: job.requestId })) === 'missing' ? 'cancelled' : 'done'
    },
  }
}

const field = (name: string, code: string) => ({ field: name, code, message: '' })

/** The request locked for an Owner change of its dates: open, with its dates counted, at the version shown. */
async function lockedForChange(tx: Tx, id: string, expectedVersion: number) {
  const r = await datesRow(tx, id, true)
  if (!r) throw new ApiError('NOT_FOUND')
  const v = await tx
    .selectFrom('privacy.privacy_requests')
    .select(['version', 'customer_id'])
    .where('id', '=', id)
    .executeTakeFirstOrThrow()
  if (!isOpen(r.state)) throw new ApiError('CONFLICT', { fieldErrors: [field('state', 'ALREADY_DECIDED')] })
  if (v.version !== expectedVersion) throw new ApiError('STALE_VERSION', { current: { version: v.version } })
  if (r.received_on === null || r.time_zone === null)
    throw new ApiError('CONFLICT', { fieldErrors: [field('dates', 'DATES_NOT_CONFIGURED')] })
  return { r, version: v.version }
}

const bump = (tx: Tx, id: string) =>
  tx
    .updateTable('privacy.privacy_requests')
    .set((eb) => ({ version: eb('version', '+', 1) }))
    .where('id', '=', id)
    .execute()

/** A date the Owner gives: after today in the business zone and at most DEADLINE_MAX_DAYS_AHEAD ahead. */
function checkAhead(on: string, today: string, name: string) {
  if (on <= today) throw new ApiError('VALIDATION_FAILED', { fieldErrors: [field(name, 'DATE_NOT_AHEAD')] })
  if (on > addLocalDays(today, DEADLINE_MAX_DAYS_AHEAD))
    throw new ApiError('VALIDATION_FAILED', { fieldErrors: [field(name, 'DATE_TOO_FAR')] })
}

/**
 * The Owner extends an open request's internal target to a later date, with the reason the customer is told. The
 * target in force must not have been extended meanwhile (the If-Match version); the new date is after the target in
 * force and after today.
 */
export async function extendTarget(
  tx: Tx,
  input: {
    id: string
    staffUserId: string
    expectedVersion: number
    targetOn: string
    reason: string
    requestId: string
    now?: Date
  },
): Promise<{ previousTargetOn: string; targetOn: string }> {
  const now = input.now ?? new Date()
  const { r } = await lockedForChange(tx, input.id, input.expectedVersion)
  const extensions = (await extensionsOf(tx, [r.id])).get(r.id) ?? []
  const current = extensions.at(-1)?.targetOn ?? (r.target_due_on as string)
  const reason = input.reason.trim()
  if (!reason) throw new ApiError('VALIDATION_FAILED', { fieldErrors: [field('body.reason', 'required')] })
  if (input.targetOn <= current)
    throw new ApiError('VALIDATION_FAILED', { fieldErrors: [field('body.targetOn', 'NOT_AFTER_TARGET')] })
  checkAhead(input.targetOn, localDateOf(now, r.time_zone as string), 'body.targetOn')
  await tx
    .insertInto('privacy.privacy_request_extensions')
    .values({
      privacy_request_id: r.id,
      previous_target_on: current,
      target_on: input.targetOn,
      reason,
      decided_by: input.staffUserId,
      request_id: input.requestId,
    })
    .execute()
  await bump(tx, r.id)
  await syncPrivacyDeadlineItem(tx, r.id, { now, requestId: input.requestId })
  return { previousTargetOn: current, targetOn: input.targetOn }
}

/**
 * The Owner records the applicable legal deadline of an open request as the attorney defines it (a date and a note
 * saying where it comes from), or clears it (null, with a note). Never computed by the software.
 */
export async function recordLegalDeadline(
  tx: Tx,
  input: {
    id: string
    staffUserId: string
    expectedVersion: number
    on: string | null
    note: string
    requestId: string
    now?: Date
  },
): Promise<{ previous: string | null; on: string | null }> {
  const now = input.now ?? new Date()
  const { r } = await lockedForChange(tx, input.id, input.expectedVersion)
  const note = input.note.trim()
  if (!note) throw new ApiError('VALIDATION_FAILED', { fieldErrors: [field('body.note', 'required')] })
  if (input.on !== null) {
    // A date may be recorded on or after the receipt date; one already passed is allowed (it is then overdue).
    if (input.on < (r.received_on as string))
      throw new ApiError('VALIDATION_FAILED', { fieldErrors: [field('body.on', 'BEFORE_RECEIPT')] })
    if (input.on > addLocalDays(localDateOf(now, r.time_zone as string), DEADLINE_MAX_DAYS_AHEAD))
      throw new ApiError('VALIDATION_FAILED', { fieldErrors: [field('body.on', 'DATE_TOO_FAR')] })
  }
  await tx
    .updateTable('privacy.privacy_requests')
    .set((eb) => ({
      legal_deadline_on: input.on,
      legal_deadline_note: note,
      legal_deadline_recorded_at: now,
      legal_deadline_recorded_by: input.staffUserId,
      version: eb('version', '+', 1),
    }))
    .where('id', '=', r.id)
    .execute()
  await syncPrivacyDeadlineItem(tx, r.id, { now, requestId: input.requestId })
  return { previous: r.legal_deadline_on, on: input.on }
}
