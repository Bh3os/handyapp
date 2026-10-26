// Publish readiness of an estimate version (TSK-0053; HH-EST-01, HH-EST-05, T31, T58, RULE-NO-INVENTED-FACTS) and the
// documents an uploaded version needs (TSK-0054; HH-EST-11). The
// configuration carries the decided values the way loadConfig returns them; the terms document and every amount are
// synthetic (RULE-SYNTHETIC-DATA).
import { LABEL_FAMILIES } from '@handyhub/i18n'
import { describe, expect, it } from 'vitest'
import {
  documentDetails,
  DOCX_TYPE,
  PDF_TYPE,
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
  'business.timezone': { zone: 'America/Kentucky/Louisville' },
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
  authoringMethod: 'written',
  agreementDocumentId: null,
  documents: null,
  discountCategory: null,
  discountRuleVersion: null,
  discountRequest: null,
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
      // TSK-0055: the validity days are counted in the business time zone (FACT-ESTIMATE-VALIDITY).
      'business.timezone',
    ])
    for (const key of ['business.name', 'estimate.validity', 'legal.estimate_terms', 'business.timezone'] as const) {
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

  it('[HH-EST-15] only the discount the customer requested; provisional while pending, never once it failed', () => {
    const config = fakeConfig(DECIDED)
    // $83.33 less 10% (half-up, $8.33) = $75.00, with the rule version the totals pinned.
    const discounted: VersionSnapshot = {
      ...SAVED,
      discountCategory: 'military',
      discountRuleVersion: 1,
      discountCents: 833,
      totalCents: 7500,
    }
    const request = (category: 'military' | 'senior', state: string) =>
      ({ category, state }) as VersionSnapshot['discountRequest']
    expect(readinessOf({ ...discounted, discountRequest: null }, LINES, config).problems).toEqual([
      { code: 'DISCOUNT_NOT_REQUESTED' },
    ])
    expect(
      readinessOf({ ...discounted, discountRequest: request('senior', 'verified') }, LINES, config).problems,
    ).toEqual([{ code: 'DISCOUNT_NOT_REQUESTED' }])
    for (const state of ['pending', 'owner_review', 'verified'])
      expect(readinessOf({ ...discounted, discountRequest: request('military', state) }, LINES, config)).toEqual({
        ready: true,
        problems: [],
      })
    for (const state of ['not_verified', 'declined'])
      expect(
        readinessOf({ ...discounted, discountRequest: request('military', state) }, LINES, config).problems,
      ).toEqual([{ code: 'DISCOUNT_NOT_VERIFIED' }])
    // A version without a discount is ready whatever the request says.
    expect(readinessOf({ ...SAVED, discountRequest: request('military', 'declined') }, LINES, config).ready).toBe(true)
  })
})

describe('[HH-EST-11][T31] an uploaded version also needs its documents and the agree-confirmation', () => {
  const config = fakeConfig(DECIDED)
  const uploaded = (documents: VersionSnapshot['documents'], agreementDocumentId: string | null = null) =>
    readinessOf({ ...SAVED, authoringMethod: 'uploaded', documents, agreementDocumentId }, LINES, config)
  const pdf = { id: 'original-1', contentType: PDF_TYPE, state: 'ready' }
  const word = { id: 'original-2', contentType: DOCX_TYPE, state: 'ready' }
  const copy = { id: 'customer-1', state: 'ready' }

  it('the same structured amounts with no document: the document is missing and nothing is confirmed', () => {
    expect(uploaded({ original: null, customerPdf: null }).problems).toEqual([
      { code: 'DOCUMENT_MISSING' },
      { code: 'AGREEMENT_NOT_CONFIRMED' },
    ])
  })

  it('a document still in quarantine or refused by processing is named', () => {
    expect(
      uploaded({ original: { ...pdf, state: 'quarantined' }, customerPdf: { ...copy, state: 'quarantined' } }).problems,
    ).toEqual([{ code: 'DOCUMENT_PROCESSING' }, { code: 'AGREEMENT_NOT_CONFIRMED' }])
    expect(
      uploaded({ original: { ...pdf, state: 'rejected' }, customerPdf: { ...copy, state: 'rejected' } }).problems,
    ).toEqual([{ code: 'DOCUMENT_REJECTED' }, { code: 'AGREEMENT_NOT_CONFIRMED' }])
  })

  it('[OWN-DEC-102] a Word original without a PDF for the customer: "PDF required", never a fake conversion', () => {
    expect(uploaded({ original: word, customerPdf: null }).problems).toEqual([
      { code: 'PDF_REQUIRED' },
      { code: 'AGREEMENT_NOT_CONFIRMED' },
    ])
    expect(uploaded({ original: word, customerPdf: { ...copy, state: 'rejected' } }).problems).toEqual([
      { code: 'DOCUMENT_REJECTED' },
      { code: 'PDF_REQUIRED' },
      { code: 'AGREEMENT_NOT_CONFIRMED' },
    ])
    expect(uploaded({ original: word, customerPdf: copy }, copy.id)).toEqual({ ready: true, problems: [] })
  })

  it('the confirmation counts only for the current customer PDF', () => {
    expect(uploaded({ original: pdf, customerPdf: copy }, copy.id)).toEqual({ ready: true, problems: [] })
    expect(uploaded({ original: pdf, customerPdf: copy }, 'an-older-customer-pdf').problems).toEqual([
      { code: 'AGREEMENT_NOT_CONFIRMED' },
    ])
  })

  it('a written version needs no document (the same lines and totals are ready)', () => {
    expect(readinessOf(SAVED, LINES, config)).toEqual({ ready: true, problems: [] })
  })
})
