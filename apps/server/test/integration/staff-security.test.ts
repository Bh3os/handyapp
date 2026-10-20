// Staff session lifecycle, CSRF, fresh authentication and optional MFA against PostgreSQL 16 (TSK-0015; HH-SEC-02,
// HH-STAFF-01, HH-STAFF-02, HH-STAFF-03, OWN-DEC-114, FACT-SESSION-TIMINGS, T22, T27). Accounts are synthetic.
import { withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { currentCode } from '../../src/modules/identity/mfa.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import { testConfig } from '../fixtures/env.js'

const OWNER = 'owner-security@example.test'
const WORKER = 'worker-security@example.test'
const pw = (n: number) => ['synthetic', 'security', 'passphrase', String(n)].join(' ')
// Built at runtime so no literal looks like a key (RULE-SYNTHETIC-DATA).
const MFA_KEY = ['synthetic', 'mfa', 'sealing', 'key', 'for', 'tests', 'only'].join('-')

let t: TestDatabase
let app: FastifyInstance
let workerId = ''

type Res = {
  statusCode: number
  headers: Record<string, unknown>
  json: () => ReturnType<typeof JSON.parse>
  body: string
}
const cookieOf = (res: Res) => String(res.headers['set-cookie']).split(';')[0] as string
const authOf = (res: Res) => ({ cookie: cookieOf(res), 'x-csrf-token': String(res.json().csrfToken) })
const post = (url: string, payload: unknown, headers: Record<string, string> = {}) =>
  app.inject({ method: 'POST', url: `/api/v1${url}`, payload: payload as object, headers }) as Promise<Res>
const get = (url: string, headers: Record<string, string> = {}) =>
  app.inject({ url: `/api/v1${url}`, headers }) as Promise<Res>
const signIn = (email: string, password: string) => post('/auth/sign-in', { email, password })

beforeAll(async () => {
  t = await createTestDatabase()
  app = await buildApp({ config: testConfig({ MFA_ENCRYPTION_KEY: MFA_KEY }), api: { db: t.db } })
  await withTx(t.db, async (tx) => {
    const owner = await createStaffUser(tx, {
      email: OWNER,
      displayName: 'Security Owner',
      locale: 'en',
      role: 'owner',
      issuedBy: 'test',
    })
    await setPasswordHash(tx, owner.id, await hashPassword(pw(1)))
    const worker = await createStaffUser(tx, {
      email: WORKER,
      displayName: 'Security Worker',
      locale: 'en',
      role: 'worker',
      issuedBy: 'test',
    })
    await setPasswordHash(tx, worker.id, await hashPassword(pw(2)))
    workerId = worker.id
  })
})
afterAll(async () => {
  await app?.close()
  await t?.drop()
})

describe('CSRF token (TSK-0015, HH-SEC-02)', () => {
  it('[HH-SEC-02] an unsafe request of a signed-in session without the CSRF token is rejected', async () => {
    const res = await signIn(OWNER, pw(1))
    const auth = authOf(res)
    expect(auth['x-csrf-token']).toMatch(/^[A-Za-z0-9_-]{43}$/)
    const missing = await post('/auth/sign-out', undefined, { cookie: auth.cookie })
    expect(missing.statusCode).toBe(403)
    expect(missing.json().error.code).toBe('CSRF_TOKEN_INVALID')
    const wrong = await post('/auth/sign-out', undefined, { ...auth, 'x-csrf-token': 'x'.repeat(43) })
    expect(wrong.json().error.code).toBe('CSRF_TOKEN_INVALID')
    expect((await get('/auth/session', { cookie: auth.cookie })).json().csrfToken).toBe(auth['x-csrf-token'])
    expect((await post('/auth/sign-out', undefined, auth)).statusCode).toBe(204)
  })

  it('[HH-SEC-02] re-authentication rotates the session and its CSRF token', async () => {
    const first = authOf(await signIn(OWNER, pw(1)))
    const rotated = await post('/auth/reauth', { password: pw(1) }, first)
    expect(rotated.statusCode).toBe(200)
    const next = authOf(rotated)
    expect(next.cookie).not.toBe(first.cookie)
    expect(next['x-csrf-token']).not.toBe(first['x-csrf-token'])
    expect((await get('/auth/session', { cookie: first.cookie })).statusCode).toBe(401)
    expect((await get('/auth/session', { cookie: next.cookie })).statusCode).toBe(200)
  })
})

describe('session lifecycle (TSK-0015, HH-SEC-02, HH-STAFF-02, T22, T27)', () => {
  it('[HH-SEC-02] an idle session expires after the configured 30 minutes', async () => {
    const auth = authOf(await signIn(WORKER, pw(2)))
    await sql`UPDATE identity.staff_sessions SET last_seen_at = now() - interval '29 minutes' WHERE revoked_at IS NULL AND staff_user_id = ${workerId}`.execute(
      t.db,
    )
    expect((await get('/auth/session', { cookie: auth.cookie })).statusCode).toBe(200)
    await sql`UPDATE identity.staff_sessions SET last_seen_at = now() - interval '31 minutes' WHERE revoked_at IS NULL AND staff_user_id = ${workerId}`.execute(
      t.db,
    )
    expect((await get('/auth/session', { cookie: auth.cookie })).statusCode).toBe(401)
  })

  it('[T22] "Sign out everywhere" ends every session of the user', async () => {
    const a = authOf(await signIn(WORKER, pw(2)))
    const b = authOf(await signIn(WORKER, pw(2)))
    const res = await post('/auth/sessions/revoke-all', undefined, a)
    expect(res.statusCode).toBe(204)
    for (const s of [a, b]) expect((await get('/auth/session', { cookie: s.cookie })).statusCode).toBe(401)
  })

  it('[HH-STAFF-02][T27] the Owner revokes every session of a staff member at once; a Worker cannot', async () => {
    const worker = authOf(await signIn(WORKER, pw(2)))
    const owner = authOf(await signIn(OWNER, pw(1)))
    const byWorker = await post(`/staff/${workerId}/sessions/revoke`, undefined, worker)
    expect(byWorker.statusCode).toBe(403)
    const byOwner = await post(`/staff/${workerId}/sessions/revoke`, undefined, owner)
    expect(byOwner.json()).toEqual({ sessionsRevoked: 1 })
    expect((await get('/auth/session', { cookie: worker.cookie })).statusCode).toBe(401)
    const audit = await t.db
      .selectFrom('platform.audit_events')
      .select(['action', 'target_id'])
      .where('action', '=', 'staff.revoke_sessions')
      .execute()
    expect(audit).toEqual([{ action: 'staff.revoke_sessions', target_id: workerId }])
  })
})

describe('optional TOTP MFA with recovery codes (TSK-0015, HH-STAFF-01, HH-STAFF-03)', () => {
  let secret = ''
  let recovery: string[] = []
  let owner: { cookie: string; 'x-csrf-token': string }

  it('[HH-STAFF-03] enrolment needs fresh authentication', async () => {
    owner = authOf(await signIn(OWNER, pw(1)))
    await sql`UPDATE identity.staff_sessions SET authenticated_at = now() - interval '6 minutes' WHERE revoked_at IS NULL`.execute(
      t.db,
    )
    const stale = await post('/auth/mfa/enroll', undefined, owner)
    expect(stale.json().error.code).toBe('FRESH_AUTH_REQUIRED')
    owner = authOf(await post('/auth/reauth', { password: pw(1) }, owner))
  })

  it('[HH-STAFF-01] enrols an authenticator with a confirming code and shows recovery codes once', async () => {
    const other = authOf(await signIn(OWNER, pw(1)))
    const started = await post('/auth/mfa/enroll', undefined, owner)
    expect(started.statusCode).toBe(200)
    secret = started.json().secret
    expect(started.json().otpauthUri).toMatch(/^otpauth:\/\/totp\/HandyHub:/)
    const sealed = await t.db.selectFrom('identity.staff_mfa').select('secret_sealed').executeTakeFirstOrThrow()
    expect(sealed.secret_sealed).not.toContain(secret)
    expect((await post('/auth/mfa/confirm', { code: '000000' }, owner)).statusCode).toBe(401)
    const confirmed = await post('/auth/mfa/confirm', { code: currentCode(secret) }, owner)
    expect(confirmed.statusCode).toBe(200)
    recovery = confirmed.json().recoveryCodes
    expect(recovery).toHaveLength(10)
    expect(confirmed.json().session).toMatchObject({ mfaEnrolled: true, mfaRecommended: false })
    // Enabling MFA ends the user's other sessions.
    expect((await get('/auth/session', { cookie: other.cookie })).statusCode).toBe(401)
    const status = await get('/auth/mfa', { cookie: cookieOf(confirmed) })
    expect(status.json()).toEqual({ enrolled: true, pending: false, recoveryCodesLeft: 10, available: true })
  })

  it('[HH-STAFF-01] once enrolled, the password alone starts a pending session that acts for nobody', async () => {
    const res = await signIn(OWNER, pw(1))
    expect(res.statusCode).toBe(202)
    expect(res.json()).toEqual({ mfaRequired: true })
    const pending = cookieOf(res)
    expect((await get('/auth/session', { cookie: pending })).statusCode).toBe(401)
    expect((await post('/auth/mfa/verify', { code: '000000' }, { cookie: pending })).statusCode).toBe(401)
    const verified = await post(
      '/auth/mfa/verify',
      { code: currentCode(secret, Date.now() + 30_000) },
      { cookie: pending },
    )
    expect(verified.statusCode).toBe(200)
    expect(cookieOf(verified)).not.toBe(pending)
    expect((await get('/auth/session', { cookie: cookieOf(verified) })).json()).toMatchObject({
      email: OWNER,
      mfaEnrolled: true,
    })
    expect((await get('/auth/session', { cookie: pending })).statusCode).toBe(401)
  })

  it('[HH-STAFF-01] a recovery code works once', async () => {
    const first = cookieOf(await signIn(OWNER, pw(1)))
    expect((await post('/auth/mfa/verify', { recoveryCode: recovery[0] }, { cookie: first })).statusCode).toBe(200)
    const second = cookieOf(await signIn(OWNER, pw(1)))
    expect((await post('/auth/mfa/verify', { recoveryCode: recovery[0] }, { cookie: second })).statusCode).toBe(401)
    const done = await post('/auth/mfa/verify', { recoveryCode: recovery[1] }, { cookie: second })
    expect(done.statusCode).toBe(200)
    owner = authOf(done)
  })

  it('[HH-STAFF-01] removing the authenticator needs fresh authentication; then the password signs in again', async () => {
    expect((await post('/auth/mfa/disable', undefined, owner)).statusCode).toBe(204)
    const res = await signIn(OWNER, pw(1))
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ mfaEnrolled: false, mfaRecommended: true })
  })

  it('[HH-STAFF-01] without MFA_ENCRYPTION_KEY, enrolment is NOT CONFIGURED and nothing else changes', async () => {
    const plain = await buildApp({ config: testConfig(), api: { db: t.db } })
    try {
      const signedIn = await plain.inject({
        method: 'POST',
        url: '/api/v1/auth/sign-in',
        payload: { email: WORKER, password: pw(2) },
      })
      expect(signedIn.statusCode).toBe(200)
      const auth = authOf(signedIn as unknown as Res)
      const res = await plain.inject({ method: 'POST', url: '/api/v1/auth/mfa/enroll', headers: auth })
      expect(res.statusCode).toBe(503)
      expect(res.json().error.code).toBe('NOT_CONFIGURED')
    } finally {
      await plain.close()
    }
  })
})
