// Stop Work, Report Hazard and issue reports module (TSK-0077; HH-WORK-08, HH-WORK-09, HH-WORK-13, HH-CHG-04,
// HH-INC-01, HH-INC-02, HH-OFF-03, HH-PKT-09, T48, T54, ENT-IssueReport, ENT-Hold, ENT-Photo, ENT-Message,
// OWN-DEC-38, OWN-DEC-80, OWN-DEC-108, OWN-DEC-143, OWN-DEC-152, OWN-DEC-172, RULE-SAFETY-GATES, RULE-SERVER-AUTHZ,
// RULE-HUMAN-REVIEW).
//   POST /staff/jobs/:jobId/hazard-reports            Stop Work / Report Hazard (hazard.report: every assigned worker,
//                                                     Office, the Estimator, the Owner; no fresh sign-in, no reason,
//                                                     no rate limit, no version: nothing stands in front of it)
//   POST /staff/jobs/:jobId/issue-reports             report an issue of HH-WORK-08 (job.report_issue)
//   GET  /staff/jobs/:jobId/issue-reports             the job's reports as the caller may see them (work.stop)
//   POST /staff/issue-reports/:reportId/photos        a photo, only when safe (job.add_photo)
//   POST /staff/issue-reports/:reportId/stabilizations   emergency stabilization, recorded separately (job.report_issue)
//   POST /staff/issue-reports/:reportId/review        the Owner's review of a non-critical report (issue_report.review)
//   POST /staff/issue-reports/:reportId/notices/:deliveryId/{release,dismiss}   the work-paused customer notice: the
//                                                     Owner only (message.release_draft; OWN-DEC-152 section 3.2)
//   GET  /staff/safety-holds/:holdId                  where a critical hold's queue item leads: its job (work.stop)
// - A Stop Work is never refused for the job's state: whatever other holds, failures or missing items exist, the report,
//   its critical hold, the pause and the queue item are written together under the job lock. The hold is released
//   only by the documented path of the start module (0074: the Owner, never one they raised, with evidence, the
//   reviewer and their qualification); nothing here, and no role, flag or AI, releases it.
// - Every answer carries Call 911 (tel:911): the staff app shows it first, before anything else, and never waits for
//   this server (owner amendment; OWN-DEC-172, OWN-DEC-208). TSK-0129: the reports view also carries the Owner's
//   escalation contact (the number the Owner entered in their own profile, or NOT CONFIGURED) and the recorded Call
//   Owner / Call 911 taps (apps/server/src/modules/escalation).
// - Every write is audited; texts stay on their records, never in the audit summary.
import { withTx, type Tx } from '@handyhub/db'
import type { StaffActor } from '@handyhub/policy'
import { ApiError } from '../../api/errors.js'
import type { ApiContext, ApiModule, RouteDef } from '../../api/route.js'
import { loadConfig } from '../../platform/config/index.js'
import { currentContext } from '../../platform/request-context.js'
import type { ObjectStorage } from '../../providers/index.js'
import { releaseAutomation, releaseDraft, DraftError } from '../notifications/index.js'
import { jobAssignments } from '../packets/assignments.js'
import { PHOTO_TYPES } from '../photos/content.js'
import { UPLOAD_TRANSPORT_LIMIT_BYTES } from '../photos/index.js'
import {
  addReportPhoto,
  dismissNotice,
  lockNotice,
  recordStabilization,
  reportHazard,
  reportIssue,
  reportOf,
  ReportPhotoError,
  reviewIssueReport,
  type HazardInput,
  type IssueInput,
  type StabilizationInput,
} from './actions.js'
import {
  DELIVERY_PARAMS,
  EMPTY_BODY,
  HAZARD_BODY,
  HAZARD_RESULT,
  HOLD_PARAMS,
  ISSUE_BODY,
  ISSUE_RESULT,
  JOB_PARAMS,
  NOTICE_RESULT,
  PHOTO_QUERY,
  PHOTO_RESULT,
  REPORT_PARAMS,
  REPORTS_VIEW,
  REVIEW_BODY,
  REVIEW_RESULT,
  SAFETY_HOLD_RESULT,
  STABILIZATION_BODY,
  STABILIZATION_RESULT,
} from './schemas.js'
import { reportsView } from './view.js'

export {
  HAZARD_REPORTED_EVENT,
  NOTICE_RECORD_TYPE,
  reportHazard,
  reportIssue,
  workPausedDraftAutomation,
  workPausedRecordCheck,
} from './actions.js'

const TEST = 'test/integration/hazard-reports.test.ts'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CALL_911 = 'tel:911'

function staff(ctx: ApiContext): StaffActor {
  if (ctx.actor.kind !== 'staff') throw new ApiError('FORBIDDEN')
  return ctx.actor
}
const requestIdOf = (ctx: ApiContext) => currentContext()?.requestId ?? ctx.req.id

/** The job's facts: its project and the workers assigned to it now (the policy's A cell). */
const jobFacts: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const { jobId } = req.params as { jobId: string }
  if (!UUID_RE.test(jobId)) return null
  const j = await db.selectFrom('work.jobs').select('project_id').where('id', '=', jobId).executeTakeFirst()
  return j ? { projectId: j.project_id, assignments: await jobAssignments(db, jobId) } : null
}
/** A report's job facts, and its reporter (the own-record fact of restricted details). */
const reportFacts: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const { reportId } = req.params as { reportId: string }
  const r = await reportOf(db, reportId)
  return r
    ? { projectId: r.project_id, assignments: await jobAssignments(db, r.job_id), ownerStaffId: r.reported_by }
    : null
}
const holdFacts: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const { holdId } = req.params as { holdId: string }
  if (!UUID_RE.test(holdId)) return null
  const h = await db
    .selectFrom('work.holds')
    .select(['project_id', 'scope_id'])
    .where('id', '=', holdId)
    .where('kind', '=', 'critical_safety')
    .executeTakeFirst()
  return h ? { projectId: h.project_id, assignments: await jobAssignments(db, h.scope_id) } : null
}

const STOP_TEXT =
  'If anything is unsafe: stop the affected work, keep people away and call the Owner; in an emergency call 911 at ' +
  'once, without waiting for anyone.'

export function hazardsModule(deps: { storage: ObjectStorage | null }): ApiModule {
  // The send job's declaration (its name and retry budget); the worker runs the registered one (automations.ts).
  const release = releaseAutomation({ email: null, sms: null })

  const hazard: RouteDef = {
    method: 'POST',
    path: '/staff/jobs/:jobId/hazard-reports',
    operationId: 'reportHazard',
    summary: 'Stop Work / Report Hazard',
    description:
      'Staff with hazard.report: every worker assigned to the job ("A, always, no permission needed"), Office, the ' +
      'Estimator and the Owner. No fresh sign-in, reason, version or rate limit: nothing stands in front of it, and ' +
      "nothing about the job's state refuses it (other holds, a failing Start Work gate, a paused job, an old packet). " +
      'One transaction under the job lock: a critical safety hold (written first, naming the report), the job moved ' +
      'from in_progress to paused, the affected work packages blocked (the named ones; the whole job for a gas leak, ' +
      'live wiring, hazardous material, a structural concern or an injury), the report itself and a top-priority ' +
      'safety queue item. Every field is optional: the hazard defaults to other_unsafe, a long text is cut, an id the ' +
      "server cannot place is left out. An injury's details are restricted to the Owner and the reporter. The answer " +
      'carries the guidance to show at once (a gas leak: evacuate and call from a safe place; live wiring: never ' +
      'touched), the reviewer the hazard needs (named, never decided), resolveOnSite false and Call 911. The work-' +
      'paused customer notice is drafted for the Owner to release (never automatic); the customer portal shows only ' +
      '"Work is paused for safety review." Releasing the hold is the documented path of /staff/critical-holds (never ' +
      'by the person who raised it). The same Idempotency-Key from an offline phone records it once.',
    actors: ['staff'],
    permission: 'hazard.report',
    kind: 'write',
    idempotency: 'required',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'hazard.report',
    pagination: false,
    test: TEST,
    resource: jobFacts,
    schema: { params: JOB_PARAMS, body: HAZARD_BODY, response: { 201: HAZARD_RESULT } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const actor = staff(ctx)
      const { jobId } = ctx.req.params as { jobId: string }
      const out = await reportHazard(tx, actor, jobId, (ctx.req.body ?? {}) as HazardInput)
      await ctx.audit({
        target: { type: 'issue_report', id: out.reportId },
        summary: {
          projectId: out.projectId,
          jobId,
          holdId: out.holdId,
          kind: 'hazard',
          jobPaused: out.jobPaused,
          affectedWorkPackages: out.affected.length,
        },
      })
      return {
        status: 201,
        body: {
          reportId: out.reportId,
          holdId: out.holdId as string,
          holdState: 'open',
          jobState: out.jobState,
          jobPaused: out.jobPaused,
          affectedWorkPackageIds: out.affected,
          hazard: out.hazard,
          reviewer: out.reviewer,
          guidance: out.guidance,
          resolveOnSite: false,
          emergency: { call911: CALL_911 },
          reportedAt: out.reportedAt.toISOString(),
        },
      }
    },
  }

  const issue: RouteDef = {
    method: 'POST',
    path: '/staff/jobs/:jobId/issue-reports',
    operationId: 'reportIssue',
    summary: 'Report an issue',
    description:
      'Staff with job.report_issue (the Owner and workers assigned to the job). One of the issue categories of ' +
      'HH-WORK-08 with its severity, description, the affected work package and the next owner. A critical issue or ' +
      'an unsafe condition takes the Stop Work path (critical hold, pause, queue item in the same transaction). An ' +
      "on-site resolution (what happened, the steps, the materials, how the result was checked, and the worker's " +
      'statement that the fix is within their training, qualifications, the approved scope and the approved SOP) is ' +
      'refused with CONFLICT for a critical issue, an unsafe condition or an incident (RESOLVE_ON_SITE_NOT_OFFERED) and ' +
      'while a critical safety hold of the job is unresolved (SAFETY_HOLD_OPEN). Every non-critical report notifies ' +
      'the Owner (field_issue queue item). An incident is restricted to the Owner and the reporter; its case record ' +
      `is TSK-0093, and a customer change becomes a change-order draft with TSK-0082. ${STOP_TEXT}`,
    actors: ['staff'],
    permission: 'job.report_issue',
    kind: 'write',
    idempotency: 'required',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'issue_report.report',
    pagination: false,
    test: TEST,
    resource: jobFacts,
    schema: { params: JOB_PARAMS, body: ISSUE_BODY, response: { 201: ISSUE_RESULT } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const actor = staff(ctx)
      const { jobId } = ctx.req.params as { jobId: string }
      const b = ctx.req.body as IssueInput
      const out = await reportIssue(tx, actor, jobId, b)
      const severity = out.holdId ? 'critical' : (b.severity ?? 'major')
      await ctx.audit({
        target: { type: 'issue_report', id: out.reportId },
        summary: {
          projectId: out.projectId,
          jobId,
          holdId: out.holdId,
          kind: 'issue',
          severity,
          resolvedOnSite: b.resolution !== undefined,
          jobPaused: out.jobPaused,
        },
      })
      return {
        status: 201,
        body: {
          reportId: out.reportId,
          kind: 'issue',
          severity,
          holdId: out.holdId,
          jobState: out.jobState,
          jobPaused: out.jobPaused,
          resolvedOnSite: b.resolution !== undefined,
          reportedAt: out.reportedAt.toISOString(),
        },
      }
    },
  }

  const list: RouteDef = {
    method: 'GET',
    path: '/staff/jobs/:jobId/issue-reports',
    operationId: 'listIssueReports',
    summary: "A job's Stop Work, hazard and issue reports",
    description:
      'Staff with work.stop (the assigned workers of the job, Office, the Estimator, the Owner). Every report of the ' +
      "job, newest first, with its severity, whether it paused the job and where its hold stands. A restricted report's " +
      'details (an injury or an incident: what was reported, the text, the resolution, photos, stabilization, the ' +
      'reporter) are shown only to the Owner (audited) and the worker who reported it; everyone else sees that it ' +
      'exists and its status (OWN-DEC-143). The Owner also sees the work-paused customer notice drafts and may release ' +
      "or dismiss them. Lists the job's work packages for the forms and always carries Call 911, with the Owner's " +
      'escalation contact (the number the Owner entered, or NOT CONFIGURED) and the recorded Call Owner / Call 911 ' +
      "taps (every one for the Owner, the caller's own for everyone else). What the caller may " +
      'do next: report a hazard, report an issue, add a photo, record stabilization, review.',
    actors: ['staff'],
    permission: 'work.stop',
    kind: 'read',
    idempotency: 'none',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'none',
    pagination: false,
    test: TEST,
    resource: jobFacts,
    schema: { params: JOB_PARAMS, response: { 200: REPORTS_VIEW } },
    handler: async (ctx) => {
      const actor = staff(ctx)
      const { jobId } = ctx.req.params as { jobId: string }
      const body = await withTx(ctx.db, async (tx) =>
        reportsView(tx, actor, jobId, { assignments: await jobAssignments(tx, jobId) }),
      )
      if (!body) throw new ApiError('NOT_FOUND')
      // The Owner's reads of restricted incident details are audited (ROLE-MATRIX incident.view_restricted).
      const restricted = body.reports.filter((r) => r.restricted && (r.hazard !== null || r.category !== null))
      if (restricted.length && actor.roles.includes('owner'))
        await ctx.auditAlways({
          action: 'incident.view_restricted',
          target: { type: 'job', id: jobId },
          summary: { reports: restricted.map((r) => r.reportId) },
        })
      return { body, headers: { 'cache-control': 'no-store' } }
    },
  }

  const photo: RouteDef = {
    method: 'POST',
    path: '/staff/issue-reports/:reportId/photos',
    operationId: 'addIssueReportPhoto',
    summary: 'Add a photo to a report (only when safe)',
    description:
      "Staff with job.add_photo (the Owner and workers assigned to the report's job); on a restricted report only the " +
      'Owner and its reporter. Raw JPEG, PNG or WebP bytes, checked like request photos (content, type, size; NOT ' +
      'CONFIGURED limits or storage answer UNAVAILABLE), stored once under an opaque key in the private bucket with ' +
      "the report's visibility: never shared with the customer, never in a gallery or worker-wide feed. Photos are " +
      `taken only when it is safe to do so; a report never needs one. ${STOP_TEXT}`,
    actors: ['staff'],
    permission: 'job.add_photo',
    kind: 'write',
    idempotency: 'none',
    expectedVersion: 'none',
    rateLimit: { bucket: 'report-photo-upload', limit: 120, windowSeconds: 3600 },
    audit: 'issue_report.add_photo',
    pagination: false,
    test: TEST,
    resource: reportFacts,
    binaryBody: { contentTypes: PHOTO_TYPES, maxBytes: UPLOAD_TRANSPORT_LIMIT_BYTES },
    schema: { params: REPORT_PARAMS, querystring: PHOTO_QUERY, response: { 201: PHOTO_RESULT, 200: PHOTO_RESULT } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const actor = staff(ctx)
      const { reportId } = ctx.req.params as { reportId: string }
      const q = ctx.req.query as { deviceCapturedAt?: string }
      const bytes = Buffer.isBuffer(ctx.req.body) ? ctx.req.body : Buffer.alloc(0)
      let out: Awaited<ReturnType<typeof addReportPhoto>>
      try {
        out = await addReportPhoto(tx, actor, reportId, {
          bytes,
          declaredType: String(ctx.req.headers['content-type'] ?? ''),
          storage: deps.storage,
          ...(q.deviceCapturedAt ? { deviceCapturedAt: q.deviceCapturedAt } : {}),
        })
      } catch (err) {
        if (!(err instanceof ReportPhotoError)) throw err
        if (err.problem === 'not_configured') throw new ApiError('UNAVAILABLE')
        if (err.problem === 'too_large') throw new ApiError('PAYLOAD_TOO_LARGE')
        if (err.problem === 'type_not_allowed' || err.problem === 'unsupported_type')
          throw new ApiError('UNSUPPORTED_MEDIA_TYPE')
        throw new ApiError('VALIDATION_FAILED', { fieldErrors: [{ field: 'body', code: err.problem, message: '' }] })
      }
      await ctx.audit({
        target: { type: 'issue_report_photo', id: out.id },
        summary: { projectId: out.report.project_id, reportId, created: out.created },
      })
      return {
        status: out.created ? 201 : 200,
        body: { photoId: out.id, reportId, uploadedAt: out.uploadedAt.toISOString(), created: out.created },
      }
    },
  }

  const stabilization: RouteDef = {
    method: 'POST',
    path: '/staff/issue-reports/:reportId/stabilizations',
    operationId: 'recordStabilization',
    summary: 'Record emergency stabilization',
    description:
      "Staff with job.report_issue (the Owner and workers assigned to the report's job); on a restricted report only " +
      'the Owner and its reporter. Only on a Stop Work (a report with a critical hold; else CONFLICT NOT_A_STOP). ' +
      'Recorded separately from change orders: the trigger, the actions taken, why they were necessary, evidence, when ' +
      "the Owner and the customer were told, and the follow-up; it updates the hold's safety queue item for the Owner. " +
      'The app lists no make-safe steps: none is approved in an SOP yet (NOT CONFIGURED until competent review). Gas ' +
      'and potentially live wiring are never handled; this never releases or weakens the hold.',
    actors: ['staff'],
    permission: 'job.report_issue',
    kind: 'write',
    idempotency: 'required',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'issue_report.stabilization',
    pagination: false,
    test: TEST,
    resource: reportFacts,
    schema: { params: REPORT_PARAMS, body: STABILIZATION_BODY, response: { 201: STABILIZATION_RESULT } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const actor = staff(ctx)
      const { reportId } = ctx.req.params as { reportId: string }
      const out = await recordStabilization(tx, actor, reportId, ctx.req.body as StabilizationInput)
      await ctx.audit({
        target: { type: 'stabilization_record', id: out.id },
        summary: { projectId: out.report.project_id, reportId, holdId: out.report.hold_id },
      })
      return {
        status: 201,
        body: { stabilizationId: out.id, reportId, recordedAt: out.recordedAt.toISOString() },
      }
    },
  }

  const review: RouteDef = {
    method: 'POST',
    path: '/staff/issue-reports/:reportId/review',
    operationId: 'reviewIssueReport',
    summary: "The Owner's review of an issue report",
    description:
      'Staff with issue_report.review (the Owner; PROPOSED cell in the case-closure row). Records once that the Owner ' +
      'reviewed a non-critical issue report (with an optional note) and resolves its field_issue queue item with the ' +
      "job's last one. A critical report is reviewed through its hold's documented release path, never here " +
      '(CONFLICT REVIEWED_THROUGH_HOLD); a second review is CONFLICT ALREADY_REVIEWED.',
    actors: ['staff'],
    permission: 'issue_report.review',
    kind: 'write',
    idempotency: 'required',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'issue_report.review',
    pagination: false,
    test: TEST,
    resource: reportFacts,
    schema: { params: REPORT_PARAMS, body: REVIEW_BODY, response: { 201: REVIEW_RESULT } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const actor = staff(ctx)
      const { reportId } = ctx.req.params as { reportId: string }
      const out = await reviewIssueReport(tx, actor, reportId, (ctx.req.body as { note?: string }).note)
      await ctx.audit({ target: { type: 'issue_report', id: reportId }, summary: { projectId: out.report.project_id } })
      return { status: 201, body: { reportId, reviewedAt: out.reviewedAt.toISOString() } }
    },
  }

  const notice = (action: 'release' | 'dismiss'): RouteDef => ({
    method: 'POST',
    path: `/staff/issue-reports/:reportId/notices/:deliveryId/${action}`,
    operationId: action === 'release' ? 'releaseWorkPausedNotice' : 'dismissWorkPausedNotice',
    summary:
      action === 'release' ? 'Release the work-paused customer notice' : 'Dismiss the work-paused customer notice',
    description:
      action === 'release'
        ? 'The Owner only (message.release_draft, and the notice is Owner-released: OWN-DEC-152 section 3.2). Sends ' +
          'the owner-worded work_paused notice of this report to the customer through the send job, which checks the ' +
          "report's hold again at send time (released or cancelled by then: not sent). A notice that is not a draft is " +
          'CONFLICT NOTICE_NOT_DRAFT. It carries no technical or incident detail.'
        : 'The Owner only. Dismisses the work-paused notice draft of this report: kept as cancelled (dismissed), never ' +
          'sent. The customer portal still shows "Work is paused for safety review." while the hold blocks.',
    actors: ['staff'],
    permission: 'message.release_draft',
    kind: 'write',
    idempotency: 'required',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: action === 'release' ? 'message.release_work_paused' : 'message.dismiss_work_paused',
    pagination: false,
    test: TEST,
    resource: reportFacts,
    schema: { params: DELIVERY_PARAMS, body: EMPTY_BODY, response: { 200: NOTICE_RESULT } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const actor = staff(ctx)
      const { reportId, deliveryId } = ctx.req.params as { reportId: string; deliveryId: string }
      if (!actor.roles.includes('owner')) throw new ApiError('FORBIDDEN')
      if (action === 'dismiss') {
        const row = await dismissNotice(tx, actor, reportId, deliveryId)
        await ctx.audit({
          target: { type: 'message_delivery', id: row.id },
          summary: { reportId, channel: row.channel },
        })
        return { body: { reportId, deliveryId, state: 'cancelled' } }
      }
      const row = await lockNotice(tx, reportId, deliveryId)
      try {
        const { runAt } = await releaseDraft(tx, {
          config: await loadConfig(tx),
          deliveryId: row.id,
          actor: { kind: 'staff', id: actor.userId, roles: actor.roles },
          automation: release,
          requestId: requestIdOf(ctx),
        })
        await ctx.audit({
          target: { type: 'message_delivery', id: row.id },
          summary: { reportId, channel: row.channel, sendAt: runAt.toISOString() },
        })
      } catch (err) {
        if (err instanceof DraftError) throw new ApiError('FORBIDDEN')
        throw err
      }
      return { body: { reportId, deliveryId, state: 'queued' } }
    },
  })

  const safetyHold: RouteDef = {
    method: 'GET',
    path: '/staff/safety-holds/:holdId',
    operationId: 'getSafetyHold',
    summary: 'The job of a critical safety hold',
    description:
      'Staff with work.stop. Where the safety queue item of a critical hold leads: the hold and its job (the review ' +
      'page lists the hold, its report and the release actions of the start module).',
    actors: ['staff'],
    permission: 'work.stop',
    kind: 'read',
    idempotency: 'none',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'none',
    pagination: false,
    test: TEST,
    resource: holdFacts,
    schema: { params: HOLD_PARAMS, response: { 200: SAFETY_HOLD_RESULT } },
    handler: async (ctx) => {
      const { holdId } = ctx.req.params as { holdId: string }
      const h = await ctx.db
        .selectFrom('work.holds as h')
        .innerJoin('crm.projects as p', 'p.id', 'h.project_id')
        .select(['h.id', 'h.scope_id', 'p.reference'])
        .where('h.id', '=', holdId)
        .where('h.kind', '=', 'critical_safety')
        .executeTakeFirst()
      if (!h) throw new ApiError('NOT_FOUND')
      return { body: { holdId: h.id, jobId: h.scope_id, projectReference: h.reference } }
    },
  }

  return {
    name: 'hazards',
    routes: [hazard, issue, list, photo, stabilization, review, notice('release'), notice('dismiss'), safetyHold],
  }
}
