// Guards shared by several machines (HH-STATE-02; OWN-DEC-100, OWN-DEC-101).
import type { Problem } from './engine.js'

const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS

/** Facts about obligations that make simply closing or cancelling wrong (HH-STATE-02; OWN-DEC-100). */
export type ObligationFacts = {
  /** An estimate was accepted for this request or project. */
  readonly workAccepted?: boolean
  /** A visit (estimate or work) exists that is not cancelled. */
  readonly appointmentExists?: boolean
  /** Any money was received. */
  readonly moneyReceived?: boolean
}

/**
 * If work was accepted, an appointment exists or money was received, declining or cancelling routes to the Owner for
 * cancellation and financial review instead of simply closing (HH-STATE-02, OWN-DEC-100). Each fact must be known:
 * an unknown fact is refused, never assumed false.
 */
export function noObligations(f: ObligationFacts): Problem | null {
  const unknown = (['workAccepted', 'appointmentExists', 'moneyReceived'] as const).filter((k) => f[k] === undefined)
  if (unknown.length > 0) return { code: 'FACTS_MISSING', message: `The server must check: ${unknown.join(', ')}.` }
  const found = [
    f.workAccepted ? 'accepted work' : null,
    f.appointmentExists ? 'an appointment' : null,
    f.moneyReceived ? 'money received' : null,
  ].filter(Boolean)
  if (found.length === 0) return null
  return {
    code: 'OWNER_REVIEW_REQUIRED',
    message: `This has ${found.join(', ')}; route it to the Owner for cancellation and financial review instead.`,
  }
}

/** A written reason (and, when the category is "other", its documented text) is required. */
export function reasonGiven(reason: string | undefined, what = 'A written reason'): Problem | null {
  return typeof reason === 'string' && reason.trim() !== ''
    ? null
    : { code: 'REASON_REQUIRED', message: `${what} is required.` }
}

/** `at` + `hours` has passed. A missing time or a missing configured period is refused. */
export function hoursPassed(at: Date | undefined, hours: number | undefined, now: Date, what: string): Problem | null {
  if (hours === undefined || !Number.isFinite(hours) || hours < 0) {
    return { code: 'CONFIG_MISSING', message: `The configured waiting period for ${what} is missing.` }
  }
  if (at === undefined) return { code: 'FACTS_MISSING', message: `The time of ${what} is missing.` }
  return now.getTime() >= at.getTime() + hours * HOUR_MS
    ? null
    : { code: 'TOO_EARLY', message: `Wait until ${hours} hours after ${what}.` }
}

/** `event` happened within `days` of `start`. A missing time or a missing configured period is refused. */
export function withinDays(
  start: Date | undefined,
  event: Date | undefined,
  days: number | undefined,
  what: string,
): Problem | null {
  if (days === undefined || !Number.isFinite(days) || days < 0) {
    return { code: 'CONFIG_MISSING', message: `The configured period for ${what} is missing.` }
  }
  if (start === undefined || event === undefined) {
    return { code: 'FACTS_MISSING', message: `The times needed for ${what} are missing.` }
  }
  const t = event.getTime()
  return t >= start.getTime() && t <= start.getTime() + days * DAY_MS
    ? null
    : { code: 'PERIOD_ENDED', message: `The ${days}-day period for ${what} has ended.` }
}

/** A required fact is exactly true. */
export function isTrue(value: boolean | undefined, code: string, message: string): Problem | null {
  return value === true ? null : { code, message }
}

/** A required fact is exactly false (unknown is refused). */
export function isFalse(value: boolean | undefined, code: string, message: string): Problem | null {
  return value === false ? null : { code, message }
}
