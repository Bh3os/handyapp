// The internal business-day calendar and the privacy-request dates (TSK-0136; HH-PRIV-07, OWN-DEC-205, OWN-DEC-175,
// FACT-BUSINESS-CALENDAR, FACT-PRIVACY-REQUEST-TARGETS). The calendar below is the decided default (Monday to Friday,
// the 11 federal holidays on their observed dates), written out as test input; the dates are synthetic receipts. The
// US Eastern clocks fall back on 2026-11-01, inside a 30-day window from late October.
import { describe, expect, it } from 'vitest'
import {
  addBusinessDays,
  closedReason,
  endOfLocalDay,
  FEDERAL_HOLIDAYS,
  holidayDate,
  isBusinessDay,
  observedHolidays,
  privacyDeadlineAlerts,
  privacyRequestDates,
  weekdayOf,
  type BusinessCalendar,
} from '../src/business-calendar.js'

const ZONE = 'America/Kentucky/Louisville'
const CALENDAR: BusinessCalendar = {
  workdays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
  holidays: [...FEDERAL_HOLIDAYS],
  observance: 'federal_weekend_rule',
  closedDates: [],
}
const TARGETS = { substantiveAcknowledgmentBusinessDays: 3, completionCalendarDays: 30 }

describe('[HH-PRIV-07] the 11 federal holidays and their observed dates (OWN-DEC-205)', () => {
  it('[HH-PRIV-07] computes the 2026 holidays', () => {
    expect(observedHolidays(CALENDAR, 2026).map((h) => [h.holiday, h.observed])).toEqual([
      ['new_years_day', '2026-01-01'],
      ['martin_luther_king_jr_birthday', '2026-01-19'],
      ['washingtons_birthday', '2026-02-16'],
      ['memorial_day', '2026-05-25'],
      ['juneteenth', '2026-06-19'],
      // A Saturday holiday is observed the Friday before.
      ['independence_day', '2026-07-03'],
      ['labor_day', '2026-09-07'],
      ['columbus_day', '2026-10-12'],
      ['veterans_day', '2026-11-11'],
      ['thanksgiving_day', '2026-11-26'],
      ['christmas_day', '2026-12-25'],
    ])
    expect(holidayDate('independence_day', 2026)).toBe('2026-07-04')
  })

  it('[HH-PRIV-07] a Sunday holiday is observed the Monday after; a Saturday New Year on December 31', () => {
    expect(weekdayOf('2027-07-04')).toBe('sunday')
    expect(closedReason('2027-07-05', CALENDAR)).toEqual({ kind: 'holiday', holiday: 'independence_day' })
    expect(weekdayOf('2027-12-25')).toBe('saturday')
    expect(closedReason('2027-12-24', CALENDAR)).toEqual({ kind: 'holiday', holiday: 'christmas_day' })
    expect(weekdayOf('2028-01-01')).toBe('saturday')
    expect(closedReason('2027-12-31', CALENDAR)).toEqual({ kind: 'holiday', holiday: 'new_years_day' })
    expect(observedHolidays(CALENDAR, 2027).at(-1)).toEqual({
      holiday: 'new_years_day',
      date: '2028-01-01',
      observed: '2027-12-31',
    })
    expect(isBusinessDay('2027-07-06', CALENDAR)).toBe(true)
  })

  it('[HH-PRIV-07] weekends and Owner-added closed dates are not business days', () => {
    expect(closedReason('2026-10-24', CALENDAR)).toEqual({ kind: 'weekday', weekday: 'saturday' })
    expect(isBusinessDay('2026-10-26', CALENDAR)).toBe(true)
    expect(closedReason('2026-11-27', { ...CALENDAR, closedDates: ['2026-11-27'] })).toEqual({ kind: 'closed' })
  })
})

describe('[HH-PRIV-07] the substantive acknowledgment: 3 business days after receipt', () => {
  it('[HH-PRIV-07] counting starts the day after receipt and skips weekends', () => {
    expect(addBusinessDays('2026-10-26', 3, CALENDAR)).toBe('2026-10-29')
    // Received on a Friday or a Saturday: Monday is the first business day.
    expect(addBusinessDays('2026-10-23', 3, CALENDAR)).toBe('2026-10-28')
    expect(addBusinessDays('2026-10-24', 3, CALENDAR)).toBe('2026-10-28')
  })

  it('[HH-PRIV-07] a request received before a holiday weekend (Saturday holiday observed Friday)', () => {
    // Thursday 2026-07-02: Friday 3 is the observed Independence Day, then the weekend.
    expect(addBusinessDays('2026-07-02', 3, CALENDAR)).toBe('2026-07-08')
    // Wednesday before Thanksgiving.
    expect(addBusinessDays('2026-11-25', 3, CALENDAR)).toBe('2026-12-01')
  })

  it('[HH-PRIV-07] a Sunday holiday observed Monday moves the count', () => {
    // Friday 2027-07-02: Monday 5 is the observed Independence Day.
    expect(addBusinessDays('2027-07-02', 3, CALENDAR)).toBe('2027-07-08')
  })

  it('[HH-PRIV-07] a changed calendar counts with its own values', () => {
    expect(addBusinessDays('2026-07-02', 3, { ...CALENDAR, closedDates: ['2026-07-06'] })).toBe('2026-07-09')
    expect(addBusinessDays('2026-07-02', 3, { ...CALENDAR, holidays: [] })).toBe('2026-07-07')
    expect(() => addBusinessDays('2026-07-02', 0, CALENDAR)).toThrow()
  })
})

describe('[HH-PRIV-07] privacy request dates in the business zone', () => {
  it('[HH-PRIV-07] the receipt date is the business zone date, not the UTC date', () => {
    // 22:30 on Friday 2026-10-30 in Louisville is already Saturday in UTC.
    const d = privacyRequestDates(new Date('2026-10-31T02:30:00Z'), ZONE, CALENDAR, TARGETS)
    expect(d).toEqual({ receivedOn: '2026-10-30', acknowledgmentDueOn: '2026-11-04', targetDueOn: '2026-11-29' })
  })

  it('[HH-PRIV-07] the 30-day target is calendar days across the fall-back change', () => {
    const d = privacyRequestDates(new Date('2026-10-28T16:00:00Z'), ZONE, CALENDAR, TARGETS)
    expect(d.targetDueOn).toBe('2026-11-27')
    // Due by the end of the local day: midnight EST after the change (05:00 UTC), not 30 x 24 hours.
    expect(endOfLocalDay(d.targetDueOn, ZONE)).toEqual(new Date('2026-11-28T05:00:00Z'))
    expect(endOfLocalDay('2026-10-28', ZONE)).toEqual(new Date('2026-10-29T04:00:00Z'))
    // Spring forward: still the next local midnight.
    expect(endOfLocalDay('2027-03-14', ZONE)).toEqual(new Date('2027-03-15T04:00:00Z'))
  })

  it('[HH-PRIV-07] overdue alerts; a decided request has none and nothing closes it', () => {
    const r = {
      open: true,
      acknowledged: false,
      acknowledgmentDueOn: '2026-10-29',
      targetOn: '2026-11-25',
      legalDeadlineOn: null,
    }
    expect(privacyDeadlineAlerts(r, '2026-10-29')).toEqual([])
    expect(privacyDeadlineAlerts(r, '2026-10-30')).toEqual(['acknowledgment_overdue'])
    expect(privacyDeadlineAlerts({ ...r, acknowledged: true }, '2026-11-26')).toEqual(['completion_overdue'])
    expect(privacyDeadlineAlerts({ ...r, acknowledged: true, legalDeadlineOn: '2026-11-20' }, '2026-11-26')).toEqual([
      'completion_overdue',
      'legal_deadline_overdue',
    ])
    expect(privacyDeadlineAlerts({ ...r, open: false }, '2027-01-01')).toEqual([])
  })
})
