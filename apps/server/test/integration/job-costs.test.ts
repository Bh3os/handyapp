// Estimated versus actual job costs and report source states against PostgreSQL 16 (TSK-0095; HH-FIN-17,
// HH-DATA-10, HH-QA-08, T73, ENT-Job, ENT-TimeStamp, OWN-DEC-69, OWN-DEC-189, RULE-MONEY-CENTS,
// RULE-NO-INVENTED-FACTS, RULE-SERVER-AUTHZ). Staff, customers, addresses, texts, amounts and evidence are synthetic
// (RULE-SYNTHETIC-DATA); the estimate terms version recorded below is a fixture of this throwaway database.
// - Visits are fixtures in the first hours of today's local date (as in return-work.test.ts), so On my way is open at
//   any hour the suite runs; dates come from localDateOf(now, America/Kentucky/Louisville), never a weekday or a
//   24-hour count. A worker's Finished is written straight into this throwaway database (Finished through the route
//   needs the whole checklist, walked by completion.test.ts), with the database's own guard checking it.
// - Assertions read the records this file creates: no global totals.
import { randomUUID } from 'node:crypto'
import {
  createDb,
  loadLoadoutSeed,
  loadServiceSeed,
  loadSopSeed,
  syncLoadouts,
  syncServices,
  syncSops,
  withTx,
  type Db,
} from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import {
  addLocalDays,
  DERIVED_STATE_RECORDS,
  JOB_COST_LINES,
  localClockOf,
  localDateOf,
  offsetMinutesAt,
  REPORT_DEFINITIONS,
  resolveLocalTime,
  resolveWindow,
} from '@handyhub/domain'
import { ESTIMATE_TERMS } from '@handyhub/domain/legal'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { startCustomerSession } from '../../src/modules/identity/customer-sessions.js'
import { readCodeKey, type CodeKeySettings } from '../../src/modules/identity/index.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import { recordPolicyVersion } from '../../src/platform/config/index.js'
import { FakeObjectStorage } from '../../src/providers/r2/index.js'
import { verifyCountyOf } from '../fixtures/county.js'
import { testConfig } from '../fixtures/env.js'
import { signInWithMfa } from '../fixtures/staff-mfa.js'
import { verifyPropertyZone } from '../fixtures/zones.js'

const ZONE = 'America/Kentucky/Louisville'
const KEY: CodeKeySettings = readCodeKey({
  HANDYHUB_ENV: 'ci',
  CODE_HASH_KEY: ['synthetic', 'job', 'cost', 'code', 'key', 'for', 'tests', 'only', '0109'].join('-'),
})
const pw = ['synthetic', 'job', 'cost', 'passphrase', '95'].join(' ')
const PEOPLE = ['owner', 'office', 'estimator', 'ann', 'ben'] as const
type Person = (typeof PEOPLE)[number]

let t: TestDatabase
let wide: Db
let app: FastifyInstance
const cookies = {} as Record<Person, string>
const csrf = {} as Record<Person, string>
const ids = {} as Record<Person, string>
const today = () => localDateOf(new Date(), ZONE)

async function signIn(p: Person) {
  const res = await signInWithMfa(app, {
    method: 'POST',
    url: '/api/v1/staff/auth/sign-in',
    headers: { 'x-forwarded-for': '198.51.100.195' },
    payload: { email: `${p}-cost@example.test`, password: pw },
  })
  expect(res.statusCode, res.body).toBe(200)
  const cookie = String(res.headers['set-cookie']).split(';')[0] as string
  const session = await app.inject({ method: 'GET', url: '/api/v1/staff/auth/session', headers: { cookie } })
  cookies[p] = cookie
  csrf[p] = session.json<{ csrfToken: string }>().csrfToken
}

let seq = 0
const key = () => `synthetic-cost-${String(++seq).padStart(6, '0')}-${randomUUID()}`
function staffWrite(who: Person, url: string, payload: unknown, version?: number, method: 'POST' | 'PUT' = 'POST') {
  return app.inject({
    method,
    url,
    payload: payload as object,
    headers: {
      cookie: cookies[who],
      'x-csrf-token': csrf[who],
      'idempotency-key': key(),
      ...(version === undefined ? {} : { 'if-match': `"${version}"` }),
    },
  })
}
const staffGet = (who: Person, url: string) => app.inject({ method: 'GET', url, headers: { cookie: cookies[who] } })
type Err = { error: { code: string; fieldErrors: { field: string; code: string }[] } }
const codesOf = (res: { json: <T>() => T }) => res.json<Err>().error.fieldErrors.map((f) => f.code)

beforeAll(async () => {
  t = await createTestDatabase()
  wide = createDb(t.url, { max: 8, applicationName: 'job-costs-test' })
  await syncServices(t.db, loadServiceSeed())
  await syncSops(t.db, loadSopSeed())
  await syncLoadouts(t.db, loadLoadoutSeed())
  app = await buildApp({
    config: testConfig({ TRUST_PROXY_HOPS: '1' }),
    api: { db: wide, codeKey: KEY, storage: new FakeObjectStorage() },
  })
  const hash = await hashPassword(pw)
  await withTx(t.db, async (tx) => {
    for (const p of PEOPLE) {
      const role = p === 'ann' || p === 'ben' ? 'worker' : p
      const user = await createStaffUser(tx, {
        email: `${p}-cost@example.test`,
        displayName: `Synthetic ${p}`,
        locale: 'en',
        role,
        issuedBy: 'test',
      })
      await setPasswordHash(tx, user.id, hash)
      ids[p] = user.id
    }
  })
  for (const p of PEOPLE) await signIn(p)
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
})
afterAll(async () => {
  await app?.close()
  await wide?.destroy()
  await t?.drop()
})

// --- Fixtures --------------------------------------------------------------------------------------------------------

const ALL_OK = Object.fromEntries(
  ['coverage', 'service_fit', 'essential_facts', 'urgency', 'site_visit_need', 'staff_equipment', 'risk_flags'].map(
    (c) => [c, { outcome: 'ok' }],
  ),
)
type Project = { requestId: string; projectId: string; propertyId: string; reference: string; cookie: string }
let ip = 40

/** A qualified synthetic request with one DW-01 work package, and a verified customer session for its project. */
async function project(): Promise<Project> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/public/requests',
    headers: { 'idempotency-key': key(), 'x-forwarded-for': `198.51.100.${++ip}` },
    payload: {
      formVersion: 'test-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-01' }],
      notSure: false,
      description: 'Synthetic job-cost project.',
      answers: [],
      property: {
        street: `${++seq} Synthetic Cost Lane`,
        city: 'Testville',
        state: 'ky',
        zip: '40000',
        propertyType: 'house',
      },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'site_visit',
      contact: {
        fullName: 'Synthetic Cost Customer',
        email: `cost-${seq}-${randomUUID().slice(0, 8)}@example.test`,
        phone: '(502) 555-0178',
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
    .select(['r.id', 'r.project_id', 'r.contact_id', 'p.property_id'])
    .where('r.reference', '=', reference)
    .executeTakeFirstOrThrow()
  await verifyCountyOf(t.db, row.project_id)
  await verifyPropertyZone(t.db, { projectId: row.project_id })
  const grant = await t.db
    .selectFrom('identity.project_access_grants')
    .select('id')
    .where('request_id', '=', row.id)
    .executeTakeFirstOrThrow()
  const q = await app.inject({
    method: 'PUT',
    url: `/api/v1/staff/requests/${row.id}/qualification`,
    payload: { checks: ALL_OK },
    headers: { cookie: cookies.owner, 'x-csrf-token': csrf.owner, 'idempotency-key': key(), 'if-match': '"0"' },
  })
  expect(q.statusCode, q.body).toBe(200)
  const moved = await staffWrite(
    'owner',
    `/api/v1/staff/requests/${row.id}/actions/estimate-visit`,
    { customerExplanation: 'We need to see the synthetic wall.', workPackages: ['SVC-DW-01'] },
    1,
  )
  expect(moved.statusCode, moved.body).toBe(200)
  const s = await withTx(t.db, (tx) =>
    startCustomerSession(tx, {
      contactRef: row.contact_id,
      via: 'grant',
      projectIds: [row.project_id],
      verifiedAt: new Date(),
      grantId: grant.id,
    }),
  )
  return {
    requestId: row.id,
    projectId: row.project_id,
    propertyId: row.property_id,
    reference,
    cookie: `__Host-hh_customer=${s.token}`,
  }
}

type Line = { description: string; unitPriceCents: number; materialCostCents?: number; laborCostCents?: number }

/** Approves the lines (with their internal costs) through the real approval transaction; returns the job. */
async function approve(p: Project, lines: Line[]): Promise<string> {
  const created = await staffWrite('estimator', `/api/v1/staff/projects/${p.projectId}/estimates`, {})
  expect(created.statusCode, created.body).toBe(201)
  const c = created.json<{ number: string; versionId: string }>()
  const v = (await staffGet('estimator', `/api/v1/staff/estimate-versions/${c.versionId}`)).json<{
    rowVersion: number
    workPackages: { id: string }[]
  }>()
  const saved = await app.inject({
    method: 'PUT',
    url: `/api/v1/staff/estimate-versions/${c.versionId}/draft`,
    payload: {
      lines: lines.map((l) => ({
        kind: 'base',
        workPackageId: v.workPackages[0]?.id,
        description: l.description,
        quantity: '1',
        unit: 'patch',
        unitPriceCents: l.unitPriceCents,
        ...(l.materialCostCents === undefined && l.laborCostCents === undefined
          ? {}
          : {
              internalCost: {
                ...(l.materialCostCents === undefined ? {} : { materialCostCents: l.materialCostCents }),
                ...(l.laborCostCents === undefined ? {} : { laborCostCents: l.laborCostCents }),
              },
            }),
      })),
      texts: { exclusions: ['Synthetic: moving furniture'] },
    },
    headers: {
      cookie: cookies.estimator,
      'x-csrf-token': csrf.estimator,
      'idempotency-key': key(),
      'if-match': `"${v.rowVersion}"`,
    },
  })
  expect(saved.statusCode, saved.body).toBe(200)
  const pub = await staffWrite(
    'estimator',
    `/api/v1/staff/estimate-versions/${c.versionId}/publish`,
    {},
    saved.json<{ rowVersion: number }>().rowVersion,
  )
  expect(pub.statusCode, pub.body).toBe(200)
  const base = `/api/v1/customer/projects/${p.reference}/estimates/${c.number}/versions/1`
  const d = (await app.inject({ method: 'GET', url: base, headers: { cookie: p.cookie } })).json<{
    approval: { contentDigest: string; selection: { totalCents: number; deposit: { amountCents: number | null } } }
  }>()
  const res = await app.inject({
    method: 'POST',
    url: `${base}/approve`,
    headers: {
      cookie: p.cookie,
      'idempotency-key': key(),
      'x-forwarded-for': `2001:db8:95:${++ip}::1`,
      'user-agent': 'SyntheticBrowser/1.0 (test)',
    },
    payload: {
      contentDigest: d.approval.contentDigest,
      options: [],
      totalCents: d.approval.selection.totalCents,
      depositCents: d.approval.selection.deposit.amountCents,
      termsDocumentId: ESTIMATE_TERMS.documentId,
      termsSha256: ESTIMATE_TERMS.contentSha256,
      acceptTerms: true,
      fullName: 'Synthetic Cost Customer',
    },
  })
  expect(res.statusCode, res.body).toBe(201)
  return (
    await t.db.selectFrom('work.jobs').select('id').where('project_id', '=', p.projectId).executeTakeFirstOrThrow()
  ).id
}

const SLOT_MINUTES = 30
const taken = new Map<string, Set<number>>()
/** The first free 30-minute slot after local midnight of `date` for the team (see my-day.test.ts). */
function fixtureWindow(date: string, team: Person[]) {
  const midnight = resolveLocalTime(date, '00:00', ZONE)
  if (midnight.kind !== 'unique') throw new Error('fixture midnight')
  for (let k = 0; k < 24; k++) {
    if (team.some((who) => taken.get(`${date}|${who}`)?.has(k))) continue
    const startsAt = new Date(midnight.at.instant.getTime() + k * SLOT_MINUTES * 60_000)
    const endsAt = new Date(startsAt.getTime() + (SLOT_MINUTES / 2) * 60_000)
    if (localDateOf(startsAt, ZONE) !== date) break
    const w = resolveWindow({
      date,
      start: localClockOf(startsAt, ZONE),
      end: localClockOf(endsAt, ZONE),
      zone: ZONE,
      startOffsetMinutes: offsetMinutesAt(startsAt, ZONE),
      endOffsetMinutes: offsetMinutesAt(endsAt, ZONE),
    })
    if (!w.ok) continue
    for (const who of team) {
      const set = taken.get(`${date}|${who}`) ?? new Set<number>()
      set.add(k)
      taken.set(`${date}|${who}`, set)
    }
    return w.window
  }
  throw new Error('fixture window')
}
/** A confirmed visit today for the team (lead first). */
async function fixtureVisit(
  p: Project,
  jobId: string,
  team: Person[],
  purpose: 'service' | 'return_work' = 'service',
): Promise<string> {
  const window = fixtureWindow(today(), team)
  return withTx(t.db, async (tx) => {
    const v = await tx
      .insertInto('work.visits')
      .values({
        purpose,
        project_id: p.projectId,
        job_id: jobId,
        property_id: p.propertyId,
        local_date: window.date,
        window_start: window.start,
        window_end: window.end,
        time_zone: ZONE,
        start_offset_minutes: window.startOffsetMinutes,
        end_offset_minutes: window.endOffsetMinutes,
        starts_at: window.startsAt,
        ends_at: window.endsAt,
        window_set_by: ids.office,
        expected_duration_minutes: SLOT_MINUTES / 2,
        preparation_buffer_minutes: 0,
        travel_buffer_minutes: 0,
        required_workers: team.length,
        created_by: ids.office,
      })
      .returning(['id', 'version'])
      .executeTakeFirstOrThrow()
    for (const [i, who] of team.entries())
      await tx
        .insertInto('work.reservations')
        .values({
          visit_id: v.id,
          resource: 'worker',
          staff_user_id: ids[who],
          role: i === 0 ? 'lead' : 'member',
          kind: 'confirmed',
          starts_at: window.startsAt,
          ends_at: new Date(window.endsAt.getTime() + (SLOT_MINUTES / 2) * 60_000),
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
const tap = async (who: Person, visitId: string, what: 'on-my-way' | 'arrived') => {
  const res = await staffWrite(who, `/api/v1/staff/visits/${visitId}/${what}`, {})
  expect(res.statusCode, res.body).toBe(200)
}
/** The worker's Finished, written by the database's own guard (it needs the visit arrived and their Arrived). */
async function finished(p: Project, jobId: string, visitId: string, who: Person) {
  await t.db
    .insertInto('work.time_stamps')
    .values({ visit_id: visitId, project_id: p.projectId, job_id: jobId, staff_user_id: ids[who], kind: 'finished' })
    .execute()
}

type Figure = { state: string; cents: number | null }
type CostsView = {
  jobId: string
  estimate: { number: string | null; version: number | null } | null
  changeOrders: number
  lines: {
    line: string
    estimated: Figure
    actual: Figure
    varianceCents: number | null
    confirmed: { by: { id: string } | null; at: string | null } | null
    actions: { confirm: boolean; reopen: boolean }
  }[]
  totals: { estimated: Figure; actual: Figure; varianceCents: number | null; incompleteLines: string[] }
  labor: {
    minutes: number
    minutesComplete: boolean
    unknownTimes: number
    times: { visitId: string; staffUserId: string; minutes: number | null; flagged: boolean }[]
  }
  entries: {
    id: string
    category: string
    amountCents: number
    incurredOn: string
    voided: { reason: string | null } | null
    actions: { void: boolean }
  }[]
  returnWork: { cost: Figure; entries: number; caseIds: string[] }
  history: { event: string; category: string; note: string | null }[]
  report: { id: string; basis: string; unknown: string; includes: { record: string }[]; excludes: { record: string }[] }
  actions: { record: boolean }
}
async function costs(jobId: string, who: Person = 'owner'): Promise<CostsView> {
  const res = await staffGet(who, `/api/v1/staff/jobs/${jobId}/costs`)
  expect(res.statusCode, res.body).toBe(200)
  return res.json<CostsView>()
}
const lineOf = (v: CostsView, line: string) => v.lines.find((l) => l.line === line) as CostsView['lines'][number]
const record = (jobId: string, body: Record<string, unknown>, who: Person = 'owner') =>
  staffWrite(who, `/api/v1/staff/jobs/${jobId}/costs`, {
    category: 'materials',
    amountCents: 12_345,
    incurredOn: today(),
    note: 'Synthetic: joint compound and tape',
    ...body,
  })
const confirm = (jobId: string, category: string, who: Person = 'owner') =>
  staffWrite(who, `/api/v1/staff/jobs/${jobId}/cost-categories/${category}/actions/confirm`, {})
const reopen = (jobId: string, category: string, reason: string) =>
  staffWrite('owner', `/api/v1/staff/jobs/${jobId}/cost-categories/${category}/actions/reopen`, { reason })

// --- The report ------------------------------------------------------------------------------------------------------

describe('[HH-FIN-17][HH-DATA-10][T73] a job shows estimated versus actual costs; missing cost is incomplete, never zero', () => {
  let p: Project
  let jobId: string

  beforeAll(async () => {
    p = await project()
    jobId = await approve(p, [
      {
        description: 'Patch the synthetic wall',
        unitPriceCents: 60_000,
        materialCostCents: 20_000,
        laborCostCents: 30_000,
      },
    ])
  })

  it('reads the estimate from the approved version and shows nothing recorded as not recorded, never $0.00', async () => {
    const v = await costs(jobId)
    expect(v.estimate?.version).toBe(1)
    expect(v.changeOrders).toBe(0)
    expect(v.lines.map((l) => l.line)).toEqual([...JOB_COST_LINES])
    expect(lineOf(v, 'materials').estimated).toEqual({ state: 'complete', cents: 20_000 })
    expect(lineOf(v, 'labor').estimated).toEqual({ state: 'complete', cents: 30_000 })
    expect(lineOf(v, 'rental').estimated).toEqual({ state: 'not_estimated', cents: null })
    expect(v.totals.estimated).toEqual({ state: 'complete', cents: 50_000 })
    // Actual: nothing recorded is not recorded; labor and burden cost need rates that are NOT CONFIGURED.
    expect(lineOf(v, 'materials').actual).toEqual({ state: 'not_recorded', cents: null })
    expect(lineOf(v, 'labor').actual).toEqual({ state: 'not_configured', cents: null })
    expect(lineOf(v, 'burden').actual).toEqual({ state: 'not_configured', cents: null })
    for (const l of v.lines) {
      expect(l.actual.cents, l.line).toBeNull()
      expect(l.varianceCents, l.line).toBeNull()
    }
    expect(v.totals.actual).toEqual({ state: 'not_recorded', cents: null })
    expect(v.totals.varianceCents).toBeNull()
    expect(v.totals.incompleteLines).toEqual([...JOB_COST_LINES])
    expect(v.returnWork.cost).toEqual({ state: 'not_recorded', cents: null })
    expect(v.actions.record).toBe(true)
    // The report states its sources.
    expect(v.report.id).toBe('job_costs')
    expect(v.report.basis).toBe('job_costs')
    expect(v.report.unknown).toBe('incomplete')
    expect(v.report.includes.map((s) => s.record)).toContain('finance.job_costs')
    expect(v.report.excludes.map((s) => s.record)).toContain('quality.return_work_costs')
  })

  it('[RULE-SERVER-AUTHZ] keeps job costs to the Owner (PROPOSED cell)', async () => {
    for (const who of ['office', 'estimator', 'ann'] as const) {
      expect((await staffGet(who, `/api/v1/staff/jobs/${jobId}/costs`)).statusCode, who).toBe(403)
      expect((await record(jobId, {}, who)).statusCode, who).toBe(403)
      expect((await confirm(jobId, 'materials', who)).statusCode, who).toBe(403)
    }
    expect((await app.inject({ method: 'GET', url: `/api/v1/staff/jobs/${jobId}/costs` })).statusCode).toBe(401)
    expect((await staffGet('owner', `/api/v1/staff/jobs/${randomUUID()}/costs`)).statusCode).toBe(404)
  })

  it('records entries in cents as incomplete until the Owner confirms the category', async () => {
    const res = await record(jobId, {})
    expect(res.statusCode, res.body).toBe(201)
    let v = res.json<CostsView>()
    expect(lineOf(v, 'materials').actual).toEqual({ state: 'incomplete', cents: 12_345 })
    expect(lineOf(v, 'materials').varianceCents).toBeNull()
    expect(v.totals.actual).toEqual({ state: 'incomplete', cents: 12_345 })
    const costId = v.entries[0]?.id as string
    const audits = await t.db
      .selectFrom('platform.audit_events')
      .select(['action', 'target_type', 'summary'])
      .where('target_id', '=', costId)
      .execute()
    expect(audits).toEqual([
      {
        action: 'job_cost.record',
        target_type: 'job_cost',
        summary: { projectId: p.projectId, jobId, category: 'materials', amountCents: 12_345 },
      },
    ])
    // A second materials entry and a rental.
    expect((await record(jobId, { amountCents: 655 })).statusCode).toBe(201)
    expect(
      (await record(jobId, { category: 'rental', amountCents: 4_000, note: 'Synthetic: a ladder' })).statusCode,
    ).toBe(201)
    v = await costs(jobId)
    expect(lineOf(v, 'materials').actual).toEqual({ state: 'incomplete', cents: 13_000 })
    expect(lineOf(v, 'rental').actual).toEqual({ state: 'incomplete', cents: 4_000 })

    // Confirmed: final, with its variance against the estimate.
    const c = await confirm(jobId, 'materials')
    expect(c.statusCode, c.body).toBe(200)
    v = c.json<CostsView>()
    expect(lineOf(v, 'materials').actual).toEqual({ state: 'complete', cents: 13_000 })
    expect(lineOf(v, 'materials').varianceCents).toBe(-7_000)
    expect(lineOf(v, 'materials').confirmed?.by?.id).toBe(ids.owner)
    expect(lineOf(v, 'materials').actions).toEqual({ confirm: false, reopen: true })
    // The actual total stays incomplete: labor and burden cost are NOT CONFIGURED.
    expect(v.totals.actual).toEqual({ state: 'incomplete', cents: 17_000 })
    expect(v.totals.varianceCents).toBeNull()
    // A category with no entry confirmed: an explicit $0.00, the only zero shown.
    v = (await confirm(jobId, 'disposal')).json<CostsView>()
    expect(lineOf(v, 'disposal').actual).toEqual({ state: 'complete', cents: 0 })
    expect(codesOf(await confirm(jobId, 'disposal'))).toEqual(['CATEGORY_CONFIRMED'])
  })

  it('refuses writes into a confirmed category until it is reopened with a reason', async () => {
    const refused = await record(jobId, { amountCents: 100 })
    expect(refused.statusCode).toBe(409)
    expect(codesOf(refused)).toEqual(['CATEGORY_CONFIRMED'])
    let v = await costs(jobId)
    const first = v.entries.find((e) => e.category === 'materials') as CostsView['entries'][number]
    expect(first.actions.void).toBe(false)
    const voidRefused = await staffWrite('owner', `/api/v1/staff/job-costs/${first.id}/actions/void`, {
      reason: 'Synthetic: entered twice',
    })
    expect(codesOf(voidRefused)).toEqual(['CATEGORY_CONFIRMED'])
    expect((await reopen(jobId, 'materials', '')).statusCode).toBe(400)
    const r = await reopen(jobId, 'materials', 'Synthetic: a late supplier invoice arrived')
    expect(r.statusCode, r.body).toBe(200)
    expect(lineOf(r.json<CostsView>(), 'materials').actual).toEqual({ state: 'incomplete', cents: 13_000 })
    expect(codesOf(await reopen(jobId, 'materials', 'Synthetic: again'))).toEqual(['CATEGORY_NOT_CONFIRMED'])
    const voided = await staffWrite('owner', `/api/v1/staff/job-costs/${first.id}/actions/void`, {
      reason: 'Synthetic: entered twice',
    })
    expect(voided.statusCode, voided.body).toBe(200)
    v = voided.json<CostsView>()
    expect(lineOf(v, 'materials').actual).toEqual({ state: 'incomplete', cents: 655 })
    expect(v.entries.find((e) => e.id === first.id)?.voided?.reason).toBe('Synthetic: entered twice')
    expect(
      codesOf(await staffWrite('owner', `/api/v1/staff/job-costs/${first.id}/actions/void`, { reason: 'x' })),
    ).toEqual(['COST_VOIDED'])
    expect(v.history.map((h) => h.event)).toEqual([
      'cost_recorded',
      'cost_recorded',
      'cost_recorded',
      'category_confirmed',
      'category_confirmed',
      'category_reopened',
      'cost_voided',
    ])
  })

  it('refuses a date after today in the business time zone, a fraction, zero and unknown fields', async () => {
    const future = await record(jobId, { incurredOn: addLocalDays(today(), 1) })
    expect(future.statusCode).toBe(400)
    expect(codesOf(future)).toEqual(['IN_FUTURE'])
    expect((await record(jobId, { amountCents: 0 })).statusCode).toBe(400)
    expect((await record(jobId, { amountCents: 10.5 })).statusCode).toBe(400)
    expect((await record(jobId, { category: 'labor' })).statusCode).toBe(400)
    expect((await record(jobId, { laborRateCents: 2_500 })).statusCode).toBe(400)
    expect((await record(jobId, { incurredOn: addLocalDays(today(), -30) })).statusCode).toBe(201)
  })

  it('serializes an entry and the confirmation of its category: the confirmed figure is what was recorded', async () => {
    const [a, b] = await Promise.all([
      record(jobId, { category: 'subcontractor', amountCents: 50_000, note: 'Synthetic: drywall finisher' }),
      confirm(jobId, 'subcontractor'),
    ])
    expect(b.statusCode, b.body).toBe(200)
    expect([201, 409]).toContain(a.statusCode)
    const v = await costs(jobId)
    const live = v.entries.filter((e) => e.category === 'subcontractor' && !e.voided)
    expect(lineOf(v, 'subcontractor').actual).toEqual({
      state: 'complete',
      cents: live.reduce((s, e) => s + e.amountCents, 0),
    })
  })
})

describe('[HH-FIN-17][OWN-DEC-69] labor is elapsed time per worker; its cost is NOT CONFIGURED', () => {
  it('counts known time, flags unknown time and leaves return visits apart', async () => {
    const p = await project()
    const jobId = await approve(p, [{ description: 'Patch the synthetic ceiling', unitPriceCents: 30_000 }])
    const visitId = await fixtureVisit(p, jobId, ['ann', 'ben'])
    await tap('ann', visitId, 'on-my-way')
    await tap('ann', visitId, 'arrived')
    await tap('ben', visitId, 'arrived')
    await finished(p, jobId, visitId, 'ann')
    let v = await costs(jobId)
    const times = v.labor.times.filter((x) => x.visitId === visitId)
    expect(times.map((x) => x.staffUserId).sort()).toEqual([ids.ann, ids.ben].sort())
    const ann = times.find((x) => x.staffUserId === ids.ann)
    const ben = times.find((x) => x.staffUserId === ids.ben)
    expect(ann?.minutes).toBeGreaterThanOrEqual(0)
    expect(ben?.minutes).toBeNull()
    expect(v.labor.minutesComplete).toBe(false)
    expect(v.labor.unknownTimes).toBe(1)
    expect(lineOf(v, 'labor').actual).toEqual({ state: 'not_configured', cents: null })
    // No internal cost on the line: the estimate is not recorded, never $0.00.
    expect(lineOf(v, 'materials').estimated).toEqual({ state: 'not_recorded', cents: null })
    expect(v.totals.estimated).toEqual({ state: 'not_recorded', cents: null })

    // A return visit's time is the return work's, never the job's (HH-QA-08).
    const returnVisit = await fixtureVisit(p, jobId, ['ann'], 'return_work')
    await tap('ann', returnVisit, 'on-my-way')
    await tap('ann', returnVisit, 'arrived')
    v = await costs(jobId)
    expect(v.labor.times.some((x) => x.visitId === returnVisit)).toBe(false)
  })
})

describe('[HH-QA-08][HH-FIN-17] return-work costs are shown apart from the job', () => {
  it('reads the return work costs of the job without adding them to its own', async () => {
    const p = await project()
    const jobId = await approve(p, [{ description: 'Patch the synthetic closet', unitPriceCents: 20_000 }])
    const opened = await staffWrite('office', `/api/v1/staff/projects/${p.projectId}/complaints`, {
      category: 'work_quality',
      severity: 'moderate',
      source: 'call',
      assignedTo: ids.office,
      dueOn: addLocalDays(today(), 3),
      description: 'Synthetic: the customer says a corner is unfinished.',
      jobId,
    })
    expect(opened.statusCode, opened.body).toBe(201)
    const { caseId } = opened.json<{ caseId: string }>()
    const classified = await staffWrite(
      'office',
      `/api/v1/staff/cases/${caseId}/return-work`,
      { classification: 'open_punch' },
      0,
      'PUT',
    )
    expect(classified.statusCode, classified.body).toBe(200)
    const { returnWorkId } = classified.json<{ returnWorkId: string }>()
    const cost = await staffWrite('office', `/api/v1/staff/return-work/${returnWorkId}/costs`, {
      kind: 'materials',
      amountCents: 1_250,
      note: 'Synthetic: corner bead',
    })
    expect(cost.statusCode, cost.body).toBe(201)
    const v = await costs(jobId)
    expect(v.returnWork).toEqual({ cost: { state: 'incomplete', cents: 1_250 }, entries: 1, caseIds: [caseId] })
    expect(lineOf(v, 'materials').actual).toEqual({ state: 'not_recorded', cents: null })
    expect(v.totals.actual).toEqual({ state: 'not_recorded', cents: null })
  })
})

describe('[HH-FIN-17][RULE-MONEY-CENTS] the database keeps job costs true whatever path writes', () => {
  let p: Project
  let jobId: string
  beforeAll(async () => {
    p = await project()
    jobId = await approve(p, [{ description: 'Patch the synthetic hall', unitPriceCents: 10_000 }])
  })
  const insert = (values: Record<string, unknown> = {}) =>
    t.db
      .insertInto('finance.job_costs')
      .values({
        job_id: jobId,
        project_id: p.projectId,
        category: 'other',
        amount_cents: 500,
        incurred_on: today(),
        note: 'Synthetic: parking',
        recorded_by: ids.owner,
        ...values,
      })
      .returning('id')
      .executeTakeFirstOrThrow()

  it('never changes or deletes an entry, voids it once with a reason, and keeps amounts in whole cents', async () => {
    const { id } = await insert()
    await expect(
      t.db.updateTable('finance.job_costs').set({ amount_cents: 1 }).where('id', '=', id).execute(),
    ).rejects.toThrow(/only voided/)
    await expect(t.db.deleteFrom('finance.job_costs').where('id', '=', id).execute()).rejects.toThrow(/never deleted/)
    await expect(
      t.db.updateTable('finance.job_costs').set({ voided_at: new Date() }).where('id', '=', id).execute(),
    ).rejects.toThrow(/job_costs_void/)
    await expect(insert({ amount_cents: 0 })).rejects.toThrow(/amount_cents/)
    await expect(insert({ category: 'labor' })).rejects.toThrow(/category/)
    await expect(insert({ project_id: randomUUID() })).rejects.toThrow(/job_costs_job/)
  })

  it('confirms and reopens only by a live Owner, alternately, and refuses entries in a confirmed category', async () => {
    const event = (actor: string, ev: string, note: string | null = null) =>
      t.db
        .insertInto('finance.job_cost_events')
        .values({ job_id: jobId, project_id: p.projectId, event: ev, category: 'other', actor_id: actor, note })
        .execute()
    await expect(event(ids.office, 'category_confirmed')).rejects.toThrow(/only an Owner/)
    await event(ids.owner, 'category_confirmed')
    await expect(event(ids.owner, 'category_confirmed')).rejects.toThrow(/already confirmed/)
    await expect(insert()).rejects.toThrow(/reopen the category first/)
    await expect(event(ids.owner, 'category_reopened')).rejects.toThrow(/job_cost_events_reason/)
    await event(ids.owner, 'category_reopened', 'Synthetic: one more receipt')
    await insert()
    await expect(
      t.db.updateTable('finance.job_cost_events').set({ note: 'x' }).where('job_id', '=', jobId).execute(),
    ).rejects.toThrow()
  })
})

// --- Report sources --------------------------------------------------------------------------------------------------

describe("[HH-DATA-10][HH-FIN-17][T73] every report states its sources, in the database's own states", () => {
  it('lists the definitions for the Owner only', async () => {
    const res = await staffGet('owner', '/api/v1/staff/reports/sources')
    expect(res.statusCode, res.body).toBe(200)
    const { reports } = res.json<{ reports: { id: string; basis: string; includes: unknown[] }[] }>()
    expect(reports.map((r) => r.id)).toEqual(REPORT_DEFINITIONS.map((d) => d.id))
    for (const r of reports) expect(r.includes.length, r.id).toBeGreaterThan(0)
    expect(reports.find((r) => r.id === 'payments_received')?.basis).toBe('cash_received')
    for (const who of ['office', 'estimator', 'ann'] as const)
      expect((await staffGet(who, '/api/v1/staff/reports/sources')).statusCode, who).toBe(403)
  })

  it('names only tables, columns and states the database has', async () => {
    for (const d of REPORT_DEFINITIONS) {
      for (const s of [...d.includes, ...d.excludes]) {
        const [schema, table] = s.record.split('.') as [string, string]
        const cols = await sql<{ column_name: string }>`
          SELECT column_name FROM information_schema.columns WHERE table_schema = ${schema} AND table_name = ${table}`
          .execute(t.db)
          .then((r) => r.rows.map((x) => x.column_name))
        expect(cols.length, s.record).toBeGreaterThan(0)
        const checks = await sql<{ def: string }>`
          SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
          WHERE conrelid = ${s.record}::regclass AND contype = 'c'`
          .execute(t.db)
          .then((r) => r.rows.map((x) => x.def))
        for (const [column, values] of Object.entries(s.where)) {
          // A cost entry's state is derived from its void (recorded or voided), not stored.
          if (column === 'state' && (DERIVED_STATE_RECORDS as readonly string[]).includes(s.record)) {
            expect(cols, s.record).toContain('voided_at')
            expect(['recorded', 'voided']).toEqual(expect.arrayContaining([...values]))
            continue
          }
          expect(cols, `${s.record}.${column}`).toContain(column)
          for (const value of values)
            expect(
              checks.some((c) => c.includes(`(${column} = `) && c.includes(`'${value}'::text`)),
              `${d.id}: ${s.record}.${column} = ${value}`,
            ).toBe(true)
        }
      }
    }
  })
})
