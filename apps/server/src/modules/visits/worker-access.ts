// The assigned workers' visit-day data access on one visit and the Owner's temporary extensions (TSK-0128; HH-PKT-08,
// HH-CRM-03, HH-DATA-08, T28, ENT-Visit, ENT-Reservation, ENT-AuditEvent, OWN-DEC-171, OWN-DEC-159, RULE-SERVER-AUTHZ).
//   GET  /staff/visits/:visitId/worker-access                    each assigned worker's visit-day access and every
//                                                                extension (schedule.view_board)
//   POST /staff/visits/:visitId/worker-access/extensions         the Owner extends one assigned worker's access, with
//                                                                a reason and an expiry (visit.extend_worker_access)
//   POST /staff/visit-access-extensions/:extensionId/end         the Owner ends an extension early, with a reason
//                                                                (visit.extend_worker_access)
// - A worker's access is the visit's own local service day in the visit's zone; an extension opens the same access
//   from its grant until its expiry, for one worker on one live visit, tied to that worker's reservation (migration
//   0107). It lapses at once with the assignment (a reassignment, a reschedule, a cancellation, a completed visit or a
//   disabled account): nothing is written then, the next request simply no longer qualifies (packets/access-window.ts).
// - PROPOSED (OQ-WORKER-ACCESS-DETAILS): an extension lasts at most 24 hours from its grant; Office and the Estimator
//   see the access and the extensions (they schedule the visits) but only the Owner grants or ends one; an extension
//   is granted only while the visit is live (confirmed, on the way or arrived).
// - Every grant and end is audited with the visit, the worker, the expiry and the reason; never an address, a phone
//   number or a code.
import type { Db, Tx } from '@handyhub/db'
import {
  ACCESS_EXTENSION_MAX_HOURS,
  ACCESS_EXTENSION_REASON_MAX,
  extensionActive,
  extensionProblem,
  PACKET_VISIT_STATES,
  serviceDayOf,
} from '@handyhub/domain'
import type { StaffActor } from '@handyhub/policy'
import { ApiError } from '../../api/errors.js'
import type { ApiContext, RouteDef } from '../../api/route.js'
import { currentContext } from '../../platform/request-context.js'
import { workerVisitAccess } from '../packets/access-window.js'
import { holdsAction } from './changes.js'
import { VISIT_PARAMS } from './schemas.js'

type Reader = Db | Tx

const TEST = 'test/integration/worker-access.test.ts'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const UUID = { type: 'string', format: 'uuid' } as const
const STR = { type: 'string' } as const
const STR_OR_NULL = { type: ['string', 'null'] } as const
const TIME = { type: 'string', format: 'date-time' } as const
const TIME_OR_NULL = { type: ['string', 'null'], format: 'date-time' } as const
const REASON = { type: 'string', minLength: 1, maxLength: ACCESS_EXTENSION_REASON_MAX } as const

function obj(properties: Record<string, unknown>, nullable = false) {
  return {
    type: nullable ? ['object', 'null'] : 'object',
    additionalProperties: false,
    required: Object.keys(properties),
    properties,
  } as const
}
const arr = (items: unknown) => ({ type: 'array', items }) as const
const STAFF_REF = obj({ id: STR, name: STR_OR_NULL })

export const EXTENSION_STATES = ['active', 'scheduled', 'expired', 'ended', 'lapsed'] as const
export type ExtensionState = (typeof EXTENSION_STATES)[number]

const WORKER_ACCESS_VIEW = obj({
  visitId: STR,
  number: { type: 'integer' },
  purpose: STR,
  state: STR,
  projectReference: STR,
  window: obj({ localDate: STR, start: STR, end: STR, timeZone: STR }),
  // The visit's service day in its zone; null when it cannot be read (an unknown zone opens nothing).
  serviceDay: obj({ startsAt: TIME, endsAt: TIME }, true),
  workers: arr(
    obj({
      staffUserId: STR,
      name: STR_OR_NULL,
      role: STR,
      open: { type: 'boolean' },
      basis: { type: ['string', 'null'], enum: ['visit_day', 'extension', null] },
      endsAt: TIME_OR_NULL,
      opensAt: TIME_OR_NULL,
    }),
  ),
  extensions: arr(
    obj({
      id: STR,
      staffUserId: STR,
      name: STR_OR_NULL,
      state: { type: 'string', enum: [...EXTENSION_STATES] },
      reason: STR,
      grantedBy: STAFF_REF,
      startsAt: TIME,
      expiresAt: TIME,
      endedAt: TIME_OR_NULL,
      endedBy: { anyOf: [{ type: 'null' }, STAFF_REF] },
      endReason: STR_OR_NULL,
    }),
  ),
  maxHours: { type: 'integer' },
  actions: obj({ extend: { type: 'boolean' } }),
})

const EXTEND_BODY = {
  type: 'object',
  additionalProperties: false,
  required: ['staffUserId', 'expiresAt', 'reason'],
  properties: { staffUserId: UUID, expiresAt: TIME, reason: REASON },
} as const
const END_BODY = {
  type: 'object',
  additionalProperties: false,
  required: ['reason'],
  properties: { reason: REASON },
} as const
const EXTENSION_PARAMS = obj({ extensionId: UUID })

const staff = (ctx: ApiContext): StaffActor => {
  if (ctx.actor.kind !== 'staff') throw new ApiError('FORBIDDEN')
  return ctx.actor
}
const visitIdOf = (ctx: ApiContext) => (ctx.req.params as { visitId: string }).visitId
const requestIdOf = (ctx: ApiContext) => (currentContext()?.requestId ?? ctx.req.id).slice(0, 200)
const conflict = (field: string, code: string) =>
  new ApiError('CONFLICT', { fieldErrors: [{ field, code, message: '' }] })

const visitProjectOf: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const { visitId } = req.params as { visitId: string }
  if (!UUID_RE.test(visitId)) return null
  const v = await db.selectFrom('work.visits').select('project_id').where('id', '=', visitId).executeTakeFirst()
  return v ? { projectId: v.project_id } : null
}
const extensionProjectOf: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const { extensionId } = req.params as { extensionId: string }
  if (!UUID_RE.test(extensionId)) return null
  const x = await db
    .selectFrom('work.visit_access_extensions as x')
    .innerJoin('work.visits as v', 'v.id', 'x.visit_id')
    .select('v.project_id')
    .where('x.id', '=', extensionId)
    .executeTakeFirst()
  return x ? { projectId: x.project_id } : null
}

/** How one extension stands now: in force, not started, expired, ended by the Owner, or lapsed with the assignment. */
function stateOf(
  x: { starts_at: Date; expires_at: Date; ended_at: Date | null },
  reservationLive: boolean,
  now: Date,
): ExtensionState {
  if (x.ended_at && x.ended_at.getTime() <= now.getTime()) return 'ended'
  if (x.expires_at.getTime() <= now.getTime()) return 'expired'
  if (!reservationLive) return 'lapsed'
  const e = { startsAt: x.starts_at, expiresAt: x.expires_at, endedAt: x.ended_at }
  return extensionActive(e, now) ? 'active' : 'scheduled'
}

/** The visit's workers, their visit-day access now and every extension recorded on it; null when there is no visit. */
export async function workerAccessView(db: Reader, actor: StaffActor, visitId: string, now = new Date()) {
  const v = await db
    .selectFrom('work.visits as v')
    .innerJoin('crm.projects as p', 'p.id', 'v.project_id')
    .select([
      'v.id',
      'v.number',
      'v.purpose',
      'v.state',
      'v.local_date',
      'v.window_start',
      'v.window_end',
      'v.time_zone',
      'p.reference',
    ])
    .where('v.id', '=', visitId)
    .executeTakeFirst()
  if (!v) return null
  const team = await db
    .selectFrom('work.reservations as r')
    .leftJoin('identity.staff_users as u', 'u.id', 'r.staff_user_id')
    .select(['r.id', 'r.staff_user_id', 'r.role', 'u.display_name'])
    .where('r.visit_id', '=', visitId)
    .where('r.resource', '=', 'worker')
    .where('r.kind', '=', 'confirmed')
    .where('r.ended_at', 'is', null)
    .orderBy('r.role')
    .orderBy('u.display_name')
    .execute()
  const workers = []
  for (const w of team) {
    const id = w.staff_user_id as string
    const [mine] = await workerVisitAccess(db, id, { visitIds: [visitId] }, now)
    const a = mine?.access
    workers.push({
      staffUserId: id,
      name: w.display_name,
      role: w.role ?? 'member',
      open: a?.open === true,
      basis: a?.open ? a.basis : null,
      endsAt: a?.open ? a.endsAt.toISOString() : null,
      opensAt: a && !a.open && a.opensAt ? a.opensAt.toISOString() : null,
    })
  }
  const rows = await db
    .selectFrom('work.visit_access_extensions as x')
    .innerJoin('work.reservations as r', 'r.id', 'x.reservation_id')
    .leftJoin('identity.staff_users as w', 'w.id', 'x.staff_user_id')
    .leftJoin('identity.staff_users as g', 'g.id', 'x.granted_by')
    .leftJoin('identity.staff_users as e', 'e.id', 'x.ended_by')
    .select([
      'x.id',
      'x.staff_user_id',
      'w.display_name as worker_name',
      'x.reason',
      'x.granted_by',
      'g.display_name as granted_by_name',
      'x.starts_at',
      'x.expires_at',
      'x.ended_at',
      'x.ended_by',
      'e.display_name as ended_by_name',
      'x.end_reason',
      'r.ended_at as reservation_ended_at',
    ])
    .where('x.visit_id', '=', visitId)
    .orderBy('x.starts_at', 'desc')
    .orderBy('x.id')
    .execute()
  const live = (PACKET_VISIT_STATES as readonly string[]).includes(v.state)
  const day = serviceDayOf(v.local_date, v.time_zone)
  return {
    visitId: v.id,
    number: v.number,
    purpose: v.purpose,
    state: v.state,
    projectReference: v.reference,
    window: {
      localDate: v.local_date,
      start: v.window_start.slice(0, 5),
      end: v.window_end.slice(0, 5),
      timeZone: v.time_zone,
    },
    serviceDay: day ? { startsAt: day.startsAt.toISOString(), endsAt: day.endsAt.toISOString() } : null,
    workers,
    extensions: rows.map((x) => ({
      id: x.id,
      staffUserId: x.staff_user_id,
      name: x.worker_name,
      state: stateOf(x, live && x.reservation_ended_at === null, now),
      reason: x.reason,
      grantedBy: { id: x.granted_by, name: x.granted_by_name },
      startsAt: x.starts_at.toISOString(),
      expiresAt: x.expires_at.toISOString(),
      endedAt: x.ended_at ? x.ended_at.toISOString() : null,
      endedBy: x.ended_by ? { id: x.ended_by, name: x.ended_by_name } : null,
      endReason: x.end_reason,
    })),
    maxHours: ACCESS_EXTENSION_MAX_HOURS,
    actions: { extend: live && team.length > 0 && holdsAction(actor, 'visit.extend_worker_access') },
  }
}

export function workerAccessRoutes(): RouteDef[] {
  const view: RouteDef = {
    method: 'GET',
    path: '/staff/visits/:visitId/worker-access',
    operationId: 'getVisitWorkerAccess',
    summary: "The assigned workers' visit-day access on a visit",
    description:
      'Staff with schedule.view_board (Owner, Office; Estimator PROPOSED). Each worker assigned to the visit (an ' +
      "active confirmed reservation) with whether their visit-day access is open now: the visit's own local service " +
      "day in the visit's zone (OWN-DEC-171, OWN-DEC-159), or an Owner extension in force, until when, or when the " +
      'visit day opens. Every extension recorded on the visit with its reason, who granted it, its start and expiry and ' +
      'its state (active, scheduled, expired, ended by the Owner with a reason, or lapsed with the assignment), kept as ' +
      'access history. Whether the caller may extend (the Owner, while the visit is live). Never an address, phone or code.',
    actors: ['staff'],
    permission: 'schedule.view_board',
    kind: 'read',
    idempotency: 'none',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'none',
    pagination: false,
    test: TEST,
    resource: visitProjectOf,
    schema: { params: VISIT_PARAMS, response: { 200: WORKER_ACCESS_VIEW } },
    handler: async (ctx) => {
      const body = await workerAccessView(ctx.db, staff(ctx), visitIdOf(ctx))
      if (!body) throw new ApiError('NOT_FOUND')
      return { body, headers: { 'cache-control': 'no-store' } }
    },
  }

  const extend: RouteDef = {
    method: 'POST',
    path: '/staff/visits/:visitId/worker-access/extensions',
    operationId: 'extendWorkerVisitAccess',
    summary: "Extend one assigned worker's visit-day access",
    description:
      'Staff with visit.extend_worker_access (the Owner), with a required reason (OWN-DEC-171: owner-authorized ' +
      'temporary extensions for legitimate operational needs, with a recorded reason and automatic expiration). Opens ' +
      "the worker's visit-day access (the first name, the address, the site contact and the audited code reveal) from " +
      'now until `expiresAt`, which must lie ahead (EXPIRY_IN_PAST) and PROPOSED at most 24 hours away ' +
      '(EXPIRY_TOO_FAR). Only for a worker assigned to the visit right now (NOT_ASSIGNED) while it is live: confirmed, ' +
      'on the way or arrived (VISIT_NOT_LIVE). It lapses at once if the assignment ends (a reassignment, reschedule, ' +
      'cancellation or disabled account) and never bypasses the Start Work gate, holds or any other control. Audited.',
    actors: ['staff'],
    permission: 'visit.extend_worker_access',
    kind: 'write',
    idempotency: 'required',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'visit.extend_worker_access',
    pagination: false,
    test: TEST,
    resource: visitProjectOf,
    schema: { params: VISIT_PARAMS, body: EXTEND_BODY, response: { 201: WORKER_ACCESS_VIEW } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const actor = staff(ctx)
      const visitId = visitIdOf(ctx)
      const body = ctx.req.body as { staffUserId: string; expiresAt: string; reason: string }
      const reason = body.reason.trim()
      if (!reason)
        throw new ApiError('VALIDATION_FAILED', {
          fieldErrors: [{ field: 'body.reason', code: 'required', message: '' }],
        })
      const v = await tx
        .selectFrom('work.visits')
        .select(['id', 'project_id', 'state'])
        .where('id', '=', visitId)
        .forUpdate()
        .executeTakeFirst()
      if (!v) throw new ApiError('NOT_FOUND')
      if (!(PACKET_VISIT_STATES as readonly string[]).includes(v.state)) throw conflict('state', 'VISIT_NOT_LIVE')
      const now = new Date()
      const expiresAt = new Date(body.expiresAt)
      const problem = extensionProblem(expiresAt, now)
      if (problem)
        throw new ApiError('VALIDATION_FAILED', {
          fieldErrors: [{ field: 'body.expiresAt', code: problem, message: '' }],
        })
      const reservation = await tx
        .selectFrom('work.reservations as r')
        .innerJoin('identity.staff_users as u', 'u.id', 'r.staff_user_id')
        .select(['r.id'])
        .where('r.visit_id', '=', visitId)
        .where('r.staff_user_id', '=', body.staffUserId)
        .where('r.resource', '=', 'worker')
        .where('r.kind', '=', 'confirmed')
        .where('r.ended_at', 'is', null)
        .where('u.status', '=', 'active')
        .executeTakeFirst()
      if (!reservation) throw conflict('body.staffUserId', 'NOT_ASSIGNED')
      const row = await tx
        .insertInto('work.visit_access_extensions')
        .values({
          visit_id: visitId,
          reservation_id: reservation.id,
          staff_user_id: body.staffUserId,
          reason,
          granted_by: actor.userId,
          expires_at: expiresAt,
          request_id: requestIdOf(ctx),
        })
        .returning(['id', 'starts_at', 'expires_at'])
        .executeTakeFirstOrThrow()
      await ctx.audit({
        target: { type: 'visit', id: visitId },
        summary: {
          projectId: v.project_id,
          extensionId: row.id,
          staffUserId: body.staffUserId,
          startsAt: row.starts_at.toISOString(),
          expiresAt: row.expires_at.toISOString(),
        },
        reason,
      })
      const view = await workerAccessView(tx, actor, visitId, now)
      return { status: 201, body: view }
    },
  }

  const end: RouteDef = {
    method: 'POST',
    path: '/staff/visit-access-extensions/:extensionId/end',
    operationId: 'endWorkerVisitAccessExtension',
    summary: 'End an extension of a worker visit-day access early',
    description:
      'Staff with visit.extend_worker_access (the Owner), with a required reason. Ends an extension that is still in ' +
      'force or not yet started, at once (EXTENSION_NOT_ACTIVE for one already expired or ended); it stays in the ' +
      "access history with who ended it, when and why. The worker's visit-day access falls back to the visit's own " +
      'local service day on the next request. Audited. Returns the visit’s worker access.',
    actors: ['staff'],
    permission: 'visit.extend_worker_access',
    kind: 'write',
    idempotency: 'required',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'visit.end_worker_access_extension',
    pagination: false,
    test: TEST,
    resource: extensionProjectOf,
    schema: { params: EXTENSION_PARAMS, body: END_BODY, response: { 200: WORKER_ACCESS_VIEW } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const actor = staff(ctx)
      const { extensionId } = ctx.req.params as { extensionId: string }
      const reason = (ctx.req.body as { reason: string }).reason.trim()
      if (!reason)
        throw new ApiError('VALIDATION_FAILED', {
          fieldErrors: [{ field: 'body.reason', code: 'required', message: '' }],
        })
      const x = await tx
        .selectFrom('work.visit_access_extensions')
        .select(['id', 'visit_id', 'staff_user_id', 'expires_at', 'ended_at'])
        .where('id', '=', extensionId)
        .forUpdate()
        .executeTakeFirst()
      if (!x) throw new ApiError('NOT_FOUND')
      const now = new Date()
      if (x.ended_at || x.expires_at.getTime() <= now.getTime()) throw conflict('state', 'EXTENSION_NOT_ACTIVE')
      const ended = await tx
        .updateTable('work.visit_access_extensions')
        .set({ ended_at: now, ended_by: actor.userId, end_reason: reason })
        .where('id', '=', x.id)
        .returning('ended_at')
        .executeTakeFirstOrThrow()
      await ctx.audit({
        target: { type: 'visit', id: x.visit_id },
        summary: {
          extensionId: x.id,
          staffUserId: x.staff_user_id,
          endedAt: (ended.ended_at ?? now).toISOString(),
          expiresAt: x.expires_at.toISOString(),
        },
        reason,
      })
      return { body: await workerAccessView(tx, actor, x.visit_id) }
    },
  }

  return [view, extend, end]
}
