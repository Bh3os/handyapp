// The payment ledger (TSK-0086; HH-FIN-03, HH-FIN-06, HH-FIN-07, HH-FIN-12, T59, T64, ENT-Payment,
// ENT-PaymentAllocation, ENT-Refund, OWN-DEC-67, OWN-DEC-111, OWN-DEC-138, RULE-MONEY-CENTS, RULE-SERVER-AUTHZ).
// Invoices, payments (tender), allocations, credits and refunds, Square fees and Square payouts are separate records
// (migration 0077). What an invoice shows is computed from them, never stored beside them:
// - invoiced: the invoice total (charges less credit lines less the discount row);
// - credits: the deposit credit pinned at issue plus credits the Owner applied (TSK-0089 records them);
// - confirmed: payments applied to it that are verified (recorded after verification, reconciled, or a check once the
//   Owner cleared it); pending: checks applied but not cleared, which never count (HH-FIN-12);
// - remaining: invoiced less credits less confirmed. Paid exactly when it reaches $0.00 (the database keeps the
//   state in line with the money, and never lets allocations and credits exceed the invoice).
// Recording a payment on an issued final invoice (payment.record: the Owner, Office; a Worker only for their own
// on-site collection with the collect capability) validates it as a deposit payment is validated, then applies it,
// under the invoice's row lock, to what the invoice still asks for counting pending checks; the remainder of an
// overpayment stays unallocated for the Owner's credit or refund decision (Owner Decisions), never a negative balance.
// A verified payment counts when recorded: it never waits for Square's payout (HH-FIN-06). Square payouts and fees
// are recorded by hand (payout.record, fee.record: the Owner, Office PROPOSED), apart from every customer payment.
import type { Db, Tx } from '@handyhub/db'
import { localDate } from '@handyhub/domain/request-form'
import { decide, type Resource, type StaffActor } from '@handyhub/policy'
import { sql } from 'kysely'
import { ApiError, type FieldError } from '../../api/errors.js'
import { loadConfig } from '../../platform/config/index.js'
import { checkPaymentInput, type PaymentMethod, type PaymentState, type RecordPaymentInput } from './deposits.js'
import { announcePaidInvoices, syncUnallocatedItem } from './money-events.js'
import { syncCheckItem } from './payment-states.js'
import { issuePaymentReceipt } from './receipts.js'

type Reader = Db | Tx

const VERIFIED = ['recorded', 'reconciled', 'cleared'] as const
const PENDING = ['received', 'deposited'] as const

const field = (f: string, code: string): FieldError => ({ field: f, code, message: '' })
const conflict = (code: string, f = 'invoice') => new ApiError('CONFLICT', { fieldErrors: [field(f, code)] })
const invalid = (f: string, code: string) => new ApiError('VALIDATION_FAILED', { fieldErrors: [field(f, code)] })

export type InvoiceMoney = {
  invoicedCents: number
  depositCreditCents: number
  appliedCreditsCents: number
  /** depositCreditCents + appliedCreditsCents. */
  creditsCents: number
  confirmedCents: number
  pendingCents: number
  /** invoiced - credits - confirmed; a pending check does not reduce it. */
  remainingCents: number
}

/** An invoice's money from its records (see the header). */
export async function invoiceMoney(db: Reader, invoiceId: string): Promise<InvoiceMoney> {
  const r = await sql<{
    total: string
    deposit: string
    credits: string
    confirmed: string
    pending: string
  }>`SELECT i.total_cents::text AS total, i.deposit_credit_cents::text AS deposit,
            finance.invoice_credits_cents(i.id)::text AS credits,
            finance.invoice_paid_cents(i.id, ${sql.val([...VERIFIED])}::text[])::text AS confirmed,
            finance.invoice_paid_cents(i.id, ${sql.val([...PENDING])}::text[])::text AS pending
       FROM finance.invoices i WHERE i.id = ${invoiceId}`.execute(db)
  const row = r.rows[0]
  if (!row) throw new ApiError('NOT_FOUND')
  const invoiced = Number(row.total)
  const credits = Number(row.credits)
  const confirmed = Number(row.confirmed)
  return {
    invoicedCents: invoiced,
    depositCreditCents: Number(row.deposit),
    appliedCreditsCents: credits - Number(row.deposit),
    creditsCents: credits,
    confirmedCents: confirmed,
    pendingCents: Number(row.pending),
    remainingCents: Math.max(0, invoiced - credits - confirmed),
  }
}

type StaffRef = { id: string; name: string | null }

export type InvoicePaymentView = {
  id: string
  method: PaymentMethod
  amountCents: number
  appliedCents: number
  receivedOn: string
  reference: string | null
  payerName: string | null
  state: PaymentState
  verified: boolean
  collector: StaffRef
  recordedAt: string
  canMarkCleared: boolean
  /** TSK-0088 (HH-FIN-11, HH-FIN-12): the memo, the receipt, the deposit and reconciliation steps. */
  memo: string | null
  receiptNumber: string | null
  depositedAt: string | null
  reconciledAt: string | null
  canMarkDeposited: boolean
  canReconcile: boolean
}

function dateText(d: Date | string): string {
  if (typeof d === 'string') return d.slice(0, 10)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const mayReconcile = (actor: StaffActor, projectId: string, collector: string) =>
  decide(actor, 'payment.reconcile', { projectId, collectedByStaffId: collector }, { now: new Date(), online: true })
    .effect === 'allow'

/** The payments applied to an invoice (a deposit invoice: to its deposit), oldest first. */
export async function invoicePayments(db: Reader, actor: StaffActor, invoiceId: string): Promise<InvoicePaymentView[]> {
  const i = await db
    .selectFrom('finance.invoices')
    .select(['kind', 'project_id', 'deposit_requirement_id'])
    .where('id', '=', invoiceId)
    .executeTakeFirstOrThrow()
  const rows = await db
    .selectFrom('finance.payment_allocations as a')
    .innerJoin('finance.payments as p', 'p.id', 'a.payment_id')
    .leftJoin('identity.staff_users as s', 's.id', 'p.collector_staff_id')
    .leftJoin('finance.payment_receipts as rc', 'rc.payment_id', 'p.id')
    .select([
      'p.id',
      'p.method',
      'p.amount_cents',
      'p.received_on',
      'p.reference',
      'p.payer_name',
      'p.state',
      'p.collector_staff_id',
      's.display_name',
      'p.created_at',
      'p.memo',
      'p.deposited_at',
      'p.reconciled_at',
      'rc.number as receipt_number',
      'a.amount_cents as applied_cents',
    ])
    .where((eb) =>
      i.kind === 'deposit' && i.deposit_requirement_id
        ? eb('a.deposit_requirement_id', '=', i.deposit_requirement_id)
        : eb('a.invoice_id', '=', invoiceId),
    )
    .orderBy('p.created_at')
    .orderBy('p.id')
    .execute()
  return rows.map((p) => ({
    id: p.id,
    method: p.method as PaymentMethod,
    amountCents: Number(p.amount_cents),
    appliedCents: Number(p.applied_cents),
    receivedOn: dateText(p.received_on),
    reference: p.reference,
    payerName: p.payer_name,
    state: p.state as PaymentState,
    verified: (VERIFIED as readonly string[]).includes(p.state),
    collector: { id: p.collector_staff_id, name: p.display_name },
    recordedAt: p.created_at.toISOString(),
    canMarkCleared:
      p.method === 'check' &&
      (PENDING as readonly string[]).includes(p.state) &&
      decide(
        actor,
        'check.mark_cleared',
        { projectId: i.project_id, collectedByStaffId: p.collector_staff_id },
        { now: new Date(), online: true },
      ).effect === 'allow',
    memo: p.memo,
    receiptNumber: p.receipt_number,
    depositedAt: p.deposited_at?.toISOString() ?? null,
    reconciledAt: p.reconciled_at?.toISOString() ?? null,
    canMarkDeposited:
      p.method === 'check' && p.state === 'received' && mayReconcile(actor, i.project_id, p.collector_staff_id),
    canReconcile:
      p.method !== 'check' && p.state === 'recorded' && mayReconcile(actor, i.project_id, p.collector_staff_id),
  }))
}

export type RecordedInvoicePayment = {
  paymentId: string
  jobId: string
  state: PaymentState
  appliedCents: number
  unallocatedCents: number
  invoiceState: string
}

/** Records a verified payment on an issued final invoice and applies it (see the header). */
export async function recordInvoicePayment(
  tx: Tx,
  actor: StaffActor,
  invoiceId: string,
  input: RecordPaymentInput,
): Promise<RecordedInvoicePayment> {
  if (!tx.isTransaction) throw new Error('recordInvoicePayment runs inside the business transaction (withTx)')
  const i = await tx
    .selectFrom('finance.invoices')
    .select(['id', 'job_id', 'project_id', 'kind', 'state', 'total_cents'])
    .where('id', '=', invoiceId)
    .forUpdate()
    .executeTakeFirst()
  if (!i) throw new ApiError('NOT_FOUND')
  // PROPOSED: a deposit invoice is paid through its deposit (the deposit payments of TSK-0059).
  if (i.kind !== 'final') throw conflict('DEPOSIT_INVOICE_PAID_THROUGH_DEPOSIT')
  if (i.state === 'draft') throw conflict('INVOICE_NOT_ISSUED')
  if (i.state === 'paid') throw conflict('INVOICE_PAID')
  if (i.state === 'voided') throw conflict('INVOICE_VOIDED')
  const checked = await checkPaymentInput(tx, actor, input)
  const money = await invoiceMoney(tx, i.id)
  // What the invoice still asks for, counting checks still pending (allocations never exceed the invoice).
  const need = money.invoicedCents - money.creditsCents - money.confirmedCents - money.pendingCents
  if (need <= 0) throw conflict('INVOICE_COVERED')
  const applied = Math.min(need, checked.amountCents)
  const payment = await tx
    .insertInto('finance.payments')
    .values({
      project_id: i.project_id,
      job_id: i.job_id,
      method: checked.method,
      amount_cents: checked.amountCents,
      received_on: checked.receivedOn,
      collector_staff_id: checked.collector,
      recorded_by: actor.userId,
      reference: checked.reference,
      payer_name: checked.payerName,
      memo: checked.memo,
      state: checked.method === 'check' ? 'received' : 'recorded',
      created_at: checked.now,
    })
    .returning(['id', 'state'])
    .executeTakeFirstOrThrow()
  await tx
    .insertInto('finance.payment_allocations')
    .values({
      payment_id: payment.id,
      invoice_id: i.id,
      amount_cents: applied,
      allocated_by: actor.userId,
      created_at: checked.now,
    })
    .execute()
  await syncUnallocatedItem(tx, i.job_id)
  await announcePaidInvoices(tx, i.job_id)
  // TSK-0087: a confirmed payment's receipt, at once (a check's when it is cleared).
  await issuePaymentReceipt(tx, payment.id)
  // TSK-0088: a check waits in the Owner's queue until it clears.
  if (checked.method === 'check') await syncCheckItem(tx, i.job_id)
  const after = await tx.selectFrom('finance.invoices').select('state').where('id', '=', i.id).executeTakeFirstOrThrow()
  return {
    paymentId: payment.id,
    jobId: i.job_id,
    state: payment.state as PaymentState,
    appliedCents: applied,
    unallocatedCents: checked.amountCents - applied,
    invoiceState: after.state,
  }
}

// ------------------------------------------------------------------------------------------------ payouts and fees

/** PROPOSED limits: a Square payout or fee reference up to 120 characters. */
export const LEDGER_LIMITS = { reference: 120 } as const

async function businessToday(tx: Tx): Promise<string> {
  const r = await sql<{ now: Date }>`SELECT now() AS now`.execute(tx)
  const zone = (await loadConfig(tx)).get('business.timezone')
  return localDate(new Date((r.rows[0] as { now: Date }).now), zone.state === 'CONFIGURED' ? zone.value.zone : 'UTC')
}

function checkDate(value: string, today: string, f: string): FieldError | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T12:00:00Z`))) return field(f, 'INVALID')
  return value > today ? field(f, 'IN_FUTURE') : null
}

const clean = (s: string | null | undefined) => {
  const v = (s ?? '').trim().replace(/\s+/g, ' ')
  return v === '' ? null : v
}

/** Records a Square payout by hand: its payout ID, the net amount paid out and the date (never a customer payment). */
export async function recordPayout(
  tx: Tx,
  actor: StaffActor,
  input: { reference: string; amountCents: number; paidOutOn: string },
): Promise<{ payoutId: string }> {
  const reference = clean(input.reference)
  const problems: FieldError[] = []
  if (!reference) problems.push(field('body.reference', 'required'))
  else if (reference.length > LEDGER_LIMITS.reference) problems.push(field('body.reference', 'TOO_LONG'))
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0)
    problems.push(field('body.amountCents', 'INVALID'))
  const date = checkDate(input.paidOutOn, await businessToday(tx), 'body.paidOutOn')
  if (date) problems.push(date)
  if (problems.length) throw new ApiError('VALIDATION_FAILED', { fieldErrors: problems })
  const dup = await tx
    .selectFrom('finance.payouts')
    .select('id')
    .where('provider', '=', 'square')
    .where('reference', '=', reference as string)
    .executeTakeFirst()
  if (dup) throw conflict('DUPLICATE_PAYOUT', 'body.reference')
  const row = await tx
    .insertInto('finance.payouts')
    .values({
      provider: 'square',
      reference: reference as string,
      amount_cents: input.amountCents,
      paid_out_on: input.paidOutOn,
      recorded_by: actor.userId,
    })
    .onConflict((oc) => oc.columns(['provider', 'reference']).doNothing())
    .returning('id')
    .executeTakeFirst()
  if (!row) throw conflict('DUPLICATE_PAYOUT', 'body.reference')
  return { payoutId: row.id }
}

/** Records a Square fee by hand, on a Square card payment and/or the payout it was deducted in. */
export async function recordProviderFee(
  tx: Tx,
  actor: StaffActor,
  input: {
    amountCents: number
    incurredOn: string
    paymentId?: string | null
    payoutId?: string | null
    reference?: string | null
  },
): Promise<{ feeId: string }> {
  const reference = clean(input.reference)
  const problems: FieldError[] = []
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0)
    problems.push(field('body.amountCents', 'INVALID'))
  if (reference && reference.length > LEDGER_LIMITS.reference) problems.push(field('body.reference', 'TOO_LONG'))
  if (!input.paymentId && !input.payoutId) problems.push(field('body.paymentId', 'required'))
  const date = checkDate(input.incurredOn, await businessToday(tx), 'body.incurredOn')
  if (date) problems.push(date)
  if (problems.length) throw new ApiError('VALIDATION_FAILED', { fieldErrors: problems })
  if (input.paymentId) {
    const p = await tx
      .selectFrom('finance.payments')
      .select('method')
      .where('id', '=', input.paymentId)
      .executeTakeFirst()
    if (!p) throw invalid('body.paymentId', 'NOT_FOUND')
    if (p.method !== 'square_payment_link' && p.method !== 'square_tap_to_pay')
      throw invalid('body.paymentId', 'NOT_A_SQUARE_PAYMENT')
  }
  if (input.payoutId) {
    const p = await tx.selectFrom('finance.payouts').select('id').where('id', '=', input.payoutId).executeTakeFirst()
    if (!p) throw invalid('body.payoutId', 'NOT_FOUND')
  }
  const row = await tx
    .insertInto('finance.provider_fees')
    .values({
      provider: 'square',
      payment_id: input.paymentId ?? null,
      payout_id: input.payoutId ?? null,
      amount_cents: input.amountCents,
      incurred_on: input.incurredOn,
      reference,
      recorded_by: actor.userId,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  return { feeId: row.id }
}

export type PayoutsView = {
  payouts: { id: string; reference: string; amountCents: number; paidOutOn: string; feesCents: number }[]
  fees: {
    id: string
    amountCents: number
    incurredOn: string
    paymentId: string | null
    payoutId: string | null
    reference: string | null
  }[]
}

/** PROPOSED: the most recent payouts and fees one read lists. */
export const PAYOUT_LIST_LIMIT = 200

/** The recorded Square payouts and fees, newest first. */
export async function payoutsView(db: Reader): Promise<PayoutsView> {
  const payouts = await db
    .selectFrom('finance.payouts as p')
    .select([
      'p.id',
      'p.reference',
      'p.amount_cents',
      'p.paid_out_on',
      (eb) =>
        eb
          .selectFrom('finance.provider_fees as f')
          .select(sql<string>`COALESCE(sum(f.amount_cents), 0)::text`.as('s'))
          .whereRef('f.payout_id', '=', 'p.id')
          .as('fees'),
    ])
    .orderBy('p.paid_out_on', 'desc')
    .orderBy('p.created_at', 'desc')
    .limit(PAYOUT_LIST_LIMIT)
    .execute()
  const fees = await db
    .selectFrom('finance.provider_fees')
    .select(['id', 'amount_cents', 'incurred_on', 'payment_id', 'payout_id', 'reference'])
    .orderBy('incurred_on', 'desc')
    .orderBy('created_at', 'desc')
    .limit(PAYOUT_LIST_LIMIT)
    .execute()
  return {
    payouts: payouts.map((p) => ({
      id: p.id,
      reference: p.reference,
      amountCents: Number(p.amount_cents),
      paidOutOn: dateText(p.paid_out_on),
      feesCents: Number(p.fees ?? 0),
    })),
    fees: fees.map((f) => ({
      id: f.id,
      amountCents: Number(f.amount_cents),
      incurredOn: dateText(f.incurred_on),
      paymentId: f.payment_id,
      payoutId: f.payout_id,
      reference: f.reference,
    })),
  }
}

/** Resource facts for routes with no project (payouts and fees are the business's own records). */
export const NO_RECORD: Resource = {}
