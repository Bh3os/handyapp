// Financial closeout, the Owner's reopen, the satisfaction check and review requests against PostgreSQL 16 (TSK-0092;
// HH-QA-09, HH-QA-10, HH-STATE-02, HH-COM-05, T56, T64, T67, OWN-DEC-77, OWN-DEC-157, OWN-DEC-113, RULE-SERVER-AUTHZ).
// Staff, customers, amounts and references are synthetic (RULE-SYNTHETIC-DATA); nothing reaches a provider. Fixtures of
// this file's own throwaway database, never statements about the business:
// - approvals need an estimate terms version in effect (OQ-TERMS-OWNER-APPROVAL), so a synthetic "approved and
//   attorney-reviewed" one is recorded;
// - a job reaches "Awaiting quality review" only through the worker's Finished (completion.test.ts walks it), so this
//   test moves its job there directly, with its work packages complete on their SOP version, and opens the review
//   the way Finished does;
// - time passing is simulated by moving the review's pass back 49 hours (and the preparation job due now); no date is
//   assumed;
// - the review request wording is NOT CONFIGURED: one test releases a synthetic template version in this database only.
import { randomUUID } from 'node:crypto'
import { loadServiceSeed, loadSopSeed, syncServices, syncSops, withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import { localDateOf } from '@handyhub/domain'
import { ESTIMATE_TERMS } from '@handyhub/domain/legal'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import {
  followUpFailureItem,
  followUpPrepareAutomation,
  followUpRecordCheck,
  followUpValues,
  prepareSatisfactionCheck,
} from '../../src/modules/closeout/index.js'
import { invoiceDraftAutomation } from '../../src/modules/finance/invoice-automations.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { startCustomerSession } from '../../src/modules/identity/customer-sessions.js'
import { readCodeKey, type CodeKeySettings } from '../../src/modules/identity/index.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import {
  linkHostsOf,
  recordConsent,
  releaseAutomation,
  type ConsentPurpose,
} from '../../src/modules/notifications/index.js'
import { releaseTemplateVersion } from '../../src/modules/notifications/templates.js'
import { openQualityReview } from '../../src/modules/quality/index.js'
import { createAutomationRegistry, type Automation } from '../../src/platform/automation.js'
import { recordPolicyVersion } from '../../src/platform/config/index.js'
import { createWorker } from '../../src/platform/jobs.js'
import { createProviders } from '../../src/providers/index.js'
import { FakeObjectStorage } from '../../src/providers/r2/index.js'
import { readProviderSettings } from '../../src/providers/settings.js'
import { verifyCountyOf } from '../fixtures/county.js'
import { testConfig } from '../fixtures/env.js'
import { signInWithMfa } from '../fixtures/staff-mfa.js'
import { verifyPropertyZone } from '../fixtures/zones.js'

const SITE = 'https://site.example.test'
const ZONE = 'America/Kentucky/Louisville'
const KEY: CodeKeySettings = readCodeKey({
  HANDYHUB_ENV: 'ci',
  CODE_HASH_KEY: ['synthetic', 'closeout', 'code', 'key', 'for', 'tests', 'only', '0092'].join('-'),
})
const pw = (n: number) => ['synthetic', 'closeout', 'passphrase', String(n)].join(' ')
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
const fast = (a: Automation): Automation => ({ ...a, retry: { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 1 } })
// The one notify.release registration, as automations.ts registers it, with the job's send-time check.
const release = releaseAutomation(
  { email: p.email, sms: p.sms, linkHosts: linkHostsOf(SITE, undefined) },
  { recordChecks: { job: followUpRecordCheck }, failureItem: followUpFailureItem, values: followUpValues(SITE) },
)
const registry = createAutomationRegistry([
  fast(invoiceDraftAutomation()),
  fast(followUpPrepareAutomation()),
  fast(release),
])
async function drain() {
  const w = createWorker({ db: t.db, registry })
  for (let i = 0; i < 30; i++) {
    const r = await w.runOnce()
    if (r.dispatched + r.succeeded + r.retried + r.failed + r.cancelled === 0) return
    await new Promise((r) => setTimeout(r, 5))
  }
}

const V1_IN_EFFECT_FIXTURE = {
  documentId: ESTIMATE_TERMS.documentId,
  status: 'approved',
  attorneyReviewed: true,
  preparedOn: ESTIMATE_TERMS.preparedOn,
  contentSha256: ESTIMATE_TERMS.contentSha256,
}

const email = (who: Person) => `${who}-closeout@example.test`
async function signIn(who: Person): Promise<[string, string]> {
  const res = await signInWithMfa(app, {
    method: 'POST',
    url: '/api/v1/staff/auth/sign-in',
    payload: { email: email(who), password: pw(1) },
  })
  expect(res.statusCode, res.body).toBe(200)
  const cookie = String(res.headers['set-cookie']).split(';')[0] as string
  const session = await app.inject({ method: 'GET', url: '/api/v1/staff/auth/session', headers: { cookie } })
  return [cookie, session.json<{ csrfToken: string }>().csrfToken]
}

beforeAll(async () => {
  t = await createTestDatabase()
  await syncServices(t.db, loadServiceSeed())
  await syncSops(t.db, loadSopSeed())
  app = await buildApp({ config: testConfig({ TRUST_PROXY_HOPS: '1' }), api: { db: t.db, codeKey: KEY, storage } })
  const hash = await hashPassword(pw(1))
  await withTx(t.db, async (tx) => {
    for (const who of PEOPLE) {
      const user = await createStaffUser(tx, {
        email: email(who),
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
    value: V1_IN_EFFECT_FIXTURE as never,
    sourceIds: ['TEST-SYNTHETIC'],
    changedBy: 'test',
    reason: 'synthetic test configuration',
  })
})
afterAll(async () => {
  await app?.close()
  await t?.drop()
})

let seq = 0
const key = (what: string) => `synthetic-${what}-${String(++seq).padStart(6, '0')}-${randomUUID()}`
function staffWrite(who: Person, url: string, payload: unknown, extra: Record<string, string> = {}, method = 'POST') {
  return app.inject({
    method: method as 'POST',
    url: `/api/v1${url}`,
    payload: payload as object,
    headers: { cookie: cookies[who], 'x-csrf-token': csrf[who], 'idempotency-key': key('staff'), ...extra },
  })
}
const staffGet = (who: Person, url: string) =>
  app.inject({ method: 'GET', url: `/api/v1${url}`, headers: { cookie: cookies[who] } })
const today = () => localDateOf(new Date(), ZONE)
const codes = (res: { json: <T>() => T }) =>
  res.json<{ error: { fieldErrors: { code: string }[] } }>().error.fieldErrors.map((f) => f.code)

const ALL_OK = Object.fromEntries(
  ['coverage', 'service_fit', 'essential_facts', 'urgency', 'site_visit_need', 'staff_equipment', 'risk_flags'].map(
    (c) => [c, { outcome: 'ok' }],
  ),
)

let ip = 40
async function readyRequest() {
  const contactEmail = `closeout-${seq}-${randomUUID().slice(0, 8)}@example.test`
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/public/requests',
    headers: { 'idempotency-key': key('submit'), 'x-forwarded-for': `198.51.100.${++ip}` },
    payload: {
      formVersion: 'test-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-01' }, { serviceId: 'SVC-PT-01' }],
      notSure: false,
      description: 'Synthetic closeout project.',
      answers: [],
      property: {
        street: `${seq} Synthetic Closeout Lane`,
        city: 'Testville',
        state: 'ky',
        zip: '40000',
        propertyType: 'house',
      },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'online',
      contact: {
        fullName: 'Synthetic Closeout Customer',
        email: contactEmail,
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
    `/staff/requests/${row.id}/qualification`,
    { checks: ALL_OK },
    { 'if-match': '"0"' },
    'PUT',
  )
  expect(q.statusCode, q.body).toBe(200)
  const moved = await staffWrite(
    'owner',
    `/staff/requests/${row.id}/actions/online-estimate`,
    { workPackages: ['SVC-DW-01', 'SVC-PT-01'] },
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
    contactEmail,
    grantId: grant.id,
  }
}

let nets = 0
/** An approved $800.00 job (no deposit, OWN-DEC-104), its final invoice draft prepared. */
async function approvedJob() {
  const client = `2001:db8:92:${++nets}::1`
  const pr = await readyRequest()
  const created = await staffWrite('estimator', `/staff/projects/${pr.projectId}/estimates`, {})
  expect(created.statusCode, created.body).toBe(201)
  const c = created.json<{ number: string; versionId: string }>()
  const view = (await staffGet('estimator', `/staff/estimate-versions/${c.versionId}`)).json<{
    rowVersion: number
    workPackages: { id: string }[]
  }>()
  const saved = await staffWrite(
    'estimator',
    `/staff/estimate-versions/${c.versionId}/draft`,
    {
      lines: [
        {
          kind: 'base',
          workPackageId: view.workPackages[0]?.id,
          description: 'Synthetic patch and paint',
          quantity: '1',
          unit: 'job',
          unitPriceCents: 80_000,
        },
      ],
      texts: { exclusions: ['Synthetic: nothing else'] },
    },
    { 'if-match': `"${view.rowVersion}"` },
    'PUT',
  )
  expect(saved.statusCode, saved.body).toBe(200)
  const pub = await staffWrite(
    'estimator',
    `/staff/estimate-versions/${c.versionId}/publish`,
    {},
    { 'if-match': `"${saved.json<{ rowVersion: number }>().rowVersion}"` },
  )
  expect(pub.statusCode, pub.body).toBe(200)
  const s = await withTx(t.db, (tx) =>
    startCustomerSession(tx, {
      contactRef: pr.contactId,
      via: 'grant',
      projectIds: [pr.projectId],
      verifiedAt: new Date(),
      grantId: pr.grantId,
    }),
  )
  const cookie = `__Host-hh_customer=${s.token}`
  const url = `/api/v1/customer/projects/${pr.reference}/estimates/${c.number}/versions/1`
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
      fullName: 'Synthetic Closeout Customer',
    },
    headers: { cookie, 'idempotency-key': key('customer'), 'x-forwarded-for': client },
  })
  expect(approved.statusCode, approved.body).toBe(201)
  const job = await t.db
    .selectFrom('work.jobs')
    .select('id')
    .where('project_id', '=', pr.projectId)
    .executeTakeFirstOrThrow()
  await drain()
  return { ...pr, jobId: job.id }
}

/** The worker's Finished (see the header): the job awaits quality review with its work packages complete. */
async function awaitingReview(jobId: string) {
  await withTx(t.db, async (tx) => {
    await sql`SET LOCAL session_replication_role = replica`.execute(tx)
    await sql`UPDATE work.jobs SET operational_state = 'ready_for_qa', version = version + 1 WHERE id = ${jobId}`.execute(
      tx,
    )
    await sql`UPDATE work.work_packages w
                 SET state = 'complete', version = version + 1, sop_pinned_at = coalesce(sop_pinned_at, now()),
                     sop_version_id = coalesce(sop_version_id, (SELECT v.id FROM catalog.sop_versions v
                                                                 WHERE v.service_id = w.service_id
                                                                 ORDER BY v.version DESC LIMIT 1))
               WHERE job_id = ${jobId}`.execute(tx)
  })
  await withTx(t.db, (tx) => openQualityReview(tx, jobId))
}

const OK = { scope: 'ok', checklist: 'ok', evidence: 'ok', walkthrough: 'ok' } as const
/** The Owner's review passes: the job is operationally complete. */
async function completedJob() {
  const job = await approvedJob()
  await awaitingReview(job.jobId)
  expect((await staffWrite('owner', `/staff/jobs/${job.jobId}/quality-review/actions/start`, {})).statusCode).toBe(200)
  const r = (await staffGet('owner', `/staff/jobs/${job.jobId}/quality-review`)).json<{ review: { version: number } }>()
  const decided = await staffWrite(
    'owner',
    `/staff/jobs/${job.jobId}/quality-review/actions/decide`,
    { results: OK },
    { 'if-match': `"${r.review.version}"` },
  )
  expect(decided.statusCode, decided.body).toBe(200)
  expect(decided.json()).toMatchObject({ state: 'passed', jobState: 'operationally_complete' })
  return job
}

type View = {
  jobState: string
  version: number
  obligations: string[]
  history: { event: string; financialBasis: string | null; reason: string | null }[]
  followUps: {
    satisfactionDueAt: string | null
    items: { id: string; kind: string; state: string; reason: string | null }[]
    satisfactionBlockedBy: string | null
    reviewBlockedBy: string | null
    reviewWording: string
    responses: { answer: string }[]
  }
  actions: Record<string, boolean>
}
const view = async (jobId: string, who: Person = 'owner') => {
  const res = await staffGet(who, `/staff/jobs/${jobId}/closeout`)
  expect(res.statusCode, res.body).toBe(200)
  return res.json<View>()
}
const close = (who: Person, jobId: string, version: number, payload: unknown = {}) =>
  staffWrite(who, `/staff/jobs/${jobId}/closeout/actions/close`, payload, { 'if-match': `"${version}"` })
const reopen = (who: Person, jobId: string, version: number, reason: string) =>
  staffWrite(who, `/staff/jobs/${jobId}/closeout/actions/reopen`, { reason }, { 'if-match': `"${version}"` })
const finalInvoice = async (jobId: string) => {
  const res = await staffGet('owner', `/staff/jobs/${jobId}/invoices`)
  expect(res.statusCode, res.body).toBe(200)
  const f = res.json<{ final: { id: string; version: number; state: string } | null }>().final
  if (!f) throw new Error('no final invoice draft')
  return f
}
async function issueAndPay(jobId: string) {
  const f = await finalInvoice(jobId)
  const issued = await staffWrite('office', `/staff/invoices/${f.id}/issue`, {}, { 'if-match': `"${f.version}"` })
  expect(issued.statusCode, issued.body).toBe(200)
  return async () => {
    const paid = await staffWrite('office', `/staff/invoices/${f.id}/payments`, {
      method: 'cash',
      amountCents: 80_000,
      receivedOn: today(),
    })
    expect(paid.statusCode, paid.body).toBe(201)
  }
}
const queueItem = (type: string, subjectId: string) =>
  t.db
    .selectFrom('ops.queue_items')
    .select(['reason', 'resolved_at', 'resolution'])
    .where('type', '=', type)
    .where('subject_id', '=', subjectId)
    .orderBy(sql`resolved_at IS NULL`, 'desc')
    .orderBy('resolved_at', 'desc')
    .executeTakeFirst()
const consent = (to: string, purpose: ConsentPurpose, granted: boolean) =>
  withTx(t.db, (tx) =>
    recordConsent(tx, {
      purpose,
      channel: 'email',
      destination: to,
      granted,
      source: 'staff_recorded',
      recordedBy: ids.office,
    }),
  )
/** Time passing (see the header): the review passed 49 hours ago, and the preparation job is due now. */
async function fortyNineHoursLater(jobId: string) {
  await withTx(t.db, async (tx) => {
    await sql`SET LOCAL session_replication_role = replica`.execute(tx)
    await sql`UPDATE quality.reviews SET passed_at = now() - interval '49 hours' WHERE job_id = ${jobId}`.execute(tx)
  })
  await sql`UPDATE platform.jobs SET run_at = now() WHERE automation = 'closeout.follow_up_prepare'
            AND target_id = ${jobId} AND state = 'queued'`.execute(t.db)
  await drain()
}
const deliveriesOf = (jobId: string) =>
  t.db
    .selectFrom('platform.message_deliveries')
    .select(['id', 'message_key', 'state', 'error_code', 'release', 'provider_message_id'])
    .where('record_type', '=', 'job')
    .where('record_id', '=', jobId)
    .orderBy('seq')
    .execute()

/** A complaint on the project, recorded by Office; closed by the Owner with its resolution. */
async function complaint(projectId: string) {
  const r = await staffWrite('office', `/staff/projects/${projectId}/complaints`, {
    category: 'work_quality',
    severity: 'moderate',
    source: 'message',
    assignedTo: ids.office,
    dueOn: today(),
    description: 'Synthetic: the customer says a patch is visible under the light.',
  })
  expect(r.statusCode, r.body).toBe(201)
  const caseId = r.json<{ caseId: string }>().caseId
  const step = async (who: Person, action: string, payload: unknown = {}) => {
    const v = (await staffGet('owner', `/staff/cases/${caseId}`)).json<{ version: number }>().version
    const res = await staffWrite(who, `/staff/cases/${caseId}/actions/${action}`, payload, { 'if-match': `"${v}"` })
    expect(res.statusCode, res.body).toBe(200)
  }
  return {
    caseId,
    close: async () => {
      await step('office', 'acknowledge')
      await step('office', 'investigate')
      await step('owner', 'resolve', { resolution: 'Synthetic: repainted and accepted.', recheckRequired: false })
      await step('owner', 'close')
    },
  }
}

describe('[HH-QA-09][HH-STATE-02][T56][T64] closing a job and the Owner reopen', () => {
  it('[HH-QA-09][T56] completion and the money stay separate; closing is refused naming what is open', async () => {
    const job = await completedJob()
    // Operationally complete: the Owner's closeout item opens; the follow-up is planned 48 hours after the pass.
    expect(await queueItem('job_closeout', job.jobId)).toMatchObject({ reason: 'closeout_pending', resolved_at: null })
    const planned = await t.db
      .selectFrom('platform.jobs')
      .select('run_at')
      .where('automation', '=', 'closeout.follow_up_prepare')
      .where('target_id', '=', job.jobId)
      .executeTakeFirstOrThrow()
    const passed = await t.db
      .selectFrom('quality.reviews')
      .select('passed_at')
      .where('job_id', '=', job.jobId)
      .executeTakeFirstOrThrow()
    expect(new Date(planned.run_at).getTime() - new Date(passed.passed_at as Date).getTime()).toBe(48 * 3_600_000)
    let v = await view(job.jobId)
    expect(v).toMatchObject({ jobState: 'operationally_complete', obligations: ['FINAL_INVOICE_NOT_ISSUED'] })
    expect(v.actions).toMatchObject({ close: true, reopen: false })
    // Office sees the closeout but never closes; the Owner's close is refused with what is still open.
    expect((await view(job.jobId, 'office')).actions.close).toBe(false)
    for (const who of ['office', 'estimator', 'worker'] as const)
      expect((await close(who, job.jobId, v.version)).statusCode, who).toBe(403)
    for (const who of ['estimator', 'worker'] as const)
      expect((await staffGet(who, `/staff/jobs/${job.jobId}/closeout`)).statusCode, who).toBe(403)
    let refused = await close('owner', job.jobId, v.version)
    expect(refused.statusCode).toBe(409)
    expect(codes(refused)).toEqual(['FINAL_INVOICE_NOT_ISSUED'])
    // Issued but unpaid: the balance is neither paid nor tracked.
    const pay = await issueAndPay(job.jobId)
    v = await view(job.jobId)
    expect(v.obligations).toEqual(['BALANCE_NOT_TRACKED'])
    // A complaint the customer reports: the case keeps the job open too (and the database refuses it).
    const c = await complaint(job.projectId)
    v = await view(job.jobId)
    expect(v.obligations).toEqual(['BALANCE_NOT_TRACKED', 'OPEN_CASES'])
    refused = await close('owner', job.jobId, v.version)
    expect(codes(refused)).toEqual(['BALANCE_NOT_TRACKED', 'OPEN_CASES'])
    expect((await view(job.jobId)).jobState).toBe('operationally_complete')
    // Paid: still not closed by itself, and still refused while the case is open.
    await pay()
    v = await view(job.jobId)
    expect(v).toMatchObject({ jobState: 'operationally_complete', obligations: ['OPEN_CASES'] })
    await c.close()
    v = await view(job.jobId)
    expect(v.obligations).toEqual([])
    // A stale version is refused; the Owner's close records the financial basis and resolves the item.
    expect((await close('owner', job.jobId, v.version - 1)).statusCode).toBe(409)
    const closed = await close('owner', job.jobId, v.version, { note: 'Synthetic: all settled.' })
    expect(closed.statusCode, closed.body).toBe(200)
    v = closed.json<View>()
    expect(v).toMatchObject({ jobState: 'closed', obligations: [] })
    expect(v.history).toEqual([expect.objectContaining({ event: 'closed', financialBasis: 'paid' })])
    expect(await queueItem('job_closeout', job.jobId)).toMatchObject({ resolution: 'closed' })
    const audited = await t.db
      .selectFrom('platform.audit_events')
      .select(['action', 'summary'])
      .where('action', '=', 'job.close')
      .where('target_id', '=', job.jobId)
      .executeTakeFirstOrThrow()
    expect(audited.summary).toMatchObject({ to: 'closed', financialBasis: 'paid' })
  })

  it('[HH-QA-09] the database refuses a close or reopen without the Owner record, and a case on the project', async () => {
    const job = await completedJob()
    await expect(
      sql`UPDATE work.jobs SET operational_state = 'closed', version = version + 1 WHERE id = ${job.jobId}`.execute(
        t.db,
      ),
    ).rejects.toThrow(/Owner's recorded close/)
    // Only a live Owner records the event.
    await expect(
      sql`INSERT INTO work.job_closeout_events (job_id, project_id, event, from_state, financial_basis, recorded_by)
          VALUES (${job.jobId}, ${job.projectId}, 'closed', 'operationally_complete', 'paid', ${ids.office})`.execute(
        t.db,
      ),
    ).rejects.toThrow(/only the Owner/)
    // An operationally complete job never goes back by any other path.
    await expect(
      sql`UPDATE work.jobs SET operational_state = 'in_progress', version = version + 1 WHERE id = ${job.jobId}`.execute(
        t.db,
      ),
    ).rejects.toThrow(/changes only by closing/)
  })

  it('[HH-QA-09][T64] only the Owner reopens, with a fresh sign-in and a reason; the original records stay', async () => {
    const job = await completedJob()
    await (
      await issueAndPay(job.jobId)
    )()
    let v = await view(job.jobId)
    expect((await close('owner', job.jobId, v.version)).statusCode).toBe(200)
    v = await view(job.jobId)
    expect(v.actions).toMatchObject({ close: false, reopen: true })
    // Every other role is refused, with or without a reason.
    for (const who of ['office', 'estimator', 'worker'] as const)
      expect((await reopen(who, job.jobId, v.version, 'Synthetic: try to reopen')).statusCode, who).toBe(403)
    // The Owner without a fresh sign-in is asked for one; with it, a blank reason is refused.
    await sql`UPDATE identity.staff_sessions SET authenticated_at = now() - interval '30 minutes'
              WHERE staff_user_id = ${ids.owner}`.execute(t.db)
    const stale = await reopen('owner', job.jobId, v.version, 'Synthetic: the job was closed by mistake')
    expect(stale.json()).toMatchObject({ error: { code: 'FRESH_AUTH_REQUIRED' } })
    await sql`UPDATE identity.staff_sessions SET authenticated_at = now() WHERE staff_user_id = ${ids.owner}`.execute(
      t.db,
    )
    const blank = await reopen('owner', job.jobId, v.version, '   ')
    expect(blank.statusCode).toBe(400)
    expect((await view(job.jobId)).jobState).toBe('closed')
    const before = await t.db
      .selectFrom('finance.invoices')
      .select(['state', 'version'])
      .where('job_id', '=', job.jobId)
      .execute()
    const reopened = await reopen('owner', job.jobId, v.version, 'Synthetic: the job was closed by mistake')
    expect(reopened.statusCode, reopened.body).toBe(200)
    v = reopened.json<View>()
    expect(v.jobState).toBe('reopened')
    expect(v.history.map((h) => [h.event, h.reason])).toEqual([
      ['closed', null],
      ['reopened', 'Synthetic: the job was closed by mistake'],
    ])
    // The original records are kept as they were; the reopen is audited with its reason and the step-up.
    expect(
      await t.db.selectFrom('finance.invoices').select(['state', 'version']).where('job_id', '=', job.jobId).execute(),
    ).toEqual(before)
    expect(
      (
        await t.db
          .selectFrom('quality.reviews')
          .select('state')
          .where('job_id', '=', job.jobId)
          .executeTakeFirstOrThrow()
      ).state,
    ).toBe('passed')
    const audited = await t.db
      .selectFrom('platform.audit_events')
      .selectAll()
      .where('action', '=', 'job.reopen')
      .where('target_id', '=', job.jobId)
      .executeTakeFirstOrThrow()
    expect(audited).toMatchObject({ reason: 'Synthetic: the job was closed by mistake', step_up_used: true })
    expect(await queueItem('job_closeout', job.jobId)).toMatchObject({ reason: 'job_reopened', resolved_at: null })
    // Closed again on the same conditions.
    expect((await close('owner', job.jobId, v.version)).statusCode).toBe(200)
    expect((await view(job.jobId)).jobState).toBe('closed')
  })
})

describe('[HH-QA-10][HH-COM-05][T67] the satisfaction check and review requests', () => {
  it('[HH-QA-10][T67] prepared 48 hours after the review passed, released by staff, with the concern link', async () => {
    const job = await completedJob()
    // Not before its time: a run now reschedules itself and prepares nothing.
    await sql`UPDATE platform.jobs SET run_at = now() WHERE automation = 'closeout.follow_up_prepare'
              AND target_id = ${job.jobId}`.execute(t.db)
    await drain()
    expect(await deliveriesOf(job.jobId)).toEqual([])
    await fortyNineHoursLater(job.jobId)
    let rows = await deliveriesOf(job.jobId)
    expect(rows).toEqual([
      expect.objectContaining({
        message_key: 'reminder.satisfaction_check',
        state: 'draft',
        release: 'staff_released',
      }),
    ])
    expect(await queueItem('follow_up_release', job.jobId)).toMatchObject({
      reason: 'satisfaction_check_ready',
      resolved_at: null,
    })
    // Once per job: preparing again adds none.
    expect(await withTx(t.db, (tx) => prepareSatisfactionCheck(tx, job.jobId, 'test-again'))).toBe('cancelled')
    expect(await deliveriesOf(job.jobId)).toHaveLength(1)
    const draft = rows[0] as { id: string }
    // Workers and Estimators never release it; Office does.
    for (const who of ['worker', 'estimator'] as const)
      expect((await staffWrite(who, `/staff/jobs/${job.jobId}/follow-ups/${draft.id}/release`, {})).statusCode).toBe(
        403,
      )
    const released = await staffWrite('office', `/staff/jobs/${job.jobId}/follow-ups/${draft.id}/release`, {})
    expect(released.statusCode, released.body).toBe(200)
    expect(await queueItem('follow_up_release', job.jobId)).toMatchObject({ resolved_at: expect.any(Date) })
    await drain()
    rows = await deliveriesOf(job.jobId)
    // Handed to the provider (the delivery status confirms it later).
    expect(rows[0]).toMatchObject({ state: 'queued', provider_message_id: expect.any(String) })
    const mail = fakeEmail.sent.filter((m) => m.to === job.contactEmail).at(-1)
    expect(mail?.subject).toBe('HandyHub | How Was Your Experience?')
    expect(mail?.text).toContain('Hi Synthetic,')
    expect(mail?.text).toContain(`#${job.projectReference}`)
    expect(mail?.text).toContain(`${SITE}/portal/p/${job.projectReference}`)
    expect(mail?.text).toContain('report a concern or ask for help')
    // No offers, discounts or review requests in the service follow-up (OWN-DEC-157 item 4).
    expect(mail?.text).not.toMatch(/review|discount|offer|%/i)
    // The customer's answer is recorded by staff, never by a worker.
    expect(
      (await staffWrite('worker', `/staff/jobs/${job.jobId}/satisfaction-responses`, { answer: 'positive' }))
        .statusCode,
    ).toBe(403)
    const answered = await staffWrite('office', `/staff/jobs/${job.jobId}/satisfaction-responses`, {
      answer: 'positive',
      note: 'Synthetic: happy with the patch.',
      deliveryId: draft.id,
    })
    expect(answered.statusCode, answered.body).toBe(201)
    expect(answered.json<View>().followUps.responses).toEqual([expect.objectContaining({ answer: 'positive' })])
  })

  it('[HH-QA-10][T67] an active complaint pauses both; they are reconsidered after resolution', async () => {
    const job = await completedJob()
    await consent(job.contactEmail, 'marketing', true)
    const c = await complaint(job.projectId)
    await fortyNineHoursLater(job.jobId)
    // Prepared, but held while the case is open: not in the queue, and never released.
    let rows = await deliveriesOf(job.jobId)
    expect(rows).toEqual([
      expect.objectContaining({
        message_key: 'reminder.satisfaction_check',
        state: 'draft',
        error_code: 'held_case_active',
      }),
    ])
    expect(await queueItem('follow_up_release', job.jobId)).toBeUndefined()
    const satisfaction = rows[0] as { id: string }
    let r = await staffWrite('office', `/staff/jobs/${job.jobId}/follow-ups/${satisfaction.id}/release`, {})
    expect(codes(r)).toEqual(['CASE_ACTIVE'])
    // A review request prepared now is held too.
    r = await staffWrite('office', `/staff/jobs/${job.jobId}/follow-ups/review-request`, {})
    expect(r.statusCode, r.body).toBe(201)
    let v = r.json<View>()
    const review = v.followUps.items.find((i) => i.kind === 'review') as { id: string; reason: string | null }
    expect(review).toMatchObject({ state: 'draft', reason: 'held_case_active' })
    expect(v.followUps.reviewBlockedBy).toBe('review_request_waiting')
    r = await staffWrite('office', `/staff/jobs/${job.jobId}/follow-ups/${review.id}/release`, {})
    expect(codes(r)).toEqual(['CASE_ACTIVE'])
    // The case closes (whatever its outcome): both are offered again for staff release.
    await c.close()
    v = await view(job.jobId)
    expect(v.followUps.items.map((i) => [i.kind, i.state, i.reason])).toEqual([
      ['satisfaction', 'draft', null],
      ['review', 'draft', null],
    ])
    expect(await queueItem('follow_up_release', job.jobId)).toMatchObject({
      reason: 'satisfaction_check_ready',
      resolved_at: null,
    })
    // Released, then a new case before it goes: the send-time check holds it again (back to a draft).
    r = await staffWrite('office', `/staff/jobs/${job.jobId}/follow-ups/${satisfaction.id}/release`, {})
    expect(r.statusCode, r.body).toBe(200)
    await complaint(job.projectId)
    await drain()
    rows = await deliveriesOf(job.jobId)
    expect(rows[0]).toMatchObject({ state: 'draft', error_code: 'held_case_active' })
  })

  it('[HH-QA-10][T67] review requests: marketing consent checked at send; a low answer changes nothing', async () => {
    const job = await completedJob()
    // Without marketing permission no review request is prepared.
    let r = await staffWrite('office', `/staff/jobs/${job.jobId}/follow-ups/review-request`, {})
    expect(codes(r)).toEqual(['NO_MARKETING_CONSENT'])
    await consent(job.contactEmail, 'marketing', true)
    const before = await view(job.jobId)
    expect(before.followUps.reviewBlockedBy).toBeNull()
    expect(before.actions.prepareReviewRequest).toBe(true)
    // A low satisfaction answer: the review request option is exactly as before (no score gating).
    r = await staffWrite('office', `/staff/jobs/${job.jobId}/satisfaction-responses`, {
      answer: 'negative',
      note: 'Synthetic: not happy with the colour.',
    })
    expect(r.statusCode, r.body).toBe(201)
    const after = await view(job.jobId)
    expect(after.followUps.reviewBlockedBy).toBe(before.followUps.reviewBlockedBy)
    expect(after.actions.prepareReviewRequest).toBe(before.actions.prepareReviewRequest)
    r = await staffWrite('office', `/staff/jobs/${job.jobId}/follow-ups/review-request`, {})
    expect(r.statusCode, r.body).toBe(201)
    const review = r.json<View>().followUps.items.find((i) => i.kind === 'review') as { id: string }
    // Never automatic, and its wording is NOT CONFIGURED: it cannot be released yet.
    expect(r.json<View>().followUps.reviewWording).toBe('NOT_CONFIGURED')
    r = await staffWrite('office', `/staff/jobs/${job.jobId}/follow-ups/${review.id}/release`, {})
    expect(codes(r)).toEqual(['TEMPLATE_NOT_CONFIGURED'])
    // A synthetic wording in this test database only (see the header).
    await withTx(t.db, (tx) =>
      releaseTemplateVersion(tx, {
        messageKey: 'review.request',
        channel: 'email',
        locale: 'en',
        subject: 'Synthetic review request',
        body: 'Synthetic test wording.\n\n{projectLink}',
        translationReview: 'source',
        sourceIds: ['TEST-SYNTHETIC'],
        releasedBy: 'test',
      }),
    )
    r = await staffWrite('office', `/staff/jobs/${job.jobId}/follow-ups/${review.id}/release`, {})
    expect(r.statusCode, r.body).toBe(200)
    // The customer withdraws marketing permission after it was queued: the send is suppressed at execution.
    await consent(job.contactEmail, 'marketing', false)
    await drain()
    const row = (await deliveriesOf(job.jobId)).find((d) => d.message_key === 'review.request')
    expect(row).toMatchObject({ state: 'suppressed', error_code: 'no_marketing_consent' })
    expect(fakeEmail.sent.filter((m) => m.to === job.contactEmail && m.subject === 'Synthetic review request')).toEqual(
      [],
    )
    // One per job (PROPOSED): a suppressed one may be prepared again, once permission is back.
    await consent(job.contactEmail, 'marketing', true)
    expect((await view(job.jobId)).followUps.reviewBlockedBy).toBeNull()
  })

  it('[HH-QA-10][HH-COM-05] an opt-out of optional follow-ups and a reopened job stop the satisfaction check', async () => {
    const job = await completedJob()
    await fortyNineHoursLater(job.jobId)
    const draft = (await deliveriesOf(job.jobId))[0] as { id: string }
    // Released, then the customer asks for no optional follow-ups: suppressed at send.
    let r = await staffWrite('office', `/staff/jobs/${job.jobId}/follow-ups/${draft.id}/release`, {})
    expect(r.statusCode, r.body).toBe(200)
    await consent(job.contactEmail, 'service_communication', false)
    await drain()
    expect((await deliveriesOf(job.jobId))[0]).toMatchObject({
      state: 'suppressed',
      error_code: 'follow_ups_opted_out',
    })
    expect((await view(job.jobId)).followUps.satisfactionBlockedBy).toBe('follow_ups_opted_out')

    // Another job: closed, then reopened before its follow-up time: none is prepared, ever (OWN-DEC-157 item 6).
    const other = await completedJob()
    await (
      await issueAndPay(other.jobId)
    )()
    let v = await view(other.jobId)
    expect((await close('owner', other.jobId, v.version)).statusCode).toBe(200)
    v = await view(other.jobId)
    r = await reopen('owner', other.jobId, v.version, 'Synthetic: closed by mistake')
    expect(r.statusCode, r.body).toBe(200)
    await fortyNineHoursLater(other.jobId)
    expect(await deliveriesOf(other.jobId)).toEqual([])
    const notPrepared = await t.db
      .selectFrom('platform.audit_events')
      .select('summary')
      .where('action', '=', 'follow_up.not_prepared')
      .where('target_id', '=', other.jobId)
      .executeTakeFirstOrThrow()
    expect(notPrepared.summary).toMatchObject({ reason: 'job_reopened' })
    expect((await view(other.jobId)).followUps.satisfactionBlockedBy).toBe('job_reopened')
  })
})
