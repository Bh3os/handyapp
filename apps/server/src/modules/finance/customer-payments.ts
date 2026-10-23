// The customer's Payments tab (TSK-0087; HH-PORT-12, HH-FIN-08, HH-FIN-09, HH-FIN-10, HH-CUS-07, T58, T59, T60,
// FACT-PAYMENT-METHODS, FACT-PAYMENT-INSTRUCTIONS, FACT-NO-SURCHARGE, OWN-DEC-106, OWN-DEC-111, OWN-DEC-182). Read
// inside the caller's verified project scope (portal/tabs.ts); every amount is integer cents from the shared records.
// - The approved total (the job's current approved scope), the deposit (due, received or nothing to pay), each current
//   invoice with what is confirmed, what is pending (a check until cleared) and what remains, the recorded payments
//   (confirmed or pending; never who recorded them) with each confirmed payment's receipt (TSK-0087 part 2: a partial
//   payment says so, with what remained), and the balance still owed. TSK-0089: a returned, voided or disputed payment
//   says so, and its receipt shows voided once the payment no longer counts.
// - "Pay by Card" is given only with a balance and a staff-pasted Square link: the final invoice's newest link, or the
//   deposit's own link while the deposit is due. Opening it, or returning from it, changes nothing here.
// - The other methods show their instructions from configuration. Until the Owner enters real handles each one is a
//   labelled placeholder (placeholder: true): the portal never offers it as a usable destination or a copy button.
import type { Db, Tx } from '@handyhub/db'
import { sql } from 'kysely'
import { loadConfig } from '../../platform/config/index.js'
import { customerDeposit, type CustomerDeposit, type PaymentMethod } from './deposits.js'
import { invoiceMoney } from './ledger.js'
import { currentInvoiceLink } from './payment-links.js'

type Reader = Db | Tx

const CONFIRMED = new Set(['recorded', 'reconciled', 'cleared'])
const PENDING = new Set(['received', 'deposited'])

export type CustomerPaymentInvoice = {
  number: string
  kind: 'final' | 'deposit'
  state: 'issued' | 'partially_paid' | 'paid'
  totalCents: number
  creditsCents: number
  confirmedCents: number
  pendingCents: number
  balanceCents: number
  /** The Square link "Pay by Card" opens, only while a balance remains. */
  payByCardUrl: string | null
}

export type CustomerRecordedPayment = {
  receivedOn: string
  method: PaymentMethod
  amountCents: number
  /**
   * TSK-0089 (HH-FIN-13): returned (a check returned, a payment failed or a dispute lost), voided (recorded wrongly;
   * its correction is listed beside it) or disputed (counted until the dispute's outcome, PROPOSED).
   */
  state: 'confirmed' | 'pending' | 'returned' | 'voided' | 'disputed'
  /**
   * TSK-0087 part 2: the receipt of a confirmed payment, and whether it left a balance (a partial payment); TSK-0089:
   * voided once the payment is returned or voided (the receipt itself is kept as issued).
   */
  receipt: {
    number: string
    paymentNumber: string
    partial: boolean
    balanceAfterCents: number
    voided: boolean
  } | null
}

export type CustomerPaymentInstructions = {
  methods: PaymentMethod[]
  /** True while the handles are the Owner's labelled placeholders (OQ-PAYMENT-HANDLES): never a destination. */
  placeholder: boolean
  zelle: string | null
  cashApp: string | null
  chime: string | null
  checkPayee: string | null
}

export type CustomerPayments = {
  approvedTotalCents: number | null
  deposit: CustomerDeposit
  invoices: CustomerPaymentInvoice[]
  payments: CustomerRecordedPayment[]
  confirmedCents: number
  pendingCents: number
  balanceCents: number
  instructions: CustomerPaymentInstructions | null
}

function dateText(d: Date | string): string {
  if (typeof d === 'string') return d.slice(0, 10)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** The project's money as its verified customer sees it; null when there is nothing to show yet. */
export async function customerPayments(db: Reader, projectId: string): Promise<CustomerPayments | null> {
  const approved = await sql<{ total: string | null }>`
    SELECT sum(s.total_cents)::text AS total
      FROM work.jobs j
      JOIN LATERAL (SELECT total_cents FROM work.job_scope_snapshots
                     WHERE job_id = j.id ORDER BY version DESC LIMIT 1) s ON true
     WHERE j.project_id = ${projectId}`.execute(db)
  const approvedTotal = approved.rows[0]?.total == null ? null : Number(approved.rows[0].total)
  const deposit = await customerDeposit(db, projectId)
  const rows = await db
    .selectFrom('finance.invoices')
    .select(['id', 'number', 'kind', 'state', 'issued_at'])
    .where('project_id', '=', projectId)
    .where('state', 'in', ['issued', 'partially_paid', 'paid'])
    .orderBy('issued_at')
    .execute()
  const invoices: CustomerPaymentInvoice[] = []
  for (const r of rows) {
    if (!r.number) continue
    const m = await invoiceMoney(db, r.id)
    const link =
      r.kind === 'final'
        ? ((await currentInvoiceLink(db, r.id))?.url ?? null)
        : deposit.state === 'deposit_due'
          ? deposit.payByCardUrl
          : null
    invoices.push({
      number: r.number,
      kind: r.kind as 'final' | 'deposit',
      state: r.state as CustomerPaymentInvoice['state'],
      totalCents: m.invoicedCents,
      creditsCents: m.creditsCents,
      confirmedCents: m.confirmedCents,
      pendingCents: m.pendingCents,
      balanceCents: m.remainingCents,
      payByCardUrl: m.remainingCents > 0 ? link : null,
    })
  }
  const paid = await db
    .selectFrom('finance.payments as p')
    .leftJoin('finance.payment_receipts as r', 'r.payment_id', 'p.id')
    .select([
      'p.received_on',
      'p.method',
      'p.amount_cents',
      'p.state',
      'p.created_at',
      'r.number as receipt_number',
      'r.payment_number',
      'r.partial',
      'r.balance_after_cents',
      sql<boolean>`finance.payment_dispute_open(p.id)`.as('disputed'),
    ])
    .where('p.project_id', '=', projectId)
    .orderBy('p.received_on')
    .orderBy('p.created_at')
    .execute()
  const payments: CustomerRecordedPayment[] = paid.map((p) => ({
    receivedOn: dateText(p.received_on),
    method: p.method as PaymentMethod,
    amountCents: Number(p.amount_cents),
    state: p.disputed
      ? 'disputed'
      : CONFIRMED.has(p.state)
        ? 'confirmed'
        : PENDING.has(p.state)
          ? 'pending'
          : p.state === 'voided'
            ? 'voided'
            : 'returned',
    receipt:
      p.receipt_number && p.payment_number && p.partial !== null && p.balance_after_cents !== null
        ? {
            number: p.receipt_number,
            paymentNumber: p.payment_number,
            partial: p.partial,
            balanceAfterCents: Number(p.balance_after_cents),
            voided: p.state === 'returned' || p.state === 'voided',
          }
        : null,
  }))
  if (approvedTotal === null && deposit.state === 'none' && invoices.length === 0 && payments.length === 0) return null
  const config = await loadConfig(db)
  const methods = config.get('payment.methods')
  const handles = config.get('payment.instructions')
  return {
    approvedTotalCents: approvedTotal,
    deposit,
    invoices,
    payments,
    // A disputed payment still counts until its outcome (PROPOSED, OQ-PAYMENT-EXCEPTION-DETAILS).
    confirmedCents: payments
      .filter((p) => p.state === 'confirmed' || p.state === 'disputed')
      .reduce((a, p) => a + p.amountCents, 0),
    pendingCents: payments.filter((p) => p.state === 'pending').reduce((a, p) => a + p.amountCents, 0),
    balanceCents: invoices.reduce((a, i) => a + i.balanceCents, 0),
    instructions:
      methods.state === 'CONFIGURED'
        ? {
            methods: [...methods.value.methods] as PaymentMethod[],
            placeholder: handles.state === 'CONFIGURED' ? handles.value.placeholder : true,
            zelle: handles.state === 'CONFIGURED' ? handles.value.zelle : null,
            cashApp: handles.state === 'CONFIGURED' ? handles.value.cashApp : null,
            chime: handles.state === 'CONFIGURED' ? handles.value.chime : null,
            checkPayee: handles.state === 'CONFIGURED' ? handles.value.checkPayee : null,
          }
        : null,
  }
}
