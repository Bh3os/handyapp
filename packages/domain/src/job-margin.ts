// Job gross margin and the advisory target flag (TSK-0131; HH-FIN-20, HH-FIN-17, HH-DATA-10, OWN-DEC-189,
// OWN-DEC-188, FACT-MARGIN-TARGET, RULE-MONEY-CENTS, RULE-NO-INVENTED-FACTS, RULE-HUMAN-REVIEW).
// - Gross margin = (net job revenue − direct job costs) / net job revenue (OWN-DEC-189 item 2), from integer cents; the
//   percentage is in basis points, half-up, computed exactly in BigInt (no floating point). A comparison with the
//   target compares the exact fractions, never a rounded percentage, so 29.995% is below a 30% target.
// - Net revenue (actual) is invoiced revenue (the `invoiced` report: final invoices issued, partially paid or paid;
//   their totals already hold approved discounts, change orders and credit change orders, and credit the deposit, so
//   the deposit counts once) less refunds that succeeded and credits issued or applied (the `refunds_and_credits`
//   report). Payments never count: a partial payment changes no revenue. A job with no final invoice issued has no
//   recognized revenue yet: a deposit is not revenue before it is recognized (OWN-DEC-189 item 10; the recognition
//   rule is the CPA's). A refund or credit still in process, or a write-off (its presentation is NOT CONFIGURED),
//   leaves revenue incomplete.
// - Direct costs are the job cost report's lines (job-costs.ts): labor from the Owner-entered labor cost rate per
//   worker (laborCostOf), burden where the Owner entered it, and the recorded categories. Overhead and business net
//   profit are never part of it (OWN-DEC-189 item 14).
// - A margin is final only when revenue and every cost line are complete; otherwise it is incomplete and carries no
//   percentage, only why (OWN-DEC-189 item 9): a provisional margin is never shown as a result. Zero or negative
//   revenue gives no percentage; the gross profit (a loss) is still shown.
// - The flag is advisory (OWN-DEC-189 item 8): it never blocks accepting, publishing, completing or invoicing a job.
// PROPOSED (OQ-JOB-MARGIN-DETAILS): the revenue reading, labor complete only once the work is done, rates by the
// visit's date, the reason list, and the rate limit.
import type { CostFigure } from './job-costs.js'

/** The reasons the Owner records for a low-margin job (OWN-DEC-189 item 13; "other" PROPOSED, with a note). */
export const MARGIN_REASONS = [
  'underpricing',
  'material_overrun',
  'additional_labor',
  'site_conditions',
  'other',
] as const
export type MarginReason = (typeof MARGIN_REASONS)[number]

/** PROPOSED: the largest labor cost or burden rate per hour, in cents ($1,000.00). */
export const LABOR_RATE_MAX_CENTS = 100_000

const safe = (n: number, what: string) => {
  if (!Number.isSafeInteger(n)) throw new RangeError(`${what} must be integer cents: ${n}`)
  return n
}
const sum = (xs: readonly number[]) => xs.reduce((s, x) => s + x, 0)

/** Half-up integer division of two BigInts with a positive divisor. */
function halfUp(num: bigint, den: bigint): bigint {
  const n = 2n * num + den
  const d = 2n * den
  const q = n / d
  return n % d !== 0n && n < 0n ? q - 1n : q
}

/** Gross profit over revenue in basis points, half-up; null when revenue is zero or negative (no percentage). */
export function marginBps(profitCents: number, revenueCents: number): number | null {
  safe(profitCents, 'profit')
  safe(revenueCents, 'revenue')
  if (revenueCents <= 0) return null
  return Number(halfUp(BigInt(profitCents) * 10_000n, BigInt(revenueCents)))
}

/** Exactly: is profit / revenue below targetBps / 10000? (no rounding; revenue > 0) */
function fractionBelow(profitCents: number, revenueCents: number, targetBps: number): boolean {
  return BigInt(profitCents) * 10_000n < BigInt(targetBps) * BigInt(revenueCents)
}

// --- Labor cost from the Owner-entered rates ------------------------------------------------------------------------

/** One Owner-entered rate of a worker, in force from a local date until a later one (finance.labor_cost_rates). */
export type LaborRate = {
  readonly staffUserId: string
  /** The first local date (business zone) the rate applies to. */
  readonly effectiveOn: string
  /** Labor cost per hour, integer cents (0 allowed: the Owner states the time carries no labor cost). */
  readonly rateCents: number
  /** Employee burden per hour, integer cents; null: not known (OWN-DEC-189 "where known"). */
  readonly burdenCents: number | null
}

/** A worker's elapsed time on one visit; minutes null: not known (missing or not finished). */
export type DatedTime = { readonly staffUserId: string; readonly localDate: string; readonly minutes: number | null }

/** The rate of a worker in force on a date: the latest effective on or before it (later entries win a tie). */
export function rateOn(rates: readonly LaborRate[], staffUserId: string, localDate: string): LaborRate | null {
  let best: LaborRate | null = null
  for (const r of rates)
    if (r.staffUserId === staffUserId && r.effectiveOn <= localDate && (!best || r.effectiveOn >= best.effectiveOn))
      best = r
  return best
}

/** Minutes at a rate per hour, in cents, rounded once half-up (RULE-MONEY-CENTS: once per line). */
export function minutesCost(minutes: number, centsPerHour: number): number {
  if (!Number.isSafeInteger(minutes) || minutes < 0) throw new RangeError(`minutes must be a whole number: ${minutes}`)
  if (!Number.isSafeInteger(centsPerHour) || centsPerHour < 0) throw new RangeError('a rate is non-negative cents')
  return Number(halfUp(BigInt(minutes) * BigInt(centsPerHour), 60n))
}

export type LaborCostLine = {
  readonly staffUserId: string
  readonly localDate: string
  readonly minutes: number | null
  /** The rate in force that day; null: none entered (NOT CONFIGURED for this worker). */
  readonly rateCents: number | null
  readonly burdenRateCents: number | null
  readonly laborCents: number | null
  readonly burdenCents: number | null
}

export type LaborCost = {
  readonly labor: CostFigure
  readonly burden: CostFigure
  readonly lines: readonly LaborCostLine[]
}

/** A figure from per-line amounts: complete when every line is known and nothing more can come. */
function figureOf(values: readonly (number | null)[], final: boolean, anyRate: boolean): CostFigure {
  const known = values.filter((v): v is number => v !== null)
  // No rate for any time (or no time yet, so no worker's rate applies): NOT CONFIGURED, as before any rate existed.
  if (known.length === 0) return anyRate ? { state: 'not_recorded' } : { state: 'not_configured' }
  if (known.length === values.length && final) return { state: 'complete', cents: sum(known) }
  return { state: 'incomplete', knownCents: sum(known) }
}

/**
 * The labor and burden cost of a job's worker times at the rates in force on each visit's date. Complete only when
 * the work is done (`workDone`: no visit can add time), every time is known and every time has its rate (burden: its
 * burden rate). A time with no rate is NOT CONFIGURED, never zero; with no time at all no rate applies yet, so the
 * cost stays NOT CONFIGURED too.
 */
export function laborCostOf(times: readonly DatedTime[], rates: readonly LaborRate[], workDone: boolean): LaborCost {
  for (const r of rates) {
    safe(r.rateCents, 'a labor rate')
    if (r.burdenCents !== null) safe(r.burdenCents, 'a burden rate')
  }
  const lines = times.map((t): LaborCostLine => {
    const r = rateOn(rates, t.staffUserId, t.localDate)
    const burdenRate = r?.burdenCents ?? null
    return {
      staffUserId: t.staffUserId,
      localDate: t.localDate,
      minutes: t.minutes,
      rateCents: r?.rateCents ?? null,
      burdenRateCents: burdenRate,
      laborCents: r && t.minutes !== null ? minutesCost(t.minutes, r.rateCents) : null,
      burdenCents: burdenRate !== null && t.minutes !== null ? minutesCost(t.minutes, burdenRate) : null,
    }
  })
  return {
    labor: figureOf(
      lines.map((l) => l.laborCents),
      workDone,
      lines.some((l) => l.rateCents !== null),
    ),
    burden: figureOf(
      lines.map((l) => l.burdenCents),
      workDone,
      lines.some((l) => l.burdenRateCents !== null),
    ),
    lines,
  }
}

/** Why a rate entry is refused (the database checks the same). */
export type LaborRateProblem = 'RATE_INVALID' | 'BURDEN_INVALID'

export function laborRateProblem(input: { rateCents: number; burdenCents: number | null }): LaborRateProblem | null {
  const ok = (n: number) => Number.isSafeInteger(n) && n >= 0 && n <= LABOR_RATE_MAX_CENTS
  if (!ok(input.rateCents)) return 'RATE_INVALID'
  if (input.burdenCents !== null && !ok(input.burdenCents)) return 'BURDEN_INVALID'
  return null
}

// --- Net revenue ------------------------------------------------------------------------------------------------------

/** What the records hold about a job's revenue (each amount a positive magnitude in cents). */
export type RevenueFacts = {
  /** Totals of the job's final invoices issued, partially paid or paid (never the deposit invoice). */
  readonly finalInvoices: readonly number[]
  /** Refunds that succeeded. */
  readonly refunds: readonly number[]
  /** Credits issued or applied. */
  readonly credits: readonly number[]
  /** Refunds and credits requested, approved, processing or needing review: the revenue may still change. */
  readonly adjustmentsInProcess: number
  /** Write-offs recorded: how they count is NOT CONFIGURED (the CPA's or the Owner's). */
  readonly writeOffs: number
}

/** Why a revenue figure or a margin is not final. */
export const MARGIN_GAPS = [
  'not_invoiced',
  'adjustment_in_process',
  'write_off_not_configured',
  'costs_incomplete',
  'estimate_incomplete',
  'no_estimate',
] as const
export type MarginGap = (typeof MARGIN_GAPS)[number]

export type NetRevenue =
  | { readonly state: 'complete'; readonly cents: number }
  /** No final invoice issued: nothing recognized as revenue yet (deposits are not revenue before recognition). */
  | { readonly state: 'not_invoiced' }
  /** Invoiced, but a refund or credit in process or a write-off may change it: the part known, never final. */
  | { readonly state: 'incomplete'; readonly knownCents: number; readonly gaps: readonly MarginGap[] }

export function netRevenueOf(f: RevenueFacts): NetRevenue {
  for (const x of [...f.finalInvoices, ...f.refunds, ...f.credits])
    if (safe(x, 'a revenue amount') < 0) throw new RangeError('revenue amounts are positive magnitudes')
  if (f.finalInvoices.length === 0) return { state: 'not_invoiced' }
  const cents = sum(f.finalInvoices) - sum(f.refunds) - sum(f.credits)
  const gaps: MarginGap[] = []
  if (f.adjustmentsInProcess > 0) gaps.push('adjustment_in_process')
  if (f.writeOffs > 0) gaps.push('write_off_not_configured')
  return gaps.length ? { state: 'incomplete', knownCents: cents, gaps } : { state: 'complete', cents }
}

// --- Gross margin -----------------------------------------------------------------------------------------------------

export type GrossMargin =
  | {
      readonly state: 'complete'
      readonly revenueCents: number
      readonly costCents: number
      /** Revenue minus direct costs; negative for a loss. */
      readonly grossProfitCents: number
      /** Basis points, half-up; null when revenue is zero or negative (no percentage of nothing). */
      readonly marginBps: number | null
    }
  /** Some figure is not final: no percentage, only why. */
  | { readonly state: 'incomplete'; readonly gaps: readonly MarginGap[] }

/** The margin of a price and a cost total; final only when both are. */
export function grossMarginOf(
  revenue: NetRevenue,
  costs: CostFigure,
  costGap: MarginGap = 'costs_incomplete',
): GrossMargin {
  const gaps: MarginGap[] = []
  if (revenue.state === 'not_invoiced') gaps.push('not_invoiced')
  if (revenue.state === 'incomplete') gaps.push(...revenue.gaps)
  if (costs.state !== 'complete') gaps.push(costGap)
  if (revenue.state !== 'complete' || costs.state !== 'complete') return { state: 'incomplete', gaps }
  const profit = revenue.cents - costs.cents
  return {
    state: 'complete',
    revenueCents: revenue.cents,
    costCents: costs.cents,
    grossProfitCents: profit,
    marginBps: marginBps(profit, revenue.cents),
  }
}

/** Where a margin stands against the target: the advisory flag (never a block). */
export const MARGIN_FLAGS = [
  'below_target',
  'at_or_above_target',
  'incomplete',
  'target_not_configured',
  'no_revenue',
] as const
export type MarginFlag = (typeof MARGIN_FLAGS)[number]

/**
 * The advisory flag: below the target only for a final margin (OWN-DEC-189 items 7 to 9). A final loss on zero or
 * negative revenue is below any target; nothing earned and nothing spent has no margin to compare.
 */
export function marginFlagOf(m: GrossMargin, targetBps: number | null): MarginFlag {
  if (m.state !== 'complete') return 'incomplete'
  if (m.revenueCents <= 0)
    return m.grossProfitCents < 0 ? (targetBps === null ? 'target_not_configured' : 'below_target') : 'no_revenue'
  if (targetBps === null) return 'target_not_configured'
  return fractionBelow(m.grossProfitCents, m.revenueCents, targetBps) ? 'below_target' : 'at_or_above_target'
}

export type JobMargin = {
  readonly estimated: GrossMargin
  readonly actual: GrossMargin
  /** Actual minus estimated, only between two final margins with a percentage (basis points). */
  readonly varianceBps: number | null
  /** Actual minus estimated gross profit, only between two final margins (cents). */
  readonly profitVarianceCents: number | null
  readonly targetBps: number | null
  readonly flag: MarginFlag
  /** The estimated margin against the same target (advisory, as shown before publishing). */
  readonly estimatedFlag: MarginFlag
}

/**
 * A job's estimated and actual margin. Estimated: the contract price (the job's scope total, change orders included)
 * against the estimated cost total; null price when the job has no estimate. Actual: net revenue against the actual
 * cost total.
 */
export function jobMarginOf(f: {
  readonly estimatedPriceCents: number | null
  readonly estimatedCosts: CostFigure
  readonly revenue: NetRevenue
  readonly actualCosts: CostFigure
  readonly targetBps: number | null
}): JobMargin {
  const estimated: GrossMargin =
    f.estimatedPriceCents === null
      ? { state: 'incomplete', gaps: ['no_estimate'] }
      : grossMarginOf(
          { state: 'complete', cents: safe(f.estimatedPriceCents, 'price') },
          f.estimatedCosts,
          'estimate_incomplete',
        )
  const actual = grossMarginOf(f.revenue, f.actualCosts)
  const both = estimated.state === 'complete' && actual.state === 'complete'
  return {
    estimated,
    actual,
    varianceBps:
      both && estimated.marginBps !== null && actual.marginBps !== null ? actual.marginBps - estimated.marginBps : null,
    profitVarianceCents: both ? actual.grossProfitCents - estimated.grossProfitCents : null,
    targetBps: f.targetBps,
    flag: marginFlagOf(actual, f.targetBps),
    estimatedFlag: marginFlagOf(estimated, f.targetBps),
  }
}

/** Why a low-margin reason is refused. */
export type MarginReviewProblem = 'MARGIN_NOT_BELOW_TARGET' | 'NOTE_REQUIRED'

/** A reason is recorded only for a job flagged below the target; "other" needs its note. */
export function marginReviewProblem(flag: MarginFlag, input: { reason: MarginReason; note: string | null }) {
  if (flag !== 'below_target') return 'MARGIN_NOT_BELOW_TARGET' as const
  if (input.reason === 'other' && !(input.note ?? '').trim()) return 'NOTE_REQUIRED' as const
  return null
}
