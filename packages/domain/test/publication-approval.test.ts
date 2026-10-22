// Owner approval before publishing over the threshold (TSK-0130; HH-EST-16, OWN-DEC-173, FACT-OWNER-APPROVAL-THRESHOLD,
// FACT-MARGIN-TARGET). The threshold is passed in as the configured value would be (250000 cents, version 1); every
// other amount is synthetic.
import { describe, expect, it } from 'vitest'
import {
  evaluateChangeOrderPublication,
  evaluateEstimatePublication,
  marginOf,
  type EstimatePublicationFacts,
  type LinkedDocument,
} from '../src/index.js'

const threshold = { thresholdCents: 250_000, version: 1 }
const estimate = (over: Partial<EstimatePublicationFacts> = {}): EstimatePublicationFacts => ({
  proposedTotalCents: 100_000,
  highestTotalCents: 100_000,
  adjustments: [],
  costs: null,
  linked: [],
  ...over,
})
const linked = (valueCents: number, over: Partial<LinkedDocument> = {}): LinkedDocument => ({
  kind: 'estimate',
  id: 'e2',
  reference: 'HH-TEST-E2',
  version: 1,
  state: 'published',
  valueCents,
  ...over,
})

describe('[HH-EST-16] the estimate threshold is "greater than" the configured value', () => {
  it('[HH-EST-16] exactly $2,500.00 needs no approval', () => {
    const e = evaluateEstimatePublication(
      threshold,
      estimate({ proposedTotalCents: 250_000, highestTotalCents: 250_000 }),
    )
    expect(e).toMatchObject({ required: false, reasons: [], thresholdCents: 250_000, thresholdVersion: 1 })
  })

  it('[HH-EST-16] $2,500.01 needs the Owner', () => {
    const e = evaluateEstimatePublication(
      threshold,
      estimate({ proposedTotalCents: 250_001, highestTotalCents: 250_001 }),
    )
    expect(e).toMatchObject({ required: true, reasons: ['over_threshold'], flags: [] })
  })

  it('[HH-EST-16] the final total after the decided discount is compared, not the subtotal', () => {
    const discount = { kind: 'rule_discount', amountCents: 27_000, reason: 'military' } as const
    // $2,700.00 less the 10% rule discount is $2,430.00: no approval, and the rule discount is not flagged.
    expect(
      evaluateEstimatePublication(
        threshold,
        estimate({ proposedTotalCents: 243_000, highestTotalCents: 243_000, adjustments: [discount] }),
      ),
    ).toMatchObject({ required: false, flags: [] })
    // $2,800.00 less 10% is $2,520.00: over.
    expect(
      evaluateEstimatePublication(
        threshold,
        estimate({ proposedTotalCents: 252_000, highestTotalCents: 252_000, adjustments: [discount] }),
      ).reasons,
    ).toEqual(['over_threshold'])
  })

  it('[HH-EST-16] an option that can carry the approved total past the threshold needs the Owner (PROPOSED)', () => {
    const e = evaluateEstimatePublication(
      threshold,
      estimate({ proposedTotalCents: 200_000, highestTotalCents: 250_001 }),
    )
    expect(e.reasons).toEqual(['options_over_threshold'])
  })

  it('[HH-EST-16] the threshold NOT CONFIGURED: every publication waits for the Owner (fail closed)', () => {
    const e = evaluateEstimatePublication(null, estimate())
    expect(e).toMatchObject({ required: true, reasons: ['threshold_not_configured'], thresholdCents: null })
  })

  it('[HH-EST-16] a changed threshold (an Owner configuration version) is the one compared', () => {
    const raised = { thresholdCents: 300_000, version: 2 }
    expect(evaluateEstimatePublication(raised, estimate({ proposedTotalCents: 250_001 })).required).toBe(false)
  })
})

describe('[HH-EST-16] splitting: the linked documents of the same project across their history', () => {
  it('[HH-EST-16] two estimates of one project that together exceed the threshold need the Owner', () => {
    const e = evaluateEstimatePublication(
      threshold,
      estimate({ proposedTotalCents: 150_000, linked: [linked(110_000)] }),
    )
    expect(e).toMatchObject({ required: true, reasons: ['combined_project_total'], combinedProjectCents: 260_000 })
  })

  it('[HH-EST-16] an expired or accepted estimate still counts (no validity window)', () => {
    for (const state of ['expired', 'accepted'])
      expect(
        evaluateEstimatePublication(
          threshold,
          estimate({ proposedTotalCents: 150_000, linked: [linked(110_000, { state })] }),
        ).reasons,
      ).toEqual(['combined_project_total'])
  })

  it('[HH-EST-16] together at exactly the threshold needs no approval', () => {
    expect(
      evaluateEstimatePublication(threshold, estimate({ proposedTotalCents: 150_000, linked: [linked(100_000)] }))
        .required,
    ).toBe(false)
  })
})

describe('[HH-EST-16] flags route a document to the Owner at any total', () => {
  it('[HH-EST-16][FACT-MARGIN-TARGET] a negative margin from complete costs', () => {
    const e = evaluateEstimatePublication(
      threshold,
      estimate({ proposedTotalCents: 50_000, costs: { laborCents: 40_000, materialCents: 20_000, complete: true } }),
    )
    expect(e).toMatchObject({ required: true, reasons: ['negative_margin'], flags: ['negative_margin'] })
    expect(e.margin).toEqual({
      laborCents: 40_000,
      materialCents: 20_000,
      complete: true,
      grossProfitCents: -10_000,
      marginBps: -2000,
      negative: true,
    })
  })

  it('[FACT-MARGIN-TARGET] incomplete costs give no final margin; known costs above the price are still negative', () => {
    expect(marginOf(100_000, { laborCents: 30_000, materialCents: 0, complete: false })).toEqual({
      laborCents: 30_000,
      materialCents: 0,
      complete: false,
      grossProfitCents: null,
      marginBps: null,
      negative: false,
    })
    expect(marginOf(100_000, { laborCents: 120_000, materialCents: 0, complete: false })?.negative).toBe(true)
    expect(marginOf(100_000, null)).toBeNull()
  })

  it('[FACT-MARGIN-TARGET] the margin is basis points, half-up, from integer cents', () => {
    // (300 - 200) / 300 = 33.333...% -> 3333 bps; (200 - 100.01) / 200 = 49.995% -> 5000 bps (half-up).
    expect(marginOf(30_000, { laborCents: 20_000, materialCents: 0, complete: true })?.marginBps).toBe(3333)
    expect(marginOf(20_000, { laborCents: 10_001, materialCents: 0, complete: true })?.marginBps).toBe(5000)
    expect(marginOf(20_000, { laborCents: 10_001, materialCents: 0, complete: true })?.grossProfitCents).toBe(9999)
  })

  it('[HH-EST-16] by substance: a discretionary discount, a discretionary credit, a refund and an undocumented correction need the Owner', () => {
    const e = evaluateEstimatePublication(
      threshold,
      estimate({
        adjustments: [
          { kind: 'discretionary_discount', amountCents: 5_000, reason: 'goodwill' },
          { kind: 'discretionary_credit', amountCents: 1, reason: 'goodwill' },
          { kind: 'refund', amountCents: 2_000, reason: 'returned materials' },
          { kind: 'clerical_correction', amountCents: 1_000, reason: null },
        ],
      }),
    )
    expect(e.reasons).toEqual(['discretionary_discount', 'discretionary_credit', 'refund', 'undocumented_correction'])
    expect(e.required).toBe(true)
  })

  it('[HH-EST-16] a genuine documented clerical correction and the decided rule discount need nothing more', () => {
    const e = evaluateEstimatePublication(
      threshold,
      estimate({
        adjustments: [
          { kind: 'clerical_correction', amountCents: 1_000, reason: 'Line 2 quantity was typed as 12 instead of 2' },
          { kind: 'rule_discount', amountCents: 10_000, reason: 'senior' },
        ],
      }),
    )
    expect(e.required).toBe(false)
  })

  it('[HH-EST-16] a configured materiality lets a smaller discretionary credit through (PROPOSED: from 1 cent)', () => {
    const facts = estimate({ adjustments: [{ kind: 'discretionary_credit', amountCents: 500, reason: 'goodwill' }] })
    expect(evaluateEstimatePublication(threshold, facts).flags).toEqual(['discretionary_credit'])
    expect(evaluateEstimatePublication(threshold, facts, { materialFromCents: 1_000 }).required).toBe(false)
  })

  it('[HH-EST-16] any single adjustment over the threshold needs the Owner, documented or not', () => {
    const e = evaluateEstimatePublication(
      threshold,
      estimate({ adjustments: [{ kind: 'clerical_correction', amountCents: 250_001, reason: 'wrong unit price' }] }),
    )
    expect(e.reasons).toEqual(['adjustment_over_threshold'])
  })

  it('[HH-EST-16] a documented correction never takes a document out of the threshold', () => {
    const e = evaluateEstimatePublication(
      threshold,
      estimate({
        proposedTotalCents: 260_000,
        highestTotalCents: 260_000,
        adjustments: [{ kind: 'clerical_correction', amountCents: 10_000, reason: 'calculation error on line 1' }],
      }),
    )
    expect(e.reasons).toEqual(['over_threshold'])
  })

  it('[HH-EST-16] an adjustment is a positive magnitude', () => {
    expect(() =>
      evaluateEstimatePublication(
        threshold,
        estimate({ adjustments: [{ kind: 'refund', amountCents: -1, reason: 'x' }] }),
      ),
    ).toThrow(RangeError)
  })
})

describe('[HH-EST-16] change orders (the hook TSK-0082 calls)', () => {
  const co = { adjustments: [], costs: null, linked: [] }

  it('[HH-EST-16] the absolute adjustment greater than the threshold, a credit included', () => {
    expect(
      evaluateChangeOrderPublication(threshold, { ...co, adjustmentCents: 250_001, revisedProjectValueCents: 250_001 })
        .reasons,
    ).toEqual(['change_order_adjustment', 'revised_project_value'])
    const credit = evaluateChangeOrderPublication(threshold, {
      ...co,
      adjustmentCents: -260_000,
      revisedProjectValueCents: 40_000,
      adjustments: [{ kind: 'clerical_correction', amountCents: 260_000, reason: 'scope priced twice' }],
    })
    expect(credit.reasons).toEqual(['change_order_adjustment', 'adjustment_over_threshold'])
  })

  it('[HH-EST-16] cumulative: the revised authorized project value over the threshold', () => {
    const e = evaluateChangeOrderPublication(threshold, {
      ...co,
      adjustmentCents: 20_000,
      revisedProjectValueCents: 260_000,
    })
    expect(e.reasons).toEqual(['revised_project_value'])
    expect(
      evaluateChangeOrderPublication(threshold, { ...co, adjustmentCents: 20_000, revisedProjectValueCents: 250_000 })
        .required,
    ).toBe(false)
  })

  it('[HH-EST-16] a credit with no listed substance is a discretionary credit; a documented correction is not', () => {
    const e = evaluateChangeOrderPublication(threshold, {
      ...co,
      adjustmentCents: -5_000,
      revisedProjectValueCents: 95_000,
    })
    expect(e.flags).toEqual(['discretionary_credit'])
    const corrected = evaluateChangeOrderPublication(threshold, {
      ...co,
      adjustmentCents: -5_000,
      revisedProjectValueCents: 95_000,
      adjustments: [{ kind: 'clerical_correction', amountCents: 5_000, reason: 'line 3 was added twice' }],
    })
    expect(corrected.required).toBe(false)
  })

  it('[HH-EST-16] a credit never makes the customer charge negative', () => {
    expect(() =>
      evaluateChangeOrderPublication(threshold, { ...co, adjustmentCents: -5_000, revisedProjectValueCents: -1 }),
    ).toThrow(RangeError)
  })
})
