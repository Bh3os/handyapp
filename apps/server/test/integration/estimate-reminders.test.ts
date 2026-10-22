// The automatic unanswered-estimate reminder and its stop rules against PostgreSQL 16 (TSK-0060, TSK-0121; HH-EST-14,
// HH-COM-05, HH-COM-06, HH-COM-02, HH-COM-15, T65, S01, OWN-DEC-153, OWN-DEC-151, FACT-REMINDER-CADENCES,
// RULE-SERVER-AUTHZ). Staff, customers, requests, amounts and messages are synthetic (RULE-SYNTHETIC-DATA); nothing
// reaches a real provider. Here an approval is the database move published -> accepted that TSK-0057's approval
// transaction makes; that the transaction itself stops the waiting reminder is tested with the real approval in
// estimate-approval.test.ts. Time never depends on the clock: a due job is made due now, and the text hours are judged
// by a fixed noon.
import { randomUUID } from 'node:crypto'
import { loadServiceSeed, syncServices, withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import { ESTIMATE_TERMS, SMS_DISCLOSURE } from '@handyhub/domain/legal'
import type { StaffActor } from '@handyhub/policy'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import {
  estimateReadyAutomation,
  estimateReminderAutomations,
  estimateReminderFailureItem,
  estimateReminderRecordCheck,
  estimateReminderValues,
  reminderStopReason,
} from '../../src/modules/estimates/index.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { inboxIntakeAutomation } from '../../src/modules/inbox/index.js'
import { startCustomerSession } from '../../src/modules/identity/customer-sessions.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import {
  deliveryStatusAutomation,
  linkHostsOf,
  recordConsent,
  releaseAutomation,
  releaseTemplateVersion,
} from '../../src/modules/notifications/index.js'
import { createAutomationRegistry, type Automation } from '../../src/platform/automation.js'
import { loadConfig, recordPolicyVersion, type ConfigKey } from '../../src/platform/config/index.js'
import { createWorker } from '../../src/platform/jobs.js'
import { runWithContext } from '../../src/platform/request-context.js'
import { createProviders } from '../../src/providers/index.js'
import { FakeObjectStorage } from '../../src/providers/r2/index.js'
import { readProviderSettings } from '../../src/providers/settings.js'
import { recordWebhookReceipt } from '../../src/providers/webhooks.js'
import { testConfig } from '../fixtures/env.js'
import { bodyOf } from '../fixtures/message-text.js'
import { signInWithMfa } from '../fixtures/staff-mfa.js'

const pw = (n: number) => ['synthetic', 'estimate', 'reminders', 'passphrase', String(n)].join(' ')
const PEOPLE = ['owner', 'estimator', 'other', 'office'] as const
type Person = (typeof PEOPLE)[number]
const ROLE: Record<Person, string> = { owner: 'owner', estimator: 'estimator', other: 'estimator', office: 'office' }
const SITE = 'http://127.0.0.1:4610'
const MESSAGE = 'reminder.unanswered_estimate'
const H = 3_600_000
// The text hours are judged at a fixed noon in Louisville (EDT), never at the time the suite runs.
const NOON = new Date('2026-10-20T16:00:00Z')

let t: TestDatabase
let app: FastifyInstance
const storage = new FakeObjectStorage()
const cookies = {} as Record<Person, string>
const csrf = {} as Record<Person, string>
const staff = {} as Record<Person, StaffActor>

const p = createProviders(readProviderSettings({ HANDYHUB_ENV: 'ci' }))
if (!p.fakes.email || !p.fakes.sms || !p.email || !p.sms) throw new Error('ci uses the fakes')
const fakeEmail = p.fakes.email
const fakeSms = p.fakes.sms
const senders = { email: p.email, sms: p.sms, linkHosts: linkHostsOf(SITE, undefined), clock: () => NOON }
const release = releaseAutomation(senders, {
  recordChecks: { estimate_version: estimateReminderRecordCheck },
  failureItem: estimateReminderFailureItem,
  values: estimateReminderValues(SITE),
})
const fast = (a: Automation): Automation => ({ ...a, retry: { maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 1 } })
// TSK-0049 inbound intake: a customer's text arrives on the project from a stored (verified) webhook receipt.
const intake = inboxIntakeAutomation({ inboundEmail: null, replyAddress: null })
const registry = createAutomationRegistry([
  ...estimateReminderAutomations(),
  estimateReadyAutomation({ providers: senders, publicSiteUrl: SITE }),
  fast(release),
  intake,
  deliveryStatusAutomation(),
])

async function setConfig(key: ConfigKey, value: unknown, sourceIds = ['TEST-SYNTHETIC']) {
  await recordPolicyVersion(t.db, {
    key,
    value: value as never,
    sourceIds,
    changedBy: 'test',
    reason: 'synthetic test configuration',
  })
}

async function signIn(who: Person): Promise<[string, string]> {
  const res = await signInWithMfa(app, {
    method: 'POST',
    url: '/api/v1/staff/auth/sign-in',
    payload: { email: `${who}-estimate-reminders@example.test`, password: pw(1) },
  })
  expect(res.statusCode).toBe(200)
  const cookie = String(res.headers['set-cookie']).split(';')[0] as string
  const session = await app.inject({ method: 'GET', url: '/api/v1/staff/auth/session', headers: { cookie } })
  return [cookie, session.json<{ csrfToken: string }>().csrfToken]
}

beforeAll(async () => {
  t = await createTestDatabase()
  await syncServices(t.db, loadServiceSeed())
  app = await buildApp({ config: testConfig({ TRUST_PROXY_HOPS: '1' }), api: { db: t.db, storage } })
  const hash = await hashPassword(pw(1))
  await withTx(t.db, async (tx) => {
    for (const who of PEOPLE) {
      const user = await createStaffUser(tx, {
        email: `${who}-estimate-reminders@example.test`,
        displayName: `Synthetic ${who}`,
        locale: 'en',
        role: ROLE[who] as 'owner',
        issuedBy: 'test',
      })
      await setPasswordHash(tx, user.id, hash)
      staff[who] = {
        kind: 'staff',
        userId: user.id,
        roles: [ROLE[who] as 'owner'],
        capabilities: [],
        status: 'active',
        freshAuth: false,
      }
    }
  })
  for (const who of PEOPLE) [cookies[who], csrf[who]] = await signIn(who)
  await setConfig('legal.estimate_terms', {
    documentId: ESTIMATE_TERMS.documentId,
    status: 'owner_review_pending',
    attorneyReviewed: false,
    preparedOn: ESTIMATE_TERMS.preparedOn,
    contentSha256: ESTIMATE_TERMS.contentSha256,
  })
})
afterAll(async () => {
  await app?.close()
  await t?.drop()
})

let seq = 0
const key = (what: string) => `synthetic-${what}-${String(++seq).padStart(6, '0')}-${randomUUID()}`
function staffWrite(who: Person, method: 'POST' | 'PUT', url: string, payload: unknown = {}, version?: number) {
  return app.inject({
    method,
    url,
    payload: payload as object,
    headers: {
      cookie: cookies[who],
      'x-csrf-token': csrf[who],
      'idempotency-key': key('staff'),
      ...(version === undefined ? {} : { 'if-match': `"${version}"` }),
    },
  })
}
const staffGet = (who: Person, url: string) => app.inject({ method: 'GET', url, headers: { cookie: cookies[who] } })

const ALL_OK = Object.fromEntries(
  ['coverage', 'service_fit', 'essential_facts', 'urgency', 'site_visit_need', 'staff_equipment', 'risk_flags'].map(
    (c) => [c, { outcome: 'ok' }],
  ),
)

type Published = {
  requestId: string
  projectId: string
  reference: string
  contactId: string
  phone: string
  estimateId: string
  number: string
  versionId: string
}
let ip = 10
/** A published estimate on a fresh synthetic request, prepared and published by the given staff member. */
async function published(
  options: { preferred?: 'email' | 'text'; by?: Person } = {},
): Promise<Published & { rowVersion: number }> {
  const by = options.by ?? 'estimator'
  const n = ++ip
  const phone = `+1502555${String(1000 + n).slice(-4)}`
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/public/requests',
    headers: { 'idempotency-key': key('submit'), 'x-forwarded-for': `198.51.100.${n}` },
    payload: {
      formVersion: 'test-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-01' }],
      notSure: false,
      description: 'Synthetic estimate reminder project.',
      answers: [],
      property: {
        street: `${n} Synthetic Reminder Way`,
        city: 'Testville',
        state: 'ky',
        zip: '40000',
        propertyType: 'house',
      },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'online',
      contact: {
        fullName: 'Synthetic Reminder Customer',
        email: `estimate-reminders-${n}@example.test`,
        phone: `(502) 555-${phone.slice(-4)}`,
        preferredChannel: options.preferred ?? 'email',
      },
      ...(options.preferred === 'text'
        ? { smsOptIn: true, smsDisclosureVersion: SMS_DISCLOSURE.documentId }
        : { smsOptIn: false }),
      marketingOptIn: false,
    },
  })
  expect(res.statusCode, res.body).toBe(201)
  const { reference } = res.json<{ reference: string }>()
  const row = await t.db
    .selectFrom('intake.requests')
    .select(['id', 'project_id', 'state_version', 'contact_id'])
    .where('reference', '=', reference)
    .executeTakeFirstOrThrow()
  expect(
    (await staffWrite('owner', 'PUT', `/api/v1/staff/requests/${row.id}/qualification`, { checks: ALL_OK }, 0))
      .statusCode,
  ).toBe(200)
  const moved = await staffWrite(
    'owner',
    'POST',
    `/api/v1/staff/requests/${row.id}/actions/online-estimate`,
    { workPackages: ['SVC-DW-01'] },
    row.state_version,
  )
  expect(moved.statusCode, moved.body).toBe(200)
  const created = await staffWrite(by, 'POST', `/api/v1/staff/projects/${row.project_id}/estimates`, {})
  expect(created.statusCode, created.body).toBe(201)
  const c = created.json<{ number: string; versionId: string; estimateId: string }>()
  const draft = await publishable(by, c.versionId)
  const pub = await staffWrite(by, 'POST', `/api/v1/staff/estimate-versions/${c.versionId}/publish`, {}, draft)
  expect(pub.statusCode, pub.body).toBe(200)
  const v = await versionRow(c.versionId)
  return {
    requestId: row.id,
    projectId: row.project_id,
    reference,
    contactId: row.contact_id,
    phone,
    estimateId: v.estimate_id,
    number: c.number,
    versionId: c.versionId,
    rowVersion: pub.json<{ rowVersion: number }>().rowVersion,
  }
}

/** Saves one priced line on a draft version; returns its row version. */
async function publishable(by: Person, versionId: string): Promise<number> {
  const view = (await staffGet(by, `/api/v1/staff/estimate-versions/${versionId}`)).json<{
    rowVersion: number
    workPackages: { id: string }[]
  }>()
  const saved = await staffWrite(
    by,
    'PUT',
    `/api/v1/staff/estimate-versions/${versionId}/draft`,
    {
      lines: [
        {
          kind: 'base',
          workPackageId: view.workPackages[0]?.id,
          description: 'Synthetic: patch the hallway wall',
          quantity: '1',
          unit: 'job',
          unitPriceCents: 42_000,
        },
      ],
    },
    view.rowVersion,
  )
  expect(saved.statusCode, saved.body).toBe(200)
  return saved.json<{ rowVersion: number }>().rowVersion
}

const versionRow = (id: string) =>
  t.db.selectFrom('estimating.estimate_versions').selectAll().where('id', '=', id).executeTakeFirstOrThrow()
const reminders = (versionId: string) =>
  t.db
    .selectFrom('platform.message_deliveries')
    .selectAll()
    .where('record_type', '=', 'estimate_version')
    .where('record_id', '=', versionId)
    .where('message_key', '=', MESSAGE)
    .orderBy('channel')
    .orderBy('seq')
    .execute()
const notices = (versionId: string) =>
  t.db
    .selectFrom('platform.message_deliveries')
    .selectAll()
    .where('record_type', '=', 'estimate_version')
    .where('record_id', '=', versionId)
    .where('message_key', '=', 'estimate.ready')
    .orderBy('channel')
    .execute()
const auditOf = (action: string, targetId: string) =>
  t.db
    .selectFrom('platform.audit_events')
    .selectAll()
    .where('action', '=', action)
    .where('target_id', '=', targetId)
    .orderBy('seq')
    .execute()
const issueOf = (deliveryId: string) =>
  t.db
    .selectFrom('ops.queue_items')
    .selectAll()
    .where('type', '=', 'delivery_failed')
    .where('subject_id', '=', deliveryId)
    .execute()

/** Runs the worker until nothing is left to do now. */
async function drain() {
  const w = createWorker({ db: t.db, registry })
  for (let i = 0; i < 20; i++) {
    const r = await w.runOnce()
    if (r.dispatched + r.succeeded + r.retried + r.failed + r.cancelled === 0) return
  }
}
/** The provider reports the version's handed-over estimate-ready email sent (a status webhook): delivered now. */
async function reportDelivered(versionId: string) {
  await drain()
  for (const d of await notices(versionId)) {
    if (d.channel !== 'email' || !d.provider_message_id || d.state !== 'queued') continue
    await runWithContext({ requestId: `req-estimate-reminders-${randomUUID()}` }, () =>
      withTx(t.db, (tx) =>
        recordWebhookReceipt(tx, {
          provider: 'resend',
          deliveryId: `evt-estimate-reminders-${randomUUID()}`,
          eventType: 'email.sent',
          providerMessageId: d.provider_message_id as string,
          eventOccurredAt: new Date(),
          payload: { type: 'email.sent', data: { email_id: d.provider_message_id } },
          rawBody: Buffer.from('{}'),
        }),
      ),
    )
  }
  await drain()
}
/** Time passes: the version's reminder deliveries become due now. */
async function due(versionId: string) {
  await sql`UPDATE platform.jobs SET run_at = now() WHERE automation = 'notify.release' AND state = 'queued'
            AND target_id IN (SELECT id::text FROM platform.message_deliveries WHERE message_key = ${MESSAGE}
                              AND record_id = ${versionId})`.execute(t.db)
  await drain()
}
/** The version move TSK-0057's approval records: the published version becomes accepted. */
const accept = (versionId: string) =>
  sql`UPDATE estimating.estimate_versions SET state = 'accepted', state_changed_at = now(), row_version = row_version + 1
      WHERE id = ${versionId}`.execute(t.db)

type View = {
  cadence: { state: string; afterDeliveryHours?: number; deliveredAt?: string | null; dueAt?: string | null }
  stoppedBy: string | null
  reminders: {
    id: string
    release: string
    state: string
    channel: string
    reason: string | null
    scheduledAt: string | null
    sentAt: string | null
    cancelledBy: { id: string } | 'system' | null
  }[]
}
const view = async (versionId: string, who: Person = 'estimator') => {
  const res = await staffGet(who, `/api/v1/staff/estimate-versions/${versionId}/reminders`)
  expect(res.statusCode, res.body).toBe(200)
  return res.json<View>()
}

async function customerCookie(e: Pick<Published, 'contactId' | 'projectId'>) {
  const s = await withTx(t.db, (tx) =>
    startCustomerSession(tx, {
      contactRef: e.contactId,
      via: 'grant',
      projectIds: [e.projectId],
      verifiedAt: new Date(),
    }),
  )
  return `__Host-hh_customer=${s.token}`
}
async function requestChanges(e: Published) {
  const res = await app.inject({
    method: 'POST',
    url: `/api/v1/customer/projects/${e.reference}/estimates/${e.number}/versions/1/request-changes`,
    payload: { message: 'Synthetic: please split the wall work into two visits.' },
    headers: {
      cookie: await customerCookie(e),
      'idempotency-key': key('customer'),
      'x-forwarded-for': '198.51.100.251',
    },
  })
  expect(res.statusCode, res.body).toBe(201)
}
/** The customer's STOP (or START) as the SMS keyword handling records it. */
const smsConsent = (e: Published, granted: boolean) =>
  withTx(t.db, (tx) =>
    recordConsent(tx, {
      purpose: 'transactional_sms',
      channel: 'sms',
      destination: e.phone,
      granted,
      source: 'sms_keyword',
      recordedBy: `customer:${e.contactId}`,
    }),
  )

describe('[HH-EST-14][FACT-REMINDER-CADENCES][OWN-DEC-153] one automatic reminder 3 days after delivery', () => {
  it('publishing alone schedules nothing; the successful delivery schedules one reminder 72 hours after it', async () => {
    const e = await published()
    await drain()
    // Handed to the provider, not yet reported sent: no reminder (a failed delivery never starts the clock).
    expect(await reminders(e.versionId)).toEqual([])
    expect((await view(e.versionId)).cadence).toMatchObject({ state: 'CONFIGURED', deliveredAt: null, dueAt: null })
    await reportDelivered(e.versionId)
    const [email] = (await notices(e.versionId)).filter((d) => d.channel === 'email')
    const deliveredAt = (email?.status_at as Date).getTime()
    const rows = await reminders(e.versionId)
    // One reminder per destination (the email, and the number whose text needs the SMS opt-in); no 24-hour one.
    expect(rows.map((r) => [r.channel, r.subject_key, r.release, r.state, r.locale, r.audience])).toEqual([
      ['email', `estimate_reminder:${e.versionId}`, 'automatic', 'queued', 'en', 'customer'],
      ['sms', `estimate_reminder:${e.versionId}`, 'automatic', 'queued', 'en', 'customer'],
    ])
    expect((rows[0]?.scheduled_at as Date).getTime() - deliveredAt).toBe(72 * H)
    // Automatic deliveries hold no stored values: they are read from the records when it sends.
    expect(rows[0]?.variables).toEqual({})
    const jobs = await t.db
      .selectFrom('platform.jobs')
      .select(['job_key', 'run_at', 'state'])
      .where('job_key', '=', `notify.release:${rows[0]?.id}`)
      .execute()
    expect(jobs.map((j) => [j.state, j.run_at.getTime() - deliveredAt])).toEqual([['queued', 72 * H]])
    expect(await auditOf('notification.scheduled', rows[0]?.id as string)).toHaveLength(1)
    const shown = await view(e.versionId)
    expect(shown.cadence).toMatchObject({ state: 'CONFIGURED', afterDeliveryHours: 72 })
    expect(new Date(shown.cadence.dueAt as string).getTime()).toBe(deliveredAt + 72 * H)
    expect(shown.reminders.map((r) => [r.channel, r.release, r.state])).toEqual([
      ['email', 'automatic', 'queued'],
      ['sms', 'automatic', 'queued'],
    ])
    // Nobody releases or dismisses it any more: the TSK-0060 routes are gone.
    for (const action of ['release', 'dismiss'])
      expect(
        (await staffWrite('estimator', 'POST', `/api/v1/staff/estimate-reminders/${rows[0]?.id}/${action}`)).statusCode,
      ).toBe(404)
  })

  it('[HH-COM-06][OWN-DEC-151] at its time it sends once, in the owner wording with no amount; texts stay off', async () => {
    const e = await published()
    await reportDelivered(e.versionId)
    const before = fakeEmail.sent.length
    await due(e.versionId)
    const rows = await reminders(e.versionId)
    expect(rows.map((r) => [r.channel, r.state, r.error_code])).toEqual([
      ['email', 'queued', null],
      // No text wording is released until A2P 10DLC (TSK-0133): recorded as not sent, never as sent.
      ['sms', 'failed', 'template_not_configured'],
    ])
    expect(rows[0]?.provider_message_id).toBeTruthy()
    const sent = fakeEmail.sent.slice(before)
    expect(sent).toHaveLength(1)
    expect(sent[0]?.to).toBe(`estimate-reminders-${ip}@example.test`)
    expect(sent[0]?.subject).toBe(`HandyHub | Following Up on Estimate #${e.number}`)
    const body = bodyOf(sent[0]?.text)
    expect(body).toContain('Hi Synthetic,')
    expect(body).toContain(`${SITE}/portal/p/${e.reference}/documents/${encodeURIComponent(e.number)}/1`)
    expect(body.replaceAll(e.reference, '').replaceAll(e.number, '')).not.toMatch(/420|\$/)
    // The text's failure is a delivery issue staff see (not configured), never a customer non-response.
    expect((await issueOf(rows[1]?.id as string)).map((i) => [i.reason, i.resolved_at])).toEqual([
      ['delivery_not_configured', null],
    ])
    expect((await versionRow(e.versionId)).state).toBe('published')
    // Running again (a retried job, a redelivered event, the plan of migration 0075) sends nothing more.
    await reportDelivered(e.versionId)
    await sql`UPDATE platform.jobs SET state = 'queued', run_at = now(), attempts = 0, finished_at = NULL
              WHERE job_key = ${`notify.release:${rows[0]?.id}`}`.execute(t.db)
    await withTx(t.db, (tx) =>
      tx
        .insertInto('platform.jobs')
        .values({
          automation: 'estimate.reminder_plan',
          job_key: `estimate.reminder_plan:${e.versionId}:again`,
          target_type: 'estimate_version',
          target_id: e.versionId,
          payload: '{}',
          request_id: 'test-plan-again',
          max_attempts: 1,
        })
        .execute(),
    )
    await drain()
    expect(fakeEmail.sent.length - before).toBe(1)
    expect((await reminders(e.versionId)).length).toBe(2)
    const shown = await view(e.versionId)
    expect(shown.reminders.map((r) => [r.channel, r.state, r.reason])).toEqual([
      ['email', 'queued', null],
      ['sms', 'failed', 'template_not_configured'],
    ])
  })

  it('[RULE-DECIDED-VALUES-ACTIVE] NOT CONFIGURED cadence, or the reminder off the automatic list, schedules nothing', async () => {
    const config = await loadConfig(t.db)
    const cadences = config.get('reminders.cadences')
    const automatic = config.get('messages.automatic')
    if (cadences.state !== 'CONFIGURED' || automatic.state !== 'CONFIGURED')
      throw new Error('migration 0075 seeds them')
    await setConfig('reminders.cadences', null)
    try {
      const e = await published()
      await reportDelivered(e.versionId)
      expect(await reminders(e.versionId)).toEqual([])
      expect((await view(e.versionId)).cadence).toEqual({ state: 'NOT_CONFIGURED' })
      expect((await auditOf('estimate_reminder.not_scheduled', e.versionId)).map((a) => a.summary)).toEqual([
        { messageKey: MESSAGE, reason: 'not_configured' },
      ])
    } finally {
      await setConfig('reminders.cadences', cadences.value, ['OWN-DEC-153'])
    }
    await setConfig('messages.automatic', {
      ...automatic.value,
      customer: automatic.value.customer.filter((k) => k !== MESSAGE),
    })
    try {
      const e = await published()
      await reportDelivered(e.versionId)
      expect(await reminders(e.versionId)).toEqual([])
    } finally {
      await setConfig('messages.automatic', automatic.value, ['OWN-DEC-153'])
    }
  })

  it('[HH-COM-02][T65] a failed notice never starts the clock; a failed reminder is a delivery issue with Retry', async () => {
    fakeEmail.script({ outcome: 'rejected', errorCode: 'synthetic_rejected' })
    const failed = await published()
    await reportDelivered(failed.versionId)
    expect((await notices(failed.versionId)).find((d) => d.channel === 'email')?.state).toBe('failed')
    expect(await reminders(failed.versionId)).toEqual([])

    const e = await published()
    await reportDelivered(e.versionId)
    fakeEmail.script({ outcome: 'rejected', errorCode: 'synthetic_rejected' })
    await due(e.versionId)
    const [email] = await reminders(e.versionId)
    expect([email?.state, email?.error_code]).toEqual(['failed', 'synthetic_rejected'])
    const [issue] = await issueOf(email?.id as string)
    expect(issue).toMatchObject({
      reason: 'delivery_failed',
      resolved_at: null,
      assigned_staff_id: staff.estimator.userId,
    })
    // Never a customer non-response: the estimate stays pending and nothing stops.
    expect(await reminderStopReason(t.db, e.versionId, new Date())).toBeNull()
    const before = fakeEmail.sent.length
    const retried = await staffWrite('estimator', 'POST', `/api/v1/staff/message-deliveries/${email?.id}/retry`)
    expect(retried.statusCode, retried.body).toBe(200)
    await drain()
    expect(fakeEmail.sent.length - before).toBe(1)
    expect((await reminders(e.versionId))[0]?.state).toBe('queued')
    expect((await issueOf(email?.id as string))[0]?.resolved_at).not.toBeNull()
  })
})

describe('[HH-EST-14][T65][HH-COM-05][OWN-DEC-153] cancelled when its condition ends; rechecked at send time', () => {
  it('approved before it is due: the send-time recheck cancels it with the reason; nothing is sent', async () => {
    const e = await published()
    await reportDelivered(e.versionId)
    await accept(e.versionId)
    const before = fakeEmail.sent.length
    await due(e.versionId)
    expect((await reminders(e.versionId)).map((r) => [r.channel, r.state, r.error_code, r.cancelled_by])).toEqual([
      ['email', 'cancelled', 'accepted', 'system'],
      ['sms', 'cancelled', 'accepted', 'system'],
    ])
    expect(fakeEmail.sent.length).toBe(before)
    expect((await view(e.versionId, 'owner')).stoppedBy).toBe('accepted')
    const [row] = await reminders(e.versionId)
    expect(await auditOf('notification.cancelled', row?.id as string)).toHaveLength(1)
  })

  it('a customer response cancels the scheduled reminder at once, in its own transaction', async () => {
    const e = await published()
    await reportDelivered(e.versionId)
    await requestChanges(e)
    expect((await reminders(e.versionId)).map((r) => [r.state, r.error_code, r.cancelled_by])).toEqual([
      ['cancelled', 'customer_responded', 'system'],
      ['cancelled', 'customer_responded', 'system'],
    ])
    expect((await versionRow(e.versionId)).state).toBe('published')
  })

  it('a newer version supersedes the older one’s reminder; withdrawing stops the newer one; neither is sent', async () => {
    const e = await published()
    await reportDelivered(e.versionId)
    const revised = await staffWrite('estimator', 'POST', `/api/v1/staff/estimate-versions/${e.versionId}/revise`)
    expect(revised.statusCode, revised.body).toBe(201)
    const v2 = revised.json<{ versionId: string }>().versionId
    const row = await publishable('estimator', v2)
    expect(
      (await staffWrite('estimator', 'POST', `/api/v1/staff/estimate-versions/${v2}/publish`, {}, row)).statusCode,
    ).toBe(200)
    expect((await reminders(e.versionId)).map((r) => [r.state, r.error_code])).toEqual([
      ['cancelled', 'superseded'],
      ['cancelled', 'superseded'],
    ])
    // The new version gets its own reminder from its own delivery (one reminder per version).
    await reportDelivered(v2)
    expect((await reminders(v2)).map((r) => [r.subject_key, r.state])).toEqual([
      [`estimate_reminder:${v2}`, 'queued'],
      [`estimate_reminder:${v2}`, 'queued'],
    ])
    const v2Row = await versionRow(v2)
    const out = await staffWrite(
      'estimator',
      'POST',
      `/api/v1/staff/estimate-versions/${v2}/withdraw`,
      { reason: 'Synthetic: the scope changed.' },
      v2Row.row_version,
    )
    expect(out.statusCode, out.body).toBe(200)
    expect((await reminders(v2)).map((r) => [r.state, r.error_code])).toEqual([
      ['cancelled', 'withdrawn'],
      ['cancelled', 'withdrawn'],
    ])
    const before = fakeEmail.sent.length
    await due(e.versionId)
    await due(v2)
    expect(fakeEmail.sent.length).toBe(before)
  })

  it('the stop rule reads every reason from the records as they are now', async () => {
    const e = await published()
    const now = new Date()
    expect(await reminderStopReason(t.db, e.versionId, now)).toBeNull()
    await withTx(t.db, (tx) =>
      tx
        .insertInto('intake.request_conversations')
        .values({
          request_id: e.requestId,
          project_id: e.projectId,
          channel: 'phone',
          outcome: 'Synthetic: the customer called about the estimate.',
          occurred_at: new Date(),
          recorded_by: staff.owner.userId,
        })
        .execute(),
    )
    expect(await reminderStopReason(t.db, e.versionId, new Date())).toBe('conversation_recorded')
    expect(await reminderStopReason(t.db, randomUUID(), now)).toBe('not_published')
  })
})

describe('[HH-EST-14][RULE-SERVER-AUTHZ] staff see the reminder', () => {
  it('the Owner and Estimators see it; Office may not open the estimate screen; customers never', async () => {
    const e = await published()
    await reportDelivered(e.versionId)
    expect((await view(e.versionId, 'other')).reminders).toHaveLength(2)
    expect((await view(e.versionId, 'owner')).reminders).toHaveLength(2)
    expect((await staffGet('office', `/api/v1/staff/estimate-versions/${e.versionId}/reminders`)).statusCode).toBe(403)
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/staff/estimate-versions/${e.versionId}/reminders`,
      headers: { cookie: await customerCookie(e) },
    })
    expect([401, 403, 404]).toContain(res.statusCode)
  })
})

describe('[HH-EST-14][T65] customer messages and question replies cancel the scheduled reminder (TSK-0049, TSK-0050, TSK-0051)', () => {
  let hook = 0
  /** A customer's text as the Bird webhook stores it (verified receipt and outbox event), then the inbox intake. */
  async function textIn(from: string, text: string) {
    const id = `msg_reminders_${++hook}_${randomUUID()}`
    const payload = {
      type: 'sms.received',
      timestamp: new Date().toISOString(),
      data: { sms_id: `sms_in_${id}`, from, to: '+15025550199', text },
    }
    await runWithContext({ requestId: `test:${id}` }, () =>
      withTx(t.db, (tx) =>
        recordWebhookReceipt(tx, {
          provider: 'bird',
          deliveryId: id,
          eventType: 'sms.received',
          providerMessageId: `sms_in_${id}`,
          eventOccurredAt: new Date(),
          payload,
          rawBody: Buffer.from(JSON.stringify(payload)),
        }),
      ),
    )
    await drain()
    return t.db
      .selectFrom('comms.messages as m')
      .innerJoin('platform.webhook_receipts as r', 'r.id', 'm.webhook_receipt_id')
      .select(['m.id', 'm.link_state', 'm.link_version', 'm.project_id', 'm.keyword'])
      .where('r.delivery_id', '=', id)
      .executeTakeFirstOrThrow()
  }
  const verifyPhone = (contactId: string) =>
    sql`UPDATE crm.contacts SET phone_verification = 'verified', phone_verified_value = phone_e164
        WHERE id = ${contactId}`.execute(t.db)
  async function scheduled(e: Published) {
    await reportDelivered(e.versionId)
    const rows = await reminders(e.versionId)
    expect(rows.map((r) => r.state)).toEqual(['queued', 'queued'])
  }
  async function expectStopped(e: Published, reason: string) {
    expect((await reminders(e.versionId)).map((r) => [r.state, r.error_code, r.cancelled_by])).toEqual([
      ['cancelled', reason, 'system'],
      ['cancelled', reason, 'system'],
    ])
    expect((await view(e.versionId, 'owner')).stoppedBy).toBe(reason)
  }
  const portalMessage = async (e: Published, text: string) =>
    app.inject({
      method: 'POST',
      url: `/api/v1/customer/projects/${e.reference}/messages`,
      payload: { text },
      headers: {
        cookie: await customerCookie(e),
        'idempotency-key': key('customer'),
        'x-forwarded-for': '198.51.100.252',
      },
    })

  it('an inbound text matched to the project cancels it at once; an SMS keyword does not', async () => {
    const e = await published()
    await verifyPhone(e.contactId)
    await scheduled(e)
    // HELP is consent handling (TSK-0048), not a response: the reminder keeps waiting.
    const help = await textIn(e.phone, 'HELP')
    expect(help).toMatchObject({ link_state: 'matched', project_id: e.projectId, keyword: 'help' })
    expect(await reminderStopReason(t.db, e.versionId, new Date())).toBeNull()
    const m = await textIn(e.phone, 'Synthetic: can we talk about the estimate?')
    expect(m).toMatchObject({ link_state: 'matched', project_id: e.projectId, keyword: null })
    await expectStopped(e, 'customer_message')
  })

  it('a message staff link to the project from Needs Linking cancels it (TSK-0049 link)', async () => {
    const e = await published()
    await scheduled(e)
    const m = await textIn(`+1502555${String(9000 + hook).slice(-4)}`, 'Synthetic: about my estimate')
    expect(m).toMatchObject({ link_state: 'needs_linking', project_id: null })
    const linked = await staffWrite(
      'office',
      'POST',
      `/api/v1/staff/inbox/messages/${m.id}/link`,
      { projectReference: e.reference, reason: 'Synthetic: the customer wrote from another phone' },
      m.link_version,
    )
    expect(linked.statusCode, linked.body).toBe(200)
    await expectStopped(e, 'customer_message')
  })

  it('a message the customer writes in the portal cancels it at once (TSK-0051 Messages)', async () => {
    const e = await published()
    await scheduled(e)
    const res = await portalMessage(e, 'Synthetic: could the work start in the afternoon?')
    expect(res.statusCode, res.body).toBe(201)
    await expectStopped(e, 'customer_message')
  })

  it('a reply to a question cancels it at once (TSK-0051 question replies)', async () => {
    const e = await published()
    await scheduled(e)
    const q = await t.db
      .insertInto('intake.questions')
      .values({
        request_id: e.requestId,
        project_id: e.projectId,
        kind: 'general',
        body: 'Synthetic: which wall is it?',
        author_staff_id: staff.estimator.userId,
      })
      .returning('id')
      .executeTakeFirstOrThrow()
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/customer/projects/${e.reference}/questions/${q.id}/replies`,
      payload: { text: 'Synthetic: the hallway wall.' },
      headers: {
        cookie: await customerCookie(e),
        'idempotency-key': key('customer'),
        'x-forwarded-for': '198.51.100.253',
      },
    })
    expect(res.statusCode, res.body).toBe(201)
    await expectStopped(e, 'question_replied')
  })
})

// Last in the file: it releases a synthetic text wording, which the tests above must not have.
describe('[HH-COM-05] consent is rechecked at send time', () => {
  it('an SMS STOP after scheduling suppresses the text at send time; the email still goes', async () => {
    const e = await published({ preferred: 'text' })
    await reportDelivered(e.versionId)
    // Synthetic text wording for this test only (no reminder text is released until A2P 10DLC, TSK-0133).
    await withTx(t.db, (tx) =>
      releaseTemplateVersion(tx, {
        messageKey: MESSAGE,
        channel: 'sms',
        locale: 'en',
        subject: null,
        body: 'Synthetic test reminder: {estimateLink}',
        translationReview: 'source',
        sourceIds: ['TSK-0121'],
        releasedBy: 'staff-synthetic-owner',
      }),
    )
    await smsConsent(e, false)
    const texted = fakeSms.sent.length
    await due(e.versionId)
    expect((await reminders(e.versionId)).map((r) => [r.channel, r.state, r.error_code])).toEqual([
      ['email', 'queued', null],
      ['sms', 'suppressed', 'sms_opted_out'],
    ])
    expect(fakeSms.sent.length).toBe(texted)
  })
})
