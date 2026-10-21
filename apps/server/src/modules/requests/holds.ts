// Intake review holds (TSK-0043; HH-LEAD-04, HH-LEAD-02, ENT-Hold, HH-WORK-02, OWN-DEC-82, OWN-DEC-137,
// RULE-SAFETY-GATES, RULE-HUMAN-REVIEW).
//
// - The hazard flag: a qualification whose risk flags need attention names the potential hazards or restricted scope
//   found. Each newly flagged category opens one review hold on the request, in the same transaction as the
//   qualification. Nobody, AI included, declares the site safe: a later qualification that no longer lists a hazard
//   clears nothing, and only a recorded resolution (how, and who reviewed it) or a cancellation as entered in error
//   ends a hold.
// - A hold that is open or under review blocks the estimate path (Prepare Online Estimate, Arrange Estimate Visit and
//   the estimate's publication); Ask a Question and Not a Fit stay open. `blockingHolds` is the read that scheduling
//   and Start Work use later on the same table.
// - One review_hold queue item per request while any of its review holds blocks, in the safety band; a closed request
//   keeps its holds as history and leaves the queue.
// - PROPOSED permissions: starting a review is job_hold.set (Owner, Office, Estimator P), resolving and cancelling are
//   job_hold.set_ready (Owner only), the Owner's control of job-level Hold / Ready (OWN-DEC-82, OWN-DEC-137).
import type { Db, Tx } from '@handyhub/db'
import {
  apply,
  BLOCKING_HOLD_STATES,
  HAZARD_CATEGORIES,
  type HazardCategory,
  type HoldState,
  newlyFlaggedHazards,
  type Qualification,
  REQUEST_CLOSED_STATES,
} from '@handyhub/domain'
import { decide, type Actor } from '@handyhub/policy'
import { sql } from 'kysely'
import { ApiError } from '../../api/errors.js'
import type { ApiContext, RouteDef } from '../../api/route.js'
import { openQueueItem, resolveQueueItem } from '../queue/index.js'

type Reader = Db | Tx

/** Opens one review hold per newly flagged hazard of a qualification revision. Returns the new hold ids. */
export async function openFlaggedHolds(
  tx: Tx,
  input: {
    requestId: string
    projectId: string
    previous: Qualification | null
    current: Qualification
    revision: number
    staffId: string
  },
): Promise<string[]> {
  const fresh = newlyFlaggedHazards(input.previous, input.current)
  if (fresh.length === 0) return []
  const note = (input.current.risk_flags?.note ?? '').trim()
  const rows = await tx
    .insertInto('work.holds')
    .values(
      fresh.map((category: HazardCategory) => ({
        kind: 'review',
        scope_type: 'request',
        scope_id: input.requestId,
        project_id: input.projectId,
        request_id: input.requestId,
        category,
        note,
        source: 'qualification',
        source_ref: `qualification:${input.revision}`,
        raised_by: input.staffId,
      })),
    )
    .returning('id')
    .execute()
  await syncReviewHoldItem(tx, input.requestId)
  return rows.map((r) => r.id)
}

/** How many review holds on a request block (open or under review). */
export async function blockingReviewHolds(db: Reader, requestId: string): Promise<number> {
  const r = await db
    .selectFrom('work.holds')
    .select(sql<number>`count(*)::int`.as('n'))
    .where('kind', '=', 'review')
    .where('scope_type', '=', 'request')
    .where('scope_id', '=', requestId)
    .where('state', 'in', [...BLOCKING_HOLD_STATES])
    .executeTakeFirstOrThrow()
  return r.n
}

/** Every blocking hold of a project (all kinds and scopes): the read scheduling and Start Work use (HH-SCH-06). */
export async function blockingHolds(db: Reader, projectId: string) {
  return db
    .selectFrom('work.holds')
    .select(['id', 'kind', 'scope_type', 'scope_id', 'category', 'state'])
    .where('project_id', '=', projectId)
    .where('state', 'in', [...BLOCKING_HOLD_STATES])
    .orderBy('raised_at')
    .execute()
}

/** One review_hold item per request while a review hold blocks and the request is open. */
export async function syncReviewHoldItem(tx: Tx, requestId: string): Promise<'open' | 'resolved'> {
  const request = await tx
    .selectFrom('intake.requests')
    .select(['id', 'state', 'reference', 'project_id', 'responsible_staff_id'])
    .where('id', '=', requestId)
    .executeTakeFirstOrThrow()
  const closed = (REQUEST_CLOSED_STATES as readonly string[]).includes(request.state)
  const blocking = await blockingReviewHolds(tx, requestId)
  if (blocking === 0 || closed) {
    await resolveQueueItem(tx, {
      type: 'review_hold',
      subjectId: requestId,
      resolution: blocking === 0 ? 'holds_cleared' : 'request_closed',
    })
    return 'resolved'
  }
  const first = await tx
    .selectFrom('work.holds')
    .select('raised_at')
    .where('scope_type', '=', 'request')
    .where('scope_id', '=', requestId)
    .where('state', 'in', [...BLOCKING_HOLD_STATES])
    .orderBy('raised_at')
    .limit(1)
    .executeTakeFirstOrThrow()
  await openQueueItem(tx, {
    type: 'review_hold',
    subjectId: requestId,
    reason: 'review_hold',
    projectId: request.project_id,
    reference: request.reference,
    status: request.state,
    assignedStaffId: request.responsible_staff_id,
    openedAt: first.raised_at,
  })
  return 'open'
}

const allowed = (actor: Actor, action: 'job_hold.set' | 'job_hold.set_ready', projectId: string) =>
  decide(actor, action, { projectId }, { now: new Date(), online: true }).effect === 'allow'

export type HoldView = {
  id: string
  kind: string
  category: string
  note: string
  state: HoldState
  version: number
  raisedBy: { id: string; name: string | null }
  raisedAt: string
  reviewStartedBy: { id: string; name: string | null } | null
  reviewStartedAt: string | null
  resolutionNote: string | null
  reviewer: string | null
  resolvedBy: { id: string; name: string | null } | null
  resolvedAt: string | null
  cancelReason: string | null
  canceledBy: { id: string; name: string | null } | null
  canceledAt: string | null
  actions: { startReview: boolean; resolve: boolean; cancel: boolean }
}

/** The request's holds, oldest first, with what this caller may do to each now. */
export async function requestHolds(db: Reader, requestId: string, actor: Actor): Promise<HoldView[]> {
  const rows = await db
    .selectFrom('work.holds')
    .selectAll()
    .where('scope_type', '=', 'request')
    .where('scope_id', '=', requestId)
    .orderBy('raised_at')
    .orderBy(sql`array_position(${sql.lit(`{${HAZARD_CATEGORIES.join(',')}}`)}::text[], category)`)
    .orderBy('id')
    .execute()
  const ids = [
    ...new Set(
      rows.flatMap((r) => [r.raised_by, r.review_started_by, r.resolved_by, r.canceled_by]).filter((x) => x !== null),
    ),
  ] as string[]
  const names = ids.length
    ? new Map(
        (
          await db.selectFrom('identity.staff_users').select(['id', 'display_name']).where('id', 'in', ids).execute()
        ).map((s) => [s.id, s.display_name]),
      )
    : new Map<string, string | null>()
  const ref = (id: string | null) => (id ? { id, name: names.get(id) ?? null } : null)
  const iso = (d: Date | null) => (d ? d.toISOString() : null)
  return rows.map((r) => {
    const set = allowed(actor, 'job_hold.set', r.project_id)
    const ready = allowed(actor, 'job_hold.set_ready', r.project_id)
    return {
      id: r.id,
      kind: r.kind,
      category: r.category,
      note: r.note,
      state: r.state as HoldState,
      version: r.version,
      raisedBy: ref(r.raised_by) as { id: string; name: string | null },
      raisedAt: r.raised_at.toISOString(),
      reviewStartedBy: ref(r.review_started_by),
      reviewStartedAt: iso(r.review_started_at),
      resolutionNote: r.resolution_note,
      reviewer: r.reviewer,
      resolvedBy: ref(r.resolved_by),
      resolvedAt: iso(r.resolved_at),
      cancelReason: r.cancel_reason,
      canceledBy: ref(r.canceled_by),
      canceledAt: iso(r.canceled_at),
      actions: {
        startReview: set && r.state === 'open',
        resolve: ready && r.state === 'under_review',
        cancel: ready && (r.state === 'open' || r.state === 'under_review'),
      },
    }
  })
}

const STAFF_REF = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'name'],
  properties: { id: { type: 'string' }, name: { type: ['string', 'null'] } },
} as const
const NULLABLE_STAFF = { anyOf: [{ type: 'null' }, STAFF_REF] } as const

export const HOLD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'kind',
    'category',
    'note',
    'state',
    'version',
    'raisedBy',
    'raisedAt',
    'reviewStartedBy',
    'reviewStartedAt',
    'resolutionNote',
    'reviewer',
    'resolvedBy',
    'resolvedAt',
    'cancelReason',
    'canceledBy',
    'canceledAt',
    'actions',
  ],
  properties: {
    id: { type: 'string' },
    kind: { type: 'string' },
    category: { type: 'string' },
    note: { type: 'string' },
    state: { type: 'string', enum: ['open', 'under_review', 'resolved', 'canceled_as_error'] },
    version: { type: 'integer' },
    raisedBy: STAFF_REF,
    raisedAt: { type: 'string', format: 'date-time' },
    reviewStartedBy: NULLABLE_STAFF,
    reviewStartedAt: { type: ['string', 'null'], format: 'date-time' },
    resolutionNote: { type: ['string', 'null'] },
    reviewer: { type: ['string', 'null'] },
    resolvedBy: NULLABLE_STAFF,
    resolvedAt: { type: ['string', 'null'], format: 'date-time' },
    cancelReason: { type: ['string', 'null'] },
    canceledBy: NULLABLE_STAFF,
    canceledAt: { type: ['string', 'null'], format: 'date-time' },
    actions: {
      type: 'object',
      additionalProperties: false,
      required: ['startReview', 'resolve', 'cancel'],
      properties: { startReview: { type: 'boolean' }, resolve: { type: 'boolean' }, cancel: { type: 'boolean' } },
    },
  },
} as const

const HOLD_PARAMS = {
  type: 'object',
  additionalProperties: false,
  required: ['holdId'],
  properties: {
    holdId: {
      type: 'string',
      pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
    },
  },
} as const
const HOLD_RESULT = {
  type: 'object',
  additionalProperties: false,
  required: ['holdId', 'state', 'version', 'requestId'],
  properties: {
    holdId: { type: 'string' },
    state: { type: 'string' },
    version: { type: 'integer' },
    requestId: { type: 'string' },
  },
} as const
const TEXT = (max: number) => ({ type: 'string', minLength: 1, maxLength: max, pattern: '\\S' }) as const

const holdProject: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const { holdId } = req.params as { holdId: string }
  const h = await db.selectFrom('work.holds').select('project_id').where('id', '=', holdId).executeTakeFirst()
  return h ? { projectId: h.project_id } : null
}

type HoldEvent = 'start_review' | 'resolve' | 'cancel_as_error'

/** Applies one hold event under the request's and the hold's locks (request first: one lock order everywhere). */
async function moveHold(
  ctx: ApiContext,
  event: HoldEvent,
  body: { resolutionNote?: string; reviewer?: string; reason?: string },
) {
  const tx = ctx.tx as Tx
  if (ctx.actor.kind !== 'staff') throw new ApiError('FORBIDDEN')
  const actor = ctx.actor
  const { holdId } = ctx.req.params as { holdId: string }
  const scope = await tx.selectFrom('work.holds').select(['request_id']).where('id', '=', holdId).executeTakeFirst()
  if (!scope?.request_id) throw new ApiError('NOT_FOUND')
  await tx.selectFrom('intake.requests').select('id').where('id', '=', scope.request_id).forUpdate().execute()
  const hold = await tx
    .selectFrom('work.holds')
    .selectAll()
    .where('id', '=', holdId)
    .forUpdate()
    .executeTakeFirstOrThrow()
  const expected = ctx.expectedVersion()
  if (expected !== hold.version)
    throw new ApiError('STALE_VERSION', { current: { version: hold.version, values: { state: hold.state } } })
  const resolutionNote = body.resolutionNote?.trim()
  const reviewer = body.reviewer?.trim()
  const reason = body.reason?.trim()
  const result = apply({ machine: 'hold.lifecycle', state: hold.state as HoldState, version: hold.version }, event, {
    actor: 'staff',
    expectedVersion: hold.version,
    now: new Date(),
    facts: {
      kind: hold.kind as 'review',
      raisedBy: hold.raised_by,
      actorId: actor.userId,
      ...(resolutionNote !== undefined ? { resolutionNote } : {}),
      ...(reviewer !== undefined ? { reviewer } : {}),
      ...(reason !== undefined ? { reason } : {}),
    },
  })
  if (!result.ok) {
    const problems = result.problems.length ? result.problems : [{ code: result.code }]
    throw new ApiError('CONFLICT', {
      fieldErrors: problems.map((p) => ({
        field: p.code === 'INVALID_TRANSITION' ? 'state' : 'body',
        code: p.code,
        message: '',
      })),
    })
  }
  const now = sql<Date>`now()`
  await tx
    .updateTable('work.holds')
    .set({
      state: result.to,
      version: result.version,
      ...(event === 'start_review' ? { review_started_by: actor.userId, review_started_at: now } : {}),
      ...(event === 'resolve'
        ? {
            resolution_note: resolutionNote ?? null,
            reviewer: reviewer ?? null,
            resolved_by: actor.userId,
            resolved_at: now,
          }
        : {}),
      ...(event === 'cancel_as_error'
        ? { cancel_reason: reason ?? null, canceled_by: actor.userId, canceled_at: now }
        : {}),
    })
    .where('id', '=', holdId)
    .execute()
  await syncReviewHoldItem(tx, scope.request_id)
  // The notes and the reviewer's name stay on the hold; the audit records the change, never the text.
  await ctx.audit({
    target: { type: 'hold', id: holdId, version: result.version },
    summary: {
      event,
      from: hold.state,
      to: result.to,
      kind: hold.kind,
      category: hold.category,
      requestId: scope.request_id,
    },
  })
  return {
    body: { holdId, state: result.to, version: result.version, requestId: scope.request_id },
    version: result.version,
  }
}

const holdRoute = (
  def: Pick<RouteDef, 'path' | 'operationId' | 'summary' | 'description' | 'permission' | 'audit'> & {
    body: Record<string, unknown>
    event: HoldEvent
  },
): RouteDef => ({
  method: 'POST',
  path: def.path,
  operationId: def.operationId,
  summary: def.summary,
  description: def.description,
  actors: ['staff'],
  permission: def.permission,
  kind: 'write',
  idempotency: 'required',
  expectedVersion: 'required',
  rateLimit: 'none',
  audit: def.audit,
  pagination: false,
  test: 'test/integration/response-holds.test.ts',
  resource: holdProject,
  schema: { params: HOLD_PARAMS, body: def.body, response: { 200: HOLD_RESULT } },
  handler: (ctx) =>
    moveHold(ctx, def.event, ctx.req.body as { resolutionNote?: string; reviewer?: string; reason?: string }),
})

export function holdRoutes(): RouteDef[] {
  return [
    holdRoute({
      path: '/staff/holds/:holdId/actions/start-review',
      operationId: 'startHoldReview',
      summary: 'Start reviewing a hold',
      description:
        'Staff with job_hold.set (PROPOSED). Moves an open review hold to "under review"; it still blocks the estimate ' +
        'path. If-Match is the hold version.',
      permission: 'job_hold.set',
      audit: 'hold.start_review',
      event: 'start_review',
      body: { type: 'object', additionalProperties: false, properties: {} },
    }),
    holdRoute({
      path: '/staff/holds/:holdId/actions/resolve',
      operationId: 'resolveHold',
      summary: 'Resolve a hold under review',
      description:
        'The Owner (job_hold.set_ready, PROPOSED for review holds; OWN-DEC-137). Needs a note saying how it was ' +
        'resolved and who reviewed it (name and, where the hazard needs one, their qualification). No checkbox, ' +
        'timer, acknowledgment or AI output clears a hold. Nobody resolves a critical safety hold they raised.',
      permission: 'job_hold.set_ready',
      audit: 'hold.resolve',
      event: 'resolve',
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['resolutionNote', 'reviewer'],
        properties: { resolutionNote: TEXT(2000), reviewer: TEXT(200) },
      },
    }),
    holdRoute({
      path: '/staff/holds/:holdId/actions/cancel',
      operationId: 'cancelHoldAsError',
      summary: 'Cancel a hold entered in error',
      description:
        'The Owner (job_hold.set_ready, PROPOSED). Only for a hold entered in error, with the reason; the hold and ' +
        'its reason stay in the history.',
      permission: 'job_hold.set_ready',
      audit: 'hold.cancel_as_error',
      event: 'cancel_as_error',
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['reason'],
        properties: { reason: TEXT(1000) },
      },
    }),
  ]
}
