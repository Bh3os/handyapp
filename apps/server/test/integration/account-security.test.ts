// Customer account security amendments against PostgreSQL 16 and the provider fakes (TSK-0149; OWN-DEC-198 F2, F4,
// F5, F6; HH-ID-11, HH-ID-09, HH-ID-03, T22, T18, ENT-CustomerAccount, ENT-ProjectAccessGrant, RULE-SERVER-AUTHZ).
// Every visitor, staff member, address, number, code, link and template text here is synthetic (RULE-SYNTHETIC-DATA);
// nothing reaches a real provider. Live texts are off by default (sms.live_delivery, OWN-DEC-190); one test turns them
// on in this throwaway database and back off.
import { randomUUID } from 'node:crypto'
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
import {
  accessLinkAutomation,
  accessToken,
  REISSUE_ACCEPTED,
  revokeProjectGrants,
} from '../../src/modules/access/index.js'
import {
  contactChangedNoticeAutomation,
  HELP_ACCEPTED,
  RECOVERY_HOURS,
  sendSignInCode,
} from '../../src/modules/accounts/index.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { codeDeliveryAutomation, readCodeKey, type CodeKeySettings } from '../../src/modules/identity/index.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import { releaseTemplateVersion } from '../../src/modules/notifications/index.js'
import { queueAutomations } from '../../src/modules/queue/index.js'
import { createAutomationRegistry, type Automation } from '../../src/platform/automation.js'
import { recordPolicyVersion } from '../../src/platform/config/index.js'
import { createWorker } from '../../src/platform/jobs.js'
import { createLogger } from '../../src/platform/logger.js'
import { createProviders } from '../../src/providers/index.js'
import { readProviderSettings } from '../../src/providers/settings.js'
import { testConfig } from '../fixtures/env.js'
import { signInWithMfa } from '../fixtures/staff-mfa.js'

// Built at runtime so no literal looks like a credential (RULE-SYNTHETIC-DATA).
const KEY: CodeKeySettings = readCodeKey({
  HANDYHUB_ENV: 'ci',
  CODE_HASH_KEY: ['synthetic', 'account', 'security', 'key', 'for', 'tests', 'only'].join('-'),
})
const PUBLIC = 'http://public.example.test'
const COOKIE = '__Host-hh_customer'
const LINK = new RegExp(`${PUBLIC.replace(/[.:/]/g, '\\$&')}/access#([A-Za-z0-9_-]{43})`)
const pw = ['synthetic', 'account', 'security', 'passphrase'].join(' ')
const STAFF = ['owner', 'office'] as const
type Person = (typeof STAFF)[number]

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
const staffCookie = {} as Record<Person, string>
const csrf = {} as Record<Person, string>
const providers = createProviders(readProviderSettings({ HANDYHUB_ENV: 'ci' }), { logger: log })
const fast = (a: Automation): Automation => ({ ...a, retry: { maxAttempts: 2, baseDelayMs: 1, maxDelayMs: 1 } })
const worker = () =>
  createWorker({
    db: t.db,
    registry: createAutomationRegistry([
      ...queueAutomations(),
      codeDeliveryAutomation({ providers, codeKey: KEY }),
      contactChangedNoticeAutomation({ providers: { email: providers.email, sms: null } }),
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

beforeAll(async () => {
  t = await createTestDatabase()
  await syncServices(t.db, loadServiceSeed())
  siteDir = mkdtempSync(join(tmpdir(), 'site-account-security-'))
  writeFileSync(join(siteDir, 'account.html'), '<!doctype html><title>t</title><h1>Synthetic account page</h1>')
  writeFileSync(join(siteDir, '404.html'), '<!doctype html><title>t</title><h1>Synthetic not found</h1>')
  app = await buildApp({
    config: { ...testConfig({ TRUST_PROXY_HOPS: '1' }), siteDir },
    api: { db: t.db, codeKey: KEY },
    logger: log,
  })
  const hash = await hashPassword(pw)
  await withTx(t.db, async (tx) => {
    for (const p of STAFF) {
      const user = await createStaffUser(tx, {
        email: `${p}-account-security@example.test`,
        displayName: `Synthetic security ${p}`,
        locale: 'en',
        role: p,
        issuedBy: 'test',
      })
      await setPasswordHash(tx, user.id, hash)
    }
    // A synthetic access-link wording in this throwaway database, so a delivered link is easy to read back.
    for (const channel of ['email', 'sms'] as const)
      await releaseTemplateVersion(tx, {
        messageKey: 'project.access_link',
        channel,
        locale: 'en',
        subject: channel === 'email' ? 'Synthetic test access' : null,
        body: 'SYNTHETIC TEST TEMPLATE {accessLink}',
        translationReview: 'source',
        sourceIds: ['TSK-0149'],
        releasedBy: 'test',
      })
  })
  for (const p of STAFF) {
    const res = await signInWithMfa(app, {
      method: 'POST',
      url: '/api/v1/staff/auth/sign-in',
      headers: { 'x-forwarded-for': '198.51.100.249' },
      payload: { email: `${p}-account-security@example.test`, password: pw },
    })
    expect(res.statusCode, res.body).toBe(200)
    staffCookie[p] = String(res.headers['set-cookie']).split(';')[0] as string
    csrf[p] = res.json().csrfToken as string
  }
})
afterAll(async () => {
  await app?.close()
  await t?.drop()
  if (siteDir) rmSync(siteDir, { recursive: true, force: true })
})

let n = 0
let submitIp = 10
const future = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10)
type Sent = { reference: string; requestId: string; projectId: string; cap: string; token: string }
async function submitted(email: string, phone?: string): Promise<Sent> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/public/requests',
    headers: { 'idempotency-key': `synthetic-security-${++n}-0001`, 'x-forwarded-for': `198.51.100.${++submitIp}` },
    payload: {
      formVersion: 'test-1',
      privacyNoticeVersion: PRIVACY_NOTICE.documentId,
      services: [{ serviceId: 'SVC-DW-01' }],
      notSure: false,
      description: 'Synthetic security project: a sticking door.',
      property: { street: '400 Synthetic Way', city: 'Testville', state: 'KY', zip: '40000', propertyType: 'house' },
      timing: { preferredDate: future, flexible: false, needHelpToday: false, windows: ['any_time'] },
      estimatePreference: 'let_handyhub_decide',
      contact: { fullName: 'Test Customer', email, phone: phone ?? '(502) 555-0140', preferredChannel: 'email' },
      ...(phone ? { smsOptIn: true, smsDisclosureVersion: SMS_DISCLOSURE.documentId } : { smsOptIn: false }),
      marketingOptIn: false,
    },
  })
  expect(res.statusCode).toBe(201)
  const reference = res.json<{ reference: string }>().reference
  const r = await t.db
    .selectFrom('intake.requests')
    .select(['id', 'project_id'])
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
const staffGet = (who: Person, url: string) =>
  app.inject({ method: 'GET', url: `/api/v1${url}`, headers: { cookie: staffCookie[who] } })
const staffPost = (who: Person, url: string, payload: Record<string, unknown> = {}) =>
  app.inject({
    method: 'POST',
    url: `/api/v1${url}`,
    payload,
    headers: {
      cookie: staffCookie[who],
      'x-csrf-token': csrf[who],
      'idempotency-key': `synthetic-security-staff-${randomUUID()}`,
      'x-forwarded-for': '198.51.100.249',
    },
  })
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
const codesTo = async (destination: string) => {
  await drain()
  return sentTo(destination).filter((m) => /verification code is \d{6}/.test(m.text)).length
}
async function deliveredLinks(destination: string): Promise<string[]> {
  await drain()
  return sentTo(destination).flatMap((m) => LINK.exec(m.text)?.[1] ?? [])
}
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
/** A request whose email is verified on the receipt and enrolled as an account; returns its first session. */
async function account(email: string, phone?: string) {
  const s = await submitted(email, phone)
  await verifyOnReceipt(s, 'email', email)
  if (phone) await verifyOnReceipt(s, 'phone', phone)
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
async function signIn(contact: string, destination = contact, ip?: string) {
  await afterCooldown(destination)
  const sent = await call('POST', '/public/account/sign-in/codes', { payload: { contact }, ...(ip ? { ip } : {}) })
  expect(sent.statusCode, sent.body).toBe(202)
  const res = await call('POST', '/public/account/sign-in', {
    payload: { contact, code: await deliveredCode(destination) },
    ...(ip ? { ip } : {}),
  })
  expect(res.statusCode, res.body).toBe(200)
  return cookieOf(res)
}
const signedIn = async (cookie: string) => (await call('GET', '/customer/account', { cookie })).statusCode === 200
const auditOf = (action: string) =>
  t.db
    .selectFrom('platform.audit_events')
    .select(['action', 'actor_kind', 'target_id', 'reason', 'summary', 'result'])
    .where('action', '=', action)
    .orderBy('seq')
    .execute()
/** Turns live texts on or off in this throwaway database (sms.live_delivery, OWN-DEC-190). */
const liveTexts = (enabled: boolean) =>
  recordPolicyVersion(t.db, {
    key: 'sms.live_delivery',
    value: { enabled },
    sourceIds: ['TEST-SYNTHETIC'],
    changedBy: 'test',
    reason: 'synthetic test configuration',
  })
const changeNotices = () =>
  (providers.fakes.email?.sent ?? []).filter((m) => m.subject === 'HandyHub | Your Account Email Was Changed')

describe('security-triggered sign-out of every session (OWN-DEC-198 F2, HH-ID-11, T22)', () => {
  it('[HH-ID-11][T22] a new sign-in leaves other devices signed in; Sign out everywhere ends every session at once', async () => {
    const email = 'security-everywhere@example.test'
    const { cookie: first, accountId } = await account(email)
    const second = await signIn(email)
    // Ordinary device sessions stay independent (F2): the second sign-in left the first one signed in.
    expect(await signedIn(first)).toBe(true)
    expect(await signedIn(second)).toBe(true)
    const res = await call('POST', '/customer/account/sign-out-everywhere', { cookie: second })
    expect(res.statusCode).toBe(204)
    expect(String(res.headers['set-cookie'])).toMatch(new RegExp(`^${COOKIE}=; Path=/; Max-Age=0`))
    expect(await signedIn(first)).toBe(false)
    expect(await signedIn(second)).toBe(false)
    const reasons = await t.db
      .selectFrom('identity.customer_sessions')
      .select('revoke_reason')
      .where('account_id', '=', accountId)
      .where('revoke_reason', '=', 'security_revoked')
      .execute()
    expect(reasons).toHaveLength(2)
    expect((await auditOf('customer_account.sign_out_everywhere')).at(-1)).toMatchObject({
      actor_kind: 'customer',
      target_id: accountId,
      summary: { endedSessions: 2 },
    })
    // Without an account session there is nothing to sign out of.
    expect((await call('POST', '/customer/account/sign-out-everywhere', { cookie: first })).statusCode).toBe(401)
  })

  it('[HH-ID-11][RULE-SERVER-AUTHZ] the Owner ends every session of an account with a written reason; Office cannot', async () => {
    const email = 'security-owner-revokes@example.test'
    const { cookie, accountId } = await account(email)
    const other = await signIn(email)
    const url = `/staff/customer-accounts/${accountId}/sign-out-everywhere`
    expect((await staffPost('office', url, { reason: 'Synthetic: suspected compromise' })).statusCode).toBe(403)
    expect(await signedIn(cookie)).toBe(true)
    expect((await staffPost('owner', url, { reason: '  ' })).statusCode).toBe(400)
    const res = await staffPost('owner', url, { reason: 'Synthetic: the customer reported a suspected compromise' })
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json()).toEqual({ endedSessions: 2 })
    expect(await signedIn(cookie)).toBe(false)
    expect(await signedIn(other)).toBe(false)
    expect((await auditOf('customer_account.revoke_sessions')).at(-1)).toMatchObject({
      actor_kind: 'staff',
      target_id: accountId,
      reason: 'Synthetic: the customer reported a suspected compromise',
    })
    // The customer signs in again with a code to a verified contact.
    expect(await signedIn(await signIn(email))).toBe(true)
    // An unknown account is NOT_FOUND like a missing record.
    expect(
      (await staffPost('owner', `/staff/customer-accounts/${randomUUID()}/sign-out-everywhere`, { reason: 'x' }))
        .statusCode,
    ).toBe(404)
  })
})

describe('phone recovery only while texting is available (OWN-DEC-198 F4, HH-ID-11)', () => {
  it('[HH-ID-11][HH-ID-03] while live texts are off, a code by text is refused the same way for every phone, and nothing is sent', async () => {
    const email = 'security-texts-off@example.test'
    const phone = '+15025550141'
    const { s, cookie } = await account(email, phone)
    const row = await t.db
      .selectFrom('identity.customer_accounts')
      .select('sign_in_phone')
      .where('sign_in_email', '=', email)
      .executeTakeFirstOrThrow()
    // The verified phone is still the account's (it can be used once texting is available).
    expect(row.sign_in_phone).toBe(phone)
    const before = await codesTo(phone)
    const known = await call('POST', '/public/account/sign-in/codes', { payload: { contact: '(502) 555-0141' } })
    const unknown = await call('POST', '/public/account/sign-in/codes', { payload: { contact: '(502) 555-0199' } })
    expect(known.statusCode).toBe(400)
    expect(known.json().error.fieldErrors).toMatchObject([{ field: 'body.contact', code: 'texts_unavailable' }])
    expect(observed(unknown)).toEqual(observed(known))
    expect(await codesTo(phone)).toBe(before)
    // The email still works, and the account page says texts cannot be used now.
    const view = await call('GET', '/customer/account', { cookie })
    expect(view.json()).toMatchObject({ phone: '***0141', texts: 'unavailable' })
    // Enrolling by text is refused the same way.
    const enroll = await call('POST', '/public/request-receipt/account/codes', {
      cap: s.cap,
      payload: { channel: 'phone' },
    })
    expect(enroll.statusCode).toBe(400)
    expect(enroll.json().error.fieldErrors[0].code).toBe('texts_unavailable')
  })

  it('[HH-ID-11] with live texts on, the verified phone signs in by text (recovery through the other contact)', async () => {
    const email = 'security-texts-on@example.test'
    const phone = '+15025550142'
    await account(email, phone)
    await liveTexts(true)
    try {
      const cookie = await signIn('(502) 555-0142', phone)
      expect((await call('GET', '/customer/account', { cookie })).json()).toMatchObject({ texts: 'available' })
    } finally {
      await liveTexts(false)
    }
  })
})

describe('the secure alternative: asking HandyHub for help (OWN-DEC-198 F4, F5, F6, HH-ID-09, T18)', () => {
  it('[HH-ID-09][HH-ID-03][T18] at the reissue limit the answer is the one every visitor gets, and so is asking for help', async () => {
    const email = 'security-limit@example.test'
    const s = await submitted(email)
    await drain()
    // The per-project limit (access.recovery: 3 a day) is used up.
    for (let i = 0; i < 3; i++) {
      const res = await call('POST', '/public/access/reissue', { payload: { reference: s.reference, contact: email } })
      expect(res.statusCode).toBe(202)
    }
    const limited = await call('POST', '/public/access/reissue', {
      payload: { reference: s.reference, contact: email },
    })
    const unknown = await call('POST', '/public/access/reissue', {
      payload: { reference: 'HH-00000000', contact: 'nobody@example.test' },
    })
    expect([limited.statusCode, limited.json()]).toEqual([202, REISSUE_ACCEPTED])
    expect(observed(unknown)).toEqual(observed(limited))
    // The secure alternative answers every visitor the same way too, whether or not anything matches.
    const helpKnown = await call('POST', '/public/access/help', {
      payload: { kind: 'project_link', contact: email, reference: s.reference },
    })
    const helpUnknown = await call('POST', '/public/access/help', {
      payload: { kind: 'project_link', contact: 'nobody-at-all@example.test', reference: 'HH-00000000' },
    })
    expect([helpKnown.statusCode, helpKnown.json()]).toEqual([202, HELP_ACCEPTED])
    expect(observed(helpUnknown)).toEqual(observed(helpKnown))
    // Nothing goes to a typed value; only the form itself is checked visibly.
    expect(sentTo('nobody-at-all@example.test')).toEqual([])
    const bad = await call('POST', '/public/access/help', { payload: { kind: 'sign_in', contact: 'not a contact' } })
    expect(bad.statusCode).toBe(400)
    expect(bad.json().error.fieldErrors[0].code).toBe('invalid_contact')
    // Both wait for the Owner, who sees what was typed and what it points to; the audit holds no typed value.
    const list = await staffGet('owner', '/staff/access-help')
    expect(list.statusCode).toBe(200)
    const open = list.json<{ open: { id: string; contact: string; reference: string | null }[] }>().open
    const mine = open.find((h) => h.contact === email)
    expect(mine).toMatchObject({ reference: s.reference })
    expect(open.some((h) => h.contact === 'nobody-at-all@example.test')).toBe(true)
    const audits = await auditOf('access_help.request')
    expect(JSON.stringify(audits)).not.toContain(email)
    expect(JSON.stringify(audits)).not.toContain(s.reference)
    expect(lines.join('\n')).not.toContain('nobody-at-all@example.test')
  })

  it('[HH-ID-09][HH-INT-11] the same open need is not repeated, and asking is limited per network for everyone', async () => {
    const ip = '198.51.100.230'
    const ask = (contact: string) => call('POST', '/public/access/help', { payload: { kind: 'sign_in', contact }, ip })
    expect((await ask('security-repeat@example.test')).statusCode).toBe(202)
    expect((await ask('security-repeat@example.test')).statusCode).toBe(202)
    const rows = await t.db
      .selectFrom('identity.access_help_requests')
      .select('id')
      .where('contact_value', '=', 'security-repeat@example.test')
      .execute()
    expect(rows).toHaveLength(1)
    const queued = await t.db
      .selectFrom('ops.queue_items')
      .select(['reason', 'project_id', 'reference'])
      .where('type', '=', 'access_help_request')
      .where('subject_id', '=', rows[0]?.id ?? '')
      .execute()
    expect(queued).toEqual([{ reason: 'sign_in', project_id: null, reference: null }])
    for (let i = 0; i < 3; i++) expect((await ask(`security-limit-${i}@example.test`)).statusCode).toBe(202)
    expect((await ask('security-over@example.test')).statusCode).toBe(429)
    expect((await ask('security-repeat@example.test')).statusCode).toBe(429)
  })

  it('[HH-ID-09][HH-ID-04][RULE-SERVER-AUTHZ] after a link staff revoked, only the Owner restores access: a new link to the contact on file', async () => {
    const email = 'security-restore@example.test'
    const s = await submitted(email)
    await drain()
    await withTx(t.db, (tx) => revokeProjectGrants(tx, { projectId: s.projectId, reason: 'staff_revoked', by: 'test' }))
    // The customer's own request still restores nothing (F5).
    await call('POST', '/public/access/reissue', { payload: { token: s.token, contact: email } })
    expect(await deliveredLinks(email)).toHaveLength(1)
    const url = `/staff/projects/${s.projectId}/access-link`
    expect((await staffPost('office', url, { evidence: 'Synthetic' })).statusCode).toBe(403)
    expect((await staffPost('owner', url, { evidence: ' ' })).statusCode).toBe(400)
    const res = await staffPost('owner', url, {
      evidence: 'Synthetic: called the phone number on file and confirmed the request details',
    })
    expect(res.statusCode, res.body).toBe(201)
    expect(res.json()).toMatchObject({ sentTo: 's***@example.test' })
    const links = await deliveredLinks(email)
    expect(links).toHaveLength(2)
    const grants = await t.db
      .selectFrom('identity.project_access_grants')
      .select(['issued_reason', 'revoked_at'])
      .where('project_id', '=', s.projectId)
      .orderBy('created_at')
      .execute()
    expect(grants.map((g) => [g.issued_reason, g.revoked_at === null])).toEqual([
      ['submission', false],
      ['staff_reissue', true],
    ])
    // The new link opens that one project after a code to the contact on file.
    const opened = await call('POST', '/public/access/open', { payload: { token: links[1] ?? '' } })
    expect(opened.statusCode).toBe(200)
    expect((await auditOf('project_access.staff_reissue')).at(-1)).toMatchObject({
      actor_kind: 'staff',
      reason: 'Synthetic: called the phone number on file and confirmed the request details',
      summary: { project: s.projectId },
    })
    expect(JSON.stringify(await auditOf('project_access.staff_reissue'))).not.toContain(links[1] ?? 'none')
    expect(
      (await staffPost('owner', `/staff/projects/${randomUUID()}/access-link`, { evidence: 'x' })).statusCode,
    ).toBe(404)
  })

  it('[HH-ID-09] the Owner sees what a request points to and closes it once; its queue item resolves', async () => {
    const email = 'security-close@example.test'
    const { s } = await account(email)
    await call('POST', '/public/access/help', { payload: { kind: 'sign_in', contact: email } })
    const row = await t.db
      .selectFrom('identity.access_help_requests')
      .select('id')
      .where('contact_value', '=', email)
      .executeTakeFirstOrThrow()
    expect((await staffGet('office', `/staff/access-help/${row.id}`)).statusCode).toBe(403)
    const detail = await staffGet('owner', `/staff/access-help/${row.id}`)
    expect(detail.statusCode).toBe(200)
    expect(detail.json()).toMatchObject({
      kind: 'sign_in',
      state: 'open',
      matches: {
        accounts: [{ email, projects: [s.reference] }],
        projects: [{ reference: s.reference, matchedBy: ['email'], link: { state: 'live' } }],
      },
    })
    const lookup = await staffGet('owner', `/staff/access-help/lookup?reference=${s.reference}`)
    expect(lookup.json().projects).toMatchObject([{ reference: s.reference, matchedBy: ['reference'] }])
    expect((await staffGet('owner', '/staff/access-help/lookup')).statusCode).toBe(400)
    const close = (outcome: string) =>
      staffPost('owner', `/staff/access-help/${row.id}/close`, {
        outcome,
        note: 'Synthetic: confirmed by phone; the customer signed in with their email',
      })
    const closed = await close('access_restored')
    expect(closed.statusCode, closed.body).toBe(200)
    expect(closed.json()).toMatchObject({
      state: 'closed',
      outcome: 'access_restored',
      closedBy: { name: 'Synthetic security owner' },
    })
    expect((await close('no_action')).statusCode).toBe(409)
    const item = await t.db
      .selectFrom('ops.queue_items')
      .select(['resolved_at', 'resolution'])
      .where('type', '=', 'access_help_request')
      .where('subject_id', '=', row.id)
      .executeTakeFirstOrThrow()
    expect(item.resolution).toBe('access_restored')
    expect(item.resolved_at).not.toBeNull()
  })
})

describe('staff-assisted recovery after identity verification (OWN-DEC-198 F3, F4, HH-ID-11, T22)', () => {
  it('[HH-ID-11][T22] every session ends at once; a code to the new email completes it; the old and the new email are told', async () => {
    const oldEmail = 'security-recover-old@example.test'
    const newEmail = 'security-recover-new@example.test'
    const { cookie, accountId, s } = await account(oldEmail)
    const url = `/staff/customer-accounts/${accountId}/recovery`
    const evidence = 'Synthetic: called the phone number on file; the caller confirmed the request reference'
    expect((await staffPost('office', url, { email: newEmail, evidence })).statusCode).toBe(403)
    expect((await staffPost('owner', url, { email: oldEmail, evidence })).json().error.fieldErrors[0].code).toBe(
      'unchanged',
    )
    const started = await staffPost('owner', url, { email: newEmail, evidence })
    expect(started.statusCode, started.body).toBe(201)
    expect(started.json()).toMatchObject({ endedSessions: 1 })
    const expiresAt = new Date(started.json<{ expiresAt: string }>().expiresAt).getTime()
    expect(Math.abs(expiresAt - Date.now() - RECOVERY_HOURS * 3_600_000)).toBeLessThan(60_000)
    expect(await signedIn(cookie)).toBe(false)
    // Until the code to the new email is entered, nothing about the account changes.
    expect(
      (
        await t.db
          .selectFrom('identity.customer_accounts')
          .select('sign_in_email')
          .where('id', '=', accountId)
          .executeTakeFirstOrThrow()
      ).sign_in_email,
    ).toBe(oldEmail)
    const before = changeNotices().length
    const recovered = await signIn(newEmail)
    const view = await call('GET', '/customer/account', { cookie: recovered })
    expect(view.json()).toMatchObject({ email: 's***@example.test', projects: [{ reference: s.reference }] })
    const change = await t.db
      .selectFrom('identity.customer_account_changes')
      .select(['authority', 'old_value'])
      .where('account_id', '=', accountId)
      .executeTakeFirstOrThrow()
    expect(change).toEqual({ authority: 'staff_assisted', old_value: oldEmail })
    const recovery = await t.db
      .selectFrom('identity.customer_account_recoveries')
      .select(['state', 'completed_change_id'])
      .where('account_id', '=', accountId)
      .executeTakeFirstOrThrow()
    expect(recovery.state).toBe('completed')
    await drain()
    expect(
      changeNotices()
        .slice(before)
        .map((m) => m.to)
        .sort(),
    ).toEqual([newEmail, oldEmail].sort())
    // The old email keeps no access: it is no account's any more, so no code goes to it.
    const old = await codesTo(oldEmail)
    await afterCooldown(oldEmail)
    expect((await call('POST', '/public/account/sign-in/codes', { payload: { contact: oldEmail } })).statusCode).toBe(
      202,
    )
    expect(await codesTo(oldEmail)).toBe(old)
    const audits = await auditOf('customer_account.recovery_start')
    expect(audits.at(-1)).toMatchObject({ target_id: accountId, reason: evidence })
    expect(JSON.stringify(audits)).not.toContain(newEmail)
    expect((await auditOf('customer_account.sign_in')).at(-1)).toMatchObject({
      target_id: accountId,
      summary: { recovered: true },
    })
  })

  it('[HH-ID-11] a cancelled or expired recovery sends nothing to the new email; an email another account has is refused', async () => {
    const { accountId } = await account('security-cancel-old@example.test')
    const { accountId: otherId } = await account('security-cancel-taken@example.test')
    expect(otherId).not.toBe(accountId)
    const url = `/staff/customer-accounts/${accountId}/recovery`
    const evidence = 'Synthetic: verified in person'
    const taken = await staffPost('owner', url, { email: 'security-cancel-taken@example.test', evidence })
    expect(taken.statusCode).toBe(409)
    expect(taken.json().error.fieldErrors[0].code).toBe('email_in_use')
    const newEmail = 'security-cancel-new@example.test'
    expect((await staffPost('owner', url, { email: newEmail, evidence })).statusCode).toBe(201)
    expect((await staffPost('owner', `${url}/cancel`)).statusCode).toBe(200)
    expect((await staffPost('owner', `${url}/cancel`)).statusCode).toBe(409)
    expect((await call('POST', '/public/account/sign-in/codes', { payload: { contact: newEmail } })).statusCode).toBe(
      202,
    )
    expect(await codesTo(newEmail)).toBe(0)
    // Started again: once its time has passed (a clock past the expiry, never a fixed date), still nothing is sent.
    expect((await staffPost('owner', url, { email: newEmail, evidence })).statusCode).toBe(201)
    const later = new Date(Date.now() + (RECOVERY_HOURS + 1) * 3_600_000)
    const out = await withTx(t.db, (tx) =>
      sendSignInCode(tx, KEY, {
        contact: { channel: 'email', value: newEmail },
        httpRequestId: randomUUID(),
        now: later,
      }),
    )
    expect(out).toEqual({ status: 'accepted', accountId: null, issued: false, recovery: false })
    expect(await codesTo(newEmail)).toBe(0)
  })

  it('[HH-DATA-01] the database refuses a recovery or a closed help request started by anyone but the Owner, and any deletion', async () => {
    const { accountId } = await account('security-guard@example.test')
    const office = await t.db
      .selectFrom('identity.staff_users')
      .select('id')
      .where('email', '=', 'office-account-security@example.test')
      .executeTakeFirstOrThrow()
    await expect(
      sql`INSERT INTO identity.customer_account_recoveries (account_id, new_email, identity_evidence, started_by, expires_at)
          VALUES (${accountId}, 'security-guard-new@example.test', 'x', ${office.id}, now() + interval '1 hour')`.execute(
        t.db,
      ),
    ).rejects.toThrow(/only the Owner/)
    const help = await t.db
      .insertInto('identity.access_help_requests')
      .values({ kind: 'sign_in', channel: 'email', contact_value: 'security-guard@example.test' })
      .returning('id')
      .executeTakeFirstOrThrow()
    await expect(
      sql`UPDATE identity.access_help_requests SET state = 'closed', outcome = 'no_action', note = 'x',
            closed_by = ${office.id} WHERE id = ${help.id}`.execute(t.db),
    ).rejects.toThrow(/only the Owner/)
    await expect(sql`DELETE FROM identity.access_help_requests WHERE id = ${help.id}`.execute(t.db)).rejects.toThrow(
      /never deleted/,
    )
    await expect(sql`TRUNCATE identity.customer_account_recoveries`.execute(t.db)).rejects.toThrow()
  })
})
