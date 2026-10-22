// Cases module (TSK-0093; HH-QA-06, HH-INC-01, HH-INC-02, HH-INC-04, T24, T48, T54, T56, T67, ENT-Case, ENT-Hold,
// ENT-Message, ENT-Photo, OWN-DEC-124, OWN-DEC-143, RULE-HUMAN-REVIEW, RULE-SAFETY-GATES, RULE-SERVER-AUTHZ).
//   GET  /staff/cases                                    the case list (case.view: the Owner, Office)
//   GET  /staff/projects/:projectId/cases                a project's cases (case.view)
//   POST /staff/projects/:projectId/complaints           record a complaint (case.record_complaint)
//   POST /staff/projects/:projectId/incidents            report an incident, damage, injury or dispute (incident.report)
//   POST /staff/jobs/:jobId/incidents                    the same from the job screen (incident.report: workers A)
//   GET  /staff/jobs/:jobId/incident-reports             the caller's own reports on the job (incident.report)
//   GET  /staff/cases/:caseId                            the case: its status, and its handling for those who work it
//   GET  /staff/cases/:caseId/restricted                 the restricted section (incident.view_restricted: the Owner,
//                                                        audited, and the staff member who reported it)
//   POST /staff/cases/:caseId/notes | attachments        complaint notes ("add to existing case") and photos
//   POST /staff/cases/:caseId/restricted/notes | attachments          restricted notes and photos
//   GET  /staff/cases/:caseId[/restricted]/attachments/:attachmentId   one photo's bytes, in its own class only
//   PUT  /staff/cases/:caseId/handling | hold-link       severity, assignee, due date; the current hold (the Owner)
//   POST /staff/cases/:caseId/actions/<event>            one lifecycle event (complaint or incident lifecycle)
//   POST /staff/cases/:caseId/recheck                    the re-check a resolution required (the Owner)
//   POST /staff/cases/:caseId/follow-ups; /staff/case-follow-ups/:id/actions/{complete,cancel}
//   POST /staff/cases/:caseId/referrals                  the Owner's record of a professional referral
//   POST /staff/cases/:caseId/customer-updates; /staff/case-customer-updates/:id/actions/{release,withdraw}
//   GET  /customer/projects/:reference/cases             the released customer updates (project.cases view)
// - Nothing here decides fault, liability, coverage or compensation, and no field can record one: the Owner decides,
//   and handles every insurer, attorney or other professional referral (RULE-HUMAN-REVIEW). A referral is shown only as
//   the Owner recorded it; nothing says anyone was contacted otherwise.
// - A safety issue goes through Stop Work and Report Hazard (TSK-0077), which write the critical hold in the same
//   transaction under the job lock (RULE-SAFETY-GATES). A case only links a hold (and a hazard report, once TSK-0077
//   exists); recording, resolving or closing a case never raises, releases or clears a hold, and an ordinary complaint
//   never stops unrelated work.
// - Every write is audited with identifiers and codes only; no report text, note or detail enters the audit summary.
import type { Tx } from '@handyhub/db'
import type { CaseEvent, CustomerUpdateKind, IncidentType } from '@handyhub/domain'
import type { StaffActor } from '@handyhub/policy'
import { ApiError } from '../../api/errors.js'
import type { ApiContext, ApiModule, RouteDef } from '../../api/route.js'
import { currentContext } from '../../platform/request-context.js'
import type { ObjectStorage } from '../../providers/index.js'
import { projectIdOf } from '../access/projects.js'
import { jobAssignments } from '../packets/assignments.js'
import { PHOTO_TYPES } from '../photos/content.js'
import { UPLOAD_TRANSPORT_LIMIT_BYTES } from '../photos/index.js'
import { findProject, PROJECT_CASES } from '../records/index.js'
import {
  ASSIGNEES,
  ATTACHMENT_PARAMS,
  ATTACHMENT_RESULT,
  CASE_LIST,
  CASE_PARAMS,
  CASE_VIEW,
  COMPLAINT_BODY,
  CREATED,
  CUSTOMER_PARAMS,
  EVENT_BODIES,
  EVENT_RESULT,
  FILE,
  FOLLOW_UP_BODY,
  FOLLOW_UP_PARAMS,
  FOLLOW_UP_RESULT,
  HANDLING_BODY,
  HOLD_LINK_BODY,
  INCIDENT_BODY,
  JOB_PARAMS,
  JOB_REPORTS,
  LIST_QUERY,
  NO_QUERY,
  NOTE_BODY,
  NOTE_RESULT,
  PROJECT_PARAMS,
  RECHECK_BODY,
  REFERRAL_BODY,
  REFERRAL_RESULT,
  RESTRICTED_NOTE_BODY,
  RESTRICTED_VIEW,
  SETTLE_BODY,
  UPDATE_BODY,
  UPDATE_PARAMS,
  UPDATE_RESULT,
  VERSION_RESULT,
} from './schemas.js'
import {
  addAttachment,
  addFollowUp,
  addNote,
  applyEvent,
  assignees,
  CaseAttachmentError,
  caseView,
  customerCaseUpdates,
  draftCustomerUpdate,
  EVENT_ACTION,
  followUpCase,
  linkHold,
  listCases,
  ownJobReports,
  readAttachment,
  readCase,
  recordComplaint,
  recordRecheck,
  recordReferral,
  reportIncident,
  restrictedView,
  setHandling,
  settleCustomerUpdate,
  settleFollowUp,
  updateCase,
  type ComplaintInput,
  type EventInput,
  type IncidentInput,
} from './store.js'

export {
  activeCaseCounts,
  activeOwners,
  CASE_OPENED_EVENT,
  customerCaseUpdates,
  projectHasActiveCase,
} from './store.js'
export { caseOpenedNoticeAutomation } from './notice.js'

const TEST = 'test/integration/cases.test.ts'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function staff(ctx: ApiContext): StaffActor {
  if (ctx.actor.kind !== 'staff') throw new ApiError('FORBIDDEN')
  return ctx.actor
}
const requestIdOf = (ctx: ApiContext) => currentContext()?.requestId ?? ctx.req.id

const projectFacts: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const { projectId } = req.params as { projectId: string }
  if (!UUID_RE.test(projectId)) return null
  const p = await db.selectFrom('crm.projects').select('id').where('id', '=', projectId).executeTakeFirst()
  return p ? { projectId: p.id } : null
}
const jobFacts: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const { jobId } = req.params as { jobId: string }
  if (!UUID_RE.test(jobId)) return null
  const j = await db.selectFrom('work.jobs').select('project_id').where('id', '=', jobId).executeTakeFirst()
  return j ? { projectId: j.project_id, assignments: await jobAssignments(db, jobId) } : null
}
/** A case's facts: its project, the staff member who reported it (own record) and its job's assignments. */
const caseFacts: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const { caseId } = req.params as { caseId: string }
  if (!UUID_RE.test(caseId)) return null
  const c = await db
    .selectFrom('quality.cases')
    .select(['project_id', 'job_id', 'reported_by'])
    .where('id', '=', caseId)
    .executeTakeFirst()
  if (!c) return null
  return {
    projectId: c.project_id,
    ownerStaffId: c.reported_by,
    assignments: c.job_id ? await jobAssignments(db, c.job_id) : [],
  }
}
const followUpFacts: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const { followUpId } = req.params as { followUpId: string }
  if (!UUID_RE.test(followUpId)) return null
  const f = await followUpCase(db, followUpId)
  return f ? { projectId: f.project_id } : null
}
const updateFacts: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const { updateId } = req.params as { updateId: string }
  if (!UUID_RE.test(updateId)) return null
  const u = await updateCase(db, updateId)
  return u ? { projectId: u.project_id } : null
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

function attachmentError(err: unknown): never {
  if (!(err instanceof CaseAttachmentError)) throw err
  if (err.problem === 'not_configured') throw new ApiError('UNAVAILABLE')
  if (err.problem === 'too_large') throw new ApiError('PAYLOAD_TOO_LARGE')
  if (err.problem === 'type_not_allowed' || err.problem === 'unsupported_type')
    throw new ApiError('UNSUPPORTED_MEDIA_TYPE')
  throw new ApiError('VALIDATION_FAILED', { fieldErrors: [{ field: 'body', code: err.problem, message: '' }] })
}

export function casesModule(deps: { storage: ObjectStorage | null }): ApiModule {
  const list: RouteDef = {
    ...read,
    path: '/staff/cases',
    operationId: 'listCases',
    summary: 'The case list',
    description:
      'Staff with case.view (the Owner, Office). Cases newest first (at most 200), open by default (state: open, ' +
      'closed or all). A restricted case (incident, damage, injury, dispute) is listed to Office only as that it ' +
      'exists, its number, project and status: kind, category, severity, due date and assignee are null ' +
      '(OWN-DEC-143). Never a report, note, photo, reporter or referral.',
    permission: 'case.view',
    schema: { querystring: LIST_QUERY, response: { 200: CASE_LIST } },
    handler: async (ctx) => {
      const q = ctx.req.query as { state?: 'open' | 'closed' | 'all' }
      return { body: { cases: await listCases(ctx.db, staff(ctx), { state: q.state ?? 'open' }) } }
    },
  }

  const people: RouteDef = {
    ...read,
    path: '/staff/cases/assignees',
    operationId: 'listCaseAssignees',
    summary: 'Who a case or follow-up item may be assigned to',
    description: 'Staff with case.manage (the Owner, Office). The active staff members, by id and display name only.',
    permission: 'case.manage',
    schema: { querystring: NO_QUERY, response: { 200: ASSIGNEES } },
    handler: async (ctx) => ({ body: { staff: await assignees(ctx.db) } }),
  }

  const projectList: RouteDef = {
    ...read,
    path: '/staff/projects/:projectId/cases',
    operationId: 'listProjectCases',
    summary: "A project's cases",
    description:
      'Staff with case.view. Every case of the project, newest first, with the same projection as the case list: ' +
      'Office sees a restricted case only as that it exists and its status. The record screen offers "add to ' +
      'existing case" from the open complaints listed here.',
    permission: 'case.view',
    resource: projectFacts,
    schema: { params: PROJECT_PARAMS, querystring: NO_QUERY, response: { 200: CASE_LIST } },
    handler: async (ctx) => {
      const { projectId } = ctx.req.params as { projectId: string }
      return { body: { cases: await listCases(ctx.db, staff(ctx), { state: 'all', projectId }) } }
    },
  }

  const complaint: RouteDef = {
    ...write,
    path: '/staff/projects/:projectId/complaints',
    operationId: 'recordComplaint',
    summary: 'Record a complaint case',
    description:
      'Staff with case.record_complaint (the Owner, Office). A complaint from a walkthrough, a message or a call ' +
      'becomes a case linked to the project (and its job when given): category, severity, assigned person, due date ' +
      'and the description as staff wrote it (internal). An open complaint of the same category on the project ' +
      'refuses a second one (CONFLICT, body.category DUPLICATE_OPEN_CASE, with the open case in `current`), so staff ' +
      'add to the existing case instead. A damage claim, injury or dispute is reported as its own restricted case. ' +
      'Opens the case in the action queue; never stops any work and never contacts the customer.',
    permission: 'case.record_complaint',
    audit: 'case.record_complaint',
    resource: projectFacts,
    schema: { params: PROJECT_PARAMS, body: COMPLAINT_BODY, response: { 201: CREATED } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const { projectId } = ctx.req.params as { projectId: string }
      const b = ctx.req.body as ComplaintInput
      const row = await recordComplaint(tx, staff(ctx), projectId, b)
      await ctx.audit({
        target: { type: 'case', id: row.id, version: row.version },
        summary: { projectId, number: row.number, kind: 'complaint', category: b.category, severity: b.severity },
      })
      return {
        status: 201,
        body: { caseId: row.id, number: row.number, kind: 'complaint', state: row.state, version: row.version },
        version: row.version,
      }
    },
  }

  const incidentDescription =
    'An incident, property damage, injury or dispute is recorded factually and minimally: what happened, the people ' +
    'affected, work areas, immediate actions and only the medical detail that is necessary, all in the restricted ' +
    'section (readable by the Owner and the person who reported it only, OWN-DEC-143). The type sets the kind: ' +
    'injury, damage (property_damage), dispute, or incident for the others. Damage, injury and disputes notify the ' +
    'Owner at once: an Owner Decisions item and a staff notification (case.opened). The responsible reviewer is the ' +
    'Owner. A safety hazard needs Stop Work / Report Hazard, not this report: nothing here raises or clears a hold.'

  const reportCommon = {
    ...write,
    permission: 'incident.report',
    audit: 'incident.report',
    schema: { body: INCIDENT_BODY, response: { 201: CREATED } },
  } as const
  async function report(ctx: ApiContext, target: { projectId: string; jobId: string | null }) {
    const tx = ctx.tx as Tx
    const b = ctx.req.body as IncidentInput & { type: IncidentType }
    const row = await reportIncident(tx, staff(ctx), target, b, requestIdOf(ctx))
    await ctx.audit({
      target: { type: 'case', id: row.id, version: row.version },
      summary: { projectId: target.projectId, jobId: target.jobId, number: row.number, kind: row.kind },
    })
    return {
      status: 201,
      body: { caseId: row.id, number: row.number, kind: row.kind, state: row.state, version: row.version },
      version: row.version,
    }
  }
  const projectIncident: RouteDef = {
    ...reportCommon,
    path: '/staff/projects/:projectId/incidents',
    operationId: 'reportProjectIncident',
    summary: 'Report an incident, damage, injury or dispute on a project',
    description: `Staff with incident.report (the Owner, Office, Estimator; workers report from the job). ${incidentDescription}`,
    resource: projectFacts,
    schema: { ...reportCommon.schema, params: PROJECT_PARAMS },
    handler: async (ctx) =>
      report(ctx, { projectId: (ctx.req.params as { projectId: string }).projectId, jobId: null }),
  }
  const jobIncident: RouteDef = {
    ...reportCommon,
    path: '/staff/jobs/:jobId/incidents',
    operationId: 'reportJobIncident',
    summary: 'Report an incident from the job screen',
    description:
      'Staff with incident.report: a worker assigned to the job (inside the access window), the Owner, Office or ' +
      `an Estimator. Quick, from the job screen; linked to the job and its project. ${incidentDescription}`,
    resource: jobFacts,
    schema: { ...reportCommon.schema, params: JOB_PARAMS },
    handler: async (ctx) => {
      const { jobId } = ctx.req.params as { jobId: string }
      const j = await (ctx.tx as Tx)
        .selectFrom('work.jobs')
        .select('project_id')
        .where('id', '=', jobId)
        .executeTakeFirstOrThrow()
      return report(ctx, { projectId: j.project_id, jobId })
    },
  }

  const jobReports: RouteDef = {
    ...read,
    path: '/staff/jobs/:jobId/incident-reports',
    operationId: 'listOwnJobIncidentReports',
    summary: "The caller's own incident reports on a job",
    description:
      'Staff with incident.report on the job (an assigned worker, the Owner, Office, an Estimator). Only the reports ' +
      'the caller made: number, kind, type, state and when; never anyone else’s report.',
    permission: 'incident.report',
    resource: jobFacts,
    schema: { params: JOB_PARAMS, querystring: NO_QUERY, response: { 200: JOB_REPORTS } },
    handler: async (ctx) => {
      const { jobId } = ctx.req.params as { jobId: string }
      return { body: { reports: await ownJobReports(ctx.db, staff(ctx), jobId) } }
    },
  }

  const view: RouteDef = {
    ...read,
    path: '/staff/cases/:caseId',
    operationId: 'getCase',
    summary: 'A case',
    description:
      'Staff with case.view. That the case exists and its status; for a complaint (Office and the Owner) and for the ' +
      'Owner on every case, also its handling: category or reported type, severity, source, assignee, due date, the ' +
      'responsible reviewer, the human-review areas it raises, the linked hold, resolution, re-check, follow-up ' +
      'items, customer updates and their review state, complaint notes and photos, the history, and the actions the ' +
      'caller may take. Professional referrals only for the Owner (null otherwise). Office reads a restricted case ' +
      'as its status only (detail null, OWN-DEC-143). Never a fault, liability, coverage or compensation field.',
    permission: 'case.view',
    resource: caseFacts,
    schema: { params: CASE_PARAMS, querystring: NO_QUERY, response: { 200: CASE_VIEW } },
    handler: async (ctx) => {
      const v = await caseView(ctx.db, staff(ctx), (ctx.req.params as { caseId: string }).caseId)
      if (!v) throw new ApiError('NOT_FOUND')
      return { body: v, headers: { 'cache-control': 'no-store' } }
    },
  }

  const restrictedRead: RouteDef = {
    ...read,
    path: '/staff/cases/:caseId/restricted',
    operationId: 'getCaseRestrictedSection',
    summary: 'The restricted incident section of a case',
    description:
      'Staff with incident.view_restricted: the Owner (each read audited) and the staff member who reported the case ' +
      '(OWN-DEC-143); everyone else, Office and other workers included, is refused. The factual report, restricted ' +
      'notes and photos of an incident, damage, injury or dispute case. A complaint has no restricted section ' +
      '(NOT_FOUND).',
    permission: 'incident.view_restricted',
    resource: caseFacts,
    schema: { params: CASE_PARAMS, querystring: NO_QUERY, response: { 200: RESTRICTED_VIEW } },
    handler: async (ctx) => {
      const { caseId } = ctx.req.params as { caseId: string }
      const v = await restrictedView(ctx.db, caseId)
      if (!v) throw new ApiError('NOT_FOUND')
      if (ctx.decision?.audit)
        await ctx.auditAlways({ action: 'incident.view_restricted', target: { type: 'case', id: caseId } })
      return { body: v, headers: { 'cache-control': 'no-store' } }
    },
  }

  const note = (section: 'case' | 'restricted'): RouteDef => ({
    ...write,
    path: section === 'case' ? '/staff/cases/:caseId/notes' : '/staff/cases/:caseId/restricted/notes',
    operationId: section === 'case' ? 'addCaseNote' : 'addRestrictedCaseNote',
    summary: section === 'case' ? 'Add to a complaint case' : 'Add a restricted note',
    description:
      section === 'case'
        ? 'Staff with case.manage (the Owner, Office), on a complaint: an internal note, or with `source` ' +
          '(walkthrough, message, call) an addition: the same issue raised again, added to this existing case ' +
          'instead of a duplicate. A restricted case takes restricted notes only (CONFLICT RESTRICTED_CASE).'
        : 'Staff with incident.view_restricted (the Owner, and the staff member who reported the case): a note in the ' +
          'restricted section, kept with the report (append-only).',
    permission: section === 'case' ? 'case.manage' : 'incident.view_restricted',
    audit: section === 'case' ? 'case.add_note' : 'incident.add_note',
    resource: caseFacts,
    schema: {
      params: CASE_PARAMS,
      body: section === 'case' ? NOTE_BODY : RESTRICTED_NOTE_BODY,
      response: { 201: NOTE_RESULT },
    },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const { caseId } = ctx.req.params as { caseId: string }
      const b = ctx.req.body as { body: string; source?: string }
      const out = await addNote(tx, staff(ctx), caseId, b, section)
      await ctx.audit({
        target: { type: 'case', id: caseId },
        summary: { projectId: out.case.project_id, noteId: out.id, addition: Boolean(b.source) },
      })
      return { status: 201, body: { noteId: out.id, writtenAt: out.writtenAt.toISOString() } }
    },
  })

  const upload = (section: 'case' | 'restricted'): RouteDef => ({
    ...write,
    idempotency: 'none',
    rateLimit: { bucket: 'case-attachment-upload', limit: 120, windowSeconds: 3600 },
    path: section === 'case' ? '/staff/cases/:caseId/attachments' : '/staff/cases/:caseId/restricted/attachments',
    operationId: section === 'case' ? 'uploadCaseAttachment' : 'uploadRestrictedCaseAttachment',
    summary: section === 'case' ? 'Add a supporting photo to a complaint' : 'Add a photo to the restricted section',
    description:
      (section === 'case'
        ? 'Staff with case.manage, on a complaint (internal_operational). '
        : 'Staff with incident.view_restricted (the Owner, the reporter), on a restricted case (restricted_incident). ') +
      'Raw JPEG, PNG or WebP bytes, checked like request photos (the real content, the declared type and the size ' +
      'against uploads.limits; NOT CONFIGURED limits or storage answer UNAVAILABLE), stored once under an opaque key ' +
      'in the private bucket. The same bytes again answer the same photo (200). A case photo never joins the ' +
      'project gallery, the customer view or any worker-wide feed.',
    permission: section === 'case' ? 'case.manage' : 'incident.view_restricted',
    audit: section === 'case' ? 'case.add_attachment' : 'incident.add_attachment',
    resource: caseFacts,
    binaryBody: { contentTypes: PHOTO_TYPES, maxBytes: UPLOAD_TRANSPORT_LIMIT_BYTES },
    schema: { params: CASE_PARAMS, response: { 201: ATTACHMENT_RESULT, 200: ATTACHMENT_RESULT } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const { caseId } = ctx.req.params as { caseId: string }
      const bytes = Buffer.isBuffer(ctx.req.body) ? ctx.req.body : Buffer.alloc(0)
      let out: Awaited<ReturnType<typeof addAttachment>>
      try {
        out = await addAttachment(
          tx,
          staff(ctx),
          caseId,
          { bytes, declaredType: String(ctx.req.headers['content-type'] ?? ''), storage: deps.storage },
          section,
        )
      } catch (err) {
        attachmentError(err)
      }
      await ctx.audit({
        target: { type: 'case', id: caseId },
        summary: { projectId: out.case.project_id, attachmentId: out.id, created: out.created },
      })
      return {
        status: out.created ? 201 : 200,
        body: { attachmentId: out.id, uploadedAt: out.uploadedAt.toISOString(), created: out.created },
      }
    },
  })

  const file = (section: 'case' | 'restricted'): RouteDef => ({
    ...read,
    path:
      section === 'case'
        ? '/staff/cases/:caseId/attachments/:attachmentId'
        : '/staff/cases/:caseId/restricted/attachments/:attachmentId',
    operationId: section === 'case' ? 'getCaseAttachment' : 'getRestrictedCaseAttachment',
    summary: section === 'case' ? 'A complaint photo' : 'A restricted case photo',
    description:
      (section === 'case'
        ? 'Staff with case.view: a photo of a complaint (internal_operational). '
        : 'Staff with incident.view_restricted (the Owner, audited; the reporter): a restricted photo. ') +
      'The bytes, checked against the SHA-256 recorded at upload; a photo of the other class is NOT_FOUND here.',
    permission: section === 'case' ? 'case.view' : 'incident.view_restricted',
    resource: caseFacts,
    binaryResponse: { contentTypes: PHOTO_TYPES },
    schema: { params: ATTACHMENT_PARAMS, querystring: NO_QUERY, response: { 200: FILE } },
    handler: async (ctx) => {
      const { caseId, attachmentId } = ctx.req.params as { caseId: string; attachmentId: string }
      const c = await readCase(ctx.db, caseId)
      if (!c) throw new ApiError('NOT_FOUND')
      let a: Awaited<ReturnType<typeof readAttachment>>
      try {
        a = await readAttachment(ctx.db, caseId, attachmentId, section, deps.storage)
      } catch (err) {
        attachmentError(err)
      }
      if (!a) throw new ApiError('NOT_FOUND')
      if (section === 'restricted' && ctx.decision?.audit)
        await ctx.auditAlways({
          action: 'incident.view_restricted',
          target: { type: 'case', id: caseId },
          summary: { attachmentId },
        })
      return {
        body: Buffer.from(a.bytes),
        headers: { 'content-type': a.contentType, 'cache-control': 'no-store', 'content-disposition': 'inline' },
      }
    },
  })

  const handling: RouteDef = {
    ...write,
    method: 'PUT',
    path: '/staff/cases/:caseId/handling',
    operationId: 'setCaseHandling',
    summary: 'Set the severity, assignee and due date of a case',
    description:
      'Staff with case.manage, with If-Match: on a complaint the Owner or Office; on a restricted case the Owner ' +
      'only (case.triage). A complaint always keeps an assignee and a due date. Not on a closed case.',
    permission: 'case.manage',
    audit: 'case.set_handling',
    expectedVersion: 'required',
    resource: caseFacts,
    schema: { params: CASE_PARAMS, body: HANDLING_BODY, response: { 200: VERSION_RESULT } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const { caseId } = ctx.req.params as { caseId: string }
      const b = ctx.req.body as { severity?: string; assignedTo?: string | null; dueOn?: string | null }
      const out = await setHandling(tx, staff(ctx), caseId, ctx.expectedVersion(), b)
      await ctx.audit({
        target: { type: 'case', id: caseId, version: out.version },
        summary: {
          projectId: out.case.project_id,
          fields: Object.keys(b).sort().join(','),
          ...(b.severity ? { severity: b.severity } : {}),
        },
      })
      return { body: { caseId, version: out.version }, version: out.version }
    },
  }

  const holdLink: RouteDef = {
    ...write,
    method: 'PUT',
    path: '/staff/cases/:caseId/hold-link',
    operationId: 'linkCaseHold',
    summary: 'Link the current hold of a case',
    description:
      'Staff with case.triage (the Owner), with If-Match: the hold (of the same project) that currently pauses the ' +
      'work this case is about, or null. Linking records the relation only: it never raises, releases or clears a ' +
      'hold (RULE-SAFETY-GATES; resuming is HH-INC-03). A safety-pause customer update needs a linked hold that is ' +
      'open or under review.',
    permission: 'case.triage',
    audit: 'case.link_hold',
    expectedVersion: 'required',
    resource: caseFacts,
    schema: { params: CASE_PARAMS, body: HOLD_LINK_BODY, response: { 200: VERSION_RESULT } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const { caseId } = ctx.req.params as { caseId: string }
      const { holdId } = ctx.req.body as { holdId: string | null }
      const out = await linkHold(tx, caseId, ctx.expectedVersion(), holdId)
      await ctx.audit({
        target: { type: 'case', id: caseId, version: out.version },
        summary: { projectId: out.case.project_id, holdId },
      })
      return { body: { caseId, version: out.version }, version: out.version }
    },
  }

  const EVENT_TEXT: Readonly<Record<CaseEvent, string>> = {
    acknowledge: 'A complaint: open to acknowledged.',
    investigate: 'A complaint: open or acknowledged to investigating.',
    await_action:
      'A complaint (the Owner, Office): investigating to action_pending; an incident (the Owner): triaged to ' +
      'action_pending.',
    resolve:
      'A complaint (the Owner): to resolved with the recorded resolution and whether a re-check is required. The ' +
      'resolution is what was done, never a decision on fault or compensation.',
    reopen: 'A resolved or closed complaint (the Owner) back to investigating, with the reason; history kept.',
    triage:
      'An incident, damage, injury or dispute (the Owner): reported to triaged with its severity; the Owner becomes ' +
      'the responsible reviewer and the Owner Decisions notification is resolved.',
    submit_resolution:
      'An incident (the Owner): to resolution_review with the recorded resolution and whether a re-check is ' +
      'required. A work hold is evaluated separately (HH-INC-03): this never releases it.',
    return_to_action: 'An incident (the Owner): resolution_review back to action_pending, with a note.',
    close:
      'The Owner (case.close): a resolved complaint or an incident in resolution review to closed. Needs the ' +
      'recorded resolution, the re-check when one is required, and no open follow-up item; history is kept.',
  }
  const events: RouteDef[] = (Object.keys(EVENT_ACTION) as CaseEvent[]).map((name) => ({
    ...write,
    path: `/staff/cases/:caseId/actions/${name.replace(/_/g, '-')}`,
    operationId: `caseEvent${name
      .split('_')
      .map((w) => `${w[0]?.toUpperCase()}${w.slice(1)}`)
      .join('')}`,
    summary: `Case event: ${name.replace(/_/g, ' ')}`,
    description:
      `Staff with ${EVENT_ACTION[name]}, with If-Match. ${EVENT_TEXT[name]} Every event of a restricted case is the ` +
      "Owner's (case.triage). An event the case's lifecycle does not allow from its state is CONFLICT; a missing " +
      'requirement names its code (RECHECK_REQUIRED, FOLLOW_UPS_OPEN, REASON_REQUIRED).',
    permission: EVENT_ACTION[name],
    audit: `case.${name}`,
    expectedVersion: 'required',
    resource: caseFacts,
    schema: { params: CASE_PARAMS, body: EVENT_BODIES[name], response: { 200: EVENT_RESULT } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const { caseId } = ctx.req.params as { caseId: string }
      const b = ctx.req.body as EventInput
      const out = await applyEvent(tx, staff(ctx), caseId, ctx.expectedVersion(), name, b)
      await ctx.audit({
        target: { type: 'case', id: caseId, version: out.version },
        summary: {
          projectId: out.case.project_id,
          from: out.from,
          to: out.to,
          ...(b.recheckRequired !== undefined ? { recheckRequired: b.recheckRequired } : {}),
        },
      })
      return { body: { caseId, from: out.from, state: out.to, version: out.version }, version: out.version }
    },
  }))

  const recheck: RouteDef = {
    ...write,
    path: '/staff/cases/:caseId/recheck',
    operationId: 'recordCaseRecheck',
    summary: 'Record the re-check of a case',
    description:
      'Staff with case.triage (the Owner), with If-Match: the re-check a resolution required, with what was checked. ' +
      'Only after the resolution and once. It records what the Owner states; it is never a certification that a site ' +
      'is safe (HH-INC-03).',
    permission: 'case.triage',
    audit: 'case.recheck',
    expectedVersion: 'required',
    resource: caseFacts,
    schema: { params: CASE_PARAMS, body: RECHECK_BODY, response: { 200: VERSION_RESULT } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const { caseId } = ctx.req.params as { caseId: string }
      const out = await recordRecheck(
        tx,
        staff(ctx),
        caseId,
        ctx.expectedVersion(),
        (ctx.req.body as { note: string }).note,
      )
      await ctx.audit({
        target: { type: 'case', id: caseId, version: out.version },
        summary: { projectId: out.case.project_id },
      })
      return { body: { caseId, version: out.version }, version: out.version }
    },
  }

  const followUp: RouteDef = {
    ...write,
    path: '/staff/cases/:caseId/follow-ups',
    operationId: 'addCaseFollowUp',
    summary: 'Add a follow-up item to a case',
    description:
      'Staff with case.manage (a restricted case: the Owner only). Corrective work as an assigned item with a due ' +
      'date (punch or return-visit work is linked by TSK-0094). Closing the case waits until every item is done or ' +
      'canceled. Not on a closed case.',
    permission: 'case.manage',
    audit: 'case.add_follow_up',
    resource: caseFacts,
    schema: { params: CASE_PARAMS, body: FOLLOW_UP_BODY, response: { 201: FOLLOW_UP_RESULT } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const { caseId } = ctx.req.params as { caseId: string }
      const out = await addFollowUp(tx, staff(ctx), caseId, ctx.req.body as Parameters<typeof addFollowUp>[3])
      await ctx.audit({
        target: { type: 'case_follow_up', id: out.id, version: out.version },
        summary: { projectId: out.case.project_id, caseId },
      })
      return { status: 201, body: { followUpId: out.id, state: 'open', version: out.version }, version: out.version }
    },
  }

  const settle = (outcome: 'done' | 'canceled'): RouteDef => ({
    ...write,
    path: `/staff/case-follow-ups/:followUpId/actions/${outcome === 'done' ? 'complete' : 'cancel'}`,
    operationId: outcome === 'done' ? 'completeCaseFollowUp' : 'cancelCaseFollowUp',
    summary: outcome === 'done' ? 'Complete a follow-up item' : 'Cancel a follow-up item',
    description:
      `Staff with case.manage (a restricted case: the Owner only), with If-Match and a note: an open item to ` +
      `${outcome}. Kept as history.`,
    permission: 'case.manage',
    audit: outcome === 'done' ? 'case.complete_follow_up' : 'case.cancel_follow_up',
    expectedVersion: 'required',
    resource: followUpFacts,
    schema: { params: FOLLOW_UP_PARAMS, body: SETTLE_BODY, response: { 200: FOLLOW_UP_RESULT } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const { followUpId } = ctx.req.params as { followUpId: string }
      const out = await settleFollowUp(
        tx,
        staff(ctx),
        followUpId,
        ctx.expectedVersion(),
        outcome,
        (ctx.req.body as { note: string }).note,
      )
      await ctx.audit({
        target: { type: 'case_follow_up', id: followUpId, version: out.version },
        summary: { projectId: out.case.project_id, caseId: out.case.id },
      })
      return { body: { followUpId, state: outcome, version: out.version }, version: out.version }
    },
  })

  const referral: RouteDef = {
    ...write,
    path: '/staff/cases/:caseId/referrals',
    operationId: 'recordCaseReferral',
    summary: "Record the Owner's professional referral",
    description:
      'Staff with case.refer_professional (the Owner). The Owner records a referral the Owner made: to an insurer, ' +
      'an attorney or another professional, the date and a note (human-review boundary: insurance, legal, injury). ' +
      'The software never contacts anyone and never says anyone was contacted except as recorded here; append-only, ' +
      'never shown to the customer.',
    permission: 'case.refer_professional',
    audit: 'case.refer_professional',
    resource: caseFacts,
    schema: { params: CASE_PARAMS, body: REFERRAL_BODY, response: { 201: REFERRAL_RESULT } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const { caseId } = ctx.req.params as { caseId: string }
      const b = ctx.req.body as { professional: string; note: string; referredOn: string }
      const out = await recordReferral(tx, staff(ctx), caseId, b)
      await ctx.audit({
        target: { type: 'case', id: caseId },
        summary: { projectId: out.case.project_id, referralId: out.id, professional: b.professional },
      })
      return { status: 201, body: { referralId: out.id, recordedAt: out.recordedAt.toISOString() } }
    },
  }

  const draft: RouteDef = {
    ...write,
    path: '/staff/cases/:caseId/customer-updates',
    operationId: 'draftCaseCustomerUpdate',
    summary: 'Draft a customer update of a case',
    description:
      'Staff with case.manage (a restricted case: the Owner only). One neutral template: acknowledgment, progress ' +
      '(with the staff detail), next_step (with the staff detail) or safety_pause ("Work is paused for safety ' +
      'review.", only while the linked hold is open or under review). A detail with fault, liability, coverage or ' +
      'compensation wording is refused (VALIDATION_FAILED body.detail FORBIDDEN_WORDING). The draft reaches the ' +
      'customer only when staff release it after review; nothing is sent automatically. Not on a closed case.',
    permission: 'case.manage',
    audit: 'case.draft_customer_update',
    resource: caseFacts,
    schema: { params: CASE_PARAMS, body: UPDATE_BODY, response: { 201: UPDATE_RESULT } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const { caseId } = ctx.req.params as { caseId: string }
      const b = ctx.req.body as { kind: CustomerUpdateKind; detail?: string }
      const out = await draftCustomerUpdate(tx, staff(ctx), caseId, b)
      await ctx.audit({
        target: { type: 'case_customer_update', id: out.id, version: out.version },
        summary: { projectId: out.case.project_id, caseId, kind: b.kind },
      })
      return {
        status: 201,
        body: { updateId: out.id, kind: b.kind, state: 'draft', version: out.version },
        version: out.version,
      }
    },
  }

  const settleUpdate = (outcome: 'released' | 'withdrawn'): RouteDef => ({
    ...write,
    path: `/staff/case-customer-updates/:updateId/actions/${outcome === 'released' ? 'release' : 'withdraw'}`,
    operationId: outcome === 'released' ? 'releaseCaseCustomerUpdate' : 'withdrawCaseCustomerUpdate',
    summary: outcome === 'released' ? 'Release a reviewed customer update' : 'Withdraw a customer update draft',
    description:
      outcome === 'released'
        ? 'Staff with case.manage (a restricted case: the Owner only), with If-Match: the reviewer releases the draft ' +
          'exactly as drafted; the customer then sees it in the project (GET /customer/projects/:reference/cases). ' +
          'The wording and, for a safety pause, the open hold are checked again; never on a closed case. A released ' +
          'update is never changed or withdrawn.'
        : 'Staff with case.manage (a restricted case: the Owner only), with If-Match: a draft is withdrawn and never ' +
          'shown to the customer. Kept as history.',
    permission: 'case.manage',
    audit: outcome === 'released' ? 'case.release_customer_update' : 'case.withdraw_customer_update',
    expectedVersion: 'required',
    resource: updateFacts,
    schema: {
      params: UPDATE_PARAMS,
      body: { type: 'object', additionalProperties: false, properties: {} },
      response: { 200: UPDATE_RESULT },
    },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const { updateId } = ctx.req.params as { updateId: string }
      const out = await settleCustomerUpdate(tx, staff(ctx), updateId, ctx.expectedVersion(), outcome)
      await ctx.audit({
        target: { type: 'case_customer_update', id: updateId, version: out.version },
        summary: { projectId: out.case.project_id, caseId: out.case.id, kind: out.kind },
      })
      return {
        body: { updateId, kind: out.kind as CustomerUpdateKind, state: outcome, version: out.version },
        version: out.version,
      }
    },
  })

  const customer: RouteDef = {
    ...read,
    actors: ['customer'],
    path: '/customer/projects/:reference/cases',
    operationId: 'getCustomerProjectCaseUpdates',
    summary: "The released updates about the project's cases",
    description:
      'For a project the caller’s session opens (request.view, customer V): the updates staff released after review ' +
      '(acknowledgment, progress, next step, or "Work is paused for safety review."), per case, oldest first; a case ' +
      'with no released update is not listed. Never the case kind, category, severity, report, notes, photos, ' +
      'reporter, reviewer, referral, hold or state, and no automatic denial or resolution. Any other project, an ' +
      'unknown or a malformed reference is the same NOT_FOUND (T19).',
    permission: 'request.view',
    resource: async ({ req, db }) => {
      const id = await projectIdOf(db, (req.params as { reference: string }).reference)
      return id ? { projectId: id } : null
    },
    projection: PROJECT_CASES,
    schema: { params: CUSTOMER_PARAMS, response: { 200: PROJECT_CASES.schema } },
    handler: async (ctx) => {
      const p = await findProject(ctx.db, ctx.scope, { reference: (ctx.req.params as { reference: string }).reference })
      if (!p) throw new ApiError('NOT_FOUND')
      return { body: PROJECT_CASES.project({ reference: p.reference, cases: await customerCaseUpdates(ctx.db, p.id) }) }
    },
  }

  return {
    name: 'cases',
    routes: [
      list,
      people,
      projectList,
      complaint,
      projectIncident,
      jobIncident,
      jobReports,
      view,
      restrictedRead,
      note('case'),
      note('restricted'),
      upload('case'),
      upload('restricted'),
      file('case'),
      file('restricted'),
      handling,
      holdLink,
      ...events,
      recheck,
      followUp,
      settle('done'),
      settle('canceled'),
      referral,
      draft,
      settleUpdate('released'),
      settleUpdate('withdrawn'),
      customer,
    ],
  }
}
