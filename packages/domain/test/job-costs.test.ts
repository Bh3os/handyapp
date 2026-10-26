// Estimated versus actual job costs (TSK-0095; HH-FIN-17, HH-DATA-10, T73, OWN-DEC-189). Integer cents only; nothing
// here reads a clock.
import { describe, expect, it } from 'vitest'
import {
  costEntryProblem,
  JOB_COST_CATEGORIES,
  JOB_COST_LINES,
  JOB_COST_MAX_CENTS,
  summarizeJobCosts,
  totalOf,
  varianceOf,
  type JobCostFacts,
  type JobCostLine,
} from '../src/job-costs.js'

const none: JobCostFacts = { estimateLines: [], changeOrders: 0, entries: [], confirmed: [], times: [] }
const line = (s: ReturnType<typeof summarizeJobCosts>, l: JobCostLine) => s.lines.find((x) => x.line === l)

describe('[HH-FIN-17][HH-DATA-10][T73] missing cost is incomplete, never zero', () => {
  it('lists every OWN-DEC-189 cost line, labor and burden computed, never entered', () => {
    expect(JOB_COST_LINES).toEqual([
      'labor',
      'burden',
      'materials',
      'purchase',
      'subcontractor',
      'rental',
      'disposal',
      'other',
    ])
    expect(JOB_COST_CATEGORIES).not.toContain('labor')
    expect(JOB_COST_CATEGORIES).not.toContain('burden')
  })

  it('shows a job with no cost data as not recorded or not configured, never as $0.00', () => {
    const s = summarizeJobCosts(none)
    for (const l of s.lines) {
      expect(l.actual.state).not.toBe('complete')
      expect(l.actual).not.toHaveProperty('cents')
      expect(l.varianceCents).toBeNull()
    }
    expect(line(s, 'labor')?.actual).toEqual({ state: 'not_configured' })
    expect(line(s, 'burden')?.actual).toEqual({ state: 'not_configured' })
    expect(line(s, 'materials')?.actual).toEqual({ state: 'not_recorded' })
    expect(s.actualTotal).toEqual({ state: 'not_recorded' })
    expect(s.estimatedTotal).toEqual({ state: 'not_recorded' })
    expect(s.varianceCents).toBeNull()
    expect(s.incompleteLines).toEqual([...JOB_COST_LINES])
  })

  it('keeps recorded entries incomplete until the Owner confirms the category', () => {
    const entries = [
      { category: 'materials' as const, amountCents: 12_345 },
      { category: 'materials' as const, amountCents: 655 },
      { category: 'rental' as const, amountCents: 4_000 },
    ]
    const open = summarizeJobCosts({ ...none, entries })
    expect(line(open, 'materials')?.actual).toEqual({ state: 'incomplete', knownCents: 13_000 })
    expect(line(open, 'rental')?.actual).toEqual({ state: 'incomplete', knownCents: 4_000 })
    const confirmed = summarizeJobCosts({ ...none, entries, confirmed: ['materials', 'disposal'] })
    expect(line(confirmed, 'materials')?.actual).toEqual({ state: 'complete', cents: 13_000 })
    // A confirmed category with no entry is an explicit $0.00, the only zero the report shows.
    expect(line(confirmed, 'disposal')?.actual).toEqual({ state: 'complete', cents: 0 })
    expect(line(confirmed, 'subcontractor')?.actual).toEqual({ state: 'not_recorded' })
  })

  it('never presents the actual total as final while labor cost is not configured', () => {
    const s = summarizeJobCosts({
      ...none,
      entries: [{ category: 'materials', amountCents: 10_000 }],
      confirmed: [...JOB_COST_CATEGORIES],
    })
    expect(s.actualTotal).toEqual({ state: 'incomplete', knownCents: 10_000 })
    expect(s.incompleteLines).toEqual(['labor', 'burden'])
  })

  it('reads the estimate as complete only when every counted line carries the cost', () => {
    const full = summarizeJobCosts({
      ...none,
      estimateLines: [
        { materialCents: 20_000, laborCents: 30_000 },
        { materialCents: 5_000, laborCents: 0 },
      ],
    })
    expect(line(full, 'materials')?.estimated).toEqual({ state: 'complete', cents: 25_000 })
    expect(line(full, 'labor')?.estimated).toEqual({ state: 'complete', cents: 30_000 })
    expect(line(full, 'rental')?.estimated).toEqual({ state: 'not_estimated' })
    expect(line(full, 'burden')?.estimated).toEqual({ state: 'not_estimated' })
    expect(full.estimatedTotal).toEqual({ state: 'complete', cents: 55_000 })

    const partial = summarizeJobCosts({
      ...none,
      estimateLines: [
        { materialCents: 20_000, laborCents: null },
        { materialCents: null, laborCents: null },
      ],
    })
    expect(line(partial, 'materials')?.estimated).toEqual({ state: 'incomplete', knownCents: 20_000 })
    expect(line(partial, 'labor')?.estimated).toEqual({ state: 'not_recorded' })
    expect(partial.estimatedTotal).toEqual({ state: 'incomplete', knownCents: 20_000 })
  })

  it('leaves the estimate incomplete once a change order adds scope without a cost estimate', () => {
    const s = summarizeJobCosts({
      ...none,
      estimateLines: [{ materialCents: 1_000, laborCents: 2_000 }],
      changeOrders: 1,
    })
    expect(line(s, 'materials')?.estimated).toEqual({ state: 'incomplete', knownCents: 1_000 })
    expect(s.estimatedTotal).toEqual({ state: 'incomplete', knownCents: 3_000 })
  })

  it('computes a variance only between two complete figures', () => {
    const s = summarizeJobCosts({
      ...none,
      estimateLines: [{ materialCents: 10_000, laborCents: 5_000 }],
      entries: [{ category: 'materials', amountCents: 12_500 }],
      confirmed: ['materials'],
    })
    expect(line(s, 'materials')?.varianceCents).toBe(2_500)
    expect(line(s, 'labor')?.varianceCents).toBeNull()
    expect(s.varianceCents).toBeNull()
    expect(varianceOf({ state: 'complete', cents: 100 }, { state: 'incomplete', knownCents: 100 })).toBeNull()
    expect(varianceOf({ state: 'complete', cents: 300 }, { state: 'complete', cents: 100 })).toBe(-200)
  })

  it('totals only complete figures as complete', () => {
    expect(
      totalOf([
        { state: 'complete', cents: 1 },
        { state: 'complete', cents: 2 },
      ]),
    ).toEqual({
      state: 'complete',
      cents: 3,
    })
    expect(totalOf([{ state: 'complete', cents: 1 }, { state: 'not_configured' }])).toEqual({
      state: 'incomplete',
      knownCents: 1,
    })
    expect(totalOf([{ state: 'not_estimated' }])).toEqual({ state: 'not_estimated' })
  })

  it('counts elapsed time per worker and flags unknown time instead of inventing it (OWN-DEC-69)', () => {
    const s = summarizeJobCosts({
      ...none,
      times: [
        { staffUserId: 'a', minutes: 95 },
        { staffUserId: 'b', minutes: 30 },
        { staffUserId: 'c', minutes: null },
      ],
    })
    expect(s.labor).toEqual({ minutes: 125, minutesComplete: false, unknownTimes: 1 })
    expect(line(s, 'labor')?.actual).toEqual({ state: 'not_configured' })
  })

  it('refuses fractional or negative cents', () => {
    expect(() => summarizeJobCosts({ ...none, entries: [{ category: 'other', amountCents: 1.5 }] })).toThrow()
    expect(() => summarizeJobCosts({ ...none, estimateLines: [{ materialCents: -1, laborCents: null }] })).toThrow()
  })
})

describe('[HH-FIN-17] a cost entry', () => {
  const today = '2026-10-26'
  it('is a positive amount of cents up to the limit, dated today or earlier, in an open category', () => {
    expect(costEntryProblem({ amountCents: 1, incurredOn: today }, { today, confirmed: false })).toBeNull()
    expect(
      costEntryProblem({ amountCents: JOB_COST_MAX_CENTS, incurredOn: '2026-01-01' }, { today, confirmed: false }),
    ).toBeNull()
    expect(costEntryProblem({ amountCents: 0, incurredOn: today }, { today, confirmed: false })).toBe('AMOUNT_INVALID')
    expect(costEntryProblem({ amountCents: 10.5, incurredOn: today }, { today, confirmed: false })).toBe(
      'AMOUNT_INVALID',
    )
    expect(
      costEntryProblem({ amountCents: JOB_COST_MAX_CENTS + 1, incurredOn: today }, { today, confirmed: false }),
    ).toBe('AMOUNT_INVALID')
    expect(costEntryProblem({ amountCents: 100, incurredOn: '2026-10-27' }, { today, confirmed: false })).toBe(
      'IN_FUTURE',
    )
    expect(costEntryProblem({ amountCents: 100, incurredOn: today }, { today, confirmed: true })).toBe(
      'CATEGORY_CONFIRMED',
    )
  })
})
