// The Owner's quality review and punch items against PostgreSQL 16 (TSK-0084; HH-QA-02, HH-QA-04, HH-QA-09, HH-FIN-05,
// T55, T56, ENT-QAInspection, ENT-PunchItem, OWN-DEC-64, OWN-DEC-109, RULE-SAFETY-GATES, RULE-SERVER-AUTHZ). Staff,
// customers, amounts and references are synthetic (RULE-SYNTHETIC-DATA); nothing reaches a provider.
// Two fixtures of this file's own throwaway database, never statements about the business: approvals need an estimate
// terms version in effect (OQ-TERMS-OWNER-APPROVAL), so a synthetic "approved and attorney-reviewed" one is recorded;
// and a job reaches "Awaiting quality review" only through the worker's Finished (TSK-0083, not built), so the test
// moves its job there directly and opens the review the way Finished will (openQualityReview). A worker corrects a
// punch item through the route only while assigned to a live visit of the job (the return visit of TSK-0094, not
// built): the route's refusal is checked, then the correction is recorded through the same store function.
import { randomUUID } from 'node:crypto'
import { loadServiceSeed, syncServices, withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import { localDateOf } from '@handyhub/domain'
import { ESTIMATE_TERMS } from '@handyhub/domain/legal'
import type { StaffActor } from '@handyhub/policy'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { invoiceDraftAutomation } from '../../src/modules/finance/invoice-automations.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { startCustomerSession } from '../../src/modules/identity/customer-sessions.js'
import { readCodeKey, type CodeKeySettings } from '../../src/modules/identity/index.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import { openQualityReview } from '../../src/modules/quality/index.js'
import { correctPunchItem } from '../../src/modules/quality/store.js'
import { createAutomationRegistry, type Automation } from '../../src/platform/automation.js'
import { recordPolicyVersion } from '../../src/platform/config/index.js'
import { createWorker } from '../../src/platform/jobs.js'
import { FakeObjectStorage } from '../../src/providers/r2/index.js'
import { verifyCountyOf } from '../fixtures/county.js'
import { testConfig } from '../fixtures/env.js'
import { signInWithMfa } from '../fixtures/staff-mfa.js'
import { verifyPropertyZone } from '../fixtures/zones.js'

const KEY: CodeKeySettings = readCodeKey({
  HANDYHUB_ENV: 'ci',
  CODE_HASH_KEY: ['synthetic', 'quality', 'review', 'code', 'key', 'for', 'tests', '0084'].join('-'),
})
const pw = (n: number) => ['synthetic', 'quality', 'review', 'passphrase', String(n)].join(' ')
const PEOPLE = ['owner', 'office', 'estimator', 'worker'] as const
type Person = (typeof PEOPLE)[number]

let t: TestDatabase
let app: FastifyInstance
const storage = new FakeObjectStorage()
const cookies = {} as Record<Person, string>
const csrf = {} as Record<Person, string>
const ids = {} as Record<Person, string>

const V1_IN_EFFECT_FIXTURE = {
  documentId: ESTIMATE_TERMS.documentId,
  status: 'approved',
  attorneyReviewed: true,
  preparedOn: ESTIMATE_TERMS.preparedOn,
  contentSha256: ESTIMATE_TERMS.contentSha256,
}

const fast = (a: Automation): Automation => ({ ...a, retry: { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 1 } })
const tick = () => new Promise((r) => setTimeout(r, 15))
async function drain() {
  const w = createWorker({ db: t.db, registry: createAutomationRegistry([fast(invoiceDraftAutomation())]) })
  for (let i = 0; i < 4; i++) {
    await w.runOnce()
    await tick()
  }
}

const email = (p: Person) => `${p}-quality@example.test`
async function signIn(p: Person): Promise<[string, string]> {
  const res = await signInWithMfa(app, {
    method: 'POST',
    url: '/api/v1/staff/auth/sign-in',
    payload: { email: email(p), password: pw(1) },
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
    for (const p of PEOPLE) {
      const user = await createStaffUser(tx, {
        email: email(p),
        displayName: `Synthetic ${p}`,
        locale: 'en',
        role: p,
        issuedBy: 'test',
      })
      await setPasswordHash(tx, user.id, hash)
      ids[p] = user.id
    }
  })
  for (const p of PEOPLE) [cookies[p], csrf[p]] = await signIn(p)
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
function staffWrite(
  who: Person,
  method: 'POST' | 'PUT',
  url: string,
  payload: unknown,
  extra: Record<string, string> = {},
) {
  return app.inject({
    method,
    url: `/api/v1${url}`,
    payload: payload as object,
    headers: { cookie: cookies[who], 'x-csrf-token': csrf[who], 'idempotency-key': key('staff'), ...extra },
  })
}
const staffGet = (who: Person, url: string) =>
  app.inject({ method: 'GET', url: `/api/v1${url}`, headers: { cookie: cookies[who] } })
const today = () => localDateOf(new Date(), 'America/Kentucky/Louisville')
const codes = (res: { json: <T>() => T }) =>
  res.json<{ error: { fieldErrors: { code: string }[] } }>().error.fieldErrors.map((f) => f.code)

const ALL_OK = Object.fromEntries(
  ['coverage', 'service_fit', 'essential_facts', 'urgency', 'site_visit_need', 'staff_equipment', 'risk_flags'].map(
    (c) => [c, { outcome: 'ok' }],
  ),
)

let ip = 20
async function readyRequest() {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/public/requests',
    headers: { 'idempotency-key': key('submit'), 'x-forwarded-for': `198.51.100.${++ip}` },
    payload: {
      formVersion: 'test-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-01' }, { serviceId: 'SVC-PT-01' }],
      notSure: false,
      description: 'Synthetic invoice project.',
      answers: [],
      property: {
        street: `${seq} Synthetic Invoice Lane`,
        city: 'Testville',
        state: 'ky',
        zip: '40000',
        propertyType: 'house',
      },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'online',
      contact: {
        fullName: 'Synthetic Invoice Customer',
        email: `invoice-${seq}-${randomUUID().slice(0, 8)}@example.test`,
        phone: '(502) 555-0185',
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
    { 'if-match': '"0"' },
  )
  expect(q.statusCode, q.body).toBe(200)
  const moved = await staffWrite(
    'owner',
    'POST',
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
    grantId: grant.id,
  }
}

type Line = { kind: 'base' | 'add_on'; cents: number; text?: string }
let nets = 0

/** An approved job: these lines (one unit each), the discount category if any, approved with these options. */
async function approvedJob(lines: Line[], options: number[] = [], discountCategory?: string) {
  const client = `2001:db8:85:${++nets}::1`
  const p = await readyRequest()
  const created = await staffWrite('estimator', 'POST', `/staff/projects/${p.projectId}/estimates`, {})
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
      lines: lines.map((l, i) => ({
        kind: l.kind,
        workPackageId: view.workPackages[i % 2]?.id,
        description: l.text ?? `Synthetic invoice line ${i + 1}`,
        quantity: '1',
        unit: 'job',
        unitPriceCents: l.cents,
      })),
      texts: { exclusions: ['Synthetic: nothing else'] },
      ...(discountCategory ? { discountCategory } : {}),
    },
    { 'if-match': `"${view.rowVersion}"` },
  )
  expect(saved.statusCode, saved.body).toBe(200)
  const pub = await staffWrite(
    'estimator',
    'POST',
    `/staff/estimate-versions/${c.versionId}/publish`,
    {},
    { 'if-match': `"${saved.json<{ rowVersion: number }>().rowVersion}"` },
  )
  expect(pub.statusCode, pub.body).toBe(200)
  const s = await withTx(t.db, (tx) =>
    startCustomerSession(tx, {
      contactRef: p.contactId,
      via: 'grant',
      projectIds: [p.projectId],
      verifiedAt: new Date(),
      grantId: p.grantId,
    }),
  )
  const cookie = `__Host-hh_customer=${s.token}`
  const url = `/api/v1/customer/projects/${p.reference}/estimates/${c.number}/versions/1`
  const post = (path: string, payload: unknown) =>
    app.inject({
      method: 'POST',
      url: `${url}${path}`,
      payload: payload as object,
      headers: { cookie, 'idempotency-key': key('customer'), 'x-forwarded-for': client },
    })
  if (options.length) expect((await post('/selection', { options })).statusCode).toBe(200)
  const detail = (await app.inject({ method: 'GET', url, headers: { cookie } })).json<{
    totalCents: number
    approval: {
      contentDigest: string
      selection: { options: number[]; totalCents: number; deposit: { amountCents: number | null } } | null
    }
  }>()
  const sel = detail.approval.selection
  const approved = await post('/approve', {
    contentDigest: detail.approval.contentDigest,
    options: sel?.options ?? [],
    totalCents: sel?.totalCents ?? detail.totalCents,
    depositCents: sel?.deposit.amountCents ?? null,
    termsDocumentId: ESTIMATE_TERMS.documentId,
    termsSha256: ESTIMATE_TERMS.contentSha256,
    acceptTerms: true,
    fullName: 'Synthetic Invoice Customer',
  })
  expect(approved.statusCode, approved.body).toBe(201)
  const job = await t.db
    .selectFrom('work.jobs')
    .select(['id', 'approval_id'])
    .where('project_id', '=', p.projectId)
    .executeTakeFirstOrThrow()
  return { ...p, estimateNumber: c.number, jobId: job.id, customerCookie: cookie }
}

/** The worker's Finished (TSK-0083, not built): the job awaits quality review and its review opens. */
async function awaitingReview(jobId: string) {
  await sql`UPDATE work.jobs SET operational_state = 'ready_for_qa', version = version + 1 WHERE id = ${jobId}`.execute(
    t.db,
  )
  await withTx(t.db, (tx) => openQualityReview(tx, jobId))
}
/** $800.00: no deposit (OWN-DEC-104), so the final invoice waits only on the review. */
async function reviewedJob() {
  const job = await approvedJob([{ kind: 'base', cents: 80_000, text: 'Synthetic patch and paint' }])
  await drain()
  await awaitingReview(job.jobId)
  return job
}

type Review = {
  jobState: string
  review: { state: string; selfReview: boolean; version: number; reviewer: { id: string } | null } | null
  gate: string
  workPackages: { id: string; code: string }[]
  workers: { id: string }[]
  punchItems: {
    id: string
    kind: string
    severity: string
    state: string
    version: number
    actions: { correct: boolean; recheck: boolean }
  }[]
  history: { event: string }[]
  actions: { start: boolean; addPunchItem: boolean; decide: boolean }
}
const view = async (jobId: string) => {
  const res = await staffGet('owner', `/staff/jobs/${jobId}/quality-review`)
  expect(res.statusCode, res.body).toBe(200)
  return res.json<Review>()
}
const OK = { scope: 'ok', checklist: 'ok', evidence: 'ok', walkthrough: 'ok' } as const
const start = (who: Person, jobId: string) =>
  staffWrite(who, 'POST', `/staff/jobs/${jobId}/quality-review/actions/start`, {})
const decide = (jobId: string, version: number, results: Record<string, string>) =>
  staffWrite(
    'owner',
    'POST',
    `/staff/jobs/${jobId}/quality-review/actions/decide`,
    { results },
    { 'if-match': `"${version}"` },
  )
const punch = (who: Person, jobId: string, body: Record<string, unknown>) =>
  staffWrite(who, 'POST', `/staff/jobs/${jobId}/quality-review/punch-items`, {
    description: 'Synthetic problem found at review',
    requiredEvidence: 'A synthetic after photo of the area',
    assignedTo: ids.worker,
    dueOn: today(),
    area: 'Synthetic hallway',
    ...body,
  })
const recheck = (who: Person, item: { id: string; version: number }, passed: boolean) =>
  staffWrite(
    who,
    'POST',
    `/staff/punch-items/${item.id}/actions/recheck`,
    { passed, note: passed ? 'Synthetic: looks right now' : 'Synthetic: still visible' },
    { 'if-match': `"${item.version}"` },
  )
const workerActor = (): StaffActor => ({
  kind: 'staff',
  userId: ids.worker,
  roles: ['worker'],
  capabilities: [],
  status: 'active',
  freshAuth: false,
})
/** The assigned worker's correction (the store function the route calls; see the header). */
const correct = (item: { id: string; version: number }) =>
  withTx(t.db, (tx) => correctPunchItem(tx, workerActor(), item.id, item.version, 'Synthetic: repainted the spot'))
const finalInvoice = async (jobId: string) => {
  const res = await staffGet('owner', `/staff/jobs/${jobId}/invoices`)
  expect(res.statusCode, res.body).toBe(200)
  const f = res.json<{ final: { id: string; version: number; state: string } | null }>().final
  if (!f) throw new Error('no final invoice draft')
  return f
}
const issue = (who: Person, inv: { id: string; version: number }) =>
  staffWrite(who, 'POST', `/staff/invoices/${inv.id}/issue`, {}, { 'if-match': `"${inv.version}"` })
const queueItem = (type: string, jobId: string) =>
  t.db
    .selectFrom('ops.queue_items')
    .select(['reason', 'resolved_at', 'due_at', 'assigned_staff_id'])
    .where('type', '=', type)
    .where('subject_id', '=', jobId)
    // The open item first, else the latest resolved one.
    .orderBy(sql`resolved_at IS NULL`, 'desc')
    .orderBy('resolved_at', 'desc')
    .executeTakeFirst()
const situation = async (job: { reference: string; customerCookie: string }) => {
  const res = await app.inject({
    method: 'GET',
    url: `/api/v1/customer/projects/${job.reference}/overview`,
    headers: { cookie: job.customerCookie },
  })
  expect(res.statusCode, res.body).toBe(200)
  expect(res.body).not.toContain('Synthetic problem found at review')
  return res.json<{ status: { situation: string } }>().status.situation
}

describe('[HH-QA-02][HH-QA-04][T55][T56] the Owner reviews every job; punch items decide the final invoice', () => {
  it('awaiting review, punch items, a blocked and an Owner-only invoice, corrections, re-checks and completion', async () => {
    const job = await reviewedJob()
    // Awaiting quality review: never complete, the final invoice waits, the Owner has the Owner Decisions item.
    let v = await view(job.jobId)
    expect(v).toMatchObject({ jobState: 'ready_for_qa', gate: 'quality_review_not_recorded' })
    expect(v.review).toMatchObject({ state: 'pending', reviewer: null })
    expect(v.actions).toEqual({ start: true, addPunchItem: false, decide: false })
    expect(await queueItem('quality_review', job.jobId)).toMatchObject({
      reason: 'awaiting_quality_review',
      resolved_at: null,
    })
    expect(await situation(job)).toBe('completion_review')
    // Only the Owner reviews (RULE-SERVER-AUTHZ).
    for (const who of ['office', 'estimator', 'worker'] as const) {
      expect((await staffGet(who, `/staff/jobs/${job.jobId}/quality-review`)).statusCode).toBe(403)
      expect((await start(who, job.jobId)).statusCode).toBe(403)
    }
    const started = await start('owner', job.jobId)
    expect(started.statusCode, started.body).toBe(200)
    expect(started.json()).toMatchObject({ state: 'in_review', jobState: 'ready_for_qa' })
    expect(codes(await start('owner', job.jobId))).toContain('REVIEW_ALREADY_STARTED')
    v = await view(job.jobId)
    expect(v.review).toMatchObject({ state: 'in_review', selfReview: false, reviewer: { id: ids.owner } })

    // T55: every problem becomes a punch item; a problem with none is refused.
    const lone = await decide(job.jobId, v.review?.version as number, { ...OK, evidence: 'problem' })
    expect(lone.statusCode, lone.body).toBe(409)
    expect(codes(lone)).toContain('PROBLEM_NEEDS_PUNCH_ITEM')
    // A safety concern needs the job's open safety hold (Stop Work / Report Hazard); only the Owner records items.
    expect(codes(await punch('owner', job.jobId, { kind: 'safety_concern' }))).toContain('SAFETY_HOLD_REQUIRED')
    expect((await punch('office', job.jobId, { kind: 'finish' })).statusCode).toBe(403)
    expect(codes(await punch('owner', job.jobId, { kind: 'finish', assignedTo: ids.office }))).toContain(
      'NOT_AN_ACTIVE_WORKER',
    )
    const minor = await punch('owner', job.jobId, { kind: 'finish', workPackageId: v.workPackages[0]?.id })
    expect(minor.statusCode, minor.body).toBe(201)
    const major = await punch('owner', job.jobId, { kind: 'defect' })
    expect(major.statusCode, major.body).toBe(201)
    // A pass with punch items found is refused: the review asks for punch work instead.
    v = await view(job.jobId)
    expect(v.punchItems.map((i) => [i.kind, i.severity, i.state])).toEqual([
      ['finish', 'minor', 'open'],
      ['defect', 'major', 'open'],
    ])
    const decided = await decide(job.jobId, v.review?.version as number, { ...OK, evidence: 'problem' })
    expect(decided.statusCode, decided.body).toBe(200)
    expect(decided.json()).toMatchObject({ state: 'punch_required', jobState: 'ready_for_qa' })
    expect(await queueItem('quality_review', job.jobId)).toMatchObject({ resolved_at: expect.any(Date) })
    expect(await queueItem('punch_items', job.jobId)).toMatchObject({
      reason: 'punch_items_open',
      resolved_at: null,
      assigned_staff_id: ids.worker,
      due_at: expect.any(Date),
    })
    // The customer sees "Follow-up work", never the item's words.
    expect(await situation(job)).toBe('follow_up_work')

    // The integration test of the task: an open blocking (major) punch item prevents invoice issue, for every role.
    v = await view(job.jobId)
    expect(v.gate).toBe('blocked')
    let f = await finalInvoice(job.jobId)
    for (const who of ['owner', 'office'] as const) {
      const res = await issue(who, f)
      expect(res.statusCode, res.body).toBe(409)
      expect(codes(res)).toContain('QUALITY_REVIEW_BLOCKED')
    }
    await expect(
      sql`UPDATE finance.invoices SET state = 'issued', sequence = 1, number = ${`${job.projectReference}-I1`},
            issued_at = now(), issued_by = ${ids.owner}, issuer_name = 'x', policy_versions = '{}'
          WHERE id = ${f.id}`.execute(t.db),
    ).rejects.toThrow(/quality review \(blocked\)/)

    // The worker corrects the major item (the route needs a live visit assignment: refused here, see the header).
    const [minorItem, majorItem] = v.punchItems as [Review['punchItems'][0], Review['punchItems'][0]]
    const viaRoute = await staffWrite(
      'worker',
      'POST',
      `/staff/punch-items/${majorItem.id}/actions/correct`,
      { note: 'Synthetic' },
      { 'if-match': `"${majorItem.version}"` },
    )
    expect(viaRoute.statusCode).toBe(403)
    const fixed = await correct(majorItem)
    expect(fixed.item.state).toBe('corrected')
    expect(fixed.review.state).toBe('punch_required')
    // The Owner re-checks it; with only a minor item open, only the Owner may issue (OWN-DEC-64).
    const passedMajor = await recheck('owner', { id: majorItem.id, version: fixed.item.version }, true)
    expect(passedMajor.statusCode, passedMajor.body).toBe(200)
    expect((await view(job.jobId)).gate).toBe('owner_may_issue')
    f = await finalInvoice(job.jobId)
    expect(codes(await issue('office', f))).toContain('QUALITY_REVIEW_OWNER_ONLY')
    const issued = await issue('owner', f)
    expect(issued.statusCode, issued.body).toBe(200)
    // T56: the punch item stays linked and visible after the invoice; the job is not complete and cannot close.
    v = await view(job.jobId)
    expect(v.punchItems.find((i) => i.id === minorItem.id)).toMatchObject({ state: 'open' })
    expect(v.jobState).toBe('ready_for_qa')
    expect(await situation(job)).toBe('follow_up_work')
    await expect(
      sql`UPDATE work.jobs SET operational_state = 'closed', version = version + 1 WHERE id = ${job.jobId}`.execute(
        t.db,
      ),
    ).rejects.toThrow(/every punch item passed re-check/)
    await expect(
      sql`UPDATE work.jobs SET operational_state = 'operationally_complete', version = version + 1
          WHERE id = ${job.jobId}`.execute(t.db),
    ).rejects.toThrow(/quality review passed/)

    // The minor item: corrected, a failed re-check reopens it, corrected again, re-checked: the review passes.
    let m = await correct(minorItem)
    expect(m.review.state).toBe('pending_recheck')
    expect(await queueItem('quality_review', job.jobId)).toMatchObject({ reason: 'recheck_due', resolved_at: null })
    const failed = await recheck('owner', { id: minorItem.id, version: m.item.version }, false)
    expect(failed.statusCode, failed.body).toBe(200)
    expect(failed.json()).toMatchObject({ state: 'open', reviewState: 'punch_required' })
    m = await correct({ id: minorItem.id, version: failed.json<{ version: number }>().version })
    const last = await recheck('owner', { id: minorItem.id, version: m.item.version }, true)
    expect(last.statusCode, last.body).toBe(200)
    expect(last.json()).toMatchObject({ state: 'rechecked', reviewState: 'passed' })
    v = await view(job.jobId)
    expect(v).toMatchObject({ jobState: 'operationally_complete', gate: 'passed' })
    expect(v.history.map((h) => h.event)).toEqual([
      'start',
      'punch_added',
      'punch_added',
      'require_punch',
      'correct',
      'recheck_pass',
      'correct',
      'corrections_done',
      'recheck_fail',
      'punch_reopened',
      'correct',
      'corrections_done',
      'recheck_pass',
      'recheck_complete',
    ])
    expect(await queueItem('punch_items', job.jobId)).toMatchObject({ resolved_at: expect.any(Date) })
    expect(await queueItem('quality_review', job.jobId)).toMatchObject({ resolved_at: expect.any(Date) })
    expect(await situation(job)).toBe('work_complete')
    // Nothing is deleted, and a passed review is final.
    await expect(sql`DELETE FROM quality.punch_items WHERE id = ${minorItem.id}`.execute(t.db)).rejects.toThrow()
    await expect(
      sql`UPDATE quality.reviews SET state = 'punch_required', version = version + 1 WHERE job_id = ${job.jobId}`.execute(
        t.db,
      ),
    ).rejects.toThrow(/final/)
  })

  it('a review with every area ok and no punch item passes; the job is complete and Office may issue', async () => {
    const job = await reviewedJob()
    expect((await start('owner', job.jobId)).statusCode).toBe(200)
    const v = await view(job.jobId)
    // Only from a review in progress, at the version shown.
    expect((await decide(job.jobId, (v.review?.version as number) + 3, OK)).statusCode).toBe(409)
    const res = await decide(job.jobId, v.review?.version as number, OK)
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json()).toMatchObject({ state: 'passed', jobState: 'operationally_complete' })
    expect((await view(job.jobId)).gate).toBe('passed')
    const issued = await issue('office', await finalInvoice(job.jobId))
    expect(issued.statusCode, issued.body).toBe(200)
    // A passed review takes no new punch item (a later problem is a warranty case, T56 / TSK-0094).
    expect(codes(await punch('owner', job.jobId, { kind: 'finish' }))).toContain('REVIEW_NOT_IN_PROGRESS')
  })

  it('the database keeps the rules whatever path writes: Owner reviewer, open safety hold, lifecycle order', async () => {
    const job = await approvedJob([{ kind: 'base', cents: 50_000 }])
    // No review before the job awaits quality review.
    await expect(
      sql`INSERT INTO quality.reviews (job_id, project_id) VALUES (${job.jobId}, ${job.projectId})`.execute(t.db),
    ).rejects.toThrow(/awaiting quality review/)
    await awaitingReview(job.jobId)
    // Only an Owner reviews.
    await expect(
      sql`UPDATE quality.reviews SET state = 'in_review', reviewer_id = ${ids.office}, started_at = now(),
            version = version + 1 WHERE job_id = ${job.jobId}`.execute(t.db),
    ).rejects.toThrow(/an Owner/)
    // No skipping the review to passed.
    await expect(
      sql`UPDATE quality.reviews SET state = 'passed', passed_at = now(), version = version + 1
          WHERE job_id = ${job.jobId}`.execute(t.db),
    ).rejects.toThrow()
    expect((await start('owner', job.jobId)).statusCode).toBe(200)
    const review = await t.db
      .selectFrom('quality.reviews')
      .select('id')
      .where('job_id', '=', job.jobId)
      .executeTakeFirstOrThrow()
    // A safety concern names an unresolved critical hold of the job; severity follows the kind.
    const base = sql`${review.id}, ${job.jobId}, ${job.projectId}, 'Synthetic area', 'Synthetic', 'Synthetic', ${ids.worker}, current_date, ${ids.owner}`
    await expect(
      sql`INSERT INTO quality.punch_items (review_id, job_id, project_id, area, description, required_evidence,
            assigned_to, due_on, created_by, kind, severity, hold_id)
          VALUES (${base}, 'safety_concern', 'major', ${randomUUID()})`.execute(t.db),
    ).rejects.toThrow()
    await expect(
      sql`INSERT INTO quality.punch_items (review_id, job_id, project_id, area, description, required_evidence,
            assigned_to, due_on, created_by, kind, severity)
          VALUES (${base}, 'defect', 'minor')`.execute(t.db),
    ).rejects.toThrow(/punch_items_severity/)
  })
})
