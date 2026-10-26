// Findings of the security review before real customer data, pinned against PostgreSQL 16 (TSK-0109; HH-SEC-01,
// HH-SEC-02, HH-SEC-07, OWN-DEC-136; docs/security/review-2026.md). Staff are synthetic (RULE-SYNTHETIC-DATA).
// - AUTH-1: the staff sign-in and second-factor limits count each attempt before the password or code is checked, so
//   parallel guesses cannot all pass below the limit, whatever happens to serialize them in one process (several
//   server instances share the counts); a successful attempt is given back.
// - AVAIL-1: as many parallel write requests as the pool has connections no longer stop the API: a request waits for
//   a free connection for a bounded time, then fails, and the pool recovers.
// - AVAIL-2: /readyz shares one migration check and keeps an applied answer, instead of a connection per call.
// - MON-1: the Owner's system health report counts the security signals of the last day.
import { createDb, type Db, SERVER_POOL_CONNECT_TIMEOUT_MS, withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { databaseReadiness } from '../../src/health.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { currentCode } from '../../src/modules/identity/mfa.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import { RATE_RULES } from '../../src/modules/identity/rate-limit.js'
import {
  collectHealth,
  type HealthCheck,
  SECURITY_SIGNAL_THRESHOLDS,
  SECURITY_SIGNAL_WINDOW_HOURS,
} from '../../src/modules/system/health.js'
import { audit } from '../../src/platform/audit.js'
import { runWithContext } from '../../src/platform/request-context.js'
import { testConfig } from '../fixtures/env.js'
import { enrolledFactor, signInWithMfa } from '../fixtures/staff-mfa.js'

const pw = ['synthetic', 'security', 'review', 'passphrase', '109'].join(' ')
const wrong = ['synthetic', 'wrong', 'passphrase', '109'].join(' ')
const LIMIT = RATE_RULES.signInAccount.limit

const PARALLEL = LIMIT + 6

let t: TestDatabase
let wide: Db
let app: FastifyInstance

beforeAll(async () => {
  t = await createTestDatabase()
  // A pool wide enough for every parallel request (AUTH-1 is about the counts, AVAIL-1 below about a narrow pool).
  wide = createDb(t.url, { max: PARALLEL * 2 + 2, applicationName: 'handyapp-test-wide' })
  // Behind one trusted proxy, so each test counts from a network of its own (the network limit is wider).
  app = await buildApp({ config: testConfig({ TRUST_PROXY_HOPS: '1' }), api: { db: wide } })
  const hash = await hashPassword(pw)
  await withTx(t.db, async (tx) => {
    const people = ['parallel-sign-in', 'released-sign-in', 'parallel-mfa', 'narrow-pool']
    for (const email of people.map((p) => `${p}@example.test`)) {
      const user = await createStaffUser(tx, {
        email,
        displayName: null,
        locale: 'en',
        role: 'office',
        issuedBy: 'test',
      })
      await setPasswordHash(tx, user.id, hash)
    }
  })
})
afterAll(async () => {
  await app?.close()
  await wide?.destroy()
  await t?.drop()
})

const signIn = (email: string, password: string, network: string) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/staff/auth/sign-in',
    payload: { email, password },
    headers: { 'x-forwarded-for': network },
  })

describe('staff sign-in limits hold under parallel guesses (TSK-0109 AUTH-1, HH-SEC-02)', () => {
  it('[HH-SEC-01][HH-SEC-02] parallel wrong passwords for one account: no more than the limit are even checked', async () => {
    const email = 'parallel-sign-in@example.test'
    const codes = (
      await Promise.all(Array.from({ length: PARALLEL }, () => signIn(email, wrong, '198.51.100.11')))
    ).map((r) => r.statusCode)
    expect(codes.filter((c) => c === 401).length).toBeLessThanOrEqual(LIMIT)
    expect(codes.filter((c) => c === 429).length).toBeGreaterThanOrEqual(PARALLEL - LIMIT)
    expect(codes.every((c) => c === 401 || c === 429)).toBe(true)
    // Over the limit, the right password is refused too.
    expect((await signIn(email, pw, '198.51.100.11')).statusCode).toBe(429)
  })

  it('[HH-SEC-02] a successful sign-in is given back: only failures count towards the limit', async () => {
    const email = 'released-sign-in@example.test'
    for (let i = 0; i < LIMIT - 1; i += 1) expect((await signIn(email, wrong, '198.51.100.12')).statusCode).toBe(401)
    // The right password waits for the second factor (OWN-DEC-202); its attempt does not stay counted.
    expect((await signIn(email, pw, '198.51.100.12')).statusCode).toBe(202)
    expect((await signIn(email, wrong, '198.51.100.12')).statusCode).toBe(401)
    expect((await signIn(email, wrong, '198.51.100.12')).statusCode).toBe(429)
  })

  it('[HH-SEC-01][HH-SEC-02] parallel wrong authenticator codes for one pending session: no more than the limit are checked', async () => {
    const email = 'parallel-mfa@example.test'
    const first = await signInWithMfa(app, {
      method: 'POST',
      url: '/api/v1/staff/auth/sign-in',
      payload: { email, password: pw },
      headers: { 'x-forwarded-for': '198.51.100.13' },
    })
    expect(first.statusCode, first.body).toBe(200)
    const pending = await signIn(email, pw, '198.51.100.13')
    expect(pending.statusCode).toBe(202)
    const cookie = String(pending.headers['set-cookie']).split(';')[0] as string
    // A code the authenticator does not show in any acceptable step.
    const secret = enrolledFactor(email)?.secret as string
    const accepted = new Set([-1, 0, 1].map((d) => currentCode(secret, Date.now() + d * 30_000)))
    let guess = 0
    while (accepted.has(String(guess).padStart(6, '0'))) guess += 1
    const code = String(guess).padStart(6, '0')
    const codes = (
      await Promise.all(
        Array.from({ length: PARALLEL }, () =>
          app.inject({
            method: 'POST',
            url: '/api/v1/staff/auth/mfa/verify',
            payload: { code },
            headers: { cookie, 'x-forwarded-for': '198.51.100.13' },
          }),
        ),
      )
    ).map((r) => r.statusCode)
    expect(codes.filter((c) => c === 401).length).toBeLessThanOrEqual(LIMIT)
    expect(codes.filter((c) => c === 429).length).toBeGreaterThanOrEqual(PARALLEL - LIMIT)
  })
})

describe('parallel requests cannot stop the API (TSK-0109 AVAIL-1, HH-SEC-03)', () => {
  it(
    '[HH-SEC-01][HH-SEC-03] more parallel sign-ins than the server pool has connections all end, and the API keeps answering',
    async () => {
      // The server's own pool (ten connections, SERVER_POOL_CONNECT_TIMEOUT_MS), as boot.ts and buildApp open it.
      const own = await buildApp({ config: testConfig({ TRUST_PROXY_HOPS: '1', DATABASE_URL: t.url }) })
      try {
        const email = 'narrow-pool@example.test'
        const send = (network: string) =>
          own.inject({
            method: 'POST',
            url: '/api/v1/staff/auth/sign-in',
            payload: { email, password: wrong },
            headers: { 'x-forwarded-for': network },
          })
        const codes = (await Promise.all(Array.from({ length: 16 }, (_, i) => send(`198.51.100.${40 + i}`)))).map(
          (r) => r.statusCode,
        )
        // Each ended: refused as a wrong password, limited, or failed while waiting for a connection; none hangs.
        for (const c of codes) expect([401, 429, 500, 503]).toContain(c)
        // And the pool is free again: the next request is answered as usual.
        expect([401, 429]).toContain((await send('198.51.100.60')).statusCode)
      } finally {
        await own.close()
      }
    },
    SERVER_POOL_CONNECT_TIMEOUT_MS * 4,
  )
})

describe('security signals in the Owner health report (TSK-0109 MON-1, HH-SEC-07)', () => {
  const signals = async (now = new Date()) => {
    const c = (await collectHealth(t.db, { now })).checks.find((x) => x.id === 'security_signals') as HealthCheck
    const value = (id: string) => c.metrics.find((m) => m.id === id)?.value ?? -1
    return { status: c.status, note: c.note, denied: value('denied_access'), privileged: value('privileged_changes') }
  }

  it('[HH-SEC-07][T19] probing for other customers’ records and privileged changes are counted; the threshold needs attention', async () => {
    const before = await signals()
    expect(before.note).toBe('security_signals_partly_in_logs')
    await runWithContext({ requestId: 'test-security-signals-0001' }, () =>
      withTx(t.db, async (tx) => {
        for (let i = 0; i < SECURITY_SIGNAL_THRESHOLDS.denied_access; i += 1)
          await audit.record(tx, {
            actor: { kind: 'guest' },
            action: 'security.scope_denied',
            target: { type: 'project', id: `project-${i}` },
            result: 'denied',
            reason: 'outside_scope',
          })
        await audit.record(tx, {
          actor: { kind: 'system', process: 'test' },
          action: 'staff.disable',
          target: { type: 'staff_user', id: 'synthetic' },
        })
      }),
    )
    const after = await signals()
    expect(after.denied - before.denied).toBe(SECURITY_SIGNAL_THRESHOLDS.denied_access)
    expect(after.privileged - before.privileged).toBe(1)
    expect(after.status).toBe('attention')
    // A day later the window is empty again: one line for the Owner, not an alert that never ends.
    const later = await signals(new Date(Date.now() + (SECURITY_SIGNAL_WINDOW_HOURS + 1) * 3_600_000))
    expect(later).toMatchObject({ status: 'ok', denied: 0, privileged: 0 })
  })
})

describe('/readyz opens no connection per call (TSK-0109 AVAIL-2, HH-SEC-03)', () => {
  it('[HH-SEC-01][HH-SEC-03] parallel calls share one migration check, and an applied schema is not read again', async () => {
    // Reading the migration files and the applied list takes a moment, as the real check does.
    const slowly = <T>(value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(value), 50))
    let reads = 0
    const applied = databaseReadiness(t.url, t.db, () => {
      reads += 1
      return slowly([])
    })
    const answers = await Promise.all(Array.from({ length: 8 }, () => applied.check()))
    expect(answers.every((a) => a.ready)).toBe(true)
    expect(reads).toBe(1)
    expect((await applied.check()).ready).toBe(true)
    expect(reads).toBe(1)

    let pendingReads = 0
    const waiting = databaseReadiness(t.url, t.db, () => {
      pendingReads += 1
      return slowly(['0999_not_applied.sql'])
    })
    expect((await Promise.all(Array.from({ length: 8 }, () => waiting.check()))).every((a) => !a.ready)).toBe(true)
    expect(pendingReads).toBe(1)
    // Until applied, a later call checks again (a deploy in progress): "pending" is never kept.
    await waiting.check()
    expect(pendingReads).toBe(2)
  })
})
