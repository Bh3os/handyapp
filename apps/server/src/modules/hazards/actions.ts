// What Stop Work, Report Hazard and issue reports change (TSK-0077; HH-WORK-08, HH-WORK-09, HH-WORK-13, HH-CHG-04,
// HH-INC-01, HH-INC-02, HH-OFF-03, T48, T54, ENT-IssueReport, ENT-Hold, ENT-Photo, OWN-DEC-38, OWN-DEC-80, OWN-DEC-108,
// OWN-DEC-124, OWN-DEC-143, OWN-DEC-152, OWN-DEC-172, RULE-SAFETY-GATES, RULE-HUMAN-REVIEW).
// - reportHazard(): one transaction under the job's row lock: the critical safety hold (written first, naming the
//   report), the job's pause when work was under way, the affected work packages blocked, the report, and the hold's
//   top-priority queue item; the customer-notice draft follows from the committed event (never the hold: the outbox
//   refuses a critical hold). Nothing about the job's other state (another hold, a failing gate, an old packet, a
//   paused job) refuses it, and a text, a work package or a visit the server cannot place is left out, never refused.
// - reportIssue(): an issue report of HH-WORK-08. Critical (or an unsafe condition) takes the same stop-work path; an
//   on-site resolution is recorded only within the worker's stated training and scope with no unresolved safety hold,
//   and notifies the Owner (field_issue queue item).
// - Photos (only when safe), emergency stabilization (recorded separately, escalated to the Owner) and the Owner's
//   review of a non-critical report. Releasing a critical hold is the documented path of the start module (0074).
// - The work-paused customer notice (MESSAGE 15, job.paused): an Owner-released draft, never automatic (OWN-DEC-152).
import { createHash, randomUUID } from 'node:crypto'
import type { Db, Tx } from '@handyhub/db'
import {
  affectedPackages,
  effectiveSeverity,
  HAZARD_GUIDANCE,
  HAZARD_KINDS,
  HAZARD_REVIEWER,
  holdCategoryOf,
  onSiteResolutionProblems,
  pausesJob,
  reportVisibility,
  writesCriticalHold,
  type HazardKind,
  type IssueCategory,
  type IssueSeverity,
  type NextOwner,
  type OnSiteResolution,
  type ReportKind,
} from '@handyhub/domain'
import type { StaffActor } from '@handyhub/policy'
import { sql } from 'kysely'
import { ApiError, type FieldError } from '../../api/errors.js'
import { audit } from '../../platform/audit.js'
import type { Automation, JobOutcome } from '../../platform/automation.js'
import { loadConfig } from '../../platform/config/index.js'
import { outbox } from '../../platform/outbox.js'
import { currentContext } from '../../platform/request-context.js'
import type { ObjectStorage } from '../../providers/index.js'
import { createDraft, DraftError, firstNameOf, jobNumberOf, type RecordCheck } from '../notifications/index.js'
import { contentProblems } from '../photos/content.js'
import { photoLimits } from '../photos/photos.js'
import { openQueueItem, resolveQueueItem } from '../queue/items.js'
import { lockJob } from '../start/gate.js'

type Reader = Db | Tx

const field = (f: string, code: string): FieldError => ({ field: f, code, message: '' })
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The committed event after a critical report: the work-paused draft follows from it (never the hold itself). */
export const HAZARD_REPORTED_EVENT = 'hazard.reported'
export const WORK_PAUSED_MESSAGE_KEY = 'job.paused'
/** The record a work-paused draft names: its report. */
export const NOTICE_RECORD_TYPE = 'hazard_report'

const clip = (s: string | undefined | null, max: number): string | null => {
  const v = typeof s === 'string' ? s.trim() : ''
  return v === '' ? null : v.slice(0, max)
}
const deviceTime = (s: string | undefined): Date | null => {
  if (typeof s !== 'string') return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

type LockedJob = { id: string; projectId: string; state: string; version: number; reference: string }

/** The job under its row lock (the lock every Start Work and every job-scoped hold takes, 0074). */
async function lockedJob(tx: Tx, jobId: string): Promise<LockedJob> {
  await lockJob(tx, jobId)
  const j = await tx
    .selectFrom('work.jobs as j')
    .innerJoin('crm.projects as p', 'p.id', 'j.project_id')
    .select(['j.id', 'j.project_id', 'j.operational_state', 'j.version', 'p.reference'])
    .where('j.id', '=', jobId)
    .executeTakeFirst()
  if (!j) throw new ApiError('NOT_FOUND')
  return { id: j.id, projectId: j.project_id, state: j.operational_state, version: j.version, reference: j.reference }
}

/** A visit id the server can place on this job, or null (never a refusal). */
async function visitOf(tx: Tx, jobId: string, visitId: string | undefined): Promise<string | null> {
  if (!visitId || !UUID_RE.test(visitId)) return null
  const v = await tx
    .selectFrom('work.visits')
    .select('id')
    .where('id', '=', visitId)
    .where('job_id', '=', jobId)
    .executeTakeFirst()
  return v?.id ?? null
}

type ReportSpec = {
  kind: ReportKind
  hazard: HazardKind | null
  category: IssueCategory | null
  severity: IssueSeverity
  description: string | null
  namedPackages: string[]
  visitId: string | null
  nextOwner: NextOwner
  peopleKeptAway: boolean | null
  emergencyServicesCalled: boolean | null
  resolution: OnSiteResolution | null
  deviceRecordedAt: Date | null
}

export type WrittenReport = {
  reportId: string
  holdId: string | null
  jobId: string
  projectId: string
  jobStateBefore: string
  jobState: string
  jobPaused: boolean
  affected: string[]
  reportedAt: Date
}

/**
 * Writes one report under the job lock: for a critical one the hold first (naming the report), the pause, the blocked
 * packages, then the report (the database checks the hold is this transaction's own), and the hold's queue item.
 */
async function writeReport(tx: Tx, actor: StaffActor, job: LockedJob, spec: ReportSpec): Promise<WrittenReport> {
  const reportId = randomUUID()
  const critical = writesCriticalHold(spec)
  const visibility = reportVisibility(spec)
  const packages = await tx
    .selectFrom('work.work_packages')
    .select(['id', 'state'])
    .where('job_id', '=', job.id)
    .execute()
  const known = spec.namedPackages.filter((id) => packages.some((p) => p.id === id))
  const affected = critical ? affectedPackages(spec, known, packages) : known
  let holdId: string | null = null
  let jobState = job.state
  let paused = false
  if (critical) {
    // The hold's note: what was written when it may be shared with the job's staff; for a restricted report (an
    // injury or an incident) only the code, so the details stay with the Owner and the reporter (OWN-DEC-143).
    const note =
      visibility === 'internal_operational' && spec.description
        ? spec.description.slice(0, 1000)
        : `hazard_report:${spec.hazard ?? spec.category ?? 'other_unsafe'}`
    const hold = await tx
      .insertInto('work.holds')
      .values({
        kind: 'critical_safety',
        scope_type: 'job',
        scope_id: job.id,
        project_id: job.projectId,
        request_id: null,
        category: spec.hazard ? holdCategoryOf(spec.hazard) : 'other',
        note,
        source: 'hazard_report',
        source_ref: `hazard_report:${reportId}`,
        raised_by: actor.userId,
      })
      .returning(['id', 'raised_at'])
      .executeTakeFirstOrThrow()
    holdId = hold.id
    if (pausesJob(job.state)) {
      await tx
        .updateTable('work.jobs')
        .set({ operational_state: 'paused', version: job.version + 1 })
        .where('id', '=', job.id)
        .execute()
      jobState = 'paused'
      paused = true
    }
    // Only the affected work stops (HH-CHG-04); a complete package is never reopened.
    if (affected.length)
      await tx
        .updateTable('work.work_packages')
        .set({ state: 'blocked', version: sql<number>`version + 1` })
        .where('id', 'in', affected)
        .where('state', 'in', ['planned', 'ready', 'in_progress'])
        .execute()
  }
  const row = await tx
    .insertInto('work.issue_reports')
    .values({
      id: reportId,
      job_id: job.id,
      project_id: job.projectId,
      visit_id: spec.visitId,
      kind: spec.kind,
      hazard: spec.hazard,
      category: spec.category,
      severity: spec.severity,
      description: spec.description,
      affected_work_package_ids: affected,
      visibility,
      next_owner: spec.nextOwner,
      people_kept_away: spec.peopleKeptAway,
      emergency_services_called: spec.emergencyServicesCalled,
      resolved_on_site: spec.resolution !== null,
      resolution_what_happened: spec.resolution?.whatHappened.trim() ?? null,
      resolution_steps: spec.resolution?.steps.trim() ?? null,
      resolution_materials: spec.resolution?.materials.trim() ?? null,
      resolution_check: spec.resolution?.howChecked.trim() ?? null,
      hold_id: holdId,
      job_state_before: job.state,
      job_paused: paused,
      reported_by: actor.userId,
      device_recorded_at: spec.deviceRecordedAt,
    })
    .returning('reported_at')
    .executeTakeFirstOrThrow()
  if (holdId) {
    // The top-priority staff queue item, in the same transaction (T48); its reason never names what was reported.
    await openQueueItem(tx, {
      type: 'safety_hold',
      subjectId: holdId,
      reason: 'safety_hold',
      projectId: job.projectId,
      reference: job.reference,
      status: 'open',
      assignedStaffId: null,
      openedAt: row.reported_at,
    })
    await outbox.add(tx, {
      type: HAZARD_REPORTED_EVENT,
      aggregate: { type: 'issue_report', id: reportId },
      payload: { reportId, jobId: job.id },
      idempotencyKey: `${HAZARD_REPORTED_EVENT}:${reportId}`,
      requestId: currentContext()?.requestId ?? `hazard-report:${reportId}`,
    })
  } else {
    await syncFieldIssueItem(tx, job.id)
  }
  return {
    reportId,
    holdId,
    jobId: job.id,
    projectId: job.projectId,
    jobStateBefore: job.state,
    jobState,
    jobPaused: paused,
    affected,
    reportedAt: row.reported_at,
  }
}

// --- Stop Work / Report Hazard -----------------------------------------------------------------------------------

export type HazardInput = {
  hazard?: string
  description?: string
  workPackageIds?: string[]
  visitId?: string
  peopleKeptAway?: boolean
  emergencyServicesCalled?: boolean
  deviceRecordedAt?: string
}

export async function reportHazard(tx: Tx, actor: StaffActor, jobId: string, input: HazardInput) {
  const job = await lockedJob(tx, jobId)
  const hazard: HazardKind = (HAZARD_KINDS as readonly string[]).includes(input.hazard ?? '')
    ? (input.hazard as HazardKind)
    : 'other_unsafe'
  const written = await writeReport(tx, actor, job, {
    kind: 'hazard',
    hazard,
    category: null,
    severity: 'critical',
    description: clip(input.description, 2000),
    namedPackages: (input.workPackageIds ?? []).filter((id) => UUID_RE.test(id)),
    visitId: await visitOf(tx, job.id, input.visitId),
    nextOwner: 'owner',
    peopleKeptAway: input.peopleKeptAway ?? null,
    emergencyServicesCalled: input.emergencyServicesCalled ?? null,
    resolution: null,
    deviceRecordedAt: deviceTime(input.deviceRecordedAt),
  })
  return { ...written, hazard, reviewer: HAZARD_REVIEWER[hazard], guidance: [...HAZARD_GUIDANCE[hazard]] }
}

// --- Issue reports -----------------------------------------------------------------------------------------------

export type IssueInput = {
  category: IssueCategory
  severity?: IssueSeverity
  description: string
  workPackageId?: string
  visitId?: string
  nextOwner?: NextOwner
  resolution?: OnSiteResolution
  deviceRecordedAt?: string
}

export async function reportIssue(tx: Tx, actor: StaffActor, jobId: string, input: IssueInput) {
  const job = await lockedJob(tx, jobId)
  const severity = effectiveSeverity({ kind: 'issue', category: input.category, severity: input.severity ?? null })
  if (input.resolution) {
    const open = await tx
      .selectFrom('work.holds')
      .select((eb) => eb.fn.countAll<string>().as('n'))
      .where('project_id', '=', job.projectId)
      .where('kind', '=', 'critical_safety')
      .where('state', 'in', ['open', 'under_review'])
      .executeTakeFirstOrThrow()
    const problems = onSiteResolutionProblems({ kind: 'issue', category: input.category, severity }, input.resolution, {
      unresolvedSafetyHolds: Number(open.n),
    })
    if (problems.length)
      throw new ApiError('CONFLICT', { fieldErrors: problems.map((p) => field('body.resolution', p)) })
  }
  return writeReport(tx, actor, job, {
    kind: 'issue',
    hazard: null,
    category: input.category,
    severity,
    description: clip(input.description, 2000),
    namedPackages: input.workPackageId && UUID_RE.test(input.workPackageId) ? [input.workPackageId] : [],
    visitId: await visitOf(tx, job.id, input.visitId),
    nextOwner: input.nextOwner ?? 'owner',
    peopleKeptAway: null,
    emergencyServicesCalled: null,
    resolution: input.resolution ?? null,
    deviceRecordedAt: deviceTime(input.deviceRecordedAt),
  })
}

/**
 * The Owner's field_issue item of a job: open while any non-critical report waits for the Owner's review (a resolution
 * on site first), resolved with the last review.
 */
export async function syncFieldIssueItem(tx: Tx, jobId: string): Promise<void> {
  const rows = await tx
    .selectFrom('work.issue_reports as r')
    .innerJoin('crm.projects as p', 'p.id', 'r.project_id')
    .leftJoin('work.issue_report_reviews as v', 'v.report_id', 'r.id')
    .select(['r.resolved_on_site', 'r.reported_at', 'r.project_id', 'p.reference'])
    .where('r.job_id', '=', jobId)
    .where('r.hold_id', 'is', null)
    .where('v.report_id', 'is', null)
    .orderBy('r.reported_at')
    .execute()
  const first = rows.find((r) => r.resolved_on_site) ?? rows[0]
  if (!first) {
    await resolveQueueItem(tx, { type: 'field_issue', subjectId: jobId, resolution: 'reviewed' })
    return
  }
  await openQueueItem(tx, {
    type: 'field_issue',
    subjectId: jobId,
    reason: first.resolved_on_site ? 'issue_resolved_on_site' : 'issue_reported',
    projectId: first.project_id,
    reference: first.reference,
    status: 'reported',
    assignedStaffId: null,
    openedAt: rows[0]?.reported_at ?? first.reported_at,
  })
}

// --- Photos, stabilization and the Owner's review ---------------------------------------------------------------

type ReportRow = {
  id: string
  job_id: string
  project_id: string
  kind: string
  severity: string
  visibility: string
  reported_by: string
  hold_id: string | null
}

export async function reportOf(db: Reader, reportId: string): Promise<ReportRow | undefined> {
  if (!UUID_RE.test(reportId)) return undefined
  return db
    .selectFrom('work.issue_reports')
    .select(['id', 'job_id', 'project_id', 'kind', 'severity', 'visibility', 'reported_by', 'hold_id'])
    .where('id', '=', reportId)
    .executeTakeFirst()
}

export class ReportPhotoError extends Error {
  constructor(readonly problem: string) {
    super(problem)
  }
}

/** Only the Owner and the reporter add to a restricted report (OWN-DEC-143). */
function mayAddToReport(actor: StaffActor, r: ReportRow): boolean {
  return r.visibility !== 'restricted_incident' || r.reported_by === actor.userId || actor.roles.includes('owner')
}

export async function addReportPhoto(
  tx: Tx,
  actor: StaffActor,
  reportId: string,
  input: { bytes: Uint8Array; declaredType: string; storage: ObjectStorage | null; deviceCapturedAt?: string },
) {
  const r = await reportOf(tx, reportId)
  if (!r) throw new ApiError('NOT_FOUND')
  if (!mayAddToReport(actor, r)) throw new ApiError('FORBIDDEN')
  const limits = photoLimits(await loadConfig(tx))
  if (!limits || !input.storage) throw new ReportPhotoError('not_configured')
  const declared = input.declaredType.split(';')[0]?.trim().toLowerCase() ?? ''
  if (input.bytes.length === 0) throw new ReportPhotoError('empty')
  if (input.bytes.length > limits.maxFileBytes) throw new ReportPhotoError('too_large')
  if (!limits.types.includes(declared)) throw new ReportPhotoError('type_not_allowed')
  const problem = contentProblems(input.bytes, declared)[0]
  if (problem) throw new ReportPhotoError(problem)
  const sha256 = createHash('sha256').update(input.bytes).digest('hex')
  const existing = await tx
    .selectFrom('work.issue_report_photos')
    .select(['id', 'uploaded_at'])
    .where('report_id', '=', r.id)
    .where('sha256', '=', sha256)
    .executeTakeFirst()
  if (existing) return { id: existing.id, uploadedAt: existing.uploaded_at, created: false, report: r }
  const id = randomUUID()
  // Opaque key: no name, address or file name; restricted photos never join a shared gallery (HH-INC-02).
  const key = `jobs/report-photos/${id}`
  const row = await tx
    .insertInto('work.issue_report_photos')
    .values({
      id,
      report_id: r.id,
      job_id: r.job_id,
      project_id: r.project_id,
      staff_user_id: actor.userId,
      object_key: key,
      content_type: declared,
      byte_size: input.bytes.length,
      sha256,
      device_captured_at: deviceTime(input.deviceCapturedAt),
    })
    .returning(['id', 'uploaded_at'])
    .executeTakeFirstOrThrow()
  await input.storage.put(key, input.bytes, declared)
  return { id: row.id, uploadedAt: row.uploaded_at, created: true, report: r }
}

export type StabilizationInput = {
  trigger: string
  actions: string
  whyNecessary: string
  evidence?: string
  ownerNotifiedAt?: string
  customerNotifiedAt?: string
  followUp?: string
}

/**
 * Emergency stabilization, recorded separately from change orders (HH-CHG-04) on a critical report, and escalated to
 * the Owner on the hold's queue item. The app offers no make-safe steps: no approved SOP lists them yet (NOT
 * CONFIGURED until competent review, OWN-DEC-17); this records what the worker did within their training.
 */
export async function recordStabilization(tx: Tx, actor: StaffActor, reportId: string, input: StabilizationInput) {
  const r = await reportOf(tx, reportId)
  if (!r) throw new ApiError('NOT_FOUND')
  if (!mayAddToReport(actor, r)) throw new ApiError('FORBIDDEN')
  if (!r.hold_id) throw new ApiError('CONFLICT', { fieldErrors: [field('report', 'NOT_A_STOP')] })
  const job = await lockedJob(tx, r.job_id)
  const row = await tx
    .insertInto('work.stabilization_records')
    .values({
      report_id: r.id,
      job_id: r.job_id,
      project_id: r.project_id,
      recorded_by: actor.userId,
      trigger_text: input.trigger.trim(),
      actions: input.actions.trim(),
      why_necessary: input.whyNecessary.trim(),
      evidence: clip(input.evidence, 1000),
      owner_notified_at: deviceTime(input.ownerNotifiedAt),
      customer_notified_at: deviceTime(input.customerNotifiedAt),
      follow_up: clip(input.followUp, 1000),
    })
    .returning(['id', 'recorded_at'])
    .executeTakeFirstOrThrow()
  const hold = await tx.selectFrom('work.holds').select('state').where('id', '=', r.hold_id).executeTakeFirstOrThrow()
  if (hold.state === 'open' || hold.state === 'under_review')
    await openQueueItem(tx, {
      type: 'safety_hold',
      subjectId: r.hold_id,
      reason: 'safety_hold',
      projectId: r.project_id,
      reference: job.reference,
      status: 'stabilization_recorded',
      assignedStaffId: null,
    })
  return { id: row.id, recordedAt: row.recorded_at, report: r }
}

export async function reviewIssueReport(tx: Tx, actor: StaffActor, reportId: string, note?: string) {
  const r = await reportOf(tx, reportId)
  if (!r) throw new ApiError('NOT_FOUND')
  if (r.hold_id)
    // A critical report is reviewed through its hold's documented release path, never here (HH-WORK-02).
    throw new ApiError('CONFLICT', { fieldErrors: [field('report', 'REVIEWED_THROUGH_HOLD')] })
  await lockJob(tx, r.job_id)
  const done = await tx
    .selectFrom('work.issue_report_reviews')
    .select('reviewed_at')
    .where('report_id', '=', r.id)
    .executeTakeFirst()
  if (done) throw new ApiError('CONFLICT', { fieldErrors: [field('report', 'ALREADY_REVIEWED')] })
  const row = await tx
    .insertInto('work.issue_report_reviews')
    .values({ report_id: r.id, reviewed_by: actor.userId, note: clip(note, 1000) })
    .returning('reviewed_at')
    .executeTakeFirstOrThrow()
  await syncFieldIssueItem(tx, r.job_id)
  return { reviewedAt: row.reviewed_at, report: r }
}

// --- The work-paused customer notice (MESSAGE 15) ---------------------------------------------------------------

/**
 * After a critical report commits: one Owner-released job.paused draft for the project's customer (email; texts wait
 * for A2P 10DLC), with the first name and the job's reference stored on it. One waiting draft per project: a second
 * stop while one is waiting adds none (PROPOSED). Never sent until the Owner releases it (OWN-DEC-152 section 3.2).
 */
export function workPausedDraftAutomation(): Automation {
  return {
    name: 'hazard.customer_notice_draft',
    trigger: { kind: 'event', eventTypes: [HAZARD_REPORTED_EVENT] },
    identity: 'system.hazards',
    inputs: {
      description: 'the committed hazard.reported event; the report and its project read when it runs',
      version: 1,
    },
    idempotency: 'one draft per report (subject job_paused:<report>); none while the project has one waiting',
    effect: 'prepares one Owner-released work-paused notice draft; never sends anything',
    retry: { maxAttempts: 5, baseDelayMs: 30_000, maxDelayMs: 900_000 },
    timeoutMs: 10_000,
    exceptionOwner: 'owner',
    audit: { action: 'hazard.customer_notice_draft' },
    handle: async ({ tx, job }): Promise<JobOutcome> => {
      const reportId = String(job.payload['reportId'] ?? '')
      const r = await reportOf(tx, reportId)
      if (!r || !r.hold_id) return 'cancelled'
      const waiting = await tx
        .selectFrom('platform.message_deliveries')
        .select('id')
        .where('message_key', '=', WORK_PAUSED_MESSAGE_KEY)
        .where('project_id', '=', r.project_id)
        .where('state', '=', 'draft')
        .executeTakeFirst()
      if (waiting) return 'cancelled'
      const c = await tx
        .selectFrom('intake.requests as q')
        .innerJoin('crm.contacts as c', 'c.id', 'q.contact_id')
        .innerJoin('crm.projects as p', 'p.id', 'q.project_id')
        .select(['c.id', 'c.full_name', 'c.email', 'p.reference'])
        .where('q.project_id', '=', r.project_id)
        .orderBy('q.submitted_at')
        .executeTakeFirst()
      if (!c) return 'cancelled'
      const destination = { channel: 'email' as const, destination: c.email, permission: 'preferred' as const }
      const values: Record<string, string> = { jobNumber: jobNumberOf(c.reference) }
      const name = firstNameOf(c.full_name)
      if (name) values['customerName'] = name
      try {
        const draft = await createDraft(tx, {
          config: await loadConfig(tx),
          messageKey: WORK_PAUSED_MESSAGE_KEY,
          destination,
          recipient: { kind: 'customer_contact', id: c.id, destinations: [destination] },
          subjectKey: `job_paused:${r.id}`,
          record: { type: NOTICE_RECORD_TYPE, id: r.id },
          values,
          projectId: r.project_id,
        })
        await audit.record(tx, {
          actor: { kind: 'system', process: 'system.hazards' },
          action: 'hazard.customer_notice_drafted',
          target: { type: 'message_delivery', id: draft.id },
          summary: { messageKey: WORK_PAUSED_MESSAGE_KEY, report: r.id, channel: 'email' },
          requestId: job.requestId,
        })
      } catch (err) {
        if (err instanceof DraftError) return 'cancelled'
        throw err
      }
      return 'done'
    },
  }
}

/**
 * The send-time check of a released work-paused notice: still current while its report's hold blocks; once the hold
 * was released or cancelled the notice is outdated and is not sent (record_changed).
 */
export const workPausedRecordCheck: RecordCheck = async (tx, { recordId }) => {
  const r = await reportOf(tx, recordId)
  if (!r?.hold_id) return 'stale'
  const h = await tx.selectFrom('work.holds').select('state').where('id', '=', r.hold_id).executeTakeFirst()
  return h && (h.state === 'open' || h.state === 'under_review') ? 'current' : 'stale'
}

/** A work-paused draft of the report, under its row lock. */
export async function lockNotice(tx: Tx, reportId: string, deliveryId: string) {
  const row = await tx
    .selectFrom('platform.message_deliveries')
    .select(['id', 'state', 'channel', 'project_id'])
    .where('id', '=', deliveryId)
    .where('record_type', '=', NOTICE_RECORD_TYPE)
    .where('record_id', '=', reportId)
    .where('message_key', '=', WORK_PAUSED_MESSAGE_KEY)
    .forUpdate()
    .executeTakeFirst()
  if (!row) throw new ApiError('NOT_FOUND')
  if (row.state !== 'draft') throw new ApiError('CONFLICT', { fieldErrors: [field('notice', 'NOTICE_NOT_DRAFT')] })
  return row
}

export async function dismissNotice(tx: Tx, actor: StaffActor, reportId: string, deliveryId: string) {
  const row = await lockNotice(tx, reportId, deliveryId)
  await tx
    .updateTable('platform.message_deliveries')
    .set({
      state: 'cancelled',
      error_code: 'dismissed',
      cancelled_by: actor.userId,
      cancelled_at: sql<Date>`now()`,
      updated_at: sql<Date>`now()`,
    })
    .where('id', '=', row.id)
    .where('state', '=', 'draft')
    .execute()
  return row
}
