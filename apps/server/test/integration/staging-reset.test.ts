// Staging-only Reset Test Data and fresh test data against PostgreSQL 16 (TSK-0141; HH-OPS-05, T26, OWN-DEC-191,
// RULE-SYNTHETIC-DATA, RULE-SERVER-AUTHZ, ENT-AuditEvent, ENT-OutboxEvent). Staff, customers, codes and amounts are
// synthetic and every key is built at runtime. The estimate terms version recorded below is a fixture of this
// throwaway database only (so the approval scenarios can run), never a statement that the owner approved anything.
import { randomUUID } from 'node:crypto'
import {
  createDb,
  loadServiceSeed,
  loadSopSeed,
  recordEnvironmentMark,
  syncServices,
  syncSops,
  withTx,
  type Db,
} from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import { ESTIMATE_TERMS } from '@handyhub/domain/legal'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { loadConfig as loadEnv } from '../../src/config.js'
import { sendSignInCode, signIn } from '../../src/modules/accounts/accounts.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { readCodeKey, type CodeKeySettings } from '../../src/modules/identity/index.js'
import { deriveCode } from '../../src/modules/identity/keys.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import { apiModules } from '../../src/modules/index.js'
import {
  CLEARED_TABLES,
  CONFIRMATION_PHRASE,
  PRESERVED,
  SELECTIVE_TABLES,
  stagingModule,
} from '../../src/modules/staging/index.js'
import { KEPT_TABLES } from '../../src/modules/staging/reset.js'
import { recordPolicyVersion } from '../../src/platform/config/index.js'
import { FakeObjectStorage } from '../../src/providers/r2/index.js'
import { testConfig } from '../fixtures/env.js'

const KEY: CodeKeySettings = readCodeKey({
  HANDYHUB_ENV: 'ci',
  CODE_HASH_KEY: ['synthetic', 'staging', 'reset', 'code', 'key', 'for', 'tests', 'only', '0141'].join('-'),
})
const pw = ['synthetic', 'staging', 'reset', 'passphrase', '141'].join(' ')
const PEOPLE = ['owner', 'office', 'estimator', 'ann'] as const
type Person = (typeof PEOPLE)[number]
const WEEK = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, start: '08:00', end: '20:00' }))

let t: TestDatabase
let wide: Db
let app: FastifyInstance
let plain: FastifyInstance
const cookies = {} as Record<Person, string>
const csrf = {} as Record<Person, string>
const ids = {} as Record<Person, string>

async function signInStaff(p: Person, target = app): Promise<[string, string]> {
  const res = await target.inject({
    method: 'POST',
    url: '/api/v1/staff/auth/sign-in',
    headers: { 'x-forwarded-for': '198.51.100.141' },
    payload: { email: `${p}-staging@example.test`, password: pw },
  })
  expect(res.statusCode, res.body).toBe(200)
  const cookie = String(res.headers['set-cookie']).split(';')[0] as string
  const session = await target.inject({ method: 'GET', url: '/api/v1/staff/auth/session', headers: { cookie } })
  return [cookie, session.json<{ csrfToken: string }>().csrfToken]
}

const get = (who: Person, url = '/api/v1/staff/staging/test-data', target = app) =>
  target.inject({ method: 'GET', url, headers: { cookie: cookies[who] } })
function post(who: Person, url: string, payload: unknown, target = app) {
  return target.inject({
    method: 'POST',
    url,
    payload: payload as object,
    headers: { cookie: cookies[who], 'x-csrf-token': csrf[who], 'idempotency-key': `synthetic-${randomUUID()}` },
  })
}
const reset = (who: Person, body: { confirmation: string; freshData: boolean }) =>
  post(who, '/api/v1/staff/staging/test-data/reset', body)

type Count = { id: string; count: number }
type Status = {
  identified: boolean
  checks: { id: string; ok: boolean }[]
  removed: Count[]
  total: number
  preserved: Count[]
  runs: { state: string }[]
}
type Result = {
  runId: string
  state: string
  removed: Count[]
  preservedBefore: Count[]
  preservedAfter: Count[]
  checks: { id: string; ok: boolean; details: string[] }[]
  errors: { code: string }[]
  seeding: { state: string; outcomes: { id: string; state: string; step: string | null; codes: string[] }[] } | null
}

const n = async (db: Db, table: string) =>
  Number((await sql<{ n: string }>`SELECT count(*)::text AS n FROM ${sql.raw(table)}`.execute(db)).rows[0]?.n ?? 0)

beforeAll(async () => {
  t = await createTestDatabase()
  wide = createDb(t.url, { max: 12, applicationName: 'staging-reset-test' })
  await syncServices(t.db, loadServiceSeed())
  await syncSops(t.db, loadSopSeed())
  await recordPolicyVersion(t.db, {
    key: 'legal.estimate_terms',
    value: {
      documentId: ESTIMATE_TERMS.documentId,
      status: 'approved',
      attorneyReviewed: true,
      preparedOn: ESTIMATE_TERMS.preparedOn,
      contentSha256: ESTIMATE_TERMS.contentSha256,
    } as never,
    sourceIds: ['TEST-SYNTHETIC'],
    changedBy: 'test',
    reason: 'synthetic test configuration',
  })
  app = await buildApp({
    config: testConfig({ TRUST_PROXY_HOPS: '1', STAGING_TOOLS: 'on' }),
    api: { db: wide, codeKey: KEY, storage: new FakeObjectStorage() },
  })
  // The same server without the explicit staging flag.
  plain = await buildApp({ config: testConfig({ TRUST_PROXY_HOPS: '1' }), api: { db: wide, codeKey: KEY } })
  const hash = await hashPassword(pw)
  await withTx(t.db, async (tx) => {
    for (const p of PEOPLE) {
      const user = await createStaffUser(tx, {
        email: `${p}-staging@example.test`,
        displayName: `Synthetic ${p}`,
        locale: 'en',
        role: p === 'ann' ? 'worker' : p,
        issuedBy: 'test',
      })
      await setPasswordHash(tx, user.id, hash)
      ids[p] = user.id
    }
  })
  for (const p of PEOPLE) [cookies[p], csrf[p]] = await signInStaff(p)
  const hours = await app.inject({
    method: 'PUT',
    url: `/api/v1/staff/workers/${ids.ann}/working-hours`,
    payload: { periods: WEEK },
    headers: {
      cookie: cookies.owner,
      'x-csrf-token': csrf.owner,
      'idempotency-key': `synthetic-${randomUUID()}`,
      'if-match': '"0"',
    },
  })
  expect(hours.statusCode, hours.body).toBe(200)
}, 60_000)

afterAll(async () => {
  await app?.close()
  await plain?.close()
  await wide?.destroy()
  await t?.drop()
})

describe('Staging Tools exist only in an identified staging or test environment (TSK-0141, HH-OPS-05)', () => {
  it('[HH-OPS-05] STAGING_TOOLS is refused in production, and the module never registers there', () => {
    expect(() =>
      loadEnv({
        HANDYHUB_ENV: 'production',
        DATABASE_URL: 'postgres://synthetic@127.0.0.1/none',
        STAGING_TOOLS: 'on',
      }),
    ).toThrow(/STAGING_TOOLS is refused in production/)
    const names = (env: 'production' | 'staging' | 'ci', identified: boolean) =>
      apiModules({ secureCookies: true, mfaKey: null, environment: env, staging: { identified, checks: [] } }).map(
        (m) => m.name,
      )
    expect(names('production', true)).not.toContain('staging')
    expect(names('staging', false)).not.toContain('staging')
    expect(names('ci', true)).toContain('staging')
    expect(() => stagingModule({ environment: 'production' as never, checks: [], codeKey: KEY, routes: [] })).toThrow(
      /never exist in production/,
    )
  })

  it('[HH-OPS-05] without the explicit flag the routes do not exist (404 for the Owner too)', async () => {
    const [cookie, token] = await signInStaff('owner', plain)
    const read = await plain.inject({ method: 'GET', url: '/api/v1/staff/staging/test-data', headers: { cookie } })
    expect(read.statusCode).toBe(404)
    const write = await plain.inject({
      method: 'POST',
      url: '/api/v1/staff/staging/test-data/reset',
      payload: { confirmation: CONFIRMATION_PHRASE, freshData: false },
      headers: { cookie, 'x-csrf-token': token, 'idempotency-key': `synthetic-${randomUUID()}` },
    })
    expect(write.statusCode).toBe(404)
  })

  it('[HH-OPS-05] a database never marked as a test database refuses the reset; nothing is removed', async () => {
    const status = await get('owner')
    expect(status.statusCode, status.body).toBe(200)
    const s = status.json<Status>()
    expect(s.identified).toBe(false)
    expect(s.checks.find((c) => c.id === 'database_marked')?.ok).toBe(false)
    const res = await reset('owner', { confirmation: CONFIRMATION_PHRASE, freshData: false })
    expect(res.statusCode, res.body).toBe(409)
    expect(res.json<{ error: { fieldErrors: { code: string }[] } }>().error.fieldErrors.map((f) => f.code)).toContain(
      'STAGING_NOT_IDENTIFIED',
    )
    expect(await n(t.db, 'staging.reset_runs')).toBe(0)
    // The database itself refuses a run row, however it is written.
    await expect(
      sql`INSERT INTO staging.reset_runs (mode, state, requested_by, environment, request_id)
        VALUES ('reset', 'running', ${ids.owner}, 'ci', 'forged')`.execute(t.db),
    ).rejects.toThrow(/STAGING_NOT_IDENTIFIED/)
    expect(await recordEnvironmentMark(t.db, 'ci', 'migration')).toBe('recorded')
    expect(await recordEnvironmentMark(t.db, 'ci', 'server_boot')).toBe('unchanged')
  })
})

describe('Owner only, typed confirmation and fresh sign-in (TSK-0141, T26, RULE-SERVER-AUTHZ)', () => {
  it('[T26][HH-OPS-05] every other role is refused on the server, reading and resetting', async () => {
    for (const who of ['office', 'estimator', 'ann'] as const) {
      expect((await get(who)).statusCode, who).toBe(403)
      const res = await reset(who, { confirmation: CONFIRMATION_PHRASE, freshData: false })
      expect(res.statusCode, who).toBe(403)
      const designate = await post(who, '/api/v1/staff/staging/test-data/reusable-accounts', {
        email: 'nobody@example.test',
        reusable: true,
      })
      expect(designate.statusCode, who).toBe(403)
    }
    expect(await n(t.db, 'staging.reset_runs')).toBe(0)
  })

  it('[HH-OPS-05] a missing or different confirmation is refused, audited and changes nothing', async () => {
    const missing = await post('owner', '/api/v1/staff/staging/test-data/reset', { freshData: false })
    expect(missing.statusCode).toBe(400)
    for (const confirmation of ['', 'reset test data', 'RESET TEST DATA ', 'RESET']) {
      const res = await reset('owner', { confirmation, freshData: false })
      expect(res.statusCode, confirmation).toBe(400)
      expect(res.json<{ error: { fieldErrors: { code: string }[] } }>().error.fieldErrors[0]?.code).toBe(
        'confirmation_mismatch',
      )
    }
    expect(await n(t.db, 'staging.reset_runs')).toBe(0)
    const denied = await t.db
      .selectFrom('platform.audit_events')
      .select(['reason'])
      .where('action', '=', 'staging.reset_test_data')
      .where('result', '=', 'denied')
      .execute()
    expect(denied.map((d) => d.reason)).toContain('confirmation_mismatch')
  })

  it('[HH-OPS-05] the reset needs a password entered within the fresh sign-in window', async () => {
    await sql`UPDATE identity.staff_sessions SET authenticated_at = now() - interval '1 hour'
      WHERE staff_user_id = ${ids.owner}`.execute(t.db)
    const res = await reset('owner', { confirmation: CONFIRMATION_PHRASE, freshData: false })
    expect(res.statusCode, res.body).toBe(403)
    expect(res.json<{ error: { code: string } }>().error.code).toBe('FRESH_AUTH_REQUIRED')
    ;[cookies.owner, csrf.owner] = await signInStaff('owner')
  })
})

describe('Reset & Create Fresh Test Data, then Reset Test Data (TSK-0141, HH-OPS-05)', () => {
  let reusableEmail = ''

  it('[HH-OPS-05] creates the fictional scenarios through the server’s own rules, labelled as test data', async () => {
    const res = await reset('owner', { confirmation: CONFIRMATION_PHRASE, freshData: true })
    expect(res.statusCode, res.body).toBe(200)
    const r = res.json<Result>()
    expect(r.state, JSON.stringify(r.errors)).toBe('completed')
    const outcomes = Object.fromEntries((r.seeding?.outcomes ?? []).map((o) => [o.id, o]))
    const shown = JSON.stringify(r.seeding?.outcomes)
    for (const id of [
      'guest_customer_request',
      'registered_customer',
      'estimate_awaiting_approval',
      'estimate_visit',
      'approved_estimate',
      'test_payment',
      'confirmed_work_visit',
      'customer_conversation',
    ])
      expect(outcomes[id]?.state, `${id}: ${shown}`).toBe('created')
    for (const id of ['job_in_progress', 'completed_job', 'change_order', 'test_invoice'])
      expect(outcomes[id]?.state, id).toBe('not_available')
    expect(r.seeding?.state).toBe('completed')
    // Fictional and synthetic only: reserved test domains and the 555-01xx range, names saying so.
    const contacts = await t.db.selectFrom('crm.contacts').select(['full_name', 'email', 'phone_e164']).execute()
    expect(contacts.length).toBeGreaterThanOrEqual(8)
    for (const c of contacts) {
      expect(c.full_name).toContain('TEST DATA (fictional)')
      expect(c.email).toMatch(/@example\.test$/)
      expect(c.phone_e164).toMatch(/^\+1[2-9]\d{2}55501\d{2}$/)
    }
    // No job moved past the Start Work gate; approved jobs wait for preparation.
    const jobs = await t.db.selectFrom('work.jobs').select('operational_state').execute()
    expect(jobs.length).toBeGreaterThanOrEqual(3)
    expect(new Set(jobs.map((j) => j.operational_state))).toEqual(new Set(['pending_preparation']))
    expect(await n(t.db, 'finance.payments')).toBeGreaterThanOrEqual(1)
    const account = await t.db
      .selectFrom('identity.customer_accounts')
      .select('sign_in_email')
      .executeTakeFirstOrThrow()
    reusableEmail = account.sign_in_email as string
  }, 60_000)

  it('[HH-OPS-05] the Owner designates a reusable test account', async () => {
    const res = await post('owner', '/api/v1/staff/staging/test-data/reusable-accounts', {
      email: reusableEmail,
      reusable: true,
    })
    expect(res.statusCode, res.body).toBe(200)
    const unknown = await post('owner', '/api/v1/staff/staging/test-data/reusable-accounts', {
      email: 'nobody-staging@example.test',
      reusable: true,
    })
    expect(unknown.statusCode).toBe(404)
  })

  it('[HH-OPS-05] Reset Test Data clears the test records, keeps configuration, and nothing can send later', async () => {
    // A scheduled reminder and a pending message, as a test journey leaves them.
    await sql`INSERT INTO platform.outbox_events (type, aggregate_type, aggregate_id, aggregate_version, payload,
        idempotency_key, request_id)
      VALUES ('synthetic.pending', 'project', ${randomUUID()}, 1, '{}', ${`synthetic-${randomUUID()}`}, 'synthetic')`.execute(
      t.db,
    )
    await sql`INSERT INTO platform.jobs (automation, job_key, request_id, run_at, max_attempts)
      VALUES ('appointment_reminder.draft', ${`synthetic:${randomUUID()}`}, 'synthetic', now() + interval '1 day', 3)`.execute(
      t.db,
    )
    const status = (await get('owner')).json<Status>()
    expect(status.identified).toBe(true)
    expect(status.total).toBeGreaterThan(0)
    const configBefore = await n(t.db, 'platform.policy_version')
    const res = await reset('owner', { confirmation: CONFIRMATION_PHRASE, freshData: false })
    expect(res.statusCode, res.body).toBe(200)
    const r = res.json<Result>()
    expect(r.state, JSON.stringify(r)).toBe('completed')
    for (const c of r.checks) expect(c.ok, `${c.id} ${c.details.join(',')}`).toBe(true)
    // Cleared: every test table is empty, and no message, reminder or delivery is left to send.
    for (const table of CLEARED_TABLES) {
      if (table === 'platform.jobs') continue
      expect(await n(t.db, table), table).toBe(0)
    }
    const jobs = await t.db.selectFrom('platform.jobs').select('automation').execute()
    expect(
      jobs.map((j) => j.automation).filter((a) => !['retention.review_scan', 'privacy.object_erasure'].includes(a)),
    ).toEqual([])
    expect(await n(t.db, 'platform.outbox_events')).toBe(0)
    expect(await n(t.db, 'platform.message_deliveries')).toBe(0)
    // Kept: configuration, catalog, SOPs, templates, staff and the reusable account with its customer and contact.
    expect(await n(t.db, 'platform.policy_version')).toBe(configBefore)
    for (const c of r.preservedAfter) {
      const before = r.preservedBefore.find((b) => b.id === c.id)?.count
      if (c.id === 'audit_events' || c.id === 'staff_sessions') expect(c.count).toBeGreaterThanOrEqual(before ?? 0)
      else expect(c.count, c.id).toBe(before)
    }
    expect(await n(t.db, 'catalog.services')).toBeGreaterThan(0)
    expect(await n(t.db, 'catalog.sop_versions')).toBeGreaterThan(0)
    expect(await n(t.db, 'work.working_hours')).toBeGreaterThan(0)
    expect(await n(t.db, 'identity.staff_users')).toBe(4)
    expect(await n(t.db, 'identity.customer_accounts')).toBe(1)
    expect(await n(t.db, 'crm.customers')).toBe(1)
    expect(await n(t.db, 'crm.contacts')).toBe(1)
    // The protected staging trail and the audit log hold the run.
    const runs = await t.db.selectFrom('staging.reset_runs').select(['state', 'mode']).orderBy('seq').execute()
    expect(runs).toEqual([
      { state: 'completed', mode: 'reset_and_seed' },
      { state: 'completed', mode: 'reset' },
    ])
    const audited = await t.db
      .selectFrom('platform.audit_events')
      .select('result')
      .where('action', '=', 'staging.reset_test_data')
      .where('result', '=', 'succeeded')
      .execute()
    expect(audited.length).toBe(2)
  }, 60_000)

  it('[HH-OPS-05] the reusable test account still signs in', async () => {
    const contact = { channel: 'email' as const, value: reusableEmail }
    const sent = await withTx(t.db, (tx) => sendSignInCode(tx, KEY, { contact, httpRequestId: 'synthetic-sign-in' }))
    expect(sent).toMatchObject({ status: 'accepted', issued: true })
    const row = await t.db
      .selectFrom('identity.verification_codes')
      .select(['id', 'nonce'])
      .orderBy('created_at', 'desc')
      .executeTakeFirstOrThrow()
    if (KEY.state !== 'configured') throw new Error('synthetic key')
    const code = deriveCode(KEY.key, row.id, row.nonce, 6)
    const signedIn = await withTx(t.db, (tx) => signIn(tx, KEY, { contact, code }))
    expect(signedIn.ok).toBe(true)
  })

  it('[HH-OPS-05] a repeated reset is safe and idempotent', async () => {
    const res = await reset('owner', { confirmation: CONFIRMATION_PHRASE, freshData: false })
    expect(res.statusCode, res.body).toBe(200)
    const r = res.json<Result>()
    expect(r.state).toBe('completed')
    expect(r.checks.every((c) => c.ok)).toBe(true)
    expect(await n(t.db, 'identity.customer_accounts')).toBe(1)
    // The same request (same idempotency key) is answered once.
    const key = `synthetic-${randomUUID()}`
    const send = () =>
      app.inject({
        method: 'POST',
        url: '/api/v1/staff/staging/test-data/reset',
        payload: { confirmation: CONFIRMATION_PHRASE, freshData: false },
        headers: { cookie: cookies.owner, 'x-csrf-token': csrf.owner, 'idempotency-key': key },
      })
    const first = await send()
    const again = await send()
    expect(again.json<Result>().runId).toBe(first.json<Result>().runId)
    expect(again.headers['idempotent-replayed']).toBe('true')
  })

  it('[HH-OPS-05] a concurrent reset is refused while another holds the lock', async () => {
    const holder = new pg.Client({ connectionString: t.url })
    await holder.connect()
    try {
      await holder.query('SELECT pg_advisory_lock(141, 1)')
      expect((await get('owner')).json<{ running: boolean }>().running).toBe(true)
      const res = await reset('owner', { confirmation: CONFIRMATION_PHRASE, freshData: false })
      expect(res.statusCode, res.body).toBe(409)
      expect(res.json<{ error: { fieldErrors: { code: string }[] } }>().error.fieldErrors[0]?.code).toBe(
        'RESET_RUNNING',
      )
    } finally {
      await holder.end()
    }
  })
})

describe('The database guards stand aside only for a permitted staging reset (TSK-0141, migration 0069)', () => {
  it('[HH-OPS-05] every table is either cleared, selectively cleared or kept, and every cleared one guards TRUNCATE', async () => {
    const { rows } = await sql<{ t: string }>`SELECT n.nspname || '.' || c.relname AS t FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind IN ('r', 'p') AND n.nspname NOT IN ('pg_catalog', 'information_schema') ORDER BY 1`.execute(t.db)
    const classified = new Set<string>([
      ...CLEARED_TABLES,
      ...SELECTIVE_TABLES,
      ...Object.values(PRESERVED),
      ...KEPT_TABLES,
    ])
    expect(rows.map((r) => r.t).filter((x) => !classified.has(x))).toEqual([])
    const guarded = await sql<{ t: string }>`SELECT DISTINCT n.nspname || '.' || c.relname AS t FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE NOT tg.tgisinternal AND (tg.tgtype & 32) > 0
        AND pg_get_triggerdef(tg.oid) LIKE '%staging.reset_permitted()%'`.execute(t.db)
    expect(new Set(guarded.rows.map((r) => r.t))).toEqual(new Set(CLEARED_TABLES))
  })

  it('[HH-OPS-05] outside a permitted reset TRUNCATE and account deletes are refused, also with a forged setting', async () => {
    await expect(sql`TRUNCATE intake.request_notes`.execute(t.db)).rejects.toThrow(/only a staging test-data reset/)
    await expect(sql`TRUNCATE work.jobs CASCADE`.execute(t.db)).rejects.toThrow(/APPEND_ONLY/)
    await expect(
      withTx(t.db, async (tx) => {
        await sql`SELECT set_config('handyhub.staging_reset', ${randomUUID()}, true)`.execute(tx)
        await sql`DELETE FROM identity.customer_accounts`.execute(tx)
      }),
    ).rejects.toThrow(/closed, never deleted/)
    // A finished run names an older transaction: it permits nothing.
    const done = await t.db.selectFrom('staging.reset_runs').select('id').executeTakeFirstOrThrow()
    await expect(
      withTx(t.db, async (tx) => {
        await sql`SELECT set_config('handyhub.staging_reset', ${done.id}, true)`.execute(tx)
        await sql`SELECT staging.reset_unlock()`.execute(tx)
      }),
    ).rejects.toThrow(/STAGING_RESET_NOT_PERMITTED/)
    // The staging trail is never changed or deleted afterwards.
    await expect(sql`UPDATE staging.reset_runs SET errors = '[]'`.execute(t.db)).rejects.toThrow(/APPEND_ONLY/)
    await expect(sql`DELETE FROM staging.reset_runs`.execute(t.db)).rejects.toThrow(/APPEND_ONLY/)
    await expect(sql`TRUNCATE staging.environment_marks`.execute(t.db)).rejects.toThrow(/APPEND_ONLY/)
  })

  it('[HH-OPS-05] once a database served production it is never reset again, whatever the server says', async () => {
    expect(await recordEnvironmentMark(t.db, 'production', 'server_boot')).toBe('recorded')
    expect(await recordEnvironmentMark(t.db, 'staging', 'server_boot')).toBe('refused')
    const runs = await n(t.db, 'staging.reset_runs')
    const res = await reset('owner', { confirmation: CONFIRMATION_PHRASE, freshData: true })
    expect(res.statusCode, res.body).toBe(409)
    expect(res.json<{ error: { fieldErrors: { field: string; code: string }[] } }>().error.fieldErrors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'STAGING_NOT_IDENTIFIED' }),
        expect.objectContaining({ field: 'environment.database_never_production' }),
      ]),
    )
    expect(await n(t.db, 'staging.reset_runs')).toBe(runs)
    expect(await n(t.db, 'identity.customer_accounts')).toBe(1)
    // Even a hand-written permit is refused by the database.
    await expect(
      sql`INSERT INTO staging.reset_runs (mode, state, requested_by, environment, request_id)
        VALUES ('reset', 'running', ${ids.owner}, 'ci', 'forged')`.execute(t.db),
    ).rejects.toThrow(/STAGING_NOT_IDENTIFIED/)
    const status = (await get('owner')).json<Status>()
    expect(status.identified).toBe(false)
  })
})
