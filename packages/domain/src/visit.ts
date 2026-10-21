// Visit (appointment) lifecycle (TSK-0061; ENT-Visit, HH-SCH-01, HH-SCH-05, OWN-DEC-99, OWN-DEC-105, OWN-DEC-144).
//
//   tentative -> confirmed -> en_route -> arrived -> completed
//   tentative -> expired                (24 hours after the offer, when its holds release)
//   confirmed -> canceled / no_access
//
// - The states and edges are ENT-Visit's (guide 23). A customer's timing preference, the staff scheduling task, a
//   tentative visit and a confirmed appointment are four different things (HH-SCH-01): a preference lives on the
//   request and is never a visit; a scheduling task is never a booking; a tentative visit is never shown or counted as
//   a confirmed one (HH-SCH-05).
// - Purposes: `site_estimate` (an "Estimate visit": on the project, no job, no price approval, OWN-DEC-99) and the work
//   visits `service`, `follow_up` and `return_work` (on the job, OWN-DEC-105). One job may have several visits.
// - Confirming needs a database-level reservation of every required worker and resource (ENT-Reservation, HH-SCH-04)
//   and the preconditions of HH-SCH-06; expiry needs the offer's 24-hour hold to have ended (OWN-DEC-144). Those facts
//   come from the reservation and offer mechanism; without them the events are refused.
// - A window change is not a state event: it adds a window version to the visit's history and never erases the old
//   one. It is allowed while the visit is tentative or confirmed.
import { defineMachine, type EventOf, type Guard } from './engine.js'
import { reasonGiven } from './guards.js'

export const VISIT_STATES = [
  'tentative',
  'confirmed',
  'en_route',
  'arrived',
  'completed',
  'expired',
  'canceled',
  'no_access',
] as const
export type VisitState = (typeof VISIT_STATES)[number]

export const VISIT_PURPOSES = ['site_estimate', 'service', 'follow_up', 'return_work'] as const
export type VisitPurpose = (typeof VISIT_PURPOSES)[number]

/** The purposes of a work visit: linked to the job, never to the project alone. */
export const WORK_VISIT_PURPOSES = ['service', 'follow_up', 'return_work'] as const satisfies readonly VisitPurpose[]

/** A committed visit: confirmed or later on the way to completion (a scheduling task is fulfilled only by one). */
export const COMMITTED_VISIT_STATES = [
  'confirmed',
  'en_route',
  'arrived',
  'completed',
] as const satisfies readonly VisitState[]

/** The states in which a visit's window may change (a new window version; the old ones stay in its history). */
export const WINDOW_CHANGE_STATES = ['tentative', 'confirmed'] as const satisfies readonly VisitState[]

export function isWorkVisitPurpose(p: string): boolean {
  return (WORK_VISIT_PURPOSES as readonly string[]).includes(p)
}

export function canChangeWindow(state: string): boolean {
  return (WINDOW_CHANGE_STATES as readonly string[]).includes(state)
}

export type VisitFacts = {
  /** Every required worker and resource is reserved for the whole window (ENT-Reservation, HH-SCH-04). */
  readonly reserved?: boolean
  /** Every confirmation precondition of HH-SCH-06 holds (checked on the server at commit). */
  readonly preconditionsMet?: boolean
  /** The offer's 24-hour hold has ended without a selection (OWN-DEC-144). */
  readonly holdEnded?: boolean
  readonly reason?: string
}

type G = Guard<VisitFacts>

const reserved: G = (f) =>
  f.reserved === true
    ? null
    : { code: 'NOT_RESERVED', message: 'Every required worker and resource must be reserved for the window first.' }
const preconditions: G = (f) =>
  f.preconditionsMet === true
    ? null
    : { code: 'PRECONDITIONS_NOT_MET', message: 'Every confirmation precondition must hold.' }
const holdEnded: G = (f) =>
  f.holdEnded === true
    ? null
    : { code: 'HOLD_NOT_ENDED', message: 'An offered visit expires only when its 24-hour hold has ended.' }
const reason: G = (f) => reasonGiven(f.reason)

export const VISIT_MACHINE = defineMachine({
  entity: 'visit',
  dimension: 'lifecycle',
  states: VISIT_STATES,
  initial: 'tentative',
  final: ['completed', 'expired', 'canceled', 'no_access'],
  transitions: [
    // Office and Owner confirm; the customer's window selection confirms through the same reservation rules.
    {
      event: 'confirm',
      from: ['tentative'],
      to: 'confirmed',
      actors: ['staff', 'customer'],
      guards: [reserved, preconditions],
    },
    { event: 'expire', from: ['tentative'], to: 'expired', actors: ['system'], guards: [holdEnded] },
    // The assigned worker records On my way, Arrived and Finished.
    { event: 'start_travel', from: ['confirmed'], to: 'en_route', actors: ['staff'] },
    { event: 'arrive', from: ['en_route'], to: 'arrived', actors: ['staff'] },
    { event: 'finish', from: ['arrived'], to: 'completed', actors: ['staff'] },
    // HH-SCH-07: a cancellation carries its reason.
    { event: 'cancel', from: ['confirmed'], to: 'canceled', actors: ['staff'], guards: [reason] },
    { event: 'record_no_access', from: ['confirmed'], to: 'no_access', actors: ['staff'] },
  ],
})
export type VisitEvent = EventOf<typeof VISIT_MACHINE>
