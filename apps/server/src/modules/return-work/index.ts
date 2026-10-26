// Return work module (TSK-0094; HH-QA-07, HH-QA-08, HH-FIN-17, T56, ENT-Case, ENT-Visit, ENT-Job, FACT-WARRANTY,
// OWN-DEC-124, OWN-DEC-135, RULE-HUMAN-REVIEW, RULE-MONEY-CENTS, RULE-SERVER-AUTHZ).
//   GET  /staff/cases/:caseId/return-work                 a case's return work (case.view, its detail only)
//   PUT  /staff/cases/:caseId/return-work                 classify or reclassify (the case's handling rule)
//   POST /staff/return-work/:returnWorkId/actions/decide  the Owner's coverage and price decision (case.triage)
//   POST /staff/return-work/:returnWorkId/return-visits   plan a linked return visit (purpose return_work)
//   POST /staff/return-work/:returnWorkId/return-visits/link        link a return visit already planned
//   PUT  /staff/return-work/:returnWorkId/return-job      link (or unlink) a return job of the same customer
//   POST /staff/return-work/:returnWorkId/items           a return-visit punch item (quality.manage_punch_items)
//   POST /staff/return-work-items/:itemId/actions/{correct,recheck}  the assigned worker's correction on a return
//                                                         visit they started; the Owner's re-check
//   POST /staff/return-work/:returnWorkId/costs; /staff/return-work-costs/:costId/actions/void   costs in cents
//   GET  /staff/jobs/:jobId/return-work-items             the caller's own return-visit punch items on a job
// - Classifying is people's; the one rule applied is the decided warranty window (FACT-WARRANTY). Coverage and price
//   are the Owner's decision, never applied automatically; no exclusion exists and no amount is recorded with it.
// - Return work never reopens the original job: a return visit starts through the Start Work gate without moving the
//   job (start module), and its items, costs and time stay apart from the job's completion evidence and costs.
// - Every write is audited with identifiers and codes only; notes stay on their records.
import type { Tx } from '@handyhub/db'
import type { CoverageDecision, PriceDecision, ReturnCostKind } from '@handyhub/domain'
import type { StaffActor } from '@handyhub/policy'
import { ApiError } from '../../api/errors.js'
import type { ApiContext, ApiModule, RouteDef } from '../../api/route.js'
import { jobAssignments } from '../packets/assignments.js'
import {
  CASE_PARAMS,
  CLASSIFY_BODY,
  CLASSIFY_RESULT,
  CORRECT_BODY,
  COST_BODY,
  COST_PARAMS,
  COST_RESULT,
  DECISION_BODY,
  ITEM_BODY,
  ITEM_PARAMS,
  ITEM_RESULT,
  JOB_PARAMS,
  LINK_VISIT_BODY,
  NO_QUERY,
  OWN_ITEMS,
  RECHECK_BODY,
  RESULT,
  RETURN_JOB_BODY,
  RETURN_VISIT_BODY,
  RETURN_WORK_PARAMS,
  RETURN_WORK_VIEW,
  VISIT_RESULT,
  VOID_BODY,
} from './schemas.js'
import {
  addCost,
  addItem,
  classify,
  correctItem,
  costOf,
  decide,
  itemOf,
  linkReturnJob,
  linkReturnVisit,
  ownReturnItems,
  planReturnVisit,
  readReturnWork,
  recheckItem,
  returnWorkView,
  voidCost,
  type ClassifyInput,
  type ItemInput,
  type ReturnVisitInput,
} from './store.js'

const TEST = 'test/integration/return-work.test.ts'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function staff(ctx: ApiContext): StaffActor {
  if (ctx.actor.kind !== 'staff') throw new ApiError('FORBIDDEN')
  return ctx.actor
}

const caseFacts: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const { caseId } = req.params as { caseId: string }
  if (!UUID_RE.test(caseId)) return null
  const c = await db.selectFrom('quality.cases').select('project_id').where('id', '=', caseId).executeTakeFirst()
  return c ? { projectId: c.project_id } : null
}
const workFacts: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const { returnWorkId } = req.params as { returnWorkId: string }
  if (!UUID_RE.test(returnWorkId)) return null
  const r = await readReturnWork(db, returnWorkId)
  return r ? { projectId: r.project_id } : null
}
const itemFacts: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const { itemId } = req.params as { itemId: string }
  if (!UUID_RE.test(itemId)) return null
  const i = await itemOf(db, itemId)
  return i ? { projectId: i.project_id, assignments: await jobAssignments(db, i.job_id) } : null
}
const costFacts: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const { costId } = req.params as { costId: string }
  if (!UUID_RE.test(costId)) return null
  const k = await costOf(db, costId)
  return k ? { projectId: k.project_id } : null
}
const jobFacts: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const { jobId } = req.params as { jobId: string }
  if (!UUID_RE.test(jobId)) return null
  const j = await db.selectFrom('work.jobs').select('project_id').where('id', '=', jobId).executeTakeFirst()
  return j ? { projectId: j.project_id, assignments: await jobAssignments(db, jobId) } : null
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

const HANDLING =
  'Staff who work the case (case.manage: on a complaint the Owner or Office; on a restricted case the Owner only). '

export function returnWorkModule(): ApiModule {
  const view: RouteDef = {
    ...read,
    path: '/staff/cases/:caseId/return-work',
    operationId: 'getCaseReturnWork',
    summary: "A case's return work",
    description:
      'Staff with case.view who see the case detail (a restricted case: the Owner only, OWN-DEC-143). The return ' +
      'work of the case, or null before it is classified, with the warranty window as the server reads it now (the ' +
      "local date the job's quality review passed, the report date and whether the report is inside the 90 days of " +
      "FACT-WARRANTY), the original job (its state is never changed by return work), the Owner's coverage and price " +
      'decision, the linked return visits and return job, the return-visit punch items, the costs in cents with ' +
      'their total, the elapsed time on the return visits (labor cost incomplete: no rate applies here), the history ' +
      'and the actions the caller may take.',
    permission: 'case.view',
    resource: caseFacts,
    schema: { params: CASE_PARAMS, querystring: NO_QUERY, response: { 200: RETURN_WORK_VIEW } },
    handler: async (ctx) => {
      const { caseId } = ctx.req.params as { caseId: string }
      return { body: await returnWorkView(ctx.db, staff(ctx), caseId), headers: { 'cache-control': 'no-store' } }
    },
  }

  const classifyRoute: RouteDef = {
    ...write,
    method: 'PUT',
    path: '/staff/cases/:caseId/return-work',
    operationId: 'classifyReturnWork',
    summary: "Classify a case's return work",
    description:
      HANDLING +
      'With If-Match: 0 before the first classification, then the version shown. One of open_punch, ' +
      'workmanship_callback, warranty_claim, new_scope, customer_change_or_damage, product_issue, unresolved, with ' +
      'an optional note. A workmanship problem (workmanship_callback or warranty_claim) is recorded as warranty_claim ' +
      'when reported within 90 days of the reviewed completion date (FACT-WARRANTY, OWN-DEC-135) and as ' +
      "workmanship_callback after them; before the job's quality review passed it is refused (REVIEW_NOT_PASSED: an " +
      'open punch item of the review), and open_punch after the review passed (REVIEW_ALREADY_PASSED). Classifying ' +
      'decides no coverage or price. Refused on a closed case (CASE_CLOSED) or a case with no job (NO_JOB).',
    permission: 'case.manage',
    audit: 'return_work.classify',
    expectedVersion: 'required',
    resource: caseFacts,
    schema: { params: CASE_PARAMS, body: CLASSIFY_BODY, response: { 200: CLASSIFY_RESULT } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const { caseId } = ctx.req.params as { caseId: string }
      const out = await classify(tx, staff(ctx), caseId, ctx.expectedVersion(), ctx.req.body as ClassifyInput)
      await ctx.audit({
        target: { type: 'return_work', id: out.id, version: out.version },
        summary: { projectId: out.case.project_id, caseId, classification: out.classification },
      })
      return {
        body: { returnWorkId: out.id, classification: out.classification, version: out.version },
        version: out.version,
      }
    },
  }

  const decision: RouteDef = {
    ...write,
    path: '/staff/return-work/:returnWorkId/actions/decide',
    operationId: 'decideReturnWork',
    summary: "The Owner's coverage and price decision",
    description:
      'Staff with case.triage (the Owner), with If-Match: coverage (covered or not_covered) and price (no_charge or ' +
      'chargeable) with the note saying why (RULE-HUMAN-REVIEW). Nothing applies coverage automatically, no ' +
      'exclusion exists, and chargeable records no amount: the work is priced through its own estimate or change ' +
      'order. A later decision replaces it; the history keeps both. Legal or financial exposure is for the Owner ' +
      'and their professional reviewer.',
    permission: 'case.triage',
    audit: 'return_work.decide',
    expectedVersion: 'required',
    resource: workFacts,
    schema: { params: RETURN_WORK_PARAMS, body: DECISION_BODY, response: { 200: RESULT } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const { returnWorkId } = ctx.req.params as { returnWorkId: string }
      const b = ctx.req.body as { coverage: CoverageDecision; price: PriceDecision; note: string }
      const out = await decide(tx, staff(ctx), returnWorkId, ctx.expectedVersion(), b)
      await ctx.audit({
        target: { type: 'return_work', id: returnWorkId, version: out.version },
        summary: { projectId: out.r.project_id, coverage: b.coverage, price: b.price },
      })
      return { body: { returnWorkId, version: out.version }, version: out.version }
    },
  }

  const planVisitRoute: RouteDef = {
    ...write,
    path: '/staff/return-work/:returnWorkId/return-visits',
    operationId: 'planReturnVisit',
    summary: 'Plan a return visit linked to the return work',
    description:
      HANDLING +
      'Also needs visit.offer_windows for work visits (the Owner, Office). Plans one tentative visit of the original ' +
      "job with purpose return_work, in the property's IANA zone (the same window rules as planning any visit), and " +
      'links it to the return work. It is confirmed, assigned and started like any work visit; its start never moves ' +
      'the original job (HH-QA-08). Nothing is shown to the customer or sent here.',
    permission: 'case.manage',
    audit: 'return_work.plan_visit',
    resource: workFacts,
    schema: { params: RETURN_WORK_PARAMS, body: RETURN_VISIT_BODY, response: { 201: VISIT_RESULT } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const { returnWorkId } = ctx.req.params as { returnWorkId: string }
      const out = await planReturnVisit(
        tx,
        staff(ctx),
        ctx.scope,
        returnWorkId,
        ctx.req.body as ReturnVisitInput,
        new Date(),
      )
      await ctx.audit({
        target: { type: 'return_work', id: returnWorkId, version: out.version },
        summary: { projectId: out.r.project_id, visitId: out.visitId },
      })
      return { status: 201, body: { returnWorkId, visitId: out.visitId, version: out.version }, version: out.version }
    },
  }

  const linkVisitRoute: RouteDef = {
    ...write,
    path: '/staff/return-work/:returnWorkId/return-visits/link',
    operationId: 'linkReturnVisit',
    summary: 'Link a return visit already planned',
    description:
      HANDLING +
      'Links a visit of the original job planned with purpose return_work (NOT_A_RETURN_VISIT otherwise) that no ' +
      'return work links yet (VISIT_ALREADY_LINKED).',
    permission: 'case.manage',
    audit: 'return_work.link_visit',
    resource: workFacts,
    schema: { params: RETURN_WORK_PARAMS, body: LINK_VISIT_BODY, response: { 201: VISIT_RESULT } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const { returnWorkId } = ctx.req.params as { returnWorkId: string }
      const { visitId } = ctx.req.body as { visitId: string }
      const out = await linkReturnVisit(tx, staff(ctx), returnWorkId, visitId)
      await ctx.audit({
        target: { type: 'return_work', id: returnWorkId, version: out.version },
        summary: { projectId: out.r.project_id, visitId },
      })
      return { status: 201, body: { returnWorkId, visitId, version: out.version }, version: out.version }
    },
  }

  const linkJobRoute: RouteDef = {
    ...write,
    method: 'PUT',
    path: '/staff/return-work/:returnWorkId/return-job',
    operationId: 'linkReturnJob',
    summary: 'Link a return job',
    description:
      HANDLING +
      'With If-Match. A return job is the job of another project of the same customer (new scope priced through its ' +
      'own estimate and approval), never the original job (NOT_A_RETURN_JOB); null unlinks it.',
    permission: 'case.manage',
    audit: 'return_work.link_job',
    expectedVersion: 'required',
    resource: workFacts,
    schema: { params: RETURN_WORK_PARAMS, body: RETURN_JOB_BODY, response: { 200: RESULT } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const { returnWorkId } = ctx.req.params as { returnWorkId: string }
      const { jobId } = ctx.req.body as { jobId: string | null }
      const out = await linkReturnJob(tx, staff(ctx), returnWorkId, ctx.expectedVersion(), jobId)
      await ctx.audit({
        target: { type: 'return_work', id: returnWorkId, version: out.version },
        summary: { projectId: out.r.project_id, returnJobId: jobId },
      })
      return { body: { returnWorkId, version: out.version }, version: out.version }
    },
  }

  const itemRoute: RouteDef = {
    ...write,
    path: '/staff/return-work/:returnWorkId/items',
    operationId: 'addReturnWorkItem',
    summary: 'Add a return-visit punch item',
    description:
      'Staff with quality.manage_punch_items (the Owner) who work the case. One problem to correct on a return ' +
      'visit: a work package of the original job or a named area (PLACE_REQUIRED), what to correct, the required ' +
      "correction evidence, an active worker and a due date. It is not a punch item of the job's passed quality " +
      'review, which stays as it was. The case closes only once every item passed its re-check.',
    permission: 'quality.manage_punch_items',
    audit: 'return_work.add_item',
    resource: workFacts,
    schema: { params: RETURN_WORK_PARAMS, body: ITEM_BODY, response: { 201: ITEM_RESULT } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const { returnWorkId } = ctx.req.params as { returnWorkId: string }
      const out = await addItem(tx, staff(ctx), returnWorkId, ctx.req.body as ItemInput)
      await ctx.audit({
        target: { type: 'return_work_item', id: out.itemId, version: out.version },
        summary: { projectId: out.r.project_id, returnWorkId },
      })
      return { status: 201, body: { itemId: out.itemId, state: 'open', version: out.version }, version: out.version }
    },
  }

  const correctRoute: RouteDef = {
    ...write,
    path: '/staff/return-work-items/:itemId/actions/correct',
    operationId: 'correctReturnWorkItem',
    summary: 'Record the correction of a return-visit punch item',
    description:
      'Staff with quality.correct_punch_item (the worker the item is assigned to, assigned to the job), with ' +
      'If-Match and what was done: open -> corrected, recorded on a linked return visit the worker started through ' +
      'the Start Work gate and is on now (START_RETURN_VISIT_FIRST otherwise).',
    permission: 'quality.correct_punch_item',
    audit: 'return_work.correct_item',
    expectedVersion: 'required',
    resource: itemFacts,
    schema: { params: ITEM_PARAMS, body: CORRECT_BODY, response: { 200: ITEM_RESULT } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const { itemId } = ctx.req.params as { itemId: string }
      const { note } = ctx.req.body as { note: string }
      const out = await correctItem(tx, staff(ctx), itemId, ctx.expectedVersion(), note)
      await ctx.audit({
        target: { type: 'return_work_item', id: itemId, version: out.version },
        summary: { jobId: out.item.job_id, visitId: out.visitId },
      })
      return { body: { itemId, state: out.state, version: out.version }, version: out.version }
    },
  }

  const recheckRoute: RouteDef = {
    ...write,
    path: '/staff/return-work-items/:itemId/actions/recheck',
    operationId: 'recheckReturnWorkItem',
    summary: 'Re-check a corrected return-visit punch item',
    description:
      'Staff with quality.manage_punch_items (the Owner), with If-Match and a note, on a corrected item: passed ' +
      '(rechecked) or failed (open again, the correction cleared; the note is kept in the history). Never by the ' +
      'person who corrected it (RECHECKER_CORRECTED).',
    permission: 'quality.manage_punch_items',
    audit: 'return_work.recheck_item',
    expectedVersion: 'required',
    resource: itemFacts,
    schema: { params: ITEM_PARAMS, body: RECHECK_BODY, response: { 200: ITEM_RESULT } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const { itemId } = ctx.req.params as { itemId: string }
      const b = ctx.req.body as { passed: boolean; note: string }
      const out = await recheckItem(tx, staff(ctx), itemId, ctx.expectedVersion(), b)
      await ctx.audit({
        target: { type: 'return_work_item', id: itemId, version: out.version },
        summary: { jobId: out.item.job_id, passed: b.passed },
      })
      return { body: { itemId, state: out.state, version: out.version }, version: out.version }
    },
  }

  const costRoute: RouteDef = {
    ...write,
    path: '/staff/return-work/:returnWorkId/costs',
    operationId: 'addReturnWorkCost',
    summary: 'Record a return-work cost',
    description:
      HANDLING +
      'A materials, purchase, rental or other cost of the return work in integer cents with a note, kept apart from ' +
      "the original job's costs so rework is visible (HH-FIN-17). Never changed; voided once with a reason.",
    permission: 'case.manage',
    audit: 'return_work.add_cost',
    resource: workFacts,
    schema: { params: RETURN_WORK_PARAMS, body: COST_BODY, response: { 201: COST_RESULT } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const { returnWorkId } = ctx.req.params as { returnWorkId: string }
      const b = ctx.req.body as { kind: ReturnCostKind; amountCents: number; note: string }
      const out = await addCost(tx, staff(ctx), returnWorkId, b)
      await ctx.audit({
        target: { type: 'return_work_cost', id: out.costId },
        summary: { projectId: out.r.project_id, returnWorkId, kind: b.kind, amountCents: b.amountCents },
      })
      return { status: 201, body: { costId: out.costId, returnWorkId } }
    },
  }

  const voidRoute: RouteDef = {
    ...write,
    path: '/staff/return-work-costs/:costId/actions/void',
    operationId: 'voidReturnWorkCost',
    summary: 'Void a return-work cost entered in error',
    description: HANDLING + 'With the reason; once (COST_VOIDED). The entry stays in the list as voided.',
    permission: 'case.manage',
    audit: 'return_work.void_cost',
    resource: costFacts,
    schema: { params: COST_PARAMS, body: VOID_BODY, response: { 200: COST_RESULT } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const { costId } = ctx.req.params as { costId: string }
      const { reason } = ctx.req.body as { reason: string }
      const out = await voidCost(tx, staff(ctx), costId, reason)
      await ctx.audit({ target: { type: 'return_work_cost', id: costId }, summary: { projectId: out.r.project_id } })
      return { body: { costId, returnWorkId: out.r.id } }
    },
  }

  const ownItems: RouteDef = {
    ...read,
    path: '/staff/jobs/:jobId/return-work-items',
    operationId: 'listOwnReturnWorkItems',
    summary: "The caller's return-visit punch items on a job",
    description:
      'Staff with quality.correct_punch_item on the job (a worker assigned to it, inside the access window). Only the ' +
      'return-visit punch items assigned to the caller, with what to correct, the required evidence, the due date ' +
      'and whether a correction can be recorded now (on a linked return visit the caller started).',
    permission: 'quality.correct_punch_item',
    resource: jobFacts,
    schema: { params: JOB_PARAMS, querystring: NO_QUERY, response: { 200: OWN_ITEMS } },
    handler: async (ctx) => {
      const { jobId } = ctx.req.params as { jobId: string }
      return { body: await ownReturnItems(ctx.db, staff(ctx), jobId), headers: { 'cache-control': 'no-store' } }
    },
  }

  return {
    name: 'return-work',
    routes: [
      view,
      classifyRoute,
      decision,
      planVisitRoute,
      linkVisitRoute,
      linkJobRoute,
      itemRoute,
      correctRoute,
      recheckRoute,
      costRoute,
      voidRoute,
      ownItems,
    ],
  }
}

export const RETURN_WORK_MODULE = returnWorkModule()
