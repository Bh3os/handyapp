// The Owner Dashboard, its drill-down lists and CSV, and the accountant's CSV files against PostgreSQL 16 (TSK-0096;
// HH-FIN-18, HH-FIN-16, HH-DATA-10, S11, T64, T73, OWN-DEC-125, RULE-MONEY-CENTS, RULE-NO-INVENTED-FACTS,
// RULE-SERVER-AUTHZ). Staff, customers, amounts, references and links are synthetic (RULE-SYNTHETIC-DATA); nothing
// reaches Square or any provider.
// - The dataset has known answers: a deposit job (its deposit invoice and the final invoice that credits it), a
//   pending check, card and cash payments, an overpayment refunded, a credit applied, a Square payout and fee, a
//   revised estimate declined, and one job whose real quality review passed with a cost entry (labor cost is NOT
//   CONFIGURED, so its cost stays incomplete).
// - Fixtures of this throwaway database (as in invoices.test.ts): a synthetic estimate terms version in effect, and the
//   stand-in quality gate of fixtures/quality-review.ts for the jobs that skip the real review. The one job reviewed for
//   real reaches "awaiting quality review" as closeout.test.ts does (the worker's Finished is walked by
//   completion.test.ts).
// - Everything is recorded today in the business zone; the period runs from yesterday to tomorrow so a run across
//   local midnight still holds every record. The file's own database holds only these records, so its totals are
//   exact.
import { randomUUID } from 'node:crypto'
import { loadServiceSeed, loadSopSeed, syncServices, syncSops, withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import { addLocalDays, DASHBOARD_FIGURES, localDateOf, parseCsv } from '@handyhub/domain'
import { ESTIMATE_TERMS } from '@handyhub/domain/legal'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { paymentReceiptAutomation } from '../../src/modules/finance/index.js'
import {
  depositInvoiceAutomation,
  invoiceDocumentAutomation,
  invoiceDraftAutomation,
  invoiceReadyAutomation,
} from '../../src/modules/finance/invoice-automations.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { startCustomerSession } from '../../src/modules/identity/customer-sessions.js'
import { readCodeKey, type CodeKeySettings } from '../../src/modules/identity/index.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import { openQualityReview } from '../../src/modules/quality/index.js'
import { createAutomationRegistry, type Automation } from '../../src/platform/automation.js'
import { recordPolicyVersion } from '../../src/platform/config/index.js'
import { createWorker } from '../../src/platform/jobs.js'
import { createProviders } from '../../src/providers/index.js'
import { FakeObjectStorage } from '../../src/providers/r2/index.js'
import { readProviderSettings } from '../../src/providers/settings.js'
import { verifyCountyOf } from '../fixtures/county.js'
import { testConfig } from '../fixtures/env.js'
import { reviewOutcome, standInQualityReview } from '../fixtures/quality-review.js'
import { signInWithMfa } from '../fixtures/staff-mfa.js'
import { verifyPropertyZone } from '../fixtures/zones.js'

const ZONE = 'America/Kentucky/Louisville'
const KEY: CodeKeySettings = readCodeKey({
  HANDYHUB_ENV: 'ci',
  CODE_HASH_KEY: ['synthetic', 'dashboard', 'code', 'key', 'for', 'tests', 'only', '0096'].join('-'),
})
const pw = ['synthetic', 'owner', 'dashboard', 'passphrase', '96'].join(' ')
const PEOPLE = ['owner', 'office', 'estimator', 'worker'] as const
type Person = (typeof PEOPLE)[number]

let t: TestDatabase
let app: FastifyInstance
const storage = new FakeObjectStorage()
const cookies = {} as Record<Person, string>
const csrf = {} as Record<Person, string>
const ids = {} as Record<Person, string>
const fakes = (() => {
  const p = createProviders(readProviderSettings({ HANDYHUB_ENV: 'ci' }))
  if (!p.fakes.email || !p.fakes.sms) throw new Error('ci uses the fakes')
  return { email: p.email, sms: p.sms }
})()

const fast = (a: Automation): Automation => ({ ...a, retry: { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 1 } })
const notices = { providers: { email: fakes.email, sms: fakes.sms }, publicSiteUrl: 'https://site.example.test' }
const worker = () =>
  createWorker({
    db: t.db,
    registry: createAutomationRegistry([
      fast(invoiceDraftAutomation()),
      fast(invoiceDocumentAutomation(storage)),
      fast(invoiceReadyAutomation(notices)),
      fast(depositInvoiceAutomation(notices)),
      fast(paymentReceiptAutomation(notices)),
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

const email = (p: Person) => `${p}-dashboard@example.test`
async function signIn(p: Person): Promise<[string, string]> {
  const res = await signInWithMfa(app, {
    method: 'POST',
    url: '/api/v1/staff/auth/sign-in',
    payload: { email: email(p), password: pw },
  })
  expect(res.statusCode, res.body).toBe(200)
  const cookie = String(res.headers['set-cookie']).split(';')[0] as string
  const session = await app.inject({ method: 'GET', url: '/api/v1/staff/auth/session', headers: { cookie } })
  return [cookie, session.json<{ csrfToken: string }>().csrfToken]
}

const today = () => localDateOf(new Date(), ZONE)
let FROM = ''
let TO = ''

beforeAll(async () => {
  t = await createTestDatabase()
  await syncServices(t.db, loadServiceSeed())
  await syncSops(t.db, loadSopSeed())
  app = await buildApp({
    config: testConfig({ TRUST_PROXY_HOPS: '1' }),
    api: { db: t.db, codeKey: KEY, storage },
  })
  const hash = await hashPassword(pw)
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
    value: {
      documentId: ESTIMATE_TERMS.documentId,
      status: 'approved',
      attorneyReviewed: true,
      preparedOn: ESTIMATE_TERMS.preparedOn,
      contentSha256: ESTIMATE_TERMS.contentSha256,
    },
    sourceIds: ['TEST-SYNTHETIC'],
    changedBy: 'test',
    reason: 'synthetic test configuration',
  })
  await standInQualityReview(t.db)
  FROM = addLocalDays(today(), -1)
  TO = addLocalDays(today(), 1)
  await dataset()
}, 240_000)
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
const ref = (what: string) => ['SYNTH', what, String(++seq), randomUUID().slice(0, 8)].join('-')
const codes = (res: { json: <T>() => T }) =>
  res.json<{ error: { fieldErrors: { code: string }[] } }>().error.fieldErrors.map((f) => f.code)

const ALL_OK = Object.fromEntries(
  ['coverage', 'service_fit', 'essential_facts', 'urgency', 'site_visit_need', 'staff_equipment', 'risk_flags'].map(
    (c) => [c, { outcome: 'ok' }],
  ),
)

let ip = 30
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
      description: 'Synthetic dashboard project.',
      answers: [],
      property: {
        street: `${++seq} Synthetic Dashboard Lane`,
        city: 'Testville',
        state: 'ky',
        zip: '40000',
        propertyType: 'house',
      },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'online',
      contact: {
        fullName: 'Synthetic Dashboard Customer',
        email: `dashboard-${seq}-${randomUUID().slice(0, 8)}@example.test`,
        phone: '(502) 555-0196',
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
    { workPackages: ['SVC-DW-01'] },
    { 'if-match': `"${row.state_version}"` },
  )
  expect(moved.statusCode, moved.body).toBe(200)
  await verifyPropertyZone(t.db, { projectId: row.project_id })
  return { requestId: row.id, projectId: row.project_id, reference, contactId: row.contact_id, grantId: grant.id }
}

/** A published estimate of one base line; answers the version and what the customer needs to approve it. */
async function published(cents: number) {
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
      lines: [
        {
          kind: 'base',
          workPackageId: view.workPackages[0]?.id,
          description: 'Synthetic dashboard line',
          quantity: '1',
          unit: 'job',
          unitPriceCents: cents,
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
    { 'if-match': `"${saved.json<{ rowVersion: number }>().rowVersion}"` },
  )
  expect(pub.statusCode, pub.body).toBe(200)
  return { ...p, number: c.number, versionId: c.versionId, rowVersion: pub.json<{ rowVersion: number }>().rowVersion }
}

let nets = 0
async function approvedJob(cents: number) {
  const p = await published(cents)
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
  const url = `/api/v1/customer/projects/${p.reference}/estimates/${p.number}/versions/1`
  const detail = (await app.inject({ method: 'GET', url, headers: { cookie } })).json<{
    totalCents: number
    approval: {
      contentDigest: string
      selection: { options: number[]; totalCents: number; deposit: { amountCents: number | null } } | null
    }
  }>()
  const sel = detail.approval.selection
  const approved = await app.inject({
    method: 'POST',
    url: `${url}/approve`,
    payload: {
      contentDigest: detail.approval.contentDigest,
      options: [],
      totalCents: sel?.totalCents ?? detail.totalCents,
      depositCents: sel?.deposit.amountCents ?? null,
      termsDocumentId: ESTIMATE_TERMS.documentId,
      termsSha256: ESTIMATE_TERMS.contentSha256,
      acceptTerms: true,
      fullName: 'Synthetic Dashboard Customer',
    },
    headers: { cookie, 'idempotency-key': key('customer'), 'x-forwarded-for': `2001:db8:96:${++nets}::1` },
  })
  expect(approved.statusCode, approved.body).toBe(201)
  const job = await t.db
    .selectFrom('work.jobs')
    .select('id')
    .where('project_id', '=', p.projectId)
    .executeTakeFirstOrThrow()
  await drain()
  return { ...p, jobId: job.id, depositCents: sel?.deposit.amountCents ?? null }
}

type Invoice = { id: string; version: number; state: string; payments: { id: string }[] }
type JobInvoices = { final: Invoice | null; deposit: Invoice | null }
const invoicesOf = async (jobId: string) =>
  (await staffGet('office', `/staff/jobs/${jobId}/invoices`)).json<JobInvoices>()
const issue = (inv: { id: string; version: number }) =>
  staffWrite('office', 'POST', `/staff/invoices/${inv.id}/issue`, {}, { 'if-match': `"${inv.version}"` })
async function issueFinal(jobId: string): Promise<Invoice> {
  const f = (await invoicesOf(jobId)).final as Invoice
  const res = await issue(f)
  expect(res.statusCode, res.body).toBe(200)
  return res.json<JobInvoices>().final as Invoice
}
const payInvoice = (invoiceId: string, body: Record<string, unknown>) =>
  staffWrite('office', 'POST', `/staff/invoices/${invoiceId}/payments`, { receivedOn: today(), ...body })
const sessionOf = async (who: Person) =>
  (
    await t.db
      .selectFrom('identity.staff_sessions')
      .select('id')
      .where('staff_user_id', '=', ids[who])
      .where('revoked_at', 'is', null)
      .orderBy('created_at', 'desc')
      .executeTakeFirstOrThrow()
  ).id

const OK = { scope: 'ok', checklist: 'ok', evidence: 'ok', walkthrough: 'ok' } as const
/** The Owner's real review passes (the job reaches "awaiting quality review" as in closeout.test.ts). */
async function reviewPasses(jobId: string) {
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
  expect((await staffWrite('owner', 'POST', `/staff/jobs/${jobId}/quality-review/actions/start`, {})).statusCode).toBe(
    200,
  )
  const r = (await staffGet('owner', `/staff/jobs/${jobId}/quality-review`)).json<{ review: { version: number } }>()
  const decided = await staffWrite(
    'owner',
    'POST',
    `/staff/jobs/${jobId}/quality-review/actions/decide`,
    { results: OK },
    { 'if-match': `"${r.review.version}"` },
  )
  expect(decided.statusCode, decided.body).toBe(200)
}

const known = { deposit: 0, payoutRef: '', jobCostId: '' }

/** The synthetic dataset with known answers (see the header). */
async function dataset() {
  // A: $1,200.00 with its deposit: the deposit invoice is issued and paid in cash; the final invoice credits it; a
  // $500.00 check on the final invoice is still pending.
  const a = await approvedJob(120_000)
  known.deposit = a.depositCents ?? 0
  expect(known.deposit).toBeGreaterThan(0)
  const prepared = await staffWrite('office', 'POST', `/staff/jobs/${a.jobId}/invoices/deposit-draft`, {})
  expect(prepared.statusCode, prepared.body).toBe(200)
  expect((await issue(prepared.json<JobInvoices>().deposit as Invoice)).statusCode).toBe(200)
  const dep = await staffWrite('office', 'POST', `/staff/jobs/${a.jobId}/deposit/payments`, {
    receivedOn: today(),
    method: 'cash',
    amountCents: known.deposit,
  })
  expect(dep.statusCode, dep.body).toBe(201)
  await reviewOutcome(t.db, a.jobId, 'passed')
  const fa = await issueFinal(a.jobId)
  const check = await payInvoice(fa.id, {
    method: 'check',
    amountCents: 50_000,
    reference: ref('check'),
    payerName: 'Synthetic Payer',
  })
  expect(check.statusCode, check.body).toBe(201)

  // B: $400.00 paid by Square link ($300.00) and cash ($100.00); a $388.00 payout and its $12.00 fee recorded.
  const b = await approvedJob(40_000)
  await reviewOutcome(t.db, b.jobId, 'passed')
  const fb = await issueFinal(b.jobId)
  expect((await payInvoice(fb.id, { method: 'cash', amountCents: 10_000 })).statusCode).toBe(201)
  const card = await payInvoice(fb.id, { method: 'square_payment_link', amountCents: 30_000, reference: ref('sq') })
  expect(card.statusCode, card.body).toBe(201)
  const cardId = (card.json<JobInvoices>().final as Invoice).payments[1]?.id as string
  known.payoutRef = ref('payout')
  const payout = await staffWrite('office', 'POST', '/staff/payouts', {
    reference: known.payoutRef,
    amountCents: 38_800,
    paidOutOn: today(),
  })
  expect(payout.statusCode, payout.body).toBe(201)
  const payoutId = payout
    .json<{ payouts: { id: string; reference: string }[] }>()
    .payouts.find((p) => p.reference === known.payoutRef)?.id as string
  const fee = await staffWrite('owner', 'POST', '/staff/provider-fees', {
    amountCents: 1_200,
    incurredOn: today(),
    paymentId: cardId,
    payoutId,
  })
  expect(fee.statusCode, fee.body).toBe(201)

  // C: $600.00 overpaid with $650.00 cash; the $50.00 over is refunded (approved by the Owner, then succeeded).
  const c = await approvedJob(60_000)
  await reviewOutcome(t.db, c.jobId, 'passed')
  const fc = await issueFinal(c.jobId)
  const over = await payInvoice(fc.id, { method: 'cash', amountCents: 65_000 })
  expect(over.statusCode, over.body).toBe(201)
  const overId = (over.json<JobInvoices>().final as Invoice).payments[0]?.id as string
  const refund = await t.db
    .insertInto('finance.refunds')
    .values({
      project_id: c.projectId,
      job_id: c.jobId,
      type: 'refund',
      payment_id: overId,
      amount_cents: 5_000,
      reason: 'Synthetic: overpayment returned',
      requested_by: ids.office,
      state: 'requested',
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  const owner = await sessionOf('owner')
  await sql`UPDATE finance.refunds SET state = 'approved', approved_by = ${ids.owner}, approved_at = now(),
              staff_session_id = ${owner}, authenticated_at = now() WHERE id = ${refund.id}`.execute(t.db)
  await sql`UPDATE finance.refunds SET state = 'processing' WHERE id = ${refund.id}`.execute(t.db)
  await sql`UPDATE finance.refunds SET state = 'succeeded', provider_confirmation = 'SYNTH-REFUND-1'
             WHERE id = ${refund.id}`.execute(t.db)

  // D: $200.00 settled by a $200.00 credit the Owner issued and applied; its real quality review passed and one
  // $75.00 materials cost is recorded (labor cost NOT CONFIGURED: the job's cost stays incomplete).
  const d = await approvedJob(20_000)
  await reviewPasses(d.jobId)
  const fd = await issueFinal(d.jobId)
  const credit = await t.db
    .insertInto('finance.refunds')
    .values({
      project_id: d.projectId,
      job_id: d.jobId,
      type: 'credit',
      invoice_id: fd.id,
      amount_cents: 20_000,
      reason: 'Synthetic: goodwill credit',
      requested_by: ids.owner,
      state: 'requested',
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  await sql`UPDATE finance.refunds SET state = 'issued', approved_by = ${ids.owner}, approved_at = now(),
              staff_session_id = ${owner}, authenticated_at = now() WHERE id = ${credit.id}`.execute(t.db)
  await sql`UPDATE finance.refunds SET state = 'applied' WHERE id = ${credit.id}`.execute(t.db)
  const cost = await staffWrite('owner', 'POST', `/staff/jobs/${d.jobId}/costs`, {
    category: 'materials',
    amountCents: 7_500,
    incurredOn: today(),
    note: 'Synthetic joint compound',
  })
  expect(cost.statusCode, cost.body).toBe(201)

  // E: an estimate revised once (version 2 supersedes version 1) and declined: one estimate sent, one declined.
  const e = await published(30_000)
  const revised = await staffWrite('estimator', 'POST', `/staff/estimate-versions/${e.versionId}/revise`, {})
  expect(revised.statusCode, revised.body).toBe(201)
  const v2 = revised.json<{ versionId: string; rowVersion: number }>()
  const pub2 = await staffWrite(
    'estimator',
    'POST',
    `/staff/estimate-versions/${v2.versionId}/publish`,
    {},
    { 'if-match': `"${v2.rowVersion}"` },
  )
  expect(pub2.statusCode, pub2.body).toBe(200)
  const declined = await staffWrite(
    'estimator',
    'POST',
    `/staff/estimate-versions/${v2.versionId}/record-decline`,
    {},
    { 'if-match': `"${pub2.json<{ rowVersion: number }>().rowVersion}"` },
  )
  expect(declined.statusCode, declined.body).toBe(200)
  await drain()
}

type Value = { state: string; value: number | null }
type Figure = {
  id: string
  section: string
  unit: string
  scope: string
  report: { id: string; basis: string; unknown: string } | null
  detail: { id: string; name: string | null } | null
  current: Value
  previous: Value | null
}
type View = {
  period: { from: string; to: string; days: number; previous: { from: string; to: string } }
  zone: string
  generatedAt: string
  figures: Figure[]
  accounting: Record<string, string>
}
async function dashboard(who: Person = 'owner', from = FROM, to = TO) {
  const res = await staffGet(who, `/staff/dashboard?from=${from}&to=${to}`)
  expect(res.statusCode, res.body).toBe(200)
  return res.json<View>()
}
const fig = (v: View, id: string) => {
  const f = v.figures.find((x) => x.id === id)
  if (!f) throw new Error(`no figure ${id}`)
  return f
}

describe('[HH-FIN-18][T73][HH-DATA-10] the dashboard matches the known answers of the synthetic dataset', () => {
  it('invoiced is apart from received; the deposit once; pending, refunds, credits, fees and payouts apart', async () => {
    const v = await dashboard()
    expect(v.period).toEqual({
      from: FROM,
      to: TO,
      days: 3,
      previous: { from: addLocalDays(FROM, -3), to: addLocalDays(FROM, -1) },
    })
    expect(v.zone).toBe(ZONE)
    const cur = (id: string) => fig(v, id).current
    // Invoiced revenue: the four final invoices; the deposit invoice is left out (the final invoice credits it).
    expect(cur('payments.invoices_issued')).toEqual({ state: 'known', value: 4 })
    expect(cur('payments.invoiced')).toEqual({ state: 'known', value: 120_000 + 40_000 + 60_000 + 20_000 })
    // Money received: verified payments once each, by method; the deposit payment counts once; the check waits.
    expect(cur('payments.received.cash')).toEqual({ state: 'known', value: known.deposit + 10_000 + 65_000 })
    expect(cur('payments.received.square_payment_link')).toEqual({ state: 'known', value: 30_000 })
    expect(cur('payments.received.check')).toEqual({ state: 'known', value: 0 })
    expect(cur('payments.received')).toEqual({ state: 'known', value: known.deposit + 10_000 + 65_000 + 30_000 })
    expect(cur('payments.pending_checks')).toEqual({ state: 'known', value: 50_000 })
    expect(cur('payments.pending_checks_count')).toEqual({ state: 'known', value: 1 })
    expect(cur('payments.refunds')).toEqual({ state: 'known', value: 5_000 })
    expect(cur('payments.credits')).toEqual({ state: 'known', value: 20_000 })
    expect(cur('payments.fees')).toEqual({ state: 'known', value: 1_200 })
    expect(cur('payments.payouts')).toEqual({ state: 'known', value: 38_800 })
    // A's final invoice still asks for its total less the deposit credit (the pending check never reduces it).
    expect(cur('payments.outstanding')).toEqual({ state: 'known', value: 120_000 - known.deposit })
    expect(cur('payments.overdue')).toMatchObject({ state: 'known' })
    // Write-off presentation is the CPA's or the Owner's: never shown as zero.
    expect(cur('payments.write_offs')).toEqual({ state: 'not_configured', value: null })
    expect(v.accounting).toEqual({
      depositRevenueRecognition: 'not_configured',
      taxTreatment: 'not_configured',
      writeOffPresentation: 'not_configured',
    })
    // Every money figure names its report and basis.
    expect(fig(v, 'payments.invoiced').report).toEqual({
      id: 'invoiced',
      basis: 'invoiced_revenue',
      unknown: 'unavailable',
    })
    expect(fig(v, 'payments.received').report?.basis).toBe('cash_received')
    expect(fig(v, 'payments.pending_checks').report?.basis).toBe('pending_payments')
    expect(fig(v, 'payments.payouts').report?.basis).toBe('settlement')
    // The previous period holds nothing: known zeros, never a missing value.
    expect(fig(v, 'payments.invoiced').previous).toEqual({ state: 'known', value: 0 })
    expect(fig(v, 'payments.outstanding').previous).toBeNull()
  })

  it('revisions count under one estimate; missing cost is incomplete; quality from the real review', async () => {
    const v = await dashboard()
    const cur = (id: string) => fig(v, id).current
    expect(cur('estimates.sent')).toEqual({ state: 'known', value: 5 })
    expect(cur('estimates.approved')).toEqual({ state: 'known', value: 4 })
    expect(cur('estimates.declined')).toEqual({ state: 'known', value: 1 })
    expect(cur('estimates.awaiting')).toEqual({ state: 'known', value: 0 })
    expect(cur('overview.estimates_awaiting')).toEqual({ state: 'known', value: 0 })
    // D's real review passed once, at its first decision.
    expect(cur('quality.completed_jobs')).toEqual({ state: 'known', value: 1 })
    expect(cur('quality.reviews_decided')).toEqual({ state: 'known', value: 1 })
    expect(cur('quality.pass_rate')).toEqual({ state: 'known', value: 10_000 })
    expect(fig(v, 'quality.pass_rate').previous).toEqual({ state: 'unavailable', value: null })
    // Its $75.00 materials cost is the known part; labor cost is NOT CONFIGURED, so the job's cost is incomplete.
    expect(cur('costs.jobs')).toEqual({ state: 'known', value: 1 })
    expect(cur('costs.complete')).toEqual({ state: 'known', value: 0 })
    expect(cur('costs.incomplete')).toEqual({ state: 'known', value: 1 })
    expect(cur('costs.recorded')).toEqual({ state: 'incomplete', value: 7_500 })
    expect(fig(v, 'costs.recorded').report?.basis).toBe('job_costs')
  })

  it('customer response reads the first-response report of the same period, in business hours only', async () => {
    const v = await dashboard()
    // A window wide enough for every request of this database (all received during this run).
    const wide = (days: number) => encodeURIComponent(new Date(Date.now() + days * 86_400_000).toISOString())
    const res = await staffGet('owner', `/staff/reports/first-response?from=${wide(-5)}&to=${wide(5)}`)
    expect(res.statusCode, res.body).toBe(200)
    const r = res.json<{
      received: number
      answered: number
      withinTarget: number
      withinTargetShareBps: number | null
    }>()
    // Every request of this database was received inside the period.
    expect(fig(v, 'response.received').current).toEqual({ state: 'known', value: r.received })
    expect(r.received).toBe(5)
    expect(fig(v, 'response.answered').current).toEqual({ state: 'known', value: r.answered })
    expect(fig(v, 'response.within_target').current).toEqual({ state: 'known', value: r.withinTarget })
    expect(fig(v, 'response.within_target_share').current).toEqual(
      r.withinTargetShareBps === null
        ? { state: 'unavailable', value: null }
        : { state: 'known', value: r.withinTargetShareBps },
    )
    // Nothing to measure in the previous period: unavailable, never zero.
    expect(fig(v, 'response.average_minutes').previous).toEqual({ state: 'unavailable', value: null })
  })

  it('every figure opens its supporting records, and the list matches the figure', async () => {
    const v = await dashboard()
    for (const f of v.figures) {
      const q = `from=${FROM}&to=${TO}&figure=${f.id}${f.detail ? `&detail=${f.detail.id}` : ''}`
      const res = await staffGet('owner', `/staff/dashboard/records?${q}`)
      expect(res.statusCode, `${f.id}: ${res.body}`).toBe(200)
      const r = res.json<{
        value: Value
        total: number
        totalCents: number | null
        rows: { cents: number | null; link: { screen: string; id: string | null } | null }[]
      }>()
      expect(r.value, f.id).toEqual(f.current)
      if (f.current.value === null) continue
      if (f.unit === 'count') expect(r.total, f.id).toBe(f.current.value)
      if (f.unit === 'cents') expect(r.totalCents, f.id).toBe(f.current.value)
    }
    // The previous period of a period figure opens too; a figure counted as things stand has none.
    const prev = await staffGet(
      'owner',
      `/staff/dashboard/records?from=${FROM}&to=${TO}&figure=payments.invoiced&previous=true`,
    )
    expect(prev.json()).toMatchObject({ total: 0, totalCents: 0 })
    const now = await staffGet(
      'owner',
      `/staff/dashboard/records?from=${FROM}&to=${TO}&figure=payments.outstanding&previous=true`,
    )
    expect(codes(now)).toContain('NOT_A_PERIOD_FIGURE')
    // The drill-down lists the records with the screens that open them.
    const inv = (
      await staffGet('owner', `/staff/dashboard/records?from=${FROM}&to=${TO}&figure=payments.invoiced`)
    ).json<{ rows: { cents: number; link: { screen: string } }[] }>()
    expect(inv.rows.map((x) => x.cents).sort((a, b) => a - b)).toEqual([20_000, 40_000, 60_000, 120_000])
    expect(new Set(inv.rows.map((x) => x.link.screen))).toEqual(new Set(['invoice-reminders']))
  })

  it('the period is checked: dates both included, at most 366 days', async () => {
    const bad = await staffGet('owner', `/staff/dashboard?from=${TO}&to=${FROM}`)
    expect(bad.statusCode).toBe(400)
    expect(codes(bad)).toContain('RANGE_INVALID')
    const long = await staffGet('owner', `/staff/dashboard?from=${addLocalDays(TO, -366)}&to=${TO}`)
    expect(codes(long)).toContain('RANGE_TOO_LONG')
    expect((await staffGet('owner', `/staff/dashboard?from=${addLocalDays(TO, -365)}&to=${TO}`)).statusCode).toBe(200)
  })
})

async function freshOwner() {
  await sql`UPDATE identity.staff_sessions SET authenticated_at = now() WHERE staff_user_id = ${ids.owner}`.execute(
    t.db,
  )
}
async function staleOwner() {
  await sql`UPDATE identity.staff_sessions SET authenticated_at = now() - interval '30 minutes'
             WHERE staff_user_id = ${ids.owner}`.execute(t.db)
}
type ExportFile = { filename: string; contentType: string; rows: number; csv: string }

describe('[HH-FIN-18][T73][T64] the dashboard CSV equals the dashboard, with a fresh sign-in, audited', () => {
  it('one row per figure with the same values; totals equal the dashboard; formula-safe', async () => {
    await freshOwner()
    const v = await dashboard()
    const res = await staffWrite('owner', 'POST', '/staff/dashboard/exports', { from: FROM, to: TO })
    expect(res.statusCode, res.body).toBe(200)
    const file = res.json<ExportFile>()
    expect(file).toMatchObject({ contentType: 'text/csv', filename: `owner-dashboard-${FROM}-to-${TO}.csv` })
    const [header, ...rows] = parseCsv(file.csv)
    expect(header?.slice(0, 4)).toEqual(['section', 'figure', 'detail', 'report'])
    expect(rows).toHaveLength(v.figures.length)
    expect(file.rows).toBe(v.figures.length)
    const col = (name: string) => (header as string[]).indexOf(name)
    v.figures.forEach((f, i) => {
      const r = rows[i] as string[]
      expect(r[col('figure')], f.id).toBe(f.id)
      expect(r[col('state')], f.id).toBe(f.current.state)
      expect(r[col('value')], f.id).toBe(f.current.value === null ? '' : String(f.current.value))
      expect(r[col('basis')], f.id).toBe(f.report?.basis ?? '')
    })
    // The CSV's received total is its per-method rows added, and equals the dashboard's.
    const cents = (id: string) => Number(rows.find((r) => r[col('figure')] === id)?.[col('value')])
    const methods = rows.filter((r) => (r[col('figure')] as string).startsWith('payments.received.'))
    expect(methods.reduce((s, r) => s + Number(r[col('value')]), 0)).toBe(cents('payments.received'))
    expect(cents('payments.received')).toBe(fig(v, 'payments.received').current.value)
    expect(cents('payments.invoiced')).toBe(fig(v, 'payments.invoiced').current.value)
    expect(rows.find((r) => r[col('figure')] === 'payments.invoiced')?.[col('amount_usd')]).toBe('2400.00')
    const audit = await t.db
      .selectFrom('platform.audit_events')
      .select(['actor_id', 'summary'])
      .where('action', '=', 'dashboard.export_csv')
      .execute()
    expect(audit).toHaveLength(1)
    expect(audit[0]).toMatchObject({ actor_id: ids.owner, summary: { from: FROM, to: TO, rows: v.figures.length } })
  })

  it('a sign-in older than the freshness window is asked again; non-owners are refused', async () => {
    await staleOwner()
    const stale = await staffWrite('owner', 'POST', '/staff/dashboard/exports', { from: FROM, to: TO })
    expect(stale.statusCode).toBe(403)
    expect(stale.json<{ error: { code: string } }>().error.code).toBe('FRESH_AUTH_REQUIRED')
    await freshOwner()
    for (const who of ['office', 'estimator', 'worker'] as const) {
      expect((await staffGet(who, `/staff/dashboard?from=${FROM}&to=${TO}`)).statusCode, who).toBe(403)
      expect(
        (await staffGet(who, `/staff/dashboard/records?from=${FROM}&to=${TO}&figure=payments.invoiced`)).statusCode,
        who,
      ).toBe(403)
      expect((await staffWrite(who, 'POST', '/staff/dashboard/exports', { from: FROM, to: TO })).statusCode, who).toBe(
        403,
      )
    }
  })
})

describe('[HH-FIN-16][T64] accountant-ready exports: the Owner only, fresh sign-in and a reason, audited', () => {
  const body = (dataset: string, extra: Record<string, unknown> = {}) => ({
    dataset,
    from: FROM,
    to: TO,
    reason: 'Synthetic: month-end file for the accountant',
    ...extra,
  })

  it('non-owners are refused; the Owner needs a fresh sign-in and a reason', async () => {
    await freshOwner()
    for (const who of ['office', 'estimator', 'worker'] as const)
      expect((await staffWrite(who, 'POST', '/staff/accounting/exports', body('invoices'))).statusCode, who).toBe(403)
    const noReason = await staffWrite('owner', 'POST', '/staff/accounting/exports', {
      dataset: 'invoices',
      from: FROM,
      to: TO,
    })
    expect(noReason.statusCode).toBe(400)
    await staleOwner()
    const stale = await staffWrite('owner', 'POST', '/staff/accounting/exports', body('invoices'))
    expect(stale.json<{ error: { code: string } }>().error.code).toBe('FRESH_AUTH_REQUIRED')
    await freshOwner()
  })

  it('each file lists its records in exact dollars; totals match the dashboard; formula cells neutralized', async () => {
    await freshOwner()
    const v = await dashboard()
    const file = async (dataset: string) => {
      const res = await staffWrite('owner', 'POST', '/staff/accounting/exports', body(dataset))
      expect(res.statusCode, `${dataset}: ${res.body}`).toBe(200)
      const out = res.json<ExportFile>()
      const [header, ...rows] = parseCsv(out.csv)
      expect(out.rows, dataset).toBe(rows.length)
      return { header: header as string[], rows, col: (n: string) => (header as string[]).indexOf(n) }
    }
    const dollars = (s: string | undefined) => Math.round(Number(s) * 100)

    const inv = await file('invoices')
    const finals = inv.rows.filter((r) => r[inv.col('kind')] === 'final')
    expect(finals).toHaveLength(4)
    expect(finals.reduce((s, r) => s + dollars(r[inv.col('total_usd')]), 0)).toBe(
      fig(v, 'payments.invoiced').current.value,
    )
    // The deposit invoice is listed apart, by its kind, never added into invoiced revenue.
    expect(inv.rows.filter((r) => r[inv.col('kind')] === 'deposit')).toHaveLength(1)
    expect(finals.reduce((s, r) => s + dollars(r[inv.col('balance_usd')] || '0'), 0)).toBe(
      fig(v, 'payments.outstanding').current.value,
    )

    const pay = await file('payments')
    const received = pay.rows.filter((r) => r[pay.col('counts_as_received')] === 'yes')
    expect(received.reduce((s, r) => s + dollars(r[pay.col('amount_usd')]), 0)).toBe(
      fig(v, 'payments.received').current.value,
    )
    // The pending check is listed with its state, not counted as received; the payer name cell is formula-safe.
    expect(pay.rows.filter((r) => r[pay.col('method')] === 'check').map((r) => r[pay.col('state')])).toEqual([
      'received',
    ])

    const alloc = await file('payment_allocations')
    expect(alloc.rows.filter((r) => r[alloc.col('to_deposit')] === 'yes')).toHaveLength(1)

    const refunds = await file('refunds_credits_write_offs')
    expect(
      refunds.rows.map((r) => [r[refunds.col('type')], r[refunds.col('state')], r[refunds.col('amount_usd')]]),
    ).toEqual(
      expect.arrayContaining([
        ['refund', 'succeeded', '50.00'],
        ['credit', 'applied', '200.00'],
      ]),
    )

    const deposits = await file('deposits')
    const required = deposits.rows.filter((r) => r[deposits.col('required')] === 'yes')
    expect(required).toHaveLength(1)
    expect(dollars(required[0]?.[deposits.col('confirmed_payments_usd')])).toBe(known.deposit)
    expect(dollars(required[0]?.[deposits.col('credited_on_final_invoice_usd')])).toBe(known.deposit)

    const fees = await file('provider_fees')
    expect(fees.rows.map((r) => r[fees.col('amount_usd')])).toEqual(['12.00'])
    const payouts = await file('payouts')
    expect(
      payouts.rows.map((r) => [
        r[payouts.col('reference')],
        r[payouts.col('amount_usd')],
        r[payouts.col('fees_recorded_usd')],
      ]),
    ).toEqual([[known.payoutRef, '388.00', '12.00']])
    const costs = await file('job_costs')
    expect(
      costs.rows.map((r) => [r[costs.col('category')], r[costs.col('amount_usd')], r[costs.col('state')]]),
    ).toEqual([['materials', '75.00', 'recorded']])
    const times = await file('arrived_finished')
    expect(times.header[0]).toBe('visit_date')

    const audits = await t.db
      .selectFrom('platform.audit_events')
      .select(['actor_id', 'summary', 'reason'])
      .where('action', '=', 'accounting.export')
      .execute()
    expect(audits.length).toBeGreaterThanOrEqual(9)
    expect(audits.every((a) => a.actor_id === ids.owner)).toBe(true)
    expect(audits[0]).toMatchObject({ reason: 'Synthetic: month-end file for the accountant' })
    expect(JSON.stringify(audits)).not.toContain('Synthetic Payer')
  })

  it('cells that start with a formula character are neutralized (CSV injection)', async () => {
    await freshOwner()
    // A cost note written to start with "=" comes back prefixed so a spreadsheet never runs it.
    const job = await t.db.selectFrom('finance.job_costs').select('job_id').executeTakeFirstOrThrow()
    const res = await staffWrite('owner', 'POST', `/staff/jobs/${job.job_id}/costs`, {
      category: 'other',
      amountCents: 100,
      incurredOn: today(),
      note: '=HYPERLINK("https://example.test")',
    })
    expect(res.statusCode, res.body).toBe(201)
    const out = (await staffWrite('owner', 'POST', '/staff/accounting/exports', body('job_costs'))).json<ExportFile>()
    expect(out.csv).toContain(`"'=HYPERLINK(""https://example.test"")"`)
    expect(parseCsv(out.csv).some((r) => r.some((c) => c.startsWith('=')))).toBe(false)
  })
})

describe('[HH-FIN-18] the figure list is the domain list', () => {
  it('every domain figure is on the dashboard, in order (per-assignee figures once per staff member)', async () => {
    const v = await dashboard()
    const ids = [...new Set(v.figures.map((f) => f.id))]
    expect(ids).toEqual(
      DASHBOARD_FIGURES.map((d) => d.id).filter((id) => id !== 'cases.open_by_assignee' || ids.includes(id)),
    )
  })
})
