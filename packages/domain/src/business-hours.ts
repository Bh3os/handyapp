// Business-hours arithmetic for the first-response clock (TSK-0043; HH-LEAD-05, FACT-RESPONSE-TARGET, FACT-HOURS,
// FACT-TIMEZONE, HH-DATA-06, HH-SCH-02).
//
// - Instants are UTC (`Date`); the daily hours are wall-clock times in an IANA zone that the caller reads from
//   configuration (`contact.hours`, `business.timezone`). Nothing here names a zone or an hour.
// - Each local calendar day has one window [open, close). Its two ends are converted to instants separately, so a day
//   on which the clocks change (spring forward, fall back) counts exactly the real minutes that elapsed inside it.
// - A request received outside the hours starts counting when the hours begin; the clock pauses outside them.
// - Pure and deterministic: `now` is always passed in.

export type DailyHours = { readonly open: string; readonly close: string }

export class BusinessHoursError extends Error {
  override name = 'BusinessHoursError'
}

const MINUTE_MS = 60_000

type LocalDate = { year: number; month: number; day: number }
type Parts = LocalDate & { hour: number; minute: number }

const formatters = new Map<string, Intl.DateTimeFormat>()
function formatter(zone: string): Intl.DateTimeFormat {
  let f = formatters.get(zone)
  if (!f) {
    try {
      f = new Intl.DateTimeFormat('en-US', {
        timeZone: zone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      })
    } catch {
      throw new BusinessHoursError(`Unknown time zone ${zone}`)
    }
    formatters.set(zone, f)
  }
  return f
}

/** The wall-clock date and time of an instant in a zone. */
export function zonedParts(instant: Date, zone: string): Parts {
  const p = Object.fromEntries(
    formatter(zone)
      .formatToParts(instant)
      .map((x) => [x.type, x.value]),
  )
  return {
    year: Number(p['year']),
    month: Number(p['month']),
    day: Number(p['day']),
    hour: Number(p['hour']),
    minute: Number(p['minute']),
  }
}

/**
 * The instant of a wall-clock time in a zone. Two passes settle the offset across a change; a time that does not exist
 * (inside a spring-forward gap) lands on the instant just after the gap, and a repeated time (fall back) on its first
 * occurrence.
 */
export function zonedTimeToUtc(p: Parts, zone: string): Date {
  const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute)
  let guess = wall
  for (let i = 0; i < 2; i++) {
    const seen = zonedParts(new Date(guess), zone)
    const seenWall = Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute)
    guess += wall - seenWall
  }
  return new Date(guess)
}

function clockMinutes(hhmm: string): number {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm)
  if (!m) throw new BusinessHoursError(`Expected HH:MM, got ${hhmm}`)
  return Number(m[1]) * 60 + Number(m[2])
}

/** The hours as minutes after local midnight; closing must come after opening on the same day. */
function window(hours: DailyHours): { open: number; close: number } {
  const open = clockMinutes(hours.open)
  const close = clockMinutes(hours.close)
  if (close <= open) throw new BusinessHoursError('The daily hours must close after they open')
  return { open, close }
}

function addDays(d: LocalDate, days: number): LocalDate {
  const x = new Date(Date.UTC(d.year, d.month - 1, d.day + days))
  return { year: x.getUTCFullYear(), month: x.getUTCMonth() + 1, day: x.getUTCDate() }
}

/** The day's open window as instants. */
function dayWindow(d: LocalDate, w: { open: number; close: number }, zone: string): { start: number; end: number } {
  const at = (m: number) => zonedTimeToUtc({ ...d, hour: Math.floor(m / 60), minute: m % 60 }, zone).getTime()
  return { start: at(w.open), end: at(w.close) }
}

/** Whether `at` falls inside the daily hours. */
export function isWithinHours(at: Date, hours: DailyHours, zone: string): boolean {
  const w = window(hours)
  const d = zonedParts(at, zone)
  const { start, end } = dayWindow(d, w, zone)
  return at.getTime() >= start && at.getTime() < end
}

/** `at` when it is inside the hours, otherwise the next opening. */
export function nextOpening(at: Date, hours: DailyHours, zone: string): Date {
  const w = window(hours)
  let d: LocalDate = zonedParts(at, zone)
  for (let i = 0; i < 3; i++) {
    const { start, end } = dayWindow(d, w, zone)
    if (at.getTime() < end) return new Date(Math.max(start, at.getTime()))
    d = addDays(d, 1)
  }
  throw new BusinessHoursError('No opening found')
}

/** The milliseconds of [from, to) that fall inside the daily hours. */
function businessMs(from: Date, to: Date, hours: DailyHours, zone: string): number {
  if (to.getTime() <= from.getTime()) return 0
  const w = window(hours)
  let d: LocalDate = zonedParts(from, zone)
  let ms = 0
  // One iteration per local day, from `from`'s local date until a window opens at or after `to`.
  for (;;) {
    const { start, end } = dayWindow(d, w, zone)
    if (start >= to.getTime()) break
    const a = Math.max(start, from.getTime())
    const b = Math.min(end, to.getTime())
    if (b > a) ms += b - a
    d = addDays(d, 1)
  }
  return ms
}

/** The whole minutes of [from, to) that fall inside the daily hours; 0 when `to` is not after `from`. */
export function businessMinutesBetween(from: Date, to: Date, hours: DailyHours, zone: string): number {
  return Math.floor(businessMs(from, to, hours, zone) / MINUTE_MS)
}

/** The instant at which `minutes` business minutes have elapsed since `from` (the response target's deadline). */
export function addBusinessMinutes(from: Date, minutes: number, hours: DailyHours, zone: string): Date {
  if (!Number.isInteger(minutes) || minutes < 0) throw new BusinessHoursError('Minutes must be a whole number ≥ 0')
  const w = window(hours)
  let left = minutes * MINUTE_MS
  let d: LocalDate = zonedParts(from, zone)
  for (;;) {
    const { start, end } = dayWindow(d, w, zone)
    const a = Math.max(start, from.getTime())
    if (end > a) {
      if (left <= end - a) return new Date(a + left)
      left -= end - a
    }
    d = addDays(d, 1)
  }
}

/** How a running clock reads at `now`. */
export type ClockReading =
  | {
      readonly state: 'running' | 'paused'
      /** Business minutes left before the target. */
      readonly remainingMinutes: number
      /** While paused: when counting resumes. */
      readonly resumesAt: Date | null
    }
  | {
      readonly state: 'overdue'
      /** Business minutes past the target (0 in the first minute). */
      readonly overdueMinutes: number
      readonly resumesAt: Date | null
    }

/**
 * Reads a running first-response clock: remaining business minutes, or overdue; paused outside the hours (OWN-DEC-115
 * "show remaining time or overdue status; pause outside those hours").
 */
export function readClock(dueAt: Date, now: Date, hours: DailyHours, zone: string): ClockReading {
  const open = isWithinHours(now, hours, zone)
  const resumesAt = open ? null : nextOpening(now, hours, zone)
  if (now.getTime() >= dueAt.getTime())
    return { state: 'overdue', overdueMinutes: businessMinutesBetween(dueAt, now, hours, zone), resumesAt }
  // Rounded up: one second before the deadline still shows one minute left.
  const remainingMinutes = Math.ceil(businessMs(now, dueAt, hours, zone) / MINUTE_MS)
  return { state: open ? 'running' : 'paused', remainingMinutes, resumesAt }
}
