// Access expiry, attempt limits, neutral recovery and secret hygiene against PostgreSQL 16 and the provider fakes
// (TSK-0035; HH-ID-06, HH-ID-08, HH-ID-09, HH-ID-03, HH-ID-04, T18, T19, T74, RULE-SERVER-AUTHZ). Every visitor,
// address, number, code, link and template text here is synthetic (RULE-SYNTHETIC-DATA); nothing reaches a real
// provider.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Writable } from 'node:stream'
import { loadServiceSeed, syncServices, withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import { PRIVACY_NOTICE } from '@handyhub/domain/legal'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import {
  accessLinkAutomation,
  accessToken,
  issueGrant,
  parseContact,
  REISSUE_ACCEPTED,
  revokeProjectGrants,
} from '../../src/modules/access/index.js'
import { exchangeAccessCode } from '../../src/modules/access/landing.js'
import { codeDeliveryAutomation, readCodeKey, type CodeKeySettings } from '../../src/modules/identity/index.js'
import { releaseTemplateVersion } from '../../src/modules/notifications/index.js'
import { queueAutomations } from '../../src/modules/queue/index.js'
import { createAutomationRegistry, type Automation } from '../../src/platform/automation.js'
import { loadConfig, recordPolicyVersion } from '../../src/platform/config/index.js'
import { createWorker } from '../../src/platform/jobs.js'
import { createLogger } from '../../src/platform/logger.js'
import { createProviders } from '../../src/providers/index.js'
import { readProviderSettings } from '../../src/providers/settings.js'
import { testConfig } from '../fixtures/env.js'

// Built at runtime so no literal looks like a credential (RULE-SYNTHETIC-DATA).
const KEY: CodeKeySettings = readCodeKey({
  HANDYHUB_ENV: 'ci',
  CODE_HASH_KEY: ['synthetic', 'access', 'recovery', 'key', 'for', 'tests', 'only'].join('-'),
})
const PUBLIC = 'http://public.example.test'
const COOKIE = '__Host-hh_customer'
const LINK = new RegExp(`${PUBLIC.replace(/[.:/]/g, '\\$&')}/access#([A-Za-z0-9_-]{43})`)

// Every log line of the app, the worker and the providers (HH-ID-08: "log capture holds no token").
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

let t: TestDatabase
let app: FastifyInstance
let siteDir = ''
const providers = createProviders(readProviderSettings({ HANDYHUB_ENV: 'ci' }), { logger: log })
const fast = (a: Automation): Automation => ({ ...a, retry: { maxAttempts: 2, baseDelayMs: 1, maxDelayMs: 1 } })
const worker = () =>
  createWorker({
    db: t.db,
    registry: createAutomationRegistry([
      ...queueAutomations(),
      codeDeliveryAutomation({ providers, codeKey: KEY }),
      fast(
        accessLinkAutomation({
          providers: { ...providers, linkHosts: ['public.example.test'] },
          codeKey: KEY,
          publicSiteUrl: PUBLIC,
        }),
      ),
    ]),
    logger: log,
  })
async function drain() {
  const w = worker()
  for (let i = 0; i < 20; i++) {
    const r = await w.runOnce()
    if (r.dispatched + r.succeeded + r.retried + r.failed + r.cancelled === 0) break
  }
}

let released = false
async function releaseAccessWording() {
  if (released) return
  released = true
  await withTx(t.db, async (tx) => {
    for (const channel of ['email', 'sms'] as const)
      await releaseTemplateVersion(tx, {
        messageKey: 'project.access_link',
        channel,
        locale: 'en',
        subject: channel === 'email' ? 'Synthetic test access' : null,
        body: 'SYNTHETIC TEST TEMPLATE {accessLink}',
        translationReview: 'source',
        sourceIds: ['TSK-0035'],
        releasedBy: 'test',
      })
  })
}

beforeAll(async () => {
  t = await createTestDatabase()
  await syncServices(t.db, loadServiceSeed())
  siteDir = mkdtempSync(join(tmpdir(), 'site-recovery-'))
  writeFileSync(join(siteDir, 'access.html'), '<!doctype html><title>t</title><h1>Synthetic access page</h1>')
  writeFileSync(join(siteDir, '404.html'), '<!doctype html><title>t</title><h1>Synthetic not found</h1>')
  app = await buildApp({
    config: { ...testConfig({ TRUST_PROXY_HOPS: '1' }), siteDir },
    api: { db: t.db, codeKey: KEY },
    logger: log,
  })
})
afterAll(async () => {
  await app?.close()
  await t?.drop()
  if (siteDir) rmSync(siteDir, { recursive: true, force: true })
})

let n = 0
let submitIp = 10
const future = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10)
type Sent = {
  reference: string
  requestId: string
  projectId: string
  contactId: string
  grantId: string
  token: string
}
async function submitted(email: string, phone = '(502) 555-0161'): Promise<Sent> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/public/requests',
    headers: { 'idempotency-key': `synthetic-recovery-${++n}-0001`, 'x-forwarded-for': `198.51.100.${++submitIp}` },
    payload: {
      formVersion: 'test-1',
      privacyNoticeVersion: PRIVACY_NOTICE.documentId,
      services: [{ serviceId: 'SVC-DW-01' }],
      notSure: false,
      description: 'Synthetic recovery project: a loose cabinet hinge.',
      property: { street: '200 Synthetic Way', city: 'Testville', state: 'KY', zip: '40000', propertyType: 'house' },
      timing: { preferredDate: future, flexible: false, needHelpToday: false, windows: ['any_time'] },
      estimatePreference: 'let_handyhub_decide',
      contact: { fullName: 'Test Customer', email, phone, preferredChannel: 'email' },
      smsOptIn: false,
      marketingOptIn: false,
    },
  })
  expect(res.statusCode).toBe(201)
  const reference = res.json<{ reference: string }>().reference
  const r = await t.db
    .selectFrom('intake.requests')
    .select(['id', 'project_id', 'contact_id'])
    .where('reference', '=', reference)
    .executeTakeFirstOrThrow()
  const grant = await t.db
    .selectFrom('identity.project_access_grants')
    .select(['id', 'nonce'])
    .where('request_id', '=', r.id)
    .executeTakeFirstOrThrow()
  return {
    reference,
    requestId: r.id,
    projectId: r.project_id,
    contactId: r.contact_id,
    grantId: grant.id,
    token: KEY.state === 'configured' ? accessToken(KEY.key, grant.id, grant.nonce) : '',
  }
}

// Each test calls from its own synthetic address (RFC 5737), so per-address limits never cross tests.
let client = ''
let clients = 0
beforeEach(() => {
  client = `203.0.113.${++clients}`
})
const post = (path: string, payload: Record<string, unknown>, opts: { cookie?: string; ip?: string } = {}) =>
  app.inject({
    method: 'POST',
    url: `/api/v1/public/access${path}`,
    headers: { 'x-forwarded-for': opts.ip ?? client, ...(opts.cookie ? { cookie: opts.cookie } : {}) },
    payload,
  })
const get = (url: string, cookie?: string) =>
  app.inject({ method: 'GET', url, headers: { 'x-forwarded-for': client, ...(cookie ? { cookie } : {}) } })
const cookieOf = (res: { headers: Record<string, unknown> }) => {
  const set = String(res.headers['set-cookie'] ?? '')
  expect(set).toMatch(new RegExp(`^${COOKIE}=[A-Za-z0-9_-]{43};`))
  return set.split(';')[0] as string
}
const sentTo = (destination: string) =>
  [...(providers.fakes.email?.sent ?? []), ...(providers.fakes.sms?.sent ?? [])].filter((m) => m.to === destination)
async function deliveredCode(destination: string): Promise<string> {
  await drain()
  const code = sentTo(destination)
    .flatMap((m) => /verification code is (\d{6})\b/.exec(m.text)?.[1] ?? [])
    .at(-1)
  if (!code) throw new Error(`no code was delivered to ${destination}`)
  return code
}
/** The links delivered to a destination, oldest first. */
async function deliveredLinks(destination: string): Promise<string[]> {
  await drain()
  return sentTo(destination).flatMap((m) => LINK.exec(m.text)?.[1] ?? [])
}
const wrong = (code: string) => String((Number(code) + 1) % 1_000_000).padStart(6, '0')
async function exchange(token: string, email: string): Promise<string> {
  expect((await post('/codes', { token, channel: 'email' })).statusCode).toBe(202)
  const res = await post('/exchange', { token, channel: 'email', code: await deliveredCode(email) })
  expect(res.statusCode).toBe(200)
  return cookieOf(res)
}
const grantsOf = (projectId: string) =>
  t.db
    .selectFrom('identity.project_access_grants')
    .select(['id', 'project_id', 'contact_id', 'issued_reason', 'revoked_at'])
    .where('project_id', '=', projectId)
    .orderBy('created_at')
    .execute()
/** What a caller can observe of an answer: status, body without its request ID, and every stable header. */
function observed(res: { statusCode: number; headers: Record<string, unknown>; body: string }) {
  const body = JSON.parse(res.body) as { error?: { requestId?: string } }
  if (body.error) delete body.error.requestId
  const headers = Object.fromEntries(
    Object.entries(res.headers).filter(([k]) => !['date', 'x-request-id', 'content-length'].includes(k)),
  )
  return { status: res.statusCode, body, headers }
}
/**
 * Whether a text holds a secret. A one-time code is six digits, which also occur inside timestamps' fractions of a
 * second, hex digests and UUIDs, so it counts only as a number of its own (not next to a digit, a hex letter, a '.'
 * or a ':'); a token is a long random string and counts anywhere.
 */
function holds(text: string, secret: string): boolean {
  if (!/^\d+$/.test(secret)) return text.includes(secret)
  return new RegExp(`(?<![0-9a-fA-F.:])${secret}(?![0-9a-fA-F])`).test(text)
}
/** The secrets of an access journey must never be stored or logged anywhere; this scans every table row. */
async function rowsContaining(secrets: readonly string[]): Promise<string[]> {
  const tables = await sql<{ s: string; t: string }>`
    SELECT table_schema AS s, table_name AS t FROM information_schema.tables
     WHERE table_type = 'BASE TABLE' AND table_schema NOT IN ('pg_catalog', 'information_schema')`.execute(t.db)
  const hits: string[] = []
  for (const { s, t: table } of tables.rows) {
    const rows = await sql<{ row: string }>`SELECT x::text AS row FROM ${sql.table(`${s}.${table}`)} x`.execute(t.db)
    for (const { row } of rows.rows)
      for (const secret of secrets) if (holds(row, secret)) hits.push(`${s}.${table}: ${secret.slice(0, 6)}…`)
  }
  return hits
}

describe('while the access message cannot be sent, no reissue claims a link (TSK-0035, TSK-0120, HH-ID-09)', () => {
  it('[HH-ID-09][HH-ID-03] off the automatic list: every reissue request is the same 503 NOT_CONFIGURED, known or unknown, and nothing is issued', async () => {
    const email = 'recover-unconfigured@example.test'
    const s = await submitted(email)
    // TSK-0120 wired the owner's secure_access_link, so the message is taken off the list here for a moment (a
    // synthetic configuration version in this test database only) and the list is put back afterwards.
    const list = (await loadConfig(t.db)).get('messages.automatic')
    if (list.state !== 'CONFIGURED') throw new Error('messages.automatic is seeded')
    const version = (value: typeof list.value, reason: string) =>
      recordPolicyVersion(t.db, {
        key: 'messages.automatic',
        value,
        sourceIds: ['TSK-0035'],
        changedBy: 'staff-synthetic-owner',
        reason,
      })
    await version(
      { ...list.value, customer: list.value.customer.filter((k) => k !== 'project.access_link') },
      'Synthetic test: the access message taken off the list',
    )
    try {
      const known = await post('/reissue', { reference: s.reference, contact: email })
      const unknown = await post('/reissue', { reference: 'HH-00000000', contact: 'nobody@example.test' })
      const byLink = await post('/reissue', { token: s.token, contact: email })
      expect(known.statusCode).toBe(503)
      expect(known.json().error.code).toBe('NOT_CONFIGURED')
      expect(observed(unknown)).toEqual(observed(known))
      expect(observed(byLink)).toEqual(observed(known))
      expect((await grantsOf(s.projectId)).map((g) => g.issued_reason)).toEqual(['submission'])
    } finally {
      await version(list.value, 'Synthetic test: the list restored')
    }
  })
})

describe('neutral recovery with anti-enumeration reissue (TSK-0035, HH-ID-09, T18)', () => {
  beforeAll(releaseAccessWording)

  it('[T18][HH-ID-09][HH-ID-04] a revoked link opens nothing; asking with it sends a new link to the contact on file, which opens that one project', async () => {
    const email = 'recover-revoked@example.test'
    const s = await submitted(email)
    expect(await deliveredLinks(email)).toEqual([s.token])
    const cookie = await exchange(s.token, email)
    await withTx(t.db, (tx) =>
      revokeProjectGrants(tx, { projectId: s.projectId, reason: 'corrected_link', by: 'test' }),
    )
    // The neutral page: the link is NOT_FOUND like any unknown one, and its session has ended.
    for (const [path, payload] of [
      ['/open', { token: s.token }],
      ['/codes', { token: s.token, channel: 'email' }],
      ['/exchange', { token: s.token, channel: 'email', code: '000000' }],
    ] as const) {
      const res = await post(path, payload)
      expect([res.statusCode, res.json().error.code], path).toEqual([404, 'NOT_FOUND'])
    }
    expect((await get(`/api/v1/customer/projects/${s.reference}`, cookie)).statusCode).toBe(401)

    const asked = await post('/reissue', { token: s.token, contact: ` ${email.toUpperCase()} ` })
    expect([asked.statusCode, asked.json()]).toEqual([202, REISSUE_ACCEPTED])
    expect(asked.headers['set-cookie']).toBeUndefined()
    const links = await deliveredLinks(email)
    expect(links).toHaveLength(2)
    const fresh = links[1] as string
    expect(fresh).not.toBe(s.token)
    const grants = await grantsOf(s.projectId)
    expect(grants.map((g) => [g.issued_reason, g.contact_id, g.revoked_at === null])).toEqual([
      ['submission', s.contactId, false],
      ['reissue', s.contactId, true],
    ])
    // The old link still opens nothing; the new one opens exactly this project after its code.
    expect((await post('/open', { token: s.token })).statusCode).toBe(404)
    const next = await exchange(fresh, email)
    expect((await get('/api/v1/customer/access/session', next)).json()).toEqual({
      projects: [{ reference: s.reference }],
    })
    const audits = await t.db
      .selectFrom('platform.audit_events')
      .select(['action', 'target_type', 'target_id', 'summary'])
      .where('action', '=', 'project_access.reissue')
      .where('target_id', '=', grants[1]?.id as string)
      .execute()
    expect(audits).toEqual([
      {
        action: 'project_access.reissue',
        target_type: 'project_access_grant',
        target_id: grants[1]?.id,
        summary: { project: s.projectId },
      },
    ])
  })

  it('[HH-ID-09][HH-ID-03][T18] the answer is identical for a matching contact, a wrong one, an unknown or malformed reference, an unknown or expired link', async () => {
    const email = 'recover-same@example.test'
    const s = await submitted(email, '(502) 555-0162')
    const expired = await withTx(t.db, (tx) =>
      issueGrant(tx, KEY, {
        projectId: s.projectId,
        contactId: s.contactId,
        requestId: s.requestId,
        reason: 'submission',
        now: new Date(Date.now() - 25 * 3_600_000),
      }),
    )
    expect((await post('/open', { token: expired?.token })).statusCode).toBe(404)
    const unknownToken = ['Synthetic', 'unknown', 'recovery', 'link', '0123456789'].join('_').slice(0, 43)
    const asks: [string, Record<string, unknown>, boolean][] = [
      ['matching email', { reference: s.reference, contact: email }, true],
      ['matching phone', { reference: s.reference.toLowerCase(), contact: '502-555-0162' }, true],
      ['wrong email', { reference: s.reference, contact: 'someone-else@example.test' }, false],
      ['wrong phone', { reference: s.reference, contact: '(502) 555-0199' }, false],
      ['unknown reference', { reference: 'HH-00000000', contact: email }, false],
      ['malformed reference', { reference: 'not a reference', contact: email }, false],
      ['unknown link', { token: unknownToken, contact: email }, false],
      ['malformed link', { token: 'x', contact: email }, false],
      ['expired link', { token: expired?.token, contact: email }, true],
    ]
    const answers = []
    let ip = 0
    for (const [what, payload] of asks) {
      // A fresh network each time: only the answer is compared, never a limit.
      const res = await post('/reissue', payload, { ip: `192.0.2.${++ip}` })
      expect(res.statusCode, what).toBe(202)
      answers.push(observed(res))
    }
    for (const a of answers) expect(a).toEqual(answers[0])
    // Only the three matching requests issued a grant, each for this one project and its contact on file.
    const reissued = (await grantsOf(s.projectId)).filter((g) => g.issued_reason === 'reissue')
    expect(reissued.map((g) => [g.project_id, g.contact_id])).toEqual([
      [s.projectId, s.contactId],
      [s.projectId, s.contactId],
      [s.projectId, s.contactId],
    ])
    // The fourth matching request in a day is over access.recovery's limit: the same answer, nothing more sent.
    const limit = (await loadConfig(t.db)).get('access.recovery')
    expect(limit.state === 'CONFIGURED' && limit.value.maxReissuesPerProjectPerDay).toBe(3)
    const over = await post('/reissue', { reference: s.reference, contact: email }, { ip: '192.0.2.99' })
    expect(observed(over)).toEqual(answers[0])
    expect((await grantsOf(s.projectId)).filter((g) => g.issued_reason === 'reissue')).toHaveLength(3)
    expect(await deliveredLinks(email)).toHaveLength(4)
    // The audit says whether a link was issued, never what was typed.
    const withheld = await t.db
      .selectFrom('platform.audit_events')
      .select(['target_type', 'target_id', 'summary'])
      .where('action', '=', 'project_access.reissue')
      .where('target_id', '=', s.projectId)
      .execute()
    expect(withheld.map((a) => a.summary)).toEqual([
      { issued: false, why: 'no_match' },
      { issued: false, why: 'no_match' },
      { issued: false, why: 'limit' },
    ])
    expect(JSON.stringify(withheld)).not.toMatch(/someone-else|5550199/)
  })

  it('[HH-ID-09][HH-INT-11] reissue is rate-limited per network, for known and unknown contacts alike', async () => {
    const answers = []
    for (let i = 0; i < 10; i++)
      answers.push((await post('/reissue', { reference: 'HH-00000000', contact: `x${i}@example.test` })).statusCode)
    expect(answers).toEqual(Array(10).fill(202))
    const s = await submitted('recover-limited@example.test')
    const known = await post('/reissue', { reference: s.reference, contact: 'recover-limited@example.test' })
    const unknown = await post('/reissue', { reference: 'HH-00000000', contact: 'nobody@example.test' })
    expect(known.statusCode).toBe(429)
    expect(observed(unknown)).toEqual(observed(known))
    expect((await grantsOf(s.projectId)).map((g) => g.issued_reason)).toEqual(['submission'])
  })

  it('[HH-ID-09] only the form itself is checked visibly: a contact that is neither an email nor a phone, or no project named', async () => {
    for (const [payload, field, code] of [
      [{ reference: 'HH-00000000', contact: 'not a contact' }, 'body.contact', 'invalid_contact'],
      [{ contact: 'someone@example.test' }, 'body.reference', 'required'],
      [{ reference: '   ', contact: 'someone@example.test' }, 'body.reference', 'required'],
    ] as const) {
      const res = await post('/reissue', payload)
      expect([res.statusCode, res.json().error.fieldErrors]).toEqual([400, [expect.objectContaining({ field, code })]])
    }
    expect(parseContact(' Someone@Example.TEST ')).toEqual({ channel: 'email', value: 'someone@example.test' })
    expect(parseContact('1 (502) 555-0100')).toEqual({ channel: 'phone', value: '+15025550100' })
    expect(parseContact('12345')).toBeNull()
  })

  it('[HH-ID-09][HH-ID-04][T19] a reissued grant is limited to that project, even when another project shares the email', async () => {
    const email = 'recover-shared@example.test'
    const a = await submitted(email)
    const b = await submitted(email)
    const before = await grantsOf(b.projectId)
    // Both submissions' own links are delivered first, so the next link is the reissued one.
    expect(await deliveredLinks(email)).toHaveLength(2)
    expect((await post('/reissue', { reference: a.reference, contact: email })).statusCode).toBe(202)
    expect(await grantsOf(b.projectId)).toEqual(before)
    const links = await deliveredLinks(email)
    expect(links).toHaveLength(3)
    const fresh = links[2] as string
    const reissued = await t.db
      .selectFrom('identity.project_access_grants')
      .select(['id', 'nonce'])
      .where('project_id', '=', a.projectId)
      .where('issued_reason', '=', 'reissue')
      .execute()
    expect(reissued).toHaveLength(1)
    if (KEY.state !== 'configured') throw new Error('the synthetic key is configured')
    expect(fresh).toBe(accessToken(KEY.key, reissued[0]?.id as string, reissued[0]?.nonce as string))
    const cookie = await exchange(fresh, email)
    expect((await get('/api/v1/customer/access/session', cookie)).json()).toEqual({
      projects: [{ reference: a.reference }],
    })
    const other = await get(`/api/v1/customer/projects/${b.reference}`, cookie)
    expect([other.statusCode, other.json().error.code]).toEqual([404, 'NOT_FOUND'])
  })

  it('[HH-ID-09] a link staff revoked comes back only through staff: asking gets the same answer and sends nothing', async () => {
    const email = 'recover-staff-revoked@example.test'
    const s = await submitted(email)
    await drain()
    await withTx(t.db, (tx) => revokeProjectGrants(tx, { projectId: s.projectId, reason: 'staff_revoked', by: 'test' }))
    const res = await post('/reissue', { token: s.token, contact: email })
    expect([res.statusCode, res.json()]).toEqual([202, REISSUE_ACCEPTED])
    expect((await grantsOf(s.projectId)).map((g) => g.issued_reason)).toEqual(['submission'])
    expect(await deliveredLinks(email)).toHaveLength(1)
  })
})

describe('expiry and attempt limits come from configuration (TSK-0035, HH-ID-06, T18)', () => {
  it('[T18][HH-ID-06][HH-ID-09] the configured attempts end a code: then even the right code opens nothing, and a new code does', async () => {
    const email = 'limits-attempts@example.test'
    const s = await submitted(email)
    const limits = (await loadConfig(t.db)).get('verification.limits')
    if (limits.state !== 'CONFIGURED') throw new Error('verification.limits is seeded by migration 0010')
    const max = limits.value.maxAttemptsPerCode
    expect((await post('/codes', { token: s.token, channel: 'email' })).statusCode).toBe(202)
    const code = await deliveredCode(email)
    const answers: string[] = []
    for (let i = 0; i < max; i++) {
      const res = await post('/exchange', { token: s.token, channel: 'email', code: wrong(code) })
      expect(res.statusCode).toBe(400)
      answers.push(res.json().error.fieldErrors[0].code)
    }
    expect(answers).toEqual([...Array(max - 1).fill('invalid_code'), 'code_ended'])
    const right = await post('/exchange', { token: s.token, channel: 'email', code })
    expect([right.statusCode, right.json().error.fieldErrors[0].code]).toEqual([400, 'code_ended'])
    expect(right.headers['set-cookie']).toBeUndefined()
    // The neutral page offers a new code; once the resend cooldown has passed it is sent and works.
    await sql`UPDATE identity.verification_codes SET created_at = created_at - interval '1 hour', expires_at = expires_at - interval '1 hour'
               WHERE subject_ref = ${`grant:${s.grantId}:email`}`.execute(t.db)
    expect((await post('/codes', { token: s.token, channel: 'email' })).statusCode).toBe(202)
    const next = await post('/exchange', { token: s.token, channel: 'email', code: await deliveredCode(email) })
    expect(next.statusCode).toBe(200)
  })

  it('[T18][HH-ID-06] a code lasts the configured minutes; entered later it opens nothing and says code_ended', async () => {
    const email = 'limits-expired@example.test'
    const s = await submitted(email)
    const timings = (await loadConfig(t.db)).get('session.timings')
    if (timings.state !== 'CONFIGURED') throw new Error('session.timings is seeded by migration 0005')
    expect((await post('/codes', { token: s.token, channel: 'email' })).statusCode).toBe(202)
    const code = await deliveredCode(email)
    const row = await t.db
      .selectFrom('identity.verification_codes')
      .select(['created_at', 'expires_at'])
      .where('subject_ref', '=', `grant:${s.grantId}:email`)
      .executeTakeFirstOrThrow()
    expect(row.expires_at.getTime() - row.created_at.getTime()).toBe(timings.value.oneTimeCodeMinutes * 60_000)
    // One minute past the lifetime (FACT-SESSION-TIMINGS: 10 minutes).
    const late = new Date(row.expires_at.getTime() + 60_000)
    const grant = { ...s, id: s.grantId, expiresAt: new Date(Date.now() + 3_600_000) }
    const out = await withTx(t.db, (tx) =>
      exchangeAccessCode(tx, KEY, { grant, channel: 'email', code, clientIp: '192.0.2.200', now: late }),
    )
    expect(out).toEqual({ ok: false, ended: true })
    expect(
      await t.db.selectFrom('identity.customer_sessions').select('id').where('grant_id', '=', s.grantId).execute(),
    ).toEqual([])
  })

  it('[HH-ID-06] links last access.grants.linkHours; project sessions end after the configured idle time and maximum', async () => {
    const config = await loadConfig(t.db)
    const grants = config.get('access.grants')
    const timings = config.get('session.timings')
    if (grants.state !== 'CONFIGURED' || timings.state !== 'CONFIGURED') throw new Error('seeded by migrations')
    const email = 'limits-session@example.test'
    const s = await submitted(email)
    const g = await t.db
      .selectFrom('identity.project_access_grants')
      .select(['created_at', 'expires_at'])
      .where('id', '=', s.grantId)
      .executeTakeFirstOrThrow()
    expect(g.expires_at.getTime() - g.created_at.getTime()).toBe(grants.value.linkHours * 3_600_000)

    const idle = await exchange(s.token, email)
    const session = await t.db
      .selectFrom('identity.customer_sessions')
      .select(['id', 'idle_minutes', 'created_at', 'expires_at'])
      .where('grant_id', '=', s.grantId)
      .executeTakeFirstOrThrow()
    expect(session.idle_minutes).toBe(timings.value.customerSessionIdleMinutes)
    expect(session.expires_at.getTime() - session.created_at.getTime()).toBe(
      timings.value.customerSessionMaxHours * 3_600_000,
    )
    expect((await get('/api/v1/customer/access/session', idle)).statusCode).toBe(200)
    await sql`UPDATE identity.customer_sessions SET last_seen_at = now() - make_interval(mins => idle_minutes + 1)
               WHERE id = ${session.id}`.execute(t.db)
    expect((await get('/api/v1/customer/access/session', idle)).statusCode).toBe(401)

    await sql`UPDATE identity.verification_codes SET created_at = created_at - interval '1 hour'
               WHERE subject_ref = ${`grant:${s.grantId}:email`}`.execute(t.db)
    const max = await exchange(s.token, email)
    await sql`UPDATE identity.customer_sessions
                 SET created_at = now() - interval '9 hours', expires_at = now() - interval '1 minute'
               WHERE grant_id = ${s.grantId} AND revoked_at IS NULL`.execute(t.db)
    expect((await get('/api/v1/customer/access/session', max)).statusCode).toBe(401)
  })
})

describe('access secrets never leak (TSK-0035, HH-ID-08, T74)', () => {
  beforeAll(releaseAccessWording)

  it('[HH-ID-08][T74] after a full access journey no log line and no row of any table holds a token, a code or a session', async () => {
    const email = 'hygiene-journey@example.test'
    const typed = 'hygiene-typed-unknown@example.test'
    lines.length = 0
    const s = await submitted(email)
    const [link] = await deliveredLinks(email)
    expect(link).toBe(s.token)
    expect((await post('/open', { token: s.token })).statusCode).toBe(200)
    expect((await post('/codes', { token: s.token, channel: 'email' })).statusCode).toBe(202)
    const code = await deliveredCode(email)
    expect((await post('/exchange', { token: s.token, channel: 'email', code: wrong(code) })).statusCode).toBe(400)
    const first = await post('/exchange', { token: s.token, channel: 'email', code })
    const cookie = cookieOf(first)
    expect((await get(`/api/v1/customer/projects/${s.reference}`, cookie)).statusCode).toBe(200)
    await withTx(t.db, (tx) =>
      revokeProjectGrants(tx, { projectId: s.projectId, reason: 'corrected_link', by: 'test' }),
    )
    expect((await post('/reissue', { token: s.token, contact: typed })).statusCode).toBe(202)
    expect((await post('/reissue', { token: s.token, contact: email })).statusCode).toBe(202)
    const fresh = (await deliveredLinks(email)).at(-1) as string
    expect((await post('/codes', { token: fresh, channel: 'email' })).statusCode).toBe(202)
    const code2 = await deliveredCode(email)
    const second = cookieOf(await post('/exchange', { token: fresh, channel: 'email', code: code2 }))

    const secrets = [s.token, fresh, code, code2, cookie.split('=')[1] as string, second.split('=')[1] as string]
    // Every request of the journey was logged (at trace level), so the capture saw them all.
    expect(lines.filter((l) => l.includes('"incoming request"')).length).toBeGreaterThanOrEqual(10)
    const leaked = lines.filter((line) => secrets.some((x) => holds(line, x)) || line.includes(typed))
    expect(leaked).toEqual([])
    // Audit diffs, outbox events, jobs, deliveries, codes, grants, sessions and every other table (the scan does find
    // what is stored: the request's reference).
    expect((await rowsContaining([s.reference])).length).toBeGreaterThan(0)
    expect(await rowsContaining(secrets)).toEqual([])
    expect(await rowsContaining([typed])).toEqual([])
  })

  it('[HH-ID-08] access pages and answers stay out of shared caches, referrers, search and third-party sources', async () => {
    const s = await submitted('hygiene-headers@example.test')
    for (const url of ['/access', '/access/', '/access.html']) {
      const res = await get(url)
      expect(res.statusCode, url).toBe(200)
      expect(res.headers['cache-control'], url).toBe('no-store')
      expect(res.headers['referrer-policy'], url).toBe('no-referrer')
      expect(res.headers['x-robots-tag'], url).toBe('noindex, nofollow')
      // Same origin only: no analytics, embeds or other third-party sources can load on the page.
      const csp = String(res.headers['content-security-policy'])
      expect(csp, url).toMatch(/default-src 'self'/)
      expect(csp, url).toMatch(/connect-src 'self'/)
      expect(csp, url).not.toMatch(/https?:|\*/)
    }
    const answers = [
      await post('/open', { token: s.token }),
      await post('/codes', { token: s.token, channel: 'email' }),
      await post('/exchange', { token: s.token, channel: 'email', code: '000000' }),
      await post('/reissue', { token: s.token, contact: 'hygiene-headers@example.test' }),
      await post('/open', { token: 'A'.repeat(43) }),
    ]
    for (const res of answers) {
      expect(res.headers['cache-control']).toBe('private, no-store')
      expect(res.headers['referrer-policy']).toBe('no-referrer')
      expect(JSON.stringify(res.headers)).not.toContain(s.token)
      expect(res.body).not.toContain(s.token)
    }
  })
})
