// The visit model against PostgreSQL 16 (TSK-0061; HH-SCH-01, HH-SCH-02, HH-DATA-06, HH-SCH-05, T09, T37, T41,
// ENT-Visit, ENT-SchedulingTask, FACT-TIMEZONE, FACT-HOURS, OWN-DEC-99, OWN-DEC-100, OWN-DEC-105, RULE-SERVER-AUTHZ,
// RULE-SAFETY-GATES). Staff, customers, requests, amounts and names are synthetic (RULE-SYNTHETIC-DATA); nothing
// reaches a real provider.
// - The daylight-saving dates are found from the business zone itself (the next fall-back and spring-forward after
//   now), so the windows are always in the future and nothing depends on this machine's zone.
// - No estimate terms version is recorded by the migrations (approval answers NOT CONFIGURED until the owner's
//   sign-off, OQ-TERMS-OWNER-APPROVAL). To get a job, the work-visit tests record a synthetic "approved and
//   attorney-reviewed" terms version in this throwaway test database only, as the approval tests do: a test fixture,
//   never a statement that the owner approved anything.
import { randomUUID } from 'node:crypto'
import { Writable } from 'node:stream'
import { loadServiceSeed, syncServices, withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import { formatOffset, localClockOf, localDateOf, addLocalDays, offsetChanges } from '@handyhub/domain'
import { ESTIMATE_TERMS } from '@handyhub/domain/legal'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { buildAutomations } from '../../src/automations.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { startCustomerSession } from '../../src/modules/identity/customer-sessions.js'
import { readCodeKey, type CodeKeySettings } from '../../src/modules/identity/index.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import { apiModules } from '../../src/modules/index.js'
import { visitsModule, type WorkVisitGate } from '../../src/modules/visits/index.js'
import { createAutomationRegistry } from '../../src/platform/automation.js'
import { recordPolicyVersion, type ConfigKey } from '../../src/platform/config/index.js'
import { createWorker } from '../../src/platform/jobs.js'
import { createLogger } from '../../src/platform/logger.js'
import { createProviders } from '../../src/providers/index.js'
import { FakeObjectStorage } from '../../src/providers/r2/index.js'
import { readProviderSettings } from '../../src/providers/settings.js'
import { testConfig } from '../fixtures/env.js'
import { verifyPropertyZone } from '../fixtures/zones.js'

const ZONE = 'America/Kentucky/Louisville'
const MIN = 60_000
const DAY = 24 * 60 * MIN
const KEY: CodeKeySettings = readCodeKey({
  HANDYHUB_ENV: 'ci',
  CODE_HASH_KEY: ['synthetic', 'visit', 'model', 'code', 'key', 'for', 'tests', 'only', '0061'].join('-'),
})
const pw = (n: number) => ['synthetic', 'visit', 'model', 'passphrase', String(n)].join(' ')
const PEOPLE = ['owner', 'office', 'estimator', 'worker'] as const
type Person = (typeof PEOPLE)[number]

// The next clock changes of the business zone after now (FACT-TIMEZONE), in local terms.
const changes = offsetChanges(ZONE, new Date(), new Date(Date.now() + 400 * DAY))
const fall = changes.find((c) => c.offsetAfter < c.offsetBefore)
const spring = changes.find((c) => c.offsetAfter > c.offsetBefore)
if (!fall || !spring) throw new Error('the business zone must observe daylight saving time for these tests')
const clockAt = (ms: number) => new Date(ms).toISOString().slice(11, 16)
const FALL_DATE = localDateOf(fall.at, ZONE)
/** Half an hour into the repeated hour (01:30 in US Eastern). */
const REPEATED = localClockOf(new Date(fall.at.getTime() - 30 * MIN), ZONE)
const SPRING_DATE = localDateOf(spring.at, ZONE)
/** Half an hour into the spring-forward gap (02:30 in US Eastern). */
const GAP = clockAt(spring.at.getTime() + spring.offsetBefore * MIN + 30 * MIN)
const GAP_FROM = clockAt(spring.at.getTime() + spring.offsetBefore * MIN)
const GAP_TO = clockAt(spring.at.getTime() + spring.offsetAfter * MIN)
const wallUtc = (date: string, time: string, offsetMinutes: number) =>
  new Date(Date.parse(`${date}T${time}:00Z`) - offsetMinutes * MIN).toISOString()

let t: TestDatabase
let app: FastifyInstance
let gated: FastifyInstance
const cookies = {} as Record<Person, string>
const csrf = {} as Record<Person, string>
const gatedCookies = {} as Record<Person, string>
const gatedCsrf = {} as Record<Person, string>
const blockedJobs = new Set<string>()
const TEST_GATE: WorkVisitGate = {
  source: 'test',
  unmet: async (_tx, job) => (blockedJobs.has(job.jobId) ? ['SYNTHETIC_GATE_UNMET'] : []),
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

async function signIn(server: FastifyInstance, p: Person): Promise<[string, string]> {
  const res = await server.inject({
    method: 'POST',
    url: '/api/v1/staff/auth/sign-in',
    headers: { 'x-forwarded-for': '198.51.100.161' },
    payload: { email: `${p}-visits@example.test`, password: pw(1) },
  })
  expect(res.statusCode, res.body).toBe(200)
  const cookie = String(res.headers['set-cookie']).split(';')[0] as string
  const session = await server.inject({ method: 'GET', url: '/api/v1/staff/auth/session', headers: { cookie } })
  return [cookie, session.json<{ csrfToken: string }>().csrfToken]
}

beforeAll(async () => {
  t = await createTestDatabase()
  await syncServices(t.db, loadServiceSeed())
  const config = testConfig({ TRUST_PROXY_HOPS: '1' })
  app = await buildApp({ config, api: { db: t.db, codeKey: KEY, storage: new FakeObjectStorage() } })
  const modules = apiModules({ secureCookies: false, mfaKey: null, codeKey: KEY, trustProxyHops: 1 }).map((m) =>
    m.name === 'visits' ? visitsModule({ workVisitGates: [TEST_GATE] }) : m,
  )
  gated = await buildApp({ config, api: { db: t.db, modules } })
  const hash = await hashPassword(pw(1))
  await withTx(t.db, async (tx) => {
    for (const p of PEOPLE) {
      const user = await createStaffUser(tx, {
        email: `${p}-visits@example.test`,
        displayName: `Synthetic ${p}`,
        locale: p === 'office' ? 'es' : 'en',
        role: p,
        issuedBy: 'test',
      })
      await setPasswordHash(tx, user.id, hash)
    }
  })
  for (const p of PEOPLE) [cookies[p], csrf[p]] = await signIn(app, p)
  for (const p of ['owner'] as const) [gatedCookies[p], gatedCsrf[p]] = await signIn(gated, p)
})
afterAll(async () => {
  await app?.close()
  await gated?.close()
  await t?.drop()
})

let seq = 0
const key = (what: string) => `synthetic-${what}-${String(++seq).padStart(6, '0')}-${randomUUID()}`
function staffWrite(
  who: Person,
  method: 'POST' | 'PUT',
  url: string,
  payload: unknown,
  version?: number,
  server: 'app' | 'gated' = 'app',
) {
  const s = server === 'app' ? app : gated
  return s.inject({
    method,
    url,
    payload: payload as object,
    headers: {
      cookie: (server === 'app' ? cookies : gatedCookies)[who],
      'x-csrf-token': (server === 'app' ? csrf : gatedCsrf)[who],
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

type Timing = { flexible: boolean; needHelpToday: boolean; windows: string[]; preferredDate?: string }
type Project = { requestId: string; projectId: string; reference: string; contactId: string; grantId: string }
let ip = 10
async function submit(timing: Timing = { flexible: true, needHelpToday: false, windows: ['mornings'] }) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/public/requests',
    headers: { 'idempotency-key': key('submit'), 'x-forwarded-for': `198.51.100.${++ip}` },
    payload: {
      formVersion: 'test-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-01' }],
      notSure: false,
      description: 'Synthetic visit model project.',
      answers: [],
      property: {
        street: `${seq} Synthetic Visit Lane`,
        city: 'Testville',
        state: 'ky',
        zip: '40000',
        propertyType: 'house',
      },
      timing,
      estimatePreference: 'site_visit',
      contact: {
        fullName: 'Synthetic Visit Customer',
        email: `visits-${seq}-${randomUUID().slice(0, 8)}@example.test`,
        phone: '(502) 555-0161',
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
  // TSK-0123: the property's zone is unknown until verified; these tests plan visits, so it is verified first.
  await verifyPropertyZone(t.db, { projectId: row.project_id })
  return { requestId: row.id, projectId: row.project_id, reference, contactId: row.contact_id, grantId: grant.id }
}

/** A qualified request with "Site visit needed" chosen (the request action; it plans no visit by itself). */
async function siteVisitRequest(): Promise<Project> {
  const p = await submit()
  expect(
    (await staffWrite('owner', 'PUT', `/api/v1/staff/requests/${p.requestId}/qualification`, { checks: ALL_OK }, 0))
      .statusCode,
  ).toBe(200)
  const moved = await staffWrite(
    'owner',
    'POST',
    `/api/v1/staff/requests/${p.requestId}/actions/estimate-visit`,
    { customerExplanation: 'We need to see the synthetic wall.', workPackages: ['SVC-DW-01'] },
    1,
  )
  expect(moved.statusCode, moved.body).toBe(200)
  return p
}

/** Approves an estimate for the project through the real approval transaction, so its job and task exist. */
async function approve(p: Project) {
  await setConfig('legal.estimate_terms', {
    documentId: ESTIMATE_TERMS.documentId,
    status: 'approved',
    attorneyReviewed: true,
    preparedOn: ESTIMATE_TERMS.preparedOn,
    contentSha256: ESTIMATE_TERMS.contentSha256,
  })
  const created = await staffWrite('estimator', 'POST', `/api/v1/staff/projects/${p.projectId}/estimates`, {})
  expect(created.statusCode, created.body).toBe(201)
  const c = created.json<{ number: string; versionId: string }>()
  const v = (await staffGet('estimator', `/api/v1/staff/estimate-versions/${c.versionId}`)).json<{
    rowVersion: number
    workPackages: { id: string }[]
  }>()
  const saved = await staffWrite(
    'estimator',
    'PUT',
    `/api/v1/staff/estimate-versions/${c.versionId}/draft`,
    {
      lines: [
        {
          kind: 'base',
          workPackageId: v.workPackages[0]?.id,
          description: 'Patch the synthetic hole',
          quantity: '2',
          unit: 'patch',
          unitPriceCents: 1250,
        },
      ],
      texts: { exclusions: ['Synthetic: moving furniture'] },
    },
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
  const base = `/api/v1/customer/projects/${p.reference}/estimates/${c.number}/versions/1`
  const d = (await app.inject({ method: 'GET', url: base, headers: { cookie } })).json<{
    totalCents: number
    approval: { contentDigest: string; selection: { totalCents: number; deposit: { amountCents: number | null } } }
  }>()
  const res = await app.inject({
    method: 'POST',
    url: `${base}/approve`,
    headers: {
      cookie,
      'idempotency-key': key('approve'),
      'x-forwarded-for': `2001:db8:61:${++ip}::1`,
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
      fullName: 'Synthetic Visit Customer',
    },
  })
  expect(res.statusCode, res.body).toBe(201)
  return (
    await t.db.selectFrom('work.jobs').select('id').where('project_id', '=', p.projectId).executeTakeFirstOrThrow()
  ).id
}

type Win = {
  localDate: string
  start: string
  end: string
  timeZone: string
  startOffset: string
  endOffset: string
  startsAt: string
  endsAt: string
  withinVisitHours: boolean | null
}
type VisitView = {
  id: string
  purpose: string
  state: string
  version: number
  jobId: string | null
  window: Win
  windowVersion: number
  expectedDurationMinutes: number | null
  requiredWorkers: number | null
  equipment: string[]
  history: { windowVersion: number; window: Win; visitState: string; reason: string | null }[]
  actions: { changeWindow: boolean }
}
type Visits = {
  projectId: string
  projectState: string
  timeZone: string
  businessTimeZone: { zone: string; proposed: boolean } | null
  visitHours: { open: string; close: string } | null
  job: { id: string; scopeVersion: number | null } | null
  schedulingTask: { state: string } | null
  actions: { planEstimateVisit: boolean; planWorkVisit: boolean }
  visits: VisitView[]
}
const visits = async (projectId: string, who: Person = 'office') => {
  const res = await staffGet(who, `/api/v1/staff/projects/${projectId}/visits`)
  expect(res.statusCode, res.body).toBe(200)
  return res.json<Visits>()
}
const plan = (who: Person, projectId: string, body: Record<string, unknown>, server: 'app' | 'gated' = 'app') =>
  staffWrite(who, 'POST', `/api/v1/staff/projects/${projectId}/visits`, body, undefined, server)
const visitRows = (projectId: string) =>
  t.db.selectFrom('work.visits').selectAll().where('project_id', '=', projectId).execute()
const DAY_AFTER_TOMORROW = () => addLocalDays(localDateOf(new Date(), ZONE), 2)
const fieldCodes = (body: string) =>
  JSON.parse(body).error.fieldErrors.map((f: { field: string; code: string }) => [f.field, f.code])

describe('[HH-SCH-01][T09] a timing preference is a preference, never a visit', () => {
  it('[T09][HH-SCH-01][HH-SCH-05] submitted preferences, staff review and every automation create no visit', async () => {
    const a = await submit({ flexible: true, needHelpToday: false, windows: ['mornings', 'weekends'] })
    const b = await submit({ flexible: true, needHelpToday: true, windows: ['any_time'] })
    const c = await siteVisitRequest()
    // Every automation the server runs, on every committed event so far (receipt, links, queue items, clocks).
    const sink = new Writable({ write: (_c, _e, done) => done() })
    const logger = createLogger({ level: 'fatal' }, sink)
    const providers = createProviders(readProviderSettings({ HANDYHUB_ENV: 'ci' }), { logger })
    const worker = createWorker({
      db: t.db,
      registry: createAutomationRegistry(
        buildAutomations({ providers, staffAppUrl: 'http://staff.example.test', codeKey: KEY }),
      ),
      logger,
    })
    for (let i = 0; i < 30; i++) {
      const r = await worker.runOnce()
      if (r.dispatched + r.succeeded + r.retried + r.failed + r.cancelled === 0) break
    }
    for (const p of [a, b, c]) {
      expect(await visitRows(p.projectId)).toEqual([])
      const v = await visits(p.projectId)
      expect(v).toMatchObject({ visits: [], job: null, schedulingTask: null })
    }
    // The preferences stay on the request, exactly as sent.
    const req = await t.db
      .selectFrom('intake.requests')
      .select(['time_windows', 'flexible', 'need_help_today'])
      .where('id', '=', b.requestId)
      .executeTakeFirstOrThrow()
    expect(req).toEqual({ time_windows: ['any_time'], flexible: true, need_help_today: true })
  })

  it('[HH-SCH-01] only the visits module writes visits: no other server code inserts one', () => {
    const root = join(import.meta.dirname, '../../src')
    const files = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? files(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : [],
      )
    const writers = files(root).filter((f) => /insertInto\(\s*'work\.visits'/.test(readFileSync(f, 'utf8')))
    expect(writers.map((f) => f.slice(root.length + 1))).toEqual(['modules/visits/visits.ts'])
  })
})

describe('[HH-SCH-01][T37] an estimate visit and a work visit keep different purposes', () => {
  it('[T37][OWN-DEC-99][OWN-DEC-105] the estimate visit is on the project; after approval the work visit is on the job', async () => {
    const p = await siteVisitRequest()
    const before = await visits(p.projectId)
    expect(before).toMatchObject({
      projectState: 'open',
      timeZone: ZONE,
      businessTimeZone: { zone: ZONE, proposed: true },
      visitHours: { open: '08:00', close: '22:00' },
      job: null,
      schedulingTask: null,
      actions: { planEstimateVisit: true, planWorkVisit: false },
    })
    // A work visit before approval: there is no job.
    const early = await plan('office', p.projectId, {
      purpose: 'service',
      localDate: DAY_AFTER_TOMORROW(),
      windowStart: '09:00',
      windowEnd: '11:00',
    })
    expect(early.statusCode).toBe(409)
    expect(fieldCodes(early.body)).toEqual([['project', 'NO_JOB']])

    const date = DAY_AFTER_TOMORROW()
    const est = await plan('office', p.projectId, {
      purpose: 'site_estimate',
      localDate: date,
      windowStart: '09:00',
      windowEnd: '11:00',
      expectedDurationMinutes: 45,
      requiredWorkers: 1,
      equipment: ['Synthetic moisture meter', '  ', 'Synthetic moisture meter'],
    })
    expect(est.statusCode, est.body).toBe(201)
    const afterEst = est.json<Visits>()
    expect(afterEst.visits).toHaveLength(1)
    const ev = afterEst.visits[0] as VisitView
    expect(ev).toMatchObject({
      purpose: 'site_estimate',
      state: 'tentative',
      version: 1,
      jobId: null,
      windowVersion: 1,
      expectedDurationMinutes: 45,
      requiredWorkers: 1,
      equipment: ['Synthetic moisture meter'],
      window: { localDate: date, start: '09:00', end: '11:00', timeZone: ZONE, withinVisitHours: true },
      actions: { changeWindow: true },
    })
    // No job, no approval, the project still open; no unentered planning fact is filled in.
    expect(afterEst).toMatchObject({ projectState: 'open', job: null })
    expect(ev).toMatchObject({ preparationBufferMinutes: null, travelBufferMinutes: null })
    expect(await t.db.selectFrom('work.jobs').select('id').where('project_id', '=', p.projectId).execute()).toEqual([])
    expect(
      await t.db.selectFrom('estimating.approvals').select('id').where('project_id', '=', p.projectId).execute(),
    ).toEqual([])
    // Audited with the local window, zone, offsets and instants.
    const audit = await t.db
      .selectFrom('platform.audit_events')
      .select(['action', 'summary', 'target_type', 'target_id'])
      .where('target_id', '=', ev.id)
      .execute()
    expect(audit).toEqual([
      expect.objectContaining({
        action: 'visit.plan',
        target_type: 'visit',
        summary: expect.objectContaining({
          purpose: 'site_estimate',
          window: expect.objectContaining({ localDate: date, start: '09:00', timeZone: ZONE }),
        }),
      }),
    ])

    // Approval: one job and its scheduling task; an estimate visit is no longer planned on the approved project.
    const jobId = await approve(p)
    const approved = await visits(p.projectId)
    expect(approved).toMatchObject({
      projectState: 'approved',
      job: { id: jobId, scopeVersion: 1 },
      schedulingTask: { state: 'open' },
      actions: { planEstimateVisit: false, planWorkVisit: true },
    })
    const late = await plan('office', p.projectId, {
      purpose: 'site_estimate',
      localDate: date,
      windowStart: '12:00',
      windowEnd: '13:00',
    })
    expect(late.statusCode).toBe(409)
    expect(fieldCodes(late.body)).toEqual([['project', 'PROJECT_NOT_OPEN']])

    // The work visit is on the job; PROPOSED: the scheduling task moves to planning, and is never a booking.
    const work = await plan('office', p.projectId, {
      purpose: 'service',
      localDate: addLocalDays(date, 1),
      windowStart: '08:00',
      windowEnd: '10:00',
      expectedDurationMinutes: 240,
      requiredWorkers: 2,
    })
    expect(work.statusCode, work.body).toBe(201)
    const both = work.json<Visits>()
    expect(both.visits.map((v) => [v.purpose, v.jobId, v.state])).toEqual([
      ['site_estimate', null, 'tentative'],
      ['service', jobId, 'tentative'],
    ])
    expect(both.schedulingTask).toEqual({ state: 'planning' })
    // One job may have several visits (a follow-up, return work).
    const follow = await plan('owner', p.projectId, {
      purpose: 'follow_up',
      localDate: addLocalDays(date, 3),
      windowStart: '13:00',
      windowEnd: '14:00',
    })
    expect(follow.statusCode, follow.body).toBe(201)
    expect(
      follow
        .json<Visits>()
        .visits.filter((v) => v.jobId === jobId)
        .map((v) => v.purpose),
    ).toEqual(['service', 'follow_up'])
    // The original timing preference is untouched on the request.
    const req = await t.db
      .selectFrom('intake.requests')
      .select(['time_windows', 'flexible'])
      .where('id', '=', p.requestId)
      .executeTakeFirstOrThrow()
    expect(req).toEqual({ time_windows: ['mornings'], flexible: true })
    // The scheduling task is not fulfilled by a tentative visit, and the database refuses it outright.
    await expect(
      sql`UPDATE work.scheduling_tasks SET state = 'fulfilled', version = version + 1 WHERE job_id = ${jobId}`.execute(
        t.db,
      ),
    ).rejects.toThrow(/fulfilled only after a committed visit/)
  })

  it('[RULE-SERVER-AUTHZ] the Estimator plans estimate visits only; a worker and customers see none of it', async () => {
    const p = await siteVisitRequest()
    const date = DAY_AFTER_TOMORROW()
    const est = await plan('estimator', p.projectId, {
      purpose: 'site_estimate',
      localDate: date,
      windowStart: '10:00',
      windowEnd: '11:00',
    })
    expect(est.statusCode, est.body).toBe(201)
    expect(est.json<Visits>().actions).toEqual({ planEstimateVisit: true, planWorkVisit: false })
    const jobId = await approve(p)
    expect(jobId).toEqual(expect.any(String))
    const work = await plan('estimator', p.projectId, {
      purpose: 'return_work',
      localDate: date,
      windowStart: '12:00',
      windowEnd: '13:00',
    })
    expect(work.statusCode).toBe(403)
    expect((await visits(p.projectId, 'estimator')).actions.planWorkVisit).toBe(false)
    // A worker has My Day only; no board, no planning.
    expect((await staffGet('worker', `/api/v1/staff/projects/${p.projectId}/visits`)).statusCode).toBe(403)
    expect(
      (
        await plan('worker', p.projectId, {
          purpose: 'site_estimate',
          localDate: date,
          windowStart: '09:00',
          windowEnd: '10:00',
        })
      ).statusCode,
    ).toBe(403)
    // No customer or guest route reaches visits.
    expect((await app.inject({ method: 'GET', url: `/api/v1/staff/projects/${p.projectId}/visits` })).statusCode).toBe(
      401,
    )
    // An unknown project is not found.
    expect((await staffGet('office', `/api/v1/staff/projects/${randomUUID()}/visits`)).statusCode).toBe(404)
  })

  it('[HH-SCH-11][HH-SCH-06] work-visit windows pass the job scheduling gates; estimate visits never wait for them', async () => {
    const p = await siteVisitRequest()
    const date = DAY_AFTER_TOMORROW()
    const jobId = await approve(p)
    blockedJobs.add(jobId)
    const refused = await plan(
      'owner',
      p.projectId,
      { purpose: 'service', localDate: date, windowStart: '09:00', windowEnd: '10:00' },
      'gated',
    )
    expect(refused.statusCode).toBe(409)
    expect(fieldCodes(refused.body)).toEqual([['job', 'SYNTHETIC_GATE_UNMET']])
    expect(await visitRows(p.projectId)).toEqual([])
    blockedJobs.delete(jobId)
    const ok = await plan(
      'owner',
      p.projectId,
      { purpose: 'service', localDate: date, windowStart: '09:00', windowEnd: '10:00' },
      'gated',
    )
    expect(ok.statusCode, ok.body).toBe(201)
    // A window change passes them again.
    blockedJobs.add(jobId)
    const v = ok.json<Visits>().visits[0] as VisitView
    const moved = await staffWrite(
      'owner',
      'POST',
      `/api/v1/staff/visits/${v.id}/window`,
      { localDate: date, windowStart: '10:00', windowEnd: '11:00' },
      v.version,
      'gated',
    )
    expect(moved.statusCode).toBe(409)
    expect(fieldCodes(moved.body)).toEqual([['job', 'SYNTHETIC_GATE_UNMET']])
    blockedJobs.delete(jobId)
  })
})

describe('[HH-SCH-02][HH-DATA-06][T41] UTC instants with the IANA zone; DST gaps and repeated hours', () => {
  it('[T41] a time inside the spring-forward gap is refused with what the clocks skip; nothing is stored', async () => {
    const p = await siteVisitRequest()
    const res = await plan('office', p.projectId, {
      purpose: 'site_estimate',
      localDate: SPRING_DATE,
      windowStart: GAP,
      windowEnd: '04:00',
    })
    expect(res.statusCode).toBe(400)
    expect(res.json()).toMatchObject({
      error: { code: 'VALIDATION_FAILED', fieldErrors: [{ field: 'body.windowStart', code: 'LOCAL_TIME_GAP' }] },
    })
    expect(GAP_FROM).toBe('02:00')
    expect(GAP_TO).toBe('03:00')
    expect(await visitRows(p.projectId)).toEqual([])
    // The database refuses such a window as well, whatever writes it.
    const office = await t.db
      .selectFrom('identity.staff_users')
      .select('id')
      .where('email', '=', 'office-visits@example.test')
      .executeTakeFirstOrThrow()
    const property = await t.db
      .selectFrom('crm.projects')
      .select('property_id')
      .where('id', '=', p.projectId)
      .executeTakeFirstOrThrow()
    const offset = spring.offsetBefore
    await expect(
      t.db
        .insertInto('work.visits')
        .values({
          purpose: 'site_estimate',
          project_id: p.projectId,
          property_id: property.property_id,
          local_date: SPRING_DATE,
          window_start: GAP,
          window_end: '04:00',
          time_zone: ZONE,
          start_offset_minutes: offset,
          end_offset_minutes: spring.offsetAfter,
          starts_at: wallUtc(SPRING_DATE, GAP, offset),
          ends_at: wallUtc(SPRING_DATE, '04:00', spring.offsetAfter),
          window_set_by: office.id,
          created_by: office.id,
        })
        .execute(),
    ).rejects.toThrow(/instants show its local date and times/)
  })

  it('[T41] a time inside the repeated hour needs its offset and is stored unambiguously with it', async () => {
    const p = await siteVisitRequest()
    const body = { purpose: 'site_estimate', localDate: FALL_DATE, windowStart: REPEATED, windowEnd: '03:00' }
    const ask = await plan('office', p.projectId, body)
    expect(ask.statusCode).toBe(400)
    expect(fieldCodes(ask.body)).toEqual([['body.startOffset', 'LOCAL_TIME_REPEATED']])
    const wrong = await plan('office', p.projectId, { ...body, startOffset: '-06:00' })
    expect(fieldCodes(wrong.body)).toEqual([['body.startOffset', 'OFFSET_INVALID']])
    expect(await visitRows(p.projectId)).toEqual([])

    const later = formatOffset(fall.offsetAfter)
    const res = await plan('office', p.projectId, { ...body, startOffset: later })
    expect(res.statusCode, res.body).toBe(201)
    const v = res.json<Visits>().visits[0] as VisitView
    expect(v.window).toEqual({
      localDate: FALL_DATE,
      start: REPEATED,
      end: '03:00',
      timeZone: ZONE,
      startOffset: later,
      endOffset: later,
      startsAt: wallUtc(FALL_DATE, REPEATED, fall.offsetAfter),
      endsAt: wallUtc(FALL_DATE, '03:00', fall.offsetAfter),
      // 01:30 is outside the daily visit hours: shown to staff, checked again at confirmation (HH-SCH-06).
      withinVisitHours: false,
    })
    // The stored row: the local fields, the zone, the offsets and the UTC instants, all agreeing.
    const [row] = await visitRows(p.projectId)
    expect(row).toMatchObject({
      local_date: FALL_DATE,
      window_start: `${REPEATED}:00`,
      time_zone: ZONE,
      start_offset_minutes: fall.offsetAfter,
      end_offset_minutes: fall.offsetAfter,
    })
    expect(new Date(row?.starts_at as Date).toISOString()).toBe(wallUtc(FALL_DATE, REPEATED, fall.offsetAfter))
    // The other reading is a different instant, one hour earlier.
    const earlier = await plan('office', p.projectId, { ...body, startOffset: formatOffset(fall.offsetBefore) })
    expect(earlier.statusCode, earlier.body).toBe(201)
    const both = earlier.json<Visits>().visits.map((x) => x.window.startsAt)
    expect(Date.parse(both[1] as string) - Date.parse(both[0] as string)).toBe(
      (fall.offsetBefore - fall.offsetAfter) * MIN,
    )
  })

  it('[T41][HH-SCH-01] a window moved across the DST change keeps its local times, with the history of both', async () => {
    const p = await siteVisitRequest()
    const before = addLocalDays(FALL_DATE, -1)
    const after = addLocalDays(FALL_DATE, 1)
    const res = await plan('office', p.projectId, {
      purpose: 'site_estimate',
      localDate: before,
      windowStart: '09:00',
      windowEnd: '11:00',
    })
    expect(res.statusCode, res.body).toBe(201)
    const v = res.json<Visits>().visits[0] as VisitView
    expect(v.window).toMatchObject({ startsAt: wallUtc(before, '09:00', fall.offsetBefore), withinVisitHours: true })

    // A stale version is refused with the current one; nothing changes.
    const stale = await staffWrite(
      'office',
      'POST',
      `/api/v1/staff/visits/${v.id}/window`,
      { localDate: after, windowStart: '09:00', windowEnd: '11:00' },
      v.version + 5,
    )
    expect(stale.statusCode).toBe(409)
    expect(stale.json()).toMatchObject({
      error: {
        code: 'STALE_VERSION',
        current: { version: 1, values: { state: 'tentative', localDate: before, windowStart: '09:00' } },
      },
    })
    const moved = await staffWrite(
      'office',
      'POST',
      `/api/v1/staff/visits/${v.id}/window`,
      { localDate: after, windowStart: '09:00', windowEnd: '11:00', reason: 'Synthetic: the customer asked' },
      v.version,
    )
    expect(moved.statusCode, moved.body).toBe(200)
    const m = moved.json<Visits>().visits[0] as VisitView
    expect(m).toMatchObject({ version: 2, windowVersion: 2 })
    expect(m.window).toMatchObject({
      localDate: after,
      start: '09:00',
      end: '11:00',
      startOffset: formatOffset(fall.offsetAfter),
      startsAt: wallUtc(after, '09:00', fall.offsetAfter),
    })
    expect(m.history.map((h) => [h.windowVersion, h.window.localDate, h.window.start, h.window.startOffset])).toEqual([
      [2, after, '09:00', formatOffset(fall.offsetAfter)],
      [1, before, '09:00', formatOffset(fall.offsetBefore)],
    ])
    expect(m.history[0]).toMatchObject({ reason: 'Synthetic: the customer asked', visitState: 'tentative' })
    // The same window again is no change.
    const same = await staffWrite(
      'office',
      'POST',
      `/api/v1/staff/visits/${v.id}/window`,
      { localDate: after, windowStart: '09:00', windowEnd: '11:00' },
      2,
    )
    expect(fieldCodes(same.body)).toEqual([['body', 'WINDOW_UNCHANGED']])
    // A gap time is refused on a change too.
    const gap = await staffWrite(
      'office',
      'POST',
      `/api/v1/staff/visits/${v.id}/window`,
      { localDate: SPRING_DATE, windowStart: GAP, windowEnd: '04:00' },
      2,
    )
    expect(fieldCodes(gap.body)).toEqual([['body.windowStart', 'LOCAL_TIME_GAP']])
    const audit = await t.db
      .selectFrom('platform.audit_events')
      .select(['action', 'summary', 'reason'])
      .where('target_id', '=', v.id)
      .where('action', '=', 'visit.change_window')
      .execute()
    expect(audit).toEqual([
      expect.objectContaining({
        reason: 'Synthetic: the customer asked',
        summary: expect.objectContaining({
          windowVersion: 2,
          from: expect.objectContaining({ localDate: before }),
          to: expect.objectContaining({ localDate: after }),
        }),
      }),
    ])
  })

  it('[HH-SCH-02] past, impossible and reversed windows are refused', async () => {
    const p = await siteVisitRequest()
    const today = localDateOf(new Date(), ZONE)
    const cases: [Record<string, unknown>, [string, string][]][] = [
      [
        { localDate: addLocalDays(today, -1), windowStart: '09:00', windowEnd: '10:00' },
        [['body.localDate', 'WINDOW_IN_PAST']],
      ],
      [{ localDate: '2027-02-30', windowStart: '09:00', windowEnd: '10:00' }, [['body.localDate', 'DATE_INVALID']]],
      [
        { localDate: DAY_AFTER_TOMORROW(), windowStart: '11:00', windowEnd: '10:00' },
        [['body.windowEnd', 'WINDOW_ORDER']],
      ],
    ]
    for (const [body, codes] of cases) {
      const res = await plan('office', p.projectId, { purpose: 'site_estimate', ...body })
      expect(res.statusCode, JSON.stringify(body)).toBe(400)
      expect(fieldCodes(res.body)).toEqual(codes)
    }
    const malformed = await plan('office', p.projectId, {
      purpose: 'site_estimate',
      localDate: DAY_AFTER_TOMORROW(),
      windowStart: '9:00',
      windowEnd: '10:00',
    })
    expect(malformed.statusCode).toBe(400)
    expect(await visitRows(p.projectId)).toEqual([])
  })

  it('[HH-DATA-06][FACT-TIMEZONE] with business.timezone NOT CONFIGURED no visit is planned or moved', async () => {
    const p = await siteVisitRequest()
    const ok = await plan('office', p.projectId, {
      purpose: 'site_estimate',
      localDate: DAY_AFTER_TOMORROW(),
      windowStart: '09:00',
      windowEnd: '10:00',
    })
    expect(ok.statusCode).toBe(201)
    const v = ok.json<Visits>().visits[0] as VisitView
    await recordPolicyVersion(t.db, {
      key: 'business.timezone',
      value: null,
      sourceIds: ['OQ-TIMEZONE-ID'],
      changedBy: 'test',
      reason: 'synthetic: NOT CONFIGURED',
    })
    try {
      const refused = await plan('office', p.projectId, {
        purpose: 'site_estimate',
        localDate: DAY_AFTER_TOMORROW(),
        windowStart: '11:00',
        windowEnd: '12:00',
      })
      expect(refused.statusCode).toBe(503)
      expect(refused.json()).toMatchObject({
        error: {
          code: 'NOT_CONFIGURED',
          fieldErrors: [{ field: 'business.timezone', code: 'BUSINESS_TIMEZONE_NOT_CONFIGURED' }],
        },
      })
      const move = await staffWrite(
        'office',
        'POST',
        `/api/v1/staff/visits/${v.id}/window`,
        { localDate: DAY_AFTER_TOMORROW(), windowStart: '11:00', windowEnd: '12:00' },
        v.version,
      )
      expect(move.statusCode).toBe(503)
      const view = await visits(p.projectId)
      expect(view).toMatchObject({
        businessTimeZone: null,
        actions: { planEstimateVisit: false, planWorkVisit: false },
      })
      expect(view.visits[0]?.actions.changeWindow).toBe(false)
      expect(await visitRows(p.projectId)).toHaveLength(1)
    } finally {
      await recordPolicyVersion(t.db, {
        key: 'business.timezone',
        value: { zone: ZONE },
        sourceIds: ['FACT-TIMEZONE', 'OQ-TIMEZONE-ID'],
        changedBy: 'test',
        reason: 'synthetic: restore',
        proposed: true,
      })
    }
  })
})

describe('[HH-SCH-01][HH-SCH-05] the database keeps visits honest', () => {
  it('[HH-SCH-05][RULE-SAFETY-GATES] no visit is confirmed without a reservation; edges, history and deletes are guarded', async () => {
    const p = await siteVisitRequest()
    const res = await plan('office', p.projectId, {
      purpose: 'site_estimate',
      localDate: DAY_AFTER_TOMORROW(),
      windowStart: '09:00',
      windowEnd: '10:00',
    })
    expect(res.statusCode).toBe(201)
    const id = (res.json<Visits>().visits[0] as VisitView).id
    await expect(
      sql`UPDATE work.visits SET state = 'confirmed', version = version + 1 WHERE id = ${id}`.execute(t.db),
    ).rejects.toThrow(/confirmed only with a reservation/)
    await expect(
      sql`UPDATE work.visits SET state = 'completed', version = version + 1 WHERE id = ${id}`.execute(t.db),
    ).rejects.toThrow(/cannot move from tentative to completed/)
    await expect(
      sql`UPDATE work.visits SET purpose = 'service', version = version + 1 WHERE id = ${id}`.execute(t.db),
    ).rejects.toThrow(/keeps its purpose/)
    await expect(
      sql`UPDATE work.visits SET local_date = local_date + 1, version = version + 1 WHERE id = ${id}`.execute(t.db),
    ).rejects.toThrow(/instants show its local date/)
    await expect(sql`DELETE FROM work.visits WHERE id = ${id}`.execute(t.db)).rejects.toThrow(/never deleted/)
    await expect(sql`UPDATE work.visit_windows SET reason = 'x' WHERE visit_id = ${id}`.execute(t.db)).rejects.toThrow()
    await expect(sql`DELETE FROM work.visit_windows WHERE visit_id = ${id}`.execute(t.db)).rejects.toThrow()
    // An estimate visit has no job, a work visit always one (checked by the database).
    await expect(
      sql`UPDATE work.visits SET job_id = ${randomUUID()}, version = version + 1 WHERE id = ${id}`.execute(t.db),
    ).rejects.toThrow()
    // Expiry (24 hours after an offer, OWN-DEC-144) is an allowed edge; nothing changes it afterwards.
    await sql`UPDATE work.visits SET state = 'expired', version = version + 1 WHERE id = ${id}`.execute(t.db)
    await expect(
      sql`UPDATE work.visits SET state = 'tentative', version = version + 1 WHERE id = ${id}`.execute(t.db),
    ).rejects.toThrow(/cannot move from expired/)
    const view = await visits(p.projectId)
    expect(view.visits[0]).toMatchObject({ state: 'expired', actions: { changeWindow: false } })
  })

  it('[HH-LEAD-08][OWN-DEC-100] with a planned visit, Not a Fit routes to the Owner instead of closing', async () => {
    const p = await siteVisitRequest()
    const res = await plan('office', p.projectId, {
      purpose: 'site_estimate',
      localDate: DAY_AFTER_TOMORROW(),
      windowStart: '09:00',
      windowEnd: '10:00',
    })
    expect(res.statusCode).toBe(201)
    const version = (
      await t.db
        .selectFrom('intake.requests')
        .select('state_version')
        .where('id', '=', p.requestId)
        .executeTakeFirstOrThrow()
    ).state_version
    const decided = await staffWrite(
      'office',
      'POST',
      `/api/v1/staff/requests/${p.requestId}/actions/not-a-fit`,
      { category: 'outside_scope', customerReason: 'Synthetic reason' },
      version,
    )
    expect(decided.statusCode, decided.body).toBe(200)
    expect(decided.json()).toMatchObject({ outcome: 'routed_to_owner', projectState: 'cancellation_review' })
  })
})
