// Field module: My Day, On my way, Arrived and Finished, and the per-worker timestamps (TSK-0070; HH-OFF-09,
// HH-SCH-08, HH-PORT-07, HH-WORK-06, T23, T43, T47, T49, T65, ENT-Visit, ENT-TimeStamp, ENT-AuditEvent,
// FACT-AUTOMATIC-MESSAGES, OWN-DEC-107, OWN-DEC-69, OWN-DEC-121, OWN-DEC-149, RULE-SERVER-AUTHZ, RULE-SAFETY-GATES).
//   GET  /staff/my/day                                 the caller's My Day (schedule.view_my_day: own assignments)
//   POST /staff/visits/:visitId/on-my-way              On my way (visit.tap_on_my_way: the assigned worker)
//   POST /staff/visits/:visitId/arrived                Arrived (visit.tap_arrived: the assigned worker)
//   POST /staff/visits/:visitId/finished               Finished (visit.tap_finished: the assigned worker)
//   GET  /staff/visits/:visitId/timestamps             each worker's Arrived and Finished (visit.correct_timestamps)
//   POST /staff/visits/:visitId/timestamps/corrections the Owner's correction, with the reason (visit.correct_timestamps)
//   POST /staff/timestamps/exports                     the accountant's CSV (export.accounting: the Owner, fresh sign-in,
//                                                      with a reason)
// TSK-0078 (HH-SCH-09): visit outcomes (outcomes.ts).
//   POST /staff/visits/:visitId/outcomes               a delay, no access, customer absent, weather, missing resources or
//                                                      readiness issue, with a note (the assigned worker or the Owner)
//   GET  /staff/visit-outcomes/:outcomeId              one outcome and its follow-up (visit.reschedule: Owner, Office)
//   POST /staff/visit-outcomes/:outcomeId/follow-up    the staff follow-up, once (visit.reschedule)
// TSK-0080 (HH-OFF-05, HH-OFF-06): the sync queue (sync.ts).
//   POST /staff/field-events                           one event a phone saved, ingested once per client UUID and
//                                                      decided again (schedule.view_my_day: anyone with a My Day)
//   GET  /staff/field-events/:clientId                 one event as received (visit.correct_timestamps: the Owner)
//   POST /staff/field-events/:clientId/review          the Owner's review of an event not applied, once
// TSK-0115 (HH-OFF-08): the offline actions beyond the minimal set (offline-actions.ts).
//   GET  /staff/settings/offline-actions               what the Owner turned on (policy_values.change: the Owner)
//   PUT  /staff/settings/offline-actions               the Owner turns actions on or off (fresh sign-in, a reason)
// - A tap is decided by the policy (ROLE-MATRIX "Tap On my way, Arrived, Finished": Owner and Worker A, assigned to
//   this visit until the end of its service day) and again inside its transaction from the visit's records (taps.ts).
//   A worker assigned to someone else's visit, or reassigned away, is refused.
// - Nothing here starts work or touches the Start Work gate, a hold or stop-work rights (RULE-SAFETY-GATES); nothing
//   computes an ETA, a location or pay.
import type { Tx } from '@handyhub/db'
import type { OfflineAction } from '@handyhub/domain'
import type { FieldTap } from '@handyhub/domain'
import type { StaffActor } from '@handyhub/policy'
import { sql } from 'kysely'
import { ApiError } from '../../api/errors.js'
import type { ApiContext, ApiModule, RouteDef } from '../../api/route.js'
import { recordPolicyVersion } from '../../platform/config/index.js'
import { FRESH_AUTH_MINUTES } from '../identity/sessions.js'
import { holdsAction } from '../visits/changes.js'
import { myDayItems, onMyWayRule } from './my-day.js'
import {
  CORRECTION_BODY,
  EXPORT_BODY,
  EXPORT_FILE,
  FIELD_EVENT_BODY,
  FIELD_EVENT_PARAMS,
  FIELD_EVENT_RESULT,
  FIELD_EVENT_REVIEW_BODY,
  FIELD_EVENT_VIEW,
  FOLLOW_UP_BODY,
  MY_DAY,
  OFFLINE_ACTIONS_BODY,
  OFFLINE_ACTIONS_SETTING,
  OUTCOME_BODY,
  OUTCOME_PARAMS,
  OUTCOME_RESULT,
  OUTCOME_VIEW,
  TAP_BODY,
  TAP_RESULT,
  VISIT_PARAMS,
  VISIT_TIMES,
} from './schemas.js'
import { offlineActionsSetting } from './offline-actions.js'
import { followUpVisitOutcome, recordVisitOutcome, visitOutcomeView } from './outcomes.js'
import { fieldEventView, ingestFieldEvent, reviewFieldEvent, type FieldEventInput } from './sync.js'
import { recordTap, visitAssignments } from './taps.js'
import { correctTimestamp, timestampsCsv, visitTimes, type CorrectionInput } from './timestamps.js'

export { myDayItems, onMyWayRule } from './my-day.js'
export { onTheWayAutomation, ON_THE_WAY_NOTICE } from './notice.js'
export { ON_MY_WAY_EVENT, recordTap } from './taps.js'
export { openVisitOutcome, VISIT_OUTCOME_QUEUE_TYPE } from './outcomes.js'
export { FIELD_EVENT_QUEUE_TYPE, FIELD_EVENT_TYPES, ingestFieldEvent } from './sync.js'
export { offlineActions, offlineChecklistEvents } from './offline-actions.js'
export { csvCell, timestampsCsv, visitTimes } from './timestamps.js'

const TEST = 'test/integration/my-day.test.ts'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CSV_TYPE = 'text/csv'

/** PROPOSED: at most 30 timestamp exports per staff member per hour (no owner value). */
export const TIMESTAMP_EXPORT_RATE = { bucket: 'timestamp-export', limit: 30, windowSeconds: 3600 } as const

function staff(ctx: ApiContext): StaffActor {
  if (ctx.actor.kind !== 'staff') throw new ApiError('FORBIDDEN')
  return ctx.actor
}
const visitIdOf = (ctx: ApiContext) => (ctx.req.params as { visitId: string }).visitId

/** The record facts of a visit: its project and the workers assigned to it now (the policy's A cell). */
const visitFacts: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const { visitId } = req.params as { visitId: string }
  if (!UUID_RE.test(visitId)) return null
  const v = await db.selectFrom('work.visits').select('project_id').where('id', '=', visitId).executeTakeFirst()
  return v ? { projectId: v.project_id, assignments: await visitAssignments(db, visitId) } : null
}

const TAPS: { tap: FieldTap; path: string; operationId: string; permission: RouteDef['permission']; text: string }[] = [
  {
    tap: 'on_my_way',
    path: 'on-my-way',
    operationId: 'tapOnMyWay',
    permission: 'visit.tap_on_my_way',
    text:
      'On my way: tapped by the assigned worker when actually departing for this visit, from the configured minutes ' +
      'before the arrival window (visit.on_my_way: three hours, OWN-DEC-107; ON_MY_WAY_TOO_EARLY before it, ' +
      'NOT_CONFIGURED while unset). Time alone never records it. The first accepted tap moves the visit to en_route ' +
      'and writes the visit.on_my_way event: after commit the customer gets the automatic on-the-way notice once, ' +
      "with the assigned workers' first names and the confirmed arrival window, never an ETA or tracking (wording " +
      "NOT CONFIGURED: the delivery is recorded as not configured, never as sent). A teammate's later tap records " +
      'only their own departure. ALREADY_ARRIVED once the visit or the caller arrived.',
  },
  {
    tap: 'arrived',
    path: 'arrived',
    operationId: 'tapArrived',
    permission: 'visit.tap_arrived',
    text:
      "Arrived: the assigned worker's own timestamp (server time; one per worker). The first moves the visit to " +
      'arrived. PROPOSED: refused before anyone tapped On my way (ON_MY_WAY_FIRST). Arrived never starts work and ' +
      'never passes the Start Work gate.',
  },
  {
    tap: 'finished',
    path: 'finished',
    operationId: 'tapFinished',
    permission: 'visit.tap_finished',
    text:
      "Finished: the assigned worker's own timestamp, after their own Arrived (ARRIVED_FIRST). PROPOSED: the visit " +
      'is completed when every assigned worker has a Finished value. No pay, overtime or deduction is computed.',
  },
]

export function fieldModule(): ApiModule {
  const myDay: RouteDef = {
    method: 'GET',
    path: '/staff/my/day',
    operationId: 'getMyDay',
    summary: "The caller's My Day",
    description:
      "Staff with schedule.view_my_day: only the caller's own active reservations (a worker's own assignments; a " +
      "tentative hold shows no address and no actions). Lists the visits of today in each visit's zone, and any " +
      'visit still on the way or arrived, in arrival-window order: the window, the address and a plain directions ' +
      "link (confirmed and live, on the visit's own local service day only, OWN-DEC-171), the access notes (never a " +
      'code), the preparation, the readiness ' +
      'blockers the records show (blocking holds, a deposit not yet covered, a work package without an SOP, a packet ' +
      "not viewed or changed since, the caller's own packet acknowledgment missing or ended, a loadout task block, " +
      'required loadout items not confirmed or a loadout NOT CONFIGURED; this is not the Start Work check and never ' +
      "refuses a tap), the caller's own taps and the one next action. No ETA anywhere.",
    actors: ['staff'],
    permission: 'schedule.view_my_day',
    kind: 'read',
    idempotency: 'none',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'none',
    pagination: false,
    test: TEST,
    schema: { response: { 200: MY_DAY } },
    handler: async (ctx) => {
      const actor = staff(ctx)
      const minutes = await onMyWayRule(ctx.db)
      return {
        body: {
          checkedAt: new Date().toISOString(),
          onMyWay:
            minutes === null
              ? { state: 'not_configured', earliestMinutesBefore: null }
              : { state: 'configured', earliestMinutesBefore: minutes },
          visits: await myDayItems(ctx.db, actor),
        },
        headers: { 'cache-control': 'no-store' },
      }
    },
  }

  const taps: RouteDef[] = TAPS.map((d) => ({
    method: 'POST',
    path: `/staff/visits/:visitId/${d.path}`,
    operationId: d.operationId,
    summary: `Record ${d.tap === 'on_my_way' ? 'On my way' : d.tap === 'arrived' ? 'Arrived' : 'Finished'}`,
    description:
      `${d.text} Only a worker assigned to this visit (an active confirmed reservation, until the end of its ` +
      'service day; the Owner too when assigned); anyone else is refused. A canceled, expired, no-access or ' +
      'tentative visit refuses every tap (VISIT_NOT_ACTIVE). A repeated tap records nothing more (recorded: false). ' +
      "The device's clock may be sent as deviceRecordedAt; it is kept beside the server's time, never instead of it. " +
      "Returns the visit as the caller's My Day shows it.",
    actors: ['staff'],
    permission: d.permission,
    kind: 'write',
    idempotency: 'required',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: `visit.tap_${d.tap}`,
    pagination: false,
    test: TEST,
    resource: visitFacts,
    schema: { params: VISIT_PARAMS, body: TAP_BODY, response: { 200: TAP_RESULT } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const actor = staff(ctx)
      const body = (ctx.req.body ?? {}) as { deviceRecordedAt?: string }
      const out = await recordTap(tx, actor, visitIdOf(ctx), d.tap, body)
      await ctx.audit({
        target: { type: 'visit', id: out.visitId, version: out.version },
        summary: { projectId: out.projectId, recorded: out.recorded, from: out.fromState, to: out.toState },
      })
      const [visit] = await myDayItems(tx, actor, { visitId: out.visitId })
      if (!visit) throw new ApiError('NOT_FOUND')
      return { body: { recorded: out.recorded, visit }, version: out.version }
    },
  }))

  const times: RouteDef = {
    method: 'GET',
    path: '/staff/visits/:visitId/timestamps',
    operationId: 'getVisitTimestamps',
    summary: "Each worker's Arrived and Finished on a visit",
    description:
      'Staff with visit.correct_timestamps (the Owner). Every worker assigned to the visit, and anyone who recorded ' +
      'a value there, with their On my way, Arrived and Finished: each recorded (server time, and the device time ' +
      'when sent), corrected (the value in force, the recorded value kept, and every correction with its reason, ' +
      'who and when), not due yet, or missing (flagged, never invented), and the whole minutes from Arrived to ' +
      'Finished only when both exist. No pay, overtime or deduction is computed.',
    actors: ['staff'],
    permission: 'visit.correct_timestamps',
    kind: 'read',
    idempotency: 'none',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'none',
    pagination: false,
    test: TEST,
    resource: visitFacts,
    schema: { params: VISIT_PARAMS, response: { 200: VISIT_TIMES } },
    handler: async (ctx) => {
      const actor = staff(ctx)
      return {
        body: await visitTimes(ctx.db, visitIdOf(ctx), {
          correct: holdsAction(actor, 'visit.correct_timestamps'),
          export: holdsAction(actor, 'export.accounting'),
        }),
      }
    },
  }

  const correct: RouteDef = {
    method: 'POST',
    path: '/staff/visits/:visitId/timestamps/corrections',
    operationId: 'correctVisitTimestamp',
    summary: "Correct a worker's Arrived or Finished",
    description:
      'Staff with visit.correct_timestamps (the Owner), on a visit that went on the way (VISIT_NOT_STARTED before). ' +
      "Sets one worker's Arrived or Finished (a forgotten or wrong value) with a required reason; the recorded tap " +
      'and every earlier value stay kept. Refused in the future (IN_FUTURE), with Finished before Arrived ' +
      '(FINISHED_BEFORE_ARRIVED), unchanged (UNCHANGED), or for someone who is not a worker of the visit. PROPOSED: ' +
      "supplying the last missing Finished of an arrived visit completes it. Returns the visit's times.",
    actors: ['staff'],
    permission: 'visit.correct_timestamps',
    kind: 'write',
    idempotency: 'required',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'visit.correct_timestamp',
    pagination: false,
    test: TEST,
    resource: visitFacts,
    schema: { params: VISIT_PARAMS, body: CORRECTION_BODY, response: { 200: VISIT_TIMES } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const actor = staff(ctx)
      const body = ctx.req.body as CorrectionInput
      const out = await correctTimestamp(tx, actor, visitIdOf(ctx), body)
      await ctx.audit({
        target: { type: 'visit', id: visitIdOf(ctx), version: out.visitVersion },
        summary: {
          projectId: out.projectId,
          staffUserId: body.staffUserId,
          kind: body.kind,
          previousAt: out.previousAt ? out.previousAt.toISOString() : null,
          correctedAt: out.correctedAt.toISOString(),
          completedVisit: out.completed,
        },
        reason: out.reason,
      })
      return {
        body: await visitTimes(tx, visitIdOf(ctx), {
          correct: holdsAction(actor, 'visit.correct_timestamps'),
          export: holdsAction(actor, 'export.accounting'),
        }),
        version: out.visitVersion,
      }
    },
  }

  const exportCsv: RouteDef = {
    method: 'POST',
    path: '/staff/timestamps/exports',
    operationId: 'exportVisitTimestamps',
    summary: 'Arrived and Finished times for the accountant (CSV)',
    description:
      'Staff with export.accounting (the Owner, with a fresh sign-in and a reason). One row per worker of every visit ' +
      'that went on the way with a date (in its own zone) from `from` to `to` (at most 366 days, PROPOSED): the ' +
      'visit date and zone, project reference, visit number and purpose, the worker, Arrived and Finished (local and ' +
      'UTC, with recorded, corrected, pending or missing), the whole minutes between them when both exist, and ' +
      'whether a value was corrected. Times only: no pay, rate, overtime or deduction (payroll stays outside the ' +
      'software). The export is audited with its range, row count and reason; the CSV text is answered for the ' +
      'staff app to save as a file. PROPOSED limit: 30 per staff member per hour.',
    actors: ['staff'],
    permission: 'export.accounting',
    kind: 'write',
    idempotency: 'none',
    expectedVersion: 'none',
    rateLimit: TIMESTAMP_EXPORT_RATE,
    audit: 'visit.export_timestamps',
    pagination: false,
    test: TEST,
    schema: { body: EXPORT_BODY, response: { 200: EXPORT_FILE } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const body = ctx.req.body as { from: string; to: string; reason: string }
      const out = await timestampsCsv(tx, body)
      await ctx.audit({
        target: { type: 'visit_timestamps', id: `${body.from}..${body.to}` },
        summary: { from: body.from, to: body.to, rows: out.rows, visits: out.visits },
        reason: body.reason.trim(),
      })
      return {
        body: {
          filename: `arrived-finished-${body.from}-to-${body.to}.csv`,
          contentType: CSV_TYPE,
          rows: out.rows,
          csv: out.csv,
        },
        headers: { 'cache-control': 'no-store' },
      }
    },
  }

  // TSK-0078 (HH-SCH-09): visit outcomes. Recording one is the "Tap On my way, Arrived, Finished" row of the matrix
  // (the assigned worker, the Owner), PROPOSED: the matrix names no separate outcome action.
  const outcomeFacts: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
    const { outcomeId } = req.params as { outcomeId: string }
    if (!UUID_RE.test(outcomeId)) return null
    const o = await db
      .selectFrom('work.visit_outcomes')
      .select('project_id')
      .where('id', '=', outcomeId)
      .executeTakeFirst()
    return o ? { projectId: o.project_id } : null
  }
  const recordOutcome: RouteDef = {
    method: 'POST',
    path: '/staff/visits/:visitId/outcomes',
    operationId: 'recordVisitOutcome',
    summary: 'Record a visit outcome',
    description:
      'A worker assigned to the visit (visit.tap_arrived: the assigned worker, the Owner; PROPOSED mapping) records ' +
      'one explicit outcome with a note (HH-SCH-09): delay, no_access, customer_absent, weather, missing_resources or ' +
      'readiness_issue, while the visit is confirmed, on the way or arrived (VISIT_NOT_OPEN otherwise). In one ' +
      'transaction: the outcome and the staff follow-up item visit_outcome (today_change on the visit date; assigned ' +
      'to the request’s responsible staff member when there is one). Only no_access changes the visit: to no_access ' +
      '(final: its reservations end and its waiting reminders stop), refused once work started (WORK_STARTED). No ' +
      'outcome completes a visit or marks work done; customer_absent never starts work (Start Work still needs the ' +
      'customer present or the Owner-approved exception). The customer sees only "Update pending" until staff follow ' +
      'up; nothing is sent and no arrival time is ever made up. Returns the visit as My Day shows it, or null once it ' +
      'left My Day.',
    actors: ['staff'],
    permission: 'visit.tap_arrived',
    kind: 'write',
    idempotency: 'required',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'visit.record_outcome',
    pagination: false,
    test: 'test/integration/visit-outcomes.test.ts',
    resource: visitFacts,
    schema: { params: VISIT_PARAMS, body: OUTCOME_BODY, response: { 201: OUTCOME_RESULT } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const actor = staff(ctx)
      const body = ctx.req.body as { kind: Parameters<typeof recordVisitOutcome>[3]['kind']; note: string }
      const out = await recordVisitOutcome(tx, actor, visitIdOf(ctx), body)
      // The worker's note stays in the record (staff only); the audit keeps what happened.
      await ctx.audit({
        target: { type: 'visit', id: out.visitId },
        summary: { outcomeId: out.outcomeId, kind: out.kind, visitState: out.visitState, queueItemId: out.queueItemId },
      })
      const [visit] = await myDayItems(tx, actor, { visitId: out.visitId })
      return {
        status: 201,
        body: {
          outcomeId: out.outcomeId,
          visitId: out.visitId,
          kind: out.kind,
          visitState: out.visitState,
          recordedAt: out.recordedAt.toISOString(),
          visit: visit ?? null,
        },
      }
    },
  }
  const outcome: RouteDef = {
    method: 'GET',
    path: '/staff/visit-outcomes/:outcomeId',
    operationId: 'getVisitOutcome',
    summary: 'One visit outcome and its follow-up',
    description:
      'Staff with visit.reschedule (the Owner, Office): the outcome a worker recorded (kind, note, who and when, the ' +
      'visit’s state then and now) and the follow-up once recorded. The queue item visit_outcome links here.',
    actors: ['staff'],
    permission: 'visit.reschedule',
    kind: 'read',
    idempotency: 'none',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'none',
    pagination: false,
    test: 'test/integration/visit-outcomes.test.ts',
    resource: outcomeFacts,
    schema: { params: OUTCOME_PARAMS, response: { 200: OUTCOME_VIEW } },
    handler: async (ctx) => {
      const { outcomeId } = ctx.req.params as { outcomeId: string }
      const v = await visitOutcomeView(ctx.db, outcomeId)
      if (!v) throw new ApiError('NOT_FOUND')
      return { body: { ...v, actions: { followUp: v.followUp === null } }, headers: { 'cache-control': 'no-store' } }
    },
  }
  const followUp: RouteDef = {
    method: 'POST',
    path: '/staff/visit-outcomes/:outcomeId/follow-up',
    operationId: 'followUpVisitOutcome',
    summary: 'Record the follow-up of a visit outcome',
    description:
      'Staff with visit.reschedule (the Owner, Office) record what was done about the outcome (rescheduled, ' +
      'cancelled, the customer contacted), once (ALREADY_FOLLOWED_UP); this resolves its queue item and the ' +
      'customer’s "Update pending". Rescheduling or cancelling the visit itself stays the visit routes’.',
    actors: ['staff'],
    permission: 'visit.reschedule',
    kind: 'write',
    idempotency: 'required',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'visit.follow_up_outcome',
    pagination: false,
    test: 'test/integration/visit-outcomes.test.ts',
    resource: outcomeFacts,
    schema: { params: OUTCOME_PARAMS, body: FOLLOW_UP_BODY, response: { 200: OUTCOME_VIEW } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const { outcomeId } = ctx.req.params as { outcomeId: string }
      const out = await followUpVisitOutcome(tx, staff(ctx), outcomeId, ctx.req.body as { note: string })
      await ctx.audit({ target: { type: 'visit', id: out.visitId }, summary: { outcomeId } })
      const v = await visitOutcomeView(tx, outcomeId)
      if (!v) throw new ApiError('NOT_FOUND')
      return { body: { ...v, actions: { followUp: false } } }
    },
  }

  // TSK-0080 (HH-OFF-05, HH-OFF-06, T27, T51): the sync queue.
  const SYNC_TEST = 'test/integration/field-sync.test.ts'
  const fieldEventFacts: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
    const { clientId } = req.params as { clientId: string }
    if (!UUID_RE.test(clientId)) return null
    const e = await db
      .selectFrom('work.field_events')
      .select('project_id')
      .where('client_id', '=', clientId)
      .executeTakeFirst()
    return e ? { projectId: e.project_id } : null
  }
  const syncEvent: RouteDef = {
    method: 'POST',
    path: '/staff/field-events',
    operationId: 'syncFieldEvent',
    summary: 'Upload one field event a phone saved',
    description:
      'Staff with a My Day (schedule.view_my_day) upload one event their phone saved (today On my way, Arrived or ' +
      "Finished), with the UUID the phone generated (clientId), the phone's own time and the attempt number (one " +
      'Idempotency-Key per attempt). The UUID is the key: an event resent any number of times is ingested once and answers as it did the ' +
      'first time (ingested: false); the same UUID for a different event is refused (CLIENT_ID_REUSED). Each event is ' +
      'decided again: the worker must have been assigned to the visit when the phone recorded it and still be ' +
      "assigned now, else it is kept for the Owner's review and never applied (not_assigned). It is then applied " +
      "as an online tap would be (applied, or already_recorded), the phone's time kept beside the server's; one the " +
      "visit's newer state refuses is kept for review, never applied over it (conflict, with the refusal code). The " +
      "Owner may upload the events another account's phone holds (actorId): kept for review only (recovered). Each " +
      "event in review opens the Owner's queue item field_event_review. TSK-0115: a checklist_step event (with " +
      'step: the work package, step, event start/pause/resume/complete, the version the phone saw and the evidence) ' +
      'is taken only while the Owner has turned it on (field.offline_actions; OFFLINE_ACTION_NOT_ENABLED otherwise, ' +
      'nothing kept), then decided as above with job.record_checklist_step and applied through the checklist ' +
      "route's own checks (the worker's own Start Work, no open hold, the step's version); what they refuse now is " +
      'kept for review with the refusal code, never applied.',
    actors: ['staff'],
    permission: 'schedule.view_my_day',
    kind: 'write',
    idempotency: 'required',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'field_event.sync',
    pagination: false,
    test: SYNC_TEST,
    schema: { body: FIELD_EVENT_BODY, response: { 200: FIELD_EVENT_RESULT } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const out = await ingestFieldEvent(tx, staff(ctx), ctx.req.body as FieldEventInput)
      // A resent event is audited too (ingested: false); it recorded nothing.
      await ctx.audit({
        target: { type: 'visit', id: out.visitId, ...(out.visitVersion !== null ? { version: out.visitVersion } : {}) },
        summary: {
          projectId: out.projectId,
          clientId: out.clientId,
          type: (ctx.req.body as FieldEventInput).type,
          state: out.state,
          outcome: out.outcome,
          detail: out.detail,
          ingested: out.ingested,
          // TSK-0115: identifiers only; no note or measurement enters the audit summary.
          ...((b) =>
            b.step ? { workPackageId: b.step.workPackageId, stepId: b.step.stepId, event: b.step.event } : {})(
            ctx.req.body as FieldEventInput,
          ),
        },
      })
      return {
        body: {
          clientId: out.clientId,
          state: out.state,
          outcome: out.outcome,
          detail: out.detail,
          visitId: out.visitId,
          receivedAt: out.receivedAt,
          ingested: out.ingested,
        },
      }
    },
  }
  const fieldEvent: RouteDef = {
    method: 'GET',
    path: '/staff/field-events/:clientId',
    operationId: 'getFieldEvent',
    summary: 'One field event as received',
    description:
      'Staff with visit.correct_timestamps (the Owner): one event a phone uploaded, who recorded and who uploaded ' +
      "it, the phone's time and the server's, what the server did (applied, already recorded, a conflict and its " +
      'code, not assigned, recovered) and the review once recorded. The queue item field_event_review links here.',
    actors: ['staff'],
    permission: 'visit.correct_timestamps',
    kind: 'read',
    idempotency: 'none',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'none',
    pagination: false,
    test: SYNC_TEST,
    resource: fieldEventFacts,
    schema: { params: FIELD_EVENT_PARAMS, response: { 200: FIELD_EVENT_VIEW } },
    handler: async (ctx) => {
      const { clientId } = ctx.req.params as { clientId: string }
      const v = await fieldEventView(ctx.db, clientId)
      if (!v) throw new ApiError('NOT_FOUND')
      return {
        body: { ...v, actions: { review: v.state === 'needs_review' } },
        headers: { 'cache-control': 'no-store' },
      }
    },
  }
  const review: RouteDef = {
    method: 'POST',
    path: '/staff/field-events/:clientId/review',
    operationId: 'reviewFieldEvent',
    summary: 'Record the review of a field event not applied',
    description:
      'Staff with visit.correct_timestamps (the Owner) record what was done about an event in review (a timestamp ' +
      'corrected through the correction route, the worker asked, nothing to apply), once (ALREADY_REVIEWED; ' +
      'NOT_IN_REVIEW for a synchronized event). The event itself stays as received and is never applied by this.',
    actors: ['staff'],
    permission: 'visit.correct_timestamps',
    kind: 'write',
    idempotency: 'required',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'field_event.review',
    pagination: false,
    test: SYNC_TEST,
    resource: fieldEventFacts,
    schema: { params: FIELD_EVENT_PARAMS, body: FIELD_EVENT_REVIEW_BODY, response: { 200: FIELD_EVENT_VIEW } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const { clientId } = ctx.req.params as { clientId: string }
      const out = await reviewFieldEvent(tx, staff(ctx), clientId, ctx.req.body as { note: string })
      await ctx.audit({ target: { type: 'field_event', id: clientId }, summary: { projectId: out.projectId } })
      const v = await fieldEventView(tx, clientId)
      if (!v) throw new ApiError('NOT_FOUND')
      return { body: { ...v, actions: { review: false } } }
    },
  }

  // TSK-0115 (HH-OFF-08): the offline actions beyond the minimal set, the Owner's switch.
  const OFFLINE_TEST = 'test/integration/checklist.test.ts'
  const offlineSetting: RouteDef = {
    method: 'GET',
    path: '/staff/settings/offline-actions',
    operationId: 'getOfflineActions',
    summary: 'The offline actions turned on',
    description:
      'The Owner (visit.correct_timestamps: the role that reviews what phones upload). The actions a phone may save ' +
      'offline beyond the minimal set (On my way, Arrived, Finished, Stop Work): field.offline_actions, its version, ' +
      'what it turns on, the actions available (PROPOSED: checklist_step) and the reason of the last change. Nothing ' +
      'is on until the Owner turns it on after walking the offline controls on staging (HH-OFF-08). ETag: the ' +
      'configuration version.',
    actors: ['staff'],
    permission: 'visit.correct_timestamps',
    kind: 'read',
    idempotency: 'none',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'none',
    pagination: false,
    test: OFFLINE_TEST,
    schema: { response: { 200: OFFLINE_ACTIONS_SETTING } },
    handler: async (ctx) => {
      const body = await offlineActionsSetting(ctx.db)
      return { body, version: body.version, headers: { 'cache-control': 'no-store' } }
    },
  }
  const setOfflineActions: RouteDef = {
    method: 'PUT',
    path: '/staff/settings/offline-actions',
    operationId: 'setOfflineActions',
    summary: 'Turn offline actions on or off (Owner only)',
    description:
      `The Owner only (policy_values.change: a fresh sign-in within ${FRESH_AUTH_MINUTES} minutes and a written ` +
      'reason), with If-Match: the configuration version shown. Records the next version of field.offline_actions ' +
      'with the actions listed (an empty list turns every one off). Turning one on says the offline controls were ' +
      'proven on staging (HH-OFF-08); it never moves Start Work, a hold, an approval or a payment offline. The ' +
      'database accepts the change only from a live Owner with a reason. Audited with the old and new list.',
    actors: ['staff'],
    permission: 'policy_values.change',
    freshAuthMinutes: FRESH_AUTH_MINUTES,
    kind: 'write',
    idempotency: 'required',
    expectedVersion: 'required',
    rateLimit: 'none',
    audit: 'field_event.offline_actions_change',
    pagination: false,
    test: OFFLINE_TEST,
    schema: { body: OFFLINE_ACTIONS_BODY, response: { 200: OFFLINE_ACTIONS_SETTING } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const actor = staff(ctx)
      const { actions, reason } = ctx.req.body as { actions: OfflineAction[]; reason: string }
      // The same lock recordPolicyVersion takes, so the version compared is the one superseded.
      await sql`SELECT pg_advisory_xact_lock(hashtext(${'policy_version:field.offline_actions'}))`.execute(tx)
      const before = await offlineActionsSetting(tx)
      if (ctx.expectedVersion() !== before.version)
        throw new ApiError('STALE_VERSION', { current: { version: before.version } })
      const version = await recordPolicyVersion(tx, {
        key: 'field.offline_actions',
        value: { actions: before.available.filter((a) => actions.includes(a)) },
        sourceIds: ['HH-OFF-08', 'OWN-DEC-121', 'OQ-OFFLINE-ACTIONS-DETAILS'],
        changedBy: actor.userId,
        reason: reason.trim(),
      })
      await ctx.audit({
        target: { type: 'policy_version', id: 'field.offline_actions', version },
        summary: { from: before.actions, to: actions, previousVersion: before.version },
        reason: reason.trim(),
        stepUpUsed: true,
      })
      return { body: await offlineActionsSetting(tx), version }
    },
  }

  return {
    name: 'field',
    routes: [
      myDay,
      ...taps,
      times,
      correct,
      exportCsv,
      recordOutcome,
      outcome,
      followUp,
      syncEvent,
      fieldEvent,
      review,
      offlineSetting,
      setOfflineActions,
    ],
  }
}
