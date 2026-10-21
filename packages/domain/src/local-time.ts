// Local schedules in an explicit IANA zone, stored as UTC instants (TSK-0061; HH-SCH-02, HH-DATA-06, T41,
// FACT-TIMEZONE, OWN-DEC-92).
//
// - An instant is a UTC `Date`. A local schedule is a calendar date, wall-clock times and an IANA zone; the zone is
//   always passed in (from the property or configuration). Nothing here reads the machine's time zone: only
//   Date.UTC, getTime and Intl with an explicit `timeZone` are used, so the results are the same on any server.
// - A wall-clock time can have no instant (inside a spring-forward gap), one, or two (inside a fall-back repeated
//   hour). resolveLocalTime says which. A gap time is refused, never moved; a repeated time is stored with the offset
//   chosen for it, so the stored instant is unambiguous.
// - Pure and browser-safe: the staff app uses the same rules to offer the two readings of a repeated hour.

export type LocalDate = string
export type ClockTime = string

/** One reading of a wall-clock time: the instant and the zone's UTC offset at it, in minutes east of UTC. */
export type ZonedInstant = { readonly instant: Date; readonly offsetMinutes: number }

export type LocalResolution =
  | { readonly kind: 'unique'; readonly at: ZonedInstant }
  /** Fall back: the time happens twice; `earlier` has the offset before the change. */
  | { readonly kind: 'repeated'; readonly earlier: ZonedInstant; readonly later: ZonedInstant }
  /**
   * Spring forward: the time does not exist. The clocks jump from `skippedFrom` to `resumesAt` (both local clock
   * times of that date); `offsetBefore` and `offsetAfter` are the offsets on either side.
   */
  | {
      readonly kind: 'gap'
      readonly skippedFrom: ClockTime
      readonly resumesAt: ClockTime
      readonly offsetBefore: number
      readonly offsetAfter: number
    }

const MINUTE_MS = 60_000
const DAY_MS = 24 * 60 * MINUTE_MS
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/
const OFFSET = /^([+-])(\d{2}):(\d{2})$/

const formatters = new Map<string, Intl.DateTimeFormat | null>()
function formatter(zone: string): Intl.DateTimeFormat | null {
  if (!formatters.has(zone)) {
    let f: Intl.DateTimeFormat | null
    try {
      f = new Intl.DateTimeFormat('en-US', {
        timeZone: zone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      })
    } catch {
      f = null
    }
    formatters.set(zone, f)
  }
  return formatters.get(zone) ?? null
}

export class LocalTimeError extends Error {
  override name = 'LocalTimeError'
}

function zoned(zone: string): Intl.DateTimeFormat {
  const f = formatter(zone)
  if (!f) throw new LocalTimeError(`Unknown time zone ${zone}`)
  return f
}

/** Whether `zone` is an IANA zone id this runtime knows ("America/Kentucky/Louisville"); offsets and "EST" are not. */
export function isTimeZone(zone: unknown): zone is string {
  return typeof zone === 'string' && /^[A-Za-z]+(?:\/[A-Za-z0-9_+-]+)+$/.test(zone) && formatter(zone) !== null
}

/** A real calendar date written YYYY-MM-DD. */
export function isLocalDate(s: unknown): s is LocalDate {
  if (typeof s !== 'string') return false
  const m = DATE.exec(s)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const t = new Date(Date.UTC(y, mo - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d
}

/** A wall-clock time written HH:MM (00:00 to 23:59). */
export function isClockTime(s: unknown): s is ClockTime {
  return typeof s === 'string' && CLOCK.test(s)
}

const clockMinutes = (t: ClockTime) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
const pad = (n: number) => String(n).padStart(2, '0')

/** The wall clock of an instant in a zone, to the second, as a UTC-based millisecond count. */
function wallMs(instant: number, zone: string): number {
  const p = Object.fromEntries(
    zoned(zone)
      .formatToParts(new Date(instant))
      .map((x) => [x.type, x.value]),
  )
  return Date.UTC(
    Number(p['year']),
    Number(p['month']) - 1,
    Number(p['day']),
    Number(p['hour']),
    Number(p['minute']),
    Number(p['second']),
  )
}

/** The zone's UTC offset at an instant, in whole minutes east of UTC (Louisville: -240 in summer, -300 in winter). */
export function offsetMinutesAt(instant: Date, zone: string): number {
  const t = Math.floor(instant.getTime() / 1000) * 1000
  return Math.round((wallMs(t, zone) - t) / MINUTE_MS)
}

/** An offset as ISO text: -300 as "-05:00", 0 as "+00:00". */
export function formatOffset(minutes: number): string {
  const a = Math.abs(minutes)
  return `${minutes < 0 ? '-' : '+'}${pad(Math.floor(a / 60))}:${pad(a % 60)}`
}

/** "-05:00" as -300; null for anything else. */
export function parseOffset(text: unknown): number | null {
  if (typeof text !== 'string') return null
  const m = OFFSET.exec(text)
  if (!m) return null
  const h = Number(m[2])
  const min = Number(m[3])
  if (h > 14 || min > 59) return null
  return (m[1] === '-' ? -1 : 1) * (h * 60 + min)
}

/** The calendar date of an instant in a zone. */
export function localDateOf(instant: Date, zone: string): LocalDate {
  return new Date(wallMs(instant.getTime(), zone)).toISOString().slice(0, 10)
}

/** The wall-clock time (HH:MM) of an instant in a zone. */
export function localClockOf(instant: Date, zone: string): ClockTime {
  return new Date(wallMs(instant.getTime(), zone)).toISOString().slice(11, 16)
}

/** A calendar date plus some days: calendar arithmetic only, so no clock change can shift it. */
export function addLocalDays(date: LocalDate, days: number): LocalDate {
  if (!isLocalDate(date)) throw new LocalTimeError(`Expected YYYY-MM-DD, got ${date}`)
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Tomorrow's date in a zone (OWN-DEC-92: dates start tomorrow in the property's local time). */
export function tomorrowIn(now: Date, zone: string): LocalDate {
  return addLocalDays(localDateOf(now, zone), 1)
}

/**
 * Every instant at which `date` `time` happens in `zone`: none (gap), one, or two (repeated hour). The candidates are
 * the offsets in force a day either side of the wall time; each is kept only when the zone really shows that wall
 * time at the resulting instant.
 */
export function resolveLocalTime(date: LocalDate, time: ClockTime, zone: string): LocalResolution {
  if (!isLocalDate(date)) throw new LocalTimeError(`Expected YYYY-MM-DD, got ${date}`)
  if (!isClockTime(time)) throw new LocalTimeError(`Expected HH:MM, got ${time}`)
  zoned(zone)
  const wall =
    Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))) +
    clockMinutes(time) * MINUTE_MS
  const before = offsetMinutesAt(new Date(wall - DAY_MS), zone)
  const after = offsetMinutesAt(new Date(wall + DAY_MS), zone)
  const found: ZonedInstant[] = []
  for (const offset of new Set([before, offsetMinutesAt(new Date(wall), zone), after])) {
    const instant = wall - offset * MINUTE_MS
    if (wallMs(instant, zone) === wall && !found.some((f) => f.instant.getTime() === instant))
      found.push({ instant: new Date(instant), offsetMinutes: offset })
  }
  found.sort((a, b) => a.instant.getTime() - b.instant.getTime())
  const [first, second] = found
  if (first && second) return { kind: 'repeated', earlier: first, later: second }
  if (first) return { kind: 'unique', at: first }
  // A gap: at the change instant the wall clock jumps from (change + old offset) to (change + new offset).
  const change = offsetChanges(zone, new Date(wall - DAY_MS), new Date(wall + DAY_MS)).find(
    (c) => c.offsetAfter > c.offsetBefore,
  )
  const at = change ? change.at.getTime() : wall - before * MINUTE_MS
  const clock = (ms: number) => new Date(ms).toISOString().slice(11, 16)
  return {
    kind: 'gap',
    skippedFrom: clock(at + (change?.offsetBefore ?? before) * MINUTE_MS),
    resumesAt: clock(at + (change?.offsetAfter ?? after) * MINUTE_MS),
    offsetBefore: change?.offsetBefore ?? before,
    offsetAfter: change?.offsetAfter ?? after,
  }
}

/** A clock change of a zone: the first instant of the new offset. */
export type OffsetChange = { readonly at: Date; readonly offsetBefore: number; readonly offsetAfter: number }

/** The zone's offset changes in [from, to), found by hourly steps and a binary search to the minute. */
export function offsetChanges(zone: string, from: Date, to: Date): OffsetChange[] {
  const out: OffsetChange[] = []
  const HOUR = 60 * MINUTE_MS
  let t = Math.floor(from.getTime() / MINUTE_MS) * MINUTE_MS
  let o = offsetMinutesAt(new Date(t), zone)
  while (t < to.getTime()) {
    const next = Math.min(t + HOUR, to.getTime())
    const on = offsetMinutesAt(new Date(next), zone)
    if (on !== o) {
      let lo = t
      let hi = next
      while (hi - lo > MINUTE_MS) {
        const mid = lo + Math.floor((hi - lo) / 2 / MINUTE_MS) * MINUTE_MS
        if (offsetMinutesAt(new Date(mid), zone) === o) lo = mid
        else hi = mid
      }
      out.push({ at: new Date(hi), offsetBefore: o, offsetAfter: on })
      o = on
    }
    t = next
  }
  return out
}

/** A visit's arrival window as entered: a date, two wall-clock times and the zone, with the offsets chosen. */
export type WindowInput = {
  readonly date: LocalDate
  readonly start: ClockTime
  readonly end: ClockTime
  readonly zone: string
  /** The offset chosen for a start inside a repeated hour (minutes east of UTC); ignored elsewhere when it matches. */
  readonly startOffsetMinutes?: number | null
  readonly endOffsetMinutes?: number | null
}

/** A resolved local window: the local fields stored with the zone, and the exact UTC instants and offsets. */
export type LocalWindow = {
  readonly date: LocalDate
  readonly start: ClockTime
  readonly end: ClockTime
  readonly zone: string
  readonly startsAt: Date
  readonly endsAt: Date
  readonly startOffsetMinutes: number
  readonly endOffsetMinutes: number
}

export type WindowField = 'start' | 'end'
export type WindowProblem =
  | { readonly code: 'ZONE_UNKNOWN' }
  | { readonly code: 'DATE_INVALID' }
  | { readonly code: 'TIME_INVALID'; readonly field: WindowField }
  /** The end is not after the start. */
  | { readonly code: 'WINDOW_ORDER' }
  /** The time falls in a spring-forward gap: refused, never moved. */
  | {
      readonly code: 'LOCAL_TIME_GAP'
      readonly field: WindowField
      readonly skippedFrom: ClockTime
      readonly resumesAt: ClockTime
    }
  /** The time happens twice and no offset was chosen: the caller must pick one of `offsets`. */
  | { readonly code: 'LOCAL_TIME_REPEATED'; readonly field: WindowField; readonly offsets: readonly number[] }
  /** The offset given is not one this local time has in the zone. */
  | { readonly code: 'OFFSET_INVALID'; readonly field: WindowField; readonly offsets: readonly number[] }

export type WindowResult =
  { readonly ok: true; readonly window: LocalWindow } | { readonly ok: false; readonly problems: WindowProblem[] }

function pick(
  date: LocalDate,
  time: ClockTime,
  zone: string,
  field: WindowField,
  chosen: number | null | undefined,
): ZonedInstant | WindowProblem {
  const r = resolveLocalTime(date, time, zone)
  if (r.kind === 'gap') return { code: 'LOCAL_TIME_GAP', field, skippedFrom: r.skippedFrom, resumesAt: r.resumesAt }
  const options = r.kind === 'unique' ? [r.at] : [r.earlier, r.later]
  const offsets = options.map((o) => o.offsetMinutes)
  if (chosen === null || chosen === undefined) {
    return r.kind === 'unique' ? r.at : { code: 'LOCAL_TIME_REPEATED', field, offsets }
  }
  return options.find((o) => o.offsetMinutes === chosen) ?? { code: 'OFFSET_INVALID', field, offsets }
}

/**
 * Resolves an arrival window. Every problem is returned at once. The stored local date and times are the ones
 * entered: moving a window to another date keeps its local times, and the instants follow the zone's offset on the
 * new date (T41).
 */
export function resolveWindow(input: WindowInput): WindowResult {
  const problems: WindowProblem[] = []
  if (!isTimeZone(input.zone)) problems.push({ code: 'ZONE_UNKNOWN' })
  if (!isLocalDate(input.date)) problems.push({ code: 'DATE_INVALID' })
  if (!isClockTime(input.start)) problems.push({ code: 'TIME_INVALID', field: 'start' })
  if (!isClockTime(input.end)) problems.push({ code: 'TIME_INVALID', field: 'end' })
  if (problems.length > 0) return { ok: false, problems }
  if (clockMinutes(input.end) <= clockMinutes(input.start)) problems.push({ code: 'WINDOW_ORDER' })
  const start = pick(input.date, input.start, input.zone, 'start', input.startOffsetMinutes)
  const end = pick(input.date, input.end, input.zone, 'end', input.endOffsetMinutes)
  if ('code' in start) problems.push(start)
  if ('code' in end) problems.push(end)
  if (problems.length > 0 || 'code' in start || 'code' in end) return { ok: false, problems }
  // Inside a repeated hour a later wall time can still be the earlier instant (1:45 EDT is before 1:30 EST).
  if (end.instant.getTime() <= start.instant.getTime()) return { ok: false, problems: [{ code: 'WINDOW_ORDER' }] }
  return {
    ok: true,
    window: {
      date: input.date,
      start: input.start,
      end: input.end,
      zone: input.zone,
      startsAt: start.instant,
      endsAt: end.instant,
      startOffsetMinutes: start.offsetMinutes,
      endOffsetMinutes: end.offsetMinutes,
    },
  }
}

/**
 * Whether a window lies inside daily hours kept in `zone` (FACT-HOURS: the business time zone): it starts at or after
 * the opening and ends at or before the closing of one local day. The hours come from configuration.
 */
export function windowWithinHours(
  window: Pick<LocalWindow, 'startsAt' | 'endsAt'>,
  hours: { readonly open: ClockTime; readonly close: ClockTime },
  zone: string,
): boolean {
  const day = localDateOf(window.startsAt, zone)
  const lastMinute = new Date(window.endsAt.getTime() - MINUTE_MS)
  if (localDateOf(lastMinute, zone) !== day) return false
  const start = localClockOf(window.startsAt, zone)
  const end = localDateOf(window.endsAt, zone) === day ? localClockOf(window.endsAt, zone) : '24:00'
  return start >= hours.open && end <= hours.close
}

/**
 * A window as people read it, always with its zone (HH-SCH-02: customers always see the appointment's zone): the date,
 * the two times with the zone's short name at each (EDT, EST), and the zone id. `locale` is a BCP 47 tag ("en-US",
 * "es-US"). Formatted from the instants in the window's own zone, so the reader's device zone never changes it.
 */
export function windowText(window: LocalWindow, locale: string): string {
  const date = new Intl.DateTimeFormat(locale, {
    timeZone: window.zone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(window.startsAt)
  const time = new Intl.DateTimeFormat(locale, {
    timeZone: window.zone,
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  })
  return `${date}, ${time.format(window.startsAt)} – ${time.format(window.endsAt)} (${window.zone})`
}
