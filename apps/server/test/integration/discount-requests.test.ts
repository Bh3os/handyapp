// Discount requests with staff verification, against PostgreSQL 16 (TSK-0125; HH-EST-15, T31, OWN-DEC-165,
// OWN-DEC-145, FACT-PRICING-DISCOUNTS, FACT-DEPOSIT-RULE, RULE-SERVER-AUTHZ, RULE-MONEY-CENTS, RULE-NO-INVENTED-FACTS).
// The customer asks for one discount on the request form; it stays pending verification; a checkbox alone never
// approves it; staff record only the category, the result, who and when; a returning customer is found from the
// matched job history; the Owner reviews the rest; a failed verification leads to a revised estimate the customer
// approves; nothing about verification reaches a message. Staff, customers, amounts and references are synthetic
// (RULE-SYNTHETIC-DATA); nothing reaches a provider.
// A fixture of this file's own throwaway database, never a statement about the business: approvals need an estimate
// terms version in effect (OQ-TERMS-OWNER-APPROVAL), so a synthetic "approved and attorney-reviewed" one is recorded
// and NOT CONFIGURED restored at the end. A completed earlier job (for the returning-customer check) is set directly,
// with the database's triggers off for that statement, as the quality-review tests do for a finished job.
import { randomUUID } from 'node:crypto'
import { loadServiceSeed, syncServices, withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import { addLocalDays, localDateOf, resolveLocalTime } from '@handyhub/domain'
import { ESTIMATE_TERMS } from '@handyhub/domain/legal'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import {
  approvalReceiptDocumentAutomation,
  approvalReceiptNoticeAutomation,
} from '../../src/modules/estimates/index.js'
import { estimateReadyAutomation } from '../../src/modules/estimates/notify.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { startCustomerSession } from '../../src/modules/identity/customer-sessions.js'
import { readCodeKey, type CodeKeySettings } from '../../src/modules/identity/index.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import { receiptEmailAutomation } from '../../src/modules/requests/receipt-email.js'
import { createAutomationRegistry, type Automation } from '../../src/platform/automation.js'
import { recordPolicyVersion, type ConfigKey } from '../../src/platform/config/index.js'
import { createWorker } from '../../src/platform/jobs.js'
import { createProviders } from '../../src/providers/index.js'
import { FakeObjectStorage } from '../../src/providers/r2/index.js'
import { readProviderSettings } from '../../src/providers/settings.js'
import { verifyCountyOf } from '../fixtures/county.js'
import { testConfig } from '../fixtures/env.js'
import { signInWithMfa } from '../fixtures/staff-mfa.js'
import { verifyPropertyZone } from '../fixtures/zones.js'

const KEY: CodeKeySettings = readCodeKey({
  HANDYHUB_ENV: 'ci',
  CODE_HASH_KEY: ['synthetic', 'discount', 'code', 'key', 'for', 'tests', 'only', '0125'].join('-'),
})
const pw = (n: number) => ['synthetic', 'discount', 'verification', 'passphrase', String(n)].join(' ')
const PEOPLE = ['owner', 'office', 'estimator', 'worker'] as const
type Person = (typeof PEOPLE)[number]
const ZONE = 'America/Kentucky/Louisville'

let t: TestDatabase
let app: FastifyInstance
const storage = new FakeObjectStorage()
const cookies = {} as Record<Person, string>
const csrf = {} as Record<Person, string>
const ids = {} as Record<Person, string>
const fakes = (() => {
  const p = createProviders(readProviderSettings({ HANDYHUB_ENV: 'ci' }))
  if (!p.fakes.email || !p.fakes.sms) throw new Error('ci uses the fakes')
  return { email: p.email, sms: p.sms, fakeEmail: p.fakes.email }
})()

const V1_IN_EFFECT_FIXTURE = {
  documentId: ESTIMATE_TERMS.documentId,
  status: 'approved',
  attorneyReviewed: true,
  preparedOn: ESTIMATE_TERMS.preparedOn,
  contentSha256: ESTIMATE_TERMS.contentSha256,
}

async function setConfig(key: ConfigKey, value: unknown) {
  await recordPolicyVersion(t.db, {
    key,
    value: value as never,
    sourceIds: ['TEST-SYNTHETIC'],
    changedBy: 'test',
    reason: 'synthetic test configuration',
  })
}

const fast = (a: Automation): Automation => ({ ...a, retry: { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 1 } })
const providers = { email: fakes.email, sms: fakes.sms }
/** The messages this slice could send: the request receipt, the estimate-ready notice and the approval receipt. */
const worker = () =>
  createWorker({
    db: t.db,
    registry: createAutomationRegistry([
      fast(receiptEmailAutomation({ providers })),
      fast(estimateReadyAutomation({ providers, publicSiteUrl: 'https://site.example.test' })),
      fast(approvalReceiptDocumentAutomation(storage)),
      fast(approvalReceiptNoticeAutomation({ providers, publicSiteUrl: 'https://site.example.test' })),
    ]),
  })
const tick = () => new Promise((r) => setTimeout(r, 15))
async function drain() {
  const w = worker()
  for (let i = 0; i < 6; i++) {
    await w.runOnce()
    await tick()
  }
}

const email = (p: Person) => `${p}-discounts@example.test`
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
  app = await buildApp({
    config: testConfig({ TRUST_PROXY_HOPS: '1' }),
    api: { db: t.db, codeKey: KEY, storage },
  })
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
  await setConfig('legal.estimate_terms', V1_IN_EFFECT_FIXTURE)
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
let ip = 0
let nets = 0
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
const codes = (res: { json: <T>() => T }) =>
  res.json<{ error: { fieldErrors: { code: string }[] } }>().error.fieldErrors.map((f) => f.code)

const ALL_OK = Object.fromEntries(
  ['coverage', 'service_fit', 'essential_facts', 'urgency', 'site_visit_need', 'staff_equipment', 'risk_flags'].map(
    (c) => [c, { outcome: 'ok' }],
  ),
)

type Category = 'military' | 'senior' | 'returning_customer'
const body = (contactEmail: string, requestedDiscount?: string) => ({
  formVersion: 'test-1',
  privacyNoticeVersion: 'privacy-notice-1',
  services: [{ serviceId: 'SVC-DW-01' }],
  notSure: false,
  description: 'Synthetic discount project.',
  answers: [],
  property: {
    street: `${++seq} Synthetic Discount Lane`,
    city: 'Testville',
    state: 'ky',
    zip: '40000',
    propertyType: 'house',
  },
  timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
  estimatePreference: 'online',
  contact: {
    fullName: 'Synthetic Discount Customer',
    email: contactEmail,
    phone: '(502) 555-0186',
    preferredChannel: 'email',
  },
  smsOptIn: false,
  marketingOptIn: false,
  ...(requestedDiscount ? { requestedDiscount } : {}),
})
const submit = (payload: unknown) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/public/requests',
    headers: { 'idempotency-key': key('submit'), 'x-forwarded-for': `198.51.100.${++ip}` },
    payload: payload as object,
  })
const contactEmail = () => `discount-${++seq}-${randomUUID().slice(0, 8)}@example.test`

/** A request sent with the discount (if any), qualified and moved to an online estimate. */
async function readyRequest(category?: Category) {
  const res = await submit(body(contactEmail(), category))
  expect(res.statusCode, res.body).toBe(201)
  const { reference } = res.json<{ reference: string }>()
  const row = await t.db
    .selectFrom('intake.requests')
    .select(['id', 'project_id', 'state_version', 'contact_id', 'customer_id'])
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
  return {
    requestId: row.id,
    projectId: row.project_id,
    customerId: row.customer_id,
    reference,
    contactId: row.contact_id,
    grantId: grant.id,
  }
}
type Ready = Awaited<ReturnType<typeof readyRequest>>

/** One base line in cents and the discount category (if any): saved by the estimator, then published. */
async function draft(p: Ready, cents: number, discountCategory: string | null) {
  const created = await staffWrite('estimator', 'POST', `/staff/projects/${p.projectId}/estimates`, {})
  expect(created.statusCode, created.body).toBe(201)
  const c = created.json<{ number: string; versionId: string }>()
  return { ...c, ...(await save(c.versionId, cents, discountCategory)) }
}
async function save(versionId: string, cents: number, discountCategory: string | null) {
  const view = (await staffGet('estimator', `/staff/estimate-versions/${versionId}`)).json<{
    rowVersion: number
    workPackages: { id: string }[]
  }>()
  const saved = await staffWrite(
    'estimator',
    'PUT',
    `/staff/estimate-versions/${versionId}/draft`,
    {
      lines: [
        {
          kind: 'base',
          workPackageId: view.workPackages[0]?.id,
          description: 'Synthetic wall repair',
          quantity: '1',
          unit: 'job',
          unitPriceCents: cents,
        },
      ],
      texts: { exclusions: ['Synthetic: nothing else'] },
      discountCategory,
    },
    { 'if-match': `"${view.rowVersion}"` },
  )
  expect(saved.statusCode, saved.body).toBe(200)
  return { rowVersion: saved.json<{ rowVersion: number }>().rowVersion }
}
const publish = (versionId: string, rowVersion: number) =>
  staffWrite(
    'estimator',
    'POST',
    `/staff/estimate-versions/${versionId}/publish`,
    {},
    { 'if-match': `"${rowVersion}"` },
  )
async function published(p: Ready, cents: number, discountCategory: string | null) {
  const d = await draft(p, cents, discountCategory)
  const res = await publish(d.versionId, d.rowVersion)
  expect(res.statusCode, res.body).toBe(200)
  return d
}

type CustomerView = {
  totalCents: number
  reduction: { label: string; amountCents: number; pendingVerification: boolean } | null
  deposit: { state: string; amountCents: number | null }
  approval: {
    available: boolean
    reasons: string[]
    contentDigest: string
    selection: { options: number[]; totalCents: number; deposit: { amountCents: number | null } } | null
  }
}
async function customer(p: Ready) {
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
  const client = `2001:db8:125:${++nets}::1`
  const projectRef = await t.db
    .selectFrom('crm.projects')
    .select('reference')
    .where('id', '=', p.projectId)
    .executeTakeFirstOrThrow()
  const url = (number: string, version: number) =>
    `/api/v1/customer/projects/${projectRef.reference}/estimates/${number}/versions/${version}`
  const view = async (number: string, version = 1) => {
    const res = await app.inject({ method: 'GET', url: url(number, version), headers: { cookie } })
    expect(res.statusCode, res.body).toBe(200)
    return res.json<CustomerView>()
  }
  const approve = async (number: string, version = 1) => {
    const v = await view(number, version)
    return app.inject({
      method: 'POST',
      url: `${url(number, version)}/approve`,
      payload: {
        contentDigest: v.approval.contentDigest,
        options: [],
        totalCents: v.approval.selection?.totalCents ?? v.totalCents,
        depositCents: v.approval.selection?.deposit.amountCents ?? v.deposit.amountCents,
        termsDocumentId: ESTIMATE_TERMS.documentId,
        termsSha256: ESTIMATE_TERMS.contentSha256,
        acceptTerms: true,
        fullName: 'Synthetic Discount Customer',
      },
      headers: { cookie, 'idempotency-key': key('customer'), 'x-forwarded-for': client },
    })
  }
  return { view, approve }
}

type DiscountView = {
  requestId: string
  eligibility: { percentBps: number; seniorFromAge: number; returningWithinMonths: number } | null
  discount: {
    category: string
    state: string
    verifications: { position: number; category: string; result: string; verifiedBy: { id: string } }[]
    approved: boolean
    revisionNeeded: boolean
    actions: { verify: boolean; checkJobHistory: boolean; ownerReview: boolean; decide: boolean }
  } | null
}
const discountOf = async (who: Person, requestId: string) => {
  const res = await staffGet(who, `/staff/requests/${requestId}/discount`)
  expect(res.statusCode, res.body).toBe(200)
  return res.json<DiscountView>()
}
const verify = (who: Person, requestId: string, result: string) =>
  staffWrite(who, 'POST', `/staff/requests/${requestId}/discount/verifications`, { result })
const decide = (who: Person, requestId: string, result: string) =>
  staffWrite(who, 'POST', `/staff/requests/${requestId}/discount/owner-decision`, { result })
const jobHistory = (who: Person, requestId: string) =>
  staffWrite(who, 'POST', `/staff/requests/${requestId}/discount/job-history`, {})
const queueItem = (type: string, requestId: string) =>
  t.db
    .selectFrom('ops.queue_items')
    .select(['id', 'resolved_at', 'reason'])
    .where('type', '=', type)
    .where('subject_id', '=', requestId)
    .orderBy('opened_at', 'desc')
    .executeTakeFirst()

/** The customer's earlier job, completed on the given instant (its quality review passed then). */
async function completedJob(p: Ready, passedAt: Date) {
  const d = await published(p, 40_000, null)
  const approved = await (await customer(p)).approve(d.number)
  expect(approved.statusCode, approved.body).toBe(201)
  const job = await t.db
    .selectFrom('work.jobs')
    .select('id')
    .where('project_id', '=', p.projectId)
    .executeTakeFirstOrThrow()
  await withTx(t.db, async (tx) => {
    await sql`SET LOCAL session_replication_role = replica`.execute(tx)
    await sql`UPDATE work.jobs SET operational_state = 'closed', version = version + 1 WHERE id = ${job.id}`.execute(tx)
    await sql`INSERT INTO quality.reviews (job_id, project_id, state, reviewer_id, started_at, decided_at, passed_at,
                scope_result, checklist_result, evidence_result, walkthrough_result)
              VALUES (${job.id}, ${p.projectId}, 'passed', ${ids.owner}, ${passedAt}, ${passedAt}, ${passedAt},
                'ok', 'ok', 'ok', 'ok')`.execute(tx)
  })
  return job.id
}
/** Merges the duplicate customer into the survivor through the staff route (HH-CRM-04). */
async function merge(duplicate: string, survivor: string) {
  const preview = await staffGet('office', `/staff/customers/${duplicate}/merge-preview?into=${survivor}`)
  expect(preview.statusCode, preview.body).toBe(200)
  const res = await staffWrite('office', 'POST', `/staff/customers/${duplicate}/merge`, {
    survivorId: survivor,
    reason: 'Synthetic: the same customer sent a second request',
    previewDigest: preview.json<{ previewDigest: string }>().previewDigest,
  })
  expect(res.statusCode, res.body).toBe(200)
}
/** Noon business time on a local date (no 24-hour arithmetic, so no clock change can move it). */
const noonOn = (date: string) => {
  const r = resolveLocalTime(date, '12:00', ZONE)
  if (r.kind !== 'unique') throw new Error(`noon on ${date} is not a single instant`)
  return r.at.instant
}
/** The local date `months` months and `days` days before today, in calendar arithmetic. */
function monthsAgo(months: number, days = 0): string {
  const today = localDateOf(new Date(), ZONE)
  const [y, m, d] = today.split('-').map(Number) as [number, number, number]
  const index = y * 12 + (m - 1) - months
  const last = new Date(Date.UTC(Math.floor(index / 12), (index % 12) + 1, 0)).getUTCDate()
  const date = `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`
  return addLocalDays(date, -days)
}

describe('[HH-EST-15] discount requests with staff verification (TSK-0125)', () => {
  it('[HH-EST-15][RULE-DECIDED-VALUES-ACTIVE] the form offers the decided discounts with their eligibility facts', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/public/request-form' })
    expect(res.statusCode).toBe(200)
    expect(res.json<{ requestableDiscounts: unknown }>().requestableDiscounts).toEqual({
      percentBps: 1000,
      categories: ['military', 'senior', 'returning_customer'],
      seniorFromAge: 60,
      returningWithinMonths: 12,
    })
  })

  it('[HH-EST-15] a requested discount is saved with the request, pending verification; only an offered one', async () => {
    const p = await readyRequest('military')
    const row = await t.db
      .selectFrom('estimating.discount_requests')
      .selectAll()
      .where('project_id', '=', p.projectId)
      .executeTakeFirstOrThrow()
    expect(row).toMatchObject({ request_id: p.requestId, category: 'military' })
    const original = await t.db
      .selectFrom('intake.requests')
      .select('original_submission')
      .where('id', '=', p.requestId)
      .executeTakeFirstOrThrow()
    expect(original.original_submission).toMatchObject({ requestedDiscount: 'military' })
    const v = await discountOf('office', p.requestId)
    expect(v.discount).toMatchObject({ category: 'military', state: 'pending', verifications: [], approved: false })
    expect(v.discount?.actions).toEqual({ verify: true, checkJobHistory: false, ownerReview: true, decide: false })
    expect((await discountOf('owner', p.requestId)).discount?.actions.decide).toBe(true)
    // A request without one: none, and nothing to record.
    const none = await readyRequest()
    expect((await discountOf('office', none.requestId)).discount).toBeNull()
    expect(codes(await verify('office', none.requestId, 'verified'))).toEqual(['NO_DISCOUNT_REQUEST'])
    // Not an offered category: refused before anything is written.
    expect((await submit(body(contactEmail(), 'student'))).statusCode).toBe(400)
    // While the discount rule is NOT CONFIGURED the form offers none, and the server refuses one.
    const rule = await t.db
      .selectFrom('platform.policy_version')
      .select('value')
      .where('key', '=', 'discount.rule')
      .where('status', '=', 'active')
      .executeTakeFirstOrThrow()
    await setConfig('discount.rule', null)
    try {
      const form = await app.inject({ method: 'GET', url: '/api/v1/public/request-form' })
      expect(form.json<{ requestableDiscounts: unknown }>().requestableDiscounts).toBeNull()
      const refused = await submit(body(contactEmail(), 'senior'))
      expect(refused.statusCode, refused.body).toBe(400)
      expect(refused.json()).toMatchObject({
        error: { fieldErrors: [{ field: 'body.requestedDiscount', code: 'enum' }] },
      })
    } finally {
      await setConfig('discount.rule', rule.value)
    }
  })

  it('[HH-EST-15][T31] the checkbox alone never approves: provisional until staff verify, then approved once', async () => {
    const p = await readyRequest('senior')
    // $1,500.00 less 10% = $1,350.00; deposit 20% of the discounted total = $270.00 (FACT-DEPOSIT-RULE).
    const d = await published(p, 150_000, 'senior')
    // The application is audited: published with the discount while it is still pending (provisional).
    const publishedAudit = await t.db
      .selectFrom('platform.audit_events')
      .select('summary')
      .where('action', '=', 'estimate.publish')
      .where('target_id', '=', d.versionId)
      .executeTakeFirstOrThrow()
    expect(publishedAudit.summary).toMatchObject({ discount: { category: 'senior', state: 'pending' } })
    const c = await customer(p)
    const before = await c.view(d.number)
    expect(before.reduction).toMatchObject({ amountCents: 15_000, pendingVerification: true })
    expect(before.totalCents).toBe(135_000)
    expect(before.approval).toMatchObject({ available: false, reasons: ['reduction_pending_verification'] })
    const refused = await c.approve(d.number)
    expect(refused.statusCode, refused.body).toBe(409)
    expect(codes(refused)).toEqual(['DISCOUNT_PENDING_VERIFICATION'])
    // The database reads the same state (its approval trigger refuses an unverified discount).
    const state = await sql<{ s: string }>`SELECT estimating.discount_state(${p.projectId}::uuid) AS s`.execute(t.db)
    expect(state.rows[0]?.s).toBe('pending')
    expect((await verify('estimator', p.requestId, 'verified')).statusCode).toBe(201)
    const after = await c.view(d.number)
    expect(after.reduction?.pendingVerification).toBe(false)
    expect(after.approval).toMatchObject({ available: true, reasons: [] })
    const approved = await c.approve(d.number)
    expect(approved.statusCode, approved.body).toBe(201)
    const a = await t.db
      .selectFrom('estimating.approvals')
      .select(['total_cents', 'discount_cents', 'deposit_cents'])
      .where('project_id', '=', p.projectId)
      .executeTakeFirstOrThrow()
    expect(a).toEqual({ total_cents: '135000', discount_cents: '15000', deposit_cents: '27000' })
    // Once approved, the price is fixed: nothing more is recorded (the server and the database refuse).
    expect(codes(await decide('owner', p.requestId, 'owner_declined'))).toEqual(['ESTIMATE_APPROVED'])
    const v = await discountOf('owner', p.requestId)
    expect(v.discount).toMatchObject({ state: 'verified', approved: true })
    expect(v.discount?.actions).toEqual({ verify: false, checkJobHistory: false, ownerReview: false, decide: false })
    const request = await t.db
      .selectFrom('estimating.discount_requests')
      .select('id')
      .where('project_id', '=', p.projectId)
      .executeTakeFirstOrThrow()
    await expect(
      sql`INSERT INTO estimating.discount_verifications (discount_request_id, project_id, position, category, result,
            verified_by) VALUES (${request.id}, ${p.projectId}, 2, 'senior', 'owner_declined', ${ids.owner})`.execute(
        t.db,
      ),
    ).rejects.toThrow(/approved/)
    await expect(
      sql`UPDATE estimating.discount_verifications SET result = 'not_verified'`.execute(t.db),
    ).rejects.toThrow(/never changed/)
    await expect(sql`DELETE FROM estimating.discount_requests`.execute(t.db)).rejects.toThrow()
  })

  it('[HH-EST-15] one discount per job: only the one the customer requested, once', async () => {
    const p = await readyRequest('military')
    // Another category than requested is refused at publishing.
    const other = await draft(p, 50_000, 'senior')
    const view = await staffGet('estimator', `/staff/estimate-versions/${other.versionId}`)
    expect(view.json()).toMatchObject({ discountRequest: { category: 'military', state: 'pending' } })
    expect(view.json<{ readiness: { problems: { code: string }[] } }>().readiness.problems).toEqual([
      { code: 'DISCOUNT_NOT_REQUESTED' },
    ])
    const refused = await publish(other.versionId, other.rowVersion)
    expect(refused.statusCode, refused.body).toBe(409)
    expect(JSON.stringify(refused.json())).toContain('DISCOUNT_NOT_REQUESTED')
    // A project whose customer asked for none takes none.
    const none = await readyRequest()
    const extra = await draft(none, 50_000, 'military')
    expect((await publish(extra.versionId, extra.rowVersion)).statusCode).toBe(409)
    // A second request on the same project is refused by the database (one per project, so one per job).
    await expect(
      sql`INSERT INTO estimating.discount_requests (project_id, request_id, category)
          VALUES (${p.projectId}, ${p.requestId}, 'senior')`.execute(t.db),
    ).rejects.toThrow()
    // The totals carry one 10% row, never stacked.
    const ok = await save(other.versionId, 50_000, 'military')
    const res = await publish(other.versionId, ok.rowVersion)
    expect(res.statusCode, res.body).toBe(200)
    expect((await (await customer(p)).view(other.number)).reduction).toMatchObject({ amountCents: 5_000 })
  })

  it('[HH-EST-15] a failed verification leads to a revised estimate the customer approves; never a silent raise', async () => {
    const p = await readyRequest('military')
    const d = await published(p, 100_000, 'military')
    expect((await verify('office', p.requestId, 'not_verified')).statusCode).toBe(201)
    // A staff result is recorded once; changing it is the Owner's.
    expect(codes(await verify('office', p.requestId, 'verified'))).toEqual(['ALREADY_RECORDED'])
    const v = await discountOf('estimator', p.requestId)
    expect(v.discount).toMatchObject({ state: 'not_verified', revisionNeeded: true })
    expect(await queueItem('discount_revision', p.requestId)).toMatchObject({
      resolved_at: null,
      reason: 'discount_not_verified',
    })
    const c = await customer(p)
    const shown = await c.view(d.number)
    expect(shown.totalCents).toBe(90_000)
    expect(shown.approval).toMatchObject({ available: false, reasons: ['reduction_not_verified'] })
    expect(codes(await c.approve(d.number))).toEqual(['DISCOUNT_NOT_VERIFIED'])
    // Nothing is changed silently: the published version keeps its price until a revision is published.
    const stored = await t.db
      .selectFrom('estimating.estimate_versions')
      .select(['state', 'total_cents'])
      .where('id', '=', d.versionId)
      .executeTakeFirstOrThrow()
    expect(stored).toEqual({ state: 'published', total_cents: '90000' })
    // The revision leaves the discount out; publishing it resolves the item; the customer approves the new total.
    const revised = await staffWrite('estimator', 'POST', `/staff/estimate-versions/${d.versionId}/revise`, {})
    expect(revised.statusCode, revised.body).toBe(201)
    const r = revised.json<{ versionId: string; version: number; rowVersion: number }>()
    const audit = await t.db
      .selectFrom('platform.audit_events')
      .select('summary')
      .where('action', '=', 'estimate.revise')
      .where('target_id', '=', r.versionId)
      .executeTakeFirstOrThrow()
    expect(audit.summary).toMatchObject({ discountDropped: true })
    const draftView = (await staffGet('estimator', `/staff/estimate-versions/${r.versionId}`)).json<{
      discountCategory: string | null
      totals: { totalCents: number }
    }>()
    expect(draftView.discountCategory).toBeNull()
    expect((await publish(r.versionId, r.rowVersion)).statusCode).toBe(200)
    expect(await queueItem('discount_revision', p.requestId)).toMatchObject({ resolved_at: expect.any(Date) })
    expect((await c.view(d.number, r.version)).reduction).toBeNull()
    const approved = await c.approve(d.number, r.version)
    expect(approved.statusCode, approved.body).toBe(201)
    const a = await t.db
      .selectFrom('estimating.approvals')
      .select(['version', 'total_cents', 'discount_cents'])
      .where('project_id', '=', p.projectId)
      .executeTakeFirstOrThrow()
    expect(a).toEqual({ version: r.version, total_cents: '100000', discount_cents: '0' })
  })

  it('[HH-EST-15][RULE-SERVER-AUTHZ] the Owner reviews what cannot be verified; overrides are the Owner’s', async () => {
    const p = await readyRequest('military')
    // Nobody without the grant reads or records anything.
    expect((await staffGet('worker', `/staff/requests/${p.requestId}/discount`)).statusCode).toBe(403)
    expect((await verify('worker', p.requestId, 'verified')).statusCode).toBe(403)
    expect((await decide('office', p.requestId, 'owner_approved')).statusCode).toBe(403)
    expect((await decide('estimator', p.requestId, 'owner_approved')).statusCode).toBe(403)
    // Only the three results staff record; an owner decision on the staff route is refused by its schema.
    expect((await verify('office', p.requestId, 'owner_approved')).statusCode).toBe(400)
    expect((await verify('office', p.requestId, 'owner_review')).statusCode).toBe(201)
    expect(await queueItem('discount_owner_review', p.requestId)).toMatchObject({
      resolved_at: null,
      reason: 'discount_owner_review',
    })
    expect(codes(await verify('office', p.requestId, 'owner_review'))).toEqual(['NOT_REVIEWABLE'])
    expect((await decide('owner', p.requestId, 'owner_approved')).statusCode).toBe(201)
    expect(await queueItem('discount_owner_review', p.requestId)).toMatchObject({ resolved_at: expect.any(Date) })
    const v = await discountOf('owner', p.requestId)
    expect(v.discount?.state).toBe('verified')
    expect(v.discount?.verifications.map((x) => [x.position, x.result, x.verifiedBy.id])).toEqual([
      [1, 'owner_review', ids.office],
      [2, 'owner_approved', ids.owner],
    ])
    // The Owner may override a recorded result (audited as the Owner's); the same result again changes nothing.
    expect(codes(await decide('owner', p.requestId, 'owner_approved'))).toEqual(['NO_CHANGE'])
    expect((await decide('owner', p.requestId, 'owner_declined')).statusCode).toBe(201)
    expect((await discountOf('owner', p.requestId)).discount?.state).toBe('declined')
    // Every result is audited with the category and the result only.
    const audits = await t.db
      .selectFrom('platform.audit_events')
      .select(['action', 'summary', 'actor_id'])
      .where('target_id', '=', p.requestId)
      .where('action', 'like', 'discount.%')
      .orderBy('occurred_at')
      .execute()
    expect(audits.map((a) => [a.action, (a.summary as { result: string }).result])).toEqual([
      ['discount.verify', 'owner_review'],
      ['discount.owner_decision', 'owner_approved'],
      ['discount.owner_decision', 'owner_declined'],
    ])
    for (const a of audits)
      expect(Object.keys(a.summary as object).sort()).toEqual(['category', 'position', 'result', 'verificationId'])
    // The record holds the category, the result, who and when: nothing else.
    const columns = await sql<{ column_name: string }>`SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'estimating' AND table_name = 'discount_verifications' ORDER BY ordinal_position`.execute(
      t.db,
    )
    expect(columns.rows.map((c) => c.column_name)).toEqual([
      'id',
      'discount_request_id',
      'project_id',
      'position',
      'category',
      'result',
      'verified_by',
      'verified_at',
    ])
  })

  it('[HH-EST-15] returning customers are found from the matched completed job history, never by staff judgement', async () => {
    const earlier = await readyRequest()
    // Completed one day inside the 12-month window (business time zone, calendar months).
    await completedJob(earlier, noonOn(monthsAgo(12, -1)))
    const p = await readyRequest('returning_customer')
    expect((await discountOf('office', p.requestId)).discount?.actions).toMatchObject({
      verify: false,
      checkJobHistory: true,
    })
    expect(codes(await verify('office', p.requestId, 'verified'))).toEqual(['JOB_HISTORY_ONLY'])
    // Not matched yet: a new submission is never matched automatically, so no job is found.
    expect((await jobHistory('office', p.requestId)).statusCode).toBe(201)
    expect((await discountOf('office', p.requestId)).discount).toMatchObject({ state: 'not_verified' })
    // Staff merge the duplicate customer (HH-CRM-04); the check is run again and finds the completed job.
    await merge(p.customerId, earlier.customerId)
    const res = await jobHistory('estimator', p.requestId)
    expect(res.statusCode, res.body).toBe(201)
    expect(res.json<DiscountView>().discount).toMatchObject({ state: 'verified' })
    expect(res.json<DiscountView>().discount?.verifications.map((v) => v.result)).toEqual(['not_verified', 'verified'])
    expect(codes(await jobHistory('office', p.requestId))).toEqual(['ALREADY_RECORDED'])

    // A job completed more than 12 months ago does not count.
    const old = await readyRequest()
    await completedJob(old, noonOn(monthsAgo(12, 1)))
    const late = await readyRequest('returning_customer')
    await merge(late.customerId, old.customerId)
    expect((await jobHistory('office', late.requestId)).statusCode).toBe(201)
    expect((await discountOf('office', late.requestId)).discount?.state).toBe('not_verified')
    // A military or senior discount is never decided from job history.
    const military = await readyRequest('military')
    expect(codes(await jobHistory('office', military.requestId))).toEqual(['STAFF_CHECK_ONLY'])
  })

  it('[HH-EST-15] no verification detail appears in any message', async () => {
    await drain()
    const sent = fakes.fakeEmail.sent.filter((m) => /^discount-/.test(String(m.to)))
    expect(sent.length).toBeGreaterThan(0)
    for (const m of sent) {
      const text = `${m.subject}\n${m.text}\n${m.html ?? ''}`
      expect(text, m.subject).not.toMatch(
        /verif|military|senior|veteran|spouse|photo ID|date of birth|social security|owner review/i,
      )
    }
    const deliveries = await t.db
      .selectFrom('platform.message_deliveries')
      .select(['message_key', 'variables'])
      .execute()
    for (const d of deliveries) expect(JSON.stringify(d.variables), d.message_key).not.toMatch(/verif|military|senior/i)
  })
})
