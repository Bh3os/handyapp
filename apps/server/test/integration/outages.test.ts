// Fault injection for every provider and dependency (TSK-0106; HH-NFR-03, T71, T12, T13, HH-COM-02, HH-INT-07,
// HH-ARC-09, RULE-SAFETY-GATES; runbook docs/runbooks/outages.md). Unlike the provider-fake scripts of the other
// suites, the failures here happen on the network: the real Resend and Bird adapters talk to a local stub that is
// down (nothing listens: connection refused), slow (no answer: timeout) or up; the real R2 adapter talks to a closed
// local port; the database is a closed local port. Nothing reaches a real provider; every person, address and number
// is synthetic (RULE-SYNTHETIC-DATA).
// Expected each time (T71): a truthful failed or pending state with a retry, never a false receipt, send, upload,
// ready state or start; what was saved stays saved; a retry after recovery takes effect exactly once.
import { createServer, type IncomingMessage, type Server } from 'node:http'
import { createServer as createNetServer } from 'node:net'
import { S3Client } from '@aws-sdk/client-s3'
import { createDb, loadServiceSeed, syncServices, withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import { PRIVACY_NOTICE } from '@handyhub/domain/legal'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import { notificationAutomation, recordConsent, type Recipient } from '../../src/modules/notifications/index.js'
import { photoProcessAutomation } from '../../src/modules/photos/index.js'
import { queueAutomations } from '../../src/modules/queue/index.js'
import { receiptEmailAutomation } from '../../src/modules/requests/receipt-email.js'
import { createAutomationRegistry, type Automation } from '../../src/platform/automation.js'
import { recordPolicyVersion } from '../../src/platform/config/index.js'
import { createWorker } from '../../src/platform/jobs.js'
import { outbox } from '../../src/platform/outbox.js'
import { BirdSmsSender } from '../../src/providers/bird/index.js'
import { FakeObjectStorage, R2ObjectStorage, type ObjectStorage } from '../../src/providers/r2/index.js'
import { ResendEmailSender } from '../../src/providers/resend/index.js'
import { Secret } from '../../src/providers/types.js'
import { testConfig } from '../fixtures/env.js'
import { png } from '../fixtures/images.js'
import { signInWithMfa } from '../fixtures/staff-mfa.js'

/** A port nothing listens on (taken, then released): connecting to it is refused. */
async function closedPort(): Promise<number> {
  const s = createNetServer()
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r))
  const port = (s.address() as { port: number }).port
  await new Promise<void>((r) => s.close(() => r()))
  return port
}

/** A local stand-in for the Resend and Bird APIs: up (accepts once per idempotency key) or hanging (never answers). */
type Stub = { url: string; mode: 'up' | 'hang'; accepted: { path: string; key: string }[]; server: Server }
async function providerStub(): Promise<Stub> {
  const stub: Stub = { url: '', mode: 'up', accepted: [], server: undefined as unknown as Server }
  const ids = new Map<string, string>()
  stub.server = createServer((req: IncomingMessage, res) => {
    req.resume()
    req.on('end', () => {
      if (stub.mode === 'hang') return
      const key = String(req.headers['idempotency-key'] ?? '')
      let id = ids.get(key)
      if (!id) {
        id = `stub-${ids.size + 1}`
        ids.set(key, id)
        stub.accepted.push({ path: req.url ?? '', key })
      }
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ id, status: 'accepted' }))
    })
  })
  await new Promise<void>((r) => stub.server.listen(0, '127.0.0.1', r))
  stub.url = `http://127.0.0.1:${(stub.server.address() as { port: number }).port}`
  return stub
}

/** Object storage that can be taken down: down, every call goes to the real R2 adapter on a closed local port. */
class SwitchableStorage implements ObjectStorage {
  readonly provider = 'r2' as const
  down = false
  constructor(
    readonly up: FakeObjectStorage,
    readonly outage: R2ObjectStorage,
  ) {}
  #s(): ObjectStorage {
    return this.down ? this.outage : this.up
  }
  put(key: string, bytes: Uint8Array, contentType: string) {
    return this.#s().put(key, bytes, contentType)
  }
  get(key: string) {
    return this.#s().get(key)
  }
  delete(key: string) {
    return this.#s().delete(key)
  }
  signedGetUrl(key: string, options?: { expiresInSeconds?: number }) {
    return this.#s().signedGetUrl(key, options)
  }
  signedPutUrl(key: string, contentType: string, options?: { expiresInSeconds?: number }) {
    return this.#s().signedPutUrl(key, contentType, options)
  }
}

const pw = ['synthetic', 'outage', 'passphrase', 'one'].join(' ')
// Synthetic R2 credentials, built at runtime so no literal looks like a key.
const R2_ID = ['synthetic', 'r2', 'id'].join('-')
const R2_KEY = ['synthetic', 'r2', 'key'].join('-')
const OWNER_EMAIL = 'owner-outages@example.test'
const fastRetry = (a: Automation, maxAttempts = 2): Automation => ({
  ...a,
  retry: { maxAttempts, baseDelayMs: 1, maxDelayMs: 1 },
})
const tick = () => new Promise((r) => setTimeout(r, 15))

let t: TestDatabase
let app: FastifyInstance
let stub: Stub
let refusedUrl = ''
let cookie = ''
let csrfToken = ''
let storage: SwitchableStorage
const resendSettings = {
  adapter: 'resend' as const,
  apiKey: new Secret(['synthetic', 'resend', 'key'].join('-')),
  from: 'HandyHub <no-reply@example.test>',
  replyTo: null,
  apiBaseUrl: '',
}
const birdSettings = {
  adapter: 'bird' as const,
  apiKey: new Secret(['synthetic', 'bird', 'key'].join('-')),
  from: '+15025550199',
  apiBaseUrl: '',
}
// Short timeouts, so a hanging provider is an uncertain outcome within the test.
const resend = new ResendEmailSender(resendSettings, fetch, 300)
const bird = new BirdSmsSender(birdSettings, fetch, 300)

beforeAll(async () => {
  t = await createTestDatabase()
  await syncServices(t.db, loadServiceSeed())
  stub = await providerStub()
  refusedUrl = `http://127.0.0.1:${await closedPort()}`
  const r2Down = new R2ObjectStorage(
    {
      adapter: 'r2',
      accountId: 'synthetic',
      bucket: 'synthetic-bucket',
      accessKeyId: new Secret(R2_ID),
      secretAccessKey: new Secret(R2_KEY),
    },
    new S3Client({
      region: 'auto',
      endpoint: refusedUrl,
      forcePathStyle: true,
      maxAttempts: 1,
      credentials: { accessKeyId: R2_ID, secretAccessKey: R2_KEY },
    }),
  )
  storage = new SwitchableStorage(new FakeObjectStorage(), r2Down)
  app = await buildApp({ config: testConfig({ TRUST_PROXY_HOPS: '1' }), api: { db: t.db, storage } })
  await withTx(t.db, async (tx) => {
    const user = await createStaffUser(tx, {
      email: OWNER_EMAIL,
      displayName: 'Synthetic owner',
      locale: 'en',
      role: 'owner',
      issuedBy: 'test',
    })
    await setPasswordHash(tx, user.id, await hashPassword(pw))
  })
  const res = await signInWithMfa(app, {
    method: 'POST',
    url: '/api/v1/staff/auth/sign-in',
    payload: { email: OWNER_EMAIL, password: pw },
  })
  expect(res.statusCode, res.body).toBe(200)
  cookie = String(res.headers['set-cookie']).split(';')[0] as string
  const session = await app.inject({ method: 'GET', url: '/api/v1/staff/auth/session', headers: { cookie } })
  csrfToken = session.json<{ csrfToken: string }>().csrfToken
}, 60_000)

afterAll(async () => {
  await app?.close()
  await new Promise<void>((r) => (stub?.server ? stub.server.close(() => r()) : r()))
  await t?.drop()
})

let ip = 10
const nextIp = () => `198.51.100.${++ip}`
let n = 0
const future = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10)
const body = (email: string, photoDraft?: string) => ({
  formVersion: 'test-1',
  privacyNoticeVersion: PRIVACY_NOTICE.documentId,
  services: [{ serviceId: 'SVC-DW-01' }],
  notSure: false,
  description: 'Synthetic outage project: a dent behind a door.',
  property: { street: '100 Synthetic Way', city: 'Testville', state: 'KY', zip: '40000', propertyType: 'house' },
  timing: { preferredDate: future, flexible: false, needHelpToday: false, windows: ['any_time'] },
  estimatePreference: 'let_handyhub_decide',
  contact: { fullName: 'Test Customer', email, phone: '(502) 555-0161', preferredChannel: 'email' },
  smsOptIn: false,
  marketingOptIn: false,
  ...(photoDraft ? { photoDraft } : {}),
})
const submitTo = (target: FastifyInstance, payload: unknown, key = `synthetic-outage-${++n}-0001`, from = nextIp()) =>
  target.inject({
    method: 'POST',
    url: '/api/v1/public/requests',
    headers: { 'idempotency-key': key, 'x-forwarded-for': from },
    payload: payload as Record<string, unknown>,
  })
async function submitted(email: string) {
  const res = await submitTo(app, body(email))
  expect(res.statusCode, res.body).toBe(201)
  const reference = res.json<{ reference: string }>().reference
  return t.db
    .selectFrom('intake.requests')
    .select(['id', 'reference'])
    .where('reference', '=', reference)
    .executeTakeFirstOrThrow()
}
const deliveries = (subject: string) =>
  t.db.selectFrom('platform.message_deliveries').selectAll().where('subject_key', '=', subject).orderBy('seq').execute()
const openIssues = (deliveryId: string) =>
  t.db
    .selectFrom('ops.queue_items')
    .select(['reason', 'resolution'])
    .where('type', '=', 'delivery_failed')
    .where('subject_id', '=', deliveryId)
    .execute()
const retry = (deliveryId: string) =>
  app.inject({
    method: 'POST',
    url: `/api/v1/staff/message-deliveries/${deliveryId}/retry`,
    headers: { cookie, 'x-csrf-token': csrfToken, 'idempotency-key': `outage-retry-${++n}-0001` },
  })
const sentAudits = (deliveryId: string) =>
  t.db
    .selectFrom('platform.audit_events')
    .select('action')
    .where('target_type', '=', 'message_delivery')
    .where('target_id', '=', deliveryId)
    .where('action', '=', 'notification.sent')
    .execute()
const receiptWorker = () =>
  createWorker({
    db: t.db,
    registry: createAutomationRegistry([
      ...queueAutomations(),
      fastRetry(receiptEmailAutomation({ providers: { email: resend, sms: null } })),
    ]),
  })
async function drain(w: ReturnType<typeof createWorker>, rounds = 4) {
  for (let i = 0; i < rounds; i++) {
    await w.runOnce()
    await tick()
  }
}

describe('email provider (Resend) outage (TSK-0106, HH-NFR-03, T71, T12)', () => {
  it('[T71][T12][HH-NFR-03] Resend refuses connections: the request stays saved, the receipt shows failed with a staff Retry; after recovery one Retry sends exactly one receipt', async () => {
    resendSettings.apiBaseUrl = refusedUrl
    const r = await submitted('outage-email-down@example.test')
    await drain(receiptWorker())
    const [d, ...more] = await deliveries(`request:${r.id}`)
    expect(more).toEqual([])
    expect([d?.state, d?.error_code, d?.provider, d?.provider_message_id]).toEqual([
      'failed',
      'connect_econnrefused',
      'resend',
      null,
    ])
    expect(await openIssues(d?.id as string)).toEqual([{ reason: 'delivery_failed', resolution: null }])
    expect(await sentAudits(d?.id as string)).toEqual([])
    // Still saved and on the staff queue as a new request.
    expect(
      await t.db
        .selectFrom('ops.queue_items')
        .select('id')
        .where('type', '=', 'new_request')
        .where('subject_id', '=', r.id)
        .execute(),
    ).toHaveLength(1)

    resendSettings.apiBaseUrl = stub.url
    stub.mode = 'up'
    const before = stub.accepted.length
    expect((await retry(d?.id as string)).statusCode).toBe(200)
    await drain(receiptWorker())
    const accepted = stub.accepted.slice(before)
    expect(accepted.map((a) => a.path)).toEqual(['/emails'])
    const [after] = await deliveries(`request:${r.id}`)
    expect([after?.state, after?.provider_message_id]).toEqual(['queued', expect.stringMatching(/^stub-/)])
    expect(await openIssues(d?.id as string)).toEqual([{ reason: 'delivery_failed', resolution: 'queued' }])
    // Nothing left to retry, and no second receipt.
    expect((await retry(d?.id as string)).statusCode).toBe(409)
    await drain(receiptWorker())
    expect(stub.accepted.length - before).toBe(1)
  })

  it('[T71][HH-ARC-09][HH-NFR-03] Resend never answers: an uncertain outcome is kept for reconciliation, never retried blindly', async () => {
    resendSettings.apiBaseUrl = stub.url
    stub.mode = 'hang'
    const before = stub.accepted.length
    const r = await submitted('outage-email-silent@example.test')
    await drain(receiptWorker())
    const [d] = await deliveries(`request:${r.id}`)
    expect([d?.state, d?.error_code, d?.provider_message_id]).toEqual(['failed', 'outcome_unknown_timeout', null])
    expect(await openIssues(d?.id as string)).toEqual([])
    const refused = await retry(d?.id as string)
    expect(refused.statusCode).toBe(409)
    expect(refused.json<{ error: { fieldErrors: { code: string }[] } }>().error.fieldErrors.map((f) => f.code)).toEqual(
      ['OUTCOME_UNKNOWN'],
    )
    expect(await sentAudits(d?.id as string)).toEqual([])
    stub.mode = 'up'
    expect(stub.accepted.length).toBe(before)
  })
})

describe('text provider (Bird) outage (TSK-0106, HH-NFR-03, T71, HH-COM-02)', () => {
  const PHONE = '+15025550162'
  const customer: Recipient = {
    kind: 'customer_contact',
    id: 'contact-synthetic-outage',
    destinations: [{ channel: 'sms', destination: PHONE, permission: 'preferred' }],
  }
  const textWorker = (subject: string) =>
    createWorker({
      db: t.db,
      registry: createAutomationRegistry([
        fastRetry(
          notificationAutomation({
            messageKey: 'question.notice',
            providers: { email: null, sms: bird },
            resolve: async () => ({
              subjectKey: subject,
              record: { type: 'question', id: subject },
              recipients: [customer],
              values: { projectLink: 'https://handyhub247.example/p/synthetic' },
            }),
          }),
        ),
      ]),
    })
  const publish = (id: string) =>
    withTx(t.db, (tx) =>
      outbox.add(tx, {
        type: 'question.published',
        aggregate: { type: 'question', id },
        idempotencyKey: `question.published:${id}`,
        requestId: `req-outage-${id}`,
      }),
    )

  beforeAll(async () => {
    // Live texts are off until A2P 10DLC (sms.live_delivery, OWN-DEC-190); this throwaway database turns them on so
    // the Bird adapter is actually reached.
    await recordPolicyVersion(t.db, {
      key: 'sms.live_delivery',
      value: { enabled: true },
      sourceIds: ['TEST-SYNTHETIC'],
      changedBy: 'test',
      reason: 'synthetic test configuration',
    })
    await withTx(t.db, (tx) =>
      recordConsent(tx, {
        purpose: 'transactional_sms',
        channel: 'sms',
        destination: PHONE,
        granted: true,
        source: 'request_form',
        disclosureVersion: 'synthetic-disclosure-1',
        recordedBy: 'customer:contact-synthetic-outage',
      }),
    )
  })

  it('[T71][HH-COM-02] Bird refuses connections on every attempt: the text is failed with its reason, never sent, and the event is kept', async () => {
    birdSettings.apiBaseUrl = refusedUrl
    await publish('q-outage-1')
    await drain(textWorker('question:q-outage-1'))
    const rows = await deliveries('question:q-outage-1')
    expect(rows.map((r) => [r.channel, r.state, r.error_code, r.provider, r.provider_message_id])).toEqual([
      ['sms', 'failed', 'connect_econnrefused', 'bird', null],
    ])
    expect(
      await t.db
        .selectFrom('platform.outbox_events')
        .select('id')
        .where('idempotency_key', '=', 'question.published:q-outage-1')
        .execute(),
    ).toHaveLength(1)
  })

  it('[T71][HH-COM-02][T66] Bird comes back between attempts: the retry presents the same key and one text is accepted', async () => {
    birdSettings.apiBaseUrl = refusedUrl
    await publish('q-outage-2')
    const w = textWorker('question:q-outage-2')
    expect(await w.runOnce()).toMatchObject({ retried: 1 })
    birdSettings.apiBaseUrl = stub.url
    stub.mode = 'up'
    const before = stub.accepted.length
    await tick()
    await drain(w)
    const accepted = stub.accepted.slice(before)
    expect(accepted.map((a) => a.path)).toEqual(['/v1/sms/messages'])
    const [d] = await deliveries('question:q-outage-2')
    expect([d?.state, d?.provider_message_id, d?.error_code]).toEqual(['queued', expect.stringMatching(/^stub-/), null])
  })
})

describe('file storage (R2) outage (TSK-0106, HH-NFR-03, T71, T13, HH-INT-07)', () => {
  const draft = async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/public/request-drafts',
      headers: { 'x-forwarded-for': nextIp() },
    })
    expect(res.statusCode, res.body).toBe(201)
    return res.json<{ capability: string }>().capability
  }
  const upload = (capability: string, bytes: Buffer) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/public/request-drafts/photos',
      headers: { 'upload-capability': capability, 'content-type': 'image/png', 'x-forwarded-for': nextIp() },
      payload: bytes,
    })
  const listed = async (capability: string) => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/public/request-drafts/photos',
      headers: { 'upload-capability': capability },
    })
    return res.json<{ photos: { id: string; state: string }[] }>().photos
  }
  const processor = () =>
    createWorker({ db: t.db, registry: createAutomationRegistry([fastRetry(photoProcessAutomation(storage), 5)]) })

  it('[T71][T13][HH-INT-07] storage down: a new upload fails as retryable and stores nothing; earlier photos and the draft stay; processing never marks a photo ready; after recovery the failed photo uploads and the waiting one becomes ready', async () => {
    storage.down = false
    const cap = await draft()
    const first = await upload(cap, png(601))
    expect(first.statusCode, first.body).toBe(201)
    await processor().runOnce()
    const waiting = await upload(cap, png(602))
    expect(waiting.statusCode, waiting.body).toBe(201)

    storage.down = true
    const failed = await upload(cap, png(603))
    expect(failed.statusCode).toBeGreaterThanOrEqual(500)
    expect(failed.json<{ error: { retryable: boolean } }>().error.retryable).toBe(true)
    expect(failed.body).not.toMatch(/127\.0\.0\.1|ECONNREFUSED/)
    expect(failed.body).not.toContain(R2_KEY)
    // Processing cannot read the stored original: the photo stays in quarantine, never ready, never rejected.
    const w = processor()
    expect(await w.runOnce()).toMatchObject({ retried: 1 })
    expect((await listed(cap)).map((p) => p.state)).toEqual(['ready', 'quarantined'])

    // The request is still taken while storage is down, and the receipt reports the photos as they are.
    const res = await submitTo(app, body('outage-storage@example.test', cap))
    expect(res.statusCode, res.body).toBe(201)
    expect(res.json().photos).toEqual({ received: 1, processing: 1, failed: 0 })

    const receiptCap = String(res.headers['upload-capability'] ?? '')
    const request = await t.db
      .selectFrom('intake.requests')
      .select('id')
      .where('reference', '=', res.json<{ reference: string }>().reference)
      .executeTakeFirstOrThrow()

    storage.down = false
    await tick()
    await drain(w)
    // The failed photo is sent again from the receipt: it joins the same request, no new request is needed.
    const resent = await upload(receiptCap, png(603))
    expect(resent.statusCode, resent.body).toBe(201)
    await drain(processor())
    const photos = await t.db
      .selectFrom('intake.photos')
      .select(['id', 'state'])
      .where('request_id', '=', request.id)
      .execute()
    expect(photos.map((p) => p.state)).toEqual(['ready', 'ready', 'ready'])
    expect(photos.map((p) => p.id).sort()).toEqual(
      [first, waiting, resent].map((r) => r.json<{ id: string }>().id).sort(),
    )
  })
})

describe('database outage (TSK-0106, HH-NFR-03, T71, RULE-SAFETY-GATES)', () => {
  it('[T71][HH-NFR-03] the database refuses connections: no receipt, a retryable failure, not ready; the same key after recovery saves the request once', async () => {
    const downUrl = `postgres://synthetic@127.0.0.1:${await closedPort()}/handyhub_outage`
    const down = await buildApp({
      config: testConfig({ TRUST_PROXY_HOPS: '1', DATABASE_URL: downUrl }),
      api: { db: createDb(downUrl, { max: 1 }), storage },
    })
    try {
      const sameKey = ['synthetic', 'outage', 'db', '0001'].join('-')
      const from = nextIp()
      const payload = body('outage-db@example.test')
      const res = await submitTo(down, payload, sameKey, from)
      expect(res.statusCode).toBeGreaterThanOrEqual(500)
      expect(res.json<{ error: { retryable: boolean } }>().error.retryable).toBe(true)
      expect(res.json()).not.toHaveProperty('reference')
      expect(res.body).not.toMatch(/ECONNREFUSED|127\.0\.0\.1|handyhub_outage/)
      // Liveness answers; readiness says the database failed.
      expect((await down.inject({ method: 'GET', url: '/healthz' })).statusCode).toBe(200)
      const ready = await down.inject({ method: 'GET', url: '/readyz' })
      expect(ready.statusCode).toBe(503)
      expect(ready.json()).toMatchObject({ status: 'not_ready', checks: { database: 'fail' } })
      // No staff session can be opened, so no start, resume, financial or close action can be taken.
      const signIn = await down.inject({
        method: 'POST',
        url: '/api/v1/staff/auth/sign-in',
        payload: { email: OWNER_EMAIL, password: pw },
      })
      expect(signIn.statusCode).toBeGreaterThanOrEqual(500)
      expect(signIn.headers['set-cookie']).toBeUndefined()

      // Recovery: the browser sends the kept draft again under the same key; one request is saved, a repeat replays.
      const saved = await submitTo(app, payload, sameKey, from)
      expect(saved.statusCode, saved.body).toBe(201)
      const again = await submitTo(app, payload, sameKey, from)
      expect(again.headers['idempotent-replayed']).toBe('true')
      expect(again.json().reference).toBe(saved.json().reference)
      expect(
        await t.db.selectFrom('crm.contacts').select('id').where('email', '=', 'outage-db@example.test').execute(),
      ).toHaveLength(1)
    } finally {
      await down.close()
    }
  })
})
