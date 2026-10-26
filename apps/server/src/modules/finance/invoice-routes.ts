// The invoice and ledger routes (TSK-0085, TSK-0086; HH-FIN-03, HH-FIN-04, HH-FIN-05, HH-FIN-06, HH-FIN-07,
// HH-PORT-10, T58, T59, T64, ENT-Invoice, ENT-Payment, ENT-PaymentAllocation, OWN-DEC-110, OWN-DEC-111, OWN-DEC-138,
// RULE-SERVER-AUTHZ).
//   GET  /staff/jobs/:jobId/invoices                 the job's invoices, their money and exceptions (payment.view)
//   POST /staff/jobs/:jobId/invoices/final-draft     prepare the final invoice draft again (invoice.issue)
//   POST /staff/jobs/:jobId/invoices/deposit-draft   prepare the deposit invoice draft (invoice.issue)
//   POST /staff/invoices/:invoiceId/issue            issue a draft (invoice.issue; the quality-review gate)
//   PUT  /staff/invoices/:invoiceId/payment-link     the invoice's Square link (invoice.enter_payment_link, TSK-0087)
//   POST /staff/invoices/:invoiceId/payments         record a verified payment on an issued invoice (payment.record)
//   GET  /staff/payouts                              recorded Square payouts and fees (payment.view)
//   POST /staff/payouts                              record a Square payout (payout.record)
//   POST /staff/provider-fees                        record a Square fee (fee.record)
//   GET  /customer/projects/:reference/invoices/:number/document   the issued invoice PDF's short-lived link
// Each write is decided by the policy (deny by default), runs in one transaction with its idempotency key and records
// its audit event.
import type { Tx } from '@handyhub/db'
import { ApiError } from '../../api/errors.js'
import type { ApiContext, RouteDef } from '../../api/route.js'
import type { ObjectStorage } from '../../providers/index.js'
import { findProject, INVOICE_DOWNLOADS } from '../records/index.js'
import { DOCUMENT_URL_SECONDS } from '../estimates/projections.js'
import { DEPOSIT_LIMITS, PAYMENT_METHODS, PAYMENT_STATES, projectOfJob, type RecordPaymentInput } from './deposits.js'
import {
  INVOICE_EXCEPTIONS,
  INVOICE_KINDS,
  INVOICE_STATES,
  invoiceFacts,
  issueInvoice,
  jobInvoices,
  prepareDraft,
  type InvoiceKind,
} from './invoices.js'
import {
  LEDGER_LIMITS,
  NO_RECORD,
  payoutsView,
  recordInvoicePayment,
  recordPayout,
  recordProviderFee,
} from './ledger.js'
import { setInvoicePaymentLink } from './payment-links.js'
import { PAYMENT_EXCEPTION_PROPERTIES } from './exceptions.js'

const TEST = 'test/integration/invoices.test.ts'

const UUID = {
  type: 'string',
  pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
} as const
const params = (name: string) =>
  ({ type: 'object', additionalProperties: false, required: [name], properties: { [name]: UUID } }) as const
const NULLABLE_STRING = { type: ['string', 'null'] } as const
const NULLABLE_INT = { type: ['integer', 'null'] } as const
const INT = { type: 'integer' } as const
const DATE_TIME = { type: 'string', format: 'date-time' } as const
const STAFF_REF = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'name'],
  properties: { id: { type: 'string' }, name: NULLABLE_STRING },
} as const
const EMPTY_BODY = { type: 'object', additionalProperties: false, properties: {} } as const

const object = (properties: Record<string, unknown>) => ({
  type: 'object',
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
})
const nullable = (schema: Record<string, unknown>) => ({ anyOf: [{ type: 'null' }, schema] })

const LINE = object({
  position: INT,
  kind: { type: 'string', enum: ['charge', 'credit'] },
  source: { type: 'string', enum: ['estimate_line', 'change_order', 'deposit'] },
  lineKind: { type: ['string', 'null'], enum: ['base', 'alternate', 'add_on', null] },
  serviceCode: NULLABLE_STRING,
  description: { type: 'string' },
  quantity: NULLABLE_STRING,
  unit: NULLABLE_STRING,
  unitPriceCents: NULLABLE_INT,
  amountCents: INT,
})
const MONEY = object({
  invoicedCents: INT,
  depositCreditCents: INT,
  appliedCreditsCents: INT,
  creditsCents: INT,
  writtenOffCents: INT,
  confirmedCents: INT,
  pendingCents: INT,
  remainingCents: INT,
})
const PAYMENT = object({
  id: { type: 'string' },
  method: { type: 'string', enum: [...PAYMENT_METHODS] },
  amountCents: INT,
  appliedCents: INT,
  receivedOn: { type: 'string' },
  reference: NULLABLE_STRING,
  payerName: NULLABLE_STRING,
  state: { type: 'string', enum: [...PAYMENT_STATES] },
  verified: { type: 'boolean' },
  collector: STAFF_REF,
  recordedAt: DATE_TIME,
  canMarkCleared: { type: 'boolean' },
  memo: NULLABLE_STRING,
  receiptNumber: NULLABLE_STRING,
  depositedAt: { anyOf: [{ type: 'null' }, DATE_TIME] },
  reconciledAt: { anyOf: [{ type: 'null' }, DATE_TIME] },
  canMarkDeposited: { type: 'boolean' },
  canReconcile: { type: 'boolean' },
  ...PAYMENT_EXCEPTION_PROPERTIES,
})
const INVOICE = object({
  id: { type: 'string' },
  kind: { type: 'string', enum: [...INVOICE_KINDS] },
  state: { type: 'string', enum: [...INVOICE_STATES] },
  number: NULLABLE_STRING,
  scopeVersion: NULLABLE_INT,
  lines: { type: 'array', items: LINE },
  chargesCents: INT,
  creditLinesCents: INT,
  subtotalCents: INT,
  discount: nullable(object({ category: { type: 'string' }, percentBps: INT, amountCents: INT })),
  totalCents: INT,
  depositCreditCents: INT,
  paymentTermText: { type: 'string' },
  preparedAt: DATE_TIME,
  issuedAt: { anyOf: [{ type: 'null' }, DATE_TIME] },
  issuedBy: nullable(STAFF_REF),
  issuer: nullable(
    object({
      name: { type: 'string' },
      mailingAddress: { anyOf: [{ type: 'null' }, { type: 'array', items: { type: 'string' } }] },
      phone: NULLABLE_STRING,
      email: NULLABLE_STRING,
    }),
  ),
  money: nullable(MONEY),
  payments: { type: 'array', items: PAYMENT },
  exceptions: {
    type: 'array',
    items: object({ code: { type: 'string', enum: [...INVOICE_EXCEPTIONS] }, blocking: { type: 'boolean' } }),
  },
  document: { type: 'string', enum: ['none', 'preparing', 'issued'] },
  testMark: { type: 'boolean' },
  version: INT,
  paymentLink: nullable(object({ url: { type: 'string' }, setBy: STAFF_REF, setAt: DATE_TIME })),
  actions: object({
    issue: { type: 'boolean' },
    recordPayment: { type: 'boolean' },
    setPaymentLink: { type: 'boolean' },
  }),
})
const JOB_INVOICES = object({
  jobId: { type: 'string' },
  final: nullable(INVOICE),
  deposit: nullable(INVOICE),
  unallocatedCents: INT,
  actions: object({ prepareFinal: { type: 'boolean' }, prepareDeposit: { type: 'boolean' } }),
})
const PAYOUTS = object({
  payouts: {
    type: 'array',
    items: object({
      id: { type: 'string' },
      reference: { type: 'string' },
      amountCents: INT,
      paidOutOn: { type: 'string' },
      feesCents: INT,
    }),
  },
  fees: {
    type: 'array',
    items: object({
      id: { type: 'string' },
      amountCents: INT,
      incurredOn: { type: 'string' },
      paymentId: NULLABLE_STRING,
      payoutId: NULLABLE_STRING,
      reference: NULLABLE_STRING,
    }),
  },
})
const DATE = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' } as const
const AMOUNT = { type: 'integer', minimum: 1, maximum: 100_000_000_00 } as const

const staffActor = (ctx: ApiContext) => {
  if (ctx.actor.kind !== 'staff') throw new ApiError('FORBIDDEN')
  return ctx.actor
}

const jobProject: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const projectId = await projectOfJob(db, (req.params as { jobId: string }).jobId)
  return projectId ? { projectId } : null
}
const invoiceProject: NonNullable<RouteDef['resource']> = async ({ req, db }) =>
  invoiceFacts(db, (req.params as { invoiceId: string }).invoiceId)
/** A payment's collector is the body's (the caller when none); a Worker records only their own collection. */
const invoicePaymentFacts: NonNullable<RouteDef['resource']> = async ({ req, actor, db }) => {
  const facts = await invoiceFacts(db, (req.params as { invoiceId: string }).invoiceId)
  if (!facts) return null
  const body = req.body as { collectorStaffId?: string | null } | undefined
  const collector = body?.collectorStaffId ?? (actor.kind === 'staff' ? actor.userId : undefined)
  return { ...facts, assignments: [], ...(collector ? { collectedByStaffId: collector } : {}) }
}

const common = { actors: ['staff'], rateLimit: 'none', pagination: false, test: TEST } as const
const read = {
  ...common,
  method: 'GET',
  kind: 'read',
  idempotency: 'none',
  expectedVersion: 'none',
  audit: 'none',
} as const
const write = { ...common, method: 'POST', kind: 'write', idempotency: 'required' } as const

async function jobView(ctx: ApiContext, tx: Tx | undefined, jobId: string) {
  const view = await jobInvoices(tx ?? ctx.db, staffActor(ctx), jobId)
  if (!view) throw new ApiError('NOT_FOUND')
  return view
}

function draftRoute(kind: InvoiceKind): RouteDef {
  return {
    ...write,
    path: `/staff/jobs/:jobId/invoices/${kind}-draft`,
    operationId: kind === 'final' ? 'prepareFinalInvoiceDraft' : 'prepareDepositInvoiceDraft',
    summary: kind === 'final' ? 'Prepare the final invoice draft' : 'Prepare the deposit invoice draft',
    description:
      kind === 'final'
        ? 'Staff with invoice.issue (the Owner, Office). Prepares the job’s final invoice draft from its current ' +
          'approved scope (the latest job scope snapshot: the approved estimate lines and selected options, later ' +
          'the approved change orders) with the approved discount as its own totals row; brings an existing draft up ' +
          'to date (the approval already prepared one automatically). Never prices anything: a scope whose lines do ' +
          'not add up to its approved totals, or whose credits reach its charges, is a CONFLICT naming why. An issued ' +
          'final invoice is a CONFLICT (one per job). Returns the job’s invoices.'
        : 'Staff with invoice.issue (the Owner, Office). Prepares the deposit invoice draft of a job whose required ' +
          'deposit is still due: one line, the deposit amount the approval pinned. A job without a required deposit, ' +
          'or whose deposit is paid, waived or applied, is a CONFLICT. Returns the job’s invoices.',
    permission: 'invoice.issue',
    expectedVersion: 'none',
    audit: 'invoice.draft_prepared',
    resource: jobProject,
    schema: { params: params('jobId'), body: EMPTY_BODY, response: { 200: JOB_INVOICES } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const actor = staffActor(ctx)
      const { jobId } = ctx.req.params as { jobId: string }
      const out = await prepareDraft(tx, { jobId, kind, preparedBy: actor.userId })
      await ctx.audit({
        target: { type: 'invoice', id: out.invoiceId, version: out.version },
        summary: { jobId, kind, outcome: out.outcome },
      })
      return { body: await jobView(ctx, tx, jobId) }
    },
  }
}

export type InvoiceRouteDeps = { storage: ObjectStorage | null }

export function invoiceRoutes(deps: InvoiceRouteDeps): RouteDef[] {
  return [
    {
      ...read,
      path: '/staff/jobs/:jobId/invoices',
      operationId: 'getJobInvoices',
      summary: "A job's invoices, their money and what blocks issuing",
      description:
        'Staff with payment.view (the Owner, Office). The job’s final and deposit invoices: lines in integer cents ' +
        '(charges, and credit lines as positive magnitudes), the discount row, the total, the deposit credit (pinned ' +
        'at issue; for a draft, what the deposit’s verified money would credit now), and once issued the number, ' +
        'issuer, money (invoiced, credits, confirmed paid, pending checks, remaining) and the payments applied. A ' +
        'draft lists its exceptions; blocking ones refuse the issue (the Owner’s quality review, TSK-0084: ' +
        'QUALITY_REVIEW_NOT_RECORDED until decided, QUALITY_REVIEW_BLOCKED while a major punch item is open). Also the job’s unallocated money (for ' +
        'the Owner’s decision) and the actions the server would allow the caller now.',
      permission: 'payment.view',
      resource: jobProject,
      schema: { params: params('jobId'), response: { 200: JOB_INVOICES } },
      handler: async (ctx) => {
        const { jobId } = ctx.req.params as { jobId: string }
        return { body: await jobView(ctx, undefined, jobId) }
      },
    },
    draftRoute('final'),
    draftRoute('deposit'),
    {
      ...write,
      path: '/staff/invoices/:invoiceId/issue',
      operationId: 'issueInvoice',
      summary: 'Issue an invoice draft',
      description:
        'Staff with invoice.issue (the Owner, Office; OWN-DEC-138). With If-Match: the invoice version shown. A ' +
        'final invoice is issued only once the Owner’s quality review lets it be (finance.invoice_quality_gate: ' +
        'CONFLICT QUALITY_REVIEW_NOT_RECORDED, QUALITY_REVIEW_BLOCKED or QUALITY_REVIEW_OWNER_ONLY), from the job’s current approved scope ' +
        '(SCOPE_CHANGED otherwise), with no deposit check pending (DEPOSIT_CHECK_PENDING); the deposit’s verified ' +
        'money is credited once. A deposit invoice is issued while its deposit is still due. The issuer name NOT ' +
        'CONFIGURED is NOT_CONFIGURED; the missing mailing address and placeholder contact and payment details block ' +
        'nothing. Pins the number (project reference and -I<n>), issuer, contact and payment instructions; the ' +
        'invoice never changes afterwards. Writes invoice.issued or invoice.deposit_issued: the PDF and the one ' +
        'customer notice follow. Returns the job’s invoices.',
      permission: 'invoice.issue',
      expectedVersion: 'required',
      audit: 'invoice.issue',
      resource: invoiceProject,
      schema: { params: params('invoiceId'), body: EMPTY_BODY, response: { 200: JOB_INVOICES } },
      handler: async (ctx) => {
        const tx = ctx.tx as Tx
        const actor = staffActor(ctx)
        const { invoiceId } = ctx.req.params as { invoiceId: string }
        const out = await issueInvoice(tx, actor, { invoiceId, expectedVersion: ctx.expectedVersion() })
        await ctx.audit({
          target: { type: 'invoice', id: invoiceId, version: out.version },
          summary: {
            jobId: out.jobId,
            kind: out.kind,
            number: out.number,
            totalCents: out.totalCents,
            depositCreditCents: out.depositCreditCents,
            state: out.state,
          },
        })
        return { body: await jobView(ctx, tx, out.jobId) }
      },
    },
    {
      ...write,
      method: 'PUT',
      path: '/staff/invoices/:invoiceId/payment-link',
      operationId: 'setInvoicePaymentLink',
      summary: "Enter the invoice's Square payment link",
      description:
        'Staff with invoice.enter_payment_link (the Owner, Office; OWN-DEC-138), on an issued final invoice that ' +
        'still has a balance (a deposit invoice uses the deposit’s own link: DEPOSIT_INVOICE_USES_DEPOSIT_LINK). The ' +
        'invoice-specific link staff created in the Square app: https on a host of payment.square_link_hosts ' +
        '(NOT_HTTPS, NOT_A_SQUARE_LINK, NOT_A_LINK, TOO_LONG; NOT CONFIGURED refuses). A new link replaces the shown ' +
        'one; every link stays recorded. The customer’s Pay by Card opens it while a balance remains. Nothing is ' +
        'charged here and nothing returns from Square: a redirect, a visit or a customer claim never marks anything ' +
        'paid; only a recorded verified payment does. Returns the job’s invoices.',
      permission: 'invoice.enter_payment_link',
      expectedVersion: 'none',
      audit: 'invoice.payment_link_set',
      resource: invoiceProject,
      schema: {
        params: params('invoiceId'),
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['url'],
          properties: { url: { type: 'string', minLength: 1, maxLength: DEPOSIT_LIMITS.paymentLink } },
        },
        response: { 200: JOB_INVOICES },
      },
      handler: async (ctx) => {
        const tx = ctx.tx as Tx
        const { invoiceId } = ctx.req.params as { invoiceId: string }
        const out = await setInvoicePaymentLink(tx, staffActor(ctx), invoiceId, ctx.req.body as { url: string })
        // The host only: the link itself stays on the invoice.
        await ctx.audit({
          target: { type: 'invoice', id: invoiceId },
          summary: { jobId: out.jobId, host: out.host, replaced: out.replaced },
        })
        return { body: await jobView(ctx, tx, out.jobId) }
      },
    },
    {
      ...write,
      path: '/staff/invoices/:invoiceId/payments',
      operationId: 'recordInvoicePayment',
      summary: 'Record a verified payment on an issued invoice',
      description:
        'Staff with payment.record (the Owner, Office; a Worker only for their own on-site collection with the ' +
        'collect capability on an assigned job). After staff verified the payment: method (one of payment.methods), ' +
        'amount in cents, the date received (not after today), the collector (default: the caller), the transaction ' +
        'reference (required for Square card payments and checks) and the payer for a check; the same method and ' +
        'reference are refused twice. Applied, under the invoice’s lock, to what the invoice still asks for counting ' +
        'pending checks; an overpayment’s remainder stays unallocated for the Owner’s credit or refund decision ' +
        '(Owner Decisions), never a negative balance. A check is pending until the Owner clears it. Paid exactly when ' +
        'confirmed payments and credits reach the total (invoice.paid, once). A deposit invoice is paid through the ' +
        'deposit (CONFLICT). Returns the job’s invoices.',
      permission: 'payment.record',
      expectedVersion: 'none',
      audit: 'payment.record',
      resource: invoicePaymentFacts,
      schema: {
        params: params('invoiceId'),
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['method', 'amountCents', 'receivedOn'],
          properties: {
            method: { type: 'string', enum: [...PAYMENT_METHODS] },
            amountCents: AMOUNT,
            receivedOn: DATE,
            reference: { type: ['string', 'null'], maxLength: DEPOSIT_LIMITS.reference + 20 },
            payerName: { type: ['string', 'null'], maxLength: DEPOSIT_LIMITS.payerName + 20 },
            memo: { type: ['string', 'null'], maxLength: DEPOSIT_LIMITS.memo + 20 },
            collectorStaffId: { anyOf: [UUID, { type: 'null' }] },
          },
        },
        response: { 201: JOB_INVOICES },
      },
      handler: async (ctx) => {
        const tx = ctx.tx as Tx
        const actor = staffActor(ctx)
        const { invoiceId } = ctx.req.params as { invoiceId: string }
        const body = ctx.req.body as RecordPaymentInput
        const out = await recordInvoicePayment(tx, actor, invoiceId, body)
        await ctx.audit({
          target: { type: 'payment', id: out.paymentId },
          summary: {
            invoiceId,
            jobId: out.jobId,
            method: body.method,
            amountCents: body.amountCents,
            appliedCents: out.appliedCents,
            unallocatedCents: out.unallocatedCents,
            state: out.state,
            invoiceState: out.invoiceState,
          },
        })
        return { status: 201, body: await jobView(ctx, tx, out.jobId) }
      },
    },
    {
      ...read,
      path: '/staff/payouts',
      operationId: 'listPayouts',
      summary: 'Recorded Square payouts and fees',
      description:
        'Staff with payment.view (the Owner, Office). The Square payouts and fees recorded by hand, newest first ' +
        '(PAYOUT_LIST_LIMIT each): separate records, never part of a customer payment (HH-FIN-06).',
      permission: 'payment.view',
      resource: async () => NO_RECORD,
      schema: { response: { 200: PAYOUTS } },
      handler: async (ctx) => ({ body: await payoutsView(ctx.db) }),
    },
    {
      ...write,
      path: '/staff/payouts',
      operationId: 'recordPayout',
      summary: 'Record a Square payout',
      description:
        'Staff with payout.record (the Owner; Office PROPOSED). The Square payout ID, the net amount paid out in ' +
        'cents and the date (not after today). The same payout ID is refused twice. A payout never changes a ' +
        'customer balance: a verified payment counts when recorded (HH-FIN-06). Returns the payouts and fees.',
      permission: 'payout.record',
      expectedVersion: 'none',
      audit: 'payout.record',
      resource: async () => NO_RECORD,
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['reference', 'amountCents', 'paidOutOn'],
          properties: {
            reference: { type: 'string', minLength: 1, maxLength: LEDGER_LIMITS.reference + 20 },
            amountCents: AMOUNT,
            paidOutOn: DATE,
          },
        },
        response: { 201: PAYOUTS },
      },
      handler: async (ctx) => {
        const tx = ctx.tx as Tx
        const body = ctx.req.body as { reference: string; amountCents: number; paidOutOn: string }
        const out = await recordPayout(tx, staffActor(ctx), body)
        await ctx.audit({
          target: { type: 'payout', id: out.payoutId },
          summary: { amountCents: body.amountCents, paidOutOn: body.paidOutOn },
        })
        return { status: 201, body: await payoutsView(tx) }
      },
    },
    {
      ...write,
      path: '/staff/provider-fees',
      operationId: 'recordProviderFee',
      summary: 'Record a Square fee',
      description:
        'Staff with fee.record (the Owner; Office PROPOSED). A Square fee in cents with its date, on a Square card ' +
        'payment (never cash, a check or another method) and/or the payout it was deducted in, and an optional ' +
        'reference. Never deducted from the customer payment: the payment stays as recorded (HH-FIN-06). Returns the ' +
        'payouts and fees.',
      permission: 'fee.record',
      expectedVersion: 'none',
      audit: 'fee.record',
      resource: async () => NO_RECORD,
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['amountCents', 'incurredOn'],
          properties: {
            amountCents: AMOUNT,
            incurredOn: DATE,
            paymentId: { anyOf: [UUID, { type: 'null' }] },
            payoutId: { anyOf: [UUID, { type: 'null' }] },
            reference: { type: ['string', 'null'], maxLength: LEDGER_LIMITS.reference + 20 },
          },
        },
        response: { 201: PAYOUTS },
      },
      handler: async (ctx) => {
        const tx = ctx.tx as Tx
        const body = ctx.req.body as {
          amountCents: number
          incurredOn: string
          paymentId?: string | null
          payoutId?: string | null
          reference?: string | null
        }
        const out = await recordProviderFee(tx, staffActor(ctx), body)
        await ctx.audit({
          target: { type: 'provider_fee', id: out.feeId },
          summary: {
            amountCents: body.amountCents,
            incurredOn: body.incurredOn,
            paymentId: body.paymentId ?? null,
            payoutId: body.payoutId ?? null,
          },
        })
        return { status: 201, body: await payoutsView(tx) }
      },
    },
    {
      method: 'GET',
      actors: ['customer'],
      kind: 'read',
      idempotency: 'none',
      expectedVersion: 'none',
      rateLimit: 'none',
      audit: 'none',
      pagination: false,
      test: TEST,
      path: '/customer/projects/:reference/invoices/:number/document',
      operationId: 'getCustomerInvoiceDownload',
      summary: 'Download link of an issued invoice',
      description:
        'The project’s verified customer (payment.view, ROLE-MATRIX "V"; HH-PORT-10, HH-PRIV-06): a short-lived ' +
        'signed link (DOCUMENT_URL_SECONDS) issued now, after the record and visibility checks, to the issued ' +
        'invoice’s English PDF. A draft, another project’s invoice and an unknown number are NOT_FOUND (T19); a PDF ' +
        'still being prepared is CONFLICT DOCUMENT_PREPARING; storage NOT CONFIGURED is NOT_CONFIGURED. Each issued ' +
        'link is recorded in the audit log (invoice_document.customer_download, TSK-0124).',
      permission: 'payment.view',
      projection: INVOICE_DOWNLOADS,
      resource: async ({ req, db }) => {
        const { reference } = req.params as { reference: string }
        const p = await db.selectFrom('crm.projects').select('id').where('reference', '=', reference).executeTakeFirst()
        return p ? { projectId: p.id } : null
      },
      schema: {
        params: {
          type: 'object',
          additionalProperties: false,
          required: ['reference', 'number'],
          properties: {
            reference: { type: 'string', minLength: 1, maxLength: 40 },
            number: { type: 'string', minLength: 1, maxLength: 40 },
          },
        },
        response: { 200: INVOICE_DOWNLOADS.schema },
      },
      handler: async (ctx) => {
        const p = ctx.req.params as { reference: string; number: string }
        const project = await findProject(ctx.db, ctx.scope, { reference: p.reference })
        if (!project) throw new ApiError('NOT_FOUND')
        const row = await ctx.db
          .selectFrom('finance.invoices as i')
          .leftJoin('finance.invoice_documents as d', 'd.invoice_id', 'i.id')
          .select(['i.id', 'i.number', 'i.state', 'd.object_key', 'd.byte_size'])
          .where('i.project_id', '=', project.id)
          .where('i.number', '=', p.number)
          .where('i.state', '<>', 'draft')
          .executeTakeFirst()
        if (!row || !row.number) throw new ApiError('NOT_FOUND')
        if (!deps.storage) throw new ApiError('NOT_CONFIGURED')
        if (!row.object_key || !row.byte_size)
          throw new ApiError('CONFLICT', {
            fieldErrors: [{ field: 'document', code: 'DOCUMENT_PREPARING', message: '' }],
          })
        const now = new Date()
        // TSK-0124 (HH-ID-14, OWN-DEC-160 "maintain access logs"): each issued download link is logged (staff only).
        await ctx.auditAlways({
          action: 'invoice_document.customer_download',
          target: { type: 'invoice', id: row.id },
          summary: { number: row.number },
        })
        return {
          body: INVOICE_DOWNLOADS.project({
            reference: project.reference,
            number: row.number,
            documents: [
              {
                kind: 'invoice_pdf',
                contentType: 'application/pdf',
                byteSize: row.byte_size,
                url: await deps.storage.signedGetUrl(row.object_key, { expiresInSeconds: DOCUMENT_URL_SECONDS }),
                expiresAt: new Date(now.getTime() + DOCUMENT_URL_SECONDS * 1000),
              },
            ],
          }),
        }
      },
    },
  ]
}
