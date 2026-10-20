// Configuration shapes and the typed accessor (TSK-0007; RULE-DECIDED-VALUES-ACTIVE, RULE-NO-INVENTED-FACTS,
// RULE-AI-WAVE2, HH-FIN-01). The database side is covered by test/integration/config.test.ts.
import { describe, expect, it } from 'vitest'
import {
  aiModule,
  CONFIG_KEYS,
  ConfigNotConfiguredError,
  ConfigShapeError,
  type Config,
  type ConfigEntry,
  type ConfigKey,
  isConfigKey,
  parseValue,
  requireConfigured,
} from '../../src/platform/config/index.js'

const fakeConfig = (entries: Partial<{ [K in ConfigKey]: ConfigEntry<K> }>): Config => ({
  get: <K extends ConfigKey>(key: K) =>
    (entries[key] as ConfigEntry<K> | undefined) ?? { state: 'NOT_CONFIGURED', key, version: null, sourceIds: [] },
  entries: () => [],
})

describe('configuration value shapes (TSK-0007, HH-FIN-01)', () => {
  it('accepts the deposit rule in integer cents and basis points', () => {
    expect(
      parseValue('deposit.rule', {
        comparison: 'greater_than',
        thresholdCents: 100000,
        percentBps: 2000,
        base: 'final_total_after_discount',
        rounding: 'half_up',
      }),
    ).toMatchObject({ thresholdCents: 100000, percentBps: 2000 })
  })

  it('refuses floats, unknown fields, missing fields and wrong literals (RULE-MONEY-CENTS)', () => {
    const ok = {
      comparison: 'greater_than',
      thresholdCents: 100000,
      percentBps: 2000,
      base: 'final_total_after_discount',
      rounding: 'half_up',
    }
    expect(() => parseValue('deposit.rule', { ...ok, thresholdCents: 1000.5 })).toThrow(ConfigShapeError)
    expect(() => parseValue('deposit.rule', { ...ok, extra: 1 })).toThrow(/unknown field/)
    const { rounding: _r, ...missing } = ok
    void _r
    expect(() => parseValue('deposit.rule', missing)).toThrow(/missing/)
    expect(() => parseValue('deposit.rule', { ...ok, comparison: 'at_least' })).toThrow(ConfigShapeError)
    expect(() =>
      parseValue('cancellation.rules', { rescheduleFree: true, noticeHours: 24, lateCancellationCents: '5000' }),
    ).toThrow(ConfigShapeError)
  })

  it('has no minimum-charge, surcharge or tax-rate key: no hidden setting can restore one (FACT-NO-MINIMUM, T02)', () => {
    const keys = Object.keys(CONFIG_KEYS)
    expect(keys.filter((k) => /minimum|surcharge|tax_rate|price_book/.test(k))).toEqual([])
    expect(() => parseValue('payment.methods', { methods: ['cash'], surcharge: true })).toThrow(ConfigShapeError)
    expect(() => parseValue('tax.mode', { mode: 'sales_tax' })).toThrow(ConfigShapeError)
    expect(isConfigKey('pricing.minimum_charge')).toBe(false)
  })
})

describe('typed accessor: callers must handle NOT_CONFIGURED (TSK-0007, RULE-NO-INVENTED-FACTS)', () => {
  it('a NOT CONFIGURED entry has no value to read without checking its state', () => {
    const entry = fakeConfig({}).get('business.mailing_address')
    // @ts-expect-error the value exists only after narrowing on state === 'CONFIGURED'
    expect(entry.value).toBeUndefined()
    expect(entry).toEqual({ state: 'NOT_CONFIGURED', key: 'business.mailing_address', version: null, sourceIds: [] })
    if (entry.state === 'CONFIGURED') expect(entry.value.lines.length).toBeGreaterThan(0)
  })

  it('requireConfigured gives the value, or a narrow NOT_CONFIGURED error naming the open source', () => {
    const cfg = fakeConfig({
      'business.mailing_address': {
        state: 'NOT_CONFIGURED',
        key: 'business.mailing_address',
        version: 1,
        sourceIds: ['FACT-BUSINESS-ADDRESS'],
      },
      'estimate.validity': {
        state: 'CONFIGURED',
        key: 'estimate.validity',
        value: { days: 14, from: 'published' },
        version: 1,
        sourceIds: ['FACT-ESTIMATE-VALIDITY'],
        proposed: false,
        effectiveFrom: new Date('2026-10-20T00:00:00Z'),
      },
    })
    expect(requireConfigured(cfg.get('estimate.validity')).value.days).toBe(14)
    expect(() => requireConfigured(cfg.get('business.mailing_address'))).toThrow(ConfigNotConfiguredError)
    expect(() => requireConfigured(cfg.get('business.mailing_address'))).toThrow(/FACT-BUSINESS-ADDRESS/)
  })
})

describe('AI disabled is a tested state (TSK-0007, RULE-AI-WAVE2)', () => {
  it('the AI module is disabled when configured off and when the key is missing', () => {
    const off = fakeConfig({
      'ai.module': {
        state: 'CONFIGURED',
        key: 'ai.module',
        value: { enabled: false },
        version: 1,
        sourceIds: ['RULE-AI-WAVE2'],
        proposed: false,
        effectiveFrom: new Date(),
      },
    })
    expect(aiModule(off)).toEqual({ state: 'AI_DISABLED', enabled: false })
    expect(aiModule(fakeConfig({}))).toEqual({ state: 'AI_DISABLED', enabled: false })
  })

  it('no value can enable it', () => {
    expect(() => parseValue('ai.module', { enabled: true })).toThrow(ConfigShapeError)
  })
})
