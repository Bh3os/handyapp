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
//   relies on it. Nothing here confirms a visit, reserves capacity, offers a window to the customer or sends a notice.
// - Work visits pass the gates of WORK_VISIT_GATES (gates.ts) whenever a window is planned or changed. PROPOSED: the
//   first planned work visit moves the job's scheduling task from open to planning.
import type { Db, Tx } from '@handyhub/db'
import {
  canChangeWindow,
  formatOffset,
  isTimeZone,
  isWorkVisitPurpose,
  resolveWindow,
  windowWithinHours,
  type LocalWindow,
  type VisitPurpose,
  type WindowProblem,
} from '@handyhub/domain'
import { rowFor, scopeIncludesProject, type DataScope, type StaffActor } from '@handyhub/policy'
import { sql } from 'kysely'
import { ApiError, type FieldError } from '../../api/errors.js'
import { loadConfig, type Config } from '../../platform/config/index.js'
import { unmetGates, type WorkVisitGate } from './gates.js'

type Reader = Db | Tx

const field = (f: string, code: string): FieldError => ({ field: f, code, message: '' })

/** PROPOSED: estimate visits are planned while the project is open (before an estimate is approved). */
export const ESTIMATE_VISIT_PROJECT_STATES = ['open'] as const
/** PROPOSED: work visits are planned while the project is approved or, for follow-up and return work, completed. */
export const WORK_VISIT_PROJECT_STATES = ['approved', 'completed'] as const

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

/** Whether the actor may plan visits at all (offer windows), on any project. */
export function mayPlanVisits(actor: StaffActor): boolean {
  const row = rowFor('visit.offer_windows')
  return actor.roles.some((role) => row?.cells[role].rules['visit.offer_windows'] !== undefined)
}

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

const visitHoursOf = (config: Config) => {
  const h = config.get('contact.hours')
  return h.state === 'CONFIGURED' ? { open: h.value.open, close: h.value.close } : null
}

type ProjectRow = { id: string; state: string; property_id: string; time_zone: string }

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

/** The stored window of a visit row as the domain describes it. */
function storedWindow(v: {
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
  entry: WindowEntry & { readonly reason?: string | undefined },
  deps: { gates: readonly WorkVisitGate[]; now: Date; expectedVersion: number },
): Promise<{ id: string; version: number; projectId: string; purpose: string } & WindowChange> {
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
  businessZone(await loadConfig(tx))
  if (v.job_id !== null) await passGates(tx, { id: v.job_id, project_id: v.project_id }, deps.gates)
  // The visit keeps the zone it was planned in: the property's zone at planning time.
  const to = resolveEntry(entry, v.time_zone, deps.now)
  const from = storedWindow(v)
  if (from.startsAt.getTime() === to.startsAt.getTime() && from.endsAt.getTime() === to.endsAt.getTime())
    throw new ApiError('CONFLICT', { fieldErrors: [field('body', 'WINDOW_UNCHANGED')] })
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
  return {
    id: v.id,
    version: updated.version,
    projectId: v.project_id,
    purpose: v.purpose,
    from,
    to,
    windowVersion: updated.window_version,
  }
}

type StaffRef = { id: string; name: string | null }

async function staffNames(db: Reader, ids: string[]): Promise<Map<string, StaffRef>> {
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
function windowView(w: LocalWindow, hours: { open: string; close: string } | null, businessTz: string | null) {
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
 * A project's visits for staff, newest window first within each visit's history, with the project's job and
 * scheduling task beside them (kept apart: a scheduling task is never a booking) and what the caller may do now.
 */
export async function projectVisits(db: Reader, actor: StaffActor, scope: DataScope, projectId: string) {
  if (!scopeIncludesProject(scope, projectId)) throw new ApiError('NOT_FOUND')
  const project = await db
    .selectFrom('crm.projects as p')
    .innerJoin('crm.properties as pr', 'pr.id', 'p.property_id')
    .select(['p.id', 'p.state', 'pr.time_zone'])
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
  const names = await staffNames(db, [
    ...visits.flatMap((v) => [v.created_by, v.window_set_by]),
    ...history.map((h) => h.set_by),
  ])
  const ref = (id: string) => names.get(id) ?? { id, name: null }
  const businessTz = business ? business.value.zone : null
  const canPlan = mayPlanVisits(actor) && business !== null && isTimeZone(project.time_zone)
  const work = mayPlanWorkVisits(actor)
  return {
    projectId: project.id,
    projectState: project.state,
    timeZone: project.time_zone,
    businessTimeZone: business ? { zone: business.value.zone, proposed: business.proposed } : null,
    visitHours: hours,
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
    visits: visits.map((v) => ({
      id: v.id,
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
      actions: {
        changeWindow:
          canPlan && canChangeWindow(v.state) && (v.purpose === 'site_estimate' || work) && business !== null,
      },
    })),
  }
}
export type ProjectVisits = Awaited<ReturnType<typeof projectVisits>>
