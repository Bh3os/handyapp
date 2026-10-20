// Line totals, percentages, allocation and en-US formatting (TSK-0005; HH-EST-03, HH-FIN-01, RULE-MONEY-CENTS).
import { describe, expect, it } from 'vitest'
import {
  allocate,
  basisPoints,
  cents,
  formatUsd,
  lineTotal,
  MoneyError,
  percentOf,
  quantity,
  quantityFromMinor,
  quantityToString,
  sum,
} from '../src/index.js'

describe('quantities with an explicit scale (TSK-0005, HH-FIN-01)', () => {
  it('reads decimal quantities exactly into thousandths of the unit', () => {
    expect(quantity('1')).toBe(1000)
    expect(quantity('2.5')).toBe(2500)
    expect(quantity('0.125')).toBe(125)
    expect(quantity('0')).toBe(0)
    expect(quantityFromMinor(2500)).toBe(2500)
  })

  it('refuses negative, fractional-minor, oversized and malformed quantities', () => {
    for (const bad of ['-1', '1.0001', '.5', '1.', '01', '1e3', '', ' 1']) {
      expect(() => quantity(bad), bad).toThrow(MoneyError)
    }
    for (const bad of [-1, 0.5, Number.NaN, 2 ** 53]) expect(() => quantityFromMinor(bad)).toThrow(MoneyError)
  })

  it('writes quantities back without trailing zeros', () => {
    expect(quantityToString(quantity('2.500'))).toBe('2.5')
    expect(quantityToString(quantity('3'))).toBe('3')
    expect(quantityToString(quantity('0.125'))).toBe('0.125')
    expect(quantityToString(quantity('0'))).toBe('0')
  })
})

describe('line total: quantity times unit price, rounded once half-up per line (HH-EST-03, OWN-DEC-83, T31)', () => {
  it('multiplies whole quantities exactly', () => {
    expect(lineTotal(cents(3500), quantity('1'))).toBe(3500)
    expect(lineTotal(cents(4599), quantity('3'))).toBe(13797)
  })

  it('rounds an exact half cent up', () => {
    // $1.25 x 0.5 = 62.5 cents -> 63; $3.33 x 1.5 = 499.5 cents -> 500.
    expect(lineTotal(cents(125), quantity('0.5'))).toBe(63)
    expect(lineTotal(cents(333), quantity('1.5'))).toBe(500)
  })

  it('rounds below a half down and above a half up', () => {
    // $0.99 x 0.333 = 32.967 -> 33; $10.01 x 0.125 = 125.125 -> 125.
    expect(lineTotal(cents(99), quantity('0.333'))).toBe(33)
    expect(lineTotal(cents(1001), quantity('0.125'))).toBe(125)
  })

  it('rounds each line once, so the total is the sum of the displayed lines, not a rounded grand total', () => {
    const lines = [lineTotal(cents(125), quantity('0.5')), lineTotal(cents(125), quantity('0.5'))]
    expect(lines).toEqual([63, 63])
    expect(sum(lines)).toBe(126) // rounding the exact 125 cents once overall would hide a cent the lines show
  })
})

describe('percentage of an amount, half-up to the cent (HH-EST-03, FACT-DEPOSIT-RULE)', () => {
  it('computes 20% and 10% shares with one rounding', () => {
    expect(percentOf(cents(100001), basisPoints(2000))).toBe(20000) // 20000.2
    expect(percentOf(cents(100003), basisPoints(2000))).toBe(20001) // 20000.6
    expect(percentOf(cents(3505), basisPoints(1000))).toBe(351) // 350.5 -> half-up
    expect(percentOf(cents(3504), basisPoints(1000))).toBe(350) // 350.4
    expect(percentOf(cents(0), basisPoints(2000))).toBe(0)
    expect(percentOf(cents(12345), basisPoints(10000))).toBe(12345)
  })

  it('accepts only whole basis points from 0 to 10000', () => {
    for (const bad of [-1, 10001, 20.5, Number.NaN]) expect(() => basisPoints(bad)).toThrow(MoneyError)
    expect(basisPoints(0)).toBe(0)
    expect(basisPoints(10000)).toBe(10000)
  })
})

describe('allocation without remainder loss (HH-FIN-01)', () => {
  it('splits by largest remainder; ties go to the earlier weight', () => {
    expect(allocate(cents(1000), [3333, 3333, 3334])).toEqual([333, 333, 334])
    expect(allocate(cents(100), [1, 1, 1])).toEqual([34, 33, 33])
    expect(allocate(cents(1), [1, 1])).toEqual([1, 0])
    expect(allocate(cents(0), [5, 7])).toEqual([0, 0])
  })

  it('refuses a negative total and empty, zero, negative or fractional weights', () => {
    expect(() => allocate(cents(-1), [1])).toThrow(MoneyError)
    expect(() => allocate(cents(10), [])).toThrow(MoneyError)
    expect(() => allocate(cents(10), [0, 1])).toThrow(MoneyError)
    expect(() => allocate(cents(10), [-1, 2])).toThrow(MoneyError)
    expect(() => allocate(cents(10), [1.5, 2])).toThrow(MoneyError)
  })
})

describe('en-US formatting (HH-FIN-01, T31)', () => {
  it('formats with a dollar sign, comma grouping and two decimals', () => {
    expect(formatUsd(cents(0))).toBe('$0.00')
    expect(formatUsd(cents(7))).toBe('$0.07')
    expect(formatUsd(cents(3500))).toBe('$35.00')
    expect(formatUsd(cents(100000))).toBe('$1,000.00')
    expect(formatUsd(cents(100001))).toBe('$1,000.01')
    expect(formatUsd(cents(123456789))).toBe('$1,234,567.89')
    expect(formatUsd(cents(-500))).toBe('-$5.00')
    expect(formatUsd(cents(Number.MAX_SAFE_INTEGER))).toBe('$90,071,992,547,409.91')
  })
})
