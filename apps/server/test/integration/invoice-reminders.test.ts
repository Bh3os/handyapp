// Unpaid-invoice reminders and "Overdue—owner decision" against PostgreSQL 16 (TSK-0091; HH-FIN-19, HH-COM-05,
// HH-COM-06, HH-COM-13, T65, OWN-DEC-210, OWN-DEC-112, OWN-DEC-151, OWN-DEC-158, OWN-DEC-190, FACT-REMINDER-CADENCES,
// FACT-PAYMENT-DUE, RULE-SERVER-AUTHZ, RULE-MONEY-CENTS). The owner's test list of OWN-DEC-210: day 3, day 7, payment
// before dispatch, partial payment, disputed invoice, approved payment plan, revised due date, voided invoice,
// duplicate scheduled events, failed delivery and retry. Staff, customers, amounts and references are synthetic
// (RULE-SYNTHETIC-DATA); nothing reaches a provider. Two fixtures of this file's own throwaway database, never
// statements about the business: a synthetic "approved and attorney-reviewed" estimate terms version (restored to NOT
// CONFIGURED at the end), and the stand-in quality review of fixtures/quality-review.ts, so final invoices can be
// issued. Time passing is simulated by making a reminder's send job due now; no date is assumed (every expected time
// is computed from the invoice's own issue time).
import { randomUUID } from 'node:crypto'
import { loadServiceSeed, syncServices, withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import { localDateOf } from '@handyhub/domain'
import { addDays } from '@handyhub/domain/request-form'
import { ESTIMATE_TERMS } from '@handyhub/domain/legal'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import {
  unpaidReminderAutomations,
  unpaidReminderFailureItem,
  unpaidReminderRecordCheck,
  unpaidReminderValues,
} from '../../src/modules/finance/index.js'
import { invoiceDraftAutomation } from '../../src/modules/finance/invoice-automations.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { startCustomerSession } from '../../src/modules/identity/customer-sessions.js'
import { readCodeKey, type CodeKeySettings } from '../../src/modules/identity/index.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import { deliveryStatusAutomation, linkHostsOf, releaseAutomation } from '../../src/modules/notifications/index.js'
import { createAutomationRegistry, type Automation } from '../../src/platform/automation.js'
import { recordPolicyVersion } from '../../src/platform/config/index.js'
import { createWorker } from '../../src/platform/jobs.js'
import { runWithContext } from '../../src/platform/request-context.js'
import { createProviders } from '../../src/providers/index.js'
import { FakeObjectStorage } from '../../src/providers/r2/index.js'
import { readProviderSettings } from '../../src/providers/settings.js'
import { recordWebhookReceipt } from '../../src/providers/webhooks.js'
import { verifyCountyOf } from '../fixtures/county.js'
import { testConfig } from '../fixtures/env.js'
import { reviewOutcome, standInQualityReview } from '../fixtures/quality-review.js'
import { signInWithMfa } from '../fixtures/staff-mfa.js'
import { verifyPropertyZone } from '../fixtures/zones.js'

const SITE = 'https://site.example.test'
const ZONE = 'America/Kentucky/Louisville'
const KEY: CodeKeySettings = readCodeKey({
  HANDYHUB_ENV: 'ci',
  CODE_HASH_KEY: ['synthetic', 'unpaid', 'reminder', 'code', 'key', 'for', 'tests', 'only', '0091'].join('-'),
})
const pw = (n: number) => ['synthetic', 'unpaid', 'reminder', 'passphrase', String(n)].join(' ')
const PEOPLE = ['owner', 'office', 'estimator', 'worker'] as const
type Person = (typeof PEOPLE)[number]

let t: TestDatabase
let app: FastifyInstance
const storage = new FakeObjectStorage()
const cookies = {} as Record<Person, string>
const csrf = {} as Record<Person, string>
const ids = {} as Record<Person, string>

const p = createProviders(readProviderSettings({ HANDYHUB_ENV: 'ci' }))
if (!p.fakes.email || !p.email || !p.sms) throw new Error('ci uses the fakes')
const fakeEmail = p.fakes.email
const senders = { email: p.email, sms: p.sms, linkHosts: linkHostsOf(SITE, undefined) }
const fast = (a: Automation): Automation => ({ ...a, retry: { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 1 } })
// The one notify.release registration, as automations.ts registers it, with the invoice's send-time check.
const release = releaseAutomation(senders, {
  recordChecks: { invoice: unpaidReminderRecordCheck },
  failureItem: unpaidReminderFailureItem,
  values: unpaidReminderValues(SITE),
})
const registry = createAutomationRegistry([
  fast(invoiceDraftAutomation()),
  ...unpaidReminderAutomations().map(fast),
  fast(release),
  deliveryStatusAutomation(),
])

/** Runs the worker until nothing is left to do now. */
async function drain() {
  const w = createWorker({ db: t.db, registry })
  for (let i = 0; i < 30; i++) {
    const r = await w.runOnce()
    if (r.dispatched + r.succeeded + r.retried + r.failed + r.cancelled === 0) return
    await new Promise((r) => setTimeout(r, 5))
  }
}

async function signIn(who: Person): Promise<[string, string]> {
  const res = await signInWithMfa(app, {
    method: 'POST',
    url: '/api/v1/staff/auth/sign-in',
    payload: { email: `${who}-unpaid-reminders@example.test`, password: pw(1) },
  })
  expect(res.statusCode, res.body).toBe(200)
  const cookie = String(res.headers['set-cookie']).split(';')[0] as string
  const session = await app.inject({ method: 'GET', url: '/api/v1/staff/auth/session', headers: { cookie } })
  return [cookie, session.json<{ csrfToken: string }>().csrfToken]
}

beforeAll(async () => {
  t = await createTestDatabase()
  await syncServices(t.db, loadServiceSeed())
  app = await buildApp({ config: testConfig({ TRUST_PROXY_HOPS: '1' }), api: { db: t.db, codeKey: KEY, storage } })
  const hash = await hashPassword(pw(1))
  await withTx(t.db, async (tx) => {
    for (const who of PEOPLE) {
      const user = await createStaffUser(tx, {
        email: `${who}-unpaid-reminders@example.test`,
        displayName: `Synthetic ${who}`,
        locale: 'en',
        role: who,
        issuedBy: 'test',
      })
      await setPasswordHash(tx, user.id, hash)
      ids[who] = user.id
    }
  })
  for (const who of PEOPLE) [cookies[who], csrf[who]] = await signIn(who)
  await recordPolicyVersion(t.db, {
    key: 'legal.estimate_terms',
    value: {
      documentId: ESTIMATE_TERMS.documentId,
      status: 'approved',
      attorneyReviewed: true,
      preparedOn: ESTIMATE_TERMS.preparedOn,
      contentSha256: ESTIMATE_TERMS.contentSha256,
    } as never,
    sourceIds: ['TEST-SYNTHETIC'],
    changedBy: 'test',
    reason: 'synthetic test configuration',
  })
  await standInQualityReview(t.db)
})
afterAll(async () => {
  if (t)
    await recordPolicyVersion(t.db, {
      key: 'legal.estimate_terms',
      value: null,
      sourceIds: ['TEST-SYNTHETIC'],
      changedBy: 'test',
      reason: 'restore NOT CONFIGURED after the synthetic fixture',
    })
  await app?.close()
  await t?.drop()
})

let seq = 0
const key = (what: string) => `synthetic-${what}-${String(++seq).padStart(6, '0')}-${randomUUID()}`
const staffWrite = (who: Person, method: 'POST' | 'PUT', url: string, payload: unknown, extra = {}) =>
  app.inject({
    method,
    url: `/api/v1${url}`,
    payload: payload as object,
    headers: { cookie: cookies[who], 'x-csrf-token': csrf[who], 'idempotency-key': key('staff'), ...extra },
  })
const staffGet = (who: Person, url: string) =>
  app.inject({ method: 'GET', url: `/api/v1${url}`, headers: { cookie: cookies[who] } })
const codes = (res: { json: <T>() => T }) =>
  res.json<{ error: { fieldErrors: { code: string }[] } }>().error.fieldErrors.map((f) => f.code)
const today = () => localDateOf(new Date(), ZONE)
const ALL_OK = Object.fromEntries(
  ['coverage', 'service_fit', 'essential_facts', 'urgency', 'site_visit_need', 'staff_equipment', 'risk_flags'].map(
    (c) => [c, { outcome: 'ok' }],
  ),
)

let ip = 40
/** A qualified request whose project is ready for an online estimate. */
async function readyRequest() {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/public/requests',
    headers: { 'idempotency-key': key('submit'), 'x-forwarded-for': `198.51.100.${++ip}` },
    payload: {
      formVersion: 'test-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-01' }],
      notSure: false,
      description: 'Synthetic unpaid reminder project.',
      answers: [],
      property: {
        street: `${seq} Synthetic Reminder Lane`,
        city: 'Testville',
        state: 'ky',
        zip: '40000',
        propertyType: 'house',
      },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'online',
      contact: {
        fullName: 'Synthetic Reminder Customer',
        email: `reminder-${seq}-${randomUUID().slice(0, 8)}@example.test`,
        phone: '(502) 555-0186',
        preferredChannel: 'email',
      },
      smsOptIn: false,
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
  await verifyCountyOf(t.db, row.project_id)
  const grant = await t.db
    .selectFrom('identity.project_access_grants')
    .select('id')
    .where('request_id', '=', row.id)
    .executeTakeFirstOrThrow()
  const q = await staffWrite(
    'owner',
    'PUT',
    `/staff/requests/${row.id}/qualification`,
    { checks: ALL_OK },
    {
      'if-match': '"0"',
    },
  )
  expect(q.statusCode, q.body).toBe(200)
  const moved = await staffWrite(
    'owner',
    'POST',
    `/staff/requests/${row.id}/actions/online-estimate`,
    { workPackages: ['SVC-DW-01'] },
    { 'if-match': `"${row.state_version}"` },
  )
  expect(moved.statusCode, moved.body).toBe(200)
  await verifyPropertyZone(t.db, { projectId: row.project_id })
  const project = await t.db
    .selectFrom('crm.projects')
    .select('reference')
    .where('id', '=', row.project_id)
    .executeTakeFirstOrThrow()
  return {
    projectId: row.project_id,
    reference,
    projectReference: project.reference,
    contactId: row.contact_id,
    grantId: grant.id,
  }
}

let nets = 0
type Invoice = { id: string; number: string; state: string; version: number; payments: { id: string }[] }

/** An issued final invoice of $500.00 (under the deposit threshold), with the job and its customer email. */
async function issuedInvoice() {
  const client = `2001:db8:91:${++nets}::1`
  const r = await readyRequest()
  const created = await staffWrite('estimator', 'POST', `/staff/projects/${r.projectId}/estimates`, {})
  expect(created.statusCode, created.body).toBe(201)
  const c = created.json<{ number: string; versionId: string }>()
  const view = (await staffGet('estimator', `/staff/estimate-versions/${c.versionId}`)).json<{
    rowVersion: number
    workPackages: { id: string }[]
  }>()
  const saved = await staffWrite(
    'estimator',
    'PUT',
    `/staff/estimate-versions/${c.versionId}/draft`,
    {
      lines: [
        {
          kind: 'base',
          workPackageId: view.workPackages[0]?.id,
          description: 'Synthetic patch repair',
          quantity: '1',
          unit: 'job',
          unitPriceCents: 50_000,
        },
      ],
      texts: { exclusions: ['Synthetic: nothing else'] },
    },
    { 'if-match': `"${view.rowVersion}"` },
  )
  expect(saved.statusCode, saved.body).toBe(200)
  const pub = await staffWrite(
    'estimator',
    'POST',
    `/staff/estimate-versions/${c.versionId}/publish`,
    {},
    {
      'if-match': `"${saved.json<{ rowVersion: number }>().rowVersion}"`,
    },
  )
  expect(pub.statusCode, pub.body).toBe(200)
  const s = await withTx(t.db, (tx) =>
    startCustomerSession(tx, {
      contactRef: r.contactId,
      via: 'grant',
      projectIds: [r.projectId],
      verifiedAt: new Date(),
      grantId: r.grantId,
    }),
  )
  const cookie = `__Host-hh_customer=${s.token}`
  const url = `/api/v1/customer/projects/${r.reference}/estimates/${c.number}/versions/1`
  const detail = (await app.inject({ method: 'GET', url, headers: { cookie } })).json<{
    totalCents: number
    approval: { contentDigest: string }
  }>()
  const approved = await app.inject({
    method: 'POST',
    url: `${url}/approve`,
    payload: {
      contentDigest: detail.approval.contentDigest,
      options: [],
      totalCents: detail.totalCents,
      depositCents: null,
      termsDocumentId: ESTIMATE_TERMS.documentId,
      termsSha256: ESTIMATE_TERMS.contentSha256,
      acceptTerms: true,
      fullName: 'Synthetic Reminder Customer',
    },
    headers: { cookie, 'idempotency-key': key('customer'), 'x-forwarded-for': client },
  })
  expect(approved.statusCode, approved.body).toBe(201)
  const job = await t.db
    .selectFrom('work.jobs')
    .select('id')
    .where('project_id', '=', r.projectId)
    .executeTakeFirstOrThrow()
  await drain()
  await reviewOutcome(t.db, job.id, 'passed')
  const draft = (await staffGet('office', `/staff/jobs/${job.id}/invoices`)).json<{ final: Invoice }>().final
  const issued = await staffWrite(
    'office',
    'POST',
    `/staff/invoices/${draft.id}/issue`,
    {},
    {
      'if-match': `"${draft.version}"`,
    },
  )
  expect(issued.statusCode, issued.body).toBe(200)
  const inv = issued.json<{ final: Invoice }>().final
  const contact = await t.db
    .selectFrom('crm.contacts')
    .select('email')
    .where('id', '=', r.contactId)
    .executeTakeFirstOrThrow()
  const row = await t.db
    .selectFrom('finance.invoices')
    .select('issued_at')
    .where('id', '=', inv.id)
    .executeTakeFirstOrThrow()
  // The invoice.issued event schedules its reminders.
  await drain()
  return { ...r, jobId: job.id, invoice: inv, email: contact.email, issuedAt: new Date(row.issued_at as Date) }
}

const reminderRows = (invoiceId: string) =>
  t.db
    .selectFrom('platform.message_deliveries')
    .selectAll()
    .where('record_type', '=', 'invoice')
    .where('record_id', '=', invoiceId)
    .orderBy('seq')
    .execute()
const stageOf = (subject: string) => Number(/:s([12]):/.exec(subject)?.[1] ?? 0)
const auditOf = (action: string, targetId: string) =>
  t.db
    .selectFrom('platform.audit_events')
    .selectAll()
    .where('action', '=', action)
    .where('target_id', '=', targetId)
    .orderBy('seq')
    .execute()
const itemOf = (type: string, invoiceId: string) =>
  t.db
    .selectFrom('ops.queue_items')
    .selectAll()
    .where('type', '=', type)
    .where('subject_id', '=', invoiceId)
    .orderBy('opened_at')
    .execute()
const mailTo = (email: string) => fakeEmail.sent.filter((m) => m.to === email)

/** Time passes: the invoice's waiting reminder of this stage (or every waiting one) becomes due now and is sent. */
async function due(invoiceId: string, stage?: 1 | 2) {
  await sql`UPDATE platform.jobs SET run_at = now() WHERE automation = 'notify.release' AND state = 'queued'
            AND target_id IN (SELECT id::text FROM platform.message_deliveries
                               WHERE record_type = 'invoice' AND record_id = ${invoiceId}
                                 AND (${stage ?? null}::int IS NULL OR subject_key LIKE ${`%:s${stage ?? 0}:%`}))`.execute(
    t.db,
  )
  await drain()
}
/** The provider reports the invoice's handed-over reminders sent (a Resend status webhook). */
async function reportSent(invoiceId: string) {
  for (const d of await reminderRows(invoiceId)) {
    if (!d.provider_message_id || d.state !== 'queued') continue
    await runWithContext({ requestId: `req-unpaid-reminders-${randomUUID()}` }, () =>
      withTx(t.db, (tx) =>
        recordWebhookReceipt(tx, {
          provider: 'resend',
          deliveryId: `evt-unpaid-reminders-${randomUUID()}`,
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
/** Plans the invoice's reminders again, as a duplicated or replayed event would (the migration's plan job). */
async function planAgain(invoiceId: string) {
  await t.db
    .insertInto('platform.jobs')
    .values({
      automation: 'invoice.reminder_plan',
      job_key: `invoice.reminder_plan:${invoiceId}:${randomUUID()}`,
      target_type: 'invoice',
      target_id: invoiceId,
      payload: '{}',
      request_id: 'test-plan-again',
      run_at: new Date(),
      max_attempts: 3,
    })
    .execute()
  await drain()
}

type View = {
  dueOn: string | null
  dueRevised: boolean
  stoppedBy: string | null
  stageDueAt: { stage: number; dueAt: string | null }[]
  reminders: { id: string; stage: number | null; release: string; state: string; reason: string | null }[]
  steps: { id: string; kind: string; ended: boolean; note: string | null }[]
  review: boolean
  overdue: boolean
  actions: { recordStep: boolean; releaseFollowUp: boolean; followUpBlockedBy: string | null; decideOverdue: boolean }
}
const view = async (invoiceId: string, who: Person = 'office') => {
  const res = await staffGet(who, `/staff/invoices/${invoiceId}/reminders`)
  expect(res.statusCode, res.body).toBe(200)
  return res.json<View>()
}
const step = (who: Person, invoiceId: string, body: Record<string, unknown>) =>
  staffWrite(who, 'POST', `/staff/invoices/${invoiceId}/reminders/steps`, body)
const pay = (invoiceId: string, amountCents: number) =>
  staffWrite('office', 'POST', `/staff/invoices/${invoiceId}/payments`, {
    method: 'cash',
    amountCents,
    receivedOn: today(),
  })
const localParts = (d: Date) => {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  const x = Object.fromEntries(f.formatToParts(d).map((p) => [p.type, p.value]))
  return { date: `${x['year']}-${x['month']}-${x['day']}`, time: `${x['hour']}:${x['minute']}` }
}

describe('[HH-FIN-19][OWN-DEC-210] automatic reminders 3 and 7 calendar days after the due date', () => {
  it('day 3 and day 7: one email each, then Overdue—owner decision; no amount, email only, no SMS', async () => {
    const inv = await issuedInvoice()
    const rows = await reminderRows(inv.invoice.id)
    // Email only (SMS reminders stay off until A2P 10DLC, OWN-DEC-190); one queued delivery per stage.
    expect(rows.map((r) => [stageOf(r.subject_key), r.channel, r.state, r.release])).toEqual([
      [1, 'email', 'queued', 'automatic'],
      [2, 'email', 'queued', 'automatic'],
    ])
    // Due on receipt: the due date is the business date of issue; 3 and 7 calendar days later at the opening of the
    // contact hours (PROPOSED), in America/Kentucky/Louisville.
    const issuedOn = localDateOf(inv.issuedAt, ZONE)
    expect(rows.map((r) => localParts(r.scheduled_at as Date))).toEqual([
      { date: addDays(issuedOn, 3), time: '08:00' },
      { date: addDays(issuedOn, 7), time: '08:00' },
    ])
    expect(await auditOf('notification.scheduled', rows[0]?.id as string)).toHaveLength(1)
    const v = await view(inv.invoice.id)
    expect(v).toMatchObject({ dueOn: issuedOn, dueRevised: false, stoppedBy: null, review: false, overdue: false })
    expect(v.actions).toMatchObject({
      recordStep: true,
      releaseFollowUp: false,
      followUpBlockedBy: 'automatic_reminders_pending',
    })

    // Day 3.
    await due(inv.invoice.id, 1)
    let mail = mailTo(inv.email)
    expect(mail).toHaveLength(1)
    expect(mail[0]?.subject).toBe(`HandyHub | Reminder About Invoice #${inv.invoice.number}`)
    const body = mail[0]?.text ?? ''
    expect(body).toMatch(/^Hi Synthetic,/)
    expect(body).toContain(`invoice #${inv.invoice.number}`)
    expect(body).toContain(`${SITE}/portal/p/${inv.projectReference}/documents`)
    expect(body).toContain('If you have already paid')
    expect(body).toContain('The HandyHub Team')
    // No amount, no fee, no threat (OWN-DEC-158, OWN-DEC-210).
    expect(body.replaceAll(inv.invoice.number, '').replaceAll(inv.projectReference, '')).not.toMatch(
      /\$|500|late fee|collection/i,
    )
    expect(mail[0]?.html ?? '').not.toContain('$')
    expect((await view(inv.invoice.id)).overdue).toBe(false)

    // Day 7, actually sent (the provider's status): the invoice goes to Owner Decisions.
    await due(inv.invoice.id, 2)
    mail = mailTo(inv.email)
    expect(mail).toHaveLength(2)
    expect(await itemOf('invoice_overdue_decision', inv.invoice.id)).toHaveLength(0)
    await reportSent(inv.invoice.id)
    const [item] = await itemOf('invoice_overdue_decision', inv.invoice.id)
    expect(item).toMatchObject({ reason: 'overdue_owner_decision', resolved_at: null, project_id: inv.projectId })
    const owners = await view(inv.invoice.id, 'owner')
    expect(owners).toMatchObject({ overdue: true, actions: { decideOverdue: true, releaseFollowUp: true } })
    expect((await view(inv.invoice.id, 'office')).actions.decideOverdue).toBe(false)

    // The Owner's decision (invoice.decide_overdue: the Owner only), with a note; the item resolves.
    const note = { note: 'Synthetic: keep following up by email.' }
    expect(
      (await staffWrite('office', 'POST', `/staff/invoices/${inv.invoice.id}/overdue-decision`, note)).statusCode,
    ).toBe(403)
    const decided = await staffWrite('owner', 'POST', `/staff/invoices/${inv.invoice.id}/overdue-decision`, note)
    expect(decided.statusCode, decided.body).toBe(200)
    expect(decided.json<View>()).toMatchObject({ overdue: false })
    expect((await itemOf('invoice_overdue_decision', inv.invoice.id))[0]).toMatchObject({ resolution: 'owner_decided' })
    expect(
      codes(await staffWrite('owner', 'POST', `/staff/invoices/${inv.invoice.id}/overdue-decision`, note)),
    ).toEqual(['NOT_OVERDUE'])

    // Further follow-up is released by staff: one email in the follow-up wording, sent at once.
    const released = await staffWrite('office', 'POST', `/staff/invoices/${inv.invoice.id}/reminders/follow-up`, {})
    expect(released.statusCode, released.body).toBe(201)
    expect(
      codes(await staffWrite('office', 'POST', `/staff/invoices/${inv.invoice.id}/reminders/follow-up`, {})),
    ).toEqual(['FOLLOW_UP_WAITING'])
    await drain()
    mail = mailTo(inv.email)
    expect(mail).toHaveLength(3)
    expect(mail[2]?.subject).toBe(`HandyHub | Following Up on Invoice #${inv.invoice.number}`)
    expect(mail[2]?.text).not.toMatch(/\$/)
    const after = await view(inv.invoice.id)
    expect(after.reminders.map((r) => [r.stage, r.release])).toEqual([
      [1, 'automatic'],
      [2, 'automatic'],
      [null, 'staff_released'],
    ])
    expect(after.steps.map((s) => s.kind)).toEqual(['overdue_decided', 'follow_up_released'])
    // No text was ever drafted or sent.
    expect((await reminderRows(inv.invoice.id)).every((r) => r.channel === 'email')).toBe(true)
  })

  it('duplicate scheduled events: still one email per invoice and stage', async () => {
    const inv = await issuedInvoice()
    await planAgain(inv.invoice.id)
    await planAgain(inv.invoice.id)
    expect(await reminderRows(inv.invoice.id)).toHaveLength(2)
    await due(inv.invoice.id, 1)
    // The stage's send job replayed, and the plan replayed after the send: nothing more is sent or scheduled.
    const [first] = await reminderRows(inv.invoice.id)
    await sql`UPDATE platform.jobs SET state = 'queued', run_at = now(), attempts = 0, finished_at = NULL
              WHERE automation = 'notify.release' AND target_id = ${first?.id as string}`.execute(t.db)
    await drain()
    await planAgain(inv.invoice.id)
    const rows = await reminderRows(inv.invoice.id)
    expect(rows.map((r) => stageOf(r.subject_key))).toEqual([1, 2])
    expect(mailTo(inv.email)).toHaveLength(1)
    const skipped = await auditOf('invoice_reminder.not_scheduled', inv.invoice.id)
    expect(skipped.map((a) => (a.summary as { reason: string }).reason)).toContain('stage_already_sent')
  })
})

describe('[HH-FIN-19][HH-COM-05][T65][OWN-DEC-210] stop and suspension rules', () => {
  it('a payment before the reminder is sent cancels it; the status is rechecked right before sending', async () => {
    const inv = await issuedInvoice()
    // A partial payment suspends at once: the waiting reminders are cancelled in the payment's transaction.
    expect((await pay(inv.invoice.id, 10_000)).statusCode).toBe(201)
    expect((await reminderRows(inv.invoice.id)).map((r) => [r.state, r.error_code])).toEqual([
      ['cancelled', 'payment_recorded'],
      ['cancelled', 'payment_recorded'],
    ])
    await due(inv.invoice.id)
    expect(mailTo(inv.email)).toHaveLength(0)
  })

  it('the send-time recheck stops a reminder whose payment arrived by a path that did not cancel it', async () => {
    const inv = await issuedInvoice()
    // A payment written straight to the ledger (no reminder sync ran): the reminders still wait.
    await withTx(t.db, async (tx) => {
      const payment = await tx
        .insertInto('finance.payments')
        .values({
          project_id: inv.projectId,
          job_id: inv.jobId,
          method: 'cash',
          amount_cents: 10_000,
          received_on: today(),
          collector_staff_id: ids.office,
          recorded_by: ids.office,
          state: 'recorded',
        })
        .returning('id')
        .executeTakeFirstOrThrow()
      await tx
        .insertInto('finance.payment_allocations')
        .values({ payment_id: payment.id, invoice_id: inv.invoice.id, amount_cents: 10_000, allocated_by: ids.office })
        .execute()
    })
    expect((await reminderRows(inv.invoice.id)).map((r) => r.state)).toEqual(['queued', 'queued'])
    // Checked again right before sending: suspended, nothing sent.
    await due(inv.invoice.id, 1)
    expect((await reminderRows(inv.invoice.id))[0]).toMatchObject({
      state: 'cancelled',
      error_code: 'payment_recorded',
    })
    expect(mailTo(inv.email)).toHaveLength(0)
  })

  it('partial payment: suspended, never restarted by itself; staff confirm the next step', async () => {
    const inv = await issuedInvoice()
    expect((await pay(inv.invoice.id, 20_000)).statusCode).toBe(201)
    // A replayed plan restarts nothing.
    await planAgain(inv.invoice.id)
    expect((await reminderRows(inv.invoice.id)).every((r) => r.state === 'cancelled')).toBe(true)
    const v = await view(inv.invoice.id)
    expect(v).toMatchObject({ stoppedBy: 'payment_recorded', review: true, actions: { releaseFollowUp: true } })
    // The staff queue item: Payment reminders to review (the Owner and Office).
    const [review] = await itemOf('invoice_reminder_review', inv.invoice.id)
    expect(review).toMatchObject({ reason: 'payment_recorded', resolved_at: null })
    const queue = await staffGet('office', '/staff/queue')
    expect(queue.statusCode).toBe(200)
    expect(JSON.stringify(queue.json())).toContain('invoice_reminder_review')
    // Staff confirm the next step with a revised due date: the stages restart from it, the review resolves.
    const due5 = addDays(today(), 5)
    const revised = await step('office', inv.invoice.id, {
      kind: 'revised_due_date',
      dueOn: due5,
      note: 'Synthetic: the customer pays the rest by then.',
    })
    expect(revised.statusCode, revised.body).toBe(201)
    expect(revised.json<View>()).toMatchObject({ dueOn: due5, dueRevised: true, stoppedBy: null, review: false })
    expect((await itemOf('invoice_reminder_review', inv.invoice.id))[0]).toMatchObject({
      resolution: 'next_step_recorded',
    })
    const rows = (await reminderRows(inv.invoice.id)).filter((r) => r.state === 'queued')
    expect(rows.map((r) => [r.subject_key.slice(-6), localParts(r.scheduled_at as Date).date])).toEqual([
      [':s1:d1', addDays(due5, 3)],
      [':s2:d1', addDays(due5, 7)],
    ])
    // Another payment suspends them again.
    expect((await pay(inv.invoice.id, 5_000)).statusCode).toBe(201)
    expect((await reminderRows(inv.invoice.id)).filter((r) => r.state === 'queued')).toHaveLength(0)
  })

  it('a disputed payment stops the reminders', async () => {
    const inv = await issuedInvoice()
    expect((await pay(inv.invoice.id, 10_000)).statusCode).toBe(201)
    const paymentId = (
      (await staffGet('office', `/staff/jobs/${inv.jobId}/invoices`)).json<{ final: Invoice }>().final.payments[0] as {
        id: string
      }
    ).id
    // The Owner restarts the stages with a revised due date; then the payment is disputed.
    expect(
      (await step('owner', inv.invoice.id, { kind: 'revised_due_date', dueOn: today(), note: 'Synthetic.' }))
        .statusCode,
    ).toBe(201)
    expect((await reminderRows(inv.invoice.id)).filter((r) => r.state === 'queued')).toHaveLength(2)
    await sql`UPDATE identity.staff_sessions SET authenticated_at = now() WHERE staff_user_id = ${ids.owner}
              AND revoked_at IS NULL`.execute(t.db)
    const opened = await staffWrite('owner', 'POST', `/staff/payments/${paymentId}/adjustments`, {
      kind: 'dispute_opened',
      reason: 'Synthetic: the customer disputed the charge',
    })
    expect(opened.statusCode, opened.body).toBe(200)
    const waiting = (await reminderRows(inv.invoice.id)).filter((r) => r.subject_key.endsWith(':d1'))
    expect(waiting.map((r) => [r.state, r.error_code])).toEqual([
      ['cancelled', 'payment_disputed'],
      ['cancelled', 'payment_disputed'],
    ])
    expect((await view(inv.invoice.id)).stoppedBy).toBe('payment_disputed')
    expect(
      codes(await staffWrite('office', 'POST', `/staff/invoices/${inv.invoice.id}/reminders/follow-up`, {})),
    ).toEqual(['PAYMENT_DISPUTED'])
  })

  it('an approved payment plan or a collection hold stops them; ending it restarts nothing', async () => {
    const inv = await issuedInvoice()
    const plan = await step('office', inv.invoice.id, {
      kind: 'payment_plan',
      note: 'Synthetic: three monthly payments.',
    })
    expect(plan.statusCode, plan.body).toBe(201)
    expect(plan.json<View>().stoppedBy).toBe('payment_plan')
    expect((await reminderRows(inv.invoice.id)).map((r) => [r.state, r.error_code])).toEqual([
      ['cancelled', 'payment_plan'],
      ['cancelled', 'payment_plan'],
    ])
    expect(codes(await step('office', inv.invoice.id, { kind: 'payment_plan', note: 'Synthetic: again.' }))).toEqual([
      'ARRANGEMENT_ACTIVE',
    ])
    const planId = plan.json<View>().steps[0]?.id as string
    const ended = await step('office', inv.invoice.id, {
      kind: 'arrangement_ended',
      endsStepId: planId,
      note: 'Synthetic: the plan ended.',
    })
    expect(ended.statusCode, ended.body).toBe(201)
    expect(ended.json<View>()).toMatchObject({ stoppedBy: null })
    expect(ended.json<View>().steps.find((s) => s.id === planId)?.ended).toBe(true)
    await planAgain(inv.invoice.id)
    // The cancelled stages stay cancelled (no automatic restart); a hold works the same way.
    expect((await reminderRows(inv.invoice.id)).filter((r) => r.state === 'queued')).toHaveLength(0)
    const hold = await step('owner', inv.invoice.id, { kind: 'collection_hold', note: 'Synthetic: on hold.' })
    expect(hold.json<View>().stoppedBy).toBe('collection_hold')
    // Who may record steps: the Owner and Office (payment_reminder.release), never the Estimator or a Worker.
    for (const who of ['estimator', 'worker'] as const) {
      expect((await step(who, inv.invoice.id, { kind: 'payment_plan', note: 'x' })).statusCode, who).toBe(403)
      expect((await staffGet(who, `/staff/invoices/${inv.invoice.id}/reminders`)).statusCode, who).toBe(403)
    }
  })

  it('a revised due date moves the stages not yet sent; past dates are refused', async () => {
    const inv = await issuedInvoice()
    await due(inv.invoice.id, 1)
    expect(mailTo(inv.email)).toHaveLength(1)
    expect(
      codes(await step('office', inv.invoice.id, { kind: 'revised_due_date', dueOn: addDays(today(), -1), note: 'x' })),
    ).toEqual(['DUE_DATE_IN_PAST'])
    expect(
      codes(
        await step('office', inv.invoice.id, { kind: 'revised_due_date', dueOn: addDays(today(), 400), note: 'x' }),
      ),
    ).toEqual(['DUE_DATE_TOO_FAR'])
    const due10 = addDays(today(), 10)
    const revised = await step('office', inv.invoice.id, { kind: 'revised_due_date', dueOn: due10, note: 'Synthetic.' })
    expect(revised.statusCode, revised.body).toBe(201)
    const rows = await reminderRows(inv.invoice.id)
    // Stage 1 was sent once and is never sent again; stage 2 waits for the revised date + 7 days.
    expect(
      rows.map((r) => [
        r.subject_key.slice(-6),
        r.state === 'queued' && r.provider_message_id ? 'handed' : r.state,
        r.error_code,
      ]),
    ).toEqual([
      [':s1:d0', 'handed', null],
      [':s2:d0', 'cancelled', 'due_date_revised'],
      [':s2:d1', 'queued', null],
    ])
    expect(localParts(rows[2]?.scheduled_at as Date).date).toBe(addDays(due10, 7))
    await due(inv.invoice.id)
    expect(mailTo(inv.email)).toHaveLength(2)
    expect((await reminderRows(inv.invoice.id))[2]?.provider_message_id).not.toBeNull()
  })

  it('a voided invoice gets no reminder', async () => {
    const inv = await issuedInvoice()
    await sql`UPDATE identity.staff_sessions SET authenticated_at = now() WHERE staff_user_id = ${ids.owner}
              AND revoked_at IS NULL`.execute(t.db)
    const voided = await staffWrite('owner', 'POST', `/staff/invoices/${inv.invoice.id}/void`, {
      reason: 'Synthetic: issued by mistake',
    })
    expect(voided.statusCode, voided.body).toBe(200)
    expect((await reminderRows(inv.invoice.id)).map((r) => [r.state, r.error_code])).toEqual([
      ['cancelled', 'invoice_voided'],
      ['cancelled', 'invoice_voided'],
    ])
    await due(inv.invoice.id)
    expect(mailTo(inv.email)).toHaveLength(0)
    expect((await view(inv.invoice.id)).stoppedBy).toBe('invoice_voided')
  })

  it('paid in full after the second reminder: the Owner decision item resolves', async () => {
    const inv = await issuedInvoice()
    await due(inv.invoice.id)
    await reportSent(inv.invoice.id)
    expect((await itemOf('invoice_overdue_decision', inv.invoice.id))[0]?.resolved_at).toBeNull()
    expect((await pay(inv.invoice.id, 50_000)).statusCode).toBe(201)
    expect((await itemOf('invoice_overdue_decision', inv.invoice.id))[0]).toMatchObject({
      resolution: 'invoice_settled',
    })
    expect((await view(inv.invoice.id)).stoppedBy).toBe('invoice_paid')
  })
})

describe('[HH-FIN-19][HH-COM-02][OWN-DEC-210] failed delivery and retry', () => {
  it('a temporary failure is retried with the same key and sent once; a failure is a staff issue, never shown sent', async () => {
    const inv = await issuedInvoice()
    // A temporary provider failure, then success: the job retries, one email.
    fakeEmail.script({ outcome: 'retryable_error', errorCode: 'http_503' })
    const calls = fakeEmail.calls.length
    await due(inv.invoice.id, 1)
    expect(fakeEmail.calls.length - calls).toBe(2)
    expect(mailTo(inv.email)).toHaveLength(1)
    // A definite failure: the delivery is failed with its reason and a delivery issue opens; no Overdue item.
    fakeEmail.script({ outcome: 'rejected', errorCode: 'http_422_validation_error' })
    await due(inv.invoice.id, 2)
    const second = (await reminderRows(inv.invoice.id))[1]
    expect(second).toMatchObject({ state: 'failed', error_code: 'http_422_validation_error', sent_at: null })
    const [issue] = await t.db
      .selectFrom('ops.queue_items')
      .selectAll()
      .where('type', '=', 'delivery_failed')
      .where('subject_id', '=', second?.id as string)
      .execute()
    expect(issue).toMatchObject({ reason: 'delivery_failed', resolved_at: null, project_id: inv.projectId })
    expect(await itemOf('invoice_overdue_decision', inv.invoice.id)).toHaveLength(0)
    // The stage is used: a replayed plan never schedules it again.
    await planAgain(inv.invoice.id)
    expect(await reminderRows(inv.invoice.id)).toHaveLength(2)
    // Staff Retry sends it (rechecked), once.
    const retried = await staffWrite('office', 'POST', `/staff/message-deliveries/${second?.id}/retry`, {})
    expect(retried.statusCode, retried.body).toBe(200)
    await drain()
    expect(mailTo(inv.email)).toHaveLength(2)
    await reportSent(inv.invoice.id)
    expect((await itemOf('invoice_overdue_decision', inv.invoice.id))[0]?.resolved_at).toBeNull()
  })
})
