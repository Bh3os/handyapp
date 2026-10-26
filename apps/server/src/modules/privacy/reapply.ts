// Deletions re-applied after a restore (TSK-0100; HH-PRIV-03 "deletions and suppressions are re-applied after any backup
// restore", HH-PRIV-05, T72, OWN-DEC-70). A restored database holds the records that were deleted after its backup,
// and loses the log entries of those deletions. The operator keeps the exported log (references only: log.ts
// exportDeletions) outside the backups; after a restore, before the controlled resume, each exported entry is applied
// again here:
// - a record that is gone already is reported as absent (nothing to do);
// - a record that is back is checked as on the day: anything that now blocks its deletion (a hold, protected evidence,
//   a record in use) leaves it in place and reports it blocked, for the Owner; otherwise it is erased again with a new
//   log entry (source restore_reapply) naming the original entry and its time;
// - a login account that is open again is closed again;
// - a request that never became a job (TSK-0137) is erased again with its remainder, unless something now blocks it.
// Running it twice changes nothing the second time. The not-recorded checks were confirmed by the Owner when they
// decided; the re-application records that it relied on that decision.
import type { Tx } from '@handyhub/db'
import { closeCustomerAccount } from '../accounts/accounts.js'
import { recordDeletion, scheduleObjectErasure, type ExportedDeletion } from './log.js'
import { eraseRequest, requestErasurePlan } from './request-erasure.js'
import { eraseEstimate, estimateTarget, type Blocker } from './targets.js'

export const REAPPLY_PROCESS = 'system.restore'

export type ReapplyResult = {
  id: string
  recordType: string
  reference: string
  outcome: 'reapplied' | 'absent' | 'blocked'
  blockers: Blocker[]
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** Parses an exported log file; refuses anything that is not a list of exported entries. */
export function parseExportedDeletions(text: string): ExportedDeletion[] {
  const value: unknown = JSON.parse(text)
  if (!Array.isArray(value)) throw new Error('the deletion log export is a JSON list')
  return value.map((v, i) => {
    const e = v as Record<string, unknown>
    if (
      typeof e['id'] !== 'string' ||
      !UUID.test(e['id']) ||
      (e['recordType'] !== 'estimate' && e['recordType'] !== 'customer_account' && e['recordType'] !== 'request') ||
      typeof e['recordId'] !== 'string' ||
      !UUID.test(e['recordId']) ||
      typeof e['recordRef'] !== 'string' ||
      typeof e['reason'] !== 'string' ||
      typeof e['decidedAt'] !== 'string' ||
      Number.isNaN(Date.parse(e['decidedAt']))
    )
      throw new Error(`entry ${i + 1} of the deletion log export is not an exported deletion`)
    return {
      id: e['id'],
      recordType: e['recordType'],
      recordId: e['recordId'],
      recordRef: e['recordRef'],
      reason: e['reason'],
      decidedAt: e['decidedAt'],
    }
  })
}

export async function reapplyDeletions(
  tx: Tx,
  entries: readonly ExportedDeletion[],
  options: { requestId: string; operator?: string },
): Promise<ReapplyResult[]> {
  if (!tx.isTransaction) throw new Error('reapplyDeletions runs inside a transaction (withTx)')
  const by = options.operator ? `${REAPPLY_PROCESS}:${options.operator}`.slice(0, 200) : REAPPLY_PROCESS
  const out: ReapplyResult[] = []
  for (const e of entries) {
    const base = { id: e.id, recordType: e.recordType, reference: e.recordRef }
    if (e.recordType === 'customer_account') {
      const closed = await closeCustomerAccount(tx, { accountId: e.recordId, by })
      if (!closed.closed) {
        out.push({ ...base, outcome: 'absent', blockers: [] })
        continue
      }
      await recordDeletion(tx, {
        recordType: 'customer_account',
        recordId: e.recordId,
        recordRef: e.recordRef,
        projectId: null,
        source: 'restore_reapply',
        original: { id: e.id, decidedAt: new Date(e.decidedAt) },
        reason: e.reason,
        early: false,
        permanent: true,
        checksConfirmed: [],
        removed: {
          sign_in_values: 1,
          sessions: closed.sessions,
          project_links: closed.links,
          access_links: closed.grants,
        },
        decidedBy: by,
        requestId: options.requestId,
      })
      out.push({ ...base, outcome: 'reapplied', blockers: [] })
      continue
    }
    if (e.recordType === 'request') {
      // TSK-0137: a request erased again, with its remainder; what blocks it now leaves it in place.
      const plan = await requestErasurePlan(tx, e.recordId, { lock: true })
      if (!plan.preview.exists) {
        out.push({ ...base, outcome: 'absent', blockers: [] })
        continue
      }
      if (plan.preview.blockers.length > 0) {
        out.push({ ...base, outcome: 'blocked', blockers: plan.preview.blockers })
        continue
      }
      const entry = await recordDeletion(tx, {
        recordType: 'request',
        recordId: e.recordId,
        recordRef: e.recordRef,
        projectId: plan.preview.record.projectId,
        source: 'restore_reapply',
        original: { id: e.id, decidedAt: new Date(e.decidedAt) },
        reason: e.reason,
        early: false,
        permanent: true,
        checksConfirmed: [],
        removed: Object.fromEntries(plan.preview.removes.map((r) => [r.kind, r.count])),
        decidedBy: by,
        requestId: options.requestId,
      })
      const erased = await eraseRequest(tx, { requestId: e.recordId, deletionId: entry.id })
      await scheduleObjectErasure(tx, { deletionId: entry.id, keys: erased.objectKeys, requestId: options.requestId })
      out.push({ ...base, outcome: 'reapplied', blockers: [] })
      continue
    }
    const t = await estimateTarget(tx, e.recordId, { lock: true })
    if (!t.exists) {
      out.push({ ...base, outcome: 'absent', blockers: [] })
      continue
    }
    if (t.blockers.length > 0) {
      out.push({ ...base, outcome: 'blocked', blockers: t.blockers })
      continue
    }
    const removed = Object.fromEntries(t.removes.map((r) => [r.kind, r.count]))
    const entry = await recordDeletion(tx, {
      recordType: 'estimate',
      recordId: e.recordId,
      recordRef: e.recordRef,
      projectId: t.record.projectId,
      source: 'restore_reapply',
      original: { id: e.id, decidedAt: new Date(e.decidedAt) },
      reason: e.reason,
      early: false,
      permanent: true,
      checksConfirmed: [],
      removed,
      decidedBy: by,
      requestId: options.requestId,
    })
    const erased = await eraseEstimate(tx, { estimateId: e.recordId, deletionId: entry.id })
    await scheduleObjectErasure(tx, { deletionId: entry.id, keys: erased.objectKeys, requestId: options.requestId })
    out.push({ ...base, outcome: 'reapplied', blockers: [] })
  }
  return out
}
