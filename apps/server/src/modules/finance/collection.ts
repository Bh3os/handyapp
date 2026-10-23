// On-site collection (TSK-0088 part 2; HH-FIN-11, HH-FIN-12, T62, OWN-DEC-67, OWN-DEC-138, OWN-DEC-200). From the job
// packet, the staff member who takes the customer's money on site records it at once, as their own collection:
// - Who: payment.record. A Worker only with the Owner's explicit `collect` grant (the Owner records their training with
//   the grant, OWN-DEC-200: the Worker role alone is not enough), on a job they are assigned to inside its access
//   window, and only as the collector themselves. The Owner and Office may use it too.
// - What: cash, a check or Square Tap to Pay on the staff phone (PROPOSED: the methods taken in person), toward what
//   the job still asks for: the deposit while it is due, or the issued final invoice. The date is the business day
//   of the recording; a check needs its number and payer and stays pending until the Owner clears it.
// - The view shows only what the collector needs: what is still due, what is pending and their own collections on
//   the job with each receipt number. It never shows other payments, references, collectors or invoice lines.
// - The recording goes through the same transactions as the office's (deposits.ts, ledger.ts): the receipt (cash and
//   card at once), Paid, unallocated money and the check queue follow from there.
import type { Db, Tx } from '@handyhub/db'
import { localDate } from '@handyhub/domain/request-form'
import type { StaffActor } from '@handyhub/policy'
import { sql } from 'kysely'
import { ApiError, type FieldError } from '../../api/errors.js'
import { loadConfig } from '../../platform/config/index.js'
import { customerDeposit, recordDepositPayment, type PaymentMethod } from './deposits.js'
import { invoiceMoney, recordInvoicePayment } from './ledger.js'

type Reader = Db | Tx

/** PROPOSED: the methods a staff member takes in person (OQ-CASH-CHECK-DETAILS). */
export const ON_SITE_METHODS = ['cash', 'check', 'square_tap_to_pay'] as const satisfies readonly PaymentMethod[]
export type OnSiteMethod = (typeof ON_SITE_METHODS)[number]

const field = (f: string, code: string): FieldError => ({ field: f, code, message: '' })

export type CollectionView = {
  jobId: string
  reference: string
  deposit: { remainingCents: number; pendingCents: number } | null
  invoice: { number: string; remainingCents: number; pendingCents: number } | null
  methods: OnSiteMethod[]
  /** The caller's own collections on this job, newest first. */
  mine: {
    method: string
    amountCents: number
    receivedOn: string
    state: string
    receiptNumber: string | null
  }[]
}

function dateText(d: Date | string): string {
  if (typeof d === 'string') return d.slice(0, 10)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function finalInvoice(db: Reader, jobId: string) {
  return db
    .selectFrom('finance.invoices')
    .select(['id', 'number'])
    .where('job_id', '=', jobId)
    .where('kind', '=', 'final')
    .where('state', 'in', ['issued', 'partially_paid'])
    .executeTakeFirst()
}

/** What the collector may take on this job now; null when there is no such job. */
export async function collectionView(db: Reader, actor: StaffActor, jobId: string): Promise<CollectionView | null> {
  const job = await db
    .selectFrom('work.jobs as j')
    .innerJoin('crm.projects as p', 'p.id', 'j.project_id')
    .select(['j.id', 'j.project_id', 'p.reference'])
    .where('j.id', '=', jobId)
    .executeTakeFirst()
  if (!job) return null
  const d = await customerDeposit(db, job.project_id)
  const i = await finalInvoice(db, jobId)
  const money = i ? await invoiceMoney(db, i.id) : null
  const mine = await db
    .selectFrom('finance.payments as p')
    .leftJoin('finance.payment_receipts as r', 'r.payment_id', 'p.id')
    .select(['p.method', 'p.amount_cents', 'p.received_on', 'p.state', 'p.created_at', 'r.number'])
    .where('p.job_id', '=', jobId)
    .where('p.collector_staff_id', '=', actor.userId)
    .orderBy('p.created_at', 'desc')
    .execute()
  return {
    jobId,
    reference: job.reference,
    deposit:
      d.state === 'deposit_due'
        ? { remainingCents: Math.max(0, d.amountCents - d.verifiedCents), pendingCents: d.pendingCents }
        : null,
    invoice:
      i?.number && money && money.remainingCents > 0
        ? { number: i.number, remainingCents: money.remainingCents, pendingCents: money.pendingCents }
        : null,
    methods: [...ON_SITE_METHODS],
    mine: mine.map((p) => ({
      method: p.method,
      amountCents: Number(p.amount_cents),
      receivedOn: dateText(p.received_on),
      state: p.state,
      receiptNumber: p.number,
    })),
  }
}

export type CollectInput = {
  target: 'deposit' | 'invoice'
  method: OnSiteMethod
  amountCents: number
  reference?: string | null
  payerName?: string | null
  memo?: string | null
}

/** Records the caller's own on-site collection toward the deposit or the final invoice; the receipt follows. */
export async function collectOnSite(tx: Tx, actor: StaffActor, jobId: string, input: CollectInput) {
  if (!(ON_SITE_METHODS as readonly string[]).includes(input.method))
    throw new ApiError('VALIDATION_FAILED', { fieldErrors: [field('body.method', 'NOT_ON_SITE')] })
  const r = await sql<{ now: Date }>`SELECT now() AS now`.execute(tx)
  const zone = (await loadConfig(tx)).get('business.timezone')
  const receivedOn = localDate(
    new Date((r.rows[0] as { now: Date }).now),
    zone.state === 'CONFIGURED' ? zone.value.zone : 'UTC',
  )
  const payment = {
    method: input.method,
    amountCents: input.amountCents,
    receivedOn,
    reference: input.reference ?? null,
    payerName: input.payerName ?? null,
    memo: input.memo ?? null,
    // Always the caller's own collection (the policy's own_collection condition decided it too).
    collectorStaffId: actor.userId,
  }
  if (input.target === 'deposit') {
    const out = await recordDepositPayment(tx, actor, jobId, payment)
    return { paymentId: out.paymentId, state: out.state }
  }
  const i = await finalInvoice(tx, jobId)
  if (!i) throw new ApiError('CONFLICT', { fieldErrors: [field('invoice', 'NO_INVOICE_TO_PAY')] })
  const out = await recordInvoicePayment(tx, actor, i.id, payment)
  return { paymentId: out.paymentId, state: out.state }
}
