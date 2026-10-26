// Job gross margin and the advisory target flag (TSK-0131; HH-FIN-20, HH-FIN-17, OWN-DEC-189, FACT-MARGIN-TARGET,
// RULE-MONEY-CENTS). Integer cents and basis points only; nothing here reads a clock.
import { describe, expect, it } from 'vitest'
import { summarizeJobCosts, type CostFigure } from '../src/job-costs.js'
import {
  grossMarginOf,
  jobMarginOf,
  laborCostOf,
  laborRateProblem,
  LABOR_RATE_MAX_CENTS,
  marginBps,
  marginFlagOf,
  marginReviewProblem,
  minutesCost,
  netRevenueOf,
  rateOn,
  type LaborRate,
  type RevenueFacts,
} from '../src/job-margin.js'

const TARGET = 3000
const done = (cents: number): CostFigure => ({ state: 'complete', cents })
const revenue = (f: Partial<RevenueFacts>): RevenueFacts => ({
  finalInvoices: [],
  refunds: [],
  credits: [],
  adjustmentsInProcess: 0,
  writeOffs: 0,
  ...f,
})
const ann = (effectiveOn: string, rateCents: number, burdenCents: number | null = null): LaborRate => ({
  staffUserId: 'ann',
  effectiveOn,
  rateCents,
  burdenCents,
})

describe('[HH-FIN-20][OWN-DEC-189] gross margin in integer cents and basis points', () => {
  it('computes (revenue − direct costs) / revenue, half-up to the basis point, without floating point', () => {
    expect(marginBps(30_000, 100_000)).toBe(3000)
    expect(marginBps(10_000, 30_000)).toBe(3333)
    expect(marginBps(1, 3)).toBe(3333)
    expect(marginBps(2, 3)).toBe(6667)
    // 0.5 of a basis point rounds up; a loss rounds half-up too (towards the larger number).
    expect(marginBps(1, 20_000)).toBe(1)
    expect(marginBps(-1, 20_000)).toBe(0)
    expect(marginBps(-3, 20_000)).toBe(-1)
    // Big amounts stay exact (BigInt): no drift at the dollar scale of any job.
    expect(marginBps(2_999_999_999, 10_000_000_000)).toBe(3000)
    expect(() => marginBps(0.5, 100)).toThrow()
  })

  it('handles zero revenue, losses and negative margins safely', () => {
    expect(marginBps(0, 0)).toBeNull()
    expect(marginBps(-5_000, 0)).toBeNull()
    expect(marginBps(-5_000, -1_000)).toBeNull()
    const zero = grossMarginOf({ state: 'complete', cents: 0 }, done(5_000))
    expect(zero).toEqual({
      state: 'complete',
      revenueCents: 0,
      costCents: 5_000,
      grossProfitCents: -5_000,
      marginBps: null,
    })
    expect(marginFlagOf(zero, TARGET)).toBe('below_target')
    const nothing = grossMarginOf({ state: 'complete', cents: 0 }, done(0))
    expect(marginFlagOf(nothing, TARGET)).toBe('no_revenue')
    const loss = grossMarginOf({ state: 'complete', cents: 100_000 }, done(125_000))
    expect(loss).toMatchObject({ grossProfitCents: -25_000, marginBps: -2500 })
    expect(marginFlagOf(loss, TARGET)).toBe('below_target')
    const total = grossMarginOf({ state: 'complete', cents: 10_000 }, done(40_000))
    expect(total).toMatchObject({ grossProfitCents: -30_000, marginBps: -30000 })
  })

  it('compares with the target exactly: 29.995% is below 30% even though it rounds to 30.00%', () => {
    const at = grossMarginOf({ state: 'complete', cents: 100_000 }, done(70_000))
    expect(marginFlagOf(at, TARGET)).toBe('at_or_above_target')
    const below = grossMarginOf({ state: 'complete', cents: 200_000 }, done(140_010))
    expect(below).toMatchObject({ marginBps: 3000 })
    expect(marginFlagOf(below, TARGET)).toBe('below_target')
    const above = grossMarginOf({ state: 'complete', cents: 100_000 }, done(69_999))
    expect(marginFlagOf(above, TARGET)).toBe('at_or_above_target')
  })

  it('never flags without a final margin or a configured target', () => {
    const provisional = grossMarginOf(
      { state: 'complete', cents: 100_000 },
      { state: 'incomplete', knownCents: 90_000 },
    )
    expect(provisional).toEqual({ state: 'incomplete', gaps: ['costs_incomplete'] })
    expect(marginFlagOf(provisional, TARGET)).toBe('incomplete')
    const final = grossMarginOf({ state: 'complete', cents: 100_000 }, done(90_000))
    expect(marginFlagOf(final, null)).toBe('target_not_configured')
    expect(marginFlagOf(grossMarginOf({ state: 'complete', cents: 0 }, done(1)), null)).toBe('target_not_configured')
  })
})

describe('[HH-FIN-20][OWN-DEC-189] net revenue: discounts, change orders, credits, refunds, deposits once', () => {
  it('is the final invoices (discounts and change orders already in their totals) less refunds and credits', () => {
    // A $1,000.00 job with a 10% discount and a $250.00 change order: the final invoice total is $1,150.00.
    expect(netRevenueOf(revenue({ finalInvoices: [115_000] }))).toEqual({ state: 'complete', cents: 115_000 })
    expect(netRevenueOf(revenue({ finalInvoices: [115_000], refunds: [5_000], credits: [10_000] }))).toEqual({
      state: 'complete',
      cents: 100_000,
    })
  })

  it('recognizes nothing before a final invoice is issued: a deposit is not revenue yet', () => {
    expect(netRevenueOf(revenue({}))).toEqual({ state: 'not_invoiced' })
    const m = grossMarginOf(netRevenueOf(revenue({})), done(10_000))
    expect(m).toEqual({ state: 'incomplete', gaps: ['not_invoiced'] })
  })

  it('leaves revenue incomplete while a refund or credit is in process, or a write-off exists (NOT CONFIGURED)', () => {
    expect(netRevenueOf(revenue({ finalInvoices: [50_000], adjustmentsInProcess: 1 }))).toEqual({
      state: 'incomplete',
      knownCents: 50_000,
      gaps: ['adjustment_in_process'],
    })
    expect(netRevenueOf(revenue({ finalInvoices: [50_000], writeOffs: 1 }))).toMatchObject({
      gaps: ['write_off_not_configured'],
    })
    expect(grossMarginOf(netRevenueOf(revenue({ finalInvoices: [50_000], writeOffs: 1 })), done(1))).toEqual({
      state: 'incomplete',
      gaps: ['write_off_not_configured'],
    })
  })

  it('takes integer positive magnitudes only', () => {
    expect(() => netRevenueOf(revenue({ finalInvoices: [10.5] }))).toThrow()
    expect(() => netRevenueOf(revenue({ finalInvoices: [100], refunds: [-1] }))).toThrow()
  })
})

describe('[HH-FIN-20][HH-FIN-17][OWN-DEC-189] labor cost from the Owner-entered rate per worker', () => {
  it('uses the rate in force on the visit date; a later entry wins a tie', () => {
    const rates = [ann('2026-01-01', 2_000), ann('2026-06-01', 2_500), ann('2026-06-01', 2_600)]
    expect(rateOn(rates, 'ann', '2025-12-31')).toBeNull()
    expect(rateOn(rates, 'ann', '2026-05-31')?.rateCents).toBe(2_000)
    expect(rateOn(rates, 'ann', '2026-06-01')?.rateCents).toBe(2_600)
    expect(rateOn(rates, 'ben', '2026-06-01')).toBeNull()
  })

  it('rounds each worker-visit line once, half-up, and totals the rounded lines', () => {
    expect(minutesCost(90, 2_000)).toBe(3_000)
    expect(minutesCost(1, 2_550)).toBe(43) // 42.5 cents
    expect(minutesCost(1, 2_530)).toBe(42) // 42.1666 cents
    const c = laborCostOf(
      [
        { staffUserId: 'ann', localDate: '2026-06-02', minutes: 1 },
        { staffUserId: 'ann', localDate: '2026-06-03', minutes: 1 },
      ],
      [ann('2026-01-01', 2_550)],
      true,
    )
    expect(c.labor).toEqual({ state: 'complete', cents: 86 })
  })

  it('is NOT CONFIGURED without a rate, incomplete while a time or rate is missing or work remains', () => {
    const times = [
      { staffUserId: 'ann', localDate: '2026-06-02', minutes: 120 },
      { staffUserId: 'ben', localDate: '2026-06-02', minutes: 60 },
    ]
    expect(laborCostOf(times, [], true).labor).toEqual({ state: 'not_configured' })
    expect(laborCostOf(times, [ann('2026-01-01', 3_000)], true).labor).toEqual({
      state: 'incomplete',
      knownCents: 6_000,
    })
    const both = [ann('2026-01-01', 3_000), { ...ann('2026-01-01', 2_400), staffUserId: 'ben' }]
    expect(laborCostOf(times, both, true).labor).toEqual({ state: 'complete', cents: 8_400 })
    expect(laborCostOf(times, both, false).labor).toEqual({ state: 'incomplete', knownCents: 8_400 })
    expect(laborCostOf([{ staffUserId: 'ann', localDate: '2026-06-02', minutes: null }], both, true).labor).toEqual({
      state: 'not_recorded',
    })
    expect(laborCostOf([], both, true).labor).toEqual({ state: 'not_configured' })
  })

  it('counts burden only where the Owner entered it; a $0.00 rate is a stated zero, never an assumed one', () => {
    const t = [{ staffUserId: 'ann', localDate: '2026-06-02', minutes: 60 }]
    expect(laborCostOf(t, [ann('2026-01-01', 3_000)], true).burden).toEqual({ state: 'not_configured' })
    expect(laborCostOf(t, [ann('2026-01-01', 3_000, 450)], true).burden).toEqual({ state: 'complete', cents: 450 })
    expect(laborCostOf(t, [ann('2026-01-01', 0, 0)], true)).toMatchObject({
      labor: { state: 'complete', cents: 0 },
      burden: { state: 'complete', cents: 0 },
    })
  })

  it('checks a rate entry: whole cents from $0.00 to the limit', () => {
    expect(laborRateProblem({ rateCents: 0, burdenCents: null })).toBeNull()
    expect(laborRateProblem({ rateCents: LABOR_RATE_MAX_CENTS, burdenCents: LABOR_RATE_MAX_CENTS })).toBeNull()
    expect(laborRateProblem({ rateCents: -1, burdenCents: null })).toBe('RATE_INVALID')
    expect(laborRateProblem({ rateCents: 25.5, burdenCents: null })).toBe('RATE_INVALID')
    expect(laborRateProblem({ rateCents: 1, burdenCents: LABOR_RATE_MAX_CENTS + 1 })).toBe('BURDEN_INVALID')
  })

  it('makes the job cost total final only once labor and burden are (summarizeJobCosts)', () => {
    const t = [{ staffUserId: 'ann', localDate: '2026-06-02', minutes: 60 }]
    const labor = laborCostOf(t, [ann('2026-01-01', 3_000, 450)], true)
    const s = summarizeJobCosts({
      estimateLines: [],
      changeOrders: 0,
      entries: [{ category: 'materials', amountCents: 10_000 }],
      confirmed: ['materials', 'purchase', 'subcontractor', 'rental', 'disposal', 'other'],
      times: t,
      laborCost: { labor: labor.labor, burden: labor.burden },
    })
    expect(s.actualTotal).toEqual({ state: 'complete', cents: 13_450 })
    expect(s.incompleteLines).toEqual([])
    const without = summarizeJobCosts({ estimateLines: [], changeOrders: 0, entries: [], confirmed: [], times: t })
    expect(without.lines.find((l) => l.line === 'labor')?.actual).toEqual({ state: 'not_configured' })
  })
})

describe('[HH-FIN-20][OWN-DEC-189] estimated versus actual margin, variance and the advisory flag', () => {
  it('shows the variance only between two final margins', () => {
    const m = jobMarginOf({
      estimatedPriceCents: 100_000,
      estimatedCosts: done(60_000),
      revenue: { state: 'complete', cents: 100_000 },
      actualCosts: done(75_000),
      targetBps: TARGET,
    })
    expect(m.estimated).toMatchObject({ marginBps: 4000, grossProfitCents: 40_000 })
    expect(m.actual).toMatchObject({ marginBps: 2500, grossProfitCents: 25_000 })
    expect(m.varianceBps).toBe(-1500)
    expect(m.profitVarianceCents).toBe(-15_000)
    expect(m.flag).toBe('below_target')
    expect(m.estimatedFlag).toBe('at_or_above_target')
  })

  it('keeps a change order without a cost estimate, or no estimate, incomplete on the estimated side', () => {
    const s = summarizeJobCosts({
      estimateLines: [{ materialCents: 10_000, laborCents: 20_000 }],
      changeOrders: 1,
      entries: [],
      confirmed: [],
      times: [],
    })
    const m = jobMarginOf({
      estimatedPriceCents: 125_000,
      estimatedCosts: s.estimatedTotal,
      revenue: { state: 'not_invoiced' },
      actualCosts: s.actualTotal,
      targetBps: TARGET,
    })
    expect(m.estimated).toEqual({ state: 'incomplete', gaps: ['estimate_incomplete'] })
    expect(m.actual).toEqual({ state: 'incomplete', gaps: ['not_invoiced', 'costs_incomplete'] })
    expect(m.varianceBps).toBeNull()
    expect(m.flag).toBe('incomplete')
    const none = jobMarginOf({
      estimatedPriceCents: null,
      estimatedCosts: { state: 'not_recorded' },
      revenue: { state: 'complete', cents: 1 },
      actualCosts: done(0),
      targetBps: TARGET,
    })
    expect(none.estimated).toEqual({ state: 'incomplete', gaps: ['no_estimate'] })
  })

  it('records a reason only for a job flagged below the target; "other" needs its note', () => {
    expect(marginReviewProblem('below_target', { reason: 'underpricing', note: null })).toBeNull()
    expect(marginReviewProblem('below_target', { reason: 'other', note: ' ' })).toBe('NOTE_REQUIRED')
    expect(marginReviewProblem('below_target', { reason: 'other', note: 'Synthetic note' })).toBeNull()
    for (const flag of ['at_or_above_target', 'incomplete', 'target_not_configured', 'no_revenue'] as const)
      expect(marginReviewProblem(flag, { reason: 'site_conditions', note: null })).toBe('MARGIN_NOT_BELOW_TARGET')
  })
})
