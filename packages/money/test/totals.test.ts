// Totals, discount row and deposit (TSK-0005; HH-EST-02, HH-EST-03, HH-FIN-02, T02, T31, T36).
// The deposit rule values below are the decided ones (FACT-DEPOSIT-RULE, OWN-DEC-104), passed in as policy data the
// way the server passes the active configuration; the package itself holds no business value.
import { describe, expect, it } from 'vitest'
import {
  basisPoints,
  cents,
  depositFor,
  estimateTotals,
  lineTotal,
  MoneyError,
  quantity,
  type DepositRule,
} from '../src/index.js'

const DEPOSIT: DepositRule = { thresholdCents: cents(100000), percent: basisPoints(2000) }
const TEN_PERCENT = basisPoints(1000)

describe('deposit at the boundary: strictly over $1,000.00, 20% half-up (HH-FIN-02, T36, OWN-DEC-104)', () => {
  it('requires no deposit at exactly $1,000.00', () => {
    expect(depositFor(cents(100000), DEPOSIT)).toEqual({ required: false, base: 100000 })
  })

  it('requires 20% at $1,000.01, rounded once to the cent ($200.002 -> $200.00)', () => {
    expect(depositFor(cents(100001), DEPOSIT)).toEqual({ required: true, base: 100001, amount: 20000 })
  })

  it('rounds the 20% share half-up above the boundary', () => {
    expect(depositFor(cents(100003), DEPOSIT)).toEqual({ required: true, base: 100003, amount: 20001 }) // 20000.6
    expect(depositFor(cents(100004), DEPOSIT)).toEqual({ required: true, base: 100004, amount: 20001 }) // 20000.8
    expect(depositFor(cents(250000), DEPOSIT)).toEqual({ required: true, base: 250000, amount: 50000 })
  })

  it('requires none below the threshold and for a small job', () => {
    expect(depositFor(cents(99999), DEPOSIT).required).toBe(false)
    expect(depositFor(cents(3500), DEPOSIT).required).toBe(false)
  })

  it('refuses a negative base, a negative threshold or an invalid share', () => {
    expect(() => depositFor(cents(-1), DEPOSIT)).toThrow(MoneyError)
    expect(() => depositFor(cents(1), { thresholdCents: cents(-1), percent: basisPoints(2000) })).toThrow(MoneyError)
    expect(() => depositFor(cents(1), { thresholdCents: cents(0), percent: 20.5 as never })).toThrow(MoneyError)
  })
})

describe('estimate totals: subtotal, discount row, total (HH-EST-03, OWN-DEC-83, T31)', () => {
  it('totals the displayed lines exactly, with no tax line and nothing added (FACT-TAX-NO-LINE)', () => {
    const lines = [lineTotal(cents(125), quantity('0.5')), lineTotal(cents(4599), quantity('3'))]
    const r = estimateTotals({ lines })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.totals).toEqual({
      currency: 'USD',
      lines: [63, 13797],
      subtotal: 13860,
      discount: 0,
      discountPercent: null,
      total: 13860,
    })
    expect(Object.keys(r.totals)).not.toContain('tax')
  })

  it('a low-value estimate keeps exactly its calculated price: no minimum and no top-up (T02, HH-EST-02)', () => {
    const r = estimateTotals({ lines: [cents(3500)], depositRule: DEPOSIT })
    expect(r).toEqual({
      ok: true,
      totals: {
        currency: 'USD',
        lines: [3500],
        subtotal: 3500,
        discount: 0,
        discountPercent: null,
        total: 3500,
        deposit: { required: false, base: 3500 },
      },
    })
    expect(estimateTotals({ lines: [cents(1)] }).ok).toBe(true)
  })

  it('computes the discount as a separate row on the subtotal, half-up (OWN-DEC-145)', () => {
    const r = estimateTotals({ lines: [cents(2000), cents(1505)], discountPercent: TEN_PERCENT })
    expect(r.ok && r.totals).toMatchObject({ subtotal: 3505, discount: 351, discountPercent: 1000, total: 3154 })
    if (r.ok) expect(r.totals.lines).toEqual([2000, 1505]) // the discount is never a line
  })
})

describe('the deposit is computed on the total after the discount (HH-FIN-02, HH-EST-03, T36)', () => {
  it('no deposit when the discount brings the total to exactly $1,000.00, although the subtotal is over', () => {
    // $1,111.11 - 10% ($111.111 -> $111.11) = $1,000.00.
    const r = estimateTotals({ lines: [cents(111111)], discountPercent: TEN_PERCENT, depositRule: DEPOSIT })
    expect(r.ok && r.totals).toMatchObject({
      subtotal: 111111,
      discount: 11111,
      total: 100000,
      deposit: { required: false, base: 100000 },
    })
  })

  it('a deposit of 20% of the discounted total when it is $1,000.01', () => {
    // $1,111.12 - 10% ($111.112 -> $111.11) = $1,000.01; 20% = $200.002 -> $200.00.
    const r = estimateTotals({ lines: [cents(111112)], discountPercent: TEN_PERCENT, depositRule: DEPOSIT })
    expect(r.ok && r.totals).toMatchObject({
      subtotal: 111112,
      discount: 11111,
      total: 100001,
      deposit: { required: true, base: 100001, amount: 20000 },
    })
  })

  it('a selected option that takes the total over the threshold makes the deposit apply (T36)', () => {
    const without = estimateTotals({ lines: [cents(99999)], depositRule: DEPOSIT })
    const withOption = estimateTotals({ lines: [cents(99999), cents(2)], depositRule: DEPOSIT })
    expect(without.ok && without.totals.deposit).toEqual({ required: false, base: 99999 })
    expect(withOption.ok && withOption.totals.deposit).toEqual({ required: true, base: 100001, amount: 20000 })
  })
})

describe('no line may be zero or negative; the total must be above $0.00 (HH-EST-02, OWN-DEC-145, T02)', () => {
  it('refuses a $0.00 line and a negative line, naming each', () => {
    expect(estimateTotals({ lines: [cents(3500), cents(0), cents(-500)] })).toEqual({
      ok: false,
      problems: [
        { code: 'LINE_NOT_POSITIVE', line: 1, amount: 0 },
        { code: 'LINE_NOT_POSITIVE', line: 2, amount: -500 },
      ],
    })
  })

  it('refuses a line that rounds to $0.00', () => {
    const tiny = lineTotal(cents(1), quantity('0.4')) // 0.4 cent -> 0
    expect(tiny).toBe(0)
    expect(estimateTotals({ lines: [tiny] })).toEqual({
      ok: false,
      problems: [{ code: 'LINE_NOT_POSITIVE', line: 0, amount: 0 }],
    })
  })

  it('refuses an estimate with no lines', () => {
    expect(estimateTotals({ lines: [] })).toEqual({ ok: false, problems: [{ code: 'NO_LINES' }] })
  })

  it('refuses a total that is not above $0.00 after the discount', () => {
    expect(estimateTotals({ lines: [cents(500)], discountPercent: basisPoints(10000) })).toEqual({
      ok: false,
      problems: [{ code: 'TOTAL_NOT_POSITIVE', total: 0 }],
    })
  })
})
