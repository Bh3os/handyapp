// Discount requests and their staff verification (TSK-0125; HH-EST-15, OWN-DEC-165, FACT-PRICING-DISCOUNTS,
// RULE-NO-INVENTED-FACTS).
// - The customer asks for one discount when sending the request (military, senior or returning customer; one per job,
//   chosen by the customer). Asking is never approval: the discount stays pending verification until a result is
//   recorded, and only a verified discount can be part of an approved price.
// - A recorded result holds the category, the result, who recorded it and when, and nothing else (no document image,
//   ID number, Social Security number or full date of birth). The results, latest first, give the discount's state:
//     none recorded              -> pending        (pending verification)
//     verified, owner_approved   -> verified
//     not_verified               -> not_verified   (staff could not verify it; the Owner may still review it)
//     owner_review               -> owner_review   (sent to the Owner: the standard process cannot verify it)
//     owner_declined             -> declined
// - Military and senior eligibility is checked by staff looking at documentation or a photo ID; returning-customer
//   eligibility only from the matched completed job history (the server's check, never a staff judgement). The Owner
//   decides an owner review, and may override a recorded result (owner_approved, owner_declined).
// - PROPOSED (OQ-DISCOUNT-REQUEST-DETAILS): a staff result is recorded once (a later change is the Owner's); the job
//   history may be checked again while it found no match (records may have been linked since); owner review is
//   offered while the discount is pending or not verified.
import { isLocalDate, LocalTimeError, type LocalDate } from './local-time.js'

/** The discount categories of FACT-PRICING-DISCOUNTS (the codes of discount.rule). */
export const DISCOUNT_CATEGORIES = ['military', 'senior', 'returning_customer'] as const
export type DiscountCategory = (typeof DISCOUNT_CATEGORIES)[number]

/** What a verification record says. */
export const DISCOUNT_RESULTS = [
  'verified',
  'not_verified',
  'owner_review',
  'owner_approved',
  'owner_declined',
] as const
export type DiscountResult = (typeof DISCOUNT_RESULTS)[number]

/** The state of a requested discount, from its latest result. */
export const DISCOUNT_STATES = ['pending', 'verified', 'not_verified', 'owner_review', 'declined'] as const
export type DiscountState = (typeof DISCOUNT_STATES)[number]

export const isDiscountCategory = (v: unknown): v is DiscountCategory =>
  typeof v === 'string' && (DISCOUNT_CATEGORIES as readonly string[]).includes(v)

/** The state a latest result leaves the discount in; no result yet: pending verification. */
export function discountState(latest: DiscountResult | null): DiscountState {
  switch (latest) {
    case null:
      return 'pending'
    case 'verified':
    case 'owner_approved':
      return 'verified'
    case 'not_verified':
      return 'not_verified'
    case 'owner_review':
      return 'owner_review'
    case 'owner_declined':
      return 'declined'
  }
}

/** A verification that failed: a version carrying the discount is neither published nor approved. */
export const discountFailed = (state: DiscountState): boolean => state === 'not_verified' || state === 'declined'

/** Why a result cannot be recorded now. */
export const DISCOUNT_RESULT_PROBLEMS = [
  // owner_approved and owner_declined are the Owner's.
  'OWNER_ONLY',
  // Returning-customer eligibility comes from the job history only; military and senior from a staff check only.
  'JOB_HISTORY_ONLY',
  'STAFF_CHECK_ONLY',
  // A staff result is recorded once; changing it is an Owner decision.
  'ALREADY_RECORDED',
  // Owner review is offered while the discount is pending or not verified.
  'NOT_REVIEWABLE',
  // The result would leave the discount as it is.
  'NO_CHANGE',
] as const
export type DiscountResultProblem = (typeof DISCOUNT_RESULT_PROBLEMS)[number]

/** How a result reaches the server: a staff check, the server's job-history check, or an owner-review step. */
export type DiscountResultInput = {
  readonly category: DiscountCategory
  readonly state: DiscountState
  readonly result: DiscountResult
  /** The person recording it is the Owner. */
  readonly owner: boolean
  /** The result is the server's job-history check (returning customers). */
  readonly jobHistory: boolean
}

/** The reason a result cannot be recorded in the discount's current state, or null when it can. */
export function discountResultProblem(input: DiscountResultInput): DiscountResultProblem | null {
  const { category, state, result } = input
  if (result === 'owner_approved' || result === 'owner_declined') {
    if (!input.owner) return 'OWNER_ONLY'
    return discountState(result) === state ? 'NO_CHANGE' : null
  }
  if (result === 'owner_review') return state === 'pending' || state === 'not_verified' ? null : 'NOT_REVIEWABLE'
  // verified or not_verified: the standard process.
  if (category === 'returning_customer') {
    if (!input.jobHistory) return 'JOB_HISTORY_ONLY'
    return state === 'pending' || state === 'not_verified' ? null : 'ALREADY_RECORDED'
  }
  if (input.jobHistory) return 'STAFF_CHECK_ONLY'
  return state === 'pending' ? null : 'ALREADY_RECORDED'
}

/**
 * The first local date of the returning-customer window: the same calendar day `months` months before `today`
 * (or the last day of a shorter month: 12 months before 2028-02-29 is 2027-02-28). Calendar arithmetic on local dates,
 * so no clock change can move it. A completed job counts when its completion date (business
 * time zone) is on or after this date (PROPOSED reading of "within the preceding 12 months").
 */
export function returningWindowStart(today: LocalDate, months: number): LocalDate {
  if (!isLocalDate(today)) throw new LocalTimeError(`Expected YYYY-MM-DD, got ${today}`)
  if (!Number.isInteger(months) || months < 1)
    throw new RangeError('the window is a whole number of months, at least 1')
  const [y, m, d] = today.split('-').map(Number) as [number, number, number]
  const index = y * 12 + (m - 1) - months
  const year = Math.floor(index / 12)
  const month = (index % 12) + 1
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const day = Math.min(d, last)
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
