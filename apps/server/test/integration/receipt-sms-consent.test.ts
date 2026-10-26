// Phone verification opt-in on the receipt against PostgreSQL 16 and the provider fakes (TSK-0134; OWN-DEC-178,
// OWN-DEC-190, HH-INT-13, HH-INT-22, HH-COM-05, HH-ID-06, HH-INT-11, HH-ID-03, ENT-ConsentPreference, T18).
// Every visitor, address, number and code here is synthetic (RULE-SYNTHETIC-DATA); nothing reaches a real provider.
import { createHash } from 'node:crypto'
import { loadServiceSeed, syncServices, withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import { legalTextContent, PRIVACY_NOTICE, SMS_DISCLOSURE, SMS_VERIFICATION_DISCLOSURE } from '@handyhub/domain/legal'
import { CATALOGS } from '@handyhub/i18n'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { codeDeliveryAutomation, readCodeKey, type CodeKeySettings } from '../../src/modules/identity/index.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import { currentConsent, deliveryStatusAutomation, sendPermission } from '../../src/modules/notifications/index.js'
import { createAutomationRegistry } from '../../src/platform/automation.js'
import { loadConfig, requireConfigured } from '../../src/platform/config/index.js'
import { createWorker } from '../../src/platform/jobs.js'
import { runWithContext } from '../../src/platform/request-context.js'
import { createProviders } from '../../src/providers/index.js'
import { readProviderSettings } from '../../src/providers/settings.js'
import { recordWebhookReceipt } from '../../src/providers/webhooks.js'
import { codeSmsText, standaloneCode } from '../fixtures/code-message.js'
import { testConfig } from '../fixtures/env.js'
import { signInWithMfa } from '../fixtures/staff-mfa.js'

const KEY: CodeKeySettings = readCodeKey({
  HANDYHUB_ENV: 'ci',
  CODE_HASH_KEY: 'synthetic-sms-consent-code-key-'.repeat(2),
})
const pw = ['synthetic', 'sms', 'consent', 'passphrase'].join(' ')
const VERSION = SMS_VERIFICATION_DISCLOSURE.documentId

let t: TestDatabase
let app: FastifyInstance
let owner = { cookie: '', csrf: '' }
const providers = createProviders(readProviderSettings({ HANDYHUB_ENV: 'ci' }))
/** Runs the worker until nothing is left; `keywordsOnly` handles stored webhooks and leaves queued codes waiting. */
const drain = async (keywordsOnly = false) => {
  const w = createWorker({
    db: t.db,
    registry: createAutomationRegistry([
      deliveryStatusAutomation(),
      ...(keywordsOnly ? [] : [codeDeliveryAutomation({ providers, codeKey: KEY })]),
    ]),
  })
  for (let i = 0; i < 20; i++) {
    const r = await w.runOnce()
    if (r.dispatched + r.succeeded + r.retried + r.failed + r.cancelled === 0) return
  }
}

beforeAll(async () => {
  t = await createTestDatabase()
  await syncServices(t.db, loadServiceSeed())
  app = await buildApp({ config: testConfig({ TRUST_PROXY_HOPS: '1' }), api: { db: t.db, codeKey: KEY } })
  await withTx(t.db, async (tx) => {
    const user = await createStaffUser(tx, {
      email: 'owner-sms-consent@example.test',
      displayName: 'Synthetic Owner',
      locale: 'en',
      role: 'owner',
      issuedBy: 'test',
    })
    await setPasswordHash(tx, user.id, await hashPassword(pw))
  })
  const res = await signInWithMfa(app, {
    method: 'POST',
    url: '/api/v1/staff/auth/sign-in',
    payload: { email: 'owner-sms-consent@example.test', password: pw },
  })
  expect(res.statusCode).toBe(200)
  const cookie = String(res.headers['set-cookie']).split(';')[0] as string
  const session = await app.inject({ method: 'GET', url: '/api/v1/staff/auth/session', headers: { cookie } })
  owner = { cookie, csrf: session.json<{ csrfToken: string }>().csrfToken }
})
afterAll(async () => {
  await app?.close()
  await t?.drop()
})

let n = 0
const future = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10)
type Sent = { reference: string; requestId: string; customerId: string; contactId: string; cap: string; phone: string }

/** A request without the SMS opt-in (unless `optIn`), each with its own synthetic email, number and address. */
async function submitted(optIn = false, phone?: string): Promise<Sent> {
  n++
  const number = phone ?? `(502) 555-01${String(20 + n).padStart(2, '0')}`
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/public/requests',
    headers: { 'idempotency-key': `synthetic-sms-consent-${n}-0001`, 'x-forwarded-for': `198.51.100.${150 + n}` },
    payload: {
      formVersion: 'test-1',
      privacyNoticeVersion: PRIVACY_NOTICE.documentId,
      services: [{ serviceId: 'SVC-DW-01' }],
      notSure: false,
      description: 'Synthetic phone opt-in project: a loose cabinet hinge.',
      property: { street: '200 Synthetic Way', city: 'Testville', state: 'KY', zip: '40000', propertyType: 'house' },
      timing: { preferredDate: future, flexible: false, needHelpToday: false, windows: ['any_time'] },
      estimatePreference: 'let_handyhub_decide',
      contact: {
        fullName: 'Test Customer',
        email: `sms-consent-${n}@example.test`,
        phone: number,
        preferredChannel: 'email',
      },
      smsOptIn: optIn,
      ...(optIn ? { smsDisclosureVersion: SMS_DISCLOSURE.documentId } : {}),
      marketingOptIn: false,
    },
  })
  expect(res.statusCode, res.body).toBe(201)
  const reference = res.json<{ reference: string }>().reference
  const r = await t.db
    .selectFrom('intake.requests')
    .innerJoin('crm.contacts', 'crm.contacts.id', 'intake.requests.contact_id')
    .select([
      'intake.requests.id',
      'intake.requests.customer_id',
      'intake.requests.contact_id',
      'crm.contacts.phone_e164',
    ])
    .where('intake.requests.reference', '=', reference)
    .executeTakeFirstOrThrow()
  return {
    reference,
    requestId: r.id,
    customerId: r.customer_id,
    contactId: r.contact_id,
    cap: res.headers['receipt-capability'] as string,
    phone: r.phone_e164,
  }
}

// Each test calls the receipt routes from its own synthetic address (RFC 5737), so per-address limits never cross.
let client = ''
let clients = 0
beforeEach(() => {
  client = `203.0.113.${100 + ++clients}`
})
const call = (cap: string | undefined, method: 'GET' | 'POST', path: string, payload?: Record<string, unknown>) =>
  app.inject({
    method,
    url: `/api/v1/public/request-receipt${path}`,
    headers: { ...(cap ? { 'receipt-capability': cap } : {}), 'x-forwarded-for': client },
    ...(payload ? { payload } : {}),
  })
type Status = {
  email: { state: string; available: boolean }
  phone: { destination: string; state: string; available: boolean }
  smsCodeConsent: string
}
const status = async (cap: string) => {
  const res = await call(cap, 'GET', '/contact')
  expect(res.statusCode).toBe(200)
  return res.json<Status>()
}
const agree = (cap: string, payload: Record<string, unknown> = { agreed: true, disclosureVersion: VERSION }) =>
  call(cap, 'POST', '/contact/sms-consent', payload)
const send = (cap: string, channel: 'email' | 'phone') => call(cap, 'POST', '/contact/codes', { channel })
const verify = (cap: string, channel: 'email' | 'phone', code: string) =>
  call(cap, 'POST', '/contact/verify', { channel, code })
const fieldError = (res: { json: () => unknown }) =>
  (res.json() as { error: { fieldErrors: { field: string; code: string }[] } }).error.fieldErrors[0]
const consents = (destination: string) =>
  t.db
    .selectFrom('platform.consent_records')
    .select(['purpose', 'channel', 'granted', 'source', 'disclosure_version', 'subject_kind', 'subject_id', 'evidence'])
    .select('recorded_by')
    .where('destination', '=', destination)
    .orderBy('seq')
    .execute()
const codesOf = (contactId: string) =>
  t.db
    .selectFrom('identity.verification_codes')
    .select(['id', 'channel', 'destination'])
    .where('subject_ref', '=', `contact:${contactId}:phone`)
    .execute()
/** The code the fakes last delivered by text to a number. */
async function textedCode(phone: string): Promise<string> {
  await drain()
  const text = (providers.fakes.sms?.sent ?? []).filter((m) => m.to === phone).at(-1)?.text ?? ''
  const m = /\b(\d{6})\b/.exec(text)
  if (!m) throw new Error(`no code was texted to ${phone}`)
  return m[1] as string
}
const wrong = (code: string) => String((Number(code) + 1) % 1_000_000).padStart(6, '0')
const afterCooldown = (contactId: string) =>
  sql`UPDATE identity.verification_codes SET created_at = created_at - interval '2 minutes'
      WHERE subject_ref = ${`contact:${contactId}:phone`}`.execute(t.db)
let k = 0
/** An inbound text keyword through the stored Bird webhook, as TSK-0048 handles it. */
const inbound = async (from: string, text: string) => {
  await runWithContext({ requestId: `req-sms-consent-${++k}` }, () =>
    withTx(t.db, (tx) => {
      const payload = { type: 'sms.received', data: { sms_id: `sms_consent_rc_${k}`, from, to: '+15025550199', text } }
      return recordWebhookReceipt(tx, {
        provider: 'bird',
        deliveryId: `sms-consent-kw-${k}`,
        eventType: payload.type,
        providerMessageId: payload.data.sms_id,
        eventOccurredAt: null,
        payload,
        rawBody: Buffer.from(JSON.stringify(payload)),
      })
    }),
  )
  await drain(true)
}
const permission = (destination: string, messageKey: string) =>
  sendPermission(t.db, { channel: 'sms', destination, audience: 'customer', messageKey })

describe('the consent text is a published version (TSK-0134, OWN-DEC-190, ENT-PolicyVersion)', () => {
  it('[OWN-DEC-178][ENT-PolicyVersion] the seeded legal.sms_verification_disclosure version matches the shown text', async () => {
    const entry = requireConfigured((await loadConfig(t.db)).get('legal.sms_verification_disclosure'))
    expect(entry.version).toBe(SMS_VERIFICATION_DISCLOSURE.version)
    const hash = createHash('sha256')
      .update(legalTextContent(SMS_VERIFICATION_DISCLOSURE, CATALOGS['customer.en']))
      .digest('hex')
    expect(entry.value).toEqual({
      documentId: VERSION,
      status: 'draft',
      attorneyReviewed: false,
      preparedOn: SMS_VERIFICATION_DISCLOSURE.preparedOn,
      contentSha256: hash,
    })
    expect(SMS_VERIFICATION_DISCLOSURE.contentSha256).toBe(hash)
  })
})

describe('no code without consent; the consent is recorded first (TSK-0134, OWN-DEC-178, HH-INT-22)', () => {
  it('[OWN-DEC-178][HH-INT-22] without the SMS opt-in the receipt offers the consent, and no code goes before it', async () => {
    const s = await submitted()
    expect(await status(s.cap)).toMatchObject({
      phone: { destination: s.phone.replace(/^.*(\d{4})$/, '***$1'), state: 'unverified', available: false },
      smsCodeConsent: 'offered',
    })
    const res = await send(s.cap, 'phone')
    expect(res.statusCode).toBe(400)
    expect(fieldError(res)).toMatchObject({ field: 'body.channel', code: 'sms_not_permitted' })
    expect(await codesOf(s.contactId)).toEqual([])
    expect(await consents(s.phone)).toEqual([])
    // The box is never assumed: an agreement must say so and name a published version.
    expect((await agree(s.cap, { agreed: false, disclosureVersion: VERSION })).statusCode).toBe(400)
    expect((await agree(s.cap, { disclosureVersion: VERSION })).statusCode).toBe(400)
    const unknown = await agree(s.cap, { agreed: true, disclosureVersion: 'sms-verification-disclosure-9' })
    expect(unknown.statusCode).toBe(400)
    expect(fieldError(unknown)).toMatchObject({ field: 'body.disclosureVersion', code: 'unknown_version' })
    // The request form's disclosure is a different text and is not accepted here.
    expect((await agree(s.cap, { agreed: true, disclosureVersion: SMS_DISCLOSURE.documentId })).statusCode).toBe(400)
    // Without the receipt capability: nothing.
    expect((await agree(undefined as unknown as string)).statusCode).toBe(404)
    expect(await consents(s.phone)).toEqual([])
  })

  it('[OWN-DEC-178][ENT-ConsentPreference][HH-INT-13] agreeing stores the consent with its evidence; the phone is then verified by its code', async () => {
    const s = await submitted()
    const res = await agree(s.cap)
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json<{ recorded: boolean; contact: Status }>()).toMatchObject({
      recorded: true,
      contact: { phone: { state: 'unverified', available: true }, smsCodeConsent: 'recorded' },
    })
    const rows = await consents(s.phone)
    expect(rows).toHaveLength(1)
    const [row] = rows
    expect(row).toMatchObject({
      purpose: 'sms_verification',
      channel: 'sms',
      granted: true,
      source: 'receipt',
      disclosure_version: VERSION,
      subject_kind: 'customer_contact',
      subject_id: s.contactId,
      recorded_by: `customer:${s.contactId}`,
    })
    const evidence = row?.evidence as Record<string, string>
    expect(evidence).toMatchObject({ requestId: s.requestId, reference: s.reference })
    expect(evidence['receiptCapabilityId']).toMatch(/^[0-9a-f-]{36}$/)
    expect(typeof evidence['httpRequestId']).toBe('string')
    // The token itself is never kept.
    expect(JSON.stringify(row)).not.toContain(s.cap)
    // Agreeing again while it is current records nothing new.
    const again = await agree(s.cap)
    expect(again.json<{ recorded: boolean }>().recorded).toBe(false)
    expect(await consents(s.phone)).toHaveLength(1)

    expect((await send(s.cap, 'phone')).statusCode).toBe(202)
    const code = await textedCode(s.phone)
    expect((providers.fakes.sms?.sent ?? []).filter((m) => m.to === s.phone).at(-1)?.text).toBe(codeSmsText(code))
    expect((await verify(s.cap, 'phone', code)).statusCode).toBe(200)
    expect(await status(s.cap)).toMatchObject({
      phone: { state: 'verified' },
      email: { state: 'unverified' },
      smsCodeConsent: 'recorded',
    })
    // The audit names the version and whether a record was added, never the number or the code.
    const audits = await t.db
      .selectFrom('platform.audit_events')
      .select(['action', 'summary'])
      .where('target_id', '=', s.requestId)
      .where('action', '=', 'contact_verification.sms_code_consent')
      .orderBy('seq')
      .execute()
    expect(audits.map((a) => a.summary)).toEqual([
      { disclosureVersion: VERSION, recorded: true },
      { disclosureVersion: VERSION, recorded: false },
    ])
    const text = JSON.stringify(audits)
    expect(text).not.toContain(s.phone)
    expect(text).not.toMatch(standaloneCode(code))
  })

  it('[OWN-DEC-178] a request with its own current SMS opt-in needs no receipt consent; a verified phone takes none', async () => {
    const withOptIn = await submitted(true)
    expect((await status(withOptIn.cap)).smsCodeConsent).toBe('not_needed')
    const res = await agree(withOptIn.cap)
    expect(res.statusCode).toBe(400)
    expect(fieldError(res)).toMatchObject({ field: 'body.agreed', code: 'not_needed' })
    expect((await consents(withOptIn.phone)).map((r) => r.purpose)).toEqual(['transactional_sms'])
    expect((await send(withOptIn.cap, 'phone')).statusCode).toBe(202)
    expect((await verify(withOptIn.cap, 'phone', await textedCode(withOptIn.phone))).statusCode).toBe(200)
    const verified = await agree(withOptIn.cap)
    expect(fieldError(verified)).toMatchObject({ code: 'already_verified' })
  })
})

describe('the consent is for the code only (TSK-0134, OWN-DEC-178, OWN-DEC-190, HH-COM-05, HH-INT-18)', () => {
  it('[OWN-DEC-178][HH-COM-05] marketing consent is untouched, the SMS opt-in is not given, and no other text is permitted', async () => {
    const s = await submitted()
    expect((await agree(s.cap)).statusCode).toBe(200)
    expect(await currentConsent(t.db, 'sms', s.phone, 'sms_verification')).toBe('granted')
    expect(await currentConsent(t.db, 'sms', s.phone, 'transactional_sms')).toBe('none')
    expect(await currentConsent(t.db, 'sms', s.phone, 'marketing')).toBe('none')
    expect(await currentConsent(t.db, 'email', `sms-consent-${n}@example.test`, 'marketing')).toBe('none')
    expect(await permission(s.phone, 'contact.verification_code')).toEqual({ allowed: true })
    // A verified phone, or a consent to codes, is never permission for unrelated texts.
    expect((await send(s.cap, 'phone')).statusCode).toBe(202)
    expect((await verify(s.cap, 'phone', await textedCode(s.phone))).statusCode).toBe(200)
    expect(await permission(s.phone, 'question.notice')).toEqual({ allowed: false, reason: 'sms_no_opt_in' })
    expect(await permission(s.phone, 'review.request')).toEqual({ allowed: false, reason: 'sms_no_opt_in' })
    const request = await t.db
      .selectFrom('intake.requests')
      .select(['sms_opt_in', 'marketing_opt_in', 'preferred_channel'])
      .where('id', '=', s.requestId)
      .executeTakeFirstOrThrow()
    expect(request).toEqual({ sms_opt_in: false, marketing_opt_in: false, preferred_channel: 'email' })
    // Staff see the consent in the customer's history, apart from the SMS opt-in and marketing.
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/staff/customers/${s.customerId}`,
      headers: { cookie: owner.cookie },
    })
    expect(res.statusCode, res.body).toBe(200)
    const contact = res
      .json<{
        contacts: {
          id: string
          permissions: Record<string, { state: string }>
          consentHistory: { purpose: string; source: string; granted: boolean; disclosureVersion: string | null }[]
        }[]
      }>()
      .contacts.find((c) => c.id === s.contactId)
    expect(contact?.permissions['sms']?.state).toBe('none')
    expect(contact?.permissions['marketingSms']?.state).toBe('none')
    expect(contact?.consentHistory).toEqual([
      expect.objectContaining({
        purpose: 'sms_verification',
        source: 'receipt',
        granted: true,
        disclosureVersion: VERSION,
      }),
    ])
  })

  it('[HH-ID-03] another request’s consent for the same number neither enables nor shows anything here', async () => {
    const first = await submitted(false, '(502) 555-0188')
    const second = await submitted(false, '(502) 555-0188')
    expect((await agree(first.cap)).statusCode).toBe(200)
    expect((await status(first.cap)).smsCodeConsent).toBe('recorded')
    expect(await status(second.cap)).toMatchObject({ smsCodeConsent: 'offered', phone: { available: false } })
    expect((await send(second.cap, 'phone')).statusCode).toBe(400)
  })
})

describe('expiry, wrong codes and limits hold (TSK-0134, HH-ID-06, HH-INT-11, T18)', () => {
  it('[T18][HH-ID-06] a wrong code and an expired code fail neutrally; a new code after the cooldown works', async () => {
    const s = await submitted()
    expect((await agree(s.cap)).statusCode).toBe(200)
    expect((await send(s.cap, 'phone')).statusCode).toBe(202)
    const code = await textedCode(s.phone)
    const bad = await verify(s.cap, 'phone', wrong(code))
    expect(bad.statusCode).toBe(400)
    expect(fieldError(bad)).toMatchObject({ field: 'body.code', code: 'invalid_code' })
    await sql`UPDATE identity.verification_codes
              SET created_at = now() - interval '11 minutes', expires_at = now() - interval '1 minute'
              WHERE subject_ref = ${`contact:${s.contactId}:phone`}`.execute(t.db)
    const late = await verify(s.cap, 'phone', code)
    expect(late.statusCode).toBe(400)
    expect(fieldError(late)).toMatchObject({ code: 'invalid_code' })
    expect((await status(s.cap)).phone.state).toBe('expired')
    await afterCooldown(s.contactId)
    expect((await send(s.cap, 'phone')).statusCode).toBe(202)
    expect((await verify(s.cap, 'phone', await textedCode(s.phone))).statusCode).toBe(200)
    expect((await status(s.cap)).phone.state).toBe('verified')
  })

  it('[HH-ID-06][HH-INT-11] the existing resend cooldown and per-number limit apply to codes sent on this consent', async () => {
    const s = await submitted()
    expect((await agree(s.cap)).statusCode).toBe(200)
    expect((await send(s.cap, 'phone')).statusCode).toBe(202)
    const soon = await send(s.cap, 'phone')
    expect(soon.statusCode).toBe(429)
    expect(Number(soon.headers['retry-after'])).toBeGreaterThan(0)
    const limits = requireConfigured((await loadConfig(t.db)).get('verification.limits')).value
    for (let i = 1; i < limits.maxCodesPerDestinationPerHour; i++) {
      await afterCooldown(s.contactId)
      expect((await send(s.cap, 'phone')).statusCode).toBe(202)
    }
    await afterCooldown(s.contactId)
    const over = await send(s.cap, 'phone')
    expect(over.statusCode).toBe(429)
    expect(over.headers['retry-after']).toBe('3600')
    expect(await codesOf(s.contactId)).toHaveLength(limits.maxCodesPerDestinationPerHour)
  })
})

describe('opt-outs are honoured (TSK-0134, OWN-DEC-178, HH-COM-05, HH-INT-22)', () => {
  it('[HH-COM-05][OWN-DEC-178] STOP ends the consent at once: a queued code is not texted and no new one can be asked for', async () => {
    const s = await submitted()
    expect((await agree(s.cap)).statusCode).toBe(200)
    expect((await send(s.cap, 'phone')).statusCode).toBe(202)
    // STOP arrives before the queued code is delivered; the send-time recheck then suppresses it.
    await inbound(s.phone, 'STOP')
    expect(await currentConsent(t.db, 'sms', s.phone, 'sms_verification')).toBe('withdrawn')
    await drain()
    const deliveries = await t.db
      .selectFrom('platform.message_deliveries')
      .select(['message_key', 'state', 'error_code'])
      .where('destination', '=', s.phone)
      .execute()
    expect(deliveries).toEqual([
      { message_key: 'contact.verification_code', state: 'suppressed', error_code: 'sms_opted_out' },
    ])
    expect((providers.fakes.sms?.sent ?? []).filter((m) => m.to === s.phone)).toEqual([])
    expect(await status(s.cap)).toMatchObject({ smsCodeConsent: 'offered', phone: { available: false } })
    await afterCooldown(s.contactId)
    expect(fieldError(await send(s.cap, 'phone'))).toMatchObject({ code: 'sms_not_permitted' })
    expect((await consents(s.phone)).map((r) => [r.purpose, r.granted, r.source])).toEqual([
      ['sms_verification', true, 'receipt'],
      ['transactional_sms', false, 'sms_keyword'],
      ['sms_verification', false, 'sms_keyword'],
    ])
    // PROPOSED (OQ-PHONE-OPT-IN-DETAILS): checking the box again later is a new, explicit consent for the code alone.
    expect((await agree(s.cap)).json<{ recorded: boolean }>().recorded).toBe(true)
    expect(await permission(s.phone, 'contact.verification_code')).toEqual({ allowed: true })
    expect(await permission(s.phone, 'question.notice')).toEqual({ allowed: false, reason: 'sms_opted_out' })
  })

  it('[HH-COM-05] a customer’s opt-out recorded by staff ends the consent to codes as well', async () => {
    const s = await submitted()
    expect((await agree(s.cap)).statusCode).toBe(200)
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/staff/customers/${s.customerId}/contacts/${s.contactId}/withdrawals`,
      headers: {
        cookie: owner.cookie,
        'x-csrf-token': owner.csrf,
        'idempotency-key': `synthetic-sms-consent-withdrawal-${n}`,
      },
      payload: { purpose: 'transactional_sms', channel: 'sms', reason: 'Asked by phone to stop texts' },
    })
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json()).toEqual({ state: 'withdrawn', recorded: true })
    expect(await currentConsent(t.db, 'sms', s.phone, 'sms_verification')).toBe('withdrawn')
    expect((await status(s.cap)).smsCodeConsent).toBe('offered')
    expect(await permission(s.phone, 'contact.verification_code')).toEqual({ allowed: false, reason: 'sms_opted_out' })
  })
})

describe('declining leaves email verification (TSK-0134, OWN-DEC-178)', () => {
  it('[OWN-DEC-178][HH-INT-13] without the consent the phone stays unverified, nothing is recorded, and the email is verified as before', async () => {
    const s = await submitted()
    const email = `sms-consent-${n}@example.test`
    expect((await send(s.cap, 'email')).statusCode).toBe(202)
    await drain()
    const sent = (providers.fakes.email?.sent ?? []).filter((m) => m.to === email).at(-1)?.text ?? ''
    const code = /\b(\d{6})\b/.exec(sent)?.[1] as string
    expect((await verify(s.cap, 'email', code)).statusCode).toBe(200)
    expect(await status(s.cap)).toMatchObject({
      email: { state: 'verified' },
      phone: { state: 'unverified', available: false },
      smsCodeConsent: 'offered',
    })
    expect(await consents(s.phone)).toEqual([])
    expect(await codesOf(s.contactId)).toEqual([])
    const request = await t.db
      .selectFrom('intake.requests')
      .select('state')
      .where('id', '=', s.requestId)
      .executeTakeFirstOrThrow()
    expect(request.state).toBe('received')
  })
})
