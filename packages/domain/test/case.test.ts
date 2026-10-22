// Case lifecycles, kinds and customer-update wording (TSK-0093; HH-QA-06, HH-INC-01, HH-INC-02, HH-INC-04, ENT-Case,
// RULE-HUMAN-REVIEW). Pure: no database.
import { describe, expect, it } from 'vitest'
import {
  apply,
  COMPLAINT_CASE_MACHINE,
  CUSTOMER_UPDATE_TEMPLATES,
  customerUpdateText,
  eventsFrom,
  forbiddenCaseWording,
  INCIDENT_CASE_MACHINE,
  INCIDENT_TYPES,
  isActiveCase,
  isRestrictedKind,
  kindOfIncident,
  notifiesOwner,
  reviewAreasOf,
  safetyPauseTruthful,
} from '../src/index.js'

const now = new Date('2026-10-22T15:00:00Z')
const ctx = (facts: object, expectedVersion = 1) => ({ actor: 'staff' as const, expectedVersion, now, facts })

describe('case lifecycles (TSK-0093, HH-QA-06, HH-INC-01)', () => {
  it('[HH-QA-06] a complaint goes open -> acknowledged -> investigating -> action_pending -> resolved -> closed', () => {
    expect(eventsFrom(COMPLAINT_CASE_MACHINE, 'open')).toEqual(['acknowledge', 'investigate'])
    const r = apply(
      { machine: 'complaint_case.lifecycle', state: 'action_pending', version: 4 },
      'resolve',
      ctx({ resolution: 'Synthetic: repainted.' }, 4),
    )
    expect(r).toMatchObject({ ok: true, to: 'resolved', version: 5 })
    const close = apply(
      { machine: 'complaint_case.lifecycle', state: 'resolved', version: 5 },
      'close',
      ctx({ resolution: 'Synthetic', recheckRequired: false, openFollowUps: 0 }, 5),
    )
    expect(close).toMatchObject({ ok: true, to: 'closed' })
  })

  it('[HH-QA-06] closing needs the resolution, the required re-check and no open follow-up item', () => {
    const r = apply(
      { machine: 'complaint_case.lifecycle', state: 'resolved', version: 1 },
      'close',
      ctx({ resolution: '', recheckRequired: true, recheckDone: false, openFollowUps: 2 }),
    )
    expect(r.ok).toBe(false)
    if (!r.ok)
      expect(r.problems.map((p) => p.code).sort()).toEqual(['FOLLOW_UPS_OPEN', 'REASON_REQUIRED', 'RECHECK_REQUIRED'])
    // An unknown fact is refused, never assumed.
    const unknown = apply(
      { machine: 'complaint_case.lifecycle', state: 'resolved', version: 1 },
      'close',
      ctx({ resolution: 'x' }),
    )
    expect(unknown.ok).toBe(false)
  })

  it('[HH-QA-06] reopening is permitted, with a reason, back to investigating', () => {
    expect(COMPLAINT_CASE_MACHINE.final).toEqual([])
    const r = apply(
      { machine: 'complaint_case.lifecycle', state: 'closed', version: 7 },
      'reopen',
      ctx({ reason: 'Synthetic' }, 7),
    )
    expect(r).toMatchObject({ ok: true, to: 'investigating' })
    expect(apply({ machine: 'complaint_case.lifecycle', state: 'closed', version: 7 }, 'reopen', ctx({}, 7)).ok).toBe(
      false,
    )
  })

  it('[HH-INC-01] an incident goes reported -> triaged -> action_pending -> resolution_review -> closed, and stays closed', () => {
    expect(INCIDENT_CASE_MACHINE.final).toEqual(['closed'])
    expect(eventsFrom(INCIDENT_CASE_MACHINE, 'reported')).toEqual(['triage'])
    expect(eventsFrom(INCIDENT_CASE_MACHINE, 'resolution_review')).toEqual(['return_to_action', 'close'])
    const r = apply(
      { machine: 'incident_case.lifecycle', state: 'triaged', version: 2 },
      'submit_resolution',
      ctx({}, 2),
    )
    expect(r).toMatchObject({ ok: false, code: 'GUARD_FAILED' })
  })

  it('a case is active until it is closed (reviews pause and records are held while active)', () => {
    expect(isActiveCase('resolved')).toBe(true)
    expect(isActiveCase('resolution_review')).toBe(true)
    expect(isActiveCase('closed')).toBe(false)
  })
})

describe('case kinds (TSK-0093, HH-INC-01, HH-INC-02, HH-INC-04)', () => {
  it('[HH-INC-01] every reported type sets one kind; injury, damage and disputes are their own kinds', () => {
    expect(INCIDENT_TYPES.map((t) => [t, kindOfIncident(t)])).toEqual([
      ['injury', 'injury'],
      ['near_miss', 'incident'],
      ['property_damage', 'damage'],
      ['exposure_concern', 'incident'],
      ['customer_conflict', 'incident'],
      ['equipment_failure', 'incident'],
      ['dispute', 'dispute'],
      ['other', 'incident'],
    ])
  })

  it('[HH-INC-02][HH-INC-04] every non-complaint case is restricted; damage, injury and disputes notify the Owner', () => {
    expect(isRestrictedKind('complaint')).toBe(false)
    for (const k of ['incident', 'damage', 'injury', 'dispute']) expect(isRestrictedKind(k)).toBe(true)
    expect(['complaint', 'incident', 'damage', 'injury', 'dispute'].filter(notifiesOwner)).toEqual([
      'damage',
      'injury',
      'dispute',
    ])
  })

  it('[RULE-HUMAN-REVIEW] the review areas are flagged for the Owner, never decided', () => {
    expect(reviewAreasOf('injury')).toEqual(['injury', 'insurance'])
    expect(reviewAreasOf('damage')).toEqual(['insurance'])
    expect(reviewAreasOf('dispute')).toEqual(['disputes', 'legal'])
    expect(reviewAreasOf('complaint')).toEqual([])
  })
})

describe('customer updates (TSK-0093, HH-INC-02, HH-INC-04, RULE-NO-INVENTED-FACTS)', () => {
  it('[HH-INC-04] no template contains fault, liability, coverage or compensation wording', () => {
    for (const t of Object.values(CUSTOMER_UPDATE_TEMPLATES)) expect(forbiddenCaseWording(t.text)).toEqual([])
  })

  it('[HH-INC-02] the safety pause is the decided sentence, told only while a hold blocks', () => {
    expect(customerUpdateText('safety_pause')).toBe('Work is paused for safety review.')
    expect(safetyPauseTruthful('open')).toBe(true)
    expect(safetyPauseTruthful('under_review')).toBe(true)
    expect(safetyPauseTruthful('resolved')).toBe(false)
    expect(safetyPauseTruthful(null)).toBe(false)
  })

  it('[HH-INC-04] staff detail with fault, liability, coverage or compensation wording is found', () => {
    expect(customerUpdateText('next_step', ' Synthetic: we will call you. ')).toBe(
      'Next step: Synthetic: we will call you.',
    )
    for (const bad of [
      'It was our fault.',
      'We accept liability.',
      'We will compensate you.',
      'Your refund is on the way.',
      'This is covered under warranty.',
      'Our insurer will pay.',
      'We admit the mistake.',
    ])
      expect(forbiddenCaseWording(bad).length, bad).toBeGreaterThan(0)
    expect(forbiddenCaseWording('A worker will return on Tuesday to look at the patch.')).toEqual([])
  })
})
