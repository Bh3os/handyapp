// Invoice-specific Square payment links (TSK-0087; HH-FIN-08, HH-FIN-09, HH-PORT-12, T60, INT-Square, OWN-DEC-67,
// OWN-DEC-138). Migration 0091 keeps the records true whatever path writes.
// - The Owner or Office (invoice.enter_payment_link) paste the link they created in the Square app on an issued final
//   invoice that still has a balance: https on a host of payment.square_link_hosts (the deposit's rule, deposits.ts);
//   anything else is refused. A new link replaces the shown one; every link stays recorded.
// - The customer's "Pay by Card" opens the newest link while a balance remains. Nothing comes back from Square: a
//   redirect from the link, a visit to it or a customer's claim never changes an invoice. Only a staff-recorded
//   verified payment does (HH-FIN-09, ledger.ts).
import type { Db, Tx } from '@handyhub/db'
import type { StaffActor } from '@handyhub/policy'
import { ApiError, type FieldError } from '../../api/errors.js'
import { loadConfig } from '../../platform/config/index.js'
import { DEPOSIT_LIMITS, squareLinkProblem } from './deposits.js'

type Reader = Db | Tx

const field = (f: string, code: string): FieldError => ({ field: f, code, message: '' })

export type InvoicePaymentLink = { url: string; setBy: { id: string; name: string | null }; setAt: string }

/** The link "Pay by Card" opens: the newest one pasted on the invoice, if any. */
export async function currentInvoiceLink(db: Reader, invoiceId: string): Promise<InvoicePaymentLink | null> {
  const r = await db
    .selectFrom('finance.invoice_payment_links as l')
    .innerJoin('identity.staff_users as s', 's.id', 'l.set_by')
    .select(['l.url', 'l.set_by', 'l.set_at', 's.display_name'])
    .where('l.invoice_id', '=', invoiceId)
    .orderBy('l.set_at', 'desc')
    .orderBy('l.id', 'desc')
    .limit(1)
    .executeTakeFirst()
  return r ? { url: r.url, setBy: { id: r.set_by, name: r.display_name }, setAt: r.set_at.toISOString() } : null
}

/** Pastes (or replaces) the Square payment link of an issued final invoice with a balance. */
export async function setInvoicePaymentLink(
  tx: Tx,
  actor: StaffActor,
  invoiceId: string,
  input: { url: string },
): Promise<{ invoiceId: string; jobId: string; host: string; replaced: boolean }> {
  const i = await tx
    .selectFrom('finance.invoices')
    .select(['id', 'job_id', 'kind', 'state'])
    .where('id', '=', invoiceId)
    .forUpdate()
    .executeTakeFirst()
  if (!i) throw new ApiError('NOT_FOUND')
  if (i.kind !== 'final')
    throw new ApiError('CONFLICT', { fieldErrors: [field('invoice', 'DEPOSIT_INVOICE_USES_DEPOSIT_LINK')] })
  if (i.state !== 'issued' && i.state !== 'partially_paid')
    throw new ApiError('CONFLICT', { fieldErrors: [field('invoice', `INVOICE_${i.state.toUpperCase()}`)] })
  const setting = (await loadConfig(tx)).get('payment.square_link_hosts')
  if (setting.state !== 'CONFIGURED')
    throw new ApiError('NOT_CONFIGURED', { fieldErrors: [field('payment.square_link_hosts', 'NOT_CONFIGURED')] })
  const url = input.url.trim()
  const problem = url.length > DEPOSIT_LIMITS.paymentLink ? 'TOO_LONG' : squareLinkProblem(url, setting.value.hosts)
  if (problem) throw new ApiError('VALIDATION_FAILED', { fieldErrors: [field('body.url', problem)] })
  const before = await currentInvoiceLink(tx, invoiceId)
  await tx
    .insertInto('finance.invoice_payment_links')
    .values({ invoice_id: invoiceId, url, set_by: actor.userId })
    .execute()
  return { invoiceId, jobId: i.job_id, host: new URL(url).hostname, replaced: before !== null }
}
