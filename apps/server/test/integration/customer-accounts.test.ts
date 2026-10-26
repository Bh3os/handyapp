// Optional customer accounts with passwordless sign-in against PostgreSQL 16 and the provider fakes (TSK-0036; HH-ID-10,
// HH-ID-11, HH-ID-03, HH-INT-14, T20, T22, ENT-CustomerAccount, ENT-CustomerIdentityLink, RULE-SERVER-AUTHZ). Every
// visitor, address, number, code and template text here is synthetic (RULE-SYNTHETIC-DATA); nothing reaches a real
// provider.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Writable } from 'node:stream'
import { loadServiceSeed, syncServices, withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import { PRIVACY_NOTICE, SMS_DISCLOSURE } from '@handyhub/domain/legal'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { accessToken } from '../../src/modules/access/index.js'
import { closeCustomerAccount, contactChangedNoticeAutomation } from '../../src/modules/accounts/index.js'
import {
  codeDeliveryAutomation,
  readCodeKey,
  resolveCustomerSession,
  type CodeKeySettings,
} from '../../src/modules/identity/index.js'
import { createAutomationRegistry } from '../../src/platform/automation.js'
import { loadConfig, recordPolicyVersion } from '../../src/platform/config/index.js'
import { createWorker } from '../../src/platform/jobs.js'
import { createLogger } from '../../src/platform/logger.js'
import { createProviders } from '../../src/providers/index.js'
import { readProviderSettings } from '../../src/providers/settings.js'
import { standaloneCode } from '../fixtures/code-message.js'
import { testConfig } from '../fixtures/env.js'

// Built at runtime so no literal looks like a credential (RULE-SYNTHETIC-DATA).
const KEY: CodeKeySettings = readCodeKey({
  HANDYHUB_ENV: 'ci',
  CODE_HASH_KEY: ['synthetic', 'customer', 'accounts', 'key', 'for', 'tests', 'only'].join('-'),
})
const COOKIE = '__Host-hh_customer'
const MIN = 60_000

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
let siteDir = ''
const providers = createProviders(readProviderSettings({ HANDYHUB_ENV: 'ci' }), { logger: log })
const worker = () =>
  createWorker({
    db: t.db,
    registry: createAutomationRegistry([
      codeDeliveryAutomation({ providers, codeKey: KEY }),
      contactChangedNoticeAutomation({ providers: { email: providers.email, sms: null } }),
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

beforeAll(async () => {
  t = await createTestDatabase()
  await syncServices(t.db, loadServiceSeed())
  siteDir = mkdtempSync(join(tmpdir(), 'site-accounts-'))
  writeFileSync(join(siteDir, 'account.html'), '<!doctype html><title>t</title><h1>Synthetic account page</h1>')
  writeFileSync(join(siteDir, '404.html'), '<!doctype html><title>t</title><h1>Synthetic not found</h1>')
  app = await buildApp({
    config: { ...testConfig({ TRUST_PROXY_HOPS: '1' }), siteDir },
    api: { db: t.db, codeKey: KEY },
    logger: log,
  })
  // TSK-0149 (OWN-DEC-198 F4): a code goes by text only while live texts are on (sms.live_delivery, off until A2P
  // 10DLC); this throwaway database turns them on so the phone paths here can be exercised. With texts off the phone is
  // refused for everyone: account-security.test.ts.
  await recordPolicyVersion(t.db, {
    key: 'sms.live_delivery',
    value: { enabled: true },
    sourceIds: ['TEST-SYNTHETIC'],
    changedBy: 'test',
    reason: 'synthetic test configuration',
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
  customerId: string
  contactId: string
  cap: string
  grantId: string
  token: string
}
async function submitted(email: string, phone?: string): Promise<Sent> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/public/requests',
    headers: { 'idempotency-key': `synthetic-accounts-${++n}-0001`, 'x-forwarded-for': `198.51.100.${++submitIp}` },
    payload: {
      formVersion: 'test-1',
      privacyNoticeVersion: PRIVACY_NOTICE.documentId,
      services: [{ serviceId: 'SVC-DW-01' }],
      notSure: false,
      description: 'Synthetic account project: a squeaky stair.',
      property: { street: '300 Synthetic Way', city: 'Testville', state: 'KY', zip: '40000', propertyType: 'house' },
      timing: { preferredDate: future, flexible: false, needHelpToday: false, windows: ['any_time'] },
      estimatePreference: 'let_handyhub_decide',
      contact: { fullName: 'Test Customer', email, phone: phone ?? '(502) 555-0170', preferredChannel: 'email' },
      ...(phone ? { smsOptIn: true, smsDisclosureVersion: SMS_DISCLOSURE.documentId } : { smsOptIn: false }),
      marketingOptIn: false,
    },
  })
  expect(res.statusCode).toBe(201)
  const reference = res.json<{ reference: string }>().reference
  const r = await t.db
    .selectFrom('intake.requests')
    .select(['id', 'project_id', 'customer_id', 'contact_id'])
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
    customerId: r.customer_id,
    contactId: r.contact_id,
    cap: String(res.headers['receipt-capability']),
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
const call = (
  method: 'GET' | 'POST',
  url: string,
  opts: { payload?: Record<string, unknown>; cookie?: string; cap?: string; ip?: string } = {},
) =>
  app.inject({
    method,
    url: `/api/v1${url}`,
    headers: {
      'x-forwarded-for': opts.ip ?? client,
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
const tokenOf = (cookie: string) => cookie.slice(COOKIE.length + 1)
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
const codesTo = async (destination: string) => {
  await drain()
  return sentTo(destination).length
}
function must<T>(value: T | undefined | null): T {
  if (value === undefined || value === null) throw new Error('expected a row')
  return value
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

/** Lets the resend cooldown pass for a destination by moving its codes back in time. */
const afterCooldown = (destination: string) =>
  sql`UPDATE identity.verification_codes SET created_at = created_at - interval '2 minutes'
      WHERE destination = ${destination}`.execute(t.db)
/** Verifies a request's email (or phone, by text) on its receipt with a delivered code. */
async function verifyOnReceipt(s: Sent, channel: 'email' | 'phone', destination: string) {
  expect(
    (await call('POST', '/public/request-receipt/contact/codes', { cap: s.cap, payload: { channel } })).statusCode,
  ).toBe(202)
  const res = await call('POST', '/public/request-receipt/contact/verify', {
    cap: s.cap,
    payload: { channel, code: await deliveredCode(destination) },
  })
  expect(res.statusCode).toBe(200)
}
/** Create an Account on the receipt: the code to a verified value, then the code entered. */
async function enrollOnReceipt(s: Sent, channel: 'email' | 'phone', destination: string) {
  await afterCooldown(destination)
  const sent = await call('POST', '/public/request-receipt/account/codes', { cap: s.cap, payload: { channel } })
  expect(sent.statusCode).toBe(202)
  const res = await call('POST', '/public/request-receipt/account', {
    cap: s.cap,
    payload: { channel, code: await deliveredCode(destination) },
  })
  expect(res.statusCode).toBe(200)
  return { cookie: cookieOf(res), account: res.json<{ account: { projects: { reference: string }[] } }>().account }
}
async function signIn(contact: string, destination = contact, ip?: string) {
  await afterCooldown(destination)
  const sent = await call('POST', '/public/account/sign-in/codes', { payload: { contact }, ...(ip ? { ip } : {}) })
  expect(sent.statusCode).toBe(202)
  const res = await call('POST', '/public/account/sign-in', {
    payload: { contact, code: await deliveredCode(destination) },
    ...(ip ? { ip } : {}),
  })
  expect(res.statusCode).toBe(200)
  return cookieOf(res)
}
const accountsWith = (email: string) =>
  t.db.selectFrom('identity.customer_accounts').selectAll().where('sign_in_email', '=', email).execute()
const linksOf = (accountId: string) =>
  t.db
    .selectFrom('identity.customer_identity_links')
    .selectAll()
    .where('account_id', '=', accountId)
    .orderBy('decided_at')
    .execute()
/** The business records of a request, to show that enrollment and closing change none of them. */
const recordsOf = async (s: Sent) => ({
  request: await t.db.selectFrom('intake.requests').selectAll().where('id', '=', s.requestId).executeTakeFirst(),
  project: await t.db.selectFrom('crm.projects').selectAll().where('id', '=', s.projectId).executeTakeFirst(),
  customer: await t.db.selectFrom('crm.customers').selectAll().where('id', '=', s.customerId).executeTakeFirst(),
})
const counts = async () => {
  const one = async (table: 'intake.requests' | 'crm.projects' | 'crm.customers' | 'crm.contacts' | 'crm.properties') =>
    Number(
      (
        await t.db
          .selectFrom(table)
          .select((eb) => eb.fn.countAll<string>().as('n'))
          .executeTakeFirstOrThrow()
      ).n,
    )
  return {
    requests: await one('intake.requests'),
    projects: await one('crm.projects'),
    customers: await one('crm.customers'),
    contacts: await one('crm.contacts'),
    properties: await one('crm.properties'),
  }
}

/**
 * TSK-0120: the owner's account_email_changed wording is wired, so the notice can be sent and the change is available.
 * To show the change waits whenever the notice cannot be sent, a test takes the notice off messages.automatic for a
 * moment (a synthetic configuration version in this test database only) and puts the list back afterwards.
 */
async function withoutContactNotice(run: () => Promise<void>) {
  const list = (await loadConfig(t.db)).get('messages.automatic')
  if (list.state !== 'CONFIGURED') throw new Error('messages.automatic is seeded')
  await recordPolicyVersion(t.db, {
    key: 'messages.automatic',
    value: { ...list.value, customer: list.value.customer.filter((k) => k !== 'account.contact_changed') },
    sourceIds: ['TSK-0036'],
    changedBy: 'staff-synthetic-owner',
    reason: 'Synthetic test: the notice taken off the list',
  })
  try {
    await run()
  } finally {
    await recordPolicyVersion(t.db, {
      key: 'messages.automatic',
      value: list.value,
      sourceIds: ['TSK-0036'],
      changedBy: 'staff-synthetic-owner',
      reason: 'Synthetic test: the list restored',
    })
  }
}
/** The notices of a sign-in email change the test provider took (the owner's account_email_changed). */
const changeNotices = () =>
  (providers.fakes.email?.sent ?? []).filter((m) => m.subject === 'HandyHub | Your Account Email Was Changed')

describe('enrollment from the receipt offer links only the verified project, without duplicates (T20)', () => {
  it('[HH-ID-10][HH-INT-14][T20][HH-ID-03] one account, only this project; the same IDs; nothing duplicated; the other project of the same email stays unlinked until it is verified', async () => {
    const email = 'enroll-t20@example.test'
    const first = await submitted(email)
    const second = await submitted(email)
    await verifyOnReceipt(first, 'email', email)
    const before = await counts()
    const firstRecords = await recordsOf(first)

    const { cookie, account } = await enrollOnReceipt(first, 'email', email)
    expect(account.projects).toEqual([{ reference: first.reference }])
    const created = must((await accountsWith(email))[0])
    expect(created).toMatchObject({
      state: 'active',
      sign_in_email: email,
      sign_in_phone: null,
      customer_id: first.customerId,
      contact_id: first.contactId,
      enrolled_via: 'receipt_offer',
      credential_type: 'one_time_code',
    })
    const links = await linksOf(created.id)
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({
      project_id: first.projectId,
      request_id: first.requestId,
      contact_id: first.contactId,
      customer_id: first.customerId,
      authority: 'owner',
      evidence: 'receipt_code',
      evidence_channel: 'email',
      state: 'active',
    })
    // The request, project and customer keep their IDs and contents; nothing new was created besides the account.
    expect(await counts()).toEqual(before)
    expect(await recordsOf(first)).toEqual(firstRecords)
    // The account session opens the enrolled project only; the other project of the same email is NOT_FOUND.
    expect((await call('GET', `/customer/projects/${first.reference}`, { cookie })).statusCode).toBe(200)
    const other = await call('GET', `/customer/projects/${second.reference}`, { cookie })
    expect(other.statusCode).toBe(404)
    expect(other.body).not.toContain(second.reference)
    const view = await call('GET', '/customer/account', { cookie })
    expect(view.json()).toEqual({
      email: 'e***@example.test',
      phone: null,
      projects: [{ reference: first.reference }],
      freshVerification: true,
      emailChange: 'available',
      texts: 'available',
    })

    // Enrolling again links nothing twice and creates no second account.
    await enrollOnReceipt(first, 'email', email)
    expect(await accountsWith(email)).toHaveLength(1)
    expect(await linksOf(created.id)).toHaveLength(1)

    // The second project attaches only once its own contact is verified and enrolled; it joins the same account.
    await verifyOnReceipt(second, 'email', email)
    const again = await enrollOnReceipt(second, 'email', email)
    expect(again.account.projects.map((p) => p.reference).sort()).toEqual([first.reference, second.reference].sort())
    expect(await accountsWith(email)).toHaveLength(1)
    expect((await linksOf(created.id)).map((l) => l.project_id).sort()).toEqual(
      [first.projectId, second.projectId].sort(),
    )
    expect(await counts()).toEqual(before)
  })

  it('[HH-ID-10][HH-INT-13] the code goes only to an already verified value; a wrong code creates nothing and is counted', async () => {
    const email = 'enroll-unverified@example.test'
    const s = await submitted(email)
    const notVerified = await call('POST', '/public/request-receipt/account/codes', {
      cap: s.cap,
      payload: { channel: 'email' },
    })
    expect(notVerified.statusCode).toBe(400)
    expect(notVerified.json().error.fieldErrors[0].code).toBe('not_verified')
    const phone = await call('POST', '/public/request-receipt/account/codes', {
      cap: s.cap,
      payload: { channel: 'phone' },
    })
    expect(phone.json().error.fieldErrors[0].code).toBe('not_verified')

    await verifyOnReceipt(s, 'email', email)
    expect(
      (await call('POST', '/public/request-receipt/account/codes', { cap: s.cap, payload: { channel: 'email' } }))
        .statusCode,
    ).toBe(202)
    const code = await deliveredCode(email)
    const bad = await call('POST', '/public/request-receipt/account', {
      cap: s.cap,
      payload: { channel: 'email', code: wrong(code) },
    })
    expect(bad.statusCode).toBe(400)
    expect(bad.json().error.fieldErrors).toEqual([
      { field: 'body.code', code: 'invalid_code', message: expect.any(String) },
    ])
    expect(bad.headers['set-cookie']).toBeUndefined()
    expect(await accountsWith(email)).toHaveLength(0)
    const attempts = await t.db
      .selectFrom('identity.verification_codes')
      .select('attempts')
      .where('purpose', '=', 'account_sign_in')
      .where('destination', '=', email)
      .executeTakeFirstOrThrow()
    expect(attempts.attempts).toBe(1)
  })

  it('[HH-ID-03][RULE-SERVER-AUTHZ] without the receipt capability, or with an unknown one, nothing is sent or created (NOT_FOUND)', async () => {
    const none = await call('POST', '/public/request-receipt/account/codes', { payload: { channel: 'email' } })
    expect(none.statusCode).toBe(404)
    const unknown = await call('POST', '/public/request-receipt/account', {
      cap: 'x'.repeat(43),
      payload: { channel: 'email', code: '123456' },
    })
    expect(unknown.statusCode).toBe(404)
    expect(observed(unknown).body).toEqual(observed(none).body)
  })

  it('[HH-ID-10][HH-INT-14] later, from the project’s guest link: only that project attaches, and the guest session becomes the account session', async () => {
    const email = 'enroll-later@example.test'
    const s = await submitted(email)
    expect(
      (await call('POST', '/public/access/codes', { payload: { token: s.token, channel: 'email' } })).statusCode,
    ).toBe(202)
    const exchanged = await call('POST', '/public/access/exchange', {
      payload: { token: s.token, channel: 'email', code: await deliveredCode(email) },
    })
    expect(exchanged.statusCode).toBe(200)
    const guest = cookieOf(exchanged)
    // A guest-link session is not an account.
    expect((await call('GET', '/customer/account', { cookie: guest })).statusCode).toBe(404)
    const channels = await call('GET', '/customer/account/enrollment', { cookie: guest })
    expect(channels.json()).toEqual({ channels: [{ channel: 'email', destination: 'e***@example.test' }] })
    expect(
      (await call('POST', '/customer/account/enrollment/codes', { cookie: guest, payload: { channel: 'email' } }))
        .statusCode,
    ).toBe(202)
    const res = await call('POST', '/customer/account/enrollment', {
      cookie: guest,
      payload: { channel: 'email', code: await deliveredCode(email) },
    })
    expect(res.statusCode).toBe(200)
    const account = cookieOf(res)
    expect(res.json().account.projects).toEqual([{ reference: s.reference }])
    const row = must((await accountsWith(email))[0])
    expect(row?.enrolled_via).toBe('project_link')
    expect((await linksOf(row.id))[0]).toMatchObject({ evidence: 'project_link_code', project_id: s.projectId })
    // The guest-link session was replaced by the account session.
    expect(await resolveCustomerSession(t.db, tokenOf(guest))).toBeNull()
    expect((await call('GET', '/customer/account', { cookie: account })).statusCode).toBe(200)
    // An account session has no guest-link enrollment.
    expect((await call('GET', '/customer/account/enrollment', { cookie: account })).statusCode).toBe(404)
  })

  it('[HH-ID-10][HH-ID-11] with a verified email and phone the account can sign in with either (recovery through the other contact)', async () => {
    const email = 'enroll-both@example.test'
    const phone = '+15025550181'
    const s = await submitted(email, '(502) 555-0181')
    await verifyOnReceipt(s, 'email', email)
    await verifyOnReceipt(s, 'phone', phone)
    await enrollOnReceipt(s, 'phone', phone)
    const row = must((await accountsWith(email))[0])
    expect(row).toMatchObject({ sign_in_email: email, sign_in_phone: phone })
    const byPhone = await signIn('(502) 555-0181', phone)
    const view = await call('GET', '/customer/account', { cookie: byPhone })
    expect(view.json()).toMatchObject({
      email: 'e***@example.test',
      phone: '***0181',
      projects: [{ reference: s.reference }],
    })
  })

  it('[HH-DATA-01] the database refuses a link to another customer’s contact, deleting a link or an account, and reopening a revoked link', async () => {
    const a = await submitted('guard-a@example.test')
    const b = await submitted('guard-b@example.test')
    await verifyOnReceipt(a, 'email', 'guard-a@example.test')
    await enrollOnReceipt(a, 'email', 'guard-a@example.test')
    const account = must((await accountsWith('guard-a@example.test'))[0])
    const link = must((await linksOf(account.id))[0])
    await expect(
      sql`INSERT INTO identity.customer_identity_links (id, account_id, customer_id, contact_id, project_id, request_id,
            authority, evidence, evidence_channel, evidence_code_id, state, decided_by, decided_at)
          VALUES (gen_random_uuid(), ${account.id}, ${a.customerId}, ${b.contactId}, ${a.projectId}, ${a.requestId},
            'owner', 'receipt_code', 'email', ${link.evidence_code_id}, 'active', 'test', now())`.execute(t.db),
    ).rejects.toThrow(/contact of its project/)
    await expect(sql`DELETE FROM identity.customer_identity_links WHERE id = ${link.id}`.execute(t.db)).rejects.toThrow(
      /never deleted/,
    )
    await expect(sql`DELETE FROM identity.customer_accounts WHERE id = ${account.id}`.execute(t.db)).rejects.toThrow(
      /never deleted/,
    )
    await sql`UPDATE identity.customer_identity_links SET state = 'revoked', revoked_at = now(),
              revoke_reason = 'corrected_link', revoked_by = 'test' WHERE id = ${link.id}`.execute(t.db)
    await expect(
      sql`UPDATE identity.customer_identity_links SET state = 'active', revoked_at = NULL, revoke_reason = NULL,
            revoked_by = NULL WHERE id = ${link.id}`.execute(t.db),
    ).rejects.toThrow(/stays revoked/)
  })
})

describe('sign-in by one-time code reveals nothing (HH-ID-10, HH-ID-03)', () => {
  it('[HH-ID-03][HH-ID-10] an account’s email and an unknown email get the same answer; only the account’s own value gets a code', async () => {
    const email = 'signin-known@example.test'
    const s = await submitted(email)
    await verifyOnReceipt(s, 'email', email)
    await enrollOnReceipt(s, 'email', email)
    const knownBefore = await codesTo(email)
    const known = await call('POST', '/public/account/sign-in/codes', { payload: { contact: email } })
    const unknown = await call('POST', '/public/account/sign-in/codes', {
      payload: { contact: 'signin-nobody@example.test' },
    })
    expect(known.statusCode).toBe(202)
    expect(known.json()).toEqual({ accepted: true, codeMinutes: 10 })
    expect(observed(unknown)).toEqual(observed(known))
    // A guest's phone without an account, and a request's contact that never enrolled, get the same answer too.
    const unenrolled = await submitted('signin-unenrolled@example.test')
    expect(
      observed(
        await call('POST', '/public/account/sign-in/codes', { payload: { contact: 'signin-unenrolled@example.test' } }),
      ),
    ).toEqual(observed(known))
    expect(
      observed(await call('POST', '/public/account/sign-in/codes', { payload: { contact: '(502) 555-0199' } })),
    ).toEqual(observed(known))
    expect(await codesTo(email)).toBe(knownBefore + 1)
    expect(await codesTo('signin-nobody@example.test')).toBe(0)
    expect(await codesTo('signin-unenrolled@example.test')).toBe(0)
    expect(unenrolled.reference).toMatch(/^HH-/)
    const malformed = await call('POST', '/public/account/sign-in/codes', { payload: { contact: 'not a contact' } })
    expect(malformed.statusCode).toBe(400)
    expect(malformed.json().error.fieldErrors[0].code).toBe('invalid_contact')
  })

  it('[HH-ID-10][HH-ID-03] a wrong code and a value without an account are the same refusal; the right code starts a session for the linked projects only', async () => {
    const email = 'signin-code@example.test'
    const s = await submitted(email)
    await verifyOnReceipt(s, 'email', email)
    await enrollOnReceipt(s, 'email', email)
    expect((await call('POST', '/public/account/sign-in/codes', { payload: { contact: email } })).statusCode).toBe(202)
    const code = await deliveredCode(email)
    const bad = await call('POST', '/public/account/sign-in', { payload: { contact: email, code: wrong(code) } })
    const nobody = await call('POST', '/public/account/sign-in', {
      payload: { contact: 'signin-code-nobody@example.test', code },
    })
    expect(bad.statusCode).toBe(400)
    expect(observed(nobody)).toEqual(observed(bad))
    const ok = await call('POST', '/public/account/sign-in', { payload: { contact: email.toUpperCase(), code } })
    expect(ok.statusCode).toBe(200)
    const cookie = cookieOf(ok)
    expect(ok.json().account.projects).toEqual([{ reference: s.reference }])
    const access = await call('GET', '/customer/access/session', { cookie })
    expect(access.json()).toEqual({ projects: [{ reference: s.reference }] })
    // A used code never signs in twice.
    expect((await call('POST', '/public/account/sign-in', { payload: { contact: email, code } })).statusCode).toBe(400)
  })

  it('[HH-ID-10][T18] while codes are NOT CONFIGURED every sign-in route answers 503 for every caller', async () => {
    const off = await buildApp({
      config: testConfig({ TRUST_PROXY_HOPS: '1' }),
      api: { db: t.db, codeKey: { state: 'not_configured', missing: ['CODE_HASH_KEY'] } },
      logger: log,
    })
    try {
      const ask = (contact: string) =>
        off.inject({
          method: 'POST',
          url: '/api/v1/public/account/sign-in/codes',
          headers: { 'x-forwarded-for': client },
          payload: { contact },
        })
      const known = await ask('signin-code@example.test')
      const unknown = await ask('signin-off-nobody@example.test')
      expect(known.statusCode).toBe(503)
      expect(known.json().error.code).toBe('NOT_CONFIGURED')
      expect(observed(unknown)).toEqual(observed(known))
      const enter = await off.inject({
        method: 'POST',
        url: '/api/v1/public/account/sign-in',
        headers: { 'x-forwarded-for': client },
        payload: { contact: 'signin-code@example.test', code: '123456' },
      })
      expect(enter.statusCode).toBe(503)
    } finally {
      await off.close()
    }
  })
})

describe('account sessions: timings, Sign Out and revocation (HH-ID-11, T22)', () => {
  it('[HH-ID-11][T22] an account session ends after 30 minutes idle and after 8 hours in total (FACT-SESSION-TIMINGS)', async () => {
    const email = 'session-times@example.test'
    const s = await submitted(email)
    await verifyOnReceipt(s, 'email', email)
    const { cookie } = await enrollOnReceipt(s, 'email', email)
    const t0 = new Date()
    const token = tokenOf(cookie)
    expect(await resolveCustomerSession(t.db, token, new Date(t0.getTime() + 29 * MIN))).toMatchObject({
      via: 'account',
      projectIds: [s.projectId],
    })
    expect(await resolveCustomerSession(t.db, token, new Date(t0.getTime() + 29 * MIN + 31 * MIN))).toBeNull()
    const busy = tokenOf(await signIn(email))
    for (let m = 25; m < 8 * 60; m += 25) await resolveCustomerSession(t.db, busy, new Date(t0.getTime() + m * MIN))
    expect(await resolveCustomerSession(t.db, busy, new Date(t0.getTime() + 8 * 60 * MIN + 2 * MIN))).toBeNull()
  })

  it('[HH-ID-11][T22] Sign Out ends the session on the server and clears the cookie; other devices keep theirs', async () => {
    const email = 'session-signout@example.test'
    const s = await submitted(email)
    await verifyOnReceipt(s, 'email', email)
    const { cookie: phoneBrowser } = await enrollOnReceipt(s, 'email', email)
    const laptop = await signIn(email)
    const out = await call('POST', '/customer/session/sign-out', { cookie: laptop })
    expect(out.statusCode).toBe(204)
    expect(String(out.headers['set-cookie'])).toMatch(new RegExp(`^${COOKIE}=; Path=/; Max-Age=0`))
    expect((await call('GET', '/customer/account', { cookie: laptop })).statusCode).toBe(401)
    expect((await call('GET', `/customer/projects/${s.reference}`, { cookie: laptop })).statusCode).toBe(401)
    expect((await call('GET', '/customer/account', { cookie: phoneBrowser })).statusCode).toBe(200)
    const row = await t.db
      .selectFrom('identity.customer_sessions')
      .select('revoke_reason')
      .where('token_hash', '=', sql<string>`encode(sha256(${tokenOf(laptop)}::bytea), 'hex')`)
      .executeTakeFirstOrThrow()
    expect(row.revoke_reason).toBe('signed_out')
    expect((await call('POST', '/customer/session/sign-out', { cookie: laptop })).statusCode).toBe(401)
  })

  it('[RULE-SERVER-AUTHZ][HH-CRM-04] a revoked link closes that project at once for every account session', async () => {
    const email = 'session-relink@example.test'
    const s = await submitted(email)
    await verifyOnReceipt(s, 'email', email)
    const { cookie } = await enrollOnReceipt(s, 'email', email)
    expect((await call('GET', `/customer/projects/${s.reference}`, { cookie })).statusCode).toBe(200)
    await sql`UPDATE identity.customer_identity_links SET state = 'revoked', revoked_at = now(),
              revoke_reason = 'corrected_link', revoked_by = 'staff-synthetic-office'
              WHERE project_id = ${s.projectId}`.execute(t.db)
    expect((await call('GET', `/customer/projects/${s.reference}`, { cookie })).statusCode).toBe(404)
    expect((await call('GET', '/customer/account', { cookie })).json().projects).toEqual([])
  })
})

describe('sign-in email changes re-verify, notify the old email and revoke other sessions (HH-ID-11, T22)', () => {
  it('[HH-ID-11] while the notice cannot be sent (off the automatic list), the change is NOT CONFIGURED and nothing changes', async () => {
    const email = 'change-unconfigured@example.test'
    const s = await submitted(email)
    await verifyOnReceipt(s, 'email', email)
    const { cookie } = await enrollOnReceipt(s, 'email', email)
    await withoutContactNotice(async () => {
      expect((await call('GET', '/customer/account', { cookie })).json().emailChange).toBe('not_configured')
      const res = await call('POST', '/customer/account/email/codes', {
        cookie,
        payload: { email: 'change-unconfigured-new@example.test' },
      })
      expect(res.statusCode).toBe(503)
      expect(res.json().error.code).toBe('NOT_CONFIGURED')
    })
    expect(await codesTo('change-unconfigured-new@example.test')).toBe(0)
    expect((await accountsWith(email))[0]?.sign_in_email).toBe(email)
    // TSK-0120: with the owner's wording wired, the change is available.
    expect((await call('GET', '/customer/account', { cookie })).json().emailChange).toBe('available')
  })

  it('[HH-ID-11][T22] a fresh sign-in and a code to the new email change it; the old email is told, keeps no access, and every other session ends', async () => {
    const old = 'change-old@example.test'
    const next = 'change-new@example.test'
    const s = await submitted(old)
    await verifyOnReceipt(s, 'email', old)
    const { cookie: other } = await enrollOnReceipt(s, 'email', old)
    let current = await signIn(old)
    const account = must((await accountsWith(old))[0])
    expect((await call('GET', '/customer/account', { cookie: current })).json().emailChange).toBe('available')

    // Authority over the account: a sign-in older than the fresh window must be repeated first.
    await sql`UPDATE identity.customer_sessions SET fresh_until = now() - interval '1 minute'
              WHERE token_hash = encode(sha256(${tokenOf(current)}::bytea), 'hex')`.execute(t.db)
    const stale = await call('POST', '/customer/account/email/codes', { cookie: current, payload: { email: next } })
    expect(stale.statusCode).toBe(403)
    expect(stale.json().error.code).toBe('FRESH_AUTH_REQUIRED')
    expect(await codesTo(next)).toBe(0)
    current = await signIn(old)

    expect(
      (await call('POST', '/customer/account/email/codes', { cookie: current, payload: { email: old } })).json().error
        .fieldErrors[0].code,
    ).toBe('unchanged')
    const sent = await call('POST', '/customer/account/email/codes', { cookie: current, payload: { email: next } })
    expect(sent.statusCode).toBe(202)
    expect(sent.json().sent).toMatchObject({ channel: 'email', destination: 'c***@example.test' })
    const code = await deliveredCode(next)
    const bad = await call('POST', '/customer/account/email', {
      cookie: current,
      payload: { email: next, code: wrong(code) },
    })
    expect(bad.statusCode).toBe(400)
    expect((await accountsWith(old)).length).toBe(1)
    const changed = await call('POST', '/customer/account/email', { cookie: current, payload: { email: next, code } })
    expect(changed.statusCode).toBe(200)
    const renewed = cookieOf(changed)
    expect(renewed).not.toBe(current)
    expect(changed.json().account).toMatchObject({ email: 'c***@example.test', projects: [{ reference: s.reference }] })
    expect((await accountsWith(next))[0]?.id).toBe(account.id)
    expect(await accountsWith(old)).toHaveLength(0)

    // Every other session ended; this one was renewed (the old cookie no longer works).
    expect((await call('GET', '/customer/account', { cookie: other })).statusCode).toBe(401)
    expect((await call('GET', '/customer/account', { cookie: current })).statusCode).toBe(401)
    expect((await call('GET', '/customer/account', { cookie: renewed })).statusCode).toBe(200)
    const reasons = await t.db
      .selectFrom('identity.customer_sessions')
      .select(['revoke_reason'])
      .where('account_id', '=', account.id)
      .where('revoked_at', 'is not', null)
      .execute()
    expect(reasons.map((r) => r.revoke_reason)).toContain('contact_changed')
    expect(reasons.map((r) => r.revoke_reason)).toContain('rotated')

    // The old email keeps no access: the same neutral answer, and no code goes to it.
    const oldCodes = await codesTo(old)
    expect((await call('POST', '/public/account/sign-in/codes', { payload: { contact: old } })).statusCode).toBe(202)
    expect(await codesTo(old)).toBe(oldCodes)

    // TSK-0120 (MESSAGE 21, scenario I): the notice went to the old and to the new verified address, once each, after
    // commit, in the owner's wording: when it happened and the support contact, never a link, a code or an account
    // detail. A replayed job sends nothing more.
    await drain()
    const notices = changeNotices().filter((m) => m.to === old || m.to === next)
    expect(notices.map((m) => m.to).sort()).toEqual([next, old].sort())
    for (const m of notices) {
      expect(m.text).toMatch(
        /^Hi Test,\n\nThis email confirms that the sign-in email address associated with your HandyHub account was changed on [A-Z][a-z]+day, [A-Z][a-z]+ \d{1,2}, \d{4} at \d{1,2}:\d{2} [AP]M \((EDT|EST|CDT|CST)\)\./,
      )
      // FACT-PUBLIC-CONTACT: the labelled placeholders while the public contact is NOT CONFIGURED.
      expect(m.text).toContain('Phone: Placeholder — not provided yet · Email: Placeholder — not provided yet')
      expect(m.text).not.toMatch(/https?:|\b\d{6}\b/)
    }
    await drain()
    expect(changeNotices().filter((m) => m.to === old || m.to === next)).toHaveLength(2)
    const change = await t.db
      .selectFrom('identity.customer_account_changes')
      .selectAll()
      .where('account_id', '=', account.id)
      .executeTakeFirstOrThrow()
    expect(change).toMatchObject({ kind: 'email_changed', authority: 'old_contact', old_value: old })

    // The audit log records the change and its authority, never an address or a code.
    const audit = await t.db
      .selectFrom('platform.audit_events')
      .select(['action', 'summary', 'actor_id'])
      .where('action', 'like', 'customer_account.%')
      .execute()
    const text = JSON.stringify(audit)
    expect(text).toContain('customer_account.email_change')
    expect(text).not.toContain(old)
    expect(text).not.toContain(next)
    expect(text).not.toMatch(standaloneCode(code))
    expect(lines.join('\n')).not.toMatch(standaloneCode(code))
  })

  it('[HH-ID-11] recovery: signed in through the verified phone, the email changes with authority other_contact', async () => {
    const email = 'recover-email@example.test'
    const phone = '+15025550182'
    const s = await submitted(email, '(502) 555-0182')
    await verifyOnReceipt(s, 'email', email)
    await verifyOnReceipt(s, 'phone', phone)
    await enrollOnReceipt(s, 'email', email)
    const viaPhone = await signIn(phone)
    expect(
      (
        await call('POST', '/customer/account/email/codes', {
          cookie: viaPhone,
          payload: { email: 'recover-new@example.test' },
        })
      ).statusCode,
    ).toBe(202)
    const res = await call('POST', '/customer/account/email', {
      cookie: viaPhone,
      payload: { email: 'recover-new@example.test', code: await deliveredCode('recover-new@example.test') },
    })
    expect(res.statusCode).toBe(200)
    const row = must((await accountsWith('recover-new@example.test'))[0])
    const change = await t.db
      .selectFrom('identity.customer_account_changes')
      .select(['authority', 'old_value'])
      .where('account_id', '=', row.id)
      .executeTakeFirstOrThrow()
    expect(change).toEqual({ authority: 'other_contact', old_value: email })
  })

  it('[HH-ID-11][HH-ID-03] an email another account already has is refused only after its code proved it is the customer’s', async () => {
    const a = await submitted('inuse-a@example.test')
    const b = await submitted('inuse-b@example.test')
    await verifyOnReceipt(a, 'email', 'inuse-a@example.test')
    await verifyOnReceipt(b, 'email', 'inuse-b@example.test')
    const { cookie } = await enrollOnReceipt(a, 'email', 'inuse-a@example.test')
    await enrollOnReceipt(b, 'email', 'inuse-b@example.test')
    // Sending the code says nothing about the other account.
    const sent = await call('POST', '/customer/account/email/codes', {
      cookie,
      payload: { email: 'inuse-b@example.test' },
    })
    expect(sent.statusCode).toBe(202)
    const res = await call('POST', '/customer/account/email', {
      cookie,
      payload: { email: 'inuse-b@example.test', code: await deliveredCode('inuse-b@example.test') },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error.fieldErrors[0].code).toBe('email_in_use')
    expect((await accountsWith('inuse-a@example.test'))[0]?.state).toBe('active')
    expect(await accountsWith('inuse-b@example.test')).toHaveLength(1)
  })
})

describe('closing the login account keeps the business records (OWN-DEC-71, T22)', () => {
  it('[T22][OWN-DEC-71][HH-ID-11] sign-in, sessions, project links and guest links end; requests, projects and customers stay', async () => {
    const email = 'close-account@example.test'
    const s = await submitted(email)
    await verifyOnReceipt(s, 'email', email)
    const { cookie } = await enrollOnReceipt(s, 'email', email)
    const account = must((await accountsWith(email))[0])
    const records = await recordsOf(s)
    const out = await withTx(t.db, (tx) =>
      closeCustomerAccount(tx, { accountId: account.id, by: 'staff-synthetic-owner' }),
    )
    expect(out).toMatchObject({ closed: true, links: 1 })
    expect(out.sessions).toBeGreaterThanOrEqual(1)
    expect(out.grants).toBeGreaterThanOrEqual(1)
    expect((await call('GET', '/customer/account', { cookie })).statusCode).toBe(401)
    const row = await t.db
      .selectFrom('identity.customer_accounts')
      .selectAll()
      .where('id', '=', account.id)
      .executeTakeFirstOrThrow()
    expect(row).toMatchObject({ state: 'closed', sign_in_email: null, close_reason: 'owner_deleted' })
    expect((await linksOf(account.id)).map((l) => [l.state, l.revoke_reason])).toEqual([['revoked', 'account_closed']])
    const grants = await t.db
      .selectFrom('identity.project_access_grants')
      .select(['revoke_reason'])
      .where('project_id', '=', s.projectId)
      .execute()
    expect(grants.every((g) => g.revoke_reason === 'account_deleted')).toBe(true)
    expect((await call('POST', '/public/access/open', { payload: { token: s.token } })).statusCode).toBe(404)
    // Sign-in by the old email now sends nothing (the same neutral answer).
    const before = await codesTo(email)
    expect((await call('POST', '/public/account/sign-in/codes', { payload: { contact: email } })).statusCode).toBe(202)
    expect(await codesTo(email)).toBe(before)
    // Protected business records stay exactly as they were.
    expect(await recordsOf(s)).toEqual(records)
    await expect(
      sql`UPDATE identity.customer_accounts SET state = 'active', closed_at = NULL, close_reason = NULL,
            closed_by = NULL, sign_in_email = ${email}, email_verified_at = now() WHERE id = ${account.id}`.execute(
        t.db,
      ),
    ).rejects.toThrow(/stays closed/)
  })
})
