// Workers, equipment and their reservations (TSK-0062; HH-SCH-03, HH-SCH-04, HH-DATA-04, T38, T39, T42,
// ENT-Reservation, ENT-StaffUser, FACT-HOURS, OWN-DEC-05, OWN-DEC-28, OWN-DEC-119, OWN-DEC-123, RULE-SAFETY-GATES).
// - One mechanism reserves every worker and equipment item a visit needs, for estimate visits and work visits alike:
//   evaluate() checks, inside the caller's transaction and under row locks, everything a reservation needs (an active,
//   eligible worker with working hours that cover the range, no approved time off, no overlapping reservation or
//   hold; an item that is not retired and not reserved; the on-site part inside the visit hours) and names every
//   unmet requirement; insert() writes all the rows at once. The database's exclusion constraints are the final word:
//   a concurrent transaction that took the same capacity first makes the insert fail, the savepoint is rolled back so
//   nothing partial stays, and the caller gets the same CONFLICT with alternatives (one success, one conflict).
// - Locks: the workers' staff rows FOR SHARE and the items FOR SHARE, in id order, so an availability change, a
//   disabling or a retirement (which take those rows for update) is either seen or waits; rows are inserted in id
//   order, so two confirmations of one team never deadlock.
// - Nothing here holds an hour, a duration or a capacity: working hours are the Owner's records, the range comes from
//   the visit's planning facts (@handyhub/domain/capacity reservedRange, PROPOSED), the visit hours from contact.hours
//   (FACT-HOURS). The business zone (business.timezone) and contact.hours are NOT CONFIGURED refusals when unset.
// - PROPOSED eligibility (no owner rule): a work visit reserves staff holding the Worker role or the Owner role (the
//   Owner does field work, OWN-DEC-28; OWN-DEC-05: never counted without that confirmation); an estimate visit also an
//   Estimator. A worker whose working hours were never set is not reserved (WORKING_HOURS_NOT_SET).
import type { Db, Tx } from '@handyhub/db'
import {
  covers,
  dailyHoursAround,
  fitting,
  intersect,
  isTimeZone,
  isWorkVisitPurpose,
  localDateOf,
  localDay,
  normalize,
  subtract,
  workingIntervalsAround,
  type Interval,
  type Weekday,
  type WorkingPeriod,
} from '@handyhub/domain'
import { sql } from 'kysely'
import { ApiError, type CapacityAlternatives, type FieldError } from '../../api/errors.js'
import type { Config } from '../../platform/config/index.js'

type Reader = Db | Tx

const field = (f: string, code: string): FieldError => ({ field: f, code, message: '' })

/** PROPOSED: the roles a work visit may reserve (see the header). */
export const WORK_VISIT_ROLES = ['worker', 'owner'] as const
/** PROPOSED: the roles an estimate visit may reserve. */
export const ESTIMATE_VISIT_ROLES = ['worker', 'owner', 'estimator'] as const

export function eligibleRoles(purpose: string): readonly string[] {
  return isWorkVisitPurpose(purpose) ? WORK_VISIT_ROLES : ESTIMATE_VISIT_ROLES
}

/** The business zone and the daily visit hours a reservation needs; NOT CONFIGURED when either is unset. */
export function capacitySettings(config: Config): { zone: string; hours: { open: string; close: string } } {
  const z = config.get('business.timezone')
  if (z.state !== 'CONFIGURED' || !isTimeZone(z.value.zone))
    throw new ApiError('NOT_CONFIGURED', {
      fieldErrors: [field('business.timezone', 'BUSINESS_TIMEZONE_NOT_CONFIGURED')],
    })
  const h = config.get('contact.hours')
  if (h.state !== 'CONFIGURED')
    throw new ApiError('NOT_CONFIGURED', { fieldErrors: [field('contact.hours', 'VISIT_HOURS_NOT_CONFIGURED')] })
  return { zone: z.value.zone, hours: { open: h.value.open, close: h.value.close } }
}

export type Schedule = {
  readonly version: number
  readonly zone: string
  readonly periods: WorkingPeriod[]
  readonly setAt: Date
  readonly setBy: string
  readonly reason: string | null
}

/** The working-hours version in force for each worker (the latest one). */
export async function schedulesOf(db: Reader, ids: readonly string[]): Promise<Map<string, Schedule>> {
  const out = new Map<string, Schedule>()
  if (ids.length === 0) return out
  const latest = await db
    .selectFrom('work.worker_schedules as s')
    .selectAll('s')
    .where('s.staff_user_id', 'in', [...ids])
    .where((eb) =>
      eb(
        's.version',
        '=',
        eb
          .selectFrom('work.worker_schedules as s2')
          .select((e) => e.fn.max('s2.version').as('v'))
          .whereRef('s2.staff_user_id', '=', 's.staff_user_id'),
      ),
    )
    .execute()
  if (latest.length === 0) return out
  const hours = await db
    .selectFrom('work.working_hours')
    .selectAll()
    .where((eb) =>
      eb.or(latest.map((s) => eb.and([eb('staff_user_id', '=', s.staff_user_id), eb('version', '=', s.version)]))),
    )
    .orderBy('weekday')
    .orderBy('start_minute')
    .execute()
  for (const s of latest)
    out.set(s.staff_user_id, {
      version: s.version,
      zone: s.time_zone,
      setAt: new Date(s.set_at),
      setBy: s.set_by,
      reason: s.reason,
      periods: hours
        .filter((h) => h.staff_user_id === s.staff_user_id)
        .map((h) => ({ weekday: h.weekday as Weekday, startMinute: h.start_minute, endMinute: h.end_minute })),
    })
  return out
}

/** The live staff roles of each user. */
export async function rolesOf(db: Reader, ids: readonly string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>()
  if (ids.length === 0) return out
  const rows = await db
    .selectFrom('identity.role_grants')
    .select(['staff_user_id', 'name'])
    .where('staff_user_id', 'in', [...ids])
    .where('kind', '=', 'role')
    .where('ended_at', 'is', null)
    .execute()
  for (const r of rows) out.set(r.staff_user_id, [...(out.get(r.staff_user_id) ?? []), r.name])
  return out
}

export type TimeOffRow = { id: string; staffUserId: string; range: Interval }

export async function timeOffOf(db: Reader, ids: readonly string[], range: Interval): Promise<TimeOffRow[]> {
  if (ids.length === 0) return []
  const rows = await db
    .selectFrom('work.time_off')
    .select(['id', 'staff_user_id', 'starts_at', 'ends_at'])
    .where('staff_user_id', 'in', [...ids])
    .where('withdrawn_at', 'is', null)
    .where('starts_at', '<', new Date(range.end))
    .where('ends_at', '>', new Date(range.start))
    .orderBy('starts_at')
    .execute()
  return rows.map((r) => ({
    id: r.id,
    staffUserId: r.staff_user_id,
    range: { start: new Date(r.starts_at).getTime(), end: new Date(r.ends_at).getTime() },
  }))
}

export type ReservationRow = {
  id: string
  visitId: string
  resource: 'worker' | 'equipment'
  staffUserId: string | null
  equipmentId: string | null
  role: string | null
  kind: string
  holdExpiresAt: Date | null
  range: Interval
}

/** The active reservations and holds of these workers and items that overlap the range (optionally not this visit's). */
export async function activeReservations(
  db: Reader,
  q: { workerIds?: readonly string[]; equipmentIds?: readonly string[]; range: Interval; exceptVisitId?: string },
): Promise<ReservationRow[]> {
  const workers = [...(q.workerIds ?? [])]
  const items = [...(q.equipmentIds ?? [])]
  if (workers.length === 0 && items.length === 0) return []
  let query = db
    .selectFrom('work.reservations')
    .selectAll()
    .where('ended_at', 'is', null)
    .where('starts_at', '<', new Date(q.range.end))
    .where('ends_at', '>', new Date(q.range.start))
    .where((eb) =>
      eb.or([
        ...(workers.length ? [eb('staff_user_id', 'in', workers)] : []),
        ...(items.length ? [eb('equipment_id', 'in', items)] : []),
      ]),
    )
  if (q.exceptVisitId) query = query.where('visit_id', '<>', q.exceptVisitId)
  const rows = await query.orderBy('starts_at').execute()
  return rows.map(toReservation)
}

export function toReservation(r: {
  id: string
  visit_id: string
  resource: string
  staff_user_id: string | null
  equipment_id: string | null
  role: string | null
  kind: string
  hold_expires_at: Date | null
  starts_at: Date
  ends_at: Date
}): ReservationRow {
  return {
    id: r.id,
    visitId: r.visit_id,
    resource: r.resource as 'worker' | 'equipment',
    staffUserId: r.staff_user_id,
    equipmentId: r.equipment_id,
    role: r.role,
    kind: r.kind,
    holdExpiresAt: r.hold_expires_at ? new Date(r.hold_expires_at) : null,
    range: { start: new Date(r.starts_at).getTime(), end: new Date(r.ends_at).getTime() },
  }
}

/** What one reservation request needs: the visit, the range and the resources (the lead first). */
export type ReservationRequest = {
  readonly visitId: string
  readonly purpose: string
  /** The visit's zone, recorded with each row. */
  readonly visitZone: string
  readonly range: Interval
  readonly onSite: Interval
  readonly travelMinutes: number
  readonly workerIds: readonly string[]
  readonly equipmentIds: readonly string[]
  readonly actorId: string
  readonly reason: string | null
  /** A reschedule: the visit's own active reservations are replaced, so they never count against it. */
  readonly replaceOwn: boolean
  readonly settings: { zone: string; hours: { open: string; close: string } }
  readonly now: Date
}

type StaffRow = { id: string; status: string; display_name: string | null }

async function lockStaff(tx: Tx, ids: readonly string[]): Promise<StaffRow[]> {
  if (ids.length === 0) return []
  return tx
    .selectFrom('identity.staff_users')
    .select(['id', 'status', 'display_name'])
    .where('id', 'in', [...ids])
    .orderBy('id')
    .forShare()
    .execute()
}

async function lockEquipment(tx: Tx, ids: readonly string[]) {
  if (ids.length === 0) return []
  return tx
    .selectFrom('work.equipment')
    .select(['id', 'name', 'retired_at'])
    .where('id', 'in', [...ids])
    .orderBy('id')
    .forShare()
    .execute()
}

/** Ends the expired holds (OWN-DEC-144) on these resources that overlap the range, so they block nobody any more. */
async function endExpiredHolds(tx: Tx, req: ReservationRequest): Promise<void> {
  const workers = [...req.workerIds]
  const items = [...req.equipmentIds]
  if (workers.length === 0 && items.length === 0) return
  await tx
    .updateTable('work.reservations')
    .set({ ended_at: sql<Date>`now()`, ended_reason: 'hold_expired' })
    .where('kind', '=', 'hold')
    .where('ended_at', 'is', null)
    .where('hold_expires_at', '<=', req.now)
    .where('starts_at', '<', new Date(req.range.end))
    .where('ends_at', '>', new Date(req.range.start))
    .where((eb) =>
      eb.or([
        ...(workers.length ? [eb('staff_user_id', 'in', workers)] : []),
        ...(items.length ? [eb('equipment_id', 'in', items)] : []),
      ]),
    )
    .execute()
}

/**
 * Every unmet requirement of the request, as field errors (`workers.<id>`, `equipment.<id>`, `window`); empty when
 * it can be reserved. Takes the row locks and ends expired holds first.
 */
export async function evaluate(tx: Tx, req: ReservationRequest): Promise<FieldError[]> {
  const problems: FieldError[] = []
  const staff = await lockStaff(tx, req.workerIds)
  const items = await lockEquipment(tx, req.equipmentIds)
  await endExpiredHolds(tx, req)
  const visitHours = dailyHoursAround(req.settings.hours, req.onSite, req.settings.zone)
  if (!covers(visitHours, req.onSite)) problems.push(field('window', 'OUTSIDE_VISIT_HOURS'))
  const roles = await rolesOf(tx, req.workerIds)
  const schedules = await schedulesOf(tx, req.workerIds)
  const off = await timeOffOf(tx, req.workerIds, req.range)
  const taken = await activeReservations(tx, {
    workerIds: req.workerIds,
    equipmentIds: req.equipmentIds,
    range: req.range,
    ...(req.replaceOwn ? { exceptVisitId: req.visitId } : {}),
  })
  const allowed = eligibleRoles(req.purpose)
  for (const id of req.workerIds) {
    const s = staff.find((x) => x.id === id)
    const at = `workers.${id}`
    if (!s) {
      problems.push(field(at, 'WORKER_UNKNOWN'))
      continue
    }
    if (s.status !== 'active') problems.push(field(at, 'WORKER_NOT_ACTIVE'))
    if (!(roles.get(id) ?? []).some((r) => allowed.includes(r))) problems.push(field(at, 'WORKER_NOT_ELIGIBLE'))
    const schedule = schedules.get(id)
    if (!schedule) problems.push(field(at, 'WORKING_HOURS_NOT_SET'))
    else if (!covers(workingIntervalsAround(schedule.periods, req.range, schedule.zone), req.range))
      problems.push(field(at, 'OUTSIDE_WORKING_HOURS'))
    if (off.some((o) => o.staffUserId === id)) problems.push(field(at, 'TIME_OFF'))
    if (taken.some((r) => r.staffUserId === id)) problems.push(field(at, 'WORKER_BOOKED'))
  }
  for (const id of req.equipmentIds) {
    const item = items.find((x) => x.id === id)
    const at = `equipment.${id}`
    if (!item) {
      problems.push(field(at, 'EQUIPMENT_UNKNOWN'))
      continue
    }
    if (item.retired_at !== null) problems.push(field(at, 'EQUIPMENT_RETIRED'))
    if (taken.some((r) => r.equipmentId === id)) problems.push(field(at, 'EQUIPMENT_BOOKED'))
  }
  return problems
}

const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)

/** Eligible workers (active, role, working hours set) other than `except`, with their names. */
async function eligibleWorkers(db: Reader, purpose: string, except: readonly string[]) {
  const rows = await db
    .selectFrom('identity.staff_users as u')
    .innerJoin('identity.role_grants as g', 'g.staff_user_id', 'u.id')
    .select(['u.id', 'u.display_name'])
    .distinct()
    .where('u.status', '=', 'active')
    .where('g.kind', '=', 'role')
    .where('g.ended_at', 'is', null)
    .where('g.name', 'in', [...eligibleRoles(purpose)])
    .orderBy('u.id')
    .execute()
  return rows.filter((r) => !except.includes(r.id))
}

/** The free periods of one worker on the intervals `within`: working hours minus time off and reservations. */
export function freeOfWorker(
  schedule: Schedule | undefined,
  within: Interval,
  off: readonly Interval[],
  busy: readonly Interval[],
): Interval[] {
  if (!schedule) return []
  const working = intersect(workingIntervalsAround(schedule.periods, within, schedule.zone), [within])
  return subtract(working, [...off, ...busy])
}

/** The alternatives offered with a conflict (CapacityAlternatives); reads only, inside the caller's transaction. */
export async function alternatives(tx: Tx, req: ReservationRequest): Promise<CapacityAlternatives> {
  const except = req.replaceOwn ? { exceptVisitId: req.visitId } : {}
  // Other workers free for the whole range.
  const candidates = await eligibleWorkers(tx, req.purpose, req.workerIds)
  const ids = candidates.map((c) => c.id)
  const schedules = await schedulesOf(tx, ids)
  const off = await timeOffOf(tx, ids, req.range)
  const taken = await activeReservations(tx, { workerIds: ids, range: req.range, ...except })
  const workers = candidates
    .filter((c) => {
      const s = schedules.get(c.id)
      return (
        s !== undefined &&
        covers(workingIntervalsAround(s.periods, req.range, s.zone), req.range) &&
        !off.some((o) => o.staffUserId === c.id) &&
        !taken.some((r) => r.staffUserId === c.id)
      )
    })
    .map((c) => ({ id: c.id, name: c.display_name }))
  // Other items free for the whole range.
  const items = await tx
    .selectFrom('work.equipment')
    .select(['id', 'name'])
    .where('retired_at', 'is', null)
    .orderBy('name')
    .execute()
  const others = items.filter((i) => !req.equipmentIds.includes(i.id))
  const itemTaken = await activeReservations(tx, { equipmentIds: others.map((i) => i.id), range: req.range, ...except })
  const equipment = others.filter((i) => !itemTaken.some((r) => r.equipmentId === i.id))
  // Free periods of the visit's local day (business zone) in which the whole reserved range fits for everyone asked.
  const date = localDateOf(new Date(req.onSite.start), req.settings.zone)
  const day = localDay(date, req.settings.zone)
  const asked = req.workerIds.filter(isUuid)
  const askedItems = req.equipmentIds.filter(isUuid)
  const askedSchedules = await schedulesOf(tx, asked)
  const askedOff = await timeOffOf(tx, asked, day)
  const askedTaken = await activeReservations(tx, { workerIds: asked, equipmentIds: askedItems, range: day, ...except })
  const askedStaff = await tx
    .selectFrom('identity.staff_users')
    .select(['id', 'status'])
    .where('id', 'in', asked.length ? asked : ['00000000-0000-0000-0000-000000000000'])
    .execute()
  let common: Interval[] = [day]
  for (const id of asked) {
    const active = askedStaff.some((s) => s.id === id && s.status === 'active')
    const free = active
      ? freeOfWorker(
          askedSchedules.get(id),
          day,
          askedOff.filter((o) => o.staffUserId === id).map((o) => o.range),
          askedTaken.filter((r) => r.staffUserId === id).map((r) => r.range),
        )
      : []
    common = intersect(common, free)
  }
  for (const id of askedItems)
    common = intersect(
      common,
      subtract(
        [day],
        askedTaken.filter((r) => r.equipmentId === id).map((r) => r.range),
      ),
    )
  // The on-site part stays inside the visit hours; the travel buffer may start before they open.
  const hours = dailyHoursAround(req.settings.hours, day, req.settings.zone).map((h) => ({
    start: h.start - req.travelMinutes * 60_000,
    end: h.end,
  }))
  const periods = fitting(intersect(common, normalize(hours)), req.range.end - req.range.start)
    .filter((p) => p.end > req.now.getTime())
    .map((p) => ({
      startsAt: new Date(Math.max(p.start, req.now.getTime())).toISOString(),
      endsAt: new Date(p.end).toISOString(),
    }))
  return { workers, equipment, periods }
}

/** Refuses with every unmet requirement and the alternatives; nothing is written. */
export async function refuse(tx: Tx, req: ReservationRequest, problems: FieldError[]): Promise<never> {
  throw new ApiError('CONFLICT', { fieldErrors: problems, alternatives: await alternatives(tx, req) })
}

const RACE = new Set(['23P01', '40P01'])

/**
 * Writes every reservation of the request in one step (workers first, each list in id order), after ending the
 * visit's own active ones for a reschedule. A conflict the exclusion constraints report (a concurrent transaction
 * took the capacity first) rolls the whole step back and refuses with the current problems and alternatives.
 */
export async function insertReservations(
  tx: Tx,
  req: ReservationRequest,
  roles: ReadonlyMap<string, 'lead' | 'member'>,
): Promise<void> {
  await sql`SAVEPOINT capacity_reserve`.execute(tx)
  try {
    if (req.replaceOwn)
      await tx
        .updateTable('work.reservations')
        .set({ ended_at: sql<Date>`now()`, ended_by: req.actorId, ended_reason: 'rescheduled' })
        .where('visit_id', '=', req.visitId)
        .where('ended_at', 'is', null)
        .execute()
    const common = {
      visit_id: req.visitId,
      kind: 'confirmed',
      starts_at: new Date(req.range.start),
      ends_at: new Date(req.range.end),
      time_zone: req.visitZone,
      assigned_by: req.actorId,
      reason: req.reason,
    }
    for (const id of [...req.workerIds].sort())
      await tx
        .insertInto('work.reservations')
        .values({ ...common, resource: 'worker', staff_user_id: id, role: roles.get(id) ?? 'member' })
        .execute()
    for (const id of [...req.equipmentIds].sort())
      await tx
        .insertInto('work.reservations')
        .values({ ...common, resource: 'equipment', equipment_id: id })
        .execute()
  } catch (err) {
    if (!RACE.has((err as { code?: string }).code ?? '')) throw err
    await sql`ROLLBACK TO SAVEPOINT capacity_reserve`.execute(tx)
    const problems = await evaluate(tx, req)
    await refuse(tx, req, problems.length ? problems : [field('reservation', 'CAPACITY_TAKEN')])
  }
  await sql`RELEASE SAVEPOINT capacity_reserve`.execute(tx)
}
