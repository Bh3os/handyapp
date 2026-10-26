// Visit authorizations (TSK-0145; OWN-DEC-193 A1, A4; OWN-DEC-208 reading 2; HH-SCH-06, ENT-Visit, ENT-Hold,
// RULE-SAFETY-GATES, RULE-HUMAN-REVIEW, RULE-SERVER-AUTHZ). Two recorded authorizations a tentative visit may need
// before it is offered or confirmed (migration 0120 keeps them true whatever path writes):
// - A1, the hazard-evaluation inspection: holds stay mandatory. While an intake review hold is open, the only visit of
//   its project that can be confirmed is one the Owner authorizes (visit.authorize_inspection), with a reason, as a
//   hazard-evaluation inspection naming the qualified person (and their qualification) and the safety conditions. It
//   covers the intake review holds open at that moment: they stay open and keep blocking every other visit and Start
//   Work. PROPOSED (OQ-VISIT-AMENDMENT-DETAILS): recorded on a site visit (purpose site_estimate, no work performed);
//   a review hold raised later, a job-level Hold and a critical safety hold still block it. The software records the
//   qualification; it never judges competence and HandyHub never performs licensed or hazardous work.
// - A4, the follow-up visit on a completed job: a work visit of a job whose work is complete is confirmed only with
//   its recorded basis (visit.authorize_follow_up): an existing contractual obligation, a warranty, the punch-list
//   process or an approved return-work authorization, with a note saying which. A warranty names the job's return work
//   classified as a warranty claim; a return-work authorization names the job's return work the Owner decided. New
//   paid work needs an approved estimate or change order instead (OWN-DEC-169).
// Both are append-only: a mistaken authorization is not edited; the visit is cancelled or left unconfirmed instead.
import type { Db, Tx } from '@handyhub/db'
import {
  BLOCKING_HOLD_STATES,
  followUpNeedsReturnWork,
  isCompletedJob,
  isWorkVisitPurpose,
  type FollowUpBasis,
} from '@handyhub/domain'
import { rowFor, scopeIncludesProject, type Action, type DataScope, type StaffActor } from '@handyhub/policy'
import { ApiError, type FieldError } from '../../api/errors.js'

type Reader = Db | Tx

const field = (f: string, code: string): FieldError => ({ field: f, code, message: '' })

/** Whether one of the actor's roles holds the action (the matrix row's cell has a rule for it). */
const holdsAction = (actor: StaffActor, action: Action) =>
  actor.roles.some((role) => rowFor(action)?.cells[role].rules[action] !== undefined)

/** PROPOSED input bounds (no owner value). */
export const AUTHORIZATION_LIMITS = {
  person: 200,
  qualification: 500,
  conditions: 2000,
  reason: 1000,
  note: 1000,
} as const

export type InspectionInput = {
  readonly qualifiedPerson: string
  readonly qualification: string
  readonly safetyConditions: string
  readonly reason: string
}

export type FollowUpInput = {
  readonly basis: FollowUpBasis
  readonly note: string
  readonly returnWorkId?: string
}

async function lockedVisit(tx: Tx, scope: DataScope, visitId: string, expectedVersion: number) {
  const v = await tx.selectFrom('work.visits').selectAll().where('id', '=', visitId).forUpdate().executeTakeFirst()
  if (!v || !scopeIncludesProject(scope, v.project_id)) throw new ApiError('NOT_FOUND')
  if (v.version !== expectedVersion)
    throw new ApiError('STALE_VERSION', { current: { version: v.version, values: { state: v.state } } })
  return v
}

const required = (value: string | undefined, name: string, code = 'REQUIRED'): FieldError[] =>
  value?.trim() ? [] : [field(`body.${name}`, code)]

/**
 * The Owner authorizes a tentative site visit as a hazard-evaluation inspection (A1), with the visit version the
 * caller saw. Refusals: NOT_FOUND, FORBIDDEN (not the Owner), STALE_VERSION, VALIDATION_FAILED (REQUIRED per field),
 * CONFLICT (VISIT_NOT_TENTATIVE, NOT_A_SITE_VISIT, INSPECTION_AUTHORIZED, NO_REVIEW_HOLD: no intake review hold is
 * open on the project, so the visit needs no exception).
 */
export async function authorizeInspection(
  tx: Tx,
  actor: StaffActor,
  scope: DataScope,
  visitId: string,
  input: InspectionInput,
  deps: { expectedVersion: number },
) {
  if (!holdsAction(actor, 'visit.authorize_inspection')) throw new ApiError('FORBIDDEN')
  const v = await lockedVisit(tx, scope, visitId, deps.expectedVersion)
  const invalid = [
    ...required(input.qualifiedPerson, 'qualifiedPerson'),
    ...required(input.qualification, 'qualification'),
    ...required(input.safetyConditions, 'safetyConditions'),
    ...required(input.reason, 'reason', 'REASON_REQUIRED'),
  ]
  if (invalid.length) throw new ApiError('VALIDATION_FAILED', { fieldErrors: invalid })
  const problems: FieldError[] = []
  if (v.state !== 'tentative') problems.push(field('state', 'VISIT_NOT_TENTATIVE'))
  if (v.purpose !== 'site_estimate') problems.push(field('visit.purpose', 'NOT_A_SITE_VISIT'))
  const existing = await tx
    .selectFrom('work.hazard_inspection_authorizations')
    .select('id')
    .where('visit_id', '=', v.id)
    .executeTakeFirst()
  if (existing) problems.push(field('inspection', 'INSPECTION_AUTHORIZED'))
  // The intake review holds it evaluates: those open on the project now (share-locked, so a resolution commits
  // strictly before or after).
  const holds = await tx
    .selectFrom('work.holds')
    .select('id')
    .where('project_id', '=', v.project_id)
    .where('kind', '=', 'review')
    .where('state', 'in', [...BLOCKING_HOLD_STATES])
    .orderBy('raised_at')
    .orderBy('id')
    .forShare()
    .execute()
  if (holds.length === 0) problems.push(field('holds', 'NO_REVIEW_HOLD'))
  if (problems.length) throw new ApiError('CONFLICT', { fieldErrors: problems })
  const row = await tx
    .insertInto('work.hazard_inspection_authorizations')
    .values({
      visit_id: v.id,
      project_id: v.project_id,
      qualified_person: input.qualifiedPerson.trim(),
      qualification: input.qualification.trim(),
      safety_conditions: input.safetyConditions.trim(),
      reason: input.reason.trim(),
      authorized_by: actor.userId,
    })
    .returning(['id', 'authorized_at'])
    .executeTakeFirstOrThrow()
  for (const h of holds)
    await tx.insertInto('work.hazard_inspection_holds').values({ authorization_id: row.id, hold_id: h.id }).execute()
  return { id: row.id, visitId: v.id, projectId: v.project_id, holdIds: holds.map((h) => h.id) }
}

/**
 * The Owner or Office records the basis of a follow-up visit on a completed job (A4), with the visit version the
 * caller saw. Refusals: NOT_FOUND, FORBIDDEN, STALE_VERSION, VALIDATION_FAILED (NOTE_REQUIRED, RETURN_WORK_REQUIRED),
 * CONFLICT (VISIT_NOT_TENTATIVE, NOT_A_WORK_VISIT, JOB_NOT_COMPLETE: a job still in progress needs no authorization,
 * FOLLOW_UP_AUTHORIZED, RETURN_WORK_UNKNOWN, RETURN_WORK_NOT_WARRANTY, RETURN_WORK_NOT_DECIDED).
 */
export async function authorizeFollowUp(
  tx: Tx,
  actor: StaffActor,
  scope: DataScope,
  visitId: string,
  input: FollowUpInput,
  deps: { expectedVersion: number },
) {
  if (!holdsAction(actor, 'visit.authorize_follow_up')) throw new ApiError('FORBIDDEN')
  const v = await lockedVisit(tx, scope, visitId, deps.expectedVersion)
  const invalid = required(input.note, 'note', 'NOTE_REQUIRED')
  if (followUpNeedsReturnWork(input.basis) && !input.returnWorkId)
    invalid.push(field('body.returnWorkId', 'RETURN_WORK_REQUIRED'))
  if (invalid.length) throw new ApiError('VALIDATION_FAILED', { fieldErrors: invalid })
  const problems: FieldError[] = []
  if (v.state !== 'tentative') problems.push(field('state', 'VISIT_NOT_TENTATIVE'))
  if (!isWorkVisitPurpose(v.purpose) || v.job_id === null) {
    problems.push(field('visit.purpose', 'NOT_A_WORK_VISIT'))
    throw new ApiError('CONFLICT', { fieldErrors: problems })
  }
  const job = await tx
    .selectFrom('work.jobs')
    .select(['id', 'operational_state'])
    .where('id', '=', v.job_id)
    .forShare()
    .executeTakeFirstOrThrow()
  if (!isCompletedJob(job.operational_state)) problems.push(field('job', 'JOB_NOT_COMPLETE'))
  const existing = await tx
    .selectFrom('work.follow_up_authorizations')
    .select('id')
    .where('visit_id', '=', v.id)
    .executeTakeFirst()
  if (existing) problems.push(field('followUp', 'FOLLOW_UP_AUTHORIZED'))
  const returnWorkId = followUpNeedsReturnWork(input.basis) ? (input.returnWorkId ?? null) : null
  if (returnWorkId) {
    const r = await tx
      .selectFrom('quality.return_work')
      .select(['id', 'job_id', 'classification', 'decided_at'])
      .where('id', '=', returnWorkId)
      .executeTakeFirst()
    if (!r || r.job_id !== v.job_id) problems.push(field('body.returnWorkId', 'RETURN_WORK_UNKNOWN'))
    else if (input.basis === 'warranty' && r.classification !== 'warranty_claim')
      problems.push(field('body.returnWorkId', 'RETURN_WORK_NOT_WARRANTY'))
    else if (input.basis === 'return_work' && r.decided_at === null)
      problems.push(field('body.returnWorkId', 'RETURN_WORK_NOT_DECIDED'))
  }
  if (problems.length) throw new ApiError('CONFLICT', { fieldErrors: problems })
  const row = await tx
    .insertInto('work.follow_up_authorizations')
    .values({
      visit_id: v.id,
      job_id: v.job_id,
      project_id: v.project_id,
      basis: input.basis,
      return_work_id: returnWorkId,
      note: input.note.trim(),
      authorized_by: actor.userId,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  return { id: row.id, visitId: v.id, projectId: v.project_id, basis: input.basis, returnWorkId }
}

type StaffRef = { id: string; name: string | null }

export type VisitAuthorizations = {
  inspection: {
    id: string
    qualifiedPerson: string
    qualification: string
    safetyConditions: string
    reason: string
    holdIds: string[]
    authorizedBy: StaffRef
    authorizedAt: string
  } | null
  followUp: {
    id: string
    basis: FollowUpBasis
    note: string
    returnWorkId: string | null
    authorizedBy: StaffRef
    authorizedAt: string
  } | null
  jobCompleted: boolean
  actions: { authorizeInspection: boolean; authorizeFollowUp: boolean }
}

/**
 * The authorizations of these visits for staff, and what the caller may record on each: an inspection on a tentative
 * site visit while an intake review hold is open on the project (the Owner); a follow-up basis on a tentative work
 * visit of a completed job (the Owner, Office).
 */
export async function visitAuthorizations(
  db: Reader,
  actor: StaffActor,
  visits: readonly { id: string; purpose: string; state: string; project_id: string; job_id: string | null }[],
  jobState: string | null,
  names: (ids: string[]) => Promise<Map<string, StaffRef>>,
): Promise<Map<string, VisitAuthorizations>> {
  const out = new Map<string, VisitAuthorizations>()
  if (visits.length === 0) return out
  const ids = visits.map((v) => v.id)
  const inspections = await db
    .selectFrom('work.hazard_inspection_authorizations')
    .selectAll()
    .where('visit_id', 'in', ids)
    .execute()
  const covered = inspections.length
    ? await db
        .selectFrom('work.hazard_inspection_holds')
        .select(['authorization_id', 'hold_id'])
        .where(
          'authorization_id',
          'in',
          inspections.map((i) => i.id),
        )
        .execute()
    : []
  const followUps = await db
    .selectFrom('work.follow_up_authorizations')
    .selectAll()
    .where('visit_id', 'in', ids)
    .execute()
  const projectIds = [...new Set(visits.map((v) => v.project_id))]
  const openReview = await db
    .selectFrom('work.holds')
    .select('project_id')
    .where('project_id', 'in', projectIds)
    .where('kind', '=', 'review')
    .where('state', 'in', [...BLOCKING_HOLD_STATES])
    .execute()
  const reviewOpen = new Set(openReview.map((h) => h.project_id))
  const who = await names([...inspections.map((i) => i.authorized_by), ...followUps.map((f) => f.authorized_by)])
  const ref = (id: string) => who.get(id) ?? { id, name: null }
  const completed = jobState !== null && isCompletedJob(jobState)
  const mayInspect = holdsAction(actor, 'visit.authorize_inspection')
  const mayFollowUp = holdsAction(actor, 'visit.authorize_follow_up')
  for (const v of visits) {
    const i = inspections.find((x) => x.visit_id === v.id)
    const f = followUps.find((x) => x.visit_id === v.id)
    const work = isWorkVisitPurpose(v.purpose) && v.job_id !== null
    out.set(v.id, {
      inspection: i
        ? {
            id: i.id,
            qualifiedPerson: i.qualified_person,
            qualification: i.qualification,
            safetyConditions: i.safety_conditions,
            reason: i.reason,
            holdIds: covered.filter((c) => c.authorization_id === i.id).map((c) => c.hold_id),
            authorizedBy: ref(i.authorized_by),
            authorizedAt: new Date(i.authorized_at).toISOString(),
          }
        : null,
      followUp: f
        ? {
            id: f.id,
            basis: f.basis as FollowUpBasis,
            note: f.note,
            returnWorkId: f.return_work_id,
            authorizedBy: ref(f.authorized_by),
            authorizedAt: new Date(f.authorized_at).toISOString(),
          }
        : null,
      jobCompleted: work && completed,
      actions: {
        authorizeInspection:
          mayInspect && v.state === 'tentative' && v.purpose === 'site_estimate' && !i && reviewOpen.has(v.project_id),
        authorizeFollowUp: mayFollowUp && v.state === 'tentative' && work && completed && !f,
      },
    })
  }
  return out
}
