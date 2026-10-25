// Capacity module (TSK-0062; HH-SCH-03, HH-SCH-04, T38, T39, ENT-Reservation, ENT-StaffUser, OWN-DEC-119,
// OWN-DEC-123, RULE-SERVER-AUTHZ).
//   GET  /staff/capacity?date=YYYY-MM-DD             a local day's capacity per worker and item (schedule.view_board)
//   GET  /staff/availability                          working hours, time off and equipment (staff.set_availability)
//   PUT  /staff/workers/:staffUserId/working-hours    a worker's next working-hours version (If-Match)
//   POST /staff/workers/:staffUserId/time-off         record approved time off
//   POST /staff/time-off/:timeOffId/withdraw          withdraw recorded time off
//   POST /staff/equipment                             register an equipment item (equipment.manage, PROPOSED)
//   POST /staff/equipment/:equipmentId/retire         retire an item
//   POST /staff/reservations/:reservationId/flags/dismiss  keep an appointment as it is despite a working-hours or
//                                                     equipment flag (visit.dismiss_flag, PROPOSED; TSK-0151)
// Every write takes an idempotency key and records its audit event. Availability changes flag the upcoming
// reservations they touch for review and never cancel them (OWN-DEC-123). Reservations themselves are made by the
// visit confirmation and window change (modules/visits) through resources.ts.
import type { Tx } from '@handyhub/db'
import { localDateOf, minuteToClock } from '@handyhub/domain'
import { ApiError } from '../../api/errors.js'
import type { ApiContext, ApiModule, RouteDef } from '../../api/route.js'
import {
  availabilityView,
  capacityDay,
  recordTimeOff,
  registerEquipment,
  retireEquipment,
  setWorkingHours,
  withdrawTimeOff,
  type PeriodInput,
  type TimeOffInput,
} from './availability.js'
import { dismissFlags, openFlagsOf } from './flags.js'
import {
  AVAILABILITY,
  AVAILABILITY_CHANGE,
  CAPACITY_DAY,
  DAY_QUERY,
  DISMISS_FLAG_BODY,
  EQUIPMENT_BODY,
  EQUIPMENT_PARAMS,
  FLAG_DISMISSED,
  RESERVATION_PARAMS,
  STAFF_PARAMS,
  TIME_OFF_BODY,
  TIME_OFF_PARAMS,
  WORKING_HOURS_BODY,
} from './schemas.js'

const TEST = 'test/integration/capacity.test.ts'

const staffActor = (ctx: ApiContext) => {
  if (ctx.actor.kind !== 'staff') throw new ApiError('FORBIDDEN')
  return ctx.actor
}

const write = {
  actors: ['staff'],
  kind: 'write',
  idempotency: 'required',
  rateLimit: 'none',
  pagination: false,
  test: TEST,
} as const

async function changed(ctx: ApiContext, flagged: number) {
  return { flagged, availability: await availabilityView(ctx.tx as Tx, new Date()) }
}

export function capacityModule(): ApiModule {
  const day: RouteDef = {
    method: 'GET',
    path: '/staff/capacity',
    operationId: 'getCapacityDay',
    summary: "A day's capacity per worker and item",
    description:
      'Staff with schedule.view_board (Owner, Office; Estimator PROPOSED). One local day of the business zone ' +
      '(NOT CONFIGURED while business.timezone is unset): the visit hours (contact.hours), then each active staff ' +
      'member who may be reserved for a visit (PROPOSED: Worker or Owner for work visits, also Estimator for estimate ' +
      'visits) with their working periods (empty when the Owner never set hours), approved time off, reservations and ' +
      'holds (each with its visit, kind, role and review flags; a hold is never a booking) and the free periods left; ' +
      'then each active equipment item with its reservations and free periods. A two-person visit is on both workers.',
    actors: ['staff'],
    permission: 'schedule.view_board',
    kind: 'read',
    idempotency: 'none',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'none',
    pagination: false,
    test: TEST,
    schema: { querystring: DAY_QUERY, response: { 200: CAPACITY_DAY } },
    handler: async (ctx) => {
      staffActor(ctx)
      const { date } = ctx.req.query as { date: string }
      return { body: await capacityDay(ctx.db, date) }
    },
  }

  const availability: RouteDef = {
    method: 'GET',
    path: '/staff/availability',
    operationId: 'getAvailability',
    summary: 'Working hours, time off and equipment',
    description:
      'Owner only (staff.set_availability). Every staff member who is not disabled, with roles, whether they may be ' +
      'reserved for estimate and work visits (PROPOSED), the working-hours version in force (local to the business ' +
      'zone; null while never set: that person is not reserved) and upcoming approved time off; and the active ' +
      'equipment items. No reason is kept for time off.',
    actors: ['staff'],
    permission: 'staff.set_availability',
    kind: 'read',
    idempotency: 'none',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'none',
    pagination: false,
    test: TEST,
    schema: { response: { 200: AVAILABILITY } },
    handler: async (ctx) => {
      staffActor(ctx)
      return { body: await availabilityView(ctx.db, new Date()) }
    },
  }

  const hours: RouteDef = {
    ...write,
    method: 'PUT',
    path: '/staff/workers/:staffUserId/working-hours',
    operationId: 'setWorkingHours',
    summary: "Set a worker's working days and hours",
    description:
      'Owner only (staff.set_availability), with If-Match: the working-hours version shown ("0" when none was set). ' +
      'Records the next version: the periods of each ISO weekday (1 Monday to 7 Sunday) as HH:MM local times of the ' +
      'business zone (24:00 ends the day), without overlaps; an empty list means no working days. Upcoming ' +
      'reservations the new hours no longer cover are flagged for review, never cancelled. Refusals: NOT_FOUND, ' +
      'STALE_VERSION, CONFLICT (ACCOUNT_DISABLED), NOT_CONFIGURED (business.timezone), VALIDATION_FAILED.',
    permission: 'staff.set_availability',
    expectedVersion: 'required',
    audit: 'staff.set_working_hours',
    schema: { params: STAFF_PARAMS, body: WORKING_HOURS_BODY, response: { 200: AVAILABILITY_CHANGE } },
    handler: async (ctx) => {
      const actor = staffActor(ctx)
      const { staffUserId } = ctx.req.params as { staffUserId: string }
      const body = ctx.req.body as { periods: PeriodInput[]; reason?: string }
      const out = await setWorkingHours(ctx.tx as Tx, actor.userId, staffUserId, body, {
        expectedVersion: ctx.expectedVersion(),
        now: new Date(),
      })
      const reason = body.reason?.trim()
      await ctx.audit({
        target: { type: 'staff_user', id: staffUserId, version: out.version },
        summary: {
          scheduleVersion: out.version,
          periods: out.periods.map((p) => ({
            weekday: p.weekday,
            start: minuteToClock(p.startMinute),
            end: minuteToClock(p.endMinute),
          })),
          flagged: out.flagged,
        },
        ...(reason ? { reason } : {}),
      })
      return { body: await changed(ctx, out.flagged), version: out.version }
    },
  }

  const timeOff: RouteDef = {
    ...write,
    method: 'POST',
    path: '/staff/workers/:staffUserId/time-off',
    operationId: 'recordTimeOff',
    summary: 'Record approved time off',
    description:
      'Owner only (staff.set_availability). Approved time off from a local date (and optional time) to a local date ' +
      '(and optional time) of the business zone; without times, whole days. PROPOSED: it ends in the future and lasts ' +
      'at most 366 days. No reason is kept. The upcoming reservations it overlaps are flagged for review in the same ' +
      'transaction, never cancelled. Refusals: NOT_FOUND, CONFLICT (ACCOUNT_DISABLED), NOT_CONFIGURED, ' +
      'VALIDATION_FAILED (TIME_OFF_ORDER, TIME_OFF_IN_PAST, TIME_OFF_TOO_LONG).',
    permission: 'staff.set_availability',
    expectedVersion: 'none',
    audit: 'staff.record_time_off',
    schema: { params: STAFF_PARAMS, body: TIME_OFF_BODY, response: { 201: AVAILABILITY_CHANGE } },
    handler: async (ctx) => {
      const actor = staffActor(ctx)
      const { staffUserId } = ctx.req.params as { staffUserId: string }
      const out = await recordTimeOff(ctx.tx as Tx, actor.userId, staffUserId, ctx.req.body as TimeOffInput, new Date())
      await ctx.audit({
        target: { type: 'time_off', id: out.id },
        summary: {
          staffUserId,
          startsAt: new Date(out.range.start).toISOString(),
          endsAt: new Date(out.range.end).toISOString(),
          localStart: localDateOf(new Date(out.range.start), out.zone),
          timeZone: out.zone,
          flagged: out.flagged,
        },
      })
      return { status: 201, body: await changed(ctx, out.flagged) }
    },
  }

  const withdraw: RouteDef = {
    ...write,
    method: 'POST',
    path: '/staff/time-off/:timeOffId/withdraw',
    operationId: 'withdrawTimeOff',
    summary: 'Withdraw recorded time off',
    description:
      'Owner only (staff.set_availability). Marks the time off withdrawn (it is kept); the worker is available again ' +
      'in their working hours. Refusals: NOT_FOUND, CONFLICT (TIME_OFF_WITHDRAWN).',
    permission: 'staff.set_availability',
    expectedVersion: 'none',
    audit: 'staff.withdraw_time_off',
    schema: { params: TIME_OFF_PARAMS, response: { 200: AVAILABILITY_CHANGE } },
    handler: async (ctx) => {
      const actor = staffActor(ctx)
      const { timeOffId } = ctx.req.params as { timeOffId: string }
      const out = await withdrawTimeOff(ctx.tx as Tx, actor.userId, timeOffId)
      await ctx.audit({ target: { type: 'time_off', id: out.id }, summary: { staffUserId: out.staffUserId } })
      return { body: await changed(ctx, 0) }
    },
  }

  const register: RouteDef = {
    ...write,
    method: 'POST',
    path: '/staff/equipment',
    operationId: 'registerEquipment',
    summary: 'Register an equipment item',
    description:
      'Owner only (equipment.manage, PROPOSED in the availability row). Registers one item that visits reserve, by ' +
      'name (unique among active items, case-insensitive). Refusals: CONFLICT (EQUIPMENT_NAME_TAKEN).',
    permission: 'equipment.manage',
    expectedVersion: 'none',
    audit: 'equipment.register',
    schema: { body: EQUIPMENT_BODY, response: { 201: AVAILABILITY_CHANGE } },
    handler: async (ctx) => {
      const actor = staffActor(ctx)
      const out = await registerEquipment(ctx.tx as Tx, actor.userId, (ctx.req.body as { name: string }).name)
      await ctx.audit({ target: { type: 'equipment', id: out.id }, summary: { name: out.name } })
      return { status: 201, body: await changed(ctx, 0) }
    },
  }

  const retire: RouteDef = {
    ...write,
    method: 'POST',
    path: '/staff/equipment/:equipmentId/retire',
    operationId: 'retireEquipment',
    summary: 'Retire an equipment item',
    description:
      'Owner only (equipment.manage, PROPOSED). The item is kept and never reserved again; its upcoming reservations ' +
      'are flagged for review in the same transaction, never cancelled. Refusals: NOT_FOUND, CONFLICT ' +
      '(EQUIPMENT_RETIRED).',
    permission: 'equipment.manage',
    expectedVersion: 'none',
    audit: 'equipment.retire',
    schema: { params: EQUIPMENT_PARAMS, response: { 200: AVAILABILITY_CHANGE } },
    handler: async (ctx) => {
      const actor = staffActor(ctx)
      const { equipmentId } = ctx.req.params as { equipmentId: string }
      const out = await retireEquipment(ctx.tx as Tx, actor.userId, equipmentId)
      await ctx.audit({ target: { type: 'equipment', id: out.id }, summary: { name: out.name, flagged: out.flagged } })
      return { body: await changed(ctx, out.flagged) }
    },
  }

  const dismiss: RouteDef = {
    ...write,
    method: 'POST',
    path: '/staff/reservations/:reservationId/flags/dismiss',
    operationId: 'dismissReservationFlag',
    test: 'test/integration/staff-management.test.ts',
    summary: 'Keep an appointment as it is despite a flag',
    description:
      'Owner only, with a written reason (visit.dismiss_flag, PROPOSED in the availability row; TSK-0151, ' +
      'OWN-DEC-200 H7). Dismisses every open flag of the cause on the upcoming reservation: a working-hours or ' +
      'equipment flag is discretionary. A time-off flag (employee protection) or a disabled-account flag is a ' +
      'mandatory restriction and is never waived by an override (CONFLICT MANDATORY_RESTRICTION). The visit and its ' +
      "reservation stay as they are; the visit's action-queue item is updated, or resolved when nothing else flags " +
      'it. A dismissal never touches the Start Work gate or a hold. Refusals: NOT_FOUND, CONFLICT ' +
      '(MANDATORY_RESTRICTION, FLAG_NOT_OPEN, RESERVATION_ENDED), VALIDATION_FAILED (reason).',
    permission: 'visit.dismiss_flag',
    expectedVersion: 'none',
    audit: 'visit.dismiss_flag',
    schema: { params: RESERVATION_PARAMS, body: DISMISS_FLAG_BODY, response: { 200: FLAG_DISMISSED } },
    handler: async (ctx) => {
      const actor = staffActor(ctx)
      const { reservationId } = ctx.req.params as { reservationId: string }
      const body = ctx.req.body as { cause: string; reason: string }
      const out = await dismissFlags(ctx.tx as Tx, { actorId: actor.userId, reservationId, ...body })
      await ctx.audit({
        target: { type: 'visit', id: out.visitId },
        summary: { reservationId, cause: body.cause, dismissed: out.dismissed },
        reason: body.reason.trim(),
      })
      return {
        body: {
          reservationId,
          visitId: out.visitId,
          dismissed: out.dismissed,
          flags: await openFlagsOf(ctx.tx as Tx, reservationId),
        },
      }
    },
  }

  return { name: 'capacity', routes: [day, availability, hours, timeOff, withdraw, register, retire, dismiss] }
}

export {
  ESTIMATE_VISIT_ROLES,
  WORK_VISIT_ROLES,
  capacitySettings,
  evaluate,
  insertReservations,
  refuse,
  type ReservationRequest,
} from './resources.js'
