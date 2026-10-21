// The customer's answer to offered windows in the portal (TSK-0063; HH-SCH-11, HH-LEAD-07, HH-SCH-04, T37, T38, T19,
// OWN-DEC-99, OWN-DEC-105, OWN-DEC-144, RULE-SERVER-AUTHZ).
//   POST /customer/projects/:reference/window-offers/:number/select        select one offered window
//   POST /customer/projects/:reference/window-offers/:number/other-times   ask for other times (optional note)
// - Both are the matrix's visit.select_window (Customer "V": own verified project; PROPOSED mapping for asking for other
//   times, which the matrix names with the selection). Every project outside the session, an unknown offer number
//   and a malformed reference answer the same NOT_FOUND (T19).
// - Each answers with the refreshed Appointments tab (records/projections.ts PROJECT_APPOINTMENTS): no hold, worker,
//   staff detail or ID. A refusal names only the offer's state or that the window can no longer be kept; it changes
//   nothing, and the customer can choose another offered window or ask for other times without restarting.
// - The customer's note stays on the offer; the audit keeps what happened, never the note.
import type { CustomerActor } from '@handyhub/policy'
import { ApiError } from '../../api/errors.js'
import type { RouteDef } from '../../api/route.js'
import { projectIdOf } from '../access/projects.js'
import { PROJECT_APPOINTMENTS } from '../records/index.js'
import { WORK_VISIT_GATES, type WorkVisitGate } from '../visits/gates.js'
import { OFFER_LIMITS, requestOtherTimes, selectWindow } from '../visits/offers.js'
import { projectTab } from './tabs.js'

export type PortalAppointmentDeps = {
  /** The gates a work visit's window passes when selected (WORK_VISIT_GATES); tests may add their own. */
  workVisitGates?: readonly WorkVisitGate[]
}

const TEST = 'test/integration/window-offers.test.ts'
/** PROPOSED (no owner value): per client network and hour, like the other customer-facing writes. */
export const WINDOW_ANSWER_RATE_LIMIT = { bucket: 'customer-window-answer', limit: 60, windowSeconds: 3600 } as const

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

  return [select, otherTimes]
}
