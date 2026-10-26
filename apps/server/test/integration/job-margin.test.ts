// Job gross margin, the advisory target flag, labor cost rates and low-margin reasons against PostgreSQL 16 (TSK-0131;
// HH-FIN-20, HH-FIN-17, HH-DATA-10, T73, OWN-DEC-189, FACT-MARGIN-TARGET, RULE-MONEY-CENTS, RULE-NO-INVENTED-FACTS,
// RULE-SERVER-AUTHZ). Staff, customers, amounts, rates and references are synthetic (RULE-SYNTHETIC-DATA); nothing
// reaches Square or any provider.
// - Fixtures of this throwaway database (as in owner-dashboard.test.ts and job-costs.test.ts): a synthetic estimate
//   terms version in effect; the stand-in quality gate for the deposit job; the job reviewed for real reaches "awaiting
//   quality review" as closeout.test.ts does; the visit is a fixture in the first hours of today's local date and the
//   worker's Finished is written straight into this database (the Owner then corrects Arrived to two hours before it,
//   through the route, so the elapsed time is exact).
// - Everything is recorded today in the business zone; the dashboard period runs from yesterday to tomorrow so a run
//   across local midnight still holds every record. Assertions read the records this file creates.
import { randomUUID } from 'node:crypto'
import { loadServiceSeed, loadSopSeed, syncServices, syncSops, withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import {
  addLocalDays,
  localClockOf,
  localDateOf,
  offsetMinutesAt,
  resolveLocalTime,
  resolveWindow,
} from '@handyhub/domain'
import { ESTIMATE_TERMS } from '@handyhub/domain/legal'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import {
  depositInvoiceAutomation,
  invoiceDocumentAutomation,
  invoiceDraftAutomation,
  invoiceReadyAutomation,
} from '../../src/modules/finance/invoice-automations.js'
import { paymentReceiptAutomation } from '../../src/modules/finance/index.js'
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
  CODE_HASH_KEY: ['synthetic', 'margin', 'code', 'key', 'for', 'tests', 'only', '0116'].join('-'),
})
const pw = ['synthetic', 'job', 'margin', 'passphrase', '131'].join(' ')
const PEOPLE = ['owner', 'office', 'estimator', 'ann'] as const
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
async function drain() {
  const w = createWorker({
    db: t.db,
    registry: createAutomationRegistry([
      fast(invoiceDraftAutomation()),
      fast(invoiceDocumentAutomation(storage)),
      fast(invoiceReadyAutomation(notices)),
      fast(depositInvoiceAutomation(notices)),
      fast(paymentReceiptAutomation(notices)),
    ]),
  })
  for (let i = 0; i < 6; i++) {
    await w.runOnce()
    await new Promise((r) => setTimeout(r, 15))
  }
}

const email = (p: Person) => `${p}-margin@example.test`
const today = () => localDateOf(new Date(), ZONE)

beforeAll(async () => {
  t = await createTestDatabase()
  await syncServices(t.db, loadServiceSeed())
  await syncSops(t.db, loadSopSeed())
  app = await buildApp({ config: testConfig({ TRUST_PROXY_HOPS: '1' }), api: { db: t.db, codeKey: KEY, storage } })
  const hash = await hashPassword(pw)
  await withTx(t.db, async (tx) => {
    for (const p of PEOPLE) {
      const user = await createStaffUser(tx, {
        email: email(p),
        displayName: `Synthetic ${p}`,
        locale: 'en',
        role: p === 'ann' ? 'worker' : p,
        issuedBy: 'test',
      })
      await setPasswordHash(tx, user.id, hash)
      ids[p] = user.id
    }
  })
  for (const p of PEOPLE) {
    const res = await signInWithMfa(app, {
      method: 'POST',
      url: '/api/v1/staff/auth/sign-in',
      payload: { email: email(p), password: pw },
    })
    expect(res.statusCode, res.body).toBe(200)
    cookies[p] = String(res.headers['set-cookie']).split(';')[0] as string
    const session = await app.inject({
      method: 'GET',
      url: '/api/v1/staff/auth/session',
      headers: { cookie: cookies[p] },
    })
    csrf[p] = session.json<{ csrfToken: string }>().csrfToken
  }
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
}, 120_000)
afterAll(async () => {
  await app?.close()
  await t?.drop()
})

let seq = 0
const key = () => `synthetic-margin-${String(++seq).padStart(6, '0')}-${randomUUID()}`
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
    headers: { cookie: cookies[who], 'x-csrf-token': csrf[who], 'idempotency-key': key(), ...extra },
  })
}
const staffGet = (who: Person, url: string) =>
  app.inject({ method: 'GET', url: `/api/v1${url}`, headers: { cookie: cookies[who] } })
const codes = (res: { json: <T>() => T }) =>
  res.json<{ error: { fieldErrors: { code: string }[] } }>().error.fieldErrors.map((f) => f.code)

// --- Fixtures --------------------------------------------------------------------------------------------------------

const ALL_OK = Object.fromEntries(
  ['coverage', 'service_fit', 'essential_facts', 'urgency', 'site_visit_need', 'staff_equipment', 'risk_flags'].map(
    (c) => [c, { outcome: 'ok' }],
  ),
)
let ip = 60
type Line = { unitPriceCents: number; materialCostCents?: number; laborCostCents?: number }

/** A published estimate of base lines with their internal costs (a qualified online-estimate request). */
async function published(lines: Line[]) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/public/requests',
    headers: { 'idempotency-key': key(), 'x-forwarded-for': `198.51.100.${++ip}` },
    payload: {
      formVersion: 'test-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-01' }],
      notSure: false,
      description: 'Synthetic margin project.',
      answers: [],
      property: {
        street: `${++seq} Synthetic Margin Lane`,
        city: 'Testville',
        state: 'ky',
        zip: '40000',
        propertyType: 'house',
      },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'online',
      contact: {
        fullName: 'Synthetic Margin Customer',
        email: `margin-${seq}-${randomUUID().slice(0, 8)}@example.test`,
        phone: '(502) 555-0131',
        preferredChannel: 'email',
      },
      smsOptIn: false,
      marketingOptIn: false,
    },
  })
  expect(res.statusCode, res.body).toBe(201)
  const { reference } = res.json<{ reference: string }>()
  const row = await t.db
    .selectFrom('intake.requests as r')
    .innerJoin('crm.projects as p', 'p.id', 'r.project_id')
    .select(['r.id', 'r.project_id', 'r.state_version', 'r.contact_id', 'p.property_id'])
    .where('r.reference', '=', reference)
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
  const created = await staffWrite('estimator', 'POST', `/staff/projects/${row.project_id}/estimates`, {})
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
      lines: lines.map((l, n) => ({
        kind: 'base',
        workPackageId: view.workPackages[0]?.id,
        description: `Synthetic margin line ${n + 1}`,
        quantity: '1',
        unit: 'job',
        unitPriceCents: l.unitPriceCents,
        ...(l.materialCostCents === undefined
          ? {}
          : { internalCost: { materialCostCents: l.materialCostCents, laborCostCents: l.laborCostCents } }),
      })),
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
  return {
    pub,
    requestId: row.id,
    projectId: row.project_id,
    propertyId: row.property_id,
    reference,
    contactId: row.contact_id,
    grantId: grant.id,
    number: c.number,
  }
}

let nets = 0
/** The customer approves the published estimate; answers the job and its deposit, if any. */
async function approvedJob(lines: Line[]) {
  const p = await published(lines)
  expect(p.pub.statusCode, p.pub.body).toBe(200)
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
      selection: { totalCents: number; deposit: { amountCents: number | null } } | null
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
      fullName: 'Synthetic Margin Customer',
    },
    headers: { cookie, 'idempotency-key': key(), 'x-forwarded-for': `2001:db8:131:${++nets}::1` },
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

/** A confirmed visit for Ann in the first hours of today (On my way is open at any hour the suite runs). */
async function visitToday(job: { projectId: string; propertyId: string; jobId: string }): Promise<string> {
  const midnight = resolveLocalTime(today(), '00:00', ZONE)
  if (midnight.kind !== 'unique') throw new Error('fixture midnight')
  const startsAt = new Date(midnight.at.instant.getTime() + 15 * 60_000)
  const endsAt = new Date(startsAt.getTime() + 15 * 60_000)
  const w = resolveWindow({
    date: today(),
    start: localClockOf(startsAt, ZONE),
    end: localClockOf(endsAt, ZONE),
    zone: ZONE,
    startOffsetMinutes: offsetMinutesAt(startsAt, ZONE),
    endOffsetMinutes: offsetMinutesAt(endsAt, ZONE),
  })
  if (!w.ok) throw new Error('fixture window')
  const window = w.window
  return withTx(t.db, async (tx) => {
    const v = await tx
      .insertInto('work.visits')
      .values({
        purpose: 'service',
        project_id: job.projectId,
        job_id: job.jobId,
        property_id: job.propertyId,
        local_date: window.date,
        window_start: window.start,
        window_end: window.end,
        time_zone: ZONE,
        start_offset_minutes: window.startOffsetMinutes,
        end_offset_minutes: window.endOffsetMinutes,
        starts_at: window.startsAt,
        ends_at: window.endsAt,
        window_set_by: ids.office,
        expected_duration_minutes: 15,
        preparation_buffer_minutes: 0,
        travel_buffer_minutes: 0,
        required_workers: 1,
        created_by: ids.office,
      })
      .returning(['id', 'version'])
      .executeTakeFirstOrThrow()
    await tx
      .insertInto('work.reservations')
      .values({
        visit_id: v.id,
        resource: 'worker',
        staff_user_id: ids.ann,
        role: 'lead',
        kind: 'confirmed',
        starts_at: window.startsAt,
        ends_at: new Date(window.endsAt.getTime() + 15 * 60_000),
        time_zone: ZONE,
        assigned_by: ids.office,
      })
      .execute()
    await tx
      .updateTable('work.visits')
      .set({ state: 'confirmed', version: v.version + 1 })
      .where('id', '=', v.id)
      .execute()
    return v.id
  })
}

/** Ann works two hours on the visit: her taps, her Finished, and the Owner's correction of Arrived. */
async function twoHours(job: { projectId: string; jobId: string }, visitId: string) {
  for (const what of ['on-my-way', 'arrived'] as const) {
    const res = await staffWrite('ann', 'POST', `/staff/visits/${visitId}/${what}`, {})
    expect(res.statusCode, res.body).toBe(200)
  }
  await t.db
    .insertInto('work.time_stamps')
    .values({
      visit_id: visitId,
      project_id: job.projectId,
      job_id: job.jobId,
      staff_user_id: ids.ann,
      kind: 'finished',
    })
    .execute()
  const times = (await staffGet('owner', `/staff/visits/${visitId}/timestamps`)).json<{
    workers: { staffUserId: string; finished: { at: string | null } }[]
  }>()
  const finishedAt = new Date(times.workers.find((w) => w.staffUserId === ids.ann)?.finished.at as string)
  const fixed = await staffWrite('owner', 'POST', `/staff/visits/${visitId}/timestamps/corrections`, {
    staffUserId: ids.ann,
    kind: 'arrived',
    at: new Date(finishedAt.getTime() - 120 * 60_000).toISOString(),
    reason: 'Synthetic: Ann arrived two hours before she finished',
  })
  expect(fixed.statusCode, fixed.body).toBe(200)
}

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

type Invoice = { id: string; version: number; state: string; payments: { id: string }[] }
type JobInvoices = { final: Invoice | null; deposit: Invoice | null }
const invoicesOf = async (jobId: string) =>
  (await staffGet('office', `/staff/jobs/${jobId}/invoices`)).json<JobInvoices>()
const issue = (inv: { id: string; version: number }) =>
  staffWrite('office', 'POST', `/staff/invoices/${inv.id}/issue`, {}, { 'if-match': `"${inv.version}"` })

type Figure = { state: string; cents: number | null }
type MarginFigure = {
  state: string
  revenueCents: number | null
  costCents: number | null
  grossProfitCents: number | null
  marginBps: number | null
  gaps: string[]
}
type Costs = {
  lines: { line: string; actual: Figure }[]
  totals: { actual: Figure; estimated: Figure }
  labor: {
    workDone: boolean
    times: {
      staffUserId: string
      minutes: number | null
      rated: boolean
      laborCents: number | null
      burdenCents: number | null
    }[]
  }
  margin: {
    targetBps: number | null
    estimatedPriceCents: number | null
    revenue: {
      state: string
      cents: number | null
      invoicedCents: number
      refundsCents: number
      creditsCents: number
      gaps: string[]
    }
    estimated: MarginFigure
    actual: MarginFigure
    varianceBps: number | null
    profitVarianceCents: number | null
    flag: string
    estimatedFlag: string
    reviewed: boolean
    reviews: { reason: string; note: string | null; marginBps: number | null; targetBps: number; current: boolean }[]
    report: string
    actions: { review: boolean }
  }
}
async function costs(jobId: string): Promise<Costs> {
  const res = await staffGet('owner', `/staff/jobs/${jobId}/costs`)
  expect(res.statusCode, res.body).toBe(200)
  return res.json<Costs>()
}
const line = (v: Costs, l: string) => v.lines.find((x) => x.line === l)?.actual
const enterRate = (who: Person, body: Record<string, unknown>) =>
  staffWrite(who, 'POST', '/staff/labor-cost-rates', {
    staffUserId: ids.ann,
    effectiveOn: today(),
    rateCents: 3_000,
    burdenCents: null,
    reason: 'Synthetic: the rate the Owner set for Ann',
    ...body,
  })
async function freshOwner() {
  await sql`UPDATE identity.staff_sessions SET authenticated_at = now() WHERE staff_user_id = ${ids.owner}`.execute(
    t.db,
  )
}
const CATEGORIES = ['materials', 'purchase', 'subcontractor', 'rental', 'disposal', 'other'] as const

// --- The margin -------------------------------------------------------------------------------------------------------

describe("[HH-FIN-20][HH-FIN-17][OWN-DEC-189] a job's gross margin, estimated and actual, final only when complete", () => {
  let job: Awaited<ReturnType<typeof approvedJob>>

  beforeAll(async () => {
    // $1,000.00 (no deposit: not over the $1,000.00 deposit threshold), estimated costs $200.00 + $300.00.
    job = await approvedJob([{ unitPriceCents: 100_000, materialCostCents: 20_000, laborCostCents: 30_000 }])
    await twoHours(job, await visitToday(job))
  }, 120_000)

  it('shows the estimated margin and no actual margin while labor has no rate (NOT CONFIGURED)', async () => {
    const v = await costs(job.jobId)
    expect(v.margin.targetBps).toBe(3000)
    expect(v.margin.estimatedPriceCents).toBe(100_000)
    expect(v.margin.estimated).toEqual({
      state: 'complete',
      revenueCents: 100_000,
      costCents: 50_000,
      grossProfitCents: 50_000,
      marginBps: 5000,
      gaps: [],
    })
    expect(v.margin.estimatedFlag).toBe('at_or_above_target')
    expect(line(v, 'labor')).toEqual({ state: 'not_configured', cents: null })
    expect(v.labor.times).toEqual([
      expect.objectContaining({ staffUserId: ids.ann, minutes: 120, rated: false, laborCents: null }),
    ])
    // Nothing invoiced yet and costs incomplete: no percentage, profit or totals, only why.
    expect(v.margin.revenue).toMatchObject({ state: 'not_invoiced', cents: null, gaps: ['not_invoiced'] })
    expect(v.margin.actual).toEqual({
      state: 'incomplete',
      revenueCents: null,
      costCents: null,
      grossProfitCents: null,
      marginBps: null,
      gaps: ['not_invoiced', 'costs_incomplete'],
    })
    expect(v.margin.flag).toBe('incomplete')
    expect(v.margin.varianceBps).toBeNull()
    expect(v.margin.actions.review).toBe(false)
    expect(v.margin.report).toBe('job_margin')
  })

  it('[RULE-SERVER-AUTHZ] lets only the Owner read or enter rates; checks the amounts', async () => {
    for (const who of ['office', 'estimator', 'ann'] as const) {
      expect((await staffGet(who, '/staff/labor-cost-rates')).statusCode).toBe(403)
      expect((await enterRate(who, {})).statusCode).toBe(403)
      expect((await staffGet(who, `/staff/jobs/${job.jobId}/costs`)).statusCode).toBe(403)
    }
    expect((await enterRate('owner', { rateCents: -1 })).statusCode).toBe(400)
    expect((await enterRate('owner', { rateCents: 100_001 })).statusCode).toBe(400)
    expect((await enterRate('owner', { rateCents: 25.5 })).statusCode).toBe(400)
    expect((await enterRate('owner', { reason: ' ' })).statusCode).toBe(400)
    const stranger = await enterRate('owner', { staffUserId: randomUUID() })
    expect(stranger.statusCode).toBe(400)
    expect(codes(stranger)).toEqual(['NOT_A_STAFF_MEMBER'])
  })

  it('costs labor at the rate in force on the visit date; burden only where entered; final once work is done', async () => {
    // A rate from tomorrow does not apply to today's visit.
    expect((await enterRate('owner', { effectiveOn: addLocalDays(today(), 1), rateCents: 9_900 })).statusCode).toBe(201)
    let v = await costs(job.jobId)
    expect(line(v, 'labor')).toEqual({ state: 'not_configured', cents: null })
    const res = await enterRate('owner', { rateCents: 2_000 })
    expect(res.statusCode, res.body).toBe(201)
    const list = res.json<{
      workers: { staffUserId: string; inForce: { rateCents: number } | null; rates: unknown[] }[]
    }>()
    expect(list.workers.find((w) => w.staffUserId === ids.ann)).toMatchObject({ inForce: { rateCents: 2_000 } })
    // A later entry for the same date replaces it: $30.00 an hour, burden $4.50 an hour.
    expect((await enterRate('owner', { rateCents: 3_000, burdenCents: 450 })).statusCode).toBe(201)
    v = await costs(job.jobId)
    expect(v.labor.times[0]).toMatchObject({ rated: true, laborCents: 6_000, burdenCents: 900 })
    // The job is not complete: more visits may add time, so labor is the part known so far.
    expect(v.labor.workDone).toBe(false)
    expect(line(v, 'labor')).toEqual({ state: 'incomplete', cents: 6_000 })
    expect(line(v, 'burden')).toEqual({ state: 'incomplete', cents: 900 })
    const audit = await t.db
      .selectFrom('platform.audit_events')
      .select(['action', 'summary'])
      .where('action', '=', 'labor_rate.record')
      .execute()
    expect(audit.length).toBe(3)
    // Audited without the amounts.
    expect(JSON.stringify(audit)).not.toMatch(/rateCents|burdenCents/)
  })

  it('is final once revenue and every cost are; partial payments change nothing; flagged below 30% (advisory)', async () => {
    const m = await staffWrite('owner', 'POST', `/staff/jobs/${job.jobId}/costs`, {
      category: 'materials',
      amountCents: 75_000,
      incurredOn: today(),
      note: 'Synthetic: drywall sheets and compound',
    })
    expect(m.statusCode, m.body).toBe(201)
    for (const c of CATEGORIES)
      expect(
        (await staffWrite('owner', 'POST', `/staff/jobs/${job.jobId}/cost-categories/${c}/actions/confirm`, {}))
          .statusCode,
      ).toBe(200)
    await reviewPasses(job.jobId)
    let v = await costs(job.jobId)
    expect(v.labor.workDone).toBe(true)
    expect(v.totals.actual).toEqual({ state: 'complete', cents: 81_900 })
    // Costs are final, revenue is not: still no margin.
    expect(v.margin.actual.gaps).toEqual(['not_invoiced'])
    const fin = (await invoicesOf(job.jobId)).final as Invoice
    expect((await issue(fin)).statusCode).toBe(200)
    v = await costs(job.jobId)
    expect(v.margin.revenue).toMatchObject({ state: 'complete', cents: 100_000, invoicedCents: 100_000 })
    expect(v.margin.actual).toEqual({
      state: 'complete',
      revenueCents: 100_000,
      costCents: 81_900,
      grossProfitCents: 18_100,
      marginBps: 1810,
      gaps: [],
    })
    expect(v.margin.flag).toBe('below_target')
    expect(v.margin.varianceBps).toBe(1810 - 5000)
    expect(v.margin.profitVarianceCents).toBe(18_100 - 50_000)
    expect(v.margin.actions.review).toBe(true)
    // A partial payment is money received, not revenue: the margin does not move.
    const issued = (await invoicesOf(job.jobId)).final as Invoice
    const paid = await staffWrite('office', 'POST', `/staff/invoices/${issued.id}/payments`, {
      receivedOn: today(),
      method: 'cash',
      amountCents: 40_000,
    })
    expect(paid.statusCode, paid.body).toBe(201)
    expect((await costs(job.jobId)).margin.actual.marginBps).toBe(1810)
  })

  it('takes credits and refunds into net revenue; one in process leaves the margin not final', async () => {
    const inv = (await invoicesOf(job.jobId)).final as Invoice
    const owner = (
      await t.db
        .selectFrom('identity.staff_sessions')
        .select('id')
        .where('staff_user_id', '=', ids.owner)
        .where('revoked_at', 'is', null)
        .orderBy('created_at', 'desc')
        .executeTakeFirstOrThrow()
    ).id
    const credit = await t.db
      .insertInto('finance.refunds')
      .values({
        project_id: job.projectId,
        job_id: job.jobId,
        type: 'credit',
        invoice_id: inv.id,
        amount_cents: 5_000,
        reason: 'Synthetic: goodwill credit',
        requested_by: ids.owner,
        state: 'requested',
      })
      .returning('id')
      .executeTakeFirstOrThrow()
    let v = await costs(job.jobId)
    expect(v.margin.revenue).toMatchObject({ state: 'incomplete', cents: 100_000, gaps: ['adjustment_in_process'] })
    expect(v.margin.actual).toMatchObject({ state: 'incomplete', marginBps: null, gaps: ['adjustment_in_process'] })
    expect(v.margin.flag).toBe('incomplete')
    await sql`UPDATE finance.refunds SET state = 'issued', approved_by = ${ids.owner}, approved_at = now(),
                staff_session_id = ${owner}, authenticated_at = now() WHERE id = ${credit.id}`.execute(t.db)
    await sql`UPDATE finance.refunds SET state = 'applied' WHERE id = ${credit.id}`.execute(t.db)
    // The rest is paid with $10.00 too much ($950.00 less $400.00 paid is $550.00 due); the $10.00 is refunded.
    const over = await staffWrite('office', 'POST', `/staff/invoices/${inv.id}/payments`, {
      receivedOn: today(),
      method: 'cash',
      amountCents: 56_000,
    })
    expect(over.statusCode, over.body).toBe(201)
    const payment = (over.json<JobInvoices>().final as Invoice).payments[1]?.id as string
    const refund = await t.db
      .insertInto('finance.refunds')
      .values({
        project_id: job.projectId,
        job_id: job.jobId,
        type: 'refund',
        payment_id: payment,
        amount_cents: 1_000,
        reason: 'Synthetic: part of the cash returned',
        requested_by: ids.office,
        state: 'requested',
      })
      .returning('id')
      .executeTakeFirstOrThrow()
    await sql`UPDATE finance.refunds SET state = 'approved', approved_by = ${ids.owner}, approved_at = now(),
                staff_session_id = ${owner}, authenticated_at = now() WHERE id = ${refund.id}`.execute(t.db)
    await sql`UPDATE finance.refunds SET state = 'processing' WHERE id = ${refund.id}`.execute(t.db)
    await sql`UPDATE finance.refunds SET state = 'succeeded', provider_confirmation = 'SYNTH-MARGIN-1'
               WHERE id = ${refund.id}`.execute(t.db)
    v = await costs(job.jobId)
    expect(v.margin.revenue).toMatchObject({
      state: 'complete',
      cents: 94_000,
      invoicedCents: 100_000,
      refundsCents: 1_000,
      creditsCents: 5_000,
    })
    // 12,100 / 94,000 = 12.872...%: half-up to 1287 basis points.
    expect(v.margin.actual).toMatchObject({ grossProfitCents: 12_100, marginBps: 1287 })
    expect(v.margin.flag).toBe('below_target')
  })

  it('records the Owner\'s reason for a job below the target; Office cannot; "other" needs a note', async () => {
    const url = `/staff/jobs/${job.jobId}/margin-reviews`
    expect((await staffWrite('office', 'POST', url, { reason: 'underpricing' })).statusCode).toBe(403)
    const bare = await staffWrite('owner', 'POST', url, { reason: 'other' })
    expect(bare.statusCode).toBe(400)
    expect(codes(bare)).toEqual(['NOTE_REQUIRED'])
    expect((await staffWrite('owner', 'POST', url, { reason: 'guesswork' })).statusCode).toBe(400)
    const res = await staffWrite('owner', 'POST', url, { reason: 'material_overrun', note: 'Synthetic: extra sheets' })
    expect(res.statusCode, res.body).toBe(201)
    const v = res.json<Costs>()
    expect(v.margin.reviewed).toBe(true)
    expect(v.margin.reviews).toEqual([
      expect.objectContaining({ reason: 'material_overrun', marginBps: 1287, targetBps: 3000, current: true }),
    ])
    // Reasons are append-only and the Owner's.
    await expect(sql`UPDATE finance.job_margin_reviews SET reason = 'other'`.execute(t.db)).rejects.toThrow()
    await expect(
      sql`INSERT INTO finance.job_margin_reviews (job_id, project_id, reason, revenue_cents, cost_cents,
            gross_profit_cents, margin_bps, target_bps, recorded_by)
          VALUES (${job.jobId}, ${job.projectId}, 'underpricing', 1, 0, 1, 10000, 3000, ${ids.office})`.execute(t.db),
    ).rejects.toThrow(/only an Owner/)
    await expect(
      sql`INSERT INTO finance.labor_cost_rates (staff_user_id, effective_on, rate_cents, reason, entered_by)
          VALUES (${ids.ann}, ${today()}, 1, 'Synthetic', ${ids.office})`.execute(t.db),
    ).rejects.toThrow(/only an Owner/)
    await expect(sql`DELETE FROM finance.labor_cost_rates`.execute(t.db)).rejects.toThrow()
  })

  it('flags on the Owner Dashboard, with the job in the supporting records', async () => {
    const from = addLocalDays(today(), -1)
    const to = addLocalDays(today(), 1)
    const res = await staffGet('owner', `/staff/dashboard?from=${from}&to=${to}`)
    expect(res.statusCode, res.body).toBe(200)
    const figs = res.json<{ figures: { id: string; current: { state: string; value: number | null } }[] }>().figures
    const fig = (id: string) => figs.find((f) => f.id === id)?.current
    expect(fig('costs.margin_target')).toEqual({ state: 'known', value: 3000 })
    const rows = async (figure: string) =>
      (await staffGet('owner', `/staff/dashboard/records?from=${from}&to=${to}&figure=${figure}`)).json<{
        rows: { id: string; state: string; cents: number | null }[]
      }>().rows
    expect(await rows('costs.below_target')).toContainEqual(
      expect.objectContaining({ id: job.jobId, state: 'below_target', cents: 12_100 }),
    )
    expect(await rows('costs.margin_final')).toContainEqual(expect.objectContaining({ id: job.jobId }))
    // Its reason is recorded: no longer waiting for one.
    expect((await rows('costs.below_target_unreviewed')).map((r) => r.id)).not.toContain(job.jobId)
  })

  it('changes the target with a fresh sign-in and a reason; a reason recorded under another target is not current', async () => {
    const before = await staffGet('owner', '/staff/settings/margin-target')
    expect(before.json()).toMatchObject({ state: 'CONFIGURED', version: 1, targetBps: 3000 })
    expect(
      (
        await staffWrite(
          'office',
          'PUT',
          '/staff/settings/margin-target',
          { targetBps: 1000, reason: 'x' },
          { 'if-match': '"1"' },
        )
      ).statusCode,
    ).toBe(403)
    await freshOwner()
    const stale = await staffWrite(
      'owner',
      'PUT',
      '/staff/settings/margin-target',
      { targetBps: 1000, reason: 'x' },
      {
        'if-match': '"0"',
      },
    )
    expect(stale.statusCode).toBe(409)
    const set = await staffWrite(
      'owner',
      'PUT',
      '/staff/settings/margin-target',
      { targetBps: 1000, reason: 'Synthetic: the CPA refined the target' },
      { 'if-match': '"1"' },
    )
    expect(set.statusCode, set.body).toBe(200)
    expect(set.json()).toMatchObject({ version: 2, targetBps: 1000 })
    const v = await costs(job.jobId)
    expect(v.margin.flag).toBe('at_or_above_target')
    expect(v.margin.reviews[0]?.current).toBe(false)
    expect(v.margin.actions.review).toBe(false)
    const back = await staffWrite(
      'owner',
      'PUT',
      '/staff/settings/margin-target',
      { targetBps: 3000, reason: 'Synthetic: back to the decided 30%' },
      { 'if-match': '"2"' },
    )
    expect(back.statusCode, back.body).toBe(200)
    expect((await costs(job.jobId)).margin.reviewed).toBe(true)
  })
})

describe('[HH-FIN-20][OWN-DEC-189] the flag is advisory; a deposit is not revenue before the final invoice', () => {
  it('publishes an estimate whose estimated margin is below the target without any approval', async () => {
    // $500.00 with $450.00 of internal costs: a 10% estimated margin, under the Owner approval threshold.
    const p = await published([{ unitPriceCents: 50_000, materialCostCents: 25_000, laborCostCents: 20_000 }])
    expect(p.pub.statusCode, p.pub.body).toBe(200)
    expect(p.pub.json<{ state: string }>().state).toBe('published')
  })

  it('counts the deposit once, inside the final invoice, and nothing before it', async () => {
    // $1,200.00: over the deposit threshold, so a deposit is required and paid before the work.
    const d = await approvedJob([{ unitPriceCents: 120_000, materialCostCents: 30_000, laborCostCents: 40_000 }])
    expect(d.depositCents).toBeGreaterThan(0)
    const prepared = await staffWrite('office', 'POST', `/staff/jobs/${d.jobId}/invoices/deposit-draft`, {})
    expect(prepared.statusCode, prepared.body).toBe(200)
    expect((await issue(prepared.json<JobInvoices>().deposit as Invoice)).statusCode).toBe(200)
    const dep = await staffWrite('office', 'POST', `/staff/jobs/${d.jobId}/deposit/payments`, {
      receivedOn: today(),
      method: 'cash',
      amountCents: d.depositCents,
    })
    expect(dep.statusCode, dep.body).toBe(201)
    let v = await costs(d.jobId)
    expect(v.margin.revenue).toMatchObject({ state: 'not_invoiced', cents: null, invoicedCents: 0 })
    expect(v.margin.actual.gaps).toContain('not_invoiced')
    await reviewOutcome(t.db, d.jobId, 'passed')
    expect((await issue((await invoicesOf(d.jobId)).final as Invoice)).statusCode).toBe(200)
    v = await costs(d.jobId)
    // The final invoice holds the whole price and credits the deposit: $1,200.00 once.
    expect(v.margin.revenue).toMatchObject({ state: 'complete', cents: 120_000, invoicedCents: 120_000 })
    // No visit and no cost confirmed: the actual margin stays incomplete, never a misleading number.
    expect(v.margin.actual).toMatchObject({ state: 'incomplete', marginBps: null, gaps: ['costs_incomplete'] })
  })
})
