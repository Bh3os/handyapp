// Integer cents at the module boundary (TSK-0005; RULE-MONEY-CENTS, HH-FIN-01, HH-DATA-02).
import { describe, expect, it } from 'vitest'
import {
  add,
  allocate,
  basisPoints,
  cents,
  centsFromDecimal,
  compare,
  CURRENCY,
  depositFor,
  estimateTotals,
  formatUsd,
  fromBigInt,
  isCents,
  lineTotal,
  MoneyError,
  negate,
  PACKAGE_NAME,
  parseCents,
  percentOf,
  quantityFromMinor,
  roundHalfUp,
  subtract,
  sum,
  toDecimalString,
  ZERO,
  type Cents,
} from '../src/index.js'

const NOT_CENTS: unknown[] = [
  1.5,
  0.1,
  -0.5,
  Number.NaN,
  Infinity,
  -Infinity,
  2 ** 53,
  '100',
  100n,
  null,
  undefined,
  {},
]

describe('Cents type and boundary guards (TSK-0005, RULE-MONEY-CENTS, HH-FIN-01)', () => {
  it('exposes its public index and the stored currency USD (HH-DATA-02)', () => {
    expect(PACKAGE_NAME).toBe('@handyhub/money')
    expect(CURRENCY).toBe('USD')
  })

  it('accepts only safe integers as cents and normalises negative zero', () => {
    expect(cents(0)).toBe(0)
    expect(Object.is(cents(-0), 0)).toBe(true)
    expect(cents(100001)).toBe(100001)
    expect(cents(-250)).toBe(-250)
    expect(cents(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER)
    expect(isCents(12)).toBe(true)
    expect(isCents(12.5)).toBe(false)
    expect(isCents('12')).toBe(false)
  })

  it('refuses every float or non-number with NOT_INTEGER_CENTS instead of rounding it', () => {
    for (const bad of NOT_CENTS) {
      expect(() => cents(bad as number), String(bad)).toThrow(MoneyError)
      try {
        cents(bad as number)
      } catch (e) {
        expect((e as MoneyError).code).toBe('NOT_INTEGER_CENTS')
      }
    }
  })

  it('no exported API accepts a float smuggled in through a cast', () => {
    const f = 10.5 as Cents
    const ok = cents(100)
    const calls: Array<() => unknown> = [
      () => add(f, ok),
      () => add(ok, f),
      () => subtract(f, ok),
      () => negate(f),
      () => sum([ok, f]),
      () => compare(f, ok),
      () => toDecimalString(f),
      () => formatUsd(f),
      () => lineTotal(f, quantityFromMinor(1000)),
      () => percentOf(f, basisPoints(2000)),
      () => allocate(f, [1, 1]),
      () => depositFor(f, { thresholdCents: ok, percent: basisPoints(2000) }),
      () => depositFor(ok, { thresholdCents: f, percent: basisPoints(2000) }),
      () => estimateTotals({ lines: [ok, f] }),
    ]
    for (const call of calls) expect(call).toThrow(MoneyError)
  })

  it('rejects a plain number at compile time: only a branded Cents is accepted', () => {
    // These lines are checked by `tsc --noEmit` (the typecheck step); at run time the guards refuse floats as well.
    // @ts-expect-error a plain number is not Cents
    const a: Cents = 100
    // @ts-expect-error add takes Cents, not numbers
    expect(add(1, 2)).toBe(3)
    expect(formatUsd(a)).toBe('$1.00')
    const plain: number = 100
    // @ts-expect-error formatUsd takes Cents, not a number
    expect(formatUsd(plain)).toBe('$1.00')
    // Arithmetic on Cents gives a plain number, which cannot be passed back without `cents`.
    const doubled = cents(5) * 2
    // @ts-expect-error the product is a number, not Cents
    expect(formatUsd(doubled)).toBe('$0.10')
    expect(formatUsd(cents(doubled))).toBe('$0.10')
  })

  it('parses untrusted input: integer numbers, integer strings and bigints only', () => {
    expect(parseCents(100001)).toBe(100001)
    expect(parseCents('100001')).toBe(100001)
    expect(parseCents('-250')).toBe(-250)
    expect(parseCents(42n)).toBe(42)
    for (const bad of ['1.5', '1e3', '01', ' 1', '', '1,000', 1.5, Number.NaN, null, true, 2n ** 60n]) {
      expect(() => parseCents(bad), String(bad)).toThrow(MoneyError)
    }
  })

  it('reads a typed dollar amount exactly and refuses more than two decimals', () => {
    expect(centsFromDecimal('35')).toBe(3500)
    expect(centsFromDecimal('35.5')).toBe(3550)
    expect(centsFromDecimal('1000.01')).toBe(100001)
    expect(centsFromDecimal('0.07')).toBe(7)
    expect(centsFromDecimal('-12.34')).toBe(-1234)
    for (const bad of ['', '.5', '1.', '01', '1,000.00', '1e3', '$5', ' 5', '0x10', 'NaN']) {
      expect(() => centsFromDecimal(bad), bad).toThrow(MoneyError)
    }
    expect(() => centsFromDecimal('1.005')).toThrow(/more than two decimals/)
  })

  it('adds, subtracts, negates, compares and sums exactly, and refuses overflow', () => {
    expect(add(cents(10), cents(20))).toBe(30)
    expect(subtract(cents(10), cents(25))).toBe(-15)
    expect(negate(cents(7))).toBe(-7)
    expect(Object.is(negate(ZERO), 0)).toBe(true)
    expect(compare(cents(1), cents(2))).toBe(-1)
    expect(compare(cents(2), cents(2))).toBe(0)
    expect(compare(cents(3), cents(2))).toBe(1)
    expect(sum([])).toBe(0)
    expect(sum([cents(10), cents(20), cents(-5)])).toBe(25)
    expect(() => add(cents(Number.MAX_SAFE_INTEGER), cents(1))).toThrow(/safe integer range/)
    expect(() => fromBigInt(2n ** 53n)).toThrow(MoneyError)
  })

  it('rounds half-up, away from zero at exactly one half, in bigint', () => {
    expect(roundHalfUp(5n, 10n)).toBe(1n)
    expect(roundHalfUp(4n, 10n)).toBe(0n)
    expect(roundHalfUp(-5n, 10n)).toBe(-1n)
    expect(roundHalfUp(-4n, 10n)).toBe(0n)
    expect(roundHalfUp(15n, 10n)).toBe(2n) // half-even would give 2 as well
    expect(roundHalfUp(25n, 10n)).toBe(3n) // half-even would give 2
    expect(() => roundHalfUp(1n, 0n)).toThrow(MoneyError)
    expect(() => roundHalfUp(1 as unknown as bigint, 2n)).toThrow(MoneyError)
  })

  it('writes exact decimal text with two decimals', () => {
    expect(toDecimalString(cents(0))).toBe('0.00')
    expect(toDecimalString(cents(5))).toBe('0.05')
    expect(toDecimalString(cents(100001))).toBe('1000.01')
    expect(toDecimalString(cents(-150))).toBe('-1.50')
  })
})
