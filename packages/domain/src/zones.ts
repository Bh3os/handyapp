// The time-zone policy (TSK-0123; OWN-DEC-159, FACT-TIMEZONE, HH-SCH-02, HH-DATA-06, HH-COM-15, ENT-Property, T41).
// - Business time is the configured business zone (business.timezone: America/Kentucky/Louisville, decided by
//   OWN-DEC-159): business hours, the response goal, reporting and estimate validity are counted in it.
// - Appointment time is the service property's own zone, Eastern or Central, from its verified location. A property's
//   zone is one of three states: unknown (flagged for verification, never assumed Eastern), derived (every county its
//   ZIP lies in maps to the same zone in the configured county list) or verified (staff recorded it from the county of
//   the verified address). Only a derived or verified zone schedules anything.
// - Texts use the recipient's own zone; the property's zone is never assumed to be the recipient's, and an unknown
//   recipient zone stays unknown (the SMS window for that case belongs to TSK-0122).
// - Zone ids, never fixed offsets: whether a zone is Eastern or Central is read from the runtime's IANA time-zone data
//   (its standard and daylight offsets in a given year), so EST/EDT and CST/CDT follow the zone automatically.
// Pure and browser-safe: the staff app uses the same rules to label zones.
import { isTimeZone, offsetMinutesAt } from './local-time.js'

/** The US zone families the business supports (OWN-DEC-159: Eastern and Central). */
export const ZONE_FAMILIES = ['eastern', 'central'] as const
export type ZoneFamily = (typeof ZONE_FAMILIES)[number]

/** Standard (January) and daylight (July) offsets of each family, in minutes east of UTC. */
const FAMILY_OFFSETS: Readonly<Record<ZoneFamily, readonly [number, number]>> = {
  eastern: [-300, -240],
  central: [-360, -300],
}

/**
 * The family of an IANA zone in the year of `at`: Eastern when its January and July offsets are those of US Eastern
 * time with daylight saving (EST -05:00, EDT -04:00), Central for CST -06:00 and CDT -05:00; anything else (a zone
 * without daylight saving, another zone, an offset like "-05:00", an abbreviation like "EST") is null.
 */
export function zoneFamily(zone: unknown, at: Date = new Date()): ZoneFamily | null {
  if (!isTimeZone(zone)) return null
  const year = at.getUTCFullYear()
  const winter = offsetMinutesAt(new Date(Date.UTC(year, 0, 15, 12)), zone)
  const summer = offsetMinutesAt(new Date(Date.UTC(year, 6, 15, 12)), zone)
  for (const family of ZONE_FAMILIES) {
    const [standard, daylight] = FAMILY_OFFSETS[family]
    if (winter === standard && summer === daylight) return family
  }
  return null
}

/** Whether a zone id is one appointments may use: a real IANA zone of a supported family. */
export const isSupportedZone = (zone: unknown, at?: Date): zone is string => zoneFamily(zone, at) !== null

/** The states of a property's zone (ENT-Property). Only derived and verified zones schedule visits. */
export const PROPERTY_ZONE_STATUSES = ['unknown', 'derived', 'verified'] as const
export type PropertyZoneStatus = (typeof PROPERTY_ZONE_STATUSES)[number]

/**
 * What a property's zone rests on, recorded with every zone state:
 * - zip_counties: derived, every county the ZIP lies in maps to this zone (geo.county_time_zones);
 * - verified_county: verified by staff from the county of the verified address;
 * - no_zip_rule: unknown, no active coverage rule names the ZIP's counties;
 * - zip_outside_area: unknown, the ZIP lies outside the service area's counties;
 * - zip_boundary: unknown, the ZIP also reaches counties outside the area, whose zones are not listed;
 * - county_map_not_configured: unknown, geo.county_time_zones is NOT CONFIGURED;
 * - county_not_mapped: unknown, one of the ZIP's counties has no zone in the list;
 * - counties_disagree: unknown, the ZIP's counties have different zones;
 * - assumption_withdrawn: unknown, the zone the property had was the withdrawn assumption that every served property
 *   is Eastern (migration 0066; FACT-TIMEZONE).
 */
export const PROPERTY_ZONE_BASES = [
  'zip_counties',
  'verified_county',
  'no_zip_rule',
  'zip_outside_area',
  'zip_boundary',
  'county_map_not_configured',
  'county_not_mapped',
  'counties_disagree',
  'assumption_withdrawn',
] as const
export type PropertyZoneBasis = (typeof PROPERTY_ZONE_BASES)[number]

/** One county's zone in the configured list (geo.county_time_zones): 'KY' 'Jefferson' 'America/Kentucky/Louisville'. */
export type CountyZone = { readonly state: string; readonly county: string; readonly zone: string }

/** A county as coverage rules record it: 'KY:Jefferson'. */
export const countyRef = (state: string, county: string) => `${state.trim().toUpperCase()}:${county.trim()}`

export type ZoneDerivation =
  | { readonly status: 'derived'; readonly zone: string; readonly basis: 'zip_counties'; readonly counties: string[] }
  | {
      readonly status: 'unknown'
      readonly zone: null
      readonly basis: Exclude<PropertyZoneBasis, 'zip_counties' | 'verified_county' | 'assumption_withdrawn'>
      readonly counties: string[]
    }

/**
 * A property's zone from its ZIP's coverage rule and the configured county list, or unknown with the reason. Only a ZIP
 * wholly inside the area (every county it reaches is listed on the rule) can derive a zone, and only when every one of
 * those counties maps to the same zone id; anything less stays unknown and is flagged for verification. Nothing is
 * guessed: no county, no list, no zone.
 */
export function deriveZone(
  rule: {
    readonly disposition: 'in_coverage' | 'boundary' | 'out_of_coverage'
    readonly counties: readonly string[]
  } | null,
  map: readonly CountyZone[] | null,
): ZoneDerivation {
  const counties = [...(rule?.counties ?? [])].sort()
  const unknown = (basis: Extract<ZoneDerivation, { status: 'unknown' }>['basis']): ZoneDerivation => ({
    status: 'unknown',
    zone: null,
    basis,
    counties,
  })
  if (!rule || counties.length === 0)
    return unknown(rule?.disposition === 'out_of_coverage' ? 'zip_outside_area' : 'no_zip_rule')
  if (rule.disposition === 'out_of_coverage') return unknown('zip_outside_area')
  if (rule.disposition === 'boundary') return unknown('zip_boundary')
  if (!map) return unknown('county_map_not_configured')
  const zones = new Map(map.map((c) => [countyRef(c.state, c.county), c.zone]))
  const found = counties.map((c) => zones.get(c))
  if (found.some((z) => z === undefined || !isSupportedZone(z))) return unknown('county_not_mapped')
  const distinct = new Set(found)
  if (distinct.size !== 1) return unknown('counties_disagree')
  return { status: 'derived', zone: found[0] as string, basis: 'zip_counties', counties }
}

export type ZoneVerificationProblem =
  /** Not an IANA zone of a supported family (Eastern or Central). */
  | 'ZONE_NOT_SUPPORTED'
  /** The county list names this county with another zone. */
  | 'ZONE_COUNTY_MISMATCH'
  | 'COUNTY_REQUIRED'

/**
 * Checks a staff verification of a property's zone: a supported zone, the county it was read from, and agreement with
 * the configured county list when that list names the county. Every problem at once.
 */
export function verificationProblems(
  input: { readonly zone: string; readonly state: string; readonly county: string },
  map: readonly CountyZone[] | null,
  at?: Date,
): ZoneVerificationProblem[] {
  const out: ZoneVerificationProblem[] = []
  if (!isSupportedZone(input.zone, at)) out.push('ZONE_NOT_SUPPORTED')
  if (input.county.trim() === '') out.push('COUNTY_REQUIRED')
  else {
    const listed = map?.find((c) => countyRef(c.state, c.county) === countyRef(input.state, input.county))
    if (listed && listed.zone !== input.zone) out.push('ZONE_COUNTY_MISMATCH')
  }
  return out
}

/** Whether a property's zone schedules visits and appointment messages: a derived or verified supported zone. */
export function knownPropertyZone(p: { readonly zone: string | null; readonly status: string }): string | null {
  return p.status !== 'unknown' && isSupportedZone(p.zone) ? p.zone : null
}

/**
 * A text recipient's zone (OWN-DEC-159 item 5, HH-COM-15): the zone recorded for that contact, or unknown. Never the
 * property's zone and never the business zone: an unknown zone is flagged for verification, not assumed.
 */
export type RecipientZone =
  { readonly state: 'known'; readonly zone: string; readonly family: ZoneFamily } | { readonly state: 'unknown' }

export function recipientZone(contactZone: string | null | undefined, at?: Date): RecipientZone {
  const family = zoneFamily(contactZone, at)
  return family && contactZone ? { state: 'known', zone: contactZone, family } : { state: 'unknown' }
}

/**
 * The zone a customer-facing date is shown in (OWN-DEC-159 items 4 and 12): the property's known zone, otherwise the
 * business zone, said so (`business: true`) so the screen names it as business time instead of passing it off as the
 * customer's own.
 */
export function customerDisplayZone(
  propertyZone: string | null,
  businessZone: string,
): { readonly zone: string; readonly business: boolean } {
  return isSupportedZone(propertyZone)
    ? { zone: propertyZone, business: false }
    : { zone: businessZone, business: true }
}

const HOUR_MS = 3_600_000

/**
 * An instant a number of elapsed hours after another (OWN-DEC-159 item 10): 24-hour holds, reminder delays and
 * "N hours before" are elapsed time on the UTC timeline, so a daylight-saving change never lengthens or shortens them
 * (a 24-hour hold placed before a fall-back ends 24 real hours later, at a local clock time one hour earlier).
 */
export function afterElapsedHours(instant: Date, hours: number): Date {
  return new Date(instant.getTime() + hours * HOUR_MS)
}

/** Daily hours in one zone: "08:00" to "22:00" in America/Chicago. */
export type ZonedHours = { readonly open: string; readonly close: string; readonly zone: string }

/**
 * The hours a non-urgent text may be sent in for a recipient (HH-COM-15; final owner amendments 2026-10-22, reading
 * 8): the permitted daily hours (contact.hours) in the recipient's own verified zone; when that zone cannot be
 * established, the configured fallback window (sms.unknown_zone_hours: 9 AM–9 PM Eastern), never the property's zone
 * and never 10 PM Eastern for everyone. Account security codes and other urgent messages are never held by these hours
 * (the caller does not ask). Applying the window to deliveries belongs to TSK-0122; this only says which window.
 */
export function textHours(
  recipient: RecipientZone,
  permitted: { readonly open: string; readonly close: string },
  unknownFallback: ZonedHours,
): (ZonedHours & { readonly basis: 'recipient_zone' }) | (ZonedHours & { readonly basis: 'unknown_zone_fallback' }) {
  return recipient.state === 'known'
    ? { open: permitted.open, close: permitted.close, zone: recipient.zone, basis: 'recipient_zone' }
    : { ...unknownFallback, basis: 'unknown_zone_fallback' }
}

/**
 * PROPOSED: the IANA zones the staff screens offer when a zone is recorded (the business zone first). Each is Eastern
 * or Central by the time-zone data (a unit test checks it); the server accepts any zone of those families. A list of
 * ids, never a statement about which county uses which.
 */
export const ZONE_CHOICES = [
  'America/Kentucky/Louisville',
  'America/Indiana/Indianapolis',
  'America/New_York',
  'America/Chicago',
  'America/Indiana/Tell_City',
] as const
