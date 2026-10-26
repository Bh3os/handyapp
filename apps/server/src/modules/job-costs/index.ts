// Job costs module (TSK-0095; HH-FIN-17, HH-DATA-10, HH-QA-08, T73, ENT-Job, ENT-TimeStamp, OWN-DEC-69,
// OWN-DEC-188, OWN-DEC-189, RULE-MONEY-CENTS, RULE-NO-INVENTED-FACTS, RULE-SERVER-AUTHZ).
//   GET  /staff/jobs/:jobId/costs                                       the job's estimated-versus-actual costs
//   POST /staff/jobs/:jobId/costs                                       record a cost entry in cents
//   POST /staff/job-costs/:costId/actions/void                          void an entry entered in error, with a reason
//   POST /staff/jobs/:jobId/cost-categories/:category/actions/confirm   the Owner: the category holds every cost
//   POST /staff/jobs/:jobId/cost-categories/:category/actions/reopen    the Owner: reopen it, with a reason
//   GET  /staff/reports/sources                                         every report's basis and source states
// - Reading and writing job costs is job_cost.view / job_cost.record (PROPOSED: the Owner only). Internal costs never
//   reach a customer route.
// - Missing cost is never zero: every figure carries its state (complete, incomplete with the known part, not
//   recorded, not estimated, not configured); labor and burden cost come from the Owner-entered rates (TSK-0131).
// - Every write is audited with identifiers, categories and amounts in cents only; notes stay on their records.
import type { Tx } from '@handyhub/db'
import { REPORT_DEFINITIONS, sourceStatement, type JobCostCategory } from '@handyhub/domain'
import type { StaffActor } from '@handyhub/policy'
import { ApiError } from '../../api/errors.js'
import type { ApiContext, ApiModule, RouteDef } from '../../api/route.js'
import {
  CATEGORY_PARAMS,
  CONFIRM_BODY,
  COST_BODY,
  COST_PARAMS,
  JOB_COSTS_VIEW,
  JOB_PARAMS,
  NO_QUERY,
  REOPEN_BODY,
  REPORTS,
  VOID_BODY,
} from './schemas.js'
import {
  confirmCategory,
  costOf,
  jobCostsView,
  jobOf,
  recordCost,
  reopenCategory,
  voidCost,
  type CostInput,
} from './store.js'

const TEST = 'test/integration/job-costs.test.ts'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function staff(ctx: ApiContext): StaffActor {
  if (ctx.actor.kind !== 'staff') throw new ApiError('FORBIDDEN')
  return ctx.actor
}

const jobFacts: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const { jobId } = req.params as { jobId: string }
  if (!UUID_RE.test(jobId)) return null
  const j = await jobOf(db, jobId)
  return j ? { projectId: j.project_id } : null
}
const costFacts: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const { costId } = req.params as { costId: string }
  if (!UUID_RE.test(costId)) return null
  const k = await costOf(db, costId)
  return k ? { projectId: k.project_id } : null
}

const read = {
  method: 'GET',
  actors: ['staff'],
  kind: 'read',
  idempotency: 'none',
  expectedVersion: 'none',
  rateLimit: 'none',
  audit: 'none',
  pagination: false,
  test: TEST,
} as const
const write = {
  method: 'POST',
  actors: ['staff'],
  kind: 'write',
  idempotency: 'required',
  expectedVersion: 'none',
  rateLimit: 'none',
  pagination: false,
  permission: 'job_cost.record',
  test: TEST,
} as const

const WHO = 'Staff with job_cost.record (PROPOSED: the Owner). '
const VIEW = { 200: JOB_COSTS_VIEW } as const

export function jobCostsModule(): ApiModule {
  const view: RouteDef = {
    ...read,
    path: '/staff/jobs/:jobId/costs',
    operationId: 'getJobCosts',
    summary: "A job's estimated versus actual costs",
    description:
      'Staff with job_cost.view (PROPOSED: the Owner). Each cost line of OWN-DEC-189 (labor, burden, materials, ' +
      'approved purchases, subcontractors, rentals, disposal, other direct expenses) with its estimated figure (the ' +
      'internal costs of the counted lines of the estimate version the job was approved from) and its actual figure ' +
      "(the entries in integer cents; final only once the Owner confirmed the category). A figure's state says " +
      'whether it is complete, incomplete (with the part known), not recorded, not estimated or not configured: ' +
      "missing cost is never zero. Labor is the elapsed Arrived-to-Finished minutes per worker on the job's started " +
      'visits; a time with no rate entered is NOT CONFIGURED, so the actual total is incomplete. ' +
      'Variances only between two complete figures. Return-work costs are shown apart. The report states its ' +
      'sources (report, the job_costs definition). Labor and burden cost come from the rates the Owner entered per ' +
      'worker (TSK-0131), final once the job is operationally complete and every time is known and rated. The ' +
      "job's gross margin (margin): estimated (contract price against the estimated costs) and actual (final " +
      'invoices less refunds and credits against the actual costs), each final only when every part is, with the ' +
      'advisory flag against job_margin.target and the reasons the Owner recorded.',
    permission: 'job_cost.view',
    resource: jobFacts,
    schema: { params: JOB_PARAMS, querystring: NO_QUERY, response: VIEW },
    handler: async (ctx) => {
      const { jobId } = ctx.req.params as { jobId: string }
      return { body: await jobCostsView(ctx.db, staff(ctx), jobId), headers: { 'cache-control': 'no-store' } }
    },
  }

  const record: RouteDef = {
    ...write,
    path: '/staff/jobs/:jobId/costs',
    operationId: 'recordJobCost',
    summary: 'Record a job cost',
    description:
      WHO +
      'One actual direct cost of the job: a category (materials, purchase, subcontractor, rental, disposal, other), ' +
      'an amount in integer cents (1 to 10000000, PROPOSED limit), the local date it was incurred (not after today ' +
      'in the business time zone: IN_FUTURE) and a note. Refused in a category the Owner confirmed ' +
      '(CATEGORY_CONFIRMED: reopen it first). Never changed afterwards; voided once with a reason. Answers the ' +
      "job's costs.",
    audit: 'job_cost.record',
    resource: jobFacts,
    schema: { params: JOB_PARAMS, body: COST_BODY, response: { 201: JOB_COSTS_VIEW } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const { jobId } = ctx.req.params as { jobId: string }
      const b = ctx.req.body as CostInput
      const out = await recordCost(tx, staff(ctx), jobId, b)
      await ctx.audit({
        target: { type: 'job_cost', id: out.costId },
        summary: { projectId: out.job.project_id, jobId, category: b.category, amountCents: b.amountCents },
      })
      return { status: 201, body: await jobCostsView(tx, staff(ctx), jobId) }
    },
  }

  const voidRoute: RouteDef = {
    ...write,
    path: '/staff/job-costs/:costId/actions/void',
    operationId: 'voidJobCost',
    summary: 'Void a job cost entered in error',
    description:
      WHO +
      'With the reason; once (COST_VOIDED), and only while its category is not confirmed (CATEGORY_CONFIRMED). The ' +
      "entry stays in the list as voided and no longer counts. Answers the job's costs.",
    audit: 'job_cost.void',
    resource: costFacts,
    schema: { params: COST_PARAMS, body: VOID_BODY, response: VIEW },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const { costId } = ctx.req.params as { costId: string }
      const { reason } = ctx.req.body as { reason: string }
      const out = await voidCost(tx, staff(ctx), costId, reason)
      await ctx.audit({
        target: { type: 'job_cost', id: costId },
        summary: { projectId: out.job.project_id, jobId: out.job.id, category: out.category },
      })
      return { body: await jobCostsView(tx, staff(ctx), out.job.id) }
    },
  }

  const confirm: RouteDef = {
    ...write,
    path: '/staff/jobs/:jobId/cost-categories/:category/actions/confirm',
    operationId: 'confirmJobCostCategory',
    summary: 'Confirm that a cost category is complete',
    description:
      WHO +
      'The Owner states that the category holds every cost of the job, with an optional note; from then on its ' +
      'actual figure is complete (a category with no entry: an explicit $0.00). Labor and burden are not ' +
      'categories: they come from the Owner-entered labor cost rates (TSK-0131). Refused when already confirmed (CATEGORY_CONFIRMED); ' +
      'the database accepts it only from a live Owner.',
    audit: 'job_cost.confirm_category',
    resource: jobFacts,
    schema: { params: CATEGORY_PARAMS, body: CONFIRM_BODY, response: VIEW },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const { jobId, category } = ctx.req.params as { jobId: string; category: JobCostCategory }
      const { note } = (ctx.req.body ?? {}) as { note?: string }
      const out = await confirmCategory(tx, staff(ctx), jobId, category, note ?? null)
      await ctx.audit({
        target: { type: 'job', id: jobId },
        summary: { projectId: out.job.project_id, category },
      })
      return { body: await jobCostsView(tx, staff(ctx), jobId) }
    },
  }

  const reopen: RouteDef = {
    ...write,
    path: '/staff/jobs/:jobId/cost-categories/:category/actions/reopen',
    operationId: 'reopenJobCostCategory',
    summary: 'Reopen a confirmed cost category',
    description:
      WHO +
      'With the reason, so an entry can be recorded or voided; its figure is incomplete again until confirmed. ' +
      'Refused when the category is not confirmed (CATEGORY_NOT_CONFIRMED). The history keeps both.',
    audit: 'job_cost.reopen_category',
    resource: jobFacts,
    schema: { params: CATEGORY_PARAMS, body: REOPEN_BODY, response: VIEW },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const { jobId, category } = ctx.req.params as { jobId: string; category: JobCostCategory }
      const { reason } = ctx.req.body as { reason: string }
      const out = await reopenCategory(tx, staff(ctx), jobId, category, reason)
      await ctx.audit({
        target: { type: 'job', id: jobId },
        summary: { projectId: out.job.project_id, category },
      })
      return { body: await jobCostsView(tx, staff(ctx), jobId) }
    },
  }

  const sources: RouteDef = {
    ...read,
    path: '/staff/reports/sources',
    operationId: 'listReportSources',
    summary: "Every report's basis and source states",
    description:
      'Staff with dashboard.view (the Owner). Each report definition (PROPOSED) with its basis (estimates, invoiced ' +
      'revenue, cash received, pending payments, refunds and credits, provider fees, settlement, balances, job ' +
      'costs, estimated profit), the records and states it includes and those it leaves out, and how a value that ' +
      'is not known is shown (incomplete or unavailable, never zero). Figures of two bases are never added ' +
      'together: no mixed "cash" (HH-DATA-10). The Owner Dashboard and its CSV (TSK-0096) read these definitions.',
    permission: 'dashboard.view',
    schema: { querystring: NO_QUERY, response: { 200: REPORTS } },
    handler: async () => ({
      body: { reports: REPORT_DEFINITIONS.map((d) => sourceStatement(d.id)) },
      headers: { 'cache-control': 'no-store' },
    }),
  }

  return { name: 'job-costs', routes: [view, record, voidRoute, confirm, reopen, sources] }
}

export const JOB_COSTS_MODULE = jobCostsModule()
