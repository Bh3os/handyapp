// Staff email-and-password sign-in, invites and password reset against PostgreSQL 16 (TSK-0014; HH-STAFF-01,
// HH-SEC-02, OWN-DEC-114, FACT-SESSION-TIMINGS, T22, T26, T74). Accounts, emails and passwords are synthetic.
import { withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { buildAutomations } from '../../src/automations.js'
import { ensureBootstrapOwner } from '../../src/modules/identity/accounts.js'
import { createAutomationRegistry } from '../../src/platform/automation.js'
import { createWorker, type Worker } from '../../src/platform/jobs.js'
import { runWithContext } from '../../src/platform/request-context.js'
import { createProviders, type Providers } from '../../src/providers/index.js'
import { readProviderSettings } from '../../src/providers/settings.js'
import { testConfig } from '../fixtures/env.js'

const OWNER = 'owner-synthetic@example.test'
const WORKER = 'worker-synthetic@example.test'
// Built at runtime so no literal looks like a credential (RULE-SYNTHETIC-DATA).
const pw = (n: number) => ['synthetic', 'staff', 'passphrase', 'number', String(n)].join(' ')

let t: TestDatabase
let app: FastifyInstance
let providers: Providers
let worker: Worker

beforeAll(async () => {
  t = await createTestDatabase()
  app = await buildApp({ config: testConfig(), api: { db: t.db } })
  providers = createProviders(
    readProviderSettings({ HANDYHUB_ENV: 'ci', TEST_EMAIL_DESTINATIONS: [OWNER, WORKER].join(',') }),
  )
  worker = createWorker({
    db: t.db,
    registry: createAutomationRegistry(buildAutomations({ providers, staffAppUrl: 'http://127.0.0.1:4310/staff' })),
  })
})
afterAll(async () => {
  await app?.close()
  await t?.drop()
})

const sent = () => providers.fakes.email?.sent ?? []
function lastLink(to: string, kind: 'invite' | 'reset'): string {
  const mail = [...sent()].reverse().find((m) => m.to === to)
  const m = mail ? new RegExp(`/staff/${kind}/([A-Za-z0-9_-]{43})`).exec(mail.text) : null
  if (!m?.[1]) throw new Error(`no ${kind} link for ${to}`)
  return m[1]
}
const post = (url: string, payload: unknown, headers: Record<string, string> = {}) =>
  app.inject({ method: 'POST', url: `/api/v1${url}`, payload: payload as object, headers })
const cookieOf = (res: { headers: Record<string, unknown> }) =>
  String(res.headers['set-cookie']).split(';')[0] as string

async function signIn(email: string, password: string) {
  return post('/auth/sign-in', { email, password })
}

describe('first Owner bootstrap and invite link (TSK-0014, HH-STAFF-01)', () => {
  it('[HH-STAFF-01] creates the first Owner only while none exists and emails one invite', async () => {
    const run = () =>
      runWithContext({ requestId: 'test-bootstrap-0001' }, () =>
        withTx(t.db, (tx) =>
          ensureBootstrapOwner(tx, { email: OWNER, displayName: 'Synthetic Owner', requestId: 'test-bootstrap-0001' }),
        ),
      )
    expect(await run()).toBe('created')
    expect(await run()).toBe('present')
    await worker.runOnce()
    expect(sent().filter((m) => m.to === OWNER)).toHaveLength(1)
    expect(sent()[0]?.subject).toBe('Your HandyHub staff account')
    const stored = await t.db
      .selectFrom('identity.staff_links')
      .select(['token_hash', 'delivered_at'])
      .executeTakeFirstOrThrow()
    expect(stored.token_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(await t.db.selectFrom('platform.outbox_events').select('payload').execute())).not.toContain(
      lastLink(OWNER, 'invite'),
    )
  })

  it('[HH-STAFF-01][HH-SEC-02] a weak password is refused and keeps the link; the link then works once', async () => {
    const token = lastLink(OWNER, 'invite')
    const weak = await post('/auth/password/set', { token, password: 'short one' })
    expect(weak.statusCode).toBe(400)
    expect(weak.json().error.fieldErrors[0]).toMatchObject({ field: 'body.password', code: 'minLength' })
    const common = await post('/auth/password/set', { token, password: 'passwordpassword' })
    expect(common.json().error.fieldErrors[0]).toMatchObject({ code: 'passwordCommon' })
    const ok = await post('/auth/password/set', { token, password: pw(1) })
    expect(ok.statusCode).toBe(200)
    const again = await post('/auth/password/set', { token, password: pw(2) })
    expect(again.statusCode).toBe(410)
    expect(again.json().error.code).toBe('LINK_INVALID')
    const hash = await t.db.selectFrom('identity.auth_identities').select('password_hash').executeTakeFirstOrThrow()
    expect(hash.password_hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/)
  })
})

describe('sign-in (TSK-0014, HH-STAFF-01, HH-SEC-02)', () => {
  it('[HH-STAFF-01] a wrong password and an unknown email get the same answer; both are audited', async () => {
    const wrong = await signIn(OWNER, pw(9))
    const unknown = await signIn('nobody-synthetic@example.test', pw(9))
    for (const res of [wrong, unknown]) {
      expect(res.statusCode).toBe(401)
      expect(res.headers['set-cookie']).toBeUndefined()
    }
    const strip = (b: { error: Record<string, unknown> }) => ({ ...b.error, requestId: '' })
    expect(strip(wrong.json())).toEqual(strip(unknown.json()))
    expect(wrong.json().error).toMatchObject({
      code: 'INVALID_CREDENTIALS',
      message: 'The email or password is not correct.',
    })
    const denied = await t.db
      .selectFrom('platform.audit_events')
      .select(['action', 'result', 'summary'])
      .where('action', '=', 'staff.sign_in')
      .where('result', '=', 'denied')
      .execute()
    expect(denied).toHaveLength(2)
    expect(JSON.stringify(denied)).not.toContain('synthetic staff passphrase')
  })

  it('[HH-STAFF-01][HH-SEC-02] signs in with a new host-only, HttpOnly, SameSite session; never returns a hash', async () => {
    const first = await signIn(OWNER, pw(1))
    expect(first.statusCode).toBe(200)
    expect(String(first.headers['set-cookie'])).toMatch(
      /^hh_staff=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; SameSite=Strict$/,
    )
    expect(first.json()).toMatchObject({ email: OWNER, roles: ['owner'], locale: 'en', mfaRecommended: true })
    expect(first.body).not.toContain('argon2')
    const second = await signIn(OWNER, pw(1))
    expect(cookieOf(second)).not.toBe(cookieOf(first))
    const me = await app.inject({ url: '/api/v1/auth/session', headers: { cookie: cookieOf(second) } })
    expect(me.json()).toMatchObject({ email: OWNER, displayName: 'Synthetic Owner' })
  })

  it('[HH-SEC-02] a cross-site write is refused (CSRF)', async () => {
    const res = await post('/auth/sign-in', { email: OWNER, password: pw(1) }, { 'sec-fetch-site': 'cross-site' })
    expect(res.statusCode).toBe(403)
    const origin = await post('/auth/sign-in', { email: OWNER, password: pw(1) }, { origin: 'https://evil.example' })
    expect(origin.statusCode).toBe(403)
  })
})

describe('invites by the Owner (TSK-0014, HH-STAFF-01, T26)', () => {
  let ownerCookie: string

  it('[HH-STAFF-01] the Owner invites a Worker, who sets a password and signs in', async () => {
    ownerCookie = cookieOf(await signIn(OWNER, pw(1)))
    const invite = await post(
      '/staff/invitations',
      { email: WORKER, displayName: 'Synthetic Worker', role: 'worker', locale: 'es', reason: 'New field worker' },
      { cookie: ownerCookie, 'idempotency-key': 'synthetic-invite-0001' },
    )
    expect(invite.statusCode).toBe(201)
    expect(invite.json()).toMatchObject({ status: 'invited' })
    await worker.runOnce()
    const mail = sent().find((m) => m.to === WORKER)
    expect(mail?.subject).toBe('Su cuenta del personal de HandyHub')
    expect((await post('/auth/password/set', { token: lastLink(WORKER, 'invite'), password: pw(3) })).statusCode).toBe(
      200,
    )
    const signedIn = await signIn(WORKER, pw(3))
    expect(signedIn.json()).toMatchObject({ roles: ['worker'], locale: 'es', mfaRecommended: false })
    const duplicate = await post(
      '/staff/invitations',
      { email: WORKER, displayName: 'Again', role: 'worker', reason: 'Duplicate' },
      { cookie: ownerCookie, 'idempotency-key': 'synthetic-invite-0002' },
    )
    expect(duplicate.json().error.code).toBe('CONFLICT')
  })

  it('[T26][RULE-SERVER-AUTHZ] a Worker cannot invite; a guest is unauthenticated', async () => {
    const workerCookie = cookieOf(await signIn(WORKER, pw(3)))
    const asWorker = await post(
      '/staff/invitations',
      { email: 'x-synthetic@example.test', displayName: 'X', role: 'owner', reason: 'Not allowed' },
      { cookie: workerCookie, 'idempotency-key': 'synthetic-invite-0003' },
    )
    expect(asWorker.statusCode).toBe(403)
    expect(asWorker.json().error.message).toBe('No tiene permiso para hacer esto.')
    const asGuest = await post(
      '/staff/invitations',
      { email: 'x@example.test', displayName: 'X', role: 'owner', reason: 'Not allowed' },
      { 'idempotency-key': 'synthetic-invite-0004' },
    )
    expect(asGuest.statusCode).toBe(401)
  })

  it('[HH-STAFF-03] inviting needs fresh authentication; re-entering the password restores it', async () => {
    await sql`UPDATE identity.staff_sessions SET authenticated_at = now() - interval '10 minutes'`.execute(t.db)
    const stale = await post(
      '/staff/invitations',
      {
        email: 'office-synthetic@example.test',
        displayName: 'Synthetic Office',
        role: 'office',
        reason: 'Office help',
      },
      { cookie: ownerCookie, 'idempotency-key': 'synthetic-invite-0005' },
    )
    expect(stale.json().error.code).toBe('FRESH_AUTH_REQUIRED')
    expect((await post('/auth/reauth', { password: pw(9) }, { cookie: ownerCookie })).statusCode).toBe(401)
    expect((await post('/auth/reauth', { password: pw(1) }, { cookie: ownerCookie })).statusCode).toBe(204)
    const fresh = await post(
      '/staff/invitations',
      {
        email: 'office-synthetic@example.test',
        displayName: 'Synthetic Office',
        role: 'office',
        reason: 'Office help',
      },
      { cookie: ownerCookie, 'idempotency-key': 'synthetic-invite-0006' },
    )
    expect(fresh.statusCode).toBe(201)
  })
})

describe('forgot password, reset, sign-out and expiry (TSK-0014, HH-STAFF-01, T22)', () => {
  it('[HH-STAFF-01] "Forgot password?" answers the same for a known and an unknown email', async () => {
    const before = sent().length
    const known = await post('/auth/password/forgot', { email: OWNER.toUpperCase() })
    const unknown = await post('/auth/password/forgot', { email: 'nobody-synthetic@example.test' })
    expect([known.statusCode, unknown.statusCode]).toEqual([202, 202])
    expect(known.body).toBe(unknown.body)
    await worker.runOnce()
    const resets = sent()
      .slice(before)
      .filter((m) => m.subject === 'Reset your HandyHub staff password')
    expect(resets.map((m) => m.to)).toEqual([OWNER])
  })

  it('[HH-STAFF-01][T22] a reset revokes every session; the person signs in again with the new password', async () => {
    const a = cookieOf(await signIn(OWNER, pw(1)))
    const b = cookieOf(await signIn(OWNER, pw(1)))
    expect((await post('/auth/password/set', { token: lastLink(OWNER, 'reset'), password: pw(4) })).statusCode).toBe(
      200,
    )
    for (const cookie of [a, b]) {
      const me = await app.inject({ url: '/api/v1/auth/session', headers: { cookie } })
      expect(me.statusCode).toBe(401)
    }
    expect((await signIn(OWNER, pw(1))).statusCode).toBe(401)
    expect((await signIn(OWNER, pw(4))).statusCode).toBe(200)
  })

  it('[T22] sign-out ends the session on the server and clears the cookie', async () => {
    const cookie = cookieOf(await signIn(OWNER, pw(4)))
    const out = await post('/auth/sign-out', undefined, { cookie })
    expect(out.statusCode).toBe(204)
    expect(String(out.headers['set-cookie'])).toContain('Max-Age=0')
    expect((await app.inject({ url: '/api/v1/auth/session', headers: { cookie } })).statusCode).toBe(401)
  })

  it('[HH-SEC-02] a session idle for longer than the configured 30 minutes is refused', async () => {
    const cookie = cookieOf(await signIn(OWNER, pw(4)))
    await sql`UPDATE identity.staff_sessions SET last_seen_at = now() - interval '31 minutes' WHERE revoked_at IS NULL`.execute(
      t.db,
    )
    expect((await app.inject({ url: '/api/v1/auth/session', headers: { cookie } })).statusCode).toBe(401)
  })

  it('[HH-SEC-02] repeated failed sign-ins for one account are rate limited', async () => {
    const email = 'limited-synthetic@example.test'
    const codes: number[] = []
    for (let i = 0; i < 11; i++) codes.push((await signIn(email, pw(8))).statusCode)
    expect(codes.slice(0, 10).every((c) => c === 401)).toBe(true)
    const limited = await signIn(email, pw(8))
    expect(limited.statusCode).toBe(429)
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0)
  })

  it('[T74][RULE-SERVER-AUTHZ] audit events and the outbox hold no password, hash or token', async () => {
    const events = JSON.stringify(await t.db.selectFrom('platform.audit_events').selectAll().execute())
    const outboxRows = JSON.stringify(await t.db.selectFrom('platform.outbox_events').selectAll().execute())
    for (const text of [events, outboxRows]) {
      expect(text).not.toMatch(/argon2|passphrase/)
      for (const m of sent())
        expect(text).not.toContain(/\/(invite|reset)\/([A-Za-z0-9_-]{43})/.exec(m.text)?.[2] ?? '@@')
    }
    const actions = new Set(
      (await t.db.selectFrom('platform.audit_events').select('action').execute()).map((e) => e.action),
    )
    for (const a of [
      'staff.invite',
      'staff.password_set',
      'staff.sign_in',
      'staff.sign_out',
      'staff.password_reset_request',
    ])
      expect(actions).toContain(a)
  })
})
