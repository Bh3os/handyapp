// Local schedules in an explicit IANA zone, across both daylight-saving changes (TSK-0061; HH-SCH-02, HH-DATA-06, T41,
// FACT-TIMEZONE, OWN-DEC-92). Every zone is passed in; nothing depends on this machine's zone, and one test runs the
// same conversions with the process zone set to a far-away zone to prove it. The US Eastern changes of 2026 are
// spring forward on 2026-03-08 (02:00 -> 03:00) and fall back on 2026-11-01 (02:00 -> 01:00); the dates and times are
// synthetic test inputs, not business facts.
import { afterEach, describe, expect, it } from 'vitest'
import {
  addLocalDays,
  formatOffset,
  isClockTime,
  isLocalDate,
  isTimeZone,
  localClockOf,
  localDateOf,
  LocalTimeError,
  offsetChanges,
  offsetMinutesAt,
  parseOffset,
  resolveLocalTime,
  resolveWindow,
  tomorrowIn,
  windowText,
  windowWithinHours,
} from '../src/local-time.js'

const ZONE = 'America/Kentucky/Louisville'
const HOURS = { open: '08:00', close: '22:00' }
const utc = (iso: string) => new Date(iso)

describe('[HH-SCH-02][HH-DATA-06] instants are UTC; local times resolve in an explicit IANA zone', () => {
  it('[HH-DATA-06] a summer and a winter time get the offset in force on their date', () => {
    expect(resolveLocalTime('2026-07-15', '09:00', ZONE)).toEqual({
      kind: 'unique',
      at: { instant: utc('2026-07-15T13:00:00Z'), offsetMinutes: -240 },
    })
    expect(resolveLocalTime('2026-12-15', '09:00', ZONE)).toEqual({
      kind: 'unique',
      at: { instant: utc('2026-12-15T14:00:00Z'), offsetMinutes: -300 },
    })
    expect(offsetMinutesAt(utc('2026-07-15T13:00:00Z'), ZONE)).toBe(-240)
    expect(offsetMinutesAt(utc('2026-12-15T14:00:00Z'), ZONE)).toBe(-300)
    expect(localDateOf(utc('2026-12-15T04:30:00Z'), ZONE)).toBe('2026-12-14')
    expect(localClockOf(utc('2026-12-15T04:30:00Z'), ZONE)).toBe('23:30')
  })

  it('[HH-DATA-06] the zone is always explicit: ids are checked, abbreviations and offsets are not zones', () => {
    expect(isTimeZone(ZONE)).toBe(true)
    expect(isTimeZone('America/New_York')).toBe(true)
    expect(isTimeZone('Australia/Lord_Howe')).toBe(true)
    for (const bad of ['EST', 'UTC-5', '-05:00', 'America/Nowhere', '', 'Eastern', null, 5])
      expect(isTimeZone(bad)).toBe(false)
    expect(() => resolveLocalTime('2026-07-15', '09:00', 'America/Nowhere')).toThrow(LocalTimeError)
  })

  it('[HH-DATA-06] dates and times are validated strictly', () => {
    expect(isLocalDate('2028-02-29')).toBe(true)
    for (const bad of ['2027-02-29', '2026-13-01', '2026-1-01', '2026-04-31', '']) expect(isLocalDate(bad)).toBe(false)
    expect(isClockTime('23:59')).toBe(true)
    for (const bad of ['24:00', '9:00', '09:60', '09:00:00']) expect(isClockTime(bad)).toBe(false)
    expect(() => resolveLocalTime('2026-02-30', '09:00', ZONE)).toThrow(LocalTimeError)
  })

  it('[HH-DATA-06] offsets are written and read as ISO text', () => {
    expect(formatOffset(-300)).toBe('-05:00')
    expect(formatOffset(-240)).toBe('-04:00')
    expect(formatOffset(0)).toBe('+00:00')
    expect(formatOffset(330)).toBe('+05:30')
    expect(parseOffset('-05:00')).toBe(-300)
    expect(parseOffset('+10:30')).toBe(630)
    for (const bad of ['-5:00', '05:00', '+15:00', '-05:60', null]) expect(parseOffset(bad)).toBeNull()
  })

  it('[OWN-DEC-92][HH-DATA-06] "tomorrow" is the next calendar day in the zone, around midnight and DST changes', () => {
    // 11:30 PM in Louisville is already the next day in UTC; tomorrow is still the day after the local date.
    expect(tomorrowIn(utc('2026-10-22T03:30:00Z'), ZONE)).toBe('2026-10-22')
    expect(tomorrowIn(utc('2026-10-22T04:30:00Z'), ZONE)).toBe('2026-10-23')
    // Just before and after local midnight on the fall-back night and the spring-forward night.
    expect(tomorrowIn(utc('2026-11-01T03:59:00Z'), ZONE)).toBe('2026-11-01')
    expect(tomorrowIn(utc('2026-11-01T04:00:00Z'), ZONE)).toBe('2026-11-02')
    expect(tomorrowIn(utc('2026-03-08T04:59:00Z'), ZONE)).toBe('2026-03-08')
    expect(tomorrowIn(utc('2026-03-08T05:00:00Z'), ZONE)).toBe('2026-03-09')
    expect(addLocalDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addLocalDays('2026-03-07', 2)).toBe('2026-03-09')
  })

  it('[HH-SCH-02] the zone changes are found to the minute', () => {
    expect(offsetChanges(ZONE, utc('2026-01-01T00:00:00Z'), utc('2027-01-01T00:00:00Z'))).toEqual([
      { at: utc('2026-03-08T07:00:00Z'), offsetBefore: -300, offsetAfter: -240 },
      { at: utc('2026-11-01T06:00:00Z'), offsetBefore: -240, offsetAfter: -300 },
    ])
  })
})

describe('[HH-SCH-02][T41] the spring-forward gap and the repeated fall-back hour', () => {
  it('[T41] a time inside the spring-forward gap does not exist and says what the clocks skip', () => {
    for (const time of ['02:00', '02:30', '02:59'])
      expect(resolveLocalTime('2026-03-08', time, ZONE)).toEqual({
        kind: 'gap',
        skippedFrom: '02:00',
        resumesAt: '03:00',
        offsetBefore: -300,
        offsetAfter: -240,
      })
    // Either side of the gap is an ordinary time.
    expect(resolveLocalTime('2026-03-08', '01:59', ZONE)).toEqual({
      kind: 'unique',
      at: { instant: utc('2026-03-08T06:59:00Z'), offsetMinutes: -300 },
    })
    expect(resolveLocalTime('2026-03-08', '03:00', ZONE)).toEqual({
      kind: 'unique',
      at: { instant: utc('2026-03-08T07:00:00Z'), offsetMinutes: -240 },
    })
  })

  it('[T41] a time inside the repeated hour has two readings, each with its offset', () => {
    expect(resolveLocalTime('2026-11-01', '01:30', ZONE)).toEqual({
      kind: 'repeated',
      earlier: { instant: utc('2026-11-01T05:30:00Z'), offsetMinutes: -240 },
      later: { instant: utc('2026-11-01T06:30:00Z'), offsetMinutes: -300 },
    })
    expect(resolveLocalTime('2026-11-01', '01:00', ZONE).kind).toBe('repeated')
    expect(resolveLocalTime('2026-11-01', '00:59', ZONE).kind).toBe('unique')
    expect(resolveLocalTime('2026-11-01', '02:00', ZONE)).toEqual({
      kind: 'unique',
      at: { instant: utc('2026-11-01T07:00:00Z'), offsetMinutes: -300 },
    })
  })

  it('[T41] the rules hold for a zone with a 30-minute change and one in the southern hemisphere', () => {
    // Lord Howe Island moves 30 minutes: 02:00 -> 02:30 on 2026-10-04, 02:00 -> 01:30 on 2026-04-05.
    expect(resolveLocalTime('2026-10-04', '02:15', 'Australia/Lord_Howe')).toMatchObject({
      kind: 'gap',
      skippedFrom: '02:00',
      resumesAt: '02:30',
    })
    expect(resolveLocalTime('2026-04-05', '01:45', 'Australia/Lord_Howe')).toEqual({
      kind: 'repeated',
      earlier: { instant: utc('2026-04-04T14:45:00Z'), offsetMinutes: 660 },
      later: { instant: utc('2026-04-04T15:15:00Z'), offsetMinutes: 630 },
    })
  })

  it('[T41] a window starting in the gap is refused, never moved', () => {
    expect(resolveWindow({ date: '2026-03-08', start: '02:30', end: '04:00', zone: ZONE })).toEqual({
      ok: false,
      problems: [{ code: 'LOCAL_TIME_GAP', field: 'start', skippedFrom: '02:00', resumesAt: '03:00' }],
    })
    expect(resolveWindow({ date: '2026-03-08', start: '01:00', end: '02:15', zone: ZONE })).toEqual({
      ok: false,
      problems: [{ code: 'LOCAL_TIME_GAP', field: 'end', skippedFrom: '02:00', resumesAt: '03:00' }],
    })
  })

  it('[T41] a window in the repeated hour needs its offset and is stored with it', () => {
    expect(resolveWindow({ date: '2026-11-01', start: '01:30', end: '03:00', zone: ZONE })).toEqual({
      ok: false,
      problems: [{ code: 'LOCAL_TIME_REPEATED', field: 'start', offsets: [-240, -300] }],
    })
    const later = resolveWindow({
      date: '2026-11-01',
      start: '01:30',
      end: '03:00',
      zone: ZONE,
      startOffsetMinutes: -300,
    })
    expect(later).toEqual({
      ok: true,
      window: {
        date: '2026-11-01',
        start: '01:30',
        end: '03:00',
        zone: ZONE,
        startsAt: utc('2026-11-01T06:30:00Z'),
        endsAt: utc('2026-11-01T08:00:00Z'),
        startOffsetMinutes: -300,
        endOffsetMinutes: -300,
      },
    })
    const earlier = resolveWindow({
      date: '2026-11-01',
      start: '01:30',
      end: '03:00',
      zone: ZONE,
      startOffsetMinutes: -240,
    })
    expect(earlier.ok && earlier.window.startsAt).toEqual(utc('2026-11-01T05:30:00Z'))
    // An offset the time does not have is refused, with the two it does have.
    expect(
      resolveWindow({ date: '2026-11-01', start: '01:30', end: '03:00', zone: ZONE, startOffsetMinutes: -360 }),
    ).toEqual({ ok: false, problems: [{ code: 'OFFSET_INVALID', field: 'start', offsets: [-240, -300] }] })
    // Outside a repeated hour an offset must match the only reading.
    expect(
      resolveWindow({ date: '2026-07-15', start: '09:00', end: '11:00', zone: ZONE, startOffsetMinutes: -300 }),
    ).toEqual({ ok: false, problems: [{ code: 'OFFSET_INVALID', field: 'start', offsets: [-240] }] })
  })

  it('[T41] a later wall time that is the earlier instant is refused (1:45 EDT is before 1:30 EST)', () => {
    expect(
      resolveWindow({
        date: '2026-11-01',
        start: '01:30',
        end: '01:45',
        zone: ZONE,
        startOffsetMinutes: -300,
        endOffsetMinutes: -240,
      }),
    ).toEqual({ ok: false, problems: [{ code: 'WINDOW_ORDER' }] })
    expect(resolveWindow({ date: '2026-07-15', start: '11:00', end: '09:00', zone: ZONE })).toMatchObject({
      ok: false,
      problems: [{ code: 'WINDOW_ORDER' }],
    })
  })

  it('[T41] moving a window across a DST change keeps its local times; the instants follow the zone', () => {
    const before = resolveWindow({ date: '2026-10-31', start: '09:00', end: '11:00', zone: ZONE })
    const after = resolveWindow({ date: '2026-11-02', start: '09:00', end: '11:00', zone: ZONE })
    expect(before.ok && [before.window.start, before.window.end, before.window.startsAt]).toEqual([
      '09:00',
      '11:00',
      utc('2026-10-31T13:00:00Z'),
    ])
    expect(after.ok && [after.window.start, after.window.end, after.window.startsAt]).toEqual([
      '09:00',
      '11:00',
      utc('2026-11-02T14:00:00Z'),
    ])
    const spring = resolveWindow({ date: '2026-03-09', start: '09:00', end: '11:00', zone: ZONE })
    expect(spring.ok && spring.window.startsAt).toEqual(utc('2026-03-09T13:00:00Z'))
  })

  it('[T41] the window is read with its zone: short names at each end and the zone id', () => {
    const w = resolveWindow({ date: '2026-11-01', start: '01:30', end: '03:00', zone: ZONE, startOffsetMinutes: -240 })
    if (!w.ok) throw new Error('expected a window')
    expect(windowText(w.window, 'en-US')).toBe(
      'Sunday, November 1, 2026, 1:30 AM EDT – 3:00 AM EST (America/Kentucky/Louisville)',
    )
    expect(windowText(w.window, 'es-US')).toBe(
      'domingo, 1 de noviembre de 2026, 1:30 a.m. EDT – 3:00 a.m. EST (America/Kentucky/Louisville)',
    )
  })

  it('[HH-DATA-06] visit hours are read in the business zone, on any day of the year', () => {
    const at = (date: string, start: string, end: string) => {
      const r = resolveWindow({ date, start, end, zone: ZONE })
      if (!r.ok) throw new Error('expected a window')
      return windowWithinHours(r.window, HOURS, ZONE)
    }
    expect(at('2026-07-15', '08:00', '10:00')).toBe(true)
    expect(at('2026-12-15', '20:00', '22:00')).toBe(true)
    expect(at('2026-11-01', '08:00', '22:00')).toBe(true)
    expect(at('2026-03-08', '07:30', '09:00')).toBe(false)
    expect(at('2026-07-15', '21:00', '22:30')).toBe(false)
  })
})

describe('[HH-SCH-02] nothing depends on the machine time zone', () => {
  const original = process.env['TZ']
  afterEach(() => {
    if (original === undefined) delete process.env['TZ']
    else process.env['TZ'] = original
  })

  it('[HH-SCH-02][T41] the same conversions with the process zone set far away', () => {
    const expected = [
      resolveLocalTime('2026-03-08', '02:30', ZONE),
      resolveLocalTime('2026-11-01', '01:30', ZONE),
      resolveLocalTime('2026-07-15', '09:00', ZONE),
      tomorrowIn(utc('2026-11-01T04:00:00Z'), ZONE),
    ]
    for (const tz of ['Pacific/Kiritimati', 'Asia/Kolkata', 'America/Los_Angeles', 'UTC']) {
      process.env['TZ'] = tz
      expect([
        resolveLocalTime('2026-03-08', '02:30', ZONE),
        resolveLocalTime('2026-11-01', '01:30', ZONE),
        resolveLocalTime('2026-07-15', '09:00', ZONE),
        tomorrowIn(utc('2026-11-01T04:00:00Z'), ZONE),
      ]).toEqual(expected)
    }
  })
})
