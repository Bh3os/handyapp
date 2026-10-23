// The Owner's quality review, punch items and the final invoice's gate (TSK-0084; HH-QA-02, HH-QA-04, T55, T56,
// ENT-QAInspection, ENT-PunchItem, OWN-DEC-64). Pure: no database.
import { describe, expect, it } from 'vitest'
import {
  apply,
  customerCompletion,
  eventsFrom,
  qualityGateOf,
  QUALITY_REVIEW_MACHINE,
  severityOf,
} from '../src/index.js'

const now = new Date('2026-10-23T15:00:00Z')
const ctx = (facts: object, expectedVersion = 1, actor: 'staff' | 'system' = 'staff') => ({
  actor,
  expectedVersion,
  now,
  facts,
})
const OK = { scope: 'ok', checklist: 'ok', evidence: 'ok', walkthrough: 'ok' } as const

describe('quality review lifecycle (TSK-0084, HH-QA-02)', () => {
  it('[HH-QA-02] pending -> in_review -> passed with every area ok and no punch item', () => {
    expect(eventsFrom(QUALITY_REVIEW_MACHINE, 'pending')).toEqual(['start'])
    const started = apply({ machine: 'quality_review.lifecycle', state: 'pending', version: 1 }, 'start', ctx({}))
    expect(started).toMatchObject({ ok: true, to: 'in_review', version: 2 })
    const passed = apply(
      { machine: 'quality_review.lifecycle', state: 'in_review', version: 2 },
      'pass',
      ctx({ results: OK, items: 0 }, 2),
    )
    expect(passed).toMatchObject({
      ok: true,
      to: 'passed',
      effects: ['job.operationally_complete', 'queue.quality_review_resolve'],
    })
  })

  it('[HH-QA-02][T55] every area needs a result, and every problem becomes a punch item', () => {
    const missing = apply(
      { machine: 'quality_review.lifecycle', state: 'in_review', version: 2 },
      'pass',
      ctx({ results: { scope: 'ok' }, items: 0 }, 2),
    )
    expect(missing).toMatchObject({ ok: false, code: 'GUARD_FAILED' })
    expect(missing.ok ? [] : missing.problems.map((p) => p.code)).toContain('AREAS_NOT_REVIEWED')
    const problem = apply(
      { machine: 'quality_review.lifecycle', state: 'in_review', version: 2 },
      'pass',
      ctx({ results: { ...OK, evidence: 'problem' }, items: 0 }, 2),
    )
    expect(problem.ok ? [] : problem.problems.map((p) => p.code)).toContain('PROBLEM_NEEDS_PUNCH_ITEM')
    const found = apply(
      { machine: 'quality_review.lifecycle', state: 'in_review', version: 2 },
      'pass',
      ctx({ results: OK, items: 1 }, 2),
    )
    expect(found.ok ? [] : found.problems.map((p) => p.code)).toEqual(['PUNCH_ITEMS_FOUND'])
    const punch = apply(
      { machine: 'quality_review.lifecycle', state: 'in_review', version: 2 },
      'require_punch',
      ctx({ results: { ...OK, scope: 'problem' }, items: 2 }, 2),
    )
    expect(punch).toMatchObject({ ok: true, to: 'punch_required' })
  })

  it('[HH-QA-02] punch_required -> pending_recheck -> passed only as the items allow; the system moves it', () => {
    const early = apply(
      { machine: 'quality_review.lifecycle', state: 'punch_required', version: 3 },
      'corrections_done',
      ctx({ openItems: 1 }, 3, 'system'),
    )
    expect(early.ok ? [] : early.problems.map((p) => p.code)).toEqual(['PUNCH_ITEMS_OPEN'])
    const notByStaff = apply(
      { machine: 'quality_review.lifecycle', state: 'punch_required', version: 3 },
      'corrections_done',
      ctx({ openItems: 0 }, 3),
    )
    expect(notByStaff).toMatchObject({ ok: false, code: 'ACTOR_NOT_ALLOWED' })
    const done = apply(
      { machine: 'quality_review.lifecycle', state: 'pending_recheck', version: 4 },
      'recheck_complete',
      ctx({ openItems: 0, unrechecked: 1 }, 4, 'system'),
    )
    expect(done.ok ? [] : done.problems.map((p) => p.code)).toEqual(['RECHECK_PENDING'])
    const back = apply(
      { machine: 'quality_review.lifecycle', state: 'pending_recheck', version: 4 },
      'punch_reopened',
      ctx({ openItems: 1 }, 4, 'system'),
    )
    expect(back).toMatchObject({ ok: true, to: 'punch_required' })
    expect(eventsFrom(QUALITY_REVIEW_MACHINE, 'passed')).toEqual([])
  })
})

describe('punch items (TSK-0084, HH-QA-04, OWN-DEC-64)', () => {
  it('[HH-QA-04] the kind decides the severity: finish and cleanup minor, everything else major', () => {
    expect(['finish', 'cleanup'].map((k) => severityOf(k as 'finish'))).toEqual(['minor', 'minor'])
    expect(
      (['defect', 'incomplete_scope', 'failed_check', 'safety_concern'] as const).map((k) => severityOf(k)),
    ).toEqual(['major', 'major', 'major', 'major'])
  })

  it('[HH-QA-04][RULE-SAFETY-GATES] a re-check needs a note, a resolved safety hold and someone other than the corrector', () => {
    const item = { machine: 'punch_item.lifecycle', state: 'corrected', version: 2 } as const
    const hold = apply(
      item,
      'recheck_pass',
      ctx({ note: 'ok', holdResolved: false, recheckerCorrected: false, selfReview: false }, 2),
    )
    expect(hold.ok ? [] : hold.problems.map((p) => p.code)).toEqual(['SAFETY_HOLD_UNRESOLVED'])
    const self = apply(
      item,
      'recheck_pass',
      ctx({ note: 'ok', holdResolved: null, recheckerCorrected: true, selfReview: false }, 2),
    )
    expect(self.ok ? [] : self.problems.map((p) => p.code)).toEqual(['RECHECKER_CORRECTED'])
    const ownJob = apply(
      item,
      'recheck_pass',
      ctx({ note: 'ok', holdResolved: null, recheckerCorrected: true, selfReview: true }, 2),
    )
    expect(ownJob).toMatchObject({ ok: true, to: 'rechecked' })
    const fail = apply(item, 'recheck_fail', ctx({ note: '' }, 2))
    expect(fail.ok ? [] : fail.problems.map((p) => p.code)).toEqual(['REASON_REQUIRED'])
    expect(apply(item, 'recheck_fail', ctx({ note: 'still visible' }, 2))).toMatchObject({ ok: true, to: 'open' })
  })
})

describe('the final invoice gate and the customer label (TSK-0084, HH-FIN-05, T55, T56)', () => {
  it('[HH-FIN-05][T56] not decided, passed, Owner-only with minor items, blocked with a major one', () => {
    expect(qualityGateOf(null, [])).toBe('quality_review_not_recorded')
    expect(qualityGateOf('in_review', [])).toBe('quality_review_not_recorded')
    expect(qualityGateOf('passed', [])).toBe('passed')
    expect(qualityGateOf('punch_required', [{ severity: 'minor' }])).toBe('owner_may_issue')
    expect(qualityGateOf('pending_recheck', [{ severity: 'minor' }, { severity: 'major' }])).toBe('blocked')
  })

  it('[T55] the customer sees completion review, then follow-up work, then complete; never complete by itself', () => {
    expect(customerCompletion('in_progress', null)).toBeNull()
    expect(customerCompletion('ready_for_qa', null)).toBe('quality_review')
    expect(customerCompletion('ready_for_qa', 'in_review')).toBe('quality_review')
    expect(customerCompletion('ready_for_qa', 'punch_required')).toBe('follow_up')
    expect(customerCompletion('ready_for_qa', 'pending_recheck')).toBe('follow_up')
    expect(customerCompletion('operationally_complete', 'passed')).toBe('complete')
  })
})
