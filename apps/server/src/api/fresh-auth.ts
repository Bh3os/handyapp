// Fresh authentication guard (TSK-0015; HH-STAFF-03, HH-SEC-02). Sensitive actions (privilege changes, refunds,
// bulk exports, high-consequence configuration) need a password or second factor entered within a number of minutes;
// a route declares it with `freshAuthMinutes` and the framework calls this guard, or a handler calls it itself.
import { ApiError } from './errors.js'

export function requireFreshAuth(authenticatedAt: Date | undefined, minutes: number, now = new Date()): void {
  if (!authenticatedAt || now.getTime() - authenticatedAt.getTime() > minutes * 60_000)
    throw new ApiError('FRESH_AUTH_REQUIRED')
}
