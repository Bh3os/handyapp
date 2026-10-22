// The approval transaction against PostgreSQL 16 (TSK-0057; HH-EST-06, HH-EST-07, HH-EST-08, HH-ID-07, HH-API-04,
// HH-DATA-04, T17, T32, T33, T34, ENT-Approval, ENT-Job, ENT-JobScopeSnapshot, ENT-SchedulingTask, OWN-DEC-103,
// OWN-DEC-104, OWN-DEC-105, RULE-SERVER-AUTHZ, RULE-NO-INVENTED-FACTS, RULE-MONEY-CENTS). Staff, customers, requests,
// amounts and names are synthetic (RULE-SYNTHETIC-DATA); nothing reaches a real provider.
// TSK-0144: migration 0073 records the owner's sign-off of terms v1.0 (OWN-DEC-187, ESTIMATE_TERMS_V1_RECORD): approved
// by the owner, not attorney-reviewed. The approvals here run under that record and pin v1.0. Some tests record other
// synthetic terms states (pending, NOT CONFIGURED, another document) in this throwaway test database only.
import { randomUUID } from 'node:crypto'
import { loadServiceSeed, syncServices, withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import { ESTIMATE_TERMS, ESTIMATE_TERMS_V1_RECORD } from '@handyhub/domain/legal'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { estimateReminderAutomations } from '../../src/modules/estimates/index.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { startCustomerSession } from '../../src/modules/identity/customer-sessions.js'
import { readCodeKey, type CodeKeySettings } from '../../src/modules/identity/index.js'
import { deriveCode } from '../../src/modules/identity/keys.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import { MODULES } from '../../src/modules/index.js'
import { forbiddenForCustomer } from '../../src/modules/records/index.js'
import { createAutomationRegistry } from '../../src/platform/automation.js'
import { loadConfig, recordPolicyVersion, type ConfigKey } from '../../src/platform/config/index.js'
import { createWorker } from '../../src/platform/jobs.js'
import { FakeObjectStorage } from '../../src/providers/r2/index.js'
import { testConfig } from '../fixtures/env.js'
import { signInWithMfa } from '../fixtures/staff-mfa.js'

const KEY: CodeKeySettings = readCodeKey({
  HANDYHUB_ENV: 'ci',
  CODE_HASH_KEY: ['synthetic', 'approval', 'code', 'key', 'for', 'tests', 'only', '0057'].join('-'),
})
const pw = (n: number) => ['synthetic', 'estimate', 'approval', 'passphrase', String(n)].join(' ')
const PEOPLE = ['owner', 'estimator'] as const
type Person = (typeof PEOPLE)[number]

let t: TestDatabase
let app: FastifyInstance
const cookies = {} as Record<Person, string>
const csrf = {} as Record<Person, string>

/** Terms v1.0 as recorded before the owner's approval: owner review pending. */
const V1_PENDING = {
  documentId: ESTIMATE_TERMS.documentId,
  status: 'owner_review_pending',
  attorneyReviewed: false,
  preparedOn: ESTIMATE_TERMS.preparedOn,
  contentSha256: ESTIMATE_TERMS.contentSha256,
}
/** The owner's sign-off of v1.0 as migration 0073 records it (OWN-DEC-187; see the header). */
const V1_SIGNED_OFF = ESTIMATE_TERMS_V1_RECORD

async function setConfig(key: ConfigKey, value: unknown) {
  await recordPolicyVersion(t.db, {
    key,
    value: value as never,
    sourceIds: ['TEST-SYNTHETIC'],
    changedBy: 'test',
    reason: 'synthetic test configuration',
  })
}

async function signIn(p: Person): Promise<[string, string]> {
  const res = await signInWithMfa(app, {
    method: 'POST',
    url: '/api/v1/staff/auth/sign-in',
    payload: { email: `${p}-estimate-approval@example.test`, password: pw(1) },
  })
  expect(res.statusCode).toBe(200)
  const cookie = String(res.headers['set-cookie']).split(';')[0] as string
  const session = await app.inject({ method: 'GET', url: '/api/v1/staff/auth/session', headers: { cookie } })
  return [cookie, session.json<{ csrfToken: string }>().csrfToken]
}

beforeAll(async () => {
  t = await createTestDatabase()
  await syncServices(t.db, loadServiceSeed())
  app = await buildApp({
    config: testConfig({ TRUST_PROXY_HOPS: '1' }),
    api: { db: t.db, codeKey: KEY, storage: new FakeObjectStorage() },
  })
  const hash = await hashPassword(pw(1))
  await withTx(t.db, async (tx) => {
    for (const p of PEOPLE) {
      const user = await createStaffUser(tx, {
        email: `${p}-estimate-approval@example.test`,
        displayName: `Synthetic ${p}`,
        locale: 'en',
        role: p,
        issuedBy: 'test',
      })
      await setPasswordHash(tx, user.id, hash)
    }
  })
  for (const p of PEOPLE) [cookies[p], csrf[p]] = await signIn(p)
})
afterAll(async () => {
  await app?.close()
  await t?.drop()
})

let seq = 0
const key = (what: string) => `synthetic-${what}-${String(++seq).padStart(6, '0')}-${randomUUID()}`
function staffWrite(who: Person, method: 'POST' | 'PUT', url: string, payload: unknown, version?: number) {
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

type Project = { requestId: string; projectId: string; reference: string; contactId: string; grantId: string }
let ip = 10
async function readyRequest(): Promise<Project> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/public/requests',
    headers: { 'idempotency-key': key('submit'), 'x-forwarded-for': `198.51.100.${++ip}` },
    payload: {
      formVersion: 'test-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-01' }, { serviceId: 'SVC-PT-01' }],
      notSure: false,
      description: 'Synthetic estimate approval project.',
      answers: [],
      property: {
        street: `${seq} Synthetic Approval Row`,
        city: 'Testville',
        state: 'ky',
        zip: '40000',
        propertyType: 'house',
      },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'online',
      contact: {
        fullName: 'Synthetic Approval Customer',
        email: `estimate-approval-${seq}-${randomUUID().slice(0, 8)}@example.test`,
        phone: '(502) 555-0157',
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
  const grant = await t.db
    .selectFrom('identity.project_access_grants')
    .select('id')
    .where('request_id', '=', row.id)
    .executeTakeFirstOrThrow()
  expect(
    (await staffWrite('owner', 'PUT', `/api/v1/staff/requests/${row.id}/qualification`, { checks: ALL_OK }, 0))
      .statusCode,
  ).toBe(200)
  const moved = await staffWrite(
    'owner',
    'POST',
    `/api/v1/staff/requests/${row.id}/actions/online-estimate`,
    { workPackages: ['SVC-DW-01', 'SVC-PT-01'] },
    row.state_version,
  )
  expect(moved.statusCode, moved.body).toBe(200)
  return { requestId: row.id, projectId: row.project_id, reference, contactId: row.contact_id, grantId: grant.id }
}

type StaffView = { rowVersion: number; workPackages: { id: string }[] }
const staffView = async (versionId: string) => {
  const res = await staffGet('estimator', `/api/v1/staff/estimate-versions/${versionId}`)
  expect(res.statusCode).toBe(200)
  return res.json<StaffView>()
}

// Base lines 2 x $12.50 + $1,250.00 = $1,275.00; an optional add-on 3 x $19.99 = $59.97 at position 3.
const LINES = (v: StaffView) => [
  {
    kind: 'base',
    workPackageId: v.workPackages[0]?.id,
    description: 'Patch the synthetic hole',
    quantity: '2',
    unit: 'patch',
    unitPriceCents: 1250,
  },
  {
    kind: 'base',
    workPackageId: v.workPackages[1]?.id,
    description: 'Paint the synthetic wall',
    quantity: '1',
    unit: 'room',
    unitPriceCents: 125_000,
  },
  {
    kind: 'add_on',
    workPackageId: v.workPackages[1]?.id,
    description: 'Synthetic optional trim',
    quantity: '3',
    unit: 'door',
    unitPriceCents: 1999,
  },
]

async function publishDraft(versionId: string, rowVersion?: number) {
  const v = await staffView(versionId)
  const saved = await staffWrite(
    'estimator',
    'PUT',
    `/api/v1/staff/estimate-versions/${versionId}/draft`,
    { lines: LINES(v), texts: { exclusions: ['Synthetic: moving furniture'], assumptions: ['Synthetic: walls dry'] } },
    rowVersion ?? v.rowVersion,
  )
  expect(saved.statusCode, saved.body).toBe(200)
  const pub = await staffWrite(
    'estimator',
    'POST',
    `/api/v1/staff/estimate-versions/${versionId}/publish`,
    {},
    saved.json<{ rowVersion: number }>().rowVersion,
  )
  expect(pub.statusCode, pub.body).toBe(200)
}

/** A published estimate under the given terms record. */
/**
 * The client address customer calls come from: a new documentation network (RFC 3849) per published estimate, so the
 * per-network limits of the customer writes count each test on its own, as they would separate visitors.
 */
let client = '2001:db8:57::1'
let nets = 0
async function published(terms: Record<string, unknown> = V1_SIGNED_OFF) {
  client = `2001:db8:57:${++nets}::1`
  await setConfig('legal.estimate_terms', terms)
  const p = await readyRequest()
  const created = await staffWrite('estimator', 'POST', `/api/v1/staff/projects/${p.projectId}/estimates`, {})
  expect(created.statusCode).toBe(201)
  const c = created.json<{ number: string; versionId: string }>()
  await publishDraft(c.versionId)
  return { ...p, number: c.number, versionId: c.versionId }
}
type Published = Awaited<ReturnType<typeof published>>

async function customerCookie(p: Pick<Project, 'contactId' | 'projectId' | 'grantId'>, verifiedAt = new Date()) {
  const s = await withTx(t.db, (tx) =>
    startCustomerSession(tx, {
      contactRef: p.contactId,
      via: 'grant',
      projectIds: [p.projectId],
      verifiedAt,
      grantId: p.grantId,
    }),
  )
  return `__Host-hh_customer=${s.token}`
}
const base = (e: { reference: string; number: string }, version = 1) =>
  `/api/v1/customer/projects/${e.reference}/estimates/${e.number}/versions/${version}`
const customerGet = (url: string, cookie: string) => app.inject({ method: 'GET', url, headers: { cookie } })
function customerPost(url: string, cookie: string, payload: unknown, idempotencyKey = key('customer')) {
  return app.inject({
    method: 'POST',
    url,
    payload: payload as object,
    headers: {
      cookie,
      'idempotency-key': idempotencyKey,
      'x-forwarded-for': client,
      'user-agent': 'SyntheticBrowser/1.0 (test)',
    },
  })
}

type Detail = {
  status: string
  totalCents: number
  freshVerification: boolean
  approval: {
    available: boolean
    reasons: string[]
    current: { number: string; version: number } | null
    contentDigest: string
    selection: {
      options: number[]
      subtotalCents: number
      reductionCents: number
      totalCents: number
      deposit: { state: string; amountCents: number | null }
    } | null
    approved: { at: string; options: number[]; totalCents: number; deposit: unknown } | null
  }
}
const detail = async (e: Published, cookie: string, version = 1) => {
  const res = await customerGet(base(e, version), cookie)
  expect(res.statusCode, res.body).toBe(200)
  return res.json<Detail>()
}

/** The approval body the page sends for a selection whose totals it was shown. */
function approvalBody(
  d: Detail,
  over: Partial<{ options: number[]; totalCents: number; depositCents: number | null }> = {},
): Record<string, unknown> {
  const s = d.approval.selection
  return {
    contentDigest: d.approval.contentDigest,
    options: s?.options ?? [],
    totalCents: s?.totalCents ?? d.totalCents,
    depositCents: s?.deposit.amountCents ?? null,
    termsDocumentId: ESTIMATE_TERMS.documentId,
    termsSha256: ESTIMATE_TERMS.contentSha256,
    acceptTerms: true,
    fullName: '  Synthetic   Approval Customer ',
    ...over,
  }
}

const counts = async (projectId: string) => {
  const n = async (q: Promise<{ n: string | number | bigint }[]>) => Number((await q)[0]?.n ?? 0)
  return {
    approvals: await n(
      t.db
        .selectFrom('estimating.approvals')
        .select((eb) => eb.fn.countAll().as('n'))
        .where('project_id', '=', projectId)
        .execute(),
    ),
    jobs: await n(
      t.db
        .selectFrom('work.jobs')
        .select((eb) => eb.fn.countAll().as('n'))
        .where('project_id', '=', projectId)
        .execute(),
    ),
    tasks: await n(
      t.db
        .selectFrom('work.scheduling_tasks')
        .select((eb) => eb.fn.countAll().as('n'))
        .where('project_id', '=', projectId)
        .execute(),
    ),
  }
}
const versionRow = (id: string) =>
  t.db.selectFrom('estimating.estimate_versions').selectAll().where('id', '=', id).executeTakeFirstOrThrow()
const projectState = async (id: string) =>
  (await t.db.selectFrom('crm.projects').select('state').where('id', '=', id).executeTakeFirstOrThrow()).state
const NOTHING = { approvals: 0, jobs: 0, tasks: 0 }
const ONE = { approvals: 1, jobs: 1, tasks: 1 }

describe('[HH-EST-06][HH-EST-08][T33] approving the exact published version creates one job and one scheduling task', () => {
  it('records version, digest, options, totals, terms, payment term, name, contact, grant and server time', async () => {
    const e = await published()
    const cookie = await customerCookie(e)
    const before = await detail(e, cookie)
    expect(before.approval).toMatchObject({ available: true, reasons: [], current: null, approved: null })
    expect(before.approval.contentDigest).toMatch(/^[0-9a-f]{64}$/)
    // The base offer: $1,275.00, deposit 20% = $255.00 (over $1,000.00, FACT-DEPOSIT-RULE).
    expect(before.approval.selection).toEqual({
      options: [],
      subtotalCents: 127_500,
      reductionCents: 0,
      totalCents: 127_500,
      deposit: { state: 'required', amountCents: 25_500 },
    })

    // Selecting the add-on: the server's total and deposit for that choice ($1,334.97; 20% = $266.994 -> $266.99).
    const sel = await customerPost(`${base(e)}/selection`, cookie, { options: [3] })
    expect(sel.statusCode, sel.body).toBe(200)
    expect(sel.json()).toEqual({
      reference: e.reference,
      number: e.number,
      version: 1,
      selection: {
        options: [3],
        subtotalCents: 133_497,
        reductionCents: 0,
        totalCents: 133_497,
        deposit: { state: 'required', amountCents: 26_699 },
      },
    })
    // A base line is not an option; nothing is saved.
    const notOption = await customerPost(`${base(e)}/selection`, cookie, { options: [1] })
    expect(notOption.statusCode).toBe(400)
    expect(notOption.json()).toMatchObject({
      error: { fieldErrors: [{ field: 'body.options', code: 'NOT_AN_OPTION' }] },
    })
    const shown = await detail(e, cookie)
    expect(shown.approval.selection?.options).toEqual([3])

    const k = key('approve')
    const res = await customerPost(`${base(e)}/approve`, cookie, approvalBody(shown), k)
    expect(res.statusCode, res.body).toBe(201)
    const answer = res.json<Record<string, unknown>>()
    expect(answer).toEqual({
      reference: e.reference,
      number: e.number,
      version: 1,
      status: 'approved',
      approved: {
        at: expect.any(String),
        options: [3],
        subtotalCents: 133_497,
        reductionCents: 0,
        totalCents: 133_497,
        deposit: { state: 'required', amountCents: 26_699 },
      },
      // TSK-0058 (OWN-DEC-105): a required deposit that is not satisfied is the next step.
      nextStep: 'deposit_due',
    })
    // T24: no internal ID, name or security detail reaches the answer.
    expect(JSON.stringify(answer)).not.toContain('Synthetic Approval Customer')
    expect(Object.keys(answer).filter(forbiddenForCustomer)).toEqual([])

    // The approval record (ENT-Approval).
    const a = await t.db
      .selectFrom('estimating.approvals')
      .selectAll()
      .where('version_id', '=', e.versionId)
      .executeTakeFirstOrThrow()
    const config = await loadConfig(t.db)
    const privacy = config.get('legal.privacy_notice')
    expect(a).toMatchObject({
      project_id: e.projectId,
      version: 1,
      content_sha256: shown.approval.contentDigest,
      authoring_method: 'written',
      document_sha256: null,
      selected_options: [3],
      subtotal_cents: '133497',
      total_cents: '133497',
      deposit_state: 'required',
      deposit_cents: '26699',
      terms_document_id: ESTIMATE_TERMS.documentId,
      terms_sha256: ESTIMATE_TERMS.contentSha256,
      payment_term: 'due_on_receipt',
      payment_term_text: 'Payment due on receipt',
      privacy_notice_id: privacy.state === 'CONFIGURED' ? privacy.value.documentId : null,
      terms_accepted: true,
      full_name: 'Synthetic Approval Customer',
      contact_ref: e.contactId,
      access_via: 'grant',
      grant_id: e.grantId,
      account_id: null,
      method: 'portal',
      test_mark: true,
      client_address: client,
      user_agent: 'SyntheticBrowser/1.0 (test)',
      idempotency_key: k,
    })
    expect(a.customer_session_id).toEqual(expect.any(String))
    expect(a.verified_at).toBeInstanceOf(Date)
    expect(a.created_at).toBeInstanceOf(Date)

    // The version is accepted, the project approved; one job, its snapshot v1, one open scheduling task.
    expect((await versionRow(e.versionId)).state).toBe('accepted')
    expect(await projectState(e.projectId)).toBe('approved')
    expect(await counts(e.projectId)).toEqual(ONE)
    const job = await t.db
      .selectFrom('work.jobs')
      .selectAll()
      .where('project_id', '=', e.projectId)
      .executeTakeFirstOrThrow()
    expect(job).toMatchObject({ approval_id: a.id, operational_state: 'pending_preparation', version: 1 })
    const snap = await t.db
      .selectFrom('work.job_scope_snapshots')
      .selectAll()
      .where('job_id', '=', job.id)
      .executeTakeFirstOrThrow()
    expect(snap).toMatchObject({
      version: 1,
      source: 'approval',
      approval_id: a.id,
      estimate_version_id: e.versionId,
      exclusions: ['Synthetic: moving furniture'],
      selected_options: [3],
      total_cents: '133497',
      terms_document_id: ESTIMATE_TERMS.documentId,
    })
    expect((snap.lines as { description: string }[]).map((l) => l.description)).toEqual([
      'Patch the synthetic hole',
      'Paint the synthetic wall',
      'Synthetic optional trim',
    ])
    expect(snap.texts).toMatchObject({ assumptions: ['Synthetic: walls dry'] })
    const task = await t.db
      .selectFrom('work.scheduling_tasks')
      .selectAll()
      .where('job_id', '=', job.id)
      .executeTakeFirstOrThrow()
    expect(task).toMatchObject({ state: 'open', purpose: 'work_visits', project_id: e.projectId })
    const packages = await t.db
      .selectFrom('work.work_packages')
      .select('job_id')
      .where('project_id', '=', e.projectId)
      .execute()
    expect(packages.map((p) => p.job_id)).toEqual([job.id, job.id])
    // The selection was working data; the approval holds it now.
    expect(
      await t.db
        .selectFrom('estimating.approval_selections')
        .selectAll()
        .where('version_id', '=', e.versionId)
        .execute(),
    ).toEqual([])
    // The committed event the approval receipt (TSK-0058) reads; the audit names what happened, not the name.
    const events = await t.db
      .selectFrom('platform.outbox_events')
      .select(['type', 'payload'])
      .where('aggregate_id', '=', a.id)
      .execute()
    expect(events).toEqual([{ type: 'estimate.approved', payload: { version: 1, depositRequired: true } }])
    const audit = await t.db
      .selectFrom('platform.audit_events')
      .selectAll()
      .where('action', '=', 'estimate.approve')
      .where('target_id', '=', e.versionId)
      .execute()
    expect(audit).toHaveLength(1)
    expect(JSON.stringify(audit[0])).not.toContain('Synthetic Approval Customer')
    expect(JSON.stringify(audit[0])).not.toContain('SyntheticBrowser')

    // The customer now sees what was approved; no further approval is offered. Approval is not an appointment.
    const after = await detail(e, cookie)
    expect(after.status).toBe('approved')
    expect(after.approval).toMatchObject({ available: false, reasons: [], selection: null })
    expect(after.approval.approved).toMatchObject({ options: [3], totalCents: 133_497 })
    const overview = (await customerGet(`/api/v1/customer/projects/${e.reference}/overview`, cookie)).json<{
      status: { situation: string }
    }>()
    expect(overview.status.situation).toBe('approved')

    // The staff lifecycle panel shows the approval, the job and the scheduling task.
    const staff = (await staffGet('estimator', `/api/v1/staff/estimate-versions/${e.versionId}`)).json<{
      lifecycle: { customerApproval: unknown }
    }>()
    expect(staff.lifecycle.customerApproval).toEqual({
      version: 1,
      at: expect.any(String),
      fullName: 'Synthetic Approval Customer',
      options: [3],
      totalCents: 133_497,
      depositCents: 26_699,
      termsVersion: ESTIMATE_TERMS.documentId,
      testMark: true,
      jobId: expect.any(String),
      jobState: 'pending_preparation',
      schedulingTaskState: 'open',
      // TSK-0058: no worker runs here, so the receipt is still being prepared and no message is recorded yet.
      receipt: { state: 'preparing', issuedAt: null, byteSize: null },
      receiptDeliveries: [],
    })
  })

  it('[ENT-Approval][ENT-JobScopeSnapshot] approvals and snapshots are append-only; one job per project, one task per job', async () => {
    const e = await published()
    const cookie = await customerCookie(e)
    const d = await detail(e, cookie)
    expect((await customerPost(`${base(e)}/approve`, cookie, approvalBody(d))).statusCode).toBe(201)
    await expect(
      sql`UPDATE estimating.approvals SET full_name = 'Altered' WHERE version_id = ${e.versionId}`.execute(t.db),
    ).rejects.toThrow(/append-only/)
    await expect(sql`DELETE FROM estimating.approvals WHERE version_id = ${e.versionId}`.execute(t.db)).rejects.toThrow(
      /append-only/,
    )
    const job = await t.db
      .selectFrom('work.jobs')
      .selectAll()
      .where('project_id', '=', e.projectId)
      .executeTakeFirstOrThrow()
    await expect(
      sql`UPDATE work.job_scope_snapshots SET total_cents = 1, subtotal_cents = 1 WHERE job_id = ${job.id}`.execute(
        t.db,
      ),
    ).rejects.toThrow()
    await expect(sql`DELETE FROM work.jobs WHERE id = ${job.id}`.execute(t.db)).rejects.toThrow(/never deleted/)
    await expect(
      sql`INSERT INTO work.jobs (project_id, approval_id) VALUES (${e.projectId}, ${job.approval_id})`.execute(t.db),
    ).rejects.toThrow()
    await expect(
      sql`INSERT INTO work.scheduling_tasks (job_id, project_id) VALUES (${job.id}, ${e.projectId})`.execute(t.db),
    ).rejects.toThrow()
    await expect(
      sql`UPDATE work.scheduling_tasks SET state = 'fulfilled' WHERE job_id = ${job.id}`.execute(t.db),
    ).rejects.toThrow(/committed visit/)
    await expect(
      sql`UPDATE work.work_packages SET job_id = NULL WHERE project_id = ${e.projectId}`.execute(t.db),
    ).rejects.toThrow(/keeps the job/)
    // An approval is only ever written with its version's move to accepted.
    const other = await published()
    await expect(
      sql`INSERT INTO estimating.approvals SELECT (jsonb_populate_record(NULL::estimating.approvals,
            to_jsonb(a) || jsonb_build_object('id', gen_random_uuid(), 'version_id', ${other.versionId}::uuid,
            'project_id', ${other.projectId}::uuid, 'estimate_id', v.estimate_id))).*
          FROM estimating.approvals a, estimating.estimate_versions v
          WHERE a.version_id = ${e.versionId} AND v.id = ${other.versionId}`.execute(t.db),
    ).rejects.toThrow(/move to accepted/)
  })
})

describe('[T34][HH-EST-07][HH-API-04][HH-DATA-04] double clicks, two tabs and retries give one approval, one job, one task', () => {
  it('concurrent approvals under different keys and a retried key: exactly one of each; the others get the same result', async () => {
    const e = await published()
    const cookieA = await customerCookie(e)
    const cookieB = await customerCookie(e)
    const d = await detail(e, cookieA)
    const body = approvalBody(d)
    const retried = key('approve-retry')
    const calls = await Promise.all([
      customerPost(`${base(e)}/approve`, cookieA, body, retried),
      customerPost(`${base(e)}/approve`, cookieA, body, retried),
      customerPost(`${base(e)}/approve`, cookieA, body),
      customerPost(`${base(e)}/approve`, cookieB, body),
      customerPost(`${base(e)}/approve`, cookieB, body),
    ])
    const statuses = calls.map((c) => c.statusCode)
    expect(
      statuses.every((s) => s === 200 || s === 201),
      calls.map((c) => c.body).join('\n'),
    ).toBe(true)
    expect(statuses.filter((s) => s === 201).length).toBeGreaterThanOrEqual(1)
    // Exactly one approval, one job and one scheduling task.
    expect(await counts(e.projectId)).toEqual(ONE)
    // Every answer names the same approval (same time and totals).
    const approvedAt = new Set(calls.map((c) => c.json<{ approved: { at: string } }>().approved.at))
    expect(approvedAt.size).toBe(1)

    // The same key with a different body is a conflict; nothing more is written.
    const changed = await customerPost(
      `${base(e)}/approve`,
      cookieA,
      { ...body, fullName: 'Another Synthetic Name' },
      retried,
    )
    expect(changed.statusCode).toBe(409)
    expect(changed.json()).toMatchObject({ error: { code: 'IDEMPOTENCY_CONFLICT' } })
    // A different choice on the approved version is a conflict, never a second approval.
    const other = await customerPost(`${base(e)}/approve`, cookieB, {
      ...body,
      options: [3],
      totalCents: 133_497,
      depositCents: 26_699,
    })
    expect(other.statusCode).toBe(409)
    expect(other.json()).toMatchObject({ error: { code: 'CONFLICT', fieldErrors: [{ code: 'VERSION_APPROVED' }] } })
    expect(await counts(e.projectId)).toEqual(ONE)
  })

  it('a retry with the same key after the answer was lost returns the first answer (Idempotent-Replayed)', async () => {
    const e = await published()
    const cookie = await customerCookie(e)
    const body = approvalBody(await detail(e, cookie))
    const k = key('approve')
    const first = await customerPost(`${base(e)}/approve`, cookie, body, k)
    expect(first.statusCode).toBe(201)
    const replay = await customerPost(`${base(e)}/approve`, cookie, body, k)
    expect(replay.statusCode).toBe(201)
    expect(replay.headers['idempotent-replayed']).toBe('true')
    expect(replay.json()).toEqual(first.json())
    expect(await counts(e.projectId)).toEqual(ONE)
  })
})

describe('[T32][HH-EST-07] superseded and expired versions are refused, with the current version or Request an Updated Estimate', () => {
  it('version 1 after version 2 was published: refused with version 2 to review; version 2 is approved', async () => {
    const e = await published()
    const cookie = await customerCookie(e)
    const v1 = await detail(e, cookie)
    const revised = await staffWrite('estimator', 'POST', `/api/v1/staff/estimate-versions/${e.versionId}/revise`, {})
    expect(revised.statusCode, revised.body).toBeLessThan(300)
    const next = revised.json<{ versionId: string; rowVersion: number }>()
    await publishDraft(next.versionId, next.rowVersion)
    // The page still shows version 1 (an old tab): its approval is refused and nothing is written.
    const stale = await customerPost(`${base(e)}/approve`, cookie, approvalBody(v1))
    expect(stale.statusCode).toBe(409)
    expect(stale.json()).toMatchObject({
      error: {
        code: 'CONFLICT',
        fieldErrors: [{ field: 'version', code: 'VERSION_SUPERSEDED' }],
        current: { version: 2, values: { number: e.number } },
      },
    })
    expect(await counts(e.projectId)).toEqual(NOTHING)
    expect((await versionRow(e.versionId)).state).toBe('superseded')
    const old = await detail(e, cookie)
    expect(old.approval).toMatchObject({
      available: false,
      reasons: ['superseded'],
      current: { number: e.number, version: 2 },
    })
    // A version's digest is its own: version 1's digest never approves version 2.
    const v2 = await detail(e, cookie, 2)
    const crossed = await customerPost(`${base(e, 2)}/approve`, cookie, {
      ...approvalBody(v2),
      contentDigest: v1.approval.contentDigest,
    })
    expect(crossed.statusCode).toBe(409)
    expect(crossed.json()).toMatchObject({ error: { fieldErrors: [{ code: 'CONTENT_MISMATCH' }] } })
    const ok = await customerPost(`${base(e, 2)}/approve`, cookie, approvalBody(v2))
    expect(ok.statusCode, ok.body).toBe(201)
    expect(await counts(e.projectId)).toEqual(ONE)
  })

  it('an expired version is refused; with no current version the customer is offered Request an Updated Estimate', async () => {
    const e = await published()
    const cookie = await customerCookie(e)
    const d = await detail(e, cookie)
    // The validity ended and the expiry job recorded it (a published version's dates never change).
    await sql`UPDATE estimating.estimate_versions SET state = 'expired', state_changed_at = now(),
              row_version = row_version + 1 WHERE id = ${e.versionId}`.execute(t.db)
    const res = await customerPost(`${base(e)}/approve`, cookie, approvalBody(d))
    expect(res.statusCode).toBe(409)
    expect(res.json()).toMatchObject({ error: { fieldErrors: [{ field: 'version', code: 'VERSION_EXPIRED' }] } })
    expect(res.json<{ error: Record<string, unknown> }>().error['current']).toBeUndefined()
    expect(await counts(e.projectId)).toEqual(NOTHING)
    const after = (await customerGet(base(e), cookie)).json<Detail & { actions: { requestUpdate: boolean } }>()
    expect(after.approval).toMatchObject({ available: false, current: null })
    expect(after.actions.requestUpdate).toBe(true)
  })
})

describe('[HH-EST-07][T33] the server recomputes options and total; an altered request writes nothing', () => {
  it('an altered total, deposit, option set, digest, terms, an unticked box or no name is refused with no record', async () => {
    const e = await published()
    const cookie = await customerCookie(e)
    const d = await detail(e, cookie)
    const url = `${base(e)}/approve`
    const refusals: [Record<string, unknown>, number, string][] = [
      [approvalBody(d, { totalCents: 100 }), 400, 'TOTAL_MISMATCH'],
      [approvalBody(d, { depositCents: null }), 400, 'TOTAL_MISMATCH'],
      [approvalBody(d, { options: [3] }), 400, 'TOTAL_MISMATCH'],
      [approvalBody(d, { options: [2] }), 400, 'NOT_AN_OPTION'],
      [{ ...approvalBody(d), contentDigest: 'a'.repeat(64) }, 409, 'CONTENT_MISMATCH'],
      [{ ...approvalBody(d), termsSha256: 'b'.repeat(64) }, 409, 'TERMS_NOT_SHOWN'],
      [{ ...approvalBody(d), acceptTerms: false }, 400, 'required'],
      [{ ...approvalBody(d), fullName: '   ' }, 400, 'required'],
    ]
    for (const [body, status, code] of refusals) {
      const res = await customerPost(url, cookie, body)
      expect(res.statusCode, `${code}: ${res.body}`).toBe(status)
      expect(res.json<{ error: { fieldErrors: { code: string }[] } }>().error.fieldErrors.map((f) => f.code)).toContain(
        code,
      )
    }
    // A missing box or a malformed body is refused by the contract before anything runs.
    const noBox = approvalBody(d)
    delete noBox['acceptTerms']
    expect((await customerPost(url, cookie, noBox)).statusCode).toBe(400)
    expect((await customerPost(url, cookie, { ...approvalBody(d), totalCents: 1.5 })).statusCode).toBe(400)
    expect(await counts(e.projectId)).toEqual(NOTHING)
    expect((await versionRow(e.versionId)).state).toBe('published')
    expect(await projectState(e.projectId)).toBe('open')
  })
})

describe('[RULE-NO-INVENTED-FACTS][HH-EST-13] terms that are not in effect are never accepted: NOT CONFIGURED', () => {
  it('terms v1.0 waiting for the owner: approval is unavailable and answers NOT_CONFIGURED; nothing is written', async () => {
    const e = await published(V1_PENDING)
    const cookie = await customerCookie(e)
    const d = await detail(e, cookie)
    expect(d.approval).toMatchObject({ available: false, reasons: ['terms_not_in_effect'], current: null })
    const res = await customerPost(`${base(e)}/approve`, cookie, approvalBody(d))
    expect(res.statusCode).toBe(503)
    expect(res.json()).toMatchObject({
      error: { code: 'NOT_CONFIGURED', fieldErrors: [{ field: 'terms', code: 'TERMS_NOT_IN_EFFECT' }] },
    })
    expect(await counts(e.projectId)).toEqual(NOTHING)
    expect((await versionRow(e.versionId)).state).toBe('published')
  })

  it('terms NOT CONFIGURED answer NOT_CONFIGURED; other terms than the current are a conflict', async () => {
    const e = await published()
    const cookie = await customerCookie(e)
    const d = await detail(e, cookie)
    await setConfig('legal.estimate_terms', null)
    const res = await customerPost(`${base(e)}/approve`, cookie, approvalBody(d))
    expect(res.statusCode).toBe(503)
    expect(res.json()).toMatchObject({ error: { fieldErrors: [{ field: 'terms', code: 'TERMS_NOT_CONFIGURED' }] } })
    // Another terms document recorded since publishing: the version's pinned terms are no longer the current ones.
    await setConfig('legal.estimate_terms', { ...V1_SIGNED_OFF, documentId: 'test-estimate-terms-2' })
    const other = await customerPost(`${base(e)}/approve`, cookie, approvalBody(d))
    expect(other.statusCode).toBe(409)
    expect(other.json()).toMatchObject({ error: { fieldErrors: [{ field: 'terms', code: 'TERMS_NOT_CURRENT' }] } })
    expect(await counts(e.projectId)).toEqual(NOTHING)
  })

  it('[OWN-DEC-187][RULE-NO-INVENTED-FACTS] in a fresh database the terms are the owner sign-off of v1.0, not attorney-reviewed', async () => {
    const fresh = await createTestDatabase()
    try {
      const entry = (await loadConfig(fresh.db)).get('legal.estimate_terms')
      expect(entry).toMatchObject({ state: 'CONFIGURED', version: 2, value: ESTIMATE_TERMS_V1_RECORD })
      expect(entry.state === 'CONFIGURED' && entry.value.attorneyReviewed).toBe(false)
    } finally {
      await fresh.drop()
    }
  })
})

describe('[HH-ID-07][HH-ID-06] fresh verification before approving, without losing the selected options', () => {
  it('a stale session is refused; a new code in the session makes it fresh; the options were kept on the server', async () => {
    const config = await loadConfig(t.db)
    const limits = config.get('verification.limits')
    if (limits.state !== 'CONFIGURED') throw new Error('verification.limits is seeded')
    const e = await published()
    const stale = new Date(Date.now() - (limits.value.freshVerificationMinutes + 1) * 60_000)
    const cookie = await customerCookie(e, stale)
    // Selecting options does not need a fresh verification; it is kept on the server.
    expect((await customerPost(`${base(e)}/selection`, cookie, { options: [3] })).statusCode).toBe(200)
    const d = await detail(e, cookie)
    expect(d.freshVerification).toBe(false)
    const refused = await customerPost(`${base(e)}/approve`, cookie, approvalBody(d))
    expect(refused.statusCode).toBe(403)
    expect(refused.json()).toMatchObject({ error: { fieldErrors: [{ code: 'FRESH_VERIFICATION_REQUIRED' }] } })
    expect(await counts(e.projectId)).toEqual(NOTHING)
    expect((await detail(e, cookie)).approval.selection?.options).toEqual([3])

    // Where a code can go: the session's own contact, masked.
    const status = await customerGet('/api/v1/customer/session/verification', cookie)
    expect(status.statusCode, status.body).toBe(200)
    expect(status.json()).toMatchObject({
      fresh: false,
      channels: [{ channel: 'email', destination: expect.stringMatching(/^e\*\*\*@example\.test$/) }],
    })
    // The phone has no SMS opt-in on this request: no text goes to it.
    const phone = await customerPost('/api/v1/customer/session/verification/codes', cookie, { channel: 'phone' })
    expect(phone.statusCode).toBe(400)
    const sent = await customerPost('/api/v1/customer/session/verification/codes', cookie, { channel: 'email' })
    expect(sent.statusCode, sent.body).toBe(202)
    const code = await t.db
      .selectFrom('identity.verification_codes')
      .select(['id', 'nonce', 'subject_ref', 'purpose'])
      .where('subject_ref', '=', `reverify:grant:${e.grantId}:email`)
      .orderBy('created_at', 'desc')
      .executeTakeFirstOrThrow()
    expect(code.purpose).toBe('project_access')
    if (KEY.state !== 'configured') throw new Error('the test code key is configured')
    const right = deriveCode(KEY.key, code.id, code.nonce, limits.value.codeDigits)
    const wrong = right === '000000' ? '111111' : '000000'
    // A wrong code: the neutral answer, the attempt kept, the session still stale.
    const bad = await customerPost('/api/v1/customer/session/verification', cookie, { channel: 'email', code: wrong })
    expect(bad.statusCode).toBe(400)
    expect(bad.json()).toMatchObject({ error: { fieldErrors: [{ field: 'body.code', code: 'invalid_code' }] } })
    expect(
      (
        await t.db
          .selectFrom('identity.verification_codes')
          .select('attempts')
          .where('id', '=', code.id)
          .executeTakeFirstOrThrow()
      ).attempts,
    ).toBe(1)
    // This code never opens the access link: its subject is the session's re-verification only.
    const ok = await customerPost('/api/v1/customer/session/verification', cookie, { channel: 'email', code: right })
    expect(ok.statusCode, ok.body).toBe(200)
    expect(ok.json()).toMatchObject({ fresh: true })
    const now = await detail(e, cookie)
    expect(now.freshVerification).toBe(true)
    expect(now.approval.selection?.options).toEqual([3])
    const approved = await customerPost(`${base(e)}/approve`, cookie, approvalBody(now))
    expect(approved.statusCode, approved.body).toBe(201)
    expect(await counts(e.projectId)).toEqual(ONE)
    const a = await t.db
      .selectFrom('estimating.approvals')
      .select(['verified_at', 'selected_options'])
      .where('version_id', '=', e.versionId)
      .executeTakeFirstOrThrow()
    expect(a.selected_options).toEqual([3])
    expect(a.verified_at.getTime()).toBeGreaterThan(stale.getTime())
  })

  it('the access is checked again at the moment of the write: a revoked grant approves nothing', async () => {
    const e = await published()
    const cookie = await customerCookie(e)
    const d = await detail(e, cookie)
    // The grant is revoked between the page load and the write, while the session row still reads live.
    await sql`UPDATE identity.project_access_grants SET revoked_at = now(), revoke_reason = 'staff_revoked',
              revoked_by = 'test' WHERE id = ${e.grantId}`.execute(t.db)
    const res = await customerPost(`${base(e)}/approve`, cookie, approvalBody(d))
    expect(res.statusCode).toBe(403)
    expect(res.json()).toMatchObject({ error: { fieldErrors: [{ code: 'ACCESS_REVOKED' }] } })
    expect(await counts(e.projectId)).toEqual(NOTHING)
  })
})

/** An active customer account linked to the project (TSK-0036 records, written directly), and a session for it. */
async function accountCookie(e: Published, verifiedAt = new Date()) {
  const r = await t.db
    .selectFrom('intake.requests as r')
    .innerJoin('crm.contacts as c', 'c.id', 'r.contact_id')
    .select(['r.id', 'r.customer_id', 'c.email'])
    .where('r.project_id', '=', e.projectId)
    .executeTakeFirstOrThrow()
  const accountId = randomUUID()
  const codeId = randomUUID()
  const linkId = randomUUID()
  const email = r.email.toLowerCase()
  await sql`INSERT INTO identity.verification_codes (id, purpose, channel, destination, subject_ref, nonce, code_digest,
              max_attempts, expires_at, request_id, consumed_at)
            VALUES (${codeId}, 'account_sign_in', 'email', ${email}, ${`enroll:${r.id}:${e.contactId}:email`},
              ${'0'.repeat(32)}, ${'0'.repeat(64)}, 5, now() + interval '10 minutes', 'synthetic-test', now())`.execute(
    t.db,
  )
  await sql`INSERT INTO identity.customer_accounts (id, sign_in_email, email_verified_at, customer_id, contact_id,
              enrolled_via) VALUES (${accountId}, ${email}, now(), ${r.customer_id}, ${e.contactId}, 'project_link')`.execute(
    t.db,
  )
  await sql`INSERT INTO identity.customer_identity_links (id, account_id, customer_id, contact_id, project_id, request_id,
              authority, evidence, evidence_channel, evidence_code_id, state, decided_by, decided_at)
            VALUES (${linkId}, ${accountId}, ${r.customer_id}, ${e.contactId}, ${e.projectId}, ${r.id}, 'owner',
              'project_link_code', 'email', ${codeId}, 'active', ${`account:${accountId}`}, now())`.execute(t.db)
  const s = await withTx(t.db, (tx) =>
    startCustomerSession(tx, {
      contactRef: `account:${accountId}`,
      via: 'account',
      projectIds: [],
      verifiedAt,
      account: { id: accountId, signInChannel: 'email' },
    }),
  )
  return { cookie: `__Host-hh_customer=${s.token}`, accountId, linkId }
}

describe('[HH-ID-07][HH-ID-10] an account session approves through its active project link', () => {
  it('the approval names the account; its re-verification code goes to the account sign-in email', async () => {
    const e = await published()
    const { cookie, accountId } = await accountCookie(e)
    const d = await detail(e, cookie)
    const res = await customerPost(`${base(e)}/approve`, cookie, approvalBody(d))
    expect(res.statusCode, res.body).toBe(201)
    const a = await t.db
      .selectFrom('estimating.approvals')
      .select(['access_via', 'grant_id', 'account_id', 'contact_ref'])
      .where('version_id', '=', e.versionId)
      .executeTakeFirstOrThrow()
    expect(a).toEqual({
      access_via: 'account',
      grant_id: null,
      account_id: accountId,
      contact_ref: `account:${accountId}`,
    })
    expect(await counts(e.projectId)).toEqual(ONE)
    const status = (await customerGet('/api/v1/customer/session/verification', cookie)).json<{
      fresh: boolean
      channels: { channel: string }[]
    }>()
    expect(status).toMatchObject({ fresh: true, channels: [{ channel: 'email' }] })
    const sent = await customerPost('/api/v1/customer/session/verification/codes', cookie, { channel: 'email' })
    expect(sent.statusCode, sent.body).toBe(202)
    const code = await t.db
      .selectFrom('identity.verification_codes')
      .select(['purpose'])
      .where('subject_ref', '=', `reverify:account:${accountId}:email`)
      .executeTakeFirstOrThrow()
    expect(code.purpose).toBe('account_sign_in')
  })

  it('a link revoked between the page load and the write approves nothing', async () => {
    const e = await published()
    const { cookie, linkId } = await accountCookie(e)
    const d = await detail(e, cookie)
    // The session row still names the account; the write reads the link again under a share lock.
    await sql`UPDATE identity.customer_identity_links SET state = 'revoked', revoked_at = now(),
              revoke_reason = 'corrected_link', revoked_by = 'test' WHERE id = ${linkId}`.execute(t.db)
    const res = await customerPost(`${base(e)}/approve`, cookie, approvalBody(d))
    // The session itself no longer opens the project (links are read on every request): the same NOT_FOUND.
    expect(res.statusCode).toBe(404)
    expect(await counts(e.projectId)).toEqual(NOTHING)
  })
})

describe('[T17][T19][RULE-SERVER-AUTHZ] only an explicit POST of the verified customer of this project approves', () => {
  it('a GET or HEAD of the approval path (a link preview) approves nothing; another project gets NOT_FOUND', async () => {
    const e = await published()
    const other = await published()
    const cookie = await customerCookie(e)
    for (const method of ['GET', 'HEAD'] as const) {
      const res = await app.inject({ method, url: `${base(e)}/approve`, headers: { cookie } })
      expect(res.statusCode).toBe(404)
    }
    expect((await app.inject({ method: 'GET', url: `${base(e)}/approve` })).statusCode).toBe(404)
    // Another project's estimate through this session: the same NOT_FOUND as a missing one, nothing written.
    const d = await detail(e, cookie)
    const cross = await customerPost(`${base(other)}/approve`, cookie, approvalBody(d))
    expect(cross.statusCode).toBe(404)
    expect((await customerPost(`${base(other)}/selection`, cookie, { options: [] })).statusCode).toBe(404)
    // Without a session: 401.
    const anonymous = await app.inject({
      method: 'POST',
      url: `${base(e)}/approve`,
      payload: approvalBody(d),
      headers: { 'idempotency-key': key('anon') },
    })
    expect(anonymous.statusCode).toBe(401)
    expect(await counts(e.projectId)).toEqual(NOTHING)
    expect(await counts(other.projectId)).toEqual(NOTHING)
    // Only one route holds estimate.approve, and it is a POST that needs an idempotency key.
    const routes = MODULES.flatMap((m) => m.routes).filter((r) => r.permission === 'estimate.approve')
    expect(routes.map((r) => [r.method, r.operationId, r.idempotency])).toEqual([
      ['POST', 'approveEstimate', 'required'],
    ])
  })
})

/** TSK-0060's reminder automations: publishing schedules the drafts; a due job prepares one (nothing is sent). */
const reminderRegistry = createAutomationRegistry(estimateReminderAutomations())
async function drainReminders() {
  const w = createWorker({ db: t.db, registry: reminderRegistry })
  for (let i = 0; i < 12; i++) {
    const r = await w.runOnce()
    if (r.dispatched + r.succeeded + r.retried + r.failed + r.cancelled === 0) return
  }
}
async function reminderDue(versionId: string, step: 'first' | 'final') {
  await sql`UPDATE platform.jobs SET run_at = now() WHERE automation = 'estimate.reminder_draft'
            AND job_key = ${`estimate.reminder_draft:${versionId}:${step}`}`.execute(t.db)
  await drainReminders()
}
const reminderRows = (versionId: string) =>
  t.db
    .selectFrom('platform.message_deliveries')
    .selectAll()
    .where('record_type', '=', 'estimate_version')
    .where('record_id', '=', versionId)
    .where('message_key', '=', 'reminder.unanswered_estimate')
    .orderBy('seq')
    .execute()
const reminderItem = (versionId: string) =>
  t.db
    .selectFrom('ops.queue_items')
    .selectAll()
    .where('type', '=', 'estimate_reminder')
    .where('subject_id', '=', versionId)
    .execute()

describe('[HH-EST-14][HH-EST-06][T65] the approval stops waiting reminder drafts in its own transaction (TSK-0060)', () => {
  it('a first reminder waiting for release is cancelled as accepted by the approval; the final one is never drafted', async () => {
    const e = await published()
    await drainReminders()
    await reminderDue(e.versionId, 'first')
    const [draft] = await reminderRows(e.versionId)
    expect(draft).toMatchObject({ state: 'draft', release: 'staff_released', project_id: e.projectId })
    expect((await reminderItem(e.versionId)).map((i) => i.resolution)).toEqual([null])

    const cookie = await customerCookie(e)
    const d = await detail(e, cookie)
    // A refused approval writes nothing: the draft is still waiting.
    const refused = await customerPost(`${base(e)}/approve`, cookie, approvalBody(d, { totalCents: 100 }))
    expect(refused.statusCode).toBe(400)
    expect((await reminderRows(e.versionId)).map((r) => r.state)).toEqual(['draft'])

    const approved = await customerPost(`${base(e)}/approve`, cookie, approvalBody(d))
    expect(approved.statusCode, approved.body).toBe(201)
    const approval = await t.db
      .selectFrom('estimating.approvals')
      .select(['created_at'])
      .where('version_id', '=', e.versionId)
      .executeTakeFirstOrThrow()
    const [stopped] = await reminderRows(e.versionId)
    expect(stopped).toMatchObject({ state: 'cancelled', error_code: 'accepted', cancelled_by: 'system' })
    // The same transaction: the cancellation carries the approval's own database time (now() of that transaction).
    expect(stopped?.cancelled_at?.getTime()).toBe(approval.created_at.getTime())
    expect((await reminderItem(e.versionId)).map((i) => i.resolution)).toEqual(['stopped'])
    const audit = await t.db
      .selectFrom('platform.audit_events')
      .select(['summary', 'actor_kind'])
      .where('action', '=', 'estimate_reminder.stop')
      .where('target_id', '=', draft?.id as string)
      .execute()
    expect(audit.map((a) => a.summary)).toEqual([
      { messageKey: 'reminder.unanswered_estimate', step: 'first', channel: 'email', reason: 'accepted' },
    ])

    // The final reminder finds the version accepted: nothing more is drafted.
    await reminderDue(e.versionId, 'final')
    expect((await reminderRows(e.versionId)).map((r) => [r.state, r.error_code])).toEqual([['cancelled', 'accepted']])
  })
})
