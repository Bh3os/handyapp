// A job's gross margin, the advisory target flag and the Owner's low-margin reasons (TSK-0131; HH-FIN-20, HH-FIN-17,
// HH-DATA-10, OWN-DEC-189, FACT-MARGIN-TARGET, RULE-MONEY-CENTS, RULE-NO-INVENTED-FACTS, RULE-SERVER-AUTHZ).
// - The figures come from the records the `job_margin` report definition names: the job's final invoices issued,
//   partially paid or paid (never the deposit invoice, never a payment), refunds that succeeded and credits issued or
//   applied, and the job cost report (job-costs/store.ts) with labor and burden from the Owner-entered rates. The
//   estimated margin is the job's contract price (its latest scope snapshot, change orders included) against the
//   estimated cost total. @handyhub/domain jobMarginOf computes every figure: a margin is final only when each part is.
// - The target is job_margin.target (FACT-MARGIN-TARGET); NOT CONFIGURED gives no flag, never an assumed target.
// - The flag is advisory: nothing here blocks a publication, a completion, an invoice or a payment.
// - The Owner records a reason for a job flagged below the target; a reason is "current" while the job's final
//   figures are still the ones it was recorded against (a later change of revenue or cost asks for a review again).
import type { Db, Tx } from '@handyhub/db'
import {
  jobMarginOf,
  marginReviewProblem,
  netRevenueOf,
  type CostFigure,
  type GrossMargin,
  type JobMargin,
  type MarginReason,
  type NetRevenue,
} from '@handyhub/domain'
import { decide, type StaffActor } from '@handyhub/policy'
import { ApiError } from '../../api/errors.js'
import { loadConfig } from '../../platform/config/index.js'

type Reader = Db | Tx
type Config = Awaited<ReturnType<typeof loadConfig>>

const ISSUED = ['issued', 'partially_paid', 'paid'] as const
const IN_PROCESS = {
  refund: ['requested', 'approved', 'processing', 'needs_review'],
  credit: ['requested'],
} as const

/** The target in force: its basis points, or null while NOT CONFIGURED (no flag is raised then). */
export function marginTarget(config: Config) {
  const entry = config.get('job_margin.target')
  return {
    state: entry.state,
    version: entry.version,
    targetBps: entry.state === 'CONFIGURED' ? entry.value.targetBps : null,
    sourceIds: [...entry.sourceIds],
  }
}

/** The revenue records of a job, as the `job_margin` definition reads them. */
export async function revenueOf(db: Reader, jobId: string) {
  const invoices = await db
    .selectFrom('finance.invoices')
    .select(['total_cents'])
    .where('job_id', '=', jobId)
    .where('kind', '=', 'final')
    .where('state', 'in', [...ISSUED])
    .execute()
  const adjustments = await db
    .selectFrom('finance.refunds')
    .select(['type', 'state', 'amount_cents'])
    .where('job_id', '=', jobId)
    .execute()
  const amounts = (type: string, states: readonly string[]) =>
    adjustments.filter((a) => a.type === type && states.includes(a.state)).map((a) => Number(a.amount_cents))
  const finalInvoices = invoices.map((i) => Number(i.total_cents))
  const refunds = amounts('refund', ['succeeded'])
  const credits = amounts('credit', ['issued', 'applied'])
  const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0)
  const revenue: NetRevenue = netRevenueOf({
    finalInvoices,
    refunds,
    credits,
    adjustmentsInProcess: amounts('refund', IN_PROCESS.refund).length + amounts('credit', IN_PROCESS.credit).length,
    writeOffs: amounts('write_off', ['requested', 'approved']).length,
  })
  return {
    revenue,
    invoicedCents: sum(finalInvoices),
    refundsCents: sum(refunds),
    creditsCents: sum(credits),
  }
}

/** The job's contract price: its latest scope snapshot's total (the accepted estimate plus approved change orders). */
export async function contractPriceOf(db: Reader, jobId: string): Promise<number | null> {
  const s = await db
    .selectFrom('work.job_scope_snapshots')
    .select('total_cents')
    .where('job_id', '=', jobId)
    .orderBy('version', 'desc')
    .executeTakeFirst()
  return s ? Number(s.total_cents) : null
}

/** A margin as the API states it: no percentage, profit or totals while it is not final. */
const marginFigure = (m: GrossMargin) =>
  m.state === 'complete'
    ? {
        state: m.state,
        revenueCents: m.revenueCents,
        costCents: m.costCents,
        grossProfitCents: m.grossProfitCents,
        marginBps: m.marginBps,
        gaps: [],
      }
    : {
        state: m.state,
        revenueCents: null,
        costCents: null,
        grossProfitCents: null,
        marginBps: null,
        gaps: [...m.gaps],
      }

const allows = (actor: StaffActor, action: 'job_margin.review', projectId: string) =>
  decide(actor, action, { projectId }, { now: new Date(), online: true }).effect === 'allow'

/** The reasons recorded for a job, newest first. */
async function reviewsOf(db: Reader, jobId: string) {
  return db
    .selectFrom('finance.job_margin_reviews as r')
    .leftJoin('identity.staff_users as u', 'u.id', 'r.recorded_by')
    .select([
      'r.id',
      'r.reason',
      'r.note',
      'r.revenue_cents',
      'r.cost_cents',
      'r.gross_profit_cents',
      'r.margin_bps',
      'r.target_bps',
      'r.recorded_by',
      'r.recorded_at',
      'u.display_name',
    ])
    .where('r.job_id', '=', jobId)
    .orderBy('r.seq', 'desc')
    .execute()
}

/** Whether a reason was recorded against exactly these final figures and target. */
const matches = (
  r: { revenue_cents: string | number; cost_cents: string | number; target_bps: number },
  m: JobMargin,
) =>
  m.actual.state === 'complete' &&
  Number(r.revenue_cents) === m.actual.revenueCents &&
  Number(r.cost_cents) === m.actual.costCents &&
  r.target_bps === m.targetBps

/** The margin part of the job cost report (the route authorized job_cost.view). */
export async function jobMarginView(
  db: Reader,
  actor: StaffActor,
  job: { id: string; project_id: string },
  costs: { estimated: CostFigure; actual: CostFigure },
) {
  const target = marginTarget(await loadConfig(db))
  const { revenue, invoicedCents, refundsCents, creditsCents } = await revenueOf(db, job.id)
  const price = await contractPriceOf(db, job.id)
  const m = jobMarginOf({
    estimatedPriceCents: price,
    estimatedCosts: costs.estimated,
    revenue,
    actualCosts: costs.actual,
    targetBps: target.targetBps,
  })
  const reviews = await reviewsOf(db, job.id)
  const reviewed = reviews.some((r) => matches(r, m))
  return {
    margin: m,
    view: {
      targetBps: target.targetBps,
      targetVersion: target.version,
      estimatedPriceCents: price,
      revenue: {
        state: revenue.state,
        cents:
          revenue.state === 'complete' ? revenue.cents : revenue.state === 'incomplete' ? revenue.knownCents : null,
        invoicedCents,
        refundsCents,
        creditsCents,
        gaps:
          revenue.state === 'incomplete' ? [...revenue.gaps] : revenue.state === 'not_invoiced' ? ['not_invoiced'] : [],
      },
      estimated: marginFigure(m.estimated),
      actual: marginFigure(m.actual),
      varianceBps: m.varianceBps,
      profitVarianceCents: m.profitVarianceCents,
      flag: m.flag,
      estimatedFlag: m.estimatedFlag,
      reviewed,
      reviews: reviews.map((r) => ({
        id: r.id,
        reason: r.reason,
        note: r.note,
        revenueCents: Number(r.revenue_cents),
        costCents: Number(r.cost_cents),
        grossProfitCents: Number(r.gross_profit_cents),
        marginBps: r.margin_bps,
        targetBps: r.target_bps,
        recordedBy: { id: r.recorded_by, name: r.display_name },
        recordedAt: new Date(r.recorded_at).toISOString(),
        current: matches(r, m),
      })),
      report: 'job_margin' as const,
      actions: { review: m.flag === 'below_target' && allows(actor, 'job_margin.review', job.project_id) },
    },
  }
}
export type JobMarginView = Awaited<ReturnType<typeof jobMarginView>>['view']

/** The Owner records why a job is below the target, against its current final margin. */
export async function recordMarginReview(
  tx: Tx,
  actor: StaffActor,
  job: { id: string; project_id: string },
  margin: JobMargin,
  input: { reason: MarginReason; note: string | null },
) {
  const problem = marginReviewProblem(margin.flag, input)
  if (problem === 'NOTE_REQUIRED')
    throw new ApiError('VALIDATION_FAILED', { fieldErrors: [{ field: 'body.note', code: problem, message: '' }] })
  if (problem || margin.actual.state !== 'complete' || margin.targetBps === null)
    throw new ApiError('CONFLICT', {
      fieldErrors: [{ field: 'margin', code: 'MARGIN_NOT_BELOW_TARGET', message: '' }],
    })
  const a = margin.actual
  const row = await tx
    .insertInto('finance.job_margin_reviews')
    .values({
      job_id: job.id,
      project_id: job.project_id,
      reason: input.reason,
      note: input.note?.trim() || null,
      revenue_cents: a.revenueCents,
      cost_cents: a.costCents,
      gross_profit_cents: a.grossProfitCents,
      margin_bps: a.marginBps,
      target_bps: margin.targetBps,
      recorded_by: actor.userId,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  return { id: row.id }
}
