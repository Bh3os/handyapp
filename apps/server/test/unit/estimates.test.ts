// Server-side estimate totals from configuration (TSK-0052; HH-DATA-02, HH-EST-02, HH-EST-03, HH-BASE-02, T02, T31).
// The configuration below carries the decided values (FACT-DEPOSIT-RULE, FACT-PRICING-DISCOUNTS, FACT-TAX-NO-LINE) the
// way loadConfig returns them; amounts are synthetic (RULE-SYNTHETIC-DATA).
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { cents, type EstimateLineInput, quantity } from '@handyhub/money'
import { describe, expect, it } from 'vitest'
import {
  computeVersionTotals,
  discountFor,
  pricingPolicies,
  readinessProblems,
} from '../../src/modules/estimates/index.js'
import type { Config, ConfigEntry, ConfigKey } from '../../src/platform/config/index.js'

const configured = (key: ConfigKey, value: unknown, version = 1) =>
  ({
    state: 'CONFIGURED',
    key,
    value,
    version,
    sourceIds: ['TEST'],
    proposed: false,
    effectiveFrom: new Date(0),
  }) as const

function fakeConfig(entries: Partial<Record<ConfigKey, unknown>>): Config {
  const get = <K extends ConfigKey>(key: K): ConfigEntry<K> =>
    (key in entries
      ? configured(key, entries[key], 3)
      : { state: 'NOT_CONFIGURED', key, version: null, sourceIds: [] }) as unknown as ConfigEntry<K>
  return { get, entries: () => [] }
}

const DECIDED = {
  'deposit.rule': {
    comparison: 'greater_than',
    thresholdCents: 100000,
    percentBps: 2000,
    base: 'final_total_after_discount',
    rounding: 'half_up',
  },
  'discount.rule': {
    percentBps: 1000,
    categories: ['military', 'senior', 'returning_customer'],
    perJob: 'one_largest',
    appliedTo: 'subtotal',
  },
  'tax.mode': { mode: 'no_tax_line' },
}

const line = (qty: string, price: number): EstimateLineInput => ({
  kind: 'base',
  quantity: quantity(qty),
  unitPrice: cents(price),
})

describe('[HH-EST-03][HH-DATA-02] totals from the active configuration', () => {
  const policies = pricingPolicies(fakeConfig(DECIDED))

  it('maps the configured rules and pins their versions', () => {
    expect(policies).toEqual({
      deposit: { rule: { thresholdCents: 100000, percent: 2000 }, version: 3 },
      discount: { percent: 1000, categories: ['military', 'senior', 'returning_customer'], version: 3 },
      taxModeVersion: 3,
    })
  })

  it('[T02][HH-BASE-02] a low-value estimate keeps exactly its price', () => {
    expect(computeVersionTotals({ lines: [line('1', 3500)], policies, discountPercent: null }).totals).toEqual({
      subtotal: 3500,
      discount: 0,
      total: 3500,
      depositState: 'not_required',
      deposit: null,
      depositRuleVersion: 3,
      taxModeVersion: 3,
    })
  })

  it('[T31] totals are deterministic: same lines and policies, same totals', () => {
    const input = {
      lines: [line('2.5', 3333), line('0.125', 12345)],
      policies,
      discountPercent: policies.discount?.percent ?? null,
    }
    const first = computeVersionTotals(input)
    for (let i = 0; i < 10; i++) expect(computeVersionTotals(input)).toEqual(first)
    expect(first.totals).toMatchObject({ subtotal: 9876, discount: 988, total: 8888 })
  })

  it('the deposit is on the total after the discount, strictly over the threshold', () => {
    const d = discountFor(policies, 'military')
    expect(d).toEqual({ ok: true, discount: { category: 'military', percent: 1000, version: 3 } })
    // $1,111.12 - 10% ($111.11) = $1,000.01: over $1,000.00, so 20% = $200.002 -> $200.00.
    const r = computeVersionTotals({
      lines: [line('1', 111112)],
      policies,
      discountPercent: d.ok ? (d.discount?.percent ?? null) : null,
    })
    expect(r.totals).toMatchObject({
      subtotal: 111112,
      discount: 11111,
      total: 100001,
      depositState: 'required',
      deposit: 20000,
    })
  })

  it('a NOT CONFIGURED deposit rule is reported, never read as "no deposit"; a NOT CONFIGURED discount is refused', () => {
    const missing = pricingPolicies(fakeConfig({ 'tax.mode': DECIDED['tax.mode'] }))
    expect(missing).toEqual({ deposit: null, discount: null, taxModeVersion: 3 })
    const r = computeVersionTotals({ lines: [line('1', 3500)], policies: missing, discountPercent: null })
    expect(r.totals).toMatchObject({
      total: 3500,
      depositState: 'not_configured',
      deposit: null,
      depositRuleVersion: null,
    })
    expect(readinessProblems([{ description: 'x' }], [], 'not_configured')).toEqual([
      { code: 'DEPOSIT_RULE_NOT_CONFIGURED' },
    ])
    expect(discountFor(missing, 'military')).toEqual({ ok: false, problem: { code: 'DISCOUNT_NOT_CONFIGURED' } })
    expect(discountFor(policies, 'synthetic_unknown')).toEqual({
      ok: false,
      problem: { code: 'DISCOUNT_CATEGORY_UNKNOWN' },
    })
    expect(discountFor(missing, null)).toEqual({ ok: true, discount: null })
  })
})

describe('[HH-BASE-02][HH-DATA-02][FACT-NO-MINIMUM][FACT-TAX-NO-LINE] no minimum, tax or surcharge code path exists', () => {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'modules', 'estimates')
  const code = readdirSync(dir)
    .filter((f) => f.endsWith('.ts'))
    .map(
      (f) =>
        [
          f,
          readFileSync(path.join(dir, f), 'utf8')
            .replace(/\/\*[\s\S]*?\*\//g, ' ')
            .replace(/(^|\s)\/\/.*$/gm, ' '),
        ] as const,
    )

  it('the estimates module never names a minimum, top-up, surcharge or fee', () => {
    for (const [file, text] of code)
      expect(text.match(/minimum|min_?charge|top_?up|surcharge|\bfee\b/i), file).toBeNull()
  })

  it('the only tax names are the pinned tax-mode policy version', () => {
    const names = new Set(code.flatMap(([, text]) => [...text.matchAll(/\w*tax\w*/gi)].map((m) => m[0])))
    expect([...names].sort()).toEqual(
      // 'tax' alone is the key 'tax.mode' that the pinned version is read from.
      ['tax', 'taxMode', 'taxModeVersion', 'tax_mode_version'].sort(),
    )
  })

  it('a totals result has no tax, minimum or surcharge field', () => {
    const r = computeVersionTotals({
      lines: [line('1', 3500)],
      policies: pricingPolicies(fakeConfig(DECIDED)),
      discountPercent: null,
    })
    expect(Object.keys(r.totals ?? {}).filter((k) => /minimum|surcharge|fee|tax(?!ModeVersion)/i.test(k))).toEqual([])
  })
})
