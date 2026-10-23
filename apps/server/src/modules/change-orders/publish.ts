// Change-order publication (TSK-0082 part 1; HH-CHG-02, OWN-DEC-168, OWN-DEC-169, OWN-DEC-173, OWN-DEC-203,
// OWN-DEC-204, FACT-CHANGE-ORDER-VALIDITY, FACT-OWNER-APPROVAL-THRESHOLD, RULE-MONEY-CENTS, RULE-SERVER-AUTHZ). Every
// write runs in the route's transaction under the job's row lock; migration 0087 refuses anything else.
// - Issue: an Estimator or the Owner publishes a reviewed version to the customer, priced again against the job's
//   current approved scope and the money paid. Its customer content (reference, version, reason, scope, schedule
//   impact, lines, totals) is fixed by a digest: the exact version the customer approves (part 2). Valid for the
//   configured days (7, OWN-DEC-168) counted in the business time zone; the Owner may set a shorter period with a
//   written reason. Never extended. The automatic proposed-change notice (change_order.proposed) and the expiry job are
//   written in the same transaction.
// - The Owner's approval (OWN-DEC-173, OWN-DEC-204) through the shared service (modules/approvals): over the threshold
//   (the change itself or the revised project value: the current approved total plus this change), the project's
//   other open change orders counted with it (splitting), or any credit while no materiality is configured (every
//   credit line is a discretionary credit with the change order's reason, PROPOSED). The Owner's own publication from
//   a second-factor session is the approval; anyone else requests it first (Owner Decisions).
// - Revise: a later version of an issued, expired, withdrawn or rejected change order, as a draft with the same
//   content and lines, priced again against the current approved scope; an issued version is superseded by it in the
//   same transaction, so it can no longer be approved (OWN-DEC-168 items 5 to 7).
// - Expire: a job at the valid-until time records the end; a reader already sees an issued version past it as expired.
import { createHash } from 'node:crypto'
import type { Db, Tx } from '@handyhub/db'
import {
  CHANGE_ORDER_MACHINE,
  type ChangeOrderPublicationFacts,
  estimateValidUntil,
  evaluateChangeOrderPublication,
  type LinkedDocument,
  type PublicationEvaluation,
  REVISABLE_CHANGE_ORDER_STATES,
  transition,
} from '@handyhub/domain'
import { quantityFromMinor, quantityToString } from '@handyhub/money'
import type { StaffActor } from '@handyhub/policy'
import { ApiError, type FieldError } from '../../api/errors.js'
import type { Automation } from '../../platform/automation.js'
import { scheduleJob } from '../../platform/jobs.js'
import type { Config } from '../../platform/config/index.js'
import { currentContext } from '../../platform/request-context.js'
import { outbox } from '../../platform/outbox.js'
import {
  approvalThreshold,
  changeOrderPublicationGate,
  creditPolicy,
  lockProjectPublications,
  mayApprove,
  requestApproval,
  type ApprovalSubject,
} from '../approvals/service.js'
import { canonicalJson } from '../estimates/approval.js'
import {
  firstNameOf,
  jobNumberOf,
  notificationAutomation,
  portalLink,
  type Destination,
  type NotificationProviders,
} from '../notifications/index.js'
import { isPublisher, lockVersion, repriceVersion, stale, type VersionRow, writeDraft } from './store.js'

export const CHANGE_ORDER_PUBLISHED_EVENT = 'change_order.published'
export const CHANGE_ORDER_PROPOSED_MESSAGE_KEY = 'change_order.proposed'

const field = (f: string, code: string): FieldError => ({ field: f, code, message: '' })
const conflict = (f: string, code: string) => new ApiError('CONFLICT', { fieldErrors: [field(f, code)] })
const num = (v: string | number | bigint | null | undefined) => (v === null || v === undefined ? null : Number(v))

export type PublishDeps = {
  config: Config
  /** The publishing session completed the second factor (the Owner's publication is the approval, OWN-DEC-204). */
  secondFactor: boolean
  expiry: Automation
}

/** The customer content of a version: what the digest fixes and the customer approves. */
async function customerContent(tx: Tx, v: VersionRow, reference: string) {
  const lines = await tx
    .selectFrom('work.change_order_lines')
    .select(['position', 'kind', 'description', 'quantity_milli', 'unit', 'unit_price_cents', 'amount_cents'])
    .where('version_id', '=', v.id)
    .orderBy('position')
    .execute()
  return {
    reference,
    version: v.version,
    reason: v.reason,
    scope: v.scope,
    scheduleImpact: v.schedule_impact,
    lines: lines.map((l) => ({
      position: l.position,
      kind: l.kind,
      description: l.description,
      quantity: l.quantity_milli === null ? null : quantityToString(quantityFromMinor(Number(l.quantity_milli))),
      unit: l.unit,
      unitPriceCents: num(l.unit_price_cents),
      amountCents: num(l.amount_cents),
    })),
    baseSnapshotId: v.base_snapshot_id,
    approvedTotalCents: Number(v.base_total_cents),
    chargesCents: num(v.charges_cents),
    creditsCents: num(v.credits_cents),
    revisedTotalCents: num(v.revised_total_cents),
  }
}
export const digestOf = (content: unknown) => createHash('sha256').update(canonicalJson(content)).digest('hex')

/** The project's other change orders that are issued and not yet in the approved total (the splitting check). */
async function linkedChangeOrders(tx: Tx | Db, projectId: string, versionId: string): Promise<LinkedDocument[]> {
  const rows = await tx
    .selectFrom('work.change_order_versions as v')
    .innerJoin('work.change_orders as c', 'c.id', 'v.change_order_id')
    .innerJoin('crm.projects as p', 'p.id', 'v.project_id')
    .select(['v.id', 'v.version', 'v.state', 'v.charges_cents', 'v.credits_cents', 'c.number', 'p.reference'])
    .where('v.project_id', '=', projectId)
    .where('v.state', '=', 'issued')
    .where('v.id', '<>', versionId)
    .where('v.valid_until', '>', new Date())
    .orderBy('c.number')
    .execute()
  return rows.map((r) => ({
    kind: 'change_order' as const,
    id: r.id,
    reference: `${r.reference}-C${r.number}`,
    version: r.version,
    state: r.state,
    valueCents: Math.max(0, Number(r.charges_cents) - Number(r.credits_cents)),
  }))
}

/** The Owner-approval evaluation and the subject the approval service records, for one priced version. */
async function evaluate(
  tx: Tx | Db,
  config: Config,
  v: VersionRow,
  job: { project_id: string; reference: string },
  number: number,
  digest: string,
): Promise<{ evaluation: PublicationEvaluation; subject: ApprovalSubject & { type: 'change_order_version' } }> {
  const charges = Number(v.charges_cents)
  const credits = Number(v.credits_cents)
  const revised = Number(v.revised_total_cents)
  const facts: ChangeOrderPublicationFacts = {
    adjustmentCents: charges - credits,
    revisedProjectValueCents: revised,
    // PROPOSED: every credit is a discretionary credit, with the change order's reason (OWN-DEC-204).
    adjustments: credits > 0 ? [{ kind: 'discretionary_credit', amountCents: credits, reason: v.reason }] : [],
    costs: null,
    linked: await linkedChangeOrders(tx, job.project_id, v.id),
  }
  const evaluation = evaluateChangeOrderPublication(approvalThreshold(config), facts, creditPolicy(config))
  return {
    evaluation,
    subject: {
      type: 'change_order_version',
      id: v.id,
      projectId: job.project_id,
      projectReference: job.reference,
      reference: `${job.reference}-C${number}`,
      documentVersion: v.version,
      digest,
      proposedTotalCents: revised,
      highestTotalCents: null,
      subtotalCents: null,
      discountCents: null,
      discountCategory: null,
      adjustmentCents: charges - credits,
      revisedProjectValueCents: revised,
      costs: null,
      preparedBy: v.drafted_by,
    },
  }
}

async function numberOf(tx: Tx | Db, changeOrderId: string): Promise<number> {
  const c = await tx
    .selectFrom('work.change_orders')
    .select('number')
    .where('id', '=', changeOrderId)
    .executeTakeFirstOrThrow()
  return c.number
}

/** Issues the reviewed version to the customer (see the header). */
export async function issueChangeOrder(
  tx: Tx,
  actor: StaffActor,
  changeOrderId: string,
  input: { validityDays?: number; validityReason?: string },
  expectedVersion: number,
  deps: PublishDeps,
) {
  const { job, v } = await lockVersion(tx, changeOrderId)
  if (v.row_version !== expectedVersion) throw stale(v)
  if (!isPublisher(actor)) throw new ApiError('FORBIDDEN')
  if (v.state !== 'reviewed') throw conflict('changeOrder', 'NOT_REVIEWED')
  // A shorter validity is the Owner's, with a written reason (OWN-DEC-168 item 8).
  const shorter = input.validityDays !== undefined
  if (shorter && !mayApprove(actor, job.project_id))
    throw new ApiError('FORBIDDEN', { fieldErrors: [field('body.validityDays', 'OWNER_ONLY')] })
  if (shorter && !input.validityReason?.trim())
    throw new ApiError('VALIDATION_FAILED', { fieldErrors: [field('body.validityReason', 'REASON_REQUIRED')] })
  const validity = deps.config.get('change_order.validity')
  const zone = deps.config.get('business.timezone')
  if (validity.state !== 'CONFIGURED' || zone.state !== 'CONFIGURED')
    throw new ApiError('NOT_CONFIGURED', { fieldErrors: [field('changeOrder', 'VALIDITY_NOT_CONFIGURED')] })
  const days = shorter ? (input.validityDays as number) : validity.value.days
  if (days > validity.value.days)
    throw new ApiError('VALIDATION_FAILED', { fieldErrors: [field('body.validityDays', 'NEVER_LONGER')] })
  await repriceVersion(tx, job.id, v)
  const number = await numberOf(tx, changeOrderId)
  const reference = `${job.reference}-C${number}`
  const digest = digestOf(await customerContent(tx, v, reference))
  await lockProjectPublications(tx, job.project_id)
  const { evaluation, subject } = await evaluate(tx, deps.config, v, job, number, digest)
  const gate = await changeOrderPublicationGate(tx, actor, subject, evaluation, { secondFactor: deps.secondFactor })
  const now = new Date()
  const t = transition(CHANGE_ORDER_MACHINE, { state: 'reviewed', version: v.row_version }, 'issue', {
    actor: 'staff',
    expectedVersion: v.row_version,
    now,
    facts: { pricingProblems: [], baseCurrent: true },
  })
  if (!t.ok) throw conflict('changeOrder', t.code)
  const validUntil = estimateValidUntil(now, days, zone.value.zone)
  await tx
    .updateTable('work.change_order_versions')
    .set({
      state: t.to,
      issued_by: actor.userId,
      issued_at: now,
      content_sha256: digest,
      valid_until: validUntil,
      validity_days: shorter ? days : null,
      validity_reason: shorter ? (input.validityReason as string).trim() : null,
      updated_by: actor.userId,
      updated_at: now,
      row_version: v.row_version + 1,
    })
    .where('id', '=', v.id)
    .execute()
  const requestId = currentContext()?.requestId ?? `change-order-issue:${v.id}`
  await outbox.add(tx, {
    type: CHANGE_ORDER_PUBLISHED_EVENT,
    aggregate: { type: 'change_order_version', id: v.id, version: v.row_version + 1 },
    payload: { changeOrderId, version: v.version },
    idempotencyKey: `${CHANGE_ORDER_PUBLISHED_EVENT}:${v.id}`,
    requestId,
  })
  await scheduleJob(tx, deps.expiry, {
    key: v.id,
    runAt: validUntil,
    payload: { version: v.version },
    target: { type: 'change_order_version', id: v.id },
    requestId,
  })
  return {
    changeOrderId,
    versionId: v.id,
    state: t.to,
    rowVersion: v.row_version + 1,
    reference,
    validUntil: validUntil.toISOString(),
    ownerApproval: gate.required ? { approvalId: gate.approvalId, basis: gate.basis } : null,
  }
}

/** Asks the Owner to approve publishing the reviewed version (Owner Decisions). */
export async function requestChangeOrderApproval(
  tx: Tx,
  actor: StaffActor,
  changeOrderId: string,
  expectedVersion: number,
  config: Config,
) {
  const { job, v } = await lockVersion(tx, changeOrderId)
  if (v.row_version !== expectedVersion) throw stale(v)
  if (!isPublisher(actor)) throw new ApiError('FORBIDDEN')
  if (v.state !== 'reviewed') throw conflict('changeOrder', 'NOT_REVIEWED')
  await repriceVersion(tx, job.id, v)
  const number = await numberOf(tx, changeOrderId)
  const digest = digestOf(await customerContent(tx, v, `${job.reference}-C${number}`))
  await lockProjectPublications(tx, job.project_id)
  const { evaluation, subject } = await evaluate(tx, config, v, job, number, digest)
  const r = await requestApproval(tx, actor, subject, evaluation)
  return { changeOrderId, versionId: v.id, approvalId: r.approvalId, created: r.created, reasons: evaluation.reasons }
}

/** Whether the reviewed version needs the Owner's approval, and why (shown before publishing). */
export async function publicationNeeds(
  tx: Tx | Db,
  config: Config,
  v: VersionRow,
  job: { project_id: string; reference: string },
) {
  const number = await numberOf(tx, v.change_order_id)
  const { evaluation } = await evaluate(tx, config, v, job, number, '0'.repeat(64))
  return { required: evaluation.required, reasons: [...evaluation.reasons], flags: [...evaluation.flags] }
}

/** A later version as a draft (see the header). */
export async function reviseChangeOrder(tx: Tx, actor: StaffActor, changeOrderId: string, expectedVersion: number) {
  const { job, v } = await lockVersion(tx, changeOrderId)
  if (v.row_version !== expectedVersion) throw stale(v)
  if (!isPublisher(actor)) throw new ApiError('FORBIDDEN')
  if (!(REVISABLE_CHANGE_ORDER_STATES as readonly string[]).includes(v.state))
    throw conflict('changeOrder', 'NOT_REVISABLE')
  const now = new Date()
  if (v.state === 'issued') {
    // A version past its validity expires; one still valid is superseded by the new version.
    const ended = v.valid_until !== null && v.valid_until.getTime() <= now.getTime()
    await tx
      .updateTable('work.change_order_versions')
      .set({
        state: ended ? 'expired' : 'superseded',
        ...(ended ? { expired_at: now } : { superseded_at: now }),
        updated_by: actor.userId,
        updated_at: now,
        row_version: v.row_version + 1,
      })
      .where('id', '=', v.id)
      .execute()
  }
  const lines = await tx
    .selectFrom('work.change_order_lines')
    .select(['kind', 'description', 'work_package_id', 'quantity_milli', 'unit', 'unit_price_cents'])
    .where('version_id', '=', v.id)
    .orderBy('position')
    .execute()
  const base = await tx
    .selectFrom('work.job_scope_snapshots')
    .select(['id', 'total_cents'])
    .where('job_id', '=', job.id)
    .orderBy('version', 'desc')
    .limit(1)
    .executeTakeFirstOrThrow()
  const next = await tx
    .insertInto('work.change_order_versions')
    .values({
      change_order_id: changeOrderId,
      job_id: job.id,
      project_id: job.project_id,
      version: v.version + 1,
      reason: v.reason,
      scope: v.scope,
      base_snapshot_id: base.id,
      base_total_cents: Number(base.total_cents),
      drafted_by: actor.userId,
      updated_by: actor.userId,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  await writeDraft(
    tx,
    actor,
    next.id,
    job.id,
    {
      reason: v.reason,
      scope: v.scope,
      scheduleImpact: v.schedule_impact,
      hazards: v.hazards,
      resources: v.resources,
      measurements: v.measurements,
      photoIds: v.photo_ids,
      affectedSteps: v.affected_steps as { workPackageId: string; stepId: string }[],
      lines: lines.map((l) => ({
        kind: l.kind as 'charge' | 'credit',
        description: l.description,
        workPackageId: l.work_package_id,
        quantity: l.quantity_milli === null ? null : quantityToString(quantityFromMinor(Number(l.quantity_milli))),
        unit: l.unit,
        unitPriceCents: num(l.unit_price_cents),
      })),
    },
    1,
  )
  return { changeOrderId, versionId: next.id, state: 'draft' as const, rowVersion: 2, version: v.version + 1 }
}

/** The validity expiry (the job at a version's valid-until time). */
export async function expireIfDue(tx: Tx, versionId: string): Promise<'expired' | 'unchanged'> {
  const row = await tx
    .selectFrom('work.change_order_versions')
    .select(['id', 'job_id', 'state', 'valid_until', 'row_version'])
    .where('id', '=', versionId)
    .executeTakeFirst()
  if (!row) return 'unchanged'
  await tx.selectFrom('work.jobs').select('id').where('id', '=', row.job_id).forUpdate().execute()
  const v = await tx
    .selectFrom('work.change_order_versions')
    .select(['state', 'valid_until', 'row_version'])
    .where('id', '=', versionId)
    .forUpdate()
    .executeTakeFirstOrThrow()
  if (v.state !== 'issued' || !v.valid_until) return 'unchanged'
  const now = new Date()
  const t = transition(CHANGE_ORDER_MACHINE, { state: 'issued', version: v.row_version }, 'expire', {
    actor: 'system',
    expectedVersion: v.row_version,
    now,
    facts: { validUntil: v.valid_until },
  })
  // Not due yet: the job fails and retries instead of expiring anything early.
  if (!t.ok) throw new Error(`change-order version ${versionId} is not due to expire: ${t.message}`)
  await tx
    .updateTable('work.change_order_versions')
    .set({ state: t.to, expired_at: now, updated_at: now, row_version: v.row_version + 1 })
    .where('id', '=', versionId)
    .execute()
  return 'expired'
}

/** One job per issued version, at its valid-until time (OWN-DEC-168: never extended, never approved after). */
export function changeOrderExpiryAutomation(): Automation {
  return {
    name: 'change_order.validity_expiry',
    trigger: { kind: 'schedule', description: 'one job per issued change-order version, at its valid-until time' },
    identity: 'system.change_orders',
    inputs: { description: 'the issued version (job target); the version as it is when the job runs', version: 1 },
    idempotency: 'one job per version (key: the version id); a version no longer issued is left as it is',
    effect: 'moves an issued change-order version whose validity ended to expired',
    retry: { maxAttempts: 5, baseDelayMs: 60_000, maxDelayMs: 3_600_000 },
    timeoutMs: 10_000,
    exceptionOwner: 'estimator',
    audit: { action: 'change_order.expire' },
    handle: async ({ tx, job }) => {
      const id = job.target.id
      if (!id) return 'cancelled'
      return (await expireIfDue(tx, id)) === 'expired' ? 'done' : 'cancelled'
    },
  }
}

/**
 * The automatic proposed-change notice (change_order.proposed, the owner's "Proposed Change to Job #" wording,
 * OWN-DEC-152): sent once per issued version, rechecked at send time (a version no longer issued or past its validity
 * sends nothing). No amount in the message: the link opens the project's Documents tab for the verified customer.
 */
export function changeOrderProposedAutomation(deps: {
  providers: NotificationProviders
  publicSiteUrl?: string | undefined
}): Automation {
  return notificationAutomation({
    messageKey: CHANGE_ORDER_PROPOSED_MESSAGE_KEY,
    providers: deps.providers,
    resolve: async ({ tx, job }) => {
      const id = job.target.id
      if (!id) return 'stale'
      const v = await tx
        .selectFrom('work.change_order_versions as v')
        .innerJoin('intake.requests as r', 'r.project_id', 'v.project_id')
        .innerJoin('crm.contacts as c', 'c.id', 'r.contact_id')
        .innerJoin('crm.projects as p', 'p.id', 'v.project_id')
        .select([
          'p.reference',
          'v.id',
          'v.project_id',
          'v.state',
          'v.valid_until',
          'c.id as contactId',
          'c.full_name',
          'c.email',
          'c.phone_e164',
          'c.preferred_channel',
        ])
        .where('v.id', '=', id)
        .executeTakeFirst()
      if (!v || v.state !== 'issued' || !v.valid_until || v.valid_until.getTime() <= Date.now()) return 'stale'
      const destinations: Destination[] = [
        {
          channel: 'email',
          destination: v.email,
          permission: v.preferred_channel === 'email' ? 'preferred' : 'permitted',
        },
        {
          channel: 'sms',
          destination: v.phone_e164,
          permission: v.preferred_channel === 'text' ? 'preferred' : 'permitted',
        },
      ]
      const link = portalLink(deps.publicSiteUrl, v.reference, 'documents')
      return {
        subjectKey: `change_order_version:${v.id}`,
        record: { type: 'change_order_version', id: v.id },
        recipients: [{ kind: 'customer_contact', id: v.contactId, destinations }],
        values: {
          customerName: firstNameOf(v.full_name),
          jobNumber: jobNumberOf(v.reference),
          ...(link ? { changeOrderLink: link } : {}),
        },
        projectId: v.project_id,
      }
    },
  })
}
