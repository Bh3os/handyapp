// The estimate version lifecycle on the server (TSK-0055; HH-EST-04, HH-STATE-01, ENT-EstimateVersion, ENT-Estimate,
// OWN-DEC-102, OWN-DEC-103, OWN-DEC-118, FACT-ESTIMATE-VALIDITY, FACT-AUTOMATIC-MESSAGES, T26, T32,
// RULE-SERVER-AUTHZ, RULE-NO-INVENTED-FACTS).
// - Every change is a named event of the estimate_version.lifecycle machine (@handyhub/domain), applied under the
//   estimate's row lock and then the version's, with the expected row version (If-Match). The database refuses any
//   other state change (migration 0032).
// - Who may act is decided here through the policy, so no route can skip it: publishing is estimate.publish, which the
//   Estimator holds only while the Owner's publishing policy (estimate.publishing_roles, OWN-DEC-118) lists the role,
//   read in the same transaction, so a removed permission refuses the very next publish. Revising, withdrawing,
//   expiring and recording a decline are their own actions; requesting review and returning to the draft are part of
//   writing the draft (estimate.draft, PROPOSED mapping).
// - Publishing runs the publish readiness check (readiness.ts) under the lock and refuses unless it is ready: every
//   NOT CONFIGURED value it needs (terms, validity, deposit rule, ...) keeps the version unpublished; nothing is
//   defaulted. A review hold that is open or under review blocks it too (HH-LEAD-04). In one transaction it then
//   supersedes the version published before it, pins the validity (counted from publishing) and the terms version,
//   stores the customer PDF with its SHA-256, marks a request that was ready for its estimate as estimated, writes the
//   estimate.version_published event (the automatic "Your HandyHub estimate is ready" notice, FACT-AUTOMATIC-MESSAGES
//   #8) and schedules the validity expiry job.
// - Revising never edits a version past review: it creates the next version of the same estimate as a draft, copied
//   from the chosen version and priced again by the server under the active configuration, naming the version it was
//   revised from. Every version is kept (history).
// - Accepting is the approval transaction (TSK-0057). acceptanceCheck is its rule: only the current, unexpired
//   published version; otherwise the current version to show, or none ("Request an Updated Estimate").
import { createHash, randomUUID } from 'node:crypto'
import type { Db, Tx } from '@handyhub/db'
import {
  acceptanceProblem,
  apply,
  effectiveEstimateState,
  estimateValidUntil,
  type EstimateVersionEvent,
  type EstimateVersionFacts,
  type EstimateVersionState,
  eventsFrom,
  ESTIMATE_VERSION_MACHINE,
  isEditableEstimateState,
  type TransitionResult,
} from '@handyhub/domain'
import { quantityFromMinor, quantityToString } from '@handyhub/money'
import { type Action, decide, STAFF_ROLES, type StaffActor, type StaffRole } from '@handyhub/policy'
import { sql } from 'kysely'
import { ApiError, type FieldError } from '../../api/errors.js'
import type { Automation } from '../../platform/automation.js'
import { type Config, loadConfig } from '../../platform/config/index.js'
import { scheduleJob } from '../../platform/jobs.js'
import { outbox } from '../../platform/outbox.js'
import { currentContext } from '../../platform/request-context.js'
import type { ObjectStorage } from '../../providers/index.js'
import { syncEstimateItem } from '../queue/index.js'
import { customerPdfInput, renderCustomerPdf } from './customer-pdf.js'
import { PDF_TYPE } from './document-content.js'
import { isUuid, saveDraft, TEXT_LISTS, type DraftInput } from './model.js'
import { discountFor, pricingPolicies } from './pricing.js'
import { publishReadiness, type PublishProblem } from './readiness.js'
import { stopEstimateReminders } from './reminders.js'
import { estimateResponses, resolveResponsesOnRevision } from './responses.js'

type Reader = Db | Tx

/** The committed event that sends the estimate-ready notice (message type estimate.ready). */
export const ESTIMATE_PUBLISHED_EVENT = 'estimate.version_published'

/** The staff roles the Owner's publishing policy lets publish; none while it is NOT CONFIGURED (fail closed). */
export function publishingRoles(config: Config): StaffRole[] {
  const entry = config.get('estimate.publishing_roles')
  if (entry.state !== 'CONFIGURED') return []
  return entry.value.roles.filter((r): r is StaffRole => (STAFF_ROLES as readonly string[]).includes(r))
}

function allowed(actor: StaffActor, action: Action, projectId: string, config?: Config): boolean {
  return (
    decide(
      actor,
      action,
      { projectId },
      { now: new Date(), online: true, ...(config ? { publishingRoles: publishingRoles(config) } : {}) },
    ).effect === 'allow'
  )
}

function authorize(actor: StaffActor, action: Action, projectId: string, config?: Config): void {
  if (!allowed(actor, action, projectId, config)) throw new ApiError('FORBIDDEN')
}

const field = (f: string, code: string): FieldError => ({ field: f, code, message: '' })

type VersionRow = {
  id: string
  estimate_id: string
  project_id: string
  version: number
  state: string
  row_version: number
  valid_until: Date | null
  prepared_by: string
}

async function head(db: Reader, versionId: string) {
  if (!isUuid(versionId)) throw new ApiError('NOT_FOUND')
  const v = await db
    .selectFrom('estimating.estimate_versions')
    .select(['estimate_id', 'project_id'])
    .where('id', '=', versionId)
    .executeTakeFirst()
  if (!v) throw new ApiError('NOT_FOUND')
  return v
}

/**
 * Locks the estimate, then the version: every lifecycle change of an estimate takes the estimate's row lock first, so
 * publishing, superseding, revising and the expiry job of one estimate serialize.
 */
async function lock(tx: Tx, estimateId: string, versionId: string): Promise<VersionRow> {
  await tx.selectFrom('estimating.estimates').select('id').where('id', '=', estimateId).forUpdate().execute()
  return tx
    .selectFrom('estimating.estimate_versions')
    .select(['id', 'estimate_id', 'project_id', 'version', 'state', 'row_version', 'valid_until', 'prepared_by'])
    .where('id', '=', versionId)
    .forUpdate()
    .executeTakeFirstOrThrow()
}

async function projectState(tx: Tx, projectId: string): Promise<string> {
  const p = await tx.selectFrom('crm.projects').select('state').where('id', '=', projectId).executeTakeFirstOrThrow()
  return p.state
}

async function dbNow(tx: Tx): Promise<Date> {
  const r = await sql<{ now: Date }>`SELECT now() AS now`.execute(tx)
  return new Date((r.rows[0] as { now: Date }).now)
}

function stale(expected: number | undefined, row: VersionRow): void {
  if (expected !== undefined && expected !== row.row_version)
    throw new ApiError('STALE_VERSION', { current: { version: row.row_version } })
}

function machine(
  row: VersionRow,
  event: EstimateVersionEvent,
  actor: 'staff' | 'system',
  facts: EstimateVersionFacts,
  now: Date,
) {
  return apply(
    { machine: 'estimate_version.lifecycle', state: row.state as EstimateVersionState, version: row.row_version },
    event,
    { actor, expectedVersion: row.row_version, now, facts },
  )
}

type Refusal = Extract<TransitionResult<string, string>, { ok: false }>

/** A refused transition as the stable error: each problem is a field error naming what to resolve. */
function refusal(r: Refusal, readiness: readonly PublishProblem[] = []): ApiError {
  if (r.code === 'STALE_VERSION') return new ApiError('STALE_VERSION')
  const errors: FieldError[] = []
  for (const p of r.problems.length ? r.problems : [{ code: r.code }]) {
    if (p.code === 'NOT_READY') {
      for (const q of readiness)
        errors.push(
          field(q.key ? `readiness.${q.key}` : q.line === undefined ? 'readiness' : `lines[${q.line}]`, q.code),
        )
    } else if (p.code === 'REASON_REQUIRED') errors.push(field('reason', p.code))
    else if (p.code === 'REVIEW_HOLD_OPEN') errors.push(field('holds', p.code))
    else errors.push(field('state', p.code))
  }
  return new ApiError(errors.some((e) => e.field === 'reason') ? 'VALIDATION_FAILED' : 'CONFLICT', {
    fieldErrors: errors,
  })
}

async function blockingReviewHolds(tx: Tx, projectId: string): Promise<number> {
  const r = await tx
    .selectFrom('work.holds')
    .select(sql<number>`count(*)::int`.as('n'))
    .where('kind', '=', 'review')
    .where('project_id', '=', projectId)
    .where('state', 'in', ['open', 'under_review'])
    .executeTakeFirstOrThrow()
  return r.n
}

export type PublishDeps = {
  /** The private object storage the customer PDF is stored in; null while NOT CONFIGURED (publishing refused). */
  storage: ObjectStorage | null
  /** Outside production the customer PDF carries the TEST mark (OWN-DEC-126). */
  testMark: boolean
  /** The schedule automation of the validity expiry (estimateExpiryAutomation). */
  expiry: Automation
}

export type PublishResult = {
  rowVersion: number
  publishedAt: Date
  validUntil: Date
  termsVersion: string
  validityPolicyVersion: number
  publishingPolicyVersion: number | null
  superseded: { versionId: string; version: number } | null
  customerPdf: { sha256: string; byteSize: number }
  requestsEstimated: string[]
}

/**
 * Publishes a draft or in-review version (S04 step 4). Refuses, naming every reason, unless the caller may publish
 * now, the project is open, the version is the one the caller saw, the readiness check passes and no review hold
 * blocks. Returns what publishing pinned.
 */
export async function publishVersion(
  tx: Tx,
  actor: StaffActor,
  versionId: string,
  deps: PublishDeps,
  options: { expectedRowVersion?: number } = {},
): Promise<PublishResult> {
  const h = await head(tx, versionId)
  const config = await loadConfig(tx)
  authorize(actor, 'estimate.publish', h.project_id, config)
  const row = await lock(tx, h.estimate_id, versionId)
  stale(options.expectedRowVersion, row)
  if ((await projectState(tx, row.project_id)) !== 'open')
    throw new ApiError('CONFLICT', { fieldErrors: [field('project', 'PROJECT_NOT_OPEN')] })
  const now = await dbNow(tx)
  const readiness = (await publishReadiness(tx, versionId, config)) ?? { ready: false, problems: [] }
  const holds = await blockingReviewHolds(tx, row.project_id)
  const moved = machine(
    row,
    'publish',
    'staff',
    { readinessProblems: readiness.problems.map((p) => p.code), blockingReviewHolds: holds },
    now,
  )
  if (!moved.ok) throw refusal(moved, readiness.problems)
  if (!deps.storage) throw new ApiError('NOT_CONFIGURED', { fieldErrors: [field('storage', 'STORAGE_NOT_CONFIGURED')] })
  // Readiness passed, so these values are configured; read them from the same snapshot.
  const validity = config.get('estimate.validity')
  const terms = config.get('legal.estimate_terms')
  const zone = config.get('business.timezone')
  if (validity.state !== 'CONFIGURED' || terms.state !== 'CONFIGURED' || zone.state !== 'CONFIGURED')
    throw new Error('readiness passed without the validity, the terms or the business time zone')

  // The version published before this one is superseded first: one published version per estimate.
  const previous = await tx
    .selectFrom('estimating.estimate_versions')
    .select(['id', 'estimate_id', 'project_id', 'version', 'state', 'row_version', 'valid_until', 'prepared_by'])
    .where('estimate_id', '=', row.estimate_id)
    .where('state', '=', 'published')
    .forUpdate()
    .executeTakeFirst()
  if (previous) {
    const sup = machine(
      previous,
      'supersede',
      'system',
      { newerVersionPublishing: previous.version < row.version },
      now,
    )
    if (!sup.ok) throw refusal(sup)
    await tx
      .updateTable('estimating.estimate_versions')
      .set({ state: sup.to, state_changed_at: now, row_version: sup.version })
      .where('id', '=', previous.id)
      .execute()
    // TSK-0060: the superseded version's waiting reminder drafts stop (HH-EST-14).
    await stopEstimateReminders(tx, previous.id)
  }

  // The customer PDF exactly as published, stored once under an opaque key with its SHA-256 (ENT-EstimateVersion).
  // Valid for the configured days from publishing, counted in the business time zone (FACT-ESTIMATE-VALIDITY).
  const validUntil = estimateValidUntil(now, validity.value.days, zone.value.zone)
  const termsVersion = terms.value.documentId
  const input = await customerPdfInput(tx, versionId, {
    testMark: deps.testMark,
    publishing: { publishedAt: now, validUntil, termsVersion },
  })
  if (!input) throw new ApiError('NOT_FOUND')
  const bytes = await renderCustomerPdf(input)
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const key = `estimates/published/${randomUUID()}`
  await deps.storage.put(key, bytes, PDF_TYPE)
  await tx
    .updateTable('estimating.estimate_versions')
    .set({
      state: moved.to,
      state_changed_at: now,
      published_at: now,
      published_by: actor.userId,
      validity_policy_version: validity.version,
      valid_until: validUntil,
      terms_version: termsVersion,
      customer_pdf_object_key: key,
      customer_pdf_sha256: sha256,
      customer_pdf_byte_size: bytes.length,
      row_version: moved.version,
    })
    .where('id', '=', versionId)
    .execute()

  // TSK-0056: a newer version answers the customer's responses to the earlier ones (their follow-up items resolve).
  await resolveResponsesOnRevision(tx, row.estimate_id, row.version)

  // The project's request moves on to estimated when it was ready for its estimate (the request machine's own event).
  const requests = await tx
    .selectFrom('intake.requests')
    .select(['id', 'state', 'state_version'])
    .where('project_id', '=', row.project_id)
    .forUpdate()
    .execute()
  const estimated: string[] = []
  for (const r of requests) {
    if (r.state === 'ready_for_estimate') {
      const next = apply(
        { machine: 'request.lifecycle', state: 'ready_for_estimate', version: r.state_version },
        'mark_estimated',
        {
          actor: 'system',
          expectedVersion: r.state_version,
          now,
          facts: { blockingReviewHolds: holds },
        },
      )
      if (!next.ok) throw refusal(next)
      await tx
        .updateTable('intake.requests')
        .set({ state: next.to, state_version: next.version })
        .where('id', '=', r.id)
        .execute()
      estimated.push(r.id)
    }
    await syncEstimateItem(tx, r.id)
  }

  const requestId = currentContext()?.requestId ?? `estimate-publish:${versionId}`
  await outbox.add(tx, {
    type: ESTIMATE_PUBLISHED_EVENT,
    aggregate: { type: 'estimate_version', id: versionId, version: moved.version },
    payload: { estimateId: row.estimate_id, version: row.version },
    idempotencyKey: `${ESTIMATE_PUBLISHED_EVENT}:${versionId}`,
    requestId,
  })
  await scheduleJob(tx, deps.expiry, {
    key: versionId,
    runAt: validUntil,
    payload: { version: row.version },
    target: { type: 'estimate_version', id: versionId },
    requestId,
  })
  const policy = config.get('estimate.publishing_roles')
  return {
    rowVersion: moved.version,
    publishedAt: now,
    validUntil,
    termsVersion,
    validityPolicyVersion: validity.version,
    publishingPolicyVersion: policy.state === 'CONFIGURED' ? policy.version : null,
    superseded: previous ? { versionId: previous.id, version: previous.version } : null,
    customerPdf: { sha256, byteSize: bytes.length },
    requestsEstimated: estimated,
  }
}

/** Staff lifecycle events other than publishing, each with its policy action. */
export const STAFF_EVENTS = {
  request_review: 'estimate.draft',
  return_to_draft: 'estimate.draft',
  withdraw: 'estimate.withdraw',
  expire_now: 'estimate.expire',
  decline: 'estimate.record_decline',
} as const satisfies Partial<Record<EstimateVersionEvent, Action>>
export type StaffEvent = keyof typeof STAFF_EVENTS

/**
 * Applies one staff event to a version: request review, return to the draft, withdraw, expire now or record the
 * customer's decline. Withdrawing and expiring early need a written reason (PROPOSED); a decline's reason is optional.
 */
export async function changeVersionState(
  tx: Tx,
  actor: StaffActor,
  versionId: string,
  event: StaffEvent,
  options: { expectedRowVersion?: number; reason?: string } = {},
): Promise<{ from: string; to: string; rowVersion: number }> {
  const h = await head(tx, versionId)
  authorize(actor, STAFF_EVENTS[event], h.project_id)
  const row = await lock(tx, h.estimate_id, versionId)
  stale(options.expectedRowVersion, row)
  const now = await dbNow(tx)
  const moved = machine(row, event, 'staff', options.reason === undefined ? {} : { reason: options.reason }, now)
  if (!moved.ok) throw refusal(moved)
  await tx
    .updateTable('estimating.estimate_versions')
    .set({ state: moved.to, state_changed_at: now, row_version: moved.version })
    .where('id', '=', versionId)
    .execute()
  // TSK-0060: a withdrawn, expired or declined version's waiting reminder drafts stop (HH-EST-14).
  if (event === 'withdraw' || event === 'expire_now' || event === 'decline') await stopEstimateReminders(tx, versionId)
  if (event === 'request_review' || event === 'return_to_draft') {
    const requests = await tx
      .selectFrom('intake.requests')
      .select('id')
      .where('project_id', '=', row.project_id)
      .execute()
    for (const r of requests) await syncEstimateItem(tx, r.id)
  }
  return { from: moved.from, to: moved.to, rowVersion: moved.version }
}

/**
 * The validity expiry (the job at a version's valid-until time): a version still published whose validity has ended
 * becomes expired. A version superseded, withdrawn, declined or accepted meanwhile is left as it is.
 */
export async function expireIfDue(tx: Tx, versionId: string): Promise<'expired' | 'unchanged'> {
  const h = await head(tx, versionId)
  const row = await lock(tx, h.estimate_id, versionId)
  if (row.state !== 'published') return 'unchanged'
  const now = await dbNow(tx)
  const moved = machine(row, 'expire', 'system', row.valid_until ? { validUntil: row.valid_until } : {}, now)
  // Not due yet (or no valid-until time): the job fails and retries instead of expiring anything early.
  if (!moved.ok) throw new Error(`estimate version ${versionId} is not due to expire: ${moved.message}`)
  await tx
    .updateTable('estimating.estimate_versions')
    .set({ state: moved.to, state_changed_at: now, row_version: moved.version })
    .where('id', '=', versionId)
    .execute()
  await stopEstimateReminders(tx, versionId)
  return 'expired'
}

/** The schedule automation that records the end of validity (one job per published version, at valid_until). */
export function estimateExpiryAutomation(): Automation {
  return {
    name: 'estimate.validity_expiry',
    trigger: { kind: 'schedule', description: 'one job per published estimate version, at its valid-until time' },
    identity: 'system.estimates',
    inputs: { description: 'the published version (job target); the version as it is when the job runs', version: 1 },
    idempotency: 'one job per version (key: the version id); a version no longer published is left as it is',
    effect: 'moves a published estimate version whose validity period has ended to expired',
    retry: { maxAttempts: 5, baseDelayMs: 60_000, maxDelayMs: 3_600_000 },
    timeoutMs: 10_000,
    exceptionOwner: 'estimator',
    audit: { action: 'estimate.expire' },
    handle: async ({ tx, job }) => {
      const id = job.target.id
      if (!id) return 'cancelled'
      return (await expireIfDue(tx, id)) === 'expired' ? 'done' : 'cancelled'
    },
  }
}

/**
 * Revises a version past review (published, declined, expired, withdrawn or superseded): the next version of the same
 * estimate, as a draft, with the same lines, options, texts and discount category, priced again by the server under
 * the active configuration. Internal costs and notes are copied only for a caller who may see them on the source
 * version; a discount category the active rule no longer lists is left out (nothing is guessed). An uploaded estimate
 * keeps its structured amounts; its revised document is uploaded to the new version (PROPOSED). Refused while the
 * estimate already has a version being edited, and once it has an accepted version (accepted work changes through a
 * change order, HH-PORT-05; PROPOSED).
 */
export async function reviseVersion(
  tx: Tx,
  actor: StaffActor,
  versionId: string,
): Promise<{
  estimateId: string
  number: string
  versionId: string
  version: number
  rowVersion: number
  discountDropped: boolean
}> {
  const h = await head(tx, versionId)
  authorize(actor, 'estimate.revise', h.project_id)
  const source = await lock(tx, h.estimate_id, versionId)
  if (isEditableEstimateState(source.state))
    throw new ApiError('CONFLICT', { fieldErrors: [field('state', 'VERSION_EDITABLE')] })
  if ((await projectState(tx, source.project_id)) !== 'open')
    throw new ApiError('CONFLICT', { fieldErrors: [field('project', 'PROJECT_NOT_OPEN')] })
  const siblings = await tx
    .selectFrom('estimating.estimate_versions')
    .select(['version', 'state'])
    .where('estimate_id', '=', source.estimate_id)
    .execute()
  if (siblings.some((s) => isEditableEstimateState(s.state)))
    throw new ApiError('CONFLICT', { fieldErrors: [field('estimate', 'DRAFT_EXISTS')] })
  if (siblings.some((s) => s.state === 'accepted'))
    throw new ApiError('CONFLICT', { fieldErrors: [field('estimate', 'ESTIMATE_ACCEPTED')] })

  const full = await tx
    .selectFrom('estimating.estimate_versions as v')
    .innerJoin('estimating.estimates as e', 'e.id', 'v.estimate_id')
    .innerJoin('crm.projects as p', 'p.id', 'v.project_id')
    .select([
      'v.authoring_method',
      'v.assumptions',
      'v.exclusions',
      'v.customer_responsibilities',
      'v.dependencies',
      'v.schedule_assumptions',
      'v.discount_category',
      'e.number',
      'p.payment_term',
      'p.payment_term_version',
    ])
    .where('v.id', '=', versionId)
    .executeTakeFirstOrThrow()
  const next = Math.max(...siblings.map((s) => s.version)) + 1
  const created = await tx
    .insertInto('estimating.estimate_versions')
    .values({
      estimate_id: source.estimate_id,
      project_id: source.project_id,
      version: next,
      authoring_method: full.authoring_method,
      payment_term: full.payment_term,
      payment_term_version: full.payment_term_version,
      prepared_by: actor.userId,
      updated_by: actor.userId,
      revised_from_id: source.id,
    })
    .returning('id')
    .executeTakeFirstOrThrow()

  const lines = await tx
    .selectFrom('estimating.estimate_lines as l')
    .leftJoin('estimating.estimate_line_costs as c', 'c.line_id', 'l.id')
    .select([
      'l.kind',
      'l.work_package_id',
      'l.description',
      'l.quantity_milli',
      'l.unit',
      'l.quantity_source',
      'l.unit_price_cents',
      'c.material_cost_cents',
      'c.labor_cost_cents',
      'c.note',
    ])
    .where('l.version_id', '=', versionId)
    .orderBy('l.position')
    .execute()
  const internals = await tx
    .selectFrom('estimating.estimate_version_internals')
    .select(['markup_assumptions', 'estimator_notes'])
    .where('version_id', '=', versionId)
    .executeTakeFirst()
  const seesInternal =
    decide(
      actor,
      'estimate.view_internal_cost',
      { projectId: source.project_id, ownerStaffId: source.prepared_by },
      { now: new Date(), online: true },
    ).effect === 'allow'
  const policies = pricingPolicies(await loadConfig(tx))
  const discount = discountFor(policies, full.discount_category)
  const num = (v: string | number | null) => (v === null ? null : Number(v))
  const texts: Record<(typeof TEXT_LISTS)[number], string[]> = {
    assumptions: full.assumptions,
    exclusions: full.exclusions,
    customerResponsibilities: full.customer_responsibilities,
    dependencies: full.dependencies,
    scheduleAssumptions: full.schedule_assumptions,
  }
  const input: DraftInput = {
    lines: lines.map((l) => ({
      kind: l.kind as 'base' | 'alternate' | 'add_on',
      workPackageId: l.work_package_id,
      description: l.description,
      quantity: l.quantity_milli === null ? null : quantityToString(quantityFromMinor(Number(l.quantity_milli))),
      unit: l.unit,
      quantitySource: l.quantity_source as 'measured_on_site' | 'reported_by_customer' | null,
      unitPriceCents: num(l.unit_price_cents),
      ...(seesInternal && (l.material_cost_cents !== null || l.labor_cost_cents !== null || l.note !== null)
        ? {
            internalCost: {
              materialCostCents: num(l.material_cost_cents),
              laborCostCents: num(l.labor_cost_cents),
              note: l.note ?? null,
            },
          }
        : {}),
    })),
    discountCategory: discount.ok ? full.discount_category : null,
    texts,
    ...(seesInternal && internals
      ? { internal: { markupAssumptions: internals.markup_assumptions, estimatorNotes: internals.estimator_notes } }
      : {}),
  }
  const saved = await saveDraft(tx, actor, created.id, input)
  const requests = await tx
    .selectFrom('intake.requests')
    .select('id')
    .where('project_id', '=', source.project_id)
    .execute()
  for (const r of requests) await syncEstimateItem(tx, r.id)
  return {
    estimateId: source.estimate_id,
    number: full.number,
    versionId: created.id,
    version: next,
    rowVersion: saved.rowVersion,
    discountDropped: full.discount_category !== null && !discount.ok,
  }
}

/** The version of an estimate a customer can act on now: published and unexpired; null when there is none. */
export async function currentVersion(
  db: Reader,
  estimateId: string,
  now = new Date(),
): Promise<{ versionId: string; version: number } | null> {
  const v = await db
    .selectFrom('estimating.estimate_versions')
    .select(['id', 'version'])
    .where('estimate_id', '=', estimateId)
    .where('state', '=', 'published')
    .where('valid_until', '>', now)
    .executeTakeFirst()
  return v ? { versionId: v.id, version: v.version } : null
}

export type AcceptanceCheck =
  | { readonly acceptable: true }
  | {
      readonly acceptable: false
      /** SUPERSEDED, EXPIRED or NOT_PUBLISHED. */
      readonly code: string
      /** The version to review instead, or null: offer "Request an Updated Estimate" (OWN-DEC-103). */
      readonly current: { readonly versionId: string; readonly version: number } | null
    }

/**
 * Whether a version can be accepted now (T32, OWN-DEC-103): only the current, unexpired published version. The
 * approval transaction (TSK-0057) runs this under the version's lock; the database refuses the same cases. Null when
 * the version does not exist.
 */
export async function acceptanceCheck(
  db: Reader,
  versionId: string,
  now = new Date(),
): Promise<AcceptanceCheck | null> {
  if (!isUuid(versionId)) return null
  const v = await db
    .selectFrom('estimating.estimate_versions')
    .select(['estimate_id', 'version', 'state', 'valid_until'])
    .where('id', '=', versionId)
    .executeTakeFirst()
  if (!v) return null
  const newer = await db
    .selectFrom('estimating.estimate_versions')
    .select('id')
    .where('estimate_id', '=', v.estimate_id)
    .where('version', '>', v.version)
    .where('state', 'in', ['published', 'accepted'])
    .executeTakeFirst()
  const problem = acceptanceProblem(
    v.state as EstimateVersionState,
    { newerVersionPublished: newer !== undefined, ...(v.valid_until ? { validUntil: v.valid_until } : {}) },
    now,
  )
  if (!problem) return { acceptable: true }
  const current = await currentVersion(db, v.estimate_id, now)
  return { acceptable: false, code: problem.code, current: current?.versionId === versionId ? null : current }
}

const ref = (id: string | null, names: Map<string, string | null>) =>
  id === null ? null : { id, name: names.get(id) ?? null }

/**
 * The lifecycle part of the builder view: what publishing pinned, the actions the caller may take now (the server
 * checks each again), the estimate's current version and its version history with who created, revised and published
 * each version. Null when the version does not exist.
 */
export async function lifecycleView(
  db: Reader,
  actor: StaffActor,
  versionId: string,
  config: Config,
  now = new Date(),
) {
  if (!isUuid(versionId)) return null
  const v = await db
    .selectFrom('estimating.estimate_versions as v')
    .innerJoin('crm.projects as p', 'p.id', 'v.project_id')
    .select([
      'v.estimate_id',
      'v.project_id',
      'v.state',
      'v.published_at',
      'v.published_by',
      'v.valid_until',
      'v.terms_version',
      'v.first_viewed_at',
      'v.revised_from_id',
      'v.customer_pdf_sha256',
      'v.customer_pdf_byte_size',
      'p.state as project_state',
    ])
    .where('v.id', '=', versionId)
    .executeTakeFirst()
  if (!v) return null
  const versions = await db
    .selectFrom('estimating.estimate_versions')
    .select([
      'id',
      'version',
      'state',
      'state_changed_at',
      'prepared_by',
      'created_at',
      'updated_by',
      'updated_at',
      'published_by',
      'published_at',
      'valid_until',
      'revised_from_id',
      'total_cents',
    ])
    .where('estimate_id', '=', v.estimate_id)
    .orderBy('version')
    .execute()
  const staffIds = [
    ...new Set(versions.flatMap((r) => [r.prepared_by, r.updated_by, r.published_by]).filter((x): x is string => !!x)),
  ]
  const people = staffIds.length
    ? await db.selectFrom('identity.staff_users').select(['id', 'display_name']).where('id', 'in', staffIds).execute()
    : []
  const names = new Map(people.map((p) => [p.id, p.display_name]))
  const numberOf = new Map(versions.map((r) => [r.id, r.version]))
  const state = v.state as EstimateVersionState
  const open = v.project_state === 'open'
  const can = (event: EstimateVersionEvent) => (eventsFrom(ESTIMATE_VERSION_MACHINE, state) as string[]).includes(event)
  const hasOpen = versions.some((r) => isEditableEstimateState(r.state))
  const hasAccepted = versions.some((r) => r.state === 'accepted')
  const current = versions.find((r) => r.state === 'published' && r.valid_until && r.valid_until > now)
  return {
    effectiveState: effectiveEstimateState(state, v.valid_until, now),
    publishedAt: v.published_at?.toISOString() ?? null,
    publishedBy: ref(v.published_by, names),
    validUntil: v.valid_until?.toISOString() ?? null,
    termsVersion: v.terms_version,
    firstViewedAt: v.first_viewed_at?.toISOString() ?? null,
    customerPdf:
      v.customer_pdf_sha256 && v.customer_pdf_byte_size
        ? { sha256: v.customer_pdf_sha256, byteSize: v.customer_pdf_byte_size }
        : null,
    revisedFrom: v.revised_from_id
      ? { versionId: v.revised_from_id, version: numberOf.get(v.revised_from_id) ?? 0 }
      : null,
    current: current ? { versionId: current.id, version: current.version } : null,
    // TSK-0056 (HH-EST-09): the customer's Request Changes, Decline and Request an Updated Estimate on any version of
    // this estimate, newest first, with their own words: the append-only history staff answer.
    customerResponses: (await estimateResponses(db, v.estimate_id)).map((r) => ({
      kind: r.kind,
      version: r.version,
      at: r.at.toISOString(),
      message: r.message,
    })),
    // TSK-0057 (HH-EST-06, HH-EST-08): the customer's approval of a version of this estimate, the job and the
    // scheduling task it created.
    customerApproval: await estimateApproval(db, v.estimate_id),
    actions: {
      publish: can('publish') && open && allowed(actor, 'estimate.publish', v.project_id, config),
      requestReview: can('request_review') && allowed(actor, 'estimate.draft', v.project_id),
      returnToDraft: can('return_to_draft') && allowed(actor, 'estimate.draft', v.project_id),
      withdraw: can('withdraw') && allowed(actor, 'estimate.withdraw', v.project_id),
      expire: can('expire_now') && allowed(actor, 'estimate.expire', v.project_id),
      recordDecline: can('decline') && allowed(actor, 'estimate.record_decline', v.project_id),
      revise:
        !isEditableEstimateState(state) &&
        open &&
        !hasOpen &&
        !hasAccepted &&
        allowed(actor, 'estimate.revise', v.project_id),
    },
    history: versions.map((r) => ({
      versionId: r.id,
      version: r.version,
      state: r.state,
      effectiveState: effectiveEstimateState(r.state as EstimateVersionState, r.valid_until, now),
      stateChangedAt: r.state_changed_at.toISOString(),
      createdBy: ref(r.prepared_by, names) as { id: string; name: string | null },
      createdAt: r.created_at.toISOString(),
      revisedFromVersion: r.revised_from_id ? (numberOf.get(r.revised_from_id) ?? null) : null,
      lastEditedBy: ref(r.updated_by, names) as { id: string; name: string | null },
      lastEditedAt: r.updated_at.toISOString(),
      publishedBy: ref(r.published_by, names),
      publishedAt: r.published_at?.toISOString() ?? null,
      validUntil: r.valid_until?.toISOString() ?? null,
      totalCents: r.total_cents === null ? null : Number(r.total_cents),
    })),
  }
}

/** The approval of an estimate (at most one version is ever accepted), as the staff lifecycle panel shows it. */
async function estimateApproval(db: Reader, estimateId: string) {
  const a = await db
    .selectFrom('estimating.approvals as a')
    .innerJoin('work.jobs as j', 'j.approval_id', 'a.id')
    .innerJoin('work.scheduling_tasks as s', 's.job_id', 'j.id')
    .select([
      'a.version',
      'a.created_at',
      'a.full_name',
      'a.selected_options',
      'a.total_cents',
      'a.deposit_cents',
      'a.terms_document_id',
      'a.test_mark',
      'j.operational_state',
      's.state as task_state',
    ])
    .where('a.estimate_id', '=', estimateId)
    .executeTakeFirst()
  if (!a) return null
  return {
    version: a.version,
    at: a.created_at.toISOString(),
    fullName: a.full_name,
    options: [...a.selected_options].sort((x, y) => x - y),
    totalCents: Number(a.total_cents),
    depositCents: a.deposit_cents === null ? null : Number(a.deposit_cents),
    termsVersion: a.terms_document_id,
    testMark: a.test_mark,
    jobState: a.operational_state,
    schedulingTaskState: a.task_state,
  }
}

export type LifecycleView = NonNullable<Awaited<ReturnType<typeof lifecycleView>>>
