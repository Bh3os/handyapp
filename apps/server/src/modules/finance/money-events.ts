// What follows a change of money on a job (TSK-0086; HH-FIN-07, T59, S01, OWN-DEC-111, OWN-DEC-152), in the
// transaction that changed it:
// - Unallocated money (an overpayment, or a deposit payment beyond the deposit) stays as the customer's money for the
//   Owner's credit or refund decision: one unallocated_credit item in Owner Decisions per job while any of the job's
//   payments still has money not applied (never a negative invoice balance). Deciding it is TSK-0089.
// - An invoice whose confirmed payments and credits reach its total is Paid: the committed invoice.paid event is
//   written once per invoice (the outbox idempotency key), whichever write got it there. The payment receipt message
//   it triggers (payment.receipt) is wired by TSK-0087.
import type { Tx } from '@handyhub/db'
import { sql } from 'kysely'
import { outbox } from '../../platform/outbox.js'
import { openQueueItem, resolveQueueItem } from '../queue/items.js'

export const INVOICE_PAID_EVENT = 'invoice.paid'

/** The money of the job's payments not applied to anything (returned or voided payments give nothing). */
export async function unallocatedCents(db: Tx | import('@handyhub/db').Db, jobId: string): Promise<number> {
  const r = await sql<{ cents: string | null }>`
    SELECT sum(p.amount_cents - finance.payment_used_cents(p.id))::text AS cents
      FROM finance.payments p
     WHERE p.job_id = ${jobId} AND p.state NOT IN ('returned', 'voided')`.execute(db)
  return Number(r.rows[0]?.cents ?? 0)
}

/** Opens, updates or resolves the job's unallocated_credit item as the job's money stands now. */
export async function syncUnallocatedItem(tx: Tx, jobId: string): Promise<'open' | 'resolved' | 'missing'> {
  const job = await tx
    .selectFrom('work.jobs as j')
    .innerJoin('crm.projects as p', 'p.id', 'j.project_id')
    .select(['j.id', 'j.project_id', 'p.reference', 'p.responsible_staff_id'])
    .where('j.id', '=', jobId)
    .executeTakeFirst()
  if (!job) return 'missing'
  if ((await unallocatedCents(tx, jobId)) <= 0) {
    await resolveQueueItem(tx, { type: 'unallocated_credit', subjectId: jobId, resolution: 'allocated' })
    return 'resolved'
  }
  await openQueueItem(tx, {
    type: 'unallocated_credit',
    subjectId: jobId,
    reason: 'overpayment',
    projectId: job.project_id,
    reference: job.reference,
    assignedStaffId: job.responsible_staff_id,
  })
  return 'open'
}

/** Writes the invoice.paid event once for each of the job's invoices that is Paid now. */
export async function announcePaidInvoices(tx: Tx, jobId: string): Promise<string[]> {
  const paid = await tx
    .selectFrom('finance.invoices')
    .select(['id', 'version'])
    .where('job_id', '=', jobId)
    .where('state', '=', 'paid')
    .execute()
  for (const i of paid)
    await outbox.add(tx, {
      type: INVOICE_PAID_EVENT,
      aggregate: { type: 'invoice', id: i.id },
      idempotencyKey: `${INVOICE_PAID_EVENT}:${i.id}`,
    })
  return paid.map((i) => i.id)
}
