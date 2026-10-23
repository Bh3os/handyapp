// Refunds, credits, write-offs and invoice voids (TSK-0089 part 2; HH-FIN-14, HH-FIN-03, HH-FIN-07, T63, T64,
// ENT-Refund, ENT-Invoice, OWN-DEC-138, RULE-HUMAN-REVIEW, RULE-SERVER-AUTHZ). Migration 0095 keeps the records true
// whatever path writes.
// - Each is the Owner's alone (payment.refund, payment.credit, payment.write_off, invoice.void): a fresh sign-in
//   (read again here) and a written reason, linked to the original record, checked against its current state and
//   audited. Office may only request one (finance_adjustment.request, PROPOSED): the request waits in Owner Decisions
//   (refund_request, one item per job) until the Owner approves or declines it, with a reason and a fresh sign-in.
// - A refund pays back money of one confirmed payment not applied to anything (an overpayment): the money the
//   payment can still give, never more (PROPOSED: money applied to an invoice or a deposit is refunded once a
//   correction or a cancellation outcome releases it, TSK-0140). A Square refund is made in Square; it moves
//   approved -> processing -> succeeded only when the Owner records Square's refund ID, or failed (the money is back)
//   or needs_review.
// - A credit lowers what the job's issued final invoice still asks for (issued and applied at once on approval); a
//   write-off stops collecting part or all of it (never automatic; the accounting treatment is the accountant's,
//   RULE-HUMAN-REVIEW). Neither ever exceeds what the invoice still asks for; a written-off invoice is never Paid.
// - An invoice is voided only while no payment (confirmed or pending), credit or write-off is on it; it is never
//   deleted. The job may then have its reissue (a new draft, issued after review as any invoice; a voided final
//   invoice gives back its deposit credit).
// Nothing is ever edited or deleted: every correction is a new superseding record.
import type { Db, Tx } from '@handyhub/db'
import { decide, type Action, type StaffActor } from '@handyhub/policy'
import { sql } from 'kysely'
import { ApiError, type FieldError } from '../../api/errors.js'
import { openQueueItem, resolveQueueItem } from '../queue/items.js'
import { requireOwnerFreshSession } from './exceptions.js'
import { invoiceMoney } from './ledger.js'
import { announcePaidInvoices, syncUnallocatedItem } from './money-events.js'

type Reader = Db | Tx

export const FINANCE_ADJUSTMENT_TYPES = ['refund', 'credit', 'write_off'] as const
export type FinanceAdjustmentType = (typeof FINANCE_ADJUSTMENT_TYPES)[number]
export const FINANCE_ADJUSTMENT_STATES = [
  'requested',
  'approved',
  'processing',
  'succeeded',
  'failed',
  'needs_review',
  'issued',
  'applied',
  'voided',
  'declined',
] as const
export const REFUND_OUTCOMES = ['processing', 'succeeded', 'failed', 'needs_review'] as const
export type RefundOutcome = (typeof REFUND_OUTCOMES)[number]

/** PROPOSED limits: a reason up to 2000 characters (as the waiver's), Square's refund ID up to 120. */
export const ADJUSTMENT_REQUEST_LIMITS = { reason: 2000, confirmation: 120 } as const

/** The Owner's action for each type (ROLE-MATRIX "Refund, credit, write-off, void, payment correction"). */
export const TYPE_ACTION: Record<FinanceAdjustmentType, Action> = {
  refund: 'payment.refund',
  credit: 'payment.credit',
  write_off: 'payment.write_off',
}

export const REQUEST_QUEUE_TYPE = 'refund_request'
const REQUEST_REASON: Record<FinanceAdjustmentType, string> = {
  refund: 'refund_requested',
  credit: 'credit_requested',
  write_off: 'write_off_requested',
}

const CONFIRMED: readonly string[] = ['recorded', 'reconciled', 'cleared']
/** What a refund may move to from each state (as migration 0077 allows). */
const REFUND_NEXT: Record<string, readonly RefundOutcome[]> = {
  approved: ['processing'],
  processing: ['succeeded', 'failed', 'needs_review'],
  needs_review: ['succeeded', 'failed'],
}

const field = (f: string, code: string): FieldError => ({ field: f, code, message: '' })
const conflict = (code: string, f = 'adjustment') => new ApiError('CONFLICT', { fieldErrors: [field(f, code)] })
const invalid = (f: string, code: string) => new ApiError('VALIDATION_FAILED', { fieldErrors: [field(f, code)] })

function text(value: string | null | undefined, f: string, max: number): string {
  const v = (value ?? '').trim()
  if (v === '') throw invalid(f, 'required')
  if (v.length > max) throw invalid(f, 'TOO_LONG')
  return v
}

/** The job's current issued final invoice (not voided), if any. */
async function finalInvoice(db: Reader, jobId: string, lock = false) {
  const q = db
    .selectFrom('finance.invoices')
    .select(['id', 'number', 'state'])
    .where('job_id', '=', jobId)
    .where('kind', '=', 'final')
    .where('state', 'in', ['issued', 'partially_paid', 'paid'])
  return (lock ? q.forUpdate() : q).executeTakeFirst()
}

/** What a payment can still give: its amount less its allocations and its refunds that are not failed or declined. */
async function available(db: Reader, paymentId: string): Promise<number> {
  const r = await sql<{ cents: string }>`
    SELECT (p.amount_cents - finance.payment_used_cents(p.id))::text AS cents
      FROM finance.payments p WHERE p.id = ${paymentId}`.execute(db)
  return Number(r.rows[0]?.cents ?? 0)
}

export type AdjustmentRequestInput = {
  type: FinanceAdjustmentType
  paymentId?: string | null
  amountCents: number
  reason: string
}

/** Writes a requested refund, credit or write-off after checking it against the current money. */
async function insertRequest(tx: Tx, actor: StaffActor, jobId: string, input: AdjustmentRequestInput) {
  if (!(FINANCE_ADJUSTMENT_TYPES as readonly string[]).includes(input.type)) throw invalid('body.type', 'INVALID')
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) throw invalid('body.amountCents', 'INVALID')
  const reason = text(input.reason, 'body.reason', ADJUSTMENT_REQUEST_LIMITS.reason)
  const job = await tx.selectFrom('work.jobs').select(['id', 'project_id']).where('id', '=', jobId).executeTakeFirst()
  if (!job) throw new ApiError('NOT_FOUND')
  let paymentId: string | null = null
  let invoiceId: string | null = null
  if (input.type === 'refund') {
    if (!input.paymentId) throw invalid('body.paymentId', 'required')
    const p = await tx
      .selectFrom('finance.payments')
      .select(['id', 'job_id', 'state'])
      .where('id', '=', input.paymentId)
      .forUpdate()
      .executeTakeFirst()
    if (!p || p.job_id !== jobId) throw invalid('body.paymentId', 'NOT_FOUND')
    if (!CONFIRMED.includes(p.state)) throw conflict(`PAYMENT_${p.state.toUpperCase()}`)
    if (input.amountCents > (await available(tx, p.id))) throw conflict('EXCEEDS_AVAILABLE', 'body.amountCents')
    paymentId = p.id
  } else {
    if (input.paymentId) throw invalid('body.paymentId', 'NOT_ALLOWED')
    const i = await finalInvoice(tx, jobId, true)
    if (!i || i.state === 'paid') throw conflict('NO_INVOICE_BALANCE')
    const m = await invoiceMoney(tx, i.id)
    // Never beyond what the invoice still asks for, counting checks still pending.
    if (input.amountCents > m.remainingCents - m.pendingCents) throw conflict('EXCEEDS_BALANCE', 'body.amountCents')
    invoiceId = i.id
  }
  const row = await tx
    .insertInto('finance.refunds')
    .values({
      project_id: job.project_id,
      job_id: jobId,
      type: input.type,
      payment_id: paymentId,
      invoice_id: invoiceId,
      amount_cents: input.amountCents,
      reason,
      requested_by: actor.userId,
      state: 'requested',
    })
    .returning(['id', 'version'])
    .executeTakeFirstOrThrow()
  return { id: row.id, jobId, projectId: job.project_id }
}

/** Opens, updates or resolves the job's refund_request item in Owner Decisions as its open requests stand now. */
export async function syncRequestItem(tx: Tx, jobId: string): Promise<'open' | 'resolved'> {
  const oldest = await tx
    .selectFrom('finance.refunds as f')
    .innerJoin('crm.projects as p', 'p.id', 'f.project_id')
    .select(['f.type', 'f.project_id', 'p.reference'])
    .where('f.job_id', '=', jobId)
    .where('f.state', '=', 'requested')
    .orderBy('f.created_at')
    .executeTakeFirst()
  if (!oldest) {
    await resolveQueueItem(tx, { type: REQUEST_QUEUE_TYPE, subjectId: jobId, resolution: 'decided' })
    return 'resolved'
  }
  await openQueueItem(tx, {
    type: REQUEST_QUEUE_TYPE,
    subjectId: jobId,
    reason: REQUEST_REASON[oldest.type as FinanceAdjustmentType],
    projectId: oldest.project_id,
    reference: oldest.reference,
  })
  return 'open'
}

/** Office's request (finance_adjustment.request): it waits for the Owner's decision in Owner Decisions. */
export async function requestAdjustment(tx: Tx, actor: StaffActor, jobId: string, input: AdjustmentRequestInput) {
  const out = await insertRequest(tx, actor, jobId, input)
  // A requested refund already holds its money: the unallocated item follows.
  await syncUnallocatedItem(tx, jobId)
  await syncRequestItem(tx, jobId)
  return out
}

export type Decision = 'approve' | 'decline'

/**
 * The Owner's decision on a requested refund, credit or write-off (fresh sign-in read again, a reason): approved
 * (a credit is issued and applied at once) or declined (a credit or write-off voided, a refund declined).
 */
export async function decideAdjustment(
  tx: Tx,
  actor: StaffActor,
  id: string,
  input: { type: FinanceAdjustmentType; decision: Decision; reason: string; sessionId: string },
) {
  const reason = text(input.reason, 'body.reason', ADJUSTMENT_REQUEST_LIMITS.reason)
  await requireOwnerFreshSession(tx, actor, input.sessionId)
  const f = await tx
    .selectFrom('finance.refunds')
    .select(['id', 'type', 'state', 'job_id', 'invoice_id', 'version'])
    .where('id', '=', id)
    .executeTakeFirst()
  if (!f || f.type !== input.type) throw new ApiError('NOT_FOUND')
  // The lock order of every money write: the invoice before the record.
  if (f.invoice_id)
    await tx.selectFrom('finance.invoices').select('id').where('id', '=', f.invoice_id).forUpdate().execute()
  await tx.selectFrom('finance.refunds').select('id').where('id', '=', id).forUpdate().execute()
  if (f.state !== 'requested') throw conflict(`ADJUSTMENT_${f.state.toUpperCase()}`)
  const decided = {
    approved_by: actor.userId,
    approved_at: new Date(),
    staff_session_id: input.sessionId,
    // The trigger keeps the session's own value (full precision).
    authenticated_at: new Date(),
    decision_reason: reason,
  }
  const first =
    input.decision === 'decline'
      ? f.type === 'refund'
        ? 'declined'
        : 'voided'
      : f.type === 'credit'
        ? 'issued'
        : 'approved'
  let row = await tx
    .updateTable('finance.refunds')
    .set({ state: first, ...decided })
    .where('id', '=', id)
    .returning(['state', 'version'])
    .executeTakeFirstOrThrow()
  if (f.type === 'credit' && input.decision === 'approve')
    row = await tx
      .updateTable('finance.refunds')
      .set({ state: 'applied' })
      .where('id', '=', id)
      .returning(['state', 'version'])
      .executeTakeFirstOrThrow()
  await syncUnallocatedItem(tx, f.job_id)
  await syncRequestItem(tx, f.job_id)
  // A credit that brings the invoice to $0.00 makes it Paid (announced once).
  await announcePaidInvoices(tx, f.job_id)
  return {
    id,
    jobId: f.job_id,
    type: f.type as FinanceAdjustmentType,
    from: f.state,
    state: row.state,
    version: row.version,
  }
}

/** The Owner records a refund, credit or write-off directly: requested and approved in one step. */
export async function recordAdjustment(
  tx: Tx,
  actor: StaffActor,
  jobId: string,
  input: AdjustmentRequestInput & { sessionId: string },
) {
  await requireOwnerFreshSession(tx, actor, input.sessionId)
  const req = await insertRequest(tx, actor, jobId, input)
  return decideAdjustment(tx, actor, req.id, {
    type: input.type,
    decision: 'approve',
    reason: input.reason,
    sessionId: input.sessionId,
  })
}

/**
 * The Owner records what happened to an approved refund in Square: processing (made in Square), succeeded (with
 * Square's refund ID: only then complete), failed (the money is back) or needs_review.
 */
export async function recordRefundOutcome(
  tx: Tx,
  actor: StaffActor,
  id: string,
  input: { outcome: RefundOutcome; confirmation?: string | null; reason: string; sessionId: string },
) {
  text(input.reason, 'body.reason', ADJUSTMENT_REQUEST_LIMITS.reason)
  await requireOwnerFreshSession(tx, actor, input.sessionId)
  const f = await tx
    .selectFrom('finance.refunds')
    .select(['id', 'type', 'state', 'job_id', 'version'])
    .where('id', '=', id)
    .forUpdate()
    .executeTakeFirst()
  if (!f || f.type !== 'refund') throw new ApiError('NOT_FOUND')
  if (!(REFUND_NEXT[f.state] ?? []).includes(input.outcome)) throw conflict(`REFUND_${f.state.toUpperCase()}`)
  const confirmation =
    input.outcome === 'succeeded'
      ? text(input.confirmation, 'body.confirmation', ADJUSTMENT_REQUEST_LIMITS.confirmation)
      : null
  const row = await tx
    .updateTable('finance.refunds')
    .set({ state: input.outcome, ...(confirmation ? { provider_confirmation: confirmation } : {}) })
    .where('id', '=', id)
    .returning(['state', 'version'])
    .executeTakeFirstOrThrow()
  if (input.outcome === 'failed') await syncUnallocatedItem(tx, f.job_id)
  return { id, jobId: f.job_id, from: f.state, state: row.state, version: row.version }
}

/** The Owner voids an issued invoice with nothing on it (fresh sign-in, reason); the job may then have its reissue. */
export async function voidInvoice(
  tx: Tx,
  actor: StaffActor,
  invoiceId: string,
  input: { reason: string; sessionId: string },
) {
  const reason = text(input.reason, 'body.reason', ADJUSTMENT_REQUEST_LIMITS.reason)
  await requireOwnerFreshSession(tx, actor, input.sessionId)
  const i = await tx
    .selectFrom('finance.invoices')
    .select(['id', 'job_id', 'kind', 'state', 'number', 'deposit_requirement_id', 'version'])
    .where('id', '=', invoiceId)
    .forUpdate()
    .executeTakeFirst()
  if (!i) throw new ApiError('NOT_FOUND')
  if (i.state === 'draft') throw conflict('INVOICE_NOT_ISSUED', 'invoice')
  if (i.state === 'voided') throw conflict('INVOICE_VOIDED', 'invoice')
  const m = await invoiceMoney(tx, i.id)
  const held = await tx
    .selectFrom('finance.refunds')
    .select('id')
    .where('invoice_id', '=', i.id)
    .where((eb) =>
      eb.or([
        eb.and([eb('type', '=', 'credit'), eb('state', 'in', ['requested', 'issued', 'applied'])]),
        eb.and([eb('type', '=', 'write_off'), eb('state', 'in', ['requested', 'approved'])]),
      ]),
    )
    .executeTakeFirst()
  if (m.confirmedCents > 0 || m.pendingCents > 0 || m.appliedCreditsCents > 0 || m.writtenOffCents > 0 || held)
    throw conflict('INVOICE_HAS_MONEY', 'invoice')
  await tx
    .insertInto('finance.invoice_voids')
    .values({
      invoice_id: i.id,
      job_id: i.job_id,
      reason,
      voided_by: actor.userId,
      staff_session_id: input.sessionId,
      authenticated_at: new Date(),
    })
    .execute()
  const row = await tx
    .updateTable('finance.invoices')
    .set({ state: 'voided' })
    .where('id', '=', i.id)
    .returning('version')
    .executeTakeFirstOrThrow()
  return { invoiceId: i.id, jobId: i.job_id, kind: i.kind, number: i.number, from: i.state, version: row.version }
}

// ------------------------------------------------------------------------------------------------ the staff view

type StaffRef = { id: string; name: string | null }

export type FinanceAdjustmentView = {
  id: string
  type: FinanceAdjustmentType
  state: (typeof FINANCE_ADJUSTMENT_STATES)[number]
  amountCents: number
  reason: string
  decisionReason: string | null
  /** The original record: the payment a refund pays back, or the invoice a credit or write-off lowers. */
  payment: { id: string; method: string; receivedOn: string; amountCents: number } | null
  invoiceNumber: string | null
  requestedBy: StaffRef
  requestedAt: string
  decidedBy: StaffRef | null
  decidedAt: string | null
  /** Square's refund ID, once the Owner recorded it. */
  confirmation: string | null
  /** What this caller may do now: decide a request, or record a refund's next outcome. */
  canDecide: boolean
  outcomes: RefundOutcome[]
}

export type FinanceAdjustmentsView = {
  jobId: string
  items: FinanceAdjustmentView[]
  /** Confirmed payments with money not applied to anything: what a refund may pay back. */
  refundable: { paymentId: string; method: string; receivedOn: string; availableCents: number }[]
  /** The job's current issued final invoice: what a credit or write-off may lower, and whether it may be voided. */
  invoice: { id: string; number: string; state: string; remainingCents: number; pendingCents: number } | null
  /** Issued invoices of the job the Owner may void (nothing on them). */
  voidable: { id: string; number: string; kind: string }[]
  actions: { refund: boolean; credit: boolean; writeOff: boolean; request: boolean; voidInvoice: boolean }
}

function dateText(d: Date | string): string {
  if (typeof d === 'string') return d.slice(0, 10)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** The job's refunds, credits and write-offs and what this caller may do now; null when there is no such job. */
export async function adjustmentsView(
  db: Reader,
  actor: StaffActor,
  jobId: string,
): Promise<FinanceAdjustmentsView | null> {
  const job = await db.selectFrom('work.jobs').select(['id', 'project_id']).where('id', '=', jobId).executeTakeFirst()
  if (!job) return null
  const resource = { projectId: job.project_id }
  const ctx = { now: new Date(), online: true, reason: 'shown' }
  // The fresh sign-in and the reason are asked for when the Owner acts; the buttons show for the Owner only.
  const may = (action: Action) => decide({ ...actor, freshAuth: true }, action, resource, ctx).effect === 'allow'
  const rows = await db
    .selectFrom('finance.refunds as f')
    .leftJoin('finance.payments as p', 'p.id', 'f.payment_id')
    .leftJoin('finance.invoices as i', 'i.id', 'f.invoice_id')
    .leftJoin('identity.staff_users as r', 'r.id', 'f.requested_by')
    .leftJoin('identity.staff_users as d', 'd.id', 'f.approved_by')
    .select([
      'f.id',
      'f.type',
      'f.state',
      'f.amount_cents',
      'f.reason',
      'f.decision_reason',
      'f.payment_id',
      'p.method',
      'p.received_on',
      'p.amount_cents as payment_cents',
      'i.number as invoice_number',
      'f.requested_by',
      'r.display_name as requested_name',
      'f.created_at',
      'f.approved_by',
      'd.display_name as decided_name',
      'f.approved_at',
      'f.provider_confirmation',
    ])
    .where('f.job_id', '=', jobId)
    .orderBy('f.created_at')
    .orderBy('f.id')
    .execute()
  const payments = await db
    .selectFrom('finance.payments')
    .select([
      'id',
      'method',
      'received_on',
      sql<string>`(amount_cents - finance.payment_used_cents(id))::text`.as('left'),
    ])
    .where('job_id', '=', jobId)
    .where('state', 'in', [...CONFIRMED])
    .orderBy('created_at')
    .execute()
  const final = await finalInvoice(db, jobId)
  const money = final?.number ? await invoiceMoney(db, final.id) : null
  const issued = await db
    .selectFrom('finance.invoices')
    .select(['id', 'number', 'kind'])
    .where('job_id', '=', jobId)
    .where('state', 'in', ['issued', 'partially_paid', 'paid'])
    .orderBy('issued_at')
    .execute()
  const voidable: FinanceAdjustmentsView['voidable'] = []
  if (may('invoice.void'))
    for (const i of issued) {
      const m = await invoiceMoney(db, i.id)
      const held = await db
        .selectFrom('finance.refunds')
        .select('id')
        .where('invoice_id', '=', i.id)
        .where('state', 'in', ['requested', 'issued', 'applied', 'approved'])
        .executeTakeFirst()
      if (i.number && !held && m.confirmedCents + m.pendingCents + m.appliedCreditsCents + m.writtenOffCents === 0)
        voidable.push({ id: i.id, number: i.number, kind: i.kind })
    }
  const balance = money ? money.remainingCents - money.pendingCents : 0
  return {
    jobId,
    items: rows.map((r) => {
      const type = r.type as FinanceAdjustmentType
      return {
        id: r.id,
        type,
        state: r.state as FinanceAdjustmentView['state'],
        amountCents: Number(r.amount_cents),
        reason: r.reason,
        decisionReason: r.decision_reason,
        payment:
          r.payment_id && r.method && r.received_on
            ? {
                id: r.payment_id,
                method: r.method,
                receivedOn: dateText(r.received_on),
                amountCents: Number(r.payment_cents),
              }
            : null,
        invoiceNumber: r.invoice_number,
        requestedBy: { id: r.requested_by, name: r.requested_name },
        requestedAt: r.created_at.toISOString(),
        decidedBy: r.approved_by ? { id: r.approved_by, name: r.decided_name } : null,
        decidedAt: r.approved_at?.toISOString() ?? null,
        confirmation: r.provider_confirmation,
        canDecide: r.state === 'requested' && may(TYPE_ACTION[type]),
        outcomes: type === 'refund' && may('payment.refund') ? [...(REFUND_NEXT[r.state] ?? [])] : [],
      }
    }),
    refundable: payments
      .map((p) => ({
        paymentId: p.id,
        method: p.method,
        receivedOn: dateText(p.received_on),
        availableCents: Number(p.left),
      }))
      .filter((p) => p.availableCents > 0),
    invoice:
      final?.number && money
        ? {
            id: final.id,
            number: final.number,
            state: final.state,
            remainingCents: money.remainingCents,
            pendingCents: money.pendingCents,
          }
        : null,
    voidable,
    actions: {
      refund: may('payment.refund'),
      credit: balance > 0 && may('payment.credit'),
      writeOff: balance > 0 && may('payment.write_off'),
      request:
        decide(actor, 'finance_adjustment.request', resource, { now: new Date(), online: true }).effect === 'allow',
      voidInvoice: voidable.length > 0,
    },
  }
}
