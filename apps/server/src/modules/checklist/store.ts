// The job checklist (TSK-0075; HH-WORK-11, HH-WORK-05, HH-WORK-12, T47, ENT-Task, OWN-DEC-108, RULE-SAFETY-GATES,
// RULE-NO-INVENTED-FACTS, RULE-SERVER-AUTHZ). Every write runs in the route's transaction under the job's row lock;
// migration 0083 refuses anything else whatever path writes.
// - The steps are the pinned SOP versions' own, in order; a step has a record once a worker acts on it.
// - A worker acts only after their own Start Work on the job, while the job and the work package are in progress and
//   no review, job-level or critical safety hold is open (a hazard report pauses the job and blocks the package, so
//   the checklist stops with it, RULE-SAFETY-GATES).
// - Every change keeps its worker, evidence, reason and time in the history; reopening keeps the earlier evidence.
import type { Db, Tx } from '@handyhub/db'
import {
  CHECKLIST_STEP_MACHINE,
  checklistSummary,
  currentStage,
  earlierOpen,
  itemText,
  sopSteps,
  transition,
  type ChecklistStepEvent,
  type ChecklistStepState,
  type ChecklistSummary,
  type RecordedStep,
  type SopContent,
  type SopEvidenceKind,
} from '@handyhub/domain'
import type { StaffActor } from '@handyhub/policy'
import { sql } from 'kysely'
import { ApiError, type FieldError } from '../../api/errors.js'
import { changeOrderWaitingSteps } from '../change-orders/store.js'
import { spanishItem, spanishReleases, type SpanishRelease } from '../sops/spanish.js'

type Reader = Db | Tx

/** A step an open change order names waits (HH-WORK-07): it cannot start, resume, complete or reopen until then. */
const WAIT_BLOCKED: readonly ChecklistStepEvent[] = ['start', 'resume', 'complete', 'reopen']

const field = (f: string, code: string): FieldError => ({ field: f, code, message: '' })
const conflict = (f: string, code: string) => new ApiError('CONFLICT', { fieldErrors: [field(f, code)] })
const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null)

type StepRow = {
  id: string
  work_package_id: string
  step_id: string
  stage: number
  required: boolean
  evidence: string[]
  state: Exclude<ChecklistStepState, 'not_started'>
  measurement: string | null
  note: string | null
  photo_ids: string[]
  skip_reason: string | null
  worker_id: string
  completed_by: string | null
  completed_at: Date | null
  version: number
}
const STEP_COLUMNS = [
  'id',
  'work_package_id',
  'step_id',
  'stage',
  'required',
  'evidence',
  'state',
  'measurement',
  'note',
  'photo_ids',
  'skip_reason',
  'worker_id',
  'completed_by',
  'completed_at',
  'version',
] as const

type Package = {
  id: string
  code: string
  position: number
  state: string
  sopVersionId: string | null
  title: string | null
  signedOff: boolean
  content: SopContent | null
  spanish: SpanishRelease | undefined
}

async function packagesOf(db: Reader, jobId: string): Promise<Package[]> {
  const rows = await db
    .selectFrom('work.work_packages as w')
    .innerJoin('catalog.services as s', 's.id', 'w.service_id')
    .leftJoin('catalog.sop_versions as v', 'v.id', 'w.sop_version_id')
    .select(['w.id', 's.code', 'w.position', 'w.state', 'w.sop_version_id', 'v.title', 'v.signed_off_at', 'v.content'])
    .where('w.job_id', '=', jobId)
    .orderBy('w.position')
    .execute()
  const spanish = await spanishReleases(
    db,
    rows.flatMap((r) => (r.sop_version_id ? [r.sop_version_id] : [])),
  )
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    position: r.position,
    state: r.state,
    sopVersionId: r.sop_version_id,
    title: r.title,
    signedOff: r.signed_off_at !== null,
    content: (r.content as unknown as SopContent | null) ?? null,
    spanish: r.sop_version_id ? spanish.get(r.sop_version_id) : undefined,
  }))
}

async function stepRows(db: Reader, jobId: string): Promise<StepRow[]> {
  return (await db
    .selectFrom('work.checklist_steps')
    .select(STEP_COLUMNS)
    .where('job_id', '=', jobId)
    .execute()) as StepRow[]
}

const recordedOf = (rows: readonly StepRow[], packageId: string): RecordedStep[] =>
  rows
    .filter((r) => r.work_package_id === packageId)
    .map((r) => ({ stepId: r.step_id, stage: r.stage, state: r.state }))

/** What blocks the caller from working the checklist now (empty: they may act). */
async function blockers(db: Reader, actor: StaffActor, jobId: string): Promise<string[]> {
  const job = await db
    .selectFrom('work.jobs')
    .select(['operational_state', 'project_id'])
    .where('id', '=', jobId)
    .executeTakeFirstOrThrow()
  const out: string[] = []
  if (job.operational_state !== 'in_progress') out.push('JOB_NOT_IN_PROGRESS')
  const holds = await sql<{ n: number }>`SELECT work.start_blocking_holds(${job.project_id}::uuid) AS n`.execute(db)
  if (Number(holds.rows[0]?.n ?? 0) > 0) out.push('HOLD_OPEN')
  const started = await db
    .selectFrom('work.work_starts')
    .select('id')
    .where('job_id', '=', jobId)
    .where('staff_user_id', '=', actor.userId)
    .executeTakeFirst()
  if (!started) out.push('WORK_NOT_STARTED')
  // TSK-0094 (HH-INC-03): after a pause, the worker resumes through the Start Work gate before working again.
  else if (!(await workerCurrent(db, jobId, actor.userId))) out.push('RESUME_REQUIRED')
  return out
}

/** Whether the worker started or resumed through the gate since the job's latest pause (migration 0102). */
export async function workerCurrent(db: Reader, jobId: string, staffUserId: string): Promise<boolean> {
  const r = await sql<{
    ok: boolean
  }>`SELECT work.worker_current_on_job(${jobId}::uuid, ${staffUserId}::uuid) AS ok`.execute(db)
  return r.rows[0]?.ok === true
}

/** Per work package: the checklist summary the reviewer and Finished read (TSK-0083, TSK-0084). */
export async function checklistSummaries(
  db: Reader,
  jobId: string,
): Promise<{ workPackageId: string; code: string; summary: ChecklistSummary }[]> {
  const [packages, rows] = await Promise.all([packagesOf(db, jobId), stepRows(db, jobId)])
  return packages.map((p) => ({
    workPackageId: p.id,
    code: p.code,
    summary: checklistSummary(
      p.content ? sopSteps(p.content).map((s) => ({ id: s.id, required: s.required })) : [],
      recordedOf(rows, p.id),
    ),
  }))
}

/** The checklist screen of a job for an assigned worker. */
export async function checklistView(db: Reader, actor: StaffActor, jobId: string) {
  const job = await db
    .selectFrom('work.jobs as j')
    .innerJoin('crm.projects as p', 'p.id', 'j.project_id')
    .select(['j.id', 'j.operational_state', 'p.reference'])
    .where('j.id', '=', jobId)
    .executeTakeFirst()
  if (!job) return null
  const [packages, rows, blocked, waiting] = await Promise.all([
    packagesOf(db, jobId),
    stepRows(db, jobId),
    blockers(db, actor, jobId),
    changeOrderWaitingSteps(db, jobId),
  ])
  const photos = await db
    .selectFrom('work.field_photos')
    .select(['id', 'work_package_id', 'phase', 'area_label', 'uploaded_at'])
    .where('job_id', '=', jobId)
    .where('state', '<>', 'rejected')
    .orderBy('uploaded_at')
    .execute()
  const handoffs = await db
    .selectFrom('work.checklist_handoffs')
    .select(['id', 'work_package_id', 'from_worker', 'to_worker', 'note', 'at'])
    .where('job_id', '=', jobId)
    .orderBy('at', 'desc')
    .execute()
  const workers = await db
    .selectFrom('identity.staff_users as s')
    .innerJoin('identity.role_grants as g', 'g.staff_user_id', 's.id')
    .select(['s.id', 's.display_name'])
    .where('g.kind', '=', 'role')
    .where('g.name', '=', 'worker')
    .where('g.ended_at', 'is', null)
    .where('s.status', '=', 'active')
    .distinct()
    .orderBy('s.display_name')
    .execute()
  const ids = [
    ...rows.flatMap((r) => [r.worker_id, r.completed_by]),
    ...handoffs.flatMap((h) => [h.from_worker, h.to_worker]),
  ].filter((x): x is string => x !== null)
  const names = new Map(
    ids.length
      ? (
          await db
            .selectFrom('identity.staff_users')
            .select(['id', 'display_name'])
            .where('id', 'in', [...new Set(ids)])
            .execute()
        ).map((r) => [r.id, r.display_name])
      : [],
  )
  const ref = (id: string | null) => (id ? { id, name: names.get(id) ?? null } : null)
  const canAct = blocked.length === 0
  return {
    jobId: job.id,
    reference: job.reference,
    jobState: job.operational_state,
    blockers: blocked,
    packages: packages.map((p) => {
      const recorded = recordedOf(rows, p.id)
      const steps = p.content ? sopSteps(p.content) : []
      const stage = currentStage(steps, recorded)
      const packageActive = canAct && p.state === 'in_progress'
      return {
        workPackageId: p.id,
        code: p.code,
        state: p.state,
        sop: p.sopVersionId
          ? {
              versionId: p.sopVersionId,
              title: p.title,
              pendingReview: !p.signedOff,
              spanishStatus: p.spanish?.status ?? 'pending',
              titleEs: p.spanish?.title ?? null,
            }
          : null,
        currentStage: stage,
        summary: checklistSummary(
          steps.map((s) => ({ id: s.id, required: s.required })),
          recorded,
        ),
        stages: (p.content?.stages ?? []).map((st) => {
          const open = earlierOpen(steps, recorded, st.stage) === 0
          return {
            stage: st.stage,
            key: st.key,
            heading: st.heading,
            headingEs: p.spanish?.content?.stages.find((x) => x.stage === st.stage)?.heading ?? null,
            open,
            steps: steps
              .filter((s) => s.stage === st.stage)
              .map((s) => {
                const r = rows.find((x) => x.work_package_id === p.id && x.step_id === s.id) ?? null
                const state: ChecklistStepState = r?.state ?? 'not_started'
                const waitsFor = waiting.get(`${p.id}:${s.id}`) ?? []
                const actions = packageActive
                  ? CHECKLIST_STEP_MACHINE.transitions
                      .filter((t) => (t.from as readonly string[]).includes(state))
                      .filter((t) => open || t.event === 'pause' || t.event === 'skip')
                      .filter((t) => waitsFor.length === 0 || !WAIT_BLOCKED.includes(t.event))
                      .map((t) => t.event)
                  : []
                return {
                  stepId: s.id,
                  text: itemText(s),
                  // The Spanish text only from a version released as AI-reviewed (TSK-0103).
                  textEs: ((es) => (es ? itemText(es) : null))(spanishItem(p.spanish, s.id)),
                  line: s.line,
                  required: s.required,
                  evidence: [...s.evidence],
                  holdBefore: [...s.holdBefore],
                  // The open change orders this step waits for (their numbers, HH-WORK-07).
                  waitsForChangeOrders: waitsFor,
                  state,
                  version: r?.version ?? 0,
                  measurement: r?.measurement ?? null,
                  note: r?.note ?? null,
                  photoIds: r?.photo_ids ?? [],
                  skipReason: r?.skip_reason ?? null,
                  worker: ref(r?.worker_id ?? null),
                  completedBy: ref(r?.completed_by ?? null),
                  completedAt: iso(r?.completed_at),
                  actions,
                }
              }),
          }
        }),
      }
    }),
    photos: photos.map((f) => ({
      id: f.id,
      workPackageId: f.work_package_id,
      phase: f.phase,
      areaLabel: f.area_label,
      uploadedAt: iso(f.uploaded_at) as string,
    })),
    handoffs: handoffs.map((h) => ({
      id: h.id,
      workPackageId: h.work_package_id,
      from: ref(h.from_worker),
      to: ref(h.to_worker),
      note: h.note,
      at: iso(h.at) as string,
    })),
    workers: workers.filter((w) => w.id !== actor.userId).map((w) => ({ id: w.id, name: w.display_name })),
    actions: { handoff: canAct },
  }
}

export type StepInput = {
  workPackageId: string
  stepId: string
  version: number
  measurement?: string
  note?: string
  photoIds?: string[]
  reason?: string
}

/** One step event by the worker (see the header): the domain table first, then the record and its history. */
export async function stepEvent(
  tx: Tx,
  actor: StaffActor,
  jobId: string,
  event: ChecklistStepEvent,
  input: StepInput,
): Promise<{ id: string; state: ChecklistStepState; version: number; workPackageId: string; stepId: string }> {
  await tx.selectFrom('work.jobs').select('id').where('id', '=', jobId).forUpdate().executeTakeFirstOrThrow()
  const blocked = await blockers(tx, actor, jobId)
  if (blocked.length) throw conflict('job', blocked[0] as string)
  const p = (await packagesOf(tx, jobId)).find((x) => x.id === input.workPackageId)
  if (!p) throw conflict('body.workPackageId', 'NOT_A_WORK_PACKAGE_OF_THE_JOB')
  if (p.state !== 'in_progress')
    throw conflict(
      'body.workPackageId',
      p.state === 'blocked' ? 'WORK_PACKAGE_BLOCKED' : 'WORK_PACKAGE_NOT_IN_PROGRESS',
    )
  const steps = p.content ? sopSteps(p.content) : []
  const step = steps.find((s) => s.id === input.stepId)
  if (!step || !p.sopVersionId) throw new ApiError('NOT_FOUND')
  if (WAIT_BLOCKED.includes(event) && (await changeOrderWaitingSteps(tx, jobId)).has(`${p.id}:${step.id}`))
    throw conflict('body.stepId', 'WAITS_FOR_CHANGE_ORDER')
  const existing = (await tx
    .selectFrom('work.checklist_steps')
    .select(STEP_COLUMNS)
    .where('work_package_id', '=', p.id)
    .where('step_id', '=', step.id)
    .forUpdate()
    .executeTakeFirst()) as StepRow | undefined
  const current = { state: (existing?.state ?? 'not_started') as ChecklistStepState, version: existing?.version ?? 0 }
  if (current.version !== input.version)
    throw new ApiError('STALE_VERSION', { current: { version: current.version, values: { state: current.state } } })
  const rows = await stepRows(tx, jobId)
  // Photos: field photos of this job and work package that processing has not rejected.
  const photoIds = [...new Set(input.photoIds ?? existing?.photo_ids ?? [])]
  if (input.photoIds?.length) {
    const found = await tx
      .selectFrom('work.field_photos')
      .select('id')
      .where('id', 'in', input.photoIds)
      .where('job_id', '=', jobId)
      .where('work_package_id', '=', p.id)
      .where('state', '<>', 'rejected')
      .execute()
    if (found.length !== new Set(input.photoIds).size)
      throw conflict('body.photoIds', 'NOT_A_PHOTO_OF_THE_WORK_PACKAGE')
  }
  const measurement = input.measurement?.trim() || existing?.measurement || null
  const note = input.note?.trim() || existing?.note || null
  const t = transition(CHECKLIST_STEP_MACHINE, current, event, {
    actor: 'staff',
    expectedVersion: current.version,
    now: new Date(),
    facts: {
      earlierOpen: earlierOpen(steps, recordedOf(rows, p.id), step.stage),
      evidence: step.evidence as readonly SopEvidenceKind[],
      photos: photoIds.length,
      measurement,
      note,
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
    },
  })
  if (!t.ok) {
    if (t.code === 'GUARD_FAILED')
      throw new ApiError('CONFLICT', { fieldErrors: t.problems.map((x) => field('step', x.code)) })
    throw conflict('step', t.code === 'INVALID_TRANSITION' ? 'INVALID_STATE' : t.code)
  }
  const to = t.to as Exclude<ChecklistStepState, 'not_started'>
  const values = {
    state: to,
    measurement,
    note,
    photo_ids: photoIds,
    skip_reason: to === 'skipped' ? (input.reason?.trim() as string) : (existing?.skip_reason ?? null),
    worker_id: actor.userId,
    completed_by: to === 'completed' ? actor.userId : null,
    completed_at: to === 'completed' ? sql<Date>`now()` : null,
  }
  const row = existing
    ? await tx
        .updateTable('work.checklist_steps')
        .set({ ...values, version: existing.version + 1 })
        .where('id', '=', existing.id)
        .returning(['id', 'version'])
        .executeTakeFirstOrThrow()
    : await tx
        .insertInto('work.checklist_steps')
        .values({
          ...values,
          job_id: jobId,
          project_id: (
            await tx.selectFrom('work.jobs').select('project_id').where('id', '=', jobId).executeTakeFirstOrThrow()
          ).project_id,
          work_package_id: p.id,
          sop_version_id: p.sopVersionId,
          step_id: step.id,
          stage: step.stage,
          required: step.required,
          evidence: [...step.evidence],
        })
        .returning(['id', 'version'])
        .executeTakeFirstOrThrow()
  await tx
    .insertInto('work.checklist_step_events')
    .values({
      step_row_id: row.id,
      event,
      from_state: existing?.state ?? null,
      to_state: to,
      worker_id: actor.userId,
      measurement: input.measurement?.trim() || null,
      note: input.note?.trim() || null,
      photo_ids: input.photoIds ?? [],
      reason: input.reason?.trim() || null,
    })
    .execute()
  return { id: row.id, state: to, version: row.version, workPackageId: p.id, stepId: step.id }
}

/** A worker's handoff note on the job (to another worker, or to whoever continues). */
export async function recordHandoff(
  tx: Tx,
  actor: StaffActor,
  jobId: string,
  input: { note: string; toWorkerId?: string; workPackageId?: string },
) {
  const job = await tx
    .selectFrom('work.jobs')
    .select(['id', 'project_id'])
    .where('id', '=', jobId)
    .forUpdate()
    .executeTakeFirstOrThrow()
  const blocked = (await blockers(tx, actor, jobId)).filter((b) => b === 'WORK_NOT_STARTED')
  if (blocked.length) throw conflict('job', 'WORK_NOT_STARTED')
  if (input.toWorkerId === actor.userId) throw conflict('body.toWorkerId', 'HANDOFF_TO_SELF')
  if (input.workPackageId && !(await packagesOf(tx, jobId)).some((p) => p.id === input.workPackageId))
    throw conflict('body.workPackageId', 'NOT_A_WORK_PACKAGE_OF_THE_JOB')
  if (input.toWorkerId) {
    const w = await tx
      .selectFrom('identity.role_grants')
      .select('id')
      .where('staff_user_id', '=', input.toWorkerId)
      .where('kind', '=', 'role')
      .where('name', '=', 'worker')
      .where('ended_at', 'is', null)
      .executeTakeFirst()
    if (!w) throw conflict('body.toWorkerId', 'NOT_A_WORKER')
  }
  return tx
    .insertInto('work.checklist_handoffs')
    .values({
      job_id: job.id,
      project_id: job.project_id,
      work_package_id: input.workPackageId ?? null,
      from_worker: actor.userId,
      to_worker: input.toWorkerId ?? null,
      note: input.note.trim(),
    })
    .returning(['id', 'at'])
    .executeTakeFirstOrThrow()
}
