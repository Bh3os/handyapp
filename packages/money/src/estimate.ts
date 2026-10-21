// Estimate line pricing and validation (TSK-0052; RULE-MONEY-CENTS; HH-DATA-02, HH-EST-02, HH-EST-03, HH-BASE-02).
//
// - A line's amount is quantity times unit price, rounded once half-up to the cent (lineTotal). An unknown quantity
//   or a missing unit price leaves the amount unknown: it is reported, never read as zero.
// - Every line, base or option, must be above $0.00 (OWN-DEC-145). The totals are those of estimateTotals over the
//   base lines plus the selected options: the subtotal is the exact sum of the displayed lines, the discount is a
//   separate totals row, the total is subtotal minus discount, and the deposit is evaluated on that total.
// - Only USD is supported (HH-DATA-02): any other currency is a problem, not a conversion.
// - There is no minimum charge, top-up, tax line, surcharge or rounding adjustment (FACT-NO-MINIMUM, FACT-TAX-NO-LINE,
//   FACT-NO-SURCHARGE): the result has no field for any of them, and nothing is ever added to the lines.
// - Problems are returned together, with the index of the line they concern, so the caller can show every reason as
//   a field error; a non-integer amount or quantity that reaches this code through a cast still throws MoneyError.
import { lineTotal, type BasisPoints, type Quantity, quantityFromMinor } from './arithmetic.js'
import { assertCents, isCurrency, type Cents, CURRENCY, type Currency, MoneyError, subtract, sum } from './cents.js'
import { type DepositRule, estimateTotals, type Totals, type TotalsProblem } from './totals.js'

/** Base scope, or an option the customer may select: an alternate or an optional add-on. */
export const LINE_KINDS = ['base', 'alternate', 'add_on'] as const
export type LineKind = (typeof LINE_KINDS)[number]

export type EstimateLineInput = {
  readonly kind: LineKind
  /** Thousandths of the unit; null while the quantity is unknown (never zero for unknown). */
  readonly quantity: Quantity | null
  /** null while the price is not written yet. */
  readonly unitPrice: Cents | null
}

export type EstimateProblem =
  | { readonly code: 'UNSUPPORTED_CURRENCY'; readonly currency: string }
  | { readonly code: 'QUANTITY_UNKNOWN'; readonly line: number }
  | { readonly code: 'UNIT_PRICE_MISSING'; readonly line: number }
  | { readonly code: 'LINE_NOT_POSITIVE'; readonly line: number; readonly amount: Cents }
  | { readonly code: 'NOT_AN_OPTION'; readonly line: number }
  | { readonly code: 'NO_LINES' }
  | { readonly code: 'TOTAL_NOT_POSITIVE'; readonly total: Cents }

export type EstimatePricingInput = {
  /** The currency stored on the version and its lines. */
  readonly currency: string
  readonly lines: readonly EstimateLineInput[]
  /** Indexes of the option lines the customer selected (approval); none for the published base offer. */
  readonly selectedOptions?: readonly number[]
  /** The job's one discount, as a share of the subtotal (from the active discount rule). */
  readonly discountPercent?: BasisPoints | null
  /** The active deposit rule, when the caller evaluates the deposit. */
  readonly depositRule?: DepositRule | null
}

export type EstimatePricing = {
  readonly currency: Currency
  /** Each line's amount, in input order; null where the quantity or unit price is unknown. */
  readonly lineAmounts: readonly (Cents | null)[]
  /** Every problem found; empty when the totals were computed. */
  readonly problems: readonly EstimateProblem[]
  /** Totals of the base lines plus the selected options; null when any problem exists. */
  readonly totals: Totals | null
}

export function isLineKind(value: unknown): value is LineKind {
  return typeof value === 'string' && (LINE_KINDS as readonly string[]).includes(value)
}

/**
 * Prices every line and, when all of them are valid, computes the totals. The same input always gives the same
 * result: integer arithmetic only, lines in input order, one rounding per line and one for the discount row.
 */
export function priceEstimate(input: EstimatePricingInput): EstimatePricing {
  const problems: EstimateProblem[] = []
  if (!isCurrency(input.currency)) problems.push({ code: 'UNSUPPORTED_CURRENCY', currency: String(input.currency) })

  const lineAmounts = input.lines.map((line, i): Cents | null => {
    if (!isLineKind(line.kind))
      throw new MoneyError('INVALID_LINE_KIND', `line ${i}: unknown kind ${String(line.kind)}`)
    if (line.quantity !== null) quantityFromMinor(line.quantity)
    if (line.unitPrice !== null) assertCents(line.unitPrice, `line ${i} unit price`)
    if (line.quantity === null) problems.push({ code: 'QUANTITY_UNKNOWN', line: i })
    if (line.unitPrice === null) problems.push({ code: 'UNIT_PRICE_MISSING', line: i })
    if (line.quantity === null || line.unitPrice === null) return null
    const amount = lineTotal(line.unitPrice, line.quantity)
    if (amount <= 0) problems.push({ code: 'LINE_NOT_POSITIVE', line: i, amount })
    return amount
  })

  const selected = [...new Set(input.selectedOptions ?? [])].sort((a, b) => a - b)
  for (const i of selected) {
    const line = input.lines[i]
    if (!Number.isSafeInteger(i) || line === undefined || line.kind === 'base')
      problems.push({ code: 'NOT_AN_OPTION', line: i })
  }
  const counted = input.lines.flatMap((line, i) => (line.kind === 'base' || selected.includes(i) ? [i] : []))
  if (!input.lines.some((l) => l.kind === 'base')) problems.push({ code: 'NO_LINES' })
  if (problems.length > 0) return { currency: CURRENCY, lineAmounts, problems, totals: null }

  const result = estimateTotals({
    lines: counted.map((i) => lineAmounts[i] as Cents),
    discountPercent: input.discountPercent ?? null,
    depositRule: input.depositRule ?? null,
  })
  if (!result.ok) return { currency: CURRENCY, lineAmounts, problems: result.problems.map(fromTotals), totals: null }
  return { currency: CURRENCY, lineAmounts, problems: [], totals: result.totals }
}

function fromTotals(p: TotalsProblem): EstimateProblem {
  // estimateTotals only sees lines already checked above, so only the total can still fail here.
  return p.code === 'LINE_NOT_POSITIVE' ? { code: 'LINE_NOT_POSITIVE', line: p.line, amount: p.amount } : p
}

export type InternalMargin = {
  /** Sum of the known internal costs. */
  readonly cost: Cents
  /** Revenue minus cost; may be negative. Staff-only (HH-EST-03). */
  readonly margin: Cents
}

/** Internal cost total and margin of a set of priced lines (staff projections only). Costs are never negative. */
export function internalMargin(revenue: Cents, costs: readonly Cents[]): InternalMargin {
  assertCents(revenue, 'revenue')
  costs.forEach((c, i) => {
    assertCents(c, `cost ${i}`)
    if (c < 0) throw new MoneyError('NEGATIVE_AMOUNT', `cost ${i} is negative`)
  })
  const cost = sum(costs)
  return { cost, margin: subtract(revenue, cost) }
}
