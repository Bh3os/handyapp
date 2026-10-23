// Change-order versions: the draft lifecycle and the checklist steps that wait for an open change (TSK-0081;
// HH-CHG-01, HH-WORK-07, ENT-ChangeOrder). Pure: no database.
import { describe, expect, it } from 'vitest'
import { apply, CHANGE_ORDER_MACHINE, eventsFrom, waitingSteps } from '../src/index.js'

const now = new Date('2026-10-23T15:00:00Z')
const ctx = (facts: object, expectedVersion = 1) => ({ actor: 'staff' as const, expectedVersion, now, facts })
const version = (state: 'draft' | 'reviewed' | 'withdrawn') =>
  ({ machine: 'change_order.lifecycle', state, version: 1 }) as const

describe('change-order versions (TSK-0081, HH-CHG-01)', () => {
  it('[HH-CHG-01] draft -> reviewed only when every line is priced; reopened to change; withdrawn with a reason', () => {
    expect(eventsFrom(CHANGE_ORDER_MACHINE, 'draft')).toEqual(['review', 'withdraw'])
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
})
