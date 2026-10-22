// The scheduling board on the server (TSK-0065; HH-SCH-13, HH-OPS-03, S05, ENT-Visit, ENT-Reservation, ENT-StaffUser,
// OWN-DEC-119, OWN-DEC-123, RULE-SERVER-AUTHZ, RULE-SAFETY-GATES).
// - One read for the board: a local day or a week (PROPOSED: Monday to Sunday, ISO weeks) of the business zone, with
//   every worker who may be reserved for a visit (the capacity module's eligibility) and, per day, their working
//   periods, approved time off, the reservations and holds they carry (a two-person visit is on both workers; a hold is
//   never a booking) and the free time left (the remaining capacity, from the worker's own working hours only: nothing
//   is assumed for a worker whose hours are not set). Visits that reserve no worker yet are listed apart, by day.
// - Each visit of the range once: purpose (an Estimate visit is told apart from work visits), state, version, the
//   arrival window with its zone, the expected work, the staff-entered travel and preparation buffers (never invented:
//   empty stays "not entered"), the workers it needs and its team, whether its windows are offered, what still stops
//   its confirmation (TSK-0064) and the actions the caller may take (visits.ts visitActions, the same rules as the
//   project's visits). The board writes nothing itself: Move, Confirm and Offer windows are the existing visit writes,
//   each with its expected version, idempotency key and every server check (preconditions, the deposit gate, holds,
//   capacity), so dragging is never a way around them.
// - The visit to open (visitId, a queue item's link) chooses the date: the local date of its window in the business
//   zone; a visit outside the caller's data scope is NOT_FOUND.
// NOT CONFIGURED while business.timezone is unset.
import type { Db, Tx } from '@handyhub/db'
import {
  addLocalDays,
  intersect,
  isLocalDate,
  isoWeekday,
  isTimeZone,
  localDateOf,
  localDay,
  reservedRange,
  workingIntervalsAround,
  type Interval,
} from '@handyhub/domain'
import { scopeIncludesProject, type DataScope, type StaffActor } from '@handyhub/policy'
import { ApiError, type FieldError } from '../../api/errors.js'
import { loadConfig } from '../../platform/config/index.js'
import { eligibility } from '../capacity/availability.js'
import { freeOfWorker, rolesOf, schedulesOf, timeOffOf } from '../capacity/resources.js'
import { changeFacts } from './changes.js'
import { WORK_VISIT_GATES, type WorkVisitGate } from './gates.js'
import { windowOfferPolicy } from './offers.js'
import {
  businessZone,
  confirmationBlockers,
  factsOf,
  staffNames,
  storedWindow,
  visitActions,
  visitHoursOf,
  windowView,
  type ActionContext,
} from './visits.js'

type Reader = Db | Tx

export const BOARD_VIEWS = ['day', 'week'] as const
export type BoardView = (typeof BOARD_VIEWS)[number]

/** The visit states the board shows: every visit still planned, booked or done; expired and canceled ones are not. */
export const BOARD_VISIT_STATES = ['tentative', 'confirmed', 'en_route', 'arrived', 'completed', 'no_access'] as const

const field = (f: string, code: string): FieldError => ({ field: f, code, message: '' })
const iso = (ms: number | Date) => new Date(ms).toISOString()
const span = (i: Interval) => ({ startsAt: iso(i.start), endsAt: iso(i.end) })
const minutesOf = (list: readonly Interval[]) => Math.round(list.reduce((n, i) => n + (i.end - i.start), 0) / 60_000)
const overlaps = (a: Interval, b: Interval) => a.start < b.end && b.start < a.end

/** The local days a view shows around a date: the day itself, or its week (PROPOSED: Monday first). */
export function boardDays(date: string, view: BoardView): string[] {
  if (view === 'day') return [date]
  const monday = addLocalDays(date, 1 - isoWeekday(date))
  return [0, 1, 2, 3, 4, 5, 6].map((n) => addLocalDays(monday, n))
}

export type BoardQuery = { readonly date?: string; readonly view?: BoardView; readonly visitId?: string }

/**
 * The scheduling board of a day or a week. Refusals: NOT_CONFIGURED (business.timezone), VALIDATION_FAILED (the date),
 * NOT_FOUND (the visit to open is unknown or outside the caller's data scope).
 */
export async function scheduleBoard(
  db: Reader,
  actor: StaffActor,
  scope: DataScope,
  query: BoardQuery,
  deps: { gates?: readonly WorkVisitGate[]; now?: Date } = {},
) {
  const gates = deps.gates ?? WORK_VISIT_GATES
  const now = deps.now ?? new Date()
  const view: BoardView = query.view ?? 'day'
  const config = await loadConfig(db)
  const business = businessZone(config)
  const zone = business.zone
  let date = query.date
  let focus: string | null = null
  if (query.visitId !== undefined) {
    const v = await db
      .selectFrom('work.visits')
      .select(['id', 'project_id', 'starts_at'])
      .where('id', '=', query.visitId)
      .executeTakeFirst()
    if (!v || !scopeIncludesProject(scope, v.project_id)) throw new ApiError('NOT_FOUND')
    focus = v.id
    date = localDateOf(new Date(v.starts_at), zone)
  }
  date = date ?? localDateOf(now, zone)
  if (!isLocalDate(date))
    throw new ApiError('VALIDATION_FAILED', { fieldErrors: [field('querystring.date', 'DATE_INVALID')] })
  const days = boardDays(date, view)
  const dayRanges = days.map((d) => ({ date: d, range: localDay(d, zone) }))
  const range: Interval = {
    start: (dayRanges[0] as (typeof dayRanges)[number]).range.start,
    end: (dayRanges[dayRanges.length - 1] as (typeof dayRanges)[number]).range.end,
  }
  const hours = visitHoursOf(config)
  const offerPolicy = (() => {
    try {
      return windowOfferPolicy(config)
    } catch {
      return null
    }
  })()

  // The workers: every active staff member who may be reserved for some visit (capacity eligibility).
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
  const workerIds = workers.map((w) => w.id)
  const schedules = await schedulesOf(db, workerIds)
  const off = await timeOffOf(db, workerIds, range)

  // The visits of the range: their window lies in it, or one of their active reservations or holds does.
  const visits = (
    await db
      .selectFrom('work.visits as v')
      .innerJoin('crm.projects as p', 'p.id', 'v.project_id')
      .innerJoin('crm.properties as pr', 'pr.id', 'v.property_id')
      .selectAll('v')
      .select(['p.reference as project_reference', 'pr.time_zone as property_zone'])
      .where('v.state', 'in', [...BOARD_VISIT_STATES])
      .where((eb) =>
        eb.or([
          eb.and([eb('v.starts_at', '<', new Date(range.end)), eb('v.ends_at', '>', new Date(range.start))]),
          eb.exists(
            eb
              .selectFrom('work.reservations as r')
              .select('r.id')
              .whereRef('r.visit_id', '=', 'v.id')
              .where('r.ended_at', 'is', null)
              .where('r.starts_at', '<', new Date(range.end))
              .where('r.ends_at', '>', new Date(range.start)),
          ),
        ]),
      )
      .orderBy('v.starts_at')
      .orderBy('v.created_at')
      .orderBy('v.id')
      .execute()
  ).filter((v) => scopeIncludesProject(scope, v.project_id))
  const visitIds = visits.map((v) => v.id)
  const reservations = visitIds.length
    ? await db
        .selectFrom('work.reservations as r')
        .leftJoin('work.equipment as e', 'e.id', 'r.equipment_id')
        .selectAll('r')
        .select('e.name as equipment_name')
        .where('r.visit_id', 'in', visitIds)
        .where('r.ended_at', 'is', null)
        .orderBy('r.starts_at')
        .orderBy('r.role')
        .orderBy('r.id')
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
        .execute()
    : []
  const flagsOf = (id: string) => [...new Set(flags.filter((f) => f.reservation_id === id).map((f) => f.cause))]
  const openOffers = new Set(
    visitIds.length
      ? (
          await db
            .selectFrom('work.window_offers')
            .select('visit_id')
            .where('visit_id', 'in', visitIds)
            .where('state', '=', 'open')
            .execute()
        ).map((o) => o.visit_id)
      : [],
  )
  const projectIds = [...new Set(visits.map((v) => v.project_id))]
  const requests = projectIds.length
    ? await db
        .selectFrom('intake.requests')
        .select(['id', 'project_id'])
        .where('project_id', 'in', projectIds)
        .orderBy('submitted_at')
        .orderBy('id')
        .execute()
    : []
  const requestOf = new Map<string, string>()
  for (const r of requests) if (!requestOf.has(r.project_id)) requestOf.set(r.project_id, r.id)
  const names = await staffNames(db, [
    ...reservations.flatMap((r) => (r.staff_user_id ? [r.staff_user_id] : [])),
    ...workerIds,
  ])
  const ref = (id: string) => names.get(id) ?? { id, name: null }

  const actionContext = (propertyZone: string | null): ActionContext => ({
    actor,
    business: true,
    hours: hours !== null,
    offerPolicy: offerPolicy !== null,
    zoneKnown: isTimeZone(propertyZone),
  })
  // TSK-0066: each visit's open change request and, for a confirmed visit the caller may cancel, the outcome preview.
  const change = await changeFacts(db, actor, visits, (ids) => staffNames(db, ids), now)
  const boardVisits = []
  for (const v of visits) {
    const blockers =
      v.state === 'tentative' ? await confirmationBlockers(db, v, hours, zone, gates, now) : ([] as FieldError[])
    const mine = reservations.filter((r) => r.visit_id === v.id)
    boardVisits.push({
      id: v.id,
      number: v.number,
      projectId: v.project_id,
      projectReference: v.project_reference,
      requestId: requestOf.get(v.project_id) ?? null,
      purpose: v.purpose,
      state: v.state,
      version: v.version,
      window: windowView(storedWindow(v), hours, zone),
      windowVersion: v.window_version,
      expectedDurationMinutes: v.expected_duration_minutes,
      preparationBufferMinutes: v.preparation_buffer_minutes,
      travelBufferMinutes: v.travel_buffer_minutes,
      requiredWorkers: v.required_workers,
      equipment: v.equipment,
      reservedRange:
        v.expected_duration_minutes === null ? null : span(reservedRange(storedWindow(v), factsOf(v)) as Interval),
      team: mine
        .filter((r) => r.staff_user_id !== null)
        .map((r) => ({
          worker: ref(r.staff_user_id as string),
          role: r.role,
          kind: r.kind,
          startsAt: iso(r.starts_at),
          endsAt: iso(r.ends_at),
          holdExpiresAt: r.hold_expires_at ? iso(r.hold_expires_at) : null,
          flags: flagsOf(r.id),
        })),
      items: mine
        .filter((r) => r.equipment_id !== null)
        .map((r) => ({ id: r.equipment_id as string, name: r.equipment_name ?? '', kind: r.kind })),
      openOffer: openOffers.has(v.id),
      changeRequest: change.requests.get(v.id) ?? null,
      cancellationPreview: change.previews.get(v.id) ?? null,
      confirmationBlockers: v.state === 'tentative' ? blockers.map((b) => ({ field: b.field, code: b.code })) : null,
      actions: visitActions(actionContext(v.property_zone), v, openOffers.has(v.id), blockers),
    })
  }

  const workerRows = reservations.filter((r) => r.staff_user_id !== null)
  return {
    view,
    date,
    days,
    previous: addLocalDays(date, view === 'day' ? -1 : -7),
    next: addLocalDays(date, view === 'day' ? 1 : 7),
    timeZone: zone,
    timeZoneProposed: business.proposed,
    visitHours: hours,
    windowOffers: offerPolicy
      ? {
          holdHours: offerPolicy.policy.holdHours,
          minWindows: offerPolicy.policy.minWindows,
          maxWindows: offerPolicy.policy.maxWindows,
          proposed: offerPolicy.proposed,
        }
      : null,
    focusVisitId: focus,
    workers: workers.map((w) => {
      const schedule = schedules.get(w.id)
      const mine = workerRows.filter((r) => r.staff_user_id === w.id)
      return {
        id: w.id,
        name: w.display_name,
        eligibleFor: eligibility(roles.get(w.id) ?? []),
        scheduleVersion: schedule?.version ?? null,
        days: dayRanges.map(({ date: d, range: day }) => {
          const offs = off.filter((o) => o.staffUserId === w.id && overlaps(o.range, day)).map((o) => o.range)
          const busy = mine
            .map((r) => ({
              row: r,
              range: { start: new Date(r.starts_at).getTime(), end: new Date(r.ends_at).getTime() },
            }))
            .filter((r) => overlaps(r.range, day))
          const working = schedule ? intersect(workingIntervalsAround(schedule.periods, day, schedule.zone), [day]) : []
          const free = freeOfWorker(
            schedule,
            day,
            offs,
            busy.map((b) => b.range),
          )
          return {
            date: d,
            working: working.map(span),
            timeOff: intersect(offs, [day]).map(span),
            free: free.map(span),
            workingMinutes: minutesOf(working),
            freeMinutes: minutesOf(free),
            entries: busy.map(({ row: r }) => ({
              reservationId: r.id,
              visitId: r.visit_id,
              kind: r.kind,
              role: r.role,
              startsAt: iso(r.starts_at),
              endsAt: iso(r.ends_at),
              holdExpiresAt: r.hold_expires_at ? iso(r.hold_expires_at) : null,
              flags: flagsOf(r.id),
            })),
          }
        }),
      }
    }),
    // Visits that reserve no worker yet (planned, tentative), by the local date of their window.
    unassigned: days.map((d) => ({
      date: d,
      visitIds: visits
        .filter((v) => v.local_date === d && !workerRows.some((r) => r.visit_id === v.id))
        .map((v) => v.id),
    })),
    visits: boardVisits,
  }
}
export type ScheduleBoard = Awaited<ReturnType<typeof scheduleBoard>>
