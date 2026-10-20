// Integer cents (RULE-MONEY-CENTS; HH-FIN-01, HH-DATA-02). Every amount is a whole number of US cents. A plain
// `number` is never a money value: the branded `Cents` type rejects it at compile time, and every exported function
// checks its arguments at run time, so a float, NaN, Infinity or an unsafe integer that reaches the package through a
// cast or an untyped boundary (JSON, a database row, a form) is refused instead of computed.

/** The one currency the business uses; stored beside every amount (HH-DATA-02). */
export const CURRENCY = 'USD' as const
export type Currency = typeof CURRENCY

declare const centsBrand: unique symbol
/** A whole number of US cents. Build one with `cents`, `parseCents` or `centsFromDecimal`; never by a cast. */
export type Cents = number & { readonly [centsBrand]: Currency }

/** Stable error codes (HH-API-03 style): callers map them to messages; no float or partial result is returned. */
export type MoneyErrorCode =
  | 'NOT_INTEGER_CENTS'
  | 'OUT_OF_RANGE'
  | 'NOT_A_DECIMAL'
  | 'TOO_MANY_DECIMALS'
  | 'INVALID_QUANTITY'
  | 'INVALID_BASIS_POINTS'
  | 'INVALID_WEIGHTS'
  | 'NEGATIVE_AMOUNT'

export class MoneyError extends Error {
  readonly code: MoneyErrorCode
  constructor(code: MoneyErrorCode, message: string) {
    super(message)
    this.name = 'MoneyError'
    this.code = code
  }
}

const MAX = BigInt(Number.MAX_SAFE_INTEGER)

/** True for a safe integer number: the only runtime shape of `Cents`. */
export function isCents(value: unknown): value is Cents {
  return typeof value === 'number' && Number.isSafeInteger(value)
}

/** Refuses anything that is not a safe integer number (a float, NaN, Infinity, a string, a bigint). */
export function assertCents(value: unknown, what = 'amount'): asserts value is Cents {
  if (!isCents(value)) {
    throw new MoneyError('NOT_INTEGER_CENTS', `${what} must be a whole number of cents, got ${describe(value)}`)
  }
}

/** A whole number of cents. Throws on a float or an unsafe integer; never rounds a float into money. */
export function cents(value: number): Cents {
  assertCents(value)
  // Normalise -0 so formatting and equality never see a negative zero.
  return (value === 0 ? 0 : value) as Cents
}

/**
 * Boundary parser for untrusted input (JSON payloads, database rows, query strings): a safe integer number, a bigint
 * in the safe range, or an integer string such as "100001" or "-250". Decimal strings, floats and anything else are
 * refused; use `centsFromDecimal` for a dollar amount typed by a person.
 */
export function parseCents(value: unknown): Cents {
  if (typeof value === 'number') return cents(value)
  if (typeof value === 'bigint') return fromBigInt(value)
  if (typeof value === 'string' && /^-?(0|[1-9][0-9]*)$/.test(value)) return fromBigInt(BigInt(value))
  throw new MoneyError('NOT_INTEGER_CENTS', `amount must be a whole number of cents, got ${describe(value)}`)
}

/**
 * A dollar amount written as a plain decimal ("35", "35.5", "1000.01", optionally with a leading "-") into exact cents.
 * More than two decimals, grouping commas, exponents, spaces and a leading "." are refused, never rounded.
 */
export function centsFromDecimal(text: string): Cents {
  if (typeof text !== 'string') throw new MoneyError('NOT_A_DECIMAL', `not a decimal string: ${describe(text)}`)
  const m = /^(-?)(0|[1-9][0-9]*)(?:\.([0-9]+))?$/.exec(text)
  if (!m) throw new MoneyError('NOT_A_DECIMAL', `not a plain decimal amount: ${JSON.stringify(text)}`)
  const frac = m[3] ?? ''
  if (frac.length > 2) throw new MoneyError('TOO_MANY_DECIMALS', `more than two decimals: ${JSON.stringify(text)}`)
  const magnitude = BigInt(`${m[2]}${frac.padEnd(2, '0')}`)
  return fromBigInt(m[1] === '-' ? -magnitude : magnitude)
}

/** Exact decimal text of an amount, always with two decimals and no grouping ("1000.01", "-0.05"). */
export function toDecimalString(amount: Cents): string {
  assertCents(amount)
  const negative = amount < 0
  const digits = String(Math.abs(amount)).padStart(3, '0')
  return `${negative ? '-' : ''}${digits.slice(0, -2)}.${digits.slice(-2)}`
}

/** Internal and exported for callers that compute in bigint: back to `Cents`, refusing values beyond the safe range. */
export function fromBigInt(value: bigint): Cents {
  if (value > MAX || value < -MAX) throw new MoneyError('OUT_OF_RANGE', 'amount exceeds the safe integer range')
  return cents(Number(value))
}

export const ZERO: Cents = 0 as Cents

export function add(a: Cents, b: Cents): Cents {
  assertCents(a)
  assertCents(b)
  return fromBigInt(BigInt(a) + BigInt(b))
}

export function subtract(a: Cents, b: Cents): Cents {
  assertCents(a)
  assertCents(b)
  return fromBigInt(BigInt(a) - BigInt(b))
}

export function negate(a: Cents): Cents {
  assertCents(a)
  return cents(-a)
}

/** Exact sum of amounts; the sum of no amounts is zero. Throws instead of losing precision. */
export function sum(amounts: readonly Cents[]): Cents {
  let total = 0n
  amounts.forEach((a, i) => {
    assertCents(a, `amount ${i}`)
    total += BigInt(a)
  })
  return fromBigInt(total)
}

/** -1, 0 or 1. */
export function compare(a: Cents, b: Cents): -1 | 0 | 1 {
  assertCents(a)
  assertCents(b)
  return a < b ? -1 : a > b ? 1 : 0
}

/** value / divisor, rounded half-up (away from zero at exactly one half), in exact integer arithmetic. */
export function roundHalfUp(value: bigint, divisor: bigint): bigint {
  if (typeof value !== 'bigint' || typeof divisor !== 'bigint') {
    throw new MoneyError('NOT_INTEGER_CENTS', 'roundHalfUp takes bigint operands')
  }
  if (divisor <= 0n) throw new MoneyError('OUT_OF_RANGE', 'divisor must be positive')
  const negative = value < 0n
  const abs = negative ? -value : value
  const quotient = abs / divisor
  const rounded = (abs % divisor) * 2n >= divisor ? quotient + 1n : quotient
  return negative ? -rounded : rounded
}

function describe(value: unknown): string {
  if (typeof value === 'bigint') return `${value}n`
  if (typeof value === 'string') return JSON.stringify(value)
  return String(value)
}
