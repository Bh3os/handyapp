// The routes of the unpaid-invoice reminders (TSK-0091; HH-FIN-19, OWN-DEC-210, OWN-DEC-112, RULE-SERVER-AUTHZ). See
// invoice-reminders.ts.
//   GET  /staff/invoices/:invoiceId/reminders            the invoice's reminders, its due date, stop rule and steps
//   POST /staff/invoices/:invoiceId/reminders/steps      a revised due date, a payment plan, a collection hold, an end
//   POST /staff/invoices/:invoiceId/reminders/follow-up  release a follow-up reminder now
//   POST /staff/invoices/:invoiceId/overdue-decision     the Owner's "Overdue—owner decision"
// The automatic reminders themselves are sent by the server, never released by a person. Every write is decided by the
// policy (payment_reminder.release: the Owner, Office; invoice.decide_overdue: the Owner), runs in one transaction with
// its idempotency key and records its audit event.
import type { Tx } from '@handyhub/db'
import { ApiError } from '../../api/errors.js'
import type { ApiContext, RouteDef } from '../../api/route.js'
import {
  COLLECTION_STEP_KINDS,
  COLLECTION_STEP_LIMITS,
  decideOverdue,
  invoiceRemindersView,
  RECORDED_STEP_KINDS,
  recordCollectionStep,
  releaseFollowUp,
  reminderInvoiceFacts,
  UNPAID_REMINDER_SKIP_REASONS,
  UNPAID_REMINDER_STOP_REASONS,
  type RecordStepInput,
} from './invoice-reminders.js'

const TEST = 'test/integration/invoice-reminders.test.ts'

const UUID = {
  type: 'string',
  pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
} as const
const STRING = { type: 'string' } as const
const NULLABLE_STRING = { type: ['string', 'null'] } as const
const DATE_TIME = { type: 'string', format: 'date-time' } as const
const NULLABLE_DATE_TIME = { type: ['string', 'null'], format: 'date-time' } as const
const object = (properties: Record<string, unknown>) => ({
  type: 'object',
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
})
const PARAMS = object({ invoiceId: UUID })
const STAGE = { type: ['integer', 'null'], enum: [1, 2, null] } as const
const VIEW = object({
  invoiceId: STRING,
  jobId: STRING,
  projectReference: STRING,
  invoiceNumber: NULLABLE_STRING,
  invoiceState: STRING,
  cadence: {
    type: 'object',
    additionalProperties: false,
    required: ['state'],
    properties: {
      state: { type: 'string', enum: ['CONFIGURED', 'NOT_CONFIGURED'] },
      proposed: { type: 'boolean' },
      firstDaysAfterDue: { type: 'integer' },
      secondDaysAfterDue: { type: 'integer' },
    },
  },
  dueOn: { type: ['string', 'null'], format: 'date' },
  dueRevised: { type: 'boolean' },
  stageDueAt: { type: 'array', items: object({ stage: { type: 'integer', enum: [1, 2] }, dueAt: NULLABLE_DATE_TIME }) },
  stoppedBy: { type: ['string', 'null'], enum: [...UNPAID_REMINDER_STOP_REASONS, null] },
  reminders: {
    type: 'array',
    items: object({
      id: STRING,
      stage: STAGE,
      release: { type: 'string', enum: ['automatic', 'staff_released'] },
      state: { type: 'string', enum: ['draft', 'queued', 'sent', 'delivered', 'failed', 'suppressed', 'cancelled'] },
      reason: NULLABLE_STRING,
      scheduledAt: NULLABLE_DATE_TIME,
      sentAt: NULLABLE_DATE_TIME,
      cancelledAt: NULLABLE_DATE_TIME,
    }),
  },
  steps: {
    type: 'array',
    items: object({
      id: STRING,
      kind: { type: 'string', enum: [...COLLECTION_STEP_KINDS] },
      dueOn: { type: ['string', 'null'], format: 'date' },
      endsStepId: NULLABLE_STRING,
      ended: { type: 'boolean' },
      note: NULLABLE_STRING,
      recordedBy: object({ id: STRING, name: NULLABLE_STRING }),
      recordedAt: DATE_TIME,
    }),
  },
  review: { type: 'boolean' },
  overdue: { type: 'boolean' },
  actions: object({
    recordStep: { type: 'boolean' },
    releaseFollowUp: { type: 'boolean' },
    followUpBlockedBy: NULLABLE_STRING,
    decideOverdue: { type: 'boolean' },
  }),
})
const NOTE = { type: 'string', minLength: 1, maxLength: COLLECTION_STEP_LIMITS.note + 100 } as const

const staffActor = (ctx: ApiContext) => {
  if (ctx.actor.kind !== 'staff') throw new ApiError('FORBIDDEN')
  return ctx.actor
}
const facts: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const { invoiceId } = req.params as { invoiceId: string }
  return reminderInvoiceFacts(db, invoiceId)
}
async function viewOrThrow(ctx: ApiContext, db: ApiContext['db'] | Tx) {
  const { invoiceId } = ctx.req.params as { invoiceId: string }
  const view = await invoiceRemindersView(db, staffActor(ctx), invoiceId)
  if (!view) throw new ApiError('NOT_FOUND')
  return view
}

const common = { actors: ['staff'], rateLimit: 'none', pagination: false, test: TEST, resource: facts } as const
const write = { ...common, method: 'POST', kind: 'write', idempotency: 'required', expectedVersion: 'none' } as const

export function invoiceReminderRoutes(): RouteDef[] {
  return [
    {
      ...common,
      method: 'GET',
      kind: 'read',
      idempotency: 'none',
      expectedVersion: 'none',
      audit: 'none',
      path: '/staff/invoices/:invoiceId/reminders',
      operationId: 'getInvoiceReminders',
      summary: "A final invoice's unpaid-balance reminders",
      description:
        'The Owner and Office (payment_reminder.release). The automatic reminders of one final invoice (OWN-DEC-210): ' +
        'the configured days after the due date (reminders.cadences.unpaidInvoice, 3 and 7), the due date they count ' +
        'from (the issue date for due on receipt, or the latest revised due date) and when each stage is due; the stop ' +
        'rule as the records are now (' +
        UNPAID_REMINDER_STOP_REASONS.join(', ') +
        '); every reminder and follow-up with its state and why it stopped, waits or failed (also ' +
        UNPAID_REMINDER_SKIP_REASONS.join(', ') +
        '); the collection steps staff recorded; whether the invoice waits for staff review or for the Owner’s ' +
        'Overdue—owner decision; and what this caller may do. Email only; the destination is not shown. NOT_FOUND ' +
        'when there is no final invoice.',
      permission: 'payment_reminder.release',
      schema: { params: PARAMS, response: { 200: VIEW } },
      handler: async (ctx) => ({ body: await viewOrThrow(ctx, ctx.db) }),
    },
    {
      ...write,
      path: '/staff/invoices/:invoiceId/reminders/steps',
      operationId: 'recordInvoiceCollectionStep',
      summary: 'Record a revised due date, a payment plan, a collection hold or its end',
      description:
        'The Owner or Office (payment_reminder.release), on an issued final invoice with a balance, with a note of what ' +
        'was agreed: revised_due_date (dueOn, from today to 365 days ahead in the business time zone, PROPOSED): the ' +
        'reminder stages still unsent count from it at once, those waiting under the earlier date are cancelled; ' +
        'payment_plan or collection_hold: no automatic reminder while it is active (one of each at a time); ' +
        'arrangement_ended (endsStepId): ends an active plan or hold, which restarts nothing by itself. CONFLICT ' +
        '(INVOICE_PAID, INVOICE_VOIDED, ARRANGEMENT_ACTIVE, ARRANGEMENT_NOT_ACTIVE). Audited. Returns the view.',
      permission: 'payment_reminder.release',
      audit: 'invoice.collection_step',
      schema: {
        params: PARAMS,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['kind', 'note'],
          properties: {
            kind: { type: 'string', enum: [...RECORDED_STEP_KINDS] },
            dueOn: { type: ['string', 'null'], maxLength: 10 },
            endsStepId: { anyOf: [{ type: 'null' }, UUID] },
            note: NOTE,
          },
        },
        response: { 201: VIEW },
      },
      handler: async (ctx) => {
        const tx = ctx.tx as Tx
        const { invoiceId } = ctx.req.params as { invoiceId: string }
        const body = ctx.req.body as RecordStepInput
        const out = await recordCollectionStep(tx, staffActor(ctx), invoiceId, body)
        await ctx.audit({
          target: { type: 'invoice', id: invoiceId },
          summary: { stepId: out.id, kind: out.kind, dueOn: body.dueOn ?? null, endsStepId: body.endsStepId ?? null },
          reason: body.note.trim(),
        })
        return { status: 201, body: await viewOrThrow(ctx, tx) }
      },
    },
    {
      ...write,
      path: '/staff/invoices/:invoiceId/reminders/follow-up',
      operationId: 'releaseInvoiceFollowUp',
      summary: 'Release a follow-up reminder',
      description:
        'The Owner or Office (payment_reminder.release): one follow-up email in the owner-authorized wording ' +
        '(unpaid_invoice_follow_up; no amount), after the second automatic reminder was sent or after a payment ' +
        'suspended the reminders, while no plan, hold, dispute or review stops them. Sent at once by notify.release ' +
        'and rechecked then (a payment recorded after the release cancels it). CONFLICT ' +
        '(AUTOMATIC_REMINDERS_PENDING, FOLLOW_UP_WAITING, a stop reason, NO_EMAIL_ADDRESS). Audited. Returns the view.',
      permission: 'payment_reminder.release',
      audit: 'invoice.follow_up_released',
      schema: {
        params: PARAMS,
        body: {
          type: 'object',
          additionalProperties: false,
          properties: { note: { type: ['string', 'null'], maxLength: COLLECTION_STEP_LIMITS.note + 100 } },
        },
        response: { 201: VIEW },
      },
      handler: async (ctx) => {
        const tx = ctx.tx as Tx
        const { invoiceId } = ctx.req.params as { invoiceId: string }
        const body = (ctx.req.body ?? {}) as { note?: string | null }
        const out = await releaseFollowUp(tx, staffActor(ctx), invoiceId, body)
        await ctx.audit({
          target: { type: 'invoice', id: invoiceId },
          summary: { stepId: out.stepId, deliveryId: out.deliveryId },
        })
        return { status: 201, body: await viewOrThrow(ctx, tx) }
      },
    },
    {
      ...write,
      path: '/staff/invoices/:invoiceId/overdue-decision',
      operationId: 'decideInvoiceOverdue',
      summary: 'The Owner’s Overdue—owner decision',
      description:
        'The Owner (invoice.decide_overdue), while the invoice waits in Owner Decisions after the second reminder: ' +
        'records the decision with a note (staff keep following up with released reminders) and resolves the item. ' +
        'A payment plan, collection hold or revised due date (the steps route) or a write-off (TSK-0089) also resolves ' +
        'it. Never collections, a late fee or an automatic write-off. CONFLICT (NOT_OVERDUE, INVOICE_PAID). Audited. ' +
        'Returns the view.',
      permission: 'invoice.decide_overdue',
      audit: 'invoice.overdue_decided',
      schema: {
        params: PARAMS,
        body: { type: 'object', additionalProperties: false, required: ['note'], properties: { note: NOTE } },
        response: { 200: VIEW },
      },
      handler: async (ctx) => {
        const tx = ctx.tx as Tx
        const { invoiceId } = ctx.req.params as { invoiceId: string }
        const body = ctx.req.body as { note: string }
        const out = await decideOverdue(tx, staffActor(ctx), invoiceId, body)
        await ctx.audit({
          target: { type: 'invoice', id: invoiceId },
          summary: { stepId: out.id },
          reason: body.note.trim(),
        })
        return { body: await viewOrThrow(ctx, tx) }
      },
    },
  ]
}
