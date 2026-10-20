// Staff app shell data against PostgreSQL 16 (TSK-0040; HH-STAFF-06, HH-OPS-04, HH-LANG-03, RULE-SERVER-AUTHZ):
// navigation by role in every session response, and the staff locale stored per staff identity. Synthetic accounts.
import { withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import { testConfig } from '../fixtures/env.js'

const pw = (n: number) => ['synthetic', 'shell', 'passphrase', 'number', String(n)].join(' ')
const ROLES = ['owner', 'office', 'estimator', 'worker'] as const

let t: TestDatabase
let app: FastifyInstance

beforeAll(async () => {
  t = await createTestDatabase()
  app = await buildApp({ config: testConfig(), api: { db: t.db } })
  const hash = await hashPassword(pw(1))
  await withTx(t.db, async (tx) => {
    for (const role of ROLES) {
      const user = await createStaffUser(tx, {
        email: `${role}-shell@example.test`,
        displayName: `Synthetic ${role}`,
        locale: 'en',
        role,
        issuedBy: 'test',
      })
      await setPasswordHash(tx, user.id, hash)
    }
  })
})
afterAll(async () => {
  await app?.close()
  await t?.drop()
})

const signIn = (email: string, password = pw(1)) =>
  app.inject({ method: 'POST', url: '/api/v1/staff/auth/sign-in', payload: { email, password } })
const cookieOf = (res: { headers: Record<string, unknown> }) =>
  String(res.headers['set-cookie']).split(';')[0] as string

describe('navigation by role (TSK-0040, HH-STAFF-06)', () => {
  it('[HH-STAFF-06] each role signs in to its own menu and home, and the session repeats it', async () => {
    const homes: Record<string, string | null> = {}
    for (const role of ROLES) {
      const res = await signIn(`${role}-shell@example.test`)
      expect(res.statusCode).toBe(200)
      const nav = res.json().navigation as { home: string | null; items: string[]; search: string[] }
      homes[role] = nav.home
      const again = await app.inject({
        method: 'GET',
        url: '/api/v1/staff/auth/session',
        headers: { cookie: cookieOf(res) },
      })
      expect(again.json().navigation).toEqual(nav)
      if (role === 'worker') expect(nav).toEqual({ home: 'my-day', items: ['my-day'], search: [] })
      else expect(nav.items).toContain('requests')
      if (role !== 'owner') expect(nav.items).not.toContain('staff')
    }
    expect(homes).toEqual({ owner: 'queue', office: 'queue', estimator: 'queue', worker: 'my-day' })
  })

  it('[RULE-SERVER-AUTHZ] the menu is only a convenience: a worker is still refused an Owner route', async () => {
    const res = await signIn('worker-shell@example.test')
    const owner = await signIn('owner-shell@example.test')
    const refused = await app.inject({
      method: 'POST',
      url: `/api/v1/staff/${owner.json().staffUserId}/sessions/revoke`,
      headers: { cookie: cookieOf(res), 'x-csrf-token': res.json().csrfToken },
      payload: {},
    })
    expect([403, 404]).toContain(refused.statusCode)
  })
})

describe('staff locale stored per staff identity (TSK-0040, HH-OPS-04)', () => {
  it('[HH-OPS-04][T70] the switch is saved on the staff identity, follows the person to a new session and is audited', async () => {
    const first = await signIn('office-shell@example.test')
    const auth = { cookie: cookieOf(first), 'x-csrf-token': first.json().csrfToken }
    const put = (locale: string, headers: Record<string, string> = auth) =>
      app.inject({ method: 'PUT', url: '/api/v1/staff/auth/session/locale', headers, payload: { locale } })

    expect((await put('fr')).statusCode).toBe(400)
    // Unsafe requests of a staff session need its CSRF token (TSK-0015).
    expect((await put('es', { cookie: auth.cookie })).statusCode).toBe(403)

    const changed = await put('es')
    expect(changed.statusCode).toBe(200)
    expect(changed.json()).toMatchObject({ locale: 'es', email: 'office-shell@example.test' })
    expect(changed.json().navigation.home).toBe('queue')
    const same = await app.inject({ method: 'GET', url: '/api/v1/staff/auth/session', headers: { cookie: auth.cookie } })
    expect(same.json().locale).toBe('es')

    // Another device: a new sign-in starts in the stored locale.
    const other = await signIn('office-shell@example.test')
    expect(other.json().locale).toBe('es')

    const stored = await t.db
      .selectFrom('identity.staff_users')
      .select('locale')
      .where('email', '=', 'office-shell@example.test')
      .executeTakeFirstOrThrow()
    expect(stored.locale).toBe('es')
    const events = await t.db
      .selectFrom('platform.audit_events')
      .select(['action', 'summary'])
      .where('action', '=', 'staff.locale_change')
      .execute()
    expect(events.map((e) => e.summary)).toEqual([{ from: 'en', to: 'es' }])

    expect((await put('en')).json().locale).toBe('en')
  })

  it('[HH-OPS-04] only the signed-in person changes their own locale; no session, no change', async () => {
    const res = await app.inject({ method: 'PUT', url: '/api/v1/staff/auth/session/locale', payload: { locale: 'es' } })
    expect(res.statusCode).toBe(401)
    const owner = await t.db
      .selectFrom('identity.staff_users')
      .select('locale')
      .where('email', '=', 'owner-shell@example.test')
      .executeTakeFirstOrThrow()
    expect(owner.locale).toBe('en')
  })
})
