// Visit-day data access for the workers assigned to a visit (TSK-0128; HH-PKT-08, HH-CRM-03, HH-OFF-02, HH-DATA-08,
// T28, T49, ENT-Visit, ENT-Reservation, ENT-AccessInstructionSecret, OWN-DEC-171, OWN-DEC-159, RULE-SERVER-AUTHZ).
// - The visit day is the visit's own local date in the visit's zone (the property's Eastern or Central zone,
//   OWN-DEC-159), from local midnight to the next local midnight: calendar dates and the zone's rules, never 24-hour
//   arithmetic, so a daylight-saving day lasts 23 or 25 hours.
// - On the visit day a worker assigned to the visit (an active confirmed reservation on a live visit) sees the
//   customer's first name, the verified address, the site contact and may reveal access codes (online, audited).
//   Before it they see the job type, date, window, tools, materials, SOPs, hazards and the general service area only;
//   after it nothing of the visit-day data. The server decides with these functions (and the same SQL bounds) on
//   every request: hidden fields are never the control.
// - An Owner extension (OWN-DEC-171) opens the same access for one assigned worker from when it is granted until its
//   expiry, with a recorded reason. It ends at its expiry, when the Owner ends it, or at once with the assignment (a
//   reassignment, a reschedule, which makes a new reservation, a cancellation or a disabled account): an extension
//   never outlives the assignment it was granted on and never bypasses any other control.
// - PROPOSED (OQ-WORKER-ACCESS-DETAILS): an extension lasts at most 24 hours from when it is granted; the general
//   service area is the city and state; the customer's first name is the first word of the primary contact's name.
import { addLocalDays, resolveLocalTime, type LocalDate } from './local-time.js'

/** PROPOSED (OQ-WORKER-ACCESS-DETAILS): an Owner extension lasts at most 24 hours from when it is granted. */
export const ACCESS_EXTENSION_MAX_HOURS = 24
/** PROPOSED: the Owner's reason for an extension, or for ending one early, is at most 500 characters. */
export const ACCESS_EXTENSION_REASON_MAX = 500

/** Where one service day starts and ends, as instants. */
export type ServiceDay = { readonly startsAt: Date; readonly endsAt: Date }

/**
 * The first instant of a local date in a zone: its midnight. A midnight the clocks repeat starts the day at its first
 * reading; one they skip starts it when the clocks resume (no US zone changes at midnight; the rule keeps any zone
 * sound). Null for an unknown zone or a date that cannot be read.
 */
export function localDayStart(date: LocalDate, zone: string): Date | null {
  try {
    const m = resolveLocalTime(date, '00:00', zone)
    if (m.kind === 'unique') return m.at.instant
    if (m.kind === 'repeated') return m.earlier.instant
    const resumed = resolveLocalTime(date, m.resumesAt, zone)
    return resumed.kind === 'unique' ? resumed.at.instant : null
  } catch {
    return null
  }
}

/** The visit's service day in its own zone: local midnight to the next local midnight; null when it cannot be read. */
export function serviceDayOf(date: LocalDate, zone: string): ServiceDay | null {
  const startsAt = localDayStart(date, zone)
  let next: string
  try {
    next = addLocalDays(date, 1)
  } catch {
    return null
  }
  const endsAt = localDayStart(next, zone)
  return startsAt && endsAt ? { startsAt, endsAt } : null
}

/** One Owner extension of a worker's visit-day access: from its grant to its expiry, unless ended earlier. */
export type AccessExtension = {
  readonly startsAt: Date
  readonly expiresAt: Date
  readonly endedAt: Date | null
}

export type VisitAccessFacts = {
  readonly localDate: LocalDate
  readonly timeZone: string
  /** The worker holds an active confirmed reservation on the visit and the visit is live (confirmed, on the way, arrived). */
  readonly assigned: boolean
  /** The worker's extensions on that reservation (ended and expired ones included; they simply do not count). */
  readonly extensions: readonly AccessExtension[]
  readonly now: Date
}

export type VisitAccessClosed = 'not_assigned' | 'before_visit_day' | 'after_visit_day' | 'unknown_zone'

export type VisitAccess =
  | {
      readonly open: true
      /** Why it is open now: the visit day itself, or an Owner extension outside it. */
      readonly basis: 'visit_day' | 'extension'
      /** When the access ends unless the assignment ends first: the later of the day's end and the extension's. */
      readonly endsAt: Date
    }
  | {
      readonly open: false
      readonly reason: VisitAccessClosed
      /** When the visit day opens, while it is still ahead; null otherwise. */
      readonly opensAt: Date | null
    }

/** Whether an extension is in force at `now`. */
export function extensionActive(e: AccessExtension, now: Date): boolean {
  const t = now.getTime()
  return e.startsAt.getTime() <= t && t < e.expiresAt.getTime() && (e.endedAt === null || e.endedAt.getTime() > t)
}

/** The visit-day access of one assigned worker on one visit at `now` (see the header). */
export function visitAccess(f: VisitAccessFacts): VisitAccess {
  if (!f.assigned) return { open: false, reason: 'not_assigned', opensAt: null }
  const day = serviceDayOf(f.localDate, f.timeZone)
  if (!day) return { open: false, reason: 'unknown_zone', opensAt: null }
  const t = f.now.getTime()
  const inDay = day.startsAt.getTime() <= t && t < day.endsAt.getTime()
  const extendedUntil = f.extensions
    .filter((e) => extensionActive(e, f.now))
    .reduce<number | null>((max, e) => Math.max(max ?? 0, e.expiresAt.getTime()), null)
  if (inDay) {
    const end = Math.max(day.endsAt.getTime(), extendedUntil ?? 0)
    return { open: true, basis: 'visit_day', endsAt: new Date(end) }
  }
  if (extendedUntil !== null) return { open: true, basis: 'extension', endsAt: new Date(extendedUntil) }
  return t < day.startsAt.getTime()
    ? { open: false, reason: 'before_visit_day', opensAt: day.startsAt }
    : { open: false, reason: 'after_visit_day', opensAt: null }
}

export type ExtensionProblem = 'EXPIRY_IN_PAST' | 'EXPIRY_TOO_FAR'

/** Why an Owner's extension expiry is refused: it must lie ahead, at most ACCESS_EXTENSION_MAX_HOURS from now. */
export function extensionProblem(expiresAt: Date, now: Date): ExtensionProblem | null {
  if (expiresAt.getTime() <= now.getTime()) return 'EXPIRY_IN_PAST'
  if (expiresAt.getTime() - now.getTime() > ACCESS_EXTENSION_MAX_HOURS * 3_600_000) return 'EXPIRY_TOO_FAR'
  return null
}

/** The general service area a worker sees before the visit day (PROPOSED: the city and state, never street or ZIP). */
export function serviceArea(address: { readonly city: string; readonly state: string }): {
  city: string
  state: string
} {
  return { city: address.city, state: address.state }
}
