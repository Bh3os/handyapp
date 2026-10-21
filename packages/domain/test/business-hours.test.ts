// Business-hours arithmetic of the first-response clock (TSK-0043; HH-LEAD-05, FACT-RESPONSE-TARGET, FACT-HOURS,
// FACT-TIMEZONE, HH-DATA-06, HH-SCH-02). The hours and the zone are passed in exactly as configuration holds them
// (contact.hours 08:00-22:00, business.timezone America/Kentucky/Louisville, response.target 60 minutes); nothing
// here is a default. Spring forward 2027-03-14 and fall back 2026-11-01 are the US Eastern changes.
import { describe, expect, it } from 'vitest'
import {
  addBusinessMinutes,
  BusinessHoursError,
  businessMinutesBetween,
  isWithinHours,
  nextOpening,
  readClock,
  zonedTimeToUtc,
} from '../src/index.js'

const ZONE = 'America/Kentucky/Louisville'
const HOURS = { open: '08:00', close: '22:00' }
const TARGET = 60
/** A wall-clock time in the business zone. */
const local = (iso: string) => {
  const [d, t] = iso.split('T') as [string, string]
  const [year, month, day] = d.split('-').map(Number) as [number, number, number]
  const [hour, minute] = t.split(':').map(Number) as [number, number]
  return zonedTimeToUtc({ year, month, day, hour, minute }, ZONE)
}
const due = (at: Date) => addBusinessMinutes(at, TARGET, HOURS, ZONE)

describe('the first-response clock counts only inside the daily hours (HH-LEAD-05, FACT-HOURS)', () => {
  it('[HH-LEAD-05] a request received inside the hours is due one business hour later', () => {
    expect(due(local('2026-10-21T09:15'))).toEqual(local('2026-10-21T10:15'))
    expect(due(local('2026-10-21T08:00'))).toEqual(local('2026-10-21T09:00'))
  })

  it('[HH-LEAD-05] a request received outside the hours starts counting when the hours begin', () => {
    expect(due(local('2026-10-21T23:30'))).toEqual(local('2026-10-22T09:00'))
    expect(due(local('2026-10-21T03:00'))).toEqual(local('2026-10-21T09:00'))
    expect(due(local('2026-10-21T22:00'))).toEqual(local('2026-10-22T09:00'))
    expect(nextOpening(local('2026-10-21T23:30'), HOURS, ZONE)).toEqual(local('2026-10-22T08:00'))
    expect(nextOpening(local('2026-10-21T12:00'), HOURS, ZONE)).toEqual(local('2026-10-21T12:00'))
  })

  it('[HH-LEAD-05] the clock pauses at closing and resumes at the next opening', () => {
    // 20 minutes before closing, then 40 minutes after the next opening.
    expect(due(local('2026-10-21T21:40'))).toEqual(local('2026-10-22T08:40'))
    expect(businessMinutesBetween(local('2026-10-21T21:40'), local('2026-10-22T08:40'), HOURS, ZONE)).toBe(60)
    // Overnight counts nothing.
    expect(businessMinutesBetween(local('2026-10-21T22:00'), local('2026-10-22T08:00'), HOURS, ZONE)).toBe(0)
    // A whole day counts its fourteen hours, and several days add up.
    expect(businessMinutesBetween(local('2026-10-21T00:00'), local('2026-10-22T00:00'), HOURS, ZONE)).toBe(14 * 60)
    expect(businessMinutesBetween(local('2026-10-21T07:00'), local('2026-10-24T09:30'), HOURS, ZONE)).toBe(
      3 * 14 * 60 + 90,
    )
    expect(businessMinutesBetween(local('2026-10-21T12:00'), local('2026-10-21T11:00'), HOURS, ZONE)).toBe(0)
  })

  it('[HH-LEAD-05][OWN-DEC-115] reads remaining time while open, paused outside the hours, overdue after the target', () => {
    const received = local('2026-10-21T21:40')
    const deadline = due(received)
    expect(readClock(deadline, local('2026-10-21T21:50'), HOURS, ZONE)).toEqual({
      state: 'running',
      remainingMinutes: 50,
      resumesAt: null,
    })
    // Paused overnight: the remaining time does not shrink.
    expect(readClock(deadline, local('2026-10-21T23:00'), HOURS, ZONE)).toEqual({
      state: 'paused',
      remainingMinutes: 40,
      resumesAt: local('2026-10-22T08:00'),
    })
    expect(readClock(deadline, local('2026-10-22T06:00'), HOURS, ZONE)).toMatchObject({ remainingMinutes: 40 })
    expect(readClock(deadline, local('2026-10-22T08:39'), HOURS, ZONE)).toMatchObject({
      state: 'running',
      remainingMinutes: 1,
    })
    expect(readClock(deadline, local('2026-10-22T08:40'), HOURS, ZONE)).toEqual({
      state: 'overdue',
      overdueMinutes: 0,
      resumesAt: null,
    })
    expect(readClock(deadline, local('2026-10-22T10:00'), HOURS, ZONE)).toMatchObject({ overdueMinutes: 80 })
    // Overdue time is counted in business hours too, and paused overnight.
    expect(readClock(deadline, local('2026-10-22T23:00'), HOURS, ZONE)).toMatchObject({
      state: 'overdue',
      overdueMinutes: 14 * 60 - 40,
      resumesAt: local('2026-10-23T08:00'),
    })
    expect(isWithinHours(local('2026-10-21T21:59'), HOURS, ZONE)).toBe(true)
    expect(isWithinHours(local('2026-10-21T22:00'), HOURS, ZONE)).toBe(false)
  })
})

describe('daylight saving changes are counted in real minutes (HH-DATA-06, HH-SCH-02, FACT-TIMEZONE)', () => {
  it('[HH-DATA-06] spring forward: the hours keep their local times and the target is one real hour', () => {
    // 2027-03-14: 02:00 EST becomes 03:00 EDT, outside the daily hours.
    const received = local('2027-03-14T07:30')
    expect(received.toISOString()).toBe('2027-03-14T11:30:00.000Z')
    expect(due(received)).toEqual(local('2027-03-14T09:00'))
    expect(due(received).toISOString()).toBe('2027-03-14T13:00:00.000Z')
    // Received the night before (EST), due the morning after the change (EDT).
    expect(due(local('2027-03-13T21:30')).toISOString()).toBe('2027-03-14T12:30:00.000Z')
    expect(businessMinutesBetween(local('2027-03-13T00:00'), local('2027-03-15T00:00'), HOURS, ZONE)).toBe(28 * 60)
  })

  it('[HH-DATA-06] fall back: the hours keep their local times and the target is one real hour', () => {
    // 2026-11-01: 02:00 EDT becomes 01:00 EST.
    const received = local('2026-10-31T21:45')
    expect(received.toISOString()).toBe('2026-11-01T01:45:00.000Z')
    expect(due(received)).toEqual(local('2026-11-01T08:45'))
    expect(due(received).toISOString()).toBe('2026-11-01T13:45:00.000Z')
    expect(businessMinutesBetween(local('2026-10-31T00:00'), local('2026-11-02T00:00'), HOURS, ZONE)).toBe(28 * 60)
  })

  it('[HH-DATA-06] a window that spans the change counts only the minutes that really pass', () => {
    const night = { open: '01:00', close: '04:00' }
    // Three local hours, but only two real hours on spring forward and four on fall back.
    const spring = zonedTimeToUtc({ year: 2027, month: 3, day: 14, hour: 0, minute: 0 }, ZONE)
    const fall = zonedTimeToUtc({ year: 2026, month: 11, day: 1, hour: 0, minute: 0 }, ZONE)
    const day = 86_400_000
    expect(businessMinutesBetween(spring, new Date(spring.getTime() + day), night, ZONE)).toBe(120)
    expect(businessMinutesBetween(fall, new Date(fall.getTime() + day), night, ZONE)).toBe(240)
    expect(addBusinessMinutes(spring, 150, night, ZONE)).toEqual(
      zonedTimeToUtc({ year: 2027, month: 3, day: 15, hour: 1, minute: 30 }, ZONE),
    )
  })
})

describe('configuration is never guessed (RULE-NO-INVENTED-FACTS, RULE-DECIDED-VALUES-ACTIVE)', () => {
  it('refuses hours that do not close after they open, a malformed time and an unknown zone', () => {
    const at = local('2026-10-21T09:00')
    expect(() => addBusinessMinutes(at, 60, { open: '22:00', close: '08:00' }, ZONE)).toThrow(BusinessHoursError)
    expect(() => addBusinessMinutes(at, 60, { open: '8am', close: '22:00' }, ZONE)).toThrow(BusinessHoursError)
    expect(() => addBusinessMinutes(at, 60, HOURS, 'Mars/Olympus_Mons')).toThrow(BusinessHoursError)
    expect(() => addBusinessMinutes(at, -1, HOURS, ZONE)).toThrow(BusinessHoursError)
  })
})
