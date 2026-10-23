// Change-order pricing (TSK-0081; HH-CHG-01, OWN-DEC-145, OWN-DEC-203, RULE-MONEY-CENTS). Amounts are synthetic.
import { describe, expect, it } from 'vitest'
import { cents, MoneyError, priceChangeOrder, quantity, type ChangeOrderLineInput } from '../src/index.js'

const line = (kind: 'charge' | 'credit', qty: string | null, unitPrice: number | null): ChangeOrderLineInput => ({
  kind,
  quantity: qty === null ? null : quantity(qty),
  unitPrice: unitPrice === null ? null : cents(unitPrice),
})

describe('priceChangeOrder (TSK-0081)', () => {
  it('[HH-CHG-01] added work raises the total: each line rounded once half-up, the total the exact sum', () => {
    const r = priceChangeOrder({
      lines: [line('charge', '2.5', 4_999), line('charge', '1', 10_000)],
      baseTotal: cents(80_000),
      paid: cents(0),
    })
    // 2.5 x $49.99 = $124.975, rounded once half-up to $124.98.
    expect(r.lineAmounts).toEqual([12_498, 10_000])
    expect(r.problems).toEqual([])
    expect(r.totals).toEqual({ charges: 22_498, credits: 0, revisedTotal: 102_498 })
  })

  it('[OWN-DEC-203] a credit is a positive magnitude that lowers the total; it never raises it', () => {
    const r = priceChangeOrder({
      lines: [line('credit', '1', 15_000), line('charge', '1', 5_000)],
      baseTotal: cents(80_000),
      paid: cents(20_000),
    })
    expect(r.lineAmounts).toEqual([15_000, 5_000])
    expect(r.totals).toEqual({ charges: 5_000, credits: 15_000, revisedTotal: 70_000 })
  })

  it('[OWN-DEC-203] a credit larger than the remaining charge is refused: never a negative or zero charge', () => {
    // Nothing paid: the total may go down to $0.01, never to $0.00.
    const zero = priceChangeOrder({ lines: [line('credit', '1', 80_000)], baseTotal: cents(80_000), paid: cents(0) })
    expect(zero.totals).toBeNull()
    expect(zero.problems).toEqual([{ code: 'CREDIT_EXCEEDS_REMAINING_CHARGE', remaining: 80_000, reduction: 80_000 }])
    const almost = priceChangeOrder({ lines: [line('credit', '1', 79_999)], baseTotal: cents(80_000), paid: cents(0) })
    expect(almost.totals?.revisedTotal).toBe(1)
    // $300.00 paid: the total may not go below what was paid (that would be money owed back, the Owner's refund path).
    const paid = { baseTotal: cents(80_000), paid: cents(30_000) }
    expect(priceChangeOrder({ lines: [line('credit', '1', 50_000)], ...paid }).totals?.revisedTotal).toBe(30_000)
    expect(priceChangeOrder({ lines: [line('credit', '1', 50_001)], ...paid }).problems).toEqual([
      { code: 'CREDIT_EXCEEDS_REMAINING_CHARGE', remaining: 50_000, reduction: 50_001 },
    ])
    // Added charges in the same change order count against the credit.
    expect(
      priceChangeOrder({ lines: [line('credit', '1', 60_000), line('charge', '1', 10_000)], ...paid }).totals,
    ).toEqual({ charges: 10_000, credits: 60_000, revisedTotal: 30_000 })
  })

  it('an unknown quantity or price is reported, never read as zero; no lines is a problem', () => {
    const r = priceChangeOrder({
      lines: [line('charge', null, 5_000), line('credit', '1', null)],
      baseTotal: cents(80_000),
      paid: cents(0),
    })
    expect(r.lineAmounts).toEqual([null, null])
    expect(r.totals).toBeNull()
    expect(r.problems).toEqual([
      { code: 'QUANTITY_UNKNOWN', line: 0 },
      { code: 'UNIT_PRICE_MISSING', line: 1 },
    ])
    expect(priceChangeOrder({ lines: [], baseTotal: cents(1), paid: cents(0) }).problems).toEqual([
      { code: 'NO_LINES' },
    ])
  })

  it('[RULE-MONEY-CENTS] a line that rounds to $0.00 is refused, and only integer cents are accepted', () => {
    expect(
      priceChangeOrder({ lines: [line('charge', '0.001', 1)], baseTotal: cents(100), paid: cents(0) }).problems,
    ).toEqual([{ code: 'LINE_NOT_POSITIVE', line: 0 }])
    expect(() =>
      priceChangeOrder({
        lines: [{ kind: 'charge', quantity: quantity('1'), unitPrice: 1.5 as never }],
        baseTotal: cents(100),
        paid: cents(0),
      }),
    ).toThrow(MoneyError)
    expect(() =>
      priceChangeOrder({
        lines: [{ kind: 'refund' as never, quantity: quantity('1'), unitPrice: cents(1) }],
        baseTotal: cents(100),
        paid: cents(0),
      }),
    ).toThrow(MoneyError)
  })
})
