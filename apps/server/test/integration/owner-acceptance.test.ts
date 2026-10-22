// Owner Acceptance Testing accounts against PostgreSQL 16 (TSK-0142; HH-OPS-06, OWN-DEC-191, HH-OPS-05, T26,
// RULE-SYNTHETIC-DATA, RULE-SERVER-AUTHZ). One fictional account per role the Owner tests with, on the reserved
// example.test domain; staff accounts are invited (no password is ever set or returned), the Customer is a registered,
// reusable account, the Guest has none. Every key and password is built at runtime.
import { randomUUID } from 'node:crypto'
import { createDb, loadServiceSeed, recordEnvironmentMark, syncServices, withTx, type Db } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { readCodeKey, type CodeKeySettings } from '../../src/modules/identity/index.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import { CONFIRMATION_PHRASE, TEST_ACCOUNTS } from '../../src/modules/staging/index.js'
import { FakeObjectStorage } from '../../src/providers/r2/index.js'
import { testConfig } from '../fixtures/env.js'
import { signInWithMfa } from '../fixtures/staff-mfa.js'

const KEY: CodeKeySettings = readCodeKey({
  HANDYHUB_ENV: 'ci',
  CODE_HASH_KEY: ['synthetic', 'owner', 'acceptance', 'code', 'key', 'for', 'tests', 'only', '0142'].join('-'),
})
const pw = ['synthetic', 'owner', 'acceptance', 'passphrase', '142'].join(' ')
const PEOPLE = ['owner', 'office'] as const
type Person = (typeof PEOPLE)[number]

let t: TestDatabase
let wide: Db
let app: FastifyInstance
const cookies = {} as Record<Person, string>
const csrf = {} as Record<Person, string>

type Account = {
  id: string
  kind: string
  role: string | null
  email: string
  state: string
  reusable: boolean | null
  mfaEnrolled: boolean | null
  receivesEmail: boolean | null
}
type Outcome = { id: string; outcome: string; step: string | null; codes: string[] }

async function signIn(p: Person): Promise<[string, string]> {
  const res = await signInWithMfa(app, {
    method: 'POST',
    url: '/api/v1/staff/auth/sign-in',
    headers: { 'x-forwarded-for': '198.51.100.143' },
    payload: { email: `${p}-oat@example.test`, password: pw },
  })
  expect(res.statusCode, res.body).toBe(200)
  const cookie = String(res.headers['set-cookie']).split(';')[0] as string
  const session = await app.inject({ method: 'GET', url: '/api/v1/staff/auth/session', headers: { cookie } })
  return [cookie, session.json<{ csrfToken: string }>().csrfToken]
}

const status = async () => {
  const res = await app.inject({
    method: 'GET',
    url: '/api/v1/staff/staging/test-data',
    headers: { cookie: cookies.owner },
  })
  expect(res.statusCode, res.body).toBe(200)
  return res.json<{ testAccounts: Account[] }>().testAccounts
}
const post = (who: Person, url: string, payload: object = {}) =>
  app.inject({
    method: 'POST',
    url,
    payload,
    headers: { cookie: cookies[who], 'x-csrf-token': csrf[who], 'idempotency-key': `synthetic-${randomUUID()}` },
  })
const create = (who: Person = 'owner') =>
  post(who, '/api/v1/staff/staging/test-accounts', { reason: 'Synthetic: accounts for the test journey.' })
const linkEvents = async () =>
  Number(
    (
      await sql<{ n: string }>`SELECT count(*)::text AS n FROM platform.outbox_events
        WHERE type = 'staff_link.issued'`.execute(t.db)
    ).rows[0]?.n,
  )

beforeAll(async () => {
  t = await createTestDatabase()
  wide = createDb(t.url, { max: 8, applicationName: 'owner-acceptance-test' })
  await syncServices(t.db, loadServiceSeed())
  app = await buildApp({
    config: testConfig({ TRUST_PROXY_HOPS: '1', STAGING_TOOLS: 'on', DATABASE_URL: t.url }),
    api: { db: wide, codeKey: KEY, storage: new FakeObjectStorage() },
  })
  const hash = await hashPassword(pw)
  await withTx(t.db, async (tx) => {
    for (const p of PEOPLE) {
      const user = await createStaffUser(tx, {
        email: `${p}-oat@example.test`,
        displayName: `Synthetic ${p}`,
        locale: 'en',
        role: p,
        issuedBy: 'test',
      })
      await setPasswordHash(tx, user.id, hash)
    }
  })
  for (const p of PEOPLE) [cookies[p], csrf[p]] = await signIn(p)
}, 60_000)

afterAll(async () => {
  await app?.close()
  await wide?.destroy()
  await t?.drop()
})

describe('the Owner Acceptance Testing accounts (TSK-0142, HH-OPS-06)', () => {
  it('[RULE-SYNTHETIC-DATA] six fictional accounts, one per role, all on the reserved test domain', () => {
    expect(TEST_ACCOUNTS.map((a) => a.id)).toEqual([
      'customer',
      'guest_customer',
      'worker',
      'estimator',
      'office',
      'owner',
    ])
    for (const a of TEST_ACCOUNTS) expect(a.email).toMatch(/^oat-[a-z]+@example\.test$/)
  })

  it('[HH-OPS-05] nothing is created on a database not identified as a test database', async () => {
    const res = await create()
    expect(res.statusCode, res.body).toBe(409)
    expect(res.json<{ error: { fieldErrors: { code: string }[] } }>().error.fieldErrors[0]?.code).toBe(
      'STAGING_NOT_IDENTIFIED',
    )
    expect((await status()).map((a) => a.state)).toEqual([
      'not_created',
      'no_account',
      'not_created',
      'not_created',
      'not_created',
      'not_created',
    ])
    expect(await recordEnvironmentMark(t.db, 'ci', 'migration')).toBe('recorded')
  })

  it('[T26] another role is refused on the server', async () => {
    expect((await create('office')).statusCode).toBe(403)
    expect(await linkEvents()).toBe(0)
  })

  it('[HH-OPS-06] the Owner creates them: invited staff with their roles, a reusable Customer, no Guest account', async () => {
    const res = await create()
    expect(res.statusCode, res.body).toBe(200)
    const body = res.json<{ outcomes: Outcome[]; accounts: Account[] }>()
    expect(body.outcomes.map((o) => [o.id, o.outcome])).toEqual([
      ['customer', 'created'],
      ['guest_customer', 'no_account'],
      ['worker', 'created'],
      ['estimator', 'created'],
      ['office', 'created'],
      ['owner', 'created'],
    ])
    expect(JSON.stringify(body)).not.toMatch(/password|token/i)
    const accounts = body.accounts
    expect(accounts.find((a) => a.id === 'customer')).toMatchObject({ state: 'active', reusable: true })
    for (const role of ['worker', 'estimator', 'office', 'owner'])
      expect(accounts.find((a) => a.id === role)).toMatchObject({
        kind: 'staff',
        role,
        state: 'invited',
        mfaEnrolled: false,
      })
    // In ci every reserved test address can receive email; on staging only TEST_EMAIL_DESTINATIONS can.
    expect(accounts.every((a) => a.receivesEmail === true)).toBe(true)
    // Each staff account gets one invite link through the outbox; none has a password.
    expect(await linkEvents()).toBe(4)
    const passwords = await sql<{ n: string }>`SELECT count(*)::text AS n FROM identity.auth_identities i
      JOIN identity.staff_users u ON u.id = i.staff_user_id
      WHERE u.email LIKE 'oat-%@example.test' AND i.password_hash IS NOT NULL`.execute(t.db)
    expect(passwords.rows[0]?.n).toBe('0')
    const roles = await sql<{ email: string; name: string }>`SELECT u.email, g.name FROM identity.role_grants g
      JOIN identity.staff_users u ON u.id = g.staff_user_id
      WHERE u.email LIKE 'oat-%@example.test' AND g.ended_at IS NULL ORDER BY u.email`.execute(t.db)
    expect(roles.rows).toEqual([
      { email: 'oat-estimator@example.test', name: 'estimator' },
      { email: 'oat-office@example.test', name: 'office' },
      { email: 'oat-owner@example.test', name: 'owner' },
      { email: 'oat-worker@example.test', name: 'worker' },
    ])
    const audit = await t.db
      .selectFrom('platform.audit_events')
      .select('result')
      .where('action', '=', 'staging.create_test_accounts')
      .execute()
    expect(audit.map((a) => a.result)).toContain('succeeded')
  })

  it('[HH-OPS-06] repeating is safe: existing accounts are left as they are', async () => {
    const res = await create()
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json<{ outcomes: Outcome[] }>().outcomes.map((o) => o.outcome)).toEqual([
      'exists',
      'no_account',
      'exists',
      'exists',
      'exists',
      'exists',
    ])
    expect(await linkEvents()).toBe(4)
  })

  it('[HH-OPS-05][HH-OPS-06] Reset Test Data keeps every test account, ready for the next journey', async () => {
    const res = await post('owner', '/api/v1/staff/staging/test-data/reset', {
      confirmation: CONFIRMATION_PHRASE,
      freshData: false,
    })
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json<{ state: string }>().state).toBe('completed')
    const after = await status()
    expect(after.find((a) => a.id === 'customer')).toMatchObject({ state: 'active', reusable: true })
    for (const role of ['worker', 'estimator', 'office', 'owner'])
      expect(after.find((a) => a.id === role)?.state).toBe('invited')
  })
})
