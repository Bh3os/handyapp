// Invoices drafted from the approved scope and issued after the Owner's quality review, and the payment ledger, against
// PostgreSQL 16 (TSK-0085, TSK-0086; HH-FIN-03, HH-FIN-04, HH-FIN-05, HH-FIN-06, HH-FIN-07, HH-FIN-12, HH-FIN-14,
// HH-PORT-10, HH-QA-02, T58, T59, T64, ENT-Invoice, ENT-Payment, ENT-PaymentAllocation, ENT-Refund,
// FACT-BUSINESS-NAME, FACT-BUSINESS-ADDRESS, FACT-PUBLIC-CONTACT, FACT-PAYMENT-INSTRUCTIONS, FACT-TAX-NO-LINE,
// FACT-PRICING-DISCOUNTS, OWN-DEC-110, OWN-DEC-111, OWN-DEC-138, OWN-DEC-152, OWN-DEC-203, RULE-MONEY-CENTS,
// RULE-SERVER-AUTHZ). Staff, customers, amounts, references and links are synthetic (RULE-SYNTHETIC-DATA); nothing
// reaches Square or any provider.
// Two fixtures of this file's own throwaway database, never statements about the business: approvals need an estimate
// terms version in effect (OQ-TERMS-OWNER-APPROVAL), so a synthetic "approved and attorney-reviewed" one is recorded
// and NOT CONFIGURED restored at the end; and the Owner's quality review (TSK-0084) is not built, so the tests of what
// happens once a review passes install the stand-in gate of fixtures/quality-review.ts. Every job the stand-in does
// not name keeps the product's answer: the final invoice waits (QUALITY_REVIEW_NOT_RECORDED).
import { createHash, randomUUID } from 'node:crypto'
import { loadServiceSeed, syncServices, withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import { localDateOf } from '@handyhub/domain'
import { ESTIMATE_TERMS } from '@handyhub/domain/legal'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { startCustomerSession } from '../../src/modules/identity/customer-sessions.js'
import { readCodeKey, type CodeKeySettings } from '../../src/modules/identity/index.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import { confirmationDepositGate, paymentReceiptAutomation } from '../../src/modules/finance/index.js'
import {
  depositInvoiceAutomation,
  invoiceDocumentAutomation,
  invoiceDraftAutomation,
  invoiceReadyAutomation,
} from '../../src/modules/finance/invoice-automations.js'
import { invoicePdfInput, invoicePdfModel, renderInvoicePdf } from '../../src/modules/finance/invoice-pdf.js'
import { createAutomationRegistry, type Automation } from '../../src/platform/automation.js'
import { recordPolicyVersion, type ConfigKey } from '../../src/platform/config/index.js'
import { createWorker } from '../../src/platform/jobs.js'
import { createProviders } from '../../src/providers/index.js'
import { FakeObjectStorage } from '../../src/providers/r2/index.js'
import { readProviderSettings } from '../../src/providers/settings.js'
import { insertChangeOrderSnapshot } from '../fixtures/change-order-snapshot.js'
import { verifyCountyOf } from '../fixtures/county.js'
import { testConfig } from '../fixtures/env.js'
import { reviewOutcome, standInQualityReview } from '../fixtures/quality-review.js'
import { signInWithMfa } from '../fixtures/staff-mfa.js'
import { verifyPropertyZone } from '../fixtures/zones.js'

const KEY: CodeKeySettings = readCodeKey({
  HANDYHUB_ENV: 'ci',
  CODE_HASH_KEY: ['synthetic', 'invoice', 'code', 'key', 'for', 'tests', 'only', '0085'].join('-'),
})
const pw = (n: number) => ['synthetic', 'invoice', 'ledger', 'passphrase', String(n)].join(' ')
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
const notices = { providers: { email: fakes.email, sms: fakes.sms }, publicSiteUrl: 'https://site.example.test' }
/** The worker as the server runs this slice: the draft, the PDF and the two notices. */
const worker = () =>
  createWorker({
    db: t.db,
    registry: createAutomationRegistry([
      fast(invoiceDraftAutomation()),
      fast(invoiceDocumentAutomation(storage)),
      fast(invoiceReadyAutomation(notices)),
      fast(depositInvoiceAutomation(notices)),
      // TSK-0087: each confirmed payment's receipt message.
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

const email = (p: Person) => `${p}-invoices@example.test`
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
    await tx
      .insertInto('identity.role_grants')
      .values({ staff_user_id: ids.worker, kind: 'capability', name: 'collect', issued_by: 'test' })
      .execute()
  })
  for (const p of PEOPLE) [cookies[p], csrf[p]] = await signIn(p)
  await setConfig('legal.estimate_terms', V1_IN_EFFECT_FIXTURE)
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
const ref = (what: string) => ['SYNTH', what, String(++seq), randomUUID().slice(0, 8)].join('-')
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

type Money = {
  invoicedCents: number
  depositCreditCents: number
  appliedCreditsCents: number
  creditsCents: number
  confirmedCents: number
  pendingCents: number
  remainingCents: number
}
type Invoice = {
  id: string
  kind: string
  state: string
  number: string | null
  scopeVersion: number | null
  lines: { kind: string; source: string; lineKind: string | null; description: string; amountCents: number }[]
  chargesCents: number
  creditLinesCents: number
  subtotalCents: number
  discount: { category: string; percentBps: number; amountCents: number } | null
  totalCents: number
  depositCreditCents: number
  paymentTermText: string
  issuer: { name: string; mailingAddress: string[] | null; phone: string | null; email: string | null } | null
  money: Money | null
  payments: { id: string; state: string; appliedCents: number; amountCents: number; canMarkCleared: boolean }[]
  exceptions: { code: string; blocking: boolean }[]
  document: string
  version: number
  paymentLink: { url: string; setBy: { id: string }; setAt: string } | null
  actions: { issue: boolean; recordPayment: boolean; setPaymentLink: boolean }
}
type JobInvoices = {
  final: Invoice | null
  deposit: Invoice | null
  unallocatedCents: number
  actions: { prepareFinal: boolean; prepareDeposit: boolean }
}
const invoices = async (jobId: string, who: Person = 'office') => {
  const res = await staffGet(who, `/staff/jobs/${jobId}/invoices`)
  expect(res.statusCode, res.body).toBe(200)
  return res.json<JobInvoices>()
}
const finalOf = async (jobId: string, who: Person = 'office') => {
  const f = (await invoices(jobId, who)).final
  if (!f) throw new Error('no final invoice')
  return f
}
const prepare = (who: Person, jobId: string, kind: 'final' | 'deposit' = 'final') =>
  staffWrite(who, 'POST', `/staff/jobs/${jobId}/invoices/${kind}-draft`, {})
const issue = (who: Person, inv: { id: string; version: number }) =>
  staffWrite(who, 'POST', `/staff/invoices/${inv.id}/issue`, {}, { 'if-match': `"${inv.version}"` })
const payDeposit = (who: Person, jobId: string, body: Record<string, unknown>) =>
  staffWrite(who, 'POST', `/staff/jobs/${jobId}/deposit/payments`, { receivedOn: today(), ...body })
const payInvoice = (who: Person, invoiceId: string, body: Record<string, unknown>) =>
  staffWrite(who, 'POST', `/staff/invoices/${invoiceId}/payments`, { receivedOn: today(), ...body })
const outboxOf = (type: string, id: string) =>
  t.db
    .selectFrom('platform.outbox_events')
    .select(['id', 'type'])
    .where('type', '=', type)
    .where('aggregate_id', '=', id)
    .execute()

/** $1,200.00 base, a selected $50.00 option, an unselected $30.00 option, military 10%: $1,125.00; deposit $225.00. */
const SCOPE: Line[] = [
  { kind: 'base', cents: 120_000, text: 'Synthetic drywall repair' },
  { kind: 'add_on', cents: 5_000, text: 'Synthetic selected trim' },
  { kind: 'add_on', cents: 3_000, text: 'Synthetic unselected sealant' },
]
const scopedJob = () => approvedJob(SCOPE, [2], 'military')

describe('[HH-FIN-05][HH-FIN-04][T58] the draft is prepared automatically from the approved scope only', () => {
  it('lines are the approved estimate lines and the selected option; the discount is a totals row; no tax line', async () => {
    const job = await scopedJob()
    // Before the worker runs there is no draft; the approval's committed event prepares it.
    expect((await invoices(job.jobId)).final).toBeNull()
    await drain()
    const f = await finalOf(job.jobId)
    expect(f).toMatchObject({
      kind: 'final',
      state: 'draft',
      number: null,
      scopeVersion: 1,
      chargesCents: 125_000,
      creditLinesCents: 0,
      subtotalCents: 125_000,
      discount: { category: 'military', percentBps: 1000, amountCents: 12_500 },
      totalCents: 112_500,
      depositCreditCents: 0,
      paymentTermText: 'Payment due on receipt',
      issuer: null,
      money: null,
      document: 'none',
    })
    // Unapproved work never appears; every line is a charge above $0.00; the discount is not a line.
    expect(f.lines.map((l) => [l.kind, l.source, l.lineKind, l.description, l.amountCents])).toEqual([
      ['charge', 'estimate_line', 'base', 'Synthetic drywall repair', 120_000],
      ['charge', 'estimate_line', 'add_on', 'Synthetic selected trim', 5_000],
    ])
    expect(JSON.stringify(f).toLowerCase()).not.toContain('tax')
    // Exceptions shown before issue: the review blocks; the missing address, placeholder contact and handles do not.
    expect(f.exceptions).toEqual(
      expect.arrayContaining([
        { code: 'QUALITY_REVIEW_NOT_RECORDED', blocking: true },
        { code: 'DEPOSIT_NOT_PAID', blocking: false },
        { code: 'MAILING_ADDRESS_NOT_CONFIGURED', blocking: false },
        { code: 'PUBLIC_CONTACT_PLACEHOLDER', blocking: false },
        { code: 'PAYMENT_INSTRUCTIONS_PLACEHOLDER', blocking: false },
      ]),
    )
    expect(f.actions.issue).toBe(false)
    // Prepared again with nothing changed: the same draft, untouched.
    const again = await prepare('office', job.jobId)
    expect(again.statusCode, again.body).toBe(200)
    expect((await finalOf(job.jobId)).version).toBe(f.version)
    const audit = await t.db
      .selectFrom('platform.audit_events')
      .select('summary')
      .where('action', '=', 'invoice.draft_prepared')
      .where('target_id', '=', f.id)
      .execute()
    expect(audit.map((a) => (a.summary as { outcome: string }).outcome)).toContain('unchanged')
  })

  it('[OWN-DEC-203] a credit change-order line lowers the total as a positive magnitude; it never makes a negative charge', async () => {
    const job = await approvedJob([{ kind: 'base', cents: 80_000 }])
    await drain()
    const draft = await finalOf(job.jobId)
    // TSK-0082 appends approved change orders as scope snapshots; this one (a synthetic record) credits $150.00.
    const addScope = (version: number, lines: object[], subtotal: number) =>
      insertChangeOrderSnapshot(t.db, {
        job_id: job.jobId,
        version,
        lines: JSON.stringify(lines),
        texts: '{}',
        exclusions: [],
        selected_options: [],
        subtotal_cents: subtotal,
        discount_cents: 0,
        total_cents: subtotal,
        terms_document_id: ESTIMATE_TERMS.documentId,
        terms_sha256: ESTIMATE_TERMS.contentSha256,
        content_sha256: createHash('sha256').update(randomUUID()).digest('hex'),
      })
    const base = { position: 1, kind: 'base', serviceCode: null, description: 'Synthetic base', quantity: '1' }
    await addScope(
      2,
      [
        { ...base, unit: 'job', unitPriceCents: 80_000, amountCents: 80_000 },
        {
          ...base,
          position: 2,
          kind: 'credit',
          description: 'Synthetic credit',
          unit: null,
          unitPriceCents: null,
          amountCents: 15_000,
        },
      ],
      65_000,
    )
    const stale = await finalOf(job.jobId)
    expect(stale.exceptions).toContainEqual({ code: 'SCOPE_CHANGED', blocking: true })
    expect((await prepare('office', job.jobId)).statusCode).toBe(200)
    const f = await finalOf(job.jobId)
    expect(f.version).toBe(draft.version + 1)
    expect(f).toMatchObject({ scopeVersion: 2, chargesCents: 80_000, creditLinesCents: 15_000, totalCents: 65_000 })
    expect(f.lines.map((l) => [l.kind, l.amountCents])).toEqual([
      ['charge', 80_000],
      ['credit', 15_000],
    ])
    expect(f.lines.every((l) => l.amountCents > 0)).toBe(true)
    expect(f.exceptions.map((e) => e.code)).not.toContain('SCOPE_CHANGED')
    // A reduction that reaches the charges is refused, never a negative charge; the draft stays as it was.
    await addScope(
      3,
      [
        { ...base, unit: 'job', unitPriceCents: 80_000, amountCents: 80_000 },
        {
          ...base,
          position: 2,
          kind: 'credit',
          description: 'Synthetic big credit',
          unit: null,
          unitPriceCents: null,
          amountCents: 80_000,
        },
      ],
      1,
    )
    const refused = await prepare('office', job.jobId)
    expect(refused.statusCode).toBe(409)
    expect(codes(refused)).toContain('CREDIT_EXCEEDS_CHARGES')
    expect((await finalOf(job.jobId)).scopeVersion).toBe(2)
    // No stored amount is ever negative.
    await expect(
      sql`INSERT INTO finance.invoice_lines (invoice_id, position, kind, source, description, amount_cents)
          VALUES (${f.id}, 9, 'credit', 'change_order', 'Synthetic negative', -1)`.execute(t.db),
    ).rejects.toThrow()
  })
})

describe('[HH-FIN-05][HH-QA-02][T58][RULE-SAFETY-GATES] issuing waits for the Owner’s quality review', () => {
  it('Office and the Owner are refused before the review; the Estimator and the Worker never issue', async () => {
    const job = await scopedJob()
    await drain()
    const f = await finalOf(job.jobId)
    for (const who of ['office', 'owner'] as const) {
      const res = await issue(who, f)
      expect(res.statusCode, res.body).toBe(409)
      expect(codes(res)).toContain('QUALITY_REVIEW_NOT_RECORDED')
    }
    for (const who of ['estimator', 'worker'] as const) expect((await issue(who, f)).statusCode).toBe(403)
    const after = await finalOf(job.jobId)
    expect(after).toMatchObject({ state: 'draft', number: null, depositCreditCents: 0 })
    expect(await outboxOf('invoice.issued', f.id)).toEqual([])
    // The database refuses it too: no flag or role skips the gate.
    await expect(
      sql`UPDATE finance.invoices SET state = 'issued', sequence = 1, number = 'HH-00000000-I1', issued_at = now(),
            issued_by = ${ids.owner}, issuer_name = 'x', policy_versions = '{}' WHERE id = ${f.id}`.execute(t.db),
    ).rejects.toThrow()
    // A blocked review (major defects) keeps it blocked; minor punch items let only the Owner issue.
    await reviewOutcome(t.db, job.jobId, 'blocked')
    expect(codes(await issue('owner', f))).toContain('QUALITY_REVIEW_BLOCKED')
    await reviewOutcome(t.db, job.jobId, 'owner_may_issue')
    expect(codes(await issue('office', f))).toContain('QUALITY_REVIEW_OWNER_ONLY')
  })
})

describe('[HH-FIN-04][HH-FIN-05][T58] the issued invoice matches the approved scope and the deposit credit', () => {
  it('pins the number, issuer and credit once; immutable; English PDF; one notice without amounts; customer Documents', async () => {
    const job = await scopedJob()
    await drain()
    // The deposit ($225.00) paid with verified money before the work.
    const dep = await payDeposit('office', job.jobId, { method: 'cash', amountCents: 22_500 })
    expect(dep.statusCode, dep.body).toBe(201)
    await reviewOutcome(t.db, job.jobId, 'passed')
    const draft = await finalOf(job.jobId)
    expect(draft.depositCreditCents).toBe(22_500)
    expect(draft.exceptions.filter((e) => e.blocking)).toEqual([])
    expect(draft.actions.issue).toBe(true)
    // A stale version is refused.
    const stale = await issue('office', { id: draft.id, version: draft.version + 7 })
    expect(stale.statusCode).toBe(409)
    const res = await issue('office', draft)
    expect(res.statusCode, res.body).toBe(200)
    const f = res.json<JobInvoices>().final as Invoice
    expect(f).toMatchObject({
      state: 'issued',
      number: `${job.projectReference}-I1`,
      totalCents: 112_500,
      depositCreditCents: 22_500,
      issuer: { name: 'Handyhub LLC', mailingAddress: null, phone: null, email: null },
      money: {
        invoicedCents: 112_500,
        depositCreditCents: 22_500,
        creditsCents: 22_500,
        confirmedCents: 0,
        pendingCents: 0,
        remainingCents: 90_000,
      },
      exceptions: [],
      actions: { issue: false, recordPayment: true },
    })
    // The deposit is credited exactly once and is now applied; work visits stay open; it takes no more money.
    const credits = await t.db
      .selectFrom('finance.invoice_deposit_credits')
      .selectAll()
      .where('job_id', '=', job.jobId)
      .execute()
    expect(credits.map((c) => Number(c.amount_cents))).toEqual([22_500])
    const req = await t.db
      .selectFrom('finance.deposit_requirements')
      .select('state')
      .where('job_id', '=', job.jobId)
      .executeTakeFirstOrThrow()
    expect(req.state).toBe('applied')
    expect(await withTx(t.db, (tx) => confirmationDepositGate(tx, { kind: 'work', jobId: job.jobId }))).toEqual({
      open: true,
      basis: 'applied',
    })
    const more = await payDeposit('office', job.jobId, { method: 'cash', amountCents: 100 })
    expect(codes(more)).toContain('DEPOSIT_APPLIED')
    // Issued once: again is refused; the event is written once.
    expect(codes(await issue('office', f))).toContain('INVOICE_ALREADY_ISSUED')
    expect(await outboxOf('invoice.issued', f.id)).toHaveLength(1)
    const audit = await t.db
      .selectFrom('platform.audit_events')
      .select(['summary', 'result'])
      .where('action', '=', 'invoice.issue')
      .where('target_id', '=', f.id)
      .execute()
    expect(audit).toHaveLength(1)
    // Immutable once issued: the database refuses any change to it or its lines, and its deletion.
    await expect(sql`UPDATE finance.invoices SET total_cents = 1 WHERE id = ${f.id}`.execute(t.db)).rejects.toThrow(
      /never changes|invoices_/,
    )
    await expect(
      sql`UPDATE finance.invoice_lines SET amount_cents = 1 WHERE invoice_id = ${f.id}`.execute(t.db),
    ).rejects.toThrow(/never change/)
    await expect(sql`DELETE FROM finance.invoices WHERE id = ${f.id}`.execute(t.db)).rejects.toThrow(/never deleted/)
    await expect(
      sql`INSERT INTO finance.invoice_deposit_credits (invoice_id, job_id, deposit_requirement_id, amount_cents)
          SELECT ${f.id}, ${job.jobId}, id, 1 FROM finance.deposit_requirements WHERE job_id = ${job.jobId}`.execute(
        t.db,
      ),
    ).rejects.toThrow()

    // The worker stores the English PDF once and sends the invoice-ready notice once, with no amounts.
    const emailsBefore = fakes.fakeEmail.calls.length
    await drain()
    await drain()
    const docs = await t.db.selectFrom('finance.invoice_documents').selectAll().where('invoice_id', '=', f.id).execute()
    expect(docs).toHaveLength(1)
    const doc = docs[0] as (typeof docs)[number]
    expect(doc).toMatchObject({ content_type: 'application/pdf', test_mark: true, renderer_version: 1 })
    const { bytes } = await storage.get(doc.object_key)
    expect(Buffer.from(bytes).subarray(0, 5).toString('latin1')).toBe('%PDF-')
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(doc.sha256)
    const input = await invoicePdfInput(t.db, f.id)
    expect(input).not.toBeNull()
    expect(
      createHash('sha256')
        .update(await renderInvoicePdf(input as NonNullable<typeof input>))
        .digest('hex'),
    ).toBe(doc.sha256)
    const model = invoicePdfModel(input as NonNullable<typeof input>)
    const text = JSON.stringify(model)
    expect(model.mark).toBe('TEST — not a real invoice or estimate')
    expect(model.title).toBe(`Invoice ${f.number}`)
    for (const s of [
      'Handyhub LLC',
      'Synthetic drywall repair',
      'Optional add-on: Synthetic selected trim',
      'Discount (military) -10%',
      '-$125.00',
      '$1,125.00',
      'Deposit received',
      '-$225.00',
      '$900.00',
      'Payment due on receipt',
      'Placeholder — not provided yet',
      'Credit or debit cards (Square)',
      '[Payment email or phone] (Placeholder — not a payment destination)',
      'HandyHub gives a 90-day workmanship warranty, counted from the reviewed completion date.',
      'Synthetic Invoice Customer',
    ])
      expect(text).toContain(s)
    expect(text).not.toContain('Synthetic unselected sealant')
    expect(text).not.toContain('"Address"')
    expect(text.toLowerCase()).not.toContain('surcharge')
    expect(text.toLowerCase()).not.toContain('tax')
    const sent = await t.db
      .selectFrom('platform.message_deliveries')
      .select(['channel', 'state', 'error_code'])
      .where('subject_key', '=', `invoice:${f.id}`)
      .orderBy('channel')
      .execute()
    expect(sent.find((d) => d.channel === 'email')).toMatchObject({ state: 'queued', error_code: null })
    expect(sent.filter((d) => d.channel === 'email')).toHaveLength(1)
    expect(fakes.fakeEmail.calls.length).toBe(emailsBefore + 1)
    const notice = fakes.fakeEmail.calls.at(-1)
    expect(notice?.subject).toBe(`HandyHub | Your Invoice #${f.number} Is Ready`)
    expect(notice?.text).toContain(`https://site.example.test/portal/p/${job.projectReference}/documents`)
    expect(notice?.text.replaceAll(f.number as string, '').replaceAll(job.projectReference, '')).not.toMatch(
      /\$|\d{3,}/,
    )

    // The customer's Documents tab: the invoice current, with its balance; its PDF by a short-lived link.
    const tab = await app.inject({
      method: 'GET',
      url: `/api/v1/customer/projects/${job.reference}/documents`,
      headers: { cookie: job.customerCookie },
    })
    expect(tab.statusCode, tab.body).toBe(200)
    expect(tab.json<{ invoices: unknown[] }>().invoices).toEqual([
      {
        number: f.number,
        kind: 'final',
        status: 'current',
        state: 'issued',
        issuedAt: expect.any(String),
        totalCents: 112_500,
        balanceCents: 90_000,
        pendingCents: 0,
        document: 'issued',
      },
    ])
    const link = await app.inject({
      method: 'GET',
      url: `/api/v1/customer/projects/${job.reference}/invoices/${f.number}/document`,
      headers: { cookie: job.customerCookie },
    })
    expect(link.statusCode, link.body).toBe(200)
    expect(link.json<{ documents: { kind: string; url: string }[] }>().documents[0]).toMatchObject({
      kind: 'invoice_pdf',
      url: expect.stringMatching(/^https:\/\/fake-r2\.invalid\/invoices\//),
    })
    expect(link.body).not.toContain(doc.object_key.replace('invoices/', 'x'))
    expect(link.body).not.toContain(doc.sha256)
    // Another project's customer never reaches it (the same NOT_FOUND as an unknown number).
    const other = await approvedJob([{ kind: 'base', cents: 10_000 }])
    const foreign = await app.inject({
      method: 'GET',
      url: `/api/v1/customer/projects/${job.reference}/invoices/${f.number}/document`,
      headers: { cookie: other.customerCookie },
    })
    expect(foreign.statusCode).toBe(404)
  })

  it('the deposit is credited once even when two staff issue at the same moment; a pending deposit check waits', async () => {
    const job = await scopedJob()
    await drain()
    await reviewOutcome(t.db, job.jobId, 'passed')
    const check = await payDeposit('office', job.jobId, {
      method: 'check',
      amountCents: 22_500,
      reference: ref('check'),
      payerName: 'Synthetic Payer',
    })
    expect(check.statusCode, check.body).toBe(201)
    const pending = await finalOf(job.jobId)
    expect(pending.exceptions).toContainEqual({ code: 'DEPOSIT_CHECK_PENDING', blocking: true })
    expect(codes(await issue('office', pending))).toContain('DEPOSIT_CHECK_PENDING')
    const paymentId = check.json<{ payments: { id: string }[] }>().payments[0]?.id as string
    expect((await staffWrite('owner', 'POST', `/staff/payments/${paymentId}/clear`, {})).statusCode).toBe(200)
    const draft = await finalOf(job.jobId)
    const [a, b] = await Promise.all([issue('office', draft), issue('owner', draft)])
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409])
    const credits = await t.db
      .selectFrom('finance.invoice_deposit_credits')
      .select('amount_cents')
      .where('job_id', '=', job.jobId)
      .execute()
    expect(credits.map((c) => Number(c.amount_cents))).toEqual([22_500])
    expect(await outboxOf('invoice.issued', draft.id)).toHaveLength(1)
  })
})

describe('[HH-FIN-07][HH-FIN-12][T59] partial, pending, deposit and overpayment never double-credit; Paid only at $0.00', () => {
  it('confirmed, pending and remaining show apart; allocations never exceed the invoice; the overpayment waits for the Owner', async () => {
    const job = await scopedJob()
    await drain()
    expect((await payDeposit('office', job.jobId, { method: 'cash', amountCents: 22_500 })).statusCode).toBe(201)
    await reviewOutcome(t.db, job.jobId, 'passed')
    const issued = await issue('office', await finalOf(job.jobId))
    expect(issued.statusCode, issued.body).toBe(200)
    const id = (issued.json<JobInvoices>().final as Invoice).id

    // A partial cash payment: partially paid, confirmed apart from the remaining balance.
    const cash = await payInvoice('office', id, { method: 'cash', amountCents: 30_000 })
    expect(cash.statusCode, cash.body).toBe(201)
    let f = cash.json<JobInvoices>().final as Invoice
    expect(f.state).toBe('partially_paid')
    expect(f.money).toMatchObject({
      creditsCents: 22_500,
      confirmedCents: 30_000,
      pendingCents: 0,
      remainingCents: 60_000,
    })

    // An uncleared check is pending: it never counts, and never makes the invoice paid.
    const check = await payInvoice('office', id, {
      method: 'check',
      amountCents: 20_000,
      reference: ref('check'),
      payerName: 'Synthetic Payer',
    })
    expect(check.statusCode, check.body).toBe(201)
    f = check.json<JobInvoices>().final as Invoice
    expect(f.money).toMatchObject({ confirmedCents: 30_000, pendingCents: 20_000, remainingCents: 60_000 })
    expect(f.state).toBe('partially_paid')

    // Two payments at the same moment: together they are applied only up to what is still asked for ($400.00).
    const [z, c] = await Promise.all([
      payInvoice('office', id, { method: 'zelle', amountCents: 30_000, reference: ref('zelle') }),
      payInvoice('owner', id, { method: 'cash', amountCents: 50_000 }),
    ])
    // The two are serialized on the invoice. In either order the total applied stops at what was asked for: Zelle
    // first leaves both recorded ($400.00 applied, $400.00 over); cash first covers the rest, and the Zelle payment
    // is then refused as covered ($400.00 applied, $100.00 over).
    const zelleFirst = z.statusCode === 201
    expect(c.statusCode, c.body).toBe(201)
    if (!zelleFirst) expect(codes(z)).toContain('INVOICE_COVERED')
    const rows = await t.db
      .selectFrom('finance.payment_allocations as a')
      .innerJoin('finance.payments as p', 'p.id', 'a.payment_id')
      .select(['a.amount_cents', 'p.amount_cents as paid'])
      .where('a.invoice_id', '=', id)
      .execute()
    const allocated = rows.reduce((s, r) => s + Number(r.amount_cents), 0)
    expect(allocated + 22_500).toBe(112_500)
    const view = await invoices(job.jobId)
    f = view.final as Invoice
    expect(f.money).toMatchObject({ confirmedCents: 70_000, pendingCents: 20_000, remainingCents: 20_000 })
    expect(f.state).toBe('partially_paid')
    // The overpayment is unallocated money for the Owner's credit or refund decision, never a negative balance.
    expect(view.unallocatedCents).toBe(zelleFirst ? 40_000 : 10_000)
    const item = await t.db
      .selectFrom('ops.queue_items')
      .select(['reason', 'resolved_at'])
      .where('type', '=', 'unallocated_credit')
      .where('subject_id', '=', job.jobId)
      .executeTakeFirstOrThrow()
    expect(item).toMatchObject({ reason: 'overpayment', resolved_at: null })
    // Nothing more is taken while the pending check covers the rest; the database refuses an over-allocation too.
    expect(codes(await payInvoice('office', id, { method: 'cash', amountCents: 100 }))).toContain('INVOICE_COVERED')
    const cashPayment = await t.db
      .selectFrom('finance.payments')
      .select('id')
      .where('job_id', '=', job.jobId)
      .where('amount_cents', '=', '50000')
      .executeTakeFirstOrThrow()
    await expect(
      sql`INSERT INTO finance.payment_allocations (payment_id, invoice_id, amount_cents, allocated_by)
          VALUES (${cashPayment.id}, ${id}, 1, ${ids.office})`.execute(t.db),
    ).rejects.toThrow(/never exceed|unique|duplicate/)
    expect(await outboxOf('invoice.paid', id)).toEqual([])

    // Office never clears a check (OWN-DEC-138); the Owner does: confirmed payments and credits reach $0.00 -> Paid.
    const checkId = f.payments.find((p) => p.state === 'received')?.id as string
    expect((await staffWrite('office', 'POST', `/staff/payments/${checkId}/clear`, {})).statusCode).toBe(403)
    expect((await staffWrite('owner', 'POST', `/staff/payments/${checkId}/clear`, {})).statusCode).toBe(200)
    f = await finalOf(job.jobId)
    expect(f.state).toBe('paid')
    expect(f.money).toMatchObject({ confirmedCents: 90_000, pendingCents: 0, remainingCents: 0 })
    expect(f.actions.recordPayment).toBe(false)
    expect(await outboxOf('invoice.paid', id)).toHaveLength(1)
    expect(codes(await payInvoice('office', id, { method: 'cash', amountCents: 100 }))).toContain('INVOICE_PAID')
    expect(await outboxOf('invoice.paid', id)).toHaveLength(1)
  })

  it('[HH-FIN-03][T64] recording is payment.record; a Worker without an assignment and the Estimator are refused', async () => {
    const job = await approvedJob([{ kind: 'base', cents: 50_000 }])
    await drain()
    await reviewOutcome(t.db, job.jobId, 'passed')
    const f = (await issue('office', await finalOf(job.jobId))).json<JobInvoices>().final as Invoice
    expect(f.money?.remainingCents).toBe(50_000)
    for (const who of ['estimator', 'worker'] as const)
      expect((await payInvoice(who, f.id, { method: 'cash', amountCents: 1_000 })).statusCode).toBe(403)
    expect((await staffGet('estimator', `/staff/jobs/${job.jobId}/invoices`)).statusCode).toBe(403)
    // A full payment: Paid at once, with nothing unallocated.
    const full = await payInvoice('office', f.id, { method: 'cash', amountCents: 50_000 })
    expect(full.json<JobInvoices>()).toMatchObject({ final: { state: 'paid' }, unallocatedCents: 0 })
  })
})

describe('[HH-FIN-06][HH-FIN-14] payouts, fees, refunds and credits are separate records', () => {
  it('Square payouts and fees are recorded by hand, apart from the customer payment', async () => {
    const job = await approvedJob([{ kind: 'base', cents: 40_000 }])
    await drain()
    await reviewOutcome(t.db, job.jobId, 'passed')
    const f = (await issue('office', await finalOf(job.jobId))).json<JobInvoices>().final as Invoice
    const cashPart = await payInvoice('office', f.id, { method: 'cash', amountCents: 10_000 })
    expect(cashPart.statusCode, cashPart.body).toBe(201)
    const card = await payInvoice('office', f.id, {
      method: 'square_payment_link',
      amountCents: 30_000,
      reference: ref('sq'),
    })
    expect(card.json<JobInvoices>().final?.state).toBe('paid')
    const paid = (card.json<JobInvoices>().final as Invoice).payments
    const cashId = paid[0]?.id as string
    const paymentId = paid[1]?.id as string
    const payoutRef = ref('payout')
    const payout = await staffWrite('office', 'POST', '/staff/payouts', {
      reference: payoutRef,
      amountCents: 38_800,
      paidOutOn: today(),
    })
    expect(payout.statusCode, payout.body).toBe(201)
    const payoutId = payout
      .json<{ payouts: { id: string; reference: string }[] }>()
      .payouts.find((p) => p.reference === payoutRef)?.id as string
    expect(
      codes(
        await staffWrite('office', 'POST', '/staff/payouts', {
          reference: payoutRef,
          amountCents: 1,
          paidOutOn: today(),
        }),
      ),
    ).toContain('DUPLICATE_PAYOUT')
    const fee = await staffWrite('owner', 'POST', '/staff/provider-fees', {
      amountCents: 1_200,
      incurredOn: today(),
      paymentId,
      payoutId,
    })
    expect(fee.statusCode, fee.body).toBe(201)
    expect(
      fee.json<{ payouts: { id: string; feesCents: number }[] }>().payouts.find((p) => p.id === payoutId),
    ).toMatchObject({ feesCents: 1_200 })
    // A fee belongs to a Square card payment only; the Estimator and the Worker record neither.
    const onCash = await staffWrite('owner', 'POST', '/staff/provider-fees', {
      amountCents: 100,
      incurredOn: today(),
      paymentId: cashId,
    })
    expect(onCash.statusCode).toBe(400)
    expect(codes(onCash)).toContain('NOT_A_SQUARE_PAYMENT')
    for (const who of ['estimator', 'worker'] as const) {
      expect(
        (await staffWrite(who, 'POST', '/staff/payouts', { reference: ref('p'), amountCents: 1, paidOutOn: today() }))
          .statusCode,
      ).toBe(403)
      expect(
        (await staffWrite(who, 'POST', '/staff/provider-fees', { amountCents: 1, incurredOn: today(), payoutId }))
          .statusCode,
      ).toBe(403)
    }
    // The customer payment and the invoice are unchanged by the payout and the fee.
    const after = await finalOf(job.jobId)
    expect(after.money).toMatchObject({ confirmedCents: 40_000, remainingCents: 0 })
    expect(after.payments.map((p) => p.amountCents)).toEqual([10_000, 30_000])
  })

  it('only the Owner approves a refund or a credit, from their own live session; an applied credit counts toward Paid', async () => {
    const job = await approvedJob([{ kind: 'base', cents: 60_000 }])
    await drain()
    await reviewOutcome(t.db, job.jobId, 'passed')
    const f = (await issue('office', await finalOf(job.jobId))).json<JobInvoices>().final as Invoice
    // $650.00 paid on a $600.00 invoice: $50.00 is unallocated money.
    const over = await payInvoice('office', f.id, { method: 'cash', amountCents: 65_000 })
    expect(over.json<JobInvoices>()).toMatchObject({ final: { state: 'paid' }, unallocatedCents: 5_000 })
    const payment = (over.json<JobInvoices>().final as Invoice).payments[0]?.id as string
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
    const refund = await t.db
      .insertInto('finance.refunds')
      .values({
        project_id: job.projectId,
        job_id: job.jobId,
        type: 'refund',
        payment_id: payment,
        amount_cents: 5_000,
        reason: 'Synthetic: overpayment returned',
        requested_by: ids.office,
        state: 'requested',
      })
      .returning('id')
      .executeTakeFirstOrThrow()
    // A refund beyond what the payment can still give is refused.
    await expect(
      t.db
        .insertInto('finance.refunds')
        .values({
          project_id: job.projectId,
          job_id: job.jobId,
          type: 'refund',
          payment_id: payment,
          amount_cents: 1,
          reason: 'Synthetic: too much',
          requested_by: ids.office,
          state: 'requested',
        })
        .execute(),
    ).rejects.toThrow(/never exceeds/)
    const approve = (who: Person, session: string) =>
      sql`UPDATE finance.refunds SET state = 'approved', approved_by = ${ids[who]}, approved_at = now(),
            staff_session_id = ${session}, authenticated_at = now() WHERE id = ${refund.id}`.execute(t.db)
    await expect(approve('office', await sessionOf('office'))).rejects.toThrow(/only the Owner/)
    await expect(approve('owner', await sessionOf('office'))).rejects.toThrow(/own live session/)
    await approve('owner', await sessionOf('owner'))
    await expect(
      sql`UPDATE finance.refunds SET state = 'succeeded' WHERE id = ${refund.id}`.execute(t.db),
    ).rejects.toThrow(/not available/)
    await expect(sql`DELETE FROM finance.refunds WHERE id = ${refund.id}`.execute(t.db)).rejects.toThrow(
      /never deleted/,
    )
    expect((await invoices(job.jobId)).unallocatedCents).toBe(0)

    // A credit the Owner applies counts toward Paid like confirmed money.
    const credited = await approvedJob([{ kind: 'base', cents: 20_000 }])
    await drain()
    await reviewOutcome(t.db, credited.jobId, 'passed')
    const ci = (await issue('office', await finalOf(credited.jobId))).json<JobInvoices>().final as Invoice
    const credit = await t.db
      .insertInto('finance.refunds')
      .values({
        project_id: credited.projectId,
        job_id: credited.jobId,
        type: 'credit',
        invoice_id: ci.id,
        amount_cents: 20_000,
        reason: 'Synthetic: goodwill credit',
        requested_by: ids.owner,
        state: 'requested',
      })
      .returning('id')
      .executeTakeFirstOrThrow()
    const owner = await sessionOf('owner')
    await sql`UPDATE finance.refunds SET state = 'issued', approved_by = ${ids.owner}, approved_at = now(),
                staff_session_id = ${owner}, authenticated_at = now() WHERE id = ${credit.id}`.execute(t.db)
    expect((await finalOf(credited.jobId)).state).toBe('issued')
    await sql`UPDATE finance.refunds SET state = 'applied' WHERE id = ${credit.id}`.execute(t.db)
    const paid = await finalOf(credited.jobId)
    expect(paid).toMatchObject({ state: 'paid', money: { appliedCreditsCents: 20_000, remainingCents: 0 } })
  })
})

describe('[OWN-DEC-152][HH-FIN-05] the deposit invoice bills the due deposit and sends the deposit-invoice message once', () => {
  it('needs no quality review; is paid through the deposit; the final invoice gets the next number', async () => {
    const job = await scopedJob()
    await drain()
    expect((await invoices(job.jobId)).actions.prepareDeposit).toBe(true)
    const prepared = await prepare('office', job.jobId, 'deposit')
    expect(prepared.statusCode, prepared.body).toBe(200)
    const d = prepared.json<JobInvoices>().deposit as Invoice
    expect(d).toMatchObject({ kind: 'deposit', state: 'draft', totalCents: 22_500, discount: null })
    expect(d.lines).toEqual([
      expect.objectContaining({
        kind: 'charge',
        source: 'deposit',
        description: `Deposit for approved estimate ${job.estimateNumber}, version 1`,
        amountCents: 22_500,
      }),
    ])
    expect(d.exceptions.filter((e) => e.blocking)).toEqual([])
    const res = await issue('office', d)
    expect(res.statusCode, res.body).toBe(200)
    const issued = res.json<JobInvoices>().deposit as Invoice
    expect(issued).toMatchObject({ state: 'issued', number: `${job.projectReference}-I1` })
    // Paid through the deposit, never directly.
    expect(codes(await payInvoice('office', issued.id, { method: 'cash', amountCents: 100 }))).toContain(
      'DEPOSIT_INVOICE_PAID_THROUGH_DEPOSIT',
    )
    expect((await payDeposit('office', job.jobId, { method: 'cash', amountCents: 22_500 })).statusCode).toBe(201)
    expect((await invoices(job.jobId)).deposit).toMatchObject({ state: 'paid', money: { remainingCents: 0 } })
    expect(await outboxOf('invoice.paid', issued.id)).toHaveLength(1)
    const emailsBefore = fakes.fakeEmail.calls.length
    await drain()
    await drain()
    const mail = fakes.fakeEmail.calls.slice(emailsBefore).filter((m) => m.subject.includes('Deposit Invoice'))
    expect(mail).toHaveLength(1)
    expect(mail[0]?.subject).toBe(`HandyHub | Deposit Invoice #${issued.number}`)
    // The final invoice is numbered next and credits the deposit once.
    await reviewOutcome(t.db, job.jobId, 'passed')
    const final = (await issue('owner', await finalOf(job.jobId))).json<JobInvoices>().final as Invoice
    expect(final).toMatchObject({ number: `${job.projectReference}-I2`, depositCreditCents: 22_500 })
  })
})

type PaymentsTab = {
  state: 'none' | 'listed'
  approvedTotalCents: number | null
  deposit: { state: string; amountCents: number | null; payByCardUrl: string | null }
  invoices: {
    number: string
    kind: string
    state: string
    totalCents: number
    creditsCents: number
    confirmedCents: number
    pendingCents: number
    balanceCents: number
    payByCardUrl: string | null
  }[]
  payments: {
    receivedOn: string
    method: string
    amountCents: number
    state: string
    receipt: { number: string; paymentNumber: string; partial: boolean; balanceAfterCents: number } | null
  }[]
  confirmedCents: number
  pendingCents: number
  balanceCents: number
  instructions: {
    methods: string[]
    placeholder: boolean
    zelle: string | null
    cashApp: string | null
    chime: string | null
    checkPayee: string | null
  } | null
}
const paymentsTab = async (reference: string, cookie: string, query = '') => {
  const res = await app.inject({
    method: 'GET',
    url: `/api/v1/customer/projects/${reference}/payments${query}`,
    headers: { cookie },
  })
  expect(res.statusCode, res.body).toBe(200)
  return res.json<PaymentsTab>()
}
const setLink = (who: Person, invoiceId: string, url: string) =>
  staffWrite(who, 'PUT', `/staff/invoices/${invoiceId}/payment-link`, { url })

describe('[HH-FIN-08][HH-FIN-09][HH-PORT-12][T60] Square links, recorded payments and the Payments tab (TSK-0087)', () => {
  it('[HH-FIN-08][T60] only the Owner or Office paste a link, https on a Square host only; a new one replaces the shown one', async () => {
    const job = await approvedJob([{ kind: 'base', cents: 50_000 }])
    await drain()
    await reviewOutcome(t.db, job.jobId, 'passed')
    const f = (await issue('office', await finalOf(job.jobId))).json<JobInvoices>().final as Invoice
    expect(f).toMatchObject({ paymentLink: null, actions: { setPaymentLink: true } })
    for (const who of ['estimator', 'worker'] as const)
      expect((await setLink(who, f.id, 'https://square.link/u/SYNTH080')).statusCode).toBe(403)
    for (const [url, code] of [
      ['http://square.link/u/SYNTH080', 'NOT_HTTPS'],
      ['https://square.link.example.test/u/SYNTH080', 'NOT_A_SQUARE_LINK'],
      ['https://pay.example.test/square', 'NOT_A_SQUARE_LINK'],
      ['not a link', 'NOT_A_LINK'],
    ] as const) {
      const res = await setLink('office', f.id, url)
      expect(res.statusCode, res.body).toBe(400)
      expect(codes(res)).toEqual([code])
    }
    const first = await setLink('office', f.id, ' https://square.link/u/SYNTH080A ')
    expect(first.statusCode, first.body).toBe(200)
    expect((first.json<JobInvoices>().final as Invoice).paymentLink).toMatchObject({
      url: 'https://square.link/u/SYNTH080A',
      setBy: { id: ids.office },
    })
    const second = await setLink('owner', f.id, 'https://checkout.square.site/merchant/SYNTH/checkout/SYNTH080B')
    expect((second.json<JobInvoices>().final as Invoice).paymentLink?.url).toBe(
      'https://checkout.square.site/merchant/SYNTH/checkout/SYNTH080B',
    )
    // Every link stays recorded, never changed; the audit keeps the host only.
    const links = await t.db
      .selectFrom('finance.invoice_payment_links')
      .select('url')
      .where('invoice_id', '=', f.id)
      .execute()
    expect(links).toHaveLength(2)
    await expect(
      sql`UPDATE finance.invoice_payment_links SET url = 'https://square.link/u/x' WHERE invoice_id = ${f.id}`.execute(
        t.db,
      ),
    ).rejects.toThrow(/never changed or deleted/)
    const audit = await t.db
      .selectFrom('platform.audit_events')
      .select('summary')
      .where('action', '=', 'invoice.payment_link_set')
      .where('target_id', '=', f.id)
      .execute()
    expect(audit.map((a) => a.summary)).toEqual([
      expect.objectContaining({ host: 'square.link', replaced: false }),
      expect.objectContaining({ host: 'checkout.square.site', replaced: true }),
    ])
    expect(JSON.stringify(audit)).not.toContain('SYNTH080')
    // Once paid, no link is pasted any more.
    await payInvoice('office', f.id, { method: 'cash', amountCents: 50_000 })
    const late = await setLink('office', f.id, 'https://square.link/u/SYNTH080C')
    expect(codes(late)).toEqual(['INVOICE_PAID'])
  })

  it('[HH-PORT-12][HH-FIN-09][HH-FIN-10][T59][T60] the Payments tab matches the ledger; a return from Square changes nothing', async () => {
    const job = await scopedJob()
    await drain()
    // Before anything is paid: the approved total and the deposit due, nothing to pay by card yet.
    let tab = await paymentsTab(job.reference, job.customerCookie)
    expect(tab).toMatchObject({
      state: 'listed',
      approvedTotalCents: 112_500,
      deposit: { state: 'deposit_due', amountCents: 22_500, payByCardUrl: null },
      invoices: [],
      payments: [],
      balanceCents: 0,
    })
    // The handles are the Owner's labelled placeholders, never destinations (FACT-PAYMENT-INSTRUCTIONS).
    expect(tab.instructions).toEqual({
      methods: ['square_payment_link', 'square_tap_to_pay', 'cash', 'check', 'zelle', 'cash_app', 'chime'],
      placeholder: true,
      zelle: '[Payment email or phone]',
      cashApp: '[$Cashtag]',
      chime: '[Payment handle or details]',
      checkPayee: '[Payee name]',
    })
    expect((await payDeposit('office', job.jobId, { method: 'cash', amountCents: 22_500 })).statusCode).toBe(201)
    await reviewOutcome(t.db, job.jobId, 'passed')
    const f = (await issue('office', await finalOf(job.jobId))).json<JobInvoices>().final as Invoice
    tab = await paymentsTab(job.reference, job.customerCookie)
    expect(tab.deposit).toMatchObject({ state: 'deposit_received', amountCents: 22_500 })
    // No link yet: no Pay by Card, never a button that does nothing.
    expect(tab.invoices).toEqual([
      expect.objectContaining({
        number: f.number,
        kind: 'final',
        state: 'issued',
        balanceCents: 90_000,
        payByCardUrl: null,
      }),
    ])
    await setLink('office', f.id, 'https://square.link/u/SYNTH087')
    tab = await paymentsTab(job.reference, job.customerCookie)
    expect(tab.invoices[0]?.payByCardUrl).toBe('https://square.link/u/SYNTH087')

    // The customer comes back from the Square "success" page: nothing is marked paid by the return.
    const back = await paymentsTab(job.reference, job.customerCookie, '?status=success&transactionId=SYNTH-SQ-1')
    expect(back.invoices[0]).toMatchObject({ state: 'issued', confirmedCents: 0, balanceCents: 90_000 })
    expect(
      await t.db.selectFrom('finance.payments').select('id').where('job_id', '=', job.jobId).execute(),
    ).toHaveLength(1)

    // Staff record the verified Square payment once; the same reference again is refused (T60).
    const sq = ref('square')
    const card = await payInvoice('office', f.id, { method: 'square_payment_link', amountCents: 40_000, reference: sq })
    expect(card.statusCode, card.body).toBe(201)
    const dup = await payInvoice('owner', f.id, { method: 'square_payment_link', amountCents: 40_000, reference: sq })
    expect(dup.statusCode).toBe(409)
    expect(codes(dup)).toContain('DUPLICATE_PAYMENT')
    // A check is pending until cleared: it does not reduce the balance.
    await payInvoice('office', f.id, {
      method: 'check',
      amountCents: 20_000,
      reference: ref('check'),
      payerName: 'Synthetic Payer',
    })

    const money = (await finalOf(job.jobId)).money as Money
    tab = await paymentsTab(job.reference, job.customerCookie)
    expect(tab.invoices).toEqual([
      {
        number: f.number,
        kind: 'final',
        state: 'partially_paid',
        totalCents: money.invoicedCents,
        creditsCents: money.creditsCents,
        confirmedCents: money.confirmedCents,
        pendingCents: money.pendingCents,
        balanceCents: money.remainingCents,
        payByCardUrl: 'https://square.link/u/SYNTH087',
      },
    ])
    expect(tab).toMatchObject({ confirmedCents: 62_500, pendingCents: 20_000, balanceCents: money.remainingCents })
    expect(money).toMatchObject({
      creditsCents: 22_500,
      confirmedCents: 40_000,
      pendingCents: 20_000,
      remainingCents: 50_000,
    })
    expect(tab.payments.map((p) => [p.method, p.amountCents, p.state])).toEqual([
      ['cash', 22_500, 'confirmed'],
      ['square_payment_link', 40_000, 'confirmed'],
      ['check', 20_000, 'pending'],
    ])
    // Nothing about who recorded or collected a payment, and no reference, reaches the customer.
    expect(JSON.stringify(tab)).not.toContain(sq)
    expect(JSON.stringify(tab)).not.toMatch(/collector|recordedBy|staff/i)

    // The Owner clears the check, the rest is paid in cash: Paid, and no Pay by Card any more.
    const checkId = ((await finalOf(job.jobId)).payments.find((p) => p.state === 'received') as { id: string }).id
    expect((await staffWrite('owner', 'POST', `/staff/payments/${checkId}/clear`, {})).statusCode).toBe(200)
    await payInvoice('office', f.id, { method: 'cash', amountCents: 30_000 })
    tab = await paymentsTab(job.reference, job.customerCookie)
    expect(tab.invoices[0]).toMatchObject({ state: 'paid', balanceCents: 0, pendingCents: 0, payByCardUrl: null })
    expect(tab.balanceCents).toBe(0)
  })
})

describe('[HH-FIN-11][OWN-DEC-152][FACT-AUTOMATIC-MESSAGES] a receipt for each confirmed recorded payment (TSK-0087)', () => {
  const receipts = (projectId: string) =>
    t.db
      .selectFrom('finance.payment_receipts as r')
      .innerJoin('finance.payments as p', 'p.id', 'r.payment_id')
      .select([
        'r.id',
        'r.number',
        'r.payment_number',
        'r.partial',
        'r.balance_after_cents',
        'r.invoice_id',
        'p.method',
      ])
      .where('r.project_id', '=', projectId)
      .orderBy('r.sequence')
      .execute()
  const receiptMails = (receiptId: string) =>
    t.db
      .selectFrom('platform.message_deliveries')
      .select(['channel', 'state', 'error_code'])
      .where('subject_key', '=', `payment_receipt:${receiptId}`)
      .execute()

  it('[HH-FIN-11][T59][T62] at once for cash and card, for a check only once cleared; partial ones say so; sent once', async () => {
    const job = await scopedJob()
    await drain()
    // A deposit paid before any deposit invoice: its receipt exists, and no message names an invoice it does not have.
    expect((await payDeposit('office', job.jobId, { method: 'cash', amountCents: 22_500 })).statusCode).toBe(201)
    await reviewOutcome(t.db, job.jobId, 'passed')
    const f = (await issue('office', await finalOf(job.jobId))).json<JobInvoices>().final as Invoice
    const cash = await payInvoice('office', f.id, { method: 'cash', amountCents: 30_000 })
    expect(cash.statusCode, cash.body).toBe(201)
    const check = await payInvoice('office', f.id, {
      method: 'check',
      amountCents: 20_000,
      reference: ref('check'),
      payerName: 'Synthetic Payer',
    })
    expect(check.statusCode, check.body).toBe(201)
    // A check that has not cleared has no receipt (never on initiation).
    let rows = await receipts(job.projectId)
    const R = job.projectReference
    expect(rows.map((r) => [r.method, r.number, r.payment_number, r.partial, Number(r.balance_after_cents)])).toEqual([
      ['cash', `${R}-R1`, `${R}-P1`, false, 0],
      ['cash', `${R}-R2`, `${R}-P2`, true, 60_000],
    ])
    expect(rows[0]?.invoice_id).toBeNull()
    expect(rows[1]?.invoice_id).toBe(f.id)
    const receiptEmails = () => fakes.fakeEmail.calls.filter((c) => c.subject.startsWith('HandyHub | Payment Receipt'))
    const before = receiptEmails().length
    await drain()
    await drain()
    // The deposit's receipt names no invoice: nothing is sent for it. The cash payment's receipt sends once, by email.
    expect(await receiptMails(rows[0]?.id as string)).toEqual([])
    expect(await receiptMails(rows[1]?.id as string)).toEqual([{ channel: 'email', state: 'queued', error_code: null }])
    expect(receiptEmails().length).toBe(before + 1)
    const mail = receiptEmails().at(-1)
    expect(mail?.subject).toBe(`HandyHub | Payment Receipt #${R}-R2`)
    expect(mail?.text).toContain(`invoice #${f.number}`)
    expect(mail?.text).toContain(`Payment reference: ${R}-P2`)
    expect(mail?.text).toContain(`https://site.example.test/portal/p/${R}/payments`)

    // The Owner clears the check: its receipt now, still partial ($400.00 remains).
    const checkId = ((await finalOf(job.jobId)).payments.find((p) => p.state === 'received') as { id: string }).id
    expect((await staffWrite('owner', 'POST', `/staff/payments/${checkId}/clear`, {})).statusCode).toBe(200)
    rows = await receipts(job.projectId)
    expect(rows.at(-1)).toMatchObject({ method: 'check', number: `${R}-R3`, partial: true })
    expect(Number(rows.at(-1)?.balance_after_cents)).toBe(40_000)
    // The last payment pays the rest: not partial; the invoice is Paid.
    await payInvoice('office', f.id, { method: 'zelle', amountCents: 40_000, reference: ref('zelle') })
    rows = await receipts(job.projectId)
    expect(rows.at(-1)).toMatchObject({ method: 'zelle', number: `${R}-R4`, partial: false })
    await drain()
    for (const r of rows.slice(1)) expect(await receiptMails(r.id)).toHaveLength(1)

    // The Payments tab names each receipt and says when a payment was partial.
    const tab = await paymentsTab(job.reference, job.customerCookie)
    expect(tab.payments.map((p) => [p.method, p.receipt])).toEqual([
      ['cash', { number: `${R}-R1`, paymentNumber: `${R}-P1`, partial: false, balanceAfterCents: 0 }],
      ['cash', { number: `${R}-R2`, paymentNumber: `${R}-P2`, partial: true, balanceAfterCents: 60_000 }],
      ['check', { number: `${R}-R3`, paymentNumber: `${R}-P3`, partial: true, balanceAfterCents: 40_000 }],
      ['zelle', { number: `${R}-R4`, paymentNumber: `${R}-P4`, partial: false, balanceAfterCents: 0 }],
    ])

    // A receipt is issued once and never changes.
    await expect(
      sql`UPDATE finance.payment_receipts SET partial = false WHERE id = ${rows[1]?.id as string}`.execute(t.db),
    ).rejects.toThrow(/never changed or deleted/)
  })
})

describe('[HH-FIN-11][HH-FIN-12][T62] cash with its collector and receipt; checks pending until cleared (TSK-0088)', () => {
  const payment = (id: string) =>
    t.db.selectFrom('finance.payments').selectAll().where('id', '=', id).executeTakeFirstOrThrow()
  const checkItem = (jobId: string) =>
    t.db
      .selectFrom('ops.queue_items')
      .select(['reason', 'resolved_at', 'resolution'])
      .where('type', '=', 'check_to_clear')
      .where('subject_id', '=', jobId)
      .orderBy('opened_at', 'desc')
      .executeTakeFirst()
  const step = (who: Person, id: string, what: 'deposited' | 'reconcile' | 'clear') =>
    staffWrite(who, 'POST', `/staff/payments/${id}/${what}`, {})

  it('[T62][HH-FIN-11] a cash record holds the collector, time, amount, invoice, memo and receipt; reconciling is separate', async () => {
    const job = await approvedJob([{ kind: 'base', cents: 50_000 }])
    await drain()
    await reviewOutcome(t.db, job.jobId, 'passed')
    const f = (await issue('office', await finalOf(job.jobId))).json<JobInvoices>().final as Invoice
    const cash = await payInvoice('office', f.id, {
      method: 'cash',
      amountCents: 20_000,
      collectorStaffId: ids.worker,
      memo: ' Synthetic: paid at the door ',
    })
    expect(cash.statusCode, cash.body).toBe(201)
    const p = ((cash.json<JobInvoices>().final as Invoice).payments as unknown as Record<string, unknown>[])[0] as {
      id: string
      memo: string
      receiptNumber: string
      canReconcile: boolean
      canMarkDeposited: boolean
    }
    expect(p).toMatchObject({
      memo: 'Synthetic: paid at the door',
      receiptNumber: `${job.projectReference}-R1`,
      canReconcile: true,
      canMarkDeposited: false,
    })
    const row = await payment(p.id)
    expect(row).toMatchObject({ collector_staff_id: ids.worker, recorded_by: ids.office, state: 'recorded' })
    expect(row.created_at).toBeInstanceOf(Date)
    const receipt = await t.db
      .selectFrom('finance.payment_receipts')
      .select(['invoice_id', 'amount_cents'])
      .where('payment_id', '=', p.id)
      .executeTakeFirstOrThrow()
    expect(receipt).toMatchObject({ invoice_id: f.id })
    expect(Number(receipt.amount_cents)).toBe(20_000)

    // Reconciling: the Owner or Office, never for their own collection; it changes no balance.
    for (const who of ['estimator', 'worker'] as const)
      expect((await step(who, p.id, 'reconcile')).statusCode).toBe(403)
    const before = (await finalOf(job.jobId)).money
    const done = await step('office', p.id, 'reconcile')
    expect(done.statusCode, done.body).toBe(200)
    expect((await payment(p.id)).state).toBe('reconciled')
    expect((await finalOf(job.jobId)).money).toEqual(before)
    expect(codes(await step('office', p.id, 'reconcile'))).toContain('PAYMENT_RECONCILED')
    const own = await payInvoice('owner', f.id, { method: 'cash', amountCents: 1_000 })
    const ownId = (own.json<JobInvoices>().final as Invoice).payments.at(-1)?.id as string
    expect((await step('owner', ownId, 'reconcile')).statusCode).toBe(403)
    // The memo, like the rest of a recorded payment, never changes.
    await expect(sql`UPDATE finance.payments SET memo = 'x' WHERE id = ${p.id}`.execute(t.db)).rejects.toThrow(
      /never edited/,
    )
  })

  it('[HH-FIN-12][T62] a check is received, deposited, then cleared by the Owner; pending until then, in the Owner queue', async () => {
    const job = await approvedJob([{ kind: 'base', cents: 50_000 }])
    await drain()
    await reviewOutcome(t.db, job.jobId, 'passed')
    const f = (await issue('office', await finalOf(job.jobId))).json<JobInvoices>().final as Invoice
    const recorded = await payInvoice('office', f.id, {
      method: 'check',
      amountCents: 10_000,
      reference: ref('check'),
      payerName: 'Synthetic Payer',
    })
    expect(recorded.statusCode, recorded.body).toBe(201)
    const id = (recorded.json<JobInvoices>().final as Invoice).payments[0]?.id as string
    expect(await checkItem(job.jobId)).toMatchObject({ reason: 'check_received', resolved_at: null })
    expect((await finalOf(job.jobId)).money).toMatchObject({ confirmedCents: 0, pendingCents: 10_000 })
    // Office collected it: Office never marks its own check deposited; the Estimator and a Worker never do.
    for (const who of ['office', 'estimator', 'worker'] as const)
      expect((await step(who, id, 'deposited')).statusCode, who).toBe(403)
    const deposited = await step('owner', id, 'deposited')
    expect(deposited.statusCode, deposited.body).toBe(200)
    expect(await payment(id)).toMatchObject({ state: 'deposited', deposited_by: ids.owner })
    expect(await checkItem(job.jobId)).toMatchObject({ reason: 'check_deposited', resolved_at: null })
    // Deposited is still pending: it counts toward nothing.
    expect((await finalOf(job.jobId)).money).toMatchObject({ confirmedCents: 0, pendingCents: 10_000 })
    expect(codes(await step('owner', id, 'deposited'))).toContain('CHECK_DEPOSITED')
    expect(codes(await step('owner', id, 'reconcile'))).toContain('CHECK_CLEARS_INSTEAD')
    expect(
      await t.db.selectFrom('finance.payment_receipts').select('id').where('payment_id', '=', id).execute(),
    ).toEqual([])
    // Only the Owner clears it; then it counts, gets its receipt, and the item resolves.
    expect((await step('office', id, 'clear')).statusCode).toBe(403)
    expect((await step('owner', id, 'clear')).statusCode).toBe(200)
    expect((await finalOf(job.jobId)).money).toMatchObject({ confirmedCents: 10_000, pendingCents: 0 })
    expect(await checkItem(job.jobId)).toMatchObject({ resolution: 'cleared' })
    expect(
      await t.db.selectFrom('finance.payment_receipts').select('id').where('payment_id', '=', id).execute(),
    ).toHaveLength(1)
    // The database: a check is deposited only by the Owner or Office, and moves only forward.
    const second = await payInvoice('office', f.id, {
      method: 'check',
      amountCents: 5_000,
      reference: ref('check'),
      payerName: 'Synthetic Payer',
    })
    const id2 = (second.json<JobInvoices>().final as Invoice).payments.at(-1)?.id as string
    await expect(
      sql`UPDATE finance.payments SET state = 'deposited', deposited_by = ${ids.worker}, deposited_at = now(),
          version = version + 1 WHERE id = ${id2}`.execute(t.db),
    ).rejects.toThrow(/Owner or Office marks a check deposited/)
    await expect(
      sql`UPDATE finance.payments SET state = 'received', version = version + 1 WHERE id = ${id}`.execute(t.db),
    ).rejects.toThrow(/not available/)
  })
})
