// The receipt email and the receipt page's server side against PostgreSQL 16 and the provider fakes (TSK-0032; HH-INT-20,
// HH-INT-12, HH-INT-10, HH-COM-02, HH-INT-07, T01, T12, T13, T65). Every visitor, address, number and template text
// here is synthetic (RULE-SYNTHETIC-DATA); nothing reaches a real provider.
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadServiceSeed, syncServices, withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import { PRIVACY_NOTICE } from '@handyhub/domain/legal'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import { currentTemplate, releaseTemplateVersion } from '../../src/modules/notifications/index.js'
import { queueAutomations } from '../../src/modules/queue/index.js'
import { briefSummary, receiptEmailAutomation } from '../../src/modules/requests/receipt-email.js'
import { createAutomationRegistry, type Automation } from '../../src/platform/automation.js'
import { createWorker, rerunJob } from '../../src/platform/jobs.js'
import { createProviders } from '../../src/providers/index.js'
import { FakeObjectStorage } from '../../src/providers/r2/index.js'
import { readProviderSettings } from '../../src/providers/settings.js'
import { testConfig } from '../fixtures/env.js'
import { png } from '../fixtures/images.js'

const pw = ['synthetic', 'receipt', 'passphrase', 'one'].join(' ')
const PEOPLE = ['owner', 'office', 'estimator', 'worker'] as const
type Person = (typeof PEOPLE)[number]

let t: TestDatabase
let app: FastifyInstance
const storage = new FakeObjectStorage()
const ids = {} as Record<Person, string>
const cookies = {} as Record<Person, string>
const csrf = {} as Record<Person, string>

const fakes = (() => {
  const p = createProviders(readProviderSettings({ HANDYHUB_ENV: 'ci' }))
  if (!p.fakes.email) throw new Error('ci uses the fakes')
  return { email: p.email, fake: p.fakes.email }
})()
const fastRetry = (a: Automation, maxAttempts = 3): Automation => ({
  ...a,
  retry: { maxAttempts, baseDelayMs: 1, maxDelayMs: 1 },
})
const tick = () => new Promise((r) => setTimeout(r, 15))
/** The worker as the server runs it for this slice: the staff intake item and the receipt, from request.submitted. */
const worker = (maxAttempts = 3) =>
  createWorker({
    db: t.db,
    registry: createAutomationRegistry([
      ...queueAutomations(),
      fastRetry(receiptEmailAutomation({ providers: { email: fakes.email, sms: null } }), maxAttempts),
    ]),
  })

beforeAll(async () => {
  t = await createTestDatabase()
  await syncServices(t.db, loadServiceSeed())
  app = await buildApp({ config: testConfig({ TRUST_PROXY_HOPS: '1' }), api: { db: t.db, storage } })
  const hash = await hashPassword(pw)
  await withTx(t.db, async (tx) => {
    for (const p of PEOPLE) {
      const user = await createStaffUser(tx, {
        email: `${p}-receipt@example.test`,
        displayName: `Synthetic ${p}`,
        locale: 'en',
        role: p,
        issuedBy: 'test',
      })
      await setPasswordHash(tx, user.id, hash)
      ids[p] = user.id
    }
  })
  for (const p of PEOPLE) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/staff/auth/sign-in',
      payload: { email: `${p}-receipt@example.test`, password: pw },
    })
    expect(res.statusCode).toBe(200)
    cookies[p] = String(res.headers['set-cookie']).split(';')[0] as string
    const session = await app.inject({
      method: 'GET',
      url: '/api/v1/staff/auth/session',
      headers: { cookie: cookies[p] },
    })
    csrf[p] = session.json<{ csrfToken: string }>().csrfToken
  }
})
afterAll(async () => {
  await app?.close()
  await t?.drop()
})

let ip = 10
const nextIp = () => `198.51.100.${++ip}`
let n = 0
const future = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10)

function body(email: string, over: Record<string, unknown> = {}) {
  return {
    formVersion: 'test-1',
    privacyNoticeVersion: PRIVACY_NOTICE.documentId,
    services: [{ serviceId: 'SVC-DW-01' }, { serviceId: 'SVC-PT-01' }],
    notSure: false,
    description: 'Synthetic receipt project: a dent behind a door.',
    property: { street: '100 Synthetic Way', city: 'Testville', state: 'KY', zip: '40000', propertyType: 'house' },
    timing: { preferredDate: future, flexible: false, needHelpToday: false, windows: ['any_time'] },
    estimatePreference: 'let_handyhub_decide',
    contact: { fullName: 'Test Customer', email, phone: '(502) 555-0141', preferredChannel: 'email' },
    smsOptIn: false,
    marketingOptIn: false,
    ...over,
  }
}
const submit = (payload: unknown, key = `synthetic-receipt-${++n}-0001`, from = nextIp()) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/public/requests',
    headers: { 'idempotency-key': key, 'x-forwarded-for': from },
    payload: payload as Record<string, unknown>,
  })
async function submitted(email: string, over: Record<string, unknown> = {}) {
  const res = await submit(body(email, over))
  expect(res.statusCode).toBe(201)
  const reference = res.json<{ reference: string }>().reference
  const request = await t.db
    .selectFrom('intake.requests')
    .select(['id', 'project_id', 'reference'])
    .where('reference', '=', reference)
    .executeTakeFirstOrThrow()
  return { res, ...request }
}
const deliveries = (requestId: string) =>
  t.db
    .selectFrom('platform.message_deliveries')
    .selectAll()
    .where('subject_key', '=', `request:${requestId}`)
    .orderBy('seq')
    .execute()
const items = (type: string, subjectId: string) =>
  t.db
    .selectFrom('ops.queue_items')
    .selectAll()
    .where('type', '=', type)
    .where('subject_id', '=', subjectId)
    .orderBy('opened_at')
    .execute()
const sentTo = (email: string) => fakes.fake.sent.filter((m) => m.to === email)
const retry = (who: Person, deliveryId: string, key = `staff-retry-${++n}-0001`) =>
  app.inject({
    method: 'POST',
    url: `/api/v1/staff/message-deliveries/${deliveryId}/retry`,
    headers: { cookie: cookies[who], 'x-csrf-token': csrf[who], 'idempotency-key': key },
  })
const queue = async (who: Person) => {
  const res = await app.inject({
    method: 'GET',
    url: '/api/v1/staff/queue?type=delivery_failed&limit=100',
    headers: { cookie: cookies[who] },
  })
  expect(res.statusCode).toBe(200)
  return res.json<{
    items: { subjectId: string; reference: string; reason: string; action: string; assignee: unknown }[]
  }>().items
}

/** The owner's exact response wording (FACT-RESPONSE-TARGET, OWN-DEC-94) and the separate sentence (HH-INT-12). */
const fact = readFileSync(new URL('../../../../kg/facts/FACT-RESPONSE-TARGET.md', import.meta.url), 'utf8')
const OWNER_RESPONSE = /receipt email, exact\): "([^"]+)"/.exec(fact)?.[1] ?? ''
const SEPARATE = 'Your request is received. Pricing and your appointment will be confirmed separately.'

describe('the receipt email stays NOT CONFIGURED until the owner approves its wording (TSK-0032, HH-INT-20, RULE-NO-INVENTED-FACTS)', () => {
  it('[HH-INT-20][T12] no receipt template is seeded: the request is kept, nothing is sent, and staff get one delivery issue', async () => {
    expect(await currentTemplate(t.db, 'request.receipt', 'email', 'en')).toBeNull()
    const email = 'receipt-unconfigured@example.test'
    const r = await submitted(email)
    const w = worker()
    await w.runOnce()
    await w.runOnce()
    expect(sentTo(email)).toEqual([])
    const [d, ...more] = await deliveries(r.id)
    expect(more).toEqual([])
    expect([d?.state, d?.error_code, d?.release, d?.audience, d?.locale]).toEqual([
      'failed',
      'template_not_configured',
      'automatic',
      'customer',
      'en',
    ])
    // The request is saved and staff see it; the failure is its own item, saying why.
    expect(await items('new_request', r.id)).toHaveLength(1)
    const issue = await items('delivery_failed', d?.id as string)
    expect(issue.map((i) => [i.reason, i.reference, i.project_id, i.resolved_at])).toEqual([
      ['delivery_not_configured', r.reference, r.project_id, null],
    ])
  })
})

describe('one receipt per request (TSK-0032, HH-INT-20, HH-INT-10, T01)', () => {
  beforeAll(async () => {
    // A synthetic test template, released only in this test database: it is not the owner's wording and nothing seeds it.
    await withTx(t.db, (tx) =>
      releaseTemplateVersion(tx, {
        messageKey: 'request.receipt',
        channel: 'email',
        locale: 'en',
        subject: 'Synthetic test receipt {reference}',
        body: 'SYNTHETIC TEST TEMPLATE\n{reference}\n{services}\n{summary}\n{nextSteps}',
        translationReview: 'source',
        sourceIds: ['TSK-0032'],
        releasedBy: 'test',
      }),
    )
  })

  it('[T01][HH-INT-20][HH-INT-10] one English receipt with the reference, services, summary and next steps; a double submit, a re-dispatch and a replayed job send no second', async () => {
    const email = 'receipt-once@example.test'
    const payload = body(email)
    // Built at runtime so the secret scanner never reads a synthetic key as a credential.
    const key = ['synthetic', 'receipt', 'once', '0001'].join('-')
    const first = await submit(payload, key)
    const again = await submit(payload, key)
    expect(again.headers['idempotent-replayed']).toBe('true')
    expect(again.json().reference).toBe(first.json().reference)
    const r = await t.db
      .selectFrom('intake.requests')
      .select(['id', 'reference'])
      .where('reference', '=', first.json().reference)
      .executeTakeFirstOrThrow()
    const w = worker()
    await w.runOnce()
    // The event is dispatched again (as after a crash before it was marked): its jobs exist, so nothing is added.
    await t.db
      .updateTable('platform.outbox_events')
      .set({ state: 'pending', dispatched_at: null, jobs_created: null })
      .where('idempotency_key', '=', `request.submitted:${r.id}`)
      .execute()
    await w.runOnce()
    // The receipt job is run again: the delivery was handed over, so the replay sends nothing.
    const job = await t.db
      .selectFrom('platform.jobs')
      .select('id')
      .where('automation', '=', 'notify.request.receipt')
      .where('target_id', '=', r.id)
      .executeTakeFirstOrThrow()
    await withTx(t.db, (tx) => rerunJob(tx, { jobId: job.id, key: 'replay', requestId: 'test-replay' }))
    await w.runOnce()

    const sent = sentTo(email)
    expect(sent).toHaveLength(1)
    const mail = sent[0]
    expect(mail?.subject).toBe(`Synthetic test receipt ${r.reference}`)
    expect(mail?.text.split('\n')).toEqual([
      'SYNTHETIC TEST TEMPLATE',
      r.reference,
      'Patching & Repair, Residential Interior Painting',
      'Synthetic receipt project: a dent behind a door.',
      OWNER_RESPONSE,
      '',
      SEPARATE,
    ])
    // Only what the customer submitted: no address, number, code or link.
    expect(mail?.text).not.toMatch(/Synthetic Way|555-0141|https?:|\bcode\b/i)
    const rows = await deliveries(r.id)
    expect(rows.map((d) => [d.state, d.template_version, d.provider, d.record_type, d.record_id, d.attempts])).toEqual([
      ['queued', 1, 'fake', 'request', r.id, 1],
    ])
    expect(rows[0]?.provider_message_id).toBe(mail?.providerMessageId)
    expect(await items('delivery_failed', rows[0]?.id as string)).toEqual([])
    expect(
      await t.db.selectFrom('platform.outbox_events').select('id').where('aggregate_id', '=', r.id).execute(),
    ).toHaveLength(1)
  })

  it('[HH-INT-20] the brief summary is the customer’s own words, shortened on a word boundary', () => {
    expect(briefSummary('  Synthetic   words  ')).toBe('Synthetic words')
    const long = briefSummary(`${'synthetic '.repeat(40)}end`)
    expect(long.length).toBeLessThanOrEqual(281)
    expect(long.endsWith('synthetic…')).toBe(true)
    expect(briefSummary(null)).toBe('')
  })
})

describe('a failed send keeps the request and gives staff one retry (TSK-0032, HH-INT-20, HH-COM-02, T12)', () => {
  it('[T12][HH-INT-20] the provider rejects: the request stays saved and queued, one delivery issue with Retry; Retry sends one receipt and a second Retry is refused', async () => {
    const email = 'receipt-rejected@example.test'
    fakes.fake.script({ outcome: 'rejected', errorCode: 'http_422_validation_error' })
    const r = await submitted(email)
    const w = worker()
    await w.runOnce()
    await w.runOnce()
    expect(sentTo(email)).toEqual([])
    const [d] = await deliveries(r.id)
    expect([d?.state, d?.error_code]).toEqual(['failed', 'http_422_validation_error'])
    const deliveryId = d?.id as string
    // The request stays saved and in the staff queue; the failure is one item, unassigned until someone owns the
    // request, so Office and the Owner see it, with the reference and the Retry action.
    expect(await items('new_request', r.id)).toHaveLength(1)
    expect((await items('delivery_failed', deliveryId)).map((i) => [i.reason, i.assigned_staff_id])).toEqual([
      ['delivery_failed', null],
    ])
    for (const who of ['owner', 'office'] as const)
      expect((await queue(who)).filter((i) => i.subjectId === deliveryId)).toEqual([
        expect.objectContaining({ reference: r.reference, reason: 'delivery_failed', action: 'retry_delivery' }),
      ])
    expect((await queue('estimator')).filter((i) => i.subjectId === deliveryId)).toEqual([])

    // Only staff who may release messages retry, and only items they may see.
    expect((await retry('worker', deliveryId)).statusCode).toBe(403)
    expect((await retry('estimator', deliveryId)).statusCode).toBe(403)
    const guest = await app.inject({
      method: 'POST',
      url: `/api/v1/staff/message-deliveries/${deliveryId}/retry`,
      headers: { 'idempotency-key': 'guest-retry-0001' },
    })
    expect([401, 403]).toContain(guest.statusCode)

    const key = 'office-retry-rejected-0001'
    const res = await retry('office', deliveryId, key)
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ id: deliveryId, state: 'queued' })
    // The same press again is the same answer; another press while it is queued is refused.
    expect((await retry('office', deliveryId, key)).json()).toEqual({ id: deliveryId, state: 'queued' })
    expect((await retry('owner', deliveryId)).statusCode).toBe(409)
    await w.runOnce()
    await w.runOnce()
    expect(sentTo(email)).toHaveLength(1)
    const [after] = await deliveries(r.id)
    expect([after?.state, after?.error_code, after?.attempts]).toEqual(['queued', null, 2])
    expect((await items('delivery_failed', deliveryId)).map((i) => i.resolution)).toEqual(['queued'])
    // Sent: nothing left to retry, and no second receipt.
    expect((await retry('office', deliveryId)).statusCode).toBe(409)
    await w.runOnce()
    expect(sentTo(email)).toHaveLength(1)
    const audit = await t.db
      .selectFrom('platform.audit_events')
      .select(['action', 'actor_id'])
      .where('target_type', '=', 'message_delivery')
      .where('target_id', '=', deliveryId)
      .execute()
    expect(audit).toEqual([{ action: 'message.retry', actor_id: ids.office }])
  })

  it('[T12][HH-OPS-02] the delivery issue belongs to the staff member responsible for the request', async () => {
    const email = 'receipt-owned@example.test'
    fakes.fake.script({ outcome: 'rejected', errorCode: 'http_422_validation_error' })
    const r = await submitted(email)
    await t.db.updateTable('intake.requests').set({ responsible_staff_id: ids.office }).where('id', '=', r.id).execute()
    await worker().runOnce()
    const [d] = await deliveries(r.id)
    expect((await items('delivery_failed', d?.id as string)).map((i) => i.assigned_staff_id)).toEqual([ids.office])
  })

  it('[T12] a receipt that is not failed cannot be retried, and an unknown delivery is not found', async () => {
    const email = 'receipt-fine@example.test'
    const r = await submitted(email)
    await worker().runOnce()
    const [d] = await deliveries(r.id)
    expect((await retry('office', d?.id as string)).statusCode).toBe(409)
    expect((await retry('office', '00000000-0000-4000-8000-000000000032')).statusCode).toBe(404)
    expect((await retry('office', 'not-a-delivery')).statusCode).toBe(400)
  })
})

describe('temporary provider failures (TSK-0032, T65, HH-ARC-09, HH-INT-20)', () => {
  it('[T65][HH-INT-20] a provider outage is retried under the same key until the receipt is sent once', async () => {
    const email = 'receipt-outage@example.test'
    fakes.fake.script({ outcome: 'retryable_error', errorCode: 'http_503' })
    const r = await submitted(email)
    const before = fakes.fake.calls.length
    const w = worker()
    expect(await w.runOnce()).toMatchObject({ retried: 1 })
    await tick()
    await w.runOnce()
    const calls = fakes.fake.calls.slice(before).filter((c) => c.to === email)
    expect(calls).toHaveLength(2)
    expect(calls[1]?.idempotencyKey).toBe(calls[0]?.idempotencyKey)
    expect(sentTo(email)).toHaveLength(1)
    const [d] = await deliveries(r.id)
    expect(d?.state).toBe('queued')
    expect(await items('delivery_failed', d?.id as string)).toEqual([])
  })

  it('[T65][T12] a failure on the last attempt is recorded as failed with a staff retry, never as sent', async () => {
    const email = 'receipt-down@example.test'
    fakes.fake.script(
      { outcome: 'retryable_error', errorCode: 'http_503' },
      { outcome: 'outcome_unknown', errorCode: 'timeout' },
    )
    const r = await submitted(email)
    const w = worker(2)
    await w.runOnce()
    await tick()
    const result = await w.runOnce()
    expect(result.failed).toBe(0)
    const [d] = await deliveries(r.id)
    expect([d?.state, d?.error_code, d?.provider_message_id]).toEqual(['failed', 'timeout', null])
    expect((await items('delivery_failed', d?.id as string)).map((i) => i.reason)).toEqual(['delivery_failed'])
    expect(sentTo(email)).toEqual([])
    expect((await retry('owner', d?.id as string)).statusCode).toBe(200)
    await w.runOnce()
    expect(sentTo(email)).toHaveLength(1)
  })
})

describe('the receipt page’s server side (TSK-0032, HH-INT-12, HH-INT-07, T13)', () => {
  it('[HH-INT-12] the request form settings give the response target the receipt states with the visit hours', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/public/request-form' })
    expect(res.json()).toMatchObject({ responseMinutes: 60, visitHours: { open: '08:00', close: '22:00' } })
  })

  it('[T13][HH-INT-07] a sent draft gives a capability for the request’s photos only: a failed photo is retried without a new request; a replay carries none', async () => {
    const draft = await app.inject({
      method: 'POST',
      url: '/api/v1/public/request-drafts',
      headers: { 'x-forwarded-for': nextIp() },
    })
    const draftCap = draft.json<{ capability: string }>().capability
    const up = (cap: string, bytes: Buffer) =>
      app.inject({
        method: 'POST',
        url: '/api/v1/public/request-drafts/photos',
        headers: { 'upload-capability': cap, 'content-type': 'image/png', 'x-forwarded-for': nextIp() },
        payload: bytes,
      })
    expect((await up(draftCap, png(3201))).statusCode).toBe(201)
    const key = 'synthetic-receipt-photos-0001'
    const payload = body('receipt-photos@example.test', { photoDraft: draftCap })
    const res = await submit(payload, key)
    expect(res.statusCode).toBe(201)
    expect(res.json().photos).toEqual({ received: 0, processing: 1, failed: 0 })
    const cap = String(res.headers['upload-capability'] ?? '')
    expect(cap).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(res.body).not.toContain(cap)
    // The capability is returned once: never stored with the replayable response.
    const replay = await submit(payload, key)
    expect(replay.headers['upload-capability']).toBeUndefined()
    const stored = await t.db
      .selectFrom('platform.idempotency_keys')
      .select('response_body')
      .where('idempotency_key', '=', key)
      .executeTakeFirstOrThrow()
    expect(JSON.stringify(stored.response_body)).not.toContain(cap)

    // The "failed" photo is sent again from the receipt: it joins this request, and no second request exists.
    const retried = await up(cap, png(3202))
    expect(retried.statusCode).toBe(201)
    const request = await t.db
      .selectFrom('intake.requests')
      .select(['id', 'project_id'])
      .where('reference', '=', res.json().reference)
      .executeTakeFirstOrThrow()
    const photos = await t.db
      .selectFrom('intake.photos')
      .select(['request_id', 'project_id'])
      .where('request_id', '=', request.id)
      .execute()
    expect(photos).toHaveLength(2)
    expect(photos.every((p) => p.project_id === request.project_id)).toBe(true)
    const list = await app.inject({
      method: 'GET',
      url: '/api/v1/public/request-drafts/photos',
      headers: { 'upload-capability': cap },
    })
    expect(list.json<{ photos: unknown[] }>().photos).toHaveLength(2)
    expect(
      await t.db
        .selectFrom('intake.requests')
        .innerJoin('crm.contacts', 'crm.contacts.id', 'intake.requests.contact_id')
        .select('intake.requests.id')
        .where('crm.contacts.email', '=', 'receipt-photos@example.test')
        .execute(),
    ).toHaveLength(1)
    // The draft's own capability is used up.
    expect((await up(draftCap, png(3203))).statusCode).toBe(404)
    // A request without photos gets no capability.
    const plain = await submit(body('receipt-no-photos@example.test'))
    expect(plain.headers['upload-capability']).toBeUndefined()
  })

  it('[HH-INT-12] /request/received/<ref> is one private, uncached page for every well-formed reference', async () => {
    const siteDir = mkdtempSync(join(tmpdir(), 'site-receipt-'))
    try {
      mkdirSync(join(siteDir, 'request'))
      writeFileSync(
        join(siteDir, 'request', 'received.html'),
        '<!doctype html><title>t</title><h1>Synthetic receipt</h1>',
      )
      writeFileSync(join(siteDir, '404.html'), '<!doctype html><title>t</title><h1>Synthetic not found</h1>')
      const site = await buildApp({ config: { ...testConfig(), siteDir } })
      try {
        // A reference that exists and one that does not get the very same page: the page says nothing about either.
        const real = await site.inject({
          method: 'GET',
          url: `/request/received/${(await submitted('receipt-page@example.test')).reference}`,
        })
        const guessed = await site.inject({ method: 'GET', url: '/request/received/HH-00000000' })
        for (const res of [real, guessed]) {
          expect(res.statusCode).toBe(200)
          expect(res.body).toContain('Synthetic receipt')
          expect(res.headers['cache-control']).toBe('no-store')
          expect(res.headers['x-robots-tag']).toBe('noindex, nofollow')
          expect(res.headers['referrer-policy']).toBe('no-referrer')
        }
        expect(real.body).toBe(guessed.body)
        for (const url of ['/request/received/hh-0000', '/request/received/HH-0000000O', '/request/received/x/y'])
          expect((await site.inject({ method: 'GET', url })).statusCode, url).toBe(404)
      } finally {
        await site.close()
      }
    } finally {
      rmSync(siteDir, { recursive: true, force: true })
    }
  })
})
