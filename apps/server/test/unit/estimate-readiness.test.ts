// Publish readiness of an estimate version (TSK-0053; HH-EST-01, HH-EST-05, T31, T58, RULE-NO-INVENTED-FACTS). The
// configuration carries the decided values the way loadConfig returns them; the terms document and every amount are
// synthetic (RULE-SYNTHETIC-DATA).
import { LABEL_FAMILIES } from '@handyhub/i18n'
import { describe, expect, it } from 'vitest'
import {
  documentDetails,
  PUBLISH_PROBLEM_CODES,
  PUBLISH_REQUIRED_KEYS,
  readinessOf,
  type LineSnapshot,
  type VersionSnapshot,
} from '../../src/modules/estimates/index.js'
import type { Config, ConfigEntry, ConfigKey } from '../../src/platform/config/index.js'

function fakeConfig(entries: Partial<Record<ConfigKey, unknown>>): Config {
  const get = <K extends ConfigKey>(key: K): ConfigEntry<K> =>
    (key in entries
      ? {
          state: 'CONFIGURED',
          key,
          value: entries[key],
          version: 1,
          sourceIds: ['TEST'],
          proposed: false,
          effectiveFrom: new Date(0),
        }
      : { state: 'NOT_CONFIGURED', key, version: 1, sourceIds: [`OQ-${key}`] }) as unknown as ConfigEntry<K>
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
  'estimate.validity': { days: 14, from: 'published' },
  'business.name': { documentName: 'Handyhub LLC', brand: 'HandyHub' },
  'legal.estimate_terms': {
    documentId: 'test-terms-1',
    status: 'draft',
    attorneyReviewed: false,
    preparedOn: '2026-10-21',
    contentSha256: '0'.repeat(64),
  },
}

const LINES: LineSnapshot[] = [
  { kind: 'base', description: 'Synthetic repair', quantityMilli: 2500, unitPriceCents: 3333 },
  { kind: 'add_on', description: 'Synthetic option', quantityMilli: 1000, unitPriceCents: 500 },
]
// The totals the active configuration gives for LINES: 2.5 x $33.33 = $83.325 -> $83.33; no deposit at or below $1,000.
const SAVED: VersionSnapshot = {
  state: 'draft',
  discountCategory: null,
  discountRuleVersion: null,
  subtotalCents: 8333,
  discountCents: 0,
  totalCents: 8333,
  depositState: 'not_required',
  depositCents: null,
  depositRuleVersion: 1,
  taxModeVersion: 1,
}

describe('[HH-EST-05][HH-EST-01] publish readiness', () => {
  it('[HH-LANG-03] every readiness code has a staff label', () => {
    expect([...PUBLISH_PROBLEM_CODES]).toEqual([...LABEL_FAMILIES.estimateProblem])
  })

  it('[T31] a complete draft saved under the active configuration is ready', () => {
    expect(readinessOf(SAVED, LINES, fakeConfig(DECIDED))).toEqual({ ready: true, problems: [] })
  })

  it('[RULE-NO-INVENTED-FACTS] each NOT CONFIGURED required value is a reason, with the key and its sources', () => {
    expect([...PUBLISH_REQUIRED_KEYS]).toEqual([
      'business.name',
      'estimate.validity',
      'legal.estimate_terms',
      'tax.mode',
      'deposit.rule',
    ])
    for (const key of ['business.name', 'estimate.validity', 'legal.estimate_terms'] as const) {
      const config = fakeConfig(Object.fromEntries(Object.entries(DECIDED).filter(([k]) => k !== key)))
      expect(readinessOf(SAVED, LINES, config)).toEqual({
        ready: false,
        problems: [{ code: 'NOT_CONFIGURED', key, sourceIds: [`OQ-${key}`] }],
      })
    }
  })

  it('[T58][FACT-BUSINESS-ADDRESS] the missing mailing address blocks nothing and is omitted, never replaced', () => {
    const config = fakeConfig(DECIDED)
    expect(readinessOf(SAVED, LINES, config).ready).toBe(true)
    expect(documentDetails(config)).toEqual({
      issuerName: 'Handyhub LLC',
      mailingAddress: null,
      validityDays: 14,
      termsDocumentId: 'test-terms-1',
      discountCategories: ['military', 'senior', 'returning_customer'],
    })
  })

  it('names every incomplete line and the version state; nothing is ready with no base line', () => {
    const lines: LineSnapshot[] = [
      { kind: 'base', description: null, quantityMilli: null, unitPriceCents: 1000 },
      { kind: 'base', description: 'Synthetic', quantityMilli: 1000, unitPriceCents: null },
    ]
    expect(readinessOf({ ...SAVED, state: 'published' }, lines, fakeConfig(DECIDED)).problems).toEqual([
      { code: 'VERSION_NOT_EDITABLE' },
      { code: 'QUANTITY_UNKNOWN', line: 0 },
      { code: 'DESCRIPTION_MISSING', line: 0 },
      { code: 'UNIT_PRICE_MISSING', line: 1 },
    ])
    expect(readinessOf(SAVED, [LINES[1] as LineSnapshot], fakeConfig(DECIDED)).problems).toContainEqual({
      code: 'NO_LINES',
    })
  })

  it('stored totals that differ from the active configuration are outdated until saved again', () => {
    const config = fakeConfig(DECIDED)
    expect(readinessOf({ ...SAVED, totalCents: 8334 }, LINES, config).problems).toEqual([{ code: 'TOTALS_OUTDATED' }])
    expect(readinessOf({ ...SAVED, depositRuleVersion: null }, LINES, config).problems).toEqual([
      { code: 'TOTALS_OUTDATED' },
    ])
    // A discount category the active rule no longer lists is named, not dropped.
    expect(readinessOf({ ...SAVED, discountCategory: 'unknown_group' }, LINES, config).problems).toEqual([
      { code: 'DISCOUNT_CATEGORY_UNKNOWN' },
    ])
  })
})
