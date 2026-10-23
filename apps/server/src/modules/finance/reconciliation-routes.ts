// The routes of the reconciliation queue (TSK-0090; HH-FIN-15, HH-FIN-09, T61, RULE-SERVER-AUTHZ). See
// reconciliation.ts.
//   GET  /staff/reconciliation              the queue: open and recently resolved items, and the records it lists
//   GET  /staff/reconciliation/:id          one item (the staff queue's deep link)
//   POST /staff/reconciliation              the Owner or Office reports money they cannot match yet
//   POST /staff/reconciliation/:id/resolve  a person resolves it once, with evidence
// Every write is decided by the policy (payment.reconcile: the Owner, Office), runs in one transaction with its
// idempotency key and records its audit event.
import type { Tx } from '@handyhub/db'
import { decide } from '@handyhub/policy'
import { ApiError } from '../../api/errors.js'
import type { ApiContext, RouteDef } from '../../api/route.js'
import { PAYMENT_METHODS } from './deposits.js'
import {
  NO_COLLECTOR,
  RECONCILIATION_KINDS,
  RECONCILIATION_LIMITS,
  RECONCILIATION_RESOLUTIONS,
  RECONCILIATION_SOURCES,
  reconciliationView,
  reportItem,
  resolveFacts,
  resolveItem,
  type ReconciliationResolution,
  type ReportInput,
} from './reconciliation.js'

const TEST = 'test/integration/invoices.test.ts'

const UUID = {
  type: 'string',
  pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
} as const
const STRING = { type: 'string' } as const
const NULLABLE_STRING = { type: ['string', 'null'] } as const
const NULLABLE_INT = { type: ['integer', 'null'] } as const
const INT = { type: 'integer' } as const
const DATE_TIME = { type: 'string', format: 'date-time' } as const
const object = (properties: Record<string, unknown>) => ({
  type: 'object',
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
})
const nullable = (schema: Record<string, unknown>) => ({ anyOf: [{ type: 'null' }, schema] })
const STAFF_REF = object({ id: STRING, name: NULLABLE_STRING })
const ITEM = object({
  id: STRING,
  kind: { type: 'string', enum: [...RECONCILIATION_KINDS] },
  source: STRING,
  project: nullable(object({ id: STRING, reference: STRING })),
  jobId: NULLABLE_STRING,
  paymentId: NULLABLE_STRING,
  method: NULLABLE_STRING,
  amountCents: NULLABLE_INT,
  currency: STRING,
  reference: NULLABLE_STRING,
  description: STRING,
  reportedBy: STAFF_REF,
  reportedAt: DATE_TIME,
  state: { type: 'string', enum: ['open', 'resolved'] },
  resolution: { type: ['string', 'null'], enum: [...RECONCILIATION_RESOLUTIONS, null] },
  evidence: NULLABLE_STRING,
  resolvedPaymentId: NULLABLE_STRING,
  resolvedBy: nullable(STAFF_REF),
  resolvedAt: { anyOf: [{ type: 'null' }, DATE_TIME] },
  candidates: {
    type: 'array',
    items: object({ id: STRING, method: STRING, amountCents: INT, receivedOn: STRING, reference: NULLABLE_STRING }),
  },
  resolutions: { type: 'array', items: { type: 'string', enum: [...RECONCILIATION_RESOLUTIONS] } },
})
const VIEW = object({
  open: { type: 'array', items: ITEM },
  resolved: { type: 'array', items: ITEM },
  records: {
    type: 'array',
    items: object({
      kind: { type: 'string', enum: ['pending_check', 'returned_payment', 'open_dispute', 'refund_uncertain'] },
      jobId: STRING,
      projectReference: STRING,
      method: STRING,
      amountCents: INT,
      state: STRING,
      since: DATE_TIME,
    }),
  },
  actions: object({ report: { type: 'boolean' } }),
})

const staffActor = (ctx: ApiContext) => {
  if (ctx.actor.kind !== 'staff') throw new ApiError('FORBIDDEN')
  return ctx.actor
}
/** Whether the caller may report (payment.reconcile, reconciling no one's collection). */
const mayReport = (ctx: ApiContext) =>
  decide(staffActor(ctx), 'payment.reconcile', { collectedByStaffId: NO_COLLECTOR }, { now: new Date(), online: true })
    .effect === 'allow'

const common = { actors: ['staff'], rateLimit: 'none', pagination: false, test: TEST } as const
const read = {
  ...common,
  method: 'GET',
  kind: 'read',
  idempotency: 'none',
  expectedVersion: 'none',
  audit: 'none',
} as const
const write = { ...common, method: 'POST', kind: 'write', idempotency: 'required', expectedVersion: 'none' } as const

export function reconciliationRoutes(): RouteDef[] {
  return [
    {
      ...read,
      path: '/staff/reconciliation',
      operationId: 'getReconciliationQueue',
      summary: 'The reconciliation queue for unmatched and uncertain money',
      description:
        'The Owner and Office (payment.view): the open items (oldest first) with the payments of their project they ' +
        'may be matched to and the resolutions this caller may record; the last 50 resolved items with their evidence; ' +
        'and the records the queue lists from their own source: checks still pending, payments returned in the last ' +
        '30 days (PROPOSED), open disputes and refunds whose outcome is not certain yet. Read only.',
      permission: 'payment.view',
      schema: { response: { 200: VIEW } },
      handler: async (ctx) => ({ body: await reconciliationView(ctx.db, staffActor(ctx), { report: mayReport(ctx) }) }),
    },
    {
      ...read,
      path: '/staff/reconciliation/:id',
      operationId: 'getReconciliationItem',
      summary: 'One reconciliation item',
      description:
        'The Owner and Office (payment.view): one item, as the queue shows it (the staff queue item opens it). ' +
        'NOT_FOUND when there is no such item.',
      permission: 'payment.view',
      schema: {
        params: { type: 'object', additionalProperties: false, required: ['id'], properties: { id: UUID } },
        response: { 200: VIEW },
      },
      handler: async (ctx) => {
        const { id } = ctx.req.params as { id: string }
        const view = await reconciliationView(ctx.db, staffActor(ctx), { report: mayReport(ctx), only: id })
        if (view.open.length + view.resolved.length === 0) throw new ApiError('NOT_FOUND')
        return { body: view }
      },
    },
    {
      ...write,
      path: '/staff/reconciliation',
      operationId: 'reportReconciliationItem',
      summary: 'Report money that cannot be matched yet',
      description:
        'The Owner or Office (payment.reconcile): an uncertain outcome, money received that matches no payment, an ' +
        'amount or currency mismatch, a duplicate entry, or a Square payment whose reference does not match, with ' +
        'what was seen (source, method, amount, currency, reference, the job or payment it concerns, a description). ' +
        'It records no payment and changes no balance; it waits in the staff queue until a person resolves it. ' +
        'Returns the queue.',
      permission: 'payment.reconcile',
      audit: 'payment.reconciliation_report',
      resource: async () => ({ collectedByStaffId: NO_COLLECTOR }),
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['kind', 'source', 'description'],
          properties: {
            kind: { type: 'string', enum: [...RECONCILIATION_KINDS] },
            source: { type: 'string', enum: [...RECONCILIATION_SOURCES] },
            jobId: { anyOf: [{ type: 'null' }, UUID] },
            paymentId: { anyOf: [{ type: 'null' }, UUID] },
            method: { type: ['string', 'null'], enum: [...PAYMENT_METHODS, null] },
            amountCents: { type: ['integer', 'null'], minimum: 1 },
            currency: { type: ['string', 'null'], maxLength: 3 },
            reference: { type: ['string', 'null'], maxLength: RECONCILIATION_LIMITS.reference + 50 },
            description: { type: 'string', minLength: 1, maxLength: RECONCILIATION_LIMITS.description + 100 },
          },
        },
        response: { 201: VIEW },
      },
      handler: async (ctx) => {
        const tx = ctx.tx as Tx
        const body = ctx.req.body as ReportInput
        const out = await reportItem(tx, staffActor(ctx), body)
        await ctx.audit({
          target: { type: 'payment', id: out.id, version: 1 },
          summary: {
            kind: body.kind,
            source: body.source,
            jobId: body.jobId ?? null,
            paymentId: body.paymentId ?? null,
            amountCents: body.amountCents ?? null,
          },
        })
        return { status: 201, body: await reconciliationView(tx, staffActor(ctx), { report: true }) }
      },
    },
    {
      ...write,
      path: '/staff/reconciliation/:id/resolve',
      operationId: 'resolveReconciliationItem',
      summary: 'Resolve a reconciliation item with evidence',
      description:
        'Once, with evidence (payment.reconcile, never for the resolver’s own collection). matched (a payment already ' +
        'recorded) and recorded (the verified payment staff recorded for it) name the payment: one item per payment, ' +
        'so a retry recorded once never makes a double entry; routine matching that Office may do (PROPOSED). ' +
        'not_received, duplicate, corrected, refunded and no_action are the Owner’s (FORBIDDEN otherwise). A resolved ' +
        'item is a CONFLICT (ITEM_RESOLVED). The staff queue item resolves. Audited. Returns the queue.',
      permission: 'payment.reconcile',
      audit: 'payment.reconciliation_resolve',
      resource: async ({ req, db }) => {
        const { id } = req.params as { id: string }
        const body = req.body as { paymentId?: string | null } | undefined
        return resolveFacts(db, id, body?.paymentId)
      },
      schema: {
        params: { type: 'object', additionalProperties: false, required: ['id'], properties: { id: UUID } },
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['resolution', 'evidence'],
          properties: {
            resolution: { type: 'string', enum: [...RECONCILIATION_RESOLUTIONS] },
            evidence: { type: 'string', minLength: 1, maxLength: RECONCILIATION_LIMITS.evidence + 100 },
            paymentId: { anyOf: [{ type: 'null' }, UUID] },
          },
        },
        response: { 200: VIEW },
      },
      handler: async (ctx) => {
        const tx = ctx.tx as Tx
        const { id } = ctx.req.params as { id: string }
        const body = ctx.req.body as {
          resolution: ReconciliationResolution
          evidence: string
          paymentId?: string | null
        }
        const out = await resolveItem(tx, staffActor(ctx), id, body)
        await ctx.audit({
          target: { type: 'payment', id, version: out.version },
          summary: { resolution: body.resolution, paymentId: body.paymentId ?? null },
          reason: body.evidence.trim(),
        })
        return { body: await reconciliationView(tx, staffActor(ctx), { report: true }) }
      },
    },
  ]
}
