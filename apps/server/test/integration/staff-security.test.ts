// Staff session lifecycle, CSRF and fresh authentication against PostgreSQL 16 (TSK-0015; HH-SEC-02, HH-STAFF-01,
// HH-STAFF-02, HH-STAFF-03, OWN-DEC-114, FACT-SESSION-TIMINGS, T22, T27). Every sign-in completes the mandatory second
// factor (TSK-0154; its own tests are staff-mfa.test.ts). Accounts are synthetic.
import { withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import { testConfig } from '../fixtures/env.js'
import { signInWithMfa } from '../fixtures/staff-mfa.js'

const OWNER = 'owner-security@example.test'
const WORKER = 'worker-security@example.test'
const pw = (n: number) => ['synthetic', 'security', 'passphrase', String(n)].join(' ')

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
const signIn = (email: string, password: string) =>
  signInWithMfa(app, {
    method: 'POST',
    url: '/api/v1/staff/auth/sign-in',
    payload: { email, password },
  }) as Promise<Res>

beforeAll(async () => {
  t = await createTestDatabase()
  app = await buildApp({ config: testConfig(), api: { db: t.db } })
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
    const missing = await post('/staff/auth/sign-out', undefined, { cookie: auth.cookie })
    expect(missing.statusCode).toBe(403)
    expect(missing.json().error.code).toBe('CSRF_TOKEN_INVALID')
    const wrong = await post('/staff/auth/sign-out', undefined, { ...auth, 'x-csrf-token': 'x'.repeat(43) })
    expect(wrong.json().error.code).toBe('CSRF_TOKEN_INVALID')
    expect((await get('/staff/auth/session', { cookie: auth.cookie })).json().csrfToken).toBe(auth['x-csrf-token'])
    expect((await post('/staff/auth/sign-out', undefined, auth)).statusCode).toBe(204)
  })

  it('[HH-SEC-02] re-authentication rotates the session and its CSRF token', async () => {
    const first = authOf(await signIn(OWNER, pw(1)))
    const rotated = await post('/staff/auth/reauth', { password: pw(1) }, first)
    expect(rotated.statusCode).toBe(200)
    const next = authOf(rotated)
    expect(next.cookie).not.toBe(first.cookie)
    expect(next['x-csrf-token']).not.toBe(first['x-csrf-token'])
    expect((await get('/staff/auth/session', { cookie: first.cookie })).statusCode).toBe(401)
    expect((await get('/staff/auth/session', { cookie: next.cookie })).statusCode).toBe(200)
  })
})

describe('session lifecycle (TSK-0015, HH-SEC-02, HH-STAFF-02, T22, T27)', () => {
  it('[HH-SEC-02] an idle session expires after the configured 30 minutes', async () => {
    const auth = authOf(await signIn(WORKER, pw(2)))
    await sql`UPDATE identity.staff_sessions SET last_seen_at = now() - interval '29 minutes' WHERE revoked_at IS NULL AND staff_user_id = ${workerId}`.execute(
      t.db,
    )
    expect((await get('/staff/auth/session', { cookie: auth.cookie })).statusCode).toBe(200)
    await sql`UPDATE identity.staff_sessions SET last_seen_at = now() - interval '31 minutes' WHERE revoked_at IS NULL AND staff_user_id = ${workerId}`.execute(
      t.db,
    )
    expect((await get('/staff/auth/session', { cookie: auth.cookie })).statusCode).toBe(401)
  })

  it('[T22] "Sign out everywhere" ends every session of the user', async () => {
    const a = authOf(await signIn(WORKER, pw(2)))
    const b = authOf(await signIn(WORKER, pw(2)))
    const res = await post('/staff/auth/sessions/revoke-all', undefined, a)
    expect(res.statusCode).toBe(204)
    for (const s of [a, b]) expect((await get('/staff/auth/session', { cookie: s.cookie })).statusCode).toBe(401)
  })

  it('[HH-STAFF-02][T27] the Owner revokes every session of a staff member at once; a Worker cannot', async () => {
    const worker = authOf(await signIn(WORKER, pw(2)))
    const owner = authOf(await signIn(OWNER, pw(1)))
    const byWorker = await post(`/staff/${workerId}/sessions/revoke`, undefined, worker)
    expect(byWorker.statusCode).toBe(403)
    const byOwner = await post(`/staff/${workerId}/sessions/revoke`, undefined, owner)
    expect(byOwner.json()).toEqual({ sessionsRevoked: 1 })
    expect((await get('/staff/auth/session', { cookie: worker.cookie })).statusCode).toBe(401)
    const audit = await t.db
      .selectFrom('platform.audit_events')
      .select(['action', 'target_id'])
      .where('action', '=', 'staff.revoke_sessions')
      .execute()
    expect(audit).toEqual([{ action: 'staff.revoke_sessions', target_id: workerId }])
  })
})
