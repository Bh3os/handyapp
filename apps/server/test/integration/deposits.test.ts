// The deposit requirement, the work-scheduling gate and the owner-only waiver against PostgreSQL 16 (TSK-0059;
// HH-FIN-02, HH-SCH-06, HH-SCH-05, HH-FIN-03, HH-FIN-07, HH-FIN-09, HH-FIN-12, T36, T59, T64, ENT-DepositRequirement,
// ENT-Payment, ENT-PaymentAllocation, FACT-DEPOSIT-RULE, FACT-PAYMENT-METHODS, INT-Square, OWN-DEC-76, OWN-DEC-104,
// OWN-DEC-119, OWN-DEC-138, RULE-MONEY-CENTS, RULE-SERVER-AUTHZ, RULE-SAFETY-GATES). Staff, customers, requests,
// amounts, references and links are synthetic (RULE-SYNTHETIC-DATA); nothing reaches Square or any provider.
// Approvals need an estimate terms version in effect, which no migration records (OQ-TERMS-OWNER-APPROVAL): this file
// records a synthetic "approved and attorney-reviewed" terms version in its own throwaway database only, a test
// fixture and never a statement that the owner approved anything, and restores NOT CONFIGURED at the end.
import { randomUUID } from 'node:crypto'
import { loadServiceSeed, syncServices, withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import { addLocalDays, localDateOf } from '@handyhub/domain'
import { ESTIMATE_TERMS } from '@handyhub/domain/legal'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { startCustomerSession } from '../../src/modules/identity/customer-sessions.js'
import { readCodeKey, type CodeKeySettings } from '../../src/modules/identity/index.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import {
  confirmationDepositGate,
  depositQueueAutomation,
  requireConfirmationDepositGate,
} from '../../src/modules/finance/index.js'
import { squareLinkProblem } from '../../src/modules/finance/deposits.js'
import { approvalFacts } from '../../src/modules/estimates/receipt.js'
import { apiModules } from '../../src/modules/index.js'
import { DEPOSIT_GATE, visitsModule, WORK_VISIT_GATES } from '../../src/modules/visits/index.js'
import { loadConfig, recordPolicyVersion, type ConfigKey } from '../../src/platform/config/index.js'
import { FakeObjectStorage } from '../../src/providers/r2/index.js'
import { verifyCountyOf } from '../fixtures/county.js'
import { testConfig } from '../fixtures/env.js'
import { verifyPropertyZone } from '../fixtures/zones.js'
import { signInWithMfa, TEST_MFA_KEY } from '../fixtures/staff-mfa.js'

const KEY: CodeKeySettings = readCodeKey({
  HANDYHUB_ENV: 'ci',
  CODE_HASH_KEY: ['synthetic', 'deposit', 'code', 'key', 'for', 'tests', 'only', '0059'].join('-'),
})
const pw = (n: number) => ['synthetic', 'deposit', 'gate', 'passphrase', String(n)].join(' ')
// "admin": another administrator (Office and Estimator roles), never the Owner (OWN-DEC-76).
const PEOPLE = ['owner', 'office', 'estimator', 'admin', 'worker'] as const
type Person = (typeof PEOPLE)[number]
const ROLE: Record<Person, 'owner' | 'office' | 'estimator' | 'worker'> = {
  owner: 'owner',
  office: 'office',
  estimator: 'estimator',
  admin: 'office',
  worker: 'worker',
}

let t: TestDatabase
let app: FastifyInstance
const cookies = {} as Record<Person, string>
const csrf = {} as Record<Person, string>
const ids = {} as Record<Person, string>
/** A second Owner session whose last sign-in is not fresh (aged in the database below). */
let staleOwner: [string, string]

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

const email = (p: Person) => `${p}-deposit-gate@example.test`
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
    api: { db: t.db, codeKey: KEY, storage: new FakeObjectStorage() },
  })
  const hash = await hashPassword(pw(1))
  await withTx(t.db, async (tx) => {
    for (const p of PEOPLE) {
      const user = await createStaffUser(tx, {
        email: email(p),
        displayName: `Synthetic ${p}`,
        locale: 'en',
        role: ROLE[p],
        issuedBy: 'test',
      })
      await setPasswordHash(tx, user.id, hash)
      ids[p] = user.id
    }
    await tx
      .insertInto('identity.role_grants')
      .values([
        { staff_user_id: ids.admin, kind: 'role', name: 'estimator', issued_by: 'test' },
        { staff_user_id: ids.worker, kind: 'capability', name: 'collect', issued_by: 'test' },
      ])
      .execute()
  })
  for (const p of PEOPLE) [cookies[p], csrf[p]] = await signIn(p)
  staleOwner = await signIn('owner')
  await sql`UPDATE identity.staff_sessions SET authenticated_at = now() - interval '30 minutes'
            WHERE id = (SELECT id FROM identity.staff_sessions WHERE staff_user_id = ${ids.owner}
                        ORDER BY created_at DESC LIMIT 1)`.execute(t.db)
  await setConfig('legal.estimate_terms', V1_IN_EFFECT_FIXTURE)
})
afterAll(async () => {
  // Restore NOT CONFIGURED: the synthetic terms record never outlives this file.
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
  who: Person | [string, string],
  method: 'POST' | 'PUT',
  url: string,
  payload: unknown,
  extra: Record<string, string> = {},
) {
  const [cookie, token] = typeof who === 'string' ? [cookies[who], csrf[who]] : who
  return app.inject({
    method,
    url,
    payload: payload as object,
    headers: { cookie, 'x-csrf-token': token, 'idempotency-key': key('staff'), ...extra },
  })
}
const staffGet = (who: Person, url: string) => app.inject({ method: 'GET', url, headers: { cookie: cookies[who] } })

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
      description: 'Synthetic deposit gate project.',
      answers: [],
      property: {
        street: `${seq} Synthetic Deposit Lane`,
        city: 'Testville',
        state: 'ky',
        zip: '40000',
        propertyType: 'house',
      },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'online',
      contact: {
        fullName: 'Synthetic Deposit Customer',
        email: `deposit-gate-${seq}-${randomUUID().slice(0, 8)}@example.test`,
        phone: '(502) 555-0159',
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
  // TSK-0127: staff's address and county check, which a first confirmation needs.
  await verifyCountyOf(t.db, row.project_id)
  const grant = await t.db
    .selectFrom('identity.project_access_grants')
    .select('id')
    .where('request_id', '=', row.id)
    .executeTakeFirstOrThrow()
  const q = await staffWrite(
    'owner',
    'PUT',
    `/api/v1/staff/requests/${row.id}/qualification`,
    { checks: ALL_OK },
    {
      'if-match': '"0"',
    },
  )
  expect(q.statusCode, q.body).toBe(200)
  const moved = await staffWrite(
    'owner',
    'POST',
    `/api/v1/staff/requests/${row.id}/actions/online-estimate`,
    { workPackages: ['SVC-DW-01', 'SVC-PT-01'] },
    { 'if-match': `"${row.state_version}"` },
  )
  expect(moved.statusCode, moved.body).toBe(200)
  // TSK-0123: the property's zone is unknown until verified; these tests plan visits, so it is verified first.
  await verifyPropertyZone(t.db, { projectId: row.project_id })
  return { projectId: row.project_id, reference, contactId: row.contact_id, grantId: grant.id }
}

type Line = { kind: 'base' | 'add_on'; cents: number }
let client = '2001:db8:59::1'
let nets = 0

/**
 * An approved job: an estimate with these lines (one unit each) published by the estimator, then approved by its
 * verified customer with the given options selected (positions of add-on lines, from 1).
 */
async function approvedJob(lines: Line[], options: number[] = []) {
  client = `2001:db8:59:${++nets}::1`
  const p = await readyRequest()
  const created = await staffWrite('estimator', 'POST', `/api/v1/staff/projects/${p.projectId}/estimates`, {})
  expect(created.statusCode, created.body).toBe(201)
  const c = created.json<{ number: string; versionId: string }>()
  const view = (await staffGet('estimator', `/api/v1/staff/estimate-versions/${c.versionId}`)).json<{
    rowVersion: number
    workPackages: { id: string }[]
  }>()
  const saved = await staffWrite(
    'estimator',
    'PUT',
    `/api/v1/staff/estimate-versions/${c.versionId}/draft`,
    {
      lines: lines.map((l, i) => ({
        kind: l.kind,
        workPackageId: view.workPackages[i % 2]?.id,
        description: `Synthetic deposit line ${i + 1}`,
        quantity: '1',
        unit: 'job',
        unitPriceCents: l.cents,
      })),
      texts: { exclusions: ['Synthetic: nothing else'] },
    },
    { 'if-match': `"${view.rowVersion}"` },
  )
  expect(saved.statusCode, saved.body).toBe(200)
  const pub = await staffWrite(
    'estimator',
    'POST',
    `/api/v1/staff/estimate-versions/${c.versionId}/publish`,
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
    fullName: 'Synthetic Deposit Customer',
  })
  expect(approved.statusCode, approved.body).toBe(201)
  const job = await t.db
    .selectFrom('work.jobs')
    .select(['id', 'approval_id'])
    .where('project_id', '=', p.projectId)
    .executeTakeFirstOrThrow()
  return { ...p, jobId: job.id, approvalId: job.approval_id, customerCookie: cookie }
}

type DepositView = {
  required: boolean
  state: string
  amountCents: number | null
  baseTotalCents: number
  verifiedCents: number
  pendingCents: number
  remainingCents: number | null
  workScheduling: string
  version: number
  waiver: { by: { id: string }; reason: string } | null
  paymentLink: { url: string } | null
  payments: {
    id: string
    state: string
    appliedCents: number
    unappliedCents: number
    verified: boolean
    canMarkCleared: boolean
  }[]
  actions: { enterPaymentLink: boolean; recordPayment: boolean; waive: boolean }
}
const deposit = async (jobId: string, who: Person = 'office') => {
  const res = await staffGet(who, `/api/v1/staff/jobs/${jobId}/deposit`)
  expect(res.statusCode, res.body).toBe(200)
  return res.json<DepositView>()
}
const gate = (jobId: string) => withTx(t.db, (tx) => confirmationDepositGate(tx, { kind: 'work', jobId }))
const pay = (who: Person, jobId: string, body: Record<string, unknown>) =>
  staffWrite(who, 'POST', `/api/v1/staff/jobs/${jobId}/deposit/payments`, {
    // The business date (migration 0005's zone), as the server's IN_FUTURE check reads it, not the UTC date.
    receivedOn: localDateOf(new Date(), 'America/Kentucky/Louisville'),
    ...body,
  })
// Synthetic, clearly fake transaction references, built from parts.
const ref = (what: string) => ['SYNTH', what, String(++seq), randomUUID().slice(0, 8)].join('-')
const today = () => localDateOf(new Date(), 'America/Kentucky/Louisville')

describe('[HH-FIN-02][T36][FACT-DEPOSIT-RULE][RULE-MONEY-CENTS] the deposit applies only under the rule, pinned at approval', () => {
  it('no deposit at exactly $1,000.00; 20% half-up just above it; over the threshold only because of a selected option', async () => {
    const at = await approvedJob([{ kind: 'base', cents: 100_000 }])
    expect(await deposit(at.jobId)).toMatchObject({
      required: false,
      state: 'not_required',
      amountCents: null,
      baseTotalCents: 100_000,
      remainingCents: null,
      workScheduling: 'open',
      actions: { enterPaymentLink: false, recordPayment: false, waive: false },
    })
    expect(await gate(at.jobId)).toEqual({ open: true, basis: 'not_required' })

    // $1,000.01: 20% = $200.002 -> $200.00.
    const above = await approvedJob([{ kind: 'base', cents: 100_001 }])
    expect(await deposit(above.jobId)).toMatchObject({
      required: true,
      state: 'required',
      amountCents: 20_000,
      baseTotalCents: 100_001,
      verifiedCents: 0,
      pendingCents: 0,
      remainingCents: 20_000,
      workScheduling: 'blocked',
    })
    expect(await gate(above.jobId)).toEqual({ open: false, code: 'DEPOSIT_REQUIRED' })

    // Half-up: $1,000.03 -> 20% = $200.006 -> $200.01.
    const halfUp = await approvedJob([{ kind: 'base', cents: 100_003 }])
    expect((await deposit(halfUp.jobId)).amountCents).toBe(20_001)

    // Base $990.00 alone needs none; with the $20.00 option selected the approved total is $1,010.00 -> $202.00.
    const base = await approvedJob([
      { kind: 'base', cents: 99_000 },
      { kind: 'add_on', cents: 2_000 },
    ])
    expect((await deposit(base.jobId)).state).toBe('not_required')
    const option = await approvedJob(
      [
        { kind: 'base', cents: 99_000 },
        { kind: 'add_on', cents: 2_000 },
      ],
      [2],
    )
    expect(await deposit(option.jobId)).toMatchObject({
      required: true,
      amountCents: 20_200,
      baseTotalCents: 101_000,
    })

    // The requirement is the approval's own pinned deposit (rule version and amount), one per job.
    const r = await t.db
      .selectFrom('finance.deposit_requirements as r')
      .innerJoin('estimating.approvals as a', 'a.id', 'r.approval_id')
      .select(['r.amount_cents', 'a.deposit_cents', 'r.rule_version', 'a.deposit_rule_version'])
      .where('r.job_id', '=', option.jobId)
      .executeTakeFirstOrThrow()
    expect(r.amount_cents).toBe(r.deposit_cents)
    expect(r.rule_version).toBe(r.deposit_rule_version)
  })
})

describe('[HH-SCH-06][HH-FIN-12][T36][T64] work-visit confirmation waits for verified money; an uncleared check never satisfies it', () => {
  it('estimate visits are never blocked; a received check stays pending; only an Owner who did not collect it clears it', async () => {
    const job = await approvedJob([{ kind: 'base', cents: 150_000 }]) // deposit $300.00
    await withTx(t.db, async (tx) => {
      expect(await confirmationDepositGate(tx, { kind: 'estimate' })).toEqual({ open: true, basis: 'estimate_visit' })
      await expect(requireConfirmationDepositGate(tx, { kind: 'work', jobId: job.jobId })).rejects.toMatchObject({
        code: 'CONFLICT',
        options: { fieldErrors: [{ field: 'deposit', code: 'DEPOSIT_REQUIRED' }] },
      })
    })
    // The gate runs only inside the confirming transaction (its share lock).
    await expect(confirmationDepositGate(t.db as never, { kind: 'work', jobId: job.jobId })).rejects.toThrow(
      /inside the confirming transaction/,
    )

    // Office records the check the Owner collected on site: received, pending, applied but not verified.
    const check = await pay('office', job.jobId, {
      method: 'check',
      amountCents: 30_000,
      reference: ref('CHECK'),
      payerName: 'Synthetic Payer',
      collectorStaffId: ids.owner,
    })
    expect(check.statusCode, check.body).toBe(201)
    const pending = check.json<DepositView>()
    expect(pending).toMatchObject({
      state: 'required',
      verifiedCents: 0,
      pendingCents: 30_000,
      workScheduling: 'blocked',
    })
    expect(pending.payments).toMatchObject([{ state: 'received', verified: false, appliedCents: 30_000 }])
    expect(await gate(job.jobId)).toEqual({ open: false, code: 'DEPOSIT_REQUIRED' })
    const paymentId = pending.payments[0]?.id as string

    // T64: Office may record the payment, never mark the check cleared (OWN-DEC-138); nor the Estimator or Worker.
    for (const who of ['office', 'admin', 'estimator', 'worker'] as const)
      expect((await staffWrite(who, 'POST', `/api/v1/staff/payments/${paymentId}/clear`, {})).statusCode).toBe(403)
    // The Owner collected this check: they never clear it themselves (FACT-PAYMENT-METHODS).
    expect((await staffWrite('owner', 'POST', `/api/v1/staff/payments/${paymentId}/clear`, {})).statusCode).toBe(403)
    expect((await deposit(job.jobId, 'owner')).payments[0]?.canMarkCleared).toBe(false)

    // A check the Office collected: the Owner clears it, and only then does the deposit count it.
    const job2 = await approvedJob([{ kind: 'base', cents: 150_000 }])
    const check2 = (
      await pay('office', job2.jobId, {
        method: 'check',
        amountCents: 30_000,
        reference: ref('CHECK'),
        payerName: 'Synthetic Payer',
      })
    ).json<DepositView>()
    const id2 = check2.payments[0]?.id as string
    expect((await deposit(job2.jobId, 'owner')).payments[0]?.canMarkCleared).toBe(true)
    const cleared = await staffWrite('owner', 'POST', `/api/v1/staff/payments/${id2}/clear`, {})
    expect(cleared.statusCode, cleared.body).toBe(200)
    expect(cleared.json<DepositView>()).toMatchObject({
      state: 'satisfied',
      verifiedCents: 30_000,
      pendingCents: 0,
      remainingCents: 0,
      workScheduling: 'open',
    })
    expect(await gate(job2.jobId)).toEqual({ open: true, basis: 'satisfied' })
    // Cleared once: a second clear is a conflict.
    const again = await staffWrite('owner', 'POST', `/api/v1/staff/payments/${id2}/clear`, {})
    expect(again.statusCode).toBe(409)
    expect(again.json()).toMatchObject({ error: { fieldErrors: [{ field: 'payment', code: 'CHECK_CLEARED' }] } })
    const audit = await t.db
      .selectFrom('platform.audit_events')
      .select(['action', 'actor_id', 'result'])
      .where('target_id', '=', id2)
      .orderBy('seq')
      .execute()
    expect(audit).toEqual([
      { action: 'payment.record', actor_id: ids.office, result: 'succeeded' },
      { action: 'check.mark_cleared', actor_id: ids.owner, result: 'succeeded' },
    ])
  })

  it('[HH-FIN-09][INT-Square] a verified card payment satisfies it at once; the same method and reference twice is refused', async () => {
    const job = await approvedJob([{ kind: 'base', cents: 125_000 }]) // deposit $250.00
    const reference = ref('SQPAY')
    // A card payment names its Square payment ID; without it nothing is recorded.
    const noRef = await pay('office', job.jobId, { method: 'square_payment_link', amountCents: 25_000 })
    expect(noRef.statusCode).toBe(400)
    expect(noRef.json()).toMatchObject({ error: { fieldErrors: [{ field: 'body.reference', code: 'required' }] } })
    const card = await pay('office', job.jobId, { method: 'square_payment_link', amountCents: 25_000, reference })
    expect(card.statusCode, card.body).toBe(201)
    expect(card.json<DepositView>()).toMatchObject({
      state: 'satisfied',
      verifiedCents: 25_000,
      workScheduling: 'open',
      actions: { recordPayment: false, waive: false },
    })
    expect(await gate(job.jobId)).toEqual({ open: true, basis: 'satisfied' })

    const other = await approvedJob([{ kind: 'base', cents: 125_000 }])
    const dup = await pay('office', other.jobId, { method: 'square_payment_link', amountCents: 25_000, reference })
    expect(dup.statusCode).toBe(409)
    expect(dup.json()).toMatchObject({
      error: { fieldErrors: [{ field: 'body.reference', code: 'DUPLICATE_PAYMENT' }] },
    })
    expect((await deposit(other.jobId)).payments).toEqual([])

    // Paid in full: a further payment is not a deposit payment.
    const more = await pay('office', job.jobId, { method: 'cash', amountCents: 100 })
    expect(more.statusCode).toBe(409)
    expect(more.json()).toMatchObject({ error: { fieldErrors: [{ code: 'DEPOSIT_SATISFIED' }] } })
  })

  it('[HH-FIN-07][T59] partial and overpayment: never over-applied, remainder unapplied; concurrent payments never double-credit', async () => {
    const job = await approvedJob([{ kind: 'base', cents: 200_000 }]) // deposit $400.00
    const partial = await pay('office', job.jobId, { method: 'cash', amountCents: 10_000 })
    expect(partial.json<DepositView>()).toMatchObject({
      state: 'partly_satisfied',
      verifiedCents: 10_000,
      remainingCents: 30_000,
      workScheduling: 'blocked',
    })
    expect(await gate(job.jobId)).toEqual({ open: false, code: 'DEPOSIT_REQUIRED' })
    const over = await pay('office', job.jobId, { method: 'zelle', amountCents: 50_000 })
    expect(over.statusCode, over.body).toBe(201)
    const v = over.json<DepositView>()
    expect(v).toMatchObject({ state: 'satisfied', verifiedCents: 40_000, remainingCents: 0 })
    expect(v.payments.map((p) => [p.appliedCents, p.unappliedCents])).toEqual([
      [10_000, 0],
      [30_000, 20_000],
    ])

    // Two payments of the whole deposit at the same moment: one is applied, the other refused; never $800.00.
    const race = await approvedJob([{ kind: 'base', cents: 200_000 }])
    const both = await Promise.all([
      pay('office', race.jobId, { method: 'cash', amountCents: 40_000 }),
      pay('owner', race.jobId, { method: 'cash_app', amountCents: 40_000 }),
    ])
    expect(both.map((r) => r.statusCode).sort()).toEqual([201, 409])
    const after = await deposit(race.jobId)
    expect(after).toMatchObject({ state: 'satisfied', verifiedCents: 40_000 })
    expect(after.payments).toHaveLength(1)
  })

  it('[HH-FIN-03][T64] payment recording is the Owner, Office or a collector on an assigned job only; dates are never in the future', async () => {
    const job = await approvedJob([{ kind: 'base', cents: 110_000 }])
    expect((await pay('estimator', job.jobId, { method: 'cash', amountCents: 100 })).statusCode).toBe(403)
    // The Worker holds the collect capability but is assigned to no visit of this job (no visit exists yet).
    expect((await pay('worker', job.jobId, { method: 'cash', amountCents: 100 })).statusCode).toBe(403)
    expect((await staffGet('estimator', `/api/v1/staff/jobs/${job.jobId}/deposit`)).statusCode).toBe(403)
    expect((await staffGet('worker', `/api/v1/staff/jobs/${job.jobId}/deposit`)).statusCode).toBe(403)
    const future = await pay('office', job.jobId, { method: 'cash', amountCents: 100, receivedOn: '2999-01-01' })
    expect(future.statusCode).toBe(400)
    expect(future.json()).toMatchObject({ error: { fieldErrors: [{ field: 'body.receivedOn', code: 'IN_FUTURE' }] } })
    const checkNoPayer = await pay('office', job.jobId, { method: 'check', amountCents: 100, reference: ref('CHK') })
    expect(checkNoPayer.json()).toMatchObject({
      error: { fieldErrors: [{ field: 'body.payerName', code: 'required' }] },
    })
    const notRequired = await approvedJob([{ kind: 'base', cents: 90_000 }])
    const none = await pay('office', notRequired.jobId, { method: 'cash', amountCents: 100 })
    expect(none.statusCode).toBe(409)
    expect(none.json()).toMatchObject({ error: { fieldErrors: [{ code: 'DEPOSIT_NOT_REQUIRED' }] } })
    expect((await staffGet('office', `/api/v1/staff/jobs/${randomUUID()}/deposit`)).statusCode).toBe(404)
  })
})

describe('[OWN-DEC-76][HH-FIN-02][T36][T64] only the Owner waives, with a fresh sign-in and a reason; a waiver never marks it paid', () => {
  it('Office, another administrator, the Estimator and the Worker are refused; the Owner needs a fresh sign-in and a reason', async () => {
    const job = await approvedJob([{ kind: 'base', cents: 180_000 }]) // deposit $360.00
    const url = `/api/v1/staff/jobs/${job.jobId}/deposit/waiver`
    const reason = { reason: 'Synthetic: returning customer the owner trusts' }
    for (const who of ['office', 'admin', 'estimator', 'worker'] as const) {
      const res = await staffWrite(who, 'POST', url, reason)
      expect(res.statusCode, `${who} ${res.body}`).toBe(403)
      expect(res.json()).toMatchObject({ error: { code: 'FORBIDDEN' } })
    }
    expect((await deposit(job.jobId, 'office')).actions.waive).toBe(false)
    expect((await deposit(job.jobId, 'owner')).actions.waive).toBe(true)

    // The Owner without a fresh sign-in, and with no reason.
    const stale = await staffWrite(staleOwner, 'POST', url, reason)
    expect(stale.statusCode).toBe(403)
    expect(stale.json()).toMatchObject({ error: { code: 'FRESH_AUTH_REQUIRED' } })
    const blank = await staffWrite('owner', 'POST', url, { reason: '   ' })
    expect(blank.statusCode).toBe(400)
    expect(blank.json()).toMatchObject({ error: { fieldErrors: [{ field: 'body.reason', code: 'required' }] } })
    expect((await staffWrite('owner', 'POST', url, {})).statusCode).toBe(400)
    expect(await gate(job.jobId)).toEqual({ open: false, code: 'DEPOSIT_REQUIRED' })
    expect(
      await t.db.selectFrom('finance.deposit_waivers').select('id').where('job_id', '=', job.jobId).execute(),
    ).toEqual([])

    // A partial cash payment first; then the Owner's waiver.
    expect((await pay('office', job.jobId, { method: 'cash', amountCents: 5_000 })).statusCode).toBe(201)
    const waived = await staffWrite('owner', 'POST', url, reason)
    expect(waived.statusCode, waived.body).toBe(200)
    const v = waived.json<DepositView>()
    // Never paid, never a lower price: the amount, the money and the approved total stay as they were.
    expect(v).toMatchObject({
      state: 'waived',
      amountCents: 36_000,
      baseTotalCents: 180_000,
      verifiedCents: 5_000,
      remainingCents: 31_000,
      workScheduling: 'open',
      waiver: { by: { id: ids.owner }, reason: reason.reason },
      actions: { recordPayment: false, waive: false, enterPaymentLink: false },
    })
    const approval = await t.db
      .selectFrom('estimating.approvals')
      .select(['total_cents', 'deposit_cents'])
      .where('id', '=', job.approvalId)
      .executeTakeFirstOrThrow()
    expect(approval).toEqual({ total_cents: '180000', deposit_cents: '36000' })
    expect(await gate(job.jobId)).toEqual({ open: true, basis: 'waived' })

    // Audited with the reason and the fresh sign-in; recorded once.
    const events = await t.db
      .selectFrom('platform.audit_events')
      .select(['action', 'actor_id', 'reason', 'step_up_used', 'result'])
      .where('action', '=', 'deposit.waive')
      .where('target_id', '=', job.jobId)
      .execute()
    expect(events).toEqual([
      { action: 'deposit.waive', actor_id: ids.owner, reason: reason.reason, step_up_used: true, result: 'succeeded' },
    ])
    const twice = await staffWrite('owner', 'POST', url, reason)
    expect(twice.statusCode).toBe(409)
    expect(twice.json()).toMatchObject({ error: { fieldErrors: [{ code: 'DEPOSIT_WAIVED' }] } })

    // A deposit that is not required, or already satisfied, is not waived.
    const none = await approvedJob([{ kind: 'base', cents: 100_000 }])
    const r = await staffWrite('owner', 'POST', `/api/v1/staff/jobs/${none.jobId}/deposit/waiver`, reason)
    expect(r.statusCode).toBe(409)
    expect(r.json()).toMatchObject({ error: { fieldErrors: [{ code: 'DEPOSIT_NOT_REQUIRED' }] } })
  })

  it('[RULE-SAFETY-GATES][ENT-DepositRequirement] the database refuses a waiver by anyone but the Owner and any edit of the record', async () => {
    const job = await approvedJob([{ kind: 'base', cents: 160_000 }])
    const req = await t.db
      .selectFrom('finance.deposit_requirements')
      .select(['id', 'job_id'])
      .where('job_id', '=', job.jobId)
      .executeTakeFirstOrThrow()
    const officeSession = await t.db
      .selectFrom('identity.staff_sessions')
      .select(['id', 'authenticated_at'])
      .where('staff_user_id', '=', ids.admin)
      .executeTakeFirstOrThrow()
    // Another administrator writing a waiver directly: refused by the database too.
    await expect(
      t.db
        .insertInto('finance.deposit_waivers')
        .values({
          deposit_requirement_id: req.id,
          job_id: req.job_id,
          waived_by: ids.admin,
          reason: 'Synthetic bypass attempt',
          staff_session_id: officeSession.id,
          authenticated_at: officeSession.authenticated_at,
        })
        .execute(),
    ).rejects.toThrow(/only the Owner waives/)
    // Its state follows its money and waiver: it cannot be set to satisfied or waived by an update.
    for (const state of ['satisfied', 'waived', 'applied'])
      await expect(
        t.db.updateTable('finance.deposit_requirements').set({ state }).where('id', '=', req.id).execute(),
      ).rejects.toThrow()
    await expect(
      t.db.updateTable('finance.deposit_requirements').set({ amount_cents: 1 }).where('id', '=', req.id).execute(),
    ).rejects.toThrow(/keeps its job, approval and amounts/)
    await expect(t.db.deleteFrom('finance.deposit_requirements').where('id', '=', req.id).execute()).rejects.toThrow()

    // A recorded payment is never edited or deleted; an allocation is never beyond the deposit.
    const paid = (await pay('office', job.jobId, { method: 'chime', amountCents: 1_000 })).json<DepositView>()
    const paymentId = paid.payments[0]?.id as string
    await expect(
      t.db.updateTable('finance.payments').set({ amount_cents: 999_999 }).where('id', '=', paymentId).execute(),
    ).rejects.toThrow(/never edited/)
    await expect(t.db.deleteFrom('finance.payments').where('id', '=', paymentId).execute()).rejects.toThrow()
    const big = await t.db
      .insertInto('finance.payments')
      .values({
        project_id: job.projectId,
        job_id: job.jobId,
        method: 'cash',
        amount_cents: 900_000,
        received_on: today(),
        collector_staff_id: ids.office,
        recorded_by: ids.office,
        state: 'recorded',
      })
      .returning('id')
      .executeTakeFirstOrThrow()
    await expect(
      t.db
        .insertInto('finance.payment_allocations')
        .values({ payment_id: big.id, deposit_requirement_id: req.id, amount_cents: 900_000, allocated_by: ids.office })
        .execute(),
    ).rejects.toThrow(/never exceed the deposit/)
    await expect(
      t.db
        .updateTable('finance.payment_allocations')
        .set({ amount_cents: 1 })
        .where('payment_id', '=', paymentId)
        .execute(),
    ).rejects.toThrow(/append-only/)
    // A check is cleared only by an Owner who did not collect it.
    const chk = (
      await pay('office', job.jobId, { method: 'check', amountCents: 1_000, reference: ref('CHK'), payerName: 'Synth' })
    ).json<DepositView>()
    const chkId = chk.payments.find((p) => p.state === 'received')?.id as string
    await expect(
      t.db
        .updateTable('finance.payments')
        .set({ state: 'cleared', cleared_by: ids.admin, cleared_at: new Date() })
        .where('id', '=', chkId)
        .execute(),
    ).rejects.toThrow(/only the Owner marks a check cleared/)
    expect(await gate(job.jobId)).toEqual({ open: false, code: 'DEPOSIT_REQUIRED' })
    expect(await withTx(t.db, (tx) => confirmationDepositGate(tx, { kind: 'work', jobId: randomUUID() }))).toEqual({
      open: false,
      code: 'DEPOSIT_REQUIREMENT_MISSING',
    })
  })
})

describe('[INT-Square][HH-FIN-02][C05] the deposit request: a staff-pasted Square link; the customer sees the amount due', () => {
  it('Office pastes an https Square link; the customer sees "Deposit due" with Pay by Card; once paid, the next step moves on', async () => {
    const job = await approvedJob([{ kind: 'base', cents: 127_500 }]) // deposit $255.00
    const url = `/api/v1/staff/jobs/${job.jobId}/deposit/payment-link`
    const v0 = await deposit(job.jobId)
    const link = ['https://square.link/u', `synthetic${seq}`].join('/')
    const badHttp = await staffWrite(
      'office',
      'PUT',
      url,
      { url: link.replace('https', 'http') },
      { 'if-match': `"${v0.version}"` },
    )
    expect(badHttp.json()).toMatchObject({ error: { fieldErrors: [{ field: 'body.url', code: 'NOT_HTTPS' }] } })
    const badHost = await staffWrite(
      'office',
      'PUT',
      url,
      { url: 'https://square.link.example.test/u/synthetic' },
      { 'if-match': `"${v0.version}"` },
    )
    expect(badHost.json()).toMatchObject({ error: { fieldErrors: [{ code: 'NOT_A_SQUARE_LINK' }] } })
    expect(
      (await staffWrite('estimator', 'PUT', url, { url: link }, { 'if-match': `"${v0.version}"` })).statusCode,
    ).toBe(403)
    expect((await staffWrite('office', 'PUT', url, { url: link })).statusCode).toBe(428)
    const saved = await staffWrite('office', 'PUT', url, { url: link }, { 'if-match': `"${v0.version}"` })
    expect(saved.statusCode, saved.body).toBe(200)
    expect(saved.json<DepositView>().paymentLink).toMatchObject({ url: link })
    expect((await staffWrite('office', 'PUT', url, { url: link }, { 'if-match': `"${v0.version}"` })).statusCode).toBe(
      409,
    )

    const overview = async () =>
      (
        await app.inject({
          method: 'GET',
          url: `/api/v1/customer/projects/${job.reference}/overview`,
          headers: { cookie: job.customerCookie },
        })
      ).json<{ status: { step: string; nextAction: string }; payment: Record<string, unknown> }>()
    const due = await overview()
    expect(due.status).toMatchObject({ step: 'deposit_due', nextAction: 'pay_deposit' })
    expect(due.payment).toEqual({
      state: 'deposit_due',
      amountCents: 25_500,
      verifiedCents: 0,
      pendingCents: 0,
      payByCardUrl: link,
    })
    // A redirect back from Square or a claim changes nothing: only a staff-recorded verified payment does.
    expect((await deposit(job.jobId)).state).toBe('required')
    expect(
      (await pay('office', job.jobId, { method: 'square_payment_link', amountCents: 25_500, reference: ref('SQ') }))
        .statusCode,
    ).toBe(201)
    const paid = await overview()
    expect(paid.payment).toEqual({ state: 'deposit_received', amountCents: 25_500 })
    expect(paid.status).toMatchObject({ step: 'choose_work_appointment' })
  })

  it('a link is https on a configured Square host only (PROPOSED list payment.square_link_hosts)', async () => {
    const setting = (await loadConfig(t.db)).get('payment.square_link_hosts')
    expect(setting).toMatchObject({ state: 'CONFIGURED', proposed: true })
    const hosts = setting.state === 'CONFIGURED' ? setting.value.hosts : []
    expect(squareLinkProblem('https://square.link/u/abc', hosts)).toBeNull()
    expect(squareLinkProblem('https://checkout.square.site/merchant/x', hosts)).toBeNull()
    expect(squareLinkProblem('http://square.link/u/abc', hosts)).toBe('NOT_HTTPS')
    expect(squareLinkProblem('https://evilsquare.link/u/abc', hosts)).toBe('NOT_A_SQUARE_LINK')
    expect(squareLinkProblem('https://user@square.link/u/abc', hosts)).toBe('NOT_A_SQUARE_LINK')
    expect(squareLinkProblem('not a link', hosts)).toBe('NOT_A_LINK')
  })
})

describe('[S01][HH-FIN-12] deposits to collect and checks to verify appear in the action queue', () => {
  const item = (jobId: string) =>
    t.db
      .selectFrom('ops.queue_items')
      .select(['reason', 'resolved_at', 'resolution', 'reference'])
      .where('type', '=', 'deposit_due')
      .where('subject_id', '=', jobId)
      .orderBy('opened_at', 'desc')
      .executeTakeFirst()

  it('the approval opens the item; a pending check names it; verified money or the waiver resolves it', async () => {
    const job = await approvedJob([{ kind: 'base', cents: 140_000 }]) // deposit $280.00
    // The approval's committed event opens it (the queue automation, run here as the worker would).
    const auto = depositQueueAutomation()
    expect(auto.trigger).toEqual({ kind: 'event', eventTypes: ['estimate.approved'] })
    const fromApproval = (approvalId: string) =>
      withTx(t.db, (tx) =>
        auto.handle({
          tx,
          job: {
            id: randomUUID(),
            key: 'synthetic',
            automation: auto.name,
            attempt: 1,
            payload: {},
            eventId: null,
            eventType: 'estimate.approved',
            target: { type: 'estimate_approval', id: approvalId },
            requestId: 'synthetic-request',
          },
          idempotencyKey: 'synthetic',
          log: console as never,
          signal: new AbortController().signal,
        }),
      )
    const outcome = await fromApproval(job.approvalId)
    expect(outcome).toBe('done')
    expect(await item(job.jobId)).toMatchObject({ reason: 'deposit_due', resolved_at: null, reference: job.reference })
    expect(
      (
        await pay('office', job.jobId, {
          method: 'check',
          amountCents: 8_000,
          reference: ref('CHK'),
          payerName: 'Synth',
        })
      ).statusCode,
    ).toBe(201)
    expect(await item(job.jobId)).toMatchObject({ reason: 'deposit_check_pending', resolved_at: null })
    expect((await pay('office', job.jobId, { method: 'cash', amountCents: 20_000 })).statusCode).toBe(201)
    // $200.00 verified, $80.00 pending: still due.
    expect(await item(job.jobId)).toMatchObject({ reason: 'deposit_check_pending', resolved_at: null })
    const check = (await deposit(job.jobId)).payments.find((p) => p.state === 'received')?.id as string
    expect((await staffWrite('owner', 'POST', `/api/v1/staff/payments/${check}/clear`, {})).statusCode).toBe(200)
    expect(await item(job.jobId)).toMatchObject({ resolution: 'paid' })

    const waived = await approvedJob([{ kind: 'base', cents: 140_000 }])
    expect(await fromApproval(waived.approvalId)).toBe('done')
    // A job that needs no deposit opens none.
    const none = await approvedJob([{ kind: 'base', cents: 100_000 }])
    expect(await fromApproval(none.approvalId)).toBe('cancelled')
    expect(await item(none.jobId)).toBeUndefined()
    expect(
      (await staffWrite('owner', 'POST', `/api/v1/staff/jobs/${waived.jobId}/deposit/waiver`, { reason: 'Synthetic' }))
        .statusCode,
    ).toBe(200)
    expect(await item(waived.jobId)).toMatchObject({ resolution: 'waived' })
  })
})

describe('[HH-SCH-06][HH-SCH-11][HH-FIN-02][T36] planning or changing a work-visit window runs the deposit gate (TSK-0059, TSK-0061)', () => {
  const ZONE = 'America/Kentucky/Louisville'
  const date = () => addLocalDays(localDateOf(new Date(), ZONE), 2)
  /** The same server without any work-visit gate: a visit planned before the deposit was required (fixture). */
  let ungated: FastifyInstance
  let ungatedOwner: [string, string]
  beforeAll(async () => {
    const modules = apiModules({ secureCookies: false, mfaKey: TEST_MFA_KEY, codeKey: KEY, trustProxyHops: 1 }).map(
      (m) => (m.name === 'visits' ? visitsModule({ workVisitGates: [] }) : m),
    )
    ungated = await buildApp({ config: testConfig({ TRUST_PROXY_HOPS: '1' }), api: { db: t.db, modules } })
    const res = await signInWithMfa(ungated, {
      method: 'POST',
      url: '/api/v1/staff/auth/sign-in',
      payload: { email: email('owner'), password: pw(1) },
    })
    expect(res.statusCode, res.body).toBe(200)
    const cookie = String(res.headers['set-cookie']).split(';')[0] as string
    const session = await ungated.inject({ method: 'GET', url: '/api/v1/staff/auth/session', headers: { cookie } })
    ungatedOwner = [cookie, session.json<{ csrfToken: string }>().csrfToken]
  })
  afterAll(async () => {
    await ungated?.close()
  })
  type Planned = { visits: { id: string; version: number; purpose: string }[] }
  const plan = (projectId: string, purpose: string, server: FastifyInstance = app) =>
    server.inject({
      method: 'POST',
      url: `/api/v1/staff/projects/${projectId}/visits`,
      payload: { purpose, localDate: date(), windowStart: '09:00', windowEnd: '10:00' },
      headers: {
        cookie: server === app ? cookies.owner : ungatedOwner[0],
        'x-csrf-token': server === app ? csrf.owner : ungatedOwner[1],
        'idempotency-key': key('visit'),
      },
    })
  const codes = (body: string) =>
    (JSON.parse(body) as { error: { fieldErrors: { field: string; code: string }[] } }).error.fieldErrors.map((f) => [
      f.field,
      f.code,
    ])
  const visitCount = async (projectId: string) =>
    (await t.db.selectFrom('work.visits').select('id').where('project_id', '=', projectId).execute()).length

  it('the deposit gate is a registered work-visit gate', () => {
    expect(WORK_VISIT_GATES).toContain(DEPOSIT_GATE)
  })

  it('a work visit waits for verified money or the Owner’s waiver; an estimate visit never waits', async () => {
    // An estimate visit on an open project: no job and no deposit, never gated (OWN-DEC-119, FACT-VISIT-FEE).
    const open = await readyRequest()
    const estimateVisit = await plan(open.projectId, 'site_estimate')
    expect(estimateVisit.statusCode, estimateVisit.body).toBe(201)

    // A required deposit not yet covered: the work visit is refused with the deposit named; nothing is stored.
    const paid = await approvedJob([{ kind: 'base', cents: 150_000 }]) // deposit $300.00
    const refused = await plan(paid.projectId, 'service')
    expect(refused.statusCode, refused.body).toBe(409)
    expect(codes(refused.body)).toEqual([['job', 'DEPOSIT_REQUIRED']])
    expect(await visitCount(paid.projectId)).toBe(0)
    // A check received but not cleared is not verified money: still refused.
    expect(
      (
        await pay('office', paid.jobId, {
          method: 'check',
          amountCents: 30_000,
          reference: ref('CHECK'),
          payerName: 'Synthetic Payer',
        })
      ).statusCode,
    ).toBe(201)
    expect(codes((await plan(paid.projectId, 'service')).body)).toEqual([['job', 'DEPOSIT_REQUIRED']])
    const cardJob = await approvedJob([{ kind: 'base', cents: 150_000 }])
    expect(
      (await pay('office', cardJob.jobId, { method: 'square_payment_link', amountCents: 30_000, reference: ref('SQ') }))
        .statusCode,
    ).toBe(201)
    const ok = await plan(cardJob.projectId, 'service')
    expect(ok.statusCode, ok.body).toBe(201)

    // The Owner's waiver opens it too, without marking anything paid.
    const waived = await approvedJob([{ kind: 'base', cents: 160_000 }])
    expect(codes((await plan(waived.projectId, 'service')).body)).toEqual([['job', 'DEPOSIT_REQUIRED']])
    const w = await staffWrite('owner', 'POST', `/api/v1/staff/jobs/${waived.jobId}/deposit/waiver`, {
      reason: 'Synthetic: the owner waives this deposit',
    })
    expect(w.statusCode, w.body).toBe(200)
    expect((await plan(waived.projectId, 'service')).statusCode).toBe(201)
    expect((await deposit(waived.jobId)).verifiedCents).toBe(0)

    // No deposit required: the gate passes at once.
    const small = await approvedJob([{ kind: 'base', cents: 100_000 }])
    expect((await plan(small.projectId, 'service')).statusCode).toBe(201)
  })

  it('changing a work visit’s window runs the gate again', async () => {
    const job = await approvedJob([{ kind: 'base', cents: 150_000 }])
    // Fixture: a visit planned by a server without the gate, while the deposit is still due.
    const planned = await plan(job.projectId, 'service', ungated)
    expect(planned.statusCode, planned.body).toBe(201)
    const v = planned.json<Planned>().visits.find((x) => x.purpose === 'service') as Planned['visits'][number]
    const move = (version: number) =>
      staffWrite(
        'owner',
        'POST',
        `/api/v1/staff/visits/${v.id}/window`,
        { localDate: date(), windowStart: '10:00', windowEnd: '11:00' },
        { 'if-match': `"${version}"` },
      )
    const refused = await move(v.version)
    expect(refused.statusCode, refused.body).toBe(409)
    expect(codes(refused.body)).toEqual([['job', 'DEPOSIT_REQUIRED']])
    expect((await pay('office', job.jobId, { method: 'cash', amountCents: 30_000 })).statusCode).toBe(201)
    const moved = await move(v.version)
    expect(moved.statusCode, moved.body).toBe(200)
  })
})

describe('[HH-EST-12][OWN-DEC-105][C05] the step after approval reads the job’s deposit (TSK-0058, TSK-0059)', () => {
  const overview = async (job: { reference: string; customerCookie: string }) =>
    (
      await app.inject({
        method: 'GET',
        url: `/api/v1/customer/projects/${job.reference}/overview`,
        headers: { cookie: job.customerCookie },
      })
    ).json<{ status: { step: string; nextAction: string } }>()
  const estimateNextStep = async (job: { reference: string; customerCookie: string; projectId: string }) => {
    const v = await t.db
      .selectFrom('estimating.estimate_versions as v')
      .innerJoin('estimating.estimates as e', 'e.id', 'v.estimate_id')
      .select(['e.number', 'v.version'])
      .where('v.project_id', '=', job.projectId)
      .executeTakeFirstOrThrow()
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/customer/projects/${job.reference}/estimates/${v.number}/versions/${v.version}`,
      headers: { cookie: job.customerCookie },
    })
    expect(res.statusCode, res.body).toBe(200)
    return res.json<{ approval: { nextStep: string | null } }>().approval.nextStep
  }

  it('deposit due: the deposit wording; verified money or the Owner’s waiver: choose your work appointment', async () => {
    const due = await approvedJob([{ kind: 'base', cents: 150_000 }])
    expect(await approvalFacts(t.db, due.projectId)).toEqual({ estimateApproved: true, depositDue: true })
    expect((await overview(due)).status).toMatchObject({ step: 'deposit_due', nextAction: 'pay_deposit' })
    expect(await estimateNextStep(due)).toBe('deposit_due')
    // A pending check does not change it.
    await pay('office', due.jobId, {
      method: 'check',
      amountCents: 30_000,
      reference: ref('CHECK'),
      payerName: 'Synthetic Payer',
    })
    expect((await overview(due)).status.step).toBe('deposit_due')

    const paid = await approvedJob([{ kind: 'base', cents: 150_000 }])
    await pay('office', paid.jobId, { method: 'square_payment_link', amountCents: 30_000, reference: ref('SQ') })
    expect(await approvalFacts(t.db, paid.projectId)).toEqual({ estimateApproved: true, depositDue: false })
    expect((await overview(paid)).status.step).toBe('choose_work_appointment')
    expect(await estimateNextStep(paid)).toBe('choose_work_appointment')

    const waived = await approvedJob([{ kind: 'base', cents: 150_000 }])
    expect(
      (await staffWrite('owner', 'POST', `/api/v1/staff/jobs/${waived.jobId}/deposit/waiver`, { reason: 'Synthetic' }))
        .statusCode,
    ).toBe(200)
    expect(await approvalFacts(t.db, waived.projectId)).toEqual({ estimateApproved: true, depositDue: false })
    expect((await overview(waived)).status.step).toBe('choose_work_appointment')
    expect(await estimateNextStep(waived)).toBe('choose_work_appointment')

    const none = await approvedJob([{ kind: 'base', cents: 100_000 }])
    expect(await approvalFacts(t.db, none.projectId)).toEqual({ estimateApproved: true, depositDue: false })
    expect((await overview(none)).status.step).toBe('choose_work_appointment')
    // Not approved: no approval facts.
    const open = await readyRequest()
    expect(await approvalFacts(t.db, open.projectId)).toEqual({ estimateApproved: false, depositDue: false })
  })
})
