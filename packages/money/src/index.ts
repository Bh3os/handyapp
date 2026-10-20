// @handyhub/money: integer-cents money calculations, rounding and formatting (RULE-MONEY-CENTS; TSK-0005).
// The one money library for estimates, change orders, invoices, payments and reports (HH-ARC-05): no other code does
// money arithmetic, and no floating point is used.
export const PACKAGE_NAME = '@handyhub/money'

export {
  add,
  assertCents,
  cents,
  centsFromDecimal,
  compare,
  CURRENCY,
  fromBigInt,
  isCents,
  MoneyError,
  negate,
  parseCents,
  roundHalfUp,
  subtract,
  sum,
  toDecimalString,
  ZERO,
} from './cents.js'
export type { Cents, Currency, MoneyErrorCode } from './cents.js'
export {
  allocate,
  BASIS_POINTS_PER_WHOLE,
  basisPoints,
  lineTotal,
  percentOf,
  quantity,
  QUANTITY_SCALE,
  quantityFromMinor,
  quantityToString,
} from './arithmetic.js'
export type { BasisPoints, Quantity } from './arithmetic.js'
export { formatUsd } from './format.js'
export { depositFor, estimateTotals } from './totals.js'
export type { DepositOutcome, DepositRule, Totals, TotalsInput, TotalsProblem } from './totals.js'
