// Customer-agreed repeat-service schedules (TSK-0114; HH-SCH-10, C11, T67, OWN-DEC-113, OWN-DEC-148, OWN-DEC-78,
// FACT-REMINDER-CADENCES, FACT-SVC-RECURRING-SERVICE, FACT-CANCELLATION-RULES, ENT-Property, ENT-Visit,
// RULE-SERVER-AUTHZ, RULE-NO-INVENTED-FACTS). See reminders.ts for the reminder drafts.
// - Staff record a schedule only when the customer agreed to one (service_series.manage: the Owner, Office P), on the
//   project the service was done in: the agreed next service date and, when the customer agreed to a repeat, every N
//   days, weeks or months; whether they want reminders; how staff heard the agreement. The software proposes no
//   interval and no default: without the customer's agreement there is no schedule.
// - Dates are local calendar dates of the property's zone (ENT-Property; read each time, never assumed Eastern): a
//   schedule cannot be recorded while the property's zone is unknown (PROPERTY_ZONE_UNKNOWN, PROPOSED).
// - Each occurrence is a new request with its own records, through every gate of a new request (staff review, its own
//   estimate and approval, its own deposit, its own confirmed appointment): the customer sends it (Request This Service
//   Again, or any request), and staff link it to its date. Nothing of the earlier project is copied: no price, discount,
//   verification or consent (OWN-DEC-113 "New pricing and appointments require review"). A link needs the request's
//   contact email or phone to be the schedule's, or the request to be sent again from the schedule's project or one of
//   its occurrences (PROPOSED), so another customer's request is never shown on the schedule.
// - The customer changes or stops the schedule and its reminders from the project workspace (service_series.change,
//   customer V). A change applies to occurrences more than repeat_service.change_notice hours away (OWN-DEC-148: 24);
//   an occurrence within them keeps its date ("kept"), with its reminder, its request and any visit, which follows the
//   cancellation rules (FACT-CANCELLATION-RULES). The new next date must itself be more than that notice away. Stopping
//   ends the schedule and its reminders at once; a request already sent for an occurrence stays its own request, and
//   its appointment is rescheduled or cancelled the usual way (never by this module).
// - Every change is one row of the append-only history with who made it (staff or the customer) and the schedule then;
//   staff's own changes say how the customer agreed. Audited with identifiers and codes only.
import type { Db, Tx } from '@handyhub/db'
import {
  isLocalDate,
  isOccurrence,
  isSeriesInterval,
  keptByNotice,
  localDateOf,
  SERIES_AGREEMENT_SOURCES,
  upcomingOccurrences,
  type OccurrenceState,
  type SeriesAgreementSource,
  type SeriesChange,
  type SeriesInterval,
  type SeriesSchedule,
  type SeriesState,
} from '@handyhub/domain'
import type { StaffActor } from '@handyhub/policy'
import { sql } from 'kysely'
import { ApiError, type FieldError } from '../../api/errors.js'
import type { Config } from '../../platform/config/index.js'
import { loadConfig } from '../../platform/config/index.js'
import { zonedTimeToUtc } from '../notifications/index.js'

export type Reader = Db | Tx

/** PROPOSED limits (no owner value): a staff note on a change of up to 2,000 characters; dates listed ahead. */
export const SERIES_LIMITS = { note: 2000, upcoming: 6, customerUpcoming: 3 } as const
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type SeriesRow = {
  id: string
  project_id: string
  state: SeriesState
  anchor_date: string
  interval_unit: 'day' | 'week' | 'month' | null
  interval_count: number | null
  reminders: boolean
  agreed_via: SeriesAgreementSource
  recorded_by: string
  created_at: Date
  updated_at: Date
  stopped_at: Date | null
  stopped_by: 'staff' | 'customer' | null
  version: number
}

export type OccurrenceRow = { occurrence_date: string; state: OccurrenceState; request_id: string | null }

/** Who changes a schedule: staff recording the customer's agreement, or the customer in their workspace. */
export type SeriesActor =
  | { kind: 'staff'; actor: StaffActor; agreedVia: SeriesAgreementSource | null; note: string | null }
  | { kind: 'customer' }

const field = (f: string, code: string): FieldError => ({ field: f, code, message: '' })
export const conflict = (code: string, f = 'series') => new ApiError('CONFLICT', { fieldErrors: [field(f, code)] })
export const invalid = (f: string, code: string) => new ApiError('VALIDATION_FAILED', { fieldErrors: [field(f, code)] })

export const intervalOf = (s: Pick<SeriesRow, 'interval_unit' | 'interval_count'>): SeriesInterval =>
  s.interval_unit && s.interval_count ? { unit: s.interval_unit, count: s.interval_count } : null

const SERIES_COLUMNS = [
  'id',
  'project_id',
  'state',
  'anchor_date',
  'interval_unit',
  'interval_count',
  'reminders',
  'agreed_via',
  'recorded_by',
  'created_at',
  'updated_at',
  'stopped_at',
  'stopped_by',
  'version',
] as const

export async function seriesRow(db: Reader, id: string, lock = false): Promise<SeriesRow | null> {
  if (!UUID_RE.test(id)) return null
  let q = db
    .selectFrom('work.service_series')
    .select([...SERIES_COLUMNS])
    .where('id', '=', id)
  if (lock) q = q.forUpdate()
  return ((await q.executeTakeFirst()) as SeriesRow | undefined) ?? null
}

/** The project's schedules, the active one first, then the stopped ones newest first. */
export async function projectSeries(db: Reader, projectId: string): Promise<SeriesRow[]> {
  if (!UUID_RE.test(projectId)) return []
  return (await db
    .selectFrom('work.service_series')
    .select([...SERIES_COLUMNS])
    .where('project_id', '=', projectId)
    .orderBy(sql`state = 'active'`, 'desc')
    .orderBy('created_at', 'desc')
    .execute()) as SeriesRow[]
}

export async function occurrenceRows(db: Reader, seriesId: string): Promise<OccurrenceRow[]> {
  return (await db
    .selectFrom('work.service_series_occurrences')
    .select(['occurrence_date', 'state', 'request_id'])
    .where('series_id', '=', seriesId)
    .orderBy('occurrence_date')
    .execute()) as OccurrenceRow[]
}

export async function scheduleOf(db: Reader, s: SeriesRow): Promise<SeriesSchedule> {
  return {
    anchor: s.anchor_date,
    interval: intervalOf(s),
    occurrences: (await occurrenceRows(db, s.id)).map((o) => ({ date: o.occurrence_date, state: o.state })),
  }
}

/** The project's reference, its property's zone (null while unknown) and the request's contact. */
export async function projectFacts(db: Reader, projectId: string) {
  return db
    .selectFrom('crm.projects as p')
    .innerJoin('crm.properties as pr', 'pr.id', 'p.property_id')
    .leftJoin('intake.requests as r', 'r.project_id', 'p.id')
    .leftJoin('crm.contacts as c', 'c.id', 'r.contact_id')
    .select(['p.id', 'p.reference as project_reference', 'pr.time_zone', 'r.reference', 'r.responsible_staff_id'])
    .select(['c.id as contact_id', 'c.full_name', 'c.email', 'c.phone_e164', 'c.preferred_channel'])
    .where('p.id', '=', projectId)
    .orderBy('r.submitted_at')
    .executeTakeFirst()
}

/** The decided change notice in hours (repeat_service.change_notice, OWN-DEC-148); null while NOT CONFIGURED. */
export function changeNoticeHours(config: Config): number | null {
  const e = config.get('repeat_service.change_notice')
  return e.state === 'CONFIGURED' ? e.value.hours : null
}

/** The instant a local date starts (00:00) in the zone; a DST change never moves the date. */
export function startOfDate(date: string, zone: string): Date {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]
  return zonedTimeToUtc({ year, month, day, hour: 0, minute: 0 }, zone)
}

const today = (zone: string, now = new Date()) => localDateOf(now, zone)

/** The projects whose open cases pause the schedule's reminders: its own and its occurrences' requests'. */
export async function seriesProjects(db: Reader, s: Pick<SeriesRow, 'id' | 'project_id'>): Promise<string[]> {
  const rows = await db
    .selectFrom('work.service_series_occurrences as o')
    .innerJoin('intake.requests as r', 'r.id', 'o.request_id')
    .select('r.project_id')
    .where('o.series_id', '=', s.id)
    .execute()
  return [...new Set([s.project_id, ...rows.map((r) => r.project_id)])]
}

/** The series of a project an occurrence was requested in, or the project's own (cases on either pause reminders). */
export async function seriesTouchingProject(db: Reader, projectId: string): Promise<string[]> {
  const rows = await db
    .selectFrom('work.service_series as s')
    .select('s.id')
    .where((eb) =>
      eb.or([
        eb('s.project_id', '=', projectId),
        eb.exists(
          eb
            .selectFrom('work.service_series_occurrences as o')
            .innerJoin('intake.requests as r', 'r.id', 'o.request_id')
            .select('o.series_id')
            .whereRef('o.series_id', '=', 's.id')
            .where('r.project_id', '=', projectId),
        ),
      ]),
    )
    .execute()
  return rows.map((r) => r.id)
}

async function writeChange(
  tx: Tx,
  s: SeriesRow,
  by: SeriesActor,
  change: SeriesChange,
  extra: { occurrenceDate?: string; kept?: string[] } = {},
): Promise<void> {
  await tx
    .insertInto('work.service_series_changes')
    .values({
      series_id: s.id,
      version: s.version,
      change,
      actor_kind: by.kind,
      staff_id: by.kind === 'staff' ? by.actor.userId : null,
      anchor_date: s.anchor_date,
      interval_unit: s.interval_unit,
      interval_count: s.interval_count,
      reminders: s.reminders,
      occurrence_date: extra.occurrenceDate ?? null,
      kept_dates: extra.kept ?? [],
      agreed_via: by.kind === 'staff' ? by.agreedVia : null,
      note: by.kind === 'staff' ? by.note : null,
    })
    .execute()
}

function noteOf(raw: string | null | undefined): string | null {
  const v = (raw ?? '').trim()
  if (v.length > SERIES_LIMITS.note) throw invalid('body.note', 'TOO_LONG')
  return v === '' ? null : v
}

export function agreedViaOf(raw: unknown): SeriesAgreementSource {
  if (typeof raw !== 'string' || !(SERIES_AGREEMENT_SOURCES as readonly string[]).includes(raw))
    throw invalid('body.agreedVia', 'INVALID')
  return raw as SeriesAgreementSource
}

function intervalInput(raw: unknown): SeriesInterval {
  if (!isSeriesInterval(raw)) throw invalid('body.interval', 'INVALID')
  return raw
}

export type RecordInput = {
  nextDate: string
  interval: SeriesInterval
  reminders: boolean
  agreedVia: string
  customerAgreed: boolean
  note?: string | null
}

/**
 * Staff record the schedule the customer agreed to (service_series.manage). Refused without the customer's agreement
 * (CUSTOMER_AGREEMENT_REQUIRED), while the property's zone is unknown, for a date before today in that zone, or while
 * the project already has an active schedule (SERIES_ACTIVE: change it instead).
 */
export async function recordSeries(
  tx: Tx,
  actor: StaffActor,
  projectId: string,
  input: RecordInput,
): Promise<SeriesRow> {
  if (input.customerAgreed !== true) throw invalid('body.customerAgreed', 'CUSTOMER_AGREEMENT_REQUIRED')
  const agreedVia = agreedViaOf(input.agreedVia)
  const interval = intervalInput(input.interval)
  const note = noteOf(input.note)
  if (!isLocalDate(input.nextDate)) throw invalid('body.nextDate', 'INVALID')
  const p = await tx.selectFrom('crm.projects').select('id').where('id', '=', projectId).forUpdate().executeTakeFirst()
  if (!p) throw new ApiError('NOT_FOUND')
  const facts = await projectFacts(tx, projectId)
  if (!facts?.time_zone) throw conflict('PROPERTY_ZONE_UNKNOWN')
  if (input.nextDate < today(facts.time_zone)) throw invalid('body.nextDate', 'IN_THE_PAST')
  if ((await projectSeries(tx, projectId)).some((s) => s.state === 'active')) throw conflict('SERIES_ACTIVE')
  const row = (await tx
    .insertInto('work.service_series')
    .values({
      project_id: projectId,
      anchor_date: input.nextDate,
      interval_unit: interval?.unit ?? null,
      interval_count: interval?.count ?? null,
      reminders: input.reminders,
      agreed_via: agreedVia,
      recorded_by: actor.userId,
    })
    .returning([...SERIES_COLUMNS])
    .executeTakeFirstOrThrow()) as SeriesRow
  await writeChange(tx, row, { kind: 'staff', actor, agreedVia, note }, 'recorded')
  return row
}

async function lockActive(tx: Tx, seriesId: string, expectedVersion: number | null): Promise<SeriesRow> {
  const s = await seriesRow(tx, seriesId, true)
  if (!s) throw new ApiError('NOT_FOUND')
  if (expectedVersion !== null && s.version !== expectedVersion)
    throw new ApiError('STALE_VERSION', { current: { version: s.version } })
  if (s.state !== 'active') throw conflict('SERIES_STOPPED')
  return s
}

async function bump(tx: Tx, s: SeriesRow, set: Partial<SeriesRow>): Promise<SeriesRow> {
  return (await tx
    .updateTable('work.service_series')
    .set({ ...(set as object), version: s.version + 1, updated_at: sql<Date>`now()` })
    .where('id', '=', s.id)
    .where('version', '=', s.version)
    .returning([...SERIES_COLUMNS])
    .executeTakeFirstOrThrow()) as SeriesRow
}

async function zoneOf(db: Reader, s: SeriesRow): Promise<string> {
  const facts = await projectFacts(db, s.project_id)
  if (!facts?.time_zone) throw conflict('PROPERTY_ZONE_UNKNOWN')
  return facts.time_zone
}

export type ChangeInput = { nextDate: string; interval: SeriesInterval; reminders?: boolean }

/**
 * A change of the next date or the interval (and, from staff, the reminders), by the customer or by staff recording
 * the customer's agreement. The new next date must be more than the change notice away (WITHIN_CHANGE_NOTICE); the
 * current schedule's occurrences inside the notice are kept (OWN-DEC-148). Returns the schedule and the dates kept.
 */
export async function changeSeries(
  tx: Tx,
  by: SeriesActor,
  seriesId: string,
  expectedVersion: number | null,
  input: ChangeInput,
  now = new Date(),
): Promise<{ series: SeriesRow; kept: string[] }> {
  const interval = intervalInput(input.interval)
  if (!isLocalDate(input.nextDate)) throw invalid('body.nextDate', 'INVALID')
  const notice = changeNoticeHours(await loadConfig(tx))
  if (notice === null) throw new ApiError('NOT_CONFIGURED')
  const s = await lockActive(tx, seriesId, expectedVersion)
  const zone = await zoneOf(tx, s)
  if (startOfDate(input.nextDate, zone).getTime() <= now.getTime() + notice * 3_600_000)
    throw invalid('body.nextDate', 'WITHIN_CHANGE_NOTICE')
  const schedule = await scheduleOf(tx, s)
  const recorded = new Map(schedule.occurrences.map((o) => [o.date, o.state]))
  const upcoming = upcomingOccurrences(schedule, today(zone, now), SERIES_LIMITS.upcoming)
  const kept = keptByNotice(upcoming, (d) => startOfDate(d, zone), now, notice).filter((d) => !recorded.has(d))
  for (const d of kept)
    await tx
      .insertInto('work.service_series_occurrences')
      .values({ series_id: s.id, occurrence_date: d, state: 'kept' })
      .execute()
  const next = await bump(tx, s, {
    anchor_date: input.nextDate,
    interval_unit: interval?.unit ?? null,
    interval_count: interval?.count ?? null,
    ...(by.kind === 'staff' && input.reminders !== undefined ? { reminders: input.reminders } : {}),
  })
  await writeChange(tx, next, by, 'changed', { kept })
  return { series: next, kept }
}

/** Reminders on or off, by the customer or by staff recording the customer's choice. */
export async function setSeriesReminders(
  tx: Tx,
  by: SeriesActor,
  seriesId: string,
  expectedVersion: number | null,
  on: boolean,
): Promise<{ series: SeriesRow; changed: boolean }> {
  const s = await lockActive(tx, seriesId, expectedVersion)
  if (s.reminders === on) return { series: s, changed: false }
  const next = await bump(tx, s, { reminders: on })
  await writeChange(tx, next, by, on ? 'reminders_on' : 'reminders_off')
  return { series: next, changed: true }
}

/** The schedule stops, with its reminders, at once. Requests already sent for an occurrence stay their own. */
export async function stopSeries(
  tx: Tx,
  by: SeriesActor,
  seriesId: string,
  expectedVersion: number | null,
): Promise<SeriesRow> {
  const s = await lockActive(tx, seriesId, expectedVersion)
  const next = await bump(tx, s, { state: 'stopped', stopped_at: new Date(), stopped_by: by.kind })
  await writeChange(tx, next, by, 'stopped')
  return next
}

/** Staff skip an upcoming occurrence the customer asked to skip (it gets no reminder and no request). */
export async function skipOccurrence(
  tx: Tx,
  by: Extract<SeriesActor, { kind: 'staff' }>,
  seriesId: string,
  expectedVersion: number | null,
  date: string,
  now = new Date(),
): Promise<SeriesRow> {
  if (!isLocalDate(date)) throw invalid('params.date', 'INVALID')
  const s = await lockActive(tx, seriesId, expectedVersion)
  const zone = await zoneOf(tx, s)
  const schedule = await scheduleOf(tx, s)
  const existing = schedule.occurrences.find((o) => o.date === date)
  if (existing?.state === 'requested') throw conflict('OCCURRENCE_REQUESTED')
  if (!isOccurrence(schedule, date)) throw conflict('NOT_AN_OCCURRENCE')
  if (date < today(zone, now)) throw conflict('OCCURRENCE_PASSED')
  if (existing)
    await tx
      .updateTable('work.service_series_occurrences')
      .set({ state: 'skipped' })
      .where('series_id', '=', s.id)
      .where('occurrence_date', '=', date)
      .execute()
  else
    await tx
      .insertInto('work.service_series_occurrences')
      .values({ series_id: s.id, occurrence_date: date, state: 'skipped' })
      .execute()
  const next = await bump(tx, s, {})
  await writeChange(tx, next, by, 'occurrence_skipped', { occurrenceDate: date })
  return next
}

const lower = (v: string | null | undefined) => (v ?? '').trim().toLowerCase()

/**
 * Staff link the new request that carries an occurrence (sent by the customer, through every gate of a new request).
 * Refused for another customer's request (NOT_THE_SAME_CUSTOMER, PROPOSED), the schedule's own project, a request
 * linked already, or a date that is not an occurrence, was skipped or has its request.
 */
export async function linkOccurrence(
  tx: Tx,
  by: Extract<SeriesActor, { kind: 'staff' }>,
  seriesId: string,
  expectedVersion: number | null,
  date: string,
  requestReference: string,
): Promise<{ series: SeriesRow; requestId: string }> {
  if (!isLocalDate(date)) throw invalid('params.date', 'INVALID')
  const s = await lockActive(tx, seriesId, expectedVersion)
  const request = await tx
    .selectFrom('intake.requests as r')
    .innerJoin('crm.contacts as c', 'c.id', 'r.contact_id')
    .select(['r.id', 'r.project_id', 'c.email', 'c.phone_e164'])
    .where('r.reference', '=', requestReference.trim())
    .executeTakeFirst()
  if (!request) throw invalid('body.requestReference', 'NOT_FOUND')
  if (request.project_id === s.project_id) throw conflict('SAME_PROJECT', 'body.requestReference')
  const linked = await tx
    .selectFrom('work.service_series_occurrences')
    .select('series_id')
    .where('request_id', '=', request.id)
    .executeTakeFirst()
  if (linked) throw conflict('REQUEST_ALREADY_LINKED', 'body.requestReference')
  const facts = await projectFacts(tx, s.project_id)
  const projects = await seriesProjects(tx, s)
  const repeats = await tx
    .selectFrom('intake.request_repeats')
    .select('source_project_id')
    .where('request_id', '=', request.id)
    .executeTakeFirst()
  const same =
    (lower(facts?.email) !== '' && lower(facts?.email) === lower(request.email)) ||
    (!!facts?.phone_e164 && facts.phone_e164 === request.phone_e164) ||
    (!!repeats && projects.includes(repeats.source_project_id))
  if (!same) throw conflict('NOT_THE_SAME_CUSTOMER', 'body.requestReference')
  const schedule = await scheduleOf(tx, s)
  const existing = schedule.occurrences.find((o) => o.date === date)
  if (existing?.state === 'requested') throw conflict('OCCURRENCE_REQUESTED')
  if (!isOccurrence(schedule, date)) throw conflict('NOT_AN_OCCURRENCE')
  if (existing)
    await tx
      .updateTable('work.service_series_occurrences')
      .set({ state: 'requested', request_id: request.id })
      .where('series_id', '=', s.id)
      .where('occurrence_date', '=', date)
      .execute()
  else
    await tx
      .insertInto('work.service_series_occurrences')
      .values({ series_id: s.id, occurrence_date: date, state: 'requested', request_id: request.id })
      .execute()
  const next = await bump(tx, s, {})
  await writeChange(tx, next, by, 'occurrence_linked', { occurrenceDate: date })
  return { series: next, requestId: request.id }
}

// ------------------------------------------------------------------------------------------------ views

export type ChangeView = {
  version: number
  change: SeriesChange
  by: { kind: 'staff' | 'customer'; id: string | null; name: string | null }
  nextDate: string
  interval: SeriesInterval
  reminders: boolean
  occurrenceDate: string | null
  keptDates: string[]
  agreedVia: SeriesAgreementSource | null
  note: string | null
  at: string
}

export async function seriesHistory(db: Reader, seriesId: string): Promise<ChangeView[]> {
  const rows = await db
    .selectFrom('work.service_series_changes as c')
    .leftJoin('identity.staff_users as u', 'u.id', 'c.staff_id')
    .select(['c.version', 'c.change', 'c.actor_kind', 'c.staff_id', 'u.display_name', 'c.anchor_date'])
    .select(['c.interval_unit', 'c.interval_count', 'c.reminders', 'c.occurrence_date', 'c.kept_dates'])
    .select(['c.agreed_via', 'c.note', 'c.recorded_at'])
    .where('c.series_id', '=', seriesId)
    .orderBy('c.seq')
    .execute()
  return rows.map((r) => ({
    version: r.version,
    change: r.change as SeriesChange,
    by: { kind: r.actor_kind as 'staff' | 'customer', id: r.staff_id, name: r.display_name },
    nextDate: r.anchor_date,
    interval: intervalOf(r as Pick<SeriesRow, 'interval_unit' | 'interval_count'>),
    reminders: r.reminders,
    occurrenceDate: r.occurrence_date,
    keptDates: r.kept_dates,
    agreedVia: r.agreed_via as SeriesAgreementSource | null,
    note: r.note,
    at: new Date(r.recorded_at).toISOString(),
  }))
}

export type UpcomingView = { date: string; state: 'scheduled' | OccurrenceState; requestReference: string | null }

/** The schedule's next occurrences from today in its zone, each with its state and the request that carries it. */
export async function upcomingView(db: Reader, s: SeriesRow, zone: string, limit: number): Promise<UpcomingView[]> {
  const schedule = await scheduleOf(db, s)
  const rows = await occurrenceRows(db, s.id)
  const refs = new Map<string, string>()
  const ids = rows.flatMap((o) => (o.request_id ? [o.request_id] : []))
  if (ids.length)
    for (const r of await db.selectFrom('intake.requests').select(['id', 'reference']).where('id', 'in', ids).execute())
      refs.set(r.id, r.reference)
  return upcomingOccurrences(schedule, today(zone), limit).map((date) => {
    const o = rows.find((x) => x.occurrence_date === date)
    return {
      date,
      state: o?.state ?? 'scheduled',
      requestReference: o?.request_id ? (refs.get(o.request_id) ?? null) : null,
    }
  })
}

/** The occurrences requested so far (past and future), with the request that carries each. */
export async function requestedOccurrences(db: Reader, seriesId: string) {
  return db
    .selectFrom('work.service_series_occurrences as o')
    .innerJoin('intake.requests as r', 'r.id', 'o.request_id')
    .select(['o.occurrence_date as date', 'r.id as requestId', 'r.reference', 'r.project_id as projectId'])
    .where('o.series_id', '=', seriesId)
    .orderBy('o.occurrence_date')
    .execute()
}
