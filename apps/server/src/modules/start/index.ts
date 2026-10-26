// Start Work module (TSK-0073, TSK-0074; HH-WORK-01, HH-WORK-02, HH-WORK-03, HH-WORK-04, HH-WORK-12, HH-OFF-04,
// HH-OPS-01, T40, T45, T46, ENT-StartGateEvaluation, ENT-GateException, ENT-Hold, ENT-Photo, ENT-AuditEvent,
// OWN-DEC-38, OWN-DEC-68, OWN-DEC-82, OWN-DEC-121, OWN-DEC-137, OWN-DEC-195, OWN-DEC-196, OWN-DEC-208,
// RULE-SAFETY-GATES, RULE-SERVER-AUTHZ, RULE-HUMAN-REVIEW).
//   GET  /staff/visits/:visitId/start-gate                       the briefing's gate: every prerequisite, every missing
//                                                                item and its resolution owner (work.start)
//   POST /staff/visits/:visitId/site-checks                      the worker's site check (job.record_checklist_step)
//   POST /staff/visits/:visitId/before-photos                    one before photo for a work package (job.add_photo)
//   POST /staff/visits/:visitId/start-exceptions                 an exception request (work.request_exception)
//   POST /staff/visits/:visitId/start                            Start Work: every gate again, in one transaction
//   POST /staff/visits/:visitId/resume                           resume after an incident (work.resume, TSK-0094):
//                                                                the same gate again, for this worker, once per pause
//   GET  /staff/jobs/:jobId/start-review                         holds and exceptions of a job (job_hold.set)
//   POST /staff/jobs/:jobId/job-holds                            set the job-level Hold with a note (job_hold.set)
//   POST /staff/job-holds/:holdId/actions/set-ready              the Owner sets Ready with a note (job_hold.set_ready)
//   POST /staff/critical-holds/:holdId/actions/{start-review,resolve,cancel}   (hold.release_critical: the Owner,
//                                                                never a hold they raised; resolve and cancel with a
//                                                                fresh sign-in)
//   POST /staff/start-exceptions/:exceptionId/actions/{approve,decline}        (work.approve_exception: the Owner;
//                                                                approve with a fresh sign-in)
// - Start Work is the assigned worker's own action, online only (the policy's `online` condition; the server is the
//   check, so there is no offline start, HH-OFF-04). The start route takes the packet version the worker's screen
//   showed and nothing else: no override, force or skip field exists, and the read takes no query. A shortcut from My
//   Day, a list or a notification opens the briefing and gate screen, never this route directly (T46).
// - `work.override_gate` and `hold.override_critical` are denied to every role by the matrix (SAFETY_GATE_NOT_
//   OVERRIDABLE); no route here or anywhere names them.
// - The emergency call: the gate answer always carries Call 911 (tel:911), and the staff screen shows it first, before
//   anything else and never behind a confirmation or the gate (owner amendment; OWN-DEC-172, OWN-DEC-208).
// - Every write is audited; notes and evidence stay on their records, never in the audit summary.
import { withTx, type Tx } from '@handyhub/db'
import {
  BLOCKING_HOLD_STATES,
  EXCEPTABLE,
  GATE_EXCEPTION_KINDS,
  type GateExceptionKind,
  type JobHoldCategory,
} from '@handyhub/domain'
import { decide, type StaffActor } from '@handyhub/policy'
import { ApiError } from '../../api/errors.js'
import type { ApiContext, ApiModule, RouteDef } from '../../api/route.js'
import { jobInScope } from '../../platform/data-scope.js'
import { currentContext } from '../../platform/request-context.js'
import type { ObjectStorage } from '../../providers/index.js'
import { visitAssignments } from '../field/taps.js'
import { jobAssignments } from '../packets/assignments.js'
import { latestPacket } from '../packets/content.js'
import { PHOTO_TYPES } from '../photos/content.js'
import { UPLOAD_TRANSPORT_LIMIT_BYTES } from '../photos/index.js'
import {
  BeforePhotoError,
  decideException,
  followUpOf,
  gateRefusal,
  insertJobHold,
  moveCriticalHold,
  recordSiteCheck,
  requestException,
  resumeWork,
  setJobHoldReady,
  startWork,
  syncExceptionItem,
  syncJobHoldItem,
  uploadBeforePhoto,
  type CriticalAction,
  type DecisionInput,
  type SiteCheckInput,
} from './actions.js'
import { gatherGate, gateVisit, visitExceptions, type GateEnvironment, type GateFacts } from './gate.js'
import {
  APPROVE_BODY,
  CRITICAL_CANCEL_BODY,
  CRITICAL_RESOLVE_BODY,
  CRITICAL_REVIEW_BODY,
  DECLINE_BODY,
  EXCEPTION_BODY,
  EXCEPTION_PARAMS,
  EXCEPTION_RESULT,
  HOLD_PARAMS,
  HOLD_RESULT,
  JOB_HOLD_BODY,
  JOB_PARAMS,
  RESUME_RESULT,
  NO_QUERY,
  PHOTO_QUERY,
  PHOTO_RESULT,
  READY_BODY,
  SITE_CHECK_BODY,
  SITE_CHECK_RESULT,
  START_BODY,
  START_GATE,
  START_RESULT,
  START_REVIEW,
  VISIT_PARAMS,
} from './schemas.js'
import { FRESH_AUTH_MINUTES } from '../identity/sessions.js'

export { gatherGate, settleExceptions, visitExceptions } from './gate.js'
export { startWork } from './actions.js'

const TEST = 'test/integration/start-work.test.ts'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** The emergency call: always available at once (OWN-DEC-172, OWN-DEC-208); a phone link, so it needs no network. */
export const CALL_911 = 'tel:911'

function staff(ctx: ApiContext): StaffActor {
  if (ctx.actor.kind !== 'staff') throw new ApiError('FORBIDDEN')
  return ctx.actor
}
const requestIdOf = (ctx: ApiContext) => currentContext()?.requestId ?? ctx.req.id
const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null)
const allowed = (actor: StaffActor, action: Parameters<typeof decide>[1], resource: Parameters<typeof decide>[2]) =>
  decide(actor, action, resource, { now: new Date(), online: true }).effect === 'allow'

async function names(db: ApiContext['db'] | Tx, ids: (string | null)[]): Promise<Map<string, string | null>> {
  const list = [...new Set(ids.filter((x): x is string => typeof x === 'string'))]
  if (list.length === 0) return new Map()
  const rows = await db
    .selectFrom('identity.staff_users')
    .select(['id', 'display_name'])
    .where('id', 'in', list)
    .execute()
  return new Map(rows.map((r) => [r.id, r.display_name]))
}
const ref = (id: string, n: Map<string, string | null>) => ({ id, name: n.get(id) ?? null })

/** The visit's facts: its project and the workers assigned to it now (the policy's A cell). */
const visitFacts: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const { visitId } = req.params as { visitId: string }
  if (!UUID_RE.test(visitId)) return null
  const v = await db.selectFrom('work.visits').select('project_id').where('id', '=', visitId).executeTakeFirst()
  return v ? { projectId: v.project_id, assignments: await visitAssignments(db, visitId) } : null
}
const jobFacts: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const { jobId } = req.params as { jobId: string }
  if (!UUID_RE.test(jobId)) return null
  const j = await db.selectFrom('work.jobs').select('project_id').where('id', '=', jobId).executeTakeFirst()
  return j ? { projectId: j.project_id, assignments: await jobAssignments(db, jobId) } : null
}
const holdFacts =
  (kind: 'job_requirement' | 'critical_safety'): NonNullable<RouteDef['resource']> =>
  async ({ req, db }) => {
    const { holdId } = req.params as { holdId: string }
    if (!UUID_RE.test(holdId)) return null
    const h = await db
      .selectFrom('work.holds')
      .select(['project_id', 'raised_by'])
      .where('id', '=', holdId)
      .where('kind', '=', kind)
      .executeTakeFirst()
    return h ? { projectId: h.project_id, raisedByStaffId: h.raised_by } : null
  }
const exceptionFacts: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const { exceptionId } = req.params as { exceptionId: string }
  if (!UUID_RE.test(exceptionId)) return null
  const e = await db
    .selectFrom('work.gate_exceptions')
    .select('project_id')
    .where('id', '=', exceptionId)
    .executeTakeFirst()
  return e ? { projectId: e.project_id } : null
}

/** The gate as the caller's briefing shows it. */
async function gateView(tx: Tx, actor: StaffActor, facts: GateFacts) {
  const v = facts.visit
  const info = await tx
    .selectFrom('work.visits as v')
    .innerJoin('crm.projects as p', 'p.id', 'v.project_id')
    .select(['v.number', 'p.reference'])
    .where('v.id', '=', v.id)
    .executeTakeFirstOrThrow()
  const n = await names(
    tx,
    facts.exceptions.map((e) => e.requestedBy),
  )
  const services = facts.packet?.content.identity.services ?? []
  const missingCodes = new Set(facts.result.items.flatMap((i) => i.missing.map((m) => m.code)))
  const live = new Set(
    facts.exceptions.filter((e) => ['requested', 'approved'].includes(e.effective)).map((e) => e.kind),
  )
  const onSite = facts.assigned && ['en_route', 'arrived'].includes(v.state)
  const may = (action: 'work.start' | 'work.resume') => async () =>
    allowed(actor, action, { projectId: v.projectId, assignments: await visitAssignments(tx, v.id) })
  const ready = facts.result.outcome === 'ready'
  return {
    visitId: v.id,
    visitNumber: info.number,
    visitState: v.state,
    visitPurpose: v.purpose,
    mode: facts.mode,
    pausedAt: iso(facts.pause.pausedAt),
    jobId: v.jobId,
    projectReference: info.reference,
    checkedAt: new Date().toISOString(),
    outcome: facts.result.outcome,
    items: facts.result.items,
    packet: facts.packet ? { version: facts.packet.version, contentSha256: facts.packet.contentSha256 } : null,
    workPackages: services.map((s) => ({
      workPackageId: s.workPackageId,
      serviceCode: s.serviceCode,
      beforePhotos: facts.photos.get(s.workPackageId) ?? 0,
    })),
    siteCheck: facts.siteCheck
      ? {
          propertyConfirmed: facts.siteCheck.propertyConfirmed,
          accessAvailable: facts.siteCheck.accessAvailable,
          customerPresent: facts.siteCheck.customerPresent,
          hazardsReviewed: facts.siteCheck.hazardsReviewed,
          siteCondition: facts.siteCheck.siteCondition,
          holdId: facts.siteCheck.holdId,
          holdState: facts.siteCheck.holdState,
          packetVersion: facts.siteCheck.packetVersion,
          recordedAt: facts.siteCheck.recordedAt.toISOString(),
        }
      : null,
    exceptions: facts.exceptions.map((e) => ({
      id: e.id,
      kind: e.kind,
      requirement: e.requirement,
      state: e.effective,
      ending: e.ending,
      reason: e.reason,
      requestedBy: ref(e.requestedBy, n),
      requestedAt: e.requestedAt.toISOString(),
      decidedAt: iso(e.decidedAt),
      followUpDue: e.followUpDue,
      version: e.version,
    })),
    started: facts.started ? { startId: facts.started.id, startedAt: facts.started.startedAt.toISOString() } : null,
    emergency: { call911: CALL_911 },
    actions: {
      start: facts.mode === 'start' && ready && facts.started === null && (await may('work.start')()),
      resume: facts.mode === 'resume' && ready && (await may('work.resume')()),
      // TSK-0094: resuming asks for a site check newer than the pause, so it is offered again then.
      recordSiteCheck: facts.assigned && v.state === 'arrived' && (facts.started === null || facts.mode === 'resume'),
      uploadBeforePhotos: facts.assigned && v.state === 'arrived',
      requestException: onSite
        ? GATE_EXCEPTION_KINDS.filter(
            (k: GateExceptionKind) => !live.has(k) && EXCEPTABLE[k].some((c) => missingCodes.has(c)),
          )
        : [],
    },
  }
}

export function startModule(deps: { storage: ObjectStorage | null; environment?: GateEnvironment }): ApiModule {
  const environment: GateEnvironment = deps.environment ?? 'production'

  const gate: RouteDef = {
    method: 'GET',
    path: '/staff/visits/:visitId/start-gate',
    operationId: 'getStartGate',
    summary: 'The Start Work gate of a visit, for the caller',
    description:
      'Staff with work.start (the Owner and workers assigned to this visit, through the gate, never bypassed). The ' +
      "server's own evaluation of every Start Work prerequisite (HH-WORK-01) for the caller, in order: assignment " +
      'and arrival, site identity and access, the scope and packet viewed at its latest version and personally ' +
      'acknowledged, the SOP (and, for a Spanish-reading worker, its Spanish safety text released as AI-reviewed), ' +
      'job-level and review holds, critical safety holds and hazards reviewed, critical resources, the site ' +
      'condition, before photos and the deposit. Each missing item has its code, what it is about, its weight and ' +
      'its resolution owner, and the one administrative exception that may cover it, if any. Outcome: ready, ' +
      'needs_attention, requires_review or blocked. This answer authorizes nothing: Start Work checks everything ' +
      'again. Always carries the emergency call (tel:911). No query: no flag changes what is checked. TSK-0094: for a ' +
      'worker who started work on the job before its latest pause by a hazard report and has not started or resumed ' +
      'since, the answer evaluates resuming (mode resume, HH-INC-03): the same prerequisites, with a site check ' +
      'recorded after the pause, and actions.resume instead of actions.start. A return visit (visitPurpose ' +
      'return_work) starts once the job is awaiting quality review, operationally complete or closed, and its start ' +
      'never moves the job.',
    actors: ['staff'],
    permission: 'work.start',
    kind: 'read',
    idempotency: 'none',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'none',
    pagination: false,
    test: TEST,
    resource: visitFacts,
    schema: { params: VISIT_PARAMS, querystring: NO_QUERY, response: { 200: START_GATE } },
    handler: async (ctx) => {
      const actor = staff(ctx)
      const { visitId } = ctx.req.params as { visitId: string }
      const body = await withTx(ctx.db, async (tx) => {
        const visit = await gateVisit(tx, visitId)
        if (!visit) throw new ApiError('NOT_FOUND')
        return gateView(tx, actor, await gatherGate(tx, visit, actor.userId, { environment }))
      })
      return { body, headers: { 'cache-control': 'no-store' } }
    },
  }

  const start: RouteDef = {
    method: 'POST',
    path: '/staff/visits/:visitId/start',
    operationId: 'startWork',
    summary: 'Start Work (contracted work started)',
    description:
      "Staff with work.start, assigned to this visit, online. One transaction under the visit's and the job's row " +
      'locks: the packet is brought up to date and every prerequisite and exception is evaluated again, and the ' +
      "evaluation is recorded whatever its outcome. `packetVersion` is the version the caller's briefing showed; a " +
      'newer one refuses the start (PACKET_CHANGED_SINCE_VIEWED). Anything missing refuses it with CONFLICT naming ' +
      'every missing item (field gate.<prerequisite>, code), after recording the evaluation. A ready evaluation ' +
      'records the start (actual contracted work started, OWN-DEC-195) with the packet, scope and SOP versions, the ' +
      'acknowledgment, any approved exception and the server time, and moves the job and its planned or ready work ' +
      'packages to in_progress; a return visit (return_work, TSK-0094) moves neither: the original job keeps its ' +
      'state, completion evidence and costs (HH-QA-08). No role, flag or field skips any of it; the database refuses ' +
      'a start without its passing evaluation, and while any review, job-level or critical safety hold is open.',
    actors: ['staff'],
    permission: 'work.start',
    kind: 'write',
    idempotency: 'required',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'work.start',
    pagination: false,
    test: TEST,
    resource: visitFacts,
    schema: { params: VISIT_PARAMS, querystring: NO_QUERY, body: START_BODY, response: { 201: START_RESULT } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const actor = staff(ctx)
      const { visitId } = ctx.req.params as { visitId: string }
      const body = ctx.req.body as { packetVersion: number }
      const out = await startWork(tx, actor, visitId, {
        packetVersion: body.packetVersion,
        requestId: requestIdOf(ctx),
        environment,
      })
      const v = out.facts.visit
      const summary = {
        projectId: v.projectId,
        jobId: v.jobId,
        evaluationId: out.evaluationId,
        outcome: out.facts.result.outcome,
        missing: out.facts.result.items.flatMap((i) => i.missing.filter((m) => !m.exceptionId).map((m) => m.code)),
        exceptions: [...out.facts.result.exceptionsUsed],
        packetVersion: out.facts.packet?.version ?? null,
      }
      if (!out.started) {
        await ctx.audit({ target: { type: 'visit', id: v.id }, summary, result: 'denied', reason: 'start_gate_failed' })
        return { body: {}, refusal: gateRefusal(out.facts) }
      }
      await ctx.audit({ target: { type: 'work_start', id: out.start.id }, summary })
      const row = out.facts.packet
      if (!row || !out.facts.acknowledgmentId) throw new Error('a started gate has its packet and acknowledgment')
      return {
        status: 201,
        body: {
          started: true,
          startId: out.start.id,
          startedAt: out.start.startedAt.toISOString(),
          evaluationId: out.evaluationId,
          jobState: out.start.jobState,
          jobStateBefore: out.start.jobStateBefore,
          packetVersion: row.version,
          scopeVersion: row.content.scope.version,
          sopVersionIds: row.content.sop.packages.flatMap((p) => (p.sopVersionId ? [p.sopVersionId] : [])),
          acknowledgmentId: out.facts.acknowledgmentId,
          exceptionIds: [...out.facts.result.exceptionsUsed],
          workPackagesStarted: out.start.packagesStarted,
        },
        version: out.start.jobVersion,
      }
    },
  }

  const resume: RouteDef = {
    method: 'POST',
    path: '/staff/visits/:visitId/resume',
    operationId: 'resumeWork',
    summary: 'Resume work after an incident (the Start Work gate again)',
    description:
      'Staff with work.resume, assigned to this visit, online (TSK-0094; HH-INC-03, T54). For a worker who started ' +
      'work on the job before its latest pause by a hazard report and has not started or resumed since. One ' +
      "transaction under the visit's and the job's row locks: the packet is brought up to date and every Start Work " +
      'prerequisite is evaluated again (the hold released through its own path by someone other than the person who ' +
      'raised it, the current scope and SOP, the packet version the release made viewed and personally ' +
      'acknowledged, a site check recorded after the pause, critical resources, before photos of this visit, the ' +
      'deposit), and the evaluation is recorded whatever its outcome. Anything missing refuses with CONFLICT naming ' +
      'every missing item (field gate.<prerequisite>, code: NOT_STARTED_BEFORE when the caller never started work ' +
      'on the job before the pause, RESUME_NOT_NEEDED once they resumed). A ready evaluation records the ' +
      "resumption (and the worker's start on this visit when it is a new one) and moves a paused job and its " +
      'blocked work packages back to in_progress. Releasing a hold in the app is never a certification that the ' +
      'site is safe or a legal conclusion. No role, flag or field skips any of it; the database refuses a ' +
      'resumption without its passing evaluation.',
    actors: ['staff'],
    permission: 'work.resume',
    kind: 'write',
    idempotency: 'required',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'work.resume',
    pagination: false,
    test: 'test/integration/return-work.test.ts',
    resource: visitFacts,
    schema: { params: VISIT_PARAMS, querystring: NO_QUERY, body: START_BODY, response: { 201: RESUME_RESULT } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const actor = staff(ctx)
      const { visitId } = ctx.req.params as { visitId: string }
      const body = ctx.req.body as { packetVersion: number }
      const out = await resumeWork(tx, actor, visitId, {
        packetVersion: body.packetVersion,
        requestId: requestIdOf(ctx),
        environment,
      })
      const v = out.facts.visit
      const summary = {
        projectId: v.projectId,
        jobId: v.jobId,
        evaluationId: out.evaluationId,
        outcome: out.facts.result.outcome,
        missing: out.facts.result.items.flatMap((i) => i.missing.filter((m) => !m.exceptionId).map((m) => m.code)),
        exceptions: [...out.facts.result.exceptionsUsed],
        packetVersion: out.facts.packet?.version ?? null,
      }
      if (!out.resumed) {
        await ctx.audit({ target: { type: 'visit', id: v.id }, summary, result: 'denied', reason: 'start_gate_failed' })
        return { body: {}, refusal: gateRefusal(out.facts) }
      }
      await ctx.audit({ target: { type: 'work_resumption', id: out.resumption.id }, summary })
      const row = out.facts.packet
      if (!row || !out.facts.acknowledgmentId) throw new Error('a resumed gate has its packet and acknowledgment')
      return {
        status: 201,
        body: {
          resumed: true,
          resumptionId: out.resumption.id,
          resumedAt: out.resumption.resumedAt.toISOString(),
          pausedAt: out.resumption.pausedAt.toISOString(),
          startId: out.resumption.startId,
          evaluationId: out.evaluationId,
          jobState: 'in_progress',
          jobStateBefore: out.resumption.jobStateBefore,
          packetVersion: row.version,
          acknowledgmentId: out.facts.acknowledgmentId,
          exceptionIds: [...out.facts.result.exceptionsUsed],
          workPackagesResumed: out.resumption.packagesResumed,
        },
        version: out.resumption.jobVersion,
      }
    },
  }

  const siteCheck: RouteDef = {
    method: 'POST',
    path: '/staff/visits/:visitId/site-checks',
    operationId: 'recordStartSiteCheck',
    summary: "Record the worker's site check before Start Work",
    description:
      'Staff with job.record_checklist_step, assigned to this arrived visit: their own answers: the property and site ' +
      'identified, access available, the customer (or authorized representative) present, the hazards and controls ' +
      'of the packet reviewed, and the site as the packet describes it or different (a note saying what differs is ' +
      'required). A difference raises a job-level Hold with that note in the same transaction, under the job lock: ' +
      'the job cannot be confirmed or started until the Owner sets Ready with a note. The latest check of a worker ' +
      'counts; it never clears a hold. ARRIVED_FIRST before the visit arrived. If anything is unsafe: stop, keep ' +
      'people away, call; emergencies call 911 at once.',
    actors: ['staff'],
    permission: 'job.record_checklist_step',
    kind: 'write',
    idempotency: 'required',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'work.site_check',
    pagination: false,
    test: TEST,
    resource: visitFacts,
    schema: { params: VISIT_PARAMS, body: SITE_CHECK_BODY, response: { 201: SITE_CHECK_RESULT } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const actor = staff(ctx)
      const { visitId } = ctx.req.params as { visitId: string }
      const out = await recordSiteCheck(tx, actor, visitId, ctx.req.body as SiteCheckInput)
      const b = ctx.req.body as SiteCheckInput
      await ctx.audit({
        target: { type: 'visit', id: visitId },
        summary: {
          projectId: out.visit.projectId,
          siteCheckId: out.id,
          propertyConfirmed: b.propertyConfirmed,
          accessAvailable: b.accessAvailable,
          customerPresent: b.customerPresent,
          hazardsReviewed: b.hazardsReviewed,
          siteCondition: b.siteCondition,
          holdId: out.holdId,
        },
      })
      return {
        status: 201,
        body: { siteCheckId: out.id, recordedAt: out.recordedAt.toISOString(), holdId: out.holdId },
      }
    },
  }

  const photo: RouteDef = {
    method: 'POST',
    path: '/staff/visits/:visitId/before-photos',
    operationId: 'uploadBeforePhoto',
    summary: 'Upload one before photo of a work package',
    description:
      'Staff with job.add_photo, assigned to this arrived visit. Raw JPEG, PNG or WebP bytes for the work package in ' +
      "the query (a package of the visit's job). Checked like request photos (the real content, the declared type " +
      'and the size against uploads.limits; NOT CONFIGURED limits or storage answer UNAVAILABLE), stored once under ' +
      'an opaque key in the private bucket, internal, never shown to the customer here. The same bytes again for ' +
      'the same package answer the same photo (200). PROPOSED: at least one per work package of the job, on this ' +
      'visit, before Start Work (a rejected one does not count). TSK-0076: a field photo of the before phase, ' +
      'quarantined until processed and internal until shared (POST /staff/visits/:visitId/field-photos adds after ' +
      'photos, area labels and pairs).',
    actors: ['staff'],
    permission: 'job.add_photo',
    kind: 'write',
    idempotency: 'none',
    expectedVersion: 'none',
    rateLimit: { bucket: 'before-photo-upload', limit: 120, windowSeconds: 3600 },
    audit: 'work.before_photo',
    pagination: false,
    test: TEST,
    resource: visitFacts,
    binaryBody: { contentTypes: PHOTO_TYPES, maxBytes: UPLOAD_TRANSPORT_LIMIT_BYTES },
    schema: { params: VISIT_PARAMS, querystring: PHOTO_QUERY, response: { 201: PHOTO_RESULT, 200: PHOTO_RESULT } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const actor = staff(ctx)
      const { visitId } = ctx.req.params as { visitId: string }
      const q = ctx.req.query as { workPackageId: string; deviceCapturedAt?: string }
      const bytes = Buffer.isBuffer(ctx.req.body) ? ctx.req.body : Buffer.alloc(0)
      let out: Awaited<ReturnType<typeof uploadBeforePhoto>>
      try {
        out = await uploadBeforePhoto(tx, actor, visitId, {
          workPackageId: q.workPackageId,
          bytes,
          declaredType: String(ctx.req.headers['content-type'] ?? ''),
          storage: deps.storage,
          requestId: requestIdOf(ctx),
          deviceCapturedAt: q.deviceCapturedAt,
        })
      } catch (err) {
        if (!(err instanceof BeforePhotoError)) throw err
        if (err.problem === 'not_configured') throw new ApiError('UNAVAILABLE')
        if (err.problem === 'too_large') throw new ApiError('PAYLOAD_TOO_LARGE')
        if (err.problem === 'type_not_allowed' || err.problem === 'unsupported_type')
          throw new ApiError('UNSUPPORTED_MEDIA_TYPE')
        throw new ApiError('VALIDATION_FAILED', {
          fieldErrors: [
            {
              field: err.problem === 'unknown_work_package' ? 'querystring.workPackageId' : 'body',
              code: err.problem,
              message: '',
            },
          ],
        })
      }
      await ctx.audit({
        target: { type: 'before_photo', id: out.id },
        summary: { projectId: out.visit.projectId, visitId, workPackageId: q.workPackageId, created: out.created },
      })
      return {
        status: out.created ? 201 : 200,
        body: {
          photoId: out.id,
          workPackageId: q.workPackageId,
          uploadedAt: out.uploadedAt.toISOString(),
          created: out.created,
        },
      }
    },
  }

  const requestExc: RouteDef = {
    method: 'POST',
    path: '/staff/visits/:visitId/start-exceptions',
    operationId: 'requestStartException',
    summary: 'Request an administrative Start Work exception',
    description:
      'Staff with work.request_exception (a worker assigned to this visit, on the way or arrived). Exactly one of the ' +
      'three exceptions of OWN-DEC-68, with a reason and its evidence: customer_not_present (how the customer ' +
      'authorized unattended access, and the contact who is reachable; the scope must be accepted and the access ' +
      'instructions recorded, and the worker records the site check first: the site inspection and safety checks ' +
      'are never deferred, only the walkthrough), before_photo_upload_failed (the work packages whose photos are ' +
      'captured and still on the device, how many, and the failure; missing capture is never excepted) or ' +
      'deposit_bookkeeping_pending (the provider, the transaction reference and the amount in cents, at least the ' +
      'deposit due; a statement or screenshot is not enough: the Owner verifies it in the provider). Refused ' +
      '(CONFLICT) unless the records show that one requirement missing now; one live request per kind and visit. ' +
      'It covers one requirement, one job and one visit, and ends with the visit or a relevant change. Any other ' +
      'kind is refused (VALIDATION_FAILED): no fourth exception exists, and safety, legal, qualification, scope, ' +
      'authorization and access are never excepted. The Owner decides it from the review queue.',
    actors: ['staff'],
    permission: 'work.request_exception',
    kind: 'write',
    idempotency: 'required',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'work.request_exception',
    pagination: false,
    test: TEST,
    resource: visitFacts,
    schema: { params: VISIT_PARAMS, body: EXCEPTION_BODY, response: { 201: EXCEPTION_RESULT } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const actor = staff(ctx)
      const { visitId } = ctx.req.params as { visitId: string }
      const b = ctx.req.body as { kind: GateExceptionKind; reason: string; evidence: Record<string, unknown> }
      const out = await requestException(tx, actor, visitId, { ...b, environment })
      await ctx.audit({
        target: { type: 'gate_exception', id: out.id, version: out.version },
        summary: { projectId: out.visit.projectId, visitId, kind: b.kind },
      })
      return { status: 201, body: { exceptionId: out.id, kind: b.kind, state: 'requested', version: out.version } }
    },
  }

  const decision = (d: { action: 'approve' | 'decline'; body: Record<string, unknown>; text: string }): RouteDef => ({
    method: 'POST',
    path: `/staff/start-exceptions/:exceptionId/actions/${d.action}`,
    operationId: d.action === 'approve' ? 'approveStartException' : 'declineStartException',
    summary: d.action === 'approve' ? 'Approve a Start Work exception' : 'Decline a Start Work exception',
    description: d.text,
    actors: ['staff'],
    permission: 'work.approve_exception',
    kind: 'write',
    idempotency: 'required',
    expectedVersion: 'required',
    rateLimit: 'none',
    ...(d.action === 'approve' ? { freshAuthMinutes: FRESH_AUTH_MINUTES } : {}),
    audit: d.action === 'approve' ? 'work.approve_exception' : 'work.decline_exception',
    pagination: false,
    test: TEST,
    resource: exceptionFacts,
    schema: { params: EXCEPTION_PARAMS, body: d.body, response: { 200: EXCEPTION_RESULT } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const actor = staff(ctx)
      const { exceptionId } = ctx.req.params as { exceptionId: string }
      const b = ctx.req.body as Record<string, unknown>
      const input: DecisionInput =
        d.action === 'approve'
          ? {
              event: 'approve',
              followUpOwnerId: String(b['followUpOwnerId']),
              followUpDue: String(b['followUpDue']),
              ...(typeof b['note'] === 'string' ? { note: b['note'] } : {}),
              ...(typeof b['providerVerified'] === 'boolean' ? { providerVerified: b['providerVerified'] } : {}),
            }
          : { event: 'decline', reason: String(b['reason']) }
      const out = await decideException(tx, actor, exceptionId, ctx.expectedVersion(), input, environment)
      await ctx.audit({
        target: { type: 'gate_exception', id: out.id, version: out.version },
        summary: {
          projectId: out.visit.projectId,
          visitId: out.visit.id,
          kind: out.kind,
          state: out.state,
          ...(input.event === 'approve'
            ? { followUpOwnerId: input.followUpOwnerId, followUpDue: input.followUpDue }
            : {}),
        },
      })
      return {
        body: { exceptionId: out.id, kind: out.kind, state: out.state, version: out.version },
        version: out.version,
      }
    },
  })

  const review: RouteDef = {
    method: 'GET',
    path: '/staff/jobs/:jobId/start-review',
    operationId: 'getStartReview',
    summary: "A job's holds and Start Work exceptions",
    description:
      'Staff with job_hold.set (the Owner; Office and the Estimator, PROPOSED cells). The holds of the job that block ' +
      'Start Work (job-level Hold / Ready notes, critical safety holds, intake review holds) open or under review, ' +
      'and the ones resolved or cancelled, with the actions the caller may take: the Owner sets Ready on any ' +
      'job-level note (including one the Owner set) and reviews, resolves or cancels a critical safety hold they did ' +
      'not raise. For the Owner (work.approve_exception) also every exception of the job with its reason, evidence, ' +
      "where it stands, its follow-up (a pending upload or reconciliation stays open until resolved) and the Owner's " +
      'actions; nobody else sees exceptions here.',
    actors: ['staff'],
    permission: 'job_hold.set',
    kind: 'read',
    idempotency: 'none',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'none',
    pagination: false,
    test: TEST,
    resource: jobFacts,
    schema: { params: JOB_PARAMS, response: { 200: START_REVIEW } },
    handler: async (ctx) => {
      const actor = staff(ctx)
      const { jobId } = ctx.req.params as { jobId: string }
      const body = await withTx(ctx.db, async (tx) => {
        const job = await tx
          .selectFrom('work.jobs as j')
          .innerJoin('crm.projects as p', 'p.id', 'j.project_id')
          .select(['j.id', 'j.project_id', 'j.operational_state', 'p.reference'])
          .where('j.id', '=', jobId)
          .where(jobInScope('j.id', ctx.scope))
          .executeTakeFirst()
        if (!job) throw new ApiError('NOT_FOUND')
        const holds = await tx
          .selectFrom('work.holds')
          .selectAll()
          .where('project_id', '=', job.project_id)
          .where('kind', 'in', ['review', 'job_requirement', 'critical_safety'])
          .orderBy('raised_at')
          .orderBy('id')
          .execute()
        const decides = allowed(actor, 'work.approve_exception', { projectId: job.project_id })
        const exc = decides
          ? await tx
              .selectFrom('work.gate_exceptions as g')
              .innerJoin('work.visits as v', 'v.id', 'g.visit_id')
              .select(['g.id', 'v.id as visit_id', 'v.number'])
              .where('g.job_id', '=', jobId)
              .orderBy('g.requested_at', 'desc')
              .execute()
          : []
        const visitIds = [...new Set(exc.map((e) => e.visit_id))]
        const rows = []
        for (const visitId of visitIds) {
          const visit = await gateVisit(tx, visitId)
          if (!visit) continue
          const assigned = (await visitAssignments(tx, visitId)).map((a) => a.staffUserId)
          const row = await latestPacket(tx, jobId)
          for (const e of await visitExceptions(tx, visit, row, assigned, new Date()))
            rows.push({
              e,
              visit,
              number: exc.find((x) => x.id === e.id)?.number ?? 0,
              followUp: await followUpOf(tx, { ...e, state: e.effective }, visit),
            })
        }
        rows.sort((a, b) => b.e.requestedAt.getTime() - a.e.requestedAt.getTime())
        const n = await names(tx, [
          ...holds.map((h) => h.raised_by),
          ...rows.flatMap((r) => [r.e.requestedBy, r.e.decidedBy, r.e.followUpOwner]),
        ])
        const staffList = decides
          ? await tx
              .selectFrom('identity.staff_users')
              .select(['id', 'display_name'])
              .where('status', '=', 'active')
              .orderBy('display_name')
              .execute()
          : []
        const setReady = allowed(actor, 'job_hold.set_ready', { projectId: job.project_id })
        return {
          jobId,
          projectReference: job.reference,
          jobState: job.operational_state,
          holds: holds.map((h) => {
            const blocking = (BLOCKING_HOLD_STATES as readonly string[]).includes(h.state)
            const critical = h.kind === 'critical_safety'
            const release =
              critical &&
              allowed(actor, 'hold.release_critical', {
                projectId: h.project_id,
                raisedByStaffId: h.raised_by,
              })
            return {
              holdId: h.id,
              kind: h.kind as 'review' | 'job_requirement' | 'critical_safety',
              category: h.category,
              source: h.source,
              state: h.state,
              version: h.version,
              note: h.note,
              raisedBy: ref(h.raised_by, n),
              raisedAt: h.raised_at.toISOString(),
              resolutionNote: h.resolution_note,
              reviewer: h.reviewer,
              resolvedAt: iso(h.resolved_at),
              actions: {
                setReady: h.kind === 'job_requirement' && blocking && setReady,
                startReview: release && h.state === 'open',
                resolve: release && h.state === 'under_review',
                cancel: release && blocking,
              },
            }
          }),
          exceptions: rows.map(({ e, visit, number, followUp }) => ({
            id: e.id,
            visitId: visit.id,
            visitNumber: number,
            kind: e.kind,
            requirement: e.requirement,
            state: e.effective,
            ending: e.ending,
            reason: e.reason,
            evidence: e.evidence,
            requestedBy: ref(e.requestedBy, n),
            requestedAt: e.requestedAt.toISOString(),
            decidedBy: e.decidedBy ? ref(e.decidedBy, n) : null,
            decidedAt: iso(e.decidedAt),
            decisionNote: e.decisionNote,
            followUpOwner: e.followUpOwner ? ref(e.followUpOwner, n) : null,
            followUpDue: e.followUpDue,
            followUp,
            version: e.version,
            actions: {
              approve: e.effective === 'requested' && e.requestedBy !== actor.userId,
              decline: e.effective === 'requested' && e.requestedBy !== actor.userId,
            },
          })),
          followUpOwners: staffList.map((s) => ({ id: s.id, name: s.display_name })),
          actions: { setHold: allowed(actor, 'job_hold.set', { projectId: job.project_id }) },
        }
      })
      return { body, headers: { 'cache-control': 'no-store' } }
    },
  }

  const setHold: RouteDef = {
    method: 'POST',
    path: '/staff/jobs/:jobId/job-holds',
    operationId: 'setJobHold',
    summary: 'Set the job-level Hold with a note',
    description:
      'Staff with job_hold.set (the Owner; Office and the Estimator, PROPOSED cells). Puts the job on Hold with a note ' +
      'naming the unresolved requirement (OWN-DEC-82: no license or credential module; licenses and permits are ' +
      'checked by the Owner outside the software) and its category. Written under the job lock: while it blocks, the ' +
      "job's visits cannot be confirmed and work cannot start. Only the Owner sets Ready, with a note. The packet " +
      'gets a new version (a critical change: every assigned worker reviews it again).',
    actors: ['staff'],
    permission: 'job_hold.set',
    kind: 'write',
    idempotency: 'required',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'job_hold.set',
    pagination: false,
    test: TEST,
    resource: jobFacts,
    schema: { params: JOB_PARAMS, body: JOB_HOLD_BODY, response: { 201: HOLD_RESULT } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const actor = staff(ctx)
      const { jobId } = ctx.req.params as { jobId: string }
      const b = ctx.req.body as { category: JobHoldCategory; note: string }
      const job = await tx
        .selectFrom('work.jobs')
        .select(['id', 'project_id'])
        .where('id', '=', jobId)
        .where(jobInScope('id', ctx.scope))
        .executeTakeFirst()
      if (!job) throw new ApiError('NOT_FOUND')
      const holdId = await insertJobHold(tx, {
        projectId: job.project_id,
        jobId,
        category: b.category,
        note: b.note.trim(),
        source: 'job_hold',
        raisedBy: actor.userId,
      })
      await syncJobHoldItem(tx, jobId)
      await ctx.audit({
        target: { type: 'hold', id: holdId, version: 1 },
        summary: { projectId: job.project_id, jobId, kind: 'job_requirement', category: b.category },
      })
      return { status: 201, body: { holdId, kind: 'job_requirement', state: 'open', version: 1, jobId }, version: 1 }
    },
  }

  const ready: RouteDef = {
    method: 'POST',
    path: '/staff/job-holds/:holdId/actions/set-ready',
    operationId: 'setJobHoldReady',
    summary: 'Set Ready on a job-level Hold / Ready note',
    description:
      'Staff with job_hold.set_ready (the Owner), with the version they saw. Sets Ready on any job-level Hold / Ready ' +
      'note, including one the Owner set (OWN-DEC-137), with a note recording how the requirement was resolved; the ' +
      'Owner is recorded as the reviewer. Never a critical safety hold, a review hold or a task block (NOT_FOUND ' +
      'here): those have their own documented paths.',
    actors: ['staff'],
    permission: 'job_hold.set_ready',
    kind: 'write',
    idempotency: 'required',
    expectedVersion: 'required',
    rateLimit: 'none',
    audit: 'job_hold.set_ready',
    pagination: false,
    test: TEST,
    resource: holdFacts('job_requirement'),
    schema: { params: HOLD_PARAMS, body: READY_BODY, response: { 200: HOLD_RESULT } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const actor = staff(ctx)
      const { holdId } = ctx.req.params as { holdId: string }
      const b = ctx.req.body as { resolutionNote: string }
      const out = await setJobHoldReady(tx, actor, holdId, ctx.expectedVersion(), b.resolutionNote)
      await ctx.audit({
        target: { type: 'hold', id: holdId, version: out.version },
        summary: { projectId: out.hold.project_id, jobId: out.hold.scope_id, from: out.hold.state, to: out.state },
      })
      return {
        body: { holdId, kind: 'job_requirement', state: out.state, version: out.version, jobId: out.hold.scope_id },
        version: out.version,
      }
    },
  }

  const critical = (d: {
    action: 'start-review' | 'resolve' | 'cancel'
    body: Record<string, unknown>
    text: string
  }): RouteDef => ({
    method: 'POST',
    path: `/staff/critical-holds/:holdId/actions/${d.action}`,
    operationId:
      d.action === 'start-review'
        ? 'startCriticalHoldReview'
        : d.action === 'resolve'
          ? 'resolveCriticalHold'
          : 'cancelCriticalHold',
    summary:
      d.action === 'start-review'
        ? 'Start the review of a critical safety hold'
        : d.action === 'resolve'
          ? 'Release a critical safety hold with its evidence'
          : 'Cancel a critical safety hold entered in error',
    description: d.text,
    actors: ['staff'],
    permission: 'hold.release_critical',
    kind: 'write',
    idempotency: 'required',
    expectedVersion: 'required',
    rateLimit: 'none',
    ...(d.action === 'start-review' ? {} : { freshAuthMinutes: FRESH_AUTH_MINUTES }),
    audit:
      d.action === 'start-review'
        ? 'hold.start_review'
        : d.action === 'resolve'
          ? 'hold.release_critical'
          : 'hold.cancel_critical',
    pagination: false,
    test: TEST,
    resource: holdFacts('critical_safety'),
    schema: { params: HOLD_PARAMS, body: d.body, response: { 200: HOLD_RESULT } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const actor = staff(ctx)
      const { holdId } = ctx.req.params as { holdId: string }
      const b = ctx.req.body as Record<string, string>
      const input: CriticalAction =
        d.action === 'start-review'
          ? { event: 'start_review' }
          : d.action === 'resolve'
            ? {
                event: 'resolve',
                resolutionNote: String(b['resolutionNote']),
                evidence: String(b['evidence']),
                reviewer: String(b['reviewer']),
                reviewerQualification: String(b['reviewerQualification']),
              }
            : { event: 'cancel_as_error', reason: String(b['reason']) }
      const out = await moveCriticalHold(tx, actor, holdId, ctx.expectedVersion(), input)
      await ctx.audit({
        target: { type: 'hold', id: holdId, version: out.version },
        summary: {
          projectId: out.hold.project_id,
          jobId: out.hold.scope_id,
          kind: 'critical_safety',
          category: out.hold.category,
          from: out.hold.state,
          to: out.state,
        },
      })
      return {
        body: { holdId, kind: 'critical_safety', state: out.state, version: out.version, jobId: out.hold.scope_id },
        version: out.version,
      }
    },
  })

  const CRITICAL_TEXT =
    'Staff with hold.release_critical (the Owner), never on a critical safety hold they raised (OWN-DEC-38: never ' +
    'relaxed, even for a sole administrator; such a hold stays open until a second administrator exists), with the ' +
    'version they saw. '
  return {
    name: 'start',
    routes: [
      gate,
      siteCheck,
      photo,
      requestExc,
      start,
      resume,
      decision({
        action: 'approve',
        body: APPROVE_BODY,
        text:
          'Staff with work.approve_exception (the Owner) with a fresh sign-in and the version they saw; never the ' +
          'person who requested it (OWN_REQUEST). Approves one requested exception for its one requirement, job and ' +
          'visit, naming the follow-up owner and deadline; a deposit exception needs providerVerified: true, the ' +
          "Owner's statement that the provider's own records show the payment and its reference. Refused once it " +
          'ended (the visit ended, or a relevant change in scope, site, access or assignment since the request). It ' +
          'is listed in the review queue while its follow-up (pending upload or reconciliation) is open. An approval ' +
          'never covers a hold, a safety, legal, qualification, scope, authorization or access requirement.',
      }),
      decision({
        action: 'decline',
        body: DECLINE_BODY,
        text: 'Staff with work.approve_exception (the Owner), with a reason and the version they saw; never the requester.',
      }),
      review,
      setHold,
      ready,
      critical({
        action: 'start-review',
        body: CRITICAL_REVIEW_BODY,
        text: `${CRITICAL_TEXT}Starts the review of an open critical safety hold; it keeps blocking.`,
      }),
      critical({
        action: 'resolve',
        body: CRITICAL_RESOLVE_BODY,
        text:
          `${CRITICAL_TEXT}With a fresh sign-in. Releases a hold under review only with how it was resolved, the ` +
          'resolution evidence, the reviewer who assessed it and their qualification (a qualified person where the ' +
          'hazard needs one; the software records it and does not judge competence). Resuming work still needs the ' +
          'gate again.',
      }),
      critical({
        action: 'cancel',
        body: CRITICAL_CANCEL_BODY,
        text: `${CRITICAL_TEXT}With a fresh sign-in and the reason it was entered in error.`,
      }),
    ],
  }
}

export { syncExceptionItem, syncJobHoldItem }
