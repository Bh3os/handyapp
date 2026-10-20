// Line totals, percentage shares and allocation (RULE-MONEY-CENTS; HH-EST-03, HH-FIN-01). All arithmetic is exact
// bigint on integers; each result is rounded once, half-up, to the cent. No floating point is used anywhere.
import { assertCents, type Cents, fromBigInt, MoneyError, roundHalfUp } from './cents.js'

/** Quantities carry an explicit scale (HH-FIN-01): a `Quantity` is a whole number of thousandths of the unit. */
export const QUANTITY_SCALE = 3
const QUANTITY_DIVISOR = 10n ** BigInt(QUANTITY_SCALE)

declare const quantityBrand: unique symbol
/** A non-negative quantity in minor units of its unit (thousandths): 2.5 hours is 2500. */
export type Quantity = number & { readonly [quantityBrand]: 'thousandths' }

/** A quantity from its minor units (thousandths of the unit). Refuses fractions, negatives and unsafe integers. */
export function quantityFromMinor(minor: number): Quantity {
  if (typeof minor !== 'number' || !Number.isSafeInteger(minor) || minor < 0) {
    throw new MoneyError('INVALID_QUANTITY', `a quantity is a non-negative whole number of thousandths, got ${minor}`)
  }
  return (minor === 0 ? 0 : minor) as Quantity
}

/** A quantity written as a plain decimal ("1", "2.5", "0.125"), exactly; more than three decimals is refused. */
export function quantity(text: string): Quantity {
  const m = typeof text === 'string' ? /^(0|[1-9][0-9]*)(?:\.([0-9]+))?$/.exec(text) : null
  if (!m) throw new MoneyError('INVALID_QUANTITY', `not a plain non-negative decimal quantity: ${JSON.stringify(text)}`)
  const frac = m[2] ?? ''
  if (frac.length > QUANTITY_SCALE) {
    throw new MoneyError('TOO_MANY_DECIMALS', `more than ${QUANTITY_SCALE} decimals: ${JSON.stringify(text)}`)
  }
  const minor = BigInt(`${m[1]}${frac.padEnd(QUANTITY_SCALE, '0')}`)
  if (minor > BigInt(Number.MAX_SAFE_INTEGER)) throw new MoneyError('INVALID_QUANTITY', 'quantity is too large')
  return quantityFromMinor(Number(minor))
}

/** Exact decimal text of a quantity, trailing zeros dropped ("2.5", "1", "0.125"). */
export function quantityToString(q: Quantity): string {
  const minor = quantityFromMinor(q)
  const digits = String(minor).padStart(QUANTITY_SCALE + 1, '0')
  const whole = digits.slice(0, -QUANTITY_SCALE)
  const frac = digits.slice(-QUANTITY_SCALE).replace(/0+$/, '')
  return frac ? `${whole}.${frac}` : whole
}

/**
 * Amount of one line: unit price times quantity, computed exactly and rounded once, half-up, to the cent (HH-EST-03).
 * A line's validity (above $0.00) is checked by `estimateTotals`, not here.
 */
export function lineTotal(unitPrice: Cents, qty: Quantity): Cents {
  assertCents(unitPrice, 'unit price')
  quantityFromMinor(qty)
  return fromBigInt(roundHalfUp(BigInt(unitPrice) * BigInt(qty), QUANTITY_DIVISOR))
}

/** Percentages are basis points: 1 bp = 0.01%, so 10% is 1000 and 20% is 2000. */
export const BASIS_POINTS_PER_WHOLE = 10_000

declare const bpsBrand: unique symbol
/** A whole number of basis points from 0 to 10000 (0% to 100%). */
export type BasisPoints = number & { readonly [bpsBrand]: 'bps' }

export function basisPoints(value: number): BasisPoints {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > BASIS_POINTS_PER_WHOLE) {
    throw new MoneyError('INVALID_BASIS_POINTS', `basis points must be a whole number from 0 to 10000, got ${value}`)
  }
  return (value === 0 ? 0 : value) as BasisPoints
}

/**
 * A percentage share of an amount, rounded once, half-up, to the cent: amount × bps / 10000. A 20% share is
 * `percentOf(amount, basisPoints(2000))`; there is no intermediate rounding.
 */
export function percentOf(amount: Cents, bps: BasisPoints): Cents {
  assertCents(amount)
  basisPoints(bps)
  return fromBigInt(roundHalfUp(BigInt(amount) * BigInt(bps), BigInt(BASIS_POINTS_PER_WHOLE)))
}

/**
 * Splits a non-negative total across positive integer weights so the parts sum exactly to the total (no remainder
 * lost or created). Largest-remainder method; ties go to the earlier weight, so the result is deterministic. Each
 * part is the floor of its exact share or one cent more.
 */
export function allocate(total: Cents, weights: readonly number[]): Cents[] {
  assertCents(total, 'total')
  if (total < 0) throw new MoneyError('NEGATIVE_AMOUNT', 'allocate needs a non-negative total')
  if (weights.length === 0 || weights.some((w) => typeof w !== 'number' || !Number.isSafeInteger(w) || w <= 0)) {
    throw new MoneyError('INVALID_WEIGHTS', 'allocate needs at least one positive whole-number weight')
  }
  const t = BigInt(total)
  const w = weights.map((x) => BigInt(x))
  const whole = w.reduce((a, b) => a + b, 0n)
  const parts = w.map((x) => (t * x) / whole)
  const order = w
    .map((x, i) => ({ i, remainder: (t * x) % whole }))
    .sort((a, b) => (a.remainder === b.remainder ? a.i - b.i : a.remainder > b.remainder ? -1 : 1))
  let left = t - parts.reduce((a, b) => a + b, 0n)
  for (const { i } of order) {
    if (left === 0n) break
    parts[i] = (parts[i] ?? 0n) + 1n
    left -= 1n
  }
  return parts.map(fromBigInt)
}
