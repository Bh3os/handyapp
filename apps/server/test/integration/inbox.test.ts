// The unified inbox against PostgreSQL 16 and the provider fakes (TSK-0049; HH-COM-07, HH-COM-10, HH-COM-01, HH-COM-05,
// T21, T24, T66, T68, T71, T74, RULE-SERVER-AUTHZ). Every staff member, customer, address, number, message and signing
// secret here is synthetic and built at runtime (RULE-SYNTHETIC-DATA); nothing reaches a real provider.
import { randomUUID } from 'node:crypto'
import { loadServiceSeed, syncServices, withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import type { StaffRole } from '@handyhub/policy'
import Fastify, { type FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { startCustomerSession } from '../../src/modules/identity/customer-sessions.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import {
  inboxIntakeAutomation,
  projectReplyToken,
  replyAddress,
  type InboundAddress,
} from '../../src/modules/inbox/index.js'
import {
  createDraft,
  currentConsent,
  deliveryStatusAutomation,
  recordConsent,
  releaseAutomation,
  releaseDraft,
  releaseTemplateVersion,
} from '../../src/modules/notifications/index.js'
import { createAutomationRegistry, type Automation } from '../../src/platform/automation.js'
import { loadConfig } from '../../src/platform/config/index.js'
import { createWorker } from '../../src/platform/jobs.js'
import { createProviders } from '../../src/providers/index.js'
import { FakeInboundReader } from '../../src/providers/inbound.js'
import { FakeObjectStorage } from '../../src/providers/r2/index.js'
import { readProviderSettings } from '../../src/providers/settings.js'
import { signWebhook } from '../../src/providers/webhooks.js'
import { registerWebhookRoutes } from '../../src/providers/webhooks.js'
import { testConfig } from '../fixtures/env.js'
import { signInWithMfa } from '../fixtures/staff-mfa.js'
import { replyStaffNoticeAutomation } from '../../src/modules/questions/automations.js'

const ROLES: readonly StaffRole[] = ['owner', 'office', 'estimator', 'worker']
const pw = ['synthetic', 'inbox', 'passphrase', '49'].join(' ')
// Synthetic signing secrets, built from parts so no literal looks like a credential.
const secretOf = (label: string) =>
  ['whsec', Buffer.from(['synthetic', label, 'signing', 'key', '0049'].join('-')).toString('base64')].join('_')
const BIRD_SECRET = secretOf('bird')
const RESEND_SECRET = secretOf('resend')
const INBOUND = 'replies@inbound.example.test'
const ADDRESS: InboundAddress = { local: 'replies', domain: 'inbound.example.test' }
const CARD = ['4111', '1111', '1111', '1111'].join(' ')

let t: TestDatabase
let app: FastifyInstance
const reader = new FakeInboundReader()
const staff = {} as Record<StaffRole, { id: string; cookie: string; csrf: string }>

const settings = readProviderSettings({
  HANDYHUB_ENV: 'ci',
  BIRD_WEBHOOK_SECRET: BIRD_SECRET,
  RESEND_WEBHOOK_SECRET: RESEND_SECRET,
  INBOUND_EMAIL_ADDRESS: INBOUND,
})

type Submitted = { reference: string; projectId: string; contactId: string; customerId: string }
let ip = 10
let n = 0
async function submit(contact: { fullName: string; email: string; phone: string }): Promise<Submitted> {
  const future = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10)
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/public/requests',
    headers: { 'idempotency-key': `synthetic-inbox-${randomUUID()}`, 'x-forwarded-for': `198.51.100.${++ip}` },
    payload: {
      formVersion: 'test-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-01' }],
      notSure: false,
      description: 'Synthetic inbox request: a small drywall dent.',
      property: {
        street: `${++n} Synthetic Inbox Way`,
        zip: '40000',
        city: 'Testville',
        state: 'KY',
        propertyType: 'house',
      },
      timing: { preferredDate: future, flexible: false, needHelpToday: false, windows: ['any_time'] },
      estimatePreference: 'let_handyhub_decide',
      contact: { ...contact, preferredChannel: 'email' },
      smsOptIn: false,
      marketingOptIn: false,
    },
  })
  expect(res.statusCode, res.body).toBe(201)
  const reference = res.json<{ reference: string }>().reference
  const r = await t.db
    .selectFrom('intake.requests')
    .select(['project_id', 'contact_id', 'customer_id'])
    .where('reference', '=', reference)
    .executeTakeFirstOrThrow()
  return { reference, projectId: r.project_id, contactId: r.contact_id, customerId: r.customer_id }
}

/** Marks a contact's email or phone verified (the verification flow itself is TSK-0033's). */
async function verify(contactId: string, what: 'email' | 'phone') {
  await sql`UPDATE crm.contacts SET ${sql.raw(
    what === 'email'
      ? "email_verification = 'verified', email_verified_value = lower(email)"
      : "phone_verification = 'verified', phone_verified_value = phone_e164",
  )} WHERE id = ${contactId}`.execute(t.db)
}

const REF_CHARS = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
/** A second open project for the same customer (synthetic; projects are otherwise created by submissions). */
async function secondProject(of: Submitted): Promise<{ id: string; reference: string }> {
  const reference = `HH-${Array.from({ length: 8 }, () => REF_CHARS[Math.floor(Math.random() * 32)]).join('')}`
  const row = await sql<{ id: string }>`
    INSERT INTO crm.projects (reference, customer_id, property_id, state, payment_term, payment_term_version)
    SELECT ${reference}, customer_id, property_id, 'open', payment_term, payment_term_version FROM crm.projects
    WHERE id = ${of.projectId} RETURNING id`.execute(t.db)
  return { id: (row.rows[0] as { id: string }).id, reference }
}

let hook = 0
function signed(secret: string, body: object, over: { id?: string; ts?: number } = {}) {
  const raw = JSON.stringify(body)
  const id = over.id ?? `msg_inbox_${++hook}`
  const ts = over.ts ?? Math.floor(Date.now() / 1000)
  return {
    headers: {
      'content-type': 'application/json',
      'webhook-id': id,
      'webhook-timestamp': String(ts),
      'webhook-signature': signWebhook(secret, id, ts, raw),
    },
    payload: raw,
  }
}
const post = (provider: 'bird' | 'resend', d: ReturnType<typeof signed>) =>
  app.inject({ method: 'POST', url: `/webhooks/${provider}`, headers: d.headers, payload: d.payload })

let sms = 0
const smsIn = (from: string, text: string, extra: Record<string, unknown> = {}) => ({
  type: 'sms.received',
  timestamp: new Date().toISOString(),
  data: { sms_id: `sms_in_${++sms}_${randomUUID()}`, from, to: '+15025550199', text, ...extra },
})
let em = 0
const emailIn = (
  from: string,
  to: string[],
  over: {
    text?: string
    subject?: string
    messageId?: string
    headers?: Record<string, string>
    attachments?: unknown[]
  } = {},
) => ({
  type: 'email.received',
  created_at: new Date().toISOString(),
  data: {
    email_id: `em-in-${++em}-${randomUUID()}`,
    from,
    to,
    cc: [],
    bcc: [],
    received_for: [],
    subject: over.subject ?? 'Synthetic inbound subject',
    message_id: over.messageId ?? `<synthetic-${em}-${randomUUID()}@mail.example.test>`,
    attachments: over.attachments ?? [],
    // The fake reader returns what the provider's read would (local and ci only).
    text: over.text ?? 'Synthetic inbound body.',
    headers: over.headers ?? {},
  },
})

const intake = (deps: Partial<Parameters<typeof inboxIntakeAutomation>[0]> = {}): Automation =>
  inboxIntakeAutomation({ inboundEmail: reader, replyAddress: ADDRESS, ...deps })
async function drain(automations: Automation[] = [intake(), deliveryStatusAutomation()]) {
  const w = createWorker({ db: t.db, registry: createAutomationRegistry(automations) })
  for (let i = 0; i < 20; i++) {
    const r = await w.runOnce()
    if (r.dispatched + r.succeeded + r.retried + r.failed + r.cancelled === 0) return
  }
}
const messageOfReceipt = async (deliveryId: string) => {
  const r = await t.db
    .selectFrom('platform.webhook_receipts')
    .select(['id', 'linked_message_id'])
    .where('delivery_id', '=', deliveryId)
    .executeTakeFirstOrThrow()
  return t.db.selectFrom('comms.messages').selectAll().where('webhook_receipt_id', '=', r.id).executeTakeFirst()
}
async function deliver(provider: 'bird' | 'resend', body: object) {
  const d = signed(provider === 'bird' ? BIRD_SECRET : RESEND_SECRET, body)
  const res = await post(provider, d)
  expect(res.statusCode, res.body).toBe(200)
  await drain()
  const m = await messageOfReceipt(d.headers['webhook-id'])
  if (!m) throw new Error('no message stored')
  return m
}

const get = (role: StaffRole, url: string) =>
  app.inject({ method: 'GET', url: `/api/v1${url}`, headers: { cookie: staff[role].cookie } })
function write(role: StaffRole, url: string, payload: Record<string, unknown>, version?: number) {
  return app.inject({
    method: 'POST',
    url: `/api/v1${url}`,
    headers: {
      cookie: staff[role].cookie,
      'x-csrf-token': staff[role].csrf,
      'idempotency-key': `synthetic-inbox-write-${randomUUID()}`,
      ...(version === undefined ? {} : { 'if-match': `"${version}"` }),
    },
    payload,
  })
}
const openItems = (type: string, subjectId: string) =>
  t.db
    .selectFrom('ops.queue_items')
    .select(['id', 'reason', 'reference', 'project_id'])
    .where('type', '=', type)
    .where('subject_id', '=', subjectId)
    .where('resolved_at', 'is', null)
    .execute()

beforeAll(async () => {
  t = await createTestDatabase()
  await syncServices(t.db, loadServiceSeed())
  app = await buildApp({
    config: testConfig({ TRUST_PROXY_HOPS: '1' }),
    api: { db: t.db, storage: new FakeObjectStorage(), system: { providers: settings } },
  })
  await registerWebhookRoutes(app, { db: t.db, secrets: settings.webhookSecrets, trustProxyHops: 1 })
  const hash = await hashPassword(pw)
  for (const role of ROLES) {
    const id = await withTx(t.db, async (tx) => {
      const user = await createStaffUser(tx, {
        email: `${role}-inbox@example.test`,
        displayName: `Synthetic Inbox ${role}`,
        locale: 'en',
        role,
        issuedBy: 'test',
      })
      await setPasswordHash(tx, user.id, hash)
      return user.id
    })
    const res = await signInWithMfa(app, {
      method: 'POST',
      url: '/api/v1/staff/auth/sign-in',
      payload: { email: `${role}-inbox@example.test`, password: pw },
    })
    expect(res.statusCode).toBe(200)
    const cookie = String(res.headers['set-cookie']).split(';')[0] as string
    const session = await app.inject({ method: 'GET', url: '/api/v1/staff/auth/session', headers: { cookie } })
    staff[role] = { id, cookie, csrf: session.json<{ csrfToken: string }>().csrfToken }
  }
})
afterAll(async () => {
  await app?.close()
  await t?.drop()
})

describe('verified, replay-safe, de-duplicated inbound webhooks (TSK-0049, HH-COM-10)', () => {
  it('[HH-COM-10][ENT-WebhookReceipt] a replayed webhook is ignored: one receipt, one message', async () => {
    const body = smsIn('+15025550401', 'Synthetic: is Tuesday still fine?')
    const d = signed(BIRD_SECRET, body)
    expect((await post('bird', d)).json()).toEqual({ status: 'accepted' })
    await drain()
    // The same delivery again (a provider retry or a captured replay inside the tolerance) and the same SMS under a
    // new delivery ID: both acknowledged, neither adds anything.
    expect((await post('bird', d)).json()).toEqual({ status: 'duplicate' })
    expect((await post('bird', signed(BIRD_SECRET, body))).json()).toEqual({ status: 'duplicate' })
    await drain()
    const smsId = (body.data as { sms_id: string }).sms_id
    const messages = await t.db
      .selectFrom('comms.messages')
      .select('id')
      .where('provider_message_id', '=', smsId)
      .execute()
    expect(messages).toHaveLength(1)
    const receipts = await t.db
      .selectFrom('platform.webhook_receipts')
      .select(['state', 'linked_message_id'])
      .where('provider_message_id', '=', smsId)
      .execute()
    expect(receipts).toEqual([{ state: 'processed', linked_message_id: messages[0]?.id }])
  })

  it('[HH-COM-10] bad signatures, stale timestamps and oversized payloads are rejected and store nothing', async () => {
    const before = await t.db
      .selectFrom('platform.webhook_receipts')
      .select(({ fn }) => fn.countAll().as('n'))
      .executeTakeFirst()
    const wrong = signed(secretOf('other'), smsIn('+15025550402', 'Synthetic'))
    const stale = signed(BIRD_SECRET, smsIn('+15025550402', 'Synthetic'), { ts: Math.floor(Date.now() / 1000) - 301 })
    const tampered = signed(RESEND_SECRET, emailIn('a@example.test', [INBOUND]))
    tampered.payload = tampered.payload.replace('a@example.test', 'b@example.test')
    expect((await post('bird', wrong)).statusCode).toBe(401)
    expect((await post('bird', stale)).statusCode).toBe(401)
    expect((await post('resend', tampered)).statusCode).toBe(401)
    const big = signed(BIRD_SECRET, smsIn('+15025550402', 'x'.repeat(70_000)))
    expect((await post('bird', big)).statusCode).toBe(413)
    const after = await t.db
      .selectFrom('platform.webhook_receipts')
      .select(({ fn }) => fn.countAll().as('n'))
      .executeTakeFirst()
    expect(after?.n).toBe(before?.n)
  })

  it('[HH-COM-10] the endpoints are rate-limited per client network', async () => {
    const small = Fastify()
    await registerWebhookRoutes(small, {
      db: t.db,
      secrets: settings.webhookSecrets,
      rateLimit: { limit: 2, windowSeconds: 60 },
    })
    const unsigned = { 'content-type': 'application/json' }
    const codes: number[] = []
    for (let i = 0; i < 3; i++)
      codes.push(
        (await small.inject({ method: 'POST', url: '/webhooks/bird', headers: unsigned, payload: '{}' })).statusCode,
      )
    expect(codes).toEqual([401, 401, 429])
    await small.close()
  })

  it('[HH-COM-10][T71] a channel without its signing secret is "Inbound not configured" and never receives', async () => {
    const bare = await buildApp({
      config: testConfig(),
      api: { db: t.db, system: { providers: readProviderSettings({ HANDYHUB_ENV: 'ci' }) } },
    })
    await registerWebhookRoutes(bare, { db: t.db, secrets: { bird: null, resend: null } })
    const res = await bare.inject({
      method: 'POST',
      url: '/webhooks/resend',
      ...signed(RESEND_SECRET, emailIn('someone@example.test', [INBOUND])),
    })
    expect(res.statusCode).toBe(503)
    expect(res.json()).toEqual({ error: 'inbound_not_configured' })
    const owner = await signInWithMfa(bare, {
      method: 'POST',
      url: '/api/v1/staff/auth/sign-in',
      payload: { email: 'owner-inbox@example.test', password: pw },
    })
    const cookie = String(owner.headers['set-cookie']).split(';')[0] as string
    const status = await bare.inject({ method: 'GET', url: '/api/v1/staff/inbox/status', headers: { cookie } })
    expect(status.json()).toMatchObject({
      sms: { provider: 'bird', inbound: 'not_configured' },
      email: { provider: 'resend', inbound: 'not_configured', replyTokens: 'not_configured' },
    })
    await bare.close()

    const configured = await get('office', '/staff/inbox/status')
    expect(configured.json()).toMatchObject({
      sms: { inbound: 'configured' },
      email: { inbound: 'configured', bodyReading: 'fake', replyTokens: 'configured' },
    })
  })
})

describe('matching by reliable references, never names (TSK-0049, HH-COM-07, HH-COM-01)', () => {
  it('[HH-COM-07][HH-COM-01] a reply token threads to its project, linked to the customer and the sending contact', async () => {
    const s = await submit({
      fullName: 'Avery Synthetic Token',
      email: 'token-49@example.test',
      phone: '(502) 555-0411',
    })
    const token = await withTx(t.db, (tx) => projectReplyToken(tx, s.projectId))
    const m = await deliver('resend', emailIn('Token-49@Example.test', [replyAddress(ADDRESS, token)]))
    expect(m).toMatchObject({
      link_state: 'matched',
      match_rule: 'reply_token',
      project_id: s.projectId,
      customer_id: s.customerId,
      contact_id: s.contactId,
      body_text: 'Synthetic inbound body.',
      body_state: 'received',
    })
    const conv = await t.db
      .selectFrom('comms.conversations')
      .selectAll()
      .where('id', '=', m.conversation_id)
      .executeTakeFirstOrThrow()
    expect(conv).toMatchObject({ project_id: s.projectId, audience: 'customer' })
    expect(await openItems('customer_replied', conv.id)).toEqual([
      expect.objectContaining({ reason: 'customer_replied', reference: s.reference, project_id: s.projectId }),
    ])
    // The thread shows it with its sender contact; staff mark the reply handled, which resolves the queue item.
    const thread = await get('office', `/staff/inbox/conversations/${conv.id}`)
    expect(thread.statusCode, thread.body).toBe(200)
    expect(thread.json()).toMatchObject({
      project: { reference: s.reference },
      awaitingReply: true,
      messages: [{ channel: 'email', author: { kind: 'contact', id: s.contactId }, body: 'Synthetic inbound body.' }],
      internal: { messages: [] },
    })
    const list = await get('office', '/staff/inbox/conversations?limit=100')
    expect(list.json<{ items: { id: string; awaitingReply: boolean }[] }>().items).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: conv.id, awaitingReply: true })]),
    )
    const handled = await write('office', `/staff/inbox/conversations/${conv.id}/handled`, {})
    expect(handled.statusCode, handled.body).toBe(200)
    expect(handled.json()).toMatchObject({ resolved: true })
    expect(await openItems('customer_replied', conv.id)).toEqual([])

    // A later reply naming that email in In-Reply-To threads by reference too.
    const next = await deliver(
      'resend',
      emailIn('token-49@example.test', [INBOUND], { headers: { 'in-reply-to': m.email_message_id as string } }),
    )
    expect(next).toMatchObject({ link_state: 'matched', match_rule: 'thread_reference', project_id: s.projectId })
  })

  it('[HH-COM-07] a token whose sender is not on the project waits in Needs Linking with the project as a suggestion', async () => {
    const s = await submit({
      fullName: 'Blair Synthetic Forward',
      email: 'forward-49@example.test',
      phone: '(502) 555-0412',
    })
    const token = await withTx(t.db, (tx) => projectReplyToken(tx, s.projectId))
    const m = await deliver('resend', emailIn('stranger-49@example.test', [replyAddress(ADDRESS, token)]))
    expect(m).toMatchObject({
      link_state: 'needs_linking',
      needs_linking_reason: 'sender_not_on_project',
      project_id: null,
      customer_id: null,
      suggested_project_id: s.projectId,
    })
  })

  it('[HH-COM-07][T21] an ambiguous sender goes to Needs Linking; nothing reaches either customer', async () => {
    const a = await submit({
      fullName: 'Casey Synthetic Landlord',
      email: 'shared-49@example.test',
      phone: '(502) 555-0413',
    })
    const b = await submit({
      fullName: 'Drew Synthetic Tenant',
      email: 'shared-49@example.test',
      phone: '(502) 555-0414',
    })
    await verify(a.contactId, 'email')
    await verify(b.contactId, 'email')
    const m = await deliver(
      'resend',
      emailIn('shared-49@example.test', [INBOUND], { text: 'Synthetic: which visit is mine?' }),
    )
    expect(m).toMatchObject({ link_state: 'needs_linking', needs_linking_reason: 'shared_contact', project_id: null })
    expect(
      await t.db
        .selectFrom('comms.conversations')
        .select('id')
        .where('project_id', 'in', [a.projectId, b.projectId])
        .execute(),
    ).toEqual([])
    expect(await openItems('inbox_needs_linking', m.id)).toEqual([
      expect.objectContaining({ reason: 'message_needs_linking', reference: null, project_id: null }),
    ])
    // Office sees it with both projects as candidates (suggestions, never links); other roles are refused.
    const list = await get('office', '/staff/inbox/needs-linking?limit=100')
    expect(list.statusCode).toBe(200)
    expect(list.json<{ items: { id: string; reason: string }[] }>().items).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: m.id, reason: 'shared_contact' })]),
    )
    const detail = await get('office', `/staff/inbox/messages/${m.id}`)
    expect(detail.json<{ candidates: { reference: string; verifiedContact: boolean }[] }>().candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reference: a.reference, verifiedContact: true }),
        expect.objectContaining({ reference: b.reference, verifiedContact: true }),
      ]),
    )
    for (const role of ['estimator', 'worker'] as const) {
      expect((await get(role, '/staff/inbox/needs-linking')).statusCode).toBe(403)
      expect((await get(role, `/staff/inbox/messages/${m.id}`)).statusCode).toBe(403)
      expect(
        (await write(role, `/staff/inbox/messages/${m.id}/link`, { projectReference: a.reference, reason: 'x' }, 1))
          .statusCode,
      ).toBe(403)
    }
  })

  it('[HH-COM-07] a verified email matches one open project; with several open projects it waits for staff', async () => {
    const s = await submit({
      fullName: 'Emery Synthetic Verified',
      email: 'verified-49@example.test',
      phone: '(502) 555-0415',
    })
    await verify(s.contactId, 'email')
    expect(await deliver('resend', emailIn('verified-49@example.test', [INBOUND]))).toMatchObject({
      link_state: 'matched',
      match_rule: 'verified_email',
      project_id: s.projectId,
    })
    await secondProject(s)
    expect(await deliver('resend', emailIn('verified-49@example.test', [INBOUND]))).toMatchObject({
      link_state: 'needs_linking',
      needs_linking_reason: 'several_projects',
    })
    // An unverified address never matches on its own, and a name never does.
    const u = await submit({
      fullName: 'Finley Synthetic Unverified',
      email: 'unverified-49@example.test',
      phone: '(502) 555-0416',
    })
    expect(
      await deliver(
        'resend',
        emailIn('unverified-49@example.test', [INBOUND], { subject: `Re: Finley Synthetic Unverified ${u.reference}` }),
      ),
    ).toMatchObject({
      link_state: 'needs_linking',
      needs_linking_reason: 'no_match',
    })
  })

  it('[HH-COM-07][HH-COM-05] a text matches by the verified phone; a STOP is kept and withdraws the SMS opt-in', async () => {
    const s = await submit({
      fullName: 'Gray Synthetic Texter',
      email: 'texter-49@example.test',
      phone: '(502) 555-0417',
    })
    await verify(s.contactId, 'phone')
    const text = await deliver('bird', smsIn('+15025550417', 'Synthetic: running 10 minutes late?'))
    expect(text).toMatchObject({
      link_state: 'matched',
      match_rule: 'verified_phone',
      project_id: s.projectId,
      channel: 'sms',
    })
    await withTx(t.db, (tx) =>
      recordConsent(tx, {
        purpose: 'transactional_sms',
        channel: 'sms',
        destination: '+15025550417',
        granted: true,
        source: 'request_form',
        disclosureVersion: 'synthetic-disclosure-1',
        recordedBy: 'customer:contact-synthetic',
      }),
    )
    const stop = await deliver('bird', smsIn('+15025550417', 'STOP'))
    expect(stop).toMatchObject({ keyword: 'stop', link_state: 'matched', project_id: s.projectId })
    expect(await currentConsent(t.db, 'sms', '+15025550417', 'transactional_sms')).toBe('withdrawn')
    // A keyword opens no second "customer replied" item; the conversation's one item stays.
    expect(await openItems('customer_replied', stop.conversation_id as string)).toHaveLength(1)
    // An unknown number is Needs Linking.
    expect(await deliver('bird', smsIn('+15025550499', 'Synthetic: who is this?'))).toMatchObject({
      link_state: 'needs_linking',
      needs_linking_reason: 'no_match',
    })
  })

  it('[HH-COM-07][T71] an email body that cannot be read is kept as not retrieved, never invented', async () => {
    const s = await submit({
      fullName: 'Harper Synthetic Body',
      email: 'body-49@example.test',
      phone: '(502) 555-0418',
    })
    const token = await withTx(t.db, (tx) => projectReplyToken(tx, s.projectId))
    const to = [replyAddress(ADDRESS, token)]
    const fast = (a: Automation): Automation => ({ ...a, retry: { maxAttempts: 2, baseDelayMs: 1, maxDelayMs: 1 } })
    reader.script(
      { outcome: 'retryable_error', errorCode: 'http_503' },
      { outcome: 'retryable_error', errorCode: 'http_503' },
    )
    const d = signed(
      RESEND_SECRET,
      emailIn('body-49@example.test', to, {
        attachments: [{ id: 'att-1', filename: 'synthetic.pdf', content_type: 'application/pdf' }],
      }),
    )
    await post('resend', d)
    for (let i = 0; i < 4; i++) {
      await drain([fast(intake())])
      await new Promise((r) => setTimeout(r, 5))
    }
    expect(await messageOfReceipt(d.headers['webhook-id'])).toMatchObject({
      body_state: 'retrieval_failed',
      body_text: null,
      link_state: 'matched',
      attachments: [{ contentType: 'application/pdf', size: null }],
    })
    const none = signed(RESEND_SECRET, emailIn('body-49@example.test', to))
    await post('resend', none)
    await drain([intake({ inboundEmail: null })])
    expect(await messageOfReceipt(none.headers['webhook-id'])).toMatchObject({
      body_state: 'not_retrieved',
      body_text: null,
    })
  })

  it('[HH-COM-10] an event on an unsupported channel is flagged, never shown as a message', async () => {
    const d = signed(BIRD_SECRET, {
      type: 'whatsapp.received',
      timestamp: new Date().toISOString(),
      data: { whatsapp_id: 'wa_synthetic_1' },
    })
    await post('bird', d)
    await drain()
    expect(await messageOfReceipt(d.headers['webhook-id'])).toBeUndefined()
    const r = await t.db
      .selectFrom('platform.webhook_receipts')
      .select('state')
      .where('delivery_id', '=', d.headers['webhook-id'])
      .executeTakeFirstOrThrow()
    expect(r.state).toBe('ignored')
    expect(
      (await get('owner', '/staff/inbox/status')).json<{ unsupported: { count: number } }>().unsupported.count,
    ).toBeGreaterThanOrEqual(1)
  })
})

describe('linking corrections, internal conversations and scope (TSK-0049, HH-COM-07, HH-COM-01, T24, T68, T74)', () => {
  it('[HH-COM-07][T74] staff link a Needs Linking message with a reason; the original stays unchanged and audited', async () => {
    const s = await submit({
      fullName: 'Indy Synthetic Linked',
      email: 'linked-49@example.test',
      phone: '(502) 555-0419',
    })
    const m = await deliver(
      'resend',
      emailIn('linked-49-other@example.test', [INBOUND], { text: 'Synthetic: from my work address.' }),
    )
    expect(m.link_state).toBe('needs_linking')
    const stale = await write(
      'office',
      `/staff/inbox/messages/${m.id}/link`,
      { projectReference: s.reference, reason: 'Called the customer' },
      7,
    )
    expect(stale.statusCode).toBe(409)
    expect(stale.json()).toMatchObject({ error: { code: 'STALE_VERSION', current: { version: 1 } } })
    const res = await write(
      'office',
      `/staff/inbox/messages/${m.id}/link`,
      { projectReference: s.reference, reason: 'Confirmed by phone: the customer’s work address' },
      1,
    )
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json()).toMatchObject({ version: 2, linkState: 'linked', project: { reference: s.reference } })
    const after = await t.db.selectFrom('comms.messages').selectAll().where('id', '=', m.id).executeTakeFirstOrThrow()
    expect(after).toMatchObject({
      link_state: 'linked',
      match_rule: 'staff',
      project_id: s.projectId,
      customer_id: s.customerId,
      // The work address is no contact of this customer, so no sender contact is recorded (none is created).
      contact_id: null,
      body_text: m.body_text,
      from_address: m.from_address,
    })
    expect(await openItems('inbox_needs_linking', m.id)).toEqual([])
    const detail = (await get('owner', `/staff/inbox/messages/${m.id}`)).json<{
      history: { toState: string; rule: string; reason: string | null; staff: { id: string } | null }[]
    }>()
    expect(detail.history.map((h) => [h.toState, h.rule, h.reason, h.staff?.id ?? null])).toEqual([
      ['needs_linking', 'no_match', null, null],
      ['linked', 'staff', 'Confirmed by phone: the customer’s work address', staff.office.id],
    ])
    // The received message itself can never be changed or deleted, not even by the database owner.
    await expect(sql`UPDATE comms.messages SET body_text = 'changed' WHERE id = ${m.id}`.execute(t.db)).rejects.toThrow(
      /MESSAGE_IMMUTABLE/,
    )
    await expect(sql`DELETE FROM comms.messages WHERE id = ${m.id}`.execute(t.db)).rejects.toThrow(/never deleted/)
    await expect(
      sql`UPDATE comms.message_links SET reason = 'x' WHERE message_id = ${m.id}`.execute(t.db),
    ).rejects.toThrow()
    // Returning it to Needs Linking is a correction too.
    const back = await write(
      'owner',
      `/staff/inbox/messages/${m.id}/link`,
      { projectReference: null, reason: 'Wrong customer after all' },
      2,
    )
    expect(back.statusCode, back.body).toBe(200)
    expect(back.json()).toMatchObject({ version: 3, linkState: 'needs_linking', project: null })
    expect(await openItems('inbox_needs_linking', m.id)).toHaveLength(1)
    // The audit trail names the correction, never the address or the text (T74).
    const events = await t.db
      .selectFrom('platform.audit_events')
      .selectAll()
      .where('target_id', '=', m.id)
      .orderBy('seq')
      .execute()
    expect(events.map((e) => e.action)).toEqual([
      'inbox.message_received',
      'inbox.message_linked',
      'inbox.message_linked',
    ])
    const dump = JSON.stringify(events)
    expect(dump).not.toContain('linked-49-other')
    expect(dump).not.toContain('from my work address')
  })

  it('[HH-COM-01][T24][T68] internal messages stay separate; customers and other scopes reach nothing', async () => {
    const s = await submit({
      fullName: 'Jules Synthetic Internal',
      email: 'internal-49@example.test',
      phone: '(502) 555-0420',
    })
    const token = await withTx(t.db, (tx) => projectReplyToken(tx, s.projectId))
    const inbound = await deliver('resend', emailIn('internal-49@example.test', [replyAddress(ADDRESS, token)]))
    const note = await write('office', `/staff/inbox/projects/${s.projectId}/internal-messages`, {
      body: 'Synthetic internal: bring the long ladder.',
    })
    expect(note.statusCode, note.body).toBe(201)
    expect(
      (await write('office', `/staff/inbox/projects/${s.projectId}/internal-messages`, { body: `Card ${CARD}` }))
        .statusCode,
    ).toBe(400)
    const thread = (await get('owner', `/staff/inbox/conversations/${inbound.conversation_id}`)).json<{
      messages: { body: string }[]
      internal: { id: string; messages: { body: string; author: { kind: string; id: string } }[] }
    }>()
    expect(thread.messages.map((x) => x.body)).not.toContain('Synthetic internal: bring the long ladder.')
    expect(thread.internal.messages).toEqual([
      expect.objectContaining({
        body: 'Synthetic internal: bring the long ladder.',
        author: expect.objectContaining({ kind: 'staff', id: staff.office.id }),
      }),
    ])
    // The internal conversation is never a customer conversation: it is not listed and not opened as one.
    expect((await get('owner', `/staff/inbox/conversations/${thread.internal.id}`)).statusCode).toBe(404)
    const listed = (await get('owner', '/staff/inbox/conversations?limit=100')).json<{ items: { id: string }[] }>()
      .items
    expect(listed.map((i) => i.id)).not.toContain(thread.internal.id)

    // A verified customer of this very project calls the staff inbox routes: refused, nothing returned.
    const session = await withTx(t.db, (tx) =>
      startCustomerSession(tx, {
        contactRef: s.contactId,
        via: 'grant',
        projectIds: [s.projectId],
        verifiedAt: new Date(),
      }),
    )
    const customer = { cookie: `__Host-hh_customer=${session.token}` }
    for (const url of [
      '/staff/inbox/conversations',
      `/staff/inbox/conversations/${inbound.conversation_id}`,
      '/staff/inbox/needs-linking',
      `/staff/inbox/messages/${inbound.id}`,
      '/staff/inbox/status',
    ]) {
      const r = await app.inject({ method: 'GET', url: `/api/v1${url}`, headers: customer })
      expect([401, 403, 404]).toContain(r.statusCode)
      expect(r.body).not.toContain('Synthetic')
    }
    // An Estimator's own threads are not recorded yet: the list is empty and a thread is refused; a Worker has no inbox.
    const est = await get('estimator', '/staff/inbox/conversations')
    expect(est.statusCode).toBe(200)
    expect(est.json()).toEqual({ items: [], nextCursor: null })
    expect((await get('estimator', `/staff/inbox/conversations/${inbound.conversation_id}`)).statusCode).toBe(403)
    expect((await get('worker', '/staff/inbox/conversations')).statusCode).toBe(403)
    // An altered or unknown ID finds nothing.
    expect((await get('owner', `/staff/inbox/conversations/${randomUUID()}`)).statusCode).toBe(404)
    expect((await get('owner', `/staff/inbox/messages/${randomUUID()}`)).statusCode).toBe(404)
  })

  it('[HH-COM-07][T66] a project email replies to its token address, and a retried release still sends once', async () => {
    const s = await submit({
      fullName: 'Kai Synthetic Outbound',
      email: 'outbound-49@example.test',
      phone: '(502) 555-0421',
    })
    // A staff-released draft (TSK-0121, TSK-0091: the appointment and unpaid-invoice reminders are automatic now).
    await withTx(t.db, (tx) =>
      releaseTemplateVersion(tx, {
        messageKey: 'reminder.repeat_service',
        channel: 'email',
        locale: 'en',
        subject: 'Synthetic test subject',
        body: 'Synthetic test body {projectLink}',
        translationReview: 'source',
        sourceIds: ['TSK-0049'],
        releasedBy: 'staff-synthetic-owner',
      }),
    )
    const p = createProviders(settings)
    if (!p.email || !p.fakes.email) throw new Error('ci uses the fakes')
    const release = releaseAutomation({ email: p.email, sms: null, replyAddress: ADDRESS })
    const config = await loadConfig(t.db)
    const { id } = await withTx(t.db, (tx) =>
      createDraft(tx, {
        config,
        messageKey: 'reminder.repeat_service',
        destination: { channel: 'email', destination: 'outbound-49@example.test', permission: 'preferred' },
        recipient: { kind: 'customer_contact', id: s.contactId, destinations: [] },
        subjectKey: `invoice:${s.projectId}`,
        record: { type: 'invoice', id: `i-${s.projectId}` },
        values: { projectLink: 'https://handyhub247.example/p/synthetic' },
        projectId: s.projectId,
      }),
    )
    await withTx(t.db, (tx) =>
      releaseDraft(tx, {
        config,
        deliveryId: id,
        actor: { kind: 'staff', id: staff.office.id, roles: ['office'] },
        automation: release,
        requestId: `req-inbox-${randomUUID()}`,
        now: new Date('2026-10-01T15:00:00Z'),
      }),
    )
    await drain([release])
    await drain([release])
    const token = await withTx(t.db, (tx) => projectReplyToken(tx, s.projectId))
    expect(p.fakes.email.sent).toHaveLength(1)
    expect(p.fakes.email.sent[0]?.replyTo).toBe(`replies+${token}@inbound.example.test`)
    // The project's conversation lists the delivery as metadata (no text).
    const reply = await deliver('resend', emailIn('outbound-49@example.test', [replyAddress(ADDRESS, token)]))
    const thread = (await get('office', `/staff/inbox/conversations/${reply.conversation_id}`)).json<{
      deliveries: { id: string; messageKey: string }[]
    }>()
    expect(thread.deliveries).toEqual([expect.objectContaining({ id, messageKey: 'reminder.repeat_service' })])
  })
})

describe('the inbox follows reviewed merges (TSK-0049 with TSK-0046; HH-COM-07, HH-COM-01, HH-CRM-04, T21)', () => {
  it('[HH-COM-07][HH-CRM-04][T21] a merged record never matches; its conversations show under the survivor and its projects count there', async () => {
    const a = await submit({
      fullName: 'Harper Synthetic Survivor',
      email: 'merge-49@example.test',
      phone: '(502) 555-0431',
    })
    const b = await submit({
      fullName: 'Harper Synthetic Duplicate',
      email: 'merge-49@example.test',
      phone: '(502) 555-0432',
    })
    await verify(a.contactId, 'email')
    await verify(b.contactId, 'email')
    // Before the merge: a reply token threads to the duplicate's project; the shared address alone is ambiguous.
    const token = await withTx(t.db, (tx) => projectReplyToken(tx, b.projectId))
    const threaded = await deliver('resend', emailIn('merge-49@example.test', [replyAddress(ADDRESS, token)]))
    expect(threaded).toMatchObject({
      link_state: 'matched',
      match_rule: 'reply_token',
      project_id: b.projectId,
      customer_id: b.customerId,
    })
    expect(await deliver('resend', emailIn('merge-49@example.test', [INBOUND]))).toMatchObject({
      link_state: 'needs_linking',
      needs_linking_reason: 'shared_contact',
    })

    // Office merges the duplicate into the survivor, from the preview and with a reason (TSK-0046).
    const preview = await get('office', `/staff/customers/${b.customerId}/merge-preview?into=${a.customerId}`)
    expect(preview.statusCode, preview.body).toBe(200)
    const merged = await write('office', `/staff/customers/${b.customerId}/merge`, {
      survivorId: a.customerId,
      reason: 'Same synthetic person sent two requests',
      previewDigest: preview.json<{ previewDigest: string }>().previewDigest,
    })
    expect(merged.statusCode, merged.body).toBe(200)

    // The conversation keeps its project and its customer (a link, never a move); staff see it under the survivor.
    const conv = await t.db
      .selectFrom('comms.conversations')
      .select(['id', 'customer_id', 'project_id'])
      .where('id', '=', threaded.conversation_id as string)
      .executeTakeFirstOrThrow()
    expect(conv).toMatchObject({ customer_id: b.customerId, project_id: b.projectId })
    const thread = await get('office', `/staff/inbox/conversations/${conv.id}`)
    expect(thread.statusCode, thread.body).toBe(200)
    expect(thread.json()).toMatchObject({ project: { reference: b.reference }, customer: { id: a.customerId } })
    const list = await get('office', '/staff/inbox/conversations?limit=100')
    expect(list.json<{ items: { id: string; customer: { id: string } }[] }>().items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: conv.id, customer: expect.objectContaining({ id: a.customerId }) }),
      ]),
    )
    const message = await get('office', `/staff/inbox/messages/${threaded.id}`)
    expect(message.json()).toMatchObject({ project: { reference: b.reference }, customer: { id: a.customerId } })

    // The merged record's contact never matches, so the address is no longer shared; but the survivor now has two
    // open projects (its own and the merged record's), so the message waits for staff.
    expect(await deliver('resend', emailIn('merge-49@example.test', [INBOUND]))).toMatchObject({
      link_state: 'needs_linking',
      needs_linking_reason: 'several_projects',
    })
    // A reply token to the merged record's project is not attached on its own: its contacts never match.
    expect(await deliver('resend', emailIn('merge-49@example.test', [replyAddress(ADDRESS, token)]))).toMatchObject({
      link_state: 'needs_linking',
      needs_linking_reason: 'sender_not_on_project',
      suggested_project_id: b.projectId,
    })
    // With only the merged record's project open, the survivor's address is suggested for it, never attached.
    await sql`UPDATE crm.projects SET state = 'closed' WHERE id = ${a.projectId}`.execute(t.db)
    expect(await deliver('resend', emailIn('merge-49@example.test', [INBOUND]))).toMatchObject({
      link_state: 'needs_linking',
      needs_linking_reason: 'sender_not_on_project',
      suggested_project_id: b.projectId,
    })
    // With only the survivor's own project open, it matches as before.
    await sql`UPDATE crm.projects SET state = 'open' WHERE id = ${a.projectId}`.execute(t.db)
    await sql`UPDATE crm.projects SET state = 'closed' WHERE id = ${b.projectId}`.execute(t.db)
    expect(await deliver('resend', emailIn('merge-49@example.test', [INBOUND]))).toMatchObject({
      link_state: 'matched',
      match_rule: 'verified_email',
      project_id: a.projectId,
      customer_id: a.customerId,
      contact_id: a.contactId,
    })
  })
})

describe('the staff notice of a customer reply: assigned, authorized, grouped (TSK-0120, OWN-DEC-151 staff_customer_replied, OWN-DEC-152 scenario G)', () => {
  const noticeProviders = createProviders(readProviderSettings({ HANDYHUB_ENV: 'ci' }))
  const notices = async () => {
    const w = createWorker({
      db: t.db,
      registry: createAutomationRegistry([
        replyStaffNoticeAutomation({
          providers: { email: noticeProviders.email, sms: null },
          publicSiteUrl: undefined,
          staffAppUrl: 'https://staff.example.test',
        }),
      ]),
    })
    for (let i = 0; i < 5; i++) await w.runOnce()
  }
  const mailFor = (reference: string) =>
    (noticeProviders.fakes.email?.sent ?? []).filter((m) => m.subject.includes(reference))

  it('[HH-COM-06][OWN-DEC-152] one notice per open reply item, to the assigned staff member only; handled, the next reply notifies again', async () => {
    const s = await submit({
      fullName: 'Blake Synthetic Grouped',
      email: 'grouped-120@example.test',
      phone: '(502) 555-0412',
    })
    await sql`UPDATE crm.projects SET responsible_staff_id = ${staff.office.id} WHERE id = ${s.projectId}`.execute(t.db)
    const token = await withTx(t.db, (tx) => projectReplyToken(tx, s.projectId))
    const first = await deliver('resend', emailIn('grouped-120@example.test', [replyAddress(ADDRESS, token)]))
    await deliver('resend', emailIn('grouped-120@example.test', [replyAddress(ADDRESS, token)]))
    await notices()
    const sent = mailFor(s.reference)
    // Grouped: two messages while the "customer replied" item stays open, one notice.
    expect(sent.map((m) => [m.to, m.subject])).toEqual([
      ['office-inbox@example.test', `HandyHub Staff | Customer Replied to #${s.reference}`],
    ])
    expect(sent[0]?.text).toContain('Customer: Blake Synthetic Grouped')
    const request = await t.db
      .selectFrom('intake.requests')
      .select('id')
      .where('project_id', '=', s.projectId)
      .executeTakeFirstOrThrow()
    expect(sent[0]?.text).toContain(`https://staff.example.test/requests/${request.id}`)
    // Never the message itself.
    expect(sent[0]?.text).not.toContain('Synthetic inbound body.')
    await notices()
    expect(mailFor(s.reference)).toHaveLength(1)
    // Staff mark it handled; the next message opens a new item and notifies once more.
    const handled = await write('office', `/staff/inbox/conversations/${first.conversation_id}/handled`, {})
    expect(handled.statusCode, handled.body).toBe(200)
    await deliver('resend', emailIn('grouped-120@example.test', [replyAddress(ADDRESS, token)]))
    await notices()
    expect(mailFor(s.reference)).toHaveLength(2)
  })

  it('[RULE-SERVER-AUTHZ] nobody is assigned, or the assigned account is not active: no notice, the queue item is the notice', async () => {
    const s = await submit({
      fullName: 'Casey Synthetic Unassigned',
      email: 'unassigned-120@example.test',
      phone: '(502) 555-0413',
    })
    const token = await withTx(t.db, (tx) => projectReplyToken(tx, s.projectId))
    const m = await deliver('resend', emailIn('unassigned-120@example.test', [replyAddress(ADDRESS, token)]))
    await notices()
    expect(mailFor(s.reference)).toEqual([])
    expect(await openItems('customer_replied', m.conversation_id as string)).toHaveLength(1)
  })
})
