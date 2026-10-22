// Staff replies, the daily contact hours and the portal Messages tab against PostgreSQL 16 and the provider fakes
// (TSK-0050; HH-COM-08, HH-COM-09, HH-COM-02, HH-COM-03, HH-COM-05, HH-PORT-08, HH-LEAD-05, T65, T66,
// RULE-SERVER-AUTHZ). Every staff member, customer, address, number and message here is synthetic and built at runtime
// (RULE-SYNTHETIC-DATA); nothing reaches a real provider.
import { randomUUID } from 'node:crypto'
import { loadServiceSeed, syncServices, withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import type { StaffRole } from '@handyhub/policy'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { startCustomerSession } from '../../src/modules/identity/customer-sessions.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import {
  inboxModule,
  replyFailureItem,
  replyRecordCheck,
  replyValues,
  type InboundAddress,
} from '../../src/modules/inbox/index.js'
import { apiModules } from '../../src/modules/index.js'
import {
  createDraft,
  deliveryStatusAutomation,
  recordConsent,
  releaseAutomation,
  releaseDraft,
  releaseTemplateVersion,
} from '../../src/modules/notifications/index.js'
import { responseClockAutomation } from '../../src/modules/requests/response-clock.js'
import { createAutomationRegistry, type Automation } from '../../src/platform/automation.js'
import { recordWebhookReceipt } from '../../src/providers/webhooks.js'
import { loadConfig } from '../../src/platform/config/index.js'
import { createWorker } from '../../src/platform/jobs.js'
import { runWithContext } from '../../src/platform/request-context.js'
import { createProviders } from '../../src/providers/index.js'
import { readProviderSettings } from '../../src/providers/settings.js'
import { testConfig } from '../fixtures/env.js'
import { signInWithMfa, TEST_MFA_KEY } from '../fixtures/staff-mfa.js'

const ROLES: readonly StaffRole[] = ['owner', 'office', 'estimator', 'worker']
const pw = ['synthetic', 'replies', 'passphrase', '50'].join(' ')
const CARD = ['4111', '1111', '1111', '1111'].join(' ')
const ADDRESS: InboundAddress = { local: 'replies', domain: 'inbound.example.test' }
/** TSK-0120: the synthetic public site the portal links point at. */
const SITE = 'https://site.example.test'
const settings = readProviderSettings({ HANDYHUB_ENV: 'ci', INBOUND_EMAIL_ADDRESS: 'replies@inbound.example.test' })
const providers = createProviders(settings)
if (!providers.email || !providers.sms || !providers.fakes.email || !providers.fakes.sms)
  throw new Error('ci uses the fakes')
const fakeEmail = providers.fakes.email
const fakeSms = providers.fakes.sms

// The business clock of the reply routes. 23:00 and 10:00 in Louisville (EST, UTC-5) on 14-15 January 2026: in the
// past, so a job scheduled at that instant runs at once; the 8 AM opening after 11 PM is in the past too, and a held
// job is kept from running by moving its run time into the future (the worker runs what is due by the real clock).
const ELEVEN_PM = new Date('2026-01-15T04:00:00Z')
const NEXT_EIGHT_AM = new Date('2026-01-15T13:00:00Z')
const TEN_AM = new Date('2026-01-15T15:00:00Z')
let clock = TEN_AM

let t: TestDatabase
let app: FastifyInstance
const staff = {} as Record<StaffRole, { id: string; cookie: string; csrf: string }>

const fast = (a: Automation): Automation => ({ ...a, retry: { maxAttempts: 2, baseDelayMs: 1, maxDelayMs: 1 } })
const release = fast(
  releaseAutomation(
    { email: providers.email, sms: providers.sms, replyAddress: ADDRESS },
    // TSK-0120: the reply email's values are read from the reply at send time.
    { recordChecks: { project: replyRecordCheck }, failureItem: replyFailureItem, values: replyValues(SITE) },
  ),
)
async function drain(automations: Automation[] = [release]) {
  const w = createWorker({ db: t.db, registry: createAutomationRegistry(automations) })
  for (let i = 0; i < 20; i++) {
    const r = await w.runOnce()
    if (r.dispatched + r.succeeded + r.retried + r.failed + r.cancelled === 0) return
    await new Promise((res) => setTimeout(res, 5))
  }
}

type Submitted = { reference: string; projectId: string; contactId: string; requestId: string }
let ip = 10
let n = 0
async function submit(
  email: string,
  phone: string,
  over: { preferredChannel?: 'email' | 'text' | 'call'; smsOptIn?: boolean } = {},
): Promise<Submitted> {
  const future = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10)
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/public/requests',
    headers: { 'idempotency-key': `synthetic-replies-${randomUUID()}`, 'x-forwarded-for': `198.51.100.${++ip}` },
    payload: {
      formVersion: 'test-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-01' }],
      notSure: false,
      description: 'Synthetic reply request: a small drywall dent.',
      property: {
        street: `${++n} Synthetic Reply Way`,
        zip: '40000',
        city: 'Testville',
        state: 'KY',
        propertyType: 'house',
      },
      timing: { preferredDate: future, flexible: false, needHelpToday: false, windows: ['any_time'] },
      estimatePreference: 'let_handyhub_decide',
      contact: { fullName: 'Rae Synthetic Reply', email, phone, preferredChannel: over.preferredChannel ?? 'email' },
      smsOptIn: over.smsOptIn ?? false,
      ...(over.smsOptIn ? { smsDisclosureVersion: 'sms-disclosure-1' } : {}),
      marketingOptIn: false,
    },
  })
  expect(res.statusCode, res.body).toBe(201)
  const reference = res.json<{ reference: string }>().reference
  const r = await t.db
    .selectFrom('intake.requests')
    .select(['id', 'project_id', 'contact_id'])
    .where('reference', '=', reference)
    .executeTakeFirstOrThrow()
  return { reference, projectId: r.project_id, contactId: r.contact_id, requestId: r.id }
}

/** Marks a contact's email or phone verified (the verification flow itself is TSK-0033's). */
async function verify(contactId: string, what: 'email' | 'phone') {
  await sql`UPDATE crm.contacts SET ${sql.raw(
    what === 'email'
      ? "email_verification = 'verified', email_verified_value = lower(email)"
      : "phone_verification = 'verified', phone_verified_value = phone_e164",
  )} WHERE id = ${contactId}`.execute(t.db)
}
const optIn = (phone: string, granted = true) =>
  withTx(t.db, (tx) =>
    recordConsent(tx, {
      purpose: 'transactional_sms',
      channel: 'sms',
      destination: phone,
      granted,
      source: granted ? 'staff_recorded' : 'sms_keyword',
      recordedBy: granted ? 'staff-synthetic-office' : 'system:test',
    }),
  )

const get = (role: StaffRole, url: string) =>
  app.inject({ method: 'GET', url: `/api/v1${url}`, headers: { cookie: staff[role].cookie } })
function write(role: StaffRole, url: string, payload: Record<string, unknown>, key: string = randomUUID()) {
  return app.inject({
    method: 'POST',
    url: `/api/v1${url}`,
    headers: {
      cookie: staff[role].cookie,
      'x-csrf-token': staff[role].csrf,
      'idempotency-key': `synthetic-replies-write-${key}`,
    },
    payload,
  })
}
const reply = (role: StaffRole, p: Submitted, body: string, channel: 'email' | 'sms', key?: string) =>
  write(role, `/staff/inbox/projects/${p.projectId}/replies`, { body, channel }, key)
type Options = {
  defaultChannel: string | null
  options: { channel: string; available: boolean; reason: string; preferred: boolean; destination: string }[]
  contactHours: { state: string; applies: boolean; sendAt: string; open: string | null; zone: string | null }
  templates: { email: string; sms: string }
}
const options = async (p: Submitted, role: StaffRole = 'office') => {
  const res = await get(role, `/staff/inbox/projects/${p.projectId}/reply-options`)
  expect(res.statusCode, res.body).toBe(200)
  return res.json<Options>()
}
const deliveryOf = (id: string) =>
  t.db.selectFrom('platform.message_deliveries').selectAll().where('id', '=', id).executeTakeFirstOrThrow()
const jobsOf = (deliveryId: string) =>
  t.db
    .selectFrom('platform.jobs')
    .select(['id', 'state', 'run_at'])
    .where('target_type', '=', 'message_delivery')
    .where('target_id', '=', deliveryId)
    .orderBy('created_at')
    .execute()
/** Keeps a held job from running before its opening: the worker runs what is due by the real clock. */
const holdUntilOpening = (deliveryId: string) =>
  sql`UPDATE platform.jobs SET run_at = now() + interval '1 day' WHERE target_id = ${deliveryId}
    AND state = 'queued'`.execute(t.db)
/** The contact hours begin: the held job is due now. */
const opening = (deliveryId: string) =>
  sql`UPDATE platform.jobs SET run_at = now() WHERE target_id = ${deliveryId} AND state = 'queued'`.execute(t.db)
const openItems = (type: string, subjectId: string) =>
  t.db
    .selectFrom('ops.queue_items')
    .select(['id', 'reason', 'reference', 'project_id'])
    .where('type', '=', type)
    .where('subject_id', '=', subjectId)
    .where('resolved_at', 'is', null)
    .execute()
async function customerCookie(p: Submitted) {
  const s = await withTx(t.db, (tx) =>
    startCustomerSession(tx, {
      contactRef: p.contactId,
      via: 'grant',
      projectIds: [p.projectId],
      verifiedAt: new Date(),
    }),
  )
  return `__Host-hh_customer=${s.token}`
}
const releaseReplyTemplates = () =>
  withTx(t.db, async (tx) => {
    // Synthetic wording for the tests only: the real reply wording is the owner's (OQ-STAFF-REPLY-WORDING).
    for (const channel of ['email', 'sms'] as const)
      await releaseTemplateVersion(tx, {
        messageKey: 'staff.reply',
        channel,
        locale: 'en',
        subject: channel === 'email' ? 'Synthetic test reply subject' : null,
        body: 'Synthetic test reply: {replyText}',
        translationReview: 'source',
        sourceIds: ['TSK-0050'],
        releasedBy: 'staff-synthetic-owner',
      })
  })

beforeAll(async () => {
  t = await createTestDatabase()
  await syncServices(t.db, loadServiceSeed())
  const modules = apiModules({ secureCookies: false, mfaKey: TEST_MFA_KEY, system: { providers: settings } }).map(
    (m) => (m.name === 'inbox' ? inboxModule({ providers: settings, now: () => clock }) : m),
  )
  app = await buildApp({ config: testConfig({ TRUST_PROXY_HOPS: '1' }), api: { db: t.db, modules } })
  const hash = await hashPassword(pw)
  for (const role of ROLES) {
    const id = await withTx(t.db, async (tx) => {
      const user = await createStaffUser(tx, {
        email: `${role}-replies@example.test`,
        displayName: `Synthetic Replies ${role}`,
        locale: role === 'office' ? 'es' : 'en',
        role,
        issuedBy: 'test',
      })
      await setPasswordHash(tx, user.id, hash)
      return user.id
    })
    const res = await signInWithMfa(app, {
      method: 'POST',
      url: '/api/v1/staff/auth/sign-in',
      payload: { email: `${role}-replies@example.test`, password: pw },
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

describe('the reply channel: preferred and permitted, never switched silently (TSK-0050, HH-COM-08, OWN-DEC-120)', () => {
  it('[HH-COM-08][HH-COM-05] an unverified address, a missing opt-in and an opt-out are not permitted; the preferred channel is the default', async () => {
    const p = await submit('replies-channels@example.test', '(502) 555-0501')
    let o = await options(p)
    expect(o.options.map((x) => [x.channel, x.available, x.reason, x.preferred])).toEqual([
      ['email', false, 'unverified', true],
      ['sms', false, 'no_opt_in', false],
    ])
    expect(o.defaultChannel).toBeNull()
    // No permitted channel: nothing can be sent, and nothing was written.
    expect((await reply('office', p, 'Synthetic reply.', 'email')).json()).toMatchObject({
      error: { code: 'CONFLICT', fieldErrors: [{ code: 'NO_PERMITTED_CHANNEL' }] },
    })
    await verify(p.contactId, 'email')
    o = await options(p)
    expect(o.defaultChannel).toBe('email')
    expect(o.options[0]).toMatchObject({ destination: 'replies-channels@example.test', available: true })
    // Having a number is never permission to text: verified, but no opt-in.
    await verify(p.contactId, 'phone')
    expect((await options(p)).options[1]).toMatchObject({ available: false, reason: 'no_opt_in' })
    await optIn('+15025550501')
    expect((await options(p)).options[1]).toMatchObject({ available: true, reason: 'available' })
    // While the preferred channel is permitted, another one is refused: no silent switch.
    expect((await reply('office', p, 'Synthetic reply.', 'sms')).json()).toMatchObject({
      error: { code: 'CONFLICT', fieldErrors: [{ code: 'PREFERRED_CHANNEL_AVAILABLE' }] },
    })
    await optIn('+15025550501', false)
    expect((await options(p)).options[1]).toMatchObject({ available: false, reason: 'opted_out' })
    expect(
      await t.db.selectFrom('comms.messages').select('id').where('project_id', '=', p.projectId).execute(),
    ).toEqual([])
  })

  it('[HH-COM-08] the preferred channel unavailable: staff choose another permitted one; an unavailable one is refused', async () => {
    const p = await submit('replies-fallback@example.test', '(502) 555-0502', {
      preferredChannel: 'text',
      smsOptIn: true,
    })
    await verify(p.contactId, 'email')
    await verify(p.contactId, 'phone')
    expect((await options(p)).defaultChannel).toBe('sms')
    // The customer texts STOP: the preferred channel is no longer permitted.
    await optIn('+15025550502', false)
    const o = await options(p)
    expect(o.options.find((x) => x.preferred)).toMatchObject({ channel: 'sms', available: false, reason: 'opted_out' })
    // Staff must choose: the server never picks the other channel on its own.
    expect(o.defaultChannel).toBeNull()
    expect((await reply('office', p, 'Synthetic fallback.', 'sms')).json()).toMatchObject({
      error: { fieldErrors: [{ code: 'CHANNEL_UNAVAILABLE' }] },
    })
    const sent = await reply('office', p, 'Synthetic fallback.', 'email')
    expect(sent.statusCode, sent.body).toBe(201)
    const d = await deliveryOf(sent.json<{ delivery: { id: string } }>().delivery.id)
    expect([d.channel, d.channel_permission, d.release, d.state]).toEqual([
      'email',
      'permitted',
      'staff_released',
      'queued',
    ])
  })
})

describe('Send is the release; the delivery is truthful (TSK-0050, HH-COM-08, HH-COM-02, T66)', () => {
  it('[HH-COM-08][HH-COM-02][OWN-DEC-151][TSK-0120] the reply email is the owner wording with the text as written; a rejected send is a delivery issue whose Retry sends once', async () => {
    clock = TEN_AM
    const p = await submit('replies-unconfigured@example.test', '(502) 555-0503')
    await verify(p.contactId, 'email')
    // The email wording is the owner's staff_reply_wrapper with its values supplied; texts have none (A2P 10DLC).
    expect((await options(p)).templates).toEqual({ email: 'configured', sms: 'not_configured' })
    // Earlier tests' released replies go first, so the scripted answer is this reply's own.
    await drain()
    // The provider rejects the first send.
    fakeEmail.script({ outcome: 'rejected', errorCode: 'http_422_validation_error' })
    const res = await reply('owner', p, 'Synthetic reply in the owner wording.', 'email')
    expect(res.statusCode, res.body).toBe(201)
    const out = res.json<{ id: string; conversationId: string; delivery: { id: string; sendAt: string } }>()
    expect(out.delivery.sendAt).toBe(TEN_AM.toISOString())
    await drain()
    expect(fakeEmail.sent.filter((c) => c.to === 'replies-unconfigured@example.test')).toEqual([])
    const d = await deliveryOf(out.delivery.id)
    expect([d.state, d.error_code]).toEqual(['failed', 'http_422_validation_error'])
    // A staff exception with Retry on the project (HH-COM-02), and the reply itself is in the conversation at once.
    expect(await openItems('delivery_failed', d.id)).toEqual([
      expect.objectContaining({ reason: 'delivery_failed', reference: p.reference, project_id: p.projectId }),
    ])
    const thread = (await get('owner', `/staff/inbox/conversations/${out.conversationId}`)).json<{
      messages: {
        id: string
        direction: string
        body: string
        author: { kind: string; name: string }
        delivery: unknown
      }[]
      deliveries: unknown[]
    }>()
    expect(thread.messages).toEqual([
      expect.objectContaining({
        id: out.id,
        direction: 'outbound',
        body: 'Synthetic reply in the owner wording.',
        author: expect.objectContaining({ kind: 'staff', name: 'Synthetic Replies owner' }),
        delivery: { id: d.id, state: 'failed', errorCode: 'http_422_validation_error', sendAt: null, retry: true },
      }),
    ])
    // The reply is listed on itself, not again among the project's notifications.
    expect(thread.deliveries).toEqual([])

    // Retry sends it once, in the owner's wording.
    const retried = await write('owner', `/staff/message-deliveries/${d.id}/retry`, {})
    expect(retried.statusCode, retried.body).toBe(200)
    expect((await write('owner', `/staff/message-deliveries/${d.id}/retry`, {})).statusCode).toBe(409)
    // The retry is released again at the reply's release time (by the real clock: outside the contact hours it
    // waits for the opening); here the opening has come.
    await opening(d.id)
    await drain()
    const mails = fakeEmail.sent.filter((m) => m.to === 'replies-unconfigured@example.test')
    expect(mails).toHaveLength(1)
    expect(mails[0]?.subject).toBe(`HandyHub | New Message About Your Project #${p.reference}`)
    expect(mails[0]?.text).toMatch(/^Hi Rae,\n\nYou have a new message from the HandyHub team/)
    expect(mails[0]?.text).toContain('Message from Synthetic Replies owner:\n\nSynthetic reply in the owner wording.')
    expect(mails[0]?.text).toContain(`${SITE}/portal/p/${p.reference}`)
    expect(mails[0]?.replyTo).toMatch(/^replies\+[a-z2-7]{20}@inbound\.example\.test$/)
    expect((await deliveryOf(d.id)).provider_message_id).toBe(mails[0]?.providerMessageId)
    expect(await openItems('delivery_failed', d.id)).toEqual([])
    // Later tests use a synthetic wording of their own.
    await releaseReplyTemplates()
  })

  it('[T66][HH-COM-03][HH-COM-02] a Spanish-locale staff reply goes out in the English template; a retried Send and a retried job send one message', async () => {
    clock = TEN_AM
    const p = await submit('replies-retry@example.test', '(502) 555-0504')
    await verify(p.contactId, 'email')
    const key = randomUUID()
    // The Office account uses Spanish; the customer content language is English whatever the sender's interface.
    const first = await reply('office', p, 'Synthetic: we can come Tuesday.', 'email', key)
    expect(first.statusCode, first.body).toBe(201)
    // The same submission again (a timeout and a retry): the stored answer, nothing new.
    const again = await reply('office', p, 'Synthetic: we can come Tuesday.', 'email', key)
    expect(again.statusCode).toBe(201)
    expect(again.headers['idempotent-replayed']).toBe('true')
    expect(again.json()).toEqual(first.json())
    const id = first.json<{ delivery: { id: string } }>().delivery.id
    const d = await deliveryOf(id)
    expect([d.locale, d.message_key, d.released_by]).toEqual(['en', 'staff.reply', staff.office.id])
    // The provider times out once; the job retries with the same provider key, and one email is sent.
    fakeEmail.script({ outcome: 'retryable_error', errorCode: 'timeout' })
    await drain()
    const mails = fakeEmail.calls.filter((m) => m.to === 'replies-retry@example.test')
    expect(mails).toHaveLength(2)
    expect(new Set(mails.map((m) => m.idempotencyKey)).size).toBe(1)
    expect(fakeEmail.sent.filter((m) => m.to === 'replies-retry@example.test')).toHaveLength(1)
    expect(mails[0]?.subject).toBe('Synthetic test reply subject')
    expect(
      await t.db.selectFrom('comms.messages').select('id').where('project_id', '=', p.projectId).execute(),
    ).toHaveLength(1)
    // The audit event names the project and channel, never the text.
    const audit = await t.db
      .selectFrom('platform.audit_events')
      .select(['summary', 'actor_id'])
      .where('action', '=', 'inbox.reply_sent')
      .where('target_id', '=', first.json<{ id: string }>().id)
      .execute()
    expect(audit).toHaveLength(1)
    expect(JSON.stringify(audit[0]?.summary)).not.toContain('Tuesday')
  })

  it('[HH-COM-08] card numbers are refused; another project is NOT_FOUND; a Worker has no inbox', async () => {
    const p = await submit('replies-refusals@example.test', '(502) 555-0505')
    await verify(p.contactId, 'email')
    expect((await reply('office', p, `Synthetic card ${CARD}`, 'email')).json()).toMatchObject({
      error: { code: 'VALIDATION_FAILED', fieldErrors: [{ code: 'card_number' }] },
    })
    // An Estimator's own threads are not recorded yet: no project is in their scope.
    expect((await reply('estimator', p, 'Synthetic.', 'email')).statusCode).toBe(403)
    expect((await get('estimator', `/staff/inbox/projects/${p.projectId}/reply-options`)).statusCode).toBe(403)
    expect((await reply('worker', p, 'Synthetic.', 'email')).statusCode).toBe(403)
    expect((await get('office', `/staff/inbox/projects/${randomUUID()}/conversation`)).statusCode).toBe(404)
    expect(
      await t.db.selectFrom('comms.messages').select('id').where('project_id', '=', p.projectId).execute(),
    ).toEqual([])
  })
})

describe('daily contact hours (TSK-0050, HH-COM-09, FACT-HOURS, FACT-TIMEZONE, T65)', () => {
  it('[HH-COM-09][T65] a reply sent at 11 PM waits for 8 AM; the customer reads it on the project at once', async () => {
    clock = ELEVEN_PM
    const p = await submit('replies-hours@example.test', '(502) 555-0506')
    await verify(p.contactId, 'email')
    const o = await options(p)
    expect(o.contactHours).toMatchObject({
      state: 'closed',
      applies: true,
      open: '08:00',
      zone: 'America/Kentucky/Louisville',
      sendAt: NEXT_EIGHT_AM.toISOString(),
    })
    const res = await reply('office', p, 'Synthetic late reply.', 'email')
    expect(res.statusCode, res.body).toBe(201)
    const out = res.json<{ delivery: { id: string; sendAt: string; heldForContactHours: boolean } }>().delivery
    expect(out).toMatchObject({ sendAt: NEXT_EIGHT_AM.toISOString(), heldForContactHours: true })
    expect((await jobsOf(out.id)).map((j) => [j.state, j.run_at.toISOString()])).toEqual([
      ['queued', NEXT_EIGHT_AM.toISOString()],
    ])
    await holdUntilOpening(out.id)
    await drain()
    expect(fakeEmail.calls.filter((c) => c.to === 'replies-hours@example.test')).toEqual([])
    expect((await deliveryOf(out.id)).state).toBe('queued')
    // The staff view says when it goes; the portal already shows the reply.
    const conversation = (await get('office', `/staff/inbox/projects/${p.projectId}/conversation`)).json<{
      conversationId: string
    }>().conversationId
    const thread = (await get('office', `/staff/inbox/conversations/${conversation}`)).json<{
      messages: { delivery: { state: string; sendAt: string | null } }[]
    }>()
    expect(thread.messages[0]?.delivery).toMatchObject({ state: 'queued' })
    expect(thread.messages[0]?.delivery.sendAt).not.toBeNull()
    const cookie = await customerCookie(p)
    const tab = await app.inject({
      method: 'GET',
      url: `/api/v1/customer/projects/${p.reference}/messages`,
      headers: { cookie },
    })
    expect(tab.json<{ messages: { text: string }[] }>().messages.map((m) => m.text)).toEqual(['Synthetic late reply.'])
    // The hours begin: rechecked and sent once.
    await opening(out.id)
    await drain()
    await drain()
    expect(fakeEmail.sent.filter((m) => m.to === 'replies-hours@example.test')).toHaveLength(1)
  })

  it('[HH-COM-09][T65][OWN-DEC-132] released at 11 PM: a question reminder queues until 8 AM, an estimate reminder sends at once', async () => {
    const config = await loadConfig(t.db)
    const draft = (messageKey: string, id: string) =>
      withTx(t.db, async (tx) => {
        const { id: deliveryId } = await createDraft(tx, {
          config,
          messageKey,
          destination: { channel: 'email', destination: `${id}@example.test`, permission: 'preferred' },
          recipient: { kind: 'customer_contact', id: `contact-${id}`, destinations: [] },
          subjectKey: `synthetic:${id}`,
          record: { type: 'synthetic_record', id },
          values: { projectLink: 'https://handyhub247.example/p/synthetic' },
        })
        return releaseDraft(tx, {
          config,
          deliveryId,
          actor: { kind: 'staff', id: staff.office.id, roles: ['office'] },
          automation: release,
          requestId: `req-replies-${randomUUID()}`,
          now: ELEVEN_PM,
        })
      })
    expect((await draft('reminder.unanswered_question', 'replies-question')).runAt).toEqual(NEXT_EIGHT_AM)
    expect((await draft('reminder.unanswered_estimate', 'replies-estimate')).runAt).toEqual(ELEVEN_PM)
    // Inside the hours a held reminder goes at once.
    const tenAm = await withTx(t.db, async (tx) => {
      const { id } = await createDraft(tx, {
        config,
        messageKey: 'reminder.unanswered_question',
        destination: { channel: 'email', destination: 'replies-question-2@example.test', permission: 'preferred' },
        recipient: { kind: 'customer_contact', id: 'contact-q2', destinations: [] },
        subjectKey: 'synthetic:replies-question-2',
        record: { type: 'synthetic_record', id: 'q2' },
        values: { projectLink: 'https://handyhub247.example/p/synthetic' },
      })
      return releaseDraft(tx, {
        config,
        deliveryId: id,
        actor: { kind: 'staff', id: staff.office.id, roles: ['office'] },
        automation: release,
        requestId: `req-replies-${randomUUID()}`,
        now: TEN_AM,
      })
    })
    expect(tenAm.runAt).toEqual(TEN_AM)
  })
})

describe('send-time rechecks and the response clock (TSK-0050, HH-COM-05, HH-LEAD-05)', () => {
  it('[HH-COM-05] a STOP after Send suppresses the text; a contact change after Send cancels the email', async () => {
    clock = ELEVEN_PM
    const a = await submit('replies-stop@example.test', '(502) 555-0507', { preferredChannel: 'text', smsOptIn: true })
    await verify(a.contactId, 'phone')
    await optIn('+15025550507')
    const text = await reply('office', a, 'Synthetic text reply.', 'sms')
    expect(text.statusCode, text.body).toBe(201)
    const textId = text.json<{ delivery: { id: string } }>().delivery.id
    const b = await submit('replies-change@example.test', '(502) 555-0508')
    await verify(b.contactId, 'email')
    const mail = await reply('office', b, 'Synthetic email reply.', 'email')
    const mailId = mail.json<{ delivery: { id: string } }>().delivery.id
    await holdUntilOpening(textId)
    await holdUntilOpening(mailId)
    // Overnight: the customer texts STOP, and the other customer's email changes (no longer verified).
    await optIn('+15025550507', false)
    await sql`UPDATE crm.contacts SET email = 'replies-changed@example.test', email_verification = 'unverified'
      WHERE id = ${b.contactId}`.execute(t.db)
    await opening(textId)
    await opening(mailId)
    await drain()
    expect(fakeSms.calls.filter((c) => c.to === '+15025550507')).toEqual([])
    expect(fakeEmail.calls.filter((c) => c.to.startsWith('replies-change'))).toEqual([])
    const [s, m] = [await deliveryOf(textId), await deliveryOf(mailId)]
    expect([s.state, s.error_code]).toEqual(['suppressed', 'sms_opted_out'])
    expect([m.state, m.error_code]).toEqual(['cancelled', 'record_changed'])
    expect(await openItems('delivery_failed', m.id)).toEqual([])
  })

  it('[HH-LEAD-05][HH-COM-01] a reply the provider sent stops the first-response clock; replying handles the waiting customer reply', async () => {
    clock = TEN_AM
    const p = await submit('replies-clock@example.test', '(502) 555-0509')
    await verify(p.contactId, 'email')
    const clockRow = () =>
      t.db
        .selectFrom('intake.response_clocks')
        .select(['stopped_at', 'stop_kind'])
        .where('request_id', '=', p.requestId)
        .executeTakeFirstOrThrow()
    expect((await clockRow()).stopped_at).toBeNull()
    // A waiting "customer replied" item on the conversation.
    const conversationId = await withTx(t.db, async (tx) => {
      const { ensureConversation, customerReplied } = await import('../../src/modules/inbox/conversations.js')
      const id = await ensureConversation(tx, p.projectId, 'customer')
      await customerReplied(tx, id, p.projectId, new Date())
      return id
    })
    expect(await openItems('customer_replied', conversationId)).toHaveLength(1)
    const res = await reply('office', p, 'Synthetic first response.', 'email')
    expect(res.statusCode, res.body).toBe(201)
    expect(await openItems('customer_replied', conversationId)).toEqual([])
    await drain([release, responseClockAutomation()])
    // Handed over is not yet sent (the fake answers "queued"): the clock still runs.
    expect((await clockRow()).stopped_at).toBeNull()
    const id = res.json<{ delivery: { id: string } }>().delivery.id
    const providerMessageId = (await deliveryOf(id)).provider_message_id as string
    await runWithContext({ requestId: `req-replies-${randomUUID()}` }, () =>
      withTx(t.db, (tx) =>
        recordWebhookReceipt(tx, {
          provider: 'resend',
          deliveryId: `evt-replies-${randomUUID()}`,
          eventType: 'email.sent',
          providerMessageId,
          eventOccurredAt: new Date(),
          payload: { type: 'email.sent', data: { email_id: providerMessageId } },
          rawBody: Buffer.from('{}'),
        }),
      ),
    )
    await drain([release, deliveryStatusAutomation(), responseClockAutomation()])
    expect((await deliveryOf(id)).state).toBe('sent')
    expect(await clockRow()).toMatchObject({ stop_kind: 'response_sent' })
  })
})

describe('the portal Messages tab (TSK-0050, C06, HH-PORT-08, RULE-SERVER-AUTHZ)', () => {
  it('[HH-PORT-08][HH-COM-01][T24] the customer reads their own messages and the replies, as written; never internal messages, other senders or staff details', async () => {
    clock = TEN_AM
    const p = await submit('replies-portal@example.test', '(502) 555-0510')
    await verify(p.contactId, 'email')
    const conversationId = await withTx(t.db, async (tx) => {
      const { ensureConversation } = await import('../../src/modules/inbox/conversations.js')
      return ensureConversation(tx, p.projectId, 'customer')
    })
    // The customer's own email (matched to the project) in Spanish, and an email from another sender staff linked.
    const receipt = async (from: string) => {
      const r = await runWithContext({ requestId: `req-replies-${randomUUID()}` }, () =>
        withTx(t.db, (tx) =>
          recordWebhookReceipt(tx, {
            provider: 'resend',
            deliveryId: `evt-portal-${randomUUID()}`,
            eventType: 'email.received',
            providerMessageId: null,
            eventOccurredAt: null,
            payload: { type: 'email.received', data: {} },
            rawBody: Buffer.from(randomUUID()),
          }),
        ),
      )
      return { id: r.id, from }
    }
    const own = 'Hola, ¿pueden venir el martes? Synthetic customer words.'
    for (const [r, text, contact, at] of [
      [await receipt('replies-portal@example.test'), own, p.contactId, '2026-01-14T15:00:00Z'],
      [await receipt('stranger-portal@example.test'), 'Synthetic stranger text.', null, '2026-01-14T16:00:00Z'],
    ] as const)
      await t.db
        .insertInto('comms.messages')
        .values({
          direction: 'inbound',
          channel: 'email',
          webhook_receipt_id: r.id,
          provider: 'resend',
          from_address: r.from,
          body_text: text,
          body_state: 'received',
          received_at: new Date(at),
          link_state: contact ? 'matched' : 'linked',
          match_rule: contact ? 'verified_email' : 'staff',
          project_id: p.projectId,
          customer_id: sql<string>`(SELECT customer_id FROM crm.projects WHERE id = ${p.projectId})`,
          conversation_id: conversationId,
          contact_id: contact,
        })
        .execute()
    const internal = await write('office', `/staff/inbox/projects/${p.projectId}/internal-messages`, {
      body: 'SYNTHETIC-INTERNAL-0050: staff only.',
    })
    expect(internal.statusCode).toBe(201)
    expect((await reply('office', p, 'Synthetic: Tuesday at 9 works.', 'email')).statusCode).toBe(201)
    const cookie = await customerCookie(p)
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/customer/projects/${p.reference}/messages`,
      headers: { cookie },
    })
    expect(res.statusCode, res.body).toBe(200)
    const body = res.json<{ messages: unknown[] }>()
    expect(body.messages).toEqual([
      { from: 'you', channel: 'email', at: '2026-01-14T15:00:00.000Z', text: own, textState: 'shown', attachments: 0 },
      {
        from: 'handyhub',
        channel: 'email',
        at: TEN_AM.toISOString(),
        text: 'Synthetic: Tuesday at 9 works.',
        textState: 'shown',
        attachments: 0,
      },
    ])
    for (const secret of [
      'SYNTHETIC-INTERNAL-0050',
      'Synthetic stranger text.',
      'stranger-portal',
      'replies-portal@example.test',
      'Synthetic Replies',
      staff.office.id,
      p.projectId,
    ])
      expect(res.body).not.toContain(secret)
    // Another project's conversation is the same NOT_FOUND as a missing one (T19).
    const other = await submit('replies-portal-other@example.test', '(502) 555-0511')
    const denied = await app.inject({
      method: 'GET',
      url: `/api/v1/customer/projects/${other.reference}/messages`,
      headers: { cookie },
    })
    expect(denied.statusCode).toBe(404)
  })
})
