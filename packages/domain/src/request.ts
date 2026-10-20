// Request (lead) lifecycle (HH-STATE-01 "Request"; ENT-Request; OWN-DEC-100, OWN-DEC-101; FACT-REOPEN-PERIOD).
//
//   received -> reviewing -> needs_information / needs_site_visit / ready_for_estimate -> estimated
//   terminal: declined ("Not a fit" with a reason category), outside_scope, not_served, withdrawn
//   closed_no_response: only 24 h after the final unanswered-question reminder was actually sent; a customer reply
//   within the reopen period reopens the same request for review (never restoring an expired estimate or appointment).
//
// The original submission is never edited: these events change only the request's state. Declining, marking out of
// scope or not served, withdrawing and closing are refused when work was accepted, an appointment exists or money was
// received; those route to the Owner's cancellation and financial review (HH-STATE-02).
import { defineMachine, type Guard } from './engine.js'
import { hoursPassed, noObligations, type ObligationFacts, reasonGiven, withinDays } from './guards.js'

export const REQUEST_STATES = [
  'received',
  'reviewing',
  'needs_information',
  'needs_site_visit',
  'ready_for_estimate',
  'estimated',
  'declined',
  'outside_scope',
  'not_served',
  'withdrawn',
  'closed_no_response',
] as const
export type RequestState = (typeof REQUEST_STATES)[number]

/** The request is closed: every state from which the project may close (ENT-Project). */
export const REQUEST_CLOSED_STATES = [
  'declined',
  'outside_scope',
  'not_served',
  'withdrawn',
  'closed_no_response',
] as const satisfies readonly RequestState[]

/** "Not a fit" reason categories (OWN-DEC-100); "other" needs its documented reason. */
export const NOT_A_FIT_CATEGORIES = ['coverage', 'outside_scope', 'specialist_assessment', 'other'] as const
export type NotAFitCategory = (typeof NOT_A_FIT_CATEGORIES)[number]

export type RequestFacts = ObligationFacts & {
  /** The "Not a fit" reason category. */
  readonly notAFitCategory?: NotAFitCategory
  /** The written reason or evidence note for the decision. */
  readonly reason?: string
  /** When the final unanswered-question reminder was actually sent (a failed delivery never counts). */
  readonly finalReminderSentAt?: Date
  /** Configured: hours after the final reminder before "Closed—no response" (24, OWN-DEC-101). */
  readonly noResponseCloseHours?: number
  /** When the request was closed "Closed—no response". */
  readonly closedAt?: Date
  /** When the customer's reply arrived. */
  readonly customerReplyAt?: Date
  /** Configured: the reopen period in days (30, FACT-REOPEN-PERIOD). */
  readonly reopenPeriodDays?: number
}

type G = Guard<RequestFacts>

const OPEN: readonly RequestState[] = [
  'received',
  'reviewing',
  'needs_information',
  'needs_site_visit',
  'ready_for_estimate',
]
const noObligation: G = (f) => noObligations(f)
const reason: G = (f) => reasonGiven(f.reason)
const notAFitCategory: G = (f) => {
  if (f.notAFitCategory === undefined || !NOT_A_FIT_CATEGORIES.includes(f.notAFitCategory)) {
    return { code: 'REASON_CATEGORY_REQUIRED', message: 'A "Not a fit" reason category is required.' }
  }
  return f.notAFitCategory === 'other' ? reasonGiven(f.reason, 'The documented reason') : null
}
const finalReminderWaited: G = (f, now) =>
  hoursPassed(f.finalReminderSentAt, f.noResponseCloseHours, now, 'the final reminder was sent')
const replyWithinReopenPeriod: G = (f) =>
  withinDays(f.closedAt, f.customerReplyAt, f.reopenPeriodDays, 'reopening by a reply')

export const REQUEST_MACHINE = defineMachine({
  entity: 'request',
  dimension: 'lifecycle',
  states: REQUEST_STATES,
  initial: 'received',
  final: ['estimated', 'declined', 'outside_scope', 'not_served', 'withdrawn'],
  transitions: [
    { event: 'start_review', from: ['received'], to: 'reviewing', actors: ['staff'] },
    {
      event: 'request_information',
      from: ['reviewing', 'needs_site_visit', 'ready_for_estimate'],
      to: 'needs_information',
      actors: ['staff'],
      // Publishing the questions releases the automatic notice (OWN-DEC-98).
      effects: ['customer_notice.questions_published'],
    },
    {
      event: 'customer_replied',
      from: ['needs_information'],
      to: 'reviewing',
      actors: ['customer', 'system'],
      effects: ['reminders.stop', 'staff_review.queue'],
    },
    {
      event: 'require_site_visit',
      from: ['reviewing', 'ready_for_estimate'],
      to: 'needs_site_visit',
      actors: ['staff'],
    },
    {
      event: 'mark_ready_for_estimate',
      from: ['reviewing', 'needs_site_visit'],
      to: 'ready_for_estimate',
      actors: ['staff'],
    },
    // An estimate version for the request was published (the estimate machine records the publish itself).
    { event: 'mark_estimated', from: ['ready_for_estimate'], to: 'estimated', actors: ['staff', 'system'] },
    {
      event: 'decline_not_a_fit',
      from: OPEN,
      to: 'declined',
      actors: ['staff'],
      guards: [notAFitCategory, noObligation],
      effects: ['customer_notice.not_a_fit'],
    },
    {
      event: 'mark_outside_scope',
      from: OPEN,
      to: 'outside_scope',
      actors: ['staff'],
      guards: [reason, noObligation],
      effects: ['customer_notice.not_a_fit'],
    },
    {
      event: 'mark_not_served',
      from: OPEN,
      to: 'not_served',
      actors: ['staff'],
      guards: [reason, noObligation],
      effects: ['customer_notice.not_a_fit'],
    },
    { event: 'withdraw', from: OPEN, to: 'withdrawn', actors: ['staff', 'customer'], guards: [noObligation] },
    {
      event: 'close_no_response',
      from: ['needs_information'],
      to: 'closed_no_response',
      actors: ['staff'],
      guards: [finalReminderWaited, noObligation],
    },
    {
      event: 'reopen_by_reply',
      from: ['closed_no_response'],
      to: 'reviewing',
      actors: ['customer', 'system'],
      guards: [replyWithinReopenPeriod],
      effects: ['staff_review.queue'],
    },
  ],
})
