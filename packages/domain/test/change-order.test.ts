// Change-order versions: the draft lifecycle and the checklist steps that wait for an open change (TSK-0081;
// HH-CHG-01, HH-WORK-07, ENT-ChangeOrder). Pure: no database.
import { describe, expect, it } from 'vitest'
import { apply, CHANGE_ORDER_MACHINE, effectiveChangeOrderState, eventsFrom, waitingSteps } from '../src/index.js'

const now = new Date('2026-10-23T15:00:00Z')
const ctx = (facts: object, expectedVersion = 1) => ({ actor: 'staff' as const, expectedVersion, now, facts })
const version = (state: 'draft' | 'reviewed' | 'issued' | 'withdrawn') =>
  ({ machine: 'change_order.lifecycle', state, version: 1 }) as const

describe('change-order versions (TSK-0081, HH-CHG-01)', () => {
  it('[HH-CHG-01] draft -> reviewed only when every line is priced; reopened to change; withdrawn with a reason', () => {
    expect(eventsFrom(CHANGE_ORDER_MACHINE, 'draft')).toEqual(['review', 'withdraw'])
    expect(eventsFrom(CHANGE_ORDER_MACHINE, 'reviewed')).toEqual(['reopen', 'issue', 'withdraw'])
    expect(apply(version('draft'), 'review', ctx({ pricingProblems: [] }))).toMatchObject({ ok: true, to: 'reviewed' })
    expect(apply(version('draft'), 'review', ctx({ pricingProblems: ['QUANTITY_UNKNOWN'] }))).toMatchObject({
      ok: false,
      code: 'GUARD_FAILED',
      problems: [{ code: 'NOT_PRICED' }],
    })
    expect(apply(version('draft'), 'review', ctx({}))).toMatchObject({
      ok: false,
      problems: [{ code: 'FACTS_MISSING' }],
    })
    expect(apply(version('reviewed'), 'reopen', ctx({}))).toMatchObject({ ok: true, to: 'draft' })
    expect(apply(version('reviewed'), 'withdraw', ctx({ reason: ' ' }))).toMatchObject({
      ok: false,
      code: 'GUARD_FAILED',
      problems: [{ code: 'REASON_REQUIRED' }],
    })
    expect(apply(version('draft'), 'withdraw', ctx({ reason: 'Synthetic: not needed' }))).toMatchObject({
      ok: true,
      to: 'withdrawn',
    })
    expect(apply(version('withdrawn'), 'reopen', ctx({}))).toMatchObject({ ok: false, code: 'INVALID_TRANSITION' })
  })

  it('[HH-WORK-07] steps named by an open change order wait; a withdrawn one releases them', () => {
    const steps = waitingSteps([
      { state: 'draft', number: 2, affectedSteps: [{ workPackageId: 'wp', stepId: '3.2' }] },
      { state: 'reviewed', number: 1, affectedSteps: [{ workPackageId: 'wp', stepId: '3.2' }] },
      { state: 'withdrawn', number: 3, affectedSteps: [{ workPackageId: 'wp', stepId: '3.3' }] },
    ])
    expect([...steps]).toEqual([['wp:3.2', [1, 2]]])
  })

  it('[OWN-DEC-168] issued only against the current approved scope; expires only once its validity ended', () => {
    expect(apply(version('reviewed'), 'issue', ctx({ pricingProblems: [], baseCurrent: true }))).toMatchObject({
      ok: true,
      to: 'issued',
    })
    expect(apply(version('reviewed'), 'issue', ctx({ pricingProblems: [], baseCurrent: false }))).toMatchObject({
      ok: false,
      problems: [{ code: 'APPROVED_SCOPE_CHANGED' }],
    })
    const sys = (facts: object) => ({ actor: 'system' as const, expectedVersion: 1, now, facts })
    expect(apply(version('issued'), 'expire', sys({ validUntil: new Date('2026-10-24T00:00:00Z') }))).toMatchObject({
      ok: false,
      problems: [{ code: 'NOT_DUE' }],
    })
    expect(apply(version('issued'), 'expire', sys({ validUntil: new Date('2026-10-23T14:00:00Z') }))).toMatchObject({
      ok: true,
      to: 'expired',
    })
    // A staff member never expires or supersedes one: those are the system's.
    expect(apply(version('issued'), 'supersede', ctx({}))).toMatchObject({ ok: false, code: 'ACTOR_NOT_ALLOWED' })
    expect(effectiveChangeOrderState('issued', new Date('2026-10-23T14:00:00Z'), now)).toBe('expired')
    expect(effectiveChangeOrderState('issued', new Date('2026-10-24T00:00:00Z'), now)).toBe('issued')
    expect(effectiveChangeOrderState('draft', null, now)).toBe('draft')
  })
})
