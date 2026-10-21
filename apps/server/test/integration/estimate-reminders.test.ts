// Unanswered-estimate reminder drafts and their stop rules against PostgreSQL 16 (TSK-0060; HH-EST-14, HH-COM-05,
// HH-COM-09, T65, S01, OWN-DEC-78, OWN-DEC-132, FACT-REMINDER-CADENCES, RULE-SERVER-AUTHZ). Staff, customers, requests,
// amounts and messages are synthetic (RULE-SYNTHETIC-DATA); nothing reaches a real provider. Here an approval
// is the database move published -> accepted that TSK-0057's approval transaction makes; that the transaction itself
// stops waiting drafts is tested with the real approval in estimate-approval.test.ts.
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
  estimateReminderAutomations,
  estimateReminderRecordCheck,
  reminderStopReason,
} from '../../src/modules/estimates/index.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { inboxIntakeAutomation } from '../../src/modules/inbox/index.js'
import { startCustomerSession } from '../../src/modules/identity/customer-sessions.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import { recordConsent, releaseAutomation } from '../../src/modules/notifications/index.js'
import { createAutomationRegistry, type Automation } from '../../src/platform/automation.js'
import { recordPolicyVersion, type ConfigKey } from '../../src/platform/config/index.js'
import { createWorker } from '../../src/platform/jobs.js'
import { runWithContext } from '../../src/platform/request-context.js'
import { createProviders } from '../../src/providers/index.js'
import { FakeObjectStorage } from '../../src/providers/r2/index.js'
import { readProviderSettings } from '../../src/providers/settings.js'
import { recordWebhookReceipt } from '../../src/providers/webhooks.js'
import { testConfig } from '../fixtures/env.js'

const pw = (n: number) => ['synthetic', 'estimate', 'reminders', 'passphrase', String(n)].join(' ')
const PEOPLE = ['owner', 'estimator', 'other', 'office'] as const
type Person = (typeof PEOPLE)[number]
const ROLE: Record<Person, string> = { owner: 'owner', estimator: 'estimator', other: 'estimator', office: 'office' }
const SITE = 'http://127.0.0.1:4610'
const MESSAGE = 'reminder.unanswered_estimate'

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
const release = releaseAutomation(
  { email: p.email, sms: p.sms },
  { recordChecks: { estimate_version: estimateReminderRecordCheck } },
)
const reminderAutomations = estimateReminderAutomations({ publicSiteUrl: SITE })
const fast = (a: Automation): Automation => ({ ...a, retry: { maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 1 } })
// TSK-0049 inbound intake: a customer's text arrives on the project from a stored (verified) webhook receipt.
const intake = inboxIntakeAutomation({ inboundEmail: null, replyAddress: null })
const registry = createAutomationRegistry([...reminderAutomations, fast(release), intake])

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
  const res = await app.inject({
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
    .orderBy('seq')
    .execute()
const draftJobs = (versionId: string) =>
  t.db
    .selectFrom('platform.jobs')
    .select(['job_key', 'run_at', 'state', 'payload'])
    .where('automation', '=', 'estimate.reminder_draft')
    .where('target_id', '=', versionId)
    .orderBy('run_at')
    .execute()
const itemOf = (versionId: string) =>
  t.db
    .selectFrom('ops.queue_items')
    .selectAll()
    .where('type', '=', 'estimate_reminder')
    .where('subject_id', '=', versionId)
    .orderBy('opened_at', 'desc')
    .execute()
const auditOf = (action: string, targetId: string) =>
  t.db
    .selectFrom('platform.audit_events')
    .selectAll()
    .where('action', '=', action)
    .where('target_id', '=', targetId)
    .orderBy('seq')
    .execute()

/** Runs the worker until nothing is left to do now. */
async function drain() {
  const w = createWorker({ db: t.db, registry })
  for (let i = 0; i < 12; i++) {
    const r = await w.runOnce()
    if (r.dispatched + r.succeeded + r.retried + r.failed + r.cancelled === 0) return
  }
}
/** Time passes: the version's reminder job (first or final) becomes due now. */
async function due(versionId: string, step: 'first' | 'final') {
  await sql`UPDATE platform.jobs SET run_at = now() WHERE automation = 'estimate.reminder_draft'
            AND job_key = ${`estimate.reminder_draft:${versionId}:${step}`}`.execute(t.db)
  await drain()
}
/** The version move TSK-0057's approval records: the published version becomes accepted. */
const accept = (versionId: string) =>
  sql`UPDATE estimating.estimate_versions SET state = 'accepted', state_changed_at = now(), row_version = row_version + 1
      WHERE id = ${versionId}`.execute(t.db)

type View = {
  cadence: { state: string; firstHours?: number; finalHours?: number; firstAt?: string; finalAt?: string }
  stoppedBy: string | null
  reminders: {
    id: string
    step: string
    state: string
    channel: string
    reason: string | null
    releasedBy: { id: string } | null
    cancelledBy: { id: string } | 'system' | null
    actions: { release: boolean; dismiss: boolean }
  }[]
}
const view = async (versionId: string, who: Person = 'estimator') => {
  const res = await staffGet(who, `/api/v1/staff/estimate-versions/${versionId}/reminders`)
  expect(res.statusCode, res.body).toBe(200)
  return res.json<View>()
}
const releaseIt = (id: string, who: Person = 'estimator') =>
  staffWrite(who, 'POST', `/api/v1/staff/estimate-reminders/${id}/release`)
const dismissIt = (id: string, who: Person = 'estimator') =>
  staffWrite(who, 'POST', `/api/v1/staff/estimate-reminders/${id}/dismiss`)

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

describe('[HH-EST-14][FACT-REMINDER-CADENCES][OWN-DEC-132] reminder drafts at the configured cadence', () => {
  it('publishing schedules a first and a final draft 24 hours and 3 days after publishing; nothing is sent', async () => {
    const e = await published()
    await drain()
    const v = await versionRow(e.versionId)
    const jobs = await draftJobs(e.versionId)
    const publishedAt = (v.published_at as Date).getTime()
    expect(jobs.map((j) => [j.job_key.split(':').at(-1), j.run_at.getTime() - publishedAt, j.state])).toEqual([
      ['first', 24 * 3_600_000, 'queued'],
      ['final', 72 * 3_600_000, 'queued'],
    ])
    // Before the first is due there is no draft and nothing in the queue.
    expect(await reminders(e.versionId)).toEqual([])
    expect(await itemOf(e.versionId)).toEqual([])
    const shown = await view(e.versionId)
    expect(shown).toMatchObject({
      cadence: { state: 'CONFIGURED', firstHours: 24, finalHours: 72 },
      stoppedBy: null,
      reminders: [],
    })
    expect(new Date(shown.cadence.firstAt as string).getTime()).toBe(publishedAt + 24 * 3_600_000)
  })

  it('at its time the first reminder is a staff-released draft with a queue item; it never sends by itself', async () => {
    const e = await published()
    await drain()
    const sentBefore = fakeEmail.sent.length + fakeSms.sent.length
    await due(e.versionId, 'first')
    const rows = await reminders(e.versionId)
    expect(rows.map((r) => [r.subject_key, r.state, r.release, r.channel, r.locale, r.audience])).toEqual([
      [`estimate_reminder:${e.versionId}:first`, 'draft', 'staff_released', 'email', 'en', 'customer'],
    ])
    // The only value is the project workspace link: no amount, no estimate content, no code.
    expect(rows[0]?.variables).toEqual({ projectLink: `${SITE}/portal/p/${e.reference}` })
    expect(JSON.stringify(rows[0]?.variables)).not.toMatch(/420|\$/)
    const items = await itemOf(e.versionId)
    expect(items.map((i) => [i.reason, i.resolved_at, i.reference, i.assigned_staff_id])).toEqual([
      ['estimate_reminder_first', null, e.reference, staff.estimator.userId],
    ])
    // Time passes and the worker runs again: still a draft, nothing sent.
    await drain()
    expect((await reminders(e.versionId)).map((r) => r.state)).toEqual(['draft'])
    expect(fakeEmail.sent.length + fakeSms.sent.length).toBe(sentBefore)
    expect(await auditOf('estimate_reminder.drafted', rows[0]?.id as string)).toHaveLength(1)
  })

  it('[RULE-DECIDED-VALUES-ACTIVE] while the cadence is NOT CONFIGURED no reminder is scheduled', async () => {
    const current = await t.db
      .selectFrom('platform.policy_version')
      .select('value')
      .where('key', '=', 'reminders.cadences')
      .where('status', '=', 'active')
      .executeTakeFirstOrThrow()
    await setConfig('reminders.cadences', null, ['TEST-SYNTHETIC'])
    try {
      const e = await published()
      await drain()
      expect(await draftJobs(e.versionId)).toEqual([])
      expect((await view(e.versionId)).cadence).toEqual({ state: 'NOT_CONFIGURED' })
    } finally {
      await setConfig('reminders.cadences', current.value, ['OWN-DEC-132'])
    }
  })

  it('the final draft replaces a first draft nobody released (PROPOSED)', async () => {
    const e = await published()
    await drain()
    await due(e.versionId, 'first')
    await due(e.versionId, 'final')
    const rows = await reminders(e.versionId)
    expect(rows.map((r) => [r.subject_key.split(':').at(-1), r.state, r.error_code, r.cancelled_by])).toEqual([
      ['first', 'cancelled', 'replaced_by_final', 'system'],
      ['final', 'draft', null, null],
    ])
    expect((await itemOf(e.versionId)).map((i) => [i.reason, i.resolved_at])).toEqual([
      ['estimate_reminder_final', null],
    ])
  })

  it('a text when the customer prefers texts and the SMS opt-in is current; otherwise email', async () => {
    const e = await published({ preferred: 'text' })
    const stopped = await published({ preferred: 'text' })
    await smsConsent(stopped, false)
    await drain()
    await due(e.versionId, 'first')
    await due(stopped.versionId, 'first')
    expect((await reminders(e.versionId)).map((r) => [r.channel, r.destination, r.channel_permission])).toEqual([
      ['sms', e.phone, 'preferred'],
    ])
    expect((await reminders(stopped.versionId)).map((r) => [r.channel, r.channel_permission])).toEqual([
      ['email', 'permitted'],
    ])
  })
})

describe('[HH-EST-14][T65][HH-COM-05] stop rules at draft, release and send time', () => {
  it('approval before the reminder cancels it: no draft is prepared', async () => {
    const e = await published()
    await drain()
    await accept(e.versionId)
    await due(e.versionId, 'first')
    expect(await reminders(e.versionId)).toEqual([])
    expect(await itemOf(e.versionId)).toEqual([])
    const stopped = await auditOf('estimate_reminder.stop', e.versionId)
    expect(stopped.map((a) => a.summary)).toEqual([
      { messageKey: MESSAGE, step: 'first', reason: 'accepted', drafted: false },
    ])
    expect((await view(e.versionId, 'owner')).stoppedBy).toBe('accepted')
  })

  it('recheck at send time: a reminder released, then the estimate approved before the send, is cancelled', async () => {
    const e = await published()
    await drain()
    await due(e.versionId, 'first')
    const [draft] = await reminders(e.versionId)
    const sentBefore = fakeEmail.sent.length
    // The release is audited and its send job is due at once: an estimate reminder has no contact-hours wait.
    await sql`UPDATE platform.jobs SET run_at = now() + interval '1 hour' WHERE automation = 'notify.release'`.execute(
      t.db,
    )
    const res = await releaseIt(draft?.id as string)
    expect(res.statusCode, res.body).toBe(200)
    const job = await t.db
      .selectFrom('platform.jobs')
      .select(['run_at', 'created_at'])
      .where('job_key', '=', `notify.release:${draft?.id}`)
      .executeTakeFirstOrThrow()
    expect(Math.abs(job.run_at.getTime() - job.created_at.getTime())).toBeLessThan(5_000)
    expect((await reminders(e.versionId))[0]).toMatchObject({ state: 'queued', released_by: staff.estimator.userId })
    expect((await itemOf(e.versionId))[0]).toMatchObject({ resolution: 'released' })
    // The customer accepts before the send job runs.
    await accept(e.versionId)
    await drain()
    expect((await reminders(e.versionId)).map((r) => [r.state, r.error_code])).toEqual([['cancelled', 'accepted']])
    expect(fakeEmail.sent.length).toBe(sentBefore)
    const audit = await auditOf('notification.cancelled', draft?.id as string)
    expect(audit).toHaveLength(1)
  })

  it('a customer response cancels the waiting draft at once with its reason, and resolves the queue item', async () => {
    const e = await published()
    await drain()
    await due(e.versionId, 'first')
    await requestChanges(e)
    const rows = await reminders(e.versionId)
    expect(rows.map((r) => [r.state, r.error_code, r.cancelled_by])).toEqual([
      ['cancelled', 'customer_responded', 'system'],
    ])
    expect((await itemOf(e.versionId))[0]).toMatchObject({ resolution: 'stopped' })
    expect((await auditOf('estimate_reminder.stop', rows[0]?.id as string)).map((a) => a.summary)).toEqual([
      { messageKey: MESSAGE, step: 'first', channel: 'email', reason: 'customer_responded' },
    ])
    // The version is still the published offer, but the final reminder is not drafted either.
    expect((await versionRow(e.versionId)).state).toBe('published')
    await due(e.versionId, 'final')
    expect((await reminders(e.versionId)).map((r) => r.subject_key.split(':').at(-1))).toEqual(['first'])
    const res = await releaseIt(rows[0]?.id as string)
    expect(res.statusCode).toBe(409)
    expect(res.json<{ error: { fieldErrors: { code: string }[] } }>().error.fieldErrors[0]?.code).toBe(
      'REMINDER_NOT_DRAFT',
    )
  })

  it('a release rechecks the stop rule: approved meanwhile, it refuses and keeps the draft cancelled with the reason', async () => {
    const e = await published()
    await drain()
    await due(e.versionId, 'first')
    const [draft] = await reminders(e.versionId)
    // Approved after the draft was prepared (the approval transaction is TSK-0057's).
    await accept(e.versionId)
    const shown = await view(e.versionId)
    expect(shown.stoppedBy).toBe('accepted')
    expect(shown.reminders[0]?.actions).toEqual({ release: false, dismiss: true })
    const res = await releaseIt(draft?.id as string)
    expect(res.statusCode).toBe(409)
    expect(res.json<{ error: { fieldErrors: { field: string; code: string }[] } }>().error.fieldErrors).toEqual([
      { field: 'reminder', code: 'accepted', message: expect.any(String) as string },
    ])
    expect((await reminders(e.versionId)).map((r) => [r.state, r.error_code, r.released_by])).toEqual([
      ['cancelled', 'accepted', null],
    ])
    expect((await itemOf(e.versionId))[0]).toMatchObject({ resolution: 'stopped' })
    const denied = await auditOf('estimate_reminder.release', draft?.id as string)
    expect(denied.map((a) => a.result)).toEqual(['denied'])
    const jobs = await t.db
      .selectFrom('platform.jobs')
      .select('id')
      .where('job_key', '=', `notify.release:${draft?.id}`)
      .execute()
    expect(jobs).toEqual([])
  })

  it('an SMS STOP after the draft refuses the release (opt-out) and nothing is texted', async () => {
    const e = await published({ preferred: 'text' })
    await drain()
    await due(e.versionId, 'first')
    const [draft] = await reminders(e.versionId)
    expect(draft?.channel).toBe('sms')
    await smsConsent(e, false)
    const texted = fakeSms.sent.length
    const res = await releaseIt(draft?.id as string)
    expect(res.statusCode).toBe(409)
    expect(res.json<{ error: { fieldErrors: { code: string }[] } }>().error.fieldErrors[0]?.code).toBe('sms_opted_out')
    expect((await reminders(e.versionId)).map((r) => [r.state, r.error_code])).toEqual([['cancelled', 'sms_opted_out']])
    expect(fakeSms.sent.length).toBe(texted)
  })

  it('publishing a newer version stops the older version’s waiting draft (superseded); withdraw stops too', async () => {
    const e = await published()
    await drain()
    await due(e.versionId, 'first')
    const revised = await staffWrite('estimator', 'POST', `/api/v1/staff/estimate-versions/${e.versionId}/revise`)
    expect(revised.statusCode, revised.body).toBe(201)
    const v2 = revised.json<{ versionId: string }>().versionId
    const row = await publishable('estimator', v2)
    expect(
      (await staffWrite('estimator', 'POST', `/api/v1/staff/estimate-versions/${v2}/publish`, {}, row)).statusCode,
    ).toBe(200)
    expect((await reminders(e.versionId)).map((r) => [r.state, r.error_code])).toEqual([['cancelled', 'superseded']])
    expect((await itemOf(e.versionId))[0]).toMatchObject({ resolution: 'stopped' })

    await drain()
    await due(v2, 'first')
    expect((await reminders(v2)).map((r) => r.state)).toEqual(['draft'])
    const v2Row = await versionRow(v2)
    const out = await staffWrite(
      'estimator',
      'POST',
      `/api/v1/staff/estimate-versions/${v2}/withdraw`,
      { reason: 'Synthetic: the scope changed.' },
      v2Row.row_version,
    )
    expect(out.statusCode, out.body).toBe(200)
    expect((await reminders(v2)).map((r) => [r.state, r.error_code])).toEqual([['cancelled', 'withdrawn']])
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

describe('[HH-EST-14][HH-COM-09][T65] a released estimate reminder sends at once; a failed delivery is a staff issue', () => {
  it('sends at once at any hour; without approved wording it is recorded as not configured, never as sent', async () => {
    const e = await published()
    await drain()
    await due(e.versionId, 'first')
    const [draft] = await reminders(e.versionId)
    const res = await releaseIt(draft?.id as string, 'owner')
    expect(res.statusCode, res.body).toBe(200)
    await drain()
    const [row] = await reminders(e.versionId)
    // No template version of reminder.unanswered_estimate is released (OQ-ESTIMATE-REMINDER-WORDING).
    expect([row?.state, row?.error_code]).toEqual(['failed', 'template_not_configured'])
    const shown = await view(e.versionId)
    expect(shown.reminders[0]).toMatchObject({
      state: 'failed',
      reason: 'template_not_configured',
      releasedBy: { id: staff.owner.userId },
      actions: { release: false, dismiss: false },
    })
    // A failed delivery is never a customer non-response: the estimate is unchanged and the final is still drafted.
    expect((await versionRow(e.versionId)).state).toBe('published')
    expect(shown.stoppedBy).toBeNull()
    await due(e.versionId, 'final')
    expect((await reminders(e.versionId)).map((r) => [r.subject_key.split(':').at(-1), r.state])).toEqual([
      ['first', 'failed'],
      ['final', 'draft'],
    ])
  })
})

describe('[HH-EST-14][RULE-SERVER-AUTHZ] staff review, send and dismiss', () => {
  it('dismiss keeps the draft as cancelled with who dismissed it; a second dismiss is a conflict', async () => {
    const e = await published()
    await drain()
    await due(e.versionId, 'first')
    const [draft] = await reminders(e.versionId)
    const res = await dismissIt(draft?.id as string)
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json<View>().reminders[0]).toMatchObject({
      state: 'cancelled',
      reason: 'dismissed',
      cancelledBy: { id: staff.estimator.userId },
    })
    expect((await itemOf(e.versionId))[0]).toMatchObject({ resolution: 'dismissed' })
    const audit = await auditOf('estimate_reminder.dismiss', draft?.id as string)
    expect(audit.map((a) => [a.actor_kind, a.actor_id])).toEqual([['staff', staff.estimator.userId]])
    expect((await dismissIt(draft?.id as string)).statusCode).toBe(409)
  })

  it('an Estimator releases only reminders of estimates they prepared; Office may not open the estimate screen', async () => {
    const e = await published()
    await drain()
    await due(e.versionId, 'first')
    const [draft] = await reminders(e.versionId)
    expect((await releaseIt(draft?.id as string, 'other')).statusCode).toBe(403)
    expect((await dismissIt(draft?.id as string, 'other')).statusCode).toBe(403)
    const theirs = await view(e.versionId, 'other')
    expect(theirs.reminders[0]?.actions).toEqual({ release: false, dismiss: false })
    expect((await staffGet('office', `/api/v1/staff/estimate-versions/${e.versionId}/reminders`)).statusCode).toBe(403)
    expect((await reminders(e.versionId)).map((r) => r.state)).toEqual(['draft'])
    // Unknown deliveries and other messages' deliveries are not found.
    expect((await releaseIt(randomUUID(), 'owner')).statusCode).toBe(404)
  })

  it('a customer cannot reach the staff routes', async () => {
    const e = await published()
    const cookie = await customerCookie(e)
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/staff/estimate-versions/${e.versionId}/reminders`,
      headers: { cookie },
    })
    expect([401, 403, 404]).toContain(res.statusCode)
  })
})

describe('[HH-EST-14][T65] customer messages and question replies stop the waiting reminders (TSK-0049, TSK-0050, TSK-0051)', () => {
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
  async function waitingDraft(e: Published) {
    await drain()
    await due(e.versionId, 'first')
    const rows = await reminders(e.versionId)
    expect(rows.map((r) => r.state)).toEqual(['draft'])
    return rows[0]?.id as string
  }
  async function expectStopped(e: Published, reason: string) {
    expect((await reminders(e.versionId)).map((r) => [r.state, r.error_code, r.cancelled_by])).toEqual([
      ['cancelled', reason, 'system'],
    ])
    expect((await itemOf(e.versionId))[0]).toMatchObject({ resolution: 'stopped' })
    expect((await view(e.versionId, 'owner')).stoppedBy).toBe(reason)
    // The final reminder is not drafted either.
    await due(e.versionId, 'final')
    expect((await reminders(e.versionId)).map((r) => r.subject_key.split(':').at(-1))).toEqual(['first'])
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

  it('an inbound text matched to the project cancels the waiting draft at once; an SMS keyword does not', async () => {
    const e = await published()
    await verifyPhone(e.contactId)
    await waitingDraft(e)
    // HELP is consent handling (TSK-0048), not a response: the draft keeps waiting.
    const help = await textIn(e.phone, 'HELP')
    expect(help).toMatchObject({ link_state: 'matched', project_id: e.projectId, keyword: 'help' })
    expect(await reminderStopReason(t.db, e.versionId, new Date())).toBeNull()
    expect((await reminders(e.versionId)).map((r) => r.state)).toEqual(['draft'])
    const m = await textIn(e.phone, 'Synthetic: can we talk about the estimate?')
    expect(m).toMatchObject({ link_state: 'matched', project_id: e.projectId, keyword: null })
    await expectStopped(e, 'customer_message')
  })

  it('a message staff link to the project from Needs Linking cancels the waiting draft (TSK-0049 link)', async () => {
    const e = await published()
    await waitingDraft(e)
    // An unknown number: Needs Linking, on no project, so nothing stops yet.
    const m = await textIn(`+1502555${String(9000 + hook).slice(-4)}`, 'Synthetic: about my estimate')
    expect(m).toMatchObject({ link_state: 'needs_linking', project_id: null })
    expect((await reminders(e.versionId)).map((r) => r.state)).toEqual(['draft'])
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

  it('a message the customer writes in the portal cancels the waiting draft at once (TSK-0051 Messages)', async () => {
    const e = await published()
    await waitingDraft(e)
    const res = await portalMessage(e, 'Synthetic: could the work start in the afternoon?')
    expect(res.statusCode, res.body).toBe(201)
    await expectStopped(e, 'customer_message')
  })

  it('a reply to a question cancels the waiting draft at once (TSK-0051 question replies)', async () => {
    const e = await published()
    await waitingDraft(e)
    // A question HandyHub asked on the request and that is still open (synthetic fixture row).
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

  it('recheck at send time: a reminder released, then a customer message before the send, is cancelled', async () => {
    const e = await published()
    const id = await waitingDraft(e)
    const sentBefore = fakeEmail.sent.length
    // The worker does not run between the release and the message: the send job is still waiting.
    expect((await releaseIt(id)).statusCode).toBe(200)
    expect((await portalMessage(e, 'Synthetic: one more question first.')).statusCode).toBe(201)
    // Released (queued), not a draft: the send job's record check stops it.
    expect((await reminders(e.versionId)).map((r) => r.state)).toEqual(['queued'])
    await drain()
    expect((await reminders(e.versionId)).map((r) => [r.state, r.error_code])).toEqual([
      ['cancelled', 'customer_message'],
    ])
    expect(fakeEmail.sent.length).toBe(sentBefore)
  })
})
