// Return work records (TSK-0094; HH-QA-07, HH-QA-08, HH-FIN-17, T56, ENT-Case, ENT-Visit, ENT-Job, FACT-WARRANTY,
// OWN-DEC-124, OWN-DEC-135, RULE-HUMAN-REVIEW, RULE-MONEY-CENTS, RULE-SERVER-AUTHZ). Every write runs in the route's
// transaction under the case's row lock (then the return work's), so a classification, a decision and the case's own
// lifecycle never interleave:
// - classifying: people choose one of HH-QA-07's classes; the server applies only the decided warranty rule
//   (@handyhub/domain classifyReturnWork) from the reviewed completion date and the report date, both local dates in
//   the business time zone. Reclassifying keeps the history.
// - the Owner's decision: coverage and price with a note (case.triage). Nothing is applied automatically, no
//   exclusion exists, and a chargeable decision records no amount: the work is priced through its own estimate or
//   change order (RULE-NO-INVENTED-FACTS).
// - the work: a return visit (purpose return_work) of the original job, planned here or linked, or a return job of
//   another project of the same customer. The original job keeps its state, completion evidence and costs.
// - return-visit punch items: corrected by the assigned worker on a linked return visit they started through the gate,
//   re-checked by the Owner (never the corrector); costs in integer cents, voided once with a reason.
// Who may: the case's own handling rule (cases/store requireHandling: a complaint the Owner and Office, a restricted
// case the Owner only); decisions case.triage; items quality.manage_punch_items; corrections quality.correct_punch_item.
import type { Db, Tx } from '@handyhub/db'
import {
  apply,
  classifyReturnWork,
  isActiveCase,
  localDateOf,
  WARRANTY_DAYS,
  warrantyWindow,
  type CoverageDecision,
  type PriceDecision,
  type ReturnCostKind,
  type ReturnWorkClass,
  type WarrantyWindow,
} from '@handyhub/domain'
import type { DataScope, StaffActor } from '@handyhub/policy'
import { sql } from 'kysely'
import { ApiError, type FieldError } from '../../api/errors.js'
import { loadConfig } from '../../platform/config/index.js'
import { allows, lockedCase, readCase, requireHandling, seesDetail, type CaseRow } from '../cases/store.js'
import { visitTimes } from '../field/timestamps.js'
import { activeWorkers } from '../quality/store.js'
import { WORK_VISIT_GATES } from '../visits/gates.js'
import { businessZone, planVisit, type PlanningFacts, type WindowEntry } from '../visits/visits.js'

type Reader = Db | Tx

const field = (f: string, code: string): FieldError => ({ field: f, code, message: '' })
const conflict = (f: string, code: string) => new ApiError('CONFLICT', { fieldErrors: [field(f, code)] })
const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null)
const dateText = (d: Date | string | null): string | null =>
  d === null ? null : typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10)

export type ReturnWorkRow = {
  id: string
  case_id: string
  project_id: string
  job_id: string
  classification: ReturnWorkClass
  reviewed_completion_on: string | null
  reported_on: string
  within_warranty: boolean | null
  classification_note: string | null
  classified_by: string
  classified_at: Date
  coverage: CoverageDecision | null
  price: PriceDecision | null
  decision_note: string | null
  decided_by: string | null
  decided_at: Date | null
  return_job_id: string | null
  version: number
}

const COLUMNS = [
  'id',
  'case_id',
  'project_id',
  'job_id',
  'classification',
  'reviewed_completion_on',
  'reported_on',
  'within_warranty',
  'classification_note',
  'classified_by',
  'classified_at',
  'coverage',
  'price',
  'decision_note',
  'decided_by',
  'decided_at',
  'return_job_id',
  'version',
] as const

export async function returnWorkOfCase(db: Reader, caseId: string): Promise<ReturnWorkRow | null> {
  const r = await db.selectFrom('quality.return_work').select(COLUMNS).where('case_id', '=', caseId).executeTakeFirst()
  return (r as unknown as ReturnWorkRow | undefined) ?? null
}

export async function readReturnWork(db: Reader, id: string): Promise<ReturnWorkRow | null> {
  const r = await db.selectFrom('quality.return_work').select(COLUMNS).where('id', '=', id).executeTakeFirst()
  return (r as unknown as ReturnWorkRow | undefined) ?? null
}

/** The case under its row lock, then its return work under its own, at the version the caller saw. */
async function locked(
  tx: Tx,
  actor: StaffActor,
  returnWorkId: string,
  expected?: number,
): Promise<{ c: CaseRow; r: ReturnWorkRow }> {
  const first = await readReturnWork(tx, returnWorkId)
  if (!first) throw new ApiError('NOT_FOUND')
  const c = await lockedCase(tx, first.case_id)
  requireHandling(actor, c)
  const r = (await tx
    .selectFrom('quality.return_work')
    .select(COLUMNS)
    .where('id', '=', returnWorkId)
    .forUpdate()
    .executeTakeFirstOrThrow()) as unknown as ReturnWorkRow
  if (expected !== undefined && r.version !== expected)
    throw new ApiError('STALE_VERSION', {
      current: { version: r.version, values: { classification: r.classification } },
    })
  if (!isActiveCase(c.state)) throw conflict('state', 'CASE_CLOSED')
  return { c, r }
}

async function event(
  tx: Tx,
  r: { id: string },
  name: string,
  actorId: string,
  subjectId?: string | null,
  note?: string,
) {
  await tx
    .insertInto('quality.return_work_events')
    .values({
      return_work_id: r.id,
      event: name,
      subject_id: subjectId ?? null,
      actor_id: actorId,
      note: note?.trim() ? note.trim().slice(0, 1000) : null,
    })
    .execute()
}

async function bumpVersion(tx: Tx, r: ReturnWorkRow, set: Record<string, unknown> = {}): Promise<number> {
  const row = await tx
    .updateTable('quality.return_work')
    .set({ ...set, version: r.version + 1 })
    .where('id', '=', r.id)
    .returning('version')
    .executeTakeFirstOrThrow()
  return row.version
}

/** The case's job: the one it names, else its project's job (one job per approved project). */
async function originalJob(db: Reader, c: Pick<CaseRow, 'project_id' | 'job_id'>): Promise<string | null> {
  if (c.job_id) return c.job_id
  const j = await db.selectFrom('work.jobs').select('id').where('project_id', '=', c.project_id).executeTakeFirst()
  return j?.id ?? null
}

/** The warranty window of a case and the review state it reads (FACT-WARRANTY), in the business time zone. */
export async function windowOf(
  db: Reader,
  c: Pick<CaseRow, 'reported_at'>,
  jobId: string,
): Promise<{ window: WarrantyWindow; reviewPassed: boolean; reviewState: string | null }> {
  const { zone } = businessZone(await loadConfig(db))
  const review = await db
    .selectFrom('quality.reviews')
    .select(['state', 'passed_at'])
    .where('job_id', '=', jobId)
    .executeTakeFirst()
  const passedOn = review?.passed_at ? localDateOf(new Date(review.passed_at), zone) : null
  return {
    window: warrantyWindow(passedOn, localDateOf(new Date(c.reported_at), zone)),
    reviewPassed: review?.state === 'passed',
    reviewState: review?.state ?? null,
  }
}

// --- Classification and the Owner's decision -------------------------------------------------------------------

export type ClassifyInput = { classification: ReturnWorkClass; note?: string }

/** Classifies a case's return work, or reclassifies it (If-Match: 0 for none yet, else its version). */
export async function classify(tx: Tx, actor: StaffActor, caseId: string, expected: number, input: ClassifyInput) {
  const c = await lockedCase(tx, caseId)
  requireHandling(actor, c)
  if (!isActiveCase(c.state)) throw conflict('state', 'CASE_CLOSED')
  const jobId = await originalJob(tx, c)
  if (!jobId) throw conflict('case', 'NO_JOB')
  const existing = await returnWorkOfCase(tx, caseId)
  if ((existing?.version ?? 0) !== expected)
    throw new ApiError('STALE_VERSION', { current: { version: existing?.version ?? 0, values: {} } })
  const w = await windowOf(tx, c, jobId)
  const out = classifyReturnWork(input.classification, w)
  if (!out.ok) throw conflict('body.classification', out.code)
  const values = {
    classification: out.classification,
    reviewed_completion_on: w.window.reviewedCompletionOn,
    reported_on: w.window.reportedOn,
    within_warranty: w.window.within,
    classification_note: input.note?.trim() || null,
    classified_by: actor.userId,
    classified_at: sql<Date>`now()`,
  }
  if (!existing) {
    const row = await tx
      .insertInto('quality.return_work')
      .values({ case_id: c.id, project_id: c.project_id, job_id: jobId, ...values })
      .returning(['id', 'version'])
      .executeTakeFirstOrThrow()
    await event(
      tx,
      row,
      'classified',
      actor.userId,
      null,
      `${out.classification}${input.note ? `: ${input.note}` : ''}`,
    )
    return { id: row.id, version: row.version, classification: out.classification, case: c }
  }
  const r = (await tx
    .selectFrom('quality.return_work')
    .select(COLUMNS)
    .where('id', '=', existing.id)
    .forUpdate()
    .executeTakeFirstOrThrow()) as unknown as ReturnWorkRow
  const version = await bumpVersion(tx, r, values)
  await event(tx, r, 'reclassified', actor.userId, null, `${out.classification}${input.note ? `: ${input.note}` : ''}`)
  return { id: r.id, version, classification: out.classification, case: c }
}

export type DecisionInput = { coverage: CoverageDecision; price: PriceDecision; note: string }

/** The Owner's coverage and price decision (RULE-HUMAN-REVIEW); a later decision replaces it, kept in the history. */
export async function decide(tx: Tx, actor: StaffActor, id: string, expected: number, input: DecisionInput) {
  const { c, r } = await locked(tx, actor, id, expected)
  if (!allows(actor, 'case.triage', { projectId: c.project_id })) throw new ApiError('FORBIDDEN')
  const version = await bumpVersion(tx, r, {
    coverage: input.coverage,
    price: input.price,
    decision_note: input.note.trim(),
    decided_by: actor.userId,
    decided_at: sql<Date>`now()`,
  })
  await event(tx, r, 'decided', actor.userId, null, `${input.coverage}, ${input.price}: ${input.note}`)
  return { r, version, case: c }
}

// --- The work: return visits and a return job ------------------------------------------------------------------

export type ReturnVisitInput = PlanningFacts & WindowEntry

/** Plans a tentative return visit (purpose return_work) of the original job and links it. */
export async function planReturnVisit(
  tx: Tx,
  actor: StaffActor,
  scope: DataScope,
  id: string,
  input: ReturnVisitInput,
  now: Date,
) {
  const { c, r } = await locked(tx, actor, id)
  const planned = await planVisit(
    tx,
    actor,
    scope,
    r.project_id,
    { ...input, purpose: 'return_work' },
    {
      gates: WORK_VISIT_GATES,
      now,
    },
  )
  await linkVisitRow(tx, actor, r, planned.id)
  return { r, visitId: planned.id, version: await bumpVersion(tx, r), case: c }
}

/** Links a return visit already planned on the original job (purpose return_work). */
export async function linkReturnVisit(tx: Tx, actor: StaffActor, id: string, visitId: string) {
  const { c, r } = await locked(tx, actor, id)
  const v = await tx
    .selectFrom('work.visits')
    .select(['id', 'purpose', 'job_id'])
    .where('id', '=', visitId)
    .executeTakeFirst()
  if (!v || v.job_id !== r.job_id)
    throw new ApiError('VALIDATION_FAILED', { fieldErrors: [field('body.visitId', 'unknown_visit')] })
  if (v.purpose !== 'return_work') throw conflict('body.visitId', 'NOT_A_RETURN_VISIT')
  const linked = await tx
    .selectFrom('quality.return_work_visits')
    .select('return_work_id')
    .where('visit_id', '=', visitId)
    .executeTakeFirst()
  if (linked) throw conflict('body.visitId', 'VISIT_ALREADY_LINKED')
  await linkVisitRow(tx, actor, r, visitId)
  return { r, visitId, version: await bumpVersion(tx, r), case: c }
}

async function linkVisitRow(tx: Tx, actor: StaffActor, r: ReturnWorkRow, visitId: string) {
  await tx
    .insertInto('quality.return_work_visits')
    .values({ visit_id: visitId, return_work_id: r.id, linked_by: actor.userId })
    .execute()
  await event(tx, r, 'visit_linked', actor.userId, visitId)
}

/** Links a return job: a job of another project of the same customer (null unlinks it). */
export async function linkReturnJob(tx: Tx, actor: StaffActor, id: string, expected: number, jobId: string | null) {
  const { c, r } = await locked(tx, actor, id, expected)
  if (jobId !== null) {
    const own = await tx
      .selectFrom('crm.projects')
      .select('customer_id')
      .where('id', '=', r.project_id)
      .executeTakeFirstOrThrow()
    const ok = await tx
      .selectFrom('work.jobs as j')
      .innerJoin('crm.projects as p', 'p.id', 'j.project_id')
      .select('j.id')
      .where('j.id', '=', jobId)
      .where('p.customer_id', '=', own.customer_id)
      .where('p.id', '<>', r.project_id)
      .executeTakeFirst()
    if (!ok) throw conflict('body.jobId', 'NOT_A_RETURN_JOB')
  }
  const version = await bumpVersion(tx, r, { return_job_id: jobId })
  await event(tx, r, jobId ? 'job_linked' : 'job_unlinked', actor.userId, jobId ?? r.return_job_id)
  return { r, version, case: c }
}

// --- Return-visit punch items ----------------------------------------------------------------------------------

export type ItemInput = {
  workPackageId?: string
  area?: string
  description: string
  requiredEvidence: string
  assignedTo: string
  dueOn: string
}

export async function addItem(tx: Tx, actor: StaffActor, id: string, input: ItemInput) {
  const { c, r } = await locked(tx, actor, id)
  if (!allows(actor, 'quality.manage_punch_items', { projectId: c.project_id })) throw new ApiError('FORBIDDEN')
  if (!input.workPackageId && !input.area?.trim()) throw conflict('body.area', 'PLACE_REQUIRED')
  if (input.workPackageId) {
    const p = await tx
      .selectFrom('work.work_packages')
      .select('id')
      .where('id', '=', input.workPackageId)
      .where('job_id', '=', r.job_id)
      .executeTakeFirst()
    if (!p) throw conflict('body.workPackageId', 'NOT_A_WORK_PACKAGE_OF_THE_JOB')
  }
  if (!(await activeWorkers(tx)).some((w) => w.id === input.assignedTo))
    throw conflict('body.assignedTo', 'NOT_AN_ACTIVE_WORKER')
  const row = await tx
    .insertInto('quality.return_work_items')
    .values({
      return_work_id: r.id,
      job_id: r.job_id,
      project_id: r.project_id,
      work_package_id: input.workPackageId ?? null,
      area: input.area?.trim() || null,
      description: input.description.trim(),
      required_evidence: input.requiredEvidence.trim(),
      assigned_to: input.assignedTo,
      due_on: input.dueOn,
      created_by: actor.userId,
    })
    .returning(['id', 'version'])
    .executeTakeFirstOrThrow()
  await event(tx, r, 'item_added', actor.userId, row.id)
  return { r, itemId: row.id, version: row.version, case: c }
}

type ItemRow = {
  id: string
  return_work_id: string
  job_id: string
  project_id: string
  state: string
  assigned_to: string
  corrected_by: string | null
  version: number
}

export async function itemOf(db: Reader, itemId: string) {
  return db
    .selectFrom('quality.return_work_items as i')
    .innerJoin('quality.return_work as r', 'r.id', 'i.return_work_id')
    .select(['i.id', 'i.project_id', 'i.job_id', 'r.case_id', 'i.assigned_to'])
    .where('i.id', '=', itemId)
    .executeTakeFirst()
}

async function lockedItem(tx: Tx, itemId: string, expected: number): Promise<ItemRow> {
  const i = (await tx
    .selectFrom('quality.return_work_items')
    .select(['id', 'return_work_id', 'job_id', 'project_id', 'state', 'assigned_to', 'corrected_by', 'version'])
    .where('id', '=', itemId)
    .forUpdate()
    .executeTakeFirst()) as ItemRow | undefined
  if (!i) throw new ApiError('NOT_FOUND')
  if (i.version !== expected)
    throw new ApiError('STALE_VERSION', { current: { version: i.version, values: { state: i.state } } })
  return i
}

/** The linked return visits the worker started work on through the gate and is on now (arrived). */
async function correctionVisit(db: Reader, returnWorkId: string, staffUserId: string): Promise<string | null> {
  const v = await db
    .selectFrom('quality.return_work_visits as l')
    .innerJoin('work.visits as v', 'v.id', 'l.visit_id')
    .innerJoin('work.work_starts as s', (j) =>
      j.onRef('s.visit_id', '=', 'v.id').on('s.staff_user_id', '=', staffUserId),
    )
    .select('v.id')
    .where('l.return_work_id', '=', returnWorkId)
    .where('v.state', '=', 'arrived')
    .orderBy('s.started_at', 'desc')
    .executeTakeFirst()
  return v?.id ?? null
}

const machineRefusal = (t: { code: string; problems?: readonly { code: string }[] }) =>
  new ApiError('CONFLICT', {
    fieldErrors: (t.problems?.length ? t.problems : [{ code: t.code }]).map((p) => field('state', p.code)),
  })

/** The assigned worker records the correction on a linked return visit they started (open -> corrected). */
export async function correctItem(tx: Tx, actor: StaffActor, itemId: string, expected: number, note: string) {
  const first = await itemOf(tx, itemId)
  if (!first) throw new ApiError('NOT_FOUND')
  const c = await lockedCase(tx, first.case_id)
  const i = await lockedItem(tx, itemId, expected)
  if (i.assigned_to !== actor.userId) throw new ApiError('FORBIDDEN')
  if (!isActiveCase(c.state)) throw conflict('state', 'CASE_CLOSED')
  const visitId = await correctionVisit(tx, i.return_work_id, actor.userId)
  if (!visitId) throw conflict('visit', 'START_RETURN_VISIT_FIRST')
  const t = apply({ machine: 'punch_item.lifecycle', state: i.state as 'open', version: i.version }, 'correct', {
    actor: 'staff',
    expectedVersion: expected,
    now: new Date(),
    facts: { note },
  })
  if (!t.ok) throw machineRefusal(t)
  await tx
    .updateTable('quality.return_work_items')
    .set({
      state: t.to,
      version: t.version,
      correction_note: note.trim(),
      corrected_by: actor.userId,
      corrected_at: sql<Date>`now()`,
      corrected_on_visit: visitId,
    })
    .where('id', '=', i.id)
    .execute()
  await event(tx, { id: i.return_work_id }, 'item_corrected', actor.userId, i.id, note)
  return { item: i, state: t.to, version: t.version, visitId, case: c }
}

/** The Owner re-checks a corrected item: passed (rechecked) or failed (open again); never the corrector. */
export async function recheckItem(
  tx: Tx,
  actor: StaffActor,
  itemId: string,
  expected: number,
  input: { passed: boolean; note: string },
) {
  const first = await itemOf(tx, itemId)
  if (!first) throw new ApiError('NOT_FOUND')
  const c = await lockedCase(tx, first.case_id)
  if (!allows(actor, 'quality.manage_punch_items', { projectId: c.project_id })) throw new ApiError('FORBIDDEN')
  if (!isActiveCase(c.state)) throw conflict('state', 'CASE_CLOSED')
  const i = await lockedItem(tx, itemId, expected)
  const t = apply(
    { machine: 'punch_item.lifecycle', state: i.state as 'corrected', version: i.version },
    input.passed ? 'recheck_pass' : 'recheck_fail',
    {
      actor: 'staff',
      expectedVersion: expected,
      now: new Date(),
      // A return-visit item names no hold; the verifier is never the corrector (no self-review exception here).
      facts: {
        note: input.note,
        holdResolved: null,
        recheckerCorrected: i.corrected_by === actor.userId,
        selfReview: false,
      },
    },
  )
  if (!t.ok) throw machineRefusal(t)
  await tx
    .updateTable('quality.return_work_items')
    .set(
      input.passed
        ? {
            state: t.to,
            version: t.version,
            recheck_note: input.note.trim(),
            rechecked_by: actor.userId,
            rechecked_at: sql<Date>`now()`,
          }
        : {
            state: t.to,
            version: t.version,
            correction_note: null,
            corrected_by: null,
            corrected_at: null,
            corrected_on_visit: null,
          },
    )
    .where('id', '=', i.id)
    .execute()
  await event(
    tx,
    { id: i.return_work_id },
    input.passed ? 'item_rechecked' : 'item_reopened',
    actor.userId,
    i.id,
    input.note,
  )
  return { item: i, state: t.to, version: t.version, case: c }
}

// --- Costs (HH-FIN-17, integer cents) ----------------------------------------------------------------------------

export async function addCost(
  tx: Tx,
  actor: StaffActor,
  id: string,
  input: { kind: ReturnCostKind; amountCents: number; note: string },
) {
  const { c, r } = await locked(tx, actor, id)
  const row = await tx
    .insertInto('quality.return_work_costs')
    .values({
      return_work_id: r.id,
      kind: input.kind,
      amount_cents: input.amountCents,
      note: input.note.trim(),
      recorded_by: actor.userId,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  await event(tx, r, 'cost_recorded', actor.userId, row.id)
  return { r, costId: row.id, case: c }
}

export async function costOf(db: Reader, costId: string) {
  return db
    .selectFrom('quality.return_work_costs as k')
    .innerJoin('quality.return_work as r', 'r.id', 'k.return_work_id')
    .select(['k.id', 'r.id as return_work_id', 'r.project_id'])
    .where('k.id', '=', costId)
    .executeTakeFirst()
}

export async function voidCost(tx: Tx, actor: StaffActor, costId: string, reason: string) {
  const first = await costOf(tx, costId)
  if (!first) throw new ApiError('NOT_FOUND')
  const { c, r } = await locked(tx, actor, first.return_work_id)
  const k = await tx
    .selectFrom('quality.return_work_costs')
    .select(['id', 'voided_at'])
    .where('id', '=', costId)
    .forUpdate()
    .executeTakeFirstOrThrow()
  if (k.voided_at) throw conflict('state', 'COST_VOIDED')
  await tx
    .updateTable('quality.return_work_costs')
    .set({ void_reason: reason.trim(), voided_by: actor.userId, voided_at: sql<Date>`now()` })
    .where('id', '=', costId)
    .execute()
  await event(tx, r, 'cost_voided', actor.userId, costId, reason)
  return { r, case: c }
}

// --- Views -------------------------------------------------------------------------------------------------------

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

/** A case's return work as the caller may see it (only those who see the case's detail). */
export async function returnWorkView(db: Reader, actor: StaffActor, caseId: string) {
  const c = await readCase(db, caseId)
  if (!c) throw new ApiError('NOT_FOUND')
  if (!seesDetail(actor, c)) throw new ApiError('FORBIDDEN')
  const handles = allows(actor, c.kind === 'complaint' ? 'case.manage' : 'case.triage', { projectId: c.project_id })
  const owner = allows(actor, 'case.triage', { projectId: c.project_id })
  const managesItems = allows(actor, 'quality.manage_punch_items', { projectId: c.project_id })
  const open = isActiveCase(c.state)
  const jobId = await originalJob(db, c)
  const r = await returnWorkOfCase(db, caseId)
  const w = jobId ? await windowOf(db, c, jobId) : null
  const job = jobId
    ? await db
        .selectFrom('work.jobs as j')
        .innerJoin('crm.projects as p', 'p.id', 'j.project_id')
        .select(['j.id', 'j.operational_state', 'p.reference'])
        .where('j.id', '=', jobId)
        .executeTakeFirst()
    : undefined
  const packages = jobId
    ? await db
        .selectFrom('work.work_packages as w')
        .innerJoin('catalog.services as s', 's.id', 'w.service_id')
        .select(['w.id', 's.code'])
        .where('w.job_id', '=', jobId)
        .orderBy('w.position')
        .execute()
    : []
  const base = {
    caseId: c.id,
    caseState: c.state,
    originalJob: job ? { jobId: job.id, state: job.operational_state, projectReference: job.reference } : null,
    warranty: w ? { ...w.window, days: WARRANTY_DAYS, reviewState: w.reviewState } : null,
    workPackages: packages.map((p) => ({ id: p.id, code: p.code })),
    workers: managesItems ? await activeWorkers(db) : [],
  }
  if (!r)
    return {
      ...base,
      returnWork: null,
      actions: {
        classify: handles && open && jobId !== null,
        decide: false,
        planVisit: false,
        linkVisit: false,
        linkJob: false,
        addItem: false,
        addCost: false,
      },
    }
  const visits = await db
    .selectFrom('quality.return_work_visits as l')
    .innerJoin('work.visits as v', 'v.id', 'l.visit_id')
    .select(['v.id', 'v.number', 'v.state', 'v.local_date', 'v.window_start', 'v.window_end', 'l.linked_at'])
    .where('l.return_work_id', '=', r.id)
    .orderBy('l.linked_at')
    .execute()
  const items = await db
    .selectFrom('quality.return_work_items')
    .selectAll()
    .where('return_work_id', '=', r.id)
    .orderBy('created_at')
    .orderBy('id')
    .execute()
  const costs = await db
    .selectFrom('quality.return_work_costs')
    .selectAll()
    .where('return_work_id', '=', r.id)
    .orderBy('recorded_at')
    .orderBy('id')
    .execute()
  const history = await db
    .selectFrom('quality.return_work_events')
    .select(['event', 'subject_id', 'actor_id', 'note', 'at'])
    .where('return_work_id', '=', r.id)
    .orderBy('seq')
    .execute()
  const returnJob = r.return_job_id
    ? await db
        .selectFrom('work.jobs as j')
        .innerJoin('crm.projects as p', 'p.id', 'j.project_id')
        .select(['j.id', 'j.operational_state', 'p.reference'])
        .where('j.id', '=', r.return_job_id)
        .executeTakeFirst()
    : undefined
  // Elapsed time per worker on the return visits (Arrived to Finished, with the Owner's corrections); no labor cost
  // rate is applied here, so labor cost stays incomplete (HH-FIN-17).
  let laborMinutes = 0
  let laborComplete = true
  for (const v of visits) {
    for (const t of await visitTimes(db, v.id, { correct: false, export: false }).then((x) => x.workers)) {
      if (t.durationMinutes === null) laborComplete = false
      else laborMinutes += t.durationMinutes
    }
  }
  const n = await names(db, [
    r.classified_by,
    r.decided_by,
    ...items.flatMap((i) => [i.assigned_to, i.corrected_by, i.rechecked_by]),
    ...costs.flatMap((k) => [k.recorded_by, k.voided_by]),
    ...history.map((h) => h.actor_id),
  ])
  const ref = (id: string | null) => (id ? { id, name: n.get(id) ?? null } : null)
  const live = costs.filter((k) => k.voided_at === null)
  return {
    ...base,
    returnWork: {
      id: r.id,
      version: r.version,
      classification: r.classification,
      classificationNote: r.classification_note,
      classifiedBy: ref(r.classified_by),
      classifiedAt: iso(r.classified_at),
      window: {
        reviewedCompletionOn: dateText(r.reviewed_completion_on),
        reportedOn: dateText(r.reported_on),
        within: r.within_warranty,
      },
      decision: r.decided_at
        ? {
            coverage: r.coverage,
            price: r.price,
            note: r.decision_note,
            decidedBy: ref(r.decided_by),
            decidedAt: iso(r.decided_at),
          }
        : null,
      returnJob: returnJob
        ? { jobId: returnJob.id, state: returnJob.operational_state, projectReference: returnJob.reference }
        : null,
      visits: visits.map((v) => ({
        visitId: v.id,
        number: v.number,
        state: v.state,
        localDate: dateText(v.local_date),
        windowStart: v.window_start.slice(0, 5),
        windowEnd: v.window_end.slice(0, 5),
        linkedAt: iso(v.linked_at),
      })),
      items: items.map((i) => ({
        id: i.id,
        workPackageId: i.work_package_id,
        area: i.area,
        description: i.description,
        requiredEvidence: i.required_evidence,
        assignedTo: ref(i.assigned_to),
        dueOn: dateText(i.due_on),
        state: i.state,
        correctionNote: i.correction_note,
        correctedBy: ref(i.corrected_by),
        correctedAt: iso(i.corrected_at),
        correctedOnVisit: i.corrected_on_visit,
        recheckNote: i.recheck_note,
        recheckedBy: ref(i.rechecked_by),
        recheckedAt: iso(i.rechecked_at),
        version: i.version,
        actions: { recheck: managesItems && open && i.state === 'corrected' && i.corrected_by !== actor.userId },
      })),
      costs: costs.map((k) => ({
        id: k.id,
        kind: k.kind,
        amountCents: k.amount_cents,
        note: k.note,
        recordedBy: ref(k.recorded_by),
        recordedAt: iso(k.recorded_at),
        voided: k.voided_at ? { reason: k.void_reason, by: ref(k.voided_by), at: iso(k.voided_at) } : null,
        actions: { void: handles && open && k.voided_at === null },
      })),
      totals: {
        costCents: live.reduce((s, k) => s + k.amount_cents, 0),
        laborMinutes,
        laborMinutesComplete: laborComplete,
        laborCost: 'incomplete' as const,
      },
      history: history.map((h) => ({
        event: h.event,
        subjectId: h.subject_id,
        actor: ref(h.actor_id),
        note: h.note,
        at: iso(h.at),
      })),
    },
    actions: {
      classify: handles && open,
      decide: owner && open,
      planVisit: handles && open,
      linkVisit: handles && open,
      linkJob: handles && open,
      addItem: managesItems && open,
      addCost: handles && open,
    },
  }
}

/** The caller's own return-visit punch items on a job, with whether they can record a correction now. */
export async function ownReturnItems(db: Reader, actor: StaffActor, jobId: string) {
  const items = await db
    .selectFrom('quality.return_work_items as i')
    .innerJoin('quality.return_work as r', 'r.id', 'i.return_work_id')
    .innerJoin('quality.cases as c', 'c.id', 'r.case_id')
    .select([
      'i.id',
      'i.return_work_id',
      'i.work_package_id',
      'i.area',
      'i.description',
      'i.required_evidence',
      'i.due_on',
      'i.state',
      'i.correction_note',
      'i.version',
      'c.state as case_state',
    ])
    .where('i.job_id', '=', jobId)
    .where('i.assigned_to', '=', actor.userId)
    .orderBy('i.created_at')
    .orderBy('i.id')
    .execute()
  const out = []
  for (const i of items) {
    const visitId = i.state === 'open' ? await correctionVisit(db, i.return_work_id, actor.userId) : null
    out.push({
      id: i.id,
      workPackageId: i.work_package_id,
      area: i.area,
      description: i.description,
      requiredEvidence: i.required_evidence,
      dueOn: dateText(i.due_on),
      state: i.state,
      correctionNote: i.correction_note,
      version: i.version,
      actions: { correct: i.state === 'open' && isActiveCase(i.case_state) && visitId !== null },
    })
  }
  return { jobId, items: out }
}
