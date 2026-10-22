// Contact verification on the receipt and the optional account offer, against PostgreSQL 16 and the provider fakes
// (TSK-0033; HH-INT-13, HH-ID-03, HH-INT-14, HH-ID-06, HH-INT-11, HH-INT-22, HH-LEAD-01, T16, T18, T20, T29).
// Every visitor, address, number and code here is synthetic (RULE-SYNTHETIC-DATA); nothing reaches a real provider.
import { loadServiceSeed, syncServices, withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import { PRIVACY_NOTICE, SMS_DISCLOSURE } from '@handyhub/domain/legal'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { codeDeliveryAutomation, readCodeKey, type CodeKeySettings } from '../../src/modules/identity/index.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import { createAutomationRegistry } from '../../src/platform/automation.js'
import { createWorker } from '../../src/platform/jobs.js'
import { createProviders } from '../../src/providers/index.js'
import { readProviderSettings } from '../../src/providers/settings.js'
import { CODE_EMAIL_SUBJECT, codeEmailText, codeSmsText } from '../fixtures/code-message.js'
import { testConfig } from '../fixtures/env.js'

const KEY: CodeKeySettings = readCodeKey({ HANDYHUB_ENV: 'ci', CODE_HASH_KEY: 'synthetic-receipt-code-key-'.repeat(2) })
const pw = ['synthetic', 'verification', 'passphrase', 'one'].join(' ')
// TSK-0119: the email is the owner-style verification_code wording; the text keeps the OWN-DEC-150 wording.
const OWNER_WORDING = codeSmsText

let t: TestDatabase
let app: FastifyInstance
let ownerCookie = ''
const providers = createProviders(readProviderSettings({ HANDYHUB_ENV: 'ci' }))
const worker = () =>
  createWorker({
    db: t.db,
    registry: createAutomationRegistry([codeDeliveryAutomation({ providers, codeKey: KEY })]),
  })

beforeAll(async () => {
  t = await createTestDatabase()
  await syncServices(t.db, loadServiceSeed())
  app = await buildApp({ config: testConfig({ TRUST_PROXY_HOPS: '1' }), api: { db: t.db, codeKey: KEY } })
  await withTx(t.db, async (tx) => {
    const owner = await createStaffUser(tx, {
      email: 'owner-verification@example.test',
      displayName: 'Synthetic Owner',
      locale: 'en',
      role: 'owner',
      issuedBy: 'test',
    })
    await setPasswordHash(tx, owner.id, await hashPassword(pw))
  })
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/staff/auth/sign-in',
    payload: { email: 'owner-verification@example.test', password: pw },
  })
  expect(res.statusCode).toBe(200)
  ownerCookie = String(res.headers['set-cookie']).split(';')[0] as string
})
afterAll(async () => {
  await app?.close()
  await t?.drop()
})

let ip = 40
const nextIp = () => `198.51.100.${++ip}`
let n = 0
const future = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10)

function body(email: string, over: Record<string, unknown> = {}) {
  return {
    formVersion: 'test-1',
    privacyNoticeVersion: PRIVACY_NOTICE.documentId,
    services: [{ serviceId: 'SVC-DW-01' }],
    notSure: false,
    description: 'Synthetic verification project: a dent behind a door.',
    property: { street: '100 Synthetic Way', city: 'Testville', state: 'KY', zip: '40000', propertyType: 'house' },
    timing: { preferredDate: future, flexible: false, needHelpToday: false, windows: ['any_time'] },
    estimatePreference: 'let_handyhub_decide',
    contact: { fullName: 'Test Customer', email, phone: '(502) 555-0143', preferredChannel: 'email' },
    smsOptIn: false,
    marketingOptIn: false,
    ...over,
  }
}
const withTexts = (phone: string) => ({
  smsOptIn: true,
  smsDisclosureVersion: SMS_DISCLOSURE.documentId,
  contact: { fullName: 'Test Customer', email: `texts-${++n}@example.test`, phone, preferredChannel: 'text' },
})

type Sent = { reference: string; requestId: string; customerId: string; contactId: string; cap: string; key: string }
async function submitted(email: string, over: Record<string, unknown> = {}): Promise<Sent> {
  const key = `synthetic-verify-${++n}-0001`
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/public/requests',
    headers: { 'idempotency-key': key, 'x-forwarded-for': nextIp() },
    payload: body(email, over),
  })
  expect(res.statusCode).toBe(201)
  const cap = res.headers['receipt-capability']
  expect(cap).toMatch(/^[A-Za-z0-9_-]{43}$/)
  const reference = res.json<{ reference: string }>().reference
  const r = await t.db
    .selectFrom('intake.requests')
    .select(['id', 'customer_id', 'contact_id'])
    .where('reference', '=', reference)
    .executeTakeFirstOrThrow()
  return { reference, requestId: r.id, customerId: r.customer_id, contactId: r.contact_id, cap: cap as string, key }
}

// Each test calls the receipt routes from its own synthetic address (RFC 5737), so the per-address code limits of one
// test never reach another.
let client = ''
let clients = 0
beforeEach(() => {
  client = `203.0.113.${++clients}`
})
const call = (
  cap: string | undefined,
  method: 'GET' | 'POST',
  path: string,
  payload?: Record<string, unknown>,
  from = client,
) =>
  app.inject({
    method,
    url: `/api/v1/public/request-receipt${path}`,
    headers: { ...(cap ? { 'receipt-capability': cap } : {}), 'x-forwarded-for': from },
    ...(payload ? { payload } : {}),
  })
const status = async (cap: string) => {
  const res = await call(cap, 'GET', '/contact')
  expect(res.statusCode).toBe(200)
  return res.json<{
    email: {
      destination: string
      state: string
      available: boolean
      change: null | { destination: string; state: string }
    }
    phone: { destination: string; state: string; available: boolean; change: null }
  }>()
}
const send = (cap: string, payload: Record<string, unknown>) => call(cap, 'POST', '/contact/codes', payload)
const verify = (cap: string, channel: 'email' | 'phone', code: string) =>
  call(cap, 'POST', '/contact/verify', { channel, code })

/** Runs the worker until nothing is left, then returns the code last delivered to a destination by the fakes. */
async function deliveredCode(destination: string): Promise<string> {
  const w = worker()
  for (let i = 0; i < 20; i++) {
    const r = await w.runOnce()
    if (r.dispatched + r.succeeded + r.retried + r.failed + r.cancelled === 0) break
  }
  const sent = [
    ...(providers.fakes.email?.sent ?? []).filter((m) => m.to === destination).map((m) => m.text),
    ...(providers.fakes.sms?.sent ?? []).filter((m) => m.to === destination).map((m) => m.text),
  ]
  const m = /\b(\d{6})\b/.exec(sent.at(-1) ?? '')
  if (!m) throw new Error(`no code was delivered to ${destination}`)
  return m[1] as string
}
/** The last message the fakes delivered to one destination (several codes may be delivered in one worker run). */
const lastText = (destination: string) =>
  [...(providers.fakes.email?.sent ?? []), ...(providers.fakes.sms?.sent ?? [])]
    .filter((m) => m.to === destination)
    .at(-1)
const wrong = (code: string) => String((Number(code) + 1) % 1_000_000).padStart(6, '0')
/** Lets the resend cooldown pass by moving the request's codes back in time. */
const afterCooldown = (contactId: string) =>
  sql`UPDATE identity.verification_codes SET created_at = created_at - interval '2 minutes'
      WHERE subject_ref LIKE ${`contact:${contactId}:%`}`.execute(t.db)
const contactRow = (id: string) =>
  t.db.selectFrom('crm.contacts').selectAll().where('id', '=', id).executeTakeFirstOrThrow()
const audits = (requestId: string) =>
  t.db
    .selectFrom('platform.audit_events')
    .select(['action', 'result', 'reason', 'summary', 'actor_kind'])
    .where('target_type', '=', 'request')
    .where('target_id', '=', requestId)
    .where('action', 'in', ['contact_verification.send_code', 'contact_verification.verify', 'account_offer.decline'])
    .orderBy('seq')
    .execute()
const staffView = async (requestId: string) => {
  const res = await app.inject({
    method: 'GET',
    url: `/api/v1/staff/requests/${requestId}`,
    headers: { cookie: ownerCookie },
  })
  expect(res.statusCode).toBe(200)
  return res.json<{
    original: { contact: { email: string } }
    contactVerification: { email: string; phone: string; current: { email: string; phone: string } }
  }>()
}
const ERROR_INVALID = { field: 'body.code', code: 'invalid_code' }

describe('the receipt capability (TSK-0033, HH-INT-13, RULE-SERVER-AUTHZ)', () => {
  it('[HH-INT-13] the saved request returns a receipt capability; its contact starts unverified on both channels', async () => {
    const s = await submitted('capability-1@example.test')
    expect(await status(s.cap)).toEqual({
      email: { destination: 'c***@example.test', state: 'unverified', available: true, change: null },
      // No SMS opt-in on this request: its phone cannot be verified by text (HH-INT-22).
      phone: { destination: '***0143', state: 'unverified', available: false, change: null },
    })
    // Only the token's hash is stored, and the body (kept for idempotent replays) never carries it.
    const rows = await t.db
      .selectFrom('intake.receipt_capabilities')
      .select(['token_hash', 'expires_at', 'created_at'])
      .where('request_id', '=', s.requestId)
      .execute()
    expect(rows).toHaveLength(1)
    const [row] = rows
    if (!row) throw new Error('no receipt capability')
    expect(row.token_hash).not.toContain(s.cap)
    // PROPOSED lifetime: the customer session maximum (session.timings, 8 hours).
    expect((row.expires_at.getTime() - row.created_at.getTime()) / 3_600_000).toBe(8)
    const stored = await t.db
      .selectFrom('platform.idempotency_keys')
      .select('response_body')
      .where('idempotency_key', '=', s.key)
      .executeTakeFirstOrThrow()
    expect(JSON.stringify(stored.response_body)).not.toContain(s.cap)
    const replay = await app.inject({
      method: 'POST',
      url: '/api/v1/public/requests',
      headers: { 'idempotency-key': s.key, 'x-forwarded-for': nextIp() },
      payload: body('capability-1@example.test'),
    })
    expect(replay.headers['idempotent-replayed']).toBe('true')
    expect(replay.headers['receipt-capability']).toBeUndefined()
  })

  it('[RULE-SERVER-AUTHZ][HH-INT-13] a missing, guessed, expired or revoked capability, or a reference, reaches nothing', async () => {
    const s = await submitted('capability-2@example.test')
    const guessed = 'A'.repeat(43)
    for (const cap of [undefined, guessed, s.reference, `${s.cap}x`]) {
      for (const [method, path, payload] of [
        ['GET', '/contact', undefined],
        ['POST', '/contact/codes', { channel: 'email' }],
        ['POST', '/contact/verify', { channel: 'email', code: '123456' }],
        ['POST', '/account-offer/decline', {}],
      ] as const) {
        const res = await call(cap, method, path, payload)
        expect(res.statusCode).toBe(404)
        expect(res.json<{ error: { code: string } }>().error.code).toBe('NOT_FOUND')
      }
    }
    await sql`UPDATE intake.receipt_capabilities SET created_at = now() - interval '9 hours',
              expires_at = now() - interval '1 hour' WHERE request_id = ${s.requestId}`.execute(t.db)
    expect((await call(s.cap, 'GET', '/contact')).statusCode).toBe(404)
    const other = await submitted('capability-3@example.test')
    await sql`UPDATE intake.receipt_capabilities SET revoked_at = now() WHERE request_id = ${other.requestId}`.execute(
      t.db,
    )
    expect((await call(other.cap, 'POST', '/contact/codes', { channel: 'email' })).statusCode).toBe(404)
    expect(
      await t.db
        .selectFrom('identity.verification_codes')
        .select('id')
        .where('subject_ref', 'like', `contact:${other.contactId}:%`)
        .execute(),
    ).toEqual([])
  })
})

describe('email and phone verified separately (TSK-0033, HH-INT-13, OWN-DEC-96)', () => {
  it('[HH-INT-13] the email is verified by its code; a wrong code is refused neutrally and still counted; the phone stays unverified', async () => {
    const email = 'email-verify@example.test'
    const s = await submitted(email)
    const res = await send(s.cap, { channel: 'email' })
    expect(res.statusCode).toBe(202)
    const sent = res.json<{ sent: { channel: string; destination: string; expiresAt: string; change: boolean } }>()
    expect(sent.sent).toMatchObject({ channel: 'email', destination: 'e***@example.test', change: false })
    expect(Math.round((Date.parse(sent.sent.expiresAt) - Date.now()) / 60_000)).toBe(10)
    expect((await status(s.cap)).email.state).toBe('pending')
    expect((await contactRow(s.contactId)).email_verification).toBe('pending')
    const code = await deliveredCode(email)
    expect(lastText(email)).toMatchObject({
      subject: CODE_EMAIL_SUBJECT,
      text: codeEmailText(code),
    })

    const bad = await verify(s.cap, 'email', wrong(code))
    expect(bad.statusCode).toBe(400)
    expect(bad.json<{ error: { code: string; fieldErrors: unknown[] } }>().error).toMatchObject({
      code: 'VALIDATION_FAILED',
      fieldErrors: [expect.objectContaining(ERROR_INVALID)],
    })
    // The refusal committed its attempt (the attempt limit holds) and its audit event.
    const row = await t.db
      .selectFrom('identity.verification_codes')
      .select(['attempts', 'consumed_at'])
      .where('subject_ref', '=', `contact:${s.contactId}:email`)
      .executeTakeFirstOrThrow()
    expect(row).toEqual({ attempts: 1, consumed_at: null })

    const ok = await verify(s.cap, 'email', code)
    expect(ok.statusCode).toBe(200)
    expect(ok.json<{ verified: unknown }>().verified).toEqual({
      channel: 'email',
      changed: false,
      // TSK-0034: the code also opened this browser's session for the request's project.
      projectAccess: true,
    })
    expect(await status(s.cap)).toEqual({
      email: { destination: 'e***@example.test', state: 'verified', available: true, change: null },
      phone: { destination: '***0143', state: 'unverified', available: false, change: null },
    })
    expect(await contactRow(s.contactId)).toMatchObject({
      email_verification: 'verified',
      email_verified_value: email,
      phone_verification: 'unverified',
      phone_verified_value: null,
    })
    // A verified channel is not sent again or changed here.
    const again = await send(s.cap, { channel: 'email' })
    expect(again.statusCode).toBe(400)
    expect(again.json<{ error: { fieldErrors: { code: string }[] } }>().error.fieldErrors[0]?.code).toBe(
      'already_verified',
    )
    const change = await send(s.cap, { channel: 'email', destination: 'other@example.test' })
    expect(change.json<{ error: { fieldErrors: { code: string }[] } }>().error.fieldErrors[0]?.code).toBe(
      'already_verified',
    )
    // Staff see the two badges separately (HH-LEAD-01).
    expect((await staffView(s.requestId)).contactVerification).toEqual({
      email: 'verified',
      phone: 'unverified',
      current: { email, phone: '+15025550143' },
    })
    // Audit: who and what, never the code or an address.
    const events = await audits(s.requestId)
    expect(events.map((e) => [e.action, e.result, e.reason])).toEqual([
      ['contact_verification.send_code', 'succeeded', null],
      ['contact_verification.verify', 'denied', 'invalid_code'],
      ['contact_verification.verify', 'succeeded', null],
    ])
    const text = JSON.stringify(events)
    expect(text).not.toContain(code)
    expect(text).not.toContain(email)
    expect(text).not.toContain(s.cap)
  })

  it('[HH-INT-13][HH-INT-22] the phone is verified by text with this request’s SMS opt-in; the email stays unverified', async () => {
    const s = await submitted('ignored@example.test', withTexts('(502) 555-0144'))
    expect((await status(s.cap)).phone).toEqual({
      destination: '***0144',
      state: 'unverified',
      available: true,
      change: null,
    })
    const res = await send(s.cap, { channel: 'phone' })
    expect(res.statusCode).toBe(202)
    expect(res.json<{ sent: { destination: string } }>().sent.destination).toBe('***0144')
    const code = await deliveredCode('+15025550144')
    expect(lastText('+15025550144')?.text).toBe(OWNER_WORDING(code))
    expect((await verify(s.cap, 'phone', code)).statusCode).toBe(200)
    const after = await status(s.cap)
    expect(after.phone.state).toBe('verified')
    expect(after.email.state).toBe('unverified')
    expect(await contactRow(s.contactId)).toMatchObject({
      phone_verification: 'verified',
      phone_verified_value: '+15025550144',
      email_verification: 'unverified',
    })
    // A phone code never verifies the email, and an email code entered for the phone does nothing.
    expect((await verify(s.cap, 'email', code)).statusCode).toBe(400)
    expect((await status(s.cap)).email.state).toBe('unverified')
  })

  it('[HH-INT-22] without the SMS opt-in, or after STOP, no text is sent and the phone stays unverified', async () => {
    const s = await submitted('no-texts@example.test')
    const res = await send(s.cap, { channel: 'phone' })
    expect(res.statusCode).toBe(400)
    expect(
      res.json<{ error: { fieldErrors: { field: string; code: string }[] } }>().error.fieldErrors[0],
    ).toMatchObject({
      field: 'body.channel',
      code: 'sms_not_permitted',
    })
    expect(
      await t.db
        .selectFrom('identity.verification_codes')
        .select('id')
        .where('subject_ref', '=', `contact:${s.contactId}:phone`)
        .execute(),
    ).toEqual([])
    // An opt-in left by another request for the same number neither enables nor reveals anything here.
    const other = await submitted('opted-in@example.test', withTexts('(502) 555-0143'))
    expect((await status(other.cap)).phone.available).toBe(true)
    expect((await status(s.cap)).phone.available).toBe(false)
    // STOP withdraws the opt-in at once (TSK-0048): the phone can no longer be texted.
    await withTx(t.db, (tx) =>
      tx
        .insertInto('platform.consent_records')
        .values({
          purpose: 'transactional_sms',
          channel: 'sms',
          destination: '+15025550143',
          granted: false,
          source: 'sms_keyword',
          recorded_by: 'system:test',
        })
        .execute(),
    )
    expect((await status(other.cap)).phone.available).toBe(false)
    expect((await send(other.cap, { channel: 'phone' })).statusCode).toBe(400)
  })
})

describe('Change Contact (TSK-0033, HH-INT-13, OWN-DEC-96)', () => {
  it('[HH-INT-13] a new email gets its own code and replaces the old one only once that code is entered', async () => {
    const s = await submitted('typo@exmaple.test')
    const res = await send(s.cap, { channel: 'email', destination: '  Fixed@Example.test ' })
    expect(res.statusCode).toBe(202)
    expect(res.json<{ sent: unknown }>().sent).toMatchObject({ destination: 'f***@example.test', change: true })
    // Until the new code is entered the contact keeps its value and its state.
    expect(await status(s.cap)).toMatchObject({
      email: {
        destination: 't***@exmaple.test',
        state: 'unverified',
        change: { destination: 'f***@example.test', state: 'pending' },
      },
    })
    expect(await contactRow(s.contactId)).toMatchObject({
      email: 'typo@exmaple.test',
      email_verification: 'unverified',
    })
    const code = await deliveredCode('fixed@example.test')
    expect(providers.fakes.email?.sent.filter((m) => m.to === 'typo@exmaple.test')).toEqual([])
    const ok = await verify(s.cap, 'email', code)
    expect(ok.json<{ verified: unknown }>().verified).toEqual({
      channel: 'email',
      changed: true,
      projectAccess: true,
    })
    expect(await status(s.cap)).toMatchObject({
      email: { destination: 'f***@example.test', state: 'verified', change: null },
    })
    const row = await contactRow(s.contactId)
    expect(row).toMatchObject({
      email: 'fixed@example.test',
      email_verification: 'verified',
      email_verified_value: 'fixed@example.test',
    })
    // The original submission is never edited; staff see what was sent, the current value and its badge.
    const original = await t.db
      .selectFrom('intake.requests')
      .select('original_submission')
      .where('id', '=', s.requestId)
      .executeTakeFirstOrThrow()
    expect((original.original_submission as { contact: { email: string } }).contact.email).toBe('typo@exmaple.test')
    const view = await staffView(s.requestId)
    expect(view.original.contact.email).toBe('typo@exmaple.test')
    expect(view.contactVerification).toMatchObject({ email: 'verified', current: { email: 'fixed@example.test' } })
    expect((await audits(s.requestId)).map((e) => e.summary)).toEqual([
      { channel: 'email', change: true },
      { channel: 'email', changed: true, projectAccess: true },
    ])
  })

  it('[HH-INT-13] the latest send wins: an older code for the other address stops working', async () => {
    const s = await submitted('first@example.test')
    expect((await send(s.cap, { channel: 'email' })).statusCode).toBe(202)
    const old = await deliveredCode('first@example.test')
    await afterCooldown(s.contactId)
    expect((await send(s.cap, { channel: 'email', destination: 'second@example.test' })).statusCode).toBe(202)
    expect((await verify(s.cap, 'email', old)).statusCode).toBe(400)
    expect((await contactRow(s.contactId)).email).toBe('first@example.test')
    const fresh = await deliveredCode('second@example.test')
    expect((await verify(s.cap, 'email', fresh)).statusCode).toBe(200)
    expect((await contactRow(s.contactId)).email).toBe('second@example.test')
  })

  it('[HH-INT-13][HH-INT-22] a phone number is not changed here, and a bad address is refused', async () => {
    const s = await submitted('phone-change@example.test', withTexts('(502) 555-0145'))
    const phone = await send(s.cap, { channel: 'phone', destination: '+15025550146' })
    expect(phone.statusCode).toBe(400)
    expect(
      phone.json<{ error: { fieldErrors: { field: string; code: string }[] } }>().error.fieldErrors[0],
    ).toMatchObject({
      field: 'body.destination',
      code: 'change_not_available',
    })
    const bad = await send(s.cap, { channel: 'email', destination: 'not-an-address' })
    expect(bad.json<{ error: { fieldErrors: { code: string }[] } }>().error.fieldErrors[0]?.code).toBe(
      'invalid_destination',
    )
    // The same number written differently is the current number, not a change.
    const same = await send(s.cap, { channel: 'phone', destination: '+1 (502) 555-0145' })
    expect(same.statusCode).toBe(202)
    expect(same.json<{ sent: unknown }>().sent).toMatchObject({ destination: '***0145', change: false })
  })
})

describe('expiry and attempt limits fail safely (TSK-0033, T18, HH-ID-06, HH-INT-11)', () => {
  it('[T18][HH-ID-06] a code entered after its 10 minutes fails neutrally, shows as expired, and a new code works', async () => {
    const email = 'expired@example.test'
    const s = await submitted(email)
    await send(s.cap, { channel: 'email' })
    const code = await deliveredCode(email)
    await sql`UPDATE identity.verification_codes SET created_at = now() - interval '11 minutes',
              expires_at = now() - interval '1 minute' WHERE subject_ref = ${`contact:${s.contactId}:email`}`.execute(
      t.db,
    )
    // Before any attempt, the code that simply ran out already shows as expired, to the customer and to staff.
    expect((await status(s.cap)).email.state).toBe('expired')
    expect((await staffView(s.requestId)).contactVerification.email).toBe('expired')
    const late = await verify(s.cap, 'email', code)
    expect(late.statusCode).toBe(400)
    expect(late.json<{ error: { fieldErrors: unknown[] } }>().error.fieldErrors).toEqual([
      expect.objectContaining(ERROR_INVALID),
    ])
    expect((await contactRow(s.contactId)).email_verification).toBe('expired')
    // The safe way on: a new code (no project data anywhere in these answers).
    const again = await send(s.cap, { channel: 'email' })
    expect(again.statusCode).toBe(202)
    expect(JSON.stringify(again.json())).not.toMatch(/HH-|Synthetic|project/i)
    const fresh = await deliveredCode(email)
    expect((await verify(s.cap, 'email', fresh)).statusCode).toBe(200)
  })

  it('[T18][HH-ID-06] wrong codes until the attempts are used up: even the right code then fails the same way', async () => {
    const email = 'exhausted@example.test'
    const s = await submitted(email)
    await send(s.cap, { channel: 'email' })
    const code = await deliveredCode(email)
    const answers: string[] = []
    for (let i = 0; i < 5; i++)
      answers.push((await verify(s.cap, 'email', wrong(code))).body.replace(/"requestId":"[^"]+"/, ''))
    expect((await status(s.cap)).email.state).toBe('failed')
    expect((await contactRow(s.contactId)).email_verification).toBe('failed')
    const right = await verify(s.cap, 'email', code)
    expect(right.statusCode).toBe(400)
    // Every refusal reads the same: wrong, exhausted and (above) expired are not told apart.
    answers.push(right.body.replace(/"requestId":"[^"]+"/, ''))
    expect(new Set(answers).size).toBe(1)
    // A resend inside the cooldown is a neutral 429 with Retry-After; after it, a new code works.
    const soon = await send(s.cap, { channel: 'email' })
    expect(soon.statusCode).toBe(429)
    expect(Number(soon.headers['retry-after'])).toBeGreaterThan(0)
    await afterCooldown(s.contactId)
    expect((await send(s.cap, { channel: 'email' })).statusCode).toBe(202)
    expect((await status(s.cap)).email.state).toBe('pending')
    expect((await verify(s.cap, 'email', await deliveredCode(email))).statusCode).toBe(200)
  })

  it('[HH-ID-06] without the code key nothing is sent and the answer is NOT CONFIGURED, never a fake success', async () => {
    const bare = await buildApp({ config: testConfig({ TRUST_PROXY_HOPS: '1' }), api: { db: t.db } })
    try {
      const s = await submitted('no-key@example.test')
      const res = await bare.inject({
        method: 'POST',
        url: '/api/v1/public/request-receipt/contact/codes',
        headers: { 'receipt-capability': s.cap, 'x-forwarded-for': nextIp() },
        payload: { channel: 'email' },
      })
      expect(res.statusCode).toBe(503)
      expect(res.json<{ error: { code: string } }>().error.code).toBe('NOT_CONFIGURED')
      expect((await status(s.cap)).email.state).toBe('unverified')
      expect(
        await t.db
          .selectFrom('identity.verification_codes')
          .select('id')
          .where('subject_ref', '=', `contact:${s.contactId}:email`)
          .execute(),
      ).toEqual([])
    } finally {
      await bare.close()
    }
  })
})

/** The rows a guest's earlier history lives in, for a customer: everything that must stay as it was. */
async function snapshot(customerId: string) {
  const [customers, contacts, properties, links, projects, requests] = await Promise.all([
    t.db.selectFrom('crm.customers').selectAll().where('id', '=', customerId).execute(),
    t.db.selectFrom('crm.contacts').selectAll().where('customer_id', '=', customerId).execute(),
    t.db
      .selectFrom('crm.customer_properties')
      .innerJoin('crm.properties', 'crm.properties.id', 'crm.customer_properties.property_id')
      .selectAll()
      .where('customer_id', '=', customerId)
      .execute(),
    t.db.selectFrom('crm.customer_properties').selectAll().where('customer_id', '=', customerId).execute(),
    t.db.selectFrom('crm.projects').selectAll().where('customer_id', '=', customerId).execute(),
    t.db.selectFrom('intake.requests').selectAll().where('customer_id', '=', customerId).execute(),
  ])
  return { customers, contacts, properties, links, projects, requests }
}
const counts = async () => {
  const one = async (table: 'crm.customers' | 'crm.contacts' | 'crm.properties' | 'crm.projects' | 'intake.requests') =>
    Number(
      (
        await t.db
          .selectFrom(table)
          .select((eb) => eb.fn.countAll<string>().as('n'))
          .executeTakeFirstOrThrow()
      ).n,
    )
  return {
    customers: await one('crm.customers'),
    contacts: await one('crm.contacts'),
    properties: await one('crm.properties'),
    projects: await one('crm.projects'),
    requests: await one('intake.requests'),
  }
}
/** The answers of a fresh request, with the parts that differ per request (masks, times, IDs) taken out. */
const shape = (v: unknown): unknown =>
  JSON.parse(
    JSON.stringify(v)
      .replace(/"[^"]*\*\*\*[^"]*"/g, '"masked"')
      .replace(/"\d{4}-\d{2}-\d{2}T[^"]+"/g, '"time"')
      .replace(/"HH-[0-9A-Z]{8}"/g, '"reference"'),
  )

describe('an existing email reveals nothing and links nothing (TSK-0033, T16, T20, T29, HH-ID-03)', () => {
  it('[T16][HH-ID-03] a new request with an existing customer’s verified email shows nothing of that customer, and verifying it links nothing', async () => {
    const email = 'existing-customer@example.test'
    // An existing customer: an earlier request with this email, verified, with its project.
    const earlier = await submitted(email)
    await send(earlier.cap, { channel: 'email' })
    expect((await verify(earlier.cap, 'email', await deliveredCode(email))).statusCode).toBe(200)
    const before = await snapshot(earlier.customerId)

    // The same email on a new request, and a never-seen email for comparison.
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/public/requests',
      headers: { 'idempotency-key': `synthetic-verify-${++n}-0001`, 'x-forwarded-for': nextIp() },
      payload: body(email),
    })
    const fresh = await app.inject({
      method: 'POST',
      url: '/api/v1/public/requests',
      headers: { 'idempotency-key': `synthetic-verify-${++n}-0001`, 'x-forwarded-for': nextIp() },
      payload: body('never-seen@example.test'),
    })
    expect(shape(res.json())).toEqual(shape(fresh.json()))
    expect(Object.keys(res.headers).sort()).toEqual(Object.keys(fresh.headers).sort())
    const cap = res.headers['receipt-capability'] as string
    const freshCap = fresh.headers['receipt-capability'] as string
    const reference = res.json<{ reference: string }>().reference
    const again = await t.db
      .selectFrom('intake.requests')
      .select(['id', 'customer_id', 'contact_id'])
      .where('reference', '=', reference)
      .executeTakeFirstOrThrow()
    // Its own new customer and contact, unverified although the same email is verified on the earlier contact.
    expect(again.customer_id).not.toBe(earlier.customerId)
    expect(shape(await status(cap))).toEqual(shape(await status(freshCap)))
    expect((await status(cap)).email.state).toBe('unverified')

    // Sending and verifying answer exactly as for a never-seen email; the code message is the owner's fixed wording.
    const sent = await send(cap, { channel: 'email' })
    const sentFresh = await send(freshCap, { channel: 'email' })
    expect(sent.statusCode).toBe(202)
    expect(shape(sent.json())).toEqual(shape(sentFresh.json()))
    const code = await deliveredCode(email)
    expect(lastText(email)?.text).toBe(codeEmailText(code))
    const verified = await verify(cap, 'email', code)
    const verifiedFresh = await verify(freshCap, 'email', await deliveredCode('never-seen@example.test'))
    expect(verified.statusCode).toBe(200)
    expect(shape(verified.json())).toEqual(shape(verifiedFresh.json()))
    for (const r of [res, sent, verified])
      expect(r.body).not.toMatch(
        new RegExp(`${earlier.reference}|${earlier.requestId}|${earlier.customerId}|account`, 'i'),
      )

    // Nothing linked: the earlier customer's records are exactly as they were, and the new request keeps its own.
    expect(await snapshot(earlier.customerId)).toEqual(before)
    const own = await t.db
      .selectFrom('intake.requests')
      .select(['customer_id', 'contact_id'])
      .where('reference', '=', reference)
      .executeTakeFirstOrThrow()
    expect(own).toEqual({ customer_id: again.customer_id, contact_id: again.contact_id })
    expect(
      await t.db.selectFrom('crm.projects').select('id').where('customer_id', '=', again.customer_id).execute(),
    ).toHaveLength(1)
  })

  it('[T29][T20][HH-ID-03] changing the email to another customer’s address and verifying it keeps every record and ID and widens nothing', async () => {
    const theirs = 'someone-else@example.test'
    const other = await submitted(theirs)
    const otherBefore = await snapshot(other.customerId)
    const s = await submitted('mine@example.test')
    const mineBefore = await snapshot(s.customerId)
    const totals = await counts()

    expect((await send(s.cap, { channel: 'email', destination: theirs })).statusCode).toBe(202)
    const code = await deliveredCode(theirs)
    expect((await verify(s.cap, 'email', code)).statusCode).toBe(200)

    // The same request, customer, contact, property and project IDs; nothing duplicated, nothing linked.
    expect(await counts()).toEqual(totals)
    const mineAfter = await snapshot(s.customerId)
    expect(mineAfter.requests).toEqual(mineBefore.requests)
    expect(mineAfter.projects).toEqual(mineBefore.projects)
    expect(mineAfter.links).toEqual(mineBefore.links)
    expect(mineAfter.contacts.map((c) => [c.id, c.email, c.email_verification])).toEqual([
      [s.contactId, theirs, 'verified'],
    ])
    // The other customer's contact is not verified by this, and nothing of theirs changed.
    expect(await snapshot(other.customerId)).toEqual(otherBefore)
    expect((await status(other.cap)).email.state).toBe('unverified')
    // Each step is audited.
    expect((await audits(s.requestId)).map((e) => e.action)).toEqual([
      'contact_verification.send_code',
      'contact_verification.verify',
    ])
    // TSK-0044 (HH-ID-02, T21): the verified change is queued for the duplicate check (a suggestion for staff review
    // by the records automation), and links nothing here.
    const changed = await t.db
      .selectFrom('platform.outbox_events')
      .select(['aggregate_type', 'aggregate_id'])
      .where('type', '=', 'customer.contact_changed')
      .where('aggregate_id', '=', s.customerId)
      .execute()
    expect(changed).toEqual([{ aggregate_type: 'customer', aggregate_id: s.customerId }])
  })
})

describe('the optional account offer (TSK-0033, HH-INT-14, T20)', () => {
  it('[HH-INT-14][T20] declining changes nothing: every record stays, verification still works, and only the answer is audited', async () => {
    const email = 'declines@example.test'
    const s = await submitted(email)
    await send(s.cap, { channel: 'email' })
    expect((await verify(s.cap, 'email', await deliveredCode(email))).statusCode).toBe(200)
    const before = await snapshot(s.customerId)
    const capabilities = await t.db
      .selectFrom('intake.receipt_capabilities')
      .selectAll()
      .where('request_id', '=', s.requestId)
      .execute()
    const codes = await t.db
      .selectFrom('identity.verification_codes')
      .selectAll()
      .where('subject_ref', 'like', `contact:${s.contactId}:%`)
      .execute()
    const totals = await counts()

    const res = await call(s.cap, 'POST', '/account-offer/decline', {})
    expect(res.statusCode).toBe(204)
    expect(res.body).toBe('')

    expect(await snapshot(s.customerId)).toEqual(before)
    expect(await counts()).toEqual(totals)
    expect(
      await t.db.selectFrom('intake.receipt_capabilities').selectAll().where('request_id', '=', s.requestId).execute(),
    ).toEqual(capabilities)
    expect(
      await t.db
        .selectFrom('identity.verification_codes')
        .selectAll()
        .where('subject_ref', 'like', `contact:${s.contactId}:%`)
        .execute(),
    ).toEqual(codes)
    expect((await audits(s.requestId)).at(-1)).toMatchObject({ action: 'account_offer.decline', result: 'succeeded' })
    // The receipt keeps working after the answer (declining twice is harmless too).
    expect((await status(s.cap)).email.state).toBe('verified')
    expect((await call(s.cap, 'POST', '/account-offer/decline', {})).statusCode).toBe(204)
    expect(await snapshot(s.customerId)).toEqual(before)
  })
})
