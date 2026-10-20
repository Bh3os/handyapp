// Property-based checks against independent integer references (TSK-0005; RULE-MONEY-CENTS, HH-FIN-01, HH-EST-03).
// A seeded generator keeps every failure reproducible.
import { describe, expect, it } from 'vitest'
import {
  allocate,
  basisPoints,
  cents,
  depositFor,
  estimateTotals,
  formatUsd,
  lineTotal,
  parseCents,
  percentOf,
  quantityFromMinor,
  sum,
  toDecimalString,
  type Cents,
} from '../src/index.js'

function generator(seed: number) {
  let s = seed >>> 0
  return (n: number): number => {
    // mulberry32
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return (((t ^ (t >>> 14)) >>> 0) % n) >>> 0
  }
}
const RUNS = 3000

describe('money properties (TSK-0005, RULE-MONEY-CENTS, HH-FIN-01)', () => {
  it('sums are exact: equal to a bigint reference for any list of amounts', () => {
    const rand = generator(20261020)
    for (let k = 0; k < RUNS; k++) {
      const amounts = Array.from({ length: rand(20) }, () => cents(rand(2_000_000_000) - 1_000_000_000))
      const reference = amounts.reduce((a, b) => a + BigInt(b), 0n)
      expect(BigInt(sum(amounts))).toBe(reference)
    }
  })

  it('a 20% share of any amount rounds once, half-up, to the cent (HH-EST-03)', () => {
    const rand = generator(104)
    const twenty = basisPoints(2000)
    for (let k = 0; k < RUNS; k++) {
      const x = rand(1_000_000_000)
      const share = percentOf(cents(x), twenty)
      // Independent reference: x / 5 rounded half-up is floor((x + 2) / 5) for non-negative x.
      expect(share).toBe(Math.floor((x + 2) / 5))
      // One rounding: the share is within half a cent of the exact value x / 5.
      expect(Math.abs(share * 5 - x)).toBeLessThanOrEqual(2)
    }
  })

  it('any percentage share matches the exact half-up reference', () => {
    const rand = generator(7)
    for (let k = 0; k < RUNS; k++) {
      const x = BigInt(rand(1_000_000_000))
      const bp = rand(10_001)
      const exact = x * BigInt(bp)
      const reference = exact / 10_000n + ((exact % 10_000n) * 2n >= 10_000n ? 1n : 0n)
      expect(BigInt(percentOf(cents(Number(x)), basisPoints(bp)))).toBe(reference)
    }
  })

  it('line totals match quantity x price rounded once half-up', () => {
    const rand = generator(83)
    for (let k = 0; k < RUNS; k++) {
      const price = BigInt(rand(10_000_000)) // up to $99,999.99
      const qty = BigInt(rand(10_000_000)) // up to 9,999.999 units
      const exact = price * qty // in thousandths of a cent
      const reference = exact / 1000n + (exact % 1000n >= 500n ? 1n : 0n)
      expect(BigInt(lineTotal(cents(Number(price)), quantityFromMinor(Number(qty))))).toBe(reference)
    }
  })

  it('allocations always sum to the whole and each part is within one cent of its exact share', () => {
    const rand = generator(5)
    for (let k = 0; k < RUNS; k++) {
      const total = rand(10_000_000)
      const weights = Array.from({ length: 1 + rand(8) }, () => 1 + rand(1_000_000))
      const parts = allocate(cents(total), weights)
      expect(sum(parts)).toBe(total)
      const whole = weights.reduce((a, b) => a + b, 0)
      parts.forEach((p, i) => {
        const floor = (BigInt(total) * BigInt(weights[i] ?? 0)) / BigInt(whole)
        expect(BigInt(p) === floor || BigInt(p) === floor + 1n).toBe(true)
      })
    }
  })

  it('totals equal the sum of the displayed lines minus the discount row, and the deposit uses that total', () => {
    const rand = generator(145)
    const rule = { thresholdCents: cents(100000), percent: basisPoints(2000) }
    for (let k = 0; k < RUNS; k++) {
      const lines = Array.from({ length: 1 + rand(6) }, () => cents(1 + rand(60_000)))
      const discountPercent = rand(2) === 0 ? null : basisPoints(1000)
      const r = estimateTotals({ lines, discountPercent, depositRule: rule })
      expect(r.ok).toBe(true)
      if (!r.ok) continue
      const subtotal = lines.reduce((a, b) => a + b, 0)
      expect(r.totals.subtotal).toBe(subtotal)
      expect(r.totals.total).toBe(subtotal - r.totals.discount)
      expect(r.totals.deposit).toEqual(depositFor(r.totals.total, rule))
      expect(r.totals.deposit?.required).toBe(r.totals.total > 100000)
    }
  })

  it('formatting and decimal text round-trip through the boundary parser exactly', () => {
    const rand = generator(1)
    const intl = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
    for (let k = 0; k < RUNS; k++) {
      const x = (rand(2) === 0 ? -1 : 1) * rand(2_000_000_000) * (1 + rand(1000))
      const c: Cents = cents(x)
      const text = toDecimalString(c)
      expect(parseCents(text.replace('.', '').replace(/^(-?)0+(?=\d)/, '$1'))).toBe(c)
      // Intl formats a decimal string exactly (no float); our integer formatter must agree with en-US output.
      expect(formatUsd(c)).toBe(intl.format(text as `${number}`))
    }
  })
})
