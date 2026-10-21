// The deposit_due action-queue item (TSK-0059; S01 "deposits and checks to verify", HH-FIN-02, HH-FIN-12, HH-OPS-01).
// One item per job while its required deposit is still due: "Deposit due", or "Deposit check waiting to clear" while
// an applied check is pending; resolved once verified money covers it (paid) or the Owner waives it (waived). The
// deposit writes keep it in line in their own transaction; the approval's committed event opens it.
import type { Tx } from '@handyhub/db'
import type { Automation } from '../../platform/automation.js'
import { ESTIMATE_APPROVED_EVENT } from '../estimates/approval.js'
import { openQueueItem, resolveQueueItem } from '../queue/items.js'

/** Brings a job's deposit_due item in line with its deposit as it is now. */
export async function syncDepositItem(tx: Tx, jobId: string): Promise<'open' | 'resolved' | 'missing'> {
  const r = await tx
    .selectFrom('finance.deposit_requirements as r')
    .innerJoin('crm.projects as p', 'p.id', 'r.project_id')
    .select(['r.id', 'r.state', 'r.project_id', 'r.created_at', 'p.reference', 'p.responsible_staff_id'])
    .where('r.job_id', '=', jobId)
    .executeTakeFirst()
  if (!r) return 'missing'
  if (r.state !== 'required' && r.state !== 'partly_satisfied') {
    await resolveQueueItem(tx, {
      type: 'deposit_due',
      subjectId: jobId,
      resolution: r.state === 'waived' ? 'waived' : r.state === 'not_required' ? 'not_required' : 'paid',
    })
    return 'resolved'
  }
  const pending = await tx
    .selectFrom('finance.payment_allocations as a')
    .innerJoin('finance.payments as p', 'p.id', 'a.payment_id')
    .select('a.id')
    .where('a.deposit_requirement_id', '=', r.id)
    .where('p.state', 'in', ['received', 'deposited'])
    .limit(1)
    .executeTakeFirst()
  await openQueueItem(tx, {
    type: 'deposit_due',
    subjectId: jobId,
    reason: pending ? 'deposit_check_pending' : 'deposit_due',
    projectId: r.project_id,
    reference: r.reference,
    status: r.state,
    assignedStaffId: r.responsible_staff_id,
    openedAt: r.created_at,
  })
  return 'open'
}

/** An approval whose job needs a deposit opens the job's deposit_due item. */
export function depositQueueAutomation(): Automation {
  return {
    name: 'queue.deposit_due',
    trigger: { kind: 'event', eventTypes: [ESTIMATE_APPROVED_EVENT] },
    identity: 'system.queue',
    inputs: {
      description: 'the approval id of the estimate.approved event; its job and deposit as they are now',
      version: 1,
    },
    idempotency: 'one open deposit_due item per job; a replay updates it, and a deposit not due opens none',
    effect: 'opens or updates the deposit_due queue item of a job whose required deposit is still due',
    retry: { maxAttempts: 5, baseDelayMs: 1_000, maxDelayMs: 60_000 },
    timeoutMs: 10_000,
    exceptionOwner: 'office',
    audit: { action: 'queue.item_opened' },
    handle: async ({ tx, job }) => {
      const approvalId = job.target.id
      if (!approvalId) return 'cancelled'
      const j = await tx.selectFrom('work.jobs').select('id').where('approval_id', '=', approvalId).executeTakeFirst()
      if (!j) return 'cancelled'
      return (await syncDepositItem(tx, j.id)) === 'open' ? 'done' : 'cancelled'
    },
  }
}
