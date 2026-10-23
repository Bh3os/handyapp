// Change-order module (TSK-0081; HH-CHG-01, HH-CHG-02, HH-WORK-07, T53, ENT-ChangeOrder, OWN-DEC-203,
// RULE-SERVER-AUTHZ).
//   GET  /staff/jobs/:jobId/change-orders                         the job's change orders and its approved total
//   POST /staff/jobs/:jobId/change-orders                         a worker's proposal or a staff draft
//   PUT  /staff/change-orders/:changeOrderId/draft                edit the open draft (If-Match: its row version)
//   POST /staff/change-orders/:changeOrderId/actions/<event>      review, reopen or withdraw (If-Match)
// - job.view_packet reads (the Owner, Office, an Estimator, an assigned worker); change_order.draft writes a draft (an
//   assigned worker, an Estimator, the Owner); change_order.publish reviews and reopens (an Estimator, the Owner). The
//   store narrows a worker to their own draft.
// - Nothing here changes the job's scope snapshot, packet or totals: a change binds only once the identified customer
//   approves an issued version (TSK-0082).
// - Every write is audited with identifiers, states and totals; no reason, scope or note text enters the summary.
import type { Tx } from '@handyhub/db'
import { CHANGE_ORDER_MACHINE, type ChangeOrderEvent, type ChangeOrderOrigin } from '@handyhub/domain'
import type { StaffActor } from '@handyhub/policy'
import { ApiError } from '../../api/errors.js'
import type { ApiContext, ApiModule, RouteDef } from '../../api/route.js'
import { jobAssignments } from '../packets/assignments.js'
import {
  CHANGE_ORDER_PARAMS,
  CHANGE_ORDERS_VIEW,
  CREATE_BODY,
  CREATE_RESULT,
  EVENT_BODY,
  JOB_PARAMS,
  NO_QUERY,
  UPDATE_BODY,
  WRITE_RESULT,
} from './schemas.js'
import { changeOrderEvent, changeOrdersView, createChangeOrder, type DraftInput, updateDraft } from './store.js'

export { changeOrderWaitingSteps } from './store.js'

const TEST = 'test/integration/change-orders.test.ts'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function staff(ctx: ApiContext): StaffActor {
  if (ctx.actor.kind !== 'staff') throw new ApiError('FORBIDDEN')
  return ctx.actor
}
async function factsOfJob(db: ApiContext['db'], jobId: string) {
  const j = await db.selectFrom('work.jobs').select('project_id').where('id', '=', jobId).executeTakeFirst()
  return j ? { projectId: j.project_id, assignments: await jobAssignments(db, jobId) } : null
}
const jobFacts: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const { jobId } = req.params as { jobId: string }
  return UUID_RE.test(jobId) ? factsOfJob(db, jobId) : null
}
const orderFacts: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const { changeOrderId } = req.params as { changeOrderId: string }
  if (!UUID_RE.test(changeOrderId)) return null
  const o = await db
    .selectFrom('work.change_orders')
    .select('job_id')
    .where('id', '=', changeOrderId)
    .executeTakeFirst()
  return o ? factsOfJob(db, o.job_id) : null
}

const write = {
  actors: ['staff'],
  kind: 'write',
  idempotency: 'required',
  rateLimit: 'none',
  pagination: false,
  test: TEST,
} as const

const EVENT_TEXT: Readonly<Record<ChangeOrderEvent, string>> = {
  review:
    'draft -> reviewed: an Estimator or the Owner checked pricing and eligibility. Every line priced, at least one ' +
    'line, and the totals hold against the current approved total and the money paid (CREDIT_EXCEEDS_REMAINING_' +
    'CHARGE: a credit never takes the total to $0.00 or below what was paid; APPROVED_SCOPE_CHANGED: save the draft ' +
    'again first).',
  reopen: 'reviewed -> draft, to change it again.',
  withdraw:
    'draft or reviewed -> withdrawn, with a reason. A worker withdraws only their own draft; the steps it named no ' +
    'longer wait.',
}

export function changeOrdersModule(): ApiModule {
  const list: RouteDef = {
    method: 'GET',
    actors: ['staff'],
    kind: 'read',
    idempotency: 'none',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'none',
    pagination: false,
    test: TEST,
    path: '/staff/jobs/:jobId/change-orders',
    operationId: 'listChangeOrders',
    summary: "The job's change orders",
    description:
      'Staff with job.view_packet on the job. The approved total (the job’s latest scope snapshot) and the money ' +
      'paid, apart from every change order: its number, origin, current version (state, reason, proposed scope, ' +
      'schedule impact, hazards, resources, evidence, the checklist steps that wait for it, lines and totals) and ' +
      'earlier versions, with what the caller may do. A draft or reviewed change binds nothing (HH-CHG-02). Also the ' +
      'work packages with their checklist steps and the job’s field photos, to name in a draft.',
    permission: 'job.view_packet',
    resource: jobFacts,
    schema: { params: JOB_PARAMS, querystring: NO_QUERY, response: { 200: CHANGE_ORDERS_VIEW } },
    handler: async (ctx) => {
      const { jobId } = ctx.req.params as { jobId: string }
      const v = await changeOrdersView(ctx.db, staff(ctx), jobId, (await factsOfJob(ctx.db, jobId)) ?? {})
      if (!v) throw new ApiError('NOT_FOUND')
      return { body: v, headers: { 'cache-control': 'no-store' } }
    },
  }

  const create: RouteDef = {
    ...write,
    method: 'POST',
    expectedVersion: 'none',
    path: '/staff/jobs/:jobId/change-orders',
    operationId: 'createChangeOrder',
    summary: 'Propose or draft a change order',
    description:
      'Staff with change_order.draft on the job (an assigned worker, an Estimator, the Owner), while the job is ' +
      'between its approval and operationally complete (JOB_NOT_OPEN_FOR_CHANGES otherwise). A new change order, ' +
      'numbered per project (<reference>-C<n>), with its first version as a draft: reason, proposed scope, charge ' +
      'and credit lines (credits are positive amounts that lower the total, OWN-DEC-203), schedule impact, hazards, ' +
      'resources, evidence photos and measurements, and the checklist steps that wait for it. A worker’s draft is ' +
      'always a worker proposal; an Estimator or the Owner names the origin. It binds nothing: the scope, the packet ' +
      'and every total stay as approved.',
    permission: 'change_order.draft',
    audit: 'change_order.create',
    resource: jobFacts,
    schema: { params: JOB_PARAMS, body: CREATE_BODY, response: { 201: CREATE_RESULT } },
    handler: async (ctx) => {
      const { jobId } = ctx.req.params as { jobId: string }
      const out = await createChangeOrder(
        ctx.tx as Tx,
        staff(ctx),
        jobId,
        ctx.req.body as DraftInput & { origin?: ChangeOrderOrigin },
      )
      await ctx.audit({
        target: { type: 'change_order', id: out.changeOrderId, version: out.rowVersion },
        summary: { jobId, number: out.number, origin: out.origin, state: 'draft' },
      })
      return { status: 201, body: out, version: out.rowVersion }
    },
  }

  const update: RouteDef = {
    ...write,
    method: 'PUT',
    expectedVersion: 'required',
    path: '/staff/change-orders/:changeOrderId/draft',
    operationId: 'updateChangeOrderDraft',
    summary: 'Edit a change-order draft',
    description:
      'Staff with change_order.draft, with If-Match (the version’s row version), on a draft: replaces its content ' +
      'and lines, priced again against the current approved total. A worker edits only their own proposal; an ' +
      'Estimator or the Owner edits any draft (NOT_A_DRAFT once reviewed: reopen it first).',
    permission: 'change_order.draft',
    audit: 'change_order.update',
    resource: orderFacts,
    schema: { params: CHANGE_ORDER_PARAMS, body: UPDATE_BODY, response: { 200: WRITE_RESULT } },
    handler: async (ctx) => {
      const { changeOrderId } = ctx.req.params as { changeOrderId: string }
      const out = await updateDraft(
        ctx.tx as Tx,
        staff(ctx),
        changeOrderId,
        ctx.req.body as DraftInput,
        ctx.expectedVersion(),
      )
      await ctx.audit({
        target: { type: 'change_order', id: changeOrderId, version: out.rowVersion },
        summary: { state: out.state },
      })
      return { body: out, version: out.rowVersion }
    },
  }

  const events: RouteDef[] = CHANGE_ORDER_MACHINE.transitions.map(({ event }) => ({
    ...write,
    method: 'POST',
    expectedVersion: 'required',
    path: `/staff/change-orders/:changeOrderId/actions/${event}`,
    operationId: `changeOrder${event[0]?.toUpperCase()}${event.slice(1)}`,
    summary: `Change order: ${event}`,
    description: `With If-Match (the version’s row version). ${EVENT_TEXT[event]}`,
    // Reviewing and reopening are an Estimator's or the Owner's; withdrawing is also a worker's, for their own draft.
    permission: event === 'withdraw' ? 'change_order.draft' : 'change_order.publish',
    audit: `change_order.${event}`,
    resource: orderFacts,
    schema: { params: CHANGE_ORDER_PARAMS, body: EVENT_BODY, response: { 200: WRITE_RESULT } },
    handler: async (ctx) => {
      const { changeOrderId } = ctx.req.params as { changeOrderId: string }
      const out = await changeOrderEvent(
        ctx.tx as Tx,
        staff(ctx),
        changeOrderId,
        event,
        ctx.req.body as { reason?: string },
        ctx.expectedVersion(),
      )
      await ctx.audit({
        target: { type: 'change_order', id: changeOrderId, version: out.rowVersion },
        summary: { state: out.state },
      })
      return { body: out, version: out.rowVersion }
    },
  }))

  return { name: 'change-orders', routes: [list, create, update, ...events] }
}
