// The shared Owner publication-approval service (TSK-0130; HH-EST-16, OWN-DEC-173, FACT-OWNER-APPROVAL-THRESHOLD,
// RULE-SERVER-AUTHZ, RULE-MONEY-CENTS). Estimate publishing uses it now (modules/estimates/owner-approval.ts); change
// order publishing (TSK-0082) calls changeOrderPublicationGate with its own facts and digest. Nothing here knows how a
// document is priced: the caller passes the evaluation (@handyhub/domain evaluateEstimatePublication or
// evaluateChangeOrderPublication), the content digest of the exact version and what the Owner is to be shown.
// - requestApproval: records a pending approval of one exact version and opens its Owner Decisions item; asking again
//   for the same content returns the open record.
// - decideApproval: the Owner (estimate.approve_publication) approves or rejects a pending approval with a written
//   comment (the auditable reason of every approval, OWN-DEC-204), with the record version the
//   Owner saw. Resolves the item.
// - publicationGate: run inside the publishing transaction, under the project's publication lock. Not required: an
//   open request is closed as no longer required. Required: an approved record of the same content is used; the
//   Owner's own publication approves it only from a session that completed the second factor (OWN-DEC-204,
//   OWN-DEC-202), writing the approval record and its audit event in the same transaction; anyone else is refused
//   naming the state
//   (required, pending or rejected). The database refuses the same publication without a used
//   approval (migration 0068).
// - invalidateApprovals: any change of price or scope after the approval (a different digest) invalidates every open
//   record of the version and resolves its item, audited.
import type { Db, Tx } from '@handyhub/db'
import type {
  ApprovalThreshold,
  CreditPolicy,
  LinkedDocument,
  PublicationApprovalReason,
  PublicationEvaluation,
  PublicationInvalidationReason,
  PublicationSubject,
} from '@handyhub/domain'
import { decide, type StaffActor } from '@handyhub/policy'
import { sql } from 'kysely'
import { ApiError, type FieldError } from '../../api/errors.js'
import { audit, type AuditActor } from '../../platform/audit.js'
import type { Config } from '../../platform/config/index.js'
import { openQueueItem, resolveQueueItem } from '../queue/index.js'

type Reader = Db | Tx

/** The Owner Decisions item of each subject type; TSK-0082 adds the change-order one with its registry type. */
export const APPROVAL_QUEUE_ITEM: Partial<Record<PublicationSubject, string>> = {
  estimate_version: 'estimate_publication_approval',
}

/** PROPOSED limit of the Owner's comment (no owner value). */
export const APPROVAL_LIMITS = { comment: 2000 } as const

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const field = (f: string, code: string): FieldError => ({ field: f, code, message: '' })
const staff = (actor: StaffActor): AuditActor => ({ kind: 'staff', id: actor.userId, roles: actor.roles })

/** The configured threshold, or null while NOT CONFIGURED (every publication then needs the Owner). */
export function approvalThreshold(config: Config): ApprovalThreshold {
  const entry = config.get('owner_approval.threshold')
  return entry.state === 'CONFIGURED' ? { thresholdCents: entry.value.thresholdCents, version: entry.version } : null
}

/** The configured materiality of discretionary credits, or null while NOT CONFIGURED (every credit then). */
export function creditPolicy(config: Config): CreditPolicy {
  const entry = config.get('owner_approval.discretionary_credit')
  return entry.state === 'CONFIGURED' ? { materialFromCents: entry.value.materialFromCents } : null
}

/** Whether this staff member may approve publications (the Owner). */
export function mayApprove(actor: StaffActor, projectId: string): boolean {
  return (
    decide(actor, 'estimate.approve_publication', { projectId }, { now: new Date(), online: true }).effect === 'allow'
  )
}

/**
 * Serializes every publication and approval request of one project, so two documents published at the same moment
 * each see the other in the splitting check.
 */
export async function lockProjectPublications(tx: Tx, projectId: string): Promise<void> {
  await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`publication_approval:${projectId}`}, 0))`.execute(tx)
}

/**
 * The project's other documents as the splitting check counts them, across the project's whole history: each other
 * estimate by its latest version that reached the customer (the accepted total once accepted), unless that version
 * was withdrawn or declined (PROPOSED). Change orders join with TSK-0082.
 */
export async function linkedProjectDocuments(
  db: Reader,
  projectId: string,
  exclude: { estimateId?: string } = {},
): Promise<LinkedDocument[]> {
  const rows = await db
    .selectFrom('estimating.estimate_versions as v')
    .innerJoin('estimating.estimates as e', 'e.id', 'v.estimate_id')
    .leftJoin('estimating.approvals as a', 'a.version_id', 'v.id')
    .select([
      'v.id',
      'v.estimate_id',
      'e.number',
      'e.sequence',
      'v.version',
      'v.state',
      'v.total_cents',
      'a.total_cents as accepted_cents',
    ])
    .distinctOn('v.estimate_id')
    .where('v.project_id', '=', projectId)
    .where('v.published_at', 'is not', null)
    .$if(exclude.estimateId !== undefined, (q) => q.where('v.estimate_id', '<>', exclude.estimateId as string))
    .orderBy('v.estimate_id')
    .orderBy('v.version', 'desc')
    .execute()
  return rows
    .filter((r) => r.state !== 'withdrawn' && r.state !== 'declined' && r.total_cents !== null)
    .sort((a, b) => a.sequence - b.sequence)
    .map((r) => ({
      kind: 'estimate' as const,
      id: r.id,
      reference: r.number,
      version: r.version,
      state: r.state,
      valueCents: Number(r.accepted_cents ?? r.total_cents),
    }))
}

/** One exact document version and what the Owner is shown for it. */
export type ApprovalSubject = {
  readonly type: PublicationSubject
  readonly id: string
  readonly projectId: string
  /** The project reference: the queue item's reference. */
  readonly projectReference: string
  /** The document's staff reference (estimate number or change-order reference) and version number. */
  readonly reference: string
  readonly documentVersion: number
  /** SHA-256 of the version's customer price and scope. */
  readonly digest: string
  readonly proposedTotalCents: number
  readonly highestTotalCents: number | null
  readonly subtotalCents: number | null
  readonly discountCents: number | null
  readonly discountCategory: string | null
  readonly adjustmentCents: number | null
  readonly revisedProjectValueCents: number | null
  /** Known costs of the offer; a category with nothing entered is null (never invented). */
  readonly costs: {
    readonly laborCents: number | null
    readonly materialCents: number | null
    readonly complete: boolean
  } | null
  /** Who prepared the document (shown to the Owner; the costs follow estimate.view_internal_cost of that preparer). */
  readonly preparedBy: string
}

type ApprovalRow = {
  id: string
  state: string
  basis: string
  content_digest: string
  row_version: number
  used_at: Date | null
}

async function openRecords(tx: Reader, subject: { type: PublicationSubject; id: string }, lock = false) {
  let q = tx
    .selectFrom('estimating.publication_approvals')
    .select(['id', 'state', 'basis', 'content_digest', 'row_version', 'used_at'])
    .where('subject_type', '=', subject.type)
    .where('subject_id', '=', subject.id)
    .where((eb) =>
      eb.or([eb('state', '=', 'pending'), eb.and([eb('state', '=', 'approved'), eb('used_at', 'is', null)])]),
    )
  if (lock) q = q.forUpdate()
  return (await q.execute()) as ApprovalRow[]
}

const queueItemOf = (type: PublicationSubject): string => {
  const item = APPROVAL_QUEUE_ITEM[type]
  if (!item) throw new Error(`no Owner Decisions item is registered for ${type} approvals yet`)
  return item
}

function values(subject: ApprovalSubject, evaluation: PublicationEvaluation) {
  return {
    subject_type: subject.type,
    subject_id: subject.id,
    estimate_version_id: subject.type === 'estimate_version' ? subject.id : null,
    project_id: subject.projectId,
    reference: subject.reference,
    document_version: subject.documentVersion,
    content_digest: subject.digest,
    reasons: [...evaluation.reasons],
    flags: [...evaluation.flags],
    proposed_total_cents: subject.proposedTotalCents,
    highest_total_cents: subject.highestTotalCents,
    subtotal_cents: subject.subtotalCents,
    discount_cents: subject.discountCents,
    discount_category: subject.discountCategory,
    adjustment_cents: subject.adjustmentCents,
    revised_project_value_cents: subject.revisedProjectValueCents,
    combined_project_cents: evaluation.combinedProjectCents,
    threshold_cents: evaluation.thresholdCents,
    threshold_version: evaluation.thresholdVersion,
    labor_cost_cents: subject.costs?.laborCents ?? null,
    material_cost_cents: subject.costs?.materialCents ?? null,
    costs_complete: subject.costs?.complete ?? null,
    linked: JSON.stringify(evaluation.linked),
  }
}

const summaryOf = (subject: ApprovalSubject, evaluation: PublicationEvaluation) => ({
  subjectType: subject.type,
  reference: subject.reference,
  version: subject.documentVersion,
  reasons: [...evaluation.reasons],
  proposedTotalCents: subject.proposedTotalCents,
  thresholdCents: evaluation.thresholdCents,
  thresholdVersion: evaluation.thresholdVersion,
  combinedProjectCents: evaluation.combinedProjectCents,
})

/**
 * Records a pending approval of the exact version and opens its Owner Decisions item. The caller authorized the
 * request (the document's publish permission) and checked the version can be published but for this approval.
 */
export async function requestApproval(
  tx: Tx,
  actor: StaffActor,
  subject: ApprovalSubject,
  evaluation: PublicationEvaluation,
): Promise<{ approvalId: string; created: boolean; summary: ReturnType<typeof summaryOf> }> {
  if (!evaluation.required)
    throw new ApiError('CONFLICT', { fieldErrors: [field('ownerApproval', 'OWNER_APPROVAL_NOT_REQUIRED')] })
  const open = await openRecords(tx, subject, true)
  const same = open.find((r) => r.content_digest === subject.digest)
  if (same) return { approvalId: same.id, created: false, summary: summaryOf(subject, evaluation) }
  // An open record of other content is out of date; invalidateApprovals normally closed it already.
  await invalidateApprovals(tx, actor, subject, 'content_changed')
  const row = await tx
    .insertInto('estimating.publication_approvals')
    .values({ ...values(subject, evaluation), state: 'pending', basis: 'request', requested_by: actor.userId })
    .returning(['id', 'requested_at'])
    .executeTakeFirstOrThrow()
  await openQueueItem(tx, {
    type: queueItemOf(subject.type),
    subjectId: subject.id,
    reason: evaluation.reasons[0] as PublicationApprovalReason,
    projectId: subject.projectId,
    reference: subject.projectReference,
    status: 'pending',
    assignedStaffId: null,
    openedAt: row.requested_at,
  })
  return { approvalId: row.id, created: true, summary: summaryOf(subject, evaluation) }
}

/**
 * Invalidates every open (pending, or approved and not yet used) record of the subject whose content differs from
 * `digest` (all of them when `digest` is omitted, or for 'not_required'), resolving its item. Audited per record.
 */
export async function invalidateApprovals(
  tx: Tx,
  actor: StaffActor | null,
  subject: { type: PublicationSubject; id: string; digest?: string | null },
  reason: PublicationInvalidationReason,
): Promise<string[]> {
  const open = await openRecords(tx, subject, true)
  const stale = open.filter((r) => reason === 'not_required' || !subject.digest || r.content_digest !== subject.digest)
  for (const r of stale) {
    await tx
      .updateTable('estimating.publication_approvals')
      .set({
        state: 'invalidated',
        invalidated_at: sql<Date>`now()`,
        invalidated_reason: reason,
        row_version: r.row_version + 1,
      })
      .where('id', '=', r.id)
      .execute()
    await audit.record(tx, {
      actor: actor ? staff(actor) : { kind: 'system', process: 'publication_approval' },
      action: 'publication_approval.invalidate',
      target: { type: 'publication_approval', id: r.id, version: r.row_version + 1 },
      summary: { subjectType: subject.type, subjectId: subject.id, from: r.state, reason },
    })
  }
  if (stale.length > 0 && APPROVAL_QUEUE_ITEM[subject.type])
    await resolveQueueItem(tx, { type: queueItemOf(subject.type), subjectId: subject.id, resolution: reason })
  return stale.map((r) => r.id)
}

/** How the publisher's session was authenticated: the Owner's own publication counts only after the second factor. */
export type PublisherAuthentication = { readonly secondFactor: boolean }

export type GateResult =
  | { readonly required: false; readonly evaluation: PublicationEvaluation }
  | {
      readonly required: true
      readonly evaluation: PublicationEvaluation
      readonly approvalId: string
      readonly basis: 'request' | 'owner_publication'
      readonly approvedBy: string
    }

/**
 * The gate every publication passes, inside its transaction under the document's lock and the project's publication
 * lock (lockProjectPublications). Marks the approval it uses, so the database lets the publication through.
 */
export async function publicationGate(
  tx: Tx,
  actor: StaffActor,
  subject: ApprovalSubject,
  evaluation: PublicationEvaluation,
  authentication: PublisherAuthentication = { secondFactor: false },
): Promise<GateResult> {
  const open = await openRecords(tx, subject, true)
  if (!evaluation.required) {
    if (open.length > 0) await invalidateApprovals(tx, actor, subject, 'not_required')
    return { required: false, evaluation }
  }
  // Content changed after the approval: never counts (the eager invalidation normally closed it already).
  await invalidateApprovals(tx, actor, subject, 'content_changed')
  const approved = open.find((r) => r.state === 'approved' && r.content_digest === subject.digest)
  const pending = open.find((r) => r.state === 'pending' && r.content_digest === subject.digest)
  const item = queueItemOf(subject.type)
  if (approved) {
    await tx
      .updateTable('estimating.publication_approvals')
      .set({ used_at: sql<Date>`now()`, row_version: approved.row_version + 1 })
      .where('id', '=', approved.id)
      .execute()
    const by = await tx
      .selectFrom('estimating.publication_approvals')
      .select('decided_by')
      .where('id', '=', approved.id)
      .executeTakeFirstOrThrow()
    return {
      required: true,
      evaluation,
      approvalId: approved.id,
      basis: 'request',
      approvedBy: by.decided_by as string,
    }
  }
  if (!mayApprove(actor, subject.projectId)) {
    const rejected = await tx
      .selectFrom('estimating.publication_approvals')
      .select('id')
      .where('subject_type', '=', subject.type)
      .where('subject_id', '=', subject.id)
      .where('state', '=', 'rejected')
      .where('content_digest', '=', subject.digest)
      .executeTakeFirst()
    throw new ApiError('CONFLICT', {
      fieldErrors: [
        field(
          'ownerApproval',
          pending ? 'OWNER_APPROVAL_PENDING' : rejected ? 'OWNER_APPROVAL_REJECTED' : 'OWNER_APPROVAL_REQUIRED',
        ),
        ...evaluation.reasons.map((r) => field('ownerApproval.reasons', r)),
      ],
    })
  }
  // The Owner's authenticated publication approves it (OWN-DEC-204): only from a session that completed the second
  // factor (OWN-DEC-202); the approval record and its audit event are written here, in the publishing transaction; a
  // waiting request is decided by that act.
  if (actor.status !== 'active') throw new ApiError('UNAUTHENTICATED')
  if (!authentication.secondFactor)
    throw new ApiError('FORBIDDEN', { fieldErrors: [field('ownerApproval', 'OWNER_MFA_REQUIRED')] })
  let approvalId: string
  if (pending) {
    await tx
      .updateTable('estimating.publication_approvals')
      .set({
        state: 'approved',
        decided_by: actor.userId,
        decided_at: sql<Date>`now()`,
        used_at: sql<Date>`now()`,
        row_version: pending.row_version + 1,
      })
      .where('id', '=', pending.id)
      .execute()
    approvalId = pending.id
  } else {
    const row = await tx
      .insertInto('estimating.publication_approvals')
      .values({
        ...values(subject, evaluation),
        state: 'approved',
        basis: 'owner_publication',
        requested_by: actor.userId,
        decided_by: actor.userId,
        decided_at: sql<Date>`now()`,
        used_at: sql<Date>`now()`,
      })
      .returning('id')
      .executeTakeFirstOrThrow()
    approvalId = row.id
  }
  await resolveQueueItem(tx, { type: item, subjectId: subject.id, resolution: 'approved' })
  await audit.record(tx, {
    actor: staff(actor),
    action: 'publication_approval.approve',
    target: { type: 'publication_approval', id: approvalId },
    summary: {
      ...summaryOf(subject, evaluation),
      basis: pending ? 'request' : 'owner_publication',
      byPublishing: true,
      secondFactor: true,
    },
  })
  return {
    required: true,
    evaluation,
    approvalId,
    basis: pending ? 'request' : 'owner_publication',
    approvedBy: actor.userId,
  }
}

/**
 * The hook change-order publishing calls (TSK-0082): the same gate, for a change order version, with the facts that
 * evaluateChangeOrderPublication evaluated. Registered here so the change-order task reuses one approval service.
 */
export function changeOrderPublicationGate(
  tx: Tx,
  actor: StaffActor,
  subject: ApprovalSubject & { readonly type: 'change_order_version' },
  evaluation: PublicationEvaluation,
  authentication: PublisherAuthentication,
): Promise<GateResult> {
  return publicationGate(tx, actor, subject, evaluation, authentication)
}

/** The Owner approves or rejects a pending approval (estimate.approve_publication). */
export async function decideApproval(
  tx: Tx,
  actor: StaffActor,
  approvalId: string,
  input: { decision: 'approve' | 'reject'; comment?: string | null; expectedRowVersion: number },
): Promise<{
  approvalId: string
  subjectType: PublicationSubject
  subjectId: string
  rowVersion: number
  state: 'approved' | 'rejected'
  comment: string | null
  reference: string
  documentVersion: number
}> {
  if (!UUID.test(approvalId)) throw new ApiError('NOT_FOUND')
  const row = await tx
    .selectFrom('estimating.publication_approvals')
    .select(['id', 'subject_type', 'subject_id', 'project_id', 'state', 'row_version', 'reference', 'document_version'])
    .where('id', '=', approvalId)
    .forUpdate()
    .executeTakeFirst()
  if (!row) throw new ApiError('NOT_FOUND')
  if (!mayApprove(actor, row.project_id)) throw new ApiError('FORBIDDEN')
  if (input.expectedRowVersion !== row.row_version)
    throw new ApiError('STALE_VERSION', { current: { version: row.row_version } })
  if (row.state !== 'pending') throw new ApiError('CONFLICT', { fieldErrors: [field('state', 'APPROVAL_NOT_PENDING')] })
  const comment = typeof input.comment === 'string' && input.comment.trim() !== '' ? input.comment.trim() : null
  if (comment !== null && comment.length > APPROVAL_LIMITS.comment)
    throw new ApiError('VALIDATION_FAILED', { fieldErrors: [field('comment', 'TOO_LONG')] })
  if (comment === null) throw new ApiError('VALIDATION_FAILED', { fieldErrors: [field('comment', 'COMMENT_REQUIRED')] })
  const state: 'approved' | 'rejected' = input.decision === 'approve' ? 'approved' : 'rejected'
  const rowVersion = row.row_version + 1
  await tx
    .updateTable('estimating.publication_approvals')
    .set({
      state,
      decided_by: actor.userId,
      decided_at: sql<Date>`now()`,
      decision_comment: comment,
      row_version: rowVersion,
    })
    .where('id', '=', row.id)
    .execute()
  const type = row.subject_type as PublicationSubject
  if (APPROVAL_QUEUE_ITEM[type])
    await resolveQueueItem(tx, { type: queueItemOf(type), subjectId: row.subject_id, resolution: state })
  return {
    approvalId: row.id,
    subjectType: type,
    subjectId: row.subject_id,
    rowVersion,
    state,
    comment,
    reference: row.reference,
    documentVersion: row.document_version,
  }
}

const num = (v: string | number | null) => (v === null ? null : Number(v))

/** The record columns every view reads. */
async function rows(
  db: Reader,
  where: { subject?: { type: PublicationSubject; id: string }; pending?: true; id?: string },
) {
  let q = db
    .selectFrom('estimating.publication_approvals as a')
    .leftJoin('estimating.estimate_versions as v', 'v.id', 'a.estimate_version_id')
    .leftJoin('crm.projects as p', 'p.id', 'a.project_id')
    .select([
      'a.id',
      'a.subject_type',
      'a.subject_id',
      'a.project_id',
      'p.reference as project_reference',
      'a.reference',
      'a.document_version',
      'a.state',
      'a.basis',
      'a.reasons',
      'a.flags',
      'a.proposed_total_cents',
      'a.highest_total_cents',
      'a.subtotal_cents',
      'a.discount_cents',
      'a.discount_category',
      'a.adjustment_cents',
      'a.revised_project_value_cents',
      'a.combined_project_cents',
      'a.threshold_cents',
      'a.threshold_version',
      'a.labor_cost_cents',
      'a.material_cost_cents',
      'a.costs_complete',
      sql<LinkedDocument[]>`a.linked`.as('linked'),
      'a.requested_by',
      'a.requested_at',
      'a.decided_by',
      'a.decided_at',
      'a.decision_comment',
      'a.invalidated_at',
      'a.invalidated_reason',
      'a.used_at',
      'a.row_version',
      'v.prepared_by',
    ])
  if (where.subject) q = q.where('a.subject_type', '=', where.subject.type).where('a.subject_id', '=', where.subject.id)
  if (where.pending) q = q.where('a.state', '=', 'pending')
  if (where.id) q = q.where('a.id', '=', where.id)
  return q.orderBy('a.requested_at', 'desc').orderBy('a.id').execute()
}
type Row = Awaited<ReturnType<typeof rows>>[number]

/** One approval as staff see it; the costs and margin only for a caller who may see internal costs. */
export type ApprovalView = ReturnType<typeof viewOf>

function viewOf(r: Row, names: Map<string, string | null>, showCosts: boolean) {
  const ref = (id: string | null) => (id === null ? null : { id, name: names.get(id) ?? null })
  const proposed = Number(r.proposed_total_cents)
  const labor = num(r.labor_cost_cents)
  const material = num(r.material_cost_cents)
  const hasCosts = labor !== null || material !== null
  const cost = (labor ?? 0) + (material ?? 0)
  const complete = hasCosts && r.costs_complete === true
  return {
    id: r.id,
    subjectType: r.subject_type,
    subjectId: r.subject_id,
    projectId: r.project_id,
    projectReference: r.project_reference ?? null,
    reference: r.reference,
    documentVersion: r.document_version,
    state: r.state,
    basis: r.basis,
    reasons: r.reasons,
    flags: r.flags,
    proposedTotalCents: proposed,
    highestTotalCents: num(r.highest_total_cents),
    subtotalCents: num(r.subtotal_cents),
    discount:
      r.discount_cents !== null && Number(r.discount_cents) > 0
        ? { category: r.discount_category, amountCents: Number(r.discount_cents) }
        : null,
    changeOrder:
      r.adjustment_cents === null
        ? null
        : { adjustmentCents: Number(r.adjustment_cents), revisedProjectValueCents: num(r.revised_project_value_cents) },
    combinedProjectCents: Number(r.combined_project_cents),
    thresholdCents: num(r.threshold_cents),
    thresholdVersion: r.threshold_version,
    linked: r.linked.map((d) => ({
      kind: d.kind,
      reference: d.reference,
      version: d.version,
      state: d.state,
      valueCents: d.valueCents,
    })),
    // Known costs only (FACT-MARGIN-TARGET): no gross profit or margin while incomplete; removed for other roles.
    costs:
      showCosts && hasCosts
        ? {
            laborCents: labor,
            materialCents: material,
            complete,
            grossProfitCents: complete ? proposed - cost : null,
            marginBps: complete && proposed > 0 ? marginBpsOf(proposed - cost, proposed) : null,
          }
        : null,
    requestedBy: ref(r.requested_by) as { id: string; name: string | null },
    requestedAt: r.requested_at.toISOString(),
    decidedBy: ref(r.decided_by),
    decidedAt: r.decided_at?.toISOString() ?? null,
    comment: r.decision_comment,
    invalidatedAt: r.invalidated_at?.toISOString() ?? null,
    invalidatedReason: r.invalidated_reason,
    usedAt: r.used_at?.toISOString() ?? null,
    rowVersion: r.row_version,
  }
}

function marginBpsOf(profit: number, price: number): number {
  const n = 2n * BigInt(profit) * 10_000n + BigInt(price)
  const d = 2n * BigInt(price)
  const q = n / d
  return Number(n % d !== 0n && n < 0n ? q - 1n : q)
}

async function namesOf(db: Reader, list: Row[]) {
  const ids = [...new Set(list.flatMap((r) => [r.requested_by, r.decided_by]).filter((x): x is string => !!x))]
  const people = ids.length
    ? await db.selectFrom('identity.staff_users').select(['id', 'display_name']).where('id', 'in', ids).execute()
    : []
  return new Map(people.map((p) => [p.id, p.display_name]))
}

const seesCosts = (actor: StaffActor, r: Row) =>
  decide(
    actor,
    'estimate.view_internal_cost',
    { projectId: r.project_id, ownerStaffId: r.prepared_by ?? r.requested_by },
    { now: new Date(), online: true },
  ).effect === 'allow'

/** Every approval record of one document version, newest first. */
export async function approvalsOf(db: Reader, actor: StaffActor, subject: { type: PublicationSubject; id: string }) {
  const list = await rows(db, { subject })
  const names = await namesOf(db, list)
  return list.map((r) => viewOf(r, names, seesCosts(actor, r)))
}

/** The pending approvals, oldest first (the Owner's approval queue). The caller authorized the read. */
export async function pendingApprovals(db: Reader, actor: StaffActor) {
  const list = (await rows(db, { pending: true })).reverse()
  const names = await namesOf(db, list)
  return list.map((r) => viewOf(r, names, seesCosts(actor, r)))
}

/** One approval record, or null. */
export async function approvalById(db: Reader, actor: StaffActor, approvalId: string) {
  if (!UUID.test(approvalId)) return null
  const [r] = await rows(db, { id: approvalId })
  if (!r) return null
  return viewOf(r, await namesOf(db, [r]), seesCosts(actor, r))
}
