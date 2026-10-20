// Request lifecycle (TSK-0009; HH-STATE-01, HH-STATE-02; OWN-DEC-100, OWN-DEC-101; FACT-REOPEN-PERIOD).
// The configured periods below are the decided values (24 hours, 30 days), passed in as configuration.
import { describe, expect, it } from 'vitest'
import { apply, REQUEST_MACHINE, type RequestFacts, type RequestState } from '../src/index.js'
import { pairs, reachableAvoiding } from './helpers.js'

const NOW = new Date('2026-10-20T15:00:00Z')
const HOURS = (h: number) => new Date(NOW.getTime() - h * 3_600_000)
const DAYS = (d: number) => new Date(NOW.getTime() - d * 86_400_000)

/** Facts that meet every guard of the request machine. */
const OK: RequestFacts = {
  workAccepted: false,
  appointmentExists: false,
  moneyReceived: false,
  notAFitCategory: 'coverage',
  reason: 'Synthetic reason',
  finalReminderSentAt: HOURS(25),
  noResponseCloseHours: 24,
  closedAt: DAYS(10),
  customerReplyAt: HOURS(1),
  reopenPeriodDays: 30,
}

const without = (key: keyof RequestFacts): RequestFacts =>
  Object.fromEntries(Object.entries(OK).filter(([k]) => k !== key)) as RequestFacts

const run = (
  state: RequestState,
  event: Parameters<typeof apply<'request.lifecycle'>>[1],
  facts: RequestFacts = OK,
  actor: 'staff' | 'customer' | 'system' = 'staff',
) => apply({ machine: 'request.lifecycle', state, version: 1 }, event, { actor, expectedVersion: 1, now: NOW, facts })

describe('request: every invalid transition is rejected with a reason (TSK-0009, HH-STATE-01, HH-STATE-02)', () => {
  for (const { state, event, transition } of pairs(REQUEST_MACHINE)) {
    it(`${event} from ${state} is ${transition ? `allowed, to ${transition.to}` : 'refused'}`, () => {
      const r = run(state, event, OK, transition?.actors[0] ?? 'staff')
      if (transition) {
        expect(r).toMatchObject({ ok: true, from: state, to: transition.to, version: 2 })
      } else {
        expect(r).toMatchObject({ ok: false, code: 'INVALID_TRANSITION' })
        expect(!r.ok && r.message).toMatch(/is not allowed from/)
      }
    })
  }

  it('final states accept no event', () => {
    for (const state of REQUEST_MACHINE.final) {
      for (const t of REQUEST_MACHINE.transitions)
        expect(run(state, t.event).ok, `${t.event} from ${state}`).toBe(false)
    }
  })
})

describe('request: required states cannot be skipped (TSK-0009, HH-STATE-02)', () => {
  it('estimated only through ready_for_estimate; Closed—no response only from an unanswered question', () => {
    expect(reachableAvoiding(REQUEST_MACHINE, 'received', 'estimated', ['ready_for_estimate'])).toBe(false)
    expect(reachableAvoiding(REQUEST_MACHINE, 'received', 'closed_no_response', ['needs_information'])).toBe(false)
    expect(reachableAvoiding(REQUEST_MACHINE, 'received', 'estimated', ['reviewing'])).toBe(false)
    expect(run('received', 'mark_estimated')).toMatchObject({ ok: false, code: 'INVALID_TRANSITION' })
    expect(run('reviewing', 'close_no_response')).toMatchObject({ ok: false, code: 'INVALID_TRANSITION' })
  })
})

describe('request: Not a fit, outside scope and not served (OWN-DEC-100)', () => {
  it('needs a reason category; "other" needs its documented reason', () => {
    const noCategory = without('notAFitCategory')
    expect(run('reviewing', 'decline_not_a_fit', noCategory)).toMatchObject({
      ok: false,
      code: 'GUARD_FAILED',
      problems: [{ code: 'REASON_CATEGORY_REQUIRED' }],
    })
    expect(run('reviewing', 'decline_not_a_fit', { ...OK, notAFitCategory: 'other', reason: ' ' })).toMatchObject({
      problems: [{ code: 'REASON_REQUIRED' }],
    })
    expect(run('reviewing', 'decline_not_a_fit', { ...OK, notAFitCategory: 'specialist_assessment' })).toMatchObject({
      ok: true,
      to: 'declined',
      effects: ['customer_notice.not_a_fit'],
    })
    expect(run('reviewing', 'mark_not_served', { ...OK, reason: '' })).toMatchObject({
      problems: [{ code: 'REASON_REQUIRED' }],
    })
  })

  it('accepted work, an appointment or money received routes to the Owner instead of closing (HH-STATE-02)', () => {
    for (const fact of ['workAccepted', 'appointmentExists', 'moneyReceived'] as const) {
      for (const event of ['decline_not_a_fit', 'mark_outside_scope', 'mark_not_served', 'withdraw'] as const) {
        const r = run('ready_for_estimate', event, { ...OK, [fact]: true })
        expect(r, `${event} with ${fact}`).toMatchObject({ ok: false, problems: [{ code: 'OWNER_REVIEW_REQUIRED' }] })
      }
    }
  })

  it('an unknown obligation fact is refused, never assumed false', () => {
    const unknown = without('moneyReceived')
    expect(run('reviewing', 'withdraw', unknown, 'customer')).toMatchObject({ problems: [{ code: 'FACTS_MISSING' }] })
  })

  it('staff-only decisions cannot be sent by the customer or the system', () => {
    expect(run('reviewing', 'decline_not_a_fit', OK, 'customer')).toMatchObject({
      ok: false,
      code: 'ACTOR_NOT_ALLOWED',
    })
    expect(run('received', 'start_review', OK, 'system')).toMatchObject({ ok: false, code: 'ACTOR_NOT_ALLOWED' })
    expect(run('reviewing', 'withdraw', OK, 'customer')).toMatchObject({ ok: true, to: 'withdrawn' })
  })
})

describe('request: Closed—no response and reopening (OWN-DEC-101, FACT-REOPEN-PERIOD)', () => {
  it('closes only 24 hours after the final reminder was actually sent, and only when unbooked', () => {
    expect(run('needs_information', 'close_no_response', { ...OK, finalReminderSentAt: HOURS(23) })).toMatchObject({
      problems: [{ code: 'TOO_EARLY' }],
    })
    expect(run('needs_information', 'close_no_response', { ...OK, finalReminderSentAt: HOURS(24) })).toMatchObject({
      ok: true,
      to: 'closed_no_response',
    })
    const neverSent = without('finalReminderSentAt')
    expect(run('needs_information', 'close_no_response', neverSent)).toMatchObject({
      problems: [{ code: 'FACTS_MISSING' }],
    })
    expect(run('needs_information', 'close_no_response', { ...OK, appointmentExists: true })).toMatchObject({
      problems: [{ code: 'OWNER_REVIEW_REQUIRED' }],
    })
    const noConfig = without('noResponseCloseHours')
    expect(run('needs_information', 'close_no_response', noConfig)).toMatchObject({
      problems: [{ code: 'CONFIG_MISSING' }],
    })
  })

  it('a customer reply within 30 days reopens the same request for review; later it does not', () => {
    expect(run('closed_no_response', 'reopen_by_reply', { ...OK, closedAt: DAYS(30) }, 'customer')).toMatchObject({
      ok: true,
      to: 'reviewing',
      effects: ['staff_review.queue'],
    })
    expect(run('closed_no_response', 'reopen_by_reply', { ...OK, closedAt: DAYS(31) }, 'customer')).toMatchObject({
      ok: false,
      problems: [{ code: 'PERIOD_ENDED' }],
    })
    expect(run('closed_no_response', 'reopen_by_reply', OK, 'staff')).toMatchObject({ code: 'ACTOR_NOT_ALLOWED' })
  })

  it('a customer reply to an open question returns the request to review and stops reminders', () => {
    expect(run('needs_information', 'customer_replied', OK, 'customer')).toMatchObject({
      ok: true,
      to: 'reviewing',
      effects: ['reminders.stop', 'staff_review.queue'],
    })
  })
})

describe('request: typed events and facts (TSK-0009)', () => {
  it('apply() accepts only the machine’s own events and facts', () => {
    // @ts-expect-error not an event of the request machine
    expect(run('received', 'approve').ok).toBe(false)
    // @ts-expect-error a reason is text, not a number
    expect(run('reviewing', 'mark_not_served', { ...OK, reason: 5 }).ok).toBe(false)
    // @ts-expect-error not a state of the request machine
    expect(run('approved', 'start_review').ok).toBe(false)
  })
})
