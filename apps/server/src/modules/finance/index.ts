// The finance module's deposit routes (TSK-0059; HH-FIN-02, HH-FIN-03, HH-FIN-09, HH-FIN-12, T36, T59, T64,
// ENT-DepositRequirement, ENT-Payment, ENT-PaymentAllocation, INT-Square, OWN-DEC-76, OWN-DEC-104, OWN-DEC-138,
// RULE-SERVER-AUTHZ).
//   GET  /staff/jobs/:jobId/deposit                 the job's deposit (payment.view: Owner, Office)
//   PUT  /staff/jobs/:jobId/deposit/payment-link    the deposit request's Square link (invoice.enter_payment_link)
//   POST /staff/jobs/:jobId/deposit/payments        record a verified deposit payment (payment.record)
//   POST /staff/payments/:paymentId/clear           the Owner marks a check cleared (check.mark_cleared)
//   POST /staff/payments/:paymentId/deposited       TSK-0088: a check deposited, still pending (payment.reconcile)
//   POST /staff/payments/:paymentId/reconcile       TSK-0088: a recorded payment reconciled (payment.reconcile)
//   POST /staff/jobs/:jobId/deposit/waiver          the Owner's waiver: fresh sign-in and a reason (deposit.waive)
// Each write is decided by the policy (deny by default), runs in one transaction with its idempotency key and records
// its audit event. The work-scheduling gate is deposit-gate.ts, called by the confirming transaction itself.
import type { Tx } from '@handyhub/db'
import { ApiError } from '../../api/errors.js'
import type { ApiContext, ApiModule, RouteDef } from '../../api/route.js'
import { FRESH_AUTH_MINUTES } from '../identity/sessions.js'
import { invoiceRoutes, type InvoiceRouteDeps } from './invoice-routes.js'
import {
  DEPOSIT_LIMITS,
  DEPOSIT_STATES,
  depositView,
  markCheckCleared,
  PAYMENT_METHODS,
  PAYMENT_STATES,
  paymentFacts,
  projectOfJob,
  recordDepositPayment,
  setDepositPaymentLink,
  waiveDeposit,
  type RecordPaymentInput,
} from './deposits.js'

export {
  confirmationDepositGate,
  depositGateProblem,
  requireConfirmationDepositGate,
  type ConfirmationDepositGate,
  type VisitToConfirm,
} from './deposit-gate.js'
export { customerDeposit, type CustomerDeposit, type DepositState } from './deposits.js'
export { depositQueueAutomation, syncDepositItem } from './deposit-queue.js'
export {
  depositInvoiceAutomation,
  invoiceDocumentAutomation,
  invoiceDraftAutomation,
  invoiceReadyAutomation,
  issueInvoiceDocument,
} from './invoice-automations.js'
import { markCheckDeposited, reconcilePayment } from './payment-states.js'
export { customerInvoiceList, issueInvoice, jobInvoices, prepareDraft, qualityGate } from './invoices.js'
export { INVOICE_PAID_EVENT } from './money-events.js'
export { issuePaymentReceipt, paymentReceiptAutomation, RECEIPT_ISSUED_EVENT } from './receipts.js'

const TEST = 'test/integration/deposits.test.ts'

const UUID = {
  type: 'string',
  pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
} as const
const JOB_PARAMS = {
  type: 'object',
  additionalProperties: false,
  required: ['jobId'],
  properties: { jobId: UUID },
} as const
const PAYMENT_PARAMS = {
  type: 'object',
  additionalProperties: false,
  required: ['paymentId'],
  properties: { paymentId: UUID },
} as const
const NULLABLE_STRING = { type: ['string', 'null'] } as const
const NULLABLE_INT = { type: ['integer', 'null'] } as const
const DATE_TIME = { type: 'string', format: 'date-time' } as const
const STAFF_REF = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'name'],
  properties: { id: { type: 'string' }, name: NULLABLE_STRING },
} as const
const NULLABLE_STAFF_REF = { anyOf: [{ type: 'null' }, STAFF_REF] } as const
const STATE = { type: 'string', enum: [...DEPOSIT_STATES] } as const

const DEPOSIT_VIEW = {
  type: 'object',
  additionalProperties: false,
  required: [
    'jobId',
    'required',
    'state',
    'amountCents',
    'baseTotalCents',
    'ruleVersion',
    'verifiedCents',
    'pendingCents',
    'remainingCents',
    'workScheduling',
    'paymentLink',
    'waiver',
    'payments',
    'version',
    'actions',
  ],
  properties: {
    jobId: { type: 'string' },
    required: { type: 'boolean' },
    state: STATE,
    amountCents: NULLABLE_INT,
    baseTotalCents: { type: 'integer' },
    ruleVersion: { type: 'integer' },
    verifiedCents: { type: 'integer' },
    pendingCents: { type: 'integer' },
    remainingCents: NULLABLE_INT,
    workScheduling: { type: 'string', enum: ['open', 'blocked'] },
    paymentLink: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          required: ['url', 'setBy', 'setAt'],
          properties: { url: { type: 'string' }, setBy: NULLABLE_STAFF_REF, setAt: DATE_TIME },
        },
      ],
    },
    waiver: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          required: ['by', 'at', 'reason'],
          properties: { by: STAFF_REF, at: DATE_TIME, reason: { type: 'string' } },
        },
      ],
    },
    payments: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'id',
          'method',
          'amountCents',
          'appliedCents',
          'unappliedCents',
          'receivedOn',
          'reference',
          'payerName',
          'state',
          'verified',
          'collector',
          'recordedBy',
          'recordedAt',
          'clearedBy',
          'clearedAt',
          'canMarkCleared',
          'memo',
          'receiptNumber',
          'depositedAt',
          'reconciledAt',
          'canMarkDeposited',
          'canReconcile',
        ],
        properties: {
          id: { type: 'string' },
          method: { type: 'string', enum: [...PAYMENT_METHODS] },
          amountCents: { type: 'integer' },
          appliedCents: { type: 'integer' },
          unappliedCents: { type: 'integer' },
          receivedOn: { type: 'string' },
          reference: NULLABLE_STRING,
          payerName: NULLABLE_STRING,
          state: { type: 'string', enum: [...PAYMENT_STATES] },
          verified: { type: 'boolean' },
          collector: STAFF_REF,
          recordedBy: STAFF_REF,
          recordedAt: DATE_TIME,
          clearedBy: NULLABLE_STAFF_REF,
          clearedAt: { anyOf: [{ type: 'null' }, DATE_TIME] },
          canMarkCleared: { type: 'boolean' },
          memo: NULLABLE_STRING,
          receiptNumber: NULLABLE_STRING,
          depositedAt: { anyOf: [{ type: 'null' }, DATE_TIME] },
          reconciledAt: { anyOf: [{ type: 'null' }, DATE_TIME] },
          canMarkDeposited: { type: 'boolean' },
          canReconcile: { type: 'boolean' },
        },
      },
    },
    version: { type: 'integer' },
    actions: {
      type: 'object',
      additionalProperties: false,
      required: ['enterPaymentLink', 'recordPayment', 'waive'],
      properties: {
        enterPaymentLink: { type: 'boolean' },
        recordPayment: { type: 'boolean' },
        waive: { type: 'boolean' },
      },
    },
  },
} as const

const staffActor = (ctx: ApiContext) => {
  if (ctx.actor.kind !== 'staff') throw new ApiError('FORBIDDEN')
  return ctx.actor
}

/** The job's project for the policy; null answers NOT_FOUND. */
const jobProject: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const { jobId } = req.params as { jobId: string }
  const projectId = await projectOfJob(db, jobId)
  return projectId ? { projectId } : null
}

/**
 * Recording a payment: the job's project and the collector the body names (the caller when none). A Worker's
 * on-site collection is allowed only for their own collection on an assigned job (ROLE-MATRIX, PROPOSED mapping);
 * no assignment exists before the visit model (TSK-0061), so it is refused until then.
 */
const paymentRecordFacts: NonNullable<RouteDef['resource']> = async ({ req, actor, db }) => {
  const { jobId } = req.params as { jobId: string }
  const projectId = await projectOfJob(db, jobId)
  if (!projectId) return null
  const body = req.body as { collectorStaffId?: string | null } | undefined
  const collector = body?.collectorStaffId ?? (actor.kind === 'staff' ? actor.userId : undefined)
  return { projectId, assignments: [], ...(collector ? { collectedByStaffId: collector } : {}) }
}

const paymentOf: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const { paymentId } = req.params as { paymentId: string }
  return paymentFacts(db, paymentId)
}

const common = { actors: ['staff'], rateLimit: 'none', pagination: false, test: TEST } as const

const write = {
  ...common,
  kind: 'write',
  idempotency: 'required',
} as const

async function viewOrThrow(ctx: ApiContext, tx: Tx | undefined, jobId: string) {
  const view = await depositView(tx ?? ctx.db, staffActor(ctx), jobId)
  if (!view) throw new ApiError('NOT_FOUND')
  return view
}

const routes: RouteDef[] = [
  {
    ...common,
    method: 'GET',
    path: '/staff/jobs/:jobId/deposit',
    operationId: 'getJobDeposit',
    summary: "A job's deposit requirement, its payments and the waiver",
    description:
      'Staff with payment.view (the Owner, Office). The deposit the approval pinned (required with its amount in ' +
      'cents, or not required; the rule version and the approved total after any discount it was computed on), ' +
      'its state, the verified and pending (uncleared check) amounts applied, what it still needs, whether work ' +
      'visits may be confirmed as it stands, the Square payment link of the deposit request, the waiver with its ' +
      'reason, every payment recorded on the job and the actions the server would allow the caller now.',
    permission: 'payment.view',
    kind: 'read',
    idempotency: 'none',
    expectedVersion: 'none',
    audit: 'none',
    resource: jobProject,
    schema: { params: JOB_PARAMS, response: { 200: DEPOSIT_VIEW } },
    handler: async (ctx) => {
      const { jobId } = ctx.req.params as { jobId: string }
      const view = await viewOrThrow(ctx, undefined, jobId)
      return { body: view, version: view.version }
    },
  },
  {
    ...write,
    method: 'PUT',
    path: '/staff/jobs/:jobId/deposit/payment-link',
    operationId: 'setDepositPaymentLink',
    summary: "Enter the deposit request's Square payment link",
    description:
      'Staff with invoice.enter_payment_link (the Owner, Office; OWN-DEC-138). With If-Match: the deposit version ' +
      'shown. The deposit-specific link staff created in the Square app: https on a host of ' +
      'payment.square_link_hosts (PROPOSED list; NOT CONFIGURED refuses). Only while the deposit is still due. ' +
      'Nothing is charged here and nothing returns from Square: a redirect or a customer claim never marks the ' +
      'deposit paid. Returns the deposit view.',
    permission: 'invoice.enter_payment_link',
    expectedVersion: 'required',
    audit: 'deposit.payment_link_set',
    resource: jobProject,
    schema: {
      params: JOB_PARAMS,
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['url'],
        properties: { url: { type: 'string', minLength: 1, maxLength: DEPOSIT_LIMITS.paymentLink } },
      },
      response: { 200: DEPOSIT_VIEW },
    },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const actor = staffActor(ctx)
      const { jobId } = ctx.req.params as { jobId: string }
      const { url } = ctx.req.body as { url: string }
      const out = await setDepositPaymentLink(tx, actor, jobId, { url, expectedVersion: ctx.expectedVersion() })
      await ctx.audit({
        target: { type: 'deposit_requirement', id: jobId, version: out.version },
        summary: { host: out.host, replaced: out.replaced },
      })
      const view = await viewOrThrow(ctx, tx, jobId)
      return { body: view, version: view.version }
    },
  },
  {
    ...write,
    method: 'POST',
    path: '/staff/jobs/:jobId/deposit/payments',
    operationId: 'recordDepositPayment',
    summary: 'Record a verified deposit payment',
    description:
      'Staff with payment.record (the Owner, Office; a Worker only for their own on-site collection with the ' +
      'collect capability on an assigned job). After staff verified the payment: method (one of payment.methods), ' +
      'amount in cents, the date received (not after today), the collector (default: the caller), the transaction ' +
      'reference (required for Square card payments and checks) and the payer for a check. The same method and ' +
      'reference are refused twice (CONFLICT DUPLICATE_PAYMENT). Applied, under the deposit lock, to what the deposit ' +
      'still needs; a remainder stays unapplied for the Owner. A check is received and pending: it satisfies ' +
      'nothing until cleared. Returns the deposit view.',
    permission: 'payment.record',
    expectedVersion: 'none',
    audit: 'payment.record',
    resource: paymentRecordFacts,
    schema: {
      params: JOB_PARAMS,
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['method', 'amountCents', 'receivedOn'],
        properties: {
          method: { type: 'string', enum: [...PAYMENT_METHODS] },
          amountCents: { type: 'integer', minimum: 1, maximum: 100_000_000_00 },
          receivedOn: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
          reference: { type: ['string', 'null'], maxLength: DEPOSIT_LIMITS.reference + 20 },
          payerName: { type: ['string', 'null'], maxLength: DEPOSIT_LIMITS.payerName + 20 },
          memo: { type: ['string', 'null'], maxLength: DEPOSIT_LIMITS.memo + 20 },
          collectorStaffId: { anyOf: [UUID, { type: 'null' }] },
        },
      },
      response: { 201: DEPOSIT_VIEW },
    },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const actor = staffActor(ctx)
      const { jobId } = ctx.req.params as { jobId: string }
      const out = await recordDepositPayment(tx, actor, jobId, ctx.req.body as RecordPaymentInput)
      const body = ctx.req.body as RecordPaymentInput
      await ctx.audit({
        target: { type: 'payment', id: out.paymentId },
        summary: {
          jobId,
          method: body.method,
          amountCents: body.amountCents,
          appliedCents: out.appliedCents,
          unappliedCents: out.unappliedCents,
          state: out.state,
          depositState: out.depositState,
        },
      })
      const view = await viewOrThrow(ctx, tx, jobId)
      return { status: 201, body: view, version: view.version }
    },
  },
  {
    ...write,
    method: 'POST',
    path: '/staff/payments/:paymentId/clear',
    operationId: 'markCheckCleared',
    summary: 'Mark a received check cleared',
    description:
      'The Owner only (check.mark_cleared; OWN-DEC-138), never for a check they collected. A received or deposited ' +
      'check becomes cleared; the deposit it was applied to counts it from now on. Any other payment or state is a ' +
      "CONFLICT. Returns the deposit view of the check's job.",
    permission: 'check.mark_cleared',
    expectedVersion: 'none',
    audit: 'check.mark_cleared',
    resource: paymentOf,
    schema: {
      params: PAYMENT_PARAMS,
      body: { type: 'object', additionalProperties: false, properties: {} },
      response: { 200: DEPOSIT_VIEW },
    },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const actor = staffActor(ctx)
      const { paymentId } = ctx.req.params as { paymentId: string }
      const out = await markCheckCleared(tx, actor, paymentId)
      await ctx.audit({
        target: { type: 'payment', id: paymentId, version: out.version },
        summary: { jobId: out.jobId, state: out.state, depositState: out.depositState },
      })
      const view = await viewOrThrow(ctx, tx, out.jobId)
      return { body: view, version: view.version }
    },
  },
  // TSK-0088 (HH-FIN-11, HH-FIN-12): a check deposited at the bank (still pending), and a payment reconciled.
  ...(
    [
      {
        path: 'deposited',
        operationId: 'markCheckDeposited',
        summary: 'Mark a received check deposited',
        description:
          'The Owner or Office (payment.reconcile; never a check they collected). A received check becomes ' +
          'deposited: still pending, it counts toward nothing until the Owner clears it. Anything else is a CONFLICT ' +
          '(NOT_A_CHECK, CHECK_DEPOSITED, CHECK_CLEARED...). The job’s check_to_clear item follows. Returns the ' +
          'deposit view of the payment’s job.',
        audit: 'check.mark_deposited',
        run: markCheckDeposited,
      },
      {
        path: 'reconcile',
        operationId: 'reconcilePayment',
        summary: 'Reconcile a recorded payment',
        description:
          'The Owner or Office (payment.reconcile; never a payment they collected). A recorded payment that is not a ' +
          'check (cash, card, Zelle, Cash App, Chime) is marked reconciled against the bank or Square: separate from ' +
          'recording it, it changes no balance and sends nothing. A check clears instead (CHECK_CLEARS_INSTEAD). ' +
          'Returns the deposit view of the payment’s job.',
        audit: 'payment.reconcile',
        run: reconcilePayment,
      },
    ] as const
  ).map((d): RouteDef => ({
    ...write,
    method: 'POST',
    path: `/staff/payments/:paymentId/${d.path}`,
    operationId: d.operationId,
    summary: d.summary,
    description: d.description,
    permission: 'payment.reconcile',
    expectedVersion: 'none',
    audit: d.audit,
    resource: paymentOf,
    schema: {
      params: PAYMENT_PARAMS,
      body: { type: 'object', additionalProperties: false, properties: {} },
      response: { 200: DEPOSIT_VIEW },
    },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const { paymentId } = ctx.req.params as { paymentId: string }
      const out = await d.run(tx, staffActor(ctx), paymentId)
      await ctx.audit({
        target: { type: 'payment', id: paymentId, version: out.version },
        summary: { jobId: out.jobId, state: out.state },
      })
      const view = await viewOrThrow(ctx, tx, out.jobId)
      return { body: view, version: view.version }
    },
  })),
  {
    ...write,
    method: 'POST',
    path: '/staff/jobs/:jobId/deposit/waiver',
    operationId: 'waiveJobDeposit',
    summary: "Waive this job's required deposit (Owner only)",
    description:
      'The Owner only (deposit.waive; OWN-DEC-76): a fresh sign-in (password or authenticator code within ' +
      `${FRESH_AUTH_MINUTES} minutes, read again at the write) and a written reason. Every other role, including ` +
      'another administrator, is refused. Job-specific; only while the deposit is still due. It never marks the ' +
      'deposit paid and never changes the price; work visits of the job may then be confirmed. Append-only and ' +
      'audited. Returns the deposit view.',
    permission: 'deposit.waive',
    expectedVersion: 'none',
    freshAuthMinutes: FRESH_AUTH_MINUTES,
    audit: 'deposit.waive',
    resource: jobProject,
    schema: {
      params: JOB_PARAMS,
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['reason'],
        properties: { reason: { type: 'string', minLength: 1, maxLength: DEPOSIT_LIMITS.reason + 100 } },
      },
      response: { 200: DEPOSIT_VIEW },
    },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const actor = staffActor(ctx)
      const session = ctx.req.staffSession
      if (!session) throw new ApiError('UNAUTHENTICATED')
      const { jobId } = ctx.req.params as { jobId: string }
      const { reason } = ctx.req.body as { reason: string }
      const out = await waiveDeposit(tx, actor, { jobId, reason, sessionId: session.sessionId })
      await ctx.audit({
        target: { type: 'deposit_requirement', id: jobId, version: out.version },
        summary: { waiverId: out.waiverId, amountCents: out.amountCents, from: out.previousState, to: 'waived' },
        reason: reason.trim(),
        stepUpUsed: true,
      })
      const view = await viewOrThrow(ctx, tx, jobId)
      return { body: view, version: view.version }
    },
  },
]

/** The finance module: the deposit routes (TSK-0059) and the invoice and ledger routes (TSK-0085, TSK-0086). */
export function financeModule(deps: InvoiceRouteDeps): ApiModule {
  return { name: 'finance', routes: [...routes, ...invoiceRoutes(deps)] }
}
