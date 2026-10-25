// The visit model on the server (TSK-0061; HH-SCH-01, HH-SCH-02, HH-DATA-06, HH-SCH-05, T09, T37, T41, ENT-Visit,
// ENT-SchedulingTask, ENT-Property, FACT-TIMEZONE, FACT-HOURS, OWN-DEC-99, OWN-DEC-105, RULE-SERVER-AUTHZ).
// - Staff plan a tentative visit: an "Estimate visit" (site_estimate) on an open project, which creates no job and
//   implies no price approval; or a work visit (service, follow-up, return work) on the project's job, which exists
//   only after approval. A customer's timing preference stays on the request and never becomes a visit by itself:
//   only these staff writes create one.
// - The window is a local date and arrival window in the property's IANA zone (ENT-Property; FACT-TIMEZONE: the
//   business zone, configuration business.timezone, PROPOSED until OQ-TIMEZONE-ID). While business.timezone is NOT
//   CONFIGURED no visit is planned. The UTC instants and offsets come from @handyhub/domain/local-time: a time inside a
//   spring-forward gap is refused with what the clocks skip; a time inside a repeated hour needs the offset of the
//   reading chosen and is stored with it. The database checks the same agreement with its own time-zone data.
// - Changing a window adds the next window version; the history keeps every earlier one (the database writes it).
//   Moving a window to another date keeps its local times; the instants follow the zone on the new date.
// - Whether the window lies inside the daily visit hours (FACT-HOURS, contact.hours in the business zone) is shown
//   to staff; it is a confirmation precondition (HH-SCH-06), checked when visits are confirmed, so planning never
//   relies on it. Planning reserves nothing; nothing here offers a window to the customer or sends a notice.
// - Work visits pass the gates of WORK_VISIT_GATES (gates.ts) whenever a window is planned or changed. PROPOSED: the
//   first planned work visit moves the job's scheduling task from open to planning.
// - TSK-0062 (HH-SCH-03, HH-SCH-04, T38, T39, T42): staff confirm a tentative visit by naming every worker it needs
//   (the lead first) and an item for every equipment entry; the capacity module checks and reserves all of them in the
//   same transaction (one success, one conflict with alternatives, nothing partial). A confirmed visit's window
//   change moves its reservations in the same transaction, after checking the new range for the same team; a change
//   that fails keeps the booking exactly as it was. PROPOSED: confirming a work visit fulfils the job's scheduling
//   task. The deposit gate of TSK-0059 (HH-SCH-06) is the first of WORK_VISIT_GATES for planning and window changes,
//   a reschedule included, and confirmation runs it itself in its transaction.
// - TSK-0064 (HH-SCH-06, HH-SCH-05, T36, T40): confirming a visit and rescheduling a confirmed one run every
//   confirmation precondition of preconditions.ts (approval, deposit, the other gates, no blocking hold) in their
//   transaction, beside the visit's own facts and the capacity, and refuse naming every unmet one at once. Planning
//   and moving a tentative visit stay planning: they pass WORK_VISIT_GATES only, and a hold never blocks them. The
//   staff view lists, for each tentative visit, what still stops its confirmation, and offers Confirm only when
//   nothing does.
// - TSK-0063 (HH-SCH-11, HH-LEAD-07, OWN-DEC-144): windows are offered to the customer and held through offers.ts. While
//   a visit has an open offer its window changes and confirmations go through the offer (OFFER_OPEN here). A confirmed
//   visit writes the committed event of its automatic confirmation notice (estimate_visit.reserved or
//   appointment.reserved, FACT-AUTOMATIC-MESSAGES #6 and #10), whether staff confirmed it or the customer selected it.
//   The customer's selection of a work-visit window confirms the visit, so it runs the same deposit gate in its
//   transaction (offers.ts).
import { withTx, type Db, type Tx } from '@handyhub/db'
import { COVERAGE_CODE, type CoverageOutcome } from '@handyhub/domain/coverage'
import {
  canChangeWindow,
  onSiteRange,
  reservedRange,
  formatOffset,
  isTimeZone,
  isWorkVisitPurpose,
  resolveWindow,
  windowWithinHours,
  type LocalWindow,
  type VisitPurpose,
  type WindowProblem,
} from '@handyhub/domain'
import { rowFor, scopeIncludesProject, type Action, type DataScope, type StaffActor } from '@handyhub/policy'
import { sql } from 'kysely'
import { ApiError, type FieldError } from '../../api/errors.js'
import { loadConfig, type Config } from '../../platform/config/index.js'
import {
  capacitySettings,
  evaluate,
  insertReservations,
  refuse,
  type ReservationRequest,
} from '../capacity/resources.js'
import { notDismissed } from '../capacity/flags.js'
import {
  changeFacts,
  finishReschedule,
  holdsAction,
  mayCancel,
  prepareReschedule,
  type RescheduleMeta,
} from './changes.js'
import { unmetGates, WORK_VISIT_GATES, type WorkVisitGate } from './gates.js'
import { noticesOf, recordReserved, staffOffers, windowOfferPolicy } from './offers.js'
import {
  confirmationPreconditions,
  countyVerificationProblems,
  currentCountyVerification,
  WORK_VISIT_PROJECT_STATES,
} from './preconditions.js'

export { WORK_VISIT_PROJECT_STATES } from './preconditions.js'

type Reader = Db | Tx

const field = (f: string, code: string): FieldError => ({ field: f, code, message: '' })

/** PROPOSED: estimate visits are planned while the project is open (before an estimate is approved). */
export const ESTIMATE_VISIT_PROJECT_STATES = ['open'] as const

/** PROPOSED input bounds (no owner value): what one tentative visit may record. */
export const VISIT_LIMITS = {
  durationMinutes: 20_160,
  bufferMinutes: 1440,
  workers: 20,
  equipmentItems: 50,
  equipmentLength: 120,
  reasonLength: 500,
} as const

export type PlanningFacts = {
  readonly expectedDurationMinutes?: number | null
  readonly preparationBufferMinutes?: number | null
  readonly travelBufferMinutes?: number | null
  readonly requiredWorkers?: number | null
  readonly equipment?: readonly string[]
}

export type WindowEntry = {
  readonly localDate: string
  readonly windowStart: string
  readonly windowEnd: string
  /** The offset chosen for a time inside a repeated hour ("-04:00"); null or absent elsewhere. */
  readonly startOffset?: string | null
  readonly endOffset?: string | null
}

export type NewVisit = PlanningFacts & WindowEntry & { readonly purpose: VisitPurpose }

/** Whether the actor may plan work visits: a role whose offer rule carries no limit (the Estimator's is limited). */
export function mayPlanWorkVisits(actor: StaffActor): boolean {
  const row = rowFor('visit.offer_windows')
  return actor.roles.some((role) => {
    const rule = row?.cells[role].rules['visit.offer_windows']
    return rule !== undefined && rule.limit === undefined
  })
}

async function openOfferOf(db: Reader, visitId: string): Promise<boolean> {
  const o = await db
    .selectFrom('work.window_offers')
    .select('id')
    .where('visit_id', '=', visitId)
    .where('state', '=', 'open')
    .executeTakeFirst()
  return o !== undefined
}

/** Whether the actor may plan visits at all (offer windows), on any project. */
export function mayPlanVisits(actor: StaffActor): boolean {
  const row = rowFor('visit.offer_windows')
  return actor.roles.some((role) => row?.cells[role].rules['visit.offer_windows'] !== undefined)
}

/** Whether one of the actor's roles holds the scheduling action (the matrix row's cell has a rule for it). */
export function holds(actor: StaffActor, action: Action): boolean {
  const row = rowFor(action)
  return actor.roles.some((role) => row?.cells[role].rules[action] !== undefined)
}

/** PROPOSED input bounds of a confirmation (no owner value). */
export const CONFIRM_LIMITS = { workers: VISIT_LIMITS.workers, equipment: VISIT_LIMITS.equipmentItems } as const

const offsetMinutes = (s: string | null | undefined): number | null => {
  if (s === null || s === undefined) return null
  const m = /^([+-])(\d{2}):(\d{2})$/.exec(s)
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : Number.NaN
}

const PROBLEM_FIELDS: Record<WindowProblem['code'], (p: WindowProblem) => string> = {
  ZONE_UNKNOWN: () => 'property.timeZone',
  DATE_INVALID: () => 'body.localDate',
  TIME_INVALID: (p) => ('field' in p && p.field === 'end' ? 'body.windowEnd' : 'body.windowStart'),
  WINDOW_ORDER: () => 'body.windowEnd',
  LOCAL_TIME_GAP: (p) => ('field' in p && p.field === 'end' ? 'body.windowEnd' : 'body.windowStart'),
  LOCAL_TIME_REPEATED: (p) => ('field' in p && p.field === 'end' ? 'body.endOffset' : 'body.startOffset'),
  OFFSET_INVALID: (p) => ('field' in p && p.field === 'end' ? 'body.endOffset' : 'body.startOffset'),
}

/** The window resolved in the zone, or VALIDATION_FAILED naming every problem. */
export function resolveEntry(entry: WindowEntry, zone: string, now: Date): LocalWindow {
  const start = offsetMinutes(entry.startOffset)
  const end = offsetMinutes(entry.endOffset)
  const bad: FieldError[] = []
  if (Number.isNaN(start)) bad.push(field('body.startOffset', 'OFFSET_INVALID'))
  if (Number.isNaN(end)) bad.push(field('body.endOffset', 'OFFSET_INVALID'))
  if (bad.length > 0) throw new ApiError('VALIDATION_FAILED', { fieldErrors: bad })
  const r = resolveWindow({
    date: entry.localDate,
    start: entry.windowStart,
    end: entry.windowEnd,
    zone,
    startOffsetMinutes: start,
    endOffsetMinutes: end,
  })
  if (!r.ok) {
    if (r.problems.some((p) => p.code === 'ZONE_UNKNOWN'))
      throw new ApiError('CONFLICT', { fieldErrors: [field('property.timeZone', 'PROPERTY_ZONE_UNKNOWN')] })
    throw new ApiError('VALIDATION_FAILED', {
      fieldErrors: r.problems.map((p) => field(PROBLEM_FIELDS[p.code](p), p.code)),
    })
  }
  // PROPOSED: a window is planned for the future only.
  if (r.window.startsAt.getTime() <= now.getTime())
    throw new ApiError('VALIDATION_FAILED', { fieldErrors: [field('body.localDate', 'WINDOW_IN_PAST')] })
  return r.window
}

/** The business time zone (FACT-TIMEZONE), or NOT CONFIGURED: never assumed. */
export function businessZone(config: Config): { zone: string; proposed: boolean } {
  const z = config.get('business.timezone')
  if (z.state !== 'CONFIGURED' || !isTimeZone(z.value.zone))
    throw new ApiError('NOT_CONFIGURED', {
      fieldErrors: [field('business.timezone', 'BUSINESS_TIMEZONE_NOT_CONFIGURED')],
    })
  return { zone: z.value.zone, proposed: z.proposed }
}

export const visitHoursOf = (config: Config) => {
  const h = config.get('contact.hours')
  return h.state === 'CONFIGURED' ? { open: h.value.open, close: h.value.close } : null
}

type ProjectRow = { id: string; state: string; property_id: string; time_zone: string | null }

async function lockedProject(tx: Tx, projectId: string): Promise<ProjectRow> {
  const p = await tx
    .selectFrom('crm.projects as p')
    .innerJoin('crm.properties as pr', 'pr.id', 'p.property_id')
    .select(['p.id', 'p.state', 'p.property_id', 'pr.time_zone'])
    .where('p.id', '=', projectId)
    .forShare('p')
    .executeTakeFirst()
  if (!p) throw new ApiError('NOT_FOUND')
  return p
}

async function jobOf(db: Reader, projectId: string) {
  return db.selectFrom('work.jobs').select(['id', 'project_id']).where('project_id', '=', projectId).executeTakeFirst()
}

async function passGates(tx: Tx, job: { id: string; project_id: string }, gates: readonly WorkVisitGate[]) {
  const unmet = await unmetGates(tx, { jobId: job.id, projectId: job.project_id }, gates)
  if (unmet.length > 0) throw new ApiError('CONFLICT', { fieldErrors: unmet.map((c) => field('job', c)) })
}

function planning(p: PlanningFacts) {
  const equipment = [...new Set((p.equipment ?? []).map((e) => e.trim()).filter((e) => e !== ''))]
  return {
    expected_duration_minutes: p.expectedDurationMinutes ?? null,
    preparation_buffer_minutes: p.preparationBufferMinutes ?? null,
    travel_buffer_minutes: p.travelBufferMinutes ?? null,
    required_workers: p.requiredWorkers ?? null,
    equipment,
  }
}

const windowColumns = (w: LocalWindow) => ({
  local_date: w.date,
  window_start: w.start,
  window_end: w.end,
  time_zone: w.zone,
  start_offset_minutes: w.startOffsetMinutes,
  end_offset_minutes: w.endOffsetMinutes,
  starts_at: w.startsAt,
  ends_at: w.endsAt,
})

export type PlannedVisit = { readonly id: string; readonly version: number; readonly window: LocalWindow }

/**
 * Plans a tentative visit on a project. Refusals: NOT_FOUND (no such project in scope), FORBIDDEN (an Estimator
 * planning a work visit), NOT_CONFIGURED (business.timezone), CONFLICT (PROJECT_NOT_OPEN, NO_JOB, PROJECT_NOT_ACTIVE,
 * PROPERTY_ZONE_UNKNOWN, a gate's codes), VALIDATION_FAILED (the window).
 */
export async function planVisit(
  tx: Tx,
  actor: StaffActor,
  scope: DataScope,
  projectId: string,
  input: NewVisit,
  deps: { gates: readonly WorkVisitGate[]; now: Date },
): Promise<PlannedVisit> {
  if (!scopeIncludesProject(scope, projectId)) throw new ApiError('NOT_FOUND')
  const work = isWorkVisitPurpose(input.purpose)
  if (work && !mayPlanWorkVisits(actor)) throw new ApiError('FORBIDDEN')
  const config = await loadConfig(tx)
  businessZone(config)
  const project = await lockedProject(tx, projectId)
  let jobId: string | null = null
  if (work) {
    if (!(WORK_VISIT_PROJECT_STATES as readonly string[]).includes(project.state)) {
      const code = project.state === 'open' ? 'NO_JOB' : 'PROJECT_NOT_ACTIVE'
      throw new ApiError('CONFLICT', { fieldErrors: [field('project', code)] })
    }
    const job = await jobOf(tx, projectId)
    if (!job) throw new ApiError('CONFLICT', { fieldErrors: [field('project', 'NO_JOB')] })
    await passGates(tx, job, deps.gates)
    jobId = job.id
  } else if (!(ESTIMATE_VISIT_PROJECT_STATES as readonly string[]).includes(project.state)) {
    throw new ApiError('CONFLICT', { fieldErrors: [field('project', 'PROJECT_NOT_OPEN')] })
  }
  if (!isTimeZone(project.time_zone))
    throw new ApiError('CONFLICT', { fieldErrors: [field('property.timeZone', 'PROPERTY_ZONE_UNKNOWN')] })
  const window = resolveEntry(input, project.time_zone, deps.now)
  const row = await tx
    .insertInto('work.visits')
    .values({
      purpose: input.purpose,
      project_id: project.id,
      job_id: jobId,
      property_id: project.property_id,
      ...windowColumns(window),
      window_set_by: actor.userId,
      ...planning(input),
      created_by: actor.userId,
    })
    .returning(['id', 'version'])
    .executeTakeFirstOrThrow()
  if (jobId !== null)
    await tx
      .updateTable('work.scheduling_tasks')
      .set((eb) => ({ state: 'planning', version: eb('version', '+', 1) }))
      .where('job_id', '=', jobId)
      .where('state', '=', 'open')
      .execute()
  return { id: row.id, version: row.version, window }
}

export type WindowChange = { readonly from: LocalWindow; readonly to: LocalWindow; readonly windowVersion: number }

/** The stored window of a visit row (or an offered window) as the domain describes it. */
export function storedWindow(v: {
  local_date: string
  window_start: string
  window_end: string
  time_zone: string
  start_offset_minutes: number
  end_offset_minutes: number
  starts_at: Date
  ends_at: Date
}): LocalWindow {
  return {
    date: v.local_date,
    start: v.window_start.slice(0, 5),
    end: v.window_end.slice(0, 5),
    zone: v.time_zone,
    startOffsetMinutes: v.start_offset_minutes,
    endOffsetMinutes: v.end_offset_minutes,
    startsAt: new Date(v.starts_at),
    endsAt: new Date(v.ends_at),
  }
}

/**
 * Changes a visit's window, as its next window version, with the version the caller saw. Refusals: NOT_FOUND,
 * FORBIDDEN (an Estimator on a work visit), STALE_VERSION (with the current version and window), CONFLICT (WINDOW_LOCKED for a
 * visit that is no longer tentative or confirmed; a gate's codes), NOT_CONFIGURED, VALIDATION_FAILED.
 */
export async function changeWindow(
  tx: Tx,
  actor: StaffActor,
  scope: DataScope,
  visitId: string,
  entry: WindowEntry & RescheduleMeta,
  deps: { gates: readonly WorkVisitGate[]; now: Date; expectedVersion: number },
): Promise<
  { id: string; version: number; projectId: string; purpose: string; changeId: string | null } & WindowChange & {
      reschedule: Awaited<ReturnType<typeof prepareReschedule>> | null
    }
> {
  const v = await tx.selectFrom('work.visits').selectAll().where('id', '=', visitId).forUpdate().executeTakeFirst()
  if (!v || !scopeIncludesProject(scope, v.project_id)) throw new ApiError('NOT_FOUND')
  if (isWorkVisitPurpose(v.purpose) && !mayPlanWorkVisits(actor)) throw new ApiError('FORBIDDEN')
  if (v.version !== deps.expectedVersion)
    throw new ApiError('STALE_VERSION', {
      current: {
        version: v.version,
        values: {
          state: v.state,
          localDate: v.local_date,
          windowStart: v.window_start.slice(0, 5),
          windowEnd: v.window_end.slice(0, 5),
        },
      },
    })
  if (!canChangeWindow(v.state)) throw new ApiError('CONFLICT', { fieldErrors: [field('state', 'WINDOW_LOCKED')] })
  // TSK-0063: the windows offered to the customer are held; withdraw the offer before moving the visit.
  if (await openOfferOf(tx, v.id)) throw new ApiError('CONFLICT', { fieldErrors: [field('offer', 'OFFER_OPEN')] })
  // Moving a confirmed visit is a reschedule (visit.reschedule: Owner and Office).
  if (v.state === 'confirmed' && !holds(actor, 'visit.reschedule')) throw new ApiError('FORBIDDEN')
  // TSK-0066 (HH-SCH-07): a reschedule of a confirmed visit records its reason (required), who initiated it and the
  // customer request it confirms; a tentative visit has no request to confirm.
  const reschedule = v.state === 'confirmed' ? await prepareReschedule(tx, v.id, entry) : null
  if (!reschedule && entry.changeRequestId)
    throw new ApiError('CONFLICT', { fieldErrors: [field('body.changeRequestId', 'REQUEST_NOT_FOR_VISIT')] })
  const config = await loadConfig(tx)
  businessZone(config)
  // TSK-0064: moving a confirmed visit commits a new booking version, so every confirmation precondition must still
  // hold (named with the capacity problems below); a tentative visit's move is planning and passes the gates only.
  const pre = v.state === 'confirmed' ? await confirmationPreconditions(tx, v, deps.gates) : []
  if (v.state !== 'confirmed' && v.job_id !== null)
    await passGates(tx, { id: v.job_id, project_id: v.project_id }, deps.gates)
  // The visit keeps the zone it was planned in: the property's zone at planning time.
  const to = resolveEntry(entry, v.time_zone, deps.now)
  const from = storedWindow(v)
  if (from.startsAt.getTime() === to.startsAt.getTime() && from.endsAt.getTime() === to.endsAt.getTime())
    throw new ApiError('CONFLICT', { fieldErrors: [field('body', 'WINDOW_UNCHANGED')] })
  if (v.state === 'confirmed')
    await moveReservations(tx, actor, v, to, config, entry.reason?.trim() || null, deps.now, pre)
  const updated = await tx
    .updateTable('work.visits')
    .set({
      ...windowColumns(to),
      window_version: v.window_version + 1,
      window_set_by: actor.userId,
      window_reason: entry.reason?.trim() || null,
      version: v.version + 1,
      updated_at: sql<Date>`now()`,
    })
    .where('id', '=', v.id)
    .returning(['version', 'window_version'])
    .executeTakeFirstOrThrow()
  const changeId = reschedule
    ? await finishReschedule(
        tx,
        actor,
        v,
        { version: updated.version, windowVersion: updated.window_version },
        reschedule,
      )
    : null
  return {
    id: v.id,
    version: updated.version,
    projectId: v.project_id,
    purpose: v.purpose,
    from,
    to,
    windowVersion: updated.window_version,
    changeId,
    reschedule,
  }
}

export type VisitRow = {
  id: string
  purpose: string
  time_zone: string
  expected_duration_minutes: number | null
  preparation_buffer_minutes: number | null
  travel_buffer_minutes: number | null
}

export function factsOf(v: VisitRow) {
  return {
    expectedDurationMinutes: v.expected_duration_minutes ?? 0,
    preparationBufferMinutes: v.preparation_buffer_minutes,
    travelBufferMinutes: v.travel_buffer_minutes,
  }
}

/**
 * A confirmed visit's new window: the same workers (with their roles) and items, checked and reserved for the new
 * range in this transaction, replacing the current reservations (kept as history, ended "rescheduled"). A refusal
 * names every problem (the unmet confirmation preconditions first) with alternatives, and nothing changes.
 */
async function moveReservations(
  tx: Tx,
  actor: StaffActor,
  v: VisitRow,
  to: LocalWindow,
  config: Config,
  reason: string | null,
  now: Date,
  pre: readonly FieldError[],
) {
  const own = await tx
    .selectFrom('work.reservations')
    .select(['resource', 'staff_user_id', 'equipment_id', 'role'])
    .where('visit_id', '=', v.id)
    .where('ended_at', 'is', null)
    .where('kind', '=', 'confirmed')
    .execute()
  const workers = own.filter((r) => r.staff_user_id !== null)
  const facts = factsOf(v)
  const req: ReservationRequest = {
    visitId: v.id,
    purpose: v.purpose,
    visitZone: v.time_zone,
    range: reservedRange(to, facts),
    onSite: onSiteRange(to, facts),
    travelMinutes: v.travel_buffer_minutes ?? 0,
    workerIds: workers.map((r) => r.staff_user_id as string),
    equipmentIds: own.filter((r) => r.equipment_id !== null).map((r) => r.equipment_id as string),
    actorId: actor.userId,
    reason,
    replaceOwn: true,
    settings: capacitySettings(config),
    now,
  }
  const problems = [...pre, ...(await evaluate(tx, req))]
  if (problems.length > 0) await refuse(tx, req, problems)
  await insertReservations(
    tx,
    req,
    new Map(workers.map((r) => [r.staff_user_id as string, r.role === 'lead' ? 'lead' : 'member'])),
  )
}

export type ConfirmInput = {
  /** Every worker the visit needs, the lead first. */
  readonly workerIds: readonly string[]
  /** One item for every equipment entry of the visit. */
  readonly equipmentIds?: readonly string[]
  readonly reason?: string
}

export type ConfirmedVisit = {
  readonly id: string
  readonly version: number
  readonly projectId: string
  readonly purpose: string
  readonly range: { startsAt: string; endsAt: string }
  readonly workerIds: readonly string[]
  readonly equipmentIds: readonly string[]
}

/**
 * Confirms a tentative visit with the version the caller saw: reserves every required worker (the lead first) and an
 * item for each equipment entry for the visit's reserved range, then confirms it, all in this transaction. Refusals:
 * NOT_FOUND, FORBIDDEN, STALE_VERSION, NOT_CONFIGURED (business.timezone, contact.hours), CONFLICT naming every unmet
 * requirement (VISIT_NOT_TENTATIVE, WINDOW_IN_PAST, DURATION_NOT_ENTERED, WORKERS_NOT_ENTERED, WORKER_COUNT_MISMATCH,
 * WORKER_REPEATED, EQUIPMENT_NOT_ASSIGNED, EQUIPMENT_REPEATED, the confirmation preconditions of preconditions.ts
 * (approval, deposit, a gate's codes, every blocking hold), OUTSIDE_VISIT_HOURS and the per-worker and per-item codes
 * of the capacity module) with the alternatives once the range is known. Nothing partial is written.
 */
export async function confirmVisit(
  tx: Tx,
  actor: StaffActor,
  scope: DataScope,
  visitId: string,
  input: ConfirmInput,
  deps: { gates: readonly WorkVisitGate[]; now: Date; expectedVersion: number },
): Promise<ConfirmedVisit> {
  const v = await tx.selectFrom('work.visits').selectAll().where('id', '=', visitId).forUpdate().executeTakeFirst()
  if (!v || !scopeIncludesProject(scope, v.project_id)) throw new ApiError('NOT_FOUND')
  if (!holds(actor, 'visit.confirm')) throw new ApiError('FORBIDDEN')
  if (v.version !== deps.expectedVersion)
    throw new ApiError('STALE_VERSION', { current: { version: v.version, values: { state: v.state } } })
  if (v.state !== 'tentative') throw new ApiError('CONFLICT', { fieldErrors: [field('state', 'VISIT_NOT_TENTATIVE')] })
  // TSK-0063: a visit whose windows are offered is confirmed by the customer's selection, or after a withdrawal.
  if (await openOfferOf(tx, v.id)) throw new ApiError('CONFLICT', { fieldErrors: [field('offer', 'OFFER_OPEN')] })
  const config = await loadConfig(tx)
  businessZone(config)
  const settings = capacitySettings(config)
  const workerIds = [...input.workerIds]
  const equipmentIds = [...(input.equipmentIds ?? [])]
  const problems: FieldError[] = []
  if (new Date(v.starts_at).getTime() <= deps.now.getTime()) problems.push(field('window', 'WINDOW_IN_PAST'))
  if (v.expected_duration_minutes === null)
    problems.push(field('visit.expectedDurationMinutes', 'DURATION_NOT_ENTERED'))
  if (v.required_workers === null) problems.push(field('visit.requiredWorkers', 'WORKERS_NOT_ENTERED'))
  if (new Set(workerIds).size !== workerIds.length) problems.push(field('body.workerIds', 'WORKER_REPEATED'))
  else if (v.required_workers !== null && workerIds.length !== v.required_workers)
    problems.push(field('body.workerIds', 'WORKER_COUNT_MISMATCH'))
  if (new Set(equipmentIds).size !== equipmentIds.length)
    problems.push(field('body.equipmentIds', 'EQUIPMENT_REPEATED'))
  else if (equipmentIds.length < v.equipment.length) problems.push(field('body.equipmentIds', 'EQUIPMENT_NOT_ASSIGNED'))
  // TSK-0064 (HH-SCH-06, RULE-SAFETY-GATES): every confirmation precondition, in this transaction: the approval and
  // the deposit gate of TSK-0059 for a work visit (run here whatever gates the module was given; an estimate visit
  // never waits for a deposit), the other registered gates and no blocking hold on the project.
  problems.push(...(await confirmationPreconditions(tx, v, deps.gates)))
  // TSK-0127 (final owner amendments 2026-10-22): the property's address and county verified by staff.
  problems.push(...(await countyVerificationProblems(tx, v.project_id)))
  // Without the expected work there is no range to check or offer alternatives for.
  if (v.expected_duration_minutes === null || v.required_workers === null)
    throw new ApiError('CONFLICT', { fieldErrors: problems })
  const window = storedWindow(v)
  const facts = factsOf(v)
  const req: ReservationRequest = {
    visitId: v.id,
    purpose: v.purpose,
    visitZone: v.time_zone,
    range: reservedRange(window, facts),
    onSite: onSiteRange(window, facts),
    travelMinutes: v.travel_buffer_minutes ?? 0,
    workerIds,
    equipmentIds,
    actorId: actor.userId,
    reason: input.reason?.trim() || null,
    replaceOwn: false,
    settings,
    now: deps.now,
  }
  problems.push(...(await evaluate(tx, req)))
  if (problems.length > 0) await refuse(tx, req, problems)
  const lead = workerIds[0] as string
  await insertReservations(tx, req, new Map(workerIds.map((id) => [id, id === lead ? 'lead' : 'member'])))
  const updated = await tx
    .updateTable('work.visits')
    .set({ state: 'confirmed', version: v.version + 1, updated_at: sql<Date>`now()` })
    .where('id', '=', v.id)
    .returning('version')
    .executeTakeFirstOrThrow()
  // PROPOSED: the job's scheduling task is fulfilled by its first confirmed work visit (HH-SCH-05).
  if (v.job_id !== null)
    await tx
      .updateTable('work.scheduling_tasks')
      .set((eb) => ({ state: 'fulfilled', version: eb('version', '+', 1) }))
      .where('job_id', '=', v.job_id)
      .where('state', 'in', ['open', 'planning'])
      .execute()
  await recordReserved(tx, { id: v.id, purpose: v.purpose, version: updated.version })
  return {
    id: v.id,
    version: updated.version,
    projectId: v.project_id,
    purpose: v.purpose,
    range: { startsAt: new Date(req.range.start).toISOString(), endsAt: new Date(req.range.end).toISOString() },
    workerIds,
    equipmentIds,
  }
}

type StaffRef = { id: string; name: string | null }

/** The property's county verification for its current address, for the visits view (null while none). */
async function countyVerificationView(db: Reader, projectId: string) {
  const v = await currentCountyVerification(db, projectId)
  if (!v) return null
  const by = (await staffNames(db, [v.verified_by])).get(v.verified_by) ?? { id: v.verified_by, name: null }
  return {
    state: v.state,
    county: v.county,
    inArea: v.in_area,
    addressVersion: v.address_version,
    verifiedBy: by,
    verifiedAt: new Date(v.verified_at).toISOString(),
  }
}

export async function staffNames(db: Reader, ids: string[]): Promise<Map<string, StaffRef>> {
  const wanted = [...new Set(ids)]
  if (wanted.length === 0) return new Map()
  const rows = await db
    .selectFrom('identity.staff_users')
    .select(['id', 'display_name'])
    .where('id', 'in', wanted)
    .execute()
  return new Map(rows.map((r) => [r.id, { id: r.id, name: r.display_name }]))
}

/** One window as the staff views show it: local fields with the zone, the offsets as text and the UTC instants. */
export function windowView(w: LocalWindow, hours: { open: string; close: string } | null, businessTz: string | null) {
  return {
    localDate: w.date,
    start: w.start,
    end: w.end,
    timeZone: w.zone,
    startOffset: formatOffset(w.startOffsetMinutes),
    endOffset: formatOffset(w.endOffsetMinutes),
    startsAt: w.startsAt.toISOString(),
    endsAt: w.endsAt.toISOString(),
    withinVisitHours: hours && businessTz ? windowWithinHours(w, hours, businessTz) : null,
  }
}

/** The audit summary of a window: local fields, zone, offsets and instants (no personal data). */
export function windowSummary(w: LocalWindow) {
  return {
    localDate: w.date,
    start: w.start,
    end: w.end,
    timeZone: w.zone,
    startOffset: formatOffset(w.startOffsetMinutes),
    endOffset: formatOffset(w.endOffsetMinutes),
    startsAt: w.startsAt.toISOString(),
    endsAt: w.endsAt.toISOString(),
  }
}

/**
 * What still stops a tentative visit from being confirmed now (TSK-0064, HH-SCH-06, HH-SCH-05): its own facts (a
 * window in the future inside the visit hours, the expected work and workers entered) and every confirmation
 * precondition. The capacity of the team, which staff choose when confirming, is checked then. Read in a transaction
 * of its own (the deposit gate share-locks the requirement) unless the caller is already in one.
 */
export async function confirmationBlockers(
  db: Reader,
  v: Parameters<typeof storedWindow>[0] & {
    id: string
    purpose: string
    project_id: string
    job_id: string | null
    expected_duration_minutes: number | null
    required_workers: number | null
  },
  hours: { open: string; close: string } | null,
  businessTz: string | null,
  gates: readonly WorkVisitGate[],
  now: Date,
): Promise<FieldError[]> {
  const out: FieldError[] = []
  const w = storedWindow(v)
  if (w.startsAt.getTime() <= now.getTime()) out.push(field('window', 'WINDOW_IN_PAST'))
  if (!hours) out.push(field('window', 'VISIT_HOURS_NOT_CONFIGURED'))
  else if (businessTz && !windowWithinHours(w, hours, businessTz)) out.push(field('window', 'OUTSIDE_VISIT_HOURS'))
  if (v.expected_duration_minutes === null) out.push(field('visit.expectedDurationMinutes', 'DURATION_NOT_ENTERED'))
  if (v.required_workers === null) out.push(field('visit.requiredWorkers', 'WORKERS_NOT_ENTERED'))
  out.push(...(await withTx(db, (tx) => confirmationPreconditions(tx, v, gates))))
  out.push(...(await countyVerificationProblems(db, v.project_id)))
  return out
}

/** What the board and the project's visits offer on one visit: the same rules in both places (TSK-0065). */
export type ActionContext = {
  readonly actor: StaffActor
  /** business.timezone is configured. */
  readonly business: boolean
  /** contact.hours (the daily visit hours) is configured. */
  readonly hours: boolean
  /** scheduling.window_offers is configured. */
  readonly offerPolicy: boolean
  /** The property's zone is a known IANA zone. */
  readonly zoneKnown: boolean
}

/**
 * The actions offered on a visit: Change the window (a reschedule for a confirmed visit), Confirm and Offer windows.
 * Offered only; the server decides again on every write (the same preconditions, deposit gate, holds and capacity).
 */
export function visitActions(
  c: ActionContext,
  v: { state: string; purpose: string; expected_duration_minutes: number | null; required_workers: number | null },
  openOffer: boolean,
  blockers: readonly FieldError[],
) {
  const canPlan = mayPlanVisits(c.actor) && c.business && c.zoneKnown
  const work = mayPlanWorkVisits(c.actor)
  const canConfirm = holds(c.actor, 'visit.confirm') && c.business && c.hours
  const facts = v.expected_duration_minutes !== null && v.required_workers !== null
  return {
    changeWindow:
      canPlan &&
      canChangeWindow(v.state) &&
      !openOffer &&
      (v.purpose === 'site_estimate' || work) &&
      (v.state !== 'confirmed' || holds(c.actor, 'visit.reschedule')),
    confirm: canConfirm && v.state === 'tentative' && facts && blockers.length === 0 && !openOffer,
    // TSK-0066: reassign a confirmed visit to another team; cancel it (a work visit: the Owner).
    reassign: holdsAction(c.actor, 'visit.reassign') && c.business && c.hours && v.state === 'confirmed',
    cancel: v.state === 'confirmed' && mayCancel(c.actor, v.purpose),
    offerWindows:
      canPlan &&
      v.state === 'tentative' &&
      (v.purpose === 'site_estimate' || work) &&
      c.hours &&
      c.offerPolicy &&
      facts &&
      !blockers.some((b) => b.field === 'approval' || b.field === 'coverage' || b.field.startsWith('holds.')) &&
      !openOffer,
  }
}

/**
 * A project's visits for staff, newest window first within each visit's history, with the project's job and
 * scheduling task beside them (kept apart: a scheduling task is never a booking) and what the caller may do now.
 * Each tentative visit lists what still stops its confirmation (TSK-0064); Confirm is offered only when nothing does.
 */
export async function projectVisits(
  db: Reader,
  actor: StaffActor,
  scope: DataScope,
  projectId: string,
  gates: readonly WorkVisitGate[] = WORK_VISIT_GATES,
) {
  if (!scopeIncludesProject(scope, projectId)) throw new ApiError('NOT_FOUND')
  const project = await db
    .selectFrom('crm.projects as p')
    .innerJoin('crm.properties as pr', 'pr.id', 'p.property_id')
    .select(['p.id', 'p.state', 'pr.time_zone', 'pr.coverage_result', 'pr.coverage_reason'])
    .where('p.id', '=', projectId)
    .executeTakeFirst()
  if (!project) throw new ApiError('NOT_FOUND')
  const config = await loadConfig(db)
  const tz = config.get('business.timezone')
  const business = tz.state === 'CONFIGURED' && isTimeZone(tz.value.zone) ? tz : null
  const hours = visitHoursOf(config)
  const job = await db
    .selectFrom('work.jobs as j')
    .leftJoin('work.scheduling_tasks as s', 's.job_id', 'j.id')
    .select(['j.id', 's.state as task_state'])
    .select((eb) =>
      eb
        .selectFrom('work.job_scope_snapshots as ss')
        .select((e) => e.fn.max('ss.version').as('v'))
        .whereRef('ss.job_id', '=', 'j.id')
        .as('scope_version'),
    )
    .where('j.project_id', '=', projectId)
    .executeTakeFirst()
  const visits = await db
    .selectFrom('work.visits')
    .selectAll()
    .where('project_id', '=', projectId)
    .orderBy('starts_at')
    .orderBy('created_at')
    .execute()
  const history = visits.length
    ? await db
        .selectFrom('work.visit_windows')
        .selectAll()
        .where(
          'visit_id',
          'in',
          visits.map((v) => v.id),
        )
        .orderBy('window_version', 'desc')
        .execute()
    : []
  const reservations = visits.length
    ? await db
        .selectFrom('work.reservations as r')
        .leftJoin('work.equipment as e', 'e.id', 'r.equipment_id')
        .selectAll('r')
        .select('e.name as equipment_name')
        .where(
          'r.visit_id',
          'in',
          visits.map((v) => v.id),
        )
        .orderBy('r.created_at')
        .orderBy('r.role')
        .execute()
    : []
  const flags = reservations.length
    ? await db
        .selectFrom('work.reservation_flags')
        .select(['reservation_id', 'cause'])
        .where(
          'reservation_id',
          'in',
          reservations.map((r) => r.id),
        )
        .where(notDismissed)
        .execute()
    : []
  const names = await staffNames(db, [
    ...visits.flatMap((v) => [v.created_by, v.window_set_by]),
    ...history.map((h) => h.set_by),
    ...reservations.flatMap((r) => (r.staff_user_id ? [r.staff_user_id] : [])),
  ])
  const offerStaff = visits.length
    ? await db
        .selectFrom('work.window_offers')
        .select(['offered_by', 'closed_by'])
        .where(
          'visit_id',
          'in',
          visits.map((v) => v.id),
        )
        .execute()
    : []
  const offerNames = await staffNames(
    db,
    offerStaff.flatMap((o) => [o.offered_by, ...(o.closed_by ? [o.closed_by] : [])]),
  )
  const ref = (id: string) => names.get(id) ?? { id, name: null }
  const businessTz = business ? business.value.zone : null
  const now = new Date()
  const offers = await staffOffers(
    db,
    visits,
    (id) => offerNames.get(id) ?? ref(id),
    (purpose) => mayPlanVisits(actor) && (purpose === 'site_estimate' || mayPlanWorkVisits(actor)),
    now,
  )
  const visitNotices = await noticesOf(
    db,
    'visit',
    visits.map((v) => v.id),
  )
  const offerPolicy = (() => {
    try {
      return windowOfferPolicy(config)
    } catch {
      return null
    }
  })()
  const actionContext: ActionContext = {
    actor,
    business: business !== null,
    hours: hours !== null,
    offerPolicy: offerPolicy !== null,
    zoneKnown: isTimeZone(project.time_zone),
  }
  const canPlan = mayPlanVisits(actor) && business !== null && isTimeZone(project.time_zone)
  const work = mayPlanWorkVisits(actor)
  const blockers = new Map<string, FieldError[]>()
  for (const v of visits)
    if (v.state === 'tentative') blockers.set(v.id, await confirmationBlockers(db, v, hours, businessTz, gates, now))
  const change = await changeFacts(db, actor, visits, (ids) => staffNames(db, ids), now)
  const blockerView = (id: string) =>
    blockers.has(id) ? (blockers.get(id) ?? []).map((b) => ({ field: b.field, code: b.code })) : null
  const range = (v: (typeof visits)[number]) =>
    v.expected_duration_minutes === null
      ? null
      : (() => {
          const r = reservedRange(storedWindow(v), factsOf(v))
          return { startsAt: new Date(r.start).toISOString(), endsAt: new Date(r.end).toISOString() }
        })()
  return {
    projectId: project.id,
    projectState: project.state,
    timeZone: project.time_zone,
    // TSK-0127 (OWN-DEC-179, OWN-DEC-167): the property's coverage, shown beside visit confirmation; staff, not the
    // checker, accept it (the recorded site checks are TSK-0126).
    coverage: {
      result: project.coverage_result,
      code: COVERAGE_CODE[project.coverage_result as CoverageOutcome],
      reason: project.coverage_reason,
      countyVerification: await countyVerificationView(db, project.id),
    },
    businessTimeZone: business ? { zone: business.value.zone, proposed: business.proposed } : null,
    visitHours: hours,
    windowOffers: offerPolicy
      ? {
          holdHours: offerPolicy.policy.holdHours,
          minWindows: offerPolicy.policy.minWindows,
          maxWindows: offerPolicy.policy.maxWindows,
          proposed: offerPolicy.proposed,
        }
      : null,
    job: job ? { id: job.id, scopeVersion: job.scope_version === null ? null : Number(job.scope_version) } : null,
    schedulingTask: job?.task_state ? { state: job.task_state } : null,
    actions: {
      planEstimateVisit: canPlan && (ESTIMATE_VISIT_PROJECT_STATES as readonly string[]).includes(project.state),
      planWorkVisit:
        canPlan &&
        work &&
        job !== undefined &&
        (WORK_VISIT_PROJECT_STATES as readonly string[]).includes(project.state),
    },
    // TSK-0070 (HH-WORK-06): the Owner opens each started visit's Arrived and Finished times.
    visitTimes: holdsAction(actor, 'visit.correct_timestamps'),
    // TSK-0151 (OWN-DEC-200 H7): the Owner keeps an appointment as it is despite a discretionary flag, with a reason.
    dismissFlags: holdsAction(actor, 'visit.dismiss_flag'),
    visits: visits.map((v) => ({
      id: v.id,
      number: v.number,
      purpose: v.purpose,
      state: v.state,
      version: v.version,
      jobId: v.job_id,
      window: windowView(storedWindow(v), hours, businessTz),
      windowVersion: v.window_version,
      expectedDurationMinutes: v.expected_duration_minutes,
      preparationBufferMinutes: v.preparation_buffer_minutes,
      travelBufferMinutes: v.travel_buffer_minutes,
      requiredWorkers: v.required_workers,
      equipment: v.equipment,
      reservedRange: range(v),
      assignments: reservations
        .filter((r) => r.visit_id === v.id)
        .map((r) => ({
          id: r.id,
          resource: r.resource,
          worker: r.staff_user_id ? ref(r.staff_user_id) : null,
          equipment: r.equipment_id ? { id: r.equipment_id, name: r.equipment_name ?? '' } : null,
          role: r.role,
          kind: r.kind,
          startsAt: new Date(r.starts_at).toISOString(),
          endsAt: new Date(r.ends_at).toISOString(),
          holdExpiresAt: r.hold_expires_at ? new Date(r.hold_expires_at).toISOString() : null,
          endedAt: r.ended_at ? new Date(r.ended_at).toISOString() : null,
          endedReason: r.ended_reason,
          flags: [...new Set(flags.filter((f) => f.reservation_id === r.id).map((f) => f.cause))],
          offerNumber: r.offer_id ? (offers.get(v.id)?.find((o) => o.id === r.offer_id)?.number ?? null) : null,
          offerPosition: r.offer_position,
        })),
      offers: offers.get(v.id) ?? [],
      notices: visitNotices.get(v.id) ?? [],
      confirmationBlockers: blockerView(v.id),
      changeRequest: change.requests.get(v.id) ?? null,
      cancellationPreview: change.previews.get(v.id) ?? null,
      changes: change.changes.get(v.id) ?? [],
      createdBy: ref(v.created_by),
      createdAt: new Date(v.created_at).toISOString(),
      history: history
        .filter((h) => h.visit_id === v.id)
        .map((h) => ({
          windowVersion: h.window_version,
          window: windowView(storedWindow(h), hours, businessTz),
          visitState: h.visit_state,
          setBy: ref(h.set_by),
          setAt: new Date(h.set_at).toISOString(),
          reason: h.reason,
        })),
      actions: visitActions(
        actionContext,
        v,
        (offers.get(v.id) ?? []).some((o) => o.state === 'open'),
        blockers.get(v.id) ?? [],
      ),
    })),
  }
}
export type ProjectVisits = Awaited<ReturnType<typeof projectVisits>>
