// Estimate pricing and validation (TSK-0052; HH-DATA-02, HH-EST-02, HH-EST-03, HH-BASE-02, T02, T31, T58).
// Amounts are synthetic (RULE-SYNTHETIC-DATA); the deposit and discount shares are passed in as policy data the way
// the server passes the active configuration (FACT-DEPOSIT-RULE, FACT-PRICING-DISCOUNTS).
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as money from '../src/index.js'
import {
  assertCurrency,
  basisPoints,
  cents,
  type DepositRule,
  type EstimateLineInput,
  internalMargin,
  MoneyError,
  priceEstimate,
  quantity,
} from '../src/index.js'

const DEPOSIT: DepositRule = { thresholdCents: cents(100000), percent: basisPoints(2000) }
const TEN_PERCENT = basisPoints(1000)
const base = (qty: string | null, price: number | null): EstimateLineInput => ({
  kind: 'base',
  quantity: qty === null ? null : quantity(qty),
  unitPrice: price === null ? null : cents(price),
})

describe('[HH-EST-02][HH-BASE-02][T02] a low-value estimate keeps exactly its calculated price', () => {
  it('one $35.00 line totals $35.00: no minimum, no top-up, no deposit', () => {
    const r = priceEstimate({ currency: 'USD', lines: [base('1', 3500)], depositRule: DEPOSIT })
    expect(r.problems).toEqual([])
    expect(r.lineAmounts).toEqual([3500])
    expect(r.totals).toEqual({
      currency: 'USD',
      lines: [3500],
      subtotal: 3500,
      discount: 0,
      discountPercent: null,
      total: 3500,
      deposit: { required: false, base: 3500 },
    })
  })

  it('a one-cent estimate stays one cent', () => {
    expect(priceEstimate({ currency: 'USD', lines: [base('1', 1)] }).totals?.total).toBe(1)
  })
})

describe('[HH-EST-03][HH-DATA-02][T31] exact, deterministic integer-cent totals', () => {
  it('rounds once per line half-up; the subtotal is the sum of the displayed lines', () => {
    // 0.333 x $10.00 = $3.33 exactly; 2.5 x $0.33 = $0.825 -> $0.83; 1.005 x $1.00 = $1.005 -> $1.01
    const r = priceEstimate({
      currency: 'USD',
      lines: [base('0.333', 1000), base('2.5', 33), base('1.005', 100)],
    })
    expect(r.lineAmounts).toEqual([333, 83, 101])
    expect(r.totals?.subtotal).toBe(333 + 83 + 101)
    expect(r.totals?.total).toBe(517)
  })

  it('the same input always gives the same result', () => {
    const input = {
      currency: 'USD',
      lines: [
        base('3', 4599),
        base('0.125', 12345),
        { kind: 'add_on', quantity: quantity('2'), unitPrice: cents(999) },
      ],
      selectedOptions: [2],
      discountPercent: TEN_PERCENT,
      depositRule: DEPOSIT,
    } as const
    const first = priceEstimate(input)
    for (let i = 0; i < 20; i++) expect(priceEstimate(input)).toEqual(first)
    expect(first.totals).toMatchObject({ subtotal: 13797 + 1543 + 1998, discount: 1734, total: 15604 })
  })

  it('a discount is a separate totals row on the subtotal, half-up; the deposit is on the total after it', () => {
    // Subtotal $1,111.05; 10% = $111.105 -> $111.11; total $999.94: not over $1,000.00, so no deposit.
    const r = priceEstimate({
      currency: 'USD',
      lines: [base('1', 111105)],
      discountPercent: TEN_PERCENT,
      depositRule: DEPOSIT,
    })
    expect(r.totals).toMatchObject({
      lines: [111105],
      subtotal: 111105,
      discount: 11111,
      discountPercent: 1000,
      total: 99_994,
      deposit: { required: false, base: 99_994 },
    })
    // The discount never becomes a line: the line amounts are unchanged.
    expect(r.lineAmounts).toEqual([111105])
  })

  it('options count only when selected; the deposit includes the selected options (HH-EST-01)', () => {
    const lines: EstimateLineInput[] = [
      base('1', 90000),
      { kind: 'alternate', quantity: quantity('1'), unitPrice: cents(20000) },
      { kind: 'add_on', quantity: quantity('1'), unitPrice: cents(5000) },
    ]
    const offer = priceEstimate({ currency: 'USD', lines, depositRule: DEPOSIT })
    expect(offer.totals).toMatchObject({ total: 90000, deposit: { required: false } })
    const chosen = priceEstimate({ currency: 'USD', lines, selectedOptions: [1], depositRule: DEPOSIT })
    expect(chosen.totals).toMatchObject({
      lines: [90000, 20000],
      total: 110000,
      deposit: { required: true, base: 110000, amount: 22000 },
    })
    expect(priceEstimate({ currency: 'USD', lines, selectedOptions: [0] }).problems).toEqual([
      { code: 'NOT_AN_OPTION', line: 0 },
    ])
  })
})

describe('[HH-EST-02][HH-DATA-02][T02] invalid lines and combinations are refused, never clamped', () => {
  it('a $0 line and a line that rounds to $0 are refused with their index (OWN-DEC-145)', () => {
    const r = priceEstimate({ currency: 'USD', lines: [base('1', 3500), base('0.001', 1), base('0', 500)] })
    expect(r.totals).toBeNull()
    expect(r.problems).toEqual([
      { code: 'LINE_NOT_POSITIVE', line: 1, amount: 0 },
      { code: 'LINE_NOT_POSITIVE', line: 2, amount: 0 },
    ])
  })

  it('a negative line is refused; a negative quantity cannot be written', () => {
    const r = priceEstimate({ currency: 'USD', lines: [base('1', 3500), base('1', -500)] })
    expect(r.problems).toEqual([{ code: 'LINE_NOT_POSITIVE', line: 1, amount: -500 }])
    expect(() => quantity('-1')).toThrow(MoneyError)
  })

  it('unknown quantities and missing prices stay unknown and are reported, never read as zero', () => {
    const r = priceEstimate({ currency: 'USD', lines: [base(null, 3500), base('2', null)] })
    expect(r.lineAmounts).toEqual([null, null])
    expect(r.problems).toEqual([
      { code: 'QUANTITY_UNKNOWN', line: 0 },
      { code: 'UNIT_PRICE_MISSING', line: 1 },
    ])
    expect(r.totals).toBeNull()
  })

  it('a 100% discount leaves a total that is not above $0.00: refused', () => {
    const r = priceEstimate({ currency: 'USD', lines: [base('1', 3500)], discountPercent: basisPoints(10_000) })
    expect(r.problems).toEqual([{ code: 'TOTAL_NOT_POSITIVE', total: 0 }])
  })

  it('an unsupported currency and an estimate without base lines are refused', () => {
    expect(priceEstimate({ currency: 'EUR', lines: [base('1', 3500)] }).problems).toEqual([
      { code: 'UNSUPPORTED_CURRENCY', currency: 'EUR' },
    ])
    expect(priceEstimate({ currency: 'USD', lines: [] }).problems).toEqual([{ code: 'NO_LINES' }])
    expect(() => assertCurrency('CAD')).toThrow(MoneyError)
    expect(() => assertCurrency('USD')).not.toThrow()
  })

  it('a float or cast amount still throws instead of being computed', () => {
    expect(() =>
      priceEstimate({ currency: 'USD', lines: [{ kind: 'base', quantity: quantity('1'), unitPrice: 1.5 as never }] }),
    ).toThrow(MoneyError)
    expect(() =>
      priceEstimate({ currency: 'USD', lines: [{ kind: 'fee' as never, quantity: null, unitPrice: null }] }),
    ).toThrow(MoneyError)
  })
})

describe('[HH-EST-03] internal margin is computed in cents for staff projections only', () => {
  it('sums the costs and subtracts them from the revenue; a loss is shown as it is', () => {
    expect(internalMargin(cents(15000), [cents(4000), cents(2500)])).toEqual({ cost: 6500, margin: 8500 })
    expect(internalMargin(cents(1000), [cents(1500)])).toEqual({ cost: 1500, margin: -500 })
    expect(() => internalMargin(cents(1000), [cents(-1)])).toThrow(MoneyError)
  })
})

describe('[HH-BASE-02][HH-DATA-02][FACT-NO-MINIMUM][FACT-TAX-NO-LINE] no minimum, tax or surcharge code path exists', () => {
  const FORBIDDEN = /minimum|min_?charge|floor_?price|top_?up|tax|surcharge|convenience_?fee|rounding_?adjust/i

  it('no exported name and no totals field names a minimum, tax, surcharge or top-up', () => {
    expect(Object.keys(money).filter((name) => FORBIDDEN.test(name))).toEqual([])
    const r = priceEstimate({
      currency: 'USD',
      lines: [base('1', 3500)],
      discountPercent: TEN_PERCENT,
      depositRule: DEPOSIT,
    })
    const keys = [...Object.keys(r), ...Object.keys(r.totals ?? {}), ...Object.keys(r.totals?.deposit ?? {})]
    expect(keys.filter((k) => FORBIDDEN.test(k))).toEqual([])
  })

  it('the package source, comments removed, never mentions one', () => {
    const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src')
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
      const code = readFileSync(path.join(dir, file), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/(^|\s)\/\/.*$/gm, ' ')
      expect(code.match(FORBIDDEN), file).toBeNull()
    }
  })
})
