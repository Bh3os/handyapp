// Launch-phase switches against PostgreSQL 16 (TSK-0142; HH-OPS-06, OWN-DEC-191, OWN-DEC-22, T26, RULE-SERVER-AUTHZ,
// RULE-SYNTHETIC-DATA). Every database starts in phase 1 with every switch off; only the Owner moves the phase, one
// step forward or back, with the typed words, a written approval and a fresh sign-in, and the database refuses any
// other change. In production the phase decides public submissions and search indexing; outside production nothing
// is public whatever the phase. Staff, visitors, hosts and addresses are synthetic; every password is built at runtime.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { loadServiceSeed, syncServices, withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import { PRIVACY_NOTICE } from '@handyhub/domain/legal'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import { recordPolicyVersion } from '../../src/platform/config/index.js'
import { testConfig } from '../fixtures/env.js'
import { signInWithMfa } from '../fixtures/staff-mfa.js'

const pw = ['synthetic', 'launch', 'phase', 'passphrase', '142'].join(' ')
const PEOPLE = ['owner', 'office', 'estimator', 'worker'] as const
type Person = (typeof PEOPLE)[number]

const page = (h1: string) => `<!doctype html><html><head><title>t</title></head><h1>${h1}</h1></html>`
const siteDir = mkdtempSync(join(tmpdir(), 'site-launch-'))
writeFileSync(join(siteDir, 'index.html'), page('Synthetic home'))
writeFileSync(join(siteDir, 'services.html'), page('Synthetic catalog'))

let t: TestDatabase
let prod: FastifyInstance
let ci: FastifyInstance
const cookies = {} as Record<Person, string>
const csrf = {} as Record<Person, string>
const ids = {} as Record<Person, string>

type View = {
  environment: string
  phase: string
  phaseNumber: number
  version: number | null
  changedBy: { id: string; name: string | null } | null
  approval: string | null
  switches: { id: string; on: boolean }[]
  effect: { submissions: string; indexing: boolean }
  moves: { to: string; confirmation: string }[]
  history: { version: number; phase: string; changedBy: { id: string } | null; approval: string | null }[]
}

async function signIn(p: Person, target: FastifyInstance): Promise<[string, string]> {
  const res = await signInWithMfa(target, {
    method: 'POST',
    url: '/api/v1/staff/auth/sign-in',
    headers: { 'x-forwarded-for': '198.51.100.142' },
    payload: { email: `${p}-launch@example.test`, password: pw },
  })
  expect(res.statusCode, res.body).toBe(200)
  const cookie = String(res.headers['set-cookie']).split(';')[0] as string
  const session = await target.inject({ method: 'GET', url: '/api/v1/staff/auth/session', headers: { cookie } })
  return [cookie, session.json<{ csrfToken: string }>().csrfToken]
}

const view = (who: Person, target = prod) =>
  target.inject({ method: 'GET', url: '/api/v1/staff/launch', headers: { cookie: cookies[who] } })
const move = (who: Person, payload: Record<string, unknown>, version: number, target = prod) =>
  target.inject({
    method: 'PUT',
    url: '/api/v1/staff/launch/phase',
    payload,
    headers: {
      cookie: cookies[who],
      'x-csrf-token': csrf[who],
      'idempotency-key': `synthetic-${randomUUID()}`,
      'if-match': `"${version}"`,
    },
  })
const current = async () => (await view('owner')).json<View>()
const fieldCodes = (res: { json: () => unknown }) =>
  (res.json() as { error: { fieldErrors: { code: string }[] } }).error.fieldErrors.map((f) => f.code)

let ip = 20
const submit = (target: FastifyInstance) =>
  target.inject({
    method: 'POST',
    url: '/api/v1/public/requests',
    headers: { 'idempotency-key': `synthetic-${randomUUID()}`, 'x-forwarded-for': `203.0.113.${++ip}` },
    payload: {
      formVersion: 'test-1',
      privacyNoticeVersion: PRIVACY_NOTICE.documentId,
      services: [{ serviceId: 'SVC-DW-01' }],
      notSure: false,
      description: 'Synthetic launch-phase request.',
      answers: [],
      property: { street: '142 Synthetic Way', city: 'Testville', state: 'KY', zip: '40000', propertyType: 'house' },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'online',
      contact: {
        fullName: 'Synthetic Visitor',
        email: 'visitor-142@example.test',
        phone: '(502) 555-0142',
        preferredChannel: 'email',
      },
      smsOptIn: false,
      marketingOptIn: false,
    },
  })
const requests = async () =>
  Number((await sql<{ n: string }>`SELECT count(*)::text AS n FROM intake.requests`.execute(t.db)).rows[0]?.n)
const formState = async (target: FastifyInstance) =>
  (await target.inject({ method: 'GET', url: '/api/v1/public/request-form' })).json<{ submissions: string }>()
    .submissions

beforeAll(async () => {
  t = await createTestDatabase()
  await syncServices(t.db, loadServiceSeed())
  // A production server with its built site (synthetic pages), and a ci one, on the same throwaway database.
  prod = await buildApp({
    config: { ...testConfig({ TRUST_PROXY_HOPS: '1' }), env: 'production', noindex: false, siteDir },
    api: { db: t.db },
  })
  ci = await buildApp({ config: { ...testConfig({ TRUST_PROXY_HOPS: '1' }), siteDir }, api: { db: t.db } })
  const hash = await hashPassword(pw)
  await withTx(t.db, async (tx) => {
    for (const p of PEOPLE) {
      const user = await createStaffUser(tx, {
        email: `${p}-launch@example.test`,
        displayName: `Synthetic ${p}`,
        locale: 'en',
        role: p,
        issuedBy: 'test',
      })
      await setPasswordHash(tx, user.id, hash)
      ids[p] = user.id
    }
  })
  for (const p of PEOPLE) [cookies[p], csrf[p]] = await signIn(p, prod)
}, 60_000)

afterAll(async () => {
  await prod?.close()
  await ci?.close()
  await t?.drop()
  rmSync(siteDir, { recursive: true, force: true })
})

describe('phase 1 by default: every switch off (TSK-0142, HH-OPS-06)', () => {
  it('[HH-OPS-06] a new database is in phase 1, set by the migration, with every switch off', async () => {
    const res = await view('owner')
    expect(res.statusCode, res.body).toBe(200)
    expect(res.headers['etag']).toBe('"1"')
    const v = res.json<View>()
    expect(v).toMatchObject({
      environment: 'production',
      phase: 'owner_acceptance_testing',
      phaseNumber: 1,
      version: 1,
    })
    expect(v.changedBy).toBeNull()
    expect(v.switches).toEqual([
      { id: 'invited_customers', on: false },
      { id: 'public_submissions', on: false },
      { id: 'search_indexing', on: false },
    ])
    expect(v.effect).toEqual({ submissions: 'closed', indexing: false })
    expect(v.moves).toEqual([{ to: 'invited_customers', confirmation: 'APPROVE PHASE 2' }])
    expect(v.history).toHaveLength(1)
  })

  it('[HH-OPS-06][OWN-DEC-22] production in phase 1 takes no public request and stays out of search', async () => {
    const before = await requests()
    const res = await submit(prod)
    expect(res.statusCode, res.body).toBe(409)
    expect(fieldCodes(res)).toEqual(['SUBMISSIONS_CLOSED'])
    expect(await requests()).toBe(before)
    const denied = await t.db
      .selectFrom('platform.audit_events')
      .select(['result', 'reason'])
      .where('action', '=', 'request.submit')
      .execute()
    expect(denied).toContainEqual({ result: 'denied', reason: 'SUBMISSIONS_CLOSED' })
    expect(await formState(prod)).toBe('closed')
    expect((await prod.inject({ method: 'GET', url: '/robots.txt' })).body).toBe('User-agent: *\nDisallow: /\n')
    expect((await prod.inject({ method: 'GET', url: '/' })).headers['x-robots-tag']).toBe('noindex, nofollow')
    expect((await prod.inject({ method: 'GET', url: '/sitemap.xml' })).statusCode).toBe(404)
  })

  it('[HH-OPS-06][RULE-SYNTHETIC-DATA] outside production the form takes testers’ requests and nothing is indexed', async () => {
    expect(await formState(ci)).toBe('testers_only')
    expect((await submit(ci)).statusCode).toBe(201)
    expect((await ci.inject({ method: 'GET', url: '/robots.txt' })).body).toBe('User-agent: *\nDisallow: /\n')
  })
})

describe('only the Owner moves the phase, with a recorded approval (TSK-0142, T26, RULE-SERVER-AUTHZ)', () => {
  it('[T26][HH-OPS-06] every other role is refused on the server, reading and moving', async () => {
    for (const who of ['office', 'estimator', 'worker'] as const) {
      expect((await view(who)).statusCode, who).toBe(403)
      const res = await move(who, { phase: 'invited_customers', confirmation: 'APPROVE PHASE 2', reason: 'x' }, 1)
      expect(res.statusCode, who).toBe(403)
    }
    expect((await current()).version).toBe(1)
  })

  it('[HH-OPS-06] a skipped phase, wrong words, an empty approval or a stale version change nothing', async () => {
    const skip = await move('owner', { phase: 'public', confirmation: 'APPROVE PHASE 3', reason: 'Synthetic.' }, 1)
    expect(skip.statusCode).toBe(400)
    expect(fieldCodes(skip)).toEqual(['SKIPS_A_PHASE'])
    const same = await move(
      'owner',
      { phase: 'owner_acceptance_testing', confirmation: 'RETURN TO PHASE 1', reason: 'Synthetic.' },
      1,
    )
    expect(fieldCodes(same)).toEqual(['SAME_PHASE'])
    const words = await move('owner', { phase: 'invited_customers', confirmation: 'APPROVE', reason: 'Synthetic.' }, 1)
    expect(fieldCodes(words)).toEqual(['confirmation_mismatch'])
    const empty = await move('owner', { phase: 'invited_customers', confirmation: 'APPROVE PHASE 2', reason: '  ' }, 1)
    expect(fieldCodes(empty)).toEqual(['required'])
    const stale = await move(
      'owner',
      { phase: 'invited_customers', confirmation: 'APPROVE PHASE 2', reason: 'Synthetic.' },
      7,
    )
    expect(stale.statusCode).toBe(409)
    expect((await current()).version).toBe(1)
    const refusals = await t.db
      .selectFrom('platform.audit_events')
      .select('reason')
      .where('action', '=', 'launch.change_phase')
      .where('result', '=', 'denied')
      .execute()
    // A blank reason is refused before the handler (policy_values.change needs a written reason).
    expect(refusals.map((r) => r.reason).sort()).toEqual(
      ['SAME_PHASE', 'SKIPS_A_PHASE', 'confirmation_mismatch'].sort(),
    )
  })

  it('[HH-OPS-06] a sign-in older than the fresh window must be confirmed again', async () => {
    await sql`UPDATE identity.staff_sessions SET authenticated_at = now() - interval '2 hours'
      WHERE staff_user_id = ${ids.owner}`.execute(t.db)
    const res = await move(
      'owner',
      { phase: 'invited_customers', confirmation: 'APPROVE PHASE 2', reason: 'Synthetic.' },
      1,
    )
    expect(res.statusCode).toBe(403)
    expect(res.json<{ error: { code: string } }>().error.code).toBe('FRESH_AUTH_REQUIRED')
    expect((await current()).version).toBe(1)
    ;[cookies.owner, csrf.owner] = await signIn('owner', prod)
  })

  it('[HH-OPS-06][OWN-DEC-191] the database refuses a change that is not the Owner’s, not recorded or skips a phase', async () => {
    const change = (changedBy: string, phase: string, reason = 'Synthetic approval.') =>
      recordPolicyVersion(t.db, {
        key: 'launch.phase',
        value: { phase } as never,
        sourceIds: ['TEST-SYNTHETIC'],
        changedBy,
        reason,
      })
    await expect(change('migration:9999', 'invited_customers')).rejects.toThrow(/only the Owner/)
    await expect(change(ids.office, 'invited_customers')).rejects.toThrow(/only the Owner/)
    await expect(change(ids.owner, 'public')).rejects.toThrow(/one step forward/)
    await expect(
      sql`INSERT INTO platform.policy_version (key, version, state, value, source_ids, changed_by, change_reason)
        VALUES ('launch.phase', 9, 'configured', '{"phase": "invited_customers"}', ARRAY['TEST'], ${ids.owner}, ' ')`.execute(
        t.db,
      ),
    ).rejects.toThrow(/records the Owner/)
    expect((await current()).version).toBe(1)
  })
})

describe('the phases in production (TSK-0142, HH-OPS-06, OWN-DEC-191)', () => {
  const approval2 = 'Synthetic approval: Owner Acceptance Testing passed; invite the first customers.'

  it('[HH-OPS-06] phase 2: recorded with the Owner and the approval; invitation-only, still not public or indexed', async () => {
    const res = await move(
      'owner',
      { phase: 'invited_customers', confirmation: 'APPROVE PHASE 2', reason: approval2 },
      1,
    )
    expect(res.statusCode, res.body).toBe(200)
    expect(res.headers['etag']).toBe('"2"')
    const v = res.json<View>()
    expect(v).toMatchObject({ phase: 'invited_customers', version: 2, approval: approval2 })
    expect(v.changedBy?.id).toBe(ids.owner)
    expect(v.switches.find((s) => s.id === 'invited_customers')?.on).toBe(true)
    expect(v.effect).toEqual({ submissions: 'invitation_only', indexing: false })
    expect(v.history.map((h) => h.phase)).toEqual(['invited_customers', 'owner_acceptance_testing'])
    const event = await t.db
      .selectFrom('platform.audit_events')
      .select(['result', 'reason', 'summary'])
      .where('action', '=', 'launch.change_phase')
      .where('result', '=', 'succeeded')
      .executeTakeFirstOrThrow()
    expect(event.reason).toBe(approval2)
    expect(event.summary).toMatchObject({ from: 'owner_acceptance_testing', to: 'invited_customers' })
    const before = await requests()
    const refused = await submit(prod)
    expect(refused.statusCode).toBe(409)
    expect(fieldCodes(refused)).toEqual(['INVITATION_REQUIRED'])
    expect(await requests()).toBe(before)
    expect((await prod.inject({ method: 'GET', url: '/' })).headers['x-robots-tag']).toBe('noindex, nofollow')
  })

  it('[HH-OPS-06] phase 3: the public form takes requests and search indexing is on', async () => {
    const res = await move(
      'owner',
      { phase: 'public', confirmation: 'APPROVE PHASE 3', reason: 'Synthetic approval of the public launch.' },
      2,
    )
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json<View>().effect).toEqual({ submissions: 'open', indexing: true })
    expect(await formState(prod)).toBe('open')
    expect((await submit(prod)).statusCode).toBe(201)
    expect((await prod.inject({ method: 'GET', url: '/' })).headers['x-robots-tag']).toBeUndefined()
    expect((await prod.inject({ method: 'GET', url: '/robots.txt' })).body).toContain('Sitemap:')
    expect((await prod.inject({ method: 'GET', url: '/sitemap.xml' })).statusCode).toBe(200)
  })

  it('[HH-OPS-06] the Owner can close again at once: back to phase 1, recorded the same way', async () => {
    const res = await move(
      'owner',
      { phase: 'owner_acceptance_testing', confirmation: 'RETURN TO PHASE 1', reason: 'Synthetic: close again.' },
      3,
    )
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json<View>().history).toHaveLength(4)
    expect(fieldCodes(await submit(prod))).toEqual(['SUBMISSIONS_CLOSED'])
    expect((await prod.inject({ method: 'GET', url: '/' })).headers['x-robots-tag']).toBe('noindex, nofollow')
    expect((await prod.inject({ method: 'GET', url: '/robots.txt' })).body).toBe('User-agent: *\nDisallow: /\n')
    // Versions are append-only: the history of every phase decision stays.
    await expect(sql`DELETE FROM platform.policy_version WHERE key = 'launch.phase'`.execute(t.db)).rejects.toThrow(
      /append-only/,
    )
  })

  it('[HH-OPS-06] outside production the phase changes nothing public', async () => {
    const v = (await view('owner', ci)).json<View>()
    expect(v.environment).toBe('ci')
    expect(v.effect).toEqual({ submissions: 'testers_only', indexing: false })
  })
})
