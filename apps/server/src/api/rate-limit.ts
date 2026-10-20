// Server-side rate limits for API routes (TSK-0025; HH-INT-11, HH-API-01). A route declares `rateLimit` in its
// contract; registration enforces it before the route runs. Fixed-window counters live in PostgreSQL so every instance
// shares them (adapted from Bh3os/handyhub-app platform/rate-limit.ts). Keys are HMAC hashes of the caller's network
// (guests and customers) or staff identity, never raw addresses. The answer to a limited call is the neutral
// RATE_LIMITED envelope with Retry-After; it says nothing about why or how many calls were seen.
import { createHmac, randomBytes } from 'node:crypto'
import type { Db } from '@handyhub/db'
import type { Actor } from '@handyhub/policy'
import type { FastifyRequest } from 'fastify'
import { sql } from 'kysely'
import { clientAddress, networkKey } from '../access-gate.js'
import type { RateLimit } from './route.js'

export type RateDecision = { allowed: boolean; retryAfterSeconds: number }

export class RateLimiter {
  readonly #secret: Buffer
  constructor(
    private readonly db: Db,
    private readonly trustedHops = 0,
    secret: Buffer = randomBytes(32),
  ) {
    this.#secret = secret
  }

  keyHash(bucket: string, key: string): string {
    return createHmac('sha256', this.#secret).update(`${bucket}\0${key}`).digest('hex').slice(0, 32)
  }

  /** Who the limit counts: a staff member by identity, anyone else by client network. */
  callerKey(req: FastifyRequest, actor: Actor): string {
    if (actor.kind === 'staff') return `staff:${actor.userId}`
    return `net:${networkKey(clientAddress(req.raw, this.trustedHops))}`
  }

  async consume(rule: Exclude<RateLimit, 'none'>, key: string, now: Date = new Date()): Promise<RateDecision> {
    const windowMs = rule.windowSeconds * 1000
    const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs)
    const row = await this.db
      .insertInto('platform.rate_counters')
      .values({ bucket: rule.bucket, key_hash: this.keyHash(rule.bucket, key), window_start: windowStart, hits: 1 })
      .onConflict((oc) =>
        oc.columns(['bucket', 'key_hash', 'window_start']).doUpdateSet({ hits: sql`platform.rate_counters.hits + 1` }),
      )
      .returning('hits')
      .executeTakeFirstOrThrow()
    // Old windows are transient; pruning on a small share of first hits keeps the table small without a scheduler.
    if (row.hits === 1 && Math.random() < 0.02)
      await this.db
        .deleteFrom('platform.rate_counters')
        .where('window_start', '<', new Date(now.getTime() - 86_400_000))
        .execute()
    const retryAfterSeconds = Math.max(1, Math.ceil((windowStart.getTime() + windowMs - now.getTime()) / 1000))
    return { allowed: row.hits <= rule.limit, retryAfterSeconds }
  }
}
