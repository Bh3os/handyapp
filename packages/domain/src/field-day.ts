// The worker's day on site: On my way, Arrived and Finished (TSK-0070; HH-OFF-09, HH-SCH-08, HH-PORT-07, HH-WORK-06,
// T47, ENT-Visit, ENT-TimeStamp, OWN-DEC-107, OWN-DEC-69, OWN-DEC-121, OWN-DEC-149, RULE-SAFETY-GATES,
// RULE-NO-INVENTED-FACTS, RULE-HUMAN-REVIEW).
//
// - "On my way" is the assigned worker's own tap when actually departing for that visit (OWN-DEC-107). It is allowed
//   from the configured minutes before the arrival window starts (visit.on_my_way, three hours); time alone never
//   triggers it. The first accepted tap moves the visit confirmed -> en_route and is the one that sends the customer's
//   on-the-way notice; a later tap of another assigned worker records that worker's own departure only.
// - "Arrived" and "Finished" are one timestamp each per assigned worker (OWN-DEC-69). The first Arrived moves the visit
//   en_route -> arrived; Arrived never starts work and never passes the Start Work gate (that check stays the start
//   route's, online, RULE-SAFETY-GATES). There are no interval check-ins between them (OWN-DEC-149).
// - PROPOSED (OQ-MY-DAY-DETAILS): Arrived needs the visit on the way (someone tapped On my way), so the customer never
//   sees an arrival that skipped the recorded departure; Finished needs the worker's own Arrived; the visit is
//   completed when every worker assigned to it has a Finished value (recorded, or supplied by the Owner's correction).
// - A missing timestamp is flagged, never invented: no duration exists without both values. Corrections keep the
//   original value and the reason (the Owner's, HH-WORK-06). Nothing here computes pay, overtime or deductions:
//   payroll stays outside the software (RULE-HUMAN-REVIEW).

/** The taps a worker records on a visit. */
export const FIELD_TAPS = ['on_my_way', 'arrived', 'finished'] as const
export type FieldTap = (typeof FIELD_TAPS)[number]

/** The per-worker timestamps (ENT-TimeStamp): Arrived and Finished only, never a categorized timer. */
export const TIME_STAMP_KINDS = ['arrived', 'finished'] as const
export type TimeStampKind = (typeof TIME_STAMP_KINDS)[number]

/** The visit states a worker's My Day lists for today: a tentative hold, then the committed states. */
export const MY_DAY_VISIT_STATES = ['tentative', 'confirmed', 'en_route', 'arrived', 'completed'] as const

/** What a worker's My Day offers next on one visit. */
export const MY_DAY_NEXT = [
  // A tentative hold: not confirmed, nothing to record.
  'not_confirmed',
  // On my way opens later (the configured minutes before the window).
  'wait',
  // The On my way rule is NOT CONFIGURED: the tap is refused rather than assumed.
  'not_configured',
  'on_my_way',
  'arrived',
  'finished',
  // Everything this worker records on this visit is recorded.
  'done',
] as const
export type MyDayNext = (typeof MY_DAY_NEXT)[number]

export type MyDayFacts = {
  /** The visit's state. */
  readonly visitState: string
  /** The caller's reservation on the visit: an active confirmed assignment, or a tentative hold. */
  readonly reservation: 'confirmed' | 'hold'
  /** The caller's own recorded taps on this visit. */
  readonly departed: boolean
  readonly arrived: boolean
  readonly finished: boolean
  /** When On my way opens for this visit; null while the rule is NOT CONFIGURED. */
  readonly onMyWayOpensAt: Date | null
  readonly now: Date
}

export type MyDayActions = {
  readonly next: MyDayNext
  readonly onMyWay: boolean
  readonly arrived: boolean
  readonly finished: boolean
}

const NONE = { onMyWay: false, arrived: false, finished: false } as const

/** When On my way opens: the configured minutes before the arrival window starts (OWN-DEC-107). */
export function onMyWayOpensAt(startsAt: Date, earliestMinutesBefore: number): Date {
  return new Date(startsAt.getTime() - earliestMinutesBefore * 60_000)
}

/**
 * The taps the caller may record on one visit now, and the one next action My Day shows (HH-OFF-09). The server
 * decides every tap with the same function, so the screen never offers what the server would refuse.
 */
export function myDayActions(f: MyDayFacts): MyDayActions {
  if (f.reservation !== 'confirmed') return { next: 'not_confirmed', ...NONE }
  const open = f.onMyWayOpensAt !== null && f.now.getTime() >= f.onMyWayOpensAt.getTime()
  switch (f.visitState) {
    case 'confirmed':
    case 'en_route': {
      const onMyWay = !f.departed && !f.arrived && open
      const arrived = f.visitState === 'en_route' && !f.arrived
      if (onMyWay) return { next: 'on_my_way', onMyWay, arrived, finished: false }
      if (arrived) return { next: 'arrived', onMyWay, arrived, finished: false }
      if (f.departed || f.arrived) return { next: 'done', ...NONE }
      return { next: f.onMyWayOpensAt === null ? 'not_configured' : 'wait', ...NONE }
    }
    case 'arrived': {
      if (!f.arrived) return { next: 'arrived', onMyWay: false, arrived: true, finished: false }
      if (!f.finished) return { next: 'finished', onMyWay: false, arrived: false, finished: true }
      return { next: 'done', ...NONE }
    }
    default:
      return { next: 'done', ...NONE }
  }
}

/** Why a tap is refused, as a field error code (the server answers CONFLICT or NOT_CONFIGURED with it). */
export type TapRefusal =
  | 'VISIT_NOT_ACTIVE'
  | 'ON_MY_WAY_NOT_CONFIGURED'
  | 'ON_MY_WAY_TOO_EARLY'
  | 'ON_MY_WAY_FIRST'
  | 'ARRIVED_FIRST'
  | 'ALREADY_ARRIVED'

/**
 * Whether a tap is accepted, refused, or a repeat that changes nothing (idempotent: no second record, no second
 * notice). A canceled, expired, no-access or tentative visit refuses every tap (HH-SCH-08).
 */
export function tapDecision(tap: FieldTap, f: MyDayFacts): 'record' | 'repeat' | TapRefusal {
  if (f.reservation !== 'confirmed' || !['confirmed', 'en_route', 'arrived', 'completed'].includes(f.visitState))
    return 'VISIT_NOT_ACTIVE'
  const a = myDayActions(f)
  switch (tap) {
    case 'on_my_way':
      if (f.departed) return 'repeat'
      if (a.onMyWay) return 'record'
      if (f.arrived || f.visitState === 'arrived' || f.visitState === 'completed') return 'ALREADY_ARRIVED'
      return f.onMyWayOpensAt === null ? 'ON_MY_WAY_NOT_CONFIGURED' : 'ON_MY_WAY_TOO_EARLY'
    case 'arrived':
      if (f.arrived) return 'repeat'
      if (a.arrived) return 'record'
      return f.visitState === 'confirmed' ? 'ON_MY_WAY_FIRST' : 'VISIT_NOT_ACTIVE'
    case 'finished':
      if (f.finished) return 'repeat'
      if (a.finished) return 'record'
      return f.arrived ? 'VISIT_NOT_ACTIVE' : 'ARRIVED_FIRST'
  }
}

/** A visit is completed when every worker assigned to it has a Finished value (PROPOSED, see the header). */
export function everyoneFinished(assigned: readonly string[], finished: ReadonlySet<string>): boolean {
  return assigned.length > 0 && assigned.every((id) => finished.has(id))
}

// --- Timestamps per worker (HH-WORK-06, T47) ---------------------------------------------------------------------

/** A recorded tap's server time. */
export type RecordedStamp = { readonly staffUserId: string; readonly kind: TimeStampKind; readonly recordedAt: Date }
/** One correction by the Owner: the value it set, the value it replaced (null: missing), the reason. */
export type StampCorrection = {
  readonly staffUserId: string
  readonly kind: TimeStampKind
  readonly correctedAt: Date
  readonly previousAt: Date | null
  readonly reason: string
  readonly createdAt: Date
}

/** How one value stands: recorded by the tap, corrected by the Owner, not due yet, or missing (flagged). */
export const STAMP_STATUSES = ['recorded', 'corrected', 'pending', 'missing'] as const
export type StampStatus = (typeof STAMP_STATUSES)[number]

export type StampValue = {
  readonly status: StampStatus
  /** The value in force: the latest correction, else the recorded time; null when none exists. */
  readonly at: Date | null
  /** The recorded tap's own time, kept whatever the corrections say; null when it was never recorded. */
  readonly recordedAt: Date | null
  readonly corrections: readonly StampCorrection[]
}

export type WorkerTimes = {
  readonly staffUserId: string
  readonly arrived: StampValue
  readonly finished: StampValue
  /** Whole minutes from Arrived to Finished; null while either is missing (never invented). */
  readonly durationMinutes: number | null
  /** A missing value is flagged for the Owner. */
  readonly flagged: boolean
}

export type TimesFacts = {
  /** Every worker assigned to the visit (active confirmed reservations), the lead first. */
  readonly assigned: readonly string[]
  readonly stamps: readonly RecordedStamp[]
  readonly corrections: readonly StampCorrection[]
  readonly visitState: string
  /** The visit's service day has ended in the visit's zone. */
  readonly dayEnded: boolean
}

function valueOf(staffUserId: string, kind: TimeStampKind, f: TimesFacts, due: boolean): StampValue {
  const stamp = f.stamps.find((s) => s.staffUserId === staffUserId && s.kind === kind) ?? null
  const corrections = f.corrections
    .filter((c) => c.staffUserId === staffUserId && c.kind === kind)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  const latest = corrections[corrections.length - 1]
  const at = latest ? latest.correctedAt : (stamp?.recordedAt ?? null)
  const status: StampStatus = latest ? 'corrected' : stamp ? 'recorded' : due ? 'missing' : 'pending'
  return { status, at, recordedAt: stamp?.recordedAt ?? null, corrections }
}

/**
 * Each worker's Arrived and Finished on one visit (HH-WORK-06): every assigned worker, and anyone else who recorded a
 * value there. PROPOSED (OQ-MY-DAY-DETAILS) when a value is due: Arrived once the visit has arrived (or the day ended
 * after it was on the way); Finished once the visit is completed or its service day ended after the worker arrived.
 */
export function workerTimes(f: TimesFacts): WorkerTimes[] {
  const ids = [...f.assigned]
  for (const s of [...f.stamps, ...f.corrections]) if (!ids.includes(s.staffUserId)) ids.push(s.staffUserId)
  const started = ['en_route', 'arrived', 'completed'].includes(f.visitState)
  const arrivedDue = f.visitState === 'arrived' || f.visitState === 'completed' || (started && f.dayEnded)
  return ids.map((id) => {
    const arrived = valueOf(id, 'arrived', f, arrivedDue)
    const finishedDue = f.visitState === 'completed' || (f.dayEnded && arrived.at !== null)
    const finished = valueOf(id, 'finished', f, finishedDue || (arrived.status === 'missing' && f.dayEnded))
    const durationMinutes =
      arrived.at && finished.at && finished.at.getTime() >= arrived.at.getTime()
        ? Math.floor((finished.at.getTime() - arrived.at.getTime()) / 60_000)
        : null
    return {
      staffUserId: id,
      arrived,
      finished,
      durationMinutes,
      flagged: arrived.status === 'missing' || finished.status === 'missing',
    }
  })
}

/** Why an Owner's correction is refused (HH-WORK-06): it must keep Arrived before Finished and lie in the past. */
export type CorrectionProblem = 'IN_FUTURE' | 'FINISHED_BEFORE_ARRIVED' | 'UNCHANGED'

export function correctionProblem(
  kind: TimeStampKind,
  at: Date,
  current: { readonly arrived: { readonly at: Date | null }; readonly finished: { readonly at: Date | null } } | null,
  now: Date,
): CorrectionProblem | null {
  if (at.getTime() > now.getTime()) return 'IN_FUTURE'
  const same = kind === 'arrived' ? current?.arrived.at : current?.finished.at
  if (same && same.getTime() === at.getTime()) return 'UNCHANGED'
  if (kind === 'arrived' && current?.finished.at && at.getTime() > current.finished.at.getTime())
    return 'FINISHED_BEFORE_ARRIVED'
  if (kind === 'finished' && current?.arrived.at && at.getTime() < current.arrived.at.getTime())
    return 'FINISHED_BEFORE_ARRIVED'
  return null
}

/** The first name a customer notice may carry: the first word of the staff member's display name, or none. */
export function firstName(displayName: string | null): string | null {
  const first = displayName?.trim().split(/\s+/)[0]
  return first ? first : null
}
