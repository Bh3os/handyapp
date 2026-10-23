// Change orders: worker proposals and staff drafts (TSK-0081; HH-CHG-01, HH-CHG-02, HH-WORK-07, T53, ENT-ChangeOrder,
// OWN-DEC-108, OWN-DEC-145, OWN-DEC-169, OWN-DEC-203, RULE-MONEY-CENTS, RULE-SERVER-AUTHZ). Every write runs in the
// route's transaction under the job's row lock; migration 0086 refuses anything else whatever path writes.
// - A change order belongs to a job whose estimate was approved and whose work is not yet operationally complete. Its
//   first version is a draft: an assigned worker's proposal, or a draft by an Estimator or the Owner (customer
//   request, estimator, emergency follow-up). A draft binds nothing: the job's scope snapshot, its packet and every
//   total stay as they are until the identified customer approves an issued version (TSK-0082).
// - The prices are computed here from the stored lines (priceChangeOrder): charge lines and credit lines (positive
//   magnitudes, OWN-DEC-203), against the job's current approved total (its latest scope snapshot) and the money the
//   customer has paid. A credit that would take the total below what was paid, or to $0.00, is refused at review.
// - A worker edits and withdraws only their own proposal while it is a draft; an Estimator or the Owner edits any
//   draft, marks it reviewed (pricing and eligibility checked), reopens it and withdraws it.
// - The checklist steps a version names wait while it is open (draft, reviewed or issued, HH-WORK-07).
import type { Db, Tx } from '@handyhub/db'
import {
  CHANGE_ORDER_JOB_STATES,
  CHANGE_ORDER_MACHINE,
  effectiveChangeOrderState,
  REVISABLE_CHANGE_ORDER_STATES,
  type AffectedStep,
  type ChangeOrderOrigin,
  OPEN_CHANGE_ORDER_STATES,
  sopSteps,
  type SopContent,
  transition,
  waitingSteps,
} from '@handyhub/domain'
import {
  cents,
  type ChangeOrderLineKind,
  type ChangeOrderProblem,
  MoneyError,
  priceChangeOrder,
  quantity as parseQuantity,
  quantityFromMinor,
  quantityToString,
} from '@handyhub/money'
import { decide, type StaffActor } from '@handyhub/policy'
import { sql } from 'kysely'
import { ApiError, type FieldError } from '../../api/errors.js'
import { loadConfig } from '../../platform/config/index.js'
import { approvalsOf, mayApprove } from '../approvals/service.js'

type Reader = Db | Tx

const field = (f: string, code: string): FieldError => ({ field: f, code, message: '' })
const conflict = (f: string, code: string) => new ApiError('CONFLICT', { fieldErrors: [field(f, code)] })
const invalid = (errors: FieldError[]) => new ApiError('VALIDATION_FAILED', { fieldErrors: errors })
const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null)
const num = (v: string | number | bigint | null | undefined) => (v === null || v === undefined ? null : Number(v))

export type LineInput = {
  kind: ChangeOrderLineKind
  description: string
  workPackageId?: string | null
  quantity?: string | null
  unit?: string | null
  unitPriceCents?: number | null
}
export type DraftInput = {
  reason: string
  scope: string
  scheduleImpact?: string | null
  hazards?: string | null
  resources?: string | null
  measurements?: string | null
  photoIds?: string[]
  affectedSteps?: AffectedStep[]
  lines: LineInput[]
}

type Resource = Parameters<typeof decide>[2]
const allowed = (
  actor: StaffActor,
  permission: 'change_order.draft' | 'change_order.publish' | 'change_order.capture_in_person_approval',
  resource: Resource = {},
) => decide(actor, permission, resource, { now: new Date(), online: true }).effect === 'allow'
/** An Estimator or the Owner: drafts any change order, reviews, reopens and withdraws (change_order.publish). */
export const isPublisher = (actor: StaffActor) => allowed(actor, 'change_order.publish')

/** The job's current approved scope: its latest scope snapshot. */
export async function baseSnapshot(db: Reader, jobId: string) {
  return db
    .selectFrom('work.job_scope_snapshots')
    .select(['id', 'version', 'total_cents', 'estimate_version_id', 'approval_id'])
    .where('job_id', '=', jobId)
    .orderBy('version', 'desc')
    .limit(1)
    .executeTakeFirst()
}

/** Money the customer has paid on the job: payments not returned or voided (pending checks count, PROPOSED). */
async function paidCents(db: Reader, jobId: string): Promise<number> {
  const r = await sql<{ cents: string | null }>`
    SELECT sum(amount_cents)::text AS cents FROM finance.payments
     WHERE job_id = ${jobId} AND state NOT IN ('returned', 'voided')`.execute(db)
  return Number(r.rows[0]?.cents ?? 0)
}

type PackageSteps = { id: string; code: string; steps: { id: string; stage: number; text: string }[] }
async function packagesWithSteps(db: Reader, jobId: string): Promise<PackageSteps[]> {
  const rows = await db
    .selectFrom('work.work_packages as w')
    .innerJoin('catalog.services as s', 's.id', 'w.service_id')
    .leftJoin('catalog.sop_versions as v', 'v.id', 'w.sop_version_id')
    .select(['w.id', 's.code', 'v.content'])
    .where('w.job_id', '=', jobId)
    .orderBy('w.position')
    .execute()
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    steps: r.content
      ? sopSteps(r.content as unknown as SopContent).map((s) => ({
          id: s.id,
          stage: s.stage,
          text: (s.lines[0] ?? '').replace(/^- (\[ \] )?/, ''),
        }))
      : [],
  }))
}

export type VersionRow = {
  id: string
  change_order_id: string
  version: number
  state: string
  reason: string
  scope: string
  schedule_impact: string | null
  hazards: string | null
  resources: string | null
  measurements: string | null
  photo_ids: string[]
  affected_steps: unknown
  base_snapshot_id: string
  base_total_cents: string
  charges_cents: string | null
  credits_cents: string | null
  revised_total_cents: string | null
  drafted_by: string
  drafted_at: Date
  updated_by: string
  updated_at: Date
  reviewed_by: string | null
  reviewed_at: Date | null
  withdrawn_by: string | null
  withdrawn_at: Date | null
  withdraw_reason: string | null
  issued_by: string | null
  issued_at: Date | null
  content_sha256: string | null
  valid_until: Date | null
  validity_days: number | null
  validity_reason: string | null
  superseded_at: Date | null
  expired_at: Date | null
  decided_at: Date | null
  row_version: number
}

/** Every version's checklist steps, as the open ones make them wait (HH-WORK-07). */
export async function changeOrderWaitingSteps(db: Reader, jobId: string): Promise<Map<string, number[]>> {
  const rows = await db
    .selectFrom('work.change_order_versions as v')
    .innerJoin('work.change_orders as c', 'c.id', 'v.change_order_id')
    .select(['v.state', 'v.affected_steps', 'c.number'])
    .where('v.job_id', '=', jobId)
    .where('v.state', 'in', [...OPEN_CHANGE_ORDER_STATES])
    .execute()
  return waitingSteps(
    rows.map((r) => ({ state: r.state, number: r.number, affectedSteps: r.affected_steps as AffectedStep[] })),
  )
}

const pricingProblem = (p: ChangeOrderProblem): FieldError =>
  'line' in p ? field(`body.lines.${p.line}`, p.code) : field('body.lines', p.code)

/** Prices stored or proposed lines against the job's current approved total and the money paid. */
function price(lines: readonly LineInput[], baseTotal: number, paid: number) {
  return priceChangeOrder({
    lines: lines.map((l) => ({
      kind: l.kind,
      quantity: l.quantity ? parseQuantity(l.quantity) : null,
      unitPrice: l.unitPriceCents === null || l.unitPriceCents === undefined ? null : cents(l.unitPriceCents),
    })),
    baseTotal: cents(baseTotal),
    paid: cents(paid),
  })
}

/** Checks a draft's input against the job: lines, work packages, photos and checklist steps. */
async function checkDraft(db: Reader, jobId: string, input: DraftInput): Promise<void> {
  const errors: FieldError[] = []
  const packages = await packagesWithSteps(db, jobId)
  input.lines.forEach((l, i) => {
    if (l.quantity) {
      try {
        if (parseQuantity(l.quantity) <= 0) errors.push(field(`body.lines.${i}.quantity`, 'QUANTITY_NOT_POSITIVE'))
      } catch (e) {
        if (!(e instanceof MoneyError)) throw e
        errors.push(field(`body.lines.${i}.quantity`, e.code))
      }
    }
    if (l.workPackageId && !packages.some((p) => p.id === l.workPackageId))
      errors.push(field(`body.lines.${i}.workPackageId`, 'NOT_A_WORK_PACKAGE_OF_THE_JOB'))
  })
  for (const [i, s] of (input.affectedSteps ?? []).entries()) {
    const p = packages.find((x) => x.id === s.workPackageId)
    if (!p || !p.steps.some((x) => x.id === s.stepId))
      errors.push(field(`body.affectedSteps.${i}`, 'NOT_A_CHECKLIST_STEP_OF_THE_JOB'))
  }
  const photos = [...new Set(input.photoIds ?? [])]
  if (photos.length) {
    const found = await db
      .selectFrom('work.field_photos')
      .select('id')
      .where('id', 'in', photos)
      .where('job_id', '=', jobId)
      .where('state', '<>', 'rejected')
      .execute()
    if (found.length !== photos.length) errors.push(field('body.photoIds', 'NOT_A_PHOTO_OF_THE_JOB'))
  }
  if (errors.length) throw invalid(errors)
}

const text = (v: string | null | undefined) => (v?.trim() ? v.trim() : null)

/** Writes a draft's content and lines with the totals computed from them (NULL while a line is not priced). */
export async function writeDraft(
  tx: Tx,
  actor: StaffActor,
  versionId: string,
  jobId: string,
  input: DraftInput,
  rowVersion: number | null,
) {
  const base = await baseSnapshot(tx, jobId)
  if (!base) throw conflict('job', 'SCOPE_MISSING')
  const pricing = price(input.lines, Number(base.total_cents), await paidCents(tx, jobId))
  const content = {
    reason: input.reason.trim(),
    scope: input.scope.trim(),
    schedule_impact: text(input.scheduleImpact),
    hazards: text(input.hazards),
    resources: text(input.resources),
    measurements: text(input.measurements),
    photo_ids: [...new Set(input.photoIds ?? [])],
    affected_steps: JSON.stringify(
      [...new Map((input.affectedSteps ?? []).map((s) => [`${s.workPackageId}:${s.stepId}`, s])).values()].map((s) => ({
        workPackageId: s.workPackageId,
        stepId: s.stepId,
      })),
    ),
    base_snapshot_id: base.id,
    base_total_cents: Number(base.total_cents),
    charges_cents: pricing.totals?.charges ?? null,
    credits_cents: pricing.totals?.credits ?? null,
    revised_total_cents: pricing.totals?.revisedTotal ?? null,
    updated_by: actor.userId,
    updated_at: new Date(),
  }
  if (rowVersion !== null) {
    await tx.deleteFrom('work.change_order_lines').where('version_id', '=', versionId).execute()
    await tx
      .updateTable('work.change_order_versions')
      .set({ ...content, row_version: rowVersion + 1 })
      .where('id', '=', versionId)
      .execute()
  }
  if (input.lines.length)
    await tx
      .insertInto('work.change_order_lines')
      .values(
        input.lines.map((l, i) => ({
          version_id: versionId,
          position: i + 1,
          kind: l.kind,
          description: l.description.trim(),
          work_package_id: l.workPackageId ?? null,
          quantity_milli: l.quantity ? parseQuantity(l.quantity) : null,
          unit: text(l.unit),
          unit_price_cents: l.unitPriceCents ?? null,
          amount_cents: pricing.lineAmounts[i] ?? null,
        })),
      )
      .execute()
  return { pricing, content }
}

/** Locks the job and checks it takes change orders: its estimate was approved and the work is not complete. */
async function lockJob(tx: Tx, jobId: string) {
  const job = await tx
    .selectFrom('work.jobs as j')
    .innerJoin('crm.projects as p', 'p.id', 'j.project_id')
    .select(['j.id', 'j.project_id', 'j.operational_state', 'p.reference'])
    .where('j.id', '=', jobId)
    .forUpdate()
    .executeTakeFirst()
  if (!job) throw new ApiError('NOT_FOUND')
  if (!(CHANGE_ORDER_JOB_STATES as readonly string[]).includes(job.operational_state))
    throw conflict('job', 'JOB_NOT_OPEN_FOR_CHANGES')
  return job
}

/** A new change order with its first version, a draft. */
export async function createChangeOrder(
  tx: Tx,
  actor: StaffActor,
  jobId: string,
  input: DraftInput & { origin?: ChangeOrderOrigin },
) {
  const job = await lockJob(tx, jobId)
  // A worker's draft is always their proposal; an Estimator or the Owner names the origin.
  const origin: ChangeOrderOrigin = isPublisher(actor) ? (input.origin ?? 'estimator') : 'worker_proposal'
  if (!isPublisher(actor) && input.origin && input.origin !== 'worker_proposal')
    throw invalid([field('body.origin', 'WORKER_PROPOSAL_ONLY')])
  await checkDraft(tx, jobId, input)
  const last = await tx
    .selectFrom('work.change_orders')
    .select((eb) => eb.fn.max('number').as('n'))
    .where('project_id', '=', job.project_id)
    .executeTakeFirst()
  const order = await tx
    .insertInto('work.change_orders')
    .values({
      project_id: job.project_id,
      job_id: jobId,
      number: (last?.n ?? 0) + 1,
      origin,
      created_by: actor.userId,
    })
    .returning(['id', 'number'])
    .executeTakeFirstOrThrow()
  const base = await baseSnapshot(tx, jobId)
  if (!base) throw conflict('job', 'SCOPE_MISSING')
  const version = await tx
    .insertInto('work.change_order_versions')
    .values({
      change_order_id: order.id,
      job_id: jobId,
      project_id: job.project_id,
      version: 1,
      reason: input.reason.trim(),
      scope: input.scope.trim(),
      base_snapshot_id: base.id,
      base_total_cents: Number(base.total_cents),
      drafted_by: actor.userId,
      updated_by: actor.userId,
    })
    .returning(['id'])
    .executeTakeFirstOrThrow()
  await writeDraft(tx, actor, version.id, jobId, input, 1)
  return {
    changeOrderId: order.id,
    number: order.number,
    reference: `${job.reference}-C${order.number}`,
    versionId: version.id,
    origin,
    rowVersion: 2,
  }
}

export async function lockVersion(tx: Tx, changeOrderId: string) {
  const head = await tx
    .selectFrom('work.change_orders')
    .select(['id', 'job_id'])
    .where('id', '=', changeOrderId)
    .executeTakeFirst()
  if (!head) throw new ApiError('NOT_FOUND')
  const job = await lockJob(tx, head.job_id)
  const v = (await tx
    .selectFrom('work.change_order_versions')
    .selectAll()
    .where('change_order_id', '=', changeOrderId)
    .orderBy('version', 'desc')
    .limit(1)
    .forUpdate()
    .executeTakeFirstOrThrow()) as unknown as VersionRow
  return { job, v }
}

export const stale = (v: VersionRow) =>
  new ApiError('STALE_VERSION', { current: { version: v.row_version, values: { state: v.state } } })

/** Edits the open draft: its content and lines, priced again against the current approved total. */
export async function updateDraft(
  tx: Tx,
  actor: StaffActor,
  changeOrderId: string,
  input: DraftInput,
  expectedVersion: number,
) {
  const { job, v } = await lockVersion(tx, changeOrderId)
  if (v.row_version !== expectedVersion) throw stale(v)
  if (v.state !== 'draft') throw conflict('changeOrder', 'NOT_A_DRAFT')
  if (!isPublisher(actor) && v.drafted_by !== actor.userId) throw new ApiError('FORBIDDEN')
  await checkDraft(tx, job.id, input)
  await writeDraft(tx, actor, v.id, job.id, input, v.row_version)
  return { changeOrderId, versionId: v.id, state: 'draft', rowVersion: v.row_version + 1 }
}

/** review, reopen or withdraw the open version. */
/**
 * Prices a version's stored lines again now, against the job's current approved scope and the money paid: refused
 * when the approved scope changed since it was saved, when a line or the totals no longer hold, or when nothing is
 * priced. Used before review and before issuing.
 */
export async function repriceVersion(tx: Tx, jobId: string, v: VersionRow) {
  const lines = await tx
    .selectFrom('work.change_order_lines')
    .select(['kind', 'quantity_milli', 'unit_price_cents'])
    .where('version_id', '=', v.id)
    .orderBy('position')
    .execute()
  const base = await baseSnapshot(tx, jobId)
  if (!base) throw conflict('job', 'SCOPE_MISSING')
  if (base.id !== v.base_snapshot_id) throw conflict('changeOrder', 'APPROVED_SCOPE_CHANGED')
  const pricing = price(
    lines.map((l) => ({
      kind: l.kind as ChangeOrderLineKind,
      description: '',
      quantity: l.quantity_milli === null ? null : quantityToString(quantityFromMinor(Number(l.quantity_milli))),
      unitPriceCents: num(l.unit_price_cents),
    })),
    Number(base.total_cents),
    await paidCents(tx, jobId),
  )
  if (pricing.problems.length) throw new ApiError('CONFLICT', { fieldErrors: pricing.problems.map(pricingProblem) })
  const totals = pricing.totals as NonNullable<typeof pricing.totals>
  if (totals.charges === 0 && totals.credits === 0) throw conflict('body.lines', 'NO_LINES')
  if (totals.charges !== num(v.charges_cents) || totals.credits !== num(v.credits_cents))
    throw conflict('changeOrder', 'TOTALS_CHANGED')
  return { base, totals }
}

/** The events staff send on the open version; issuing has its own route (publish.ts). */
export const STAFF_EVENTS = ['review', 'reopen', 'withdraw'] as const
export type StaffEvent = (typeof STAFF_EVENTS)[number]

export async function changeOrderEvent(
  tx: Tx,
  actor: StaffActor,
  changeOrderId: string,
  event: StaffEvent,
  input: { reason?: string },
  expectedVersion: number,
) {
  const { job, v } = await lockVersion(tx, changeOrderId)
  if (v.row_version !== expectedVersion) throw stale(v)
  // Withdrawing one's own draft is the worker's; everything else is an Estimator's or the Owner's.
  const own = v.drafted_by === actor.userId && v.state === 'draft' && event === 'withdraw'
  if (!isPublisher(actor) && !own) throw new ApiError('FORBIDDEN')
  const pricingProblems: string[] = []
  if (event === 'review') await repriceVersion(tx, job.id, v)
  const t = transition(CHANGE_ORDER_MACHINE, { state: v.state as 'draft', version: v.row_version }, event, {
    actor: 'staff',
    expectedVersion: v.row_version,
    now: new Date(),
    facts: { pricingProblems, ...(input.reason !== undefined ? { reason: input.reason } : {}) },
  })
  if (!t.ok) {
    if (t.code === 'GUARD_FAILED')
      throw invalid(t.problems.map((p) => field(p.code === 'REASON_REQUIRED' ? 'body.reason' : 'changeOrder', p.code)))
    throw conflict('changeOrder', t.code)
  }
  const now = new Date()
  await tx
    .updateTable('work.change_order_versions')
    .set({
      state: t.to,
      row_version: v.row_version + 1,
      updated_by: actor.userId,
      updated_at: now,
      ...(event === 'review' ? { reviewed_by: actor.userId, reviewed_at: now } : {}),
      ...(event === 'withdraw'
        ? { withdrawn_by: actor.userId, withdrawn_at: now, withdraw_reason: (input.reason as string).trim() }
        : {}),
    })
    .where('id', '=', v.id)
    .execute()
  return { changeOrderId, versionId: v.id, state: t.to, rowVersion: v.row_version + 1 }
}

/** The job's change orders for staff: approved scope apart from proposed changes, with what the caller may do. */
export async function changeOrdersView(db: Reader, actor: StaffActor, jobId: string, resource: Resource) {
  const job = await db
    .selectFrom('work.jobs as j')
    .innerJoin('crm.projects as p', 'p.id', 'j.project_id')
    .select(['j.id', 'j.project_id', 'j.operational_state', 'p.reference'])
    .where('j.id', '=', jobId)
    .executeTakeFirst()
  if (!job) return null
  const base = await baseSnapshot(db, jobId)
  const paid = await paidCents(db, jobId)
  const orders = await db
    .selectFrom('work.change_orders')
    .selectAll()
    .where('job_id', '=', jobId)
    .orderBy('number')
    .execute()
  const versions = (await db
    .selectFrom('work.change_order_versions')
    .selectAll()
    .where('job_id', '=', jobId)
    .orderBy('version')
    .execute()) as unknown as VersionRow[]
  const lines = versions.length
    ? await db
        .selectFrom('work.change_order_lines')
        .selectAll()
        .where(
          'version_id',
          'in',
          versions.map((v) => v.id),
        )
        .orderBy('position')
        .execute()
    : []
  const staffIds = [
    ...new Set(versions.flatMap((v) => [v.drafted_by, v.updated_by, v.reviewed_by, v.withdrawn_by]).filter(Boolean)),
  ] as string[]
  const names = new Map(
    staffIds.length
      ? (
          await db
            .selectFrom('identity.staff_users')
            .select(['id', 'display_name'])
            .where('id', 'in', staffIds)
            .execute()
        ).map((r) => [r.id, r.display_name])
      : [],
  )
  const ref = (id: string | null) => (id ? { id, name: names.get(id) ?? null } : null)
  const publisher = isPublisher(actor)
  const open = (CHANGE_ORDER_JOB_STATES as readonly string[]).includes(job.operational_state)
  const photos = await db
    .selectFrom('work.field_photos')
    .select(['id', 'work_package_id', 'phase', 'area_label'])
    .where('job_id', '=', jobId)
    .where('state', '<>', 'rejected')
    .orderBy('uploaded_at')
    .execute()
  // The Owner's approval of each current version (TSK-0082): whether publishing needs it and the latest record.
  const now = new Date()
  const issuedNow = (v: VersionRow) => effectiveChangeOrderState(v.state, v.valid_until, now) === 'issued'
  const { publicationNeeds } = await import('./publish.js')
  const config = await loadConfig(db)
  const publication = new Map<
    string,
    {
      required: boolean
      reasons: string[]
      flags: string[]
      latest: { approvalId: string; state: string; rowVersion: number; comment: string | null } | null
    }
  >()
  // TSK-0082 part 2: the customer's decisions, and what an in-person approval of an open version needs.
  const { inPersonApproval } = await import('./approve.js')
  const decisions = await db
    .selectFrom('work.change_order_decisions as d')
    .leftJoin('identity.staff_users as u', 'u.id', 'd.captured_by')
    .leftJoin('work.job_scope_snapshots as s', 's.id', 'd.scope_snapshot_id')
    .select([
      'd.version_id',
      'd.decision',
      'd.method',
      'd.full_name',
      'd.reason',
      'd.code_channel',
      'd.created_at',
      'd.captured_by',
      'u.display_name',
      's.version as scope_version',
    ])
    .where('d.job_id', '=', jobId)
    .execute()
  const decisionOf = new Map(
    decisions.map((d) => [
      d.version_id,
      {
        kind: d.decision as 'approved' | 'rejected',
        method: d.method as 'portal' | 'in_person_code',
        fullName: d.full_name,
        reason: d.reason,
        codeChannel: d.code_channel as 'email' | 'sms' | null,
        capturedBy: d.captured_by ? { id: d.captured_by, name: d.display_name } : null,
        scopeVersion: d.scope_version ?? null,
        at: d.created_at.toISOString(),
      },
    ]),
  )
  const capture = open && allowed(actor, 'change_order.capture_in_person_approval', resource)
  const inPerson = new Map<string, Awaited<ReturnType<typeof inPersonApproval>>>()
  for (const o of orders) {
    const vs = versions.filter((v) => v.change_order_id === o.id)
    const current = vs[vs.length - 1] as VersionRow
    if (capture && issuedNow(current))
      inPerson.set(current.id, await inPersonApproval(db, current, jobId, job.project_id))
  }
  for (const o of orders) {
    const vs = versions.filter((v) => v.change_order_id === o.id)
    const current = vs[vs.length - 1] as VersionRow
    if (current.state !== 'reviewed' && current.state !== 'issued') continue
    const needs =
      current.state === 'reviewed'
        ? await publicationNeeds(db, config, current, job)
        : { required: false, reasons: [], flags: [] }
    const [latest] = await approvalsOf(db, actor, { type: 'change_order_version', id: current.id })
    publication.set(current.id, {
      ...needs,
      latest: latest
        ? { approvalId: latest.id, state: latest.state, rowVersion: latest.rowVersion, comment: latest.comment }
        : null,
    })
  }
  return {
    jobId,
    reference: job.reference,
    jobState: job.operational_state,
    approved: base ? { snapshotVersion: base.version, totalCents: Number(base.total_cents) } : null,
    paidCents: paid,
    packages: await packagesWithSteps(db, jobId),
    photos: photos.map((p) => ({
      id: p.id,
      workPackageId: p.work_package_id,
      phase: p.phase,
      areaLabel: p.area_label,
    })),
    changeOrders: orders.map((o) => {
      const vs = versions.filter((v) => v.change_order_id === o.id)
      const current = vs[vs.length - 1] as VersionRow
      const mine = current.drafted_by === actor.userId
      const draft = current.state === 'draft'
      const view = (v: VersionRow) => ({
        versionId: v.id,
        version: v.version,
        state: v.state,
        reason: v.reason,
        scope: v.scope,
        scheduleImpact: v.schedule_impact,
        hazards: v.hazards,
        resources: v.resources,
        measurements: v.measurements,
        photoIds: v.photo_ids,
        affectedSteps: v.affected_steps as AffectedStep[],
        base: { snapshotId: v.base_snapshot_id, totalCents: Number(v.base_total_cents) },
        chargesCents: num(v.charges_cents),
        creditsCents: num(v.credits_cents),
        revisedTotalCents: num(v.revised_total_cents),
        lines: lines
          .filter((l) => l.version_id === v.id)
          .map((l) => ({
            position: l.position,
            kind: l.kind as ChangeOrderLineKind,
            description: l.description,
            workPackageId: l.work_package_id,
            quantity: l.quantity_milli === null ? null : quantityToString(quantityFromMinor(Number(l.quantity_milli))),
            unit: l.unit,
            unitPriceCents: num(l.unit_price_cents),
            amountCents: num(l.amount_cents),
          })),
        draftedBy: ref(v.drafted_by),
        draftedAt: iso(v.drafted_at) as string,
        updatedAt: iso(v.updated_at) as string,
        reviewedBy: ref(v.reviewed_by),
        reviewedAt: iso(v.reviewed_at),
        withdrawnBy: ref(v.withdrawn_by),
        withdrawnAt: iso(v.withdrawn_at),
        withdrawReason: v.withdraw_reason,
        issuedBy: ref(v.issued_by),
        issuedAt: iso(v.issued_at),
        validUntil: iso(v.valid_until),
        validityReason: v.validity_reason,
        supersededAt: iso(v.superseded_at),
        expiredAt: iso(v.expired_at),
        decidedAt: iso(v.decided_at),
        customerDecision: decisionOf.get(v.id) ?? null,
        rowVersion: v.row_version,
      })
      return {
        changeOrderId: o.id,
        number: o.number,
        reference: `${job.reference}-C${o.number}`,
        origin: o.origin as ChangeOrderOrigin,
        createdAt: iso(o.created_at) as string,
        current: { ...view(current), state: effectiveChangeOrderState(current.state, current.valid_until, now) },
        ownerApproval: publication.get(current.id) ?? null,
        inPersonApproval: inPerson.get(current.id) ?? null,
        history: vs.slice(0, -1).map((v) => ({ version: v.version, state: v.state, updatedAt: iso(v.updated_at) })),
        actions: {
          edit: open && draft && (publisher || mine),
          review: open && publisher && draft,
          reopen: open && publisher && current.state === 'reviewed',
          withdraw:
            open && (draft || current.state === 'reviewed' || issuedNow(current)) && (publisher || (mine && draft)),
          issue: open && publisher && current.state === 'reviewed',
          requestOwnerApproval:
            open &&
            publisher &&
            current.state === 'reviewed' &&
            (publication.get(current.id)?.required ?? false) &&
            publication.get(current.id)?.latest?.state !== 'pending',
          revise:
            open &&
            publisher &&
            (REVISABLE_CHANGE_ORDER_STATES as readonly string[]).includes(
              effectiveChangeOrderState(current.state, current.valid_until, now),
            ),
          decideOwnerApproval:
            mayApprove(actor, job.project_id) && publication.get(current.id)?.latest?.state === 'pending',
          captureInPersonApproval: (inPerson.get(current.id) ?? null) !== null,
        },
      }
    }),
    actions: { create: open && allowed(actor, 'change_order.draft', resource), chooseOrigin: publisher },
  }
}
