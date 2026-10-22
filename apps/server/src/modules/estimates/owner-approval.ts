// Owner approval before publishing an estimate over the threshold (TSK-0130; HH-EST-16, HH-EST-04, OWN-DEC-173,
// FACT-OWNER-APPROVAL-THRESHOLD, FACT-MARGIN-TARGET, OQ-READINGS-2026-10-21 item 5 and the Round 13 corrections,
// RULE-SERVER-AUTHZ, RULE-MONEY-CENTS). The estimate side of the shared approval service (modules/approvals).
// - The facts of a version come from its stored, server-computed amounts only: the total after the decided discount
//   (the proposed total), the base offer plus every option after the same discount (the highest total the customer
//   could approve), the discount row, the known internal costs of the base lines, and the project's other estimates
//   (linkedProjectDocuments). The policy is @handyhub/domain evaluateEstimatePublication under owner_approval.threshold.
// - The content digest is the SHA-256 of the version's customer price and scope: lines (kind, work package,
//   description, quantity, unit, source, unit price, amount, by position), texts, discount, totals, deposit, payment
//   term, authoring method and the agreed customer PDF of an uploaded version. Internal costs and notes are not part of
//   it. Any save that changes it invalidates an open approval (refreshEstimateApprovals runs in the same transaction as
//   every draft save and document change), and publishing compares it again.
// - Publishing (lifecycle.ts publishVersion) runs estimatePublicationGate under the estimate and version locks and the
//   project's publication lock: an Estimator is refused without the Owner's approval of this exact content; the
//   Owner's own authenticated publication counts as the approval, writing the approval record and its audit event in
//   the same transaction (final owner amendments 2026-10-22 to OWN-DEC-173).
// - Adjustments by substance: the only adjustment an estimate can carry today is the decided discount rule's row
//   (its category is the reason), which needs nothing more; the policy's other kinds arrive with change orders.
import { createHash } from 'node:crypto'
import type { Db, Tx } from '@handyhub/db'
import { evaluateEstimatePublication, type CostFacts, type PublicationEvaluation } from '@handyhub/domain'
import { basisPoints, cents, estimateTotals } from '@handyhub/money'
import { decide, type StaffActor } from '@handyhub/policy'
import { ApiError, type FieldError } from '../../api/errors.js'
import { type Config } from '../../platform/config/index.js'
import {
  approvalsOf,
  approvalThreshold,
  creditPolicy,
  invalidateApprovals,
  linkedProjectDocuments,
  lockProjectPublications,
  mayApprove,
  publicationGate,
  requestApproval,
  type ApprovalSubject,
  type GateResult,
} from '../approvals/service.js'

type Reader = Db | Tx

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const field = (f: string, code: string): FieldError => ({ field: f, code, message: '' })
const num = (v: string | number | null) => (v === null ? null : Number(v))
const EDITABLE = ['draft', 'in_review']

async function versionFacts(db: Reader, versionId: string) {
  if (!UUID.test(versionId)) return null
  const v = await db
    .selectFrom('estimating.estimate_versions as v')
    .innerJoin('estimating.estimates as e', 'e.id', 'v.estimate_id')
    .innerJoin('crm.projects as p', 'p.id', 'v.project_id')
    .leftJoin('estimating.estimate_documents as d', (j) =>
      j.onRef('d.id', '=', 'v.agreement_document_id').onRef('d.version_id', '=', 'v.id'),
    )
    .select([
      'v.id',
      'v.estimate_id',
      'v.project_id',
      'v.version',
      'v.state',
      'v.row_version',
      'v.prepared_by',
      'v.authoring_method',
      'v.assumptions',
      'v.exclusions',
      'v.customer_responsibilities',
      'v.dependencies',
      'v.schedule_assumptions',
      'v.discount_category',
      'v.discount_percent_bps',
      'v.subtotal_cents',
      'v.discount_cents',
      'v.total_cents',
      'v.deposit_state',
      'v.deposit_cents',
      'v.payment_term',
      'd.sha256 as document_sha256',
      'e.number',
      'p.reference as project_reference',
      'p.state as project_state',
    ])
    .where('v.id', '=', versionId)
    .executeTakeFirst()
  if (!v) return null
  const lines = await db
    .selectFrom('estimating.estimate_lines as l')
    .leftJoin('estimating.estimate_line_costs as c', 'c.line_id', 'l.id')
    .select([
      'l.position',
      'l.kind',
      'l.work_package_id',
      'l.description',
      'l.quantity_milli',
      'l.unit',
      'l.quantity_source',
      'l.unit_price_cents',
      'l.amount_cents',
      'c.labor_cost_cents',
      'c.material_cost_cents',
    ])
    .where('l.version_id', '=', versionId)
    .orderBy('l.position')
    .execute()
  return { v, lines }
}
type Facts = NonNullable<Awaited<ReturnType<typeof versionFacts>>>

function digestOf({ v, lines }: Facts): string {
  // Built in a fixed key order, so the same content always gives the same digest.
  const content = {
    authoringMethod: v.authoring_method,
    lines: lines.map((l) => [
      l.position,
      l.kind,
      l.work_package_id,
      l.description,
      num(l.quantity_milli),
      l.unit,
      l.quantity_source,
      num(l.unit_price_cents),
      num(l.amount_cents),
    ]),
    texts: [v.assumptions, v.exclusions, v.customer_responsibilities, v.dependencies, v.schedule_assumptions],
    discount: [v.discount_category, v.discount_percent_bps, num(v.discount_cents)],
    totals: [num(v.subtotal_cents), num(v.total_cents), v.deposit_state, num(v.deposit_cents)],
    paymentTerm: v.payment_term,
    document: v.document_sha256 ?? null,
  }
  return createHash('sha256').update(JSON.stringify(content)).digest('hex')
}

/** The digest of a version's customer price and scope; null when the version does not exist. */
export async function estimateApprovalDigest(db: Reader, versionId: string): Promise<string | null> {
  const f = await versionFacts(db, versionId)
  return f ? digestOf(f) : null
}

/** The known costs of the base lines; a category with no value entered on any line stays unknown (null). */
function costsOf(lines: Facts['lines']): ApprovalSubject['costs'] {
  const base = lines.filter((l) => l.kind === 'base')
  const labor = base.filter((l) => l.labor_cost_cents !== null)
  const material = base.filter((l) => l.material_cost_cents !== null)
  if (labor.length === 0 && material.length === 0) return null
  return {
    laborCents: labor.length ? labor.reduce((s, l) => s + Number(l.labor_cost_cents), 0) : null,
    materialCents: material.length ? material.reduce((s, l) => s + Number(l.material_cost_cents), 0) : null,
    complete: labor.length === base.length && material.length === base.length,
  }
}

/** The domain's cost facts: unknown categories count as nothing known (never as a final margin). */
const costFacts = (c: ApprovalSubject['costs']): CostFacts =>
  c === null ? null : { laborCents: c.laborCents ?? 0, materialCents: c.materialCents ?? 0, complete: c.complete }

function highestTotal({ v, lines }: Facts): number | null {
  const amounts = lines.map((l) => num(l.amount_cents))
  if (amounts.some((a) => a === null)) return null
  const t = estimateTotals({
    lines: amounts.map((a) => cents(a as number)),
    discountPercent: v.discount_percent_bps === null ? null : basisPoints(v.discount_percent_bps),
    depositRule: null,
  })
  return t.ok ? t.totals.total : null
}

/**
 * The subject and the policy's evaluation of one version; null when the version does not exist, and evaluation null
 * while its totals are incomplete (a draft still being written).
 */
export async function evaluateEstimateVersion(db: Reader, versionId: string, config: Config) {
  const f = await versionFacts(db, versionId)
  if (!f) return null
  const { v, lines } = f
  const total = num(v.total_cents)
  if (total === null) return { facts: f, subject: null, evaluation: null }
  const highest = highestTotal(f) ?? total
  const costs = costsOf(lines)
  const discount = num(v.discount_cents) ?? 0
  const linked = await linkedProjectDocuments(db, v.project_id, { estimateId: v.estimate_id })
  const evaluation: PublicationEvaluation = evaluateEstimatePublication(
    approvalThreshold(config),
    {
      proposedTotalCents: total,
      highestTotalCents: highest,
      adjustments:
        v.discount_category !== null && discount > 0
          ? [{ kind: 'rule_discount', amountCents: discount, reason: v.discount_category }]
          : [],
      costs: costFacts(costs),
      linked,
    },
    creditPolicy(config),
  )
  const subject: ApprovalSubject = {
    type: 'estimate_version',
    id: v.id,
    projectId: v.project_id,
    projectReference: v.project_reference,
    reference: v.number,
    documentVersion: v.version,
    digest: digestOf(f),
    proposedTotalCents: total,
    highestTotalCents: highest,
    subtotalCents: num(v.subtotal_cents),
    discountCents: discount,
    discountCategory: v.discount_category,
    adjustmentCents: null,
    revisedProjectValueCents: null,
    costs,
    preparedBy: v.prepared_by,
  }
  return { facts: f, subject, evaluation }
}

/**
 * The gate publishVersion runs (inside its transaction, under the estimate and version locks, after the readiness
 * check passed): takes the project's publication lock, evaluates the version and passes it through the shared gate.
 */
export async function estimatePublicationGate(
  tx: Tx,
  actor: StaffActor,
  versionId: string,
  projectId: string,
  config: Config,
): Promise<GateResult> {
  await lockProjectPublications(tx, projectId)
  const e = await evaluateEstimateVersion(tx, versionId, config)
  if (!e?.subject || !e.evaluation) throw new Error('the publication gate runs only on a version with its totals')
  return publicationGate(tx, actor, e.subject, e.evaluation)
}

/**
 * After a save of a version being prepared: an open approval whose content no longer matches is invalidated, so the
 * Owner reapproves the changed price or scope (HH-EST-16). Runs in the saving transaction.
 */
export async function refreshEstimateApprovals(tx: Tx, actor: StaffActor | null, versionId: string): Promise<void> {
  const open = await tx
    .selectFrom('estimating.publication_approvals')
    .select('id')
    .where('subject_type', '=', 'estimate_version')
    .where('subject_id', '=', versionId)
    .where('state', 'in', ['pending', 'approved'])
    .where('used_at', 'is', null)
    .limit(1)
    .executeTakeFirst()
  if (!open) return
  const digest = await estimateApprovalDigest(tx, versionId)
  await invalidateApprovals(tx, actor, { type: 'estimate_version', id: versionId, digest }, 'content_changed')
}

const publishingAllowed = (actor: StaffActor, projectId: string, roles: readonly string[]) =>
  decide(actor, 'estimate.publish', { projectId }, { now: new Date(), online: true, publishingRoles: roles as never })
    .effect === 'allow'

/**
 * Asks the Owner to approve a version for publishing: the version is being prepared, on an open project, the one the
 * caller saw, complete (its totals computed) and over the threshold or flagged. The caller may publish estimates.
 */
export async function requestEstimateApproval(
  tx: Tx,
  actor: StaffActor,
  versionId: string,
  input: { expectedRowVersion: number; publishingRoles: readonly string[]; config: Config },
): Promise<{ approvalId: string; created: boolean; rowVersion: number; summary: Record<string, unknown> }> {
  if (!UUID.test(versionId)) throw new ApiError('NOT_FOUND')
  const head = await tx
    .selectFrom('estimating.estimate_versions')
    .select(['estimate_id', 'project_id'])
    .where('id', '=', versionId)
    .executeTakeFirst()
  if (!head) throw new ApiError('NOT_FOUND')
  if (!publishingAllowed(actor, head.project_id, input.publishingRoles)) throw new ApiError('FORBIDDEN')
  // The lifecycle's lock order: the estimate, then the version, then the project's publication lock.
  await tx.selectFrom('estimating.estimates').select('id').where('id', '=', head.estimate_id).forUpdate().execute()
  const row = await tx
    .selectFrom('estimating.estimate_versions')
    .select(['state', 'row_version'])
    .where('id', '=', versionId)
    .forUpdate()
    .executeTakeFirstOrThrow()
  if (input.expectedRowVersion !== row.row_version)
    throw new ApiError('STALE_VERSION', { current: { version: row.row_version } })
  if (!EDITABLE.includes(row.state))
    throw new ApiError('CONFLICT', { fieldErrors: [field('state', 'VERSION_NOT_EDITABLE')] })
  await lockProjectPublications(tx, head.project_id)
  const e = await evaluateEstimateVersion(tx, versionId, input.config)
  if (!e) throw new ApiError('NOT_FOUND')
  if (e.facts.v.project_state !== 'open')
    throw new ApiError('CONFLICT', { fieldErrors: [field('project', 'PROJECT_NOT_OPEN')] })
  if (!e.subject || !e.evaluation)
    throw new ApiError('CONFLICT', { fieldErrors: [field('totals', 'TOTALS_INCOMPLETE')] })
  const out = await requestApproval(tx, actor, e.subject, e.evaluation)
  return { ...out, rowVersion: row.row_version }
}

/** What the builder shows about the Owner's approval of this version, and what the caller may do about it. */
export async function ownerApprovalView(
  db: Reader,
  actor: StaffActor,
  versionId: string,
  config: Config,
  publishingRoles: readonly string[],
) {
  const e = await evaluateEstimateVersion(db, versionId, config)
  if (!e) return null
  const { v } = e.facts
  const records = await approvalsOf(db, actor, { type: 'estimate_version', id: v.id })
  const editable = EDITABLE.includes(v.state) && v.project_state === 'open'
  const digest = e.subject?.digest ?? null
  const current = records.filter((r) => r.state !== 'invalidated')
  // The digest of each open record, to tell an approval of this exact content from an outdated one.
  const digests = new Map(
    (
      await db
        .selectFrom('estimating.publication_approvals')
        .select(['id', 'content_digest'])
        .where('subject_type', '=', 'estimate_version')
        .where('subject_id', '=', v.id)
        .execute()
    ).map((r) => [r.id, r.content_digest]),
  )
  const matching = (state: string) =>
    current.find((r) => r.state === state && digest !== null && recordDigestMatches(r.id, digests, digest))
  const used = records.find((r) => r.usedAt !== null)
  const ev = editable ? e.evaluation : null
  const status: 'closed' | 'incomplete' | 'not_required' | 'required' | 'pending' | 'approved' | 'rejected' = !editable
    ? 'closed'
    : !ev
      ? 'incomplete'
      : !ev.required
        ? 'not_required'
        : matching('approved')
          ? 'approved'
          : matching('pending')
            ? 'pending'
            : matching('rejected')
              ? 'rejected'
              : 'required'
  const owner = mayApprove(actor, v.project_id)
  const pending = matching('pending')
  return {
    status,
    evaluation: ev
      ? {
          required: ev.required,
          reasons: [...ev.reasons],
          flags: [...ev.flags],
          thresholdCents: ev.thresholdCents,
          thresholdVersion: ev.thresholdVersion,
          proposedTotalCents: e.subject?.proposedTotalCents ?? 0,
          highestTotalCents: e.subject?.highestTotalCents ?? null,
          combinedProjectCents: ev.combinedProjectCents,
          linked: ev.linked.map((d) => ({
            reference: d.reference,
            version: d.version,
            state: d.state,
            valueCents: d.valueCents,
          })),
        }
      : null,
    usedApprovalId: used?.id ?? null,
    pendingApprovalId: pending?.id ?? null,
    records,
    actions: {
      request:
        (status === 'required' || status === 'rejected') &&
        !owner &&
        publishingAllowed(actor, v.project_id, publishingRoles),
      decide: owner && pending !== undefined,
      // The Owner's authenticated publication approves it (final owner amendments 2026-10-22).
      publishApproves: owner && (status === 'required' || status === 'pending' || status === 'rejected'),
    },
  }
}

function recordDigestMatches(id: string, digests: Map<string, string>, digest: string): boolean {
  return digests.get(id) === digest
}
