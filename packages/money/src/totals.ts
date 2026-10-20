// Estimate and invoice totals and the deposit amount (RULE-MONEY-CENTS; HH-EST-02, HH-EST-03, HH-DATA-02, HH-FIN-02).
//
// - Every line is already rounded once, half-up (lineTotal), and must be above $0.00 (OWN-DEC-145); a $0 or negative
//   line and a total that is not above $0.00 are refused with the reason, never adjusted.
// - The subtotal is the exact sum of the displayed lines. A discount is not a line: it is a separate totals row,
//   computed on the subtotal in integer cents, half-up (FACT-PRICING-DISCOUNTS). The total is subtotal minus discount.
// - There is no minimum charge, no top-up and no tax line (FACT-NO-MINIMUM, FACT-TAX-NO-LINE): nothing is added.
// - The deposit is computed on the total after the discount (FACT-DEPOSIT-RULE). Its threshold and share are policy
//   data passed in by the caller from the active configuration; this file holds no business value.
import { percentOf, basisPoints, type BasisPoints } from './arithmetic.js'
import { assertCents, type Cents, CURRENCY, type Currency, MoneyError, subtract, sum } from './cents.js'

/** The deposit rule as configured policy data: required when the total is strictly greater than the threshold. */
export type DepositRule = {
  /** Threshold in cents; the comparison is strictly "over" (a total equal to it needs no deposit). */
  readonly thresholdCents: Cents
  /** The deposit share of the total, in basis points. */
  readonly percent: BasisPoints
}

export type DepositOutcome =
  | { readonly required: false; readonly base: Cents }
  | { readonly required: true; readonly base: Cents; readonly amount: Cents }

/**
 * The deposit for a final approved total (after any discount, including selected options): when the total is strictly
 * greater than the rule's threshold, its percentage share rounded once, half-up, to the cent; otherwise none.
 */
export function depositFor(totalAfterDiscount: Cents, rule: DepositRule): DepositOutcome {
  assertCents(totalAfterDiscount, 'total')
  assertCents(rule.thresholdCents, 'deposit threshold')
  basisPoints(rule.percent)
  if (totalAfterDiscount < 0) throw new MoneyError('NEGATIVE_AMOUNT', 'a deposit base is never negative')
  if (rule.thresholdCents < 0) throw new MoneyError('NEGATIVE_AMOUNT', 'a deposit threshold is never negative')
  if (totalAfterDiscount > rule.thresholdCents) {
    return { required: true, base: totalAfterDiscount, amount: percentOf(totalAfterDiscount, rule.percent) }
  }
  return { required: false, base: totalAfterDiscount }
}

export type TotalsProblem =
  | { readonly code: 'NO_LINES' }
  | { readonly code: 'LINE_NOT_POSITIVE'; readonly line: number; readonly amount: Cents }
  | { readonly code: 'TOTAL_NOT_POSITIVE'; readonly total: Cents }

export type Totals = {
  readonly currency: Currency
  /** The displayed line amounts, unchanged. */
  readonly lines: readonly Cents[]
  /** Exact sum of the lines. */
  readonly subtotal: Cents
  /** The discount row as a positive amount subtracted from the subtotal; 0 when there is no discount. */
  readonly discount: Cents
  readonly discountPercent: BasisPoints | null
  /** subtotal - discount: the final total the customer approves. */
  readonly total: Cents
  /** Present when a deposit rule was given: evaluated on `total` (after the discount). */
  readonly deposit?: DepositOutcome
}

export type TotalsInput = {
  /** Line amounts in cents (approved lines and selected options), each already rounded with `lineTotal`. */
  readonly lines: readonly Cents[]
  /** The one discount for the job, if any, as a percentage of the subtotal. */
  readonly discountPercent?: BasisPoints | null
  /** The active deposit rule, if the caller needs the deposit. */
  readonly depositRule?: DepositRule | null
}

/**
 * Validates the lines and computes subtotal, discount row, total and (optionally) the deposit. Problems are returned,
 * not thrown, so publishing can show every reason at once (HH-EST-02); a non-integer amount still throws MoneyError.
 */
export function estimateTotals(
  input: TotalsInput,
):
  { readonly ok: true; readonly totals: Totals } | { readonly ok: false; readonly problems: readonly TotalsProblem[] } {
  const problems: TotalsProblem[] = []
  if (input.lines.length === 0) problems.push({ code: 'NO_LINES' })
  input.lines.forEach((amount, line) => {
    assertCents(amount, `line ${line}`)
    if (amount <= 0) problems.push({ code: 'LINE_NOT_POSITIVE', line, amount })
  })
  if (problems.length > 0) return { ok: false, problems }

  const subtotal = sum(input.lines)
  const discountPercent = input.discountPercent ?? null
  const discount = discountPercent === null ? (0 as Cents) : percentOf(subtotal, basisPoints(discountPercent))
  const total = subtract(subtotal, discount)
  if (total <= 0) return { ok: false, problems: [{ code: 'TOTAL_NOT_POSITIVE', total }] }

  const totals: Totals = {
    currency: CURRENCY,
    lines: [...input.lines],
    subtotal,
    discount,
    discountPercent,
    total,
    ...(input.depositRule ? { deposit: depositFor(total, input.depositRule) } : {}),
  }
  return { ok: true, totals }
}
