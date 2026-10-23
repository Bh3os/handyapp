// Checks pending until cleared, and reconciliation (TSK-0088; HH-FIN-11, HH-FIN-12, T59, T62, OWN-DEC-138,
// OWN-DEC-200). Migration 0093 keeps the records true whatever path writes.
// - A check is received (pending) when recorded, then deposited (the Owner or Office: payment.reconcile, never one they
//   collected), then cleared by the Owner only (markCheckCleared in deposits.ts). Until cleared it never counts toward
//   Paid and never satisfies a deposit.
// - Any other payment is confirmed when recorded (its receipt goes at once, receipts.ts); reconciling it against the
//   bank or Square later is a separate step (the Owner or Office, never one they collected) and changes no balance.
// - Checks to verify are in the Owner's queue: one check_to_clear item per job while any of its checks is pending
//   (received, or deposited and waiting to clear), resolved when the last one clears.
import type { Tx } from '@handyhub/db'
import type { StaffActor } from '@handyhub/policy'
import { sql } from 'kysely'
import { ApiError, type FieldError } from '../../api/errors.js'
import { openQueueItem, resolveQueueItem } from '../queue/items.js'

export const CHECK_QUEUE_TYPE = 'check_to_clear'

const field = (f: string, code: string): FieldError => ({ field: f, code, message: '' })
const conflict = (code: string) => new ApiError('CONFLICT', { fieldErrors: [field('payment', code)] })

/** Opens, updates or resolves the job's check_to_clear item as its checks stand now. */
export async function syncCheckItem(tx: Tx, jobId: string): Promise<'open' | 'resolved'> {
  const checks = await tx
    .selectFrom('finance.payments')
    .select('state')
    .where('job_id', '=', jobId)
    .where('method', '=', 'check')
    .where('state', 'in', ['received', 'deposited'])
    .execute()
  if (checks.length === 0) {
    await resolveQueueItem(tx, { type: CHECK_QUEUE_TYPE, subjectId: jobId, resolution: 'cleared' })
    return 'resolved'
  }
  const job = await tx
    .selectFrom('work.jobs as j')
    .innerJoin('crm.projects as p', 'p.id', 'j.project_id')
    .select(['j.project_id', 'p.reference'])
    .where('j.id', '=', jobId)
    .executeTakeFirstOrThrow()
  await openQueueItem(tx, {
    type: CHECK_QUEUE_TYPE,
    subjectId: jobId,
    // A check still to deposit comes first; once all are deposited, they wait to clear.
    reason: checks.some((c) => c.state === 'received') ? 'check_received' : 'check_deposited',
    projectId: job.project_id,
    reference: job.reference,
  })
  return 'open'
}

async function lockPayment(tx: Tx, paymentId: string) {
  const p = await tx
    .selectFrom('finance.payments')
    .select(['id', 'job_id', 'method', 'state', 'collector_staff_id', 'version'])
    .where('id', '=', paymentId)
    .forUpdate()
    .executeTakeFirst()
  if (!p) throw new ApiError('NOT_FOUND')
  return p
}

/** Marks a received check deposited at the bank: still pending until the Owner clears it. */
export async function markCheckDeposited(tx: Tx, actor: StaffActor, paymentId: string) {
  const p = await lockPayment(tx, paymentId)
  if (p.method !== 'check') throw conflict('NOT_A_CHECK')
  if (p.state !== 'received') throw conflict(`CHECK_${p.state.toUpperCase()}`)
  if (p.collector_staff_id === actor.userId) throw new ApiError('FORBIDDEN')
  const next = await tx
    .updateTable('finance.payments')
    .set({ state: 'deposited', deposited_by: actor.userId, deposited_at: new Date(), version: p.version + 1 })
    .where('id', '=', p.id)
    .returning(['state', 'version'])
    .executeTakeFirstOrThrow()
  await syncCheckItem(tx, p.job_id)
  return { jobId: p.job_id, state: next.state, version: next.version }
}

/** Reconciles a confirmed payment (not a check) against the bank or Square; no balance changes. */
export async function reconcilePayment(tx: Tx, actor: StaffActor, paymentId: string) {
  const p = await lockPayment(tx, paymentId)
  if (p.method === 'check') throw conflict('CHECK_CLEARS_INSTEAD')
  if (p.state !== 'recorded') throw conflict(`PAYMENT_${p.state.toUpperCase()}`)
  if (p.collector_staff_id === actor.userId) throw new ApiError('FORBIDDEN')
  // TSK-0089: a disputed payment waits for the dispute's outcome.
  const disputed = await sql<{ open: boolean }>`SELECT finance.payment_dispute_open(${p.id}) AS open`.execute(tx)
  if (disputed.rows[0]?.open === true) throw conflict('DISPUTE_OPEN')
  const next = await tx
    .updateTable('finance.payments')
    .set({ state: 'reconciled', reconciled_by: actor.userId, reconciled_at: new Date(), version: p.version + 1 })
    .where('id', '=', p.id)
    .returning(['state', 'version'])
    .executeTakeFirstOrThrow()
  return { jobId: p.job_id, state: next.state, version: next.version }
}
