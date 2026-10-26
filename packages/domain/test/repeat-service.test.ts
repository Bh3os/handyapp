// The customer-agreed repeat-service schedule (TSK-0114; HH-SCH-10, T67, OWN-DEC-113, OWN-DEC-148). Pure: fixed dates,
// no clock. Dates are local calendar dates; 1 November 2026 is the fall-back change in the business zone.
import { describe, expect, it } from 'vitest'
import {
  addLocalMonths,
  isOccurrence,
  isScheduleDate,
  isSeriesInterval,
  keptByNotice,
  occurrenceDate,
  repeatReminderBlock,
  resolveLocalTime,
  scheduleDates,
  upcomingOccurrences,
  type RepeatReminderFacts,
} from '../src/index.js'

const ZONE = 'America/Kentucky/Louisville'
const startOf = (d: string) => {
  const r = resolveLocalTime(d, '00:00', ZONE)
  if (r.kind !== 'unique') throw new Error('midnight is unique in this zone')
  return r.at.instant
}

describe('schedule dates (HH-SCH-10)', () => {
  it('counts months from the anchor and keeps short months at their last day', () => {
    expect(addLocalMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addLocalMonths('2028-01-31', 1)).toBe('2028-02-29')
    expect(addLocalMonths('2026-11-30', 3)).toBe('2027-02-28')
    expect(addLocalMonths('2026-12-15', -12)).toBe('2025-12-15')
    const monthly = { unit: 'month', count: 1 } as const
    // Always from the anchor: March is the 31st again, not the 28th carried on.
    expect(scheduleDates('2026-01-31', monthly, '2026-01-01', 4)).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ])
  })

  it('steps in calendar days across the daylight-saving change', () => {
    const fortnight = { unit: 'week', count: 2 } as const
    expect(scheduleDates('2026-10-25', fortnight, '2026-10-26', 2)).toEqual(['2026-11-08', '2026-11-22'])
    expect(occurrenceDate('2026-10-31', { unit: 'day', count: 1 }, 1)).toBe('2026-11-01')
    // The local day of 1 November is 25 hours long; its start is still local midnight.
    expect(startOf('2026-11-02').getTime() - startOf('2026-11-01').getTime()).toBe(25 * 3_600_000)
  })

  it('finds dates far from the anchor without skipping one', () => {
    const quarterly = { unit: 'month', count: 3 } as const
    expect(scheduleDates('2026-01-31', quarterly, '2031-01-01', 2)).toEqual(['2031-01-31', '2031-04-30'])
    expect(isScheduleDate('2026-01-31', quarterly, '2030-10-31')).toBe(true)
    expect(isScheduleDate('2026-01-31', quarterly, '2030-10-30')).toBe(false)
    // One agreed date and no repeat.
    expect(scheduleDates('2026-12-01', null, '2026-10-26', 3)).toEqual(['2026-12-01'])
    expect(scheduleDates('2026-12-01', null, '2026-12-02', 3)).toEqual([])
  })

  it('accepts only an interval within the limits, or none', () => {
    expect(isSeriesInterval(null)).toBe(true)
    expect(isSeriesInterval({ unit: 'week', count: 52 })).toBe(true)
    expect(isSeriesInterval({ unit: 'week', count: 53 })).toBe(false)
    expect(isSeriesInterval({ unit: 'month', count: 0 })).toBe(false)
    expect(isSeriesInterval({ unit: 'year', count: 1 })).toBe(false)
    expect(isSeriesInterval({ unit: 'day', count: 1.5 })).toBe(false)
  })
})

describe('occurrences: kept, skipped and requested dates', () => {
  const s = {
    anchor: '2026-11-03',
    interval: { unit: 'week', count: 1 } as const,
    occurrences: [
      { date: '2026-10-27', state: 'kept' as const },
      { date: '2026-11-10', state: 'skipped' as const },
      { date: '2026-11-17', state: 'requested' as const },
    ],
  }
  it('lists the kept dates, never a skipped one, and keeps requested ones', () => {
    expect(upcomingOccurrences(s, '2026-10-26', 4)).toEqual(['2026-10-27', '2026-11-03', '2026-11-17', '2026-11-24'])
    expect(isOccurrence(s, '2026-10-27')).toBe(true)
    expect(isOccurrence(s, '2026-11-10')).toBe(false)
    expect(isOccurrence(s, '2026-11-11')).toBe(false)
  })

  it('keeps the dates inside the change notice (OWN-DEC-148: 24 hours)', () => {
    const now = new Date('2026-10-31T14:00:00Z') // 10:00 local on Saturday 31 October
    expect(keptByNotice(['2026-11-01', '2026-11-02'], startOf, now, 24)).toEqual(['2026-11-01'])
    expect(keptByNotice(['2026-11-02'], startOf, new Date('2026-11-01T06:00:00Z'), 24)).toEqual(['2026-11-02'])
  })
})

describe('reminder eligibility (T67, OWN-DEC-113, HH-COM-05)', () => {
  const ok: RepeatReminderFacts = {
    state: 'active',
    reminders: true,
    onSchedule: true,
    occurrence: null,
    hasEmail: true,
    optedOut: false,
    activeCases: 0,
  }
  it('goes only on the customer-agreed schedule and stops when the customer stops it', () => {
    expect(repeatReminderBlock(ok)).toBeNull()
    expect(repeatReminderBlock({ ...ok, state: 'stopped' })).toBe('series_stopped')
    expect(repeatReminderBlock({ ...ok, reminders: false })).toBe('reminders_off')
    expect(repeatReminderBlock({ ...ok, onSchedule: false })).toBe('not_on_schedule')
    expect(repeatReminderBlock({ ...ok, occurrence: 'skipped' })).toBe('occurrence_skipped')
    expect(repeatReminderBlock({ ...ok, occurrence: 'requested' })).toBe('occurrence_requested')
  })
  it('honours the opt-out of optional follow-ups and pauses during an active complaint', () => {
    expect(repeatReminderBlock({ ...ok, optedOut: true })).toBe('follow_ups_opted_out')
    expect(repeatReminderBlock({ ...ok, hasEmail: false })).toBe('no_email_address')
    expect(repeatReminderBlock({ ...ok, activeCases: 1 })).toBe('case_active')
  })
})
