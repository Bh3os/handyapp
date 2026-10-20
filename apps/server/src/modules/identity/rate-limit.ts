// Sign-in, reset and link rate limits (TSK-0014; HH-STAFF-01, HH-SEC-02, HH-INT-11). Fixed windows counted in
// PostgreSQL, so every server instance shares them; keys are SHA-256 hashes, never raw emails or addresses. A count is
// added in one statement and the answer follows that count, so parallel guesses cannot all pass below the limit.
import type { Db, Tx } from '@handyhub/db'
import { sql } from 'kysely'
import { ApiError } from '../../api/errors.js'
import { hashToken } from './tokens.js'

export type RateRule = { bucket: string; limit: number; windowSeconds: number }

/** PROPOSED engineering values (no owner decision needed); the old repo's gate used 30 per 15 minutes per network. */
export const RATE_RULES = {
  signInAccount: { bucket: 'staff_sign_in_account', limit: 10, windowSeconds: 900 },
  signInNetwork: { bucket: 'staff_sign_in_network', limit: 30, windowSeconds: 900 },
  resetAccount: { bucket: 'staff_reset_account', limit: 5, windowSeconds: 3600 },
  resetNetwork: { bucket: 'staff_reset_network', limit: 20, windowSeconds: 3600 },
  linkNetwork: { bucket: 'staff_link_network', limit: 20, windowSeconds: 900 },
} as const satisfies Record<string, RateRule>

function windowStart(rule: RateRule, now: Date): Date {
  const windowMs = rule.windowSeconds * 1000
  return new Date(Math.floor(now.getTime() / windowMs) * windowMs)
}

function limited(rule: RateRule, start: Date, now: Date): ApiError {
  const retryAfter = Math.max(1, Math.ceil((start.getTime() + rule.windowSeconds * 1000 - now.getTime()) / 1000))
  return new ApiError('RATE_LIMITED', { headers: { 'retry-after': String(retryAfter) } })
}

/** Refuses with RATE_LIMITED when the window already holds `limit` hits, without counting this request. */
export async function check(db: Db | Tx, rule: RateRule, key: string, now = new Date()): Promise<void> {
  const start = windowStart(rule, now)
  const row = await db
    .selectFrom('identity.rate_limits')
    .select('hits')
    .where('bucket', '=', rule.bucket)
    .where('key_hash', '=', hashToken(`${rule.bucket}|${key}`))
    .where('window_start', '=', start)
    .executeTakeFirst()
  if ((row?.hits ?? 0) >= rule.limit) throw limited(rule, start, now)
}

/** Counts one hit and refuses with RATE_LIMITED (Retry-After) once the window's limit is passed. */
export async function hit(db: Db | Tx, rule: RateRule, key: string, now = new Date()): Promise<void> {
  const start = windowStart(rule, now)
  const row = await sql<{ hits: number }>`
    INSERT INTO identity.rate_limits (bucket, key_hash, window_start, hits)
    VALUES (${rule.bucket}, ${hashToken(`${rule.bucket}|${key}`)}, ${start}, 1)
    ON CONFLICT (bucket, key_hash, window_start) DO UPDATE SET hits = identity.rate_limits.hits + 1
    RETURNING hits`.execute(db)
  const hits = row.rows[0]?.hits ?? 0
  if (hits > rule.limit) throw limited(rule, start, now)
}

/** The client network: an IPv4 address, or an IPv6 /64. */
export function networkOf(ip: string): string {
  const plain = ip.replace(/^::ffff:/, '')
  if (!plain.includes(':')) return plain
  return `${plain.split(':').slice(0, 4).join(':')}::/64`
}
