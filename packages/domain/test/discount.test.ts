// Discount requests and their staff verification (TSK-0125; HH-EST-15, OWN-DEC-165, FACT-PRICING-DISCOUNTS). The
// categories are the decided ones; the dates are synthetic.
import { describe, expect, it } from 'vitest'
import {
  DISCOUNT_RESULTS,
  discountFailed,
  discountResultProblem,
  discountState,
  returningWindowStart,
  type DiscountCategory,
  type DiscountResult,
  type DiscountState,
} from '../src/index.js'
import { REDUCTION_CATEGORIES, REQUEST_FORM_SCHEMA } from '../src/request-form.js'

const problem = (
  category: DiscountCategory,
  state: DiscountState,
  result: DiscountResult,
  over: { owner?: boolean; jobHistory?: boolean } = {},
) =>
  discountResultProblem({ category, state, result, owner: over.owner ?? false, jobHistory: over.jobHistory ?? false })

describe('[HH-EST-15] discount verification (TSK-0125, OWN-DEC-165)', () => {
  it('the request form offers the three decided categories, at most one', () => {
    expect(REDUCTION_CATEGORIES).toEqual(['military', 'senior', 'returning_customer'])
    expect(REQUEST_FORM_SCHEMA.properties.requestedDiscount).toEqual({
      type: 'string',
      enum: ['military', 'senior', 'returning_customer'],
    })
  })

  it('asking is pending verification; only a verified or owner-approved discount is verified', () => {
    expect(discountState(null)).toBe('pending')
    expect(DISCOUNT_RESULTS.map((r) => [r, discountState(r)])).toEqual([
      ['verified', 'verified'],
      ['not_verified', 'not_verified'],
      ['owner_review', 'owner_review'],
      ['owner_approved', 'verified'],
      ['owner_declined', 'declined'],
    ])
    expect((['pending', 'verified', 'owner_review'] as const).map(discountFailed)).toEqual([false, false, false])
    expect((['not_verified', 'declined'] as const).map(discountFailed)).toEqual([true, true])
  })

  it('military and senior: a staff check once, while pending; never from job history', () => {
    for (const c of ['military', 'senior'] as const) {
      expect(problem(c, 'pending', 'verified')).toBeNull()
      expect(problem(c, 'pending', 'not_verified')).toBeNull()
      expect(problem(c, 'not_verified', 'verified')).toBe('ALREADY_RECORDED')
      expect(problem(c, 'verified', 'not_verified')).toBe('ALREADY_RECORDED')
      expect(problem(c, 'pending', 'verified', { jobHistory: true })).toBe('STAFF_CHECK_ONLY')
    }
  })

  it('returning customers: from the job history only, checked again while not found', () => {
    expect(problem('returning_customer', 'pending', 'verified')).toBe('JOB_HISTORY_ONLY')
    expect(problem('returning_customer', 'pending', 'verified', { jobHistory: true })).toBeNull()
    expect(problem('returning_customer', 'not_verified', 'verified', { jobHistory: true })).toBeNull()
    expect(problem('returning_customer', 'verified', 'verified', { jobHistory: true })).toBe('ALREADY_RECORDED')
    expect(problem('returning_customer', 'owner_review', 'verified', { jobHistory: true })).toBe('ALREADY_RECORDED')
  })

  it('owner review while pending or not verified; the Owner decides it or overrides a result', () => {
    expect(problem('senior', 'pending', 'owner_review')).toBeNull()
    expect(problem('senior', 'not_verified', 'owner_review')).toBeNull()
    for (const s of ['verified', 'owner_review', 'declined'] as const)
      expect(problem('senior', s, 'owner_review')).toBe('NOT_REVIEWABLE')
    expect(problem('senior', 'owner_review', 'owner_approved')).toBe('OWNER_ONLY')
    expect(problem('senior', 'owner_review', 'owner_approved', { owner: true })).toBeNull()
    expect(problem('senior', 'verified', 'owner_declined', { owner: true })).toBeNull()
    expect(problem('senior', 'declined', 'owner_approved', { owner: true })).toBeNull()
    expect(problem('senior', 'verified', 'owner_approved', { owner: true })).toBe('NO_CHANGE')
    expect(problem('senior', 'declined', 'owner_declined', { owner: true })).toBe('NO_CHANGE')
  })

  it('the returning-customer window counts calendar months on local dates', () => {
    expect(returningWindowStart('2026-10-25', 12)).toBe('2025-10-25')
    expect(returningWindowStart('2026-01-15', 12)).toBe('2025-01-15')
    expect(returningWindowStart('2026-03-31', 1)).toBe('2026-02-28')
    expect(returningWindowStart('2028-02-29', 12)).toBe('2027-02-28')
    expect(returningWindowStart('2026-11-01', 12)).toBe('2025-11-01')
    expect(() => returningWindowStart('2026-13-01', 12)).toThrow()
    expect(() => returningWindowStart('2026-10-25', 0)).toThrow(RangeError)
  })
})
