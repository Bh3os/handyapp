// The deletion log and the removal of stored files (TSK-0100; HH-PRIV-05, HH-PRIV-03, T72, OWN-DEC-70, OWN-DEC-71).
// - recordDeletion writes one log entry (privacy.deletions, append-only): actor, time, record reference and reason,
//   what kinds of rows went with it (counts), whether it was early, where the decision came from. Never the deleted
//   content. The erasure itself runs in the same transaction, named by this entry (migration 0058).
// - Stored files go after the commit: the privacy.object_erasure job removes each key (idempotent: a key already gone
//   succeeds), retried until it succeeds; NOT CONFIGURED storage fails the job for the Owner to see.
// - The log is listed to the Owner and exported for a restore (re-application, reapply.ts): references only.
import type { Db, Tx } from '@handyhub/db'
import { sql } from 'kysely'
import { ApiError } from '../../api/errors.js'
import { toPage, type Page, type PageRequest } from '../../api/pagination.js'
import type { Automation } from '../../platform/automation.js'
import { scheduleJob } from '../../platform/jobs.js'
import type { ObjectStorage } from '../../providers/index.js'

export const OBJECT_ERASURE_AUTOMATION = 'privacy.object_erasure'

export type DeletionInput = {
  recordType: 'estimate' | 'customer_account'
  recordId: string
  recordRef: string
  projectId: string | null
  source: 'retention_review' | 'privacy_request' | 'restore_reapply'
  reviewId?: string
  privacyRequestId?: string
  original?: { id: string; decidedAt: Date }
  reason: string
  early: boolean
  permanent: boolean
  checksConfirmed: readonly string[]
  /** What goes with the record, counted under its row lock before the erasure (the erasure then checks it). */
  removed: Removed
  decidedBy: string
  requestId: string
}

export type Removed = Record<string, number>

/** Writes the log entry; its id names the erasure that follows in this transaction. */
export async function recordDeletion(tx: Tx, input: DeletionInput): Promise<{ id: string; seq: string }> {
  if (!tx.isTransaction) throw new Error('recordDeletion runs inside the deletion transaction (withTx)')
  return tx
    .insertInto('privacy.deletions')
    .values({
      record_type: input.recordType,
      record_id: input.recordId,
      record_ref: input.recordRef.slice(0, 160) || input.recordType,
      project_id: input.projectId,
      source: input.source,
      review_id: input.reviewId ?? null,
      privacy_request_id: input.privacyRequestId ?? null,
      original_deletion_id: input.original?.id ?? null,
      original_decided_at: input.original?.decidedAt ?? null,
      reason: input.reason.trim(),
      early: input.early,
      permanent: input.permanent,
      removed: JSON.stringify(input.removed),
      checks_confirmed: [...input.checksConfirmed],
      decided_by: input.decidedBy,
      request_id: input.requestId,
    })
    .returning(['id', sql<string>`seq::text`.as('seq')])
    .executeTakeFirstOrThrow()
}

/** Schedules the removal of stored files after this transaction commits (one job per deletion). */
export async function scheduleObjectErasure(
  tx: Tx,
  input: { deletionId: string; keys: readonly string[]; requestId: string },
): Promise<void> {
  if (input.keys.length === 0) return
  await scheduleJob(tx, objectErasureAutomation(null), {
    key: `deletion:${input.deletionId}`,
    payload: { keys: input.keys.join(',') },
    target: { type: 'deletion', id: input.deletionId },
    requestId: input.requestId,
  })
}

export function objectErasureAutomation(storage: ObjectStorage | null): Automation {
  return {
    name: OBJECT_ERASURE_AUTOMATION,
    trigger: {
      kind: 'schedule',
      description: 'once per recorded deletion that removed stored files, after it commits',
    },
    identity: 'system.privacy',
    inputs: { description: 'the opaque storage keys of the deleted record (job payload); never content', version: 1 },
    idempotency: 'one job per deletion log entry (key: deletion:<id>); removing a key that is already gone succeeds',
    effect: 'removes the stored files of a record the Owner deleted (photos and documents in R2)',
    retry: { maxAttempts: 10, baseDelayMs: 60_000, maxDelayMs: 3_600_000 },
    timeoutMs: 60_000,
    exceptionOwner: 'owner',
    audit: { action: 'privacy.objects_removed' },
    handle: async ({ job }) => {
      if (!storage) throw new Error('object storage is NOT CONFIGURED; the files of a deleted record wait')
      const keys = String(job.payload['keys'] ?? '')
        .split(',')
        .filter(Boolean)
      for (const key of keys) await storage.delete(key)
      return 'done'
    },
  }
}

export type DeletionView = {
  id: string
  seq: string
  record: { type: string; id: string; reference: string }
  source: string
  reason: string
  early: boolean
  permanent: boolean
  removed: Record<string, number>
  checksConfirmed: string[]
  decidedBy: { id: string; name: string | null } | { system: string }
  decidedAt: string
  original: { id: string; decidedAt: string } | null
}

const SEQ = /^[1-9][0-9]{0,18}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** One page of the deletion log, newest first. */
export async function listDeletions(db: Db, page: PageRequest): Promise<Page<DeletionView>> {
  let before: string | undefined
  if (page.after !== undefined) {
    const [seq] = page.after
    if (page.after.length !== 1 || typeof seq !== 'string' || !SEQ.test(seq))
      throw new ApiError('VALIDATION_FAILED', {
        fieldErrors: [{ field: 'querystring.cursor', code: 'invalid', message: '' }],
      })
    before = seq
  }
  let q = db
    .selectFrom('privacy.deletions as d')
    .leftJoin('identity.staff_users as u', (j) =>
      j.on(sql<boolean>`d.decided_by ~ ${UUID.source}`).on(sql<boolean>`u.id::text = d.decided_by`),
    )
    .select([
      'd.id',
      sql<string>`d.seq::text`.as('seq'),
      'd.record_type',
      'd.record_id',
      'd.record_ref',
      'd.source',
      'd.reason',
      'd.early',
      'd.permanent',
      'd.removed',
      'd.checks_confirmed',
      'd.decided_by',
      'd.decided_at',
      'd.original_deletion_id',
      'd.original_decided_at',
      'u.display_name',
    ])
  if (before !== undefined) q = q.where(sql<boolean>`d.seq < ${before}::bigint`)
  const rows = await q
    .orderBy('d.seq', 'desc')
    .limit(page.limit + 1)
    .execute()
  const out = toPage(rows, page, (r) => [r.seq])
  return {
    items: out.items.map((r) => ({
      id: r.id,
      seq: r.seq,
      record: { type: r.record_type, id: r.record_id, reference: r.record_ref },
      source: r.source,
      reason: r.reason,
      early: r.early,
      permanent: r.permanent,
      removed: r.removed as Record<string, number>,
      checksConfirmed: [...r.checks_confirmed],
      decidedBy: UUID.test(r.decided_by)
        ? { id: r.decided_by, name: r.display_name ?? null }
        : { system: r.decided_by },
      decidedAt: new Date(r.decided_at).toISOString(),
      original:
        r.original_deletion_id && r.original_decided_at
          ? { id: r.original_deletion_id, decidedAt: new Date(r.original_decided_at).toISOString() }
          : null,
    })),
    nextCursor: out.nextCursor,
  }
}

/** One exported log entry: what a restore re-applies (references only, never content; T72). */
export type ExportedDeletion = {
  id: string
  recordType: 'estimate' | 'customer_account'
  recordId: string
  recordRef: string
  reason: string
  decidedAt: string
}

/** Every log entry recorded at or after `since` (all when omitted), oldest first, for keeping outside the backup. */
export async function exportDeletions(db: Db | Tx, since?: Date): Promise<ExportedDeletion[]> {
  let q = db
    .selectFrom('privacy.deletions')
    .select(['id', 'record_type', 'record_id', 'record_ref', 'reason', 'decided_at', 'source', 'original_deletion_id'])
  if (since) q = q.where('decided_at', '>=', since)
  const rows = await q.orderBy('seq').execute()
  return rows.map((r) => ({
    // A re-application keeps the original entry's identity, so exporting twice never doubles the work.
    id: r.original_deletion_id ?? r.id,
    recordType: r.record_type as ExportedDeletion['recordType'],
    recordId: r.record_id,
    recordRef: r.record_ref,
    reason: r.reason,
    decidedAt: new Date(r.decided_at).toISOString(),
  }))
}
