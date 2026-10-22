// The approval receipt and immutable accepted versions against PostgreSQL 16 (TSK-0058; HH-EST-12, HH-EST-10,
// HH-DATA-03, HH-BASE-06, HH-PORT-10, HH-COM-04, T03, T23, T33, T35, ENT-Document, ENT-Approval, ENT-EstimateVersion,
// ENT-JobScopeSnapshot, FACT-AUTOMATIC-MESSAGES, OWN-DEC-104, OWN-DEC-105, OWN-DEC-126, RULE-NO-INVENTED-FACTS,
// RULE-MONEY-CENTS, RULE-SERVER-AUTHZ). Staff, customers, requests, amounts and names are synthetic
// (RULE-SYNTHETIC-DATA); nothing reaches a real provider.
// No estimate terms version is recorded by the migrations, so approval answers NOT CONFIGURED in every environment
// until the owner's sign-off (OQ-TERMS-OWNER-APPROVAL). To exercise the receipt, these tests record a synthetic
// "approved and attorney-reviewed" terms version in this throwaway test database only; that is a test fixture, never
// a statement that the owner approved anything. No approval.receipt template is released (its wording has no owner
// approval), so every receipt delivery records template_not_configured and nothing is sent.
import { createHash, randomUUID } from 'node:crypto'
import { loadServiceSeed, syncServices, withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import { ESTIMATE_TERMS } from '@handyhub/domain/legal'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import {
  approvalReceiptDocumentAutomation,
  approvalReceiptInput,
  approvalReceiptModel,
  approvalReceiptNoticeAutomation,
  issueApprovalReceipt,
  renderApprovalReceipt,
} from '../../src/modules/estimates/index.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { startCustomerSession } from '../../src/modules/identity/customer-sessions.js'
import { readCodeKey, type CodeKeySettings } from '../../src/modules/identity/index.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import { queueAutomations } from '../../src/modules/queue/index.js'
import { createAutomationRegistry, type Automation } from '../../src/platform/automation.js'
import { loadConfig, recordPolicyVersion, type ConfigKey } from '../../src/platform/config/index.js'
import { createWorker, rerunJob } from '../../src/platform/jobs.js'
import { createProviders } from '../../src/providers/index.js'
import { FakeObjectStorage } from '../../src/providers/r2/index.js'
import { readProviderSettings } from '../../src/providers/settings.js'
import { testConfig } from '../fixtures/env.js'
import { signInWithMfa } from '../fixtures/staff-mfa.js'

const KEY: CodeKeySettings = readCodeKey({
  HANDYHUB_ENV: 'ci',
  CODE_HASH_KEY: ['synthetic', 'approval', 'receipt', 'code', 'key', 'for', 'tests', 'only', '0058'].join('-'),
})
const pw = (n: number) => ['synthetic', 'approval', 'receipt', 'passphrase', String(n)].join(' ')
const PEOPLE = ['owner', 'estimator'] as const
type Person = (typeof PEOPLE)[number]

let t: TestDatabase
let app: FastifyInstance
const storage = new FakeObjectStorage()
const cookies = {} as Record<Person, string>
const csrf = {} as Record<Person, string>
const fakes = (() => {
  const p = createProviders(readProviderSettings({ HANDYHUB_ENV: 'ci' }))
  if (!p.fakes.email || !p.fakes.sms) throw new Error('ci uses the fakes')
  return { email: p.email, sms: p.sms, fakeEmail: p.fakes.email, fakeSms: p.fakes.sms }
})()

/** A synthetic in-effect record of v1.0 for this test database only (see the header). */
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

const fast = (a: Automation, maxAttempts = 3): Automation => ({
  ...a,
  retry: { maxAttempts, baseDelayMs: 1, maxDelayMs: 1 },
})
/** The worker as the server runs this slice: the receipt PDF, its message and the staff queue items. */
const worker = (store: FakeObjectStorage | null = storage, maxAttempts = 3) =>
  createWorker({
    db: t.db,
    registry: createAutomationRegistry([
      ...queueAutomations(),
      fast(approvalReceiptDocumentAutomation(store), maxAttempts),
      fast(
        approvalReceiptNoticeAutomation({
          providers: { email: fakes.email, sms: fakes.sms },
          publicSiteUrl: 'https://site.example.test',
        }),
      ),
    ]),
  })
const tick = () => new Promise((r) => setTimeout(r, 15))
async function drain(store: FakeObjectStorage | null = storage, maxAttempts = 3) {
  const w = worker(store, maxAttempts)
  for (let i = 0; i < 6; i++) {
    await w.runOnce()
    await tick()
  }
}

async function signIn(p: Person): Promise<[string, string]> {
  const res = await signInWithMfa(app, {
    method: 'POST',
    url: '/api/v1/staff/auth/sign-in',
    payload: { email: `${p}-approval-receipt@example.test`, password: pw(1) },
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
    api: { db: t.db, codeKey: KEY, storage },
  })
  const hash = await hashPassword(pw(1))
  await withTx(t.db, async (tx) => {
    for (const p of PEOPLE) {
      const user = await createStaffUser(tx, {
        email: `${p}-approval-receipt@example.test`,
        displayName: `Synthetic ${p}`,
        locale: 'en',
        role: p,
        issuedBy: 'test',
      })
      await setPasswordHash(tx, user.id, hash)
    }
  })
  for (const p of PEOPLE) [cookies[p], csrf[p]] = await signIn(p)
  await setConfig('legal.estimate_terms', V1_IN_EFFECT_FIXTURE)
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
      description: 'Synthetic approval receipt project.',
      answers: [],
      property: {
        street: `${seq} Synthetic Receipt Lane`,
        city: 'Testville',
        state: 'ky',
        zip: '40000',
        propertyType: 'house',
      },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'online',
      contact: {
        fullName: 'Synthetic Receipt Customer',
        email: `approval-receipt-${seq}-${randomUUID().slice(0, 8)}@example.test`,
        phone: '(502) 555-0158',
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

// Over the deposit threshold: base 2 x $12.50 + $1,250.00 = $1,275.00; an optional add-on 3 x $19.99 at position 3.
const OVER = (v: StaffView) => [
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
// At or under the threshold: one base line of $900.00 (no deposit, FACT-DEPOSIT-RULE).
const UNDER = (v: StaffView) => [
  {
    kind: 'base',
    workPackageId: v.workPackages[0]?.id,
    description: 'Synthetic small repair',
    quantity: '1',
    unit: 'job',
    unitPriceCents: 90_000,
  },
]

let client = '2001:db8:58::1'
let nets = 0
async function published(lines: (v: StaffView) => unknown[] = OVER) {
  client = `2001:db8:58:${++nets}::1`
  const p = await readyRequest()
  const created = await staffWrite('estimator', 'POST', `/api/v1/staff/projects/${p.projectId}/estimates`, {})
  expect(created.statusCode).toBe(201)
  const c = created.json<{ number: string; versionId: string }>()
  const v = await staffView(c.versionId)
  const saved = await staffWrite(
    'estimator',
    'PUT',
    `/api/v1/staff/estimate-versions/${c.versionId}/draft`,
    { lines: lines(v), texts: { exclusions: ['Synthetic: moving furniture'], assumptions: ['Synthetic: walls dry'] } },
    v.rowVersion,
  )
  expect(saved.statusCode, saved.body).toBe(200)
  const pub = await staffWrite(
    'estimator',
    'POST',
    `/api/v1/staff/estimate-versions/${c.versionId}/publish`,
    {},
    saved.json<{ rowVersion: number }>().rowVersion,
  )
  expect(pub.statusCode, pub.body).toBe(200)
  return { ...p, number: c.number, versionId: c.versionId }
}
type Published = Awaited<ReturnType<typeof published>>

async function customerCookie(p: Pick<Project, 'contactId' | 'projectId' | 'grantId'>) {
  const s = await withTx(t.db, (tx) =>
    startCustomerSession(tx, {
      contactRef: p.contactId,
      via: 'grant',
      projectIds: [p.projectId],
      verifiedAt: new Date(),
      grantId: p.grantId,
    }),
  )
  return `__Host-hh_customer=${s.token}`
}
const base = (e: { reference: string; number: string }) =>
  `/api/v1/customer/projects/${e.reference}/estimates/${e.number}/versions/1`
const customerGet = (url: string, cookie: string) => app.inject({ method: 'GET', url, headers: { cookie } })
function customerPost(url: string, cookie: string, payload: unknown) {
  return app.inject({
    method: 'POST',
    url,
    payload: payload as object,
    headers: {
      cookie,
      'idempotency-key': key('customer'),
      'x-forwarded-for': client,
      'user-agent': 'SyntheticBrowser/1.0 (test)',
    },
  })
}

type Receipt = { state: string; issuedAt: string | null; byteSize: number | null; url: string | null }
type Detail = {
  status: string
  totalCents: number
  approval: {
    contentDigest: string
    selection: { options: number[]; totalCents: number; deposit: { amountCents: number | null } } | null
    approved: { at: string; options: number[]; totalCents: number; deposit: unknown } | null
    nextStep: string | null
    receipt: Receipt | null
  }
}
const detail = async (e: Published, cookie: string) => {
  const res = await customerGet(base(e), cookie)
  expect(res.statusCode, res.body).toBe(200)
  return res.json<Detail>()
}

/** Selects the given options, then approves them as the page would; answers the approval's JSON. */
async function approve(e: Published, cookie: string, options: number[] = []) {
  if (options.length) expect((await customerPost(`${base(e)}/selection`, cookie, { options })).statusCode).toBe(200)
  const d = await detail(e, cookie)
  const s = d.approval.selection
  const res = await customerPost(`${base(e)}/approve`, cookie, {
    contentDigest: d.approval.contentDigest,
    options: s?.options ?? [],
    totalCents: s?.totalCents ?? d.totalCents,
    depositCents: s?.deposit.amountCents ?? null,
    termsDocumentId: ESTIMATE_TERMS.documentId,
    termsSha256: ESTIMATE_TERMS.contentSha256,
    acceptTerms: true,
    fullName: 'Synthetic Receipt Customer',
  })
  expect(res.statusCode, res.body).toBe(201)
  const approval = await t.db
    .selectFrom('estimating.approvals')
    .selectAll()
    .where('version_id', '=', e.versionId)
    .executeTakeFirstOrThrow()
  return { answer: res.json<{ nextStep: string; approved: { totalCents: number } }>(), approval }
}

const receipts = (approvalId: string) =>
  t.db.selectFrom('estimating.approval_receipts').selectAll().where('approval_id', '=', approvalId).execute()
const deliveries = (approvalId: string) =>
  t.db
    .selectFrom('platform.message_deliveries')
    .select([
      'channel',
      'state',
      'error_code',
      'provider_message_id',
      'subject_key',
      'audience',
      'locale',
      'project_id',
    ])
    .where('message_key', '=', 'approval.receipt')
    .where('record_type', '=', 'estimate_approval')
    .where('record_id', '=', approvalId)
    .orderBy('channel')
    .execute()
const sha256 = (b: Uint8Array) => createHash('sha256').update(b).digest('hex')

/** The database error a statement raises, as text ('' when it succeeds). */
async function refusal(run: () => Promise<unknown>): Promise<string> {
  try {
    await run()
    return ''
  } catch (err) {
    return String((err as Error).message)
  }
}

describe('[HH-EST-12][T33][FACT-AUTOMATIC-MESSAGES] the approval receipt: one PDF, one message per destination, never a fake send', () => {
  it('issues the PDF of the approved estimate and terms once, and records the message as NOT CONFIGURED per channel', async () => {
    const e = await published()
    const cookie = await customerCookie(e)
    const { answer, approval } = await approve(e, cookie, [3])
    // OWN-DEC-105: a required deposit that is not satisfied ($1,334.97 > $1,000.00: 20% = $266.99).
    expect(answer.nextStep).toBe('deposit_due')
    expect(approval).toMatchObject({ total_cents: '133497', deposit_cents: '26699', test_mark: true })

    // Before the worker runs: the receipt is being prepared; the Documents tab says so too.
    const before = await detail(e, cookie)
    expect(before.approval.nextStep).toBe('deposit_due')
    expect(before.approval.receipt).toEqual({ state: 'preparing', issuedAt: null, byteSize: null, url: null })
    const docsBefore = await customerGet(`/api/v1/customer/projects/${e.reference}/documents`, cookie)
    expect(docsBefore.json<{ estimates: { receipt: string | null }[] }>().estimates[0]?.receipt).toBe('preparing')

    const emailsBefore = fakes.fakeEmail.calls.length
    const textsBefore = fakes.fakeSms.calls.length
    await drain()

    // One receipt, stored once, its bytes matching the recorded SHA-256, with the approval's terms and TEST mark.
    const issued = await receipts(approval.id)
    expect(issued).toHaveLength(1)
    const r = issued[0] as (typeof issued)[number]
    expect(r).toMatchObject({
      project_id: e.projectId,
      kind: 'approval_receipt',
      content_type: 'application/pdf',
      terms_document_id: ESTIMATE_TERMS.documentId,
      terms_sha256: ESTIMATE_TERMS.contentSha256,
      test_mark: true,
      renderer_version: 1,
      visibility: 'customer',
    })
    expect(r.object_key).toMatch(/^estimates\/receipts\/[0-9a-f-]{36}$/)
    const { bytes } = await storage.get(r.object_key)
    expect(Buffer.from(bytes).subarray(0, 5).toString('latin1')).toBe('%PDF-')
    expect(bytes.length).toBe(r.byte_size)
    expect(sha256(bytes)).toBe(r.sha256)
    // Deterministic: the same records and configuration render the same bytes.
    const input = await approvalReceiptInput(t.db, approval.id)
    expect(input).not.toBeNull()
    expect(sha256(await renderApprovalReceipt(input as NonNullable<typeof input>))).toBe(r.sha256)

    // What it says: the approved scope and amounts as recorded, the typed name and the full terms, marked TEST.
    const model = approvalReceiptModel(input as NonNullable<typeof input>)
    const text = JSON.stringify(model)
    expect(model.mark).toBe('TEST — not a real invoice or estimate')
    expect(model.title).toBe(`Approval receipt for estimate ${e.number}`)
    for (const s of [
      'Patch the synthetic hole',
      'Paint the synthetic wall',
      'Optional add-on: Synthetic optional trim',
      '$1,334.97',
      '$266.99',
      'Synthetic Receipt Customer',
      'Payment due on receipt',
      ESTIMATE_TERMS.contentSha256,
      approval.content_sha256,
      'Estimate Terms',
      'Synthetic: moving furniture',
    ])
      expect(text).toContain(s)
    // No mailing address is configured, so there is no address line; nothing is invented (FACT-BUSINESS-ADDRESS).
    expect(text).not.toContain('"Address"')
    // TSK-0144 (HH-FIN-04, OWN-DEC-183): once the Owner has entered it, a receipt prints it. A synthetic placeholder here.
    const lines = ['SYNTHETIC-TEST-ADDRESS line one', 'SYNTHETIC-TEST-ADDRESS line two']
    await setConfig('business.mailing_address', { lines })
    try {
      const withAddress = await approvalReceiptInput(t.db, approval.id)
      expect(withAddress?.mailingAddress).toEqual(lines)
      const printed = JSON.stringify(approvalReceiptModel(withAddress as NonNullable<typeof withAddress>))
      expect(printed).toContain('"Address"')
      expect(printed).toContain(lines.join(', '))
    } finally {
      await setConfig('business.mailing_address', null)
    }

    // The customer reads it through verified project access: a short-lived signed link, and Documents says issued.
    const after = await detail(e, cookie)
    expect(after.approval.receipt).toMatchObject({ state: 'issued', byteSize: r.byte_size })
    expect(after.approval.receipt?.url).toMatch(/^https:\/\/fake-r2\.invalid\/estimates\/receipts\//)
    const docs = await customerGet(`/api/v1/customer/projects/${e.reference}/documents`, cookie)
    expect(docs.json<{ estimates: { receipt: string | null }[] }>().estimates[0]?.receipt).toBe('issued')
    // T24: the object key and hash never reach the customer.
    expect(after.approval.receipt).not.toHaveProperty('objectKey')
    expect(JSON.stringify(after)).not.toContain(r.sha256)

    // The message: one delivery per channel, English. TSK-0120: the owner's email wording (link only, OWN-DEC-155) is
    // sent once with its values; texts have no wording (NOT CONFIGURED) and are never sent.
    expect(await deliveries(approval.id)).toEqual([
      {
        channel: 'email',
        state: 'queued',
        error_code: null,
        provider_message_id: expect.stringMatching(/^fake-email-/),
        subject_key: `estimate_approval:${approval.id}`,
        audience: 'customer',
        locale: 'en',
        // TSK-0049: the delivery records its project (its reply address and conversation).
        project_id: e.projectId,
      },
      {
        channel: 'sms',
        state: 'failed',
        error_code: 'template_not_configured',
        provider_message_id: null,
        subject_key: `estimate_approval:${approval.id}`,
        audience: 'customer',
        locale: 'en',
        project_id: e.projectId,
      },
    ])
    expect(fakes.fakeEmail.calls.length).toBe(emailsBefore + 1)
    const confirmation = fakes.fakeEmail.calls.at(-1)
    const number = (
      await t.db
        .selectFrom('estimating.estimates')
        .select('number')
        .where('id', '=', approval.estimate_id)
        .executeTakeFirstOrThrow()
    ).number
    expect(confirmation?.subject).toBe(`HandyHub | Estimate #${number} Approved`)
    expect(confirmation?.text).toContain(`We've received and recorded your approval of estimate #${number}`)
    expect(confirmation?.text).toContain(`https://site.example.test/portal/p/${e.reference}`)
    // Link only: no amount, no attachment (OWN-DEC-155, OWN-DEC-158).
    // The project reference in the link is random and may hold digits of its own, so it is set aside too.
    expect(confirmation?.text.replaceAll(number, '').replaceAll(e.reference, '')).not.toMatch(/\$|\d{3,}/)
    expect(confirmation).not.toHaveProperty('attachments')
    expect(fakes.fakeSms.calls.length).toBe(textsBefore)
    // A delivery failure (the text with no wording) becomes a staff action item; the approval is never undone.
    const items = await t.db
      .selectFrom('ops.queue_items')
      .select(['type', 'reason', 'reference', 'resolved_at'])
      .where('type', '=', 'delivery_failed')
      .where('project_id', '=', e.projectId)
      .execute()
    expect(items).toHaveLength(1)
    expect(items.every((i) => i.reason === 'delivery_not_configured' && i.resolved_at === null)).toBe(true)
    expect(
      (
        await t.db
          .selectFrom('estimating.estimate_versions')
          .select('state')
          .where('id', '=', e.versionId)
          .executeTakeFirstOrThrow()
      ).state,
    ).toBe('accepted')

    // Retries never issue or send a second time: a re-run of every job and a direct second issue change nothing.
    const jobs = await t.db
      .selectFrom('platform.jobs')
      .select(['id'])
      .where('target_id', '=', approval.id)
      .where('automation', 'in', ['approval_receipt.issue', 'notify.approval.receipt'])
      .execute()
    expect(jobs).toHaveLength(2)
    await withTx(t.db, async (tx) => {
      for (const j of jobs) await rerunJob(tx, { jobId: j.id, key: 'synthetic-retry', requestId: 'test:rerun' })
    })
    await drain()
    expect(await withTx(t.db, (tx) => issueApprovalReceipt(tx, storage, approval.id))).toEqual({
      outcome: 'exists',
      receiptId: r.id,
    })
    expect(await receipts(approval.id)).toEqual(issued)
    expect(await deliveries(approval.id)).toHaveLength(2)
    expect(fakes.fakeEmail.calls.length).toBe(emailsBefore + 1)

    // Staff see the receipt and the truthful delivery states on the estimate.
    const lc = await staffGet('estimator', `/api/v1/staff/estimate-versions/${e.versionId}`)
    expect(lc.statusCode, lc.body).toBe(200)
    expect(lc.json<{ lifecycle: { customerApproval: unknown } }>().lifecycle.customerApproval).toMatchObject({
      receipt: { state: 'issued', byteSize: r.byte_size },
      receiptDeliveries: [
        { channel: 'email', state: 'queued', errorCode: null },
        { channel: 'sms', state: 'failed', errorCode: 'template_not_configured' },
      ],
    })
  })

  it('[RULE-NO-INVENTED-FACTS] storage NOT CONFIGURED: nothing is issued, the job fails truthfully, the approval stays', async () => {
    const e = await published(UNDER)
    const cookie = await customerCookie(e)
    const { approval } = await approve(e, cookie)
    await expect(withTx(t.db, (tx) => issueApprovalReceipt(tx, null, approval.id))).rejects.toThrow(
      'storage_not_configured',
    )
    await drain(null, 1)
    expect(await receipts(approval.id)).toEqual([])
    const job = await t.db
      .selectFrom('platform.jobs')
      .select(['state'])
      .where('target_id', '=', approval.id)
      .where('automation', '=', 'approval_receipt.issue')
      .executeTakeFirstOrThrow()
    expect(job.state).toBe('failed')
    const d = await detail(e, cookie)
    expect(d.status).toBe('approved')
    expect(d.approval.receipt).toEqual({ state: 'preparing', issuedAt: null, byteSize: null, url: null })
  })
})

describe('[HH-EST-12][OWN-DEC-105][T23] the next step after approval follows the deposit', () => {
  it('no deposit at or under the threshold: "choose your work appointment"; a required deposit: "pay your deposit"', async () => {
    const small = await published(UNDER)
    const smallCookie = await customerCookie(small)
    const { answer, approval } = await approve(small, smallCookie)
    expect(approval).toMatchObject({ total_cents: '90000', deposit_state: 'not_required', deposit_cents: null })
    expect(answer.nextStep).toBe('choose_work_appointment')
    expect((await detail(small, smallCookie)).approval.nextStep).toBe('choose_work_appointment')
    const o1 = await customerGet(`/api/v1/customer/projects/${small.reference}/overview`, smallCookie)
    expect(o1.json<{ status: unknown }>().status).toMatchObject({
      situation: 'approved',
      step: 'choose_work_appointment',
      // HandyHub offers the work windows next (HH-SCH-11); nothing is offered yet.
      waitingOn: 'handyhub',
      nextAction: 'none',
    })

    const large = await published()
    const largeCookie = await customerCookie(large)
    await approve(large, largeCookie)
    const o2 = await customerGet(`/api/v1/customer/projects/${large.reference}/overview`, largeCookie)
    expect(o2.json<{ status: unknown }>().status).toMatchObject({
      situation: 'approved',
      step: 'deposit_due',
      waitingOn: 'customer',
      nextAction: 'pay_deposit',
    })
    // T19: another project's session sees nothing of it.
    const other = await customerGet(base(large), smallCookie)
    expect(other.statusCode).toBe(404)
  })
})

describe('[HH-DATA-03][HH-BASE-06][ENT-Document] accepted versions and issued evidence never change', () => {
  it('an update of an accepted line fails; the accepted version, approval, snapshot and receipt refuse every edit', async () => {
    const e = await published()
    const cookie = await customerCookie(e)
    const { approval } = await approve(e, cookie, [3])
    await drain()
    const [receipt] = await receipts(approval.id)
    expect(receipt).toBeDefined()
    const line = await t.db
      .selectFrom('estimating.estimate_lines')
      .select(['id'])
      .where('version_id', '=', e.versionId)
      .where('position', '=', 1)
      .executeTakeFirstOrThrow()

    // The accepted lines: no price, description or quantity change, no new line and no removal.
    const updateLine = await refusal(() =>
      t.db
        .updateTable('estimating.estimate_lines')
        .set({ description: 'Synthetic: edited after approval' })
        .where('id', '=', line.id)
        .execute(),
    )
    expect(updateLine).toContain('immutable')
    expect(
      await refusal(() => t.db.deleteFrom('estimating.estimate_lines').where('id', '=', line.id).execute()),
    ).toContain('immutable')

    // The accepted version itself: no total, state or bookkeeping change (ACCEPTED_VERSION_IMMUTABLE).
    for (const set of [
      sql`total_cents = total_cents + 1`,
      sql`row_version = row_version + 1`,
      sql`state_changed_at = now()`,
      sql`first_viewed_at = now()`,
      sql`state = 'superseded'`,
    ])
      expect(
        await refusal(() =>
          sql`UPDATE estimating.estimate_versions SET ${set} WHERE id = ${e.versionId}`.execute(t.db),
        ),
      ).toMatch(/immutable|ESTIMATE_VERSION_TRANSITION|ACCEPTED_VERSION_IMMUTABLE/)
    expect(
      await refusal(() =>
        sql`UPDATE estimating.estimate_versions SET row_version = row_version + 1 WHERE id = ${e.versionId}`.execute(
          t.db,
        ),
      ),
    ).toContain('ACCEPTED_VERSION_IMMUTABLE')

    // The evidence: approvals, snapshots and the issued receipt refuse UPDATE, DELETE and TRUNCATE.
    expect(
      await refusal(() =>
        t.db
          .updateTable('estimating.approval_receipts')
          .set({ byte_size: 1 })
          .where('id', '=', (receipt as { id: string }).id)
          .execute(),
      ),
    ).toContain('ISSUED_DOCUMENT_IMMUTABLE')
    expect(
      await refusal(() =>
        t.db
          .deleteFrom('estimating.approval_receipts')
          .where('id', '=', (receipt as { id: string }).id)
          .execute(),
      ),
    ).toContain('ISSUED_DOCUMENT_IMMUTABLE')
    for (const table of [
      'estimating.approval_receipts',
      'estimating.approvals',
      'work.job_scope_snapshots',
      'work.jobs',
      'estimating.estimate_versions',
      'estimating.estimate_lines',
    ])
      expect(await refusal(() => sql.raw(`TRUNCATE ${table} CASCADE`).execute(t.db)), table).toContain('APPEND_ONLY')
    // A receipt never names other terms or another TEST mark than its approval's.
    expect(
      await refusal(() =>
        t.db
          .insertInto('estimating.approval_receipts')
          .values({
            approval_id: approval.id,
            project_id: e.projectId,
            object_key: 'estimates/receipts/synthetic-other',
            content_type: 'application/pdf',
            byte_size: 10,
            sha256: 'a'.repeat(64),
            terms_document_id: ESTIMATE_TERMS.documentId,
            terms_sha256: ESTIMATE_TERMS.contentSha256,
            test_mark: false,
            renderer_version: 1,
          })
          .execute(),
      ),
    ).toContain('names its approval')
    expect(await receipts(approval.id)).toHaveLength(1)
  })
})

describe('[HH-EST-10][T35][T03] later price, policy and catalog changes never recalculate accepted work', () => {
  it('a new deposit rule, discount rule and service content leave the version, approval, snapshot and receipt unchanged', async () => {
    const e = await published()
    const cookie = await customerCookie(e)
    const { approval } = await approve(e, cookie, [3])
    await drain()
    const snapshotOf = () =>
      t.db
        .selectFrom('work.job_scope_snapshots as s')
        .innerJoin('work.jobs as j', 'j.id', 's.job_id')
        .selectAll('s')
        .where('j.approval_id', '=', approval.id)
        .execute()
    const versionOf = () =>
      t.db
        .selectFrom('estimating.estimate_versions')
        .selectAll()
        .where('id', '=', e.versionId)
        .executeTakeFirstOrThrow()
    const linesOf = () =>
      t.db
        .selectFrom('estimating.estimate_lines')
        .selectAll()
        .where('version_id', '=', e.versionId)
        .orderBy('position')
        .execute()
    const approvalOf = () =>
      t.db.selectFrom('estimating.approvals').selectAll().where('id', '=', approval.id).executeTakeFirstOrThrow()
    const before = {
      version: await versionOf(),
      lines: await linesOf(),
      approval: await approvalOf(),
      snapshot: await snapshotOf(),
      receipt: await receipts(approval.id),
      view: (await detail(e, cookie)).approval.approved,
    }
    expect(before.receipt).toHaveLength(1)

    // Staff change the policies and the service content afterwards (synthetic values, this database only).
    const config = await loadConfig(t.db)
    const deposit = config.get('deposit.rule')
    const discount = config.get('discount.rule')
    if (deposit.state !== 'CONFIGURED' || discount.state !== 'CONFIGURED') throw new Error('seeded policies expected')
    await setConfig('deposit.rule', { ...deposit.value, thresholdCents: 1, percentBps: 5000 })
    await setConfig('discount.rule', { ...discount.value, percentBps: 2500 })
    const seed = loadServiceSeed()
    await syncServices(
      t.db,
      seed.map((s) => (s.id === 'SVC-PT-01' ? { ...s, name: `${s.name} (synthetic later edit)` } : s)),
    )
    await drain()

    expect(await versionOf()).toEqual(before.version)
    expect(await linesOf()).toEqual(before.lines)
    expect(await approvalOf()).toEqual(before.approval)
    expect(await snapshotOf()).toEqual(before.snapshot)
    expect(await receipts(approval.id)).toEqual(before.receipt)
    const stored = await storage.get((before.receipt[0] as { object_key: string }).object_key)
    expect(sha256(stored.bytes)).toBe((before.receipt[0] as { sha256: string }).sha256)
    // The customer still sees the accepted totals, and the deposit due is the approved one, not a recomputed one.
    const after = await detail(e, cookie)
    expect(after.approval.approved).toEqual(before.view)
    expect(after.approval.approved).toMatchObject({ totalCents: 133_497, deposit: { amountCents: 26_699 } })
    expect(after.approval.nextStep).toBe('deposit_due')

    // T35: editing the accepted scope is refused, and so is a revision of the accepted estimate.
    const v = await staffView(e.versionId)
    const edit = await staffWrite(
      'estimator',
      'PUT',
      `/api/v1/staff/estimate-versions/${e.versionId}/draft`,
      { lines: OVER(v), texts: {} },
      v.rowVersion,
    )
    expect(edit.statusCode).toBe(409)
    const revise = await staffWrite('estimator', 'POST', `/api/v1/staff/estimate-versions/${e.versionId}/revise`, {})
    expect(revise.statusCode).toBe(409)
    // The approved project is past estimating: accepted work changes only through a change order (HH-CHG-02).
    expect(revise.json()).toMatchObject({ error: { fieldErrors: [{ field: 'project', code: 'PROJECT_NOT_OPEN' }] } })
    expect(await versionOf()).toEqual(before.version)
    // The new policies are restored for the other tests of this file.
    await setConfig('deposit.rule', deposit.value)
    await setConfig('discount.rule', discount.value)
    await syncServices(t.db, seed)
  })
})
