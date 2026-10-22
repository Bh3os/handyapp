// The time-zone policy (TSK-0123; OWN-DEC-159, HH-SCH-02, HH-DATA-06, HH-COM-15, T41). Eastern and Central zones,
// the daylight-saving changes of both (US 2026: spring forward on 2026-03-08 at 02:00 local, fall back on 2026-11-01 at
// 02:00 local, in each zone at its own local time), zone derivation from counties, recipient zones and elapsed-hour
// holds. Counties, ZIP rules and county lists here are synthetic test inputs, never statements about which real
// county uses which zone.
import { describe, expect, it } from 'vitest'
import { offsetMinutesAt, resolveLocalTime, resolveWindow, windowText } from '../src/local-time.js'
import {
  afterElapsedHours,
  countyRef,
  customerDisplayZone,
  deriveZone,
  isSupportedZone,
  knownPropertyZone,
  recipientZone,
  textHours,
  verificationProblems,
  ZONE_CHOICES,
  zoneFamily,
} from '../src/zones.js'

const EASTERN = 'America/Kentucky/Louisville'
const CENTRAL = 'America/Chicago'
const AT = new Date('2026-06-01T12:00:00Z')
const utc = (iso: string) => new Date(iso)

describe('[OWN-DEC-159] zone families come from the time-zone data, never from offsets typed in', () => {
  it('[OWN-DEC-159] Eastern and Central zones are recognised by their standard and daylight offsets', () => {
    expect(zoneFamily(EASTERN, AT)).toBe('eastern')
    expect(zoneFamily('America/Indiana/Indianapolis', AT)).toBe('eastern')
    expect(zoneFamily('America/New_York', AT)).toBe('eastern')
    expect(zoneFamily(CENTRAL, AT)).toBe('central')
    expect(zoneFamily('America/Indiana/Tell_City', AT)).toBe('central')
  })

  it('[OWN-DEC-159] fixed offsets, abbreviations, zones without daylight saving and others are not supported', () => {
    for (const z of ['-05:00', 'EST', 'CST', 'UTC', 'America/Phoenix', 'America/Denver', 'Europe/London', '', null])
      expect(isSupportedZone(z, AT), String(z)).toBe(false)
  })

  it('[OWN-DEC-159] every zone the staff screens offer is Eastern or Central', () => {
    for (const z of ZONE_CHOICES) expect(isSupportedZone(z, AT), z).toBe(true)
    expect(ZONE_CHOICES[0]).toBe(EASTERN)
  })
})

describe('[HH-SCH-02][T41] Central properties across both daylight-saving changes', () => {
  it('[T41] a Central spring-forward gap is refused and the Eastern one is an hour earlier on the UTC line', () => {
    const central = resolveLocalTime('2026-03-08', '02:30', CENTRAL)
    expect(central).toMatchObject({ kind: 'gap', skippedFrom: '02:00', resumesAt: '03:00' })
    const window = resolveWindow({ date: '2026-03-08', start: '02:30', end: '04:00', zone: CENTRAL })
    expect(window.ok).toBe(false)
    if (!window.ok)
      expect(window.problems).toContainEqual({
        code: 'LOCAL_TIME_GAP',
        field: 'start',
        skippedFrom: '02:00',
        resumesAt: '03:00',
      })
    // The same wall time is fine in Eastern on the day after, and 9:00 CDT is 14:00 UTC.
    expect(resolveLocalTime('2026-03-09', '09:00', CENTRAL)).toEqual({
      kind: 'unique',
      at: { instant: utc('2026-03-09T14:00:00Z'), offsetMinutes: -300 },
    })
  })

  it('[T41] a Central repeated hour has two readings, each stored with its offset', () => {
    const r = resolveLocalTime('2026-11-01', '01:30', CENTRAL)
    expect(r).toEqual({
      kind: 'repeated',
      earlier: { instant: utc('2026-11-01T06:30:00Z'), offsetMinutes: -300 },
      later: { instant: utc('2026-11-01T07:30:00Z'), offsetMinutes: -360 },
    })
    const unchosen = resolveWindow({ date: '2026-11-01', start: '01:30', end: '03:00', zone: CENTRAL })
    expect(unchosen.ok).toBe(false)
    const chosen = resolveWindow({
      date: '2026-11-01',
      start: '01:30',
      end: '03:00',
      zone: CENTRAL,
      startOffsetMinutes: -360,
    })
    expect(chosen.ok && chosen.window.startsAt.toISOString()).toBe('2026-11-01T07:30:00.000Z')
    expect(chosen.ok && chosen.window.startOffsetMinutes).toBe(-360)
  })

  it('[HH-SCH-02] a window moved across the change keeps its local times in each zone; the instants follow', () => {
    for (const [zone, summer, winter] of [
      [EASTERN, '2026-10-30T13:00:00.000Z', '2026-11-02T14:00:00.000Z'],
      [CENTRAL, '2026-10-30T14:00:00.000Z', '2026-11-02T15:00:00.000Z'],
    ] as const) {
      const before = resolveWindow({ date: '2026-10-30', start: '09:00', end: '11:00', zone })
      const after = resolveWindow({ date: '2026-11-02', start: '09:00', end: '11:00', zone })
      expect(before.ok && before.window.startsAt.toISOString()).toBe(summer)
      expect(after.ok && after.window.startsAt.toISOString()).toBe(winter)
    }
  })

  it('[OWN-DEC-159] a window is read in its own zone with the zone named: CDT and CST', () => {
    const summer = resolveWindow({ date: '2026-10-30', start: '09:00', end: '11:00', zone: CENTRAL })
    const winter = resolveWindow({ date: '2026-11-02', start: '09:00', end: '11:00', zone: CENTRAL })
    if (!summer.ok || !winter.ok) throw new Error('windows resolve')
    expect(windowText(summer.window, 'en-US')).toContain('9:00 AM CDT – 11:00 AM CDT (America/Chicago)')
    expect(windowText(winter.window, 'en-US')).toContain('9:00 AM CST – 11:00 AM CST (America/Chicago)')
  })
})

describe('[OWN-DEC-159] a property zone is derived only when every county agrees, otherwise unknown', () => {
  const map = [
    { state: 'KY', county: 'Synthetic East', zone: EASTERN },
    { state: 'KY', county: 'Synthetic Other East', zone: 'America/Indiana/Indianapolis' },
    { state: 'IN', county: 'Synthetic West', zone: CENTRAL },
  ]
  it('[OWN-DEC-159] one mapped county derives its zone', () => {
    expect(deriveZone({ disposition: 'in_coverage', counties: ['KY:Synthetic East'] }, map)).toEqual({
      status: 'derived',
      zone: EASTERN,
      basis: 'zip_counties',
      counties: ['KY:Synthetic East'],
    })
    expect(deriveZone({ disposition: 'in_coverage', counties: ['IN:Synthetic West'] }, map).zone).toBe(CENTRAL)
  })

  it('[OWN-DEC-159] nothing is assumed: no rule, no list, an unlisted county, disagreement, boundary or outside', () => {
    const basis = (rule: Parameters<typeof deriveZone>[0], m: Parameters<typeof deriveZone>[1] = map) =>
      deriveZone(rule, m)
    expect(basis(null)).toMatchObject({ status: 'unknown', zone: null, basis: 'no_zip_rule' })
    expect(basis({ disposition: 'in_coverage', counties: ['KY:Synthetic East'] }, null).basis).toBe(
      'county_map_not_configured',
    )
    expect(basis({ disposition: 'in_coverage', counties: ['KY:Unlisted'] }).basis).toBe('county_not_mapped')
    expect(basis({ disposition: 'in_coverage', counties: ['KY:Synthetic East', 'IN:Synthetic West'] }).basis).toBe(
      'counties_disagree',
    )
    // Two Eastern ids still disagree: the zone id is kept exactly, never merged.
    expect(
      basis({ disposition: 'in_coverage', counties: ['KY:Synthetic East', 'KY:Synthetic Other East'] }).basis,
    ).toBe('counties_disagree')
    expect(basis({ disposition: 'boundary', counties: ['KY:Synthetic East'] }).basis).toBe('zip_boundary')
    expect(basis({ disposition: 'out_of_coverage', counties: [] }).basis).toBe('zip_outside_area')
  })

  it('[OWN-DEC-159] a staff verification needs a supported zone, a county, and agreement with the list', () => {
    expect(verificationProblems({ zone: CENTRAL, state: 'IN', county: 'Synthetic West' }, map, AT)).toEqual([])
    expect(verificationProblems({ zone: CENTRAL, state: 'IN', county: 'Not Listed' }, null, AT)).toEqual([])
    expect(verificationProblems({ zone: 'America/Phoenix', state: 'IN', county: '' }, map, AT)).toEqual([
      'ZONE_NOT_SUPPORTED',
      'COUNTY_REQUIRED',
    ])
    expect(verificationProblems({ zone: EASTERN, state: 'in', county: ' Synthetic West ' }, map, AT)).toEqual([
      'ZONE_COUNTY_MISMATCH',
    ])
    expect(countyRef(' in ', ' Synthetic West ')).toBe('IN:Synthetic West')
  })

  it('[OWN-DEC-159] only a derived or verified zone schedules; the customer is told when business time is shown', () => {
    expect(knownPropertyZone({ zone: null, status: 'unknown' })).toBeNull()
    expect(knownPropertyZone({ zone: CENTRAL, status: 'verified' })).toBe(CENTRAL)
    expect(knownPropertyZone({ zone: CENTRAL, status: 'unknown' })).toBeNull()
    expect(customerDisplayZone(CENTRAL, EASTERN)).toEqual({ zone: CENTRAL, business: false })
    expect(customerDisplayZone(null, EASTERN)).toEqual({ zone: EASTERN, business: true })
  })
})

describe('[HH-COM-15] the recipient zone is the contact’s own, or unknown', () => {
  it('[HH-COM-15][OWN-DEC-159] never the property or business zone; unknown uses the 9 AM–9 PM Eastern fallback', () => {
    expect(recipientZone(null)).toEqual({ state: 'unknown' })
    expect(recipientZone('America/Phoenix')).toEqual({ state: 'unknown' })
    expect(recipientZone(CENTRAL, AT)).toEqual({ state: 'known', zone: CENTRAL, family: 'central' })
    const permitted = { open: '08:00', close: '22:00' }
    const fallback = { open: '09:00', close: '21:00', zone: EASTERN }
    expect(textHours(recipientZone(CENTRAL, AT), permitted, fallback)).toEqual({
      ...permitted,
      zone: CENTRAL,
      basis: 'recipient_zone',
    })
    expect(textHours({ state: 'unknown' }, permitted, fallback)).toEqual({
      ...fallback,
      basis: 'unknown_zone_fallback',
    })
  })
})

describe('[OWN-DEC-159] 24-hour holds and reminder delays are elapsed hours in both zones', () => {
  it('[OWN-DEC-159] a 24-hour hold across fall-back ends 24 real hours later, one local hour earlier', () => {
    for (const zone of [EASTERN, CENTRAL]) {
      // 10:00 local on Saturday 2026-10-31 (daylight time), held for 24 hours.
      const start = resolveLocalTime('2026-10-31', '10:00', zone)
      if (start.kind !== 'unique') throw new Error('unique')
      const end = afterElapsedHours(start.at.instant, 24)
      expect(end.getTime() - start.at.instant.getTime()).toBe(24 * 3_600_000)
      expect(offsetMinutesAt(end, zone)).toBe(offsetMinutesAt(start.at.instant, zone) - 60)
      expect(new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', hourCycle: 'h23' }).format(end)).toBe(
        '09',
      )
    }
  })

  it('[OWN-DEC-159] a reminder 24 hours before a visit after spring-forward is 24 real hours before it', () => {
    for (const zone of [EASTERN, CENTRAL]) {
      const visit = resolveLocalTime('2026-03-08', '10:00', zone)
      if (visit.kind !== 'unique') throw new Error('unique')
      const reminder = afterElapsedHours(visit.at.instant, -24)
      expect(visit.at.instant.getTime() - reminder.getTime()).toBe(24 * 3_600_000)
      // The day before at 09:00 local: the clocks moved forward in between.
      expect(
        new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', hourCycle: 'h23' }).format(reminder),
      ).toBe('09')
    }
  })
})
