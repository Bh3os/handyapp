// Completion module (TSK-0083; HH-QA-01, HH-QA-03, HH-WORK-12, T55, ENT-Walkthrough, OWN-DEC-75, OWN-DEC-109,
// RULE-SAFETY-GATES, RULE-SERVER-AUTHZ).
//   GET  /staff/jobs/:jobId/completion        what Finished needs now; the walkthrough and submission once recorded
//   POST /staff/jobs/:jobId/completion        the walkthrough and Finished: the job awaits the Owner's quality review
// - job.record_walkthrough: a worker (or the Owner) assigned to the job inside the access window, after their own
//   Start Work on the job. Every write is audited with identifiers and codes only, never the comments.
import type { Tx } from '@handyhub/db'
import type { StaffActor } from '@handyhub/policy'
import { ApiError } from '../../api/errors.js'
import type { ApiContext, ApiModule, RouteDef } from '../../api/route.js'
import { currentContext } from '../../platform/request-context.js'
import { jobAssignments } from '../packets/assignments.js'
import { COMPLETION_VIEW, JOB_PARAMS, NO_QUERY, SUBMIT_BODY, SUBMIT_RESULT } from './schemas.js'
import { completionView, submitCompletion, type SubmitInput } from './store.js'

const TEST = 'test/integration/completion.test.ts'
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

export function completionModule(): ApiModule {
  const view: RouteDef = {
    method: 'GET',
    actors: ['staff'],
    kind: 'read',
    idempotency: 'none',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'none',
    pagination: false,
    test: TEST,
    path: '/staff/jobs/:jobId/completion',
    operationId: 'getJobCompletion',
    summary: 'What Finished needs for a job',
    description:
      'Staff with job.record_walkthrough: assigned to the job inside the access window. Per work package, whether ' +
      'its checklist is complete and how many before and after photos it has; every problem that blocks Finished ' +
      '(CHECKLIST_INCOMPLETE, BEFORE_PHOTO_MISSING, AFTER_PHOTO_MISSING per package; JOB_NOT_IN_PROGRESS, HOLD_OPEN, ' +
      'WORK_NOT_STARTED, ALREADY_SUBMITTED); and, once submitted, the walkthrough and who submitted it when.',
    permission: 'job.record_walkthrough',
    resource: jobFacts,
    schema: { params: JOB_PARAMS, querystring: NO_QUERY, response: { 200: COMPLETION_VIEW } },
    handler: async (ctx) => {
      const v = await completionView(ctx.db, staff(ctx), (ctx.req.params as { jobId: string }).jobId)
      if (!v) throw new ApiError('NOT_FOUND')
      return { body: v, headers: { 'cache-control': 'no-store' } }
    },
  }

  const submit: RouteDef = {
    method: 'POST',
    actors: ['staff'],
    kind: 'write',
    idempotency: 'required',
    expectedVersion: 'none',
    rateLimit: 'none',
    pagination: false,
    test: TEST,
    path: '/staff/jobs/:jobId/completion',
    operationId: 'submitJobCompletion',
    summary: 'Record the walkthrough and submit the job for quality review',
    description:
      'Staff with job.record_walkthrough, after their own Start Work on the job. The walkthrough outcome: accepted ' +
      '("Everything looks good"), accepted_with_follow_up, disputed ("I have a concern") or customer_unavailable; ' +
      'the participant and their standing for every outcome but customer_unavailable (which names nobody and is never ' +
      'acceptance); comments, required for a concern or follow-up items. A concern opens a dispute case for the ' +
      'Owner. Then Finished: the job becomes ready_for_qa ("Awaiting quality review", never complete), its work ' +
      'packages complete, and the Owner’s quality review opens. Refused (CONFLICT, every problem named) unless every ' +
      'work package’s checklist is complete and has before and after photos, no hold is open, the job is in progress ' +
      'and not already submitted.',
    permission: 'job.record_walkthrough',
    audit: 'work.submit_completion',
    resource: jobFacts,
    schema: { params: JOB_PARAMS, body: SUBMIT_BODY, response: { 201: SUBMIT_RESULT } },
    handler: async (ctx) => {
      const { jobId } = ctx.req.params as { jobId: string }
      const b = ctx.req.body as SubmitInput
      const out = await submitCompletion(ctx.tx as Tx, staff(ctx), jobId, b, currentContext()?.requestId ?? ctx.req.id)
      await ctx.audit({
        target: { type: 'job', id: jobId },
        summary: { projectId: out.projectId, outcome: b.outcome, caseId: out.caseId, reviewState: out.reviewState },
      })
      return {
        status: 201,
        body: {
          completionId: out.completionId,
          walkthroughId: out.walkthroughId,
          submittedAt: new Date(out.submittedAt).toISOString(),
          jobState: 'ready_for_qa',
          caseNumber: out.caseNumber,
          reviewState: out.reviewState,
        },
      }
    },
  }

  return { name: 'completion', routes: [view, submit] }
}
