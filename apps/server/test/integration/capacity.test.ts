// Capacity and double-booking prevention against PostgreSQL 16 (TSK-0062; HH-SCH-03, HH-SCH-04, HH-DATA-04, T38, T39,
// T42, ENT-Reservation, ENT-StaffUser, ENT-Visit, FACT-HOURS, FACT-TIMEZONE, OWN-DEC-05, OWN-DEC-119, OWN-DEC-123,
// RULE-SERVER-AUTHZ, RULE-SAFETY-GATES). Staff, customers, working hours, equipment and names are synthetic
// (RULE-SYNTHETIC-DATA): the hours below are test fixtures, never the business's hours. Nothing reaches a provider.
// - The races run real concurrent transactions: parallel API calls on an app with a pool wide enough for all of them,
//   and raw transactions on their own connections, so the database itself (the exclusion constraints) is what
//   decides, not the order of the calls.
// - Every visit is an Estimate visit on its own synthetic request unless a work visit is needed (then a synthetic
//   "approved and attorney-reviewed" terms version is recorded in this throwaway database only, as the approval tests
//   do: a fixture, never a statement that the owner approved anything).
import { randomUUID } from 'node:crypto'
import { createDb, loadServiceSeed, syncServices, withTx, type Db } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import { addLocalDays, localDateOf } from '@handyhub/domain'
import { ESTIMATE_TERMS } from '@handyhub/domain/legal'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { startCustomerSession } from '../../src/modules/identity/customer-sessions.js'
import { readCodeKey, type CodeKeySettings } from '../../src/modules/identity/index.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import { apiModules } from '../../src/modules/index.js'
import { visitsModule, type WorkVisitGate } from '../../src/modules/visits/index.js'
import { recordPolicyVersion } from '../../src/platform/config/index.js'
import { FakeObjectStorage } from '../../src/providers/r2/index.js'
import { verifyCountyOf } from '../fixtures/county.js'
import { testConfig } from '../fixtures/env.js'
import { verifyPropertyZone } from '../fixtures/zones.js'
import { signInWithMfa, TEST_MFA_KEY } from '../fixtures/staff-mfa.js'

const ZONE = 'America/Kentucky/Louisville'
const KEY: CodeKeySettings = readCodeKey({
  HANDYHUB_ENV: 'ci',
  CODE_HASH_KEY: ['synthetic', 'capacity', 'code', 'key', 'for', 'tests', 'only', '0062'].join('-'),
})
const pw = ['synthetic', 'capacity', 'passphrase', '62'].join(' ')
const SIGNED_IN = ['owner', 'office', 'estimator', 'worker'] as const
type Person = (typeof SIGNED_IN)[number]
/** The synthetic field team: ann and ben (the two employees of OWN-DEC-05), cal and dee for the other cases. */
const CREW = ['ann', 'ben', 'cal', 'dee'] as const
type Crew = (typeof CREW)[number]

let t: TestDatabase
let wide: Db
let app: FastifyInstance
let gated: FastifyInstance
const cookies = {} as Record<Person, string>
const csrf = {} as Record<Person, string>
const gatedSession = { cookie: '', csrf: '' }
const ids = {} as Record<Person | Crew, string>
const blockedJobs = new Set<string>()
const TEST_GATE: WorkVisitGate = {
  source: 'test',
  unmet: async (_tx, job) => (blockedJobs.has(job.jobId) ? ['SYNTHETIC_GATE_UNMET'] : []),
}

const today = () => localDateOf(new Date(), ZONE)
/** A local date some days ahead (each test uses its own dates, so their reservations never meet). */
const day = (n: number) => addLocalDays(today(), n)
/** Every weekday 08:00-18:00: a synthetic fixture. */
const WEEK = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, start: '08:00', end: '18:00' }))

async function signIn(server: FastifyInstance, p: Person): Promise<[string, string]> {
  const res = await signInWithMfa(server, {
    method: 'POST',
    url: '/api/v1/staff/auth/sign-in',
    headers: { 'x-forwarded-for': '198.51.100.162' },
    payload: { email: `${p}-capacity@example.test`, password: pw },
  })
  expect(res.statusCode, res.body).toBe(200)
  const cookie = String(res.headers['set-cookie']).split(';')[0] as string
  const session = await server.inject({ method: 'GET', url: '/api/v1/staff/auth/session', headers: { cookie } })
  return [cookie, session.json<{ csrfToken: string }>().csrfToken]
}

beforeAll(async () => {
  t = await createTestDatabase()
  // Wide enough that every parallel call below holds its own connection at the same time.
  wide = createDb(t.url, { max: 16, applicationName: 'capacity-test' })
  await syncServices(t.db, loadServiceSeed())
  const config = testConfig({ TRUST_PROXY_HOPS: '1' })
  app = await buildApp({ config, api: { db: wide, codeKey: KEY, storage: new FakeObjectStorage() } })
  const modules = apiModules({ secureCookies: false, mfaKey: TEST_MFA_KEY, codeKey: KEY, trustProxyHops: 1 }).map(
    (m) => (m.name === 'visits' ? visitsModule({ workVisitGates: [TEST_GATE] }) : m),
  )
  gated = await buildApp({ config, api: { db: wide, modules } })
  const hash = await hashPassword(pw)
  await withTx(t.db, async (tx) => {
    for (const p of SIGNED_IN) {
      const user = await createStaffUser(tx, {
        email: `${p}-capacity@example.test`,
        displayName: `Synthetic ${p}`,
        locale: p === 'office' ? 'es' : 'en',
        role: p,
        issuedBy: 'test',
      })
      await setPasswordHash(tx, user.id, hash)
      ids[p] = user.id
    }
    for (const c of CREW) {
      const user = await createStaffUser(tx, {
        email: `${c}-crew-capacity@example.test`,
        displayName: `Synthetic ${c}`,
        locale: 'en',
        role: 'worker',
        issuedBy: 'test',
      })
      await sql`UPDATE identity.staff_users SET status = 'active', activated_at = now() WHERE id = ${user.id}`.execute(
        tx,
      )
      ids[c] = user.id
    }
  })
  for (const p of SIGNED_IN) [cookies[p], csrf[p]] = await signIn(app, p)
  ;[gatedSession.cookie, gatedSession.csrf] = await signIn(gated, 'owner')
})
afterAll(async () => {
  await app?.close()
  await gated?.close()
  await wide?.destroy()
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
const codes = (body: string): [string, string][] =>
  JSON.parse(body).error.fieldErrors.map((f: { field: string; code: string }) => [f.field, f.code])

async function setHours(crew: Crew, periods: { weekday: number; start: string; end: string }[]) {
  const before = (await staffGet('owner', '/api/v1/staff/availability')).json<Availability>()
  const version = before.workers.find((w) => w.id === ids[crew])?.schedule?.version ?? 0
  const res = await staffWrite('owner', 'PUT', `/api/v1/staff/workers/${ids[crew]}/working-hours`, { periods }, version)
  expect(res.statusCode, res.body).toBe(200)
  return res.json<{ flagged: number; availability: Availability }>()
}

const ALL_OK = Object.fromEntries(
  ['coverage', 'service_fit', 'essential_facts', 'urgency', 'site_visit_need', 'staff_equipment', 'risk_flags'].map(
    (c) => [c, { outcome: 'ok' }],
  ),
)
type Project = { requestId: string; projectId: string; reference: string; contactId: string; grantId: string }
let ip = 10

/** A qualified synthetic request with "Site visit needed": its project is open for Estimate visits. */
async function siteVisitProject(): Promise<Project> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/public/requests',
    headers: { 'idempotency-key': key('submit'), 'x-forwarded-for': `198.51.100.${++ip}` },
    payload: {
      formVersion: 'test-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-01' }],
      notSure: false,
      description: 'Synthetic capacity project.',
      answers: [],
      property: {
        street: `${seq} Synthetic Capacity Way`,
        city: 'Testville',
        state: 'ky',
        zip: '40000',
        propertyType: 'house',
      },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'site_visit',
      contact: {
        fullName: 'Synthetic Capacity Customer',
        email: `capacity-${seq}-${randomUUID().slice(0, 8)}@example.test`,
        phone: '(502) 555-0162',
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
    .select(['id', 'project_id', 'contact_id'])
    .where('reference', '=', reference)
    .executeTakeFirstOrThrow()
  // TSK-0127: staff's address and county check, which a first confirmation needs.
  await verifyCountyOf(t.db, row.project_id)
  const grant = await t.db
    .selectFrom('identity.project_access_grants')
    .select('id')
    .where('request_id', '=', row.id)
    .executeTakeFirstOrThrow()
  // TSK-0123: the property's zone is unknown until verified; these tests plan visits, so it is verified first.
  await verifyPropertyZone(t.db, { projectId: row.project_id })
  const p = { requestId: row.id, projectId: row.project_id, reference, contactId: row.contact_id, grantId: grant.id }
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

/**
 * Approves an estimate for the project through the real approval transaction, so its job, task and deposit
 * requirement exist. Two synthetic patches at the given unit price (default $12.50 each: no deposit required).
 */
async function approve(p: Project, unitPriceCents = 1250): Promise<string> {
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
          unitPriceCents,
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
    approval: { contentDigest: string; selection: { totalCents: number; deposit: { amountCents: number | null } } }
  }>()
  const res = await app.inject({
    method: 'POST',
    url: `${base}/approve`,
    headers: {
      cookie,
      'idempotency-key': key('approve'),
      'x-forwarded-for': `2001:db8:62:${++ip}::1`,
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
      fullName: 'Synthetic Capacity Customer',
    },
  })
  expect(res.statusCode, res.body).toBe(201)
  return (
    await t.db.selectFrom('work.jobs').select('id').where('project_id', '=', p.projectId).executeTakeFirstOrThrow()
  ).id
}

type Assignment = {
  id: string
  resource: 'worker' | 'equipment'
  worker: { id: string; name: string | null } | null
  equipment: { id: string; name: string } | null
  role: string | null
  kind: string
  startsAt: string
  endsAt: string
  endedAt: string | null
  endedReason: string | null
  flags: string[]
}
type VisitView = {
  id: string
  purpose: string
  state: string
  version: number
  window: { localDate: string; start: string; end: string; startsAt: string; endsAt: string }
  windowVersion: number
  expectedDurationMinutes: number | null
  reservedRange: { startsAt: string; endsAt: string } | null
  assignments: Assignment[]
  history: { windowVersion: number }[]
  actions: { changeWindow: boolean; confirm: boolean }
}
type Visits = { visits: VisitView[]; schedulingTask: { state: string } | null }
type Availability = {
  businessTimeZone: { zone: string; proposed: boolean } | null
  workers: {
    id: string
    roles: string[]
    eligibleFor: { estimateVisits: boolean; workVisits: boolean }
    schedule: { version: number; timeZone: string; periods: { weekday: number; start: string; end: string }[] } | null
    timeOff: { id: string; startsAt: string; endsAt: string }[]
  }[]
  equipment: { id: string; name: string }[]
}
type Span = { startsAt: string; endsAt: string }
type CapacityDay = {
  date: string
  timeZone: string
  visitHours: { open: string; close: string; periods: Span[] } | null
  workers: {
    id: string
    working: Span[]
    timeOff: Span[]
    reservations: {
      visitId: string
      kind: string
      role: string | null
      startsAt: string
      endsAt: string
      flags: string[]
    }[]
    free: Span[]
  }[]
  equipment: { id: string; name: string; reservations: { visitId: string }[]; free: Span[] }[]
}
type Alternatives = { workers: { id: string }[]; equipment: { id: string }[]; periods: Span[] }

const projectVisits = async (projectId: string, who: Person = 'office') => {
  const res = await staffGet(who, `/api/v1/staff/projects/${projectId}/visits`)
  expect(res.statusCode, res.body).toBe(200)
  return res.json<Visits>()
}
const visitOf = async (projectId: string, visitId: string) =>
  (await projectVisits(projectId)).visits.find((v) => v.id === visitId) as VisitView

type Plan = {
  date: string
  start: string
  end: string
  duration?: number
  travel?: number
  preparation?: number
  workers?: number
  equipment?: string[]
  purpose?: string
}
async function planVisit(p: Project, plan: Plan): Promise<VisitView> {
  const res = await staffWrite('office', 'POST', `/api/v1/staff/projects/${p.projectId}/visits`, {
    purpose: plan.purpose ?? 'site_estimate',
    localDate: plan.date,
    windowStart: plan.start,
    windowEnd: plan.end,
    expectedDurationMinutes: plan.duration ?? 120,
    travelBufferMinutes: plan.travel ?? 30,
    preparationBufferMinutes: plan.preparation ?? 0,
    requiredWorkers: plan.workers ?? 1,
    equipment: plan.equipment ?? [],
  })
  expect(res.statusCode, res.body).toBe(201)
  const all = res.json<Visits>().visits
  return all[all.length - 1] as VisitView
}
const confirm = (who: Person, v: VisitView, workers: Crew[] | string[], equipment: string[] = []) =>
  staffWrite(
    who,
    'POST',
    `/api/v1/staff/visits/${v.id}/confirm`,
    {
      workerIds: workers.map((w) => (w in ids ? ids[w as Crew] : w)),
      ...(equipment.length ? { equipmentIds: equipment } : {}),
    },
    v.version,
  )
const activeOf = (staffUserId: string) =>
  t.db
    .selectFrom('work.reservations')
    .selectAll()
    .where('staff_user_id', '=', staffUserId)
    .where('ended_at', 'is', null)
    .execute()

describe("[HH-SCH-03] working hours, time off and equipment are the Owner's records", () => {
  it('[HH-SCH-03][OWN-DEC-123] a worker without working hours is NOT CONFIGURED and never reserved', async () => {
    const p = await siteVisitProject()
    const v = await planVisit(p, { date: day(3), start: '09:00', end: '10:00' })
    expect(v.actions.confirm).toBe(true)
    const refused = await confirm('office', v, ['ann'])
    expect(refused.statusCode, refused.body).toBe(409)
    expect(codes(refused.body)).toContainEqual([`workers.${ids.ann}`, 'WORKING_HOURS_NOT_SET'])
    expect(refused.json().error.alternatives).toEqual({ workers: [], equipment: [], periods: [] })
    expect(await activeOf(ids.ann)).toEqual([])
    expect((await visitOf(p.projectId, v.id)).state).toBe('tentative')
    const view = (await staffGet('owner', '/api/v1/staff/availability')).json<Availability>()
    const ann = view.workers.find((w) => w.id === ids.ann)
    expect(ann).toMatchObject({ schedule: null, eligibleFor: { estimateVisits: true, workVisits: true } })
    // The Office role is never reserved for a work visit; the Estimator only for estimate visits (PROPOSED).
    expect(view.workers.find((w) => w.id === ids.office)?.eligibleFor).toEqual({
      estimateVisits: false,
      workVisits: false,
    })
    expect(view.workers.find((w) => w.id === ids.estimator)?.eligibleFor).toEqual({
      estimateVisits: true,
      workVisits: false,
    })
  })

  it('[HH-SCH-03][RULE-SERVER-AUTHZ] only the Owner sets hours, with the version shown; periods are checked', async () => {
    const path = `/api/v1/staff/workers/${ids.ann}/working-hours`
    expect((await staffWrite('office', 'PUT', path, { periods: WEEK }, 0)).statusCode).toBe(403)
    expect((await staffGet('office', '/api/v1/staff/availability')).statusCode).toBe(403)
    const overlap = await staffWrite(
      'owner',
      'PUT',
      path,
      {
        periods: [
          { weekday: 1, start: '08:00', end: '12:00' },
          { weekday: 1, start: '11:00', end: '15:00' },
        ],
      },
      0,
    )
    expect(overlap.statusCode).toBe(400)
    expect(codes(overlap.body)).toContainEqual(['body.periods', 'PERIOD_OVERLAP'])
    const order = await staffWrite('owner', 'PUT', path, { periods: [{ weekday: 2, start: '12:00', end: '09:00' }] }, 0)
    expect(codes(order.body)).toContainEqual(['body.periods', 'PERIOD_ORDER'])
    const ok = await staffWrite('owner', 'PUT', path, { periods: WEEK, reason: 'Synthetic hours' }, 0)
    expect(ok.statusCode, ok.body).toBe(200)
    expect(ok.headers['etag']).toBe('"1"')
    const stale = await staffWrite('owner', 'PUT', path, { periods: WEEK }, 0)
    expect(stale.statusCode).toBe(409)
    expect(stale.json().error).toMatchObject({ code: 'STALE_VERSION', current: { version: 1 } })
    const ann = ok.json<{ availability: Availability }>().availability.workers.find((w) => w.id === ids.ann)
    expect(ann?.schedule).toMatchObject({ version: 1, timeZone: ZONE })
    expect(ann?.schedule?.periods).toHaveLength(7)
    await setHours('ben', WEEK)
    // Versions are append-only, and hours are written only with their version.
    await expect(sql`UPDATE work.working_hours SET end_minute = 1000`.execute(t.db)).rejects.toThrow(/APPEND_ONLY/)
    await expect(sql`DELETE FROM work.worker_schedules`.execute(t.db)).rejects.toThrow(/APPEND_ONLY/)
    await expect(sql`INSERT INTO work.working_hours VALUES (${ids.ann}, 1, 3, 0, 60)`.execute(t.db)).rejects.toThrow(
      /written with their schedule version/,
    )
    const audit = await t.db
      .selectFrom('platform.audit_events')
      .select(['action', 'target_id'])
      .where('action', '=', 'staff.set_working_hours')
      .execute()
    expect(audit.map((a) => a.target_id)).toContain(ids.ann)
  })
})

describe('[HH-SCH-04][T38] two confirmations for the same worker cannot both succeed', () => {
  it('[T38][HH-SCH-04][OWN-DEC-119] two staff confirming overlapping visits for one worker at once: one success, one conflict', async () => {
    const p = await siteVisitProject()
    const a = await planVisit(p, { date: day(4), start: '09:00', end: '10:00' })
    const b = await planVisit(p, { date: day(4), start: '09:30', end: '10:30' })
    const [ra, rb] = await Promise.all([confirm('office', a, ['ann']), confirm('owner', b, ['ann'])])
    const statuses = [ra.statusCode, rb.statusCode].sort()
    expect(statuses).toEqual([200, 409])
    const loser = ra.statusCode === 409 ? ra : rb
    expect(loser.json().error.code).toBe('CONFLICT')
    expect(codes(loser.body)).toContainEqual([`workers.${ids.ann}`, 'WORKER_BOOKED'])
    // The loser is offered alternatives: ben is free for that range; free periods of the day are listed.
    const alt = loser.json<{ error: { alternatives: Alternatives } }>().error.alternatives
    expect(alt.workers.map((w) => w.id)).toContain(ids.ben)
    expect(alt.periods.length).toBeGreaterThan(0)
    // Exactly one active reservation of ann in that range; the losing visit is still tentative and reserves nothing.
    const mine = (await activeOf(ids.ann)).filter((r) => [a.id, b.id].includes(r.visit_id))
    expect(mine).toHaveLength(1)
    const losingId = ra.statusCode === 409 ? a.id : b.id
    const losing = await visitOf(p.projectId, losingId)
    expect(losing).toMatchObject({ state: 'tentative', version: 1, assignments: [] })
    // The loser takes an alternative (ben), and that succeeds.
    const retry = await confirm('office', losing, ['ben'])
    expect(retry.statusCode, retry.body).toBe(200)
  })

  it('[T38][HH-SCH-04] many parallel confirmations of the same last capacity: exactly one wins', async () => {
    const p = await siteVisitProject()
    const vs: VisitView[] = []
    for (let i = 0; i < 6; i++) vs.push(await planVisit(p, { date: day(5), start: '13:00', end: '14:00' }))
    const results = await Promise.all(vs.map((v, i) => confirm(i % 2 ? 'owner' : 'office', v, ['ann'])))
    expect(results.filter((r) => r.statusCode === 200)).toHaveLength(1)
    expect(results.filter((r) => r.statusCode === 409)).toHaveLength(5)
    for (const r of results.filter((x) => x.statusCode === 409))
      expect(codes(r.body)).toContainEqual([`workers.${ids.ann}`, 'WORKER_BOOKED'])
    const reserved = (await activeOf(ids.ann)).filter((r) => vs.some((v) => v.id === r.visit_id))
    expect(reserved).toHaveLength(1)
    const confirmed = await t.db
      .selectFrom('work.visits')
      .select('id')
      .where(
        'id',
        'in',
        vs.map((v) => v.id),
      )
      .where('state', '=', 'confirmed')
      .execute()
    expect(confirmed).toHaveLength(1)
  })

  it('[T38][HH-SCH-04] the database itself refuses an overlapping reservation from a concurrent transaction', async () => {
    const p = await siteVisitProject()
    const a = await planVisit(p, { date: day(6), start: '09:00', end: '10:00' })
    const b = await planVisit(p, { date: day(6), start: '09:00', end: '10:00' })
    const row = (visitId: string) => ({
      visitId,
      startsAt: new Date(a.window.startsAt),
      endsAt: new Date(a.window.endsAt),
    })
    const one = new pg.Client({ connectionString: t.url })
    const two = new pg.Client({ connectionString: t.url })
    await one.connect()
    await two.connect()
    try {
      const insert = (c: pg.Client, r: ReturnType<typeof row>) =>
        c.query(
          `INSERT INTO work.reservations (visit_id, resource, staff_user_id, role, kind, starts_at, ends_at, time_zone,
             assigned_by) VALUES ($1, 'worker', $2, 'lead', 'confirmed', $3, $4, $5, $6)`,
          [r.visitId, ids.dee, r.startsAt, r.endsAt, ZONE, ids.office],
        )
      const pid = (await two.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]?.pid ?? 0
      await one.query('BEGIN')
      await two.query('BEGIN')
      await insert(one, row(a.id))
      // The second transaction's insert waits for the first one's outcome...
      const second = insert(two, row(b.id)).then(
        () => 'inserted',
        (e: { code?: string }) => e.code,
      )
      let waiting = false
      for (let i = 0; i < 100 && !waiting; i++) {
        const w = await sql<{ w: string | null }>`
          SELECT wait_event_type AS w FROM pg_stat_activity WHERE pid = ${pid}`.execute(t.db)
        waiting = w.rows[0]?.w === 'Lock'
        if (!waiting) await new Promise((r) => setTimeout(r, 20))
      }
      expect(waiting).toBe(true)
      await one.query('COMMIT')
      // ...and fails on the exclusion constraint once the first commits.
      expect(await second).toBe('23P01')
      await two.query('ROLLBACK')
    } finally {
      await one.end()
      await two.end()
    }
    const rows = await t.db
      .selectFrom('work.reservations')
      .select('visit_id')
      .where('staff_user_id', '=', ids.dee)
      .execute()
    expect(rows.map((r) => r.visit_id)).toEqual([a.id])
  })
})

describe('[HH-SCH-04][T38] a confirmation that loses the race at the database changes nothing', () => {
  it('[T38][HH-SCH-04][HH-DATA-04] the exclusion constraint decides after the checks passed: conflict, alternatives, nothing written', async () => {
    const p = await siteVisitProject()
    const first = await planVisit(p, { date: day(25), start: '09:00', end: '10:00', workers: 2 })
    const second = await planVisit(p, { date: day(25), start: '09:00', end: '10:00', workers: 2 })
    const one = new pg.Client({ connectionString: t.url })
    await one.connect()
    try {
      // Another transaction reserves ben for the first visit and has not committed yet: the API's checks cannot see it.
      await one.query('BEGIN')
      await one.query(
        `INSERT INTO work.reservations (visit_id, resource, staff_user_id, role, kind, starts_at, ends_at, time_zone,
           assigned_by) VALUES ($1, 'worker', $2, 'member', 'confirmed', $3, $4, $5, $6)`,
        [
          first.id,
          ids.ben,
          new Date(Date.parse(first.window.startsAt) - 30 * 60_000),
          new Date(Date.parse(first.window.endsAt) + 120 * 60_000),
          ZONE,
          ids.owner,
        ],
      )
      const racing = confirm('office', second, ['ann', 'ben'])
      let waiting = false
      for (let i = 0; i < 200 && !waiting; i++) {
        const w = await sql<{ n: string }>`
          SELECT count(*) AS n FROM pg_stat_activity
           WHERE application_name = 'capacity-test' AND wait_event_type = 'Lock'`.execute(t.db)
        waiting = Number(w.rows[0]?.n) > 0
        if (!waiting) await new Promise((r) => setTimeout(r, 20))
      }
      expect(waiting).toBe(true)
      await one.query('COMMIT')
      const res = await racing
      expect(res.statusCode, res.body).toBe(409)
      expect(codes(res.body)).toEqual([[`workers.${ids.ben}`, 'WORKER_BOOKED']])
      expect(res.json<{ error: { alternatives: Alternatives } }>().error.alternatives).toHaveProperty('periods')
    } finally {
      await one.end()
    }
    // ann's row of the losing team was rolled back with it: nothing partial, and the visit is still tentative.
    expect(await t.db.selectFrom('work.reservations').select('id').where('visit_id', '=', second.id).execute()).toEqual(
      [],
    )
    expect((await visitOf(p.projectId, second.id)).state).toBe('tentative')
  })
})

describe('[HH-SCH-03][T39] a two-person task reserves both workers', () => {
  it('[T39][HH-SCH-03][OWN-DEC-05] both workers are reserved for the whole window; an overlapping booking is refused; one crew on the board', async () => {
    const p = await siteVisitProject()
    const two = await planVisit(p, { date: day(7), start: '09:00', end: '10:00', workers: 2 })
    // One worker for a two-person visit is refused: the team is never split.
    const short = await confirm('office', two, ['ann'])
    expect(codes(short.body)).toContainEqual(['body.workerIds', 'WORKER_COUNT_MISMATCH'])
    const ok = await confirm('office', two, ['ann', 'ben'])
    expect(ok.statusCode, ok.body).toBe(200)
    const v = await visitOf(p.projectId, two.id)
    expect(v.state).toBe('confirmed')
    const workers = v.assignments.filter((x) => x.resource === 'worker' && x.endedAt === null)
    expect(workers.map((w) => [w.worker?.id, w.role]).sort()).toEqual(
      [
        [ids.ann, 'lead'],
        [ids.ben, 'member'],
      ].sort(),
    )
    // The whole reserved range: travel before the arrival window, preparation and the expected work after it.
    for (const w of workers) expect({ startsAt: w.startsAt, endsAt: w.endsAt }).toEqual(v.reservedRange)
    expect(Date.parse(v.reservedRange?.startsAt ?? '')).toBe(Date.parse(v.window.startsAt) - 30 * 60_000)
    expect(Date.parse(v.reservedRange?.endsAt ?? '')).toBe(Date.parse(v.window.endsAt) + 120 * 60_000)
    // A second visit overlapping it is refused for either worker; with a team of two there is no alternative worker.
    const other = await planVisit(p, { date: day(7), start: '10:00', end: '11:00' })
    for (const w of ['ann', 'ben'] as const) {
      const refused = await confirm('owner', other, [w])
      expect(refused.statusCode).toBe(409)
      expect(codes(refused.body)).toContainEqual([`workers.${ids[w]}`, 'WORKER_BOOKED'])
      expect(refused.json<{ error: { alternatives: Alternatives } }>().error.alternatives.workers).toEqual([])
    }
    // The board: both workers carry the same visit, so the team of two never shows as two crews.
    const cap = (await staffGet('office', `/api/v1/staff/capacity?date=${day(7)}`)).json<CapacityDay>()
    const ann = cap.workers.find((w) => w.id === ids.ann)
    const ben = cap.workers.find((w) => w.id === ids.ben)
    expect(ann?.reservations.map((r) => r.visitId)).toEqual([two.id])
    expect(ben?.reservations.map((r) => r.visitId)).toEqual([two.id])
    const range = { start: Date.parse(v.reservedRange?.startsAt ?? ''), end: Date.parse(v.reservedRange?.endsAt ?? '') }
    for (const w of [ann, ben])
      for (const f of w?.free ?? [])
        expect(Date.parse(f.endsAt) <= range.start || Date.parse(f.startsAt) >= range.end).toBe(true)
  })

  it('[T39][HH-SCH-04][HH-DATA-04] a two-person task reserves both or none', async () => {
    const p = await siteVisitProject()
    const single = await planVisit(p, { date: day(8), start: '09:00', end: '10:00' })
    expect((await confirm('office', single, ['ben'])).statusCode).toBe(200)
    const two = await planVisit(p, { date: day(8), start: '09:30', end: '10:30', workers: 2 })
    const refused = await confirm('office', two, ['ann', 'ben'])
    expect(refused.statusCode).toBe(409)
    expect(codes(refused.body)).toEqual([[`workers.${ids.ben}`, 'WORKER_BOOKED']])
    // ann was free, yet nothing was reserved for her: no partial team.
    expect((await activeOf(ids.ann)).filter((r) => r.visit_id === two.id)).toEqual([])
    // The database refuses a partial team too: a transaction that reserves ann and then fails on ben keeps nothing.
    await expect(
      withTx(t.db, async (tx) => {
        for (const w of [ids.ann, ids.ben])
          await tx
            .insertInto('work.reservations')
            .values({
              visit_id: two.id,
              resource: 'worker',
              staff_user_id: w,
              role: w === ids.ann ? 'lead' : 'member',
              kind: 'confirmed',
              starts_at: new Date(Date.parse(two.window.startsAt) - 30 * 60_000),
              ends_at: new Date(Date.parse(two.window.endsAt) + 120 * 60_000),
              time_zone: ZONE,
              assigned_by: ids.office,
            })
            .execute()
      }),
    ).rejects.toMatchObject({ code: '23P01' })
    expect((await activeOf(ids.ann)).filter((r) => r.visit_id === two.id)).toEqual([])
  })

  it('[T39][HH-SCH-04] a two-person confirmation racing a one-person one: the team is whole or absent', async () => {
    const p = await siteVisitProject()
    for (const n of [9, 10, 11]) {
      const two = await planVisit(p, { date: day(n), start: '09:00', end: '10:00', workers: 2 })
      const one = await planVisit(p, { date: day(n), start: '09:00', end: '10:00' })
      const [r2, r1] = await Promise.all([confirm('office', two, ['ann', 'ben']), confirm('owner', one, ['ben'])])
      expect([r2.statusCode, r1.statusCode].sort()).toEqual([200, 409])
      const forTwo = (
        await t.db
          .selectFrom('work.reservations')
          .select('staff_user_id')
          .where('visit_id', '=', two.id)
          .where('ended_at', 'is', null)
          .execute()
      ).map((r) => r.staff_user_id)
      expect(forTwo.length === 0 || forTwo.length === 2).toBe(true)
      expect(forTwo.length === 2).toBe(r2.statusCode === 200)
    }
  })
})

describe('[HH-SCH-04][T42] a reschedule checks capacity; a failed change keeps the booking', () => {
  it('[T42][HH-SCH-04][HH-OPS-03] a reschedule that fails capacity keeps the booking intact; a stale save conflicts', async () => {
    const p = await siteVisitProject()
    const a = await planVisit(p, { date: day(12), start: '09:00', end: '10:00' })
    const b = await planVisit(p, { date: day(12), start: '14:00', end: '14:30' })
    expect((await confirm('office', a, ['ann'])).statusCode).toBe(200)
    expect((await confirm('office', b, ['ann'])).statusCode).toBe(200)
    const before = await visitOf(p.projectId, a.id)
    const move = (who: Person, v: VisitView, start: string, end: string, version = v.version) =>
      staffWrite(
        who,
        'POST',
        `/api/v1/staff/visits/${v.id}/window`,
        // TSK-0066, TSK-0140: a reschedule of a confirmed visit records its reason and who started it.
        {
          localDate: day(12),
          windowStart: start,
          windowEnd: end,
          reason: 'Synthetic: a reschedule.',
          initiator: 'customer',
        },
        version,
      )
    // Onto b's range: refused with alternatives, and nothing changes.
    const clash = await move('office', before, '14:30', '15:00')
    expect(clash.statusCode, clash.body).toBe(409)
    expect(codes(clash.body)).toContainEqual([`workers.${ids.ann}`, 'WORKER_BOOKED'])
    const alt = clash.json<{ error: { alternatives: Alternatives } }>().error.alternatives
    expect(alt.periods.length).toBeGreaterThan(0)
    const kept = await visitOf(p.projectId, a.id)
    expect(kept).toMatchObject({ version: before.version, windowVersion: 1, state: 'confirmed' })
    expect(kept.assignments).toEqual(before.assignments)
    // An Estimator may plan estimate visits but never reschedule a confirmed one.
    expect((await move('estimator', before, '10:00', '10:30')).statusCode).toBe(403)
    // A free range: the reservation moves with the window; the old one stays as history.
    const moved = await move('office', before, '10:00', '10:30')
    expect(moved.statusCode, moved.body).toBe(200)
    const after = await visitOf(p.projectId, a.id)
    expect(after).toMatchObject({ version: before.version + 1, windowVersion: 2, state: 'confirmed' })
    const active = after.assignments.filter((x) => x.endedAt === null)
    const ended = after.assignments.filter((x) => x.endedAt !== null)
    expect(active).toHaveLength(1)
    expect({ startsAt: active[0]?.startsAt, endsAt: active[0]?.endsAt }).toEqual(after.reservedRange)
    expect(ended).toMatchObject([{ endedReason: 'rescheduled', worker: { id: ids.ann } }])
    expect(after.history.map((h) => h.windowVersion).sort()).toEqual([1, 2])
    // The second editor still holds the old version: their save conflicts and changes nothing.
    const stale = await move('owner', before, '11:00', '11:30')
    expect(stale.statusCode).toBe(409)
    expect(stale.json().error.code).toBe('STALE_VERSION')
    expect((await visitOf(p.projectId, a.id)).version).toBe(after.version)
  })
})

describe('[HH-SCH-03][OWN-DEC-123] availability changes flag appointments, never cancel them', () => {
  it('[HH-SCH-03][OWN-DEC-123] time off flags the visits it overlaps and blocks new ones until withdrawn', async () => {
    const p = await siteVisitProject()
    const v = await planVisit(p, { date: day(13), start: '09:00', end: '10:00' })
    expect((await confirm('office', v, ['ann'])).statusCode).toBe(200)
    const off = await staffWrite('owner', 'POST', `/api/v1/staff/workers/${ids.ann}/time-off`, {
      startDate: day(13),
      endDate: day(13),
    })
    expect(off.statusCode, off.body).toBe(201)
    expect(off.json().flagged).toBe(1)
    const flagged = await visitOf(p.projectId, v.id)
    expect(flagged.state).toBe('confirmed')
    expect(flagged.assignments.find((x) => x.endedAt === null)?.flags).toEqual(['time_off_recorded'])
    const other = await planVisit(p, { date: day(13), start: '15:00', end: '15:30' })
    const refused = await confirm('office', other, ['ann'])
    expect(codes(refused.body)).toContainEqual([`workers.${ids.ann}`, 'TIME_OFF'])
    const timeOffId = (await staffGet('owner', '/api/v1/staff/availability'))
      .json<Availability>()
      .workers.find((w) => w.id === ids.ann)?.timeOff[0]?.id
    expect((await staffWrite('owner', 'POST', `/api/v1/staff/time-off/${timeOffId}/withdraw`, {})).statusCode).toBe(200)
    expect((await staffWrite('owner', 'POST', `/api/v1/staff/time-off/${timeOffId}/withdraw`, {})).statusCode).toBe(409)
    expect((await confirm('office', other, ['ann'])).statusCode).toBe(200)
    await expect(sql`DELETE FROM work.time_off`.execute(t.db)).rejects.toThrow(/never deleted/)
  })

  it('[HH-SCH-03][OWN-DEC-123] new working hours flag the upcoming reservations they no longer cover', async () => {
    const p = await siteVisitProject()
    const v = await planVisit(p, { date: day(14), start: '09:00', end: '10:00' })
    expect((await confirm('office', v, ['ben'])).statusCode).toBe(200)
    const changed = await setHours(
      'ben',
      WEEK.map((w) => ({ ...w, start: '13:00' })),
    )
    expect(changed.flagged).toBeGreaterThanOrEqual(1)
    const after = await visitOf(p.projectId, v.id)
    expect(after.state).toBe('confirmed')
    expect(after.assignments.find((x) => x.endedAt === null)?.flags).toContain('working_hours_changed')
    // A new morning booking for ben is now outside his hours.
    const morning = await planVisit(p, { date: day(15), start: '09:00', end: '10:00' })
    expect(codes((await confirm('office', morning, ['ben'])).body)).toContainEqual([
      `workers.${ids.ben}`,
      'OUTSIDE_WORKING_HOURS',
    ])
    await setHours('ben', WEEK)
  })

  it('[HH-SCH-03][OWN-DEC-123] disabling an account flags its upcoming assignments and blocks new ones', async () => {
    await setHours('cal', WEEK)
    const p = await siteVisitProject()
    const v = await planVisit(p, { date: day(16), start: '09:00', end: '10:00' })
    expect((await confirm('office', v, ['cal'])).statusCode).toBe(200)
    await sql`UPDATE identity.staff_users SET status = 'disabled', disabled_at = now(), version = version + 1
              WHERE id = ${ids.cal}`.execute(t.db)
    const after = await visitOf(p.projectId, v.id)
    expect(after.state).toBe('confirmed')
    expect(after.assignments.find((x) => x.endedAt === null)?.flags).toEqual(['account_disabled'])
    const other = await planVisit(p, { date: day(17), start: '09:00', end: '10:00' })
    expect(codes((await confirm('office', other, ['cal'])).body)).toContainEqual([
      `workers.${ids.cal}`,
      'WORKER_NOT_ACTIVE',
    ])
  })
})

describe('[HH-SCH-03][HH-SCH-04] equipment reservations', () => {
  it('[HH-SCH-03][HH-SCH-04][T38] items are registered by the Owner and reserved once at a time', async () => {
    const reg = async (name: string) => staffWrite('owner', 'POST', '/api/v1/staff/equipment', { name })
    expect(
      (await staffWrite('office', 'POST', '/api/v1/staff/equipment', { name: 'Synthetic ladder A' })).statusCode,
    ).toBe(403)
    const a = await reg('Synthetic ladder A')
    expect(a.statusCode, a.body).toBe(201)
    const dup = await reg('synthetic LADDER a')
    expect(dup.statusCode).toBe(409)
    expect(codes(dup.body)).toEqual([['body.name', 'EQUIPMENT_NAME_TAKEN']])
    expect((await reg('Synthetic ladder B')).statusCode).toBe(201)
    const items = (await staffGet('owner', '/api/v1/staff/availability')).json<Availability>().equipment
    const ladderA = items.find((i) => i.name === 'Synthetic ladder A')?.id as string
    const ladderB = items.find((i) => i.name === 'Synthetic ladder B')?.id as string
    const p = await siteVisitProject()
    const x = await planVisit(p, { date: day(18), start: '09:00', end: '10:00', equipment: ['Synthetic ladder'] })
    const y = await planVisit(p, { date: day(18), start: '09:00', end: '10:00', equipment: ['Synthetic ladder'] })
    expect(codes((await confirm('office', x, ['ann'])).body)).toContainEqual([
      'body.equipmentIds',
      'EQUIPMENT_NOT_ASSIGNED',
    ])
    // Two staff reserving the same item at once for different workers: one success, one conflict.
    const [rx, ry] = await Promise.all([
      confirm('office', x, ['ann'], [ladderA]),
      confirm('owner', y, ['ben'], [ladderA]),
    ])
    expect([rx.statusCode, ry.statusCode].sort()).toEqual([200, 409])
    const loser = rx.statusCode === 409 ? rx : ry
    expect(codes(loser.body)).toContainEqual([`equipment.${ladderA}`, 'EQUIPMENT_BOOKED'])
    expect(
      loser.json<{ error: { alternatives: Alternatives } }>().error.alternatives.equipment.map((e) => e.id),
    ).toEqual([ladderB])
    const cap = (await staffGet('office', `/api/v1/staff/capacity?date=${day(18)}`)).json<CapacityDay>()
    expect(cap.equipment.find((e) => e.id === ladderA)?.reservations).toHaveLength(1)
    // Retiring flags the item's upcoming reservation; a retired item is never reserved.
    const retired = await staffWrite('owner', 'POST', `/api/v1/staff/equipment/${ladderA}/retire`, {})
    expect(retired.statusCode, retired.body).toBe(200)
    expect(retired.json().flagged).toBe(1)
    const losing = await visitOf(p.projectId, rx.statusCode === 409 ? x.id : y.id)
    expect(
      codes((await confirm('office', losing, [rx.statusCode === 409 ? 'ann' : 'ben'], [ladderA])).body),
    ).toContainEqual([`equipment.${ladderA}`, 'EQUIPMENT_RETIRED'])
  })
})

describe('[HH-SCH-03][FACT-HOURS] visits stay inside the visit hours and the working hours', () => {
  it('[FACT-HOURS][HH-SCH-03] the on-site part must fit the daily visit hours; the whole range the working hours', async () => {
    const p = await siteVisitProject()
    const late = await planVisit(p, { date: day(19), start: '20:30', end: '21:30', duration: 60 })
    const res = await confirm('office', late, ['ann'])
    expect(res.statusCode).toBe(409)
    expect(codes(res.body)).toEqual(
      expect.arrayContaining([
        ['window', 'OUTSIDE_VISIT_HOURS'],
        [`workers.${ids.ann}`, 'OUTSIDE_WORKING_HOURS'],
      ]),
    )
    // Planning facts are needed for a range at all.
    const bare = await staffWrite('office', 'POST', `/api/v1/staff/projects/${p.projectId}/visits`, {
      purpose: 'site_estimate',
      localDate: day(19),
      windowStart: '09:00',
      windowEnd: '10:00',
    })
    const v = bare.json<Visits>().visits.find((x) => x.expectedDurationMinutes === null) as VisitView
    expect(v.actions.confirm).toBe(false)
    expect(codes((await confirm('office', v, ['ann'])).body)).toEqual(
      expect.arrayContaining([
        ['visit.expectedDurationMinutes', 'DURATION_NOT_ENTERED'],
        ['visit.requiredWorkers', 'WORKERS_NOT_ENTERED'],
      ]),
    )
  })

  it('[FACT-TIMEZONE][RULE-DECIDED-VALUES-ACTIVE] without the business zone nothing is confirmed or shown', async () => {
    const p = await siteVisitProject()
    const v = await planVisit(p, { date: day(20), start: '09:00', end: '10:00' })
    await recordPolicyVersion(t.db, {
      key: 'business.timezone',
      value: null,
      sourceIds: ['OQ-TIMEZONE-ID'],
      changedBy: 'test',
      reason: 'synthetic: NOT CONFIGURED',
    })
    try {
      const refused = await confirm('office', v, ['ann'])
      expect(refused.statusCode).toBe(503)
      expect(refused.json().error.code).toBe('NOT_CONFIGURED')
      expect((await staffGet('office', `/api/v1/staff/capacity?date=${day(20)}`)).statusCode).toBe(503)
      expect(
        (
          await staffWrite('owner', 'POST', `/api/v1/staff/workers/${ids.dee}/time-off`, {
            startDate: day(20),
            endDate: day(20),
          })
        ).statusCode,
      ).toBe(503)
      expect(await activeOf(ids.ann).then((r) => r.filter((x) => x.visit_id === v.id))).toEqual([])
    } finally {
      await recordPolicyVersion(t.db, {
        key: 'business.timezone',
        value: { zone: ZONE },
        sourceIds: ['FACT-TIMEZONE', 'OWN-DEC-159'],
        changedBy: 'test',
        reason: 'synthetic: restore',
      })
    }
  })
})

describe('[HH-SCH-04][RULE-SERVER-AUTHZ] who confirms and who sees capacity', () => {
  it('[RULE-SERVER-AUTHZ][HH-SCH-04] Owner and Office confirm; Estimator and Worker never do; the Worker sees no board', async () => {
    const p = await siteVisitProject()
    const v = await planVisit(p, { date: day(21), start: '09:00', end: '10:00' })
    expect((await confirm('estimator', v, ['ann'])).statusCode).toBe(403)
    expect((await confirm('worker', v, ['ann'])).statusCode).toBe(403)
    expect((await staffGet('worker', `/api/v1/staff/capacity?date=${day(21)}`)).statusCode).toBe(403)
    expect((await staffGet('estimator', `/api/v1/staff/capacity?date=${day(21)}`)).statusCode).toBe(200)
    const stale = await confirm('office', { ...v, version: v.version + 5 }, ['ann'])
    expect(stale.json().error.code).toBe('STALE_VERSION')
    const ok = await confirm('office', v, ['ann'])
    expect(ok.statusCode, ok.body).toBe(200)
    const again = await confirm('office', { ...v, version: v.version + 1 }, ['ann'])
    expect(codes(again.body)).toEqual([['state', 'VISIT_NOT_TENTATIVE']])
    const audit = await t.db
      .selectFrom('platform.audit_events')
      .select(['summary', 'actor_id'])
      .where('action', '=', 'visit.confirm')
      .where('target_id', '=', v.id)
      .executeTakeFirstOrThrow()
    expect(audit.actor_id).toBe(ids.office)
    expect(audit.summary).toMatchObject({ workers: [ids.ann], equipment: [] })
  })
})

describe('[HH-SCH-04][HH-SCH-05] work visits use the same mechanism', () => {
  it('[HH-SCH-04][HH-SCH-05][OWN-DEC-119] a work visit passes its gates, reserves its team and fulfils the scheduling task', async () => {
    await setHours('dee', WEEK)
    const p = await siteVisitProject()
    const job = await approve(p)
    const v = await planVisit(p, { purpose: 'service', date: day(22), start: '09:00', end: '10:00', workers: 1 })
    blockedJobs.add(job)
    const blocked = await gated.inject({
      method: 'POST',
      url: `/api/v1/staff/visits/${v.id}/confirm`,
      payload: { workerIds: [ids.dee] },
      headers: {
        cookie: gatedSession.cookie,
        'x-csrf-token': gatedSession.csrf,
        'idempotency-key': key('gated'),
        'if-match': `"${v.version}"`,
      },
    })
    expect(blocked.statusCode).toBe(409)
    expect(codes(blocked.body)).toContainEqual(['job', 'SYNTHETIC_GATE_UNMET'])
    blockedJobs.delete(job)
    // The Estimator role is not reserved for a work visit (PROPOSED).
    const estimator = await confirm('office', v, [ids.estimator])
    expect(codes(estimator.body)).toContainEqual([`workers.${ids.estimator}`, 'WORKER_NOT_ELIGIBLE'])
    const ok = await confirm('office', v, ['dee'])
    expect(ok.statusCode, ok.body).toBe(200)
    expect(ok.json<Visits>().schedulingTask).toEqual({ state: 'fulfilled' })
    // A reschedule of the confirmed work visit passes the job's gates again; refused, the booking stays as it was.
    const confirmed = await visitOf(p.projectId, v.id)
    blockedJobs.add(job)
    const moved = await gated.inject({
      method: 'POST',
      url: `/api/v1/staff/visits/${v.id}/window`,
      payload: {
        localDate: day(22),
        windowStart: '11:00',
        windowEnd: '12:00',
        reason: 'Synthetic: a reschedule.',
        initiator: 'customer',
      },
      headers: {
        cookie: gatedSession.cookie,
        'x-csrf-token': gatedSession.csrf,
        'idempotency-key': key('gated'),
        'if-match': `"${confirmed.version}"`,
      },
    })
    blockedJobs.delete(job)
    expect(moved.statusCode, moved.body).toBe(409)
    expect(codes(moved.body)).toContainEqual(['job', 'SYNTHETIC_GATE_UNMET'])
    const kept = await visitOf(p.projectId, v.id)
    expect(kept).toMatchObject({ version: confirmed.version, windowVersion: confirmed.windowVersion })
    expect(kept.assignments).toEqual(confirmed.assignments)
  })

  it('[HH-SCH-06][HH-FIN-02][T36][RULE-SAFETY-GATES] confirming a work visit runs the deposit gate itself; estimate visits never wait', async () => {
    const p = await siteVisitProject()
    // Two synthetic patches at $750.00 each: a $1,500.00 approval, so a deposit is required (FACT-DEPOSIT-RULE).
    const job = await approve(p, 75_000)
    // Fixture: planned on a server whose only work-visit gate is the test gate, as if planned before the deposit
    // was required; the default server refuses to plan it.
    const planned = await gated.inject({
      method: 'POST',
      url: `/api/v1/staff/projects/${p.projectId}/visits`,
      payload: {
        purpose: 'service',
        localDate: day(27),
        windowStart: '09:00',
        windowEnd: '10:00',
        expectedDurationMinutes: 120,
        travelBufferMinutes: 30,
        preparationBufferMinutes: 0,
        requiredWorkers: 1,
        equipment: [],
      },
      headers: {
        cookie: gatedSession.cookie,
        'x-csrf-token': gatedSession.csrf,
        'idempotency-key': key('gated'),
      },
    })
    expect(planned.statusCode, planned.body).toBe(201)
    const v = planned.json<Visits>().visits.find((x) => x.purpose === 'service') as VisitView
    const confirmOn = (server: FastifyInstance) =>
      server === app
        ? confirm('office', v, ['dee'])
        : gated.inject({
            method: 'POST',
            url: `/api/v1/staff/visits/${v.id}/confirm`,
            payload: { workerIds: [ids.dee] },
            headers: {
              cookie: gatedSession.cookie,
              'x-csrf-token': gatedSession.csrf,
              'idempotency-key': key('gated'),
              'if-match': `"${v.version}"`,
            },
          })
    // The required deposit is unpaid: refused on the default server and on one without the registered deposit
    // gate alike (no module configuration skips it); nothing is reserved or confirmed.
    for (const server of [app, gated]) {
      const refused = await confirmOn(server)
      expect(refused.statusCode, refused.body).toBe(409)
      const found = codes(refused.body)
      expect(found).toContainEqual(['deposit', 'DEPOSIT_REQUIRED'])
      expect(found.filter(([, code]) => code === 'DEPOSIT_REQUIRED')).toHaveLength(1)
    }
    expect((await activeOf(ids.dee)).filter((r) => r.visit_id === v.id)).toEqual([])
    expect(await visitOf(p.projectId, v.id)).toMatchObject({ state: 'tentative', version: v.version })
    // Verified money (20% of $1,500.00 in cash) opens it.
    const paid = await staffWrite('office', 'POST', `/api/v1/staff/jobs/${job}/deposit/payments`, {
      // The business date (migration 0005's zone), as the server's IN_FUTURE check reads it, not the UTC date.
      receivedOn: localDateOf(new Date(), 'America/Kentucky/Louisville'),
      method: 'cash',
      amountCents: 30_000,
    })
    expect(paid.statusCode, paid.body).toBe(201)
    const ok = await confirmOn(app)
    expect(ok.statusCode, ok.body).toBe(200)
    expect((await visitOf(p.projectId, v.id)).state).toBe('confirmed')
    // An estimate visit on a project with no job never waits for a deposit.
    const open = await siteVisitProject()
    const estimate = await planVisit(open, { date: day(27), start: '13:00', end: '14:00' })
    expect((await confirm('office', estimate, ['dee'])).statusCode).toBe(200)
  })
})

describe('[HH-SCH-04][RULE-SAFETY-GATES] the database keeps reservations honest', () => {
  it('[HH-SCH-04][ENT-Reservation] reservations are ended once, never edited or deleted; a cancelled visit releases them', async () => {
    const p = await siteVisitProject()
    const v = await planVisit(p, { date: day(23), start: '09:00', end: '10:00' })
    expect((await confirm('office', v, ['ann'])).statusCode).toBe(200)
    const [r] = (await activeOf(ids.ann)).filter((x) => x.visit_id === v.id)
    if (!r) throw new Error('reserved')
    await expect(sql`DELETE FROM work.reservations WHERE id = ${r.id}`.execute(t.db)).rejects.toThrow(/never deleted/)
    await expect(
      sql`UPDATE work.reservations SET ends_at = ends_at + interval '1 hour' WHERE id = ${r.id}`.execute(t.db),
    ).rejects.toThrow(/never edited/)
    // Ending the only reservation of a confirmed visit fails at commit: no confirmed visit loses its team.
    await expect(
      sql`UPDATE work.reservations SET ended_at = now(), ended_reason = 'released' WHERE id = ${r.id}`.execute(t.db),
    ).rejects.toThrow(/keeps a reservation of every required worker/)
    // A reservation is made only for a live visit, for an active account and outside approved time off.
    await expect(
      sql`INSERT INTO work.reservations (visit_id, resource, staff_user_id, role, kind, starts_at, ends_at, time_zone,
            assigned_by) VALUES (${v.id}, 'worker', ${ids.cal}, 'member', 'confirmed', now() + interval '400 days',
            now() + interval '401 days', ${ZONE}, ${ids.office})`.execute(t.db),
    ).rejects.toThrow(/active staff account/)
    // Cancelling the visit ends its reservations in the same transaction (the cancel action itself is TSK-0066).
    await sql`UPDATE work.visits SET state = 'canceled', version = version + 1 WHERE id = ${v.id}`.execute(t.db)
    const ended = await t.db
      .selectFrom('work.reservations')
      .selectAll()
      .where('id', '=', r.id)
      .executeTakeFirstOrThrow()
    expect(ended.ended_reason).toBe('visit_canceled')
    await expect(
      sql`UPDATE work.reservations SET ended_reason = 'released' WHERE id = ${r.id}`.execute(t.db),
    ).rejects.toThrow(/history/)
    // The capacity is free again.
    const again = await planVisit(p, { date: day(23), start: '09:00', end: '10:00' })
    expect((await confirm('office', again, ['ann'])).statusCode).toBe(200)
  })

  it('[HH-SCH-04][OWN-DEC-144] a hold blocks the capacity like a booking until it expires', async () => {
    const p = await siteVisitProject()
    const held = await planVisit(p, { date: day(24), start: '09:00', end: '10:00' })
    const range = {
      start: new Date(Date.parse(held.window.startsAt) - 30 * 60_000),
      end: new Date(Date.parse(held.window.endsAt) + 120 * 60_000),
    }
    const hold = (expires: string) =>
      sql`INSERT INTO work.reservations (visit_id, resource, staff_user_id, role, kind, hold_expires_at, starts_at,
            ends_at, time_zone, assigned_by) VALUES (${held.id}, 'worker', ${ids.ann}, 'lead', 'hold',
            now() + ${expires}::interval, ${range.start}, ${range.end}, ${ZONE}, ${ids.office}) RETURNING id`.execute(
        t.db,
      )
    await hold('1 day')
    const other = await planVisit(p, { date: day(24), start: '09:00', end: '10:00' })
    expect(codes((await confirm('office', other, ['ann'])).body)).toContainEqual([
      `workers.${ids.ann}`,
      'WORKER_BOOKED',
    ])
    const cap = (await staffGet('office', `/api/v1/staff/capacity?date=${day(24)}`)).json<CapacityDay>()
    expect(cap.workers.find((w) => w.id === ids.ann)?.reservations.map((r) => r.kind)).toEqual(['hold'])
    // An expired hold is ended by the next reservation that needs the capacity.
    await sql`UPDATE work.reservations SET ended_at = now(), ended_reason = 'hold_released'
              WHERE visit_id = ${held.id}`.execute(t.db)
    await hold('-1 minute')
    expect((await confirm('office', other, ['ann'])).statusCode).toBe(200)
    const holds = await t.db
      .selectFrom('work.reservations')
      .select('ended_reason')
      .where('visit_id', '=', held.id)
      .orderBy('created_at')
      .execute()
    expect(holds.map((h) => h.ended_reason)).toEqual(['hold_released', 'hold_expired'])
  })
})
