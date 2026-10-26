// A job's estimated versus actual costs (TSK-0095; HH-FIN-17, HH-DATA-10, HH-QA-08, T73, ENT-Job, ENT-TimeStamp,
// OWN-DEC-69, OWN-DEC-188, OWN-DEC-189, RULE-MONEY-CENTS, RULE-NO-INVENTED-FACTS, RULE-SERVER-AUTHZ). Migration 0109
// keeps the records true whatever path writes; every write runs in the route's transaction under the job's row lock,
// so an entry and the Owner's confirmation of its category never interleave.
// - Estimated: the internal material and labor cost of each counted line (base lines and the selected options) of the
//   estimate version the job was approved from (its scope snapshot version 1). An approved change order adds scope
//   without a cost estimate, so it leaves the estimate incomplete.
// - Actual: cost entries in integer cents per category; the Owner confirms a category once it holds every cost, and
//   reopens it with a reason to add or void an entry. Labor is the elapsed Arrived-to-Finished time per worker on the
//   job's started visits (the Owner's corrections applied, return visits apart); its cost and the burden come from the
//   rates the Owner entered per worker (TSK-0131, laborCostOf: final once the work is done and every time is known
//   and rated; a time with no rate is NOT CONFIGURED). @handyhub/domain summarizeJobCosts computes every figure:
//   missing cost is never zero.
// - Return work: the costs recorded on the job's return work (quality.return_work_costs) are shown apart, never added
//   to the job's own (HH-QA-08).
// - The report states its sources (job_costs of @handyhub/domain REPORT_DEFINITIONS).
// - The job's gross margin and the advisory target flag (TSK-0131) are computed from this report's totals by
//   job-margin/margin.ts and shown with it. No overhead is ever a job cost.
import type { Db, Tx } from '@handyhub/db'
import {
  costEntryProblem,
  JOB_COST_CATEGORIES,
  laborCostOf,
  localDateOf,
  sourceStatement,
  summarizeJobCosts,
  type CostFigure,
  type JobCostCategory,
} from '@handyhub/domain'
import { decide, type StaffActor } from '@handyhub/policy'
import { sql } from 'kysely'
import { ApiError, type FieldError } from '../../api/errors.js'
import { loadConfig } from '../../platform/config/index.js'
import { visitTimes } from '../field/timestamps.js'
import { jobMarginView } from '../job-margin/margin.js'
import { laborRatesOf } from '../job-margin/rates.js'
import { businessZone } from '../visits/visits.js'

type Reader = Db | Tx

const field = (f: string, code: string): FieldError => ({ field: f, code, message: '' })
const conflict = (f: string, code: string) => new ApiError('CONFLICT', { fieldErrors: [field(f, code)] })
const invalid = (f: string, code: string) => new ApiError('VALIDATION_FAILED', { fieldErrors: [field(f, code)] })
const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null)
const dateText = (d: Date | string): string => (typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10))

/** The visits whose time counts as the job's labor: its own work visits once they started (never return visits). */
const LABOR_PURPOSES = ['service', 'follow_up'] as const
const STARTED = ['en_route', 'arrived', 'completed'] as const
/** PROPOSED (OQ-JOB-MARGIN-DETAILS): the work is done, so no visit adds labor time, once the job is complete. */
const WORK_DONE = ['operationally_complete', 'closed'] as const

export async function jobOf(db: Reader, jobId: string) {
  return db
    .selectFrom('work.jobs as j')
    .innerJoin('crm.projects as p', 'p.id', 'j.project_id')
    .select(['j.id', 'j.project_id', 'j.operational_state', 'p.reference'])
    .where('j.id', '=', jobId)
    .executeTakeFirst()
}

/** The job's row lock (migration 0109 takes the same lock in its guards). */
async function lockedJob(tx: Tx, jobId: string) {
  const j = await tx
    .selectFrom('work.jobs')
    .select(['id', 'project_id'])
    .where('id', '=', jobId)
    .forNoKeyUpdate()
    .executeTakeFirst()
  if (!j) throw new ApiError('NOT_FOUND')
  return j
}

export async function costOf(db: Reader, costId: string) {
  return db
    .selectFrom('finance.job_costs')
    .select(['id', 'job_id', 'project_id', 'category', 'voided_at'])
    .where('id', '=', costId)
    .executeTakeFirst()
}

/** The categories whose latest confirmation event is a confirmation. */
async function confirmedCategories(db: Reader, jobId: string): Promise<Map<string, { at: Date; by: string }>> {
  const rows = await db
    .selectFrom('finance.job_cost_events')
    .select(['category', 'event', 'at', 'actor_id'])
    .where('job_id', '=', jobId)
    .where('event', 'in', ['category_confirmed', 'category_reopened'])
    .orderBy('seq')
    .execute()
  const out = new Map<string, { at: Date; by: string }>()
  for (const r of rows) {
    if (r.event === 'category_confirmed') out.set(r.category, { at: r.at, by: r.actor_id })
    else out.delete(r.category)
  }
  return out
}

async function event(
  tx: Tx,
  j: { id: string; project_id: string },
  e: { event: string; category: string; costId?: string; actor: string; note?: string | null },
) {
  await tx
    .insertInto('finance.job_cost_events')
    .values({
      job_id: j.id,
      project_id: j.project_id,
      event: e.event,
      category: e.category,
      cost_id: e.costId ?? null,
      actor_id: e.actor,
      note: e.note ?? null,
    })
    .execute()
}

const today = async (db: Reader) => localDateOf(new Date(), businessZone(await loadConfig(db)).zone)

// --- Writes -----------------------------------------------------------------------------------------------------

export type CostInput = { category: JobCostCategory; amountCents: number; incurredOn: string; note: string }

export async function recordCost(tx: Tx, actor: StaffActor, jobId: string, input: CostInput) {
  const j = await lockedJob(tx, jobId)
  const confirmed = (await confirmedCategories(tx, jobId)).has(input.category)
  const problem = costEntryProblem(input, { today: await today(tx), confirmed })
  if (problem === 'AMOUNT_INVALID') throw invalid('amountCents', problem)
  if (problem === 'IN_FUTURE') throw invalid('incurredOn', problem)
  if (problem) throw conflict('category', problem)
  const row = await tx
    .insertInto('finance.job_costs')
    .values({
      job_id: j.id,
      project_id: j.project_id,
      category: input.category,
      amount_cents: input.amountCents,
      incurred_on: input.incurredOn,
      note: input.note.trim(),
      recorded_by: actor.userId,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  await event(tx, j, { event: 'cost_recorded', category: input.category, costId: row.id, actor: actor.userId })
  return { job: j, costId: row.id }
}

export async function voidCost(tx: Tx, actor: StaffActor, costId: string, reason: string) {
  const first = await costOf(tx, costId)
  if (!first) throw new ApiError('NOT_FOUND')
  const j = await lockedJob(tx, first.job_id)
  const k = await tx
    .selectFrom('finance.job_costs')
    .select(['id', 'category', 'voided_at'])
    .where('id', '=', costId)
    .forUpdate()
    .executeTakeFirstOrThrow()
  if (k.voided_at) throw conflict('cost', 'COST_VOIDED')
  if ((await confirmedCategories(tx, j.id)).has(k.category)) throw conflict('category', 'CATEGORY_CONFIRMED')
  await tx
    .updateTable('finance.job_costs')
    .set({ void_reason: reason.trim(), voided_by: actor.userId, voided_at: sql<Date>`now()` })
    .where('id', '=', costId)
    .execute()
  await event(tx, j, { event: 'cost_voided', category: k.category, costId, actor: actor.userId, note: reason.trim() })
  return { job: j, category: k.category }
}

/** The Owner confirms that a category holds every cost of the job (an empty category: an explicit $0.00). */
export async function confirmCategory(
  tx: Tx,
  actor: StaffActor,
  jobId: string,
  category: JobCostCategory,
  note: string | null,
) {
  const j = await lockedJob(tx, jobId)
  if ((await confirmedCategories(tx, jobId)).has(category)) throw conflict('category', 'CATEGORY_CONFIRMED')
  await event(tx, j, { event: 'category_confirmed', category, actor: actor.userId, note: note?.trim() || null })
  return { job: j }
}

/** The Owner reopens a confirmed category, with the reason, to add or void an entry. */
export async function reopenCategory(
  tx: Tx,
  actor: StaffActor,
  jobId: string,
  category: JobCostCategory,
  reason: string,
) {
  const j = await lockedJob(tx, jobId)
  if (!(await confirmedCategories(tx, jobId)).has(category)) throw conflict('category', 'CATEGORY_NOT_CONFIRMED')
  await event(tx, j, { event: 'category_reopened', category, actor: actor.userId, note: reason.trim() })
  return { job: j }
}

// --- The report ---------------------------------------------------------------------------------------------------

/** The counted lines of the estimate version the job was approved from, with their internal costs. */
async function estimateLines(db: Reader, jobId: string) {
  const snap = await db
    .selectFrom('work.job_scope_snapshots as s')
    .leftJoin('estimating.estimate_versions as v', 'v.id', 's.estimate_version_id')
    .leftJoin('estimating.estimates as e', 'e.id', 'v.estimate_id')
    .select(['s.estimate_version_id', 's.selected_options', 'v.version', 'e.number'])
    .where('s.job_id', '=', jobId)
    .where('s.version', '=', 1)
    .executeTakeFirst()
  if (!snap?.estimate_version_id) return { estimate: null, lines: [] }
  const selected = snap.selected_options.map(Number)
  const lines = await db
    .selectFrom('estimating.estimate_lines as l')
    .leftJoin('estimating.estimate_line_costs as c', 'c.line_id', 'l.id')
    .select(['l.position', 'l.kind', 'c.material_cost_cents', 'c.labor_cost_cents'])
    .where('l.version_id', '=', snap.estimate_version_id)
    .orderBy('l.position')
    .execute()
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v))
  return {
    estimate: { number: snap.number, version: snap.version },
    lines: lines
      .filter((l) => l.kind === 'base' || selected.includes(l.position))
      .map((l) => ({ materialCents: num(l.material_cost_cents), laborCents: num(l.labor_cost_cents) })),
  }
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

/** A figure as the API states it: its state and, when known, its cents (the known part of an incomplete one). */
const figure = (f: CostFigure) => ({
  state: f.state,
  cents: f.state === 'complete' ? f.cents : f.state === 'incomplete' ? f.knownCents : null,
})

const allows = (actor: StaffActor, action: 'job_cost.record', projectId: string) =>
  decide(actor, action, { projectId }, { now: new Date(), online: true }).effect === 'allow'

/** The job's cost report as the caller may act on it (the route authorized job_cost.view). */
export async function jobCostsView(db: Reader, actor: StaffActor, jobId: string) {
  return (await jobCostsReport(db, actor, jobId)).view
}

/** The report and the job's margin as the domain computed it (for the Owner's low-margin reason). */
export async function jobCostsReport(db: Reader, actor: StaffActor, jobId: string) {
  const j = await jobOf(db, jobId)
  if (!j) throw new ApiError('NOT_FOUND')
  const records = allows(actor, 'job_cost.record', j.project_id)
  const { estimate, lines } = await estimateLines(db, jobId)
  const changeOrders = Number(
    (
      await db
        .selectFrom('work.job_scope_snapshots')
        .select((eb) => eb.fn.countAll().as('n'))
        .where('job_id', '=', jobId)
        .where('source', '=', 'change_order')
        .executeTakeFirstOrThrow()
    ).n,
  )
  const entries = await db
    .selectFrom('finance.job_costs')
    .selectAll()
    .where('job_id', '=', jobId)
    .orderBy('recorded_at')
    .orderBy('id')
    .execute()
  const confirmed = await confirmedCategories(db, jobId)
  const visits = await db
    .selectFrom('work.visits')
    .select(['id', 'number', 'local_date'])
    .where('job_id', '=', jobId)
    .where('purpose', 'in', [...LABOR_PURPOSES])
    .where('state', 'in', [...STARTED])
    .orderBy('starts_at')
    .orderBy('id')
    .execute()
  const times = []
  for (const v of visits) {
    for (const w of (await visitTimes(db, v.id, { correct: false, export: false })).workers)
      times.push({
        visitId: v.id,
        visitNumber: v.number,
        localDate: dateText(v.local_date),
        staffUserId: w.staffUserId,
        name: w.name,
        minutes: w.durationMinutes,
        flagged: w.flagged,
      })
  }
  const live = entries.filter((e) => e.voided_at === null)
  const workDone = (WORK_DONE as readonly string[]).includes(j.operational_state)
  const laborCost = laborCostOf(
    times.map((t) => ({ staffUserId: t.staffUserId, localDate: t.localDate, minutes: t.minutes })),
    await laborRatesOf(
      db,
      times.map((t) => t.staffUserId),
    ),
    workDone,
  )
  const summary = summarizeJobCosts({
    estimateLines: lines,
    changeOrders,
    entries: live.map((e) => ({ category: e.category as JobCostCategory, amountCents: Number(e.amount_cents) })),
    confirmed: JOB_COST_CATEGORIES.filter((c) => confirmed.has(c)),
    times: times.map((t) => ({ staffUserId: t.staffUserId, minutes: t.minutes })),
    laborCost: { labor: laborCost.labor, burden: laborCost.burden },
  })
  const margin = await jobMarginView(db, actor, j, {
    estimated: summary.estimatedTotal,
    actual: summary.actualTotal,
  })
  // Return work, apart from the job's own costs (HH-QA-08): recorded so far, so never final.
  const returnCosts = await db
    .selectFrom('quality.return_work_costs as k')
    .innerJoin('quality.return_work as r', 'r.id', 'k.return_work_id')
    .select(['k.amount_cents', 'r.case_id'])
    .where('r.job_id', '=', jobId)
    .where('k.voided_at', 'is', null)
    .execute()
  const returnCases = await db
    .selectFrom('quality.return_work')
    .select('case_id')
    .where('job_id', '=', jobId)
    .orderBy('classified_at')
    .execute()
  const history = await db
    .selectFrom('finance.job_cost_events')
    .select(['event', 'category', 'cost_id', 'actor_id', 'note', 'at'])
    .where('job_id', '=', jobId)
    .orderBy('seq')
    .execute()
  const n = await names(db, [
    ...entries.flatMap((e) => [e.recorded_by, e.voided_by]),
    ...[...confirmed.values()].map((c) => c.by),
    ...history.map((h) => h.actor_id),
  ])
  const ref = (id: string | null) => (id ? { id, name: n.get(id) ?? null } : null)
  const returnCents = returnCosts.reduce((s, k) => s + k.amount_cents, 0)
  const view = {
    jobId: j.id,
    projectId: j.project_id,
    projectReference: j.reference,
    jobState: j.operational_state,
    estimate,
    changeOrders,
    lines: summary.lines.map((l) => {
      const c = confirmed.get(l.line)
      const category = (JOB_COST_CATEGORIES as readonly string[]).includes(l.line)
      return {
        line: l.line,
        estimated: figure(l.estimated),
        actual: figure(l.actual),
        varianceCents: l.varianceCents,
        confirmed: c ? { by: ref(c.by), at: iso(c.at) } : null,
        actions: {
          confirm: records && category && !c,
          reopen: records && category && !!c,
        },
      }
    }),
    totals: {
      estimated: figure(summary.estimatedTotal),
      actual: figure(summary.actualTotal),
      varianceCents: summary.varianceCents,
      incompleteLines: [...summary.incompleteLines],
    },
    labor: {
      minutes: summary.labor.minutes,
      minutesComplete: summary.labor.minutesComplete,
      unknownTimes: summary.labor.unknownTimes,
      workDone,
      // Each time's cost at the rate in force on the visit's date (null: no rate entered, or the time not known).
      times: times.map((t, n) => ({
        ...t,
        rated: laborCost.lines[n]?.rateCents !== null,
        laborCents: laborCost.lines[n]?.laborCents ?? null,
        burdenCents: laborCost.lines[n]?.burdenCents ?? null,
      })),
    },
    entries: entries.map((e) => ({
      id: e.id,
      category: e.category,
      amountCents: Number(e.amount_cents),
      incurredOn: dateText(e.incurred_on),
      note: e.note,
      recordedBy: ref(e.recorded_by),
      recordedAt: iso(e.recorded_at),
      voided: e.voided_at ? { reason: e.void_reason, by: ref(e.voided_by), at: iso(e.voided_at) } : null,
      actions: { void: records && e.voided_at === null && !confirmed.has(e.category) },
    })),
    returnWork: {
      cost: figure(returnCosts.length ? { state: 'incomplete', knownCents: returnCents } : { state: 'not_recorded' }),
      entries: returnCosts.length,
      caseIds: [...new Set(returnCases.map((r) => r.case_id))],
    },
    history: history.map((h) => ({
      event: h.event,
      category: h.category,
      costId: h.cost_id,
      actor: ref(h.actor_id),
      note: h.note,
      at: iso(h.at),
    })),
    report: sourceStatement('job_costs'),
    margin: margin.view,
    actions: { record: records },
  }
  return { job: j, view, margin: margin.margin }
}
export type JobCostsView = Awaited<ReturnType<typeof jobCostsView>>
