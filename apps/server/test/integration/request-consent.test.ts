// The request form's SMS opt-in and separate marketing permission against PostgreSQL 16 (TSK-0029; HH-INT-18,
// HH-INT-22, HH-COM-05, HH-COM-12, ENT-ConsentPreference, OWN-DEC-147, T10, T16, T67, T76). Every visitor, address and
// number is synthetic (RULE-SYNTHETIC-DATA).
import { createHash } from 'node:crypto'
import { loadServiceSeed, syncServices, withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import { legalTextContent, PRIVACY_NOTICE, SMS_DISCLOSURE } from '@handyhub/domain/legal'
import { CATALOGS } from '@handyhub/i18n'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import {
  currentConsent,
  deliveryStatusAutomation,
  recordConsent,
  sendPermission,
} from '../../src/modules/notifications/index.js'
import { createAutomationRegistry } from '../../src/platform/automation.js'
import { loadConfig, requireConfigured } from '../../src/platform/config/index.js'
import { createWorker } from '../../src/platform/jobs.js'
import { runWithContext } from '../../src/platform/request-context.js'
import { recordWebhookReceipt } from '../../src/providers/webhooks.js'
import { testConfig } from '../fixtures/env.js'

let t: TestDatabase
let app: FastifyInstance
beforeAll(async () => {
  t = await createTestDatabase()
  await syncServices(t.db, loadServiceSeed())
  app = await buildApp({ config: testConfig({ TRUST_PROXY_HOPS: '1' }), api: { db: t.db } })
})
afterAll(async () => {
  await app?.close()
  await t?.drop()
})

const future = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10)
let n = 0
/** A complete request; each call gets its own synthetic email, number and client address. */
function body(over: Record<string, unknown> = {}, contact: Record<string, unknown> = {}) {
  n++
  return {
    formVersion: 'test-1',
    privacyNoticeVersion: PRIVACY_NOTICE.documentId,
    services: [{ serviceId: 'SVC-DW-01' }],
    notSure: false,
    description: 'Synthetic project description.',
    property: { street: '100 Synthetic Way', city: 'Testville', state: 'KY', zip: '40000', propertyType: 'house' },
    timing: { preferredDate: future, flexible: false, needHelpToday: false, windows: ['mornings'] },
    estimatePreference: 'online',
    contact: {
      fullName: 'Test Customer',
      email: `consent-${n}@example.test`,
      phone: `(502) 555-${String(200 + n).padStart(4, '0')}`,
      preferredChannel: 'email',
      ...contact,
    },
    smsOptIn: false,
    smsDisclosureVersion: SMS_DISCLOSURE.documentId,
    marketingOptIn: false,
    ...over,
  }
}
type Body = ReturnType<typeof body>
const e164 = (b: Body) => `+1${b.contact.phone.replace(/\D/g, '')}`
const submit = (payload: unknown) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/public/requests',
    headers: { 'idempotency-key': `consent-key-${n}-${Math.random()}`, 'x-forwarded-for': `198.51.100.${100 + n}` },
    payload: payload as Record<string, unknown>,
  })
const fields = (res: { json: () => { error: { fieldErrors: { field: string; code: string }[] } } }) =>
  res.json().error.fieldErrors.map((f) => [f.field, f.code])
const count = async (table: string) =>
  Number((await sql<{ n: string }>`SELECT count(*) AS n FROM ${sql.raw(table)}`.execute(t.db)).rows[0]?.n)
/** The consent records of a request's email and number, oldest first. */
const records = (b: Body) =>
  t.db
    .selectFrom('platform.consent_records')
    .select([
      'purpose',
      'channel',
      'destination',
      'granted',
      'disclosure_version',
      'source',
      'subject_kind',
      'subject_id',
      'evidence',
      'recorded_by',
      'recorded_at',
    ])
    .where('destination', 'in', [b.contact.email, e164(b)])
    .orderBy('seq')
    .execute()
const stored = (reference: string) =>
  t.db
    .selectFrom('intake.requests')
    .select(['id', 'contact_id', 'submitted_at', 'sms_opt_in', 'marketing_opt_in', 'original_submission'])
    .where('reference', '=', reference)
    .executeTakeFirstOrThrow()
const permission = (channel: 'sms' | 'email', destination: string, messageKey: string) =>
  sendPermission(t.db, { channel, destination, audience: 'customer', messageKey })

describe('the SMS disclosure is a versioned legal text (TSK-0029, HH-INT-22, ENT-PolicyVersion)', () => {
  it('[HH-INT-22][ENT-PolicyVersion] the seeded legal.sms_disclosure version matches the shown text', async () => {
    const entry = requireConfigured((await loadConfig(t.db)).get('legal.sms_disclosure'))
    expect(entry.version).toBe(SMS_DISCLOSURE.version)
    expect(entry.proposed).toBe(true)
    expect(entry.sourceIds).toContain('OQ-ATTORNEY-PRIVACY')
    const hash = createHash('sha256').update(legalTextContent(SMS_DISCLOSURE, CATALOGS['customer.en'])).digest('hex')
    expect(entry.value).toEqual({
      documentId: 'sms-disclosure-1',
      status: 'draft',
      attorneyReviewed: false,
      preparedOn: SMS_DISCLOSURE.preparedOn,
      contentSha256: hash,
    })
    expect(SMS_DISCLOSURE.contentSha256).toBe(hash)
  })
})

describe('consents from the request form are stored separately (TSK-0029, HH-INT-18, HH-INT-22, T76)', () => {
  it('[HH-INT-22][T76] unchecked boxes record no consent: no text goes to that number, no marketing', async () => {
    const b = body()
    const res = await submit(b)
    expect(res.statusCode).toBe(201)
    const r = await stored(res.json<{ reference: string }>().reference)
    expect(r).toMatchObject({ sms_opt_in: false, marketing_opt_in: false })
    expect(await records(b)).toEqual([])
    // Having a phone number is never consent to text (HH-COM-05).
    expect(await permission('sms', e164(b), 'question.notice')).toEqual({ allowed: false, reason: 'sms_no_opt_in' })
    expect(await permission('email', b.contact.email, 'review.request')).toEqual({
      allowed: false,
      reason: 'no_marketing_consent',
    })
    expect(await permission('email', b.contact.email, 'question.notice')).toEqual({ allowed: true })
  })

  it('[HH-INT-22][T76][ENT-ConsentPreference] the SMS box records the number, disclosure version, source and time', async () => {
    const b = body({ smsOptIn: true }, { preferredChannel: 'text' })
    const res = await submit(b)
    expect(res.statusCode).toBe(201)
    const r = await stored(res.json<{ reference: string }>().reference)
    expect(r.sms_opt_in).toBe(true)
    expect(r.original_submission).toMatchObject({ smsOptIn: true, smsDisclosureVersion: 'sms-disclosure-1' })
    const rows = await records(b)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      purpose: 'transactional_sms',
      channel: 'sms',
      destination: e164(b),
      granted: true,
      disclosure_version: 'sms-disclosure-1',
      source: 'request_form',
      subject_kind: 'customer_contact',
      subject_id: r.contact_id,
      recorded_by: `customer:${r.contact_id}`,
      evidence: { requestId: r.id, reference: res.json<{ reference: string }>().reference },
    })
    expect(rows[0]?.recorded_at.getTime()).toBe(r.submitted_at.getTime())
    // The SMS opt-in is not marketing permission (HH-INT-18).
    expect(await permission('sms', e164(b), 'question.notice')).toEqual({ allowed: true })
    expect(await permission('sms', e164(b), 'review.request')).toEqual({
      allowed: false,
      reason: 'no_marketing_consent',
    })
    expect(await permission('email', b.contact.email, 'review.request')).toMatchObject({ allowed: false })
  })

  it('[HH-INT-18][T67] marketing permission is its own record per channel and never the SMS opt-in', async () => {
    const b = body({ marketingOptIn: true })
    const res = await submit(b)
    expect(res.statusCode).toBe(201)
    const r = await stored(res.json<{ reference: string }>().reference)
    expect(r).toMatchObject({ sms_opt_in: false, marketing_opt_in: true })
    const rows = await records(b)
    expect(rows.map((x) => [x.purpose, x.channel, x.destination, x.granted, x.disclosure_version, x.source])).toEqual([
      ['marketing', 'email', b.contact.email, true, PRIVACY_NOTICE.documentId, 'request_form'],
      ['marketing', 'sms', e164(b), true, PRIVACY_NOTICE.documentId, 'request_form'],
    ])
    expect(await currentConsent(t.db, 'sms', e164(b), 'transactional_sms')).toBe('none')
    expect(await permission('email', b.contact.email, 'review.request')).toEqual({ allowed: true })
    // A marketing text needs both the marketing permission and the SMS opt-in (HH-COM-05).
    expect(await permission('sms', e164(b), 'review.request')).toEqual({ allowed: false, reason: 'sms_no_opt_in' })
    // An opt-out recorded after a review request was queued blocks it at send time (T67).
    await withTx(t.db, (tx) =>
      recordConsent(tx, {
        purpose: 'marketing',
        channel: 'email',
        destination: b.contact.email,
        granted: false,
        source: 'staff_recorded',
        recordedBy: 'staff-synthetic-office',
        evidence: { note: 'customer asked by phone (synthetic)' },
      }),
    )
    expect(await permission('email', b.contact.email, 'review.request')).toEqual({
      allowed: false,
      reason: 'no_marketing_consent',
    })
  })

  it('[HH-INT-22][HH-INT-18] both boxes give three separate records; neither implies the other', async () => {
    const b = body({ smsOptIn: true, marketingOptIn: true })
    expect((await submit(b)).statusCode).toBe(201)
    const rows = await records(b)
    expect(rows.map((x) => [x.purpose, x.channel, x.disclosure_version])).toEqual([
      ['transactional_sms', 'sms', 'sms-disclosure-1'],
      ['marketing', 'email', 'privacy-notice-1'],
      ['marketing', 'sms', 'privacy-notice-1'],
    ])
    expect(await permission('sms', e164(b), 'review.request')).toEqual({ allowed: true })
  })
})

describe('the server rejects manipulated consent fields and creates nothing (TSK-0029, HH-INT-09, T10)', () => {
  it('[T10][HH-INT-22] an opt-in needs a published disclosure; text needs the opt-in; types are strict', async () => {
    const before = [await count('intake.requests'), await count('platform.consent_records')]
    const noVersion = body({ smsOptIn: true })
    delete (noVersion as Partial<Body>).smsDisclosureVersion
    let res = await submit(noVersion)
    expect(res.statusCode).toBe(400)
    expect(fields(res)).toEqual([['body.smsDisclosureVersion', 'required']])

    res = await submit(body({ smsOptIn: true, smsDisclosureVersion: 'sms-disclosure-9' }))
    expect(res.statusCode).toBe(400)
    expect(fields(res)).toEqual([['body.smsDisclosureVersion', 'unknown_version']])

    // Choosing text without the opt-in is refused with a reason, never switched to another channel.
    res = await submit(body({}, { preferredChannel: 'text' }))
    expect(res.statusCode).toBe(400)
    expect(fields(res)).toEqual([['body.contact.preferredChannel', 'smsOptInRequired']])

    res = await submit(body({ smsOptIn: 'yes', marketingOptIn: 'maybe' }))
    expect(res.statusCode).toBe(400)
    expect(fields(res)).toEqual(
      expect.arrayContaining([
        ['body.smsOptIn', 'enum'],
        ['body.marketingOptIn', 'enum'],
      ]),
    )
    // Values a validator could coerce to true are refused too: only a literal true is an opt-in.
    for (const truthy of [1, 'true']) {
      res = await submit(body({ smsOptIn: truthy, marketingOptIn: truthy }))
      expect(res.statusCode, String(truthy)).toBe(400)
      expect(fields(res)).toEqual(
        expect.arrayContaining([
          ['body.smsOptIn', 'enum'],
          ['body.marketingOptIn', 'enum'],
        ]),
      )
    }
    // The opt-in and the marketing choice cannot be left out (a missing box is never read as either answer).
    const missing = body() as Partial<Body>
    delete missing.smsOptIn
    delete missing.marketingOptIn
    res = await submit(missing)
    expect(res.statusCode).toBe(400)
    expect(fields(res)).toEqual(
      expect.arrayContaining([
        ['body.smsOptIn', 'required'],
        ['body.marketingOptIn', 'required'],
      ]),
    )
    expect([await count('intake.requests'), await count('platform.consent_records')]).toEqual(before)
  })
})

describe('an existing email and number reveal nothing (TSK-0029, HH-ID-03, T16)', () => {
  it('[T16][HH-ID-03] a second request with the same contact gets the same answer and its own consent record', async () => {
    const first = body({ smsOptIn: true })
    const a = await submit(first)
    const second = { ...body({ smsOptIn: true }), contact: first.contact }
    const b = await submit(second)
    expect([a.statusCode, b.statusCode]).toEqual([201, 201])
    // The same shape: nothing says the email or the number is already known.
    expect(Object.keys(b.json()).sort()).toEqual(Object.keys(a.json()).sort())
    expect(JSON.stringify(b.json())).not.toMatch(/exist|already|account|project/i)
    const ra = await stored(a.json<{ reference: string }>().reference)
    const rb = await stored(b.json<{ reference: string }>().reference)
    expect(rb.contact_id).not.toBe(ra.contact_id)
    const rows = await records(first)
    expect(rows.map((x) => [x.purpose, x.subject_id])).toEqual([
      ['transactional_sms', ra.contact_id],
      ['transactional_sms', rb.contact_id],
    ])
  })
})

describe('STOP, HELP and START after a request-form opt-in (TSK-0029, HH-COM-12, HH-COM-05, INT-Bird, T76)', () => {
  let k = 0
  const inbound = (from: string, text: string) =>
    runWithContext({ requestId: `req-consent-${++k}` }, () =>
      withTx(t.db, (tx) => {
        const payload = { type: 'sms.received', data: { sms_id: `sms_consent_${k}`, from, to: '+15025550199', text } }
        return recordWebhookReceipt(tx, {
          provider: 'bird',
          deliveryId: `consent-kw-${k}`,
          eventType: payload.type,
          providerMessageId: payload.data.sms_id,
          eventOccurredAt: null,
          payload,
          rawBody: Buffer.from(JSON.stringify(payload)),
        })
      }),
    )
  const drain = async () => {
    const w = createWorker({ db: t.db, registry: createAutomationRegistry([deliveryStatusAutomation()]) })
    for (let i = 0; i < 10; i++) {
      const r = await w.runOnce()
      if (r.dispatched + r.succeeded + r.retried + r.failed + r.cancelled === 0) return
    }
  }

  it('[T76][HH-COM-12] STOP blocks the next text and is recorded; HELP changes nothing; START records a new opt-in', async () => {
    const b = body({ smsOptIn: true, marketingOptIn: true }, { preferredChannel: 'text' })
    expect((await submit(b)).statusCode).toBe(201)
    const phone = e164(b)
    expect(await permission('sms', phone, 'question.notice')).toEqual({ allowed: true })

    await inbound(phone, 'STOP')
    await drain()
    expect(await currentConsent(t.db, 'sms', phone, 'transactional_sms')).toBe('withdrawn')
    expect(await permission('sms', phone, 'question.notice')).toEqual({ allowed: false, reason: 'sms_opted_out' })

    // HELP changes no consent. Its answer is Bird's keyword rule; the app's own wording (sms.help_reply) is NOT
    // CONFIGURED until the owner sets it, and nothing is invented for it (RULE-NO-INVENTED-FACTS).
    await inbound(phone, 'HELP')
    await drain()
    expect(await currentConsent(t.db, 'sms', phone, 'transactional_sms')).toBe('withdrawn')
    expect((await loadConfig(t.db)).get('sms.help_reply').state).toBe('NOT_CONFIGURED')

    await inbound(phone, 'START')
    await drain()
    expect(await currentConsent(t.db, 'sms', phone, 'transactional_sms')).toBe('granted')
    // START restores texts, never marketing; the email marketing permission was never touched by SMS keywords.
    expect(await currentConsent(t.db, 'sms', phone, 'marketing')).toBe('withdrawn')
    expect(await currentConsent(t.db, 'email', b.contact.email, 'marketing')).toBe('granted')
    const rows = (await records(b)).filter((x) => x.channel === 'sms')
    expect(rows.map((x) => [x.purpose, x.granted, x.source, x.disclosure_version])).toEqual([
      ['transactional_sms', true, 'request_form', 'sms-disclosure-1'],
      ['marketing', true, 'request_form', 'privacy-notice-1'],
      ['transactional_sms', false, 'sms_keyword', null],
      ['marketing', false, 'sms_keyword', null],
      ['transactional_sms', true, 'sms_keyword', null],
    ])
  })
})
