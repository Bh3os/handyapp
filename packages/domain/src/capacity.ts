// Capacity per worker and per equipment item (TSK-0062; HH-SCH-03, HH-SCH-04, T38, T39, FACT-HOURS, OWN-DEC-05,
// OWN-DEC-119, OWN-DEC-123).
//
// - Capacity is modelled per individual worker: the working days and hours the Owner set (local to the business zone),
//   approved time off and existing reservations. An equipment item is free whenever it is not reserved. Nothing here
//   holds a capacity, an hour or a duration: every number comes from the Owner's records or the visit's planning facts.
// - Intervals are half-open UTC millisecond ranges [start, end). Local working hours become instants with
//   @handyhub/domain/local-time, so a daylight-saving change never shifts them: a boundary inside a spring-forward gap
//   is the first instant after the gap; inside a repeated hour, a start is its earlier reading and an end its later
//   one (the hours as people read them on that day).
// - PROPOSED (no owner rule): the range a visit occupies its workers and equipment is the travel buffer before the
//   arrival window starts, through the arrival window, then the preparation buffer and the expected work after the
//   latest arrival (reservedRange). The on-site part (onSiteRange, from the earliest arrival to the end of the work)
//   lies inside the daily visit hours (FACT-HOURS); the whole reserved range lies inside the worker's working hours.
// - Pure and browser-safe: the staff app shows the same free periods the server computes.
import {
  addLocalDays,
  isClockTime,
  localDateOf,
  resolveLocalTime,
  type ClockTime,
  type LocalDate,
} from './local-time.js'

const MINUTE_MS = 60_000

/** A half-open UTC range [start, end) in epoch milliseconds. */
export type Interval = { readonly start: number; readonly end: number }

/** ISO weekdays: 1 Monday ... 7 Sunday. */
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const
export type Weekday = (typeof WEEKDAYS)[number]

/** One working period of a weekday, in minutes after local midnight (end 1440 is the end of the day). */
export type WorkingPeriod = { readonly weekday: Weekday; readonly startMinute: number; readonly endMinute: number }

export type PlanningFacts = {
  readonly expectedDurationMinutes: number
  readonly preparationBufferMinutes: number | null
  readonly travelBufferMinutes: number | null
}

/** PROPOSED: the range a visit reserves its workers and equipment for (see the header). */
export function reservedRange(window: { startsAt: Date; endsAt: Date }, facts: PlanningFacts): Interval {
  return {
    start: window.startsAt.getTime() - (facts.travelBufferMinutes ?? 0) * MINUTE_MS,
    end: window.endsAt.getTime() + ((facts.preparationBufferMinutes ?? 0) + facts.expectedDurationMinutes) * MINUTE_MS,
  }
}

/** PROPOSED: the on-site part of a visit, from the earliest arrival to the end of the work after the latest arrival. */
export function onSiteRange(window: { startsAt: Date; endsAt: Date }, facts: PlanningFacts): Interval {
  return {
    start: window.startsAt.getTime(),
    end: window.endsAt.getTime() + ((facts.preparationBufferMinutes ?? 0) + facts.expectedDurationMinutes) * MINUTE_MS,
  }
}

/** The ISO weekday of a calendar date. */
export function isoWeekday(date: LocalDate): Weekday {
  const d = new Date(`${date}T12:00:00Z`).getUTCDay()
  return (d === 0 ? 7 : d) as Weekday
}

/** "HH:MM" as minutes after midnight; "24:00" is 1440. Null for anything else. */
export function clockToMinute(t: string): number | null {
  if (t === '24:00') return 1440
  return isClockTime(t) ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : null
}

/** Minutes after midnight as "HH:MM" (1440 as "24:00"). */
export function minuteToClock(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** The instant of a local minute of `date` in `zone` (see the header for gaps and repeated hours). */
export function localInstant(date: LocalDate, minute: number, zone: string, side: 'start' | 'end'): number {
  if (minute >= 1440) return localInstant(addLocalDays(date, Math.floor(minute / 1440)), minute % 1440, zone, side)
  const r = resolveLocalTime(date, minuteToClock(minute) as ClockTime, zone)
  if (r.kind === 'unique') return r.at.instant.getTime()
  if (r.kind === 'repeated') return (side === 'start' ? r.earlier : r.later).instant.getTime()
  const resumes = resolveLocalTime(date, r.resumesAt, zone)
  if (resumes.kind === 'unique') return resumes.at.instant.getTime()
  if (resumes.kind === 'repeated') return resumes.earlier.instant.getTime()
  throw new Error(`no instant after the gap at ${date} ${r.resumesAt} in ${zone}`)
}

/** The whole local day [00:00, next 00:00) of `date` in `zone`. */
export function localDay(date: LocalDate, zone: string): Interval {
  return { start: localInstant(date, 0, zone, 'start'), end: localInstant(addLocalDays(date, 1), 0, zone, 'start') }
}

/** Sorted, with overlapping and touching intervals merged; empty ones dropped. */
export function normalize(intervals: readonly Interval[]): Interval[] {
  const sorted = intervals.filter((i) => i.end > i.start).sort((a, b) => a.start - b.start || a.end - b.end)
  const out: Interval[] = []
  for (const i of sorted) {
    const last = out[out.length - 1]
    if (last && i.start <= last.end) out[out.length - 1] = { start: last.start, end: Math.max(last.end, i.end) }
    else out.push(i)
  }
  return out
}

/** The parts of `base` not covered by `busy`. */
export function subtract(base: readonly Interval[], busy: readonly Interval[]): Interval[] {
  const minus = normalize(busy)
  const out: Interval[] = []
  for (const b of normalize(base)) {
    let from = b.start
    for (const m of minus) {
      if (m.end <= from || m.start >= b.end) continue
      if (m.start > from) out.push({ start: from, end: m.start })
      from = Math.max(from, m.end)
      if (from >= b.end) break
    }
    if (from < b.end) out.push({ start: from, end: b.end })
  }
  return out
}

/** The parts covered by both lists. */
export function intersect(a: readonly Interval[], b: readonly Interval[]): Interval[] {
  const out: Interval[] = []
  for (const x of normalize(a))
    for (const y of normalize(b)) {
      const start = Math.max(x.start, y.start)
      const end = Math.min(x.end, y.end)
      if (end > start) out.push({ start, end })
    }
  return normalize(out)
}

/** Whether one interval of the (normalized) list holds the whole range. */
export function covers(intervals: readonly Interval[], range: Interval): boolean {
  return normalize(intervals).some((i) => i.start <= range.start && i.end >= range.end)
}

export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end
}

/** The intervals at least `lengthMs` long. */
export function fitting(intervals: readonly Interval[], lengthMs: number): Interval[] {
  return normalize(intervals).filter((i) => i.end - i.start >= lengthMs)
}

/** A worker's working periods on local `date`, as instants (merged where they touch). */
export function workingIntervals(periods: readonly WorkingPeriod[], date: LocalDate, zone: string): Interval[] {
  const day = isoWeekday(date)
  return normalize(
    periods
      .filter((p) => p.weekday === day)
      .map((p) => ({
        start: localInstant(date, p.startMinute, zone, 'start'),
        end: localInstant(date, p.endMinute, zone, 'end'),
      })),
  )
}

/** The working periods of every local date a range touches (and the day before, for periods ending at midnight). */
export function workingIntervalsAround(periods: readonly WorkingPeriod[], range: Interval, zone: string): Interval[] {
  const dates: LocalDate[] = []
  for (let d = addLocalDays(localDateOf(new Date(range.start), zone), -1); dates.length < 40; d = addLocalDays(d, 1)) {
    dates.push(d)
    if (localDay(d, zone).start > range.end) break
  }
  return normalize(dates.flatMap((d) => workingIntervals(periods, d, zone)))
}

/** The daily hours (open, close as HH:MM) of every local date a range touches, as instants. */
export function dailyHoursAround(hours: { open: string; close: string }, range: Interval, zone: string): Interval[] {
  const open = clockToMinute(hours.open)
  const close = clockToMinute(hours.close)
  if (open === null || close === null || close <= open) return []
  const periods = WEEKDAYS.map((weekday) => ({ weekday, startMinute: open, endMinute: close }))
  return workingIntervalsAround(periods, range, zone)
}

export type HoursProblem = 'WEEKDAY_INVALID' | 'TIME_INVALID' | 'PERIOD_ORDER' | 'PERIOD_OVERLAP'

/** Whether a week of working periods is well formed: real weekdays and times, each ending after it starts, no overlap. */
export function hoursProblems(periods: readonly WorkingPeriod[]): HoursProblem[] {
  const out = new Set<HoursProblem>()
  for (const p of periods) {
    if (!(WEEKDAYS as readonly number[]).includes(p.weekday)) out.add('WEEKDAY_INVALID')
    if (
      !Number.isInteger(p.startMinute) ||
      !Number.isInteger(p.endMinute) ||
      p.startMinute < 0 ||
      p.startMinute > 1439 ||
      p.endMinute < 1 ||
      p.endMinute > 1440
    )
      out.add('TIME_INVALID')
    else if (p.endMinute <= p.startMinute) out.add('PERIOD_ORDER')
  }
  for (const d of WEEKDAYS) {
    const day = periods
      .filter((p) => p.weekday === d && p.endMinute > p.startMinute)
      .sort((a, b) => a.startMinute - b.startMinute)
    for (let i = 1; i < day.length; i++)
      if ((day[i] as WorkingPeriod).startMinute < (day[i - 1] as WorkingPeriod).endMinute) out.add('PERIOD_OVERLAP')
  }
  return [...out]
}
