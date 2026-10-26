// A customer-agreed repeat-service schedule and its reminders (TSK-0114; HH-SCH-10, C11, T67, OWN-DEC-113,
// OWN-DEC-148, FACT-REMINDER-CADENCES, FACT-SVC-RECURRING-SERVICE). Pure: no database and no clock.
//
// - A schedule is recorded only when the customer agreed to one: the next service date and, when they agreed to a
//   repeat, how often (every N days, weeks or months). Nothing here proposes an interval: the customer's agreement is
//   the only source of one, and the limits below only bound what staff may type (PROPOSED, OQ-REPEAT-SERVICE-DETAILS).
// - Dates are local calendar dates of the property's zone, computed from the anchor (the agreed next date) by calendar
//   arithmetic only: occurrence k is anchor + k intervals, never the previous date plus one, so a month that is too
//   short (31 January + 1 month) gives its last day without moving the next occurrence, and no clock change can shift a
//   date (DST is the zone's business when a date is turned into an instant).
// - Each occurrence is a new request with its own records, prices, discounts, verification and consent; nothing here
//   copies anything. A date the customer skipped, or that has its request, gets no reminder.
// - A change made within the change notice (OWN-DEC-148: 24 hours) of an occurrence keeps that occurrence ("kept").
import { addLocalDays, isLocalDate, type LocalDate } from './local-time.js'

export const SERIES_UNITS = ['day', 'week', 'month'] as const
export type SeriesUnit = (typeof SERIES_UNITS)[number]

/** PROPOSED input limits (no owner value): the largest count staff or the customer may enter per unit. */
export const SERIES_INTERVAL_LIMITS: Readonly<Record<SeriesUnit, number>> = { day: 366, week: 52, month: 24 }

/** How often the customer agreed to repeat the service; null: one agreed next date and no repeat. */
export type SeriesInterval = { readonly unit: SeriesUnit; readonly count: number } | null

/** How staff heard the customer's agreement (PROPOSED list). */
export const SERIES_AGREEMENT_SOURCES = ['phone', 'in_person', 'email', 'message'] as const
export type SeriesAgreementSource = (typeof SERIES_AGREEMENT_SOURCES)[number]

export const SERIES_STATES = ['active', 'stopped'] as const
export type SeriesState = (typeof SERIES_STATES)[number]

export const OCCURRENCE_STATES = ['kept', 'skipped', 'requested'] as const
export type OccurrenceState = (typeof OCCURRENCE_STATES)[number]

export const SERIES_CHANGES = [
  'recorded',
  'changed',
  'reminders_on',
  'reminders_off',
  'stopped',
  'occurrence_skipped',
  'occurrence_linked',
] as const
export type SeriesChange = (typeof SERIES_CHANGES)[number]

/** Why a repeat-service reminder may not be prepared or released for a date now (null: it may). */
export const REPEAT_REMINDER_BLOCKS = [
  'series_stopped',
  'reminders_off',
  'not_on_schedule',
  'occurrence_skipped',
  'occurrence_requested',
  'no_email_address',
  'follow_ups_opted_out',
  'case_active',
] as const
export type RepeatReminderBlock = (typeof REPEAT_REMINDER_BLOCKS)[number]

/** Whether an interval is one the limits allow (null: no repeat). */
export function isSeriesInterval(i: unknown): i is SeriesInterval {
  if (i === null) return true
  if (typeof i !== 'object') return false
  const { unit, count } = i as { unit?: unknown; count?: unknown }
  if (typeof unit !== 'string' || !(SERIES_UNITS as readonly string[]).includes(unit)) return false
  return (
    Number.isInteger(count) && (count as number) >= 1 && (count as number) <= SERIES_INTERVAL_LIMITS[unit as SeriesUnit]
  )
}

const daysIn = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate()

/** A calendar date plus some months; a day the target month does not have becomes its last day (31 Jan + 1 = 28 Feb). */
export function addLocalMonths(date: LocalDate, months: number): LocalDate {
  if (!isLocalDate(date)) throw new RangeError(`Expected YYYY-MM-DD, got ${date}`)
  const y = Number(date.slice(0, 4))
  const m = Number(date.slice(5, 7)) - 1 + months
  const year = y + Math.floor(m / 12)
  const month = (((m % 12) + 12) % 12) + 1
  const day = Math.min(Number(date.slice(8, 10)), daysIn(year, month))
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Occurrence k (0: the anchor) of a schedule, always from the anchor. */
export function occurrenceDate(anchor: LocalDate, interval: SeriesInterval, k: number): LocalDate {
  if (k === 0 || interval === null) return anchor
  if (interval.unit === 'month') return addLocalMonths(anchor, k * interval.count)
  return addLocalDays(anchor, k * interval.count * (interval.unit === 'week' ? 7 : 1))
}

/** The schedule's dates on or after `from`, ascending, at most `limit` (one date only without a repeat). */
export function scheduleDates(
  anchor: LocalDate,
  interval: SeriesInterval,
  from: LocalDate,
  limit: number,
): LocalDate[] {
  const out: LocalDate[] = []
  if (interval === null) return anchor >= from && limit > 0 ? [anchor] : []
  // Skip ahead to just before `from` without walking every interval of a long-running schedule (a month counted as 31
  // days, so the estimate never passes a date on or after `from`).
  const days = Math.max(
    0,
    Math.round((Date.parse(`${from}T12:00:00Z`) - Date.parse(`${anchor}T12:00:00Z`)) / 86_400_000),
  )
  const perStep = interval.unit === 'month' ? 31 * interval.count : interval.count * (interval.unit === 'week' ? 7 : 1)
  let k = Math.max(0, Math.floor(days / perStep) - 1)
  while (out.length < limit) {
    const d = occurrenceDate(anchor, interval, k)
    if (d >= from) out.push(d)
    k += 1
  }
  return out
}

/** Whether a date is one of the schedule's dates. */
export function isScheduleDate(anchor: LocalDate, interval: SeriesInterval, date: LocalDate): boolean {
  if (!isLocalDate(date) || date < anchor) return false
  return scheduleDates(anchor, interval, date, 1)[0] === date
}

export type SeriesSchedule = {
  readonly anchor: LocalDate
  readonly interval: SeriesInterval
  /** Dates recorded on the series: kept from an earlier schedule, skipped, or requested. */
  readonly occurrences: readonly { readonly date: LocalDate; readonly state: OccurrenceState }[]
}

/** Whether a date is an occurrence of the series: on the schedule or kept, and not skipped. */
export function isOccurrence(s: SeriesSchedule, date: LocalDate): boolean {
  const o = s.occurrences.find((x) => x.date === date)
  if (o?.state === 'skipped') return false
  if (o?.state === 'kept' || o?.state === 'requested') return true
  return isScheduleDate(s.anchor, s.interval, date)
}

/**
 * The series' upcoming occurrences on or after `from` (today in the property's zone): the schedule's dates and the
 * kept ones, without the skipped ones, ascending, at most `limit`. Requested ones are listed (they have their request).
 */
export function upcomingOccurrences(s: SeriesSchedule, from: LocalDate, limit: number): LocalDate[] {
  const skipped = new Set(s.occurrences.filter((o) => o.state === 'skipped').map((o) => o.date))
  const extra = s.occurrences.filter((o) => o.state !== 'skipped' && o.date >= from).map((o) => o.date)
  const dates = new Set<LocalDate>(extra)
  // Enough schedule dates to fill the limit after the skipped ones are taken out.
  for (const d of scheduleDates(s.anchor, s.interval, from, limit + skipped.size)) dates.add(d)
  return [...dates]
    .filter((d) => !skipped.has(d))
    .sort()
    .slice(0, limit)
}

/** The facts of a reminder for one date. */
export type RepeatReminderFacts = {
  readonly state: SeriesState
  readonly reminders: boolean
  /** The date is an occurrence (on the schedule or kept, not skipped). */
  readonly onSchedule: boolean
  readonly occurrence: OccurrenceState | null
  readonly hasEmail: boolean
  /** The customer asked for no optional follow-ups on the channel (service communication withdrawn). */
  readonly optedOut: boolean
  /** Open cases on the series' project or on a project an occurrence was requested in. */
  readonly activeCases: number
}

/** Why a reminder for a date may not go now (null: it may). Checked in this order; the first reason is given. */
export function repeatReminderBlock(f: RepeatReminderFacts): RepeatReminderBlock | null {
  if (f.state !== 'active') return 'series_stopped'
  if (!f.reminders) return 'reminders_off'
  if (f.occurrence === 'skipped') return 'occurrence_skipped'
  if (f.occurrence === 'requested') return 'occurrence_requested'
  if (!f.onSchedule) return 'not_on_schedule'
  if (!f.hasEmail) return 'no_email_address'
  if (f.optedOut) return 'follow_ups_opted_out'
  if (f.activeCases > 0) return 'case_active'
  return null
}

/**
 * The dates of the current schedule a change keeps (OWN-DEC-148): upcoming occurrences whose local day starts less
 * than the notice before `now`, given each date's start instant. The change applies to every later date.
 */
export function keptByNotice(
  upcoming: readonly LocalDate[],
  startOf: (date: LocalDate) => Date,
  now: Date,
  noticeHours: number,
): LocalDate[] {
  const limit = now.getTime() + noticeHours * 3_600_000
  return upcoming.filter((d) => startOf(d).getTime() < limit)
}
