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
// Every write takes an idempotency key and records its audit event with the local window, zone, offsets and instants.
// The customer's side of an offer (select a window, ask for other times) is the portal module's (portal/appointments.ts).
import type { Tx } from '@handyhub/db'
import { ApiError } from '../../api/errors.js'
import type { ApiContext, ApiModule, RouteDef } from '../../api/route.js'
import { WORK_VISIT_GATES, type WorkVisitGate } from './gates.js'
import { offerWindows, windowOfferExpiryAutomation, withdrawOffer, type OfferInput } from './offers.js'
import {
  CONFIRM_BODY,
  NEW_VISIT_BODY,
  OFFER_BODY,
  OFFER_PARAMS,
  PROJECT_PARAMS,
  PROJECT_VISITS,
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

const offerProjectOf: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const { offerId } = req.params as { offerId: string }
  const o = await db.selectFrom('work.window_offers').select('project_id').where('id', '=', offerId).executeTakeFirst()
  return o ? { projectId: o.project_id } : null
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
      'business zone with its PROPOSED mark, and what the caller may plan now. A timing preference on the request is ' +
      'never listed here.',
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
      return { body: await projectVisits(ctx.db, staffActor(ctx), ctx.scope, projectId) }
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
      return { status: 201, body: await projectVisits(tx, actor, ctx.scope, projectId), version: out.version }
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
      "alternatives, and the booking stays exactly as it was. Returns the project's visits.",
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
      const body = ctx.req.body as WindowEntry & { reason?: string }
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
        },
        ...(reason ? { reason } : {}),
      })
      return { body: await projectVisits(tx, actor, ctx.scope, out.projectId), version: out.version }
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
      "job's scheduling gates for a work visit, the on-site part inside the daily visit hours of contact.hours) and " +
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
      return { body: await projectVisits(tx, actor, ctx.scope, out.projectId), version: out.version }
    },
  }

  const offer: RouteDef = {
    method: 'POST',
    path: '/staff/visits/:visitId/offers',
    operationId: 'offerVisitWindows',
    summary: 'Offer windows of a tentative visit to the customer, held for its team',
    description:
      'Staff with visit.offer_windows (Owner, Office; an Estimator: estimate visits only, PROPOSED), with If-Match: the ' +
      'visit version shown (HH-SCH-11, HH-LEAD-07, OWN-DEC-144). Names the windows (local date and arrival window in ' +
      "the visit's zone, with the reading of a repeated hour when needed), the visit's whole team (exactly its number " +
      'of workers, the lead first, and an item for each equipment entry) and optional customer-facing preparation ' +
      'instructions. The number of windows is the configured policy (scheduling.window_offers: 2-3, OWN-DEC-99 and ' +
      'OWN-DEC-105; NOT CONFIGURED while unset), their reserved ranges may not overlap (OFFER_WINDOWS_OVERLAP) and each ' +
      "must start in the future. Every window is checked like a confirmation (the team's working hours, time off, " +
      'eligibility and existing reservations or holds, the on-site part inside the visit hours; a work visit passes ' +
      "the job's scheduling gates) and held for the team until the offer expires: the configured hold hours from the " +
      'offer, by the database clock (24 hours, OWN-DEC-144). A held window cannot be offered to or confirmed for anyone ' +
      'else: a concurrent offer or confirmation of the same capacity gets CONFLICT naming every unmet requirement per ' +
      'window (windows[i].workers.<id>, ...) with alternatives, and nothing partial is written. One open offer per ' +
      'visit (OFFER_OPEN). An estimate visit writes the committed event of the automatic options notice ' +
      '(estimate_visit.windows_published, FACT-AUTOMATIC-MESSAGES #5; wording NOT CONFIGURED); the list names none for ' +
      "work visits. The expiry is scheduled with the offer. Nothing is confirmed here. Returns the project's visits.",
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
        target: { type: 'window_offer', id: out.offerId, version: 1 },
        summary: {
          projectId: out.projectId,
          visitId: out.visitId,
          purpose: out.purpose,
          number: out.number,
          windows: out.windows.map(windowSummary),
          workers: [...out.workerIds],
          equipment: [...out.equipmentIds],
          holdHours: out.holdHours,
          policyVersion: out.policyVersion,
          expiresAt: out.expiresAt.toISOString(),
        },
      })
      return { status: 201, body: await projectVisits(tx, actor, ctx.scope, out.projectId) }
    },
  }

  const withdraw: RouteDef = {
    method: 'POST',
    path: '/staff/window-offers/:offerId/withdraw',
    operationId: 'withdrawWindowOffer',
    summary: 'Withdraw an open window offer',
    description:
      'Staff with visit.offer_windows (an Estimator: estimate visits only, PROPOSED), with If-Match: the offer version ' +
      'shown and a reason (PROPOSED: required). Ends the offer and releases every hold it has (kept as history, ended ' +
      '"hold_released"); the visit stays tentative for a new offer. An offer that already ended (selected, expired, ' +
      "withdrawn, other times asked for) is CONFLICT naming its state. Returns the project's visits.",
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
      return { body: await projectVisits(tx, actor, ctx.scope, out.projectId), version: out.version }
    },
  }

  return { name: 'visits', routes: [list, plan, move, confirm, offer, withdraw] }
}

export { WORK_VISIT_GATES, unmetGates, type WorkVisitGate, type WorkVisitJob } from './gates.js'
export {
  appointmentConfirmedAutomation,
  customerAppointments,
  estimateVisitConfirmedAutomation,
  estimateVisitOptionsAutomation,
  OFFER_LIMITS,
  requestOtherTimes,
  selectWindow,
  windowOfferExpiryAutomation,
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
