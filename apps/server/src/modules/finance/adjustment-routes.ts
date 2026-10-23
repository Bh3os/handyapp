// The routes of refunds, credits, write-offs and invoice voids (TSK-0089 part 2; HH-FIN-14, HH-FIN-03, T63, T64,
// ENT-Refund, ENT-Invoice, OWN-DEC-138, RULE-SERVER-AUTHZ). See adjustments.ts.
//   GET  /staff/jobs/:jobId/finance-adjustments              the job's refunds, credits, write-offs (payment.view)
//   POST /staff/jobs/:jobId/refunds | credits | write-offs   the Owner records one (fresh sign-in, reason)
//   POST /staff/jobs/:jobId/finance-adjustment-requests      Office requests one (finance_adjustment.request)
//   POST /staff/refunds|credits|write-offs/:id/decision      the Owner approves or declines a request
//   POST /staff/refunds/:id/outcome                          the Owner records the Square refund's outcome
//   POST /staff/invoices/:invoiceId/void                     the Owner voids an issued invoice with nothing on it
// Every write is decided by the policy (deny by default), runs in one transaction with its idempotency key, and records
// its audit event with the reason; the Owner's are step-up actions.
import type { Tx } from '@handyhub/db'
import { ApiError } from '../../api/errors.js'
import type { ApiContext, RouteDef } from '../../api/route.js'
import { FRESH_AUTH_MINUTES } from '../identity/sessions.js'
import {
  ADJUSTMENT_REQUEST_LIMITS,
  adjustmentsView,
  decideAdjustment,
  FINANCE_ADJUSTMENT_STATES,
  FINANCE_ADJUSTMENT_TYPES,
  recordAdjustment,
  recordRefundOutcome,
  REFUND_OUTCOMES,
  requestAdjustment,
  TYPE_ACTION,
  voidInvoice,
  type Decision,
  type FinanceAdjustmentType,
  type RefundOutcome,
} from './adjustments.js'
import { projectOfJob } from './deposits.js'

const TEST = 'test/integration/invoices.test.ts'

const UUID = {
  type: 'string',
  pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
} as const
const params = (name: string) =>
  ({ type: 'object', additionalProperties: false, required: [name], properties: { [name]: UUID } }) as const
const STRING = { type: 'string' } as const
const NULLABLE_STRING = { type: ['string', 'null'] } as const
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
const REASON = { type: 'string', minLength: 1, maxLength: ADJUSTMENT_REQUEST_LIMITS.reason + 100 } as const

const VIEW = object({
  jobId: STRING,
  items: {
    type: 'array',
    items: object({
      id: STRING,
      type: { type: 'string', enum: [...FINANCE_ADJUSTMENT_TYPES] },
      state: { type: 'string', enum: [...FINANCE_ADJUSTMENT_STATES] },
      amountCents: INT,
      reason: STRING,
      decisionReason: NULLABLE_STRING,
      payment: nullable(object({ id: STRING, method: STRING, receivedOn: STRING, amountCents: INT })),
      invoiceNumber: NULLABLE_STRING,
      requestedBy: STAFF_REF,
      requestedAt: DATE_TIME,
      decidedBy: nullable(STAFF_REF),
      decidedAt: { anyOf: [{ type: 'null' }, DATE_TIME] },
      confirmation: NULLABLE_STRING,
      canDecide: { type: 'boolean' },
      outcomes: { type: 'array', items: { type: 'string', enum: [...REFUND_OUTCOMES] } },
    }),
  },
  refundable: {
    type: 'array',
    items: object({ paymentId: STRING, method: STRING, receivedOn: STRING, availableCents: INT }),
  },
  invoice: nullable(object({ id: STRING, number: STRING, state: STRING, remainingCents: INT, pendingCents: INT })),
  voidable: { type: 'array', items: object({ id: STRING, number: STRING, kind: STRING }) },
  actions: object({
    refund: { type: 'boolean' },
    credit: { type: 'boolean' },
    writeOff: { type: 'boolean' },
    request: { type: 'boolean' },
    voidInvoice: { type: 'boolean' },
  }),
})

const staffActor = (ctx: ApiContext) => {
  if (ctx.actor.kind !== 'staff') throw new ApiError('FORBIDDEN')
  return ctx.actor
}
const sessionOf = (ctx: ApiContext) => {
  const s = ctx.req.staffSession
  if (!s) throw new ApiError('UNAUTHENTICATED')
  return s.sessionId
}

const jobProject: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const { jobId } = req.params as { jobId: string }
  const projectId = await projectOfJob(db, jobId)
  return projectId ? { projectId } : null
}
const adjustmentProject: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const { id } = req.params as { id: string }
  const f = await db.selectFrom('finance.refunds').select('project_id').where('id', '=', id).executeTakeFirst()
  return f ? { projectId: f.project_id } : null
}
const invoiceProject: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const { invoiceId } = req.params as { invoiceId: string }
  const i = await db.selectFrom('finance.invoices').select('project_id').where('id', '=', invoiceId).executeTakeFirst()
  return i ? { projectId: i.project_id } : null
}

async function viewOrThrow(ctx: ApiContext, tx: Tx | undefined, jobId: string) {
  const view = await adjustmentsView(tx ?? ctx.db, staffActor(ctx), jobId)
  if (!view) throw new ApiError('NOT_FOUND')
  return view
}

const common = { actors: ['staff'], rateLimit: 'none', pagination: false, test: TEST } as const
const write = { ...common, method: 'POST', kind: 'write', idempotency: 'required', expectedVersion: 'none' } as const
const owner = { ...write, freshAuthMinutes: FRESH_AUTH_MINUTES } as const

const PATH: Record<FinanceAdjustmentType, string> = { refund: 'refunds', credit: 'credits', write_off: 'write-offs' }
const WORDS: Record<FinanceAdjustmentType, string> = { refund: 'refund', credit: 'credit', write_off: 'write-off' }
const OPERATION: Record<FinanceAdjustmentType, string> = { refund: 'Refund', credit: 'Credit', write_off: 'WriteOff' }
const WHAT: Record<FinanceAdjustmentType, string> = {
  refund:
    'A refund pays back money of one confirmed payment of the job not applied to anything (paymentId; never more ' +
    'than it can still give, EXCEEDS_AVAILABLE). It is made in Square; the Owner then records its outcome.',
  credit:
    "A credit lowers what the job's issued final invoice still asks for (never beyond it, EXCEEDS_BALANCE); it is " +
    'issued and applied at once and counts toward Paid.',
  write_off:
    "A write-off stops collecting part or all of what the job's issued final invoice still asks for (never beyond it; " +
    'never automatic; the accounting treatment is the accountant’s). A written-off invoice is never Paid.',
}

const AMOUNT_BODY = (type: FinanceAdjustmentType) => ({
  type: 'object',
  additionalProperties: false,
  required: type === 'refund' ? ['paymentId', 'amountCents', 'reason'] : ['amountCents', 'reason'],
  properties: {
    ...(type === 'refund' ? { paymentId: UUID } : {}),
    amountCents: { type: 'integer', minimum: 1 },
    reason: REASON,
  },
})

export function adjustmentRoutes(): RouteDef[] {
  return [
    {
      ...common,
      method: 'GET',
      path: '/staff/jobs/:jobId/finance-adjustments',
      operationId: 'getJobFinanceAdjustments',
      summary: "A job's refunds, credits and write-offs",
      description:
        'The Owner and Office (payment.view): every refund, credit and write-off of the job with its original record ' +
        '(the payment or the invoice), reason, requester, decision and Square refund ID; the payments with money a ' +
        'refund may pay back; the current final invoice; the invoices the Owner may void; and what this caller may ' +
        'do now (the Owner acts, Office requests). Read only.',
      permission: 'payment.view',
      kind: 'read',
      idempotency: 'none',
      expectedVersion: 'none',
      audit: 'none',
      resource: jobProject,
      schema: { params: params('jobId'), response: { 200: VIEW } },
      handler: async (ctx) => ({ body: await viewOrThrow(ctx, undefined, (ctx.req.params as { jobId: string }).jobId) }),
    },
    ...FINANCE_ADJUSTMENT_TYPES.map(
      (type): RouteDef => ({
        ...owner,
        path: `/staff/jobs/:jobId/${PATH[type]}`,
        operationId: `record${OPERATION[type]}`,
        summary: `Record a ${WORDS[type]} (Owner only)`,
        description:
          `The Owner only (${TYPE_ACTION[type]}; OWN-DEC-138): a fresh sign-in (password or authenticator code within ` +
          `${FRESH_AUTH_MINUTES} minutes, read again at the write) and a written reason. ${WHAT[type]} Requested and ` +
          'approved in one step, never an edit; audited. Returns the job’s adjustments view.',
        permission: TYPE_ACTION[type],
        audit: `payment.${type}`,
        resource: jobProject,
        schema: { params: params('jobId'), body: AMOUNT_BODY(type), response: { 201: VIEW } },
        handler: async (ctx) => {
          const tx = ctx.tx as Tx
          const { jobId } = ctx.req.params as { jobId: string }
          const body = ctx.req.body as { paymentId?: string; amountCents: number; reason: string }
          const out = await recordAdjustment(tx, staffActor(ctx), jobId, {
            type,
            paymentId: body.paymentId ?? null,
            amountCents: body.amountCents,
            reason: body.reason,
            sessionId: sessionOf(ctx),
          })
          await ctx.audit({
            target: { type: 'payment', id: out.id, version: out.version },
            summary: { jobId, type, state: out.state, amountCents: body.amountCents, paymentId: body.paymentId ?? null },
            reason: body.reason.trim(),
            stepUpUsed: true,
          })
          return { status: 201, body: await viewOrThrow(ctx, tx, jobId) }
        },
      }),
    ),
    {
      ...write,
      path: '/staff/jobs/:jobId/finance-adjustment-requests',
      operationId: 'requestFinanceAdjustment',
      summary: 'Request a refund, credit or write-off for the Owner’s decision',
      description:
        'Office (finance_adjustment.request, PROPOSED): a refund, credit or write-off is requested with a reason and ' +
        'checked against the current money as the Owner’s would be; it changes no balance (a requested refund holds ' +
        'its money) and waits in Owner Decisions (refund_request, one item per job) until the Owner approves or ' +
        'declines it. Returns the job’s adjustments view.',
      permission: 'finance_adjustment.request',
      audit: 'payment.adjustment_request',
      resource: jobProject,
      schema: {
        params: params('jobId'),
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['type', 'amountCents', 'reason'],
          properties: {
            type: { type: 'string', enum: [...FINANCE_ADJUSTMENT_TYPES] },
            paymentId: { anyOf: [{ type: 'null' }, UUID] },
            amountCents: { type: 'integer', minimum: 1 },
            reason: REASON,
          },
        },
        response: { 201: VIEW },
      },
      handler: async (ctx) => {
        const tx = ctx.tx as Tx
        const { jobId } = ctx.req.params as { jobId: string }
        const body = ctx.req.body as {
          type: FinanceAdjustmentType
          paymentId?: string | null
          amountCents: number
          reason: string
        }
        const out = await requestAdjustment(tx, staffActor(ctx), jobId, body)
        await ctx.audit({
          target: { type: 'payment', id: out.id, version: 1 },
          summary: { jobId, type: body.type, amountCents: body.amountCents, paymentId: body.paymentId ?? null },
          reason: body.reason.trim(),
        })
        return { status: 201, body: await viewOrThrow(ctx, tx, jobId) }
      },
    },
    ...FINANCE_ADJUSTMENT_TYPES.map(
      (type): RouteDef => ({
        ...owner,
        path: `/staff/${PATH[type]}/:id/decision`,
        operationId: `decide${OPERATION[type]}Request`,
        summary: `Approve or decline a requested ${WORDS[type]} (Owner only)`,
        description:
          `The Owner only (${TYPE_ACTION[type]}): a fresh sign-in and a written reason. approve: ${WHAT[type]} ` +
          'decline: a refund is declined (its money is free again), a credit or write-off voided. A request already ' +
          'decided is a CONFLICT. The Owner Decisions item follows. Audited. Returns the job’s adjustments view.',
        permission: TYPE_ACTION[type],
        audit: 'payment.adjustment_decision',
        resource: adjustmentProject,
        schema: {
          params: params('id'),
          body: {
            type: 'object',
            additionalProperties: false,
            required: ['decision', 'reason'],
            properties: { decision: { type: 'string', enum: ['approve', 'decline'] }, reason: REASON },
          },
          response: { 200: VIEW },
        },
        handler: async (ctx) => {
          const tx = ctx.tx as Tx
          const { id } = ctx.req.params as { id: string }
          const body = ctx.req.body as { decision: Decision; reason: string }
          const out = await decideAdjustment(tx, staffActor(ctx), id, {
            type,
            decision: body.decision,
            reason: body.reason,
            sessionId: sessionOf(ctx),
          })
          await ctx.audit({
            target: { type: 'payment', id, version: out.version },
            summary: { jobId: out.jobId, type, decision: body.decision, from: out.from, to: out.state },
            reason: body.reason.trim(),
            stepUpUsed: true,
          })
          return { body: await viewOrThrow(ctx, tx, out.jobId) }
        },
      }),
    ),
    {
      ...owner,
      path: '/staff/refunds/:id/outcome',
      operationId: 'recordRefundOutcome',
      summary: 'Record what happened to an approved refund in Square (Owner only)',
      description:
        'The Owner only (payment.refund): a fresh sign-in and a reason. approved -> processing (made in Square) -> ' +
        'succeeded (only with Square’s refund ID: a refund is complete only then), failed (its money is free again) ' +
        'or needs_review; needs_review -> succeeded or failed. Anything else is a CONFLICT. Audited. Returns the job’s ' +
        'adjustments view.',
      permission: 'payment.refund',
      audit: 'payment.refund_outcome',
      resource: adjustmentProject,
      schema: {
        params: params('id'),
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['outcome', 'reason'],
          properties: {
            outcome: { type: 'string', enum: [...REFUND_OUTCOMES] },
            confirmation: {
              type: ['string', 'null'],
              maxLength: ADJUSTMENT_REQUEST_LIMITS.confirmation + 50,
            },
            reason: REASON,
          },
        },
        response: { 200: VIEW },
      },
      handler: async (ctx) => {
        const tx = ctx.tx as Tx
        const { id } = ctx.req.params as { id: string }
        const body = ctx.req.body as { outcome: RefundOutcome; confirmation?: string | null; reason: string }
        const out = await recordRefundOutcome(tx, staffActor(ctx), id, { ...body, sessionId: sessionOf(ctx) })
        await ctx.audit({
          target: { type: 'payment', id, version: out.version },
          summary: { jobId: out.jobId, from: out.from, to: out.state, confirmation: body.confirmation ?? null },
          reason: body.reason.trim(),
          stepUpUsed: true,
        })
        return { body: await viewOrThrow(ctx, tx, out.jobId) }
      },
    },
    {
      ...owner,
      path: '/staff/invoices/:invoiceId/void',
      operationId: 'voidInvoice',
      summary: 'Void an issued invoice with nothing on it (Owner only)',
      description:
        'The Owner only (invoice.void): a fresh sign-in and a written reason. An issued invoice with no payment ' +
        '(confirmed or pending), credit or write-off on it is voided (INVOICE_HAS_MONEY otherwise), never deleted; ' +
        'the customer sees it superseded. The job may then have its reissue: a new draft, issued as any invoice (a ' +
        'voided final invoice gives back its deposit credit). Audited. Returns the job’s adjustments view.',
      permission: 'invoice.void',
      audit: 'invoice.void',
      resource: invoiceProject,
      schema: {
        params: params('invoiceId'),
        body: { type: 'object', additionalProperties: false, required: ['reason'], properties: { reason: REASON } },
        response: { 200: VIEW },
      },
      handler: async (ctx) => {
        const tx = ctx.tx as Tx
        const { invoiceId } = ctx.req.params as { invoiceId: string }
        const { reason } = ctx.req.body as { reason: string }
        const out = await voidInvoice(tx, staffActor(ctx), invoiceId, { reason, sessionId: sessionOf(ctx) })
        await ctx.audit({
          target: { type: 'invoice', id: invoiceId, version: out.version },
          summary: { jobId: out.jobId, kind: out.kind, number: out.number, from: out.from, to: 'voided' },
          reason: reason.trim(),
          stepUpUsed: true,
        })
        return { body: await viewOrThrow(ctx, tx, out.jobId) }
      },
    },
  ]
}
