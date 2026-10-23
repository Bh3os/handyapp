// The finance module's deposit routes (TSK-0059; HH-FIN-02, HH-FIN-03, HH-FIN-09, HH-FIN-12, T36, T59, T64,
// ENT-DepositRequirement, ENT-Payment, ENT-PaymentAllocation, INT-Square, OWN-DEC-76, OWN-DEC-104, OWN-DEC-138,
// RULE-SERVER-AUTHZ).
//   GET  /staff/jobs/:jobId/deposit                 the job's deposit (payment.view: Owner, Office)
//   PUT  /staff/jobs/:jobId/deposit/payment-link    the deposit request's Square link (invoice.enter_payment_link)
//   POST /staff/jobs/:jobId/deposit/payments        record a verified deposit payment (payment.record)
//   POST /staff/payments/:paymentId/clear           the Owner marks a check cleared (check.mark_cleared)
//   GET  /staff/jobs/:jobId/collection              TSK-0088: what may be collected on site (payment.record, own)
//   POST /staff/jobs/:jobId/collection              TSK-0088: the collector's own on-site collection
//   POST /staff/payments/:paymentId/deposited       TSK-0088: a check deposited, still pending (payment.reconcile)
//   POST /staff/payments/:paymentId/reconcile       TSK-0088: a recorded payment reconciled (payment.reconcile)
//   POST /staff/payments/:paymentId/returned        TSK-0089: a check returned (check.mark_returned)
//   POST /staff/payments/:paymentId/adjustments     TSK-0089: failed, dispute opened/won/lost (payment.correct, fresh)
//   POST /staff/payments/:paymentId/correction      TSK-0089: void and record the right payment (payment.correct)
//   POST /staff/jobs/:jobId/deposit/waiver          the Owner's waiver: fresh sign-in and a reason (deposit.waive)
// Each write is decided by the policy (deny by default), runs in one transaction with its idempotency key and records
// its audit event. The work-scheduling gate is deposit-gate.ts, called by the confirming transaction itself.
import type { Tx } from '@handyhub/db'
import { ApiError } from '../../api/errors.js'
import type { ApiContext, ApiModule, RouteDef } from '../../api/route.js'
import { FRESH_AUTH_MINUTES } from '../identity/sessions.js'
import { adjustmentRoutes } from './adjustment-routes.js'
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
import {
  ADJUSTMENT_LIMITS,
  adjustPayment,
  correctPayment,
  PAYMENT_EXCEPTION_FIELDS,
  PAYMENT_EXCEPTION_PROPERTIES,
  type AdjustedPayment,
  type AdjustmentKind,
  type Replacement,
} from './exceptions.js'
import { collectionView, collectOnSite, ON_SITE_METHODS, type CollectInput } from './collection.js'
import { jobAssignments } from '../packets/assignments.js'
export { customerInvoiceList, issueInvoice, jobInvoices, prepareDraft, qualityGate } from './invoices.js'
export { INVOICE_PAID_EVENT } from './money-events.js'
export { issuePaymentReceipt, paymentReceiptAutomation, RECEIPT_ISSUED_EVENT } from './receipts.js'
export { jobDisputeOpen } from './exceptions.js'

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
          ...PAYMENT_EXCEPTION_FIELDS,
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
          ...PAYMENT_EXCEPTION_PROPERTIES,
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

/** The collector's facts: the job's project, its assignments, and the caller as the collector (own collection). */
const collectorFacts: NonNullable<RouteDef['resource']> = async ({ req, actor, db }) => {
  const { jobId } = req.params as { jobId: string }
  const projectId = await projectOfJob(db, jobId)
  if (!projectId) return null
  return {
    projectId,
    assignments: await jobAssignments(db, jobId),
    ...(actor.kind === 'staff' ? { collectedByStaffId: actor.userId } : {}),
  }
}
const COLLECTION_AMOUNT = {
  type: 'object',
  additionalProperties: false,
  required: ['remainingCents', 'pendingCents'],
  properties: { remainingCents: { type: 'integer' }, pendingCents: { type: 'integer' } },
} as const
const COLLECTION_VIEW = {
  type: 'object',
  additionalProperties: false,
  required: ['jobId', 'reference', 'deposit', 'invoice', 'methods', 'mine'],
  properties: {
    jobId: { type: 'string' },
    reference: { type: 'string' },
    deposit: { anyOf: [{ type: 'null' }, COLLECTION_AMOUNT] },
    invoice: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          required: ['number', 'remainingCents', 'pendingCents'],
          properties: {
            number: { type: 'string' },
            remainingCents: { type: 'integer' },
            pendingCents: { type: 'integer' },
          },
        },
      ],
    },
    methods: { type: 'array', items: { type: 'string', enum: [...ON_SITE_METHODS] } },
    mine: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['method', 'amountCents', 'receivedOn', 'state', 'receiptNumber'],
        properties: {
          method: { type: 'string' },
          amountCents: { type: 'integer' },
          receivedOn: { type: 'string' },
          state: { type: 'string' },
          receiptNumber: NULLABLE_STRING,
        },
      },
    },
  },
} as const

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

const ADJUSTMENT_BODY = {
  type: 'object',
  additionalProperties: false,
  required: ['reason'],
  properties: {
    reason: { type: 'string', minLength: 1, maxLength: ADJUSTMENT_LIMITS.reason + 100 },
    evidence: { type: ['string', 'null'], maxLength: ADJUSTMENT_LIMITS.evidence + 100 },
  },
} as const

const adjustmentSummary = (a: AdjustedPayment) => ({
  jobId: a.jobId,
  adjustmentId: a.adjustmentId,
  kind: a.kind,
  from: a.from,
  to: a.state,
  reversedCents: a.reversedCents,
})

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
  // TSK-0088 part 2 (HH-FIN-11, T62, OWN-DEC-200): the collector's own on-site collection, from the job packet.
  {
    ...common,
    method: 'GET',
    kind: 'read',
    idempotency: 'none',
    expectedVersion: 'none',
    audit: 'none',
    path: '/staff/jobs/:jobId/collection',
    operationId: 'getOnSiteCollection',
    summary: 'What may be collected on site for this job',
    description:
      'Staff with payment.record for their own collection: the Owner, Office, or a Worker with the Owner’s collect ' +
      'grant on a job they are assigned to inside its access window (anyone else: FORBIDDEN). Only what the ' +
      'collector needs: the deposit still due and pending, the issued final invoice’s balance and pending, the ' +
      'methods taken in person (cash, check, Square Tap to Pay; PROPOSED) and the caller’s own collections on the ' +
      'job with their receipt numbers. Never other payments, references, collectors or invoice lines.',
    permission: 'payment.record',
    resource: collectorFacts,
    schema: { params: JOB_PARAMS, response: { 200: COLLECTION_VIEW } },
    handler: async (ctx) => {
      const { jobId } = ctx.req.params as { jobId: string }
      const view = await collectionView(ctx.db, staffActor(ctx), jobId)
      if (!view) throw new ApiError('NOT_FOUND')
      return { body: view, headers: { 'cache-control': 'no-store' } }
    },
  },
  {
    ...write,
    method: 'POST',
    path: '/staff/jobs/:jobId/collection',
    operationId: 'collectOnSite',
    summary: 'Record money collected on site, as the collector',
    description:
      'The same staff as the read, always as the collector themselves. Cash, a check (its number and payer; pending ' +
      'until the Owner clears it) or Square Tap to Pay (its Square payment ID), toward the deposit while it is due ' +
      'or the issued final invoice (NO_INVOICE_TO_PAY otherwise), dated the business day of the recording, with an ' +
      'optional memo. Recorded through the office’s own transactions: the same method and reference twice is ' +
      'refused; the receipt goes at once for cash and card; Paid and any overpayment follow. Returns the view.',
    permission: 'payment.record',
    expectedVersion: 'none',
    audit: 'payment.record',
    resource: collectorFacts,
    schema: {
      params: JOB_PARAMS,
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['target', 'method', 'amountCents'],
        properties: {
          target: { type: 'string', enum: ['deposit', 'invoice'] },
          method: { type: 'string', enum: [...ON_SITE_METHODS] },
          amountCents: { type: 'integer', minimum: 1, maximum: 100_000_000_00 },
          reference: { type: ['string', 'null'], maxLength: DEPOSIT_LIMITS.reference + 20 },
          payerName: { type: ['string', 'null'], maxLength: DEPOSIT_LIMITS.payerName + 20 },
          memo: { type: ['string', 'null'], maxLength: DEPOSIT_LIMITS.memo + 20 },
        },
      },
      response: { 201: COLLECTION_VIEW },
    },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const actor = staffActor(ctx)
      const { jobId } = ctx.req.params as { jobId: string }
      const body = ctx.req.body as CollectInput
      const out = await collectOnSite(tx, actor, jobId, body)
      await ctx.audit({
        target: { type: 'payment', id: out.paymentId },
        summary: { jobId, target: body.target, method: body.method, amountCents: body.amountCents, state: out.state },
      })
      const view = await collectionView(tx, actor, jobId)
      if (!view) throw new ApiError('NOT_FOUND')
      return { status: 201, body: view }
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
  // TSK-0089 part 1 (HH-FIN-13, HH-FIN-14, T63): a check returned, a payment failed or disputed, a payment corrected.
  {
    ...write,
    method: 'POST',
    path: '/staff/payments/:paymentId/returned',
    operationId: 'markCheckReturned',
    summary: 'Record a check returned by the bank',
    description:
      'The Owner or Office (check.mark_returned), with a reason and optional evidence (the bank notice). A received, ' +
      'deposited or cleared check becomes returned; nothing is edited or deleted: the adjustment and a reversing ' +
      'allocation for each of its allocations are appended, the balance reopens, a deposit it satisfied reverts to ' +
      'required (a deposit already credited reopens the final invoice), its receipt shows voided. Anything else is a ' +
      'CONFLICT (NOT_A_CHECK, PAYMENT_RETURNED, PAYMENT_VOIDED). Returns the deposit view of the payment’s job.',
    permission: 'check.mark_returned',
    expectedVersion: 'none',
    audit: 'check.mark_returned',
    resource: paymentOf,
    schema: {
      params: PAYMENT_PARAMS,
      body: ADJUSTMENT_BODY,
      response: { 200: DEPOSIT_VIEW },
    },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const { paymentId } = ctx.req.params as { paymentId: string }
      const body = ctx.req.body as { reason: string; evidence?: string | null }
      const out = await adjustPayment(tx, staffActor(ctx), paymentId, {
        kind: 'returned',
        reason: body.reason,
        evidence: body.evidence ?? null,
      })
      await ctx.audit({
        target: { type: 'payment', id: paymentId, version: out.version },
        summary: adjustmentSummary(out),
        reason: body.reason.trim(),
      })
      const view = await viewOrThrow(ctx, tx, out.jobId)
      return { body: view, version: view.version }
    },
  },
  {
    ...write,
    method: 'POST',
    path: '/staff/payments/:paymentId/adjustments',
    operationId: 'adjustPayment',
    summary: 'Record a failed payment or a dispute and its outcome (Owner only)',
    description:
      'The Owner only (payment.correct): a fresh sign-in (password or authenticator code within ' +
      `${FRESH_AUTH_MINUTES} minutes, read again at the write), a reason and optional evidence (the Square dispute ` +
      'ID). failed: a card or digital payment that did not go through returns it (the balance reopens, its receipt ' +
      'shows voided). dispute_opened: the money still counts until the outcome (PROPOSED); the payment waits ' +
      '(no reconcile, void or failure) and the Owner Decisions item payment_dispute stays open; dispute_won closes ' +
      'it with no money change; dispute_lost returns the payment. Appended, never an edit. Returns the deposit view.',
    permission: 'payment.correct',
    expectedVersion: 'none',
    freshAuthMinutes: FRESH_AUTH_MINUTES,
    audit: 'payment.adjust',
    resource: paymentOf,
    schema: {
      params: PAYMENT_PARAMS,
      body: {
        ...ADJUSTMENT_BODY,
        required: ['kind', 'reason'],
        properties: {
          ...ADJUSTMENT_BODY.properties,
          kind: { type: 'string', enum: ['failed', 'dispute_opened', 'dispute_won', 'dispute_lost'] },
        },
      },
      response: { 200: DEPOSIT_VIEW },
    },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const session = ctx.req.staffSession
      if (!session) throw new ApiError('UNAUTHENTICATED')
      const { paymentId } = ctx.req.params as { paymentId: string }
      const body = ctx.req.body as { kind: AdjustmentKind; reason: string; evidence?: string | null }
      const out = await adjustPayment(tx, staffActor(ctx), paymentId, {
        kind: body.kind,
        reason: body.reason,
        evidence: body.evidence ?? null,
        sessionId: session.sessionId,
      })
      await ctx.audit({
        target: { type: 'payment', id: paymentId, version: out.version },
        summary: adjustmentSummary(out),
        reason: body.reason.trim(),
        stepUpUsed: true,
      })
      const view = await viewOrThrow(ctx, tx, out.jobId)
      return { body: view, version: view.version }
    },
  },
  {
    ...write,
    method: 'POST',
    path: '/staff/payments/:paymentId/correction',
    operationId: 'correctPayment',
    summary: 'Void a payment recorded wrongly and record the right one (Owner only)',
    description:
      'The Owner only (payment.correct): a fresh sign-in, a reason and optional evidence. The wrong payment is ' +
      'voided (never edited or deleted: its allocations are reversed, its receipt shows voided) and, when a ' +
      'replacement is given, the right payment is recorded in the same transaction naming the one it corrects, toward ' +
      'the deposit while it is still due or else the issued final invoice; what the replacement leaves out is the ' +
      'voided payment’s own (method, date, reference, payer, memo, collector). The replacement is validated like any ' +
      'recorded payment and gets its own receipt. A payment with an open dispute waits for its outcome ' +
      '(DISPUTE_OPEN). Returns the deposit view.',
    permission: 'payment.correct',
    expectedVersion: 'none',
    freshAuthMinutes: FRESH_AUTH_MINUTES,
    audit: 'payment.correct',
    resource: paymentOf,
    schema: {
      params: PAYMENT_PARAMS,
      body: {
        ...ADJUSTMENT_BODY,
        properties: {
          ...ADJUSTMENT_BODY.properties,
          replacement: {
            anyOf: [
              { type: 'null' },
              {
                type: 'object',
                additionalProperties: false,
                required: ['amountCents'],
                properties: {
                  method: { type: 'string', enum: [...PAYMENT_METHODS] },
                  amountCents: { type: 'integer', minimum: 1 },
                  receivedOn: { type: 'string', maxLength: 10 },
                  reference: { type: ['string', 'null'], maxLength: DEPOSIT_LIMITS.reference + 50 },
                  payerName: { type: ['string', 'null'], maxLength: DEPOSIT_LIMITS.payerName + 50 },
                  memo: { type: ['string', 'null'], maxLength: DEPOSIT_LIMITS.memo + 50 },
                },
              },
            ],
          },
        },
      },
      response: { 200: DEPOSIT_VIEW },
    },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const session = ctx.req.staffSession
      if (!session) throw new ApiError('UNAUTHENTICATED')
      const { paymentId } = ctx.req.params as { paymentId: string }
      const body = ctx.req.body as { reason: string; evidence?: string | null; replacement?: Replacement | null }
      const out = await correctPayment(tx, staffActor(ctx), paymentId, {
        reason: body.reason,
        evidence: body.evidence ?? null,
        sessionId: session.sessionId,
        replacement: body.replacement ?? null,
      })
      await ctx.audit({
        target: { type: 'payment', id: paymentId, version: out.voided.version },
        summary: {
          ...adjustmentSummary(out.voided),
          replacementId: out.replacementId,
          replacementState: out.replacementState,
          replacementCents: body.replacement?.amountCents ?? null,
        },
        reason: body.reason.trim(),
        stepUpUsed: true,
      })
      const view = await viewOrThrow(ctx, tx, out.voided.jobId)
      return { body: view, version: view.version }
    },
  },
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

/**
 * The finance module: the deposit routes (TSK-0059), the invoice and ledger routes (TSK-0085, TSK-0086) and the
 * refund, credit, write-off and void routes (TSK-0089).
 */
export function financeModule(deps: InvoiceRouteDeps): ApiModule {
  return { name: 'finance', routes: [...routes, ...invoiceRoutes(deps), ...adjustmentRoutes()] }
}
