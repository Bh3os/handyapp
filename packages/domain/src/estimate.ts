// Estimate version lifecycle (TSK-0055; HH-EST-04, HH-STATE-01 "Estimate revision", ENT-EstimateVersion, OWN-DEC-102,
// OWN-DEC-103, OWN-DEC-118, FACT-ESTIMATE-VALIDITY, T32).
//
//   draft <-> in_review                   saved freely; in_review is the optional pre-publish review (request review)
//   draft / in_review -> published        Publish: the readiness check passed and no review hold blocks (HH-LEAD-04)
//   published -> superseded               a newer version of the same estimate is being published (system)
//   published -> accepted                 the verified customer approves the current, unexpired version (TSK-0057)
//   published -> declined                 the customer declines, or staff record the customer's decline
//   published -> expired                  the validity period ended (system job), or staff expire it now
//   published -> withdrawn                staff withdraw it
//
// - Final states: accepted, declined, expired, withdrawn and superseded. No event leaves them, so a superseded or an
//   expired version can never be accepted; the database enforces the same table (migration 0032).
// - Only the current, unexpired published version can be accepted: `accept` needs the version to be the latest
//   published one and its valid-until time still ahead. A published version whose validity has passed reads as
//   expired (`effectiveEstimateState`) even before the expiry job records it.
// - Editing a published or accepted version is never a transition: it is a new version (revise), which needs its own
//   publishing and approval; publishing it supersedes the version published before it.
// - PROPOSED details (not owner-decided): `return_to_draft` from review, a written reason for withdrawing and for
//   expiring early, and that the system expiry needs the valid-until time to have passed.
// - The valid-until time (FACT-ESTIMATE-VALIDITY): the configured number of days from publishing, counted in the
//   business time zone; PROPOSED there: valid until 11:59:59 PM business time on the last day (estimateValidUntil).
import { zonedParts, zonedTimeToUtc } from './business-hours.js'
import { defineMachine, type Guard, type Problem } from './engine.js'
import { reasonGiven } from './guards.js'

export const ESTIMATE_VERSION_STATES = [
  'draft',
  'in_review',
  'published',
  'accepted',
  'declined',
  'expired',
  'withdrawn',
  'superseded',
] as const
export type EstimateVersionState = (typeof ESTIMATE_VERSION_STATES)[number]

/** Versions whose content can still change. */
export const EDITABLE_ESTIMATE_STATES = ['draft', 'in_review'] as const satisfies readonly EstimateVersionState[]
/** Versions no event leaves. */
export const FINAL_ESTIMATE_STATES = [
  'accepted',
  'declined',
  'expired',
  'withdrawn',
  'superseded',
] as const satisfies readonly EstimateVersionState[]

export type EstimateVersionFacts = {
  /** Publish: the codes of every readiness problem the server found under the row lock (empty when ready). */
  readonly readinessProblems?: readonly string[]
  /** Publish: review holds on the project's requests that are open or under review (HH-LEAD-04). */
  readonly blockingReviewHolds?: number
  /** Accept and the system expiry: when the version stops being valid. */
  readonly validUntil?: Date
  /** Supersede: a newer version of the same estimate is being published in the same transaction. */
  readonly newerVersionPublishing?: boolean
  /** Accept: a newer version of the same estimate is published or accepted. */
  readonly newerVersionPublished?: boolean
  /** Withdraw and expire early: the written reason (PROPOSED). Decline: optional. */
  readonly reason?: string
}

type G = Guard<EstimateVersionFacts>

const ready: G = (f) => {
  if (f.readinessProblems === undefined)
    return { code: 'FACTS_MISSING', message: 'The server must check: publish readiness.' }
  return f.readinessProblems.length === 0
    ? null
    : { code: 'NOT_READY', message: `Resolve first: ${f.readinessProblems.join(', ')}.` }
}
const noReviewHold: G = (f) => {
  if (f.blockingReviewHolds === undefined)
    return { code: 'FACTS_MISSING', message: 'The server must check: review holds.' }
  return f.blockingReviewHolds === 0
    ? null
    : { code: 'REVIEW_HOLD_OPEN', message: 'A review hold must be resolved before publishing.' }
}
const newerBeingPublished: G = (f) =>
  f.newerVersionPublishing === true
    ? null
    : { code: 'NO_NEWER_VERSION', message: 'Only publishing a newer version supersedes this one.' }
const isCurrent: G = (f) => {
  if (f.newerVersionPublished === undefined)
    return { code: 'FACTS_MISSING', message: 'The server must check: newer versions.' }
  return f.newerVersionPublished
    ? { code: 'SUPERSEDED', message: 'A newer version of this estimate exists; review that one.' }
    : null
}
const stillValid: G = (f, now) => {
  if (f.validUntil === undefined) return { code: 'FACTS_MISSING', message: 'The server must check: valid until.' }
  return now.getTime() < f.validUntil.getTime()
    ? null
    : { code: 'EXPIRED', message: 'This estimate has expired; request an updated estimate.' }
}
const validityPassed: G = (f, now) => {
  if (f.validUntil === undefined) return { code: 'FACTS_MISSING', message: 'The server must check: valid until.' }
  return now.getTime() >= f.validUntil.getTime()
    ? null
    : { code: 'TOO_EARLY', message: 'The validity period has not ended yet.' }
}
const reason: G = (f) => reasonGiven(f.reason)

export const ESTIMATE_VERSION_MACHINE = defineMachine({
  entity: 'estimate_version',
  dimension: 'lifecycle',
  states: ESTIMATE_VERSION_STATES,
  initial: 'draft',
  final: [...FINAL_ESTIMATE_STATES],
  transitions: [
    { event: 'request_review', from: ['draft'], to: 'in_review', actors: ['staff'] },
    { event: 'return_to_draft', from: ['in_review'], to: 'draft', actors: ['staff'] },
    {
      event: 'publish',
      from: ['draft', 'in_review'],
      to: 'published',
      actors: ['staff'],
      guards: [ready, noReviewHold],
      // In the same transaction: the version published before it is superseded, the customer PDF is stored with its
      // hash, the estimate-ready notice is queued (FACT-AUTOMATIC-MESSAGES #8), the validity expiry job is scheduled
      // and a request ready for its estimate is marked estimated.
      effects: [
        'estimate.supersede_previous',
        'estimate.store_customer_pdf',
        'notify.estimate.ready',
        'estimate.schedule_expiry',
        'request.mark_estimated',
      ],
    },
    {
      event: 'supersede',
      from: ['published'],
      to: 'superseded',
      actors: ['system'],
      guards: [newerBeingPublished],
    },
    {
      event: 'accept',
      from: ['published'],
      to: 'accepted',
      actors: ['customer'],
      guards: [isCurrent, stillValid],
      effects: ['approval.record'],
    },
    { event: 'decline', from: ['published'], to: 'declined', actors: ['customer', 'staff'] },
    { event: 'expire', from: ['published'], to: 'expired', actors: ['system'], guards: [validityPassed] },
    { event: 'expire_now', from: ['published'], to: 'expired', actors: ['staff'], guards: [reason] },
    { event: 'withdraw', from: ['published'], to: 'withdrawn', actors: ['staff'], guards: [reason] },
  ],
})

export type EstimateVersionEvent = (typeof ESTIMATE_VERSION_MACHINE)['transitions'][number]['event']

/**
 * The state a version is in for everyone reading it now: a published version past its valid-until time reads as
 * expired before the expiry job records it, so nobody is shown an offer that can no longer be accepted.
 */
export function effectiveEstimateState(
  state: EstimateVersionState,
  validUntil: Date | null,
  now: Date,
): EstimateVersionState {
  return state === 'published' && validUntil !== null && now.getTime() >= validUntil.getTime() ? 'expired' : state
}

/** True for a version whose content can still be edited. */
export function isEditableEstimateState(state: string): boolean {
  return (EDITABLE_ESTIMATE_STATES as readonly string[]).includes(state)
}

/**
 * Why a version cannot be accepted now (the approval transaction of TSK-0057 runs this under the row lock, and the
 * database refuses the same cases): null when it can, otherwise the problem. The current version to show instead is
 * the caller's to look up.
 */
export function acceptanceProblem(
  state: EstimateVersionState,
  facts: Pick<EstimateVersionFacts, 'validUntil' | 'newerVersionPublished'>,
  now: Date,
): Problem | null {
  if (state === 'superseded') return { code: 'SUPERSEDED', message: 'A newer version of this estimate exists.' }
  if (state === 'expired') return { code: 'EXPIRED', message: 'This estimate has expired.' }
  if (state !== 'published') return { code: 'NOT_PUBLISHED', message: `An estimate that is ${state} is not approved.` }
  return isCurrent(facts, now) ?? stillValid(facts, now)
}

/**
 * The end of an estimate version's validity (FACT-ESTIMATE-VALIDITY): `days` calendar days after the day it was
 * published, counted in the business time zone `zone`, valid until 11:59:59 PM business time on that last day
 * (PROPOSED reading in the fact). Returned as the last millisecond of that day, so a version is valid while
 * `now < validUntil`. Days on which the clocks change are whole local days. Throws for an unknown zone.
 */
export function estimateValidUntil(publishedAt: Date, days: number, zone: string): Date {
  if (!Number.isInteger(days) || days < 1) throw new RangeError('the validity is a whole number of days, at least 1')
  const day = zonedParts(publishedAt, zone)
  const following = new Date(Date.UTC(day.year, day.month - 1, day.day + days + 1))
  const midnight = zonedTimeToUtc(
    {
      year: following.getUTCFullYear(),
      month: following.getUTCMonth() + 1,
      day: following.getUTCDate(),
      hour: 0,
      minute: 0,
    },
    zone,
  )
  return new Date(midnight.getTime() - 1)
}
