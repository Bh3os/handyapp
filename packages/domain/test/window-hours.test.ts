// The decided preferred-window hours (TSK-0139; OWN-DEC-170, FACT-WINDOW-HOURS, HH-INT-02, OWN-DEC-159, T09, T41).
// The hours are wall-clock times of the property's own zone: on a day with a clock change they keep their local times
// and take that day's offset. The US changes used are fall back on 2026-11-01 and spring forward on 2027-03-14 (both
// at 02:00 local); they are read from the zones themselves, and the dates are fixed inputs, so nothing here depends on
// today's date or this machine's zone.
import { describe, expect, it } from 'vitest'
import { offsetChanges } from '../src/local-time.js'
import { chosenWindowHours, offeredWindows, preferredWindowOn, type WindowHours } from '../src/request-form.js'

/** The value migration 0104 records for request.window_hours (FACT-WINDOW-HOURS). */
const DECIDED: WindowHours = {
  mornings: { start: '08:00', end: '12:00' },
  afternoons: { start: '12:00', end: '17:00' },
  evenings: { start: '17:00', end: '22:00' },
}
const VISIT = { open: '08:00', close: '22:00' }
const EASTERN = 'America/Kentucky/Louisville'
const CENTRAL = 'America/Chicago'
const HOUR = 3_600_000

describe('[OWN-DEC-170][FACT-WINDOW-HOURS] the decided window hours', () => {
  it('[HH-INT-02][T09] all five windows are offered, the three day windows with their hours inside the visit hours', () => {
    expect(offeredWindows(VISIT, DECIDED)).toEqual([
      { code: 'mornings', start: '08:00', end: '12:00' },
      { code: 'afternoons', start: '12:00', end: '17:00' },
      { code: 'evenings', start: '17:00', end: '22:00' },
      { code: 'weekends' },
      { code: 'any_time' },
    ])
  })

  it('[OWN-DEC-170] the request keeps the hours of the chosen day windows only; Weekends and Any time have none', () => {
    const offered = offeredWindows(VISIT, DECIDED)
    expect(chosenWindowHours(offered, ['mornings', 'weekends'])).toEqual({ mornings: { start: '08:00', end: '12:00' } })
    expect(chosenWindowHours(offered, ['any_time'])).toEqual({})
    // Offered without hours (NOT CONFIGURED): nothing is kept, nothing is guessed.
    expect(chosenWindowHours(offeredWindows(VISIT, null), ['evenings'])).toEqual({})
  })
})

describe('[OWN-DEC-159][T41] a preferred window on its date, in the property zone, across the clock changes', () => {
  it('the changes used are the real ones of both zones', () => {
    for (const zone of [EASTERN, CENTRAL]) {
      const changes = offsetChanges(zone, new Date('2026-10-31T00:00:00Z'), new Date('2027-03-16T00:00:00Z'))
      expect(changes).toHaveLength(2)
    }
  })

  it.each([
    // Eastern: EDT (-04:00) the day before the fall-back, EST (-05:00) on it and until the spring-forward day.
    [EASTERN, '2026-10-31', '12:00', '16:00'],
    [EASTERN, '2026-11-01', '13:00', '17:00'],
    [EASTERN, '2027-03-13', '13:00', '17:00'],
    [EASTERN, '2027-03-14', '12:00', '16:00'],
    // Central: CDT (-05:00) and CST (-06:00) on the same dates.
    [CENTRAL, '2026-10-31', '13:00', '17:00'],
    [CENTRAL, '2026-11-01', '14:00', '18:00'],
    [CENTRAL, '2027-03-13', '14:00', '18:00'],
    [CENTRAL, '2027-03-14', '13:00', '17:00'],
  ])('Mornings in %s on %s is %s-%s UTC, four hours long', (zone, date, start, end) => {
    const on = preferredWindowOn(date, DECIDED.mornings, zone)
    expect(on?.startsAt.toISOString()).toBe(`${date}T${start}:00.000Z`)
    expect(on?.endsAt.toISOString()).toBe(`${date}T${end}:00.000Z`)
    expect((on?.endsAt.getTime() ?? 0) - (on?.startsAt.getTime() ?? 0)).toBe(4 * HOUR)
  })

  it('every decided window resolves to one unambiguous window on both change days in both zones', () => {
    for (const zone of [EASTERN, CENTRAL])
      for (const date of ['2026-11-01', '2027-03-14'])
        for (const [code, hours] of Object.entries(DECIDED)) {
          const on = preferredWindowOn(date, hours, zone)
          expect(on, `${code} ${zone} ${date}`).not.toBeNull()
          const length = Number(hours.end.slice(0, 2)) - Number(hours.start.slice(0, 2))
          expect((on?.endsAt.getTime() ?? 0) - (on?.startsAt.getTime() ?? 0)).toBe(length * HOUR)
        }
  })

  it('[OWN-DEC-159] an unknown zone gives no instants: Eastern is never assumed', () => {
    expect(preferredWindowOn('2026-11-01', DECIDED.mornings, null)).toBeNull()
    expect(preferredWindowOn('2026-11-01', DECIDED.mornings, 'EST')).toBeNull()
  })
})
