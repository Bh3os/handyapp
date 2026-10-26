// Window offers (TSK-0063; HH-SCH-11, HH-LEAD-07, HH-SCH-04, HH-SCH-05, ENT-Reservation, ENT-Visit, OWN-DEC-99,
// OWN-DEC-105, OWN-DEC-144).
//
//   open -> selected                 the customer picks one window while it is held: its holds become the booking
//   open -> other_times_requested    the customer asks for other times while it is held: every hold is released
//   open -> withdrawn                staff withdraw it: every hold is released
//   open -> expired                  the hold time passed with no selection: every hold ends and the visit expires
//
// TSK-0145 (OWN-DEC-194 B1, B4): an offer is saved as a draft first.
//
//   draft -> open                    published to the customer: its holds start and the hold time runs from now
//   draft -> discarded               staff discard a draft that was never published (nothing was held)
//   open -> replaced                 staff replace it, with a reason, by the visit's draft published at the same time
//
// - One mechanism for estimate visits and work visits: staff offer the configured number of windows (OWN-DEC-99,
//   OWN-DEC-105: 2-3) of one tentative visit, each holding the visit's whole team for its reserved range until the
//   offer expires (OWN-DEC-144: 24 hours from the offer's publication, OWN-DEC-194 B1; a draft holds nothing and
//   starts no clock). A hold is never a confirmed booking (HH-SCH-05).
// - One active (open) offer per visit; a published offer is never changed: staff withdraw or replace it, each with a
//   recorded reason (OWN-DEC-194 B4).
// - The customer answers only while the offer is held; the expiry happens only once the hold time has passed. The
//   database enforces the same with its own clock, so a selection and the expiry never both happen.
// - Pure and browser-safe.
import { defineMachine, type EventOf, type Guard } from './engine.js'
import { reasonGiven } from './guards.js'
import type { Interval } from './capacity.js'

export const WINDOW_OFFER_STATES = [
  'draft',
  'discarded',
  'open',
  'selected',
  'other_times_requested',
  'withdrawn',
  'replaced',
  'expired',
] as const
export type WindowOfferState = (typeof WINDOW_OFFER_STATES)[number]

/** The configured offer policy (scheduling.window_offers). */
export type WindowOfferPolicy = {
  readonly holdHours: number
  readonly minWindows: number
  readonly maxWindows: number
}

export type WindowOfferFacts = {
  /** The instant the action happens. */
  readonly now?: Date
  /** When the offer's hold ends (offered at + hold hours). */
  readonly expiresAt?: Date
  /** The selected position is one of the offer's windows. */
  readonly knownPosition?: boolean
  readonly reason?: string
}

type G = Guard<WindowOfferFacts>

const held: G = (f) =>
  f.now && f.expiresAt && f.now.getTime() < f.expiresAt.getTime()
    ? null
    : { code: 'OFFER_EXPIRED', message: 'The offered windows are no longer held.' }
const holdEnded: G = (f) =>
  f.now && f.expiresAt && f.now.getTime() >= f.expiresAt.getTime()
    ? null
    : { code: 'HOLD_NOT_ENDED', message: 'An offer expires only when its hold time has passed.' }
const knownPosition: G = (f) =>
  f.knownPosition === true ? null : { code: 'POSITION_UNKNOWN', message: 'Choose one of the offered windows.' }
const reason: G = (f) => reasonGiven(f.reason)

export const WINDOW_OFFER_MACHINE = defineMachine({
  entity: 'window_offer',
  dimension: 'lifecycle',
  states: WINDOW_OFFER_STATES,
  initial: 'draft',
  final: ['discarded', 'selected', 'other_times_requested', 'withdrawn', 'replaced', 'expired'],
  transitions: [
    // B1: publishing starts the hold time; the server rechecks every window, the team and the visit's conditions.
    { event: 'publish', from: ['draft'], to: 'open', actors: ['staff'] },
    { event: 'discard', from: ['draft'], to: 'discarded', actors: ['staff'] },
    { event: 'select', from: ['open'], to: 'selected', actors: ['customer'], guards: [held, knownPosition] },
    { event: 'request_other_times', from: ['open'], to: 'other_times_requested', actors: ['customer'], guards: [held] },
    // OWN-DEC-194 B4: a withdrawal or a replacement carries the staff member's reason.
    { event: 'withdraw', from: ['open'], to: 'withdrawn', actors: ['staff'], guards: [reason] },
    { event: 'replace', from: ['open'], to: 'replaced', actors: ['staff'], guards: [reason] },
    { event: 'expire', from: ['open'], to: 'expired', actors: ['system'], guards: [holdEnded] },
  ],
})
export type WindowOfferEvent = EventOf<typeof WINDOW_OFFER_MACHINE>

/** When an offer published at `publishedAt` stops holding its windows (B1: never counted from a draft). */
export function holdExpiresAt(publishedAt: Date, policy: Pick<WindowOfferPolicy, 'holdHours'>): Date {
  return new Date(publishedAt.getTime() + policy.holdHours * 3_600_000)
}

export type OfferProblem =
  | { readonly code: 'OFFER_WINDOW_COUNT'; readonly min: number; readonly max: number }
  | { readonly code: 'OFFER_WINDOWS_OVERLAP'; readonly positions: readonly [number, number] }

/**
 * What is wrong with the windows of one offer before anything is checked against capacity: their number must be
 * within the policy, and their reserved ranges may not overlap (the same team is held for each). Positions are 1-based.
 */
export function offerProblems(reserved: readonly Interval[], policy: WindowOfferPolicy): OfferProblem[] {
  const out: OfferProblem[] = []
  if (reserved.length < policy.minWindows || reserved.length > policy.maxWindows)
    out.push({ code: 'OFFER_WINDOW_COUNT', min: policy.minWindows, max: policy.maxWindows })
  for (let i = 0; i < reserved.length; i++)
    for (let j = i + 1; j < reserved.length; j++) {
      const a = reserved[i] as Interval
      const b = reserved[j] as Interval
      if (a.start < b.end && b.start < a.end) out.push({ code: 'OFFER_WINDOWS_OVERLAP', positions: [i + 1, j + 1] })
    }
  return out
}
