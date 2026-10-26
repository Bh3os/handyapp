// Job margin module (TSK-0131; HH-FIN-20, HH-FIN-17, OWN-DEC-189, FACT-MARGIN-TARGET, RULE-MONEY-CENTS,
// RULE-NO-INVENTED-FACTS, RULE-SERVER-AUTHZ).
//   GET  /staff/labor-cost-rates             every staff member's labor cost rate entries (the Owner)
//   POST /staff/labor-cost-rates             the Owner enters a worker's rate from a date, with the reason
//   GET  /staff/settings/margin-target       the target gross margin in force
//   PUT  /staff/settings/margin-target       the Owner changes it (policy_values.change: fresh sign-in and a reason)
//   POST /staff/jobs/:jobId/margin-reviews   the Owner records why a job is below the target
// - A job's margin is shown with its costs (GET /staff/jobs/:jobId/costs, job_cost.view). The flag is advisory: no
//   route here or elsewhere refuses anything because of it.
// - Every write is audited with identifiers only; amounts, rates and notes stay on their records.
import type { Tx } from '@handyhub/db'
import { localDateOf, type MarginReason } from '@handyhub/domain'
import { sql } from 'kysely'
import { ApiError } from '../../api/errors.js'
import type { ApiContext, ApiModule, RouteDef } from '../../api/route.js'
import { loadConfig, recordPolicyVersion } from '../../platform/config/index.js'
import { FRESH_AUTH_MINUTES } from '../identity/sessions.js'
import { JOB_COSTS_VIEW, JOB_PARAMS } from '../job-costs/schemas.js'
import { jobCostsReport, jobCostsView, jobOf } from '../job-costs/store.js'
import { businessZone } from '../visits/visits.js'
import { marginTarget, recordMarginReview } from './margin.js'
import { laborRatesView, recordLaborRate, type RateInput } from './rates.js'
import { LABOR_RATES_VIEW, RATE_BODY, REVIEW_BODY, TARGET_BODY, TARGET_SETTING } from './schemas.js'

const TEST = 'test/integration/job-margin.test.ts'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function staff(ctx: ApiContext) {
  if (ctx.actor.kind !== 'staff') throw new ApiError('FORBIDDEN')
  return ctx.actor
}

const jobFacts: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const { jobId } = req.params as { jobId: string }
  if (!UUID_RE.test(jobId)) return null
  const j = await jobOf(db, jobId)
  return j ? { projectId: j.project_id } : null
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
  actors: ['staff'],
  kind: 'write',
  idempotency: 'required',
  rateLimit: 'none',
  pagination: false,
  test: TEST,
} as const

const today = async (db: ApiContext['db'] | Tx) => localDateOf(new Date(), businessZone(await loadConfig(db)).zone)
const targetSetting = async (db: ApiContext['db'] | Tx) => {
  const { state, version, targetBps, sourceIds } = marginTarget(await loadConfig(db))
  return { state, version, targetBps, sourceIds }
}

export function jobMarginModule(): ApiModule {
  const rates: RouteDef = {
    ...read,
    path: '/staff/labor-cost-rates',
    operationId: 'listLaborCostRates',
    summary: "Every staff member's labor cost rates",
    description:
      'The Owner (labor_rate.manage). Each staff member who is not disabled (and anyone with a rate), with the rate ' +
      'in force today (business time zone) and every rate entered, newest first: the labor cost per hour and the ' +
      'employee burden per hour where known (null: not known), integer cents, from a local date. No rate exists ' +
      'until the Owner enters one (OWN-DEC-189): a time with no rate is NOT CONFIGURED in the job cost report.',
    permission: 'labor_rate.manage',
    schema: { response: { 200: LABOR_RATES_VIEW } },
    handler: async (ctx) => ({
      body: await laborRatesView(ctx.db, await today(ctx.db)),
      headers: { 'cache-control': 'no-store' },
    }),
  }

  const enterRate: RouteDef = {
    ...write,
    method: 'POST',
    path: '/staff/labor-cost-rates',
    operationId: 'recordLaborCostRate',
    summary: "Enter a worker's labor cost rate",
    description:
      "The Owner (labor_rate.manage). A staff member's labor cost per hour (integer cents, 0 to 100000, PROPOSED " +
      'limit; 0: the time carries no labor cost, e.g. a subcontractor whose cost is entered as a direct job cost) ' +
      'and the employee burden per hour where known (null: not known, so burden stays NOT CONFIGURED), from a local ' +
      'date, with the reason. It applies to visits on or after that date until a later entry; nothing is changed or ' +
      'deleted. The database accepts it only from a live Owner. Audited without the amounts. Answers the list.',
    expectedVersion: 'none',
    permission: 'labor_rate.manage',
    audit: 'labor_rate.record',
    schema: { body: RATE_BODY, response: { 201: LABOR_RATES_VIEW } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const b = ctx.req.body as RateInput
      const out = await recordLaborRate(tx, staff(ctx), b)
      await ctx.audit({
        target: { type: 'labor_cost_rate', id: out.id },
        summary: { staffUserId: b.staffUserId, effectiveOn: b.effectiveOn, burdenKnown: b.burdenCents !== null },
      })
      return { status: 201, body: await laborRatesView(tx, await today(tx)) }
    },
  }

  const target: RouteDef = {
    ...read,
    path: '/staff/settings/margin-target',
    operationId: 'getMarginTarget',
    summary: 'The target gross margin per job',
    description:
      'Staff with job_cost.view (the Owner). The target in force (job_margin.target, basis points: 3000 is 30%, ' +
      'FACT-MARGIN-TARGET), its version and sources. A job whose final margin is below it is flagged: advisory, ' +
      'never a block. NOT CONFIGURED raises no flag. ETag: the configuration version.',
    permission: 'job_cost.view',
    schema: { response: { 200: TARGET_SETTING } },
    handler: async (ctx) => {
      const body = await targetSetting(ctx.db)
      return { body, version: body.version ?? 0 }
    },
  }

  const setTarget: RouteDef = {
    ...write,
    method: 'PUT',
    path: '/staff/settings/margin-target',
    operationId: 'setMarginTarget',
    summary: 'Change the target gross margin (Owner only)',
    description:
      'The Owner only (policy_values.change: a fresh sign-in within ' +
      `${FRESH_AUTH_MINUTES} minutes and a written reason), with If-Match: the configuration version shown. Records ` +
      'the next version of job_margin.target (basis points, 1 to 9999) citing OWN-DEC-189; jobs are flagged against ' +
      'it from then on, and reasons recorded against the earlier target are no longer current. Audited with the old ' +
      'and new value.',
    permission: 'policy_values.change',
    freshAuthMinutes: FRESH_AUTH_MINUTES,
    expectedVersion: 'required',
    audit: 'job_margin.change_target',
    schema: { body: TARGET_BODY, response: { 200: TARGET_SETTING } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const actor = staff(ctx)
      const { targetBps, reason } = ctx.req.body as { targetBps: number; reason: string }
      // The same lock recordPolicyVersion takes, so the version compared is the one superseded.
      await sql`SELECT pg_advisory_xact_lock(hashtext(${'policy_version:job_margin.target'}))`.execute(tx)
      const before = await targetSetting(tx)
      if (ctx.expectedVersion() !== (before.version ?? 0))
        throw new ApiError('STALE_VERSION', { current: { version: before.version ?? 0 } })
      const version = await recordPolicyVersion(tx, {
        key: 'job_margin.target',
        value: { targetBps },
        sourceIds: ['OWN-DEC-189', 'FACT-MARGIN-TARGET'],
        changedBy: actor.userId,
        reason: reason.trim(),
      })
      await ctx.audit({
        target: { type: 'policy_version', id: 'job_margin.target', version },
        summary: { fromBps: before.targetBps, toBps: targetBps, previousVersion: before.version },
        reason: reason.trim(),
        stepUpUsed: true,
      })
      return { body: await targetSetting(tx), version }
    },
  }

  const review: RouteDef = {
    ...write,
    method: 'POST',
    path: '/staff/jobs/:jobId/margin-reviews',
    operationId: 'recordJobMarginReview',
    summary: 'Record why a job is below the target margin',
    description:
      'The Owner (job_margin.review; OWN-DEC-189 item 13). A reason (underpricing, material overrun, additional ' +
      "labor, site conditions, or other with a note: NOTE_REQUIRED) recorded against the job's current final " +
      'margin; only for a job whose final margin is below the target (MARGIN_NOT_BELOW_TARGET). Never changed; a ' +
      "later change of the figures asks for a new reason. Audited. Answers the job's costs and margin.",
    expectedVersion: 'none',
    permission: 'job_margin.review',
    audit: 'job_margin.review',
    resource: jobFacts,
    schema: { params: JOB_PARAMS, body: REVIEW_BODY, response: { 201: JOB_COSTS_VIEW } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const actor = staff(ctx)
      const { jobId } = ctx.req.params as { jobId: string }
      const b = ctx.req.body as { reason: MarginReason; note?: string }
      // The job's row lock: a cost write or confirmation commits strictly before or after this reason.
      await tx.selectFrom('work.jobs').select('id').where('id', '=', jobId).forNoKeyUpdate().executeTakeFirst()
      const report = await jobCostsReport(tx, actor, jobId)
      const out = await recordMarginReview(tx, actor, report.job, report.margin, {
        reason: b.reason,
        note: b.note ?? null,
      })
      await ctx.audit({
        target: { type: 'job', id: jobId },
        summary: { projectId: report.job.project_id, reviewId: out.id, reason: b.reason },
      })
      return { status: 201, body: await jobCostsView(tx, actor, jobId) }
    },
  }

  return { name: 'job-margin', routes: [rates, enterRate, target, setTarget, review] }
}

export const JOB_MARGIN_MODULE = jobMarginModule()
