// Holds and the hazard flag (TSK-0043; ENT-Hold, HH-LEAD-04, HH-WORK-02, OWN-DEC-38, OWN-DEC-137, RULE-SAFETY-GATES,
// RULE-HUMAN-REVIEW). Staff ids are synthetic.
import { describe, expect, it } from 'vitest'
import {
  apply,
  BLOCKING_HOLD_STATES,
  flaggedHazards,
  HOLD_MACHINE,
  type HoldFacts,
  type HoldState,
  isBlockingHold,
  newlyFlaggedHazards,
  type Qualification,
  qualificationProblems,
  QUALIFICATION_CHECKS,
} from '../src/index.js'
import { pairs } from './helpers.js'

const NOW = new Date('2026-10-21T15:00:00Z')
const OK: HoldFacts = {
  kind: 'review',
  raisedBy: 'staff-a',
  actorId: 'staff-a',
  resolutionNote: 'Synthetic: the owner checked the photos with the customer.',
  reviewer: 'Synthetic Owner',
  reason: 'Synthetic: raised on the wrong request.',
}
const run = (state: HoldState, event: Parameters<typeof apply<'hold.lifecycle'>>[1], facts: HoldFacts = OK) =>
  apply({ machine: 'hold.lifecycle', state, version: 1 }, event, {
    actor: 'staff',
    expectedVersion: 1,
    now: NOW,
    facts,
  })

describe('hold states (ENT-Hold, HH-WORK-02)', () => {
  for (const { state, event, transition } of pairs(HOLD_MACHINE)) {
    it(`${event} from ${state} is ${transition ? `allowed, to ${transition.to}` : 'refused'}`, () => {
      const r = run(state, event)
      if (transition) expect(r).toMatchObject({ ok: true, to: transition.to })
      else expect(r.ok).toBe(false)
    })
  }

  it('[HH-WORK-02] open and under review block; resolved and canceled as error never change again', () => {
    expect(BLOCKING_HOLD_STATES).toEqual(['open', 'under_review'])
    expect(isBlockingHold('under_review')).toBe(true)
    expect(isBlockingHold('resolved')).toBe(false)
    expect(HOLD_MACHINE.final).toEqual(['resolved', 'canceled_as_error'])
    // No event resolves straight from open: a review is started first, and nothing but resolve or cancel ends it.
    expect(run('open', 'resolve')).toMatchObject({ ok: false, code: 'INVALID_TRANSITION' })
  })

  it('[HH-WORK-02][RULE-HUMAN-REVIEW] resolving needs a note on how and who reviewed it; cancelling needs its reason', () => {
    expect(run('under_review', 'resolve', { ...OK, resolutionNote: ' ', reviewer: '' })).toMatchObject({
      ok: false,
      problems: [{ code: 'REASON_REQUIRED' }, { code: 'REVIEWER_REQUIRED' }],
    })
    expect(run('open', 'cancel_as_error', { ...OK, reason: '' })).toMatchObject({
      ok: false,
      problems: [{ code: 'REASON_REQUIRED' }],
    })
  })

  it('[OWN-DEC-38][OWN-DEC-137][RULE-SAFETY-GATES] nobody releases a critical hold they raised; a review hold may be', () => {
    const critical = { ...OK, kind: 'critical_safety' as const }
    expect(run('under_review', 'resolve', critical)).toMatchObject({
      ok: false,
      problems: [{ code: 'OWN_CRITICAL_HOLD' }],
    })
    expect(run('open', 'cancel_as_error', critical)).toMatchObject({ ok: false })
    expect(run('under_review', 'resolve', { ...critical, actorId: 'staff-b' })).toMatchObject({ ok: true })
    expect(run('under_review', 'resolve', OK)).toMatchObject({ ok: true, to: 'resolved' })
    const unknown = Object.fromEntries(Object.entries(OK).filter(([k]) => k !== 'kind')) as HoldFacts
    expect(run('under_review', 'resolve', unknown)).toMatchObject({ problems: [{ code: 'FACTS_MISSING' }] })
  })
})

const base = Object.fromEntries(QUALIFICATION_CHECKS.map((c) => [c, { outcome: 'ok' as const }])) as Qualification
const flagged = (hazards: string[], note: string | null = 'Synthetic: old wiring near the wall') =>
  ({ ...base, risk_flags: { outcome: 'attention', note, hazards } }) as Qualification

describe('the hazard flag (HH-LEAD-04, HH-LEAD-02)', () => {
  it('[HH-LEAD-04] risk flags needing attention name the hazards; each newly flagged one opens a review hold', () => {
    expect(flaggedHazards(flagged(['licensed_trade', 'hazardous_material']))).toEqual([
      'hazardous_material',
      'licensed_trade',
    ])
    expect(flaggedHazards(base)).toEqual([])
    expect(newlyFlaggedHazards(null, flagged(['structural']))).toEqual(['structural'])
    expect(newlyFlaggedHazards(flagged(['structural']), flagged(['structural', 'other']))).toEqual(['other'])
    // Saving again, or no longer listing a hazard, opens nothing and clears nothing.
    expect(newlyFlaggedHazards(flagged(['structural']), flagged(['structural']))).toEqual([])
    expect(newlyFlaggedHazards(flagged(['structural']), base)).toEqual([])
    // Flagged again after it was removed: a new flag.
    expect(newlyFlaggedHazards(base, flagged(['structural']))).toEqual(['structural'])
  })

  it('[HH-LEAD-04] a flagged risk needs a category and a note; categories belong to the risk flags only', () => {
    expect(qualificationProblems(flagged(['structural']))).toEqual([])
    expect(qualificationProblems(base)).toEqual([])
    expect(qualificationProblems(flagged([], ' ')).map((p) => p.code)).toEqual([
      'HAZARD_CATEGORY_REQUIRED',
      'HAZARD_NOTE_REQUIRED',
    ])
    const misplaced = { ...base, urgency: { outcome: 'ok', hazards: ['other'] } } as Qualification
    expect(qualificationProblems(misplaced).map((p) => p.code)).toEqual(['HAZARDS_ONLY_ON_RISK_FLAGS'])
    const notAttention = { ...base, risk_flags: { outcome: 'ok', hazards: ['other'] } } as Qualification
    expect(qualificationProblems(notAttention).map((p) => p.code)).toEqual(['HAZARDS_NEED_ATTENTION'])
  })
})
