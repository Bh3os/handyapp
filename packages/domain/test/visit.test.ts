// The visit lifecycle (TSK-0061; ENT-Visit, HH-SCH-01, HH-SCH-05, OWN-DEC-144). Facts are synthetic.
import { describe, expect, it } from 'vitest'
import {
  apply,
  canChangeWindow,
  COMMITTED_VISIT_STATES,
  eventsFrom,
  isWorkVisitPurpose,
  VISIT_MACHINE,
  VISIT_PURPOSES,
  type VisitState,
} from '../src/index.js'

const now = new Date('2026-10-21T12:00:00Z')
const at = (state: VisitState, version = 1) => ({ machine: 'visit.lifecycle' as const, state, version })

describe('[HH-SCH-01] visit states are separate from preferences and scheduling tasks', () => {
  it("[HH-SCH-01] the states and edges are ENT-Visit's", () => {
    expect(VISIT_MACHINE.initial).toBe('tentative')
    expect(eventsFrom(VISIT_MACHINE, 'tentative').sort()).toEqual(['confirm', 'expire'])
    expect(eventsFrom(VISIT_MACHINE, 'confirmed').sort()).toEqual(['cancel', 'record_no_access', 'start_travel'])
    expect(eventsFrom(VISIT_MACHINE, 'en_route')).toEqual(['arrive'])
    expect(eventsFrom(VISIT_MACHINE, 'arrived')).toEqual(['finish'])
    for (const s of ['completed', 'expired', 'canceled', 'no_access'] as const)
      expect(eventsFrom(VISIT_MACHINE, s)).toEqual([])
    expect(VISIT_PURPOSES).toEqual(['site_estimate', 'service', 'follow_up', 'return_work'])
    expect(isWorkVisitPurpose('site_estimate')).toBe(false)
    expect(isWorkVisitPurpose('return_work')).toBe(true)
    expect(COMMITTED_VISIT_STATES).not.toContain('tentative')
  })

  it('[HH-SCH-05] a tentative visit is confirmed only with every reservation and precondition', () => {
    const base = { actor: 'staff' as const, expectedVersion: 1, now }
    const none = apply(at('tentative'), 'confirm', { ...base, facts: {} })
    expect(none).toMatchObject({ ok: false, code: 'GUARD_FAILED' })
    expect(none.ok ? [] : none.problems.map((p) => p.code)).toEqual(['NOT_RESERVED', 'PRECONDITIONS_NOT_MET'])
    expect(apply(at('tentative'), 'confirm', { ...base, facts: { reserved: true } })).toMatchObject({ ok: false })
    expect(
      apply(at('tentative'), 'confirm', { ...base, facts: { reserved: true, preconditionsMet: true } }),
    ).toMatchObject({ ok: true, to: 'confirmed', version: 2 })
  })

  it('[HH-SCH-05][OWN-DEC-144] a tentative visit expires only when its 24-hour hold ended, by the system', () => {
    const ctx = { actor: 'system' as const, expectedVersion: 1, now }
    expect(apply(at('tentative'), 'expire', { ...ctx, facts: {} })).toMatchObject({ ok: false, code: 'GUARD_FAILED' })
    expect(apply(at('tentative'), 'expire', { ...ctx, facts: { holdEnded: true } })).toMatchObject({
      ok: true,
      to: 'expired',
    })
    expect(apply(at('tentative'), 'expire', { ...ctx, actor: 'staff', facts: { holdEnded: true } })).toMatchObject({
      ok: false,
      code: 'ACTOR_NOT_ALLOWED',
    })
  })

  it('[HH-SCH-01] only a confirmed visit is canceled (with a reason) or recorded as no access', () => {
    const ctx = { actor: 'staff' as const, expectedVersion: 1, now }
    expect(apply(at('tentative'), 'cancel', { ...ctx, facts: { reason: 'x' } })).toMatchObject({
      ok: false,
      code: 'INVALID_TRANSITION',
    })
    expect(apply(at('confirmed'), 'cancel', { ...ctx, facts: {} })).toMatchObject({ ok: false, code: 'GUARD_FAILED' })
    expect(apply(at('confirmed'), 'cancel', { ...ctx, facts: { reason: 'Synthetic reason' } })).toMatchObject({
      ok: true,
      to: 'canceled',
    })
    expect(apply(at('confirmed'), 'record_no_access', { ...ctx, facts: {} })).toMatchObject({
      ok: true,
      to: 'no_access',
    })
  })

  it('[HH-SCH-01] a window changes only while tentative or confirmed', () => {
    expect(canChangeWindow('tentative')).toBe(true)
    expect(canChangeWindow('confirmed')).toBe(true)
    for (const s of ['en_route', 'arrived', 'completed', 'expired', 'canceled', 'no_access'])
      expect(canChangeWindow(s)).toBe(false)
  })
})
