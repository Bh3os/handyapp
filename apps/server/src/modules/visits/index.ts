// Visits module (TSK-0061; HH-SCH-01, HH-SCH-02, HH-DATA-06, T09, T37, T41, ENT-Visit, RULE-SERVER-AUTHZ).
//   GET  /staff/projects/:projectId/visits     the project's visits, its job and scheduling task (schedule.view_board)
//   POST /staff/projects/:projectId/visits     plan a tentative visit (visit.offer_windows; an Estimator: estimate
//                                              visits only)
//   POST /staff/visits/:visitId/window         change a visit's window as its next window version (If-Match); for a
//                                              confirmed visit (visit.reschedule) its reservations move with it
//   POST /staff/visits/:visitId/confirm        confirm a tentative visit, reserving every worker and item it needs
//                                              (visit.confirm, If-Match; TSK-0062)
//   POST /staff/visits/:visitId/offers         offer windows of a tentative visit to the customer, each held for the
//                                              visit's team until the offer expires (visit.offer_windows, If-Match;
//                                              TSK-0063)
//   POST /staff/window-offers/:offerId/withdraw  withdraw an open offer, releasing its holds (visit.offer_windows,
//                                              If-Match; TSK-0063)
//   POST /staff/window-offers/:offerId/publish   publish a draft offer: its holds and its 24 hours start now; over an
//                                              open offer, a replacement with a reason (visit.offer_windows, If-Match;
//                                              TSK-0145)
//   POST /staff/window-offers/:offerId/discard   discard a draft that was never published (visit.offer_windows,
//                                              If-Match; TSK-0145)
//   POST /staff/visits/:visitId/inspection-authorization  the Owner authorizes a hazard-evaluation inspection while an
//                                              intake hold stays open (visit.authorize_inspection, If-Match; TSK-0145)
//   POST /staff/visits/:visitId/follow-up-authorization   the recorded basis of a follow-up visit on a completed job
//                                              (visit.authorize_follow_up, If-Match; TSK-0145)
//   GET  /staff/schedule                       the scheduling board: a day or a week by worker, with every visit of
//                                              the range (schedule.view_board; TSK-0065)
//   POST /staff/visits/:visitId/reassign       reassign a confirmed visit to another team, same window (visit.reassign,
//                                              If-Match; TSK-0066)
//   POST /staff/visits/:visitId/cancel         cancel a confirmed visit with its FACT-CANCELLATION-RULES outcome
//                                              (visit.cancel; a work visit: the Owner; If-Match; TSK-0066)
//   POST /staff/visit-change-requests/:requestId/decline  decline a customer's reschedule or cancellation request
//                                              (visit.reschedule or the cancel rule; If-Match; TSK-0066)
//   GET  /staff/visits/:visitId/reminders      the visit's automatic appointment reminders (schedule.view_board;
//                                              TSK-0067, TSK-0121, reminder-routes.ts)
//   POST /staff/projects/:projectId/site-contact, /coverage-acceptance, /coverage-exception  the first-visit site
//                                              checks (visit.confirm; the exception: the Owner; TSK-0126,
//                                              site-check-routes.ts)
//   GET  /staff/visits/:visitId/worker-access  the assigned workers' visit-day access and the Owner's extensions, with
//        POST .../worker-access/extensions and POST /staff/visit-access-extensions/:extensionId/end
//                                              (TSK-0128, worker-access.ts)
//   GET  /staff/visits/:visitId/preparation-default, GET /staff/preparation-defaults and
//        POST /staff/services/:serviceId/preparation-defaults  the Owner-approved default preparation instructions
//                                              offers start from (TSK-0146, preparation-routes.ts)
// Every write takes an idempotency key and records its audit event with the local window, zone, offsets and instants.
// The customer's side of an offer (select a window, ask for other times) is the portal module's (portal/appointments.ts).
import type { Tx } from '@handyhub/db'
import { ApiError } from '../../api/errors.js'
import type { ApiContext, ApiModule, RouteDef } from '../../api/route.js'
import { scheduleBoard, type BoardQuery } from './board.js'
import {
  cancelVisit,
  declineRequest,
  reassignVisit,
  type CancelInput,
  type ReassignInput,
  type RescheduleMeta,
} from './changes.js'
import { authorizeFollowUp, authorizeInspection, type FollowUpInput, type InspectionInput } from './authorizations.js'
import { WORK_VISIT_GATES, type WorkVisitGate } from './gates.js'
import {
  discardOfferDraft,
  offerWindows,
  publishOffer,
  windowOfferExpiryAutomation,
  withdrawOffer,
  type OfferInput,
  type OfferResult,
} from './offers.js'
import { preparationRoutes } from './preparation-routes.js'
import { appointmentReminderRoutes } from './reminder-routes.js'
import { siteCheckRoutes } from './site-check-routes.js'
import { workerAccessRoutes } from './worker-access.js'
import {
  BOARD_QUERY,
  CANCEL_BODY,
  CONFIRM_BODY,
  DECLINE_BODY,
  DISCARD_BODY,
  FOLLOW_UP_BODY,
  INSPECTION_BODY,
  NEW_VISIT_BODY,
  OFFER_BODY,
  OFFER_PARAMS,
  PROJECT_PARAMS,
  PROJECT_VISITS,
  PUBLISH_BODY,
  REASSIGN_BODY,
  REQUEST_PARAMS,
  SCHEDULE_BOARD,
  VISIT_PARAMS,
  WINDOW_BODY,
  WITHDRAW_BODY,
} from './schemas.js'
import {
  changeWindow,
  confirmVisit,
  planVisit,
  projectVisits,
  windowSummary,
  type ConfirmInput,
  type NewVisit,
  type WindowEntry,
} from './visits.js'

const TEST = 'test/integration/visits.test.ts'
const CAPACITY_TEST = 'test/integration/capacity.test.ts'
const OFFERS_TEST = 'test/integration/window-offers.test.ts'
const BOARD_TEST = 'test/integration/schedule-board.test.ts'
const CHANGES_TEST = 'test/integration/visit-changes.test.ts'
const AMENDMENTS_TEST = 'test/integration/visit-amendments.test.ts'

export type VisitsDeps = {
  /** The gates every work-visit window passes (WORK_VISIT_GATES); tests may add their own. */
  workVisitGates?: readonly WorkVisitGate[]
}

const staffActor = (ctx: ApiContext) => {
  if (ctx.actor.kind !== 'staff') throw new ApiError('FORBIDDEN')
  return ctx.actor
}

const projectOf: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const { projectId } = req.params as { projectId: string }
  const p = await db.selectFrom('crm.projects').select('id').where('id', '=', projectId).executeTakeFirst()
  return p ? { projectId: p.id } : null
}

const visitProjectOf: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const { visitId } = req.params as { visitId: string }
  const v = await db.selectFrom('work.visits').select('project_id').where('id', '=', visitId).executeTakeFirst()
  return v ? { projectId: v.project_id } : null
}

const requestProjectOf: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const { requestId } = req.params as { requestId: string }
  const r = await db
    .selectFrom('work.visit_change_requests')
    .select('project_id')
    .where('id', '=', requestId)
    .executeTakeFirst()
  return r ? { projectId: r.project_id } : null
}

const offerProjectOf: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const { offerId } = req.params as { offerId: string }
  const o = await db.selectFrom('work.window_offers').select('project_id').where('id', '=', offerId).executeTakeFirst()
  return o ? { projectId: o.project_id } : null
}

/** The audit summary of a saved or published offer (local windows, team, the hold and its exact end). */
function offerSummary(out: OfferResult) {
  return {
    projectId: out.projectId,
    visitId: out.visitId,
    purpose: out.purpose,
    state: out.state,
    number: out.number,
    windows: out.windows.map(windowSummary),
    workers: [...out.workerIds],
    equipment: [...out.equipmentIds],
    holdHours: out.holdHours,
    policyVersion: out.policyVersion,
    publishedAt: out.publishedAt ? out.publishedAt.toISOString() : null,
    expiresAt: out.expiresAt ? out.expiresAt.toISOString() : null,
    ...(out.replaced ? { replaced: { offerId: out.replaced.offerId, number: out.replaced.number } } : {}),
  }
}

export function visitsModule(deps: VisitsDeps = {}): ApiModule {
  const gates = deps.workVisitGates ?? WORK_VISIT_GATES
  const expiry = windowOfferExpiryAutomation()

  const list: RouteDef = {
    method: 'GET',
    path: '/staff/projects/:projectId/visits',
    operationId: 'listProjectVisits',
    summary: "A project's visits",
    description:
      'Staff with schedule.view_board (Owner, Office; Estimator PROPOSED). The visits of one project (estimate visits ' +
      "and the job's work visits), each with its purpose, state, version, current window (local date, arrival " +
      'window, IANA zone, UTC offsets and instants, and whether it lies inside the daily visit hours of contact.hours ' +
      'in the business zone; null while NOT CONFIGURED) and every earlier window version. Beside them, kept apart, ' +
      "the project's job with its scope version and its scheduling task (never a booking), the property's zone, the " +
      'business zone with its PROPOSED mark, and what the caller may plan now. Each tentative visit lists its ' +
      'confirmationBlockers (TSK-0064): every unmet confirmation precondition and missing visit fact, as field and ' +
      "code; Confirm is offered only when the list is empty (the team's capacity is checked on confirming). A timing " +
      'preference on the request is never listed here. siteChecks (TSK-0126, OWN-DEC-167): the three site checks a ' +
      'confirmation needs, each with what it rests on: the current address with its pre-validation problems and its ' +
      'address-and-county check; the site contact with its authority and the customer’s contact to prefill it; the ' +
      'coverage outcome of the verified county (SERVED or OUTSIDE) with its acceptance or the Owner’s exception; and ' +
      'which of them the caller may record.',
    actors: ['staff'],
    permission: 'schedule.view_board',
    kind: 'read',
    idempotency: 'none',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'none',
    pagination: false,
    test: TEST,
    resource: projectOf,
    schema: { params: PROJECT_PARAMS, response: { 200: PROJECT_VISITS } },
    handler: async (ctx) => {
      const { projectId } = ctx.req.params as { projectId: string }
      return { body: await projectVisits(ctx.db, staffActor(ctx), ctx.scope, projectId, gates) }
    },
  }

  const plan: RouteDef = {
    method: 'POST',
    path: '/staff/projects/:projectId/visits',
    operationId: 'planVisit',
    summary: 'Plan a tentative visit',
    description:
      'Staff with visit.offer_windows: Owner and Office any purpose; an Estimator estimate visits only (PROPOSED). ' +
      'Creates one tentative visit: an Estimate visit (site_estimate) on an open project, with no job and no price ' +
      "approval, or a work visit (service, follow_up, return_work) on the project's job, which exists only after " +
      "approval, after the job's scheduling gates pass. The window is a local date and arrival window in the " +
      "property's IANA zone; a time inside a spring-forward gap is refused (LOCAL_TIME_GAP), a time inside a repeated " +
      'hour needs its offset (LOCAL_TIME_REPEATED, then startOffset or endOffset such as "-05:00") and is stored ' +
      'with it, and a window must start in the future (WINDOW_IN_PAST, PROPOSED). NOT CONFIGURED while ' +
      'business.timezone is unset. PROPOSED: the first work visit moves the scheduling task to planning. Nothing is ' +
      "confirmed, reserved, shown to the customer or sent. Returns the project's visits.",
    actors: ['staff'],
    permission: 'visit.offer_windows',
    kind: 'write',
    idempotency: 'required',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'visit.plan',
    pagination: false,
    test: TEST,
    resource: projectOf,
    schema: { params: PROJECT_PARAMS, body: NEW_VISIT_BODY, response: { 201: PROJECT_VISITS } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const actor = staffActor(ctx)
      const { projectId } = ctx.req.params as { projectId: string }
      const body = ctx.req.body as NewVisit
      const out = await planVisit(tx, actor, ctx.scope, projectId, body, { gates, now: new Date() })
      await ctx.audit({
        target: { type: 'visit', id: out.id, version: out.version },
        summary: { projectId, purpose: body.purpose, windowVersion: 1, window: windowSummary(out.window) },
      })
      return { status: 201, body: await projectVisits(tx, actor, ctx.scope, projectId, gates), version: out.version }
    },
  }

  const move: RouteDef = {
    method: 'POST',
    path: '/staff/visits/:visitId/window',
    operationId: 'changeVisitWindow',
    summary: "Change a visit's window",
    description:
      'Staff with visit.offer_windows (an Estimator: estimate visits only, PROPOSED), with If-Match: the visit ' +
      'version shown. While the visit is tentative or confirmed, sets a new window as its next window version; ' +
      'the earlier windows stay in its history. The local times are kept as entered and the instants follow the ' +
      "zone on the chosen date, so a window moved across a daylight-saving change keeps its local times. The visit's " +
      'zone does not change. Same window rules and refusals as planning; an unchanged window is refused ' +
      '(WINDOW_UNCHANGED). An optional reason is kept in the history. Moving a confirmed visit needs visit.reschedule ' +
      '(Owner, Office): its workers and items are checked and reserved for the new range in the same transaction ' +
      '(the old reservations are kept, ended "rescheduled"); a capacity conflict refuses with every problem and the ' +
      'alternatives, and the booking stays exactly as it was. A confirmed visit is moved only while every ' +
      'confirmation precondition still holds (TSK-0064: the approval, the deposit, the gates, no blocking hold), named ' +
      'with the capacity problems. TSK-0066 (HH-SCH-07): a reschedule of a confirmed visit needs a reason ' +
      '(REASON_REQUIRED) and who initiated it (TSK-0140, OWN-DEC-195 C2: required, INITIATOR_REQUIRED; initiator ' +
      'customer or handyhub, with handyhubCause weather, safety_stop, sick_worker or other; rescheduling is always ' +
      "free), or the customer reschedule request it confirms (changeRequestId, the customer's; REQUEST_NOT_FOR_VISIT, " +
      'REQUEST_<state>). It writes one change record and the committed ' +
      'appointment.change_committed event: after commit the customer gets the automatic "Appointment changed" notice ' +
      '(FACT-AUTOMATIC-MESSAGES #11) and the affected workers the staff notice, once per change (wording NOT ' +
      "CONFIGURED: each delivery is recorded as not configured, never as sent). Returns the project's visits.",
    actors: ['staff'],
    permission: 'visit.offer_windows',
    kind: 'write',
    idempotency: 'required',
    expectedVersion: 'required',
    rateLimit: 'none',
    audit: 'visit.change_window',
    pagination: false,
    test: TEST,
    resource: visitProjectOf,
    schema: { params: VISIT_PARAMS, body: WINDOW_BODY, response: { 200: PROJECT_VISITS } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const actor = staffActor(ctx)
      const { visitId } = ctx.req.params as { visitId: string }
      const body = ctx.req.body as WindowEntry & RescheduleMeta
      const out = await changeWindow(tx, actor, ctx.scope, visitId, body, {
        gates,
        now: new Date(),
        expectedVersion: ctx.expectedVersion(),
      })
      const reason = body.reason?.trim()
      await ctx.audit({
        target: { type: 'visit', id: out.id, version: out.version },
        summary: {
          projectId: out.projectId,
          purpose: out.purpose,
          windowVersion: out.windowVersion,
          from: windowSummary(out.from),
          to: windowSummary(out.to),
          ...(out.reschedule
            ? {
                changeId: out.changeId,
                initiator: out.reschedule.initiator,
                handyhubCause: out.reschedule.cause,
                changeRequestId: out.reschedule.request?.id ?? null,
              }
            : {}),
        },
        ...(reason ? { reason } : {}),
      })
      return { body: await projectVisits(tx, actor, ctx.scope, out.projectId, gates), version: out.version }
    },
  }

  const confirm: RouteDef = {
    method: 'POST',
    path: '/staff/visits/:visitId/confirm',
    operationId: 'confirmVisit',
    summary: 'Confirm a tentative visit with its workers and equipment',
    description:
      'Staff with visit.confirm (Owner, Office), with If-Match: the visit version shown. Names every worker the visit ' +
      'needs (exactly its number of workers; the first is the lead) and an equipment item for each equipment entry. ' +
      'In one transaction the server checks the visit (tentative, in the future, expected work and workers entered, the ' +
      'confirmation preconditions (TSK-0064, HH-SCH-06): for a work visit the approval (approval: NO_JOB, ' +
      "APPROVAL_NOT_ACTIVE, SCOPE_NOT_ACCEPTED), the job's deposit gate (deposit: DEPOSIT_REQUIRED, " +
      'DEPOSIT_REQUIREMENT_MISSING; never for an estimate visit) and its other scheduling gates, and for every visit no ' +
      'blocking hold on the project (holds.<id>: REVIEW_HOLD_OPEN, JOB_ON_HOLD, CRITICAL_HOLD_OPEN; the database ' +
      'refuses it too), the on-site part inside the daily visit hours of contact.hours) and ' +
      'each worker (active, PROPOSED eligible role, working hours set and covering the reserved range, no approved ' +
      'time off, no overlapping reservation or hold) and item (registered, not retired, not reserved), reserves them ' +
      'all for the reserved range (PROPOSED: travel buffer before the arrival window, preparation and expected work ' +
      'after it) and confirms the visit. The database refuses overlapping reservations, so of two concurrent ' +
      'confirmations of the same capacity exactly one succeeds; the other gets CONFLICT naming every unmet ' +
      'requirement with alternatives (other free workers and items, and free periods of that day), and nothing ' +
      'partial is written. PROPOSED: a confirmed work visit fulfils the scheduling task. NOT CONFIGURED while ' +
      'business.timezone or contact.hours is unset. A visit whose windows are offered (an open offer) is refused ' +
      '(OFFER_OPEN): the customer selects, or staff withdraw the offer first. The confirmation writes the committed ' +
      'event of the automatic confirmation notice (estimate_visit.reserved or appointment.reserved; its wording is NOT ' +
      "CONFIGURED, so the delivery is recorded as not configured, never as sent). Returns the project's visits.",
    actors: ['staff'],
    permission: 'visit.confirm',
    kind: 'write',
    idempotency: 'required',
    expectedVersion: 'required',
    rateLimit: 'none',
    audit: 'visit.confirm',
    pagination: false,
    test: CAPACITY_TEST,
    resource: visitProjectOf,
    schema: { params: VISIT_PARAMS, body: CONFIRM_BODY, response: { 200: PROJECT_VISITS } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const actor = staffActor(ctx)
      const { visitId } = ctx.req.params as { visitId: string }
      const body = ctx.req.body as ConfirmInput
      const out = await confirmVisit(tx, actor, ctx.scope, visitId, body, {
        gates,
        now: new Date(),
        expectedVersion: ctx.expectedVersion(),
      })
      const reason = body.reason?.trim()
      await ctx.audit({
        target: { type: 'visit', id: out.id, version: out.version },
        summary: {
          projectId: out.projectId,
          purpose: out.purpose,
          workers: [...out.workerIds],
          equipment: [...out.equipmentIds],
          reserved: out.range,
        },
        ...(reason ? { reason } : {}),
      })
      return { body: await projectVisits(tx, actor, ctx.scope, out.projectId, gates), version: out.version }
    },
  }

  const offer: RouteDef = {
    method: 'POST',
    path: '/staff/visits/:visitId/offers',
    operationId: 'offerVisitWindows',
    summary: 'Offer windows of a tentative visit to the customer, held for its team',
    description:
      'Staff with visit.offer_windows (Owner, Office; an Estimator: estimate visits only, PROPOSED), with If-Match: the ' +
      'visit version shown (HH-SCH-11, HH-LEAD-07, OWN-DEC-144, OWN-DEC-194). Names the windows (local date and ' +
      "arrival window in the visit's zone, with the reading of a repeated hour when needed), the visit's whole team " +
      '(exactly its number of workers, the lead first, and an item for each equipment entry) and optional ' +
      'customer-facing preparation instructions (TSK-0146, OWN-DEC-194 B7: the form starts them from the ' +
      'Owner-approved defaults of the visit’s services; the offer keeps the text sent, with its basis default, ' +
      'edited, staff or none; unsafe instructions are refused, VALIDATION_FAILED UNSAFE_<RULE> on ' +
      'body.preparationInstructions, and checked again when a draft is published). The number of windows is the ' +
      'configured policy ' +
      '(scheduling.window_offers: 2-3, OWN-DEC-99 and OWN-DEC-105; NOT CONFIGURED while unset), their reserved ranges ' +
      'may not overlap (OFFER_WINDOWS_OVERLAP) and each must start in the future. TSK-0145: with draft true the offer ' +
      'is only saved as a draft (B1): nothing is held, no number is given and no clock runs (one draft per visit, ' +
      'OFFER_DRAFT_EXISTS). Otherwise it is published at once, as publishWindowOffer does: the conditions of the ' +
      "visit's purpose (A2: an estimate visit needs no approved job; a work visit its approval, the job's gates and, " +
      'on a completed job, its follow-up authorization; every visit no blocking hold, A1, and the site checks) and ' +
      "every window like a confirmation (the team's working hours, time off, eligibility and existing reservations or " +
      'holds, the on-site part inside the visit hours), each window then held for the team until the offer expires: ' +
      'the configured hold hours from the publication, by the database clock (24 hours, OWN-DEC-144). A concurrent ' +
      'offer or confirmation of the same capacity gets CONFLICT naming every unmet requirement per window ' +
      '(windows[i].workers.<id>, ...) with alternatives, and nothing partial is written. One open offer per visit: ' +
      'over it, a replaceReason replaces it (B4; OFFER_OPEN without one). Publishing writes the committed event of ' +
      'the automatic options notice (estimate_visit.windows_published #5, work_visit.windows_published #11) and ' +
      "schedules the expiry. Nothing is confirmed here. Returns the project's visits.",
    actors: ['staff'],
    permission: 'visit.offer_windows',
    kind: 'write',
    idempotency: 'required',
    expectedVersion: 'required',
    rateLimit: 'none',
    audit: 'visit.offer_windows',
    pagination: false,
    test: OFFERS_TEST,
    resource: visitProjectOf,
    schema: { params: VISIT_PARAMS, body: OFFER_BODY, response: { 201: PROJECT_VISITS } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const actor = staffActor(ctx)
      const { visitId } = ctx.req.params as { visitId: string }
      const body = ctx.req.body as OfferInput
      const out = await offerWindows(tx, actor, ctx.scope, visitId, body, {
        gates,
        now: new Date(),
        expectedVersion: ctx.expectedVersion(),
        expiry,
      })
      await ctx.audit({
        target: { type: 'window_offer', id: out.offerId, version: out.version },
        summary: offerSummary(out),
        ...(out.replaced && body.replaceReason ? { reason: body.replaceReason.trim() } : {}),
      })
      return { status: 201, body: await projectVisits(tx, actor, ctx.scope, out.projectId, gates) }
    },
  }

  const publish: RouteDef = {
    method: 'POST',
    path: '/staff/window-offers/:offerId/publish',
    operationId: 'publishWindowOffer',
    summary: 'Publish a draft window offer to the customer',
    description:
      'Staff with visit.offer_windows (an Estimator: estimate visits only, PROPOSED), with If-Match: the draft version ' +
      'shown (TSK-0145; OWN-DEC-194 B1, B3, B4). In one transaction: the conditions of the visit purpose and every ' +
      'window are checked again as when offering (a window now in the past, or the visit planning changed since the ' +
      'draft: windows[i] WINDOW_IN_PAST, OFFER_DRAFT_STALE), the offer takes the next number of the project, its ' +
      'publication instant and its exact expiry (the hold hours in force from now, by the database clock: the 24 ' +
      'hours start here, never when the draft was saved), and every window holds the whole team. Over the visit’s ' +
      'open offer it needs a replaceReason (OFFER_OPEN otherwise; NO_OPEN_OFFER with a reason and nothing to replace) ' +
      'and replaces it: the open offer ends as replaced, its holds released, and the customer gets the new offer’s ' +
      'options notice once. An offer that is not a draft is CONFLICT naming its state. Returns the project’s visits.',
    actors: ['staff'],
    permission: 'visit.offer_windows',
    kind: 'write',
    idempotency: 'required',
    expectedVersion: 'required',
    rateLimit: 'none',
    audit: 'visit.publish_offer',
    pagination: false,
    test: AMENDMENTS_TEST,
    resource: offerProjectOf,
    schema: { params: OFFER_PARAMS, body: PUBLISH_BODY, response: { 200: PROJECT_VISITS } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const actor = staffActor(ctx)
      const { offerId } = ctx.req.params as { offerId: string }
      const body = ctx.req.body as { replaceReason?: string }
      const out = await publishOffer(tx, actor, ctx.scope, offerId, body, {
        gates,
        now: new Date(),
        expectedVersion: ctx.expectedVersion(),
        expiry,
      })
      await ctx.audit({
        target: { type: 'window_offer', id: out.offerId, version: out.version },
        summary: offerSummary(out),
        ...(out.replaced && body.replaceReason ? { reason: body.replaceReason.trim() } : {}),
      })
      return { body: await projectVisits(tx, actor, ctx.scope, out.projectId, gates), version: out.version }
    },
  }

  const discard: RouteDef = {
    method: 'POST',
    path: '/staff/window-offers/:offerId/discard',
    operationId: 'discardWindowOfferDraft',
    summary: 'Discard a draft window offer that was never published',
    description:
      'Staff with visit.offer_windows (an Estimator: estimate visits only, PROPOSED), with If-Match: the draft version ' +
      'shown (TSK-0145, B1). The draft held nothing and started no clock; it is kept as history. A published offer is ' +
      'withdrawn or replaced instead (CONFLICT naming its state). Returns the project’s visits.',
    actors: ['staff'],
    permission: 'visit.offer_windows',
    kind: 'write',
    idempotency: 'required',
    expectedVersion: 'required',
    rateLimit: 'none',
    audit: 'visit.discard_offer',
    pagination: false,
    test: AMENDMENTS_TEST,
    resource: offerProjectOf,
    schema: { params: OFFER_PARAMS, body: DISCARD_BODY, response: { 200: PROJECT_VISITS } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const actor = staffActor(ctx)
      const { offerId } = ctx.req.params as { offerId: string }
      const out = await discardOfferDraft(tx, actor, ctx.scope, offerId, { expectedVersion: ctx.expectedVersion() })
      await ctx.audit({
        target: { type: 'window_offer', id: out.offerId, version: out.version },
        summary: { projectId: out.projectId, visitId: out.visitId },
      })
      return { body: await projectVisits(tx, actor, ctx.scope, out.projectId, gates), version: out.version }
    },
  }

  const inspection: RouteDef = {
    method: 'POST',
    path: '/staff/visits/:visitId/inspection-authorization',
    operationId: 'authorizeHazardInspection',
    summary: 'Authorize a hazard-evaluation inspection visit while an intake hold stays open',
    description:
      'The Owner only (visit.authorize_inspection), with If-Match: the visit version shown (TSK-0145; OWN-DEC-193 A1, ' +
      'OWN-DEC-208). Holds stay mandatory: while an intake review hold is open, the only visit of its project that can ' +
      'be offered or confirmed is a tentative site visit the Owner authorizes as a hazard-evaluation inspection, ' +
      'naming the qualified person and their qualification (recorded, never judged), the safety conditions and a ' +
      'reason (REQUIRED, REASON_REQUIRED). It covers the intake review holds open now; they stay open and keep blocking ' +
      'every other visit and Start Work, and a later review hold, a job-level Hold or a critical safety hold still ' +
      'blocks it. Refusals: CONFLICT VISIT_NOT_TENTATIVE, NOT_A_SITE_VISIT, INSPECTION_AUTHORIZED, NO_REVIEW_HOLD. ' +
      'Append-only. Returns the project’s visits.',
    actors: ['staff'],
    permission: 'visit.authorize_inspection',
    kind: 'write',
    idempotency: 'required',
    expectedVersion: 'required',
    rateLimit: 'none',
    audit: 'visit.authorize_inspection',
    pagination: false,
    test: AMENDMENTS_TEST,
    resource: visitProjectOf,
    schema: { params: VISIT_PARAMS, body: INSPECTION_BODY, response: { 200: PROJECT_VISITS } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const actor = staffActor(ctx)
      const { visitId } = ctx.req.params as { visitId: string }
      const body = ctx.req.body as InspectionInput
      const out = await authorizeInspection(tx, actor, ctx.scope, visitId, body, {
        expectedVersion: ctx.expectedVersion(),
      })
      // The qualified person's name and the conditions stay on the record; the audit names the visit and its holds.
      await ctx.audit({
        target: { type: 'visit', id: out.visitId },
        summary: { projectId: out.projectId, authorizationId: out.id, holdIds: out.holdIds },
        reason: body.reason.trim(),
      })
      return { body: await projectVisits(tx, actor, ctx.scope, out.projectId, gates) }
    },
  }

  const followUp: RouteDef = {
    method: 'POST',
    path: '/staff/visits/:visitId/follow-up-authorization',
    operationId: 'authorizeFollowUpVisit',
    summary: 'Record the authorization of a follow-up visit on a completed job',
    description:
      'Staff with visit.authorize_follow_up (Owner; Office, PROPOSED), with If-Match: the visit version shown ' +
      '(TSK-0145; OWN-DEC-193 A4). A work visit of a job whose work is complete (operationally complete, closed or ' +
      'reopened) is offered and confirmed only with its recorded basis: contractual_obligation, warranty, punch_list ' +
      'or return_work, with a note saying which (NOTE_REQUIRED). A warranty names the job’s return work classified as ' +
      'a warranty claim (RETURN_WORK_NOT_WARRANTY), a return-work authorization the job’s return work the Owner ' +
      'decided (RETURN_WORK_NOT_DECIDED); both need returnWorkId (RETURN_WORK_REQUIRED, RETURN_WORK_UNKNOWN). New paid ' +
      'work needs an approved estimate or change order instead. Refusals: CONFLICT VISIT_NOT_TENTATIVE, ' +
      'NOT_A_WORK_VISIT, JOB_NOT_COMPLETE, FOLLOW_UP_AUTHORIZED. Append-only. Returns the project’s visits.',
    actors: ['staff'],
    permission: 'visit.authorize_follow_up',
    kind: 'write',
    idempotency: 'required',
    expectedVersion: 'required',
    rateLimit: 'none',
    audit: 'visit.authorize_follow_up',
    pagination: false,
    test: AMENDMENTS_TEST,
    resource: visitProjectOf,
    schema: { params: VISIT_PARAMS, body: FOLLOW_UP_BODY, response: { 200: PROJECT_VISITS } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const actor = staffActor(ctx)
      const { visitId } = ctx.req.params as { visitId: string }
      const body = ctx.req.body as FollowUpInput
      const out = await authorizeFollowUp(tx, actor, ctx.scope, visitId, body, {
        expectedVersion: ctx.expectedVersion(),
      })
      await ctx.audit({
        target: { type: 'visit', id: out.visitId },
        summary: {
          projectId: out.projectId,
          authorizationId: out.id,
          basis: out.basis,
          returnWorkId: out.returnWorkId,
        },
      })
      return { body: await projectVisits(tx, actor, ctx.scope, out.projectId, gates) }
    },
  }

  const withdraw: RouteDef = {
    method: 'POST',
    path: '/staff/window-offers/:offerId/withdraw',
    operationId: 'withdrawWindowOffer',
    summary: 'Withdraw an open window offer',
    description:
      'Staff with visit.offer_windows (an Estimator: estimate visits only, PROPOSED), with If-Match: the offer version ' +
      'shown and a reason (OWN-DEC-194 B4: required). Ends the offer and releases every hold it has (kept as history, ' +
      'ended "hold_released"); the visit stays tentative for a new offer. TSK-0145 (PROPOSED): no withdrawal notice ' +
      'has owner-approved wording, so none is sent: the times leave the customer’s Appointments tab and staff get the ' +
      '"offered windows need new times" item (window_offer_withdrawn) until new windows are published (their notice ' +
      'tells the customer). An offer that is not open (a draft: discard it; selected, expired, withdrawn, replaced, ' +
      "other times asked for) is CONFLICT naming its state. Returns the project's visits.",
    actors: ['staff'],
    permission: 'visit.offer_windows',
    kind: 'write',
    idempotency: 'required',
    expectedVersion: 'required',
    rateLimit: 'none',
    audit: 'visit.withdraw_offer',
    pagination: false,
    test: OFFERS_TEST,
    resource: offerProjectOf,
    schema: { params: OFFER_PARAMS, body: WITHDRAW_BODY, response: { 200: PROJECT_VISITS } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const actor = staffActor(ctx)
      const { offerId } = ctx.req.params as { offerId: string }
      const body = ctx.req.body as { reason: string }
      const out = await withdrawOffer(tx, actor, ctx.scope, offerId, body, { expectedVersion: ctx.expectedVersion() })
      await ctx.audit({
        target: { type: 'window_offer', id: out.offerId, version: out.version },
        summary: { projectId: out.projectId, visitId: out.visitId, number: out.number },
        reason: body.reason.trim(),
      })
      return { body: await projectVisits(tx, actor, ctx.scope, out.projectId, gates), version: out.version }
    },
  }

  const board: RouteDef = {
    method: 'GET',
    path: '/staff/schedule',
    operationId: 'getScheduleBoard',
    summary: 'The scheduling board: a day or a week by worker',
    description:
      'Staff with schedule.view_board (Owner, Office; Estimator PROPOSED), TSK-0065 (HH-SCH-13). One local day ' +
      '(view=day, the default) or its week (view=week; Monday to Sunday, OWN-DEC-192 J1) of the business zone (NOT ' +
      'CONFIGURED while business.timezone is unset); date defaults to today there, and visitId opens the date of that ' +
      "visit's window (NOT_FOUND outside the caller's data scope). Every active staff member who may be reserved for a " +
      'visit, with each day of the range: working periods (none while the Owner has not set them), approved time off, ' +
      'the reservations and holds they carry (a hold is never a booking; a two-person visit is on both workers) and ' +
      'the free time left (the remaining capacity, in minutes). Visits that reserve no worker yet are listed apart, by ' +
      'day. Each visit of the range once: purpose (Estimate visits apart from work visits), state, version, arrival ' +
      'window with its zone, expected work, the staff-entered travel and preparation buffers, workers needed, team, ' +
      'items, whether its windows are offered, what still stops its confirmation (TSK-0064) and the actions the caller ' +
      'may take: the same rules as the project visits. The board writes nothing: moving, confirming and offering ' +
      'windows are the visit routes, each with If-Match, an idempotency key and every server check.',
    actors: ['staff'],
    permission: 'schedule.view_board',
    kind: 'read',
    idempotency: 'none',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'none',
    pagination: false,
    test: BOARD_TEST,
    schema: { querystring: BOARD_QUERY, response: { 200: SCHEDULE_BOARD } },
    handler: async (ctx) => ({
      body: await scheduleBoard(ctx.db, staffActor(ctx), ctx.scope, ctx.req.query as BoardQuery, { gates }),
    }),
  }

  const reassign: RouteDef = {
    method: 'POST',
    path: '/staff/visits/:visitId/reassign',
    operationId: 'reassignVisit',
    summary: 'Reassign a confirmed visit to another team',
    description:
      'Staff with visit.reassign (Owner, Office), with If-Match: the visit version shown (TSK-0066, HH-SCH-07, T42). ' +
      'Names the new team (exactly the number of workers the visit needs, the lead first) and, optionally, its ' +
      'equipment items (default: the ones reserved now), with a reason (required). The window stays. In one ' +
      'transaction the server runs every confirmation precondition (approval, deposit, gates, no blocking hold) and ' +
      "checks every worker and item like a confirmation, with the visit's own reservations set aside, then reserves the " +
      'new team; the old reservations end "reassigned" and stay as history (a flagged reservation that ends resolves ' +
      'its visit_flagged queue item). A refusal (STALE_VERSION with the current values; CONFLICT VISIT_NOT_CONFIRMED, ' +
      'TEAM_UNCHANGED, WORKER_COUNT_MISMATCH, the precondition and capacity codes with alternatives) changes nothing. ' +
      'Writes one change record and the committed appointment.change_committed event: after commit the customer gets ' +
      'the automatic "Appointment changed" notice (#11) and the old and new workers the staff notice, once (wording NOT ' +
      'CONFIGURED). A worker removed from the visit loses its access-code reveal on the next request. Returns the ' +
      "project's visits.",
    actors: ['staff'],
    permission: 'visit.reassign',
    kind: 'write',
    idempotency: 'required',
    expectedVersion: 'required',
    rateLimit: 'none',
    audit: 'visit.reassign',
    pagination: false,
    test: CHANGES_TEST,
    resource: visitProjectOf,
    schema: { params: VISIT_PARAMS, body: REASSIGN_BODY, response: { 200: PROJECT_VISITS } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const actor = staffActor(ctx)
      const { visitId } = ctx.req.params as { visitId: string }
      const out = await reassignVisit(tx, actor, ctx.scope, visitId, ctx.req.body as ReassignInput, {
        gates,
        now: new Date(),
        expectedVersion: ctx.expectedVersion(),
      })
      await ctx.audit({
        target: { type: 'visit', id: out.id, version: out.version },
        summary: {
          projectId: out.projectId,
          purpose: out.purpose,
          changeId: out.changeId,
          fromWorkers: out.from.workers,
          toWorkers: out.to.workers,
          fromEquipment: out.from.equipment,
          toEquipment: out.to.equipment,
        },
        reason: out.reason,
      })
      return { body: await projectVisits(tx, actor, ctx.scope, out.projectId, gates), version: out.version }
    },
  }

  const cancel: RouteDef = {
    method: 'POST',
    path: '/staff/visits/:visitId/cancel',
    operationId: 'cancelVisit',
    summary: 'Cancel a confirmed visit',
    description:
      'Staff with visit.cancel (Owner, Office), with If-Match: the visit version shown (TSK-0066, TSK-0140, ' +
      'HH-SCH-07, HH-PORT-04, T25). A work visit is accepted, scheduled work: the Owner cancels it (cancellation and ' +
      'financial review, work.cancel_with_financial_review); Office cancels one only for a routine customer-authorized ' +
      'cancellation within policy (work.cancel_routine, OWN-DEC-195 C6: the customer asked, no circumstance, and the ' +
      'outcome full_refund_no_charge, late_cancellation or late_no_charge; FORBIDDEN NOT_ROUTINE_CANCELLATION ' +
      'otherwise, OWNER_CANCELS_WORK for a role with neither). Names who initiated it (initiator customer or handyhub, ' +
      "with handyhubCause weather, safety_stop, sick_worker or other) and a reason (required), or the customer's open " +
      "cancellation request it confirms (changeRequestId); optionally the circumstance that keeps a customer's " +
      'cancellation from being charged automatically (unsafe_conditions, emergency, legally_protected, owner_review) ' +
      "and the Owner's waiver or reduction of the fee (feeWaiver: the fee after it, below the computed fee, and a " +
      'documented reason; cancellation_fee.waive with a fresh sign-in, FORBIDDEN OWNER_WAIVES_FEE for anyone else, ' +
      'FRESH_AUTH_REQUIRED, CONFLICT NO_FEE_TO_WAIVE). The server computes the outcome of FACT-CANCELLATION-RULES ' +
      "from the active cancellation.rules (NOT CONFIGURED while unset): the notice (from the customer's request, or " +
      "now), whether contracted work started (Start Work; a worker's arrival or preparation alone never is, OWN-DEC-195 " +
      'C4), the verified deposit (an uncleared check is shown apart, never counted) and whether the accepted terms ' +
      'disclosed the fee: full_refund_no_charge (24 hours or more before work starts), late_cancellation (at most ' +
      '$50.00 kept from the deposit and the rest refunded, a smaller deposit kept and nothing more invoiced, or $50.00 ' +
      'invoiced with no deposit only where disclosed and accepted in advance), late_no_charge (late, no deposit, not ' +
      'disclosed), estimate_visit_free (an estimate visit is never charged), work_started (work done plus materials, ' +
      'which the Owner determines), customer_chooses (HandyHub cancels: a free reschedule or a full refund) or ' +
      'owner_review (a circumstance the Owner decides). The visit is canceled, its reservations end and stay as history, the outcome is kept on ' +
      "the change record, and an outcome with money opens the Owner's cancellation_outcome item: nothing is refunded, " +
      'kept or invoiced automatically (HH-FIN-14). The affected workers get the staff notice after commit; a ' +
      "cancellation is not on the customer's automatic list. Returns the project's visits.",
    actors: ['staff'],
    permission: 'visit.cancel',
    kind: 'write',
    idempotency: 'required',
    expectedVersion: 'required',
    rateLimit: 'none',
    audit: 'visit.cancel',
    pagination: false,
    test: CHANGES_TEST,
    resource: visitProjectOf,
    schema: { params: VISIT_PARAMS, body: CANCEL_BODY, response: { 200: PROJECT_VISITS } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const actor = staffActor(ctx)
      const { visitId } = ctx.req.params as { visitId: string }
      const out = await cancelVisit(tx, actor, ctx.scope, visitId, ctx.req.body as CancelInput, {
        now: new Date(),
        expectedVersion: ctx.expectedVersion(),
        sessionId: ctx.req.staffSession?.sessionId,
      })
      await ctx.audit({
        target: { type: 'visit', id: out.id, version: out.version },
        summary: {
          projectId: out.projectId,
          purpose: out.purpose,
          changeId: out.changeId,
          changeRequestId: out.requestId,
          initiator: out.initiator,
          handyhubCause: out.cause,
          outcome: out.outcome.kind,
          noticeMinutes: out.outcome.noticeMinutes,
          keptCents: out.outcome.keptCents,
          refundCents: out.outcome.refundCents,
          invoiceCents: out.outcome.invoiceCents,
          depositPaidCents: out.facts.depositPaidCents,
          workStarted: out.facts.workStarted,
          rulesVersion: out.rulesVersion,
          circumstance: out.circumstance,
          feeWaivedFromCents: out.waiver?.fromCents ?? null,
        },
        reason: out.reason,
      })
      return { body: await projectVisits(tx, actor, ctx.scope, out.projectId, gates), version: out.version }
    },
  }

  const decline: RouteDef = {
    method: 'POST',
    path: '/staff/visit-change-requests/:requestId/decline',
    operationId: 'declineVisitChangeRequest',
    summary: "Decline a customer's reschedule or cancellation request",
    description:
      'Staff with visit.reschedule (a reschedule request) or the cancel rule (a cancellation request; a work visit: ' +
      'the Owner, PROPOSED), with If-Match: the request version shown and a reason (required), TSK-0066 (HH-PORT-04, ' +
      'T25). The request ends declined and its queue items resolve; the booking stays exactly as it is and the ' +
      "customer's Appointments tab says the request was not confirmed. A request that already ended is CONFLICT " +
      "naming its state. Returns the project's visits.",
    actors: ['staff'],
    permission: 'visit.reschedule',
    kind: 'write',
    idempotency: 'required',
    expectedVersion: 'required',
    rateLimit: 'none',
    audit: 'visit.decline_change_request',
    pagination: false,
    test: CHANGES_TEST,
    resource: requestProjectOf,
    schema: { params: REQUEST_PARAMS, body: DECLINE_BODY, response: { 200: PROJECT_VISITS } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const actor = staffActor(ctx)
      const { requestId } = ctx.req.params as { requestId: string }
      const out = await declineRequest(tx, actor, ctx.scope, requestId, ctx.req.body as { reason: string }, {
        expectedVersion: ctx.expectedVersion(),
      })
      await ctx.audit({
        target: { type: 'visit_change_request', id: out.id, version: out.version },
        summary: { projectId: out.projectId, visitId: out.visitId, kind: out.kind },
        reason: out.reason,
      })
      return { body: await projectVisits(tx, actor, ctx.scope, out.projectId, gates), version: out.version }
    },
  }

  return {
    name: 'visits',
    routes: [
      list,
      plan,
      move,
      confirm,
      offer,
      withdraw,
      publish,
      discard,
      inspection,
      followUp,
      board,
      reassign,
      cancel,
      decline,
      // TSK-0067: appointment reminders.
      ...appointmentReminderRoutes(),
      // TSK-0126: the first-visit site checks.
      ...siteCheckRoutes(),
      // TSK-0128: the assigned workers' visit-day access and the Owner's extensions.
      ...workerAccessRoutes(),
      // TSK-0146: the Owner-approved default preparation instructions offers start from.
      ...preparationRoutes(),
    ],
  }
}

export { BOARD_VIEWS, boardDays, scheduleBoard, type ScheduleBoard } from './board.js'
export {
  appointmentChangedAutomation,
  customerRequestsOf,
  requestVisitChange,
  scheduleChangeStaffAutomation,
  visitCancelledAutomation,
  type CustomerChangeRequest,
} from './changes.js'
export { DEPOSIT_GATE, WORK_VISIT_GATES, unmetGates, type WorkVisitGate, type WorkVisitJob } from './gates.js'
export {
  appointmentConfirmedAutomation,
  customerAppointments,
  estimateVisitConfirmedAutomation,
  estimateVisitOptionsAutomation,
  OFFER_LIMITS,
  requestOtherTimes,
  selectWindow,
  windowOfferExpiryAutomation,
  workVisitOptionsAutomation,
  type CustomerAppointment,
  type CustomerAppointments,
  type CustomerOffer,
} from './offers.js'
export {
  businessZone,
  ESTIMATE_VISIT_PROJECT_STATES,
  mayPlanWorkVisits,
  projectVisits,
  VISIT_LIMITS,
  WORK_VISIT_PROJECT_STATES,
  type ProjectVisits,
} from './visits.js'
export {
  APPOINTMENT_REMINDER_ITEM,
  APPOINTMENT_REMINDER_MESSAGE_KEY,
  APPOINTMENT_REMINDER_STOP_REASONS,
  appointmentReminderAutomations,
  appointmentReminderCadence,
  appointmentReminderDueAt,
  appointmentReminderFailureItem,
  appointmentReminderPlanAutomation,
  appointmentReminderRecordCheck,
  appointmentRemindersView,
  appointmentReminderStopReason,
  appointmentReminderSubject,
  appointmentReminderValues,
  bookedAheadEnough,
  planAppointmentReminder,
  stopAppointmentReminders,
  type AppointmentReminderStopReason,
} from './reminders.js'
