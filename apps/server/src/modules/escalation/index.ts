// The escalation procedure of every job packet: the Owner's number and the recorded escalation actions (TSK-0129;
// HH-PKT-09, HH-WORK-13, FACT-SVC-ESCALATION-PATH, ENT-StaffUser, ENT-AuditEvent, OWN-DEC-172, OWN-DEC-208,
// RULE-SAFETY-GATES, RULE-SERVER-AUTHZ, RULE-NO-INVENTED-FACTS, RULE-SYNTHETIC-DATA).
//   GET  /staff/profile/escalation-phone          the escalation number on the Owner's own staff profile (the Owner)
//   PUT  /staff/profile/escalation-phone          the Owner enters or clears it: a fresh sign-in and If-Match
//   POST /staff/jobs/:jobId/escalation-calls      a Call Owner, Call 911 or "I could not reach the Owner" tap, recorded
//                                                 once per phone UUID (hazard.report: whoever may stop work)
// - The number is personal data the owner gives (OWN-DEC-172): entered by the Owner in their own profile, on staging
//   and production; never in the repository, the graph, fixtures (synthetic 555-01XX numbers only), logs or the audit
//   summary (the summary records the state and the versions, not the number). Every packet and Stop Work reads it
//   (store.ts ownerEscalationContact); while it is empty Call Owner says NOT CONFIGURED and to call 911 in an
//   emergency, and nothing else waits for it: not the packet, not Start Work, not Stop Work.
// - PROPOSED: entering the number is the Owner's "Business details" row (business_details.edit) with a fresh sign-in,
//   as the mailing address is; it is always the caller's own profile.
// - Every tap is recorded with who, which job (visit, report), the phone's time and the server's, and audited. The
//   call never waits for it: Call 911 and Call Owner are phone links, the record is sent afterwards, offline too.
//   "I could not reach the Owner" records that the affected work stays paused (OWN-DEC-208 reading 10): nothing here
//   resumes, releases or changes any hold, and the Owner alone authorizes resuming (OWN-DEC-172 item 3).
import type { Tx } from '@handyhub/db'
import { CALL_911, normalizeOwnerPhone, type EscalationAction } from '@handyhub/domain'
import type { StaffActor } from '@handyhub/policy'
import { ApiError } from '../../api/errors.js'
import type { ApiContext, ApiModule, RouteDef } from '../../api/route.js'
import { FRESH_AUTH_MINUTES } from '../identity/sessions.js'
import { jobAssignments } from '../packets/assignments.js'
import { CALL_BODY, CALL_RESULT, JOB_PARAMS, OWN_PHONE, OWN_PHONE_BODY } from './schemas.js'
import {
  ownerEscalationContact,
  ownEscalationPhone,
  recordEscalationCall,
  setOwnEscalationPhone,
  type EscalationCallInput,
} from './store.js'

export { escalationCalls, ownerEscalationContact } from './store.js'

const TEST = 'test/integration/escalation.test.ts'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function staff(ctx: ApiContext): StaffActor {
  if (ctx.actor.kind !== 'staff') throw new ApiError('FORBIDDEN')
  return ctx.actor
}

/** The job's facts: its project and the workers assigned to it now (the policy's A cell). */
const jobFacts: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const { jobId } = req.params as { jobId: string }
  if (!UUID_RE.test(jobId)) return null
  const j = await db.selectFrom('work.jobs').select('project_id').where('id', '=', jobId).executeTakeFirst()
  return j ? { projectId: j.project_id, assignments: await jobAssignments(db, jobId) } : null
}

const PROCEDURE =
  'Owner first for every problem that is not life-threatening; call 911 at once, without waiting for anyone, for an ' +
  'actual or reasonably suspected immediate threat to life or serious injury (OWN-DEC-172).'

const routes: RouteDef[] = [
  {
    actors: ['staff'],
    kind: 'read',
    idempotency: 'none',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'none',
    pagination: false,
    test: TEST,
    method: 'GET',
    path: '/staff/profile/escalation-phone',
    operationId: 'getOwnEscalationPhone',
    summary: "The escalation number on the Owner's own staff profile",
    description:
      "The Owner (business_details.edit). The phone number every job packet's Call Owner — Report a Problem dials, " +
      "as entered on the caller's own staff profile: +1 and ten digits, how it is shown and the version, or NOT " +
      `CONFIGURED (Call Owner then says to call 911 in an emergency). ETag: the version. ${PROCEDURE}`,
    permission: 'business_details.edit',
    schema: { response: { 200: OWN_PHONE } },
    handler: async (ctx) => {
      const own = await ownEscalationPhone(ctx.db, staff(ctx).userId)
      return { body: own, version: own.version, headers: { 'cache-control': 'no-store' } }
    },
  },
  {
    actors: ['staff'],
    kind: 'write',
    idempotency: 'required',
    expectedVersion: 'required',
    rateLimit: 'none',
    pagination: false,
    test: TEST,
    method: 'PUT',
    path: '/staff/profile/escalation-phone',
    operationId: 'setOwnEscalationPhone',
    summary: "Enter or clear the escalation number on the Owner's own profile",
    description:
      `The Owner only (business_details.edit, with a fresh sign-in within ${FRESH_AUTH_MINUTES} minutes), with ` +
      "If-Match: the version shown. Always the caller's own profile. A North American number as typed ((502) " +
      '555-0142, 502-555-0142, +1 502 555 0142) is stored as +1 and ten digits; anything else is refused ' +
      '(VALIDATION_FAILED, invalidPhone), never guessed. null clears it: Call Owner is NOT CONFIGURED again. Every ' +
      'job packet and Stop Work reads it at once (no new packet version). Audited with the state and the versions, ' +
      'never the number.',
    permission: 'business_details.edit',
    freshAuthMinutes: FRESH_AUTH_MINUTES,
    audit: 'staff.set_escalation_phone',
    schema: { body: OWN_PHONE_BODY, response: { 200: OWN_PHONE } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const actor = staff(ctx)
      const typed = (ctx.req.body as { phone: string | null }).phone
      const phone = typed === null || typed.trim() === '' ? null : normalizeOwnerPhone(typed)
      if (typed !== null && typed.trim() !== '' && phone === null)
        throw new ApiError('VALIDATION_FAILED', {
          fieldErrors: [{ field: 'body.phone', code: 'invalidPhone', message: '' }],
        })
      const { before, after } = await setOwnEscalationPhone(tx, actor.userId, phone, ctx.expectedVersion())
      await ctx.audit({
        target: { type: 'staff_user', id: actor.userId, version: after.version },
        // Never the number itself (OWN-DEC-172: personal data): the state and the versions.
        summary: { from: before.state, to: after.state, previousVersion: before.version },
        stepUpUsed: true,
      })
      return { body: after, version: after.version }
    },
  },
  {
    actors: ['staff'],
    kind: 'write',
    idempotency: 'required',
    expectedVersion: 'none',
    rateLimit: 'none',
    pagination: false,
    test: TEST,
    method: 'POST',
    path: '/staff/jobs/:jobId/escalation-calls',
    operationId: 'recordEscalationCall',
    summary: 'Record a Call Owner, Call 911 or Owner-unreachable tap',
    description:
      'Staff with hazard.report: every worker assigned to the job ("A, always, no permission needed"), Office, the ' +
      'Estimator and the Owner. The phone sends it after the call started (a phone link that never waits for this ' +
      'record), offline too: the UUID the phone generated records it once however often it is resent; the same UUID ' +
      'from another account, job or action is refused (CONFLICT, ESCALATION_CALL_EXISTS). A visit or report the ' +
      "server cannot place on the job is left out, never refused. The phone's time is kept beside the server's. " +
      'owner_unreachable records that the affected work stays paused: nothing here resumes, releases or changes a ' +
      'hold, and Call 911 never depends on the Owner. The answer carries the Owner contact in force and Call 911. ' +
      `Audited. ${PROCEDURE}`,
    permission: 'hazard.report',
    audit: 'hazard.record_escalation_call',
    resource: jobFacts,
    schema: { params: JOB_PARAMS, body: CALL_BODY, response: { 201: CALL_RESULT, 200: CALL_RESULT } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const actor = staff(ctx)
      const { jobId } = ctx.req.params as { jobId: string }
      const job = await tx
        .selectFrom('work.jobs')
        .select(['id', 'project_id'])
        .where('id', '=', jobId)
        .executeTakeFirst()
      if (!job) throw new ApiError('NOT_FOUND')
      const body = ctx.req.body as EscalationCallInput
      const { row, alreadyRecorded } = await recordEscalationCall(
        tx,
        actor,
        { id: job.id, projectId: job.project_id },
        { ...body, clientId: body.clientId.toLowerCase() },
      )
      // A resent tap is audited as such: the record itself is the first one.
      await ctx.audit({
        target: { type: 'escalation_call', id: row.client_id },
        summary: {
          projectId: job.project_id,
          jobId,
          action: row.action,
          visitId: row.visit_id,
          reportId: row.report_id,
          alreadyRecorded,
        },
      })
      return {
        status: alreadyRecorded ? 200 : 201,
        body: {
          clientId: row.client_id,
          jobId,
          action: row.action as EscalationAction,
          alreadyRecorded,
          deviceRecordedAt: row.device_recorded_at.toISOString(),
          receivedAt: row.received_at.toISOString(),
          workStaysPaused: row.action === 'owner_unreachable',
          owner: await ownerEscalationContact(tx),
          emergency: { call911: CALL_911 },
        },
      }
    },
  },
]

export const ESCALATION_MODULE: ApiModule = { name: 'escalation', routes }
