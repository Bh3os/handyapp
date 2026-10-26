// What changes the Start Work gate (TSK-0073, TSK-0074; HH-WORK-01..04, HH-WORK-12, HH-OPS-01, T40, T45, T46,
// ENT-StartGateEvaluation, ENT-GateException, ENT-Hold, ENT-Photo, OWN-DEC-38, OWN-DEC-68, OWN-DEC-82, OWN-DEC-137,
// OWN-DEC-195, RULE-SAFETY-GATES, RULE-SERVER-AUTHZ).
// - startWork(): one transaction under the visit's and the job's row locks (in that order, as every visit writer):
//   brings the packet up to date, re-evaluates every prerequisite and the exceptions, and records the evaluation
//   (ENT-StartGateEvaluation) whatever the outcome. Only `ready` records the start (OWN-DEC-195 "actual contracted work
//   started") with the packet, scope and SOP versions, the acknowledgment, the exceptions used and the server's time,
//   and moves the job and its startable work packages to in_progress; the database refuses any of these without that
//   evaluation in the same transaction, and while any hard hold blocks (migration 0074).
// - Site checks: the worker's own answers on arrival. A site different from the packet raises a job-level Hold (with
//   the worker's note) in the same transaction: the Owner assesses it and sets Ready with a note (PROPOSED).
// - Before photos: checked like request photos (type, real content, size from uploads.limits), stored once under an
//   opaque key in the private bucket, internal, never served here. TSK-0076: they are field photos (work.field_photos)
//   of the before phase; after photos, area labels, pairs, processing and sharing are in uploadFieldPhoto and the
//   field-photos module.
// - Exceptions: requested by an assigned worker with reason and evidence when the records show its one requirement
//   missing; decided by the Owner (never the requester), approval with a fresh sign-in, a follow-up owner and deadline,
//   and for the deposit the Owner's statement that the provider's own records show the payment.
// - Holds: the job-level Hold / Ready (job_hold.set with a note; job_hold.set_ready by the Owner with how it was
//   resolved, OWN-DEC-137, including one the Owner set) and the critical safety hold (hold.release_critical: the
//   Owner, never one they raised, with evidence, the reviewer and their qualification; OWN-DEC-38). The generic hold
//   routes and the loadout block routes never reach these, and nothing else releases them.
// - TSK-0094: a return visit (purpose return_work) starts through the same gate but moves neither the job nor its
//   work packages (HH-QA-08, never a hidden reopening). resumeWork() resumes after an incident (HH-INC-03): one
//   transaction under the same locks, the gate in its resume mode recorded as an evaluation whatever the outcome, and a
//   ready one records the worker's resumption (and their start on this visit, when it is a new visit), moves a paused
//   job back to in_progress and its blocked work packages with it. The hold was released before, through its own path.
import { createHash, randomUUID } from 'node:crypto'
import type { Tx } from '@handyhub/db'
import {
  apply,
  BLOCKING_HOLD_STATES,
  EXCEPTION_REQUIREMENT,
  exceptionRequestProblems,
  type ExceptionEvidence,
  type GateExceptionKind,
  type HoldState,
  type JobHoldCategory,
} from '@handyhub/domain'
import type { StaffActor } from '@handyhub/policy'
import { sql } from 'kysely'
import { ApiError, type FieldError } from '../../api/errors.js'
import { loadConfig } from '../../platform/config/index.js'
import { outbox } from '../../platform/outbox.js'
import type { ObjectStorage } from '../../providers/index.js'
import { depositView } from '../finance/deposits.js'
import { FIELD_PHOTO_UPLOADED_EVENT } from '../field-photos/photos.js'
import { contentProblems } from '../photos/content.js'
import { photoLimits } from '../photos/photos.js'
import { openQueueItem, resolveQueueItem } from '../queue/items.js'
import {
  beforePhotoCounts,
  gatherGate,
  gateVisit,
  lockJob,
  settleExceptions,
  sopVersionIds,
  type ExceptionRow,
  type GateEnvironment,
  type GateFacts,
  type GateVisit,
} from './gate.js'

const field = (f: string, code: string): FieldError => ({ field: f, code, message: '' })
const conflict = (fields: FieldError[]) => new ApiError('CONFLICT', { fieldErrors: fields })

/** The visit under its row lock, then its job's row lock (the order every visit writer takes). */
export async function lockedVisit(tx: Tx, visitId: string): Promise<GateVisit & { jobId: string }> {
  const visit = await gateVisit(tx, visitId, true)
  if (!visit) throw new ApiError('NOT_FOUND')
  if (visit.jobId === null) throw conflict([field('visit', 'NOT_WORK_VISIT')])
  await lockJob(tx, visit.jobId)
  return visit as GateVisit & { jobId: string }
}

/** The refusal of a start: every missing item of the evaluation, by prerequisite. */
export function gateRefusal(facts: GateFacts): ApiError {
  return conflict(
    facts.result.items.flatMap((i) =>
      i.missing.filter((m) => m.exceptionId === null).map((m) => field(`gate.${i.item}`, m.code)),
    ),
  )
}

// --- Start Work --------------------------------------------------------------------------------------------------

export type StartOutcome =
  | { started: false; facts: GateFacts; evaluationId: string }
  | {
      started: true
      facts: GateFacts
      evaluationId: string
      start: {
        id: string
        startedAt: Date
        jobStateBefore: string
        jobState: string
        jobVersion: number
        packagesStarted: string[]
      }
    }

export async function startWork(
  tx: Tx,
  actor: StaffActor,
  visitId: string,
  input: { packetVersion: number; requestId: string; environment: GateEnvironment },
): Promise<StartOutcome> {
  const visit = await lockedVisit(tx, visitId)
  const facts = await gatherGate(tx, visit, actor.userId, {
    environment: input.environment,
    seenPacketVersion: input.packetVersion,
    mode: 'start',
  })
  await settleExceptions(tx, facts.exceptions)
  const row = facts.packet
  const evaluation = await recordEvaluation(tx, visit, actor, facts, input.requestId)
  if (facts.result.outcome !== 'ready' || !row || !facts.acknowledgmentId)
    return { started: false, facts, evaluationId: evaluation.id }

  const job = await tx
    .selectFrom('work.jobs')
    .select(['operational_state', 'version'])
    .where('id', '=', visit.jobId)
    .executeTakeFirstOrThrow()
  const start = await insertStart(tx, visit, actor, facts, evaluation.id, job.operational_state)
  // A return visit never moves the original job or its work packages (HH-QA-08): its work is recorded apart.
  if (visit.purpose === 'return_work')
    return {
      started: true,
      facts,
      evaluationId: evaluation.id,
      start: {
        id: start.id,
        startedAt: start.started_at,
        jobStateBefore: job.operational_state,
        jobState: job.operational_state,
        jobVersion: job.version,
        packagesStarted: [],
      },
    }
  let jobVersion = job.version
  if (job.operational_state !== 'in_progress') {
    const moved = await tx
      .updateTable('work.jobs')
      .set({ operational_state: 'in_progress', version: job.version + 1 })
      .where('id', '=', visit.jobId)
      .where('version', '=', job.version)
      .returning('version')
      .executeTakeFirstOrThrow()
    jobVersion = moved.version
  }
  // The job's work packages that are planned or ready start with it (a blocked or complete package stays as it is).
  const packages = await tx
    .updateTable('work.work_packages')
    .set({ state: 'in_progress', version: sql<number>`version + 1` })
    .where('job_id', '=', visit.jobId)
    .where('state', 'in', ['planned', 'ready'])
    .returning('id')
    .execute()
  return {
    started: true,
    facts,
    evaluationId: evaluation.id,
    start: {
      id: start.id,
      startedAt: start.started_at,
      jobStateBefore: job.operational_state,
      jobState: 'in_progress',
      jobVersion,
      packagesStarted: packages.map((p) => p.id).sort(),
    },
  }
}

/** The immutable record of one gate evaluation (ENT-StartGateEvaluation), a start's or a resumption's. */
async function recordEvaluation(
  tx: Tx,
  visit: GateVisit & { jobId: string },
  actor: StaffActor,
  facts: GateFacts,
  requestId: string,
) {
  const row = facts.packet
  return tx
    .insertInto('work.start_gate_evaluations')
    .values({
      job_id: visit.jobId,
      project_id: visit.projectId,
      visit_id: visit.id,
      staff_user_id: actor.userId,
      outcome: facts.result.outcome,
      items: JSON.stringify(facts.result.items),
      packet_version: row?.version ?? null,
      packet_sha256: row?.contentSha256 ?? null,
      scope_version: row?.content.scope.version ?? null,
      sop_version_ids: JSON.stringify(sopVersionIds(row)),
      acknowledgment_id: facts.acknowledgmentId,
      exception_ids: [...facts.result.exceptionsUsed],
      request_id: requestId.slice(0, 200),
      purpose: facts.mode,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
}

/** The worker's start on this visit, naming the passing evaluation of the same transaction. */
async function insertStart(
  tx: Tx,
  visit: GateVisit & { jobId: string },
  actor: StaffActor,
  facts: GateFacts,
  evaluationId: string,
  jobStateBefore: string,
) {
  const row = facts.packet as NonNullable<GateFacts['packet']>
  return tx
    .insertInto('work.work_starts')
    .values({
      job_id: visit.jobId,
      project_id: visit.projectId,
      visit_id: visit.id,
      staff_user_id: actor.userId,
      evaluation_id: evaluationId,
      packet_version: row.version,
      scope_version: row.content.scope.version,
      sop_version_ids: JSON.stringify(sopVersionIds(row)),
      acknowledgment_id: facts.acknowledgmentId as string,
      exception_ids: [...facts.result.exceptionsUsed],
      job_state_before: jobStateBefore,
    })
    .returning(['id', 'started_at'])
    .executeTakeFirstOrThrow()
}

// --- Resuming after an incident (TSK-0094) ------------------------------------------------------------------------

export type ResumeOutcome =
  | { resumed: false; facts: GateFacts; evaluationId: string }
  | {
      resumed: true
      facts: GateFacts
      evaluationId: string
      resumption: {
        id: string
        resumedAt: Date
        pausedAt: Date
        startId: string | null
        jobStateBefore: string
        jobVersion: number
        packagesResumed: string[]
      }
    }

/**
 * Resumes the caller's work after the job's latest pause (HH-INC-03): the gate in its resume mode, recorded whatever the
 * outcome; a ready evaluation records the resumption and moves a paused job and its blocked work packages back to
 * in_progress. Nothing here touches the hold: it was released before, through its own path.
 */
export async function resumeWork(
  tx: Tx,
  actor: StaffActor,
  visitId: string,
  input: { packetVersion: number; requestId: string; environment: GateEnvironment },
): Promise<ResumeOutcome> {
  const visit = await lockedVisit(tx, visitId)
  const facts = await gatherGate(tx, visit, actor.userId, {
    environment: input.environment,
    seenPacketVersion: input.packetVersion,
    mode: 'resume',
  })
  await settleExceptions(tx, facts.exceptions)
  const evaluation = await recordEvaluation(tx, visit, actor, facts, input.requestId)
  const row = facts.packet
  const pausedAt = facts.pause.pausedAt
  if (facts.result.outcome !== 'ready' || !row || !facts.acknowledgmentId || !pausedAt)
    return { resumed: false, facts, evaluationId: evaluation.id }

  const job = await tx
    .selectFrom('work.jobs')
    .select(['operational_state', 'version'])
    .where('id', '=', visit.jobId)
    .executeTakeFirstOrThrow()
  // A resumption on a visit the worker had not started yet is also their start on it (photos and taps need one).
  const start = facts.started ? null : await insertStart(tx, visit, actor, facts, evaluation.id, job.operational_state)
  const resumption = await tx
    .insertInto('work.work_resumptions')
    .values({
      job_id: visit.jobId,
      project_id: visit.projectId,
      visit_id: visit.id,
      staff_user_id: actor.userId,
      evaluation_id: evaluation.id,
      packet_version: row.version,
      acknowledgment_id: facts.acknowledgmentId,
      exception_ids: [...facts.result.exceptionsUsed],
      job_state_before: job.operational_state,
      // The database's own instant (microseconds): the pause as work.latest_pause() reads it.
      paused_at: sql<Date>`work.latest_pause(${visit.jobId}::uuid)`,
    })
    .returning(['id', 'resumed_at', 'paused_at'])
    .executeTakeFirstOrThrow()
  let jobVersion = job.version
  let packages: string[] = []
  if (job.operational_state === 'paused') {
    const moved = await tx
      .updateTable('work.jobs')
      .set({ operational_state: 'in_progress', version: job.version + 1 })
      .where('id', '=', visit.jobId)
      .where('version', '=', job.version)
      .returning('version')
      .executeTakeFirstOrThrow()
    jobVersion = moved.version
    // The work the hazard report blocked resumes with the job; the gate found no hold that still blocks it.
    packages = (
      await tx
        .updateTable('work.work_packages')
        .set({ state: 'in_progress', version: sql<number>`version + 1` })
        .where('job_id', '=', visit.jobId)
        .where('state', '=', 'blocked')
        .returning('id')
        .execute()
    )
      .map((p) => p.id)
      .sort()
  }
  return {
    resumed: true,
    facts,
    evaluationId: evaluation.id,
    resumption: {
      id: resumption.id,
      resumedAt: resumption.resumed_at,
      pausedAt: resumption.paused_at,
      startId: start?.id ?? null,
      jobStateBefore: job.operational_state,
      jobVersion,
      packagesResumed: packages,
    },
  }
}

// --- Site checks -------------------------------------------------------------------------------------------------

export type SiteCheckInput = {
  propertyConfirmed: boolean
  accessAvailable: boolean
  customerPresent: boolean
  hazardsReviewed: boolean
  siteCondition: 'as_described' | 'differs'
  note?: string
}

export async function recordSiteCheck(tx: Tx, actor: StaffActor, visitId: string, input: SiteCheckInput) {
  const visit = await lockedVisit(tx, visitId)
  const team = await tx
    .selectFrom('work.reservations')
    .select('staff_user_id')
    .where('visit_id', '=', visit.id)
    .where('staff_user_id', '=', actor.userId)
    .where('resource', '=', 'worker')
    .where('kind', '=', 'confirmed')
    .where('ended_at', 'is', null)
    .executeTakeFirst()
  if (!team) throw new ApiError('FORBIDDEN')
  if (visit.state !== 'arrived') throw conflict([field('visit', 'ARRIVED_FIRST')])
  const note = input.note?.trim() || null
  if (input.siteCondition === 'differs' && !note) throw conflict([field('body.note', 'NOTE_REQUIRED')])
  const packet = await tx
    .selectFrom('work.job_packets')
    .select('version')
    .where('job_id', '=', visit.jobId)
    .orderBy('version', 'desc')
    .limit(1)
    .executeTakeFirst()
  if (!packet) throw conflict([field('packet', 'PACKET_NOT_VIEWED')])
  let holdId: string | null = null
  if (input.siteCondition === 'differs') {
    holdId = await insertJobHold(tx, {
      projectId: visit.projectId,
      jobId: visit.jobId,
      category: 'site_condition',
      note: note as string,
      source: 'site_check',
      raisedBy: actor.userId,
    })
    await syncJobHoldItem(tx, visit.jobId)
  }
  const row = await tx
    .insertInto('work.start_site_checks')
    .values({
      job_id: visit.jobId,
      project_id: visit.projectId,
      visit_id: visit.id,
      staff_user_id: actor.userId,
      property_confirmed: input.propertyConfirmed,
      access_available: input.accessAvailable,
      customer_present: input.customerPresent,
      hazards_reviewed: input.hazardsReviewed,
      site_condition: input.siteCondition,
      note,
      hold_id: holdId,
      packet_version: packet.version,
    })
    .returning(['id', 'recorded_at'])
    .executeTakeFirstOrThrow()
  return { id: row.id, recordedAt: row.recorded_at, holdId, visit }
}

// --- Field photos (before and after) ------------------------------------------------------------------------------

export class BeforePhotoError extends Error {
  constructor(readonly problem: string) {
    super(problem)
  }
}

export type FieldPhotoPhase = 'before' | 'after'

/**
 * One field photo of a work package on an arrived visit (TSK-0073 before photos; TSK-0076 after photos, area labels,
 * pairs and processing). Checked like request photos, stored once under an opaque key in the private bucket,
 * quarantined until the photo processing checks the stored original again, internal until Owner or Office share it.
 * An after photo needs the uploader's own work start on the visit; its pair is a before photo of the same package.
 */
export async function uploadFieldPhoto(
  tx: Tx,
  actor: StaffActor,
  visitId: string,
  input: {
    phase: FieldPhotoPhase
    workPackageId: string
    bytes: Uint8Array
    declaredType: string
    storage: ObjectStorage | null
    requestId: string
    deviceCapturedAt?: string | undefined
    areaLabel?: string | undefined
    pairOf?: string | undefined
  },
) {
  const visit = await lockedVisit(tx, visitId)
  const limits = photoLimits(await loadConfig(tx))
  if (!limits || !input.storage) throw new BeforePhotoError('not_configured')
  const declared = input.declaredType.split(';')[0]?.trim().toLowerCase() ?? ''
  if (input.bytes.length === 0) throw new BeforePhotoError('empty')
  if (input.bytes.length > limits.maxFileBytes) throw new BeforePhotoError('too_large')
  if (!limits.types.includes(declared)) throw new BeforePhotoError('type_not_allowed')
  const problem = contentProblems(input.bytes, declared)[0]
  if (problem) throw new BeforePhotoError(problem)
  const pkg = await tx
    .selectFrom('work.work_packages')
    .select('id')
    .where('id', '=', input.workPackageId)
    .where('job_id', '=', visit.jobId)
    .executeTakeFirst()
  if (!pkg) throw new BeforePhotoError('unknown_work_package')
  if (!['arrived'].includes(visit.state)) throw conflict([field('visit', 'ARRIVED_FIRST')])
  if (input.phase === 'after') {
    const started = await tx
      .selectFrom('work.work_starts')
      .select('id')
      .where('visit_id', '=', visit.id)
      .where('staff_user_id', '=', actor.userId)
      .executeTakeFirst()
    if (!started) throw conflict([field('visit', 'START_WORK_FIRST')])
  }
  const pairOf = input.phase === 'after' ? input.pairOf : undefined
  if (input.pairOf && input.phase !== 'after') throw new BeforePhotoError('pair_after_only')
  if (pairOf) {
    const pair = await tx
      .selectFrom('work.field_photos')
      .select('id')
      .where('id', '=', pairOf)
      .where('phase', '=', 'before')
      .where('work_package_id', '=', pkg.id)
      .executeTakeFirst()
    if (!pair) throw new BeforePhotoError('unknown_pair')
  }
  const areaLabel = input.areaLabel?.trim() ? input.areaLabel.trim() : null
  const sha256 = createHash('sha256').update(input.bytes).digest('hex')
  const existing = await tx
    .selectFrom('work.field_photos')
    .select(['id', 'uploaded_at'])
    .where('visit_id', '=', visit.id)
    .where('work_package_id', '=', pkg.id)
    .where('phase', '=', input.phase)
    .where('sha256', '=', sha256)
    .executeTakeFirst()
  if (existing) return { id: existing.id, uploadedAt: existing.uploaded_at, created: false, visit }
  const id = randomUUID()
  // Opaque key: no name, address or file name; the original is written once and never overwritten.
  const key = `jobs/${input.phase}-photos/${id}`
  const row = await tx
    .insertInto('work.field_photos')
    .values({
      id,
      job_id: visit.jobId,
      project_id: visit.projectId,
      visit_id: visit.id,
      work_package_id: pkg.id,
      staff_user_id: actor.userId,
      object_key: key,
      content_type: declared,
      byte_size: input.bytes.length,
      sha256,
      device_captured_at: input.deviceCapturedAt ? new Date(input.deviceCapturedAt) : null,
      phase: input.phase,
      area_label: areaLabel,
      pair_of: pairOf ?? null,
    })
    .returning(['id', 'uploaded_at'])
    .executeTakeFirstOrThrow()
  // The row first (refused if the uploader is not assigned), then the object.
  await input.storage.put(key, input.bytes, declared)
  await outbox.add(tx, {
    type: FIELD_PHOTO_UPLOADED_EVENT,
    aggregate: { type: 'field_photo', id },
    payload: { photoId: id },
    idempotencyKey: `${FIELD_PHOTO_UPLOADED_EVENT}:${id}`,
    requestId: input.requestId,
  })
  if (input.phase === 'before') await syncExceptionItem(tx, visit.jobId)
  return { id: row.id, uploadedAt: row.uploaded_at, created: true, visit }
}

/** A before photo (TSK-0073): a field photo of the before phase. */
export function uploadBeforePhoto(
  tx: Tx,
  actor: StaffActor,
  visitId: string,
  input: Omit<Parameters<typeof uploadFieldPhoto>[3], 'phase' | 'pairOf'>,
) {
  return uploadFieldPhoto(tx, actor, visitId, { ...input, phase: 'before' })
}

// --- Exceptions --------------------------------------------------------------------------------------------------

export type ExceptionRequestInput = {
  kind: GateExceptionKind
  reason: string
  evidence: Record<string, unknown>
}

function evidenceOf(input: ExceptionRequestInput): ExceptionEvidence {
  const e = input.evidence
  switch (input.kind) {
    case 'customer_not_present':
      return { kind: input.kind, authorization: String(e['authorization']), contact: String(e['contact']) }
    case 'before_photo_upload_failed':
      return {
        kind: input.kind,
        workPackageIds: (e['workPackageIds'] as string[]) ?? [],
        photosOnDevice: Number(e['photosOnDevice']),
        failure: String(e['failure']),
      }
    case 'deposit_bookkeeping_pending':
      return {
        kind: input.kind,
        provider: 'square',
        transactionReference: String(e['transactionReference']),
        amountCents: Number(e['amountCents']),
      }
  }
}

export async function requestException(
  tx: Tx,
  actor: StaffActor,
  visitId: string,
  input: ExceptionRequestInput & { environment: GateEnvironment },
) {
  const visit = await lockedVisit(tx, visitId)
  const facts = await gatherGate(tx, visit, actor.userId, { environment: input.environment })
  await settleExceptions(tx, facts.exceptions)
  if (!facts.assigned) throw new ApiError('FORBIDDEN')
  if (!['en_route', 'arrived'].includes(visit.state) || !facts.packet)
    throw conflict([field('visit', 'VISIT_NOT_ACTIVE')])
  const evidence = evidenceOf(input)
  const access = await tx
    .selectFrom('crm.property_details')
    .select('detail')
    .where('property_id', '=', visit.propertyId)
    .where('detail', 'in', ['access_notes', 'access_windows'])
    .executeTakeFirst()
  const deposit = input.kind === 'deposit_bookkeeping_pending' ? await depositView(tx, actor, visit.jobId) : null
  const problems = exceptionRequestProblems(evidence, {
    missing: facts.found,
    scopeAccepted: facts.packet.content.scope.snapshotId !== null,
    accessInstructions: access !== undefined,
    alreadyLive: facts.exceptions.some((e) => e.kind === input.kind && ['requested', 'approved'].includes(e.state)),
    depositDueCents: deposit?.remainingCents ?? null,
  })
  if (problems.length) throw conflict(problems.map((p) => field('exception', p)))
  const row = await tx
    .insertInto('work.gate_exceptions')
    .values({
      job_id: visit.jobId,
      project_id: visit.projectId,
      visit_id: visit.id,
      kind: input.kind,
      requirement: EXCEPTION_REQUIREMENT[input.kind],
      reason: input.reason.trim(),
      evidence: JSON.stringify(input.evidence),
      requested_by: actor.userId,
      packet_version: facts.packet.version,
      expires_at: visit.dayEndsAt,
    })
    .returning(['id', 'version', 'requested_at'])
    .executeTakeFirstOrThrow()
  await syncExceptionItem(tx, visit.jobId)
  return { id: row.id, version: row.version, requestedAt: row.requested_at, visit }
}

export type DecisionInput =
  | { event: 'approve'; followUpOwnerId: string; followUpDue: string; note?: string; providerVerified?: boolean }
  | { event: 'decline'; reason: string }

export async function decideException(
  tx: Tx,
  actor: StaffActor,
  exceptionId: string,
  expectedVersion: number,
  input: DecisionInput,
  environment: GateEnvironment,
) {
  const first = await tx
    .selectFrom('work.gate_exceptions')
    .select(['visit_id'])
    .where('id', '=', exceptionId)
    .executeTakeFirst()
  if (!first) throw new ApiError('NOT_FOUND')
  const visit = await lockedVisit(tx, first.visit_id)
  // The exception's standing is read again under the locks: an ended one is never approved.
  const requester = await tx
    .selectFrom('work.gate_exceptions')
    .select('requested_by')
    .where('id', '=', exceptionId)
    .executeTakeFirstOrThrow()
  const facts = await gatherGate(tx, visit, requester.requested_by, { environment })
  await settleExceptions(tx, facts.exceptions)
  const e = facts.exceptions.find((x) => x.id === exceptionId) as ExceptionRow
  if (e.version !== expectedVersion)
    throw new ApiError('STALE_VERSION', { current: { version: e.version, values: { state: e.state } } })
  if (input.event === 'approve') {
    const owner = await tx
      .selectFrom('identity.staff_users')
      .select('id')
      .where('id', '=', input.followUpOwnerId)
      .where('status', '=', 'active')
      .executeTakeFirst()
    if (!owner)
      throw new ApiError('VALIDATION_FAILED', { fieldErrors: [field('body.followUpOwnerId', 'unknown_staff')] })
  }
  const result = apply({ machine: 'gate_exception.lifecycle', state: e.state, version: e.version }, input.event, {
    actor: 'staff',
    expectedVersion,
    now: new Date(),
    facts: {
      requestedBy: e.requestedBy,
      actorId: actor.userId,
      kind: e.kind,
      ...(input.event === 'approve'
        ? {
            followUpOwnerId: input.followUpOwnerId,
            followUpDue: input.followUpDue,
            ...(input.providerVerified !== undefined ? { providerVerified: input.providerVerified } : {}),
          }
        : { reason: input.reason }),
    },
  })
  if (!result.ok)
    throw conflict(
      (result.problems.length ? result.problems : [{ code: result.code }]).map((p) =>
        field(p.code === 'INVALID_TRANSITION' ? 'state' : 'body', p.code),
      ),
    )
  await tx
    .updateTable('work.gate_exceptions')
    .set({
      state: result.to,
      version: result.version,
      decided_by: actor.userId,
      decided_at: sql<Date>`now()`,
      ...(input.event === 'approve'
        ? {
            decision_note: input.note?.trim() || null,
            follow_up_owner: input.followUpOwnerId,
            follow_up_due: input.followUpDue,
            provider_verified: e.kind === 'deposit_bookkeeping_pending' ? input.providerVerified === true : null,
          }
        : { decision_note: input.reason.trim() }),
    })
    .where('id', '=', e.id)
    .execute()
  await syncExceptionItem(tx, visit.jobId)
  return { id: e.id, kind: e.kind, state: result.to, version: result.version, visit }
}

/**
 * Where an exception's follow-up stands (HH-WORK-03: pending upload or reconciliation tasks stay open after the
 * approval expires, until resolved). PROPOSED for the customer walkthrough deferred by "customer not present": open
 * until the visit is completed.
 */
export async function followUpOf(
  tx: Tx,
  e: Pick<ExceptionRow, 'kind' | 'state' | 'evidence' | 'decidedAt'>,
  visit: Pick<GateVisit, 'id' | 'jobId' | 'state'>,
): Promise<'none' | 'open' | 'resolved'> {
  if (e.decidedAt === null || e.state === 'declined') return 'none'
  switch (e.kind) {
    case 'before_photo_upload_failed': {
      const counts = await beforePhotoCounts(tx, visit.id)
      const ids = Array.isArray(e.evidence['workPackageIds']) ? (e.evidence['workPackageIds'] as string[]) : []
      return ids.every((id) => (counts.get(id) ?? 0) > 0) ? 'resolved' : 'open'
    }
    case 'deposit_bookkeeping_pending': {
      if (!visit.jobId) return 'open'
      const r = await sql<{
        gate: string
      }>`SELECT finance.work_visit_deposit_gate(${visit.jobId}::uuid) AS gate`.execute(tx)
      return ['not_required', 'satisfied', 'waived'].includes(r.rows[0]?.gate ?? '') ? 'resolved' : 'open'
    }
    case 'customer_not_present':
      return visit.state === 'completed' ? 'resolved' : 'open'
  }
}

/** The Owner's queue item of a job's exceptions: requests to decide first, then approved ones with an open follow-up. */
export async function syncExceptionItem(tx: Tx, jobId: string): Promise<void> {
  const rows = await tx
    .selectFrom('work.gate_exceptions as g')
    .innerJoin('work.visits as v', 'v.id', 'g.visit_id')
    .innerJoin('crm.projects as p', 'p.id', 'g.project_id')
    .select([
      'g.kind',
      'g.state',
      'g.evidence',
      'g.decided_at',
      'g.requested_at',
      'v.id as visit_id',
      'v.state as visit_state',
      'p.id as project_id',
      'p.reference',
    ])
    .where('g.job_id', '=', jobId)
    .orderBy('g.requested_at')
    .execute()
  const requested = rows.filter((r) => r.state === 'requested')
  let open = requested[0]
  let reason = 'start_work_exception_requested'
  if (!open) {
    for (const r of rows) {
      const f = await followUpOf(
        tx,
        {
          kind: r.kind as GateExceptionKind,
          state: r.state as ExceptionRow['state'],
          evidence: r.evidence as Record<string, unknown>,
          decidedAt: r.decided_at,
        },
        { id: r.visit_id, jobId, state: r.visit_state },
      )
      if (f === 'open') {
        open = r
        reason = 'start_work_exception_follow_up'
        break
      }
    }
  }
  if (!open) {
    await resolveQueueItem(tx, { type: 'start_work_exception', subjectId: jobId, resolution: 'exceptions_settled' })
    return
  }
  await openQueueItem(tx, {
    type: 'start_work_exception',
    subjectId: jobId,
    reason,
    projectId: open.project_id,
    reference: open.reference,
    status: open.state,
    assignedStaffId: null,
    openedAt: open.requested_at,
  })
}

// --- Holds -------------------------------------------------------------------------------------------------------

export async function insertJobHold(
  tx: Tx,
  input: {
    projectId: string
    jobId: string
    category: JobHoldCategory
    note: string
    source: 'job_hold' | 'site_check'
    raisedBy: string
  },
): Promise<string> {
  const row = await tx
    .insertInto('work.holds')
    .values({
      kind: 'job_requirement',
      scope_type: 'job',
      scope_id: input.jobId,
      project_id: input.projectId,
      request_id: null,
      category: input.category,
      note: input.note,
      source: input.source,
      source_ref: `${input.source}:${randomUUID()}`,
      raised_by: input.raisedBy,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  return row.id
}

/** One job_hold queue item per job while a job-level Hold blocks; resolved with the last one. */
export async function syncJobHoldItem(tx: Tx, jobId: string): Promise<void> {
  const first = await tx
    .selectFrom('work.holds as h')
    .innerJoin('crm.projects as p', 'p.id', 'h.project_id')
    .innerJoin('work.jobs as j', 'j.id', 'h.scope_id')
    .select(['h.raised_at', 'h.source', 'p.id as project_id', 'p.reference', 'j.operational_state'])
    .where('h.kind', '=', 'job_requirement')
    .where('h.scope_id', '=', jobId)
    .where('h.state', 'in', [...BLOCKING_HOLD_STATES])
    .orderBy('h.raised_at')
    .limit(1)
    .executeTakeFirst()
  if (!first) {
    await resolveQueueItem(tx, { type: 'job_hold', subjectId: jobId, resolution: 'set_ready' })
    return
  }
  await openQueueItem(tx, {
    type: 'job_hold',
    subjectId: jobId,
    reason: first.source === 'site_check' ? 'site_condition_differs' : 'job_on_hold',
    projectId: first.project_id,
    reference: first.reference,
    status: first.operational_state,
    assignedStaffId: null,
    openedAt: first.raised_at,
  })
}

type HoldRow = {
  id: string
  kind: string
  state: string
  version: number
  raised_by: string
  project_id: string
  scope_id: string
  category: string
}

/** A job-scoped hold of the given kind under its job's lock, at the version the caller saw. */
async function lockedHold(tx: Tx, holdId: string, kind: 'job_requirement' | 'critical_safety', expected: number) {
  const scope = await tx
    .selectFrom('work.holds')
    .select('scope_id')
    .where('id', '=', holdId)
    .where('kind', '=', kind)
    .executeTakeFirst()
  if (!scope) throw new ApiError('NOT_FOUND')
  await lockJob(tx, scope.scope_id)
  const hold = (await tx
    .selectFrom('work.holds')
    .select(['id', 'kind', 'state', 'version', 'raised_by', 'project_id', 'scope_id', 'category'])
    .where('id', '=', holdId)
    .forUpdate()
    .executeTakeFirstOrThrow()) as HoldRow
  if (hold.version !== expected)
    throw new ApiError('STALE_VERSION', { current: { version: hold.version, values: { state: hold.state } } })
  return hold
}

function refused(result: { ok: false; code: string; problems: readonly { code: string }[] }): never {
  throw conflict(
    (result.problems.length ? result.problems : [{ code: result.code }]).map((p) =>
      field(p.code === 'INVALID_TRANSITION' ? 'state' : 'body', p.code),
    ),
  )
}

/**
 * The Owner sets Ready on a job-level Hold / Ready note with how the requirement was resolved (OWN-DEC-137): from open
 * the review starts and ends in the same transaction. The Owner is recorded as the reviewer.
 */
export async function setJobHoldReady(
  tx: Tx,
  actor: StaffActor,
  holdId: string,
  expected: number,
  resolutionNote: string,
) {
  const hold = await lockedHold(tx, holdId, 'job_requirement', expected)
  let state = hold.state as HoldState
  let version = hold.version
  const facts = { kind: 'job_requirement' as const, raisedBy: hold.raised_by, actorId: actor.userId }
  if (state === 'open') {
    const r = apply({ machine: 'hold.lifecycle', state, version }, 'start_review', {
      actor: 'staff',
      expectedVersion: version,
      now: new Date(),
      facts,
    })
    if (!r.ok) refused(r)
    await tx
      .updateTable('work.holds')
      .set({ state: r.to, version: r.version, review_started_by: actor.userId, review_started_at: sql<Date>`now()` })
      .where('id', '=', hold.id)
      .execute()
    state = r.to
    version = r.version
  }
  const reviewer = (
    await tx.selectFrom('identity.staff_users').select('display_name').where('id', '=', actor.userId).executeTakeFirst()
  )?.display_name
  const r = apply({ machine: 'hold.lifecycle', state, version }, 'resolve', {
    actor: 'staff',
    expectedVersion: version,
    now: new Date(),
    facts: { ...facts, resolutionNote, reviewer: reviewer?.trim() || 'Owner' },
  })
  if (!r.ok) refused(r)
  await tx
    .updateTable('work.holds')
    .set({
      state: r.to,
      version: r.version,
      resolution_note: resolutionNote.trim(),
      reviewer: reviewer?.trim() || 'Owner',
      resolved_by: actor.userId,
      resolved_at: sql<Date>`now()`,
    })
    .where('id', '=', hold.id)
    .execute()
  await syncJobHoldItem(tx, hold.scope_id)
  return { hold, state: r.to, version: r.version }
}

export type CriticalAction =
  | { event: 'start_review' }
  | { event: 'resolve'; resolutionNote: string; evidence: string; reviewer: string; reviewerQualification: string }
  | { event: 'cancel_as_error'; reason: string }

/** A critical safety hold's review, release with evidence, or cancellation as entered in error (never by its raiser). */
export async function moveCriticalHold(
  tx: Tx,
  actor: StaffActor,
  holdId: string,
  expected: number,
  input: CriticalAction,
) {
  const hold = await lockedHold(tx, holdId, 'critical_safety', expected)
  const r = apply({ machine: 'hold.lifecycle', state: hold.state as HoldState, version: hold.version }, input.event, {
    actor: 'staff',
    expectedVersion: expected,
    now: new Date(),
    facts: {
      kind: 'critical_safety',
      raisedBy: hold.raised_by,
      actorId: actor.userId,
      ...(input.event === 'resolve'
        ? {
            resolutionNote: input.resolutionNote,
            reviewer: input.reviewer,
            evidence: input.evidence,
            reviewerQualification: input.reviewerQualification,
          }
        : {}),
      ...(input.event === 'cancel_as_error' ? { reason: input.reason } : {}),
    },
  })
  if (!r.ok) refused(r)
  const now = sql<Date>`now()`
  await tx
    .updateTable('work.holds')
    .set({
      state: r.to,
      version: r.version,
      ...(input.event === 'start_review' ? { review_started_by: actor.userId, review_started_at: now } : {}),
      ...(input.event === 'resolve'
        ? {
            resolution_note: input.resolutionNote.trim(),
            resolution_evidence: input.evidence.trim(),
            reviewer: input.reviewer.trim(),
            reviewer_qualification: input.reviewerQualification.trim(),
            resolved_by: actor.userId,
            resolved_at: now,
          }
        : {}),
      ...(input.event === 'cancel_as_error'
        ? { cancel_reason: input.reason.trim(), canceled_by: actor.userId, canceled_at: now }
        : {}),
    })
    .where('id', '=', hold.id)
    .execute()
  if (r.to === 'resolved' || r.to === 'canceled_as_error')
    await resolveQueueItem(tx, { type: 'safety_hold', subjectId: hold.id, resolution: r.to })
  return { hold, state: r.to, version: r.version }
}
