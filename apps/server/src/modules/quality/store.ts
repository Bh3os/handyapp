// Quality reviews and punch items (TSK-0084; HH-QA-02, HH-QA-04, HH-QA-09, HH-FIN-05, T55, T56, ENT-QAInspection,
// ENT-PunchItem, OWN-DEC-64, OWN-DEC-109, RULE-SAFETY-GATES, RULE-SERVER-AUTHZ). Every write runs in the route's
// transaction under the job's row lock (then the review's, then the item's), so the review, its items, the job's
// operational state and the queue move together; migration 0082 refuses anything else whatever path writes.
// - A job awaiting quality review gets its review (pending) and an Owner Decisions item (openQualityReview, called
//   where the job enters ready_for_qa: TSK-0083's Finished; the review screen opens a missing one too).
// - The Owner starts the review, adds punch items, and decides it with a result for each of the four areas: no punch
//   item and every area ok passes it (the job becomes operationally complete); punch items ask for punch work.
// - Assigned workers record the correction; the Owner re-checks each item. When every item is corrected the review
//   waits for its re-check; a failed re-check reopens the item; the last passed re-check passes the review.
// - The final invoice reads finance.invoice_quality_gate (0082): nothing in invoicing changes here.
import type { Db, Tx } from '@handyhub/db'
import {
  PUNCH_ITEM_MACHINE,
  QUALITY_REVIEW_AREAS,
  QUALITY_REVIEW_MACHINE,
  qualityGateOf,
  severityOf,
  transition,
  type AreaResult,
  type PunchItemEvent,
  type PunchItemFacts,
  type PunchItemKind,
  type PunchItemState,
  type PunchSeverity,
  type QualityReviewArea,
  type QualityReviewEvent,
  type QualityReviewFacts,
  type QualityReviewState,
} from '@handyhub/domain'
import { decide, type Action, type StaffActor } from '@handyhub/policy'
import { sql } from 'kysely'
import { ApiError, type FieldError } from '../../api/errors.js'
import { loadConfig } from '../../platform/config/index.js'
import { openQueueItem, resolveQueueItem } from '../queue/items.js'

type Reader = Db | Tx

const field = (f: string, code: string): FieldError => ({ field: f, code, message: '' })
const conflict = (f: string, code: string) => new ApiError('CONFLICT', { fieldErrors: [field(f, code)] })
const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null)
const dateText = (d: Date | string): string => (typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10))

export const allows = (actor: StaffActor, action: Action, resource: Parameters<typeof decide>[2] = {}) =>
  decide(actor, action, resource, { now: new Date(), online: true }).effect === 'allow'

export type ReviewRow = {
  id: string
  job_id: string
  project_id: string
  state: QualityReviewState
  reviewer_id: string | null
  self_review: boolean
  scope_result: AreaResult | null
  checklist_result: AreaResult | null
  evidence_result: AreaResult | null
  walkthrough_result: AreaResult | null
  note: string | null
  created_at: Date
  started_at: Date | null
  decided_at: Date | null
  passed_at: Date | null
  version: number
}
const REVIEW_COLUMNS = [
  'id',
  'job_id',
  'project_id',
  'state',
  'reviewer_id',
  'self_review',
  'scope_result',
  'checklist_result',
  'evidence_result',
  'walkthrough_result',
  'note',
  'created_at',
  'started_at',
  'decided_at',
  'passed_at',
  'version',
] as const

export type PunchRow = {
  id: string
  review_id: string
  job_id: string
  project_id: string
  work_package_id: string | null
  area: string | null
  kind: PunchItemKind
  severity: PunchSeverity
  description: string
  required_evidence: string
  assigned_to: string
  due_on: string | Date
  hold_id: string | null
  state: PunchItemState
  created_by: string
  created_at: Date
  correction_note: string | null
  corrected_by: string | null
  corrected_at: Date | null
  recheck_note: string | null
  rechecked_by: string | null
  rechecked_at: Date | null
  version: number
}
const PUNCH_COLUMNS = [
  'id',
  'review_id',
  'job_id',
  'project_id',
  'work_package_id',
  'area',
  'kind',
  'severity',
  'description',
  'required_evidence',
  'assigned_to',
  'due_on',
  'hold_id',
  'state',
  'created_by',
  'created_at',
  'correction_note',
  'corrected_by',
  'corrected_at',
  'recheck_note',
  'rechecked_by',
  'rechecked_at',
  'version',
] as const

async function lockJob(tx: Tx, jobId: string) {
  const job = await tx
    .selectFrom('work.jobs as j')
    .innerJoin('crm.projects as p', 'p.id', 'j.project_id')
    .select(['j.id', 'j.project_id', 'j.operational_state', 'j.version', 'p.reference'])
    .where('j.id', '=', jobId)
    .forUpdate('j')
    .executeTakeFirst()
  if (!job) throw new ApiError('NOT_FOUND')
  return job
}

export async function readReview(db: Reader, jobId: string): Promise<ReviewRow | null> {
  const r = await db.selectFrom('quality.reviews').select(REVIEW_COLUMNS).where('job_id', '=', jobId).executeTakeFirst()
  return (r as ReviewRow | undefined) ?? null
}
async function lockReview(tx: Tx, jobId: string): Promise<ReviewRow | null> {
  const r = await tx
    .selectFrom('quality.reviews')
    .select(REVIEW_COLUMNS)
    .where('job_id', '=', jobId)
    .forUpdate()
    .executeTakeFirst()
  return (r as ReviewRow | undefined) ?? null
}

async function itemsOf(db: Reader, reviewId: string): Promise<PunchRow[]> {
  return (await db
    .selectFrom('quality.punch_items')
    .select(PUNCH_COLUMNS)
    .where('review_id', '=', reviewId)
    .orderBy('created_at')
    .orderBy('id')
    .execute()) as PunchRow[]
}

async function counts(db: Reader, reviewId: string) {
  const items = await itemsOf(db, reviewId)
  return {
    items: items.length,
    openItems: items.filter((i) => i.state === 'open').length,
    unrechecked: items.filter((i) => i.state !== 'rechecked').length,
  }
}

async function recordEvent(
  tx: Tx,
  e: {
    reviewId: string
    itemId?: string
    event: string
    from: string | null
    to: string
    actor: string
    note?: string
  },
) {
  await tx
    .insertInto('quality.review_events')
    .values({
      review_id: e.reviewId,
      punch_item_id: e.itemId ?? null,
      event: e.event,
      from_state: e.from,
      to_state: e.to,
      actor_id: e.actor,
      note: e.note?.trim() ? e.note.trim() : null,
    })
    .execute()
}

/** Applies a review event (the domain table first), writes the row and its history; the job follows a pass. */
async function moveReview(
  tx: Tx,
  actor: StaffActor,
  r: ReviewRow,
  event: QualityReviewEvent,
  facts: QualityReviewFacts,
  set: Record<string, unknown> = {},
  note?: string,
): Promise<ReviewRow> {
  const auto = event === 'corrections_done' || event === 'recheck_complete' || event === 'punch_reopened'
  const t = transition(QUALITY_REVIEW_MACHINE, r, event, {
    actor: auto ? 'system' : 'staff',
    expectedVersion: r.version,
    now: new Date(),
    facts,
  })
  if (!t.ok) throw refusal('review', t)
  const row = (await tx
    .updateTable('quality.reviews')
    .set({
      ...set,
      state: t.to,
      version: t.version,
      ...(t.to === 'passed' ? { passed_at: sql<Date>`now()` } : {}),
    })
    .where('id', '=', r.id)
    .returning(REVIEW_COLUMNS)
    .executeTakeFirstOrThrow()) as ReviewRow
  await recordEvent(tx, {
    reviewId: r.id,
    event,
    from: r.state,
    to: t.to,
    actor: actor.userId,
    ...(note ? { note } : {}),
  })
  if (t.to === 'passed') {
    // HH-QA-09: the job becomes operationally complete when the Owner's review passes.
    const job = await lockJob(tx, r.job_id)
    await tx
      .updateTable('work.jobs')
      .set({ operational_state: 'operationally_complete', version: job.version + 1 })
      .where('id', '=', r.job_id)
      .execute()
  }
  await syncQueue(tx, row)
  return row
}

function refusal(subject: string, t: { code: string; problems?: readonly { code: string }[] }): ApiError {
  if (t.code === 'GUARD_FAILED' && t.problems?.length)
    return new ApiError('CONFLICT', { fieldErrors: t.problems.map((p) => field(subject, p.code)) })
  if (t.code === 'STALE_VERSION') return new ApiError('STALE_VERSION')
  return conflict(subject, t.code === 'INVALID_TRANSITION' ? 'INVALID_STATE' : t.code)
}

/** The business day's end of a due date in the business time zone (null while the zone is NOT CONFIGURED). */
async function dueInstant(db: Reader, due: string): Promise<Date | null> {
  const zone = (await loadConfig(db)).get('business.timezone')
  if (zone.state !== 'CONFIGURED') return null
  const r = await sql<{
    at: Date
  }>`SELECT ((${due}::date + 1)::timestamp AT TIME ZONE ${zone.value.zone}) AS at`.execute(db)
  return r.rows[0]?.at ? new Date(r.rows[0].at) : null
}

/**
 * The queue items of a review: the Owner's quality_review item while the review waits on the Owner (pending, in
 * review, or every item corrected and waiting for its re-check), and one punch_items item per job while any item is
 * not re-checked, due on the earliest due date (HH-QA-04).
 */
async function syncQueue(tx: Tx, r: ReviewRow) {
  const job = await tx
    .selectFrom('crm.projects')
    .select('reference')
    .where('id', '=', r.project_id)
    .executeTakeFirstOrThrow()
  if (r.state === 'pending' || r.state === 'in_review' || r.state === 'pending_recheck')
    await openQueueItem(tx, {
      type: 'quality_review',
      subjectId: r.job_id,
      reason: r.state === 'pending_recheck' ? 'recheck_due' : 'awaiting_quality_review',
      projectId: r.project_id,
      reference: job.reference,
      status: r.state,
      openedAt: r.created_at,
    })
  else await resolveQueueItem(tx, { type: 'quality_review', subjectId: r.job_id, resolution: r.state })
  const items = (await itemsOf(tx, r.id)).filter((i) => i.state !== 'rechecked')
  if (items.length === 0) {
    await resolveQueueItem(tx, { type: 'punch_items', subjectId: r.job_id, resolution: 'rechecked' })
    return
  }
  const first = [...items].sort((a, b) => dateText(a.due_on).localeCompare(dateText(b.due_on)))[0] as PunchRow
  await openQueueItem(tx, {
    type: 'punch_items',
    subjectId: r.job_id,
    reason: items.some((i) => i.state === 'open') ? 'punch_items_open' : 'punch_items_corrected',
    projectId: r.project_id,
    reference: job.reference,
    status: r.state,
    assignedStaffId: first.assigned_to,
    dueAt: await dueInstant(tx, dateText(first.due_on)),
  })
}

/**
 * Opens the review of a job awaiting quality review: the pending review (once) and the Owner Decisions item. For the
 * worker's Finished (TSK-0083), in its transaction; the review screen calls it too.
 */
export async function openQualityReview(tx: Tx, jobId: string): Promise<ReviewRow> {
  if (!tx.isTransaction) throw new Error('openQualityReview runs inside the business transaction (withTx)')
  const job = await lockJob(tx, jobId)
  const existing = await lockReview(tx, jobId)
  if (existing) return existing
  if (job.operational_state !== 'ready_for_qa') throw conflict('job', 'JOB_NOT_AWAITING_REVIEW')
  const row = (await tx
    .insertInto('quality.reviews')
    .values({ job_id: jobId, project_id: job.project_id })
    .returning(REVIEW_COLUMNS)
    .executeTakeFirstOrThrow()) as ReviewRow
  await syncQueue(tx, row)
  return row
}

/** The Owner starts the review (pending -> in_review); the database marks self-review. */
export async function startReview(tx: Tx, actor: StaffActor, jobId: string): Promise<ReviewRow> {
  const r = await openQualityReview(tx, jobId)
  if (r.state !== 'pending') throw conflict('review', 'REVIEW_ALREADY_STARTED')
  return moveReview(tx, actor, r, 'start', {}, { reviewer_id: actor.userId, started_at: sql<Date>`now()` })
}

export type PunchInput = {
  kind: PunchItemKind
  description: string
  requiredEvidence: string
  assignedTo: string
  dueOn: string
  workPackageId?: string
  area?: string
  holdId?: string
}

/** The Owner records a punch item on a review being worked (in review, punch work, or waiting for re-check). */
export async function addPunchItem(tx: Tx, actor: StaffActor, jobId: string, input: PunchInput) {
  await lockJob(tx, jobId)
  const r = await lockReview(tx, jobId)
  if (!r || !['in_review', 'punch_required', 'pending_recheck'].includes(r.state))
    throw conflict('review', 'REVIEW_NOT_IN_PROGRESS')
  if (!input.workPackageId && !input.area?.trim()) throw conflict('body.area', 'PLACE_REQUIRED')
  if (input.workPackageId) {
    const wp = await tx
      .selectFrom('work.work_packages')
      .select('id')
      .where('id', '=', input.workPackageId)
      .where('job_id', '=', jobId)
      .executeTakeFirst()
    if (!wp) throw conflict('body.workPackageId', 'NOT_A_WORK_PACKAGE_OF_THE_JOB')
  }
  if (!(await activeWorkers(tx)).some((w) => w.id === input.assignedTo))
    throw conflict('body.assignedTo', 'NOT_AN_ACTIVE_WORKER')
  const safety = input.kind === 'safety_concern'
  if (safety !== Boolean(input.holdId))
    throw conflict('body.holdId', safety ? 'SAFETY_HOLD_REQUIRED' : 'HOLD_ONLY_FOR_SAFETY_CONCERN')
  if (input.holdId && !(await openSafetyHolds(tx, jobId)).some((h) => h.id === input.holdId))
    throw conflict('body.holdId', 'NOT_AN_OPEN_SAFETY_HOLD_OF_THE_JOB')
  const item = (await tx
    .insertInto('quality.punch_items')
    .values({
      review_id: r.id,
      job_id: r.job_id,
      project_id: r.project_id,
      work_package_id: input.workPackageId ?? null,
      area: input.area?.trim() ? input.area.trim() : null,
      kind: input.kind,
      severity: severityOf(input.kind),
      description: input.description.trim(),
      required_evidence: input.requiredEvidence.trim(),
      assigned_to: input.assignedTo,
      due_on: input.dueOn,
      hold_id: input.holdId ?? null,
      created_by: actor.userId,
    })
    .returning(PUNCH_COLUMNS)
    .executeTakeFirstOrThrow()) as PunchRow
  await recordEvent(tx, {
    reviewId: r.id,
    itemId: item.id,
    event: 'punch_added',
    from: null,
    to: 'open',
    actor: actor.userId,
  })
  const review =
    r.state === 'pending_recheck' ? await moveReview(tx, actor, r, 'punch_reopened', await counts(tx, r.id)) : r
  if (review === r) await syncQueue(tx, r)
  return { item, review }
}

/** The Owner decides the review with a result for every area: passed, or punch work when punch items were found. */
export async function decideReview(
  tx: Tx,
  actor: StaffActor,
  jobId: string,
  expectedVersion: number,
  input: { results: Record<QualityReviewArea, AreaResult>; note?: string },
): Promise<ReviewRow> {
  await lockJob(tx, jobId)
  const r = await lockReview(tx, jobId)
  if (!r) throw conflict('review', 'REVIEW_NOT_IN_PROGRESS')
  if (r.version !== expectedVersion)
    throw new ApiError('STALE_VERSION', { current: { version: r.version, values: { state: r.state } } })
  const c = await counts(tx, r.id)
  const event: QualityReviewEvent = c.items > 0 ? 'require_punch' : 'pass'
  const set: Record<string, unknown> = {
    decided_at: sql<Date>`now()`,
    note: input.note?.trim() ? input.note.trim() : null,
  }
  for (const a of QUALITY_REVIEW_AREAS) set[`${a}_result`] = input.results[a]
  return moveReview(tx, actor, r, event, { ...c, results: input.results }, set, input.note)
}

async function lockItem(tx: Tx, itemId: string, expected: number): Promise<PunchRow> {
  const head = await tx.selectFrom('quality.punch_items').select('job_id').where('id', '=', itemId).executeTakeFirst()
  if (!head) throw new ApiError('NOT_FOUND')
  await lockJob(tx, head.job_id)
  await lockReview(tx, head.job_id)
  const i = (await tx
    .selectFrom('quality.punch_items')
    .select(PUNCH_COLUMNS)
    .where('id', '=', itemId)
    .forUpdate()
    .executeTakeFirstOrThrow()) as PunchRow
  if (i.version !== expected)
    throw new ApiError('STALE_VERSION', { current: { version: i.version, values: { state: i.state } } })
  return i
}

async function moveItem(
  tx: Tx,
  actor: StaffActor,
  i: PunchRow,
  event: PunchItemEvent,
  facts: PunchItemFacts,
  set: Record<string, unknown>,
): Promise<PunchRow> {
  const t = transition(PUNCH_ITEM_MACHINE, i, event, {
    actor: 'staff',
    expectedVersion: i.version,
    now: new Date(),
    facts,
  })
  if (!t.ok) throw refusal('punchItem', t)
  const row = (await tx
    .updateTable('quality.punch_items')
    .set({ ...set, state: t.to, version: t.version })
    .where('id', '=', i.id)
    .returning(PUNCH_COLUMNS)
    .executeTakeFirstOrThrow()) as PunchRow
  await recordEvent(tx, {
    reviewId: i.review_id,
    itemId: i.id,
    event,
    from: i.state,
    to: t.to,
    actor: actor.userId,
    ...(facts.note ? { note: facts.note } : {}),
  })
  return row
}

/** The review's next state once its items moved: waiting for re-check, back to punch work, or passed. */
async function followItems(tx: Tx, actor: StaffActor, jobId: string): Promise<ReviewRow> {
  const r = (await lockReview(tx, jobId)) as ReviewRow
  const c = await counts(tx, r.id)
  if (r.state === 'punch_required' && c.openItems === 0) return moveReview(tx, actor, r, 'corrections_done', c)
  if (r.state === 'pending_recheck' && c.openItems > 0) return moveReview(tx, actor, r, 'punch_reopened', c)
  if (r.state === 'pending_recheck' && c.unrechecked === 0) return moveReview(tx, actor, r, 'recheck_complete', c)
  await syncQueue(tx, r)
  return r
}

/** The assigned worker records the correction and its evidence (open -> corrected). */
export async function correctPunchItem(
  tx: Tx,
  actor: StaffActor,
  itemId: string,
  expected: number,
  note: string,
): Promise<{ item: PunchRow; review: ReviewRow }> {
  const i = await lockItem(tx, itemId, expected)
  if (i.assigned_to !== actor.userId) throw new ApiError('FORBIDDEN')
  const item = await moveItem(
    tx,
    actor,
    i,
    'correct',
    { note },
    {
      correction_note: note.trim(),
      corrected_by: actor.userId,
      corrected_at: sql<Date>`now()`,
    },
  )
  return { item, review: await followItems(tx, actor, i.job_id) }
}

/** The Owner re-checks a corrected item: passed (rechecked), or failed (open again, the correction cleared). */
export async function recheckPunchItem(
  tx: Tx,
  actor: StaffActor,
  itemId: string,
  expected: number,
  input: { passed: boolean; note: string },
): Promise<{ item: PunchRow; review: ReviewRow }> {
  const i = await lockItem(tx, itemId, expected)
  const r = (await readReview(tx, i.job_id)) as ReviewRow
  let holdResolved: boolean | null = null
  if (i.hold_id) {
    const h = await tx.selectFrom('work.holds').select('state').where('id', '=', i.hold_id).executeTakeFirstOrThrow()
    holdResolved = h.state === 'resolved'
  }
  const facts: PunchItemFacts = {
    note: input.note,
    holdResolved,
    recheckerCorrected: i.corrected_by === actor.userId,
    selfReview: r.self_review,
  }
  const item = input.passed
    ? await moveItem(tx, actor, i, 'recheck_pass', facts, {
        recheck_note: input.note.trim(),
        rechecked_by: actor.userId,
        rechecked_at: sql<Date>`now()`,
      })
    : await moveItem(tx, actor, i, 'recheck_fail', facts, {
        correction_note: null,
        corrected_by: null,
        corrected_at: null,
      })
  return { item, review: await followItems(tx, actor, i.job_id) }
}

export async function activeWorkers(db: Reader) {
  const rows = await db
    .selectFrom('identity.staff_users as s')
    .innerJoin('identity.role_grants as g', 'g.staff_user_id', 's.id')
    .select(['s.id', 's.display_name'])
    .where('g.kind', '=', 'role')
    .where('g.name', '=', 'worker')
    .where('g.ended_at', 'is', null)
    .where('s.status', '=', 'active')
    .distinct()
    .orderBy('s.display_name')
    .orderBy('s.id')
    .execute()
  return rows.map((r) => ({ id: r.id, name: r.display_name }))
}

async function openSafetyHolds(db: Reader, jobId: string) {
  const rows = await db
    .selectFrom('work.holds')
    .select(['id', 'category', 'state', 'raised_at'])
    .where('kind', '=', 'critical_safety')
    .where('scope_type', '=', 'job')
    .where('scope_id', '=', jobId)
    .where('state', 'in', ['open', 'under_review'])
    .orderBy('raised_at')
    .execute()
  return rows.map((h) => ({ id: h.id, category: h.category, state: h.state, raisedAt: iso(h.raised_at) as string }))
}

async function names(db: Reader, ids: (string | null)[]): Promise<Map<string, string | null>> {
  const want = [...new Set(ids.filter((x): x is string => x !== null))]
  if (!want.length) return new Map()
  const rows = await db
    .selectFrom('identity.staff_users')
    .select(['id', 'display_name'])
    .where('id', 'in', want)
    .execute()
  return new Map(rows.map((r) => [r.id, r.display_name]))
}

function itemView(i: PunchRow, n: Map<string, string | null>, actor: StaffActor, owner: boolean) {
  const ref = (id: string | null) => (id ? { id, name: n.get(id) ?? null } : null)
  return {
    id: i.id,
    workPackageId: i.work_package_id,
    area: i.area,
    kind: i.kind,
    severity: i.severity,
    description: i.description,
    requiredEvidence: i.required_evidence,
    assignedTo: ref(i.assigned_to),
    dueOn: dateText(i.due_on),
    holdId: i.hold_id,
    state: i.state,
    createdBy: ref(i.created_by),
    createdAt: iso(i.created_at) as string,
    correctionNote: i.correction_note,
    correctedBy: ref(i.corrected_by),
    correctedAt: iso(i.corrected_at),
    recheckNote: i.recheck_note,
    recheckedBy: ref(i.rechecked_by),
    recheckedAt: iso(i.rechecked_at),
    version: i.version,
    actions: {
      correct: i.state === 'open' && i.assigned_to === actor.userId,
      recheck: i.state === 'corrected' && owner,
    },
  }
}

/** The review screen of one job, for the Owner (quality.review). */
export async function reviewView(db: Reader, actor: StaffActor, jobId: string) {
  const job = await db
    .selectFrom('work.jobs as j')
    .innerJoin('crm.projects as p', 'p.id', 'j.project_id')
    .select(['j.id', 'j.project_id', 'j.operational_state', 'p.reference'])
    .where('j.id', '=', jobId)
    .executeTakeFirst()
  if (!job) return null
  const r = await readReview(db, jobId)
  const items = r ? await itemsOf(db, r.id) : []
  const events = r
    ? await db
        .selectFrom('quality.review_events')
        .select(['id', 'punch_item_id', 'event', 'from_state', 'to_state', 'actor_id', 'note', 'at'])
        .where('review_id', '=', r.id)
        .orderBy('seq')
        .execute()
    : []
  const packages = await db
    .selectFrom('work.work_packages as w')
    .innerJoin('catalog.services as s', 's.id', 'w.service_id')
    .select(['w.id', 's.code', 'w.position', 'w.state'])
    .where('w.job_id', '=', jobId)
    .orderBy('w.position')
    .execute()
  const snapshot = await db
    .selectFrom('work.job_scope_snapshots')
    .select(['version', 'lines', 'total_cents'])
    .where('job_id', '=', jobId)
    .orderBy('version', 'desc')
    .executeTakeFirst()
  const photos = await db
    .selectFrom('work.field_photos')
    .select(['phase', (eb) => eb.fn.countAll<string>().as('n')])
    .where('job_id', '=', jobId)
    .where('state', '<>', 'rejected')
    .groupBy('phase')
    .execute()
  const n = await names(db, [
    r?.reviewer_id ?? null,
    ...items.flatMap((i) => [i.assigned_to, i.created_by, i.corrected_by, i.rechecked_by]),
    ...events.map((e) => e.actor_id),
  ])
  const owner = allows(actor, 'quality.review', { projectId: job.project_id })
  const lines = Array.isArray(snapshot?.lines) ? (snapshot.lines as { description?: string | null }[]) : []
  const counted = (phase: string) => Number(photos.find((p) => p.phase === phase)?.n ?? 0)
  const state = r?.state ?? null
  const working = state === 'in_review' || state === 'punch_required' || state === 'pending_recheck'
  return {
    jobId: job.id,
    projectId: job.project_id,
    reference: job.reference,
    jobState: job.operational_state,
    review: r
      ? {
          state: r.state,
          reviewer: r.reviewer_id ? { id: r.reviewer_id, name: n.get(r.reviewer_id) ?? null } : null,
          selfReview: r.self_review,
          results: r.decided_at
            ? Object.fromEntries(QUALITY_REVIEW_AREAS.map((a) => [a, r[`${a}_result`] as AreaResult]))
            : null,
          note: r.note,
          startedAt: iso(r.started_at),
          decidedAt: iso(r.decided_at),
          passedAt: iso(r.passed_at),
          version: r.version,
        }
      : null,
    gate: qualityGateOf(
      state,
      items.filter((i) => i.state !== 'rechecked'),
    ),
    scope: snapshot
      ? {
          version: snapshot.version,
          totalCents: Number(snapshot.total_cents),
          lines: lines.flatMap((l) => (l.description ? [l.description] : [])),
        }
      : null,
    workPackages: packages.map((p) => ({ id: p.id, code: p.code, position: p.position, state: p.state })),
    evidence: { beforePhotos: counted('before'), afterPhotos: counted('after') },
    // Not recorded until TSK-0075 (the checklist) and TSK-0083 (the walkthrough) exist: the Owner reviews what is there.
    checklistRecorded: false,
    walkthroughRecorded: false,
    safetyHolds: await openSafetyHolds(db, jobId),
    workers: owner ? await activeWorkers(db) : [],
    punchItems: items.map((i) => itemView(i, n, actor, owner)),
    history: events.map((e) => ({
      event: e.event,
      punchItemId: e.punch_item_id,
      from: e.from_state,
      to: e.to_state,
      actor: { id: e.actor_id, name: n.get(e.actor_id) ?? null },
      note: e.note,
      at: iso(e.at) as string,
    })),
    actions: {
      start: owner && (state === null || state === 'pending') && job.operational_state === 'ready_for_qa',
      addPunchItem: owner && working,
      decide: owner && state === 'in_review',
    },
  }
}

/** A worker's own punch items on a job (the ones assigned to them), with the correction action. */
export async function ownPunchItems(db: Reader, actor: StaffActor, jobId: string) {
  const items = (await db
    .selectFrom('quality.punch_items')
    .select(PUNCH_COLUMNS)
    .where('job_id', '=', jobId)
    .where('assigned_to', '=', actor.userId)
    .orderBy('due_on')
    .orderBy('created_at')
    .execute()) as PunchRow[]
  const n = await names(
    db,
    items.flatMap((i) => [i.assigned_to, i.created_by, i.corrected_by, i.rechecked_by]),
  )
  return items.map((i) => itemView(i, n, actor, false))
}

/** The Owner's list: jobs awaiting quality review, and reviews with punch items still to re-check. */
export async function reviewList(db: Reader) {
  const rows = await db
    .selectFrom('work.jobs as j')
    .innerJoin('crm.projects as p', 'p.id', 'j.project_id')
    .leftJoin('quality.reviews as r', 'r.job_id', 'j.id')
    .select([
      'j.id',
      'j.operational_state',
      'p.reference',
      'r.state as review_state',
      'r.created_at as review_created_at',
      (eb) =>
        eb
          .selectFrom('quality.punch_items as i')
          .select((x) => x.fn.countAll<string>().as('n'))
          .whereRef('i.job_id', '=', 'j.id')
          .where('i.state', '<>', 'rechecked')
          .as('unrechecked'),
      (eb) =>
        eb
          .selectFrom('quality.punch_items as i')
          .select((x) => x.fn.countAll<string>().as('n'))
          .whereRef('i.job_id', '=', 'j.id')
          .where('i.state', '<>', 'rechecked')
          .where('i.severity', '=', 'major')
          .as('major'),
      (eb) =>
        eb
          .selectFrom('quality.punch_items as i')
          .select((x) => x.fn.min('i.due_on').as('d'))
          .whereRef('i.job_id', '=', 'j.id')
          .where('i.state', '<>', 'rechecked')
          .as('next_due'),
    ])
    .where((eb) =>
      eb.or([
        eb('j.operational_state', '=', 'ready_for_qa'),
        eb.exists(
          eb
            .selectFrom('quality.punch_items as i')
            .select('i.id')
            .whereRef('i.job_id', '=', 'j.id')
            .where('i.state', '<>', 'rechecked'),
        ),
      ]),
    )
    .orderBy('p.reference')
    .limit(200)
    .execute()
  return rows.map((r) => ({
    jobId: r.id,
    reference: r.reference,
    jobState: r.operational_state,
    reviewState: (r.review_state as QualityReviewState | null) ?? null,
    openPunchItems: Number(r.unrechecked ?? 0),
    majorPunchItems: Number(r.major ?? 0),
    nextDue: r.next_due ? dateText(r.next_due as string | Date) : null,
  }))
}
