// Staff questions, customer replies and no-response handling against PostgreSQL 16 and the provider fakes (TSK-0051;
// HH-LEAD-03, HH-LEAD-06, HH-COM-06, HH-COM-09, HH-COM-05, HH-COM-02, HH-PORT-09, HH-SEC-05, T30, T65, OWN-DEC-98,
// OWN-DEC-101, FACT-REMINDER-CADENCES, FACT-REOPEN-PERIOD, RULE-SERVER-AUTHZ). Every staff member, customer, address,
// number, question and reply here is synthetic and built at runtime (RULE-SYNTHETIC-DATA); nothing reaches a real
// provider.
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
import { replyFailureItem, replyRecordCheck } from '../../src/modules/inbox/index.js'
import { apiModules } from '../../src/modules/index.js'
import {
  deliveryStatusAutomation,
  releaseAutomation,
  releaseTemplateVersion,
} from '../../src/modules/notifications/index.js'
import { photoProcessAutomation } from '../../src/modules/photos/index.js'
import {
  questionAutomations,
  questionRecordCheck,
  questionReminderFailureItem,
  questionsModule,
} from '../../src/modules/questions/index.js'
import { responseClockAutomation } from '../../src/modules/requests/response-clock.js'
import { createAutomationRegistry, type Automation } from '../../src/platform/automation.js'
import { createWorker } from '../../src/platform/jobs.js'
import { runWithContext } from '../../src/platform/request-context.js'
import { recordWebhookReceipt } from '../../src/providers/webhooks.js'
import { createProviders } from '../../src/providers/index.js'
import { readProviderSettings } from '../../src/providers/settings.js'
import { testConfig } from '../fixtures/env.js'
import { bodyOf } from '../fixtures/message-text.js'
import { png } from '../fixtures/images.js'
import { signInWithMfa, TEST_MFA_KEY } from '../fixtures/staff-mfa.js'

const ROLES: readonly StaffRole[] = ['owner', 'office', 'estimator', 'worker']
const pw = ['synthetic', 'questions', 'passphrase', '51'].join(' ')
const CARD = ['4111', '1111', '1111', '1111'].join(' ')
const SITE = 'http://127.0.0.1:4999'
const NOTICE = 'HandyHub has a question about your request. View and reply securely.'
const settings = readProviderSettings({ HANDYHUB_ENV: 'ci' })
const providers = createProviders(settings)
if (!providers.email || !providers.sms || !providers.fakes.email || !providers.fakes.sms || !providers.storage)
  throw new Error('ci uses the fakes')
const fakeEmail = providers.fakes.email
const fakeSms = providers.fakes.sms

// The business clock of the question routes: 10:00 and 23:00 in Louisville (EST, UTC-5), in the past, so a job
// scheduled at that instant runs at once (the worker runs what is due by the real clock).
const TEN_AM = new Date('2026-01-15T15:00:00Z')
const ELEVEN_PM = new Date('2026-01-16T04:00:00Z')
const NEXT_EIGHT_AM = new Date('2026-01-16T13:00:00Z')
let clock = TEN_AM
const HOUR = 3_600_000
const DAY = 24 * HOUR

let t: TestDatabase
let app: FastifyInstance
const staff = {} as Record<StaffRole, { id: string; cookie: string; csrf: string }>
/** Projects the test says have an appointment (an obligation check of the visits module, TSK-0061, stands in). */
const booked = new Set<string>()

const fast = (a: Automation): Automation => ({ ...a, retry: { maxAttempts: 2, baseDelayMs: 1, maxDelayMs: 1 } })
const automations = [
  fast(
    releaseAutomation(
      { email: providers.email, sms: providers.sms },
      {
        recordChecks: { project: replyRecordCheck, question: questionRecordCheck },
        failureItem: async (tx, row) =>
          (await replyFailureItem(tx, row)) ?? (await questionReminderFailureItem(tx, row)),
      },
    ),
  ),
  ...questionAutomations({
    providers: { email: providers.email, sms: providers.sms },
    publicSiteUrl: SITE,
    staffAppUrl: 'http://127.0.0.1:4999/staff',
  }).map(fast),
  fast(responseClockAutomation()),
  fast(photoProcessAutomation(providers.storage)),
  fast(deliveryStatusAutomation()),
]
async function drain() {
  const w = createWorker({ db: t.db, registry: createAutomationRegistry(automations) })
  for (let i = 0; i < 30; i++) {
    const r = await w.runOnce()
    if (r.dispatched + r.succeeded + r.retried + r.failed + r.cancelled === 0) return
    await new Promise((res) => setTimeout(res, 5))
  }
}

type Submitted = { reference: string; projectId: string; contactId: string; requestId: string; email: string }
let ip = 10
let n = 0
async function submit(email: string, phone: string, over: { smsOptIn?: boolean } = {}): Promise<Submitted> {
  const future = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10)
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/public/requests',
    headers: { 'idempotency-key': `synthetic-questions-${randomUUID()}`, 'x-forwarded-for': `198.51.100.${++ip}` },
    payload: {
      formVersion: 'test-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-01' }],
      notSure: false,
      description: 'Synthetic question request: a ceiling patch.',
      property: {
        street: `${++n} Synthetic Question Lane`,
        zip: '40000',
        city: 'Testville',
        state: 'KY',
        propertyType: 'house',
      },
      timing: { preferredDate: future, flexible: false, needHelpToday: false, windows: ['any_time'] },
      estimatePreference: 'let_handyhub_decide',
      contact: { fullName: 'Quinn Synthetic Question', email, phone, preferredChannel: 'email' },
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
  // The office staff member is responsible (the assignment flow is TSK-0042's).
  await sql`UPDATE intake.requests SET responsible_staff_id = ${staff.office.id} WHERE id = ${r.id}`.execute(t.db)
  return { reference, projectId: r.project_id, contactId: r.contact_id, requestId: r.id, email }
}

const get = (role: StaffRole, url: string) =>
  app.inject({ method: 'GET', url: `/api/v1${url}`, headers: { cookie: staff[role].cookie } })
function write(
  role: StaffRole,
  url: string,
  payload: Record<string, unknown>,
  opts: { key?: string; version?: number } = {},
) {
  return app.inject({
    method: 'POST',
    url: `/api/v1${url}`,
    headers: {
      cookie: staff[role].cookie,
      'x-csrf-token': staff[role].csrf,
      'idempotency-key': `synthetic-questions-write-${opts.key ?? randomUUID()}`,
      ...(opts.version === undefined ? {} : { 'if-match': `"${opts.version}"` }),
    },
    payload,
  })
}
const versionOf = async (p: Submitted) =>
  (
    await t.db
      .selectFrom('intake.requests')
      .select('state_version')
      .where('id', '=', p.requestId)
      .executeTakeFirstOrThrow()
  ).state_version
async function publish(
  p: Submitted,
  text: string,
  kind: 'general' | 'measurement' = 'general',
  role: StaffRole = 'office',
  key?: string,
) {
  return write(
    role,
    `/staff/requests/${p.requestId}/questions`,
    { text, kind, noHazardInspection: true },
    { version: await versionOf(p), ...(key ? { key } : {}) },
  )
}
type StaffView = {
  state: string
  version: number
  questions: {
    id: string
    text: string
    state: string
    notice: {
      state: string
      sentAt: string | null
      deliveries: { id: string; state: string; errorCode: string | null; retry: boolean }[]
    }
    reminders: {
      stage: string
      state: string
      dueAt: string | null
      canRelease: boolean
      deliveries: { id: string; state: string }[]
    }[]
    reply: {
      text: string | null
      notSure: boolean
      reopenedRequest: boolean
      photos: { id: string; state: string }[]
    } | null
  }[]
  canPublish: boolean
  repliesWaiting: boolean
  close: { allowed: boolean; available: boolean; reasons: string[]; availableAt: string | null }
  reopen: { days: number | null; closedAt: string | null; until: string | null }
}
const staffView = async (p: Submitted, role: StaffRole = 'office') => {
  const res = await get(role, `/staff/requests/${p.requestId}/questions`)
  expect(res.statusCode, res.body).toBe(200)
  return res.json<StaffView>()
}
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
type CustomerQuestions = {
  questions: {
    id: string
    kind: string
    text: string
    state: string
    canReply: boolean
    reply: {
      text: string | null
      notSure: boolean
      photos: { received: number; processing: number; failed: number }
    } | null
  }[]
  replyWindow: string
  reopenUntil: string | null
}
const customerGet = (cookie: string, url: string) =>
  app.inject({ method: 'GET', url: `/api/v1${url}`, headers: { cookie } })
const customerPost = (
  cookie: string,
  url: string,
  payload: Record<string, unknown>,
  headers: Record<string, string> = {},
) =>
  app.inject({
    method: 'POST',
    url: `/api/v1${url}`,
    headers: { cookie, 'idempotency-key': `synthetic-questions-customer-${randomUUID()}`, ...headers },
    payload,
  })
const questionsOf = async (cookie: string, p: Submitted) => {
  const res = await customerGet(cookie, `/customer/projects/${p.reference}/questions`)
  expect(res.statusCode, res.body).toBe(200)
  return res.json<CustomerQuestions>()
}
const replyTo = (cookie: string, p: Submitted, questionId: string, body: Record<string, unknown>, headers = {}) =>
  customerPost(cookie, `/customer/projects/${p.reference}/questions/${questionId}/replies`, body, headers)
const requestRow = (p: Submitted) =>
  t.db
    .selectFrom('intake.requests as r')
    .innerJoin('crm.projects as pr', 'pr.id', 'r.project_id')
    .select(['r.state', 'pr.state as project_state', 'r.description'])
    .where('r.id', '=', p.requestId)
    .executeTakeFirstOrThrow()
const questionRow = (id: string) =>
  t.db.selectFrom('intake.questions').selectAll().where('id', '=', id).executeTakeFirstOrThrow()
const deliveriesOf = (subject: string) =>
  t.db.selectFrom('platform.message_deliveries').selectAll().where('subject_key', '=', subject).orderBy('seq').execute()
const openItems = (type: string, subjectId: string) =>
  t.db
    .selectFrom('ops.queue_items')
    .select(['id', 'reason', 'reference', 'assigned_staff_id'])
    .where('type', '=', type)
    .where('subject_id', '=', subjectId)
    .where('resolved_at', 'is', null)
    .execute()
const jobsOf = (automation: string, questionId: string) =>
  t.db
    .selectFrom('platform.jobs')
    .select(['id', 'state', 'run_at', 'job_key'])
    .where('automation', '=', automation)
    .where('target_id', '=', questionId)
    .orderBy('job_key')
    .execute()
/** A scheduled job is due now (the worker runs what is due by the real clock). */
const dueNow = (automation: string, questionId: string, key?: string) =>
  sql`UPDATE platform.jobs SET run_at = now() WHERE automation = ${automation} AND target_id = ${questionId}
    AND state = 'queued' ${key ? sql`AND job_key LIKE ${`%${key}`}` : sql``}`.execute(t.db)
/** The provider reports the subject's handed-over deliveries sent (a status webhook): the send is successful now. */
async function reportSent(subject: string) {
  for (const d of await deliveriesOf(subject)) {
    if (!d.provider_message_id || d.state !== 'queued') continue
    const sms = d.channel === 'sms'
    await runWithContext({ requestId: `req-questions-${randomUUID()}` }, () =>
      withTx(t.db, (tx) =>
        recordWebhookReceipt(tx, {
          provider: sms ? 'bird' : 'resend',
          deliveryId: `evt-questions-${randomUUID()}`,
          eventType: sms ? 'sms.sent' : 'email.sent',
          providerMessageId: d.provider_message_id as string,
          eventOccurredAt: new Date(),
          payload: sms
            ? { type: 'sms.sent', data: { sms_id: d.provider_message_id } }
            : { type: 'email.sent', data: { email_id: d.provider_message_id } },
          rawBody: Buffer.from('{}'),
        }),
      ),
    )
  }
  await drain()
}
const releaseReminderWording = () =>
  withTx(t.db, async (tx) => {
    // Synthetic wording for the tests only: the real reminder wording is the owner's (OQ-QUESTION-WORDING).
    for (const channel of ['email', 'sms'] as const)
      await releaseTemplateVersion(tx, {
        messageKey: 'reminder.unanswered_question',
        channel,
        locale: 'en',
        subject: channel === 'email' ? 'Synthetic test reminder subject' : null,
        body: 'Synthetic test reminder: {projectLink}',
        translationReview: 'source',
        sourceIds: ['TSK-0051'],
        releasedBy: 'staff-synthetic-owner',
      })
  })
/** A question whose notice was sent, with both reminder drafts made and the final one sent: ready to close. */
async function throughFinalReminder(p: Submitted, text: string) {
  const res = await publish(p, text)
  expect(res.statusCode, res.body).toBe(201)
  const id = res.json<{ questionId: string }>().questionId
  await drain()
  await reportSent(`question:${id}`)
  await dueNow('questions.reminder_draft', id)
  await drain()
  for (const stage of ['first', 'final']) {
    const r = await write('office', `/staff/requests/${p.requestId}/questions/${id}/reminders/${stage}/release`, {})
    expect(r.statusCode, r.body).toBe(200)
  }
  await drain()
  await reportSent(`question:${id}:first`)
  await reportSent(`question:${id}:final`)
  const q = await questionRow(id)
  expect(q.final_reminder_sent_at).not.toBeNull()
  return { id, finalSentAt: q.final_reminder_sent_at as Date }
}

beforeAll(async () => {
  t = await createTestDatabase()
  await syncServices(t.db, loadServiceSeed())
  const modules = apiModules({
    secureCookies: false,
    mfaKey: TEST_MFA_KEY,
    storage: providers.storage,
    system: { providers: settings },
  }).map((m) =>
    m.name === 'questions'
      ? questionsModule({
          now: () => clock,
          obligationChecks: [{ fact: 'appointmentExists', source: 'test', check: async (_tx, id) => booked.has(id) }],
        })
      : m,
  )
  app = await buildApp({ config: testConfig({ TRUST_PROXY_HOPS: '1' }), api: { db: t.db, modules } })
  const hash = await hashPassword(pw)
  for (const role of ROLES) {
    const id = await withTx(t.db, async (tx) => {
      const user = await createStaffUser(tx, {
        email: `${role}-questions@example.test`,
        displayName: `Synthetic Questions ${role}`,
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
      payload: { email: `${role}-questions@example.test`, password: pw },
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

describe('publishing a question is the release; its notice is automatic (TSK-0051, HH-LEAD-03, OWN-DEC-98)', () => {
  it('[HH-LEAD-03][HH-COM-06][T30] two questions in the same project; one notice each, in the owner wording; retries send nothing more', async () => {
    clock = TEN_AM
    const p = await submit('questions-publish@example.test', '(502) 555-0151')
    // The hazard guard is part of the contract; card numbers are refused.
    const guard = await write(
      'office',
      `/staff/requests/${p.requestId}/questions`,
      { text: 'Synthetic: how tall is the ceiling?', kind: 'measurement' },
      { version: await versionOf(p) },
    )
    expect(guard.statusCode).toBe(400)
    expect((await publish(p, `Synthetic card ${CARD}`)).json()).toMatchObject({
      error: { code: 'VALIDATION_FAILED', fieldErrors: [{ code: 'sensitive_content' }] },
    })
    // A Worker never publishes.
    expect((await publish(p, 'Synthetic worker question.', 'general', 'worker')).statusCode).toBe(403)

    const key = randomUUID()
    const original = await versionOf(p)
    const first = await publish(p, 'Synthetic: how tall is the ceiling?  ', 'measurement', 'office', key)
    expect(first.statusCode, first.body).toBe(201)
    expect(first.json()).toMatchObject({ state: 'needs_information', moved: true })
    // The same submission again: the stored answer, no second question.
    const replay = await write(
      'office',
      `/staff/requests/${p.requestId}/questions`,
      { text: 'Synthetic: how tall is the ceiling?  ', kind: 'measurement', noHazardInspection: true },
      { key, version: original },
    )
    expect(replay.headers['idempotent-replayed']).toBe('true')
    const second = await publish(p, 'Synthetic: please send a photo of the stain.')
    expect(second.statusCode, second.body).toBe(201)
    expect(second.json()).toMatchObject({ state: 'needs_information', moved: false })
    const [q1, q2] = [first.json<{ questionId: string }>().questionId, second.json<{ questionId: string }>().questionId]
    expect(
      await t.db.selectFrom('intake.questions').select('id').where('request_id', '=', p.requestId).execute(),
    ).toHaveLength(2)

    await drain()
    await drain()
    const mails = fakeEmail.sent.filter((m) => m.to === p.email)
    // One notice per question, no private detail, linking to the question through the project's verified access.
    // TSK-0119: the owner-style question_notice wording (the email; texts keep OWN-DEC-98's), with the request reference.
    expect(mails.map((m) => m.subject)).toEqual([
      `HandyHub | We Have a Question About Your Request #${p.reference}`,
      `HandyHub | We Have a Question About Your Request #${p.reference}`,
    ])
    expect(mails.map((m) => bodyOf(m.text).replace(/^Hi [^\n]*,/, 'Hi X,')).sort()).toEqual(
      [q1, q2]
        .map((id) =>
          [
            'Hi X,',
            `HandyHub has a question about your request #${p.reference}.`,
            'You can view the question and reply securely through your project page:',
            `${SITE}/portal/p/${p.reference}#question-${id}`,
            'Your answer helps us move your request to the next step.',
            'The HandyHub Team',
          ].join('\n\n'),
        )
        .sort(),
    )
    expect(mails.some((m) => m.text.includes('ceiling'))).toBe(false)
    // Handed to the provider is not yet sent: no reminder is scheduled until the provider reports the send.
    expect((await staffView(p)).questions.map((q) => q.notice.state)).toEqual(['pending', 'pending'])
    expect(await jobsOf('questions.reminder_draft', q1)).toEqual([])
    await reportSent(`question:${q1}`)
    await reportSent(`question:${q2}`)
    // No text opt-in: no text is sent.
    expect(fakeSms.sent.filter((m) => m.to === '+15025550151')).toEqual([])
    const view = await staffView(p)
    expect(view.questions.map((q) => [q.text, q.state, q.notice.state])).toEqual([
      ['Synthetic: how tall is the ceiling?  ', 'published', 'sent'],
      ['Synthetic: please send a photo of the stain.', 'published', 'sent'],
    ])
    // A successful notice is a meaningful response: the first-response clock stopped (TSK-0043).
    const clockRow = await t.db
      .selectFrom('intake.response_clocks')
      .select(['stopped_at', 'stop_kind'])
      .where('request_id', '=', p.requestId)
      .executeTakeFirstOrThrow()
    expect(clockRow.stop_kind).toBe('response_sent')
    // The reminder clock starts at the notice's successful send: first 24 h, final 48 h after it.
    const sentAt = (await questionRow(q1)).notice_sent_at as Date
    const jobs = await jobsOf('questions.reminder_draft', q1)
    expect(jobs.map((j) => j.run_at.getTime() - sentAt.getTime())).toEqual([48 * HOUR, 24 * HOUR])
    // The audit event never holds the text.
    const audit = await t.db
      .selectFrom('platform.audit_events')
      .select('summary')
      .where('action', '=', 'question.publish')
      .where('target_id', '=', q1)
      .execute()
    expect(audit).toHaveLength(1)
    expect(JSON.stringify(audit[0]?.summary)).not.toContain('ceiling')
  })

  it('[HH-LEAD-03][T30][HH-SEC-05] the customer answers one question with a photo and "I\'m not sure"; the other stays open; history is kept', async () => {
    clock = TEN_AM
    const p = await submit('questions-reply@example.test', '(502) 555-0152')
    const q1 = (await publish(p, 'Synthetic: how wide is the wall?', 'measurement')).json<{ questionId: string }>()
      .questionId
    const q2 = (await publish(p, 'Synthetic: when was it painted?')).json<{ questionId: string }>().questionId
    await drain()
    const cookie = await customerCookie(p)
    let list = await questionsOf(cookie, p)
    expect(list.replyWindow).toBe('open')
    expect(list.questions.map((q) => [q.text, q.kind, q.state, q.canReply])).toEqual([
      ['Synthetic: how wide is the wall?', 'measurement', 'waiting', true],
      ['Synthetic: when was it painted?', 'general', 'waiting', true],
    ])
    // Customers see only their own project's questions: another project's session is NOT_FOUND.
    const other = await submit('questions-other@example.test', '(502) 555-0153')
    const otherCookie = await customerCookie(other)
    expect((await customerGet(otherCookie, `/customer/projects/${p.reference}/questions`)).statusCode).toBe(404)
    expect((await replyTo(otherCookie, p, q1, { text: 'Synthetic intruder.' })).statusCode).toBe(404)
    // A question of another project, under this project's reference, is not found either.
    const foreign = (await publish(other, 'Synthetic other question.')).json<{ questionId: string }>().questionId
    expect((await replyTo(cookie, p, foreign, { text: 'Synthetic.' })).statusCode).toBe(404)

    // Photos: a reply capability, an upload checked like a request photo.
    const up = await customerPost(cookie, `/customer/projects/${p.reference}/questions/${q1}/uploads`, {})
    expect(up.statusCode, up.body).toBe(201)
    const capability = up.json<{ capability: string; limits: { maxPhotos: number } }>().capability
    const photo = await app.inject({
      method: 'POST',
      url: '/api/v1/public/request-drafts/photos',
      headers: { 'upload-capability': capability, 'content-type': 'image/png', 'x-forwarded-for': '198.51.100.250' },
      payload: png(51),
    })
    expect(photo.statusCode, photo.body).toBe(201)
    const photoId = photo.json<{ id: string }>().id
    // "I'm not sure" is for measurements only; card numbers are refused; an empty reply says nothing.
    expect((await replyTo(cookie, p, q2, { notSure: true })).json()).toMatchObject({
      error: { fieldErrors: [{ code: 'not_a_measurement' }] },
    })
    expect((await replyTo(cookie, p, q2, { text: `Synthetic ${CARD}` })).json()).toMatchObject({
      error: { fieldErrors: [{ code: 'sensitive_content' }] },
    })
    expect((await replyTo(cookie, p, q2, { text: '   ' })).json()).toMatchObject({
      error: { code: 'VALIDATION_FAILED', fieldErrors: [{ code: 'empty' }] },
    })
    // A photo of another reply, or without its capability, is never attached by its ID.
    expect((await replyTo(cookie, p, q1, { notSure: true, photoIds: [photoId] })).json()).toMatchObject({
      error: { fieldErrors: [{ code: 'unknown_photo' }] },
    })

    const before = await requestRow(p)
    const answer = '  Synthetic answer: about 12 feet, I think.\n'
    const res = await replyTo(
      cookie,
      p,
      q1,
      { text: answer, notSure: true, photoIds: [photoId] },
      {
        'upload-capability': capability,
      },
    )
    expect(res.statusCode, res.body).toBe(201)
    expect(res.json()).toMatchObject({ questionId: q1, state: 'answered', photos: 1, reopened: false })
    expect((await replyTo(cookie, p, q1, { text: 'Synthetic again.' })).json()).toMatchObject({
      error: { code: 'CONFLICT', fieldErrors: [{ code: 'ALREADY_ANSWERED' }] },
    })
    // The same project: the original submission and the staff decisions stay; the other question stays open.
    const after = await requestRow(p)
    expect(after).toEqual({ ...before, state: 'needs_information' })
    expect(
      await t.db
        .selectFrom('intake.request_decisions')
        .select('action')
        .where('request_id', '=', p.requestId)
        .execute(),
    ).toEqual([{ action: 'ask_question' }])
    list = await questionsOf(cookie, p)
    expect(list.questions.map((q) => [q.state, q.canReply])).toEqual([
      ['answered', false],
      ['waiting', true],
    ])
    expect(list.questions[0]?.reply).toMatchObject({ text: answer, notSure: true })
    const bound = await t.db
      .selectFrom('intake.photos')
      .select(['request_id', 'project_id'])
      .where('id', '=', photoId)
      .executeTakeFirstOrThrow()
    expect(bound).toEqual({ request_id: p.requestId, project_id: p.projectId })
    const view = await staffView(p)
    expect(view.questions[0]?.reply).toMatchObject({ text: answer, notSure: true, photos: [{ id: photoId }] })
    expect(view.repliesWaiting).toBe(true)
    // The assigned staff member is notified: the queue item, and the staff notice (TSK-0120: the owner's
    // staff_customer_replied wording in the staff member's Spanish, with its values; never the reply's text).
    expect(await openItems('question_replied', p.requestId)).toEqual([
      expect.objectContaining({ reason: 'question_replied', assigned_staff_id: staff.office.id }),
    ])
    await drain()
    const notice = await t.db
      .selectFrom('platform.message_deliveries')
      .select(['state', 'error_code', 'destination', 'locale'])
      .where('message_key', '=', 'staff_notice.customer_reply')
      .where('record_id', '=', p.requestId)
      .execute()
    expect(notice).toEqual([
      { state: 'queued', error_code: null, destination: 'office-questions@example.test', locale: 'es' },
    ])
    const staffMailOf = () =>
      (providers.fakes.email?.sent ?? []).filter(
        (m) => m.to === 'office-questions@example.test' && m.subject.includes(p.reference),
      )
    const staffMail = staffMailOf()
    expect(staffMail.map((m) => m.subject)).toEqual([`HandyHub Staff | El cliente respondió a #${p.reference}`])
    expect(staffMail[0]?.text).toContain(`Referencia: ${p.reference}`)
    expect(staffMail[0]?.text).toContain(`http://127.0.0.1:4999/staff/requests/${p.requestId}`)
    expect(staffMail[0]?.text).not.toContain('12 feet')
    // The last open question answered: the request goes back to HandyHub's review. While the reply item stays open,
    // a second reply is grouped with the first: no second notice (TSK-0120, deduplicated and grouped).
    expect((await replyTo(cookie, p, q2, { text: 'Synthetic: last spring.' })).statusCode).toBe(201)
    expect((await requestRow(p)).state).toBe('reviewing')
    await drain()
    expect(staffMailOf()).toHaveLength(1)
    // Reviewing the replies resolves the item.
    expect((await write('office', `/staff/requests/${p.requestId}/questions/replies-reviewed`, {})).json()).toEqual({
      reviewed: true,
    })
    expect(await openItems('question_replied', p.requestId)).toEqual([])
    await drain()
    // The reply's text is never in the audit log.
    const audit = await t.db
      .selectFrom('platform.audit_events')
      .select('summary')
      .where('action', '=', 'question.reply')
      .execute()
    expect(JSON.stringify(audit)).not.toContain('12 feet')
  })
})

describe('unanswered questions: reminders, contact hours and Closed—no response (TSK-0051, HH-LEAD-06, OWN-DEC-101)', () => {
  it('[HH-LEAD-06][T65][HH-COM-02] a failed notice never starts the clock; Retry sends it once and the clock starts then', async () => {
    clock = TEN_AM
    await drain()
    const p = await submit('questions-failed@example.test', '(502) 555-0154')
    fakeEmail.script({ outcome: 'rejected', errorCode: 'synthetic_bounce' })
    const id = (await publish(p, 'Synthetic: is the leak still active?')).json<{ questionId: string }>().questionId
    await drain()
    const [d] = await deliveriesOf(`question:${id}`)
    expect([d?.state, d?.error_code]).toEqual(['failed', 'synthetic_bounce'])
    expect((await questionRow(id)).notice_sent_at).toBeNull()
    expect(await jobsOf('questions.reminder_draft', id)).toEqual([])
    // The question is kept and the failure is a delivery issue with Retry on the request.
    expect(await openItems('delivery_failed', d?.id as string)).toEqual([
      expect.objectContaining({
        reason: 'delivery_failed',
        reference: p.reference,
        assigned_staff_id: staff.office.id,
      }),
    ])
    expect((await staffView(p)).questions[0]?.notice).toMatchObject({ state: 'failed', sentAt: null })
    // Closing is not possible: no reminder was ever sent.
    expect((await staffView(p)).close.reasons).toContain('FINAL_REMINDER_NOT_SENT')
    const retried = await write('office', `/staff/message-deliveries/${d?.id}/retry`, {})
    expect(retried.statusCode, retried.body).toBe(200)
    await drain()
    expect(fakeEmail.sent.filter((m) => m.to === p.email)).toHaveLength(1)
    await reportSent(`question:${id}`)
    const q = await questionRow(id)
    expect(q.notice_sent_at).not.toBeNull()
    expect(await jobsOf('questions.reminder_draft', id)).toHaveLength(2)
  })

  it('[HH-LEAD-06][HH-COM-09][T65] reminder drafts are staff-released: 11 PM waits for 8 AM; no wording means not sent; a reply stops them', async () => {
    clock = TEN_AM
    const p = await submit('questions-reminders@example.test', '(502) 555-0155', { smsOptIn: true })
    const id = (await publish(p, 'Synthetic: which room is it?')).json<{ questionId: string }>().questionId
    await drain()
    await reportSent(`question:${id}`)
    // The notice went by email and, with the opt-in, by text.
    expect(fakeSms.sent.filter((m) => m.to === '+15025550155').map((m) => m.text)).toEqual([
      `${NOTICE} ${SITE}/portal/p/${p.reference}#question-${id}`,
    ])
    // Not due yet: nothing is drafted. Due: the first drafts appear, prominently in the queue.
    expect((await staffView(p)).questions[0]?.reminders.map((r) => r.state)).toEqual(['scheduled', 'scheduled'])
    await dueNow('questions.reminder_draft', id, ':first')
    await drain()
    const drafts = await deliveriesOf(`question:${id}:first`)
    expect(drafts.map((d) => [d.channel, d.state, d.release])).toEqual([
      ['email', 'draft', 'staff_released'],
      ['sms', 'draft', 'staff_released'],
    ])
    expect(await openItems('question_reminder', p.requestId)).toEqual([
      expect.objectContaining({ reason: 'question_reminder_first', assigned_staff_id: staff.office.id }),
    ])
    let view = await staffView(p)
    expect(view.questions[0]?.reminders[0]).toMatchObject({ stage: 'first', state: 'draft', canRelease: true })
    // A Worker never releases; released at 11 PM it waits for the 8 AM opening (contact hours, HH-COM-09).
    expect(
      (await write('worker', `/staff/requests/${p.requestId}/questions/${id}/reminders/first/release`, {})).statusCode,
    ).toBe(403)
    clock = ELEVEN_PM
    const released = await write('office', `/staff/requests/${p.requestId}/questions/${id}/reminders/first/release`, {})
    expect(released.statusCode, released.body).toBe(200)
    expect(released.json()).toEqual({ released: 2, sendAt: NEXT_EIGHT_AM.toISOString(), heldForContactHours: true })
    expect(await openItems('question_reminder', p.requestId)).toEqual([])
    // The opening comes; the owner's email wording is released but its values are wired by TSK-0121, and texts have no
    // wording, so nothing is sent and staff see a delivery issue.
    await drain()
    const sent = await deliveriesOf(`question:${id}:first`)
    expect(sent.map((d) => [d.state, d.error_code])).toEqual([
      ['failed', 'template_values_not_wired'],
      ['failed', 'template_not_configured'],
    ])
    expect(await openItems('delivery_failed', sent[0]?.id as string)).toEqual([
      expect.objectContaining({ reason: 'delivery_not_configured', reference: p.reference }),
    ])
    expect((await questionRow(id)).first_reminder_sent_at).toBeNull()
    // With wording, Retry sends it once, and the send is recorded.
    await releaseReminderWording()
    clock = TEN_AM
    expect((await write('office', `/staff/message-deliveries/${sent[0]?.id}/retry`, {})).statusCode).toBe(200)
    await sql`UPDATE platform.jobs SET run_at = now() WHERE target_id = ${sent[0]?.id} AND state = 'queued'`.execute(
      t.db,
    )
    await drain()
    expect(
      fakeEmail.sent.filter((m) => m.to === p.email && m.subject === 'Synthetic test reminder subject'),
    ).toHaveLength(1)
    expect((await questionRow(id)).first_reminder_sent_at).toBeNull()
    await reportSent(`question:${id}:first`)
    expect((await questionRow(id)).first_reminder_sent_at).not.toBeNull()
    // The final drafts, released; the customer replies before they go out: they are cancelled, nothing is sent.
    await dueNow('questions.reminder_draft', id, ':final')
    await drain()
    clock = ELEVEN_PM
    expect(
      (await write('office', `/staff/requests/${p.requestId}/questions/${id}/reminders/final/release`, {})).statusCode,
    ).toBe(200)
    const cookie = await customerCookie(p)
    expect((await replyTo(cookie, p, id, { text: 'Synthetic: the hallway.' })).statusCode).toBe(201)
    expect((await deliveriesOf(`question:${id}:final`)).map((d) => [d.state, d.error_code])).toEqual([
      ['cancelled', 'record_changed'],
      ['cancelled', 'record_changed'],
    ])
    await sql`UPDATE platform.jobs SET run_at = now() WHERE automation = 'notify.release' AND state = 'queued'`.execute(
      t.db,
    )
    await drain()
    expect(
      fakeEmail.sent.filter((m) => m.to === p.email && m.subject === 'Synthetic test reminder subject'),
    ).toHaveLength(1)
    view = await staffView(p)
    expect(view.questions[0]?.reminders.map((r) => r.state)).toEqual(['sent', 'cancelled'])
    // Answered: a release is refused.
    expect(
      (await write('office', `/staff/requests/${p.requestId}/questions/${id}/reminders/final/release`, {})).json(),
    ).toMatchObject({
      error: { code: 'CONFLICT', fieldErrors: [{ code: 'QUESTION_ANSWERED' }] },
    })
    clock = TEN_AM
  })

  it('[HH-LEAD-06][T30] Closed—no response only 24 h after the final reminder was actually sent; a reply within 30 days reopens the same request', async () => {
    clock = TEN_AM
    await releaseReminderWording().catch(() => undefined)
    const p = await submit('questions-close@example.test', '(502) 555-0156')
    const { finalSentAt } = await throughFinalReminder(p, 'Synthetic: can you send a wider photo?')
    // Too early: the configured 24 hours have not passed since the final reminder was actually sent.
    clock = new Date(finalSentAt.getTime() + 23 * HOUR)
    let view = await staffView(p)
    expect(view.close).toMatchObject({ allowed: true, available: false, reasons: ['TOO_EARLY'] })
    expect(view.close.availableAt).toBe(new Date(finalSentAt.getTime() + 24 * HOUR).toISOString())
    const early = await write(
      'office',
      `/staff/requests/${p.requestId}/actions/close-no-response`,
      {},
      { version: view.version },
    )
    expect(early.json()).toMatchObject({ error: { code: 'CONFLICT', fieldErrors: [{ code: 'TOO_EARLY' }] } })
    // Booked work is never closed (or cancelled) under this rule.
    clock = new Date(finalSentAt.getTime() + 25 * HOUR)
    booked.add(p.projectId)
    expect(
      (
        await write('office', `/staff/requests/${p.requestId}/actions/close-no-response`, {}, { version: view.version })
      ).json(),
    ).toMatchObject({ error: { code: 'CONFLICT', fieldErrors: [{ code: 'OWNER_REVIEW_REQUIRED' }] } })
    booked.delete(p.projectId)
    view = await staffView(p)
    expect(view.close).toMatchObject({ available: true, reasons: [] })
    // A Worker cannot close.
    expect(
      (await write('worker', `/staff/requests/${p.requestId}/actions/close-no-response`, {}, { version: view.version }))
        .statusCode,
    ).toBe(403)
    const closed = await write(
      'office',
      `/staff/requests/${p.requestId}/actions/close-no-response`,
      { internalNote: 'Synthetic: no answer after both reminders.' },
      { version: view.version },
    )
    expect(closed.statusCode, closed.body).toBe(200)
    expect(closed.json()).toMatchObject({ state: 'closed_no_response', projectState: 'closed' })
    const closedAt = clock
    // The customer sees the closed request and, within the period, Reply as the way back.
    const cookie = await customerCookie(p)
    const overview = (await customerGet(cookie, `/customer/projects/${p.reference}/overview`)).json<{
      status: { situation: string; nextAction: string }
      timeline: { kind: string }[]
    }>()
    expect(overview.status).toMatchObject({ situation: 'closed_no_response', nextAction: 'reply' })
    expect(overview.timeline.map((e) => e.kind)).toEqual(['closed_no_response', 'more_information', 'received'])
    const list = await questionsOf(cookie, p)
    expect(list.replyWindow).toBe('reopen')
    expect(list.reopenUntil).toBe(new Date(closedAt.getTime() + 30 * DAY).toISOString())
    // 29 days later the reply reopens the same request and project for staff review, history kept.
    clock = new Date(closedAt.getTime() + 29 * DAY)
    const id = list.questions[0]?.id as string
    const res = await replyTo(cookie, p, id, { text: 'Synthetic: sorry, here is the answer.' })
    expect(res.statusCode, res.body).toBe(201)
    expect(res.json()).toMatchObject({ reopened: true })
    expect(await requestRow(p)).toMatchObject({ state: 'reviewing', project_state: 'open' })
    expect(
      (
        await t.db
          .selectFrom('intake.request_decisions')
          .select('action')
          .where('request_id', '=', p.requestId)
          .orderBy('decided_at')
          .execute()
      ).map((d) => d.action),
    ).toEqual(['ask_question', 'close_no_response'])
    expect(await openItems('question_replied', p.requestId)).toEqual([
      expect.objectContaining({ reason: 'reopened_by_reply' }),
    ])
    expect((await staffView(p)).questions[0]?.reply).toMatchObject({ reopenedRequest: true })
    clock = TEN_AM
  })

  it('[HH-LEAD-06][T30] after the reopen period a reply is refused and the request stays closed', async () => {
    clock = TEN_AM
    const p = await submit('questions-late@example.test', '(502) 555-0157')
    const { id, finalSentAt } = await throughFinalReminder(p, 'Synthetic: is the gate unlocked on weekdays?')
    clock = new Date(finalSentAt.getTime() + 25 * HOUR)
    const version = (await staffView(p)).version
    expect(
      (await write('office', `/staff/requests/${p.requestId}/actions/close-no-response`, {}, { version })).statusCode,
    ).toBe(200)
    const closedAt = clock
    clock = new Date(closedAt.getTime() + 31 * DAY)
    const cookie = await customerCookie(p)
    const list = await questionsOf(cookie, p)
    expect(list.replyWindow).toBe('period_ended')
    expect(list.questions[0]?.canReply).toBe(false)
    expect((await replyTo(cookie, p, id, { text: 'Synthetic: too late.' })).json()).toMatchObject({
      error: { code: 'CONFLICT', fieldErrors: [{ code: 'REOPEN_PERIOD_ENDED' }] },
    })
    expect(await requestRow(p)).toMatchObject({ state: 'closed_no_response', project_state: 'closed' })
    clock = TEN_AM
  })

  it('[HH-LEAD-08][T30] Not a Fit keeps the questions visible as history; no reply is taken', async () => {
    clock = TEN_AM
    const p = await submit('questions-notafit@example.test', '(502) 555-0158')
    const id = (await publish(p, 'Synthetic: is the wall load-bearing?')).json<{ questionId: string }>().questionId
    const decided = await write(
      'office',
      `/staff/requests/${p.requestId}/actions/not-a-fit`,
      { category: 'specialist_assessment', customerReason: 'it needs a specialist assessment' },
      { version: await versionOf(p) },
    )
    expect(decided.statusCode, decided.body).toBe(200)
    const cookie = await customerCookie(p)
    const list = await questionsOf(cookie, p)
    expect(list.replyWindow).toBe('closed')
    expect(list.questions.map((q) => [q.text, q.canReply])).toEqual([['Synthetic: is the wall load-bearing?', false]])
    expect((await replyTo(cookie, p, id, { text: 'Synthetic.' })).json()).toMatchObject({
      error: { fieldErrors: [{ code: 'REQUEST_CLOSED' }] },
    })
  })
})

describe('the customer writes in the project conversation from the portal (TSK-0051, HH-PORT-09)', () => {
  it('[HH-PORT-09][HH-COM-02] a portal message is on the project as written; staff see it; closed projects and card numbers are refused', async () => {
    clock = TEN_AM
    const p = await submit('questions-portal@example.test', '(502) 555-0159')
    const cookie = await customerCookie(p)
    const text = 'Synthetic portal message:\n  the side door sticks too.'
    const res = await customerPost(cookie, `/customer/projects/${p.reference}/messages`, { text })
    expect(res.statusCode, res.body).toBe(201)
    expect(res.json()).toMatchObject({ from: 'you', channel: 'portal' })
    expect(
      (await customerPost(cookie, `/customer/projects/${p.reference}/messages`, { text: `Synthetic ${CARD}` })).json(),
    ).toMatchObject({
      error: { fieldErrors: [{ code: 'sensitive_content' }] },
    })
    const tab = (await customerGet(cookie, `/customer/projects/${p.reference}/messages`)).json<{
      messages: { from: string; channel: string; text: string }[]
    }>()
    expect(tab.messages).toEqual([expect.objectContaining({ from: 'you', channel: 'portal', text })])
    const conversation = await t.db
      .selectFrom('comms.conversations')
      .select('id')
      .where('project_id', '=', p.projectId)
      .where('audience', '=', 'customer')
      .executeTakeFirstOrThrow()
    expect(await openItems('customer_replied', conversation.id)).toHaveLength(1)
    const thread = (await get('office', `/staff/inbox/conversations/${conversation.id}`)).json<{
      messages: { channel: string; body: string; author: { kind: string } }[]
    }>()
    expect(thread.messages).toEqual([
      expect.objectContaining({ channel: 'portal', body: text, author: expect.objectContaining({ kind: 'contact' }) }),
    ])
    // A portal message is never relinked.
    const m = await t.db
      .selectFrom('comms.messages')
      .select('id')
      .where('project_id', '=', p.projectId)
      .executeTakeFirstOrThrow()
    expect((await get('office', `/staff/inbox/messages/${m.id}`)).statusCode).toBe(404)
    // Another project's session finds nothing; a closed project takes no message.
    const other = await submit('questions-portal-other@example.test', '(502) 555-0160')
    expect(
      (
        await customerPost(await customerCookie(other), `/customer/projects/${p.reference}/messages`, {
          text: 'Synthetic.',
        })
      ).statusCode,
    ).toBe(404)
    await write(
      'office',
      `/staff/requests/${p.requestId}/actions/not-a-fit`,
      { category: 'coverage', customerReason: 'it is outside our area' },
      { version: await versionOf(p) },
    )
    expect(
      (await customerPost(cookie, `/customer/projects/${p.reference}/messages`, { text: 'Synthetic.' })).json(),
    ).toMatchObject({
      error: { fieldErrors: [{ code: 'PROJECT_CLOSED' }] },
    })
  })
})
