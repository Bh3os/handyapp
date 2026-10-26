// Checklist module (TSK-0075; HH-WORK-11, HH-WORK-05, HH-WORK-12, T47, ENT-Task, OWN-DEC-108, RULE-SAFETY-GATES,
// RULE-SERVER-AUTHZ).
//   GET  /staff/jobs/:jobId/checklist                          the job's checklist for an assigned worker
//   POST /staff/jobs/:jobId/checklist/steps/<event>            start, pause, resume, complete, skip or reopen a step
//   POST /staff/jobs/:jobId/checklist/handoffs                 a handoff note
// - job.record_checklist_step: a worker (or the Owner) assigned to the job inside the access window; each write also
//   needs the caller's own Start Work on the job, the job and the work package in progress and no open hold.
// - Every write is audited with identifiers and codes only; no note, measurement or reason enters the audit summary.
import type { Tx } from '@handyhub/db'
import { CHECKLIST_STEP_MACHINE, type ChecklistStepEvent } from '@handyhub/domain'
import type { StaffActor } from '@handyhub/policy'
import { ApiError } from '../../api/errors.js'
import type { ApiContext, ApiModule, RouteDef } from '../../api/route.js'
import { loadConfig } from '../../platform/config/index.js'
import { offlineChecklistEvents } from '../field/offline-actions.js'
import { jobAssignments } from '../packets/assignments.js'
import {
  CHECKLIST_VIEW,
  HANDOFF_BODY,
  HANDOFF_RESULT,
  JOB_PARAMS,
  NO_QUERY,
  STEP_BODY,
  STEP_RESULT,
} from './schemas.js'
import { checklistView, recordHandoff, stepEvent, type StepInput } from './store.js'

export { checklistSummaries } from './store.js'

const TEST = 'test/integration/checklist.test.ts'
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

const EVENT_TEXT: Readonly<Record<ChecklistStepEvent, string>> = {
  start: 'not started -> in progress, once every step of the earlier stages is completed or skipped.',
  pause: 'in progress -> paused; the progress stays.',
  resume: 'paused -> in progress.',
  complete:
    'not started or in progress -> completed, with every evidence the step asks for: photoIds (field photos of this ' +
    'job and work package), a measurement, a note (EVIDENCE_MISSING otherwise).',
  skip: 'not started, in progress or paused -> skipped, with a reason; a skipped required step blocks completion.',
  reopen: 'completed or skipped -> in progress, with a reason; the earlier evidence is kept.',
}

export function checklistModule(): ApiModule {
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
    path: '/staff/jobs/:jobId/checklist',
    operationId: 'getJobChecklist',
    summary: "The job's checklist",
    description:
      'Staff with job.record_checklist_step: assigned to the job inside the access window. Per work package, the ' +
      'pinned SOP version in six ordered stages with every step verbatim, whether it is required, the evidence it ' +
      'asks for and the controls quoted before it; each step’s state, evidence, skip reason, worker and the actions ' +
      'the caller may take now; the current stage and the summary (required steps open or skipped). Also the job’s ' +
      'field photos to attach as evidence, the handoff notes, and what blocks the caller (JOB_NOT_IN_PROGRESS, ' +
      'HOLD_OPEN, WORK_NOT_STARTED). TSK-0115: the step events the phone may save offline (none until the Owner ' +
      'turns offline checklist steps on, field.offline_actions) and the visit of the caller’s latest Start Work.',
    permission: 'job.record_checklist_step',
    resource: jobFacts,
    schema: { params: JOB_PARAMS, querystring: NO_QUERY, response: { 200: CHECKLIST_VIEW } },
    handler: async (ctx) => {
      const actor = staff(ctx)
      const { jobId } = ctx.req.params as { jobId: string }
      const v = await checklistView(ctx.db, actor, jobId)
      if (!v) throw new ApiError('NOT_FOUND')
      // TSK-0115: what the phone may save offline, and the visit those drafts name (the caller's latest start).
      const started = await ctx.db
        .selectFrom('work.work_starts')
        .select('visit_id')
        .where('job_id', '=', jobId)
        .where('staff_user_id', '=', actor.userId)
        .orderBy('started_at', 'desc')
        .limit(1)
        .executeTakeFirst()
      const offline = { events: offlineChecklistEvents(await loadConfig(ctx.db)), visitId: started?.visit_id ?? null }
      return { body: { ...v, offline }, headers: { 'cache-control': 'no-store' } }
    },
  }

  const events: RouteDef[] = CHECKLIST_STEP_MACHINE.transitions.map(({ event }) => ({
    method: 'POST',
    actors: ['staff'],
    kind: 'write',
    idempotency: 'required',
    expectedVersion: 'none',
    rateLimit: 'none',
    pagination: false,
    test: TEST,
    path: `/staff/jobs/:jobId/checklist/steps/${event}`,
    operationId: `checklistStep${event[0]?.toUpperCase()}${event.slice(1)}`,
    summary: `Checklist step: ${event}`,
    description:
      `Staff with job.record_checklist_step, after their own Start Work on the job, while the job and the work ` +
      `package are in progress and no hold is open. The step (workPackageId, stepId) at the version shown (0 when ` +
      `not started): ${EVENT_TEXT[event]} Recorded with the caller as its worker; the history keeps every change.`,
    permission: 'job.record_checklist_step',
    audit: `checklist.${event}`,
    resource: jobFacts,
    schema: { params: JOB_PARAMS, body: STEP_BODY, response: { 200: STEP_RESULT } },
    handler: async (ctx) => {
      const { jobId } = ctx.req.params as { jobId: string }
      const out = await stepEvent(ctx.tx as Tx, staff(ctx), jobId, event, ctx.req.body as StepInput)
      await ctx.audit({
        target: { type: 'checklist_step', id: out.id, version: out.version },
        summary: { jobId, workPackageId: out.workPackageId, stepId: out.stepId, state: out.state },
      })
      return { body: out, version: out.version }
    },
  }))

  const handoff: RouteDef = {
    method: 'POST',
    actors: ['staff'],
    kind: 'write',
    idempotency: 'required',
    expectedVersion: 'none',
    rateLimit: 'none',
    pagination: false,
    test: TEST,
    path: '/staff/jobs/:jobId/checklist/handoffs',
    operationId: 'recordChecklistHandoff',
    summary: 'Hand the checklist over',
    description:
      'Staff with job.record_checklist_step, after their own Start Work on the job: a note for whoever continues ' +
      '(optionally a named worker and a work package). The steps keep their state and history; the next worker ' +
      'continues where the checklist stopped.',
    permission: 'job.record_checklist_step',
    audit: 'checklist.handoff',
    resource: jobFacts,
    schema: { params: JOB_PARAMS, body: HANDOFF_BODY, response: { 201: HANDOFF_RESULT } },
    handler: async (ctx) => {
      const { jobId } = ctx.req.params as { jobId: string }
      const b = ctx.req.body as { note: string; toWorkerId?: string; workPackageId?: string }
      const row = await recordHandoff(ctx.tx as Tx, staff(ctx), jobId, b)
      await ctx.audit({
        target: { type: 'checklist_handoff', id: row.id },
        summary: { jobId, toWorkerId: b.toWorkerId ?? null, workPackageId: b.workPackageId ?? null },
      })
      return { status: 201, body: { handoffId: row.id, at: new Date(row.at).toISOString() } }
    },
  }

  return { name: 'checklist', routes: [view, ...events, handoff] }
}
