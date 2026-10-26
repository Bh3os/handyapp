// The permanent customer dashboard and verified project claiming against PostgreSQL 16 and the provider fakes
// (TSK-0124; HH-ID-14, HH-ID-03, HH-ID-02, HH-ID-06, T20, T19, ENT-CustomerIdentityLink, OWN-DEC-160, OWN-DEC-198,
// RULE-SERVER-AUTHZ). Every visitor, address, code and template text here is synthetic (RULE-SYNTHETIC-DATA);
// nothing reaches a real provider.
import { Writable } from 'node:stream'
import { loadServiceSeed, syncServices } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import { PRIVACY_NOTICE } from '@handyhub/domain/legal'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { accessToken } from '../../src/modules/access/index.js'
import { codeDeliveryAutomation, readCodeKey, type CodeKeySettings } from '../../src/modules/identity/index.js'
import { createAutomationRegistry } from '../../src/platform/automation.js'
import { loadConfig } from '../../src/platform/config/index.js'
import { createWorker } from '../../src/platform/jobs.js'
import { createLogger } from '../../src/platform/logger.js'
import { createProviders } from '../../src/providers/index.js'
import { readProviderSettings } from '../../src/providers/settings.js'
import { standaloneCode } from '../fixtures/code-message.js'
import { testConfig } from '../fixtures/env.js'

// Built at runtime so no literal looks like a credential (RULE-SYNTHETIC-DATA).
const KEY: CodeKeySettings = readCodeKey({
  HANDYHUB_ENV: 'ci',
  CODE_HASH_KEY: ['synthetic', 'customer', 'dashboard', 'key', 'for', 'tests', 'only'].join('-'),
})
const COOKIE = '__Host-hh_customer'

// Every log line of the app, the worker and the providers (no code, token or contact value may appear).
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
const providers = createProviders(readProviderSettings({ HANDYHUB_ENV: 'ci' }), { logger: log })
async function drain() {
  const w = createWorker({
    db: t.db,
    registry: createAutomationRegistry([codeDeliveryAutomation({ providers, codeKey: KEY })]),
    logger: log,
  })
  for (let i = 0; i < 20; i++) {
    const r = await w.runOnce()
    if (r.dispatched + r.succeeded + r.retried + r.failed + r.cancelled === 0) break
  }
}

beforeAll(async () => {
  t = await createTestDatabase()
  await syncServices(t.db, loadServiceSeed())
  app = await buildApp({
    config: testConfig({ TRUST_PROXY_HOPS: '1' }),
    api: { db: t.db, codeKey: KEY },
    logger: log,
  })
})
afterAll(async () => {
  await app?.close()
  await t?.drop()
})

let n = 0
let submitIp = 10
const future = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10)
type Sent = { reference: string; requestId: string; projectId: string; contactId: string; cap: string; token: string }
async function submitted(email: string): Promise<Sent> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/public/requests',
    headers: { 'idempotency-key': `synthetic-dashboard-${++n}-0001`, 'x-forwarded-for': `198.51.100.${++submitIp}` },
    payload: {
      formVersion: 'test-1',
      privacyNoticeVersion: PRIVACY_NOTICE.documentId,
      services: [{ serviceId: 'SVC-DW-01' }],
      notSure: false,
      description: 'Synthetic dashboard project: a cracked tile.',
      property: { street: '124 Synthetic Way', city: 'Testville', state: 'KY', zip: '40000', propertyType: 'house' },
      timing: { preferredDate: future, flexible: false, needHelpToday: false, windows: ['any_time'] },
      estimatePreference: 'let_handyhub_decide',
      contact: { fullName: 'Test Customer', email, phone: '(502) 555-0124', preferredChannel: 'email' },
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
    cap: String(res.headers['receipt-capability']),
    token: KEY.state === 'configured' ? accessToken(KEY.key, grant.id, grant.nonce) : '',
  }
}

// Each test calls from its own synthetic address (RFC 5737), so per-address limits never cross tests.
let client = ''
let clients = 0
beforeEach(() => {
  client = `203.0.113.${++clients}`
})
const call = (
  method: 'GET' | 'POST',
  url: string,
  opts: { payload?: Record<string, unknown>; cookie?: string; cap?: string } = {},
) =>
  app.inject({
    method,
    url: `/api/v1${url}`,
    headers: {
      'x-forwarded-for': client,
      ...(opts.cookie ? { cookie: opts.cookie } : {}),
      ...(opts.cap ? { 'receipt-capability': opts.cap } : {}),
    },
    ...(opts.payload ? { payload: opts.payload } : method === 'POST' ? { payload: {} } : {}),
  })
const cookieOf = (res: { headers: Record<string, unknown> }) => {
  const set = String(res.headers['set-cookie'] ?? '')
  expect(set).toMatch(new RegExp(`^${COOKIE}=[A-Za-z0-9_-]{43};`))
  return set.split(';')[0] as string
}
const sentTo = (destination: string) => (providers.fakes.email?.sent ?? []).filter((m) => m.to === destination)
async function deliveredCode(destination: string): Promise<string> {
  await drain()
  const code = sentTo(destination)
    .flatMap((m) => /verification code is (\d{6})\b/.exec(m.text)?.[1] ?? [])
    .at(-1)
  if (!code) throw new Error(`no code was delivered to ${destination}`)
  return code
}
const codesTo = async (destination: string) => {
  await drain()
  return sentTo(destination).length
}
const wrong = (code: string) => String((Number(code) + 1) % 1_000_000).padStart(6, '0')
/** What a caller can observe of an answer: status, body without its request ID, and every stable header. */
function observed(res: { statusCode: number; headers: Record<string, unknown>; body: string }) {
  const body = JSON.parse(res.body) as { error?: { requestId?: string } }
  if (body.error) delete body.error.requestId
  const headers = Object.fromEntries(
    Object.entries(res.headers).filter(([k]) => !['date', 'x-request-id', 'content-length'].includes(k)),
  )
  return { status: res.statusCode, body, headers }
}
const afterCooldown = (destination: string) =>
  sql`UPDATE identity.verification_codes SET created_at = created_at - interval '2 minutes'
      WHERE destination = ${destination}`.execute(t.db)
async function verifyOnReceipt(s: Sent, email: string) {
  expect(
    (await call('POST', '/public/request-receipt/contact/codes', { cap: s.cap, payload: { channel: 'email' } }))
      .statusCode,
  ).toBe(202)
  const res = await call('POST', '/public/request-receipt/contact/verify', {
    cap: s.cap,
    payload: { channel: 'email', code: await deliveredCode(email) },
  })
  expect(res.statusCode).toBe(200)
}
/** A request whose email was verified on its receipt, with the account created there: the account's cookie. */
async function accountFor(email: string): Promise<{ s: Sent; cookie: string; accountId: string }> {
  const s = await submitted(email)
  await verifyOnReceipt(s, email)
  await afterCooldown(email)
  expect(
    (await call('POST', '/public/request-receipt/account/codes', { cap: s.cap, payload: { channel: 'email' } }))
      .statusCode,
  ).toBe(202)
  const res = await call('POST', '/public/request-receipt/account', {
    cap: s.cap,
    payload: { channel: 'email', code: await deliveredCode(email) },
  })
  expect(res.statusCode).toBe(200)
  const row = await t.db
    .selectFrom('identity.customer_accounts')
    .select('id')
    .where('sign_in_email', '=', email)
    .executeTakeFirstOrThrow()
  return { s, cookie: cookieOf(res), accountId: row.id }
}
const askCode = (cookie: string, reference: string, contact: string) =>
  call('POST', '/customer/account/claims/codes', { cookie, payload: { reference, contact } })
const claim = (cookie: string, reference: string, contact: string, code: string) =>
  call('POST', '/customer/account/claims', { cookie, payload: { reference, contact, code } })
const linksOf = (accountId: string) =>
  t.db
    .selectFrom('identity.customer_identity_links')
    .selectAll()
    .where('account_id', '=', accountId)
    .orderBy('decided_at')
    .execute()
type Listed = {
  access: string
  projects: { reference: string; section: string; documents: number; status: { situation: string } }[]
}
const dashboard = async (cookie: string) => {
  const res = await call('GET', '/customer/projects', { cookie })
  expect(res.statusCode).toBe(200)
  return res.json<Listed>()
}
const sections = async (cookie: string) =>
  Object.fromEntries((await dashboard(cookie)).projects.map((p) => [p.reference, p.section]))

describe('verified project claiming (TSK-0124, HH-ID-14, OWN-DEC-160)', () => {
  it('[HH-ID-14][T20][HH-ID-03] a code to the project’s own verified contact adds that one project; the same IDs; nothing duplicated', async () => {
    const { s: first, cookie, accountId } = await accountFor('claim-owner@example.test')
    // A second request with another email, verified on its own receipt, never in the account so far.
    const otherEmail = 'claim-other@example.test'
    const second = await submitted(otherEmail)
    await verifyOnReceipt(second, otherEmail)
    expect((await call('GET', `/customer/projects/${second.reference}`, { cookie })).statusCode).toBe(404)
    const before = await t.db.selectFrom('crm.projects').selectAll().where('id', '=', second.projectId).execute()

    await afterCooldown(otherEmail)
    const asked = await askCode(cookie, second.reference.toLowerCase(), ` ${otherEmail.toUpperCase()} `)
    expect(asked.statusCode).toBe(202)
    expect(asked.json()).toEqual({ accepted: true, codeMinutes: 10 })
    const code = await deliveredCode(otherEmail)

    // A wrong code links nothing and is counted.
    const bad = await claim(cookie, second.reference, otherEmail, wrong(code))
    expect(bad.statusCode).toBe(400)
    expect(bad.json().error.fieldErrors).toEqual([
      { field: 'body.code', code: 'invalid_code', message: expect.any(String) },
    ])
    expect(await linksOf(accountId)).toHaveLength(1)

    const ok = await claim(cookie, second.reference, otherEmail, code)
    expect(ok.statusCode).toBe(200)
    expect(ok.json()).toEqual({ project: { reference: second.reference } })
    const links = await linksOf(accountId)
    expect(links.map((l) => [l.project_id, l.evidence, l.state])).toEqual([
      [first.projectId, 'receipt_code', 'active'],
      [second.projectId, 'claim_code', 'active'],
    ])
    expect(links[1]).toMatchObject({
      request_id: second.requestId,
      contact_id: second.contactId,
      evidence_channel: 'email',
      authority: 'owner',
      decided_by: `account:${accountId}`,
    })
    // The project keeps its ID and contents; the account session opens it at once, in its section.
    expect(await t.db.selectFrom('crm.projects').selectAll().where('id', '=', second.projectId).execute()).toEqual(
      before,
    )
    expect((await call('GET', `/customer/projects/${second.reference}`, { cookie })).statusCode).toBe(200)
    const list = await dashboard(cookie)
    expect(list.access).toBe('account')
    expect(list.projects.map((p) => [p.reference, p.section]).sort()).toEqual(
      [
        [first.reference, 'active'],
        [second.reference, 'active'],
      ].sort(),
    )
    const account = await call('GET', '/customer/account', { cookie })
    expect(
      account
        .json()
        .projects.map((p: { reference: string }) => p.reference)
        .sort(),
    ).toEqual([first.reference, second.reference].sort())

    // Claiming it again sends nothing and links nothing twice; the answer is the same.
    await afterCooldown(otherEmail)
    const sentBefore = await codesTo(otherEmail)
    const again = await askCode(cookie, second.reference, otherEmail)
    expect(observed(again)).toEqual(observed(asked))
    expect(await codesTo(otherEmail)).toBe(sentBefore)
    expect(await linksOf(accountId)).toHaveLength(2)

    // The audit log records the claim and its project, never the reference, the address or the code.
    const audit = await t.db
      .selectFrom('platform.audit_events')
      .select(['action', 'summary', 'result', 'target_id'])
      .where('action', 'like', 'customer_account.claim%')
      .where('target_id', '=', accountId)
      .orderBy('seq')
      .execute()
    expect(audit.map((a) => [a.action, a.result])).toEqual([
      ['customer_account.claim_code', 'succeeded'],
      ['customer_account.claim', 'denied'],
      ['customer_account.claim', 'succeeded'],
      ['customer_account.claim_code', 'succeeded'],
    ])
    expect(audit[2]?.summary).toMatchObject({ project: second.projectId, channel: 'email' })
    expect(audit[3]?.summary).toMatchObject({ issued: false, outcome: 'already_linked' })
    const text = JSON.stringify(audit)
    expect(text).not.toContain(otherEmail)
    expect(text).not.toContain(second.reference)
    expect(text).not.toMatch(standaloneCode(code))
    expect(lines.join('\n')).not.toMatch(standaloneCode(code))
  })

  it('[HH-ID-03][HH-ID-02][OWN-DEC-198 F6] an unverified or wrong match links nothing, sends nothing, and answers like an unknown reference', async () => {
    const email = 'claim-unverified@example.test'
    const { cookie, accountId } = await accountFor(email)
    // The same email as the account, on a request whose contact was never verified: a match, but not proof.
    const unverified = await submitted(email)
    const verifiedOther = await submitted('claim-elsewhere@example.test')
    await verifyOnReceipt(verifiedOther, 'claim-elsewhere@example.test')
    await afterCooldown(email)
    const codesBefore = await codesTo(email)

    const unknown = await askCode(cookie, 'HH-00000000', email)
    expect(unknown.statusCode).toBe(202)
    const answers = [
      await askCode(cookie, unverified.reference, email),
      // A verified project with another contact than the one typed.
      await askCode(cookie, verifiedOther.reference, email),
    ]
    for (const a of answers) expect(observed(a)).toEqual(observed(unknown))
    expect(await codesTo(email)).toBe(codesBefore)

    // Whatever code is tried, nothing links and the project stays out of reach.
    const guessed = await claim(cookie, unverified.reference, email, '123456')
    const unknownClaim = await claim(cookie, 'HH-00000000', email, '123456')
    expect(guessed.statusCode).toBe(400)
    expect(observed(guessed)).toEqual(observed(unknownClaim))
    expect(await linksOf(accountId)).toHaveLength(1)
    expect((await call('GET', `/customer/projects/${unverified.reference}`, { cookie })).statusCode).toBe(404)
    const listed = (await dashboard(cookie)).projects.map((p) => p.reference)
    expect(listed).not.toContain(unverified.reference)
    expect(listed).not.toContain(verifiedOther.reference)
  })

  it('[OWN-DEC-198 F5] a project whose link staff revoked is not restored by a claim; nothing is sent', async () => {
    const { cookie, accountId } = await accountFor('claim-revoked-owner@example.test')
    const email = 'claim-revoked@example.test'
    const s = await submitted(email)
    await verifyOnReceipt(s, email)
    await sql`UPDATE identity.project_access_grants
                 SET revoked_at = now(), revoke_reason = 'staff_revoked', revoked_by = 'staff-synthetic-owner'
               WHERE project_id = ${s.projectId} AND revoked_at IS NULL`.execute(t.db)
    await afterCooldown(email)
    const before = await codesTo(email)
    expect((await askCode(cookie, s.reference, email)).statusCode).toBe(202)
    expect(await codesTo(email)).toBe(before)
    expect((await claim(cookie, s.reference, email, '123456')).statusCode).toBe(400)
    expect(await linksOf(accountId)).toHaveLength(1)
  })

  it('[RULE-SERVER-AUTHZ][HH-ID-14] only an account session claims; malformed input and texts are refused alike for everyone', async () => {
    const email = 'claim-guest@example.test'
    const s = await submitted(email)
    // No session: 401. A guest-link session: NOT_FOUND, like a missing record.
    expect((await askCode('', s.reference, email)).statusCode).toBe(401)
    expect(
      (await call('POST', '/public/access/codes', { payload: { token: s.token, channel: 'email' } })).statusCode,
    ).toBe(202)
    const exchanged = await call('POST', '/public/access/exchange', {
      payload: { token: s.token, channel: 'email', code: await deliveredCode(email) },
    })
    const guest = cookieOf(exchanged)
    expect((await askCode(guest, s.reference, email)).statusCode).toBe(404)
    expect((await claim(guest, s.reference, email, '123456')).statusCode).toBe(404)
    // A guest link's dashboard is its one project, without Add a project.
    const own = await dashboard(guest)
    expect(own.access).toBe('project_link')
    expect(own.projects.map((p) => p.reference)).toEqual([s.reference])

    const { cookie } = await accountFor('claim-input@example.test')
    const badRef = await askCode(cookie, 'not-a-reference', email)
    expect(badRef.statusCode).toBe(400)
    expect(badRef.json().error.fieldErrors[0].code).toBe('invalid_reference')
    const badContact = await askCode(cookie, s.reference, 'nobody')
    expect(badContact.json().error.fieldErrors[0].code).toBe('invalid_contact')
    // Live texts are off (sms.live_delivery, OWN-DEC-190): every phone gets the same refusal before any record is read.
    const phone = await askCode(cookie, s.reference, '(502) 555-0124')
    const otherPhone = await askCode(cookie, 'HH-00000000', '(502) 555-0199')
    expect(phone.statusCode).toBe(400)
    expect(phone.json().error.fieldErrors[0].code).toBe('texts_unavailable')
    expect(observed(phone)).toEqual(observed(otherPhone))
  })
})

describe('the permanent dashboard: Active, Project History and Cancelled/Archived (TSK-0124, HH-ID-14)', () => {
  it('[HH-ID-14][HH-ID-06][OWN-DEC-160] every linked project sits in its section; a guest link’s expiry closes and moves nothing', async () => {
    const email = 'dashboard-sections@example.test'
    const { s: active, cookie, accountId } = await accountFor(email)
    // Three more requests, each with its own verified email, claimed into the account with a code to that email.
    const more: Sent[] = []
    for (let i = 1; i <= 3; i++) {
      const own = `dashboard-sections-${i}@example.test`
      const s = await submitted(own)
      await verifyOnReceipt(s, own)
      await afterCooldown(own)
      expect((await askCode(cookie, s.reference, own)).statusCode).toBe(202)
      expect((await claim(cookie, s.reference, own, await deliveredCode(own))).statusCode).toBe(200)
      more.push(s)
    }
    const [done, closed, canceled] = more as [Sent, Sent, Sent]
    // Synthetic lifecycle states: the Owner's quality review passed; a request closed without a job; canceled.
    await sql`UPDATE crm.projects SET state = 'completed' WHERE id = ${done.projectId}`.execute(t.db)
    await sql`UPDATE crm.projects SET state = 'closed' WHERE id = ${closed.projectId}`.execute(t.db)
    await sql`UPDATE crm.projects SET state = 'canceled' WHERE id = ${canceled.projectId}`.execute(t.db)
    expect(await sections(cookie)).toEqual({
      [active.reference]: 'active',
      [done.reference]: 'completed',
      [closed.reference]: 'archived',
      [canceled.reference]: 'archived',
    })

    // Every guest link of these projects expires: the account still opens all of them, in the same sections, and no
    // project state changes.
    const states = await t.db.selectFrom('crm.projects').select(['id', 'state']).orderBy('id').execute()
    // The clock passing 24 hours, in this throwaway database: a grant's expiry is never rewritten otherwise.
    await t.db.transaction().execute(async (tx) => {
      await sql`ALTER TABLE identity.project_access_grants DISABLE TRIGGER project_access_grants_guard`.execute(tx)
      await sql`UPDATE identity.project_access_grants SET created_at = now() - interval '25 hours', expires_at = now() - interval '1 hour'
                 WHERE project_id IN (${sql.join(
                   [active, ...more].map((s) => s.projectId),
                   sql`, `,
                 )})`.execute(tx)
      await sql`ALTER TABLE identity.project_access_grants ENABLE TRIGGER project_access_grants_guard`.execute(tx)
    })
    expect(
      await t.db
        .selectFrom('identity.project_access_grants')
        .select('id')
        .where(
          'project_id',
          'in',
          [active, ...more].map((s) => s.projectId),
        )
        .where('expires_at', '>', new Date())
        .execute(),
    ).toEqual([])
    expect(Object.keys(await sections(cookie))).toHaveLength(4)
    for (const s of [active, ...more])
      expect((await call('GET', `/customer/projects/${s.reference}/documents`, { cookie })).statusCode).toBe(200)
    expect(await t.db.selectFrom('crm.projects').select(['id', 'state']).orderBy('id').execute()).toEqual(states)
    expect(await linksOf(accountId)).toHaveLength(4)
    // No document has been shared yet.
    expect((await dashboard(cookie)).projects.map((p) => p.documents)).toEqual([0, 0, 0, 0])
  })

  it('[HH-ID-06][OWN-DEC-160][OWN-DEC-198 F5] the 24-hour guest link and the reissue limit are recorded as decided', async () => {
    const config = await loadConfig(t.db)
    const grants = config.get('access.grants')
    const recovery = config.get('access.recovery')
    if (grants.state !== 'CONFIGURED' || recovery.state !== 'CONFIGURED') throw new Error('seeded by migrations')
    expect(grants).toMatchObject({ value: { linkHours: 24 }, proposed: false, version: 2 })
    expect(grants.sourceIds).toContain('OWN-DEC-160')
    expect(recovery).toMatchObject({ value: { maxReissuesPerProjectPerDay: 3 }, proposed: false, version: 2 })
    expect(recovery.sourceIds).toContain('OWN-DEC-198')
  })
})
