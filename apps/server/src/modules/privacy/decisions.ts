// The Owner's decisions on deletion-review entries (TSK-0100; HH-PRIV-05, HH-DATA-09, ENT-RetentionReview, OWN-DEC-70,
// OWN-DEC-142, FACT-RETENTION-SCHEDULE, RULE-SERVER-AUTHZ). An entry (privacy.retention_reviews) stays exactly as the
// job opened it; each decision is a new row (privacy.retention_decisions, append-only):
// - Delete: the confirmation names the record, what goes with it, what stays, whether it is permanent, every check
//   and every blocker. An estimate never accepted is erased (targets.ts); a request that never became a job is erased
//   with a reference-and-dates remainder (TSK-0137, request-erasure.ts). Confirm Delete never passes a blocker (a
//   hold, protected evidence, a record still in use, an erasure the software does not perform) and needs every
//   not-recorded check confirmed by the Owner, a written reason and a fresh sign-in (the route). The deletion log
//   entry and the erasure commit together.
// - Archive: the record is kept as it is (its category and permissions unchanged, HH-DATA-09) and the entry leaves
//   the open queue; offered whenever deletion is blocked. A later Delete is still possible once nothing blocks it.
// - Keep longer: the record is kept and the entry comes back to the queue at the chosen time.
// Nothing follows a deletion. Every decision is audited with its reason.
import type { Db, Tx } from '@handyhub/db'
import { sql } from 'kysely'
import { ApiError } from '../../api/errors.js'
import { recordDeletion, scheduleObjectErasure } from './log.js'
import { decideErasedEstimates, eraseRequest } from './request-erasure.js'
import {
  eraseEstimate,
  targetOf,
  UNRECORDED_DELETION_CHECKS,
  type Blocker,
  type DeletionCheck,
  type TargetPreview,
} from './targets.js'

type Reader = Db | Tx

export type EntryState = 'pending' | 'archived' | 'kept' | 'deleted'
export type EntryStatus = {
  state: EntryState
  /** Keep longer: when the entry comes back (past: it is pending again). */
  until: string | null
  decidedAt: string | null
  reason: string | null
}

const PENDING: EntryStatus = { state: 'pending', until: null, decidedAt: null, reason: null }

type DecisionRow = { review_id: string; decision: string; keep_until: Date | null; decided_at: Date; reason: string }

function statusOf(row: DecisionRow | undefined, now: Date): EntryStatus {
  if (!row) return PENDING
  const base = { decidedAt: new Date(row.decided_at).toISOString(), reason: row.reason }
  if (row.decision === 'delete') return { state: 'deleted', until: null, ...base }
  if (row.decision === 'archive') return { state: 'archived', until: null, ...base }
  const until = row.keep_until ? new Date(row.keep_until) : null
  if (until && until.getTime() <= now.getTime()) return { state: 'pending', until: until.toISOString(), ...base }
  return { state: 'kept', until: until ? until.toISOString() : null, ...base }
}

/** The status of each entry: its latest decision, read now. */
export async function entryStatuses(db: Reader, reviewIds: readonly string[], now = new Date()) {
  const out = new Map<string, EntryStatus>()
  if (reviewIds.length === 0) return out
  const rows = await db
    .selectFrom('privacy.retention_decisions')
    .select(['review_id', 'decision', 'keep_until', 'decided_at', 'reason'])
    .distinctOn('review_id')
    .where('review_id', 'in', [...reviewIds])
    .orderBy('review_id')
    .orderBy('seq', 'desc')
    .execute()
  const byId = new Map(rows.map((r) => [r.review_id, r]))
  for (const id of reviewIds) out.set(id, statusOf(byId.get(id), now))
  return out
}

type Entry = {
  id: string
  category: string
  record_type: string
  record_id: string
  record_ref: string
  project_id: string | null
  period_ends_at: Date
}

async function entryOf(db: Reader, reviewId: string): Promise<Entry | null> {
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
  if (!UUID.test(reviewId)) return null
  return (
    (await db
      .selectFrom('privacy.retention_reviews')
      .select(['id', 'category', 'record_type', 'record_id', 'record_ref', 'project_id', 'period_ends_at'])
      .where('id', '=', reviewId)
      .executeTakeFirst()) ?? null
  )
}

/** Whether a review entry exists (the routes' NOT_FOUND). */
export async function reviewExists(db: Reader, reviewId: string): Promise<boolean> {
  return (await entryOf(db, reviewId)) !== null
}

export type EntryPreview = {
  entry: { id: string; category: string; reference: string; periodEndsAt: string }
  status: EntryStatus
  /** Deleted before the end of its retention period (needs the recorded reason, OWN-DEC-70). */
  early: boolean
  target: TargetPreview
}

/** What Delete would do for an entry, read now; null for an unknown entry. */
export async function previewEntry(db: Reader, reviewId: string, now = new Date()): Promise<EntryPreview | null> {
  const e = await entryOf(db, reviewId)
  if (!e) return null
  const status = (await entryStatuses(db, [e.id], now)).get(e.id) ?? PENDING
  const target =
    status.state === 'deleted'
      ? {
          ...(await targetOf(db, { type: e.record_type, id: e.record_id, projectId: e.project_id }, { now })),
          blockers: ['already_deleted'] as Blocker[],
        }
      : await targetOf(db, { type: e.record_type, id: e.record_id, projectId: e.project_id }, { now })
  return {
    entry: { id: e.id, category: e.category, reference: e.record_ref, periodEndsAt: e.period_ends_at.toISOString() },
    status,
    early: now.getTime() < e.period_ends_at.getTime(),
    target: { ...target, record: { ...target.record, reference: target.record.reference || e.record_ref } },
  }
}

const lockEntry = (tx: Tx, reviewId: string) =>
  sql`SELECT pg_advisory_xact_lock(hashtextextended(${`privacy.retention_review:${reviewId}`}, 0))`.execute(tx)

/** A blocked deletion: CONFLICT naming each blocker (codes), so the screen says why and offers Archive. */
export const blockedError = (blockers: readonly Blocker[]) =>
  new ApiError('CONFLICT', {
    fieldErrors: blockers.map((b) => ({ field: 'blockers', code: b.toUpperCase(), message: '' })),
  })

/** The not-recorded checks the Owner did not confirm: VALIDATION_FAILED naming each. */
export function unconfirmed(required: readonly DeletionCheck[], confirmed: readonly string[]): ApiError | null {
  const missing = required.filter((c) => !confirmed.includes(c))
  if (missing.length === 0) return null
  return new ApiError('VALIDATION_FAILED', {
    fieldErrors: missing.map((c) => ({ field: `body.confirmedChecks.${c}`, code: 'CHECK_NOT_CONFIRMED', message: '' })),
  })
}

export type DeleteOutcome =
  | { ok: true; deletionId: string; preview: EntryPreview; removed: Record<string, number> }
  | { ok: false; error: ApiError; preview: EntryPreview | null; blockers: Blocker[] }

/**
 * Confirm Delete on an entry, inside the route's transaction: the preview is computed again under the entry's lock and
 * the record's row lock; any blocker or an unconfirmed check refuses with nothing written but the caller's audit.
 */
export async function deleteEntry(
  tx: Tx,
  input: {
    reviewId: string
    staffUserId: string
    reason: string
    confirmedChecks: readonly string[]
    requestId: string
  },
): Promise<DeleteOutcome> {
  await lockEntry(tx, input.reviewId)
  const now = new Date()
  const e = await entryOf(tx, input.reviewId)
  if (!e) throw new ApiError('NOT_FOUND')
  const status = (await entryStatuses(tx, [e.id], now)).get(e.id) ?? PENDING
  if (status.state === 'deleted')
    return { ok: false, error: blockedError(['already_deleted']), preview: null, blockers: ['already_deleted'] }
  const target = await targetOf(
    tx,
    { type: e.record_type, id: e.record_id, projectId: e.project_id },
    { now, lock: true },
  )
  const preview: EntryPreview = {
    entry: { id: e.id, category: e.category, reference: e.record_ref, periodEndsAt: e.period_ends_at.toISOString() },
    status,
    early: now.getTime() < e.period_ends_at.getTime(),
    target,
  }
  if (target.blockers.length > 0)
    return { ok: false, error: blockedError(target.blockers), preview, blockers: target.blockers }
  const missing = unconfirmed(target.confirm, input.confirmedChecks)
  if (missing) return { ok: false, error: missing, preview, blockers: [] }
  const recordType = e.record_type
  if (recordType !== 'estimate' && recordType !== 'request') throw new Error(`no erasure for ${recordType}`)
  const expected = Object.fromEntries(target.removes.map((r) => [r.kind, r.count]))
  const confirmed = UNRECORDED_DELETION_CHECKS.filter((c) => target.confirm.includes(c))
  const deletion = await recordDeletion(tx, {
    recordType,
    recordId: e.record_id,
    recordRef: target.record.reference || e.record_ref,
    projectId: target.record.projectId,
    source: 'retention_review',
    reviewId: e.id,
    reason: input.reason,
    early: preview.early,
    permanent: target.permanent,
    checksConfirmed: confirmed,
    removed: expected,
    decidedBy: input.staffUserId,
    requestId: input.requestId,
  })
  // TSK-0137: a request that never became a job is erased with a reference-and-dates remainder (request-erasure.ts).
  const erased =
    recordType === 'estimate'
      ? { ...(await eraseEstimate(tx, { estimateId: e.record_id, deletionId: deletion.id })), estimateIds: [] }
      : await eraseRequest(tx, { requestId: e.record_id, deletionId: deletion.id, now })
  for (const [kind, count] of Object.entries(expected))
    if ((erased.removed[kind] ?? 0) !== count)
      // Something changed between the count under the lock and the erasure: nothing is kept (the whole write rolls back).
      throw new ApiError('CONFLICT', { fieldErrors: [{ field: 'record', code: 'RECORD_CHANGED', message: '' }] })
  await tx
    .insertInto('privacy.retention_decisions')
    .values({
      review_id: e.id,
      decision: 'delete',
      reason: input.reason.trim(),
      checks_confirmed: confirmed,
      deletion_id: deletion.id,
      decided_by: input.staffUserId,
      request_id: input.requestId,
    })
    .execute()
  // The review entries of the estimates erased with a request are decided by the same deletion.
  await decideErasedEstimates(tx, {
    estimateIds: erased.estimateIds,
    deletionId: deletion.id,
    reason: input.reason,
    staffUserId: input.staffUserId,
    requestId: input.requestId,
  })
  await scheduleObjectErasure(tx, { deletionId: deletion.id, keys: erased.objectKeys, requestId: input.requestId })
  return { ok: true, deletionId: deletion.id, preview, removed: erased.removed }
}

/** Archive an entry (the record is kept as it is); refused once its record was deleted. */
export async function archiveEntry(
  tx: Tx,
  input: { reviewId: string; staffUserId: string; reason: string; requestId: string },
): Promise<{ status: EntryStatus; blockers: Blocker[] }> {
  await lockEntry(tx, input.reviewId)
  const e = await entryOf(tx, input.reviewId)
  if (!e) throw new ApiError('NOT_FOUND')
  const now = new Date()
  const status = (await entryStatuses(tx, [e.id], now)).get(e.id) ?? PENDING
  if (status.state === 'deleted') throw blockedError(['already_deleted'])
  const target = await targetOf(tx, { type: e.record_type, id: e.record_id, projectId: e.project_id }, { now })
  await tx
    .insertInto('privacy.retention_decisions')
    .values({
      review_id: e.id,
      decision: 'archive',
      reason: input.reason.trim(),
      blockers: [...target.blockers],
      decided_by: input.staffUserId,
      request_id: input.requestId,
    })
    .execute()
  return { status: (await entryStatuses(tx, [e.id], now)).get(e.id) ?? PENDING, blockers: target.blockers }
}

/** PROPOSED bound: a keep-longer date at most 50 years ahead (the schedule's periods are 2 to 10 years). */
export const KEEP_LONGER_MAX_YEARS = 50

/** Keep the record longer: the entry comes back to the queue at `until`. */
export async function keepEntry(
  tx: Tx,
  input: { reviewId: string; staffUserId: string; reason: string; until: Date; requestId: string },
): Promise<EntryStatus> {
  await lockEntry(tx, input.reviewId)
  const e = await entryOf(tx, input.reviewId)
  if (!e) throw new ApiError('NOT_FOUND')
  const now = new Date()
  const status = (await entryStatuses(tx, [e.id], now)).get(e.id) ?? PENDING
  if (status.state === 'deleted') throw blockedError(['already_deleted'])
  const max = new Date(now.getTime() + KEEP_LONGER_MAX_YEARS * 365.25 * 24 * 3600 * 1000)
  if (
    Number.isNaN(input.until.getTime()) ||
    input.until.getTime() <= now.getTime() ||
    input.until.getTime() > max.getTime()
  )
    throw new ApiError('VALIDATION_FAILED', {
      fieldErrors: [{ field: 'body.keepUntil', code: 'KEEP_UNTIL_INVALID', message: '' }],
    })
  await tx
    .insertInto('privacy.retention_decisions')
    .values({
      review_id: e.id,
      decision: 'extend',
      reason: input.reason.trim(),
      keep_until: input.until,
      decided_by: input.staffUserId,
      request_id: input.requestId,
    })
    .execute()
  return (await entryStatuses(tx, [e.id], now)).get(e.id) ?? PENDING
}
