// The internal business-day calendar and the privacy-request dates counted on it (TSK-0136; OWN-DEC-205, OWN-DEC-175,
// FACT-BUSINESS-CALENDAR, FACT-PRIVACY-REQUEST-TARGETS, FACT-TIMEZONE, HH-PRIV-07, RULE-HUMAN-REVIEW).
//
// - A calendar is configuration (business.calendar, versioned and audited): the weekdays that are business days, the
//   US federal holidays it excludes (5 U.S.C. 6103) and extra closed dates the Owner adds. The decided default is
//   Monday to Friday without the 11 federal holidays on their observed dates; nothing here holds that default.
// - Observed dates follow the federal rule: a holiday on a Saturday is observed the Friday before, one on a Sunday the
//   Monday after (so New Year's Day on a Saturday is observed on December 31 of the year before). PROPOSED: the
//   holiday's own date is not a business day either (it only matters when the Owner makes Saturday or Sunday one).
// - Everything is calendar-date arithmetic on YYYY-MM-DD dates in the business zone, so a clock change never moves a
//   date. Internal service targets only: a statutory deadline or a legal definition of a business day is never
//   computed from or shortened by this calendar (OWN-DEC-205); the legal deadline is tracked separately.
// - Pure and browser-safe: the staff app shows the same observed dates the server counts.
import { addLocalDays, isLocalDate, localDateOf, resolveLocalTime, type LocalDate } from './local-time.js'

export const CALENDAR_WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const
export type CalendarWeekday = (typeof CALENDAR_WEEKDAYS)[number]

/** The 11 US federal public holidays (5 U.S.C. 6103), in calendar order. */
export const FEDERAL_HOLIDAYS = [
  'new_years_day',
  'martin_luther_king_jr_birthday',
  'washingtons_birthday',
  'memorial_day',
  'juneteenth',
  'independence_day',
  'labor_day',
  'columbus_day',
  'veterans_day',
  'thanksgiving_day',
  'christmas_day',
] as const
export type FederalHoliday = (typeof FEDERAL_HOLIDAYS)[number]

export type BusinessCalendar = {
  readonly workdays: readonly CalendarWeekday[]
  readonly holidays: readonly FederalHoliday[]
  /** Saturday holidays observed the Friday before, Sunday holidays the Monday after. */
  readonly observance: 'federal_weekend_rule'
  /** Further dates that are not business days (for example a day the Owner closes). */
  readonly closedDates: readonly LocalDate[]
}

export class BusinessCalendarError extends Error {
  override name = 'BusinessCalendarError'
}

/** A fixed month and day, or the nth (or last: -1) given weekday of a month (0 = Sunday ... 6 = Saturday). */
type Rule = { month: number; day: number } | { month: number; weekday: number; nth: number }
const RULES: Record<FederalHoliday, Rule> = {
  new_years_day: { month: 1, day: 1 },
  martin_luther_king_jr_birthday: { month: 1, weekday: 1, nth: 3 },
  washingtons_birthday: { month: 2, weekday: 1, nth: 3 },
  memorial_day: { month: 5, weekday: 1, nth: -1 },
  juneteenth: { month: 6, day: 19 },
  independence_day: { month: 7, day: 4 },
  labor_day: { month: 9, weekday: 1, nth: 1 },
  columbus_day: { month: 10, weekday: 1, nth: 2 },
  veterans_day: { month: 11, day: 11 },
  thanksgiving_day: { month: 11, weekday: 4, nth: 4 },
  christmas_day: { month: 12, day: 25 },
}

const pad = (n: number) => String(n).padStart(2, '0')
const dateOf = (y: number, m: number, d: number): LocalDate => `${y}-${pad(m)}-${pad(d)}`
/** 0 = Sunday ... 6 = Saturday. */
const weekdayIndex = (date: LocalDate) => new Date(`${date}T12:00:00Z`).getUTCDay()

/** The weekday of a calendar date. */
export function weekdayOf(date: LocalDate): CalendarWeekday {
  if (!isLocalDate(date)) throw new BusinessCalendarError(`Expected YYYY-MM-DD, got ${date}`)
  return CALENDAR_WEEKDAYS[(weekdayIndex(date) + 6) % 7] as CalendarWeekday
}

/** The date a federal holiday falls on in a year (not moved for a weekend). */
export function holidayDate(holiday: FederalHoliday, year: number): LocalDate {
  const rule = RULES[holiday]
  if ('day' in rule) return dateOf(year, rule.month, rule.day)
  if (rule.nth > 0) {
    const first = weekdayIndex(dateOf(year, rule.month, 1))
    return dateOf(year, rule.month, 1 + ((rule.weekday - first + 7) % 7) + (rule.nth - 1) * 7)
  }
  const lastDay = new Date(Date.UTC(year, rule.month, 0)).getUTCDate()
  const last = weekdayIndex(dateOf(year, rule.month, lastDay))
  return dateOf(year, rule.month, lastDay - ((last - rule.weekday + 7) % 7))
}

/** The observed date of a holiday date under the federal rule: Saturday -> Friday before, Sunday -> Monday after. */
export function observedDate(date: LocalDate): LocalDate {
  const w = weekdayIndex(date)
  return w === 6 ? addLocalDays(date, -1) : w === 0 ? addLocalDays(date, 1) : date
}

export type ObservedHoliday = {
  readonly holiday: FederalHoliday
  readonly date: LocalDate
  readonly observed: LocalDate
}

/** The calendar's holidays whose own or observed date falls in `year`, in date order. */
export function observedHolidays(calendar: BusinessCalendar, year: number): ObservedHoliday[] {
  const out: ObservedHoliday[] = []
  // New Year's Day of the next year can be observed on December 31 of this one.
  for (const y of [year, year + 1])
    for (const holiday of calendar.holidays) {
      const date = holidayDate(holiday, y)
      const observed = observedDate(date)
      if (date.startsWith(`${year}-`) || observed.startsWith(`${year}-`)) out.push({ holiday, date, observed })
    }
  return out.sort((a, b) => (a.observed < b.observed ? -1 : a.observed > b.observed ? 1 : 0))
}

/** Why a date is not a business day, or null when it is one. */
export function closedReason(
  date: LocalDate,
  calendar: BusinessCalendar,
):
  | { kind: 'weekday'; weekday: CalendarWeekday }
  | { kind: 'holiday'; holiday: FederalHoliday }
  | { kind: 'closed' }
  | null {
  const weekday = weekdayOf(date)
  if (!calendar.workdays.includes(weekday)) return { kind: 'weekday', weekday }
  const year = Number(date.slice(0, 4))
  for (const y of [year - 1, year, year + 1])
    for (const holiday of calendar.holidays) {
      const d = holidayDate(holiday, y)
      if (d === date || observedDate(d) === date) return { kind: 'holiday', holiday }
    }
  return calendar.closedDates.includes(date) ? { kind: 'closed' } : null
}

export function isBusinessDay(date: LocalDate, calendar: BusinessCalendar): boolean {
  return closedReason(date, calendar) === null
}

/**
 * The `n`th business day after `date` (counting starts the day after it, whatever `date` is): a request received on a
 * Friday afternoon or a Saturday has Monday as its first business day. `n` >= 1.
 */
export function addBusinessDays(date: LocalDate, n: number, calendar: BusinessCalendar): LocalDate {
  if (!isLocalDate(date)) throw new BusinessCalendarError(`Expected YYYY-MM-DD, got ${date}`)
  if (!Number.isSafeInteger(n) || n < 1) throw new BusinessCalendarError('Expected a whole number of days from 1')
  if (calendar.workdays.length === 0) throw new BusinessCalendarError('A calendar needs at least one workday')
  let day = date
  let counted = 0
  // A year holds at least 300 non-holiday days for any one workday, so this always ends well before the bound.
  for (let i = 0; i < 3700 * n; i++) {
    day = addLocalDays(day, 1)
    if (isBusinessDay(day, calendar) && ++counted === n) return day
  }
  throw new BusinessCalendarError('No business day found: every date is closed')
}

/**
 * The first instant after a local date ends in `zone` (its next local midnight), so "due on" a date means "by the end
 * of that date" in the business zone. Midnight is never skipped in the US zones; a zone that skips it resumes later.
 */
export function endOfLocalDay(date: LocalDate, zone: string): Date {
  const r = resolveLocalTime(addLocalDays(date, 1), '00:00', zone)
  if (r.kind === 'unique') return r.at.instant
  if (r.kind === 'repeated') return r.earlier.instant
  const after = resolveLocalTime(addLocalDays(date, 1), r.resumesAt, zone)
  return after.kind === 'unique' ? after.at.instant : after.kind === 'repeated' ? after.earlier.instant : new Date(NaN)
}

/** The values of privacy.request_targets the dates are counted with (FACT-PRIVACY-REQUEST-TARGETS). */
export type PrivacyRequestTargets = {
  readonly substantiveAcknowledgmentBusinessDays: number
  readonly completionCalendarDays: number
}

export type PrivacyRequestDates = {
  /** The receipt's calendar date in the business zone. */
  readonly receivedOn: LocalDate
  /** The substantive acknowledgment is due by the end of this business day. */
  readonly acknowledgmentDueOn: LocalDate
  /** The internal completion target (calendar days from receipt): due by the end of this date. */
  readonly targetDueOn: LocalDate
}

/** The dates of a privacy request received at `receivedAt`. The legal deadline is never computed here. */
export function privacyRequestDates(
  receivedAt: Date,
  zone: string,
  calendar: BusinessCalendar,
  targets: PrivacyRequestTargets,
): PrivacyRequestDates {
  const receivedOn = localDateOf(receivedAt, zone)
  return {
    receivedOn,
    acknowledgmentDueOn: addBusinessDays(receivedOn, targets.substantiveAcknowledgmentBusinessDays, calendar),
    targetDueOn: addLocalDays(receivedOn, targets.completionCalendarDays),
  }
}

export const PRIVACY_DEADLINE_ALERTS = [
  'acknowledgment_overdue',
  'completion_overdue',
  'legal_deadline_overdue',
] as const
export type PrivacyDeadlineAlert = (typeof PRIVACY_DEADLINE_ALERTS)[number]

/**
 * The overdue alerts of an open request on `today` (the business zone's date): the substantive acknowledgment while
 * it is not recorded, the internal target in force (after any extension) and the legal deadline once one is recorded.
 * A decided request has none. An alert never closes or changes the request.
 */
export function privacyDeadlineAlerts(
  r: {
    readonly open: boolean
    readonly acknowledged: boolean
    readonly acknowledgmentDueOn: LocalDate | null
    readonly targetOn: LocalDate | null
    readonly legalDeadlineOn: LocalDate | null
  },
  today: LocalDate,
): PrivacyDeadlineAlert[] {
  if (!r.open) return []
  const out: PrivacyDeadlineAlert[] = []
  if (!r.acknowledged && r.acknowledgmentDueOn !== null && today > r.acknowledgmentDueOn)
    out.push('acknowledgment_overdue')
  if (r.targetOn !== null && today > r.targetOn) out.push('completion_overdue')
  if (r.legalDeadlineOn !== null && today > r.legalDeadlineOn) out.push('legal_deadline_overdue')
  return out
}
