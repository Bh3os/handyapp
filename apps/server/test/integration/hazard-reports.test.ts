// Stop Work, Report Hazard, critical holds and issue reports against PostgreSQL 16 (TSK-0077; HH-WORK-08, HH-WORK-09,
// HH-WORK-13, HH-CHG-04, HH-INC-02, HH-OFF-03, T48, T54, ENT-IssueReport, ENT-Hold, OWN-DEC-38, OWN-DEC-80, OWN-DEC-143,
// OWN-DEC-152, OWN-DEC-172, RULE-SAFETY-GATES, RULE-HUMAN-REVIEW, RULE-SERVER-AUTHZ). Staff, customers, addresses,
// texts and evidence are synthetic (RULE-SYNTHETIC-DATA); the estimate terms version recorded below is a fixture of
// this throwaway database.
// - Visits are fixtures in the first hours of today's local date (as in start-work.test.ts), so On my way is open at
//   any hour the suite runs; dates come from localDateOf(now, America/Kentucky/Louisville), never a weekday.
// - One critical hold is still written straight to its table as a fixture (an "other hold" that already exists when a
//   Stop Work is reported); every other critical hold here is written by the Stop Work route itself.
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
import { localClockOf, localDateOf, offsetMinutesAt, resolveLocalTime, resolveWindow } from '@handyhub/domain'
import { ESTIMATE_TERMS } from '@handyhub/domain/legal'
import { decide, type StaffActor } from '@handyhub/policy'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { workPausedDraftAutomation, workPausedRecordCheck } from '../../src/modules/hazards/index.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { startCustomerSession } from '../../src/modules/identity/customer-sessions.js'
import { readCodeKey, type CodeKeySettings } from '../../src/modules/identity/index.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import { releaseAutomation } from '../../src/modules/notifications/index.js'
import { createAutomationRegistry } from '../../src/platform/automation.js'
import { recordPolicyVersion } from '../../src/platform/config/index.js'
import { createWorker } from '../../src/platform/jobs.js'
import { FakeObjectStorage } from '../../src/providers/r2/index.js'
import { verifyCountyOf } from '../fixtures/county.js'
import { testConfig } from '../fixtures/env.js'
import { png } from '../fixtures/images.js'
import { signInWithMfa } from '../fixtures/staff-mfa.js'
import { verifyPropertyZone } from '../fixtures/zones.js'

const ZONE = 'America/Kentucky/Louisville'
const KEY: CodeKeySettings = readCodeKey({
  HANDYHUB_ENV: 'ci',
  CODE_HASH_KEY: ['synthetic', 'stop', 'work', 'code', 'key', 'for', 'tests', 'only', '0077'].join('-'),
})
const pw = ['synthetic', 'stop', 'work', 'passphrase', '77'].join(' ')
const PEOPLE = ['owner', 'office', 'estimator', 'ann', 'ben', 'cara', 'dee'] as const
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
    headers: { 'x-forwarded-for': '198.51.100.177' },
    payload: { email: `${p}-stop@example.test`, password: pw },
  })
  expect(res.statusCode, res.body).toBe(200)
  const cookie = String(res.headers['set-cookie']).split(';')[0] as string
  const session = await app.inject({ method: 'GET', url: '/api/v1/staff/auth/session', headers: { cookie } })
  cookies[p] = cookie
  csrf[p] = session.json<{ csrfToken: string }>().csrfToken
}

let seq = 0
const key = () => `synthetic-stop-${String(++seq).padStart(6, '0')}-${randomUUID()}`
function staffWrite(who: Person, url: string, payload: unknown, version?: number) {
  return app.inject({
    method: 'POST',
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
  wide = createDb(t.url, { max: 8, applicationName: 'hazard-reports-test' })
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
      const role = p === 'ann' || p === 'ben' || p === 'cara' || p === 'dee' ? 'worker' : p
      const user = await createStaffUser(tx, {
        email: `${p}-stop@example.test`,
        displayName: `Synthetic ${p}`,
        locale: p === 'ben' ? 'es' : 'en',
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
      description: 'Synthetic stop-work project.',
      answers: [],
      property: {
        street: `${++seq} Synthetic Stop Lane`,
        city: 'Testville',
        state: 'ky',
        zip: '40000',
        propertyType: 'house',
      },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'site_visit',
      contact: {
        fullName: 'Synthetic Stop Customer',
        email: `stop-${seq}-${randomUUID().slice(0, 8)}@example.test`,
        phone: '(502) 555-0177',
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

/** Approves one synthetic line through the real approval transaction; returns the job. */
async function approve(p: Project, unitPriceCents = 1250): Promise<string> {
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
      lines: [
        {
          kind: 'base',
          workPackageId: v.workPackages[0]?.id,
          description: 'Patch the synthetic wall',
          quantity: '1',
          unit: 'patch',
          unitPriceCents,
        },
      ],
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
      'x-forwarded-for': `2001:db8:77:${++ip}::1`,
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
      fullName: 'Synthetic Stop Customer',
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
/** A confirmed work visit today for the team (lead first). */
async function fixtureVisit(p: Project, jobId: string, team: Person[]): Promise<string> {
  const window = fixtureWindow(today(), team)
  return withTx(t.db, async (tx) => {
    const v = await tx
      .insertInto('work.visits')
      .values({
        purpose: 'service',
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
type Missing = {
  code: string
  ref: string | null
  severity: string
  resolutionOwner: string
  exceptionId: string | null
}
type Gate = {
  outcome: string
  items: { item: string; state: string; missing: Missing[] }[]
  packet: { version: number; contentSha256: string } | null
  workPackages: { workPackageId: string; serviceCode: string; beforePhotos: number }[]
  exceptions: { id: string; kind: string; state: string; ending: string | null; version: number }[]
  started: { startId: string } | null
  emergency: { call911: string }
  actions: { start: boolean; requestException: string[] }
}
async function gate(who: Person, visitId: string): Promise<Gate> {
  const res = await staffGet(who, `/api/v1/staff/visits/${visitId}/start-gate`)
  expect(res.statusCode, res.body).toBe(200)
  return res.json<Gate>()
}
const missingOf = (g: Gate) => g.items.flatMap((i) => i.missing.filter((m) => !m.exceptionId).map((m) => m.code))
const siteCheck = (who: Person, visitId: string, body: Partial<Record<string, unknown>> = {}) =>
  staffWrite(who, `/api/v1/staff/visits/${visitId}/site-checks`, {
    propertyConfirmed: true,
    accessAvailable: true,
    customerPresent: true,
    hazardsReviewed: true,
    siteCondition: 'as_described',
    ...body,
  })
let variant = 0
const photo = (who: Person, visitId: string, workPackageId: string) =>
  app.inject({
    method: 'POST',
    url: `/api/v1/staff/visits/${visitId}/before-photos?workPackageId=${workPackageId}`,
    payload: png(++variant),
    headers: { cookie: cookies[who], 'x-csrf-token': csrf[who], 'content-type': 'image/png' },
  })
async function loadAll(who: Person, jobId: string) {
  const v = (await staffGet(who, `/api/v1/staff/jobs/${jobId}/loadout`)).json<{
    packages: { workPackageId: string; groups: { items: { key: string }[] }[] }[]
  }>()
  for (const p of v.packages) {
    const items = p.groups.flatMap((g) => g.items.map((i) => ({ key: i.key, status: 'loaded' })))
    const res = await staffWrite(who, `/api/v1/staff/jobs/${jobId}/loadout/checks`, {
      workPackageId: p.workPackageId,
      items,
    })
    expect(res.statusCode, res.body).toBe(201)
  }
}
/** Views and acknowledges the job's current packet as the worker. */
async function review(who: Person, jobId: string) {
  const p = (await staffGet(who, `/api/v1/staff/jobs/${jobId}/packet`)).json<{
    packet: { version: number; contentSha256: string }
  }>()
  expect(
    (await staffWrite(who, `/api/v1/staff/jobs/${jobId}/packet/views`, { version: p.packet.version })).statusCode,
  ).toBe(200)
  const a = await staffWrite(who, `/api/v1/staff/jobs/${jobId}/packet/acknowledgments`, {
    version: p.packet.version,
    contentSha256: p.packet.contentSha256,
  })
  expect([200, 201], a.body).toContain(a.statusCode)
  return p.packet.version
}
/** Everything a worker does on arrival before pressing Start: taps, site check, photos, loadout, packet review. */
async function prepare(who: Person, visitId: string, jobId: string, opts: { photos?: boolean; check?: boolean } = {}) {
  const v = await t.db.selectFrom('work.visits').select('state').where('id', '=', visitId).executeTakeFirstOrThrow()
  if (v.state === 'confirmed') await tap(who, visitId, 'on-my-way')
  await tap(who, visitId, 'arrived')
  if (opts.check !== false) expect((await siteCheck(who, visitId)).statusCode).toBe(201)
  await loadAll(who, jobId)
  if (opts.photos !== false)
    for (const wp of (await gate(who, visitId)).workPackages)
      expect((await photo(who, visitId, wp.workPackageId)).statusCode).toBe(201)
  return review(who, jobId)
}
const start = (who: Person, visitId: string, packetVersion: number, extra: Record<string, unknown> = {}, query = '') =>
  staffWrite(who, `/api/v1/staff/visits/${visitId}/start${query}`, { packetVersion, ...extra })
const jobState = async (jobId: string) =>
  (await t.db.selectFrom('work.jobs').select('operational_state').where('id', '=', jobId).executeTakeFirstOrThrow())
    .operational_state
/** A critical safety hold as the hazard report of TSK-0077 will write it (the database takes the job lock). */
async function criticalHold(p: Project, jobId: string, raisedBy: Person, db: Db = t.db) {
  const r = await db
    .insertInto('work.holds')
    .values({
      kind: 'critical_safety',
      scope_type: 'job',
      scope_id: jobId,
      project_id: p.projectId,
      category: 'live_wiring',
      note: 'Synthetic: exposed wiring behind the patch',
      source: 'hazard_report',
      source_ref: `synthetic-hazard-${++seq}`,
      raised_by: ids[raisedBy],
    })
    .returning(['id', 'version'])
    .executeTakeFirstOrThrow()
  return r
}

// --- Stop Work helpers -------------------------------------------------------------------------------------------------

const registry = createAutomationRegistry([
  workPausedDraftAutomation(),
  releaseAutomation({ email: null, sms: null }, { recordChecks: { hazard_report: workPausedRecordCheck } }),
])
/** Runs the worker until nothing is left to do now (the work-paused draft and released notices). */
async function drain() {
  const w = createWorker({ db: t.db, registry })
  for (let i = 0; i < 12; i++) {
    const r = await w.runOnce()
    if (r.dispatched + r.succeeded + r.retried + r.failed + r.cancelled === 0) return
  }
}
type HazardAnswer = {
  reportId: string
  holdId: string
  holdState: string
  jobState: string
  jobPaused: boolean
  affectedWorkPackageIds: string[]
  hazard: string
  reviewer: string
  guidance: string[]
  resolveOnSite: boolean
  emergency: { call911: string }
}
const stopWork = (who: Person, jobId: string, body: Record<string, unknown> = {}, idem?: string) =>
  app.inject({
    method: 'POST',
    url: `/api/v1/staff/jobs/${jobId}/hazard-reports`,
    payload: body,
    headers: { cookie: cookies[who], 'x-csrf-token': csrf[who], 'idempotency-key': idem ?? key() },
  })
const reportIssue = (who: Person, jobId: string, body: Record<string, unknown>) =>
  staffWrite(who, `/api/v1/staff/jobs/${jobId}/issue-reports`, body)
type ReportView = {
  reportId: string
  kind: string
  restricted: boolean
  hazard: string | null
  category: string | null
  severity: string
  description: string | null
  reviewer: string | null
  hold: { holdId: string; state: string; version: number } | null
  reportedBy: { id: string; name: string | null }
  photos: number
  stabilizations: unknown[]
  customerNotice: { deliveryId: string; state: string; actions: { release: boolean } }[]
  actions: { addPhoto: boolean; recordStabilization: boolean; review: boolean }
}
async function reports(who: Person, jobId: string) {
  const res = await staffGet(who, `/api/v1/staff/jobs/${jobId}/issue-reports`)
  expect(res.statusCode, res.body).toBe(200)
  return res.json<{ jobState: string; reports: ReportView[]; actions: Record<string, boolean> }>()
}
const holdOf = (id: string) => t.db.selectFrom('work.holds').selectAll().where('id', '=', id).executeTakeFirstOrThrow()
const packagesOf = (jobId: string) =>
  t.db.selectFrom('work.work_packages').select(['id', 'state']).where('job_id', '=', jobId).execute()
const queueItem = (type: string, subjectId: string) =>
  t.db
    .selectFrom('ops.queue_items')
    .selectAll()
    .where('type', '=', type)
    .where('subject_id', '=', subjectId)
    .orderBy('opened_at', 'desc')
    .executeTakeFirst()
const customerGet = (p: Project, path = 'overview') =>
  app.inject({ method: 'GET', url: `/api/v1/customer/projects/${p.reference}/${path}`, headers: { cookie: p.cookie } })
const releaseHold = async (holdId: string, by: Person = 'owner') => {
  const h = await holdOf(holdId)
  const r1 = await staffWrite(by, `/api/v1/staff/critical-holds/${holdId}/actions/start-review`, {}, h.version)
  expect(r1.statusCode, r1.body).toBe(200)
  const r2 = await staffWrite(
    by,
    `/api/v1/staff/critical-holds/${holdId}/actions/resolve`,
    {
      resolutionNote: 'Synthetic: the gas utility cleared the site.',
      evidence: 'Synthetic: the utility visit reference',
      reviewer: 'Synthetic Gas Technician',
      reviewerQualification: 'Synthetic: licensed gas professional',
    },
    h.version + 1,
  )
  expect(r2.statusCode, r2.body).toBe(200)
}

// --- Stop Work is never refused --------------------------------------------------------------------------------------

describe('[HH-WORK-09][RULE-SAFETY-GATES][T48] Stop Work / Report Hazard succeeds for every role, whatever else is open or failing', () => {
  let p: Project
  let jobId: string
  let visitId: string
  let first: HazardAnswer

  it('[T48][HH-WORK-13] a gas leak during work: the hold, the pause, the guidance and the safety queue item, in the report transaction', async () => {
    p = await project()
    jobId = await approve(p)
    visitId = await fixtureVisit(p, jobId, ['ann', 'ben'])
    const version = await prepare('ann', visitId, jobId)
    expect((await start('ann', visitId, version)).statusCode).toBe(201)
    expect(await jobState(jobId)).toBe('in_progress')
    // TSK-0150 (OWN-DEC-199): a started job is "Work in progress" for the customer, never still "On the way".
    expect((await customerGet(p)).json()).toMatchObject({
      status: { situation: 'work_in_progress', step: 'view_updates', waitingOn: 'handyhub', nextAction: 'none' },
    })
    // Other holds and failures already exist: a job-level Hold set by Office, and ben has not arrived.
    const jh = await staffWrite('office', `/api/v1/staff/jobs/${jobId}/job-holds`, {
      category: 'permit_licensing',
      note: 'Synthetic: a permit question.',
    })
    expect(jh.statusCode, jh.body).toBe(201)
    const res = await stopWork('ann', jobId, {
      hazard: 'gas_leak',
      description: 'Synthetic: a smell of gas near the utility room.',
      visitId,
      peopleKeptAway: true,
      emergencyServicesCalled: true,
    })
    expect(res.statusCode, res.body).toBe(201)
    first = res.json<HazardAnswer>()
    expect(first).toMatchObject({
      holdState: 'open',
      jobState: 'paused',
      jobPaused: true,
      hazard: 'gas_leak',
      reviewer: 'gas_utility_or_licensed_gas_professional',
      resolveOnSite: false,
      emergency: { call911: 'tel:911' },
    })
    expect(first.guidance).toEqual([
      'evacuate_call_from_safe_place',
      'never_gas_repair',
      'keep_people_away',
      'call_owner',
    ])
    // A gas leak stops the whole job: every package that was under way is blocked.
    expect((await packagesOf(jobId)).map((x) => x.state)).toEqual(['blocked'])
    expect(first.affectedWorkPackageIds).toEqual((await packagesOf(jobId)).map((x) => x.id))
    expect(await jobState(jobId)).toBe('paused')
    const hold = await holdOf(first.holdId)
    expect(hold).toMatchObject({
      kind: 'critical_safety',
      scope_type: 'job',
      scope_id: jobId,
      category: 'gas_leak',
      source: 'hazard_report',
      source_ref: `hazard_report:${first.reportId}`,
      raised_by: ids.ann,
      state: 'open',
    })
    // The report and its hold were written by one transaction (the same xmin), never through the outbox.
    const xmins = await sql<{ report: string; hold: string }>`
      SELECT r.xmin::text AS report, h.xmin::text AS hold
      FROM work.issue_reports r JOIN work.holds h ON h.id = r.hold_id WHERE r.id = ${first.reportId}`.execute(t.db)
    expect(xmins.rows[0]?.report).toBe(xmins.rows[0]?.hold)
    const events = await t.db
      .selectFrom('platform.outbox_events')
      .select('type')
      .where('aggregate_id', '=', first.reportId)
      .execute()
    expect(events.map((e) => e.type)).toEqual(['hazard.reported'])
    const item = await queueItem('safety_hold', first.holdId)
    expect(item).toMatchObject({ band: 'safety', reason: 'safety_hold', resolved_at: null, project_id: p.projectId })
    const audit = await t.db
      .selectFrom('platform.audit_events')
      .select(['action', 'summary'])
      .where('target_id', '=', first.reportId)
      .execute()
    expect(audit.map((a) => a.action)).toEqual(['hazard.report'])
    expect(JSON.stringify(audit)).not.toContain('smell of gas')
  })

  it('[HH-WORK-09] every role reports while the job is paused, on hold and its gate is failing; each writes its own hold', async () => {
    // ben is assigned but not yet arrived (his Start Work gate fails): he may still stop work.
    const holds: string[] = [first.holdId]
    for (const [who, hazard] of [
      ['ben', 'live_wiring'],
      ['office', 'structural'],
      ['estimator', 'hazardous_material'],
      ['owner', 'licensed_trade'],
    ] as const) {
      const res = await stopWork(who, jobId, { hazard })
      expect(res.statusCode, `${who}: ${res.body}`).toBe(201)
      const a = res.json<HazardAnswer>()
      expect(a).toMatchObject({ hazard, resolveOnSite: false, jobState: 'paused', jobPaused: false })
      expect((await holdOf(a.holdId)).raised_by).toBe(ids[who])
      holds.push(a.holdId)
    }
    // Live wiring: never touched; the guidance says so.
    const wiring = await stopWork('ann', jobId, { hazard: 'live_wiring' })
    expect(wiring.json<HazardAnswer>().guidance).toContain('never_touch_wiring')
    // An existing critical hold written elsewhere does not refuse another report either.
    await criticalHold(p, jobId, 'ben')
    const again = await stopWork('ann', jobId, {})
    expect(again.statusCode, again.body).toBe(201)
    expect(again.json<HazardAnswer>()).toMatchObject({ hazard: 'other_unsafe', reviewer: 'qualified_safety_reviewer' })
    const open = await t.db
      .selectFrom('work.holds')
      .select('id')
      .where('project_id', '=', p.projectId)
      .where('kind', '=', 'critical_safety')
      .where('state', '=', 'open')
      .execute()
    expect(open.length).toBe(holds.length + 3)
    // Every report names its own hold; the hold exists whenever the report exists.
    const orphans = await sql<{ n: string }>`
      SELECT count(*)::text AS n FROM work.issue_reports r LEFT JOIN work.holds h ON h.id = r.hold_id
      WHERE r.job_id = ${jobId} AND r.severity = 'critical' AND (h.id IS NULL OR h.kind <> 'critical_safety')`.execute(
      t.db,
    )
    expect(orphans.rows[0]?.n).toBe('0')
  })

  it('[HH-WORK-09] nothing a phone sends refuses the stop: odd text, unknown ids and an unreadable device time are left out', async () => {
    const res = await stopWork('ben', jobId, {
      description: `Synthetic ${'x'.repeat(5000)}`,
      workPackageIds: ['not-an-id', randomUUID()],
      visitId: 'nope',
      deviceRecordedAt: 'yesterday-ish',
    })
    expect(res.statusCode, res.body).toBe(201)
    const row = await t.db
      .selectFrom('work.issue_reports')
      .selectAll()
      .where('id', '=', res.json<HazardAnswer>().reportId)
      .executeTakeFirstOrThrow()
    expect(row.description?.length).toBe(2000)
    expect(row.visit_id).toBeNull()
    expect(row.device_recorded_at).toBeNull()
    // But no flag exists that asks for less: an unknown field is refused, so "skip the hold" cannot be sent.
    for (const extra of [{ skipHold: true }, { critical: false }, { override: true }])
      expect((await stopWork('ann', jobId, extra)).statusCode, JSON.stringify(extra)).toBe(400)
  })

  it('[HH-OFF-03] a stop recorded offline and sent again with its key is recorded once, with the device time', async () => {
    const idem = key()
    const body = { hazard: 'other_unsafe', deviceRecordedAt: new Date(Date.now() - 5 * 60_000).toISOString() }
    const a = await stopWork('ann', jobId, body, idem)
    const b = await stopWork('ann', jobId, body, idem)
    expect(a.statusCode, a.body).toBe(201)
    expect(b.statusCode, b.body).toBe(201)
    expect(b.json<HazardAnswer>().reportId).toBe(a.json<HazardAnswer>().reportId)
    const rows = await t.db
      .selectFrom('work.issue_reports')
      .select(['device_recorded_at', 'reported_at'])
      .where('id', '=', a.json<HazardAnswer>().reportId)
      .execute()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.device_recorded_at?.getTime()).toBe(new Date(body.deviceRecordedAt).getTime())
  })

  it('[RULE-SERVER-AUTHZ] a worker who is not assigned to the job is refused (the right is every assigned worker’s)', async () => {
    expect((await stopWork('cara', jobId, { hazard: 'gas_leak' })).statusCode).toBe(403)
    expect((await staffGet('cara', `/api/v1/staff/jobs/${jobId}/issue-reports`)).statusCode).toBe(403)
  })

  it('[RULE-SAFETY-GATES][HH-INC-03] Start Work is then refused for every worker, naming the critical hold', async () => {
    const version = await prepare('ben', visitId, jobId)
    const g = await gate('ben', visitId)
    expect(g.outcome).toBe('blocked')
    expect(missingOf(g)).toContain('CRITICAL_HOLD_OPEN')
    const res = await start('ben', visitId, version)
    expect(res.statusCode, res.body).toBe(409)
    expect(codesOf(res)).toContain('CRITICAL_HOLD_OPEN')
    expect(await jobState(jobId)).toBe('paused')
    // The database refuses a move back to in progress by any other path.
    await expect(
      sql`UPDATE work.jobs SET operational_state = 'in_progress', version = version + 1 WHERE id = ${jobId}`.execute(
        t.db,
      ),
    ).rejects.toThrow(/only through the Start Work gate/)
  })

  it('[T54][OWN-DEC-38][HH-WORK-02] no actor releases a Stop Work hold outside the documented release path', async () => {
    const h = await holdOf(first.holdId)
    // The reporter, Office, the Estimator and another worker hold no release permission.
    for (const who of ['ann', 'ben', 'office', 'estimator'] as const)
      for (const action of ['start-review', 'cancel'])
        expect(
          (
            await staffWrite(
              who,
              `/api/v1/staff/critical-holds/${first.holdId}/actions/${action}`,
              action === 'cancel' ? { reason: 'Synthetic' } : {},
              h.version,
            )
          ).statusCode,
          `${who} ${action}`,
        ).toBe(403)
    // The Owner never releases a hold the Owner raised (the licensed-trade one above): it stays open.
    const ownHold = await t.db
      .selectFrom('work.holds')
      .select(['id', 'version'])
      .where('project_id', '=', p.projectId)
      .where('raised_by', '=', ids.owner)
      .where('kind', '=', 'critical_safety')
      .executeTakeFirstOrThrow()
    expect(
      (await staffWrite('owner', `/api/v1/staff/critical-holds/${ownHold.id}/actions/start-review`, {}, 1)).statusCode,
    ).toBe(403)
    // No hazard, issue, review or other hold route reaches it.
    const review = await staffWrite('owner', `/api/v1/staff/issue-reports/${first.reportId}/review`, {})
    expect(review.statusCode).toBe(409)
    expect(codesOf(review)).toEqual(['REVIEWED_THROUGH_HOLD'])
    expect(
      (await staffWrite('owner', `/api/v1/staff/holds/${first.holdId}/actions/start-review`, {}, 1)).statusCode,
    ).toBe(404)
    expect(
      (
        await staffWrite(
          'owner',
          `/api/v1/staff/job-holds/${first.holdId}/actions/set-ready`,
          { resolutionNote: 'x' },
          1,
        )
      ).statusCode,
    ).toBe(404)
    // A report is append-only: it cannot be edited or deleted to drop its hold.
    await expect(
      sql`UPDATE work.issue_reports SET hold_id = NULL WHERE id = ${first.reportId}`.execute(t.db),
    ).rejects.toThrow()
    await expect(sql`DELETE FROM work.issue_reports WHERE id = ${first.reportId}`.execute(t.db)).rejects.toThrow()
    // The policy: no role overrides a critical hold, and the AI module holds no permission at all.
    const actor = (roles: StaffActor['roles']): StaffActor => ({
      kind: 'staff',
      userId: ids.owner,
      roles,
      capabilities: ['collect'],
      status: 'active',
      freshAuth: true,
    })
    for (const roles of [['owner'], ['office'], ['estimator'], ['worker']] as const)
      expect(
        decide(
          actor([...roles]),
          'hold.override_critical',
          { projectId: p.projectId },
          { now: new Date(), online: true },
        ),
      ).toMatchObject({ effect: 'deny', reason: 'SAFETY_GATE_NOT_OVERRIDABLE' })
    for (const action of ['hazard.report', 'hold.release_critical', 'work.start'] as const)
      expect(decide({ kind: 'ai' } as never, action, {}, { now: new Date(), online: true }).effect).toBe('deny')
    // The documented path: the Owner releases ann's hold with evidence and a qualified reviewer; the safety item goes.
    await releaseHold(first.holdId)
    expect((await holdOf(first.holdId)).state).toBe('resolved')
    expect((await queueItem('safety_hold', first.holdId))?.resolved_at).not.toBeNull()
    // The other holds still block, so Start Work stays refused.
    expect(missingOf(await gate('ben', visitId))).toContain('CRITICAL_HOLD_OPEN')
    expect((await holdOf(ownHold.id)).state).toBe('open')
  })

  it('[T48][HH-INC-02] the customer sees only "Work is paused for safety review."', async () => {
    const res = await customerGet(p)
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json()).toMatchObject({
      status: { situation: 'safety_hold', step: 'safety_review', waitingOn: 'handyhub', nextAction: 'none' },
    })
    for (const path of ['overview', 'messages', 'documents', 'photos', 'appointments', 'payments']) {
      const r = await customerGet(p, path)
      expect(r.statusCode, path).toBe(200)
      for (const leaked of ['gas', 'wiring', 'hazard', 'Synthetic: a smell', 'critical', 'structural', 'Synthetic ann'])
        expect(r.body.toLowerCase(), `${path}: ${leaked}`).not.toContain(leaked.toLowerCase())
    }
  })

  it('[OWN-DEC-152] the work-paused notice is an Owner-released draft: one per project, never sent by itself', async () => {
    await drain()
    const drafts = await t.db
      .selectFrom('platform.message_deliveries')
      .selectAll()
      .where('project_id', '=', p.projectId)
      .where('message_key', '=', 'job.paused')
      .execute()
    expect(drafts).toHaveLength(1)
    expect(drafts[0]).toMatchObject({ state: 'draft', release: 'staff_released', channel: 'email' })
    expect(drafts[0]?.variables).toMatchObject({ customerName: 'Synthetic', jobNumber: p.reference })
    const draft = drafts[0] as (typeof drafts)[number]
    const view = await reports('owner', jobId)
    const withNotice = view.reports.find((r) => r.customerNotice.length)
    expect(withNotice?.customerNotice[0]).toMatchObject({
      deliveryId: draft.id,
      state: 'draft',
      actions: { release: true },
    })
    // Office sees no notice and cannot release it; the Owner can.
    expect((await reports('office', jobId)).reports.every((r) => r.customerNotice.length === 0)).toBe(true)
    const url = `/api/v1/staff/issue-reports/${draft.record_id}/notices/${draft.id}`
    expect((await staffWrite('office', `${url}/release`, {})).statusCode).toBe(403)
    expect((await staffWrite('ann', `${url}/release`, {})).statusCode).toBe(403)
    const rel = await staffWrite('owner', `${url}/release`, {})
    expect(rel.statusCode, rel.body).toBe(200)
    expect(rel.json()).toMatchObject({ state: 'queued' })
    expect((await staffWrite('owner', `${url}/release`, {})).statusCode).toBe(409)
  })
})

// --- Restricted details -----------------------------------------------------------------------------------------------

describe('[T54][HH-INC-02][OWN-DEC-143] an injury report: details for the Owner and the reporter only', () => {
  it('Office and another worker see that it exists and its status; the reporter and the Owner (audited) see it', async () => {
    const p = await project()
    const jobId = await approve(p)
    await fixtureVisit(p, jobId, ['ben', 'dee'])
    const text = 'Synthetic: cut on the left hand, first aid given.'
    const res = await stopWork('ben', jobId, { hazard: 'injury', description: text })
    expect(res.statusCode, res.body).toBe(201)
    const a = res.json<HazardAnswer>()
    expect(a.guidance).toContain('call_911_serious_injury')
    // The hold's note never carries the restricted text.
    expect((await holdOf(a.holdId)).note).toBe('hazard_report:injury')
    for (const who of ['office', 'dee', 'estimator'] as const) {
      const r = (await reports(who, jobId)).reports.find((x) => x.reportId === a.reportId) as ReportView
      expect(r, who).toMatchObject({
        restricted: true,
        hazard: null,
        description: null,
        reviewer: null,
        severity: 'critical',
        reportedBy: { id: '', name: null },
      })
      expect(r.hold?.state).toBe('open')
    }
    for (const who of ['ben', 'owner'] as const) {
      const r = (await reports(who, jobId)).reports.find((x) => x.reportId === a.reportId) as ReportView
      expect(r, who).toMatchObject({ restricted: true, hazard: 'injury', description: text })
    }
    const audited = await t.db
      .selectFrom('platform.audit_events')
      .select('actor_id')
      .where('action', '=', 'incident.view_restricted')
      .where('target_id', '=', jobId)
      .execute()
    expect(audited.map((x) => x.actor_id)).toEqual([ids.owner])
    // The packet every assigned worker reads names the hold, never the text.
    const packet = await staffGet('dee', `/api/v1/staff/jobs/${jobId}/packet`)
    expect(packet.statusCode, packet.body).toBe(200)
    expect(packet.body).not.toContain('left hand')
    // Another worker cannot add to it; the reporter adds a photo (only when safe) and a stabilization record.
    const photo = (who: Person, n: number) =>
      app.inject({
        method: 'POST',
        url: `/api/v1/staff/issue-reports/${a.reportId}/photos`,
        payload: png(9000 + n),
        headers: { cookie: cookies[who], 'x-csrf-token': csrf[who], 'content-type': 'image/png' },
      })
    expect((await photo('dee', 1)).statusCode).toBe(403)
    const ph = await photo('ben', 1)
    expect(ph.statusCode, ph.body).toBe(201)
    expect((await photo('ben', 1)).statusCode).toBe(200)
    const stab = {
      trigger: 'Synthetic: bleeding cut',
      actions: 'Synthetic: first aid from the kit, work stopped',
      whyNecessary: 'Synthetic: to stop the bleeding',
      ownerNotifiedAt: new Date().toISOString(),
    }
    expect((await staffWrite('dee', `/api/v1/staff/issue-reports/${a.reportId}/stabilizations`, stab)).statusCode).toBe(
      403,
    )
    const s = await staffWrite('ben', `/api/v1/staff/issue-reports/${a.reportId}/stabilizations`, stab)
    expect(s.statusCode, s.body).toBe(201)
    const mine = (await reports('ben', jobId)).reports.find((x) => x.reportId === a.reportId) as ReportView
    expect(mine.photos).toBe(1)
    expect(mine.stabilizations).toHaveLength(1)
    const others = (await reports('dee', jobId)).reports.find((x) => x.reportId === a.reportId) as ReportView
    expect(others.photos).toBe(0)
    expect(others.stabilizations).toEqual([])
    // The reporter cannot release their own hold; the Owner releases it with evidence (T54).
    expect(
      (await staffWrite('ben', `/api/v1/staff/critical-holds/${a.holdId}/actions/start-review`, {}, 1)).statusCode,
    ).toBe(403)
    await releaseHold(a.holdId)
    expect((await customerGet(p)).json<{ status: { situation: string } }>().status.situation).not.toBe('safety_hold')
  })
})

// --- Issue reports ------------------------------------------------------------------------------------------------------

describe('[HH-WORK-08][OWN-DEC-80] issue reports: resolved on site only within training and scope, with no open safety hold', () => {
  let p: Project
  let jobId: string
  let visitId: string
  const resolution = {
    whatHappened: 'Synthetic: the anchor spun in the drywall.',
    steps: 'Synthetic: replaced it with a toggle anchor per the SOP.',
    materials: 'Synthetic: one toggle anchor',
    howChecked: 'Synthetic: pull-tested by hand',
    withinTrainingAndScope: true,
  }

  it('a minor issue within training and scope is resolved on site and notifies the Owner', async () => {
    p = await project()
    jobId = await approve(p)
    visitId = await fixtureVisit(p, jobId, ['ann'])
    const res = await reportIssue('ann', jobId, {
      category: 'material_problem',
      severity: 'minor',
      description: 'Synthetic: wrong anchor size in the kit.',
      visitId,
      resolution,
    })
    expect(res.statusCode, res.body).toBe(201)
    expect(res.json()).toMatchObject({ kind: 'issue', severity: 'minor', holdId: null, resolvedOnSite: true })
    const item = await queueItem('field_issue', jobId)
    expect(item).toMatchObject({ reason: 'issue_resolved_on_site', resolved_at: null })
    const r = (await reports('owner', jobId)).reports[0] as ReportView
    expect(r).toMatchObject({ kind: 'issue', category: 'material_problem', actions: { review: true } })
    // Office and workers do not see the Owner's item, and cannot review.
    expect((await staffWrite('office', `/api/v1/staff/issue-reports/${r.reportId}/review`, {})).statusCode).toBe(403)
    expect((await staffWrite('ann', `/api/v1/staff/issue-reports/${r.reportId}/review`, {})).statusCode).toBe(403)
    const rev = await staffWrite('owner', `/api/v1/staff/issue-reports/${r.reportId}/review`, { note: 'Synthetic: ok' })
    expect(rev.statusCode, rev.body).toBe(201)
    expect((await queueItem('field_issue', jobId))?.resolved_at).not.toBeNull()
    expect((await staffWrite('owner', `/api/v1/staff/issue-reports/${r.reportId}/review`, {})).statusCode).toBe(409)
    // A non-critical issue writes no hold and stops nothing.
    expect(await jobState(jobId)).toBe('pending_preparation')
    expect((await packagesOf(jobId)).map((x) => x.state)).toEqual(['planned'])
  })

  it('no on-site resolution outside the worker’s stated training and scope, for an incident or an unsafe condition', async () => {
    const outside = await reportIssue('ann', jobId, {
      category: 'hidden_damage',
      description: 'Synthetic: rot behind the patch.',
      resolution: { ...resolution, withinTrainingAndScope: false },
    })
    expect(outside.statusCode).toBe(409)
    expect(codesOf(outside)).toEqual(['NOT_WITHIN_TRAINING_AND_SCOPE'])
    for (const category of ['incident', 'unsafe_condition']) {
      const res = await reportIssue('ann', jobId, { category, description: 'Synthetic', resolution })
      expect(res.statusCode, category).toBe(409)
      expect(codesOf(res)).toEqual(['RESOLVE_ON_SITE_NOT_OFFERED'])
    }
    const critical = await reportIssue('ann', jobId, {
      category: 'weather',
      severity: 'critical',
      description: 'Synthetic: lightning',
      resolution,
    })
    expect(codesOf(critical)).toEqual(['RESOLVE_ON_SITE_NOT_OFFERED'])
    // The database refuses the same, whatever writes it.
    await expect(
      sql`INSERT INTO work.issue_reports (id, job_id, project_id, kind, category, severity, visibility, next_owner,
            resolved_on_site, resolution_what_happened, resolution_steps, resolution_materials, resolution_check,
            job_state_before, job_paused, reported_by)
          VALUES (${randomUUID()}, ${jobId}, ${p.projectId}, 'issue', 'incident', 'minor', 'restricted_incident',
            'owner', true, 'x', 'x', 'x', 'x', 'pending_preparation', false, ${ids.ann})`.execute(t.db),
    ).rejects.toThrow(/issue_reports_no_resolution/)
  })

  it('an unsafe condition takes the Stop Work path: critical, with its hold in the same transaction', async () => {
    const res = await reportIssue('ann', jobId, {
      category: 'unsafe_condition',
      severity: 'minor',
      description: 'Synthetic: a loose ceiling panel.',
    })
    expect(res.statusCode, res.body).toBe(201)
    const out = res.json<{ severity: string; holdId: string | null }>()
    expect(out.severity).toBe('critical')
    expect(out.holdId).not.toBeNull()
    expect((await holdOf(out.holdId as string)).state).toBe('open')
    expect(await queueItem('safety_hold', out.holdId as string)).toMatchObject({ band: 'safety' })
  })

  it('while a safety hold is unresolved nothing is resolved on site; stabilization only on a Stop Work', async () => {
    const res = await reportIssue('ann', jobId, {
      category: 'material_problem',
      description: 'Synthetic: a short screw.',
      resolution,
    })
    expect(res.statusCode).toBe(409)
    expect(codesOf(res)).toEqual(['SAFETY_HOLD_OPEN'])
    const plain = await reportIssue('ann', jobId, {
      category: 'access_problem',
      description: 'Synthetic: gate locked.',
    })
    expect(plain.statusCode, plain.body).toBe(201)
    expect((await queueItem('field_issue', jobId))?.reason).toBe('issue_reported')
    const stab = await staffWrite(
      'ann',
      `/api/v1/staff/issue-reports/${plain.json<{ reportId: string }>().reportId}/stabilizations`,
      {
        trigger: 'Synthetic',
        actions: 'Synthetic',
        whyNecessary: 'Synthetic',
      },
    )
    expect(stab.statusCode).toBe(409)
    expect(codesOf(stab)).toEqual(['NOT_A_STOP'])
  })
})

// --- The database backstop ----------------------------------------------------------------------------------------------

describe('[RULE-SAFETY-GATES][HH-WORK-09] the database: a critical report exists only with its own hold of the same transaction', () => {
  it('refuses a critical report without a hold, with another transaction’s hold, or with a hold of another job', async () => {
    const p = await project()
    const jobId = await approve(p)
    const id = randomUUID()
    const insert = (holdId: string | null, reportId = id) =>
      sql`INSERT INTO work.issue_reports (id, job_id, project_id, kind, hazard, severity, visibility, next_owner,
            hold_id, job_state_before, job_paused, reported_by)
          VALUES (${reportId}, ${jobId}, ${p.projectId}, 'hazard', 'gas_leak', 'critical', 'internal_operational',
            'owner', ${holdId}, 'pending_preparation', false, ${ids.ann})`.execute(t.db)
    await expect(insert(null)).rejects.toThrow(/issue_reports_hold/)
    // A hold committed earlier (another transaction), even naming this report, is not enough.
    const earlier = await t.db
      .insertInto('work.holds')
      .values({
        kind: 'critical_safety',
        scope_type: 'job',
        scope_id: jobId,
        project_id: p.projectId,
        category: 'gas_leak',
        note: 'Synthetic',
        source: 'hazard_report',
        source_ref: `hazard_report:${id}`,
        raised_by: ids.ann,
      })
      .returning('id')
      .executeTakeFirstOrThrow()
    await expect(insert(earlier.id)).rejects.toThrow(/same transaction/)
    // In one transaction, hold then report: accepted.
    const other = randomUUID()
    await t.db.transaction().execute(async (tx) => {
      const h = await tx
        .insertInto('work.holds')
        .values({
          kind: 'critical_safety',
          scope_type: 'job',
          scope_id: jobId,
          project_id: p.projectId,
          category: 'gas_leak',
          note: 'Synthetic',
          source: 'hazard_report',
          source_ref: `hazard_report:${other}`,
          raised_by: ids.ann,
        })
        .returning('id')
        .executeTakeFirstOrThrow()
      await sql`INSERT INTO work.issue_reports (id, job_id, project_id, kind, hazard, severity, visibility, next_owner,
            hold_id, job_state_before, job_paused, reported_by)
          VALUES (${other}, ${jobId}, ${p.projectId}, 'hazard', 'gas_leak', 'critical', 'internal_operational',
            'owner', ${h.id}, 'pending_preparation', false, ${ids.ann})`.execute(tx)
    })
    // A non-critical report never names a hold.
    await expect(
      sql`INSERT INTO work.issue_reports (id, job_id, project_id, kind, category, severity, visibility, next_owner,
            hold_id, job_state_before, job_paused, reported_by)
          VALUES (${randomUUID()}, ${jobId}, ${p.projectId}, 'issue', 'weather', 'minor', 'internal_operational',
            'owner', ${earlier.id}, 'pending_preparation', false, ${ids.ann})`.execute(t.db),
    ).rejects.toThrow(/its own open critical safety hold|issue_reports_hold/)
  })
})

// --- Locks ----------------------------------------------------------------------------------------------------------

describe('[HH-WORK-04][RULE-SAFETY-GATES] a Stop Work and a Start Work commit strictly one after the other', () => {
  it('a Start that waits behind a Stop Work holding the job lock sees its hold and is refused', async () => {
    const p = await project()
    const jobId = await approve(p)
    const visitId = await fixtureVisit(p, jobId, ['cara'])
    const version = await prepare('cara', visitId, jobId)
    expect((await gate('cara', visitId)).outcome).toBe('ready')
    // Another session holds the job's row lock (as a Stop Work's transaction does while it writes).
    let release!: () => void
    const held = new Promise<void>((r) => (release = r))
    let locked!: () => void
    const lockTaken = new Promise<void>((r) => (locked = r))
    const holder = wide.transaction().execute(async (tx) => {
      await sql`SELECT 1 FROM work.jobs WHERE id = ${jobId} FOR UPDATE`.execute(tx)
      locked()
      await held
    })
    await lockTaken
    const stop = stopWork('cara', jobId, { hazard: 'structural' })
    await new Promise((r) => setTimeout(r, 200))
    const pending = start('cara', visitId, version)
    await new Promise((r) => setTimeout(r, 200))
    // Both wait on the job lock; nothing is committed meanwhile.
    expect(await jobState(jobId)).toBe('pending_preparation')
    expect(await t.db.selectFrom('work.issue_reports').select('id').where('job_id', '=', jobId).execute()).toEqual([])
    release()
    await holder
    const [s, res] = await Promise.all([stop, pending])
    expect(s.statusCode, s.body).toBe(201)
    const report = await t.db
      .selectFrom('work.issue_reports')
      .select(['job_state_before', 'job_paused'])
      .where('id', '=', s.json<HazardAnswer>().reportId)
      .executeTakeFirstOrThrow()
    // Whichever took the lock first committed first; the other saw it.
    if (res.statusCode === 201) {
      expect(report).toEqual({ job_state_before: 'in_progress', job_paused: true })
    } else {
      expect(res.statusCode, res.body).toBe(409)
      expect(codesOf(res)).toContain('CRITICAL_HOLD_OPEN')
      expect(report).toEqual({ job_state_before: 'pending_preparation', job_paused: false })
    }
    expect(await jobState(jobId)).toBe(res.statusCode === 201 ? 'paused' : 'pending_preparation')
  })
})
