// Payment receipts and the receipt message (TSK-0087 part 2; HH-FIN-11, HH-FIN-09, HH-PORT-12, T59, T62,
// FACT-AUTOMATIC-MESSAGES #20, OWN-DEC-111, OWN-DEC-151, OWN-DEC-152). Migration 0092 keeps the records true whatever
// path writes.
// - A receipt is issued, in the recording transaction, for each confirmed recorded payment: at once for cash, card,
//   Zelle, Cash App and Chime; for a check only when the Owner clears it. Never on initiation, never for a pending
//   payment, and once per payment (the payment is the receipt's key).
// - It is numbered per project (<reference>-R<n>, payment <reference>-P<n>) and keeps what the payment paid and what
//   the invoice (or the deposit) still asked for after it: a partial payment says so on the customer's Payments tab.
// - Its committed payment.receipt_issued event sends the automatic payment receipt (payment_receipt, the owner's
//   wording) once per receipt, by email, with the invoice number, the receipt and payment numbers and the link to the
//   project's Payments tab. The owner's wording names an invoice: a deposit payment with no deposit invoice issued sends
//   nothing (PROPOSED, OQ-PAYMENT-LINK-DETAILS); its receipt is on the Payments tab all the same.
import type { Tx } from '@handyhub/db'
import { sql } from 'kysely'
import type { Automation } from '../../platform/automation.js'
import { outbox } from '../../platform/outbox.js'
import {
  firstNameOf,
  notificationAutomation,
  portalLink,
  type Destination,
  type NotificationProviders,
} from '../notifications/index.js'
import { invoiceMoney } from './ledger.js'

export const RECEIPT_ISSUED_EVENT = 'payment.receipt_issued'
export const PAYMENT_RECEIPT_MESSAGE_KEY = 'payment.receipt'

const CONFIRMED = new Set(['recorded', 'reconciled', 'cleared'])

/** Issues the receipt of a confirmed payment once (inside the recording transaction); null for a pending payment. */
export async function issuePaymentReceipt(tx: Tx, paymentId: string): Promise<{ id: string; number: string } | null> {
  const p = await tx
    .selectFrom('finance.payments as p')
    .innerJoin('crm.projects as pr', 'pr.id', 'p.project_id')
    .select(['p.id', 'p.project_id', 'p.job_id', 'p.state', 'p.amount_cents', 'pr.reference'])
    .where('p.id', '=', paymentId)
    .executeTakeFirst()
  if (!p || !CONFIRMED.has(p.state)) return null
  // One numbering per project; a payment's receipt once.
  await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`finance.receipt_number:${p.project_id}`}, 0))`.execute(tx)
  const seen = await tx
    .selectFrom('finance.payment_receipts')
    .select(['id', 'number'])
    .where('payment_id', '=', paymentId)
    .executeTakeFirst()
  if (seen) return seen
  const allocations = await tx
    .selectFrom('finance.payment_allocations')
    .select(['invoice_id', 'deposit_requirement_id', 'amount_cents'])
    .where('payment_id', '=', paymentId)
    .execute()
  const applied = allocations.reduce((s, a) => s + Number(a.amount_cents), 0)
  let invoiceId: string | null = null
  let balance = 0
  const toInvoice = allocations.find((a) => a.invoice_id)?.invoice_id ?? null
  const toDeposit = allocations.find((a) => a.deposit_requirement_id)?.deposit_requirement_id ?? null
  if (toInvoice) {
    invoiceId = toInvoice
    balance = (await invoiceMoney(tx, toInvoice)).remainingCents
  } else if (toDeposit) {
    const d = await sql<{ amount: string | null; verified: string }>`
      SELECT amount_cents::text AS amount, finance.deposit_verified_cents(id)::text AS verified
        FROM finance.deposit_requirements WHERE id = ${toDeposit}`.execute(tx)
    const row = d.rows[0]
    balance = Math.max(0, Number(row?.amount ?? 0) - Number(row?.verified ?? 0))
    const inv = await tx
      .selectFrom('finance.invoices')
      .select('id')
      .where('deposit_requirement_id', '=', toDeposit)
      .where('kind', '=', 'deposit')
      .where('state', 'not in', ['draft', 'voided'])
      .executeTakeFirst()
    invoiceId = inv?.id ?? null
  }
  const last = await tx
    .selectFrom('finance.payment_receipts')
    .select((eb) => eb.fn.max('sequence').as('max'))
    .where('project_id', '=', p.project_id)
    .executeTakeFirst()
  const sequence = Number(last?.max ?? 0) + 1
  const row = await tx
    .insertInto('finance.payment_receipts')
    .values({
      payment_id: paymentId,
      project_id: p.project_id,
      job_id: p.job_id,
      invoice_id: invoiceId,
      sequence,
      number: `${p.reference}-R${sequence}`,
      payment_number: `${p.reference}-P${sequence}`,
      amount_cents: Number(p.amount_cents),
      applied_cents: applied,
      balance_after_cents: balance,
      partial: balance > 0,
    })
    .returning(['id', 'number'])
    .executeTakeFirstOrThrow()
  await outbox.add(tx, {
    type: RECEIPT_ISSUED_EVENT,
    aggregate: { type: 'payment_receipt', id: row.id },
    payload: { receiptId: row.id, paymentId },
    idempotencyKey: `${RECEIPT_ISSUED_EVENT}:${paymentId}`,
  })
  return row
}

type NoticeDeps = { providers: NotificationProviders; publicSiteUrl?: string | undefined }

/** The automatic payment receipt (FACT-AUTOMATIC-MESSAGES #20): once per issued receipt, by email. */
export function paymentReceiptAutomation(deps: NoticeDeps): Automation {
  return notificationAutomation({
    messageKey: PAYMENT_RECEIPT_MESSAGE_KEY,
    providers: deps.providers,
    resolve: async ({ tx, job }) => {
      const id = job.target.id
      if (!id) return 'stale'
      const r = await tx
        .selectFrom('finance.payment_receipts as pr')
        .innerJoin('crm.projects as p', 'p.id', 'pr.project_id')
        .innerJoin('intake.requests as q', 'q.project_id', 'pr.project_id')
        .innerJoin('crm.contacts as c', 'c.id', 'q.contact_id')
        .leftJoin('finance.invoices as i', 'i.id', 'pr.invoice_id')
        .select([
          'pr.id',
          'pr.number',
          'pr.payment_number',
          'pr.project_id',
          'p.reference as project_reference',
          'q.reference',
          'q.responsible_staff_id',
          'i.number as invoice_number',
          'i.state as invoice_state',
          'c.id as contactId',
          'c.full_name',
          'c.email',
          'c.preferred_channel',
        ])
        .where('pr.id', '=', id)
        .executeTakeFirst()
      // The owner's wording names the invoice: without one (a deposit paid before its invoice) nothing is sent.
      if (!r || !r.invoice_number || r.invoice_state === 'voided') return 'stale'
      const destinations: Destination[] = r.email
        ? [
            {
              channel: 'email',
              destination: r.email,
              permission: r.preferred_channel === 'email' ? 'preferred' : 'permitted',
            },
          ]
        : []
      const receiptLink = portalLink(deps.publicSiteUrl, r.project_reference, 'payments')
      const projectLink = portalLink(deps.publicSiteUrl, r.project_reference)
      return {
        subjectKey: `payment_receipt:${r.id}`,
        record: { type: 'payment_receipt', id: r.id },
        recipients: [{ kind: 'customer_contact', id: r.contactId, destinations }],
        values: {
          customerName: firstNameOf(r.full_name),
          invoiceNumber: r.invoice_number,
          receiptNumber: r.number,
          paymentNumber: r.payment_number,
          ...(receiptLink ? { receiptLink } : {}),
          ...(projectLink ? { projectLink } : {}),
        },
        failureItem: { reference: r.reference, projectId: r.project_id, assignedStaffId: r.responsible_staff_id },
        projectId: r.project_id,
      }
    },
  })
}
