// Customer one-time codes and customer sessions against PostgreSQL 16 (TSK-0016; HH-INT-13, HH-ID-06, HH-ID-07,
// HH-ID-09, HH-INT-11, HH-SEC-02, HH-ARC-06, OWN-DEC-96, OWN-DEC-141, FACT-SESSION-TIMINGS, T18, T19). All
// destinations are synthetic (example.test, 555-01xx) and the providers are the in-memory fakes.
import { Writable } from 'node:stream'
import { withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import type { ApiModule } from '../../src/api/route.js'
import {
  clearedSessionCookie,
  codeDeliveryAutomation,
  customerSessionResolver,
  issueCode,
  readCodeKey,
  resolveCustomerSession,
  revokeCustomerSession,
  sessionCookie,
  startCustomerSession,
  verifyCode,
  type CodeKeySettings,
  type IssueInput,
  type VerifyInput,
} from '../../src/modules/identity/index.js'
import { createAutomationRegistry } from '../../src/platform/automation.js'
import { recordPolicyVersion } from '../../src/platform/config/index.js'
import { createWorker } from '../../src/platform/jobs.js'
import { createLogger } from '../../src/platform/logger.js'
import { createProviders } from '../../src/providers/index.js'
import { readProviderSettings } from '../../src/providers/settings.js'
import { testConfig } from '../fixtures/env.js'

const KEY: CodeKeySettings = readCodeKey({ HANDYHUB_ENV: 'ci', CODE_HASH_KEY: 'synthetic-test-code-key-'.repeat(2) })
const MIN = 60_000
let t: TestDatabase
const lines: string[] = []
const log = createLogger(
  { level: 'trace' },
  new Writable({
    write(chunk, _enc, done) {
      lines.push(String(chunk))
      done()
    },
  }),
)
const providers = createProviders(readProviderSettings({ HANDYHUB_ENV: 'ci' }), { logger: log })
const worker = () =>
  createWorker({
    db: t.db,
    registry: createAutomationRegistry([codeDeliveryAutomation({ providers, codeKey: KEY })]),
    logger: log,
  })

beforeAll(async () => {
  t = await createTestDatabase()
})
afterAll(async () => {
  await t?.drop()
})

let seq = 0
const email = () => `customer-${++seq}@example.test`
const issue = (input: Partial<IssueInput> & { destination: string }, key = KEY) =>
  withTx(t.db, (tx) =>
    issueCode(tx, key, {
      purpose: 'contact_verification',
      channel: 'email',
      subjectRef: 'contact:synthetic-1',
      requestId: 'req-synthetic',
      ...input,
    }),
  )
const verify = (input: Partial<VerifyInput> & { destination: string; code: string }) =>
  withTx(t.db, (tx) =>
    verifyCode(tx, KEY, { purpose: 'contact_verification', subjectRef: 'contact:synthetic-1', ...input }),
  )
/** Runs the worker until no event or job is left. */
async function drain(): Promise<void> {
  const w = worker()
  for (let i = 0; i < 20; i++) {
    const r = await w.runOnce()
    if (r.dispatched + r.succeeded + r.retried + r.failed + r.cancelled === 0) return
  }
}
/** Delivers pending codes and returns the code last sent to a destination, read from the fake provider. */
async function deliveredCode(destination: string): Promise<string> {
  await drain()
  const sent = [
    ...(providers.fakes.email?.sent ?? []).filter((m) => m.to === destination).map((m) => m.text),
    ...(providers.fakes.sms?.sent ?? []).filter((m) => m.to === destination).map((m) => m.text),
  ]
  const m = /\b(\d{6})\b/.exec(sent.at(-1) ?? '')
  if (!m) throw new Error(`no code was delivered to ${destination}`)
  return m[1] as string
}
const NEUTRAL = { ok: false, reason: 'INVALID_CODE' }

describe('issuing and delivering codes (TSK-0016, HH-INT-13, OWN-DEC-96)', () => {
  it('issues a code with the configured 10-minute lifetime and delivers it by e-mail in English', async () => {
    const to = email()
    const before = Date.now()
    const r = await issue({ destination: `  ${to.toUpperCase()} ` })
    expect(r).toMatchObject({ status: 'issued', maskedDestination: `c***@example.test` })
    if (r.status !== 'issued') return
    expect(Math.round((r.expiresAt.getTime() - before) / MIN)).toBe(10)
    const code = await deliveredCode(to)
    const msg = providers.fakes.email?.sent.at(-1)
    expect(msg?.subject).toBe('Your HandyHub verification code')
    expect(msg?.text).toBe(
      `Your HandyHub verification code is ${code}. It expires in 10 minutes. If you did not ask for this code, you can ignore this message.`,
    )
    const row = await t.db
      .selectFrom('identity.verification_codes')
      .selectAll()
      .where('id', '=', r.codeId)
      .executeTakeFirstOrThrow()
    expect(row).toMatchObject({ delivery_state: 'sent', max_attempts: 5, destination: to })
    expect(await verify({ destination: to, code })).toMatchObject({ ok: true, codeId: r.codeId, channel: 'email' })
  })

  it('delivers by text through the SMS provider', async () => {
    const r = await issue({ channel: 'sms', destination: '+1 (502) 555-0142' })
    expect(r).toMatchObject({ status: 'issued', maskedDestination: '***0142' })
    const code = await deliveredCode('+15025550142')
    expect(providers.fakes.sms?.sent.at(-1)?.text).toBe(
      `HandyHub code: ${code}. It expires in 10 minutes. Do not share it.`,
    )
    expect(await verify({ destination: '+15025550142', code })).toMatchObject({ ok: true, channel: 'sms' })
  })

  it('a retried delivery sends the same code once; a used code is not sent again', async () => {
    const to = email()
    const r = await issue({ destination: to })
    const code = await deliveredCode(to)
    await verify({ destination: to, code })
    const sentBefore = providers.fakes.email?.sent.length
    await drain()
    expect(providers.fakes.email?.sent.length).toBe(sentBefore)
    if (r.status === 'issued') {
      const rows = await t.db.selectFrom('platform.jobs').select('state').where('target_id', '=', r.codeId).execute()
      expect(rows).toEqual([{ state: 'succeeded' }])
    }
  })

  it('a code consumed or superseded before its job runs is cancelled, not sent', async () => {
    const to = email()
    const first = await issue({ destination: to, now: new Date(Date.now() - 2 * MIN) })
    await issue({ destination: to })
    await drain()
    if (first.status !== 'issued') throw new Error('not issued')
    const row = await t.db
      .selectFrom('identity.verification_codes')
      .select('delivery_state')
      .where('id', '=', first.codeId)
      .executeTakeFirstOrThrow()
    expect(row.delivery_state).toBe('cancelled')
    expect(providers.fakes.email?.sent.filter((m) => m.to === to)).toHaveLength(1)
  })

  it('refuses an invalid destination, and is NOT CONFIGURED without a code key', async () => {
    expect(await issue({ destination: 'not-an-address' })).toEqual({ status: 'invalid_destination' })
    expect(await issue({ channel: 'sms', destination: '5025550100' })).toEqual({ status: 'invalid_destination' })
    const missing = readCodeKey({ HANDYHUB_ENV: 'staging' })
    expect(missing).toEqual({ state: 'not_configured', missing: ['CODE_HASH_KEY'] })
    expect(await issue({ destination: email() }, missing)).toEqual({
      status: 'not_configured',
      missing: ['CODE_HASH_KEY'],
    })
    expect(() => readCodeKey({ HANDYHUB_ENV: 'staging', CODE_HASH_KEY: 'short' })).toThrow(/at least 32/)
  })

  it('outside production a destination that is not an approved test destination is suppressed (RULE-SYNTHETIC-DATA)', async () => {
    const r = await issue({ destination: 'someone@real-domain-example.com' })
    await drain()
    if (r.status !== 'issued') throw new Error('not issued')
    const row = await t.db
      .selectFrom('identity.verification_codes')
      .select(['delivery_state', 'delivery_error'])
      .where('id', '=', r.codeId)
      .executeTakeFirstOrThrow()
    expect(row).toEqual({ delivery_state: 'suppressed', delivery_error: 'not_on_test_allowlist' })
  })
})

describe('expired, reused and over-limit codes fail with the same neutral error (TSK-0016, HH-ID-06, T18)', () => {
  it('a reused code fails', async () => {
    const to = email()
    await issue({ destination: to })
    const code = await deliveredCode(to)
    expect((await verify({ destination: to, code })).ok).toBe(true)
    expect(await verify({ destination: to, code })).toEqual(NEUTRAL)
  })

  it('an expired code fails after the configured 10 minutes', async () => {
    const to = email()
    await issue({ destination: to, now: new Date(Date.now() - 9 * MIN) })
    const code = await deliveredCode(to)
    expect(await verify({ destination: to, code, now: new Date(Date.now() + 2 * MIN) })).toEqual(NEUTRAL)
  })

  it('the code fails once its attempts are used up, even when the right code comes next', async () => {
    const to = email()
    await issue({ destination: to })
    const code = await deliveredCode(to)
    const wrong = code === '000000' ? '111111' : '000000'
    for (let i = 0; i < 5; i++) expect(await verify({ destination: to, code: wrong })).toEqual(NEUTRAL)
    expect(await verify({ destination: to, code })).toEqual(NEUTRAL)
  })

  it('a superseded code, another subject or purpose, an unknown destination and junk input all fail the same way', async () => {
    const to = email()
    await issue({ destination: to, now: new Date(Date.now() - MIN) })
    const old = await deliveredCode(to)
    await issue({ destination: to })
    const current = await deliveredCode(to)
    if (old !== current) expect(await verify({ destination: to, code: old })).toEqual(NEUTRAL)
    expect(await verify({ destination: to, code: current, subjectRef: 'contact:other' })).toEqual(NEUTRAL)
    expect(await verify({ destination: to, code: current, purpose: 'account_sign_in' })).toEqual(NEUTRAL)
    expect(await verify({ destination: email(), code: current })).toEqual(NEUTRAL)
    expect(await verify({ destination: to, code: 'abc' })).toEqual(NEUTRAL)
    expect((await verify({ destination: to, code: current })).ok).toBe(true)
  })

  it('a client address over its failure limit is refused without checking the code (HH-INT-11)', async () => {
    const to = email()
    await issue({ destination: to, clientIp: '198.51.100.7' })
    const code = await deliveredCode(to)
    for (let i = 0; i < 30; i++) await verify({ destination: email(), code: '123456', clientIp: '198.51.100.7' })
    expect(await verify({ destination: to, code, clientIp: '198.51.100.7' })).toEqual(NEUTRAL)
    expect((await verify({ destination: to, code, clientIp: '198.51.100.8' })).ok).toBe(true)
  })
})

describe('resend and issue limits (TSK-0016, HH-ID-06, HH-INT-11)', () => {
  it('a resend inside the cooldown is refused with the wait', async () => {
    const to = email()
    expect((await issue({ destination: to })).status).toBe('issued')
    expect(await issue({ destination: to })).toMatchObject({ status: 'rate_limited' })
  })

  it('more codes per destination or per client address in an hour than allowed are refused', async () => {
    const to = email()
    const base = Date.now() - 50 * MIN
    for (let i = 0; i < 5; i++)
      expect((await issue({ destination: to, now: new Date(base + i * MIN) })).status).toBe('issued')
    expect(await issue({ destination: to })).toEqual({ status: 'rate_limited', retryAfterSeconds: 3600 })
    for (let i = 0; i < 20; i++) await issue({ destination: email(), clientIp: '203.0.113.9' })
    expect(await issue({ destination: email(), clientIp: '203.0.113.9' })).toEqual({
      status: 'rate_limited',
      retryAfterSeconds: 3600,
    })
  })
})

describe('codes never appear in logs, the outbox or the database (TSK-0016, RULE-SERVER-AUTHZ)', () => {
  it('no log line, outbox payload, job row or code row contains a delivered code', async () => {
    const to = email()
    lines.length = 0
    await issue({ destination: to, clientIp: '192.0.2.10' })
    const code = await deliveredCode(to)
    await verify({ destination: to, code: '999999' })
    await verify({ destination: to, code })
    expect(lines.length).toBeGreaterThan(0)
    for (const line of lines) expect(line).not.toContain(code)
    for (const table of [
      'platform.outbox_events',
      'platform.jobs',
      'identity.verification_codes',
      'platform.audit_events',
    ]) {
      const dump = await sql<{
        j: string
      }>`SELECT coalesce(json_agg(x)::text, '') AS j FROM ${sql.raw(table)} x`.execute(t.db)
      expect(dump.rows[0]?.j, table).not.toContain(`"${code}"`)
      expect(dump.rows[0]?.j, table).not.toMatch(new RegExp(`[^0-9a-f]${code}[^0-9a-f]`))
    }
    const raw = await t.db
      .selectFrom('identity.verification_codes')
      .select('client_key')
      .where('destination', '=', to)
      .executeTakeFirstOrThrow()
    expect(raw.client_key).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('customer sessions (TSK-0016, HH-SEC-02, HH-ID-06, FACT-SESSION-TIMINGS)', () => {
  const start = (now = new Date(), extra = {}) =>
    withTx(t.db, (tx) =>
      startCustomerSession(tx, {
        contactRef: 'contact:synthetic-1',
        via: 'grant',
        projectIds: ['project-a'],
        verifiedAt: now,
        now,
        ...extra,
      }),
    )

  it('starts with the configured 30-minute idle and 8-hour maximum, storing only a token hash', async () => {
    const now = new Date()
    const s = await start(now)
    expect(s.idleMinutes).toBe(30)
    expect(s.expiresAt.getTime() - now.getTime()).toBe(8 * 60 * MIN)
    const row = await t.db
      .selectFrom('identity.customer_sessions')
      .selectAll()
      .where('id', '=', s.sessionId)
      .executeTakeFirstOrThrow()
    expect(row.token_hash).not.toBe(s.token)
    expect(JSON.stringify(row)).not.toContain(s.token)
    expect(await resolveCustomerSession(t.db, s.token)).toMatchObject({ id: s.sessionId, projectIds: ['project-a'] })
  })

  it('ends after 30 minutes idle and after 8 hours in total, even with activity', async () => {
    const t0 = new Date()
    const s = await start(t0)
    expect(await resolveCustomerSession(t.db, s.token, new Date(t0.getTime() + 29 * MIN))).not.toBeNull()
    expect(await resolveCustomerSession(t.db, s.token, new Date(t0.getTime() + 58 * MIN))).not.toBeNull()
    expect(await resolveCustomerSession(t.db, s.token, new Date(t0.getTime() + 89 * MIN))).toBeNull()
    const busy = await start(t0)
    for (let m = 25; m < 8 * 60; m += 25)
      await resolveCustomerSession(t.db, busy.token, new Date(t0.getTime() + m * MIN))
    expect(await resolveCustomerSession(t.db, busy.token, new Date(t0.getTime() + 8 * 60 * MIN + MIN))).toBeNull()
  })

  it('a revoked or rotated session never comes back; a bad token resolves to nothing', async () => {
    const s = await start()
    expect(await revokeCustomerSession(t.db, s.sessionId, 'signed_out')).toBe(true)
    expect(await resolveCustomerSession(t.db, s.token)).toBeNull()
    const a = await start()
    const b = await start(new Date(), { replaces: a.sessionId })
    expect(await resolveCustomerSession(t.db, a.token)).toBeNull()
    expect(await resolveCustomerSession(t.db, b.token)).not.toBeNull()
    expect(b.token).not.toBe(a.token)
    expect(await resolveCustomerSession(t.db, 'x'.repeat(43))).toBeNull()
    expect(await resolveCustomerSession(t.db, undefined)).toBeNull()
  })

  it('reads the timings from configuration, never from code (OWN-DEC-141)', async () => {
    const current = await t.db
      .selectFrom('platform.policy_version')
      .select('value')
      .where('key', '=', 'session.timings')
      .where('status', '=', 'active')
      .executeTakeFirstOrThrow()
    await recordPolicyVersion(t.db, {
      key: 'session.timings',
      value: { ...(current.value as Record<string, number>), customerSessionIdleMinutes: 5 } as never,
      sourceIds: ['OWN-DEC-141'],
      changedBy: 'staff-synthetic-owner',
      reason: 'Synthetic test change',
    })
    expect((await start()).idleMinutes).toBe(5)
    await recordPolicyVersion(t.db, {
      key: 'session.timings',
      value: current.value as never,
      sourceIds: ['OWN-DEC-141'],
      changedBy: 'staff-synthetic-owner',
      reason: 'Synthetic test restore',
    })
  })

  it('the cookie is host-only: __Host- prefix, Secure, HttpOnly, SameSite=Lax, Path=/ and no Domain (HH-ARC-06)', async () => {
    const now = new Date()
    const s = await start(now)
    const cookie = sessionCookie(s, now)
    expect(cookie).toBe(`__Host-hh_customer=${s.token}; Path=/; Max-Age=28800; Secure; HttpOnly; SameSite=Lax`)
    expect(cookie).not.toMatch(/domain=/i)
    expect(clearedSessionCookie()).toContain('Max-Age=0')
  })
})

// A synthetic customer route on the API contract: the customer's projects are payment summaries keyed by project.
const PROJECTS = new Set(['project-a', 'project-b'])
const PROJECT_MODULE: ApiModule = {
  name: 'synthetic-projects',
  routes: [
    {
      method: 'GET',
      path: '/synthetic/projects/:projectId/payments',
      operationId: 'getSyntheticProjectPayments',
      summary: 'Synthetic customer route (tests only)',
      description: 'Customer only; record scope: the verified project of the customer session.',
      actors: ['customer'],
      permission: 'payment.view',
      kind: 'read',
      idempotency: 'none',
      expectedVersion: 'none',
      rateLimit: 'none',
      audit: 'none',
      pagination: false,
      test: 'test/integration/customer-codes.test.ts',
      schema: {
        params: {
          type: 'object',
          additionalProperties: false,
          required: ['projectId'],
          properties: { projectId: { type: 'string' } },
        },
        response: { 200: { type: 'object', properties: { projectId: { type: 'string' } } } },
      },
      resource: async ({ req }) => {
        const { projectId } = req.params as { projectId: string }
        return PROJECTS.has(projectId) ? { projectId } : null
      },
      handler: async ({ req }) => ({
        body: { projectId: (req.params as { projectId: string }).projectId, secret: 'x' },
      }),
    },
  ],
}

describe('customer routes on the API contract (TSK-0016, RULE-SERVER-AUTHZ, T19)', () => {
  it('the session is the caller; a missing project and one outside the scope get the same 404', async () => {
    const app = await buildApp({
      config: testConfig(),
      api: { db: t.db, modules: [PROJECT_MODULE], resolveActor: customerSessionResolver(t.db) },
    })
    try {
      const s = await withTx(t.db, (tx) =>
        startCustomerSession(tx, {
          contactRef: 'contact:a',
          via: 'grant',
          projectIds: ['project-a'],
          verifiedAt: new Date(),
        }),
      )
      const get = (project: string, cookie?: string) =>
        app.inject({
          method: 'GET',
          url: `/api/v1/synthetic/projects/${project}/payments`,
          headers: cookie ? { cookie } : {},
        })
      const cookie = `__Host-hh_customer=${s.token}`
      const own = await get('project-a', cookie)
      expect(own.statusCode).toBe(200)
      expect(own.json()).toEqual({ projectId: 'project-a' })
      const other = await get('project-b', cookie)
      const missing = await get('project-zzz', cookie)
      expect([other.statusCode, missing.statusCode]).toEqual([404, 404])
      const strip = (b: { error: Record<string, unknown> }) => ({ ...b.error, requestId: undefined })
      expect(strip(other.json())).toEqual(strip(missing.json()))
      expect((await get('project-a')).statusCode).toBe(401)
      await revokeCustomerSession(t.db, s.sessionId, 'signed_out')
      expect((await get('project-a', cookie)).statusCode).toBe(401)
    } finally {
      await app.close()
    }
  })

  it('verification is fresh for 15 minutes after the code, then approvals need a new code (HH-ID-07)', async () => {
    const t0 = new Date()
    const s = await withTx(t.db, (tx) =>
      startCustomerSession(tx, {
        contactRef: 'contact:a',
        via: 'grant',
        projectIds: ['project-a'],
        verifiedAt: t0,
        now: t0,
      }),
    )
    const { customerActor } = await import('../../src/modules/identity/index.js')
    const session = await resolveCustomerSession(t.db, s.token, t0)
    if (!session) throw new Error('no session')
    expect(customerActor(session, new Date(t0.getTime() + 14 * MIN)).freshVerification).toBe(true)
    expect(customerActor(session, new Date(t0.getTime() + 16 * MIN)).freshVerification).toBe(false)
  })
})
