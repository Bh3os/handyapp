// Completion: the walkthrough and the worker's Finished for a job (TSK-0083; HH-QA-01, HH-QA-03, HH-WORK-12, T55,
// ENT-Walkthrough, FACT-SVC-PHOTO-MINIMUM, OWN-DEC-75, OWN-DEC-109, RULE-SAFETY-GATES, RULE-SERVER-AUTHZ). One
// transaction under the job lock: the walkthrough (and, for a concern, the dispute case for the Owner), the completion,
// the job to ready_for_qa ("Awaiting quality review"), its work packages complete, and the Owner's review opened
// (TSK-0084). Migration 0084 refuses anything else whatever path writes.
import type { Db, Tx } from '@handyhub/db'
import {
  completionProblems,
  walkthroughProblems,
  type CompletionFacts,
  type ParticipantRole,
  type WalkthroughOutcome,
} from '@handyhub/domain'
import type { StaffActor } from '@handyhub/policy'
import { sql } from 'kysely'
import { ApiError } from '../../api/errors.js'
import { reportIncident } from '../cases/store.js'
import { checklistSummaries, workerCurrent } from '../checklist/store.js'
import { openQualityReview } from '../quality/store.js'

type Reader = Db | Tx
const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null)

async function facts(db: Reader, actor: StaffActor, jobId: string): Promise<CompletionFacts> {
  const job = await db
    .selectFrom('work.jobs')
    .select(['operational_state', 'project_id'])
    .where('id', '=', jobId)
    .executeTakeFirstOrThrow()
  const holds = await sql<{ n: number }>`SELECT work.start_blocking_holds(${job.project_id}::uuid) AS n`.execute(db)
  const started = await db
    .selectFrom('work.work_starts')
    .select('id')
    .where('job_id', '=', jobId)
    .where('staff_user_id', '=', actor.userId)
    .executeTakeFirst()
  const submitted = await db
    .selectFrom('work.job_completions')
    .select('id')
    .where('job_id', '=', jobId)
    .executeTakeFirst()
  const photos = await db
    .selectFrom('work.field_photos')
    .select(['work_package_id', 'phase', (eb) => eb.fn.countAll<string>().as('n')])
    .where('job_id', '=', jobId)
    .where('state', '<>', 'rejected')
    .groupBy(['work_package_id', 'phase'])
    .execute()
  const count = (wp: string, phase: string) =>
    Number(photos.find((p) => p.work_package_id === wp && p.phase === phase)?.n ?? 0)
  const checklists = await checklistSummaries(db, jobId)
  return {
    jobState: job.operational_state,
    holdsOpen: Number(holds.rows[0]?.n ?? 0),
    workStarted: started !== undefined,
    resumed: started === undefined || (await workerCurrent(db, jobId, actor.userId)),
    alreadySubmitted: submitted !== undefined,
    packages: checklists.map((c) => ({
      code: c.code,
      // A work package with no pinned SOP version has no checklist to complete: it is not complete (NOT CONFIGURED).
      checklistComplete: c.summary.complete && c.summary.steps > 0,
      beforePhotos: count(c.workPackageId, 'before'),
      afterPhotos: count(c.workPackageId, 'after'),
    })),
  }
}

/** What Finished needs now, and the walkthrough and submission once recorded. */
export async function completionView(db: Reader, actor: StaffActor, jobId: string) {
  const job = await db.selectFrom('work.jobs').select('operational_state').where('id', '=', jobId).executeTakeFirst()
  if (!job) return null
  const f = await facts(db, actor, jobId)
  const done = await db
    .selectFrom('work.job_completions as c')
    .innerJoin('work.walkthroughs as w', 'w.id', 'c.walkthrough_id')
    .leftJoin('identity.staff_users as u', 'u.id', 'c.worker_id')
    .leftJoin('quality.cases as k', 'k.id', 'w.case_id')
    .select([
      'c.submitted_at',
      'u.id as worker_id',
      'u.display_name',
      'w.outcome',
      'w.participant_name',
      'w.participant_role',
      'w.comments',
      'k.number as case_number',
    ])
    .where('c.job_id', '=', jobId)
    .executeTakeFirst()
  const problems = completionProblems(f)
  return {
    jobId,
    jobState: job.operational_state,
    packages: f.packages,
    problems,
    submission: done
      ? {
          submittedAt: iso(done.submitted_at) as string,
          worker: { id: done.worker_id as string, name: done.display_name },
          walkthrough: {
            outcome: done.outcome as WalkthroughOutcome,
            participantName: done.participant_name,
            participantRole: done.participant_role as ParticipantRole | null,
            comments: done.comments,
            caseNumber: done.case_number ?? null,
          },
        }
      : null,
    actions: { submit: problems.length === 0 },
  }
}

export type SubmitInput = {
  outcome: WalkthroughOutcome
  participantName?: string
  participantRole?: ParticipantRole
  comments?: string
}

/** Records the walkthrough and submits the job for the Owner's quality review (see the header). */
export async function submitCompletion(
  tx: Tx,
  actor: StaffActor,
  jobId: string,
  input: SubmitInput,
  requestId: string,
) {
  // Lock order as the case module takes it (a concern opens a case): the project, then the job.
  const head = await tx.selectFrom('work.jobs').select('project_id').where('id', '=', jobId).executeTakeFirst()
  if (!head) throw new ApiError('NOT_FOUND')
  await tx.selectFrom('crm.projects').select('id').where('id', '=', head.project_id).forUpdate().execute()
  const job = await tx
    .selectFrom('work.jobs')
    .select(['id', 'project_id', 'version'])
    .where('id', '=', jobId)
    .forUpdate()
    .executeTakeFirstOrThrow()
  const walkProblems = walkthroughProblems(input)
  if (walkProblems.length)
    throw new ApiError('VALIDATION_FAILED', {
      fieldErrors: walkProblems.map((code) => ({ field: 'body.walkthrough', code, message: '' })),
    })
  const problems = completionProblems(await facts(tx, actor, jobId))
  if (problems.length)
    throw new ApiError('CONFLICT', {
      fieldErrors: problems.map((p) => ({
        field: p.workPackage ? `job.${p.workPackage}` : 'job',
        code: p.code,
        message: '',
      })),
    })
  // A concern goes to the Owner as a dispute case (HH-QA-03, HH-QA-06); the case keeps the worker's words.
  const dispute =
    input.outcome === 'disputed'
      ? await reportIncident(
          tx,
          actor,
          { projectId: job.project_id, jobId },
          { type: 'dispute', source: 'walkthrough', whatHappened: (input.comments as string).trim() },
          requestId,
        )
      : null
  const visit = await tx
    .selectFrom('work.work_starts')
    .select('visit_id')
    .where('job_id', '=', jobId)
    .where('staff_user_id', '=', actor.userId)
    .orderBy('started_at', 'desc')
    .executeTakeFirst()
  const unavailable = input.outcome === 'customer_unavailable'
  const walkthrough = await tx
    .insertInto('work.walkthroughs')
    .values({
      job_id: jobId,
      project_id: job.project_id,
      visit_id: visit?.visit_id ?? null,
      outcome: input.outcome,
      participant_name: unavailable ? null : (input.participantName?.trim() ?? null),
      participant_role: unavailable ? null : (input.participantRole ?? null),
      comments: input.comments?.trim() ? input.comments.trim() : null,
      case_id: dispute?.id ?? null,
      worker_id: actor.userId,
    })
    .returning(['id', 'recorded_at'])
    .executeTakeFirstOrThrow()
  const completion = await tx
    .insertInto('work.job_completions')
    .values({ job_id: jobId, project_id: job.project_id, walkthrough_id: walkthrough.id, worker_id: actor.userId })
    .returning(['id', 'submitted_at'])
    .executeTakeFirstOrThrow()
  await tx
    .updateTable('work.jobs')
    .set({ operational_state: 'ready_for_qa', version: job.version + 1 })
    .where('id', '=', jobId)
    .execute()
  await tx
    .updateTable('work.work_packages')
    .set({ state: 'complete', version: sql<number>`version + 1` })
    .where('job_id', '=', jobId)
    .where('state', '=', 'in_progress')
    .execute()
  const review = await openQualityReview(tx, jobId)
  return {
    completionId: completion.id,
    walkthroughId: walkthrough.id,
    submittedAt: completion.submitted_at,
    caseId: dispute?.id ?? null,
    caseNumber: dispute?.number ?? null,
    reviewState: review.state,
    projectId: job.project_id,
  }
}
