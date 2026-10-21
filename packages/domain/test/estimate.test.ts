// Estimate version lifecycle (TSK-0055; HH-EST-04, HH-STATE-01, HH-STATE-02, ENT-EstimateVersion, T32).
import { describe, expect, it } from 'vitest'
import {
  acceptanceProblem,
  apply,
  effectiveEstimateState,
  ESTIMATE_VERSION_MACHINE,
  estimateValidUntil,
  type EstimateVersionEvent,
  type EstimateVersionFacts,
  type EstimateVersionState,
  eventsFrom,
  FINAL_ESTIMATE_STATES,
  isEditableEstimateState,
} from '../src/index.js'
import { pairs, reachableAvoiding } from './helpers.js'

const NOW = new Date('2026-10-21T15:00:00Z')
const LATER = new Date('2026-11-04T15:00:00Z')
const EARLIER = new Date('2026-10-20T15:00:00Z')

/** Facts that meet every guard of each event (the expiry needs the validity to have passed). */
const FACTS: Record<EstimateVersionEvent, EstimateVersionFacts> = {
  request_review: {},
  return_to_draft: {},
  publish: { readinessProblems: [], blockingReviewHolds: 0 },
  supersede: { newerVersionPublishing: true },
  accept: { validUntil: LATER, newerVersionPublished: false },
  decline: {},
  expire: { validUntil: EARLIER },
  expire_now: { reason: 'Synthetic: the scope changed.' },
  withdraw: { reason: 'Synthetic: sent to the wrong project.' },
}
type Actor = 'staff' | 'customer' | 'system'
const run = (state: EstimateVersionState, event: EstimateVersionEvent, facts = FACTS[event], actor?: Actor) =>
  apply({ machine: 'estimate_version.lifecycle', state, version: 3 }, event, {
    actor: actor ?? ESTIMATE_VERSION_MACHINE.transitions.find((t) => t.event === event)?.actors[0] ?? 'staff',
    expectedVersion: 3,
    now: NOW,
    facts,
  })

describe('[HH-EST-04][HH-STATE-02] every estimate version transition, allowed or refused with a reason', () => {
  for (const { state, event, transition } of pairs(ESTIMATE_VERSION_MACHINE)) {
    it(`${event} from ${state} is ${transition ? `allowed, to ${transition.to}` : 'refused'}`, () => {
      const r = run(state, event)
      if (transition) expect(r).toMatchObject({ ok: true, from: state, to: transition.to, version: 4 })
      else expect(r).toMatchObject({ ok: false, code: 'INVALID_TRANSITION' })
    })
  }

  it('has the states of ENT-EstimateVersion, starts as a draft and never leaves a final state', () => {
    expect(ESTIMATE_VERSION_MACHINE.states).toEqual([
      'draft',
      'in_review',
      'published',
      'accepted',
      'declined',
      'expired',
      'withdrawn',
      'superseded',
    ])
    expect(ESTIMATE_VERSION_MACHINE.initial).toBe('draft')
    for (const s of FINAL_ESTIMATE_STATES) expect(eventsFrom(ESTIMATE_VERSION_MACHINE, s)).toEqual([])
    expect(isEditableEstimateState('in_review')).toBe(true)
    expect(isEditableEstimateState('published')).toBe(false)
  })

  it('[RULE-SERVER-AUTHZ] staff publish; only the system supersedes or expires by date; only the customer accepts', () => {
    expect(run('draft', 'publish', FACTS.publish, 'customer')).toMatchObject({ code: 'ACTOR_NOT_ALLOWED' })
    expect(run('published', 'supersede', FACTS.supersede, 'staff')).toMatchObject({ code: 'ACTOR_NOT_ALLOWED' })
    expect(run('published', 'expire', FACTS.expire, 'staff')).toMatchObject({ code: 'ACTOR_NOT_ALLOWED' })
    expect(run('published', 'accept', FACTS.accept, 'staff')).toMatchObject({ code: 'ACTOR_NOT_ALLOWED' })
    expect(run('published', 'accept', FACTS.accept, 'system')).toMatchObject({ code: 'ACTOR_NOT_ALLOWED' })
    expect(run('published', 'decline', {}, 'customer')).toMatchObject({ ok: true, to: 'declined' })
    expect(run('published', 'decline', {}, 'staff')).toMatchObject({ ok: true, to: 'declined' })
  })

  it('refuses a stale version, so two people never publish or withdraw the same version twice', () => {
    const r = apply({ machine: 'estimate_version.lifecycle', state: 'draft', version: 3 }, 'publish', {
      actor: 'staff',
      expectedVersion: 2,
      now: NOW,
      facts: FACTS.publish,
    })
    expect(r).toMatchObject({ ok: false, code: 'STALE_VERSION' })
  })
})

describe('[HH-EST-04][S04] publishing needs the readiness check and no blocking review hold', () => {
  it('names every unmet requirement; an unknown fact is refused, never assumed', () => {
    expect(run('draft', 'publish', { readinessProblems: ['NOT_CONFIGURED'], blockingReviewHolds: 1 })).toMatchObject({
      ok: false,
      code: 'GUARD_FAILED',
      problems: [{ code: 'NOT_READY' }, { code: 'REVIEW_HOLD_OPEN' }],
    })
    expect(run('in_review', 'publish', {})).toMatchObject({
      problems: [{ code: 'FACTS_MISSING' }, { code: 'FACTS_MISSING' }],
    })
    expect(run('in_review', 'publish')).toMatchObject({
      ok: true,
      to: 'published',
      effects: expect.arrayContaining(['estimate.supersede_previous', 'notify.estimate.ready']),
    })
  })

  it('withdrawing and expiring early need a written reason (PROPOSED); the system expiry waits for the date', () => {
    expect(run('published', 'withdraw', { reason: ' ' })).toMatchObject({ problems: [{ code: 'REASON_REQUIRED' }] })
    expect(run('published', 'expire_now', {})).toMatchObject({ problems: [{ code: 'REASON_REQUIRED' }] })
    expect(run('published', 'expire', { validUntil: LATER })).toMatchObject({ problems: [{ code: 'TOO_EARLY' }] })
    expect(run('published', 'expire', { validUntil: NOW })).toMatchObject({ ok: true, to: 'expired' })
    expect(run('published', 'supersede', {})).toMatchObject({ problems: [{ code: 'NO_NEWER_VERSION' }] })
  })
})

describe('[T32][HH-EST-04][OWN-DEC-103] superseded and expired versions can never be accepted', () => {
  it('no path leads from superseded or expired to accepted, and accept leaves only a published version', () => {
    for (const from of ['superseded', 'expired', 'withdrawn', 'declined', 'draft', 'in_review'] as const)
      expect(run(from, 'accept')).toMatchObject({ ok: false, code: 'INVALID_TRANSITION' })
    expect(reachableAvoiding(ESTIMATE_VERSION_MACHINE, 'superseded', 'accepted', [])).toBe(false)
    expect(reachableAvoiding(ESTIMATE_VERSION_MACHINE, 'expired', 'accepted', [])).toBe(false)
    // A version is accepted only after it was published: nothing skips publishing.
    expect(reachableAvoiding(ESTIMATE_VERSION_MACHINE, 'draft', 'accepted', ['published'])).toBe(false)
  })

  it('a published version past its validity or with a newer version is refused', () => {
    expect(run('published', 'accept', { validUntil: NOW, newerVersionPublished: false })).toMatchObject({
      problems: [{ code: 'EXPIRED' }],
    })
    expect(run('published', 'accept', { validUntil: LATER, newerVersionPublished: true })).toMatchObject({
      problems: [{ code: 'SUPERSEDED' }],
    })
    expect(run('published', 'accept', {})).toMatchObject({
      problems: [{ code: 'FACTS_MISSING' }, { code: 'FACTS_MISSING' }],
    })
  })

  it('acceptanceProblem names why, for the approval transaction and an old link', () => {
    const current = { validUntil: LATER, newerVersionPublished: false }
    expect(acceptanceProblem('published', current, NOW)).toBeNull()
    expect(acceptanceProblem('superseded', current, NOW)).toMatchObject({ code: 'SUPERSEDED' })
    expect(acceptanceProblem('expired', current, NOW)).toMatchObject({ code: 'EXPIRED' })
    expect(acceptanceProblem('withdrawn', current, NOW)).toMatchObject({ code: 'NOT_PUBLISHED' })
    expect(acceptanceProblem('published', { ...current, validUntil: EARLIER }, NOW)).toMatchObject({ code: 'EXPIRED' })
    expect(acceptanceProblem('published', { ...current, newerVersionPublished: true }, NOW)).toMatchObject({
      code: 'SUPERSEDED',
    })
  })

  it('a published version past its valid-until time reads as expired before the job records it', () => {
    expect(effectiveEstimateState('published', NOW, NOW)).toBe('expired')
    expect(effectiveEstimateState('published', LATER, NOW)).toBe('published')
    expect(effectiveEstimateState('superseded', EARLIER, NOW)).toBe('superseded')
    expect(effectiveEstimateState('draft', null, NOW)).toBe('draft')
  })
})

describe('[FACT-ESTIMATE-VALIDITY][OWN-DEC-34] the valid-until time: 14 days from publishing, in business time', () => {
  const ZONE = 'America/Kentucky/Louisville'
  it('ends at 11:59:59 PM business time on the 14th day after the publishing day (PROPOSED reading)', () => {
    // Published Wednesday 21 October 2026, 11:00 AM EDT: valid through Wednesday 4 November, 11:59:59 PM EST.
    expect(estimateValidUntil(new Date('2026-10-21T15:00:00Z'), 14, ZONE).toISOString()).toBe(
      '2026-11-05T04:59:59.999Z',
    )
  })

  it('counts the publishing day in business time, also late in the evening and across a clock change', () => {
    // 11:30 PM EDT on 20 October is still the 20th in Louisville, though already the 21st in UTC.
    expect(estimateValidUntil(new Date('2026-10-21T03:30:00Z'), 14, ZONE).toISOString()).toBe(
      '2026-11-04T04:59:59.999Z',
    )
    // Spring forward: published 1 March 2026 (EST), valid through 15 March (EDT).
    expect(estimateValidUntil(new Date('2026-03-01T17:00:00Z'), 14, ZONE).toISOString()).toBe(
      '2026-03-16T03:59:59.999Z',
    )
    expect(() => estimateValidUntil(NOW, 0, ZONE)).toThrow(RangeError)
  })
})
