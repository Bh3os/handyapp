// Saved properties, preferences and Request This Service Again against PostgreSQL 16 and the provider fakes (TSK-0113;
// HH-ID-12, HH-ID-03, HH-SCH-10, HH-COM-05, T20, ENT-CustomerAccount, ENT-Property, ENT-ConsentPreference, OWN-DEC-113,
// RULE-SERVER-AUTHZ). Every visitor, address, code and name here is synthetic (RULE-SYNTHETIC-DATA); nothing reaches a
// real provider.
import { Writable } from 'node:stream'
import { loadServiceSeed, syncServices, withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import { PRIVACY_NOTICE, SMS_DISCLOSURE } from '@handyhub/domain/legal'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { accessToken } from '../../src/modules/access/index.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { codeDeliveryAutomation, readCodeKey, type CodeKeySettings } from '../../src/modules/identity/index.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import { sendPermission } from '../../src/modules/notifications/index.js'
import { requestErasurePlan } from '../../src/modules/privacy/index.js'
import { createAutomationRegistry } from '../../src/platform/automation.js'
import { createWorker } from '../../src/platform/jobs.js'
import { createLogger } from '../../src/platform/logger.js'
import { createProviders } from '../../src/providers/index.js'
import { readProviderSettings } from '../../src/providers/settings.js'
import { testConfig } from '../fixtures/env.js'
import { signInWithMfa } from '../fixtures/staff-mfa.js'

// Built at runtime so no literal looks like a credential (RULE-SYNTHETIC-DATA).
const KEY: CodeKeySettings = readCodeKey({
  HANDYHUB_ENV: 'ci',
  CODE_HASH_KEY: ['synthetic', 'saved', 'properties', 'key', 'for', 'tests', 'only'].join('-'),
})
const COOKIE = '__Host-hh_customer'
const pw = ['synthetic', 'saved', 'properties', 'passphrase', '113'].join(' ')
const OFFICE = 'office-saved-properties@example.test'

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
  const hash = await hashPassword(pw)
  await withTx(t.db, async (tx) => {
    const user = await createStaffUser(tx, {
      email: OFFICE,
      displayName: 'Synthetic Office',
      locale: 'en',
      role: 'office',
      issuedBy: 'test',
    })
    await setPasswordHash(tx, user.id, hash)
  })
})
afterAll(async () => {
  await app?.close()
  await t?.drop()
})

let n = 0
let submitIp = 10
const future = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10)
const ADDRESS = { street: '113 Synthetic Lane', city: 'Testville', state: 'KY', zip: '40000', propertyType: 'house' }
type Sent = { reference: string; requestId: string; projectId: string; contactId: string; cap: string; token: string }
type Body = Record<string, unknown>
const body = (email: string, over: Body = {}): Body => ({
  formVersion: 'test-1',
  privacyNoticeVersion: PRIVACY_NOTICE.documentId,
  services: [{ serviceId: 'SVC-DW-01', notes: 'Synthetic note: the crack is above the door.' }],
  notSure: false,
  description: 'Synthetic saved-properties project: a cracked wall.',
  property: ADDRESS,
  timing: { preferredDate: future, flexible: false, needHelpToday: false, windows: ['any_time'] },
  estimatePreference: 'site_visit',
  contact: { fullName: 'Test Saved Customer', email, phone: '(502) 555-0113', preferredChannel: 'email' },
  smsOptIn: false,
  marketingOptIn: true,
  ...over,
})
const send = (payload: Body, cookie?: string) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/public/requests',
    headers: {
      'idempotency-key': `synthetic-saved-${++n}-0001`,
      'x-forwarded-for': `198.51.100.${++submitIp}`,
      ...(cookie ? { cookie } : {}),
    },
    payload,
  })
async function submitted(email: string, over: Body = {}): Promise<Sent> {
  const res = await send(body(email, over))
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
const afterCooldown = (destination: string) =>
  sql`UPDATE identity.verification_codes SET created_at = created_at - interval '2 minutes'
      WHERE destination = ${destination}`.execute(t.db)
async function verifyOnReceipt(s: Sent, email: string) {
  await afterCooldown(email)
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
/** Verifies the request's email on its receipt and creates (or signs in to) the account there, linking the request. */
async function linkOnReceipt(s: Sent, email: string): Promise<string> {
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
  return cookieOf(res)
}
async function accountFor(email: string, over: Body = {}): Promise<{ s: Sent; cookie: string; accountId: string }> {
  const s = await submitted(email, over)
  const cookie = await linkOnReceipt(s, email)
  const row = await t.db
    .selectFrom('identity.customer_accounts')
    .select('id')
    .where('sign_in_email', '=', email)
    .executeTakeFirstOrThrow()
  return { s, cookie, accountId: row.id }
}
type Listed = { reference: string; address: Record<string, unknown>; saved: { id: string; label: string } | null }
const properties = async (cookie: string): Promise<Listed[]> => {
  const res = await call('GET', '/customer/account/properties', { cookie })
  expect(res.statusCode).toBe(200)
  return res.json<{ properties: Listed[] }>().properties
}
const save = (cookie: string, reference: string, label: string) =>
  call('POST', '/customer/account/properties', { cookie, payload: { reference, label } })
const again = (cookie: string, reference: string) =>
  call('GET', `/customer/account/projects/${reference}/request-again`, { cookie })
const permission = (cookie: string, payload: Record<string, unknown>) =>
  call('POST', '/customer/account/permissions', { cookie, payload })
const fieldCodes = (res: { json: () => { error: { fieldErrors: { field: string; code: string }[] } } }) =>
  res.json().error.fieldErrors.map((f) => [f.field, f.code])

describe('saved properties (TSK-0113, HH-ID-12)', () => {
  it('[HH-ID-12][HH-ID-03][T20] only the account’s own verified history is listed; the customer names, renames and removes an address', async () => {
    // TSK-0150 (OWN-DEC-199, portal.properties.intro): the addresses come from the account's requests, worked or not.
    const email = 'saved-owner@example.test'
    const { s: first, cookie, accountId } = await accountFor(email)
    // The same email on a request whose contact was never verified nor linked: never in the account's history.
    const unlinked = await submitted(email, { property: { ...ADDRESS, street: '9 Unlinked Synthetic Road' } })
    // A second address, linked to the same account on its own receipt.
    const second = await submitted(email, {
      property: { ...ADDRESS, street: '200 Second Synthetic Street', unit: '2B' },
    })
    await linkOnReceipt(second, email)

    const listed = await properties(cookie)
    expect(listed.map((p) => [p.reference, p.address['street'], p.saved])).toEqual([
      [second.reference, '200 Second Synthetic Street', null],
      [first.reference, '113 Synthetic Lane', null],
    ])
    expect(listed[0]?.address).toEqual({
      street: '200 Second Synthetic Street',
      unit: '2B',
      city: 'Testville',
      state: 'KY',
      zip: '40000',
      propertyType: 'house',
    })
    expect(JSON.stringify(listed)).not.toContain('Unlinked')
    // A project the account does not open is NOT_FOUND, exactly like a missing one.
    expect((await save(cookie, unlinked.reference, 'Not mine')).statusCode).toBe(404)
    expect((await save(cookie, 'HH-00000000', 'Nothing')).statusCode).toBe(404)

    // Name the first address; the name is trimmed and the address is never copied.
    const saved = await save(cookie, first.reference.toLowerCase(), '  Home   base ')
    expect(saved.statusCode).toBe(200)
    const home = saved.json<{ properties: Listed[] }>().properties[0]
    expect(home).toMatchObject({ reference: first.reference, saved: { label: 'Home base' } })
    const row = await t.db
      .selectFrom('identity.customer_saved_properties')
      .selectAll()
      .where('account_id', '=', accountId)
      .executeTakeFirstOrThrow()
    expect(Object.keys(row).sort()).toEqual(
      ['account_id', 'created_at', 'id', 'label', 'property_id', 'updated_at', 'version'].sort(),
    )

    // One name per address; names are unique within the account, case aside; empty and too long names are refused.
    expect(fieldCodes(await save(cookie, first.reference, 'Another'))).toEqual([['body.reference', 'already_saved']])
    expect(fieldCodes(await save(cookie, second.reference, 'HOME BASE'))).toEqual([['body.label', 'label_in_use']])
    expect(fieldCodes(await save(cookie, second.reference, '   '))).toEqual([['body.label', 'invalid_label']])
    expect(fieldCodes(await save(cookie, second.reference, 'x'.repeat(61)))).toEqual([['body.label', 'invalid_label']])
    expect((await save(cookie, second.reference, 'Rental')).statusCode).toBe(200)

    // Rename and remove; the named ones come first, by name.
    const id = home?.saved?.id as string
    const renamed = await call('POST', `/customer/account/properties/${id}`, {
      cookie,
      payload: { label: 'Main house' },
    })
    expect(renamed.statusCode).toBe(200)
    expect(renamed.json<{ properties: Listed[] }>().properties.map((p) => p.saved?.label)).toEqual([
      'Main house',
      'Rental',
    ])
    expect(
      fieldCodes(await call('POST', `/customer/account/properties/${id}`, { cookie, payload: { label: 'rental' } })),
    ).toEqual([['body.label', 'label_in_use']])

    // Another account reaches none of it.
    const { cookie: other } = await accountFor('saved-other@example.test')
    expect((await properties(other)).map((p) => p.saved)).toEqual([null])
    expect(
      (await call('POST', `/customer/account/properties/${id}`, { cookie: other, payload: { label: 'Mine' } }))
        .statusCode,
    ).toBe(404)
    expect((await call('POST', `/customer/account/properties/${id}/remove`, { cookie: other })).statusCode).toBe(404)
    expect((await call('GET', `/customer/account/properties/${id}/request`, { cookie: other })).statusCode).toBe(404)
    expect((await save(other, first.reference, 'Theirs')).statusCode).toBe(404)

    const removed = await call('POST', `/customer/account/properties/${id}/remove`, { cookie })
    expect(removed.statusCode).toBe(200)
    expect(
      removed.json<{ properties: Listed[] }>().properties.map((p) => [p.reference, p.saved?.label ?? null]),
    ).toEqual([
      [second.reference, 'Rental'],
      [first.reference, null],
    ])
    // The property and its project are untouched.
    expect(
      await t.db.selectFrom('crm.properties').select('street').where('id', '=', row.property_id).executeTakeFirst(),
    ).toEqual({ street: '113 Synthetic Lane' })

    // The audit log names the account, the saved property and the property, never the name or the address.
    const audit = await t.db
      .selectFrom('platform.audit_events')
      .select(['action', 'summary'])
      .where('target_id', '=', accountId)
      .where('action', 'like', 'customer_account.%_property')
      .where('result', '=', 'succeeded')
      .orderBy('seq')
      .execute()
    expect(audit.map((a) => a.action)).toEqual([
      'customer_account.save_property',
      'customer_account.save_property',
      'customer_account.rename_property',
      'customer_account.remove_property',
    ])
    const text = JSON.stringify(audit)
    expect(text).not.toContain('Home')
    expect(text).not.toContain('Synthetic Lane')
  })

  it('[HH-ID-03][RULE-SERVER-AUTHZ] a revoked link hides its address and its saved name at once; a guest link or no session reaches nothing', async () => {
    const email = 'saved-revoked@example.test'
    const { s, cookie } = await accountFor(email)
    const out = await save(cookie, s.reference, 'Cabin')
    const id = out.json<{ properties: Listed[] }>().properties[0]?.saved?.id as string
    await sql`UPDATE identity.customer_identity_links
                 SET state = 'revoked', revoked_at = now(), revoke_reason = 'corrected_link', revoked_by = 'test'
               WHERE project_id = ${s.projectId}::uuid`.execute(t.db)
    expect(await properties(cookie)).toEqual([])
    expect((await call('GET', `/customer/account/properties/${id}/request`, { cookie })).statusCode).toBe(404)
    expect(
      (await call('POST', `/customer/account/properties/${id}`, { cookie, payload: { label: 'X' } })).statusCode,
    ).toBe(404)
    expect((await again(cookie, s.reference)).statusCode).toBe(404)

    // A malformed name ID is NOT_FOUND too.
    for (const bad of ['not-a-uuid', '------------------------------------'])
      expect((await call('GET', `/customer/account/properties/${bad}/request`, { cookie })).statusCode).toBe(404)

    // No session: 401. A guest-link session of the project itself: NOT_FOUND (an account's settings only).
    expect((await call('GET', '/customer/account/properties')).statusCode).toBe(401)
    const guestEmail = 'saved-guest@example.test'
    const g = await submitted(guestEmail)
    expect(
      (await call('POST', '/public/access/codes', { payload: { token: g.token, channel: 'email' } })).statusCode,
    ).toBe(202)
    const exchanged = await call('POST', '/public/access/exchange', {
      payload: { token: g.token, channel: 'email', code: await deliveredCode(guestEmail) },
    })
    const guest = cookieOf(exchanged)
    for (const url of [
      '/customer/account/properties',
      '/customer/account/preferences',
      `/customer/account/projects/${g.reference}/request-again`,
    ])
      expect((await call('GET', url, { cookie: guest })).statusCode, url).toBe(404)
    expect((await save(guest, g.reference, 'Guest')).statusCode).toBe(404)
  })
})

describe('Request This Service Again (TSK-0113, OWN-DEC-113, C11)', () => {
  it('[HH-ID-12][OWN-DEC-113] the form starts from the services, the address and the contact only; never a price, discount, verification or consent', async () => {
    const email = 'again-owner@example.test'
    const { s, cookie, accountId } = await accountFor(email)
    const res = await again(cookie, s.reference.toLowerCase())
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      reference: s.reference,
      services: ['SVC-DW-01'],
      notSure: false,
      address: { ...ADDRESS, unit: null },
      contact: { fullName: 'Test Saved Customer', email, phone: '(502) 555-0113' },
      preferredChannel: null,
    })
    // The account's contact preference is what the form starts with.
    const set = await call('POST', '/customer/account/preferences', { cookie, payload: { preferredChannel: 'call' } })
    expect(set.statusCode).toBe(200)
    expect(set.json()).toMatchObject({ preferredChannel: 'call' })
    expect((await again(cookie, s.reference)).json()).toMatchObject({ preferredChannel: 'call' })
    // A saved property starts from its address and contact, without services, linked to its latest project.
    const saved = await save(cookie, s.reference, 'Home')
    const id = saved.json<{ properties: Listed[] }>().properties[0]?.saved?.id as string
    const here = await call('GET', `/customer/account/properties/${id}/request`, { cookie })
    expect(here.statusCode).toBe(200)
    expect(here.json()).toMatchObject({
      reference: s.reference,
      services: [],
      notSure: false,
      preferredChannel: 'call',
    })

    // History limited to verified links: the same email on an unverified request is not offered.
    const unlinked = await submitted(email)
    expect((await again(cookie, unlinked.reference)).statusCode).toBe(404)
    expect((await again(cookie, 'HH-00000000')).statusCode).toBe(404)
    expect((await again(cookie, 'not-a-reference')).statusCode).toBe(404)
    expect((await call('GET', `/customer/account/projects/${s.reference}/request-again`)).statusCode).toBe(401)

    // Sent again: a new request with its own records, linked to the earlier project; nothing copied from it.
    const count = async () =>
      Number(
        (
          await t.db
            .selectFrom('intake.requests')
            .select((eb) => eb.fn.countAll<string>().as('n'))
            .executeTakeFirst()
        )?.n,
      )
    const before = await count()
    const repeat = { repeatOf: { reference: s.reference, detailsConfirmed: true } }
    const sent = await send(
      body(email, { ...repeat, marketingOptIn: false, description: 'Synthetic: the same wall again.' }),
      cookie,
    )
    expect(sent.statusCode).toBe(201)
    const reference = sent.json<{ reference: string }>().reference
    expect(reference).not.toBe(s.reference)
    const r = await t.db
      .selectFrom('intake.requests')
      .select(['id', 'project_id', 'customer_id', 'property_id', 'contact_id', 'state', 'marketing_opt_in'])
      .where('reference', '=', reference)
      .executeTakeFirstOrThrow()
    const earlier = await t.db
      .selectFrom('intake.requests')
      .select(['customer_id', 'property_id', 'contact_id'])
      .where('id', '=', s.requestId)
      .executeTakeFirstOrThrow()
    expect(r).toMatchObject({ state: 'received', marketing_opt_in: false })
    expect(r.customer_id).not.toBe(earlier.customer_id)
    expect(r.contact_id).not.toBe(earlier.contact_id)
    expect(r.property_id).not.toBe(earlier.property_id)
    const link = await t.db
      .selectFrom('intake.request_repeats')
      .selectAll()
      .where('request_id', '=', r.id)
      .executeTakeFirstOrThrow()
    expect(link).toMatchObject({ source_project_id: s.projectId, account_id: accountId, same_address: true })
    // The new project is not in the account until its own contact is verified (HH-ID-03).
    expect((await again(cookie, reference)).statusCode).toBe(404)
    // Its contact is unverified and it has no discount request, estimate or approval of its own.
    expect(
      await t.db
        .selectFrom('crm.contacts')
        .select(['email_verification', 'phone_verification'])
        .where('id', '=', r.contact_id)
        .executeTakeFirst(),
    ).toEqual({ email_verification: 'unverified', phone_verification: 'unverified' })
    for (const table of ['estimating.discount_requests', 'estimating.estimates'] as const)
      expect(
        (
          await sql<{
            n: string
          }>`SELECT count(*) AS n FROM ${sql.table(table)} WHERE project_id = ${r.project_id}::uuid`.execute(t.db)
        ).rows[0]?.n,
        table,
      ).toBe('0')

    // A changed address is a new address, said so.
    const moved = await send(
      body(email, { ...repeat, property: { ...ADDRESS, street: '7 Moved Synthetic Avenue' } }),
      cookie,
    )
    expect(moved.statusCode).toBe(201)
    const movedLink = await t.db
      .selectFrom('intake.request_repeats as x')
      .innerJoin('intake.requests as q', 'q.id', 'x.request_id')
      .select('x.same_address')
      .where('q.reference', '=', moved.json<{ reference: string }>().reference)
      .executeTakeFirstOrThrow()
    expect(movedLink.same_address).toBe(false)

    // Refused before anything is written: no session, another account, an unlinked project, an unconfirmed address.
    const after = await count()
    expect(after).toBe(before + 2)
    const { cookie: other } = await accountFor('again-other@example.test')
    for (const [who, ref] of [
      [undefined, s.reference],
      [other, s.reference],
      [cookie, unlinked.reference],
      [cookie, 'HH-00000000'],
    ] as const) {
      const refused = await send(body(email, { repeatOf: { reference: ref, detailsConfirmed: true } }), who)
      expect(refused.statusCode).toBe(400)
      expect(fieldCodes(refused)).toEqual([['body.repeatOf', 'unavailable']])
    }
    const unconfirmed = await send(
      body(email, { repeatOf: { reference: s.reference, detailsConfirmed: false } }),
      cookie,
    )
    expect(unconfirmed.statusCode).toBe(400)
    expect(fieldCodes(unconfirmed).map(([f]) => f)).toContain('body.repeatOf.detailsConfirmed')
    expect(await count()).toBe(after + 1) // the other account's own request only

    // The database refuses a link the server would never write.
    await expect(
      sql`INSERT INTO intake.request_repeats (request_id, source_project_id, account_id, details_confirmed_at, same_address)
          VALUES (${unlinked.requestId}::uuid, ${unlinked.projectId}::uuid, ${accountId}::uuid, now(), true)`.execute(
        t.db,
      ),
    ).rejects.toThrow(/linked to/)
    await expect(
      sql`DELETE FROM intake.request_repeats WHERE request_id = ${r.id}::uuid`.execute(t.db),
    ).rejects.toThrow(/kept as written/)
  })

  it('[HH-ID-12][RULE-HUMAN-REVIEW] staff see which earlier project a request was sent again from', async () => {
    const email = 'again-staff@example.test'
    const { s, cookie } = await accountFor(email)
    const sent = await send(body(email, { repeatOf: { reference: s.reference, detailsConfirmed: true } }), cookie)
    expect(sent.statusCode).toBe(201)
    const id = (
      await t.db
        .selectFrom('intake.requests')
        .select('id')
        .where('reference', '=', sent.json<{ reference: string }>().reference)
        .executeTakeFirstOrThrow()
    ).id
    const signed = await signInWithMfa(app, {
      method: 'POST',
      url: '/api/v1/staff/auth/sign-in',
      payload: { email: OFFICE, password: pw },
    })
    expect(signed.statusCode).toBe(200)
    const staff = String(signed.headers['set-cookie']).split(';')[0] as string
    const view = await app.inject({ method: 'GET', url: `/api/v1/staff/requests/${id}`, headers: { cookie: staff } })
    expect(view.statusCode).toBe(200)
    expect(view.json().repeatOf).toEqual({
      projectId: s.projectId,
      reference: s.reference,
      detailsConfirmedAt: expect.any(String),
      sameAddress: true,
    })
    const plain = await app.inject({
      method: 'GET',
      url: `/api/v1/staff/requests/${s.requestId}`,
      headers: { cookie: staff },
    })
    expect(plain.json().repeatOf).toBeNull()

    // The Owner's request erasure takes the repeat link with its request, and keeps a project a later request repeats.
    const repeatPlan = await requestErasurePlan(t.db, id)
    expect(repeatPlan.steps.find((x) => x.table === 'intake.request_repeats')?.planned).toBe(1)
    const sourcePlan = await requestErasurePlan(t.db, s.requestId)
    expect(sourcePlan.preview.keeps.map((k) => k.kind)).toContain('project_record')
  })
})

describe('preferences (TSK-0113, HH-ID-12, HH-COM-05)', () => {
  it('[HH-COM-05][ENT-ConsentPreference] the customer stops permissions of their own sign-in values; the send-time checks honour them at once', async () => {
    const email = 'prefs-owner@example.test'
    const { cookie, accountId } = await accountFor(email)
    const read = await call('GET', '/customer/account/preferences', { cookie })
    expect(read.statusCode).toBe(200)
    // The request form gave marketing permission; follow-ups were never stopped; no phone signs in.
    expect(read.json()).toEqual({
      preferredChannel: null,
      email: { destination: 'p***@example.test', marketing: 'granted', followUps: 'none' },
      phone: null,
    })
    const check = (messageKey: string) =>
      sendPermission(t.db, { channel: 'email', destination: email, audience: 'customer', messageKey })
    expect(await check('review.request')).toEqual({ allowed: true })

    const stop = await permission(cookie, { channel: 'email', permission: 'marketing', granted: false })
    expect(stop.statusCode).toBe(200)
    expect(stop.json()).toMatchObject({ email: { marketing: 'withdrawn' } })
    expect(await check('review.request')).toEqual({ allowed: false, reason: 'no_marketing_consent' })
    // Already stopped: nothing new is recorded.
    expect((await permission(cookie, { channel: 'email', permission: 'marketing', granted: false })).statusCode).toBe(
      200,
    )
    const stopFollowUps = await permission(cookie, { channel: 'email', permission: 'follow_ups', granted: false })
    expect(stopFollowUps.json()).toMatchObject({ email: { followUps: 'withdrawn' } })
    expect(await check('reminder.satisfaction_check')).toEqual({ allowed: false, reason: 'follow_ups_opted_out' })

    // Given back: marketing needs the published privacy notice version shown beside it.
    expect(fieldCodes(await permission(cookie, { channel: 'email', permission: 'marketing', granted: true }))).toEqual([
      ['body.privacyNoticeVersion', 'unknown_version'],
    ])
    const back = await permission(cookie, {
      channel: 'email',
      permission: 'marketing',
      granted: true,
      privacyNoticeVersion: PRIVACY_NOTICE.documentId,
    })
    expect(back.json()).toMatchObject({ email: { marketing: 'granted', followUps: 'withdrawn' } })

    const records = await t.db
      .selectFrom('platform.consent_records')
      .select(['purpose', 'channel', 'granted', 'source', 'disclosure_version', 'evidence'])
      .where('destination', '=', email)
      .where('source', '=', 'portal')
      .orderBy('seq')
      .execute()
    expect(records.map((c) => [c.purpose, c.granted, c.disclosure_version])).toEqual([
      ['marketing', false, null],
      ['service_communication', false, null],
      ['marketing', true, PRIVACY_NOTICE.documentId],
    ])
    expect(records[0]?.evidence).toMatchObject({ accountId })

    // Texts are agreed to on the request form only; a value the account does not have is refused.
    expect(fieldCodes(await permission(cookie, { channel: 'sms', permission: 'texts', granted: true }))).toEqual([
      ['body.granted', 'texts_on_request_form'],
    ])
    expect(fieldCodes(await permission(cookie, { channel: 'email', permission: 'texts', granted: false }))).toEqual([
      ['body.permission', 'not_a_permission'],
    ])
    expect(fieldCodes(await permission(cookie, { channel: 'sms', permission: 'texts', granted: false }))).toEqual([
      ['body.channel', 'no_destination'],
    ])
    // A coerced value is never a choice (as on the request form).
    expect((await permission(cookie, { channel: 'email', permission: 'marketing', granted: 'true' })).statusCode).toBe(
      400,
    )
  })

  it('[HH-COM-05][TSK-0134] stopping texts on the account’s phone also ends the consent to verification codes by text', async () => {
    const email = 'prefs-phone@example.test'
    // The request form's SMS opt-in for the request's number, which the account then signs in with too.
    const phone = '+15025550113'
    const { cookie } = await accountFor(email, { smsOptIn: true, smsDisclosureVersion: SMS_DISCLOSURE.documentId })
    await sql`UPDATE identity.customer_accounts SET sign_in_phone = ${phone}, phone_verified_at = now()
               WHERE sign_in_email = ${email}`.execute(t.db)
    // A synthetic consent to verification codes by text (as the receipt's checkbox records it).
    await sql`INSERT INTO platform.consent_records (purpose, channel, destination, granted, source, evidence, recorded_by)
              VALUES ('sms_verification', 'sms', ${phone}, true, 'staff_recorded', '{}', 'test')`.execute(t.db)
    const read = await call('GET', '/customer/account/preferences', { cookie })
    expect(read.json().phone).toEqual({
      destination: '***0113',
      texts: 'granted',
      marketing: 'granted',
      followUps: 'none',
    })
    const stop = await permission(cookie, { channel: 'sms', permission: 'texts', granted: false })
    expect(stop.statusCode).toBe(200)
    expect(stop.json().phone).toMatchObject({ texts: 'withdrawn' })
    const latest = await t.db
      .selectFrom('platform.consent_records')
      .select(['purpose', 'granted', 'source'])
      .where('destination', '=', phone)
      .where('source', '=', 'portal')
      .orderBy('seq')
      .execute()
    expect(latest).toEqual([
      { purpose: 'transactional_sms', granted: false, source: 'portal' },
      { purpose: 'sms_verification', granted: false, source: 'portal' },
    ])
    for (const messageKey of ['contact.verification_code', 'appointment.reminder'])
      expect(
        await sendPermission(t.db, { channel: 'sms', destination: phone, audience: 'customer', messageKey }),
      ).toEqual({ allowed: false, reason: 'sms_opted_out' })
    // Stopped texts are not given back here.
    expect((await permission(cookie, { channel: 'sms', permission: 'texts', granted: true })).statusCode).toBe(400)
  })
})
