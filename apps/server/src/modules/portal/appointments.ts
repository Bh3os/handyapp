// The customer's answer to offered windows in the portal (TSK-0063; HH-SCH-11, HH-LEAD-07, HH-SCH-04, T37, T38, T19,
// OWN-DEC-99, OWN-DEC-105, OWN-DEC-144, RULE-SERVER-AUTHZ).
//   POST /customer/projects/:reference/window-offers/:number/select        select one offered window
//   POST /customer/projects/:reference/window-offers/:number/other-times   ask for other times (optional note)
//   POST /customer/projects/:reference/appointments/:number/reschedule-request    Request to Reschedule (TSK-0066)
//   POST /customer/projects/:reference/appointments/:number/cancellation-request  Request Cancellation (TSK-0066)
// - Both are the matrix's visit.select_window (Customer "V": own verified project; PROPOSED mapping for asking for other
//   times, which the matrix names with the selection). Every project outside the session, an unknown offer number
//   and a malformed reference answer the same NOT_FOUND (T19).
// - Each answers with the refreshed Appointments tab (records/projections.ts PROJECT_APPOINTMENTS): no hold, worker,
//   staff detail or ID. A refusal names only the offer's state or that the window can no longer be kept; it changes
//   nothing, and the customer can choose another offered window or ask for other times without restarting.
// - The customer's note stays on the offer; the audit keeps what happened, never the note.
// - TSK-0066 (HH-PORT-04, OWN-DEC-107): the change requests are the matrix's visit.request_reschedule and
//   visit.request_cancellation (Customer "V"). A request records the intent (an optional reason, and preferred times
//   for a reschedule), appears prominently in the staff queue and never changes the booking: the confirmed
//   appointment stays visible and in force until staff commit a change; the tab then says "Request received—awaiting
//   staff confirmation." Rescheduling is always free; no fee or refund term is shown. The audit records that a reason
//   or times were given, never the words.
import type { CustomerActor } from '@handyhub/policy'
import { ApiError } from '../../api/errors.js'
import type { RouteDef } from '../../api/route.js'
import { projectIdOf } from '../access/projects.js'
import { PROJECT_APPOINTMENTS } from '../records/index.js'
import { WORK_VISIT_GATES, type WorkVisitGate } from '../visits/gates.js'
import { CHANGE_LIMITS, requestVisitChange, type RequestKind } from '../visits/changes.js'
import { OFFER_LIMITS, requestOtherTimes, selectWindow } from '../visits/offers.js'
import { projectTab } from './tabs.js'

export type PortalAppointmentDeps = {
  /** The gates a work visit's window passes when selected (WORK_VISIT_GATES); tests may add their own. */
  workVisitGates?: readonly WorkVisitGate[]
}

const TEST = 'test/integration/window-offers.test.ts'
/** PROPOSED (no owner value): per client network and hour, like the other customer-facing writes. */
export const WINDOW_ANSWER_RATE_LIMIT = { bucket: 'customer-window-answer', limit: 60, windowSeconds: 3600 } as const
/** PROPOSED (no owner value), TSK-0066: the appointment change requests, per client network and hour. */
export const CHANGE_REQUEST_RATE_LIMIT = {
  bucket: 'customer-appointment-request',
  limit: 30,
  windowSeconds: 3600,
} as const

const PATH = '/customer/projects/:reference/window-offers/:number'
const PARAMS = {
  type: 'object',
  additionalProperties: false,
  required: ['reference', 'number'],
  properties: {
    reference: { type: 'string', minLength: 1, maxLength: 40 },
    number: { type: 'string', pattern: '^[1-9][0-9]{0,5}$' },
  },
} as const
type Params = { reference: string; number: string }
const APPOINTMENT_PARAMS = PARAMS
const CHANGES_TEST = 'test/integration/visit-changes.test.ts'

const resource: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const id = await projectIdOf(db, (req.params as Params).reference)
  return id ? { projectId: id } : null
}

export function portalAppointmentRoutes(deps: PortalAppointmentDeps = {}): RouteDef[] {
  const gates = deps.workVisitGates ?? WORK_VISIT_GATES
  const base = {
    method: 'POST',
    actors: ['customer'],
    permission: 'visit.select_window',
    kind: 'write',
    idempotency: 'required',
    expectedVersion: 'none',
    rateLimit: WINDOW_ANSWER_RATE_LIMIT,
    pagination: false,
    test: TEST,
    resource,
    projection: PROJECT_APPOINTMENTS,
  } as const

  const tab = async (ctx: Parameters<RouteDef['handler']>[0], reference: string) => {
    const answer = await projectTab(ctx.tx ?? ctx.db, ctx.scope, reference, 'appointments')
    if (!answer) throw new ApiError('NOT_FOUND')
    return PROJECT_APPOINTMENTS.project(answer as never)
  }

  const select: RouteDef = {
    ...base,
    path: `${PATH}/select`,
    operationId: 'selectOfferedWindow',
    summary: 'Select one offered window',
    description:
      'The verified customer selects one window of an offer while it is held (HH-SCH-11, HH-LEAD-07; OWN-DEC-144: ' +
      'the configured hours from the offer). In one transaction under the offer lock the server rechecks the window ' +
      '(its holds are still active, the team still passes every capacity rule, a work visit still passes its ' +
      'scheduling gates, and every confirmation precondition runs, as for a staff confirmation: the approval and the ' +
      "job's deposit gate for a work visit, no blocking hold on the project; TSK-0059, TSK-0064, HH-SCH-06), turns " +
      "that window's holds into the confirmed reservations, releases the other windows, " +
      'gives the visit that window and confirms it, and writes the committed event of the automatic confirmation ' +
      'notice (estimate_visit.reserved or appointment.reserved; wording NOT CONFIGURED). An Estimate visit stays on ' +
      'the project with no job and no price approval (T37). Of two tabs or customers racing for one offer exactly one ' +
      'succeeds; the other gets CONFLICT and nothing changes. Refusals: VALIDATION_FAILED POSITION_UNKNOWN; CONFLICT ' +
      'on `offer` (OFFER_EXPIRED: the hold time passed, OFFER_SELECTED, OFFER_WITHDRAWN, OFFER_OTHER_TIMES_REQUESTED) ' +
      'or on `body.position` (WINDOW_UNAVAILABLE: the window can no longer be kept, choose another or ask for other ' +
      'times; SCHEDULING_NOT_READY: a confirmation precondition is unmet, with `deposit` DEPOSIT_REQUIRED or ' +
      "DEPOSIT_REQUIREMENT_MISSING while the job's deposit is due and no hold or staff detail; an Estimate visit " +
      'never waits for a deposit). ' +
      'The same customer selecting the same window again (a second tab) gets the same ' +
      'answer. Answers the refreshed Appointments tab. Any other project or offer is NOT_FOUND (T19).',
    audit: 'visit.select_window',
    schema: {
      params: PARAMS,
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['position'],
        properties: { position: { type: 'integer', minimum: 1, maximum: OFFER_LIMITS.windows } },
      },
      response: { 200: PROJECT_APPOINTMENTS.schema },
    },
    handler: async (ctx) => {
      if (!ctx.tx) throw new Error('selectOfferedWindow runs in its write transaction')
      const p = ctx.req.params as Params
      const { position } = ctx.req.body as { position: number }
      const out = await selectWindow(
        ctx.tx,
        ctx.actor as CustomerActor,
        ctx.scope,
        { reference: p.reference, number: Number(p.number), position },
        { gates },
      )
      await ctx.audit({
        target: { type: 'window_offer', id: out.offerId },
        summary: {
          visitId: out.visitId,
          purpose: out.purpose,
          number: Number(p.number),
          position,
          created: out.created,
          startsAt: out.window.startsAt.toISOString(),
          endsAt: out.window.endsAt.toISOString(),
          timeZone: out.window.zone,
        },
      })
      return { body: await tab(ctx, p.reference) }
    },
  }

  const otherTimes: RouteDef = {
    ...base,
    path: `${PATH}/other-times`,
    operationId: 'requestOtherWindows',
    summary: 'Ask for other times instead of the offered windows',
    description:
      'The verified customer asks for other times while the offer is held, with an optional note (HH-SCH-11, ' +
      'OWN-DEC-99: without restarting the request). Every hold of the offer is released, the visit stays tentative ' +
      'and staff get a queue item to offer new windows. Refusals: CONFLICT on `offer` naming its state (OFFER_EXPIRED, ' +
      'OFFER_SELECTED, ...). Answers the refreshed Appointments tab. Any other project or offer is NOT_FOUND (T19).',
    audit: 'visit.request_other_times',
    schema: {
      params: PARAMS,
      body: {
        type: 'object',
        additionalProperties: false,
        properties: { note: { type: 'string', maxLength: OFFER_LIMITS.note } },
      },
      response: { 200: PROJECT_APPOINTMENTS.schema },
    },
    handler: async (ctx) => {
      if (!ctx.tx) throw new Error('requestOtherWindows runs in its write transaction')
      const p = ctx.req.params as Params
      const note = (ctx.req.body as { note?: string } | undefined)?.note
      const out = await requestOtherTimes(ctx.tx, ctx.scope, {
        reference: p.reference,
        number: Number(p.number),
        note,
      })
      await ctx.audit({
        target: { type: 'window_offer', id: out.offerId },
        summary: { visitId: out.visitId, number: Number(p.number), noted: Boolean(note?.trim()) },
      })
      return { body: await tab(ctx, p.reference) }
    },
  }

  const changeRequest = (kind: RequestKind): RouteDef => ({
    ...base,
    rateLimit: CHANGE_REQUEST_RATE_LIMIT,
    permission: kind === 'reschedule' ? 'visit.request_reschedule' : 'visit.request_cancellation',
    path: `/customer/projects/:reference/appointments/:number/${kind}-request`,
    operationId: kind === 'reschedule' ? 'requestAppointmentReschedule' : 'requestAppointmentCancellation',
    summary: kind === 'reschedule' ? 'Request to Reschedule an appointment' : 'Request Cancellation of an appointment',
    description:
      `The verified customer's "${kind === 'reschedule' ? 'Request to Reschedule' : 'Request Cancellation'}" of a ` +
      'confirmed estimate or work visit (TSK-0066, HH-PORT-04, OWN-DEC-107), named by its number on the Appointments ' +
      'tab, with an optional reason' +
      (kind === 'reschedule' ? ' and preferred times' : '') +
      '. The request is recorded and put in the staff queue; the booking does not change: the appointment stays ' +
      'confirmed and in force until staff commit a change, and a declined request leaves it as it is. The same ' +
      'request again answers the open one. Refusals: CONFLICT on `appointment` (APPOINTMENT_NOT_CHANGEABLE: not ' +
      'confirmed; REQUEST_ALREADY_OPEN: another request is open). Answers the refreshed Appointments tab, whose ' +
      'appointment then shows the request awaiting staff confirmation. Any other project or number is NOT_FOUND (T19).',
    audit: kind === 'reschedule' ? 'visit.request_reschedule' : 'visit.request_cancellation',
    test: CHANGES_TEST,
    schema: {
      params: APPOINTMENT_PARAMS,
      body: {
        type: 'object',
        additionalProperties: false,
        properties: {
          reason: { type: 'string', maxLength: CHANGE_LIMITS.reason },
          ...(kind === 'reschedule'
            ? { preferredTimes: { type: 'string', maxLength: CHANGE_LIMITS.preferredTimes } }
            : {}),
        },
      },
      response: { 200: PROJECT_APPOINTMENTS.schema },
    },
    handler: async (ctx) => {
      if (!ctx.tx) throw new Error('the change request runs in its write transaction')
      const p = ctx.req.params as Params
      const body = (ctx.req.body ?? {}) as { reason?: string; preferredTimes?: string }
      const out = await requestVisitChange(ctx.tx, ctx.actor as CustomerActor, ctx.scope, {
        reference: p.reference,
        number: Number(p.number),
        kind,
        reason: body.reason,
        preferredTimes: body.preferredTimes,
      })
      await ctx.audit({
        target: { type: 'visit_change_request', id: out.id },
        summary: {
          visitId: out.visitId,
          purpose: out.purpose,
          kind,
          number: Number(p.number),
          created: out.created,
          reasonGiven: Boolean(body.reason?.trim()),
          ...(kind === 'reschedule' ? { preferredTimesGiven: Boolean(body.preferredTimes?.trim()) } : {}),
        },
      })
      return { body: await tab(ctx, p.reference) }
    },
  })

  return [select, otherTimes, changeRequest('reschedule'), changeRequest('cancellation')]
}
