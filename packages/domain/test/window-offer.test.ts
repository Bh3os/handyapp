// Window offers (TSK-0063, TSK-0145; HH-SCH-11, HH-SCH-05, ENT-Reservation, OWN-DEC-144, OWN-DEC-194). Facts and
// instants are synthetic.
import { describe, expect, it } from 'vitest'
import {
  apply,
  eventsFrom,
  holdExpiresAt,
  offerProblems,
  WINDOW_OFFER_MACHINE,
  type WindowOfferState,
} from '../src/index.js'

const offeredAt = new Date('2026-10-21T12:00:00Z')
const policy = { holdHours: 24, minWindows: 2, maxWindows: 3 }
const expiresAt = holdExpiresAt(offeredAt, policy)
const at = (state: WindowOfferState, version = 1) => ({ machine: 'window_offer.lifecycle' as const, state, version })
const ctx = (actor: 'staff' | 'customer' | 'system', now: Date, facts = {}) => ({
  actor,
  expectedVersion: 1,
  now,
  facts: { now, expiresAt, ...facts },
})
const hour = 3_600_000

describe('[HH-SCH-11][OWN-DEC-144] an offer holds its windows for the configured hours', () => {
  it('[OWN-DEC-144] the hold ends the configured hours after the offer', () => {
    expect(expiresAt.toISOString()).toBe('2026-10-22T12:00:00.000Z')
    expect(holdExpiresAt(offeredAt, { holdHours: 1 }).toISOString()).toBe('2026-10-21T13:00:00.000Z')
  })

  it('[HH-SCH-11] an open offer ends exactly once; every ending is final', () => {
    expect(eventsFrom(WINDOW_OFFER_MACHINE, 'open').sort()).toEqual([
      'expire',
      'replace',
      'request_other_times',
      'select',
      'withdraw',
    ])
    for (const s of ['discarded', 'selected', 'other_times_requested', 'withdrawn', 'replaced', 'expired'] as const)
      expect(eventsFrom(WINDOW_OFFER_MACHINE, s)).toEqual([])
  })

  it('[HH-SCH-11][OWN-DEC-194] an offer starts as a draft: staff publish it (the clock starts then) or discard it', () => {
    expect(WINDOW_OFFER_MACHINE.initial).toBe('draft')
    expect(eventsFrom(WINDOW_OFFER_MACHINE, 'draft').sort()).toEqual(['discard', 'publish'])
    const now = new Date(offeredAt.getTime() + hour)
    expect(apply(at('draft'), 'publish', ctx('staff', now))).toMatchObject({ ok: true, to: 'open', version: 2 })
    expect(apply(at('draft'), 'discard', ctx('staff', now))).toMatchObject({ ok: true, to: 'discarded' })
    // A draft is never answered by the customer and never expires: no clock runs before publication.
    for (const event of ['select', 'request_other_times', 'expire'] as const)
      expect(apply(at('draft'), event, ctx('customer', now, { knownPosition: true }))).toMatchObject({ ok: false })
    // B1: the hold ends the configured hours after the publication, whenever the draft was saved.
    const publishedAt = new Date(offeredAt.getTime() + 5 * hour)
    expect(holdExpiresAt(publishedAt, policy).getTime() - publishedAt.getTime()).toBe(24 * hour)
  })

  it('[HH-SCH-11][OWN-DEC-194] staff replace a published offer only with a reason', () => {
    const now = new Date(offeredAt.getTime() + hour)
    expect(apply(at('open'), 'replace', ctx('staff', now))).toMatchObject({ ok: false, code: 'GUARD_FAILED' })
    expect(apply(at('open'), 'replace', ctx('staff', now, { reason: 'Synthetic: crew changed' }))).toMatchObject({
      ok: true,
      to: 'replaced',
    })
    expect(apply(at('open'), 'replace', ctx('customer', now, { reason: 'x' }))).toMatchObject({ ok: false })
  })

  it('[HH-SCH-11][T38] the customer selects or asks for other times only while the windows are held', () => {
    const before = new Date(expiresAt.getTime() - 1)
    expect(apply(at('open'), 'select', ctx('customer', before, { knownPosition: true }))).toMatchObject({
      ok: true,
      to: 'selected',
      version: 2,
    })
    const unknown = apply(at('open'), 'select', ctx('customer', before, { knownPosition: false }))
    expect(unknown.ok ? [] : unknown.problems.map((p) => p.code)).toEqual(['POSITION_UNKNOWN'])
    for (const event of ['select', 'request_other_times'] as const) {
      const late = apply(at('open'), event, ctx('customer', expiresAt, { knownPosition: true }))
      expect(late.ok ? [] : late.problems.map((p) => p.code)).toEqual(['OFFER_EXPIRED'])
    }
    expect(apply(at('open'), 'request_other_times', ctx('customer', before))).toMatchObject({
      ok: true,
      to: 'other_times_requested',
    })
    // Staff never select for the customer here; the customer never expires or withdraws an offer.
    expect(apply(at('open'), 'select', ctx('staff', before, { knownPosition: true }))).toMatchObject({
      ok: false,
      code: 'ACTOR_NOT_ALLOWED',
    })
    expect(apply(at('open'), 'expire', ctx('customer', expiresAt))).toMatchObject({ ok: false })
  })

  it('[HH-SCH-05][OWN-DEC-144] an unselected offer expires only once its hold time has passed', () => {
    const early = apply(at('open'), 'expire', ctx('system', new Date(expiresAt.getTime() - hour)))
    expect(early.ok ? [] : early.problems.map((p) => p.code)).toEqual(['HOLD_NOT_ENDED'])
    expect(apply(at('open'), 'expire', ctx('system', expiresAt))).toMatchObject({ ok: true, to: 'expired' })
    expect(apply(at('selected'), 'expire', ctx('system', expiresAt))).toMatchObject({
      ok: false,
      code: 'INVALID_TRANSITION',
    })
  })

  it('[HH-SCH-11] staff withdraw an offer with a reason', () => {
    const now = new Date(offeredAt.getTime() + hour)
    expect(apply(at('open'), 'withdraw', ctx('staff', now))).toMatchObject({ ok: false, code: 'GUARD_FAILED' })
    expect(apply(at('open'), 'withdraw', ctx('staff', now, { reason: 'Synthetic: the crew changed' }))).toMatchObject({
      ok: true,
      to: 'withdrawn',
    })
  })
})

describe('[HH-SCH-11][OWN-DEC-99][OWN-DEC-105] the windows of one offer', () => {
  const span = (startHour: number, endHour: number) => ({
    start: Date.UTC(2026, 9, 27, startHour),
    end: Date.UTC(2026, 9, 27, endHour),
  })

  it('[OWN-DEC-99] the number of windows is within the configured range', () => {
    expect(offerProblems([span(13, 15), span(16, 18)], policy)).toEqual([])
    expect(offerProblems([span(13, 15), span(16, 18), span(19, 21)], policy)).toEqual([])
    expect(offerProblems([span(13, 15)], policy)).toEqual([{ code: 'OFFER_WINDOW_COUNT', min: 2, max: 3 }])
    expect(offerProblems([span(1, 2), span(3, 4), span(5, 6), span(7, 8)], policy).map((p) => p.code)).toEqual([
      'OFFER_WINDOW_COUNT',
    ])
  })

  it('[HH-SCH-04] the reserved ranges of one offer never overlap (the same team is held for each)', () => {
    expect(offerProblems([span(13, 15), span(14, 16), span(15, 17)], policy)).toEqual([
      { code: 'OFFER_WINDOWS_OVERLAP', positions: [1, 2] },
      { code: 'OFFER_WINDOWS_OVERLAP', positions: [2, 3] },
    ])
    // Touching ranges are half-open, so they do not overlap.
    expect(offerProblems([span(13, 15), span(15, 17)], policy)).toEqual([])
  })
})
