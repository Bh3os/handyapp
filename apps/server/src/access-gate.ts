// Staging access gate (TSK-0003; OWN-DEC-73, RULE-SYNTHETIC-DATA). Adapted from Bh3os/handyhub-app
// (apps/server/src/platform/access-gate.ts). One onRequest hook in front of every route - both websites, the API and
// file access - asks for HTTP Basic credentials (RFC 7617) of one of the testers named in ACCESS_GATE_USERS before
// anything else runs. It only decides who may reach the environment; staff and customer sign-in stay separate and
// active inside (OWN-DEC-73).
//
// - Public without the gate: only the minimal liveness check `/healthz` (no database call, no private data). The
//   exemption follows the matched route, never the raw URL, so a look-alike path cannot slip through.
// - A request without credentials gets 401 with the challenge and is not counted. Wrong or malformed credentials count
//   against the client network (an IPv4 address, an IPv6 /64): after 30 failures in 15 minutes (PROPOSED, from the old
//   repo) the network is refused with 429 for the rest of the window, even with valid credentials.
// - Passwords are compared as keyed hashes in constant time and never logged; the Authorization header is redacted
//   from the request log.
import type { IncomingMessage } from 'node:http'
import { isIPv6 } from 'node:net'
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { AccessGateSettings } from './config.js'

/** Routes that stay reachable without the gate, by matched route pattern and method. */
export const GATE_EXEMPT_ROUTES: ReadonlyArray<{ url: string; methods: readonly string[] }> = [
  { url: '/healthz', methods: ['GET', 'HEAD'] },
]

export const GATE_FAILURE_LIMIT = { max: 30, windowMs: 15 * 60 * 1000 } as const

export function gateExempt(routeUrl: string | undefined, method: string): boolean {
  if (!routeUrl) return false
  return GATE_EXEMPT_ROUTES.some((r) => r.url === routeUrl && r.methods.includes(method))
}

/** The user name and password of a Basic Authorization header, or null when the header is not one. */
export function readBasicCredentials(header: string): { name: string; password: string } | null {
  const m = /^Basic +([A-Za-z0-9+/]+={0,2}) *$/i.exec(header)
  if (!m?.[1]) return null
  const decoded = Buffer.from(m[1], 'base64').toString('utf8')
  const colon = decoded.indexOf(':')
  if (colon < 1) return null
  return { name: decoded.slice(0, colon), password: decoded.slice(colon + 1) }
}

/** The matched tester's name, or null. Every tester is checked, so the time does not reveal which one matched. */
export function checkGateCredentials(
  gate: Extract<AccessGateSettings, { enabled: true }>,
  header: string | undefined,
): string | null {
  if (header === undefined) return null
  const creds = readBasicCredentials(header)
  if (!creds) return null
  let matched: string | null = null
  for (const user of gate.users) if (user.matches(creds.name, creds.password) && matched === null) matched = user.name
  return matched
}

/** The client address: the socket peer, or the entry the trusted proxies appended to X-Forwarded-For. */
export function clientAddress(raw: IncomingMessage, trustedHops: number): string {
  const peer = raw.socket.remoteAddress ?? 'unknown'
  if (trustedHops === 0) return peer
  const header = raw.headers['x-forwarded-for']
  const list = (Array.isArray(header) ? header.join(',') : (header ?? ''))
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return list[list.length - trustedHops] ?? peer
}

/** IPv4 addresses count alone; IPv6 addresses by their /64 network, so one host cannot rotate past the limit. */
export function networkKey(address: string): string {
  const plain = address.replace(/^::ffff:/, '')
  if (!isIPv6(plain)) return plain
  const [head = ''] = plain.split('::')
  const groups = head.split(':').filter(Boolean)
  const full = plain.includes('::') ? [...groups, '0', '0', '0', '0'].slice(0, 4) : plain.split(':').slice(0, 4)
  return `${full.join(':')}::/64`
}

/** Failure counter per network, in memory (one Render instance). */
export class FailureLimiter {
  readonly #hits = new Map<string, { count: number; resetAt: number }>()
  constructor(
    readonly max: number = GATE_FAILURE_LIMIT.max,
    readonly windowMs: number = GATE_FAILURE_LIMIT.windowMs,
    private readonly now: () => number = Date.now,
  ) {}

  #entry(key: string) {
    const t = this.now()
    const e = this.#hits.get(key)
    if (!e || e.resetAt <= t) {
      const fresh = { count: 0, resetAt: t + this.windowMs }
      this.#hits.set(key, fresh)
      return fresh
    }
    return e
  }

  /** Seconds until the window ends when the network is blocked, else 0. */
  blockedFor(key: string): number {
    const e = this.#entry(key)
    return e.count >= this.max ? Math.ceil((e.resetAt - this.now()) / 1000) : 0
  }

  /** Counts one failure; returns the block in seconds when this failure reaches the limit, else 0. */
  fail(key: string): number {
    const e = this.#entry(key)
    e.count += 1
    if (this.#hits.size > 10_000) this.#sweep()
    return e.count > this.max ? Math.ceil((e.resetAt - this.now()) / 1000) : 0
  }

  #sweep() {
    const t = this.now()
    for (const [k, e] of this.#hits) if (e.resetAt <= t) this.#hits.delete(k)
  }
}

function refuse(reply: FastifyReply, status: 401 | 429, headers: Record<string, string>) {
  const [code, title] =
    status === 401
      ? ['ACCESS_GATE_REQUIRED', 'This test system is open to authorized testers only.']
      : ['RATE_LIMITED', 'Too many requests.']
  return reply.status(status).headers(headers).type('application/problem+json').send({ status, code, title })
}

/** onRequest hook; registered first so it runs before every other hook and handler. */
export function accessGateHook(gate: AccessGateSettings, limiter: FailureLimiter, trustedHops: number) {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply | undefined> => {
    if (!gate.enabled) return undefined
    if (gateExempt(req.routeOptions.url, req.method)) return undefined
    const challenge = () => refuse(reply, 401, { 'www-authenticate': `Basic realm="${gate.realm}", charset="UTF-8"` })
    const header = req.headers.authorization
    // No credentials yet: the browser has not asked the tester. Answer the challenge without counting a failure.
    if (header === undefined) return challenge()
    const network = networkKey(clientAddress(req.raw, trustedHops))
    const tester = checkGateCredentials(gate, header)
    if (tester) {
      const blocked = limiter.blockedFor(network)
      if (blocked > 0) return refuse(reply, 429, { 'retry-after': String(blocked) })
      return undefined
    }
    const blocked = limiter.fail(network)
    if (blocked > 0) {
      req.log.warn('ACCESS_GATE_BLOCKED')
      return refuse(reply, 429, { 'retry-after': String(blocked) })
    }
    req.log.info('ACCESS_GATE_FAILED')
    return challenge()
  }
}
