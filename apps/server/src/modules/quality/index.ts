// Quality module (TSK-0084; HH-QA-02, HH-QA-04, HH-QA-09, HH-FIN-05, T55, T56, ENT-QAInspection, ENT-PunchItem,
// OWN-DEC-64, OWN-DEC-109, RULE-SAFETY-GATES, RULE-SERVER-AUTHZ).
//   GET  /staff/quality-reviews                                   jobs awaiting review or with punch items (the Owner)
//   GET  /staff/jobs/:jobId/quality-review                        the review screen (the Owner)
//   POST /staff/jobs/:jobId/quality-review/actions/start          start the review (pending -> in_review)
//   POST /staff/jobs/:jobId/quality-review/punch-items            record a punch item
//   POST /staff/jobs/:jobId/quality-review/actions/decide         the area results: passed, or punch work
//   GET  /staff/jobs/:jobId/punch-items                           a worker's own punch items on the job
//   POST /staff/punch-items/:punchItemId/actions/correct          the assigned worker's correction and evidence
//   POST /staff/punch-items/:punchItemId/actions/recheck          the Owner's re-check: passed or failed
// - The Owner reviews every job (quality.review); assigned workers correct (quality.correct_punch_item); the verifier
//   is never the corrector except on the Owner's own job (self-review). The final invoice reads the review through
//   finance.invoice_quality_gate (migration 0082); nothing here issues or changes an invoice.
// - A safety concern names the job's open critical safety hold (Stop Work / Report Hazard): nothing here raises,
//   releases or weakens a hold, and the item is re-checked only once the hold is resolved through its own path.
// - Every write is audited with identifiers and codes only; no note or description enters the audit summary.
import type { Tx } from '@handyhub/db'
import type { AreaResult, QualityReviewArea } from '@handyhub/domain'
import type { StaffActor } from '@handyhub/policy'
import { ApiError } from '../../api/errors.js'
import type { ApiContext, ApiModule, RouteDef } from '../../api/route.js'
import { jobAssignments } from '../packets/assignments.js'
import {
  CORRECT_BODY,
  DECIDE_BODY,
  EMPTY_BODY,
  ITEM_PARAMS,
  JOB_PARAMS,
  NO_QUERY,
  OWN_ITEMS,
  PUNCH_BODY,
  PUNCH_RESULT,
  RECHECK_BODY,
  REVIEW_LIST,
  REVIEW_RESULT,
  REVIEW_VIEW,
} from './schemas.js'
import {
  addPunchItem,
  correctPunchItem,
  decideReview,
  ownPunchItems,
  recheckPunchItem,
  reviewList,
  reviewView,
  startReview,
  type PunchInput,
  type ReviewRow,
} from './store.js'

export { openQualityReview } from './store.js'

const TEST = 'test/integration/quality-review.test.ts'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function staff(ctx: ApiContext): StaffActor {
  if (ctx.actor.kind !== 'staff') throw new ApiError('FORBIDDEN')
  return ctx.actor
}

const jobFacts: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const { jobId } = req.params as { jobId: string }
  if (!UUID_RE.test(jobId)) return null
  const j = await db.selectFrom('work.jobs').select('project_id').where('id', '=', jobId).executeTakeFirst()
  return j ? { projectId: j.project_id, assignments: await jobAssignments(db, jobId) } : null
}
const itemFacts: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const { punchItemId } = req.params as { punchItemId: string }
  if (!UUID_RE.test(punchItemId)) return null
  const i = await db
    .selectFrom('quality.punch_items')
    .select(['job_id', 'project_id'])
    .where('id', '=', punchItemId)
    .executeTakeFirst()
  return i ? { projectId: i.project_id, assignments: await jobAssignments(db, i.job_id) } : null
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
  test: TEST,
} as const

const reviewResult = (r: ReviewRow, jobState: string) => ({
  jobId: r.job_id,
  state: r.state,
  jobState,
  version: r.version,
})
async function jobStateOf(tx: Tx, jobId: string): Promise<string> {
  const j = await tx
    .selectFrom('work.jobs')
    .select('operational_state')
    .where('id', '=', jobId)
    .executeTakeFirstOrThrow()
  return j.operational_state
}

export function qualityModule(): ApiModule {
  const list: RouteDef = {
    ...read,
    path: '/staff/quality-reviews',
    operationId: 'listQualityReviews',
    summary: 'Jobs awaiting quality review or with punch items',
    description:
      'Staff with quality.review (the Owner). Every job awaiting quality review and every job with a punch item not ' +
      're-checked (at most 200, by project reference): the review state, the punch items still to re-check (and how ' +
      'many are major) and the earliest due date.',
    permission: 'quality.review',
    schema: { querystring: NO_QUERY, response: { 200: REVIEW_LIST } },
    handler: async (ctx) => ({ body: { reviews: await reviewList(ctx.db) } }),
  }

  const view: RouteDef = {
    ...read,
    path: '/staff/jobs/:jobId/quality-review',
    operationId: 'getQualityReview',
    summary: "A job's quality review",
    description:
      'Staff with quality.review (the Owner). What the Owner reviews (HH-QA-02): the approved scope lines, the work ' +
      'packages, the before/after photo counts, whether a checklist and a walkthrough are recorded (TSK-0075, ' +
      'TSK-0083), the open critical safety holds of the job; the review (state, reviewer, self-review, the area ' +
      'results), the final-invoice gate it gives, every punch item with its correction and re-check, the history, ' +
      'the workers an item may be assigned to and the actions the caller may take.',
    permission: 'quality.review',
    resource: jobFacts,
    schema: { params: JOB_PARAMS, querystring: NO_QUERY, response: { 200: REVIEW_VIEW } },
    handler: async (ctx) => {
      const v = await reviewView(ctx.db, staff(ctx), (ctx.req.params as { jobId: string }).jobId)
      if (!v) throw new ApiError('NOT_FOUND')
      return { body: v, headers: { 'cache-control': 'no-store' } }
    },
  }

  const start: RouteDef = {
    ...write,
    path: '/staff/jobs/:jobId/quality-review/actions/start',
    operationId: 'startQualityReview',
    summary: 'Start the quality review of a job',
    description:
      'Staff with quality.review (the Owner), on a job awaiting quality review (CONFLICT JOB_NOT_AWAITING_REVIEW ' +
      'otherwise): pending -> in_review with the caller as the reviewer. Marked self-review when the reviewer started ' +
      'work on the job (OWN-DEC-64). Once only (REVIEW_ALREADY_STARTED).',
    permission: 'quality.review',
    audit: 'quality.start_review',
    resource: jobFacts,
    schema: { params: JOB_PARAMS, body: EMPTY_BODY, response: { 200: REVIEW_RESULT } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const { jobId } = ctx.req.params as { jobId: string }
      const r = await startReview(tx, staff(ctx), jobId)
      await ctx.audit({
        target: { type: 'quality_review', id: r.id, version: r.version },
        summary: { jobId, selfReview: r.self_review },
      })
      return { body: reviewResult(r, await jobStateOf(tx, jobId)), version: r.version }
    },
  }

  const punch: RouteDef = {
    ...write,
    path: '/staff/jobs/:jobId/quality-review/punch-items',
    operationId: 'addPunchItem',
    summary: 'Record a punch item',
    description:
      'Staff with quality.manage_punch_items (the Owner), while the review is in review, asks for punch work or ' +
      'waits for re-check (a new item then sends it back to punch work). The problem, its kind (finish or cleanup: ' +
      'minor; defect, incomplete scope, failed check or safety concern: major, OWN-DEC-64), the work package of the ' +
      'job or a named area, the required correction evidence, an active worker to correct it and a due date. A ' +
      "safety concern names the job's open critical safety hold (report it first through Stop Work / Report " +
      'Hazard: SAFETY_HOLD_REQUIRED). Opens the punch-items queue item.',
    permission: 'quality.manage_punch_items',
    audit: 'quality.add_punch_item',
    resource: jobFacts,
    schema: { params: JOB_PARAMS, body: PUNCH_BODY, response: { 201: PUNCH_RESULT } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const { jobId } = ctx.req.params as { jobId: string }
      const out = await addPunchItem(tx, staff(ctx), jobId, ctx.req.body as PunchInput)
      await ctx.audit({
        target: { type: 'punch_item', id: out.item.id, version: out.item.version },
        summary: { jobId, kind: out.item.kind, severity: out.item.severity },
      })
      return {
        status: 201,
        body: {
          punchItemId: out.item.id,
          state: out.item.state,
          reviewState: out.review.state,
          version: out.item.version,
        },
        version: out.item.version,
      }
    },
  }

  const decision: RouteDef = {
    ...write,
    path: '/staff/jobs/:jobId/quality-review/actions/decide',
    operationId: 'decideQualityReview',
    summary: 'Decide the quality review',
    description:
      'Staff with quality.review (the Owner), with If-Match (the review version), on a review in review: a result ' +
      '(ok or problem) for the scope, the checklist, the before/after evidence and the walkthrough, and an optional ' +
      'note. With no punch item and every area ok the review passes and the job becomes operationally complete ' +
      '(HH-QA-09); with punch items it asks for punch work (the final invoice then follows the items: blocked while ' +
      'a major one is not re-checked, the Owner only while only minor ones remain). A problem with no punch item is ' +
      'refused (PROBLEM_NEEDS_PUNCH_ITEM): every problem becomes a punch item.',
    permission: 'quality.review',
    audit: 'quality.decide_review',
    expectedVersion: 'required',
    resource: jobFacts,
    schema: { params: JOB_PARAMS, body: DECIDE_BODY, response: { 200: REVIEW_RESULT } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const { jobId } = ctx.req.params as { jobId: string }
      const b = ctx.req.body as { results: Record<QualityReviewArea, AreaResult>; note?: string }
      const r = await decideReview(tx, staff(ctx), jobId, ctx.expectedVersion(), b)
      await ctx.audit({
        target: { type: 'quality_review', id: r.id, version: r.version },
        summary: { jobId, state: r.state, ...b.results },
      })
      return { body: reviewResult(r, await jobStateOf(tx, jobId)), version: r.version }
    },
  }

  const own: RouteDef = {
    ...read,
    path: '/staff/jobs/:jobId/punch-items',
    operationId: 'listOwnPunchItems',
    summary: "The caller's punch items on a job",
    description:
      'Staff with quality.correct_punch_item on the job (a worker assigned to it, inside the access window). Only ' +
      'the punch items assigned to the caller, with what to correct, the required evidence and the due date.',
    permission: 'quality.correct_punch_item',
    resource: jobFacts,
    schema: { params: JOB_PARAMS, querystring: NO_QUERY, response: { 200: OWN_ITEMS } },
    handler: async (ctx) => {
      const { jobId } = ctx.req.params as { jobId: string }
      return { body: { punchItems: await ownPunchItems(ctx.db, staff(ctx), jobId) } }
    },
  }

  const correct: RouteDef = {
    ...write,
    path: '/staff/punch-items/:punchItemId/actions/correct',
    operationId: 'correctPunchItem',
    summary: 'Record the correction of a punch item',
    description:
      'Staff with quality.correct_punch_item (the worker the item is assigned to, assigned to the job inside the ' +
      'access window), with If-Match: open -> corrected with what was done and the evidence. When no item stays ' +
      "open the review waits for the Owner's re-check.",
    permission: 'quality.correct_punch_item',
    audit: 'quality.correct_punch_item',
    expectedVersion: 'required',
    resource: itemFacts,
    schema: { params: ITEM_PARAMS, body: CORRECT_BODY, response: { 200: PUNCH_RESULT } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const { punchItemId } = ctx.req.params as { punchItemId: string }
      const { note } = ctx.req.body as { note: string }
      const out = await correctPunchItem(tx, staff(ctx), punchItemId, ctx.expectedVersion(), note)
      await ctx.audit({
        target: { type: 'punch_item', id: punchItemId, version: out.item.version },
        summary: { jobId: out.item.job_id, reviewState: out.review.state },
      })
      return {
        body: { punchItemId, state: out.item.state, reviewState: out.review.state, version: out.item.version },
        version: out.item.version,
      }
    },
  }

  const recheck: RouteDef = {
    ...write,
    path: '/staff/punch-items/:punchItemId/actions/recheck',
    operationId: 'recheckPunchItem',
    summary: 'Re-check a corrected punch item',
    description:
      'Staff with quality.manage_punch_items (the Owner), with If-Match, on a corrected item: passed (rechecked) or ' +
      'failed (open again, the correction cleared; the note is kept in the history). Never by the person who ' +
      'corrected it, except on a self-review (RECHECKER_CORRECTED). A safety concern passes only once its safety ' +
      'hold is resolved (SAFETY_HOLD_UNRESOLVED). The last passed re-check passes the review and the job becomes ' +
      'operationally complete.',
    permission: 'quality.manage_punch_items',
    audit: 'quality.recheck_punch_item',
    expectedVersion: 'required',
    resource: itemFacts,
    schema: { params: ITEM_PARAMS, body: RECHECK_BODY, response: { 200: PUNCH_RESULT } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const { punchItemId } = ctx.req.params as { punchItemId: string }
      const b = ctx.req.body as { passed: boolean; note: string }
      const out = await recheckPunchItem(tx, staff(ctx), punchItemId, ctx.expectedVersion(), b)
      await ctx.audit({
        target: { type: 'punch_item', id: punchItemId, version: out.item.version },
        summary: { jobId: out.item.job_id, passed: b.passed, reviewState: out.review.state },
      })
      return {
        body: { punchItemId, state: out.item.state, reviewState: out.review.state, version: out.item.version },
        version: out.item.version,
      }
    },
  }

  return { name: 'quality', routes: [list, view, start, punch, decision, own, correct, recheck] }
}
