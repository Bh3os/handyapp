// Change-order pricing (TSK-0081; HH-CHG-01, OWN-DEC-145, OWN-DEC-203, FACT-NO-MINIMUM, FACT-TAX-NO-LINE,
// RULE-MONEY-CENTS).
//
// - A charge line is added work; a credit line is removed work or a credit. Both are positive magnitudes in integer
//   cents: a line's amount is quantity times unit price, rounded once half-up (lineTotal), and above $0.00. A credit
//   has a negative financial effect: it lowers the revised total, it is never a negative stored amount (OWN-DEC-203).
// - The revised project total is the current approved total (the job's latest scope snapshot) plus the charges minus
//   the credits. It is never zero or negative, and a reduction never takes it below the money the customer has
//   already paid: that would be money owed back, which goes to the Owner's refund or credit path instead (PROPOSED,
//   OWN-DEC-203: "a reduction larger than what remains to be charged is refused on the server and routed to staff").
// - There is no tax line, minimum, top-up or rounding adjustment: nothing is ever added to the lines.
// - An unknown quantity or a missing unit price leaves the line (and the totals) unknown, reported, never zero.
import { lineTotal, type Quantity, quantityFromMinor } from './arithmetic.js'
import { assertCents, type Cents, cents, MoneyError, subtract, sum } from './cents.js'

export const CHANGE_ORDER_LINE_KINDS = ['charge', 'credit'] as const
export type ChangeOrderLineKind = (typeof CHANGE_ORDER_LINE_KINDS)[number]

export type ChangeOrderLineInput = {
  readonly kind: ChangeOrderLineKind
  readonly quantity: Quantity | null
  readonly unitPrice: Cents | null
}

export type ChangeOrderProblem =
  | { readonly code: 'NO_LINES' }
  | { readonly code: 'QUANTITY_UNKNOWN'; readonly line: number }
  | { readonly code: 'UNIT_PRICE_MISSING'; readonly line: number }
  | { readonly code: 'LINE_NOT_POSITIVE'; readonly line: number }
  | { readonly code: 'CREDIT_EXCEEDS_REMAINING_CHARGE'; readonly remaining: Cents; readonly reduction: Cents }

export type ChangeOrderPricing = {
  readonly lineAmounts: readonly (Cents | null)[]
  readonly problems: readonly ChangeOrderProblem[]
  /** null while a line is unknown or invalid. */
  readonly totals: {
    readonly charges: Cents
    readonly credits: Cents
    /** The current approved total plus the charges minus the credits; always above $0.00. */
    readonly revisedTotal: Cents
  } | null
}

export function isChangeOrderLineKind(value: unknown): value is ChangeOrderLineKind {
  return typeof value === 'string' && (CHANGE_ORDER_LINE_KINDS as readonly string[]).includes(value)
}

/**
 * Prices every line and, when all are valid, the totals against the current approved total and the money already
 * paid. The same input always gives the same result.
 */
export function priceChangeOrder(input: {
  readonly lines: readonly ChangeOrderLineInput[]
  /** The job's current approved total (its latest scope snapshot). */
  readonly baseTotal: Cents
  /** Money the customer has paid on the job (not returned or voided). */
  readonly paid: Cents
}): ChangeOrderPricing {
  assertCents(input.baseTotal, 'base total')
  assertCents(input.paid, 'paid')
  const problems: ChangeOrderProblem[] = []
  if (input.lines.length === 0) problems.push({ code: 'NO_LINES' })
  const lineAmounts = input.lines.map((line, i): Cents | null => {
    if (!isChangeOrderLineKind(line.kind))
      throw new MoneyError('INVALID_LINE_KIND', `line ${i}: unknown kind ${String(line.kind)}`)
    if (line.quantity !== null) quantityFromMinor(line.quantity)
    if (line.unitPrice !== null) assertCents(line.unitPrice, `line ${i} unit price`)
    if (line.quantity === null) problems.push({ code: 'QUANTITY_UNKNOWN', line: i })
    if (line.unitPrice === null) problems.push({ code: 'UNIT_PRICE_MISSING', line: i })
    if (line.quantity === null || line.unitPrice === null) return null
    const amount = lineTotal(line.unitPrice, line.quantity)
    if (amount <= 0) problems.push({ code: 'LINE_NOT_POSITIVE', line: i })
    return amount
  })
  if (problems.length) return { lineAmounts, problems, totals: null }
  const of = (kind: ChangeOrderLineKind) =>
    sum(input.lines.flatMap((l, i) => (l.kind === kind ? [lineAmounts[i] as Cents] : [])))
  const charges = of('charge')
  const credits = of('credit')
  // The reduction a credit makes, beyond the added charges; it may not exceed what remains to be charged.
  const reduction = credits > charges ? subtract(credits, charges) : cents(0)
  const remaining = input.baseTotal > input.paid ? subtract(input.baseTotal, input.paid) : cents(0)
  // The revised total must stay above $0.00 and at or above what was paid: the remaining charge less one cent when
  // nothing was paid (a total of $0.00 is no charge at all), the remaining charge otherwise.
  const allowed = input.paid > 0 ? remaining : remaining > 0 ? subtract(remaining, cents(1)) : cents(0)
  if (reduction > allowed) {
    problems.push({ code: 'CREDIT_EXCEEDS_REMAINING_CHARGE', remaining, reduction })
    return { lineAmounts, problems, totals: null }
  }
  return {
    lineAmounts,
    problems,
    totals: { charges, credits, revisedTotal: subtract(sum([input.baseTotal, charges]), credits) },
  }
}
