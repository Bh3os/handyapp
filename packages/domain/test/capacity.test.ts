// Capacity per worker and item (TSK-0062; HH-SCH-03, HH-SCH-04, T39, FACT-HOURS, OWN-DEC-123). The working hours and
// visits here are synthetic test inputs, not business facts. The US Eastern changes of 2026 are spring forward on
// 2026-03-08 (02:00 -> 03:00) and fall back on 2026-11-01 (02:00 -> 01:00).
import { describe, expect, it } from 'vitest'
import {
  clockToMinute,
  covers,
  dailyHoursAround,
  fitting,
  hoursProblems,
  intersect,
  isoWeekday,
  localDay,
  localInstant,
  minuteToClock,
  normalize,
  onSiteRange,
  reservedRange,
  subtract,
  workingIntervals,
  workingIntervalsAround,
  type WorkingPeriod,
} from '../src/capacity.js'

const ZONE = 'America/Kentucky/Louisville'
const at = (iso: string) => Date.parse(iso)
const H = 3_600_000
const WEEKDAYS_9_TO_5: WorkingPeriod[] = [1, 2, 3, 4, 5].map((d) => ({
  weekday: d as WorkingPeriod['weekday'],
  startMinute: 9 * 60,
  endMinute: 17 * 60,
}))

describe('[HH-SCH-03] the range a visit reserves (PROPOSED rule)', () => {
  it('[HH-SCH-03][T39] travel before the arrival window; preparation and the expected work after it', () => {
    const w = { startsAt: new Date('2026-07-15T13:00:00Z'), endsAt: new Date('2026-07-15T14:00:00Z') }
    const facts = { expectedDurationMinutes: 120, preparationBufferMinutes: 15, travelBufferMinutes: 30 }
    expect(reservedRange(w, facts)).toEqual({ start: at('2026-07-15T12:30:00Z'), end: at('2026-07-15T16:15:00Z') })
    expect(onSiteRange(w, facts)).toEqual({ start: at('2026-07-15T13:00:00Z'), end: at('2026-07-15T16:15:00Z') })
    // Buffers not entered count as none; nothing is assumed.
    expect(
      reservedRange(w, { expectedDurationMinutes: 60, preparationBufferMinutes: null, travelBufferMinutes: null }),
    ).toEqual({ start: at('2026-07-15T13:00:00Z'), end: at('2026-07-15T15:00:00Z') })
  })
})

describe('[HH-SCH-03] intervals', () => {
  it('[HH-SCH-03] normalize, subtract, intersect, covers and fitting', () => {
    const a = { start: 0, end: 10 }
    const b = { start: 10, end: 20 }
    expect(normalize([b, a, { start: 5, end: 5 }])).toEqual([{ start: 0, end: 20 }])
    expect(
      subtract(
        [{ start: 0, end: 20 }],
        [
          { start: 5, end: 8 },
          { start: 15, end: 30 },
        ],
      ),
    ).toEqual([
      { start: 0, end: 5 },
      { start: 8, end: 15 },
    ])
    expect(subtract([a], [{ start: -5, end: 50 }])).toEqual([])
    expect(
      intersect(
        [{ start: 0, end: 20 }],
        [
          { start: 5, end: 8 },
          { start: 15, end: 30 },
        ],
      ),
    ).toEqual([
      { start: 5, end: 8 },
      { start: 15, end: 20 },
    ])
    expect(covers([a, b], { start: 2, end: 18 })).toBe(true)
    expect(covers([a, { start: 11, end: 20 }], { start: 2, end: 18 })).toBe(false)
    expect(
      fitting(
        [
          { start: 0, end: 3 },
          { start: 5, end: 15 },
        ],
        5,
      ),
    ).toEqual([{ start: 5, end: 15 }])
  })

  it('[HH-SCH-03] weekdays and clock minutes', () => {
    expect(isoWeekday('2026-07-13')).toBe(1)
    expect(isoWeekday('2026-07-19')).toBe(7)
    expect(clockToMinute('24:00')).toBe(1440)
    expect(clockToMinute('08:30')).toBe(510)
    expect(clockToMinute('8:30')).toBeNull()
    expect(minuteToClock(1440)).toBe('24:00')
    expect(minuteToClock(510)).toBe('08:30')
  })
})

describe('[HH-SCH-03][OWN-DEC-123] working hours as instants, across daylight-saving changes', () => {
  it('[HH-SCH-03] working periods of a weekday become instants in the zone; other days have none', () => {
    expect(workingIntervals(WEEKDAYS_9_TO_5, '2026-07-15', ZONE)).toEqual([
      { start: at('2026-07-15T13:00:00Z'), end: at('2026-07-15T21:00:00Z') },
    ])
    expect(workingIntervals(WEEKDAYS_9_TO_5, '2026-07-18', ZONE)).toEqual([])
    expect(workingIntervals(WEEKDAYS_9_TO_5, '2026-12-15', ZONE)).toEqual([
      { start: at('2026-12-15T14:00:00Z'), end: at('2026-12-15T22:00:00Z') },
    ])
  })

  it('[HH-SCH-03][HH-DATA-06] a day is 23 or 25 hours long on the change dates; a gap boundary moves past the gap', () => {
    const spring = localDay('2026-03-08', ZONE)
    const fall = localDay('2026-11-01', ZONE)
    expect(spring.end - spring.start).toBe(23 * H)
    expect(fall.end - fall.start).toBe(25 * H)
    // 02:30 does not exist on 2026-03-08: a period starting then starts at 03:00 EDT.
    expect(localInstant('2026-03-08', 150, ZONE, 'start')).toBe(at('2026-03-08T07:00:00Z'))
    // 01:30 happens twice on 2026-11-01: a start is the earlier reading, an end the later one.
    expect(localInstant('2026-11-01', 90, ZONE, 'start')).toBe(at('2026-11-01T05:30:00Z'))
    expect(localInstant('2026-11-01', 90, ZONE, 'end')).toBe(at('2026-11-01T06:30:00Z'))
    // The end of the day (24:00) is the next midnight.
    expect(localInstant('2026-07-15', 1440, ZONE, 'end')).toBe(at('2026-07-16T04:00:00Z'))
  })

  it('[HH-SCH-03] a night shift across midnight and a range on two days are covered as one stretch', () => {
    const night: WorkingPeriod[] = [
      { weekday: 3, startMinute: 20 * 60, endMinute: 1440 },
      { weekday: 4, startMinute: 0, endMinute: 4 * 60 },
    ]
    const range = { start: at('2026-07-16T02:00:00Z'), end: at('2026-07-16T06:00:00Z') } // 22:00 Wed - 02:00 Thu EDT
    expect(covers(workingIntervalsAround(night, range, ZONE), range)).toBe(true)
    const tooLong = { start: range.start, end: at('2026-07-16T09:00:00Z') }
    expect(covers(workingIntervalsAround(night, tooLong, ZONE), tooLong)).toBe(false)
  })

  it('[FACT-HOURS] the daily visit hours of the days a range touches', () => {
    const hours = { open: '08:00', close: '22:00' }
    const inside = { start: at('2026-07-15T13:00:00Z'), end: at('2026-07-15T16:00:00Z') }
    const late = { start: at('2026-07-16T00:30:00Z'), end: at('2026-07-16T02:30:00Z') } // 20:30-22:30 EDT
    expect(covers(dailyHoursAround(hours, inside, ZONE), inside)).toBe(true)
    expect(covers(dailyHoursAround(hours, late, ZONE), late)).toBe(false)
    expect(dailyHoursAround({ open: '22:00', close: '08:00' }, inside, ZONE)).toEqual([])
  })

  it('[HH-SCH-03] a week of periods is checked: weekdays, times, order and overlaps', () => {
    expect(hoursProblems(WEEKDAYS_9_TO_5)).toEqual([])
    expect(hoursProblems([])).toEqual([])
    expect(hoursProblems([{ weekday: 8 as never, startMinute: 0, endMinute: 60 }])).toEqual(['WEEKDAY_INVALID'])
    expect(hoursProblems([{ weekday: 1, startMinute: 600, endMinute: 540 }])).toEqual(['PERIOD_ORDER'])
    expect(hoursProblems([{ weekday: 1, startMinute: -1, endMinute: 540 }])).toEqual(['TIME_INVALID'])
    expect(
      hoursProblems([
        { weekday: 2, startMinute: 480, endMinute: 720 },
        { weekday: 2, startMinute: 700, endMinute: 900 },
      ]),
    ).toEqual(['PERIOD_OVERLAP'])
    // Back to back is not an overlap.
    expect(
      hoursProblems([
        { weekday: 2, startMinute: 480, endMinute: 720 },
        { weekday: 2, startMinute: 720, endMinute: 900 },
      ]),
    ).toEqual([])
  })
})
