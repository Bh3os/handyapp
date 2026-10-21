// Worker availability, equipment and the capacity of a day (TSK-0062; HH-SCH-03, HH-SCH-04, T39, ENT-StaffUser,
// ENT-Reservation, FACT-HOURS, FACT-TIMEZONE, OWN-DEC-05, OWN-DEC-119, OWN-DEC-123, RULE-SERVER-AUTHZ).
// - The Owner sets each worker's working days and hours (a new append-only version each time, local to the business
//   zone), records approved time off and withdraws it, and registers and retires equipment items. Nothing is assumed:
//   a worker without a version has no working hours (NOT CONFIGURED for that worker) and is never reserved.
// - Availability changes never cancel an appointment (OWN-DEC-123): the upcoming reservations a new version no longer
//   covers are flagged for review here; recorded time off, a disabled account or a retired item are flagged by the
//   database in the same transaction (migration 0052).
// - The capacity of a local day (business zone) per worker and item: working periods, time off, reservations and holds
//   (each with its visit, kind and flags), and the free periods left. A two-person visit shows on both workers, so the
//   team of two is never shown as two crews (T39). Holds count as taken but are marked as holds, never as bookings.
import type { Db, Tx } from '@handyhub/db'
import {
  addLocalDays,
  hoursProblems,
  isLocalDate,
  localDay,
  localInstant,
  minuteToClock,
  clockToMinute,
  covers,
  dailyHoursAround,
  intersect,
  subtract,
  workingIntervalsAround,
  type Interval,
  type Weekday,
  type WorkingPeriod,
} from '@handyhub/domain'
import { sql } from 'kysely'
import { ApiError, type FieldError } from '../../api/errors.js'
import { loadConfig } from '../../platform/config/index.js'
import {
  ESTIMATE_VISIT_ROLES,
  WORK_VISIT_ROLES,
  freeOfWorker,
  rolesOf,
  schedulesOf,
  timeOffOf,
  toReservation,
  type Schedule,
} from './resources.js'

type Reader = Db | Tx

const field = (f: string, code: string): FieldError => ({ field: f, code, message: '' })
const iso = (ms: number | Date) => new Date(ms).toISOString()
const span = (i: Interval) => ({ startsAt: iso(i.start), endsAt: iso(i.end) })

/** PROPOSED input bounds (no owner value). */
export const AVAILABILITY_LIMITS = {
  periodsPerWeek: 28,
  reasonLength: 500,
  equipmentNameLength: 120,
  timeOffDays: 366,
} as const

/** The business zone (FACT-TIMEZONE) or NOT CONFIGURED; working hours and time off are local to it. */
async function zoneOf(db: Reader): Promise<{ zone: string; proposed: boolean }> {
  const z = (await loadConfig(db)).get('business.timezone')
  if (z.state !== 'CONFIGURED')
    throw new ApiError('NOT_CONFIGURED', {
      fieldErrors: [field('business.timezone', 'BUSINESS_TIMEZONE_NOT_CONFIGURED')],
    })
  return { zone: z.value.zone, proposed: z.proposed }
}

export type PeriodInput = { readonly weekday: number; readonly start: string; readonly end: string }

const scheduleView = (s: Schedule | undefined) =>
  s
    ? {
        version: s.version,
        timeZone: s.zone,
        setAt: s.setAt.toISOString(),
        reason: s.reason,
        periods: s.periods.map((p) => ({
          weekday: p.weekday,
          start: minuteToClock(p.startMinute),
          end: minuteToClock(p.endMinute),
        })),
      }
    : null

const eligibility = (roles: readonly string[]) => ({
  estimateVisits: roles.some((r) => (ESTIMATE_VISIT_ROLES as readonly string[]).includes(r)),
  workVisits: roles.some((r) => (WORK_VISIT_ROLES as readonly string[]).includes(r)),
})

/** Every staff member that is not disabled, with roles, working hours and upcoming time off; the equipment items. */
export async function availabilityView(db: Reader, now: Date) {
  const config = await loadConfig(db)
  const tz = config.get('business.timezone')
  const users = await db
    .selectFrom('identity.staff_users')
    .select(['id', 'display_name', 'status'])
    .where('status', '<>', 'disabled')
    .orderBy('display_name')
    .orderBy('id')
    .execute()
  const ids = users.map((u) => u.id)
  const roles = await rolesOf(db, ids)
  const schedules = await schedulesOf(db, ids)
  const off = ids.length
    ? await db
        .selectFrom('work.time_off')
        .select(['id', 'staff_user_id', 'starts_at', 'ends_at', 'time_zone', 'recorded_at'])
        .where('staff_user_id', 'in', ids)
        .where('withdrawn_at', 'is', null)
        .where('ends_at', '>', now)
        .orderBy('starts_at')
        .execute()
    : []
  const equipment = await db
    .selectFrom('work.equipment')
    .select(['id', 'name', 'created_at'])
    .where('retired_at', 'is', null)
    .orderBy('name')
    .execute()
  return {
    businessTimeZone: tz.state === 'CONFIGURED' ? { zone: tz.value.zone, proposed: tz.proposed } : null,
    workers: users.map((u) => {
      const r = roles.get(u.id) ?? []
      return {
        id: u.id,
        name: u.display_name,
        status: u.status,
        roles: r,
        eligibleFor: eligibility(r),
        schedule: scheduleView(schedules.get(u.id)),
        timeOff: off
          .filter((o) => o.staff_user_id === u.id)
          .map((o) => ({
            id: o.id,
            startsAt: iso(o.starts_at),
            endsAt: iso(o.ends_at),
            timeZone: o.time_zone,
            recordedAt: iso(o.recorded_at),
          })),
      }
    }),
    equipment: equipment.map((e) => ({ id: e.id, name: e.name, createdAt: iso(e.created_at) })),
  }
}
export type AvailabilityView = Awaited<ReturnType<typeof availabilityView>>

async function lockSubject(tx: Tx, staffUserId: string) {
  const u = await tx
    .selectFrom('identity.staff_users')
    .select(['id', 'status'])
    .where('id', '=', staffUserId)
    .forUpdate()
    .executeTakeFirst()
  if (!u) throw new ApiError('NOT_FOUND')
  if (u.status === 'disabled') throw new ApiError('CONFLICT', { fieldErrors: [field('staffUser', 'ACCOUNT_DISABLED')] })
  return u
}

/** The periods as entered, validated: real weekdays, HH:MM times (24:00 ends the day), no overlap. */
export function parsePeriods(input: readonly PeriodInput[]): WorkingPeriod[] {
  const bad: FieldError[] = []
  const periods = input.map((p, i) => {
    const start = clockToMinute(p.start)
    const end = clockToMinute(p.end)
    if (start === null || start >= 1440) bad.push(field(`body.periods.${i}.start`, 'TIME_INVALID'))
    if (end === null || end === 0) bad.push(field(`body.periods.${i}.end`, 'TIME_INVALID'))
    return { weekday: p.weekday as Weekday, startMinute: start ?? 0, endMinute: end ?? 0 }
  })
  if (bad.length) throw new ApiError('VALIDATION_FAILED', { fieldErrors: bad })
  const problems = hoursProblems(periods)
  if (problems.length)
    throw new ApiError('VALIDATION_FAILED', { fieldErrors: problems.map((c) => field('body.periods', c)) })
  return periods
}

/**
 * Sets a worker's working days and hours as the next version (If-Match: the version shown, 0 when none was set). The
 * upcoming reservations the new hours no longer cover are flagged for review, never cancelled. Refusals: NOT_FOUND,
 * STALE_VERSION, CONFLICT (ACCOUNT_DISABLED), NOT_CONFIGURED (business.timezone), VALIDATION_FAILED.
 */
export async function setWorkingHours(
  tx: Tx,
  actorId: string,
  staffUserId: string,
  input: { periods: readonly PeriodInput[]; reason?: string | undefined },
  deps: { expectedVersion: number; now: Date },
): Promise<{ version: number; flagged: number; periods: WorkingPeriod[] }> {
  await lockSubject(tx, staffUserId)
  const { zone } = await zoneOf(tx)
  const current = (await schedulesOf(tx, [staffUserId])).get(staffUserId)
  const version = current?.version ?? 0
  if (version !== deps.expectedVersion) throw new ApiError('STALE_VERSION', { current: { version } })
  const periods = parsePeriods(input.periods)
  const next = version + 1
  await tx
    .insertInto('work.worker_schedules')
    .values({
      staff_user_id: staffUserId,
      version: next,
      time_zone: zone,
      set_by: actorId,
      reason: input.reason?.trim() || null,
    })
    .execute()
  for (const p of periods)
    await tx
      .insertInto('work.working_hours')
      .values({
        staff_user_id: staffUserId,
        version: next,
        weekday: p.weekday,
        start_minute: p.startMinute,
        end_minute: p.endMinute,
      })
      .execute()
  // Upcoming reservations outside the new hours are flagged for review (OWN-DEC-123).
  const upcoming = await tx
    .selectFrom('work.reservations')
    .selectAll()
    .where('staff_user_id', '=', staffUserId)
    .where('ended_at', 'is', null)
    .where('ends_at', '>', deps.now)
    .execute()
  let flagged = 0
  for (const r of upcoming.map(toReservation)) {
    if (covers(workingIntervalsAround(periods, r.range, zone), r.range)) continue
    const res = await tx
      .insertInto('work.reservation_flags')
      .values({ reservation_id: r.id, visit_id: r.visitId, cause: 'working_hours_changed', cause_ref: `v${next}` })
      .onConflict((oc) => oc.doNothing())
      .executeTakeFirst()
    flagged += Number(res.numInsertedOrUpdatedRows ?? 0)
  }
  return { version: next, flagged, periods }
}

export type TimeOffInput = {
  readonly startDate: string
  readonly startTime?: string | null
  readonly endDate: string
  readonly endTime?: string | null
}

/** Local dates and times of the business zone as a UTC range; a whole day without times. */
export function timeOffRange(input: TimeOffInput, zone: string): Interval {
  const bad: FieldError[] = []
  if (!isLocalDate(input.startDate)) bad.push(field('body.startDate', 'DATE_INVALID'))
  if (!isLocalDate(input.endDate)) bad.push(field('body.endDate', 'DATE_INVALID'))
  const startMinute = input.startTime ? clockToMinute(input.startTime) : 0
  const endMinute = input.endTime ? clockToMinute(input.endTime) : null
  if (startMinute === null || startMinute >= 1440) bad.push(field('body.startTime', 'TIME_INVALID'))
  if (input.endTime && (endMinute === null || endMinute === 0)) bad.push(field('body.endTime', 'TIME_INVALID'))
  if (bad.length) throw new ApiError('VALIDATION_FAILED', { fieldErrors: bad })
  const start = localInstant(input.startDate, startMinute ?? 0, zone, 'start')
  const end =
    endMinute === null
      ? localInstant(addLocalDays(input.endDate, 1), 0, zone, 'start')
      : localInstant(input.endDate, endMinute, zone, 'end')
  if (end <= start) throw new ApiError('VALIDATION_FAILED', { fieldErrors: [field('body.endDate', 'TIME_OFF_ORDER')] })
  if (end - start > AVAILABILITY_LIMITS.timeOffDays * 24 * 3_600_000)
    throw new ApiError('VALIDATION_FAILED', { fieldErrors: [field('body.endDate', 'TIME_OFF_TOO_LONG')] })
  return { start, end }
}

/**
 * Records approved time off for a worker. The database flags the upcoming reservations it overlaps (never cancels
 * them). PROPOSED: time off ends in the future. Refusals: NOT_FOUND, CONFLICT (ACCOUNT_DISABLED), NOT_CONFIGURED,
 * VALIDATION_FAILED.
 */
export async function recordTimeOff(
  tx: Tx,
  actorId: string,
  staffUserId: string,
  input: TimeOffInput,
  now: Date,
): Promise<{ id: string; range: Interval; flagged: number; zone: string }> {
  await lockSubject(tx, staffUserId)
  const { zone } = await zoneOf(tx)
  const range = timeOffRange(input, zone)
  if (range.end <= now.getTime())
    throw new ApiError('VALIDATION_FAILED', { fieldErrors: [field('body.endDate', 'TIME_OFF_IN_PAST')] })
  const row = await tx
    .insertInto('work.time_off')
    .values({
      staff_user_id: staffUserId,
      starts_at: new Date(range.start),
      ends_at: new Date(range.end),
      time_zone: zone,
      recorded_by: actorId,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  const flagged = await tx
    .selectFrom('work.reservation_flags')
    .select((eb) => eb.fn.countAll<string>().as('n'))
    .where('cause', '=', 'time_off_recorded')
    .where('cause_ref', '=', row.id)
    .executeTakeFirstOrThrow()
  return { id: row.id, range, flagged: Number(flagged.n), zone }
}

/** Withdraws recorded time off (kept, marked withdrawn). Refusals: NOT_FOUND, CONFLICT (TIME_OFF_WITHDRAWN). */
export async function withdrawTimeOff(tx: Tx, actorId: string, timeOffId: string) {
  const row = await tx
    .selectFrom('work.time_off')
    .select(['id', 'staff_user_id', 'withdrawn_at'])
    .where('id', '=', timeOffId)
    .forUpdate()
    .executeTakeFirst()
  if (!row) throw new ApiError('NOT_FOUND')
  if (row.withdrawn_at !== null)
    throw new ApiError('CONFLICT', { fieldErrors: [field('timeOff', 'TIME_OFF_WITHDRAWN')] })
  await tx
    .updateTable('work.time_off')
    .set({ withdrawn_at: sql<Date>`now()`, withdrawn_by: actorId })
    .where('id', '=', row.id)
    .execute()
  return { id: row.id, staffUserId: row.staff_user_id }
}

/** Registers an equipment item. Refusals: CONFLICT (EQUIPMENT_NAME_TAKEN: an active item has the name). */
export async function registerEquipment(tx: Tx, actorId: string, name: string): Promise<{ id: string; name: string }> {
  const clean = name.trim()
  if (clean === '') throw new ApiError('VALIDATION_FAILED', { fieldErrors: [field('body.name', 'required')] })
  await sql`SAVEPOINT equipment_register`.execute(tx)
  try {
    const row = await tx
      .insertInto('work.equipment')
      .values({ name: clean, created_by: actorId })
      .returning(['id', 'name'])
      .executeTakeFirstOrThrow()
    await sql`RELEASE SAVEPOINT equipment_register`.execute(tx)
    return row
  } catch (err) {
    if ((err as { code?: string }).code !== '23505') throw err
    await sql`ROLLBACK TO SAVEPOINT equipment_register`.execute(tx)
    throw new ApiError('CONFLICT', { fieldErrors: [field('body.name', 'EQUIPMENT_NAME_TAKEN')] })
  }
}

/**
 * Retires an item: it is never reserved again; the database flags its upcoming reservations. Refusals: NOT_FOUND,
 * CONFLICT (EQUIPMENT_RETIRED).
 */
export async function retireEquipment(tx: Tx, actorId: string, equipmentId: string) {
  const row = await tx
    .selectFrom('work.equipment')
    .select(['id', 'name', 'retired_at'])
    .where('id', '=', equipmentId)
    .forUpdate()
    .executeTakeFirst()
  if (!row) throw new ApiError('NOT_FOUND')
  if (row.retired_at !== null)
    throw new ApiError('CONFLICT', { fieldErrors: [field('equipment', 'EQUIPMENT_RETIRED')] })
  await tx
    .updateTable('work.equipment')
    .set({ retired_at: sql<Date>`now()`, retired_by: actorId })
    .where('id', '=', row.id)
    .execute()
  const flagged = await tx
    .selectFrom('work.reservation_flags')
    .select((eb) => eb.fn.countAll<string>().as('n'))
    .where('cause', '=', 'equipment_retired')
    .where('cause_ref', '=', row.id)
    .executeTakeFirstOrThrow()
  return { id: row.id, name: row.name, flagged: Number(flagged.n) }
}

/** The reservations and holds overlapping a range, with their visit and flags (for the day view). */
async function reservationsIn(db: Reader, range: Interval) {
  const rows = await db
    .selectFrom('work.reservations as r')
    .innerJoin('work.visits as v', 'v.id', 'r.visit_id')
    .selectAll('r')
    .select(['v.purpose', 'v.state as visit_state', 'v.project_id'])
    .where('r.ended_at', 'is', null)
    .where('r.starts_at', '<', new Date(range.end))
    .where('r.ends_at', '>', new Date(range.start))
    .orderBy('r.starts_at')
    .execute()
  const flags = rows.length
    ? await db
        .selectFrom('work.reservation_flags')
        .select(['reservation_id', 'cause'])
        .where(
          'reservation_id',
          'in',
          rows.map((r) => r.id),
        )
        .execute()
    : []
  return rows.map((r) => ({
    row: toReservation(r),
    view: {
      id: r.id,
      visitId: r.visit_id,
      projectId: r.project_id,
      purpose: r.purpose,
      visitState: r.visit_state,
      kind: r.kind,
      role: r.role,
      startsAt: iso(r.starts_at),
      endsAt: iso(r.ends_at),
      holdExpiresAt: r.hold_expires_at ? iso(r.hold_expires_at) : null,
      flags: [...new Set(flags.filter((f) => f.reservation_id === r.id).map((f) => f.cause))],
    },
  }))
}

/**
 * The capacity of one local day of the business zone: per worker (active staff who may be reserved for some visit)
 * and per active item, what is taken and what is free. Refusals: NOT_CONFIGURED (business.timezone),
 * VALIDATION_FAILED (the date).
 */
export async function capacityDay(db: Reader, date: string) {
  if (!isLocalDate(date))
    throw new ApiError('VALIDATION_FAILED', { fieldErrors: [field('querystring.date', 'DATE_INVALID')] })
  const config = await loadConfig(db)
  const { zone, proposed } = await zoneOf(db)
  const hours = config.get('contact.hours')
  const day = localDay(date, zone)
  const visitHours =
    hours.state === 'CONFIGURED'
      ? intersect(dailyHoursAround({ open: hours.value.open, close: hours.value.close }, day, zone), [day])
      : null
  const users = await db
    .selectFrom('identity.staff_users')
    .select(['id', 'display_name'])
    .where('status', '=', 'active')
    .orderBy('display_name')
    .orderBy('id')
    .execute()
  const roles = await rolesOf(
    db,
    users.map((u) => u.id),
  )
  const workers = users.filter((u) => eligibility(roles.get(u.id) ?? []).estimateVisits)
  const ids = workers.map((w) => w.id)
  const schedules = await schedulesOf(db, ids)
  const off = await timeOffOf(db, ids, day)
  const reservations = await reservationsIn(db, day)
  const items = await db
    .selectFrom('work.equipment')
    .select(['id', 'name'])
    .where('retired_at', 'is', null)
    .orderBy('name')
    .execute()
  return {
    date,
    timeZone: zone,
    timeZoneProposed: proposed,
    visitHours:
      hours.state === 'CONFIGURED'
        ? { open: hours.value.open, close: hours.value.close, periods: (visitHours ?? []).map(span) }
        : null,
    workers: workers.map((w) => {
      const schedule = schedules.get(w.id)
      const mine = reservations.filter((r) => r.row.staffUserId === w.id)
      const offs = off.filter((o) => o.staffUserId === w.id).map((o) => o.range)
      const working = schedule ? intersect(workingIntervalsAround(schedule.periods, day, schedule.zone), [day]) : []
      return {
        id: w.id,
        name: w.display_name,
        roles: roles.get(w.id) ?? [],
        eligibleFor: eligibility(roles.get(w.id) ?? []),
        scheduleVersion: schedule?.version ?? null,
        working: working.map(span),
        timeOff: offs.map(span),
        reservations: mine.map((r) => r.view),
        free: freeOfWorker(
          schedule,
          day,
          offs,
          mine.map((r) => r.row.range),
        ).map(span),
      }
    }),
    equipment: items.map((i) => {
      const mine = reservations.filter((r) => r.row.equipmentId === i.id)
      return {
        id: i.id,
        name: i.name,
        reservations: mine.map((r) => r.view),
        free: subtract(
          [day],
          mine.map((r) => r.row.range),
        ).map(span),
      }
    }),
  }
}
export type CapacityDay = Awaited<ReturnType<typeof capacityDay>>
