// The visit-day data access of the assigned workers (TSK-0128; HH-PKT-08, HH-CRM-03, HH-OFF-02, T28, OWN-DEC-171,
// OWN-DEC-159). Every instant is fixed: nothing here depends on the time of day the suite runs at.
import { describe, expect, it } from 'vitest'
import {
  ACCESS_EXTENSION_MAX_HOURS,
  extensionActive,
  extensionProblem,
  localDayStart,
  serviceArea,
  serviceDayOf,
  visitAccess,
  type AccessExtension,
  type VisitAccessFacts,
} from '../src/index.js'

const EASTERN = 'America/Kentucky/Louisville'
const CENTRAL = 'America/Chicago'
const at = (iso: string) => new Date(iso)
const facts = (over: Partial<VisitAccessFacts> = {}): VisitAccessFacts => ({
  localDate: '2026-11-05',
  timeZone: EASTERN,
  assigned: true,
  extensions: [],
  now: at('2026-11-05T15:00:00Z'),
  ...over,
})
const ext = (startsAt: string, expiresAt: string, endedAt: string | null = null): AccessExtension => ({
  startsAt: at(startsAt),
  expiresAt: at(expiresAt),
  endedAt: endedAt ? at(endedAt) : null,
})

describe('[HH-PKT-08][OWN-DEC-171][OWN-DEC-159] the service day is the visit date in its own zone', () => {
  it('runs from local midnight to the next local midnight, 25 hours on the November change', () => {
    const e = serviceDayOf('2026-11-01', EASTERN)
    expect(e).toEqual({ startsAt: at('2026-11-01T04:00:00Z'), endsAt: at('2026-11-02T05:00:00Z') })
    const c = serviceDayOf('2026-11-01', CENTRAL)
    expect(c).toEqual({ startsAt: at('2026-11-01T05:00:00Z'), endsAt: at('2026-11-02T06:00:00Z') })
    expect(((e?.endsAt.getTime() ?? 0) - (e?.startsAt.getTime() ?? 0)) / 3_600_000).toBe(25)
  })

  it('lasts 23 hours on the March change and 24 on an ordinary day', () => {
    const spring = serviceDayOf('2027-03-14', EASTERN)
    expect(spring).toEqual({ startsAt: at('2027-03-14T05:00:00Z'), endsAt: at('2027-03-15T04:00:00Z') })
    const plain = serviceDayOf('2026-11-05', CENTRAL)
    expect(plain).toEqual({ startsAt: at('2026-11-05T06:00:00Z'), endsAt: at('2026-11-06T06:00:00Z') })
  })

  it('is unknown, never assumed, for a zone or date it cannot read', () => {
    expect(serviceDayOf('2026-11-05', 'Not/AZone')).toBeNull()
    expect(serviceDayOf('2026-13-40', EASTERN)).toBeNull()
    expect(localDayStart('2026-11-05', 'Not/AZone')).toBeNull()
  })
})

describe('[HH-PKT-08][OWN-DEC-171] before, during and after the visit day', () => {
  it('[T28] Eastern: closed until local midnight, open through the day, closed from the next midnight', () => {
    expect(visitAccess(facts({ now: at('2026-11-05T04:59:59Z') }))).toEqual({
      open: false,
      reason: 'before_visit_day',
      opensAt: at('2026-11-05T05:00:00Z'),
    })
    expect(visitAccess(facts({ now: at('2026-11-05T05:00:00Z') }))).toEqual({
      open: true,
      basis: 'visit_day',
      endsAt: at('2026-11-06T05:00:00Z'),
    })
    expect(visitAccess(facts({ now: at('2026-11-06T04:59:59Z') })).open).toBe(true)
    expect(visitAccess(facts({ now: at('2026-11-06T05:00:00Z') }))).toEqual({
      open: false,
      reason: 'after_visit_day',
      opensAt: null,
    })
  })

  it('Central: the same instant is still the visit day in Chicago when Louisville has passed midnight', () => {
    // 2026-11-06T05:30Z is 00:30 on the 6th in Louisville and 23:30 on the 5th in Chicago.
    const now = at('2026-11-06T05:30:00Z')
    expect(visitAccess(facts({ timeZone: CENTRAL, now }))).toMatchObject({ open: true, basis: 'visit_day' })
    expect(visitAccess(facts({ timeZone: EASTERN, now }))).toMatchObject({ open: false, reason: 'after_visit_day' })
    // And the Central day opens an hour after the Eastern one.
    expect(visitAccess(facts({ timeZone: CENTRAL, now: at('2026-11-05T05:30:00Z') }))).toMatchObject({
      open: false,
      reason: 'before_visit_day',
      opensAt: at('2026-11-05T06:00:00Z'),
    })
  })

  it('the 25-hour day of the November change stays open through the repeated hour until the real midnight', () => {
    const day = facts({ localDate: '2026-11-01' })
    expect(visitAccess({ ...day, now: at('2026-11-02T04:30:00Z') }).open).toBe(true)
    expect(visitAccess({ ...day, now: at('2026-11-02T04:59:59Z') }).open).toBe(true)
    expect(visitAccess({ ...day, now: at('2026-11-02T05:00:00Z') }).open).toBe(false)
  })

  it('[HH-DATA-08] a worker no longer assigned (removed, reassigned, rescheduled, canceled, offboarded) has none', () => {
    expect(visitAccess(facts({ assigned: false }))).toEqual({ open: false, reason: 'not_assigned', opensAt: null })
    // Not even with an extension in force: it never outlives the assignment.
    const extensions = [ext('2026-11-05T14:00:00Z', '2026-11-05T20:00:00Z')]
    expect(visitAccess(facts({ assigned: false, extensions })).open).toBe(false)
  })

  it('an unknown zone opens nothing', () => {
    expect(visitAccess(facts({ timeZone: 'Not/AZone' }))).toEqual({
      open: false,
      reason: 'unknown_zone',
      opensAt: null,
    })
  })
})

describe('[HH-PKT-08][OWN-DEC-171] Owner extensions expire on their own', () => {
  const after = at('2026-11-06T06:30:00Z')
  it('an extension opens the access after the day until its expiry, and then closes it', () => {
    const extensions = [ext('2026-11-06T04:00:00Z', '2026-11-06T07:00:00Z')]
    expect(visitAccess(facts({ now: after, extensions }))).toEqual({
      open: true,
      basis: 'extension',
      endsAt: at('2026-11-06T07:00:00Z'),
    })
    expect(visitAccess(facts({ now: at('2026-11-06T07:00:00Z'), extensions })).open).toBe(false)
  })

  it('on the day it moves the end later; before the day it opens early', () => {
    const extensions = [ext('2026-11-05T12:00:00Z', '2026-11-06T08:00:00Z')]
    expect(visitAccess(facts({ extensions }))).toEqual({
      open: true,
      basis: 'visit_day',
      endsAt: at('2026-11-06T08:00:00Z'),
    })
    const early = [ext('2026-11-04T22:00:00Z', '2026-11-05T02:00:00Z')]
    expect(visitAccess(facts({ now: at('2026-11-04T23:00:00Z'), extensions: early }))).toEqual({
      open: true,
      basis: 'extension',
      endsAt: at('2026-11-05T02:00:00Z'),
    })
  })

  it('one the Owner ended, one not started and one expired count for nothing', () => {
    const ended = ext('2026-11-06T04:00:00Z', '2026-11-06T07:00:00Z', '2026-11-06T06:00:00Z')
    expect(extensionActive(ended, after)).toBe(false)
    expect(extensionActive(ended, at('2026-11-06T05:59:59Z'))).toBe(true)
    const future = ext('2026-11-06T07:00:00Z', '2026-11-06T09:00:00Z')
    expect(extensionActive(future, after)).toBe(false)
    expect(visitAccess(facts({ now: after, extensions: [ended, future] })).open).toBe(false)
  })

  it('an expiry must lie ahead, at most the PROPOSED 24 hours', () => {
    const now = at('2026-11-05T15:00:00Z')
    expect(ACCESS_EXTENSION_MAX_HOURS).toBe(24)
    expect(extensionProblem(now, now)).toBe('EXPIRY_IN_PAST')
    expect(extensionProblem(at('2026-11-05T14:00:00Z'), now)).toBe('EXPIRY_IN_PAST')
    expect(extensionProblem(at('2026-11-06T15:00:00Z'), now)).toBeNull()
    expect(extensionProblem(at('2026-11-06T15:00:01Z'), now)).toBe('EXPIRY_TOO_FAR')
  })
})

describe('[HH-PKT-08] before the visit day: the general service area only', () => {
  it('is the city and state, never the street, unit or ZIP', () => {
    expect(serviceArea({ city: 'Testville', state: 'KY' })).toEqual({ city: 'Testville', state: 'KY' })
    const full = { street: '1 Synthetic Lane', unit: '2', city: 'Testville', state: 'KY', zip: '40000' }
    expect(Object.keys(serviceArea(full))).toEqual(['city', 'state'])
  })
})
