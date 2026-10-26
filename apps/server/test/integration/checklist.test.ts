// The job checklist in six ordered stages against PostgreSQL 16 (TSK-0075; HH-WORK-11, HH-WORK-05, HH-WORK-12, T47,
// ENT-Task, OWN-DEC-108, RULE-SAFETY-GATES, RULE-SERVER-AUTHZ). Staff, customers, notes and measurements are synthetic
// (RULE-SYNTHETIC-DATA); the estimate terms version recorded below is a fixture of this throwaway database. The job is
// prepared and started through the real Start Work gate (the harness of start-work.test.ts, on a PT-01 job, whose SOP
// version has steps in every stage); a critical safety hold is written as the hazard report of TSK-0077 writes it.
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
import { png } from '../fixtures/images.js'
import { signInWithMfa } from '../fixtures/staff-mfa.js'
import { verifyPropertyZone } from '../fixtures/zones.js'

const ZONE = 'America/Kentucky/Louisville'
const KEY: CodeKeySettings = readCodeKey({
  HANDYHUB_ENV: 'ci',
  CODE_HASH_KEY: ['synthetic', 'start', 'work', 'code', 'key', 'for', 'tests', 'only', '0075'].join('-'),
})
const pw = ['synthetic', 'start', 'work', 'passphrase', '75'].join(' ')
const PEOPLE = ['owner', 'office', 'estimator', 'ann', 'ben', 'cara'] as const
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
    headers: { 'x-forwarded-for': '198.51.100.175' },
    payload: { email: `${p}-checklist@example.test`, password: pw },
  })
  expect(res.statusCode, res.body).toBe(200)
  const cookie = String(res.headers['set-cookie']).split(';')[0] as string
  const session = await app.inject({ method: 'GET', url: '/api/v1/staff/auth/session', headers: { cookie } })
  cookies[p] = cookie
  csrf[p] = session.json<{ csrfToken: string }>().csrfToken
}

let seq = 0
const key = () => `synthetic-checklist-${String(++seq).padStart(6, '0')}-${randomUUID()}`
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
  wide = createDb(t.url, { max: 8, applicationName: 'checklist-test' })
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
      const role = p === 'ann' || p === 'ben' || p === 'cara' ? 'worker' : p
      const user = await createStaffUser(tx, {
        email: `${p}-checklist@example.test`,
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
let ip = 20

/** A qualified synthetic request with one PT-01 work package, and a verified customer session for its project. */
async function project(): Promise<Project> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/public/requests',
    headers: { 'idempotency-key': key(), 'x-forwarded-for': `198.51.100.${++ip}` },
    payload: {
      formVersion: 'test-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-PT-01' }],
      notSure: false,
      description: 'Synthetic start project.',
      answers: [],
      property: {
        street: `${++seq} Synthetic Start Lane`,
        city: 'Testville',
        state: 'ky',
        zip: '40000',
        propertyType: 'house',
      },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'site_visit',
      contact: {
        fullName: 'Synthetic Start Customer',
        email: `start-${seq}-${randomUUID().slice(0, 8)}@example.test`,
        phone: '(502) 555-0173',
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
    { customerExplanation: 'We need to see the synthetic wall.', workPackages: ['SVC-PT-01'] },
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
      'x-forwarded-for': `2001:db8:75:${++ip}::1`,
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
      fullName: 'Synthetic Start Customer',
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
// --- The checklist ----------------------------------------------------------------------------------------------------

type Step = {
  stepId: string
  state: string
  version: number
  required: boolean
  evidence: string[]
  note: string | null
  measurement: string | null
  photoIds: string[]
  skipReason: string | null
  worker: { id: string } | null
  completedBy: { id: string } | null
  actions: string[]
}
type View = {
  jobState: string
  blockers: string[]
  packages: {
    workPackageId: string
    code: string
    currentStage: number
    summary: { steps: number; completed: number; skipped: number; requiredSkipped: number; complete: boolean }
    stages: { stage: number; open: boolean; steps: Step[] }[]
  }[]
  photos: { id: string; workPackageId: string }[]
  handoffs: { from: { id: string }; to: { id: string } | null; note: string }[]
  actions: { handoff: boolean }
}
const checklist = async (who: Person, jobId: string) => {
  const res = await staffGet(who, `/api/v1/staff/jobs/${jobId}/checklist`)
  expect(res.statusCode, res.body).toBe(200)
  return res.json<View>()
}
const stepOf = (v: View, stepId: string) =>
  v.packages[0]?.stages.flatMap((s) => s.steps).find((s) => s.stepId === stepId) as Step
const act = (who: Person, jobId: string, event: string, body: Record<string, unknown>) =>
  staffWrite(who, `/api/v1/staff/jobs/${jobId}/checklist/steps/${event}`, body)

describe('[HH-WORK-11][HH-WORK-05][T47] the job checklist in six ordered stages', () => {
  let p: Project
  let jobId: string
  let wp: string
  const step = async (who: Person, event: string, stepId: string, extra: Record<string, unknown> = {}) => {
    const s = stepOf(await checklist(who, jobId), stepId)
    return act(who, jobId, event, { workPackageId: wp, stepId, version: s.version, ...extra })
  }

  it('[HH-WORK-11] opens only after the worker’s own Start Work; office and estimators never act on it', async () => {
    p = await project()
    jobId = await approve(p)
    const visitId = await fixtureVisit(p, jobId, ['ann', 'cara'])
    const version = await prepare('ann', visitId, jobId)
    const started = await start('ann', visitId, version)
    expect(started.statusCode, started.body).toBe(201)
    expect(await jobState(jobId)).toBe('in_progress')
    // Cara is assigned but has not started work: she reads the checklist and is told why she cannot act.
    const cara = await checklist('cara', jobId)
    expect(cara.blockers).toEqual(['WORK_NOT_STARTED'])
    expect(cara.packages[0]?.stages.flatMap((s) => s.steps).every((s) => s.actions.length === 0)).toBe(true)
    wp = cara.packages[0]?.workPackageId as string
    const refused = await act('cara', jobId, 'start', { workPackageId: wp, stepId: '1.2', version: 0 })
    expect(refused.statusCode).toBe(409)
    expect(codesOf(refused)).toEqual(['WORK_NOT_STARTED'])
    for (const who of ['office', 'estimator'] as const)
      expect((await staffGet(who, `/api/v1/staff/jobs/${jobId}/checklist`)).statusCode).toBe(403)
    // The steps are the pinned SOP version's, in its six stages; stage 1 is open, the others wait.
    const ann = await checklist('ann', jobId)
    expect(ann.blockers).toEqual([])
    expect(ann.packages[0]?.code).toBe('PT-01')
    expect(ann.packages[0]?.stages.map((s) => [s.stage, s.open])).toEqual([
      [1, true],
      [2, false],
      [3, false],
      [4, false],
      [5, false],
      [6, false],
    ])
    expect(stepOf(ann, '1.2').actions).toEqual(['start', 'complete', 'skip'])
  })

  it('[HH-WORK-11] stage order, pause and resume, a stale version, and a skip only with a reason', async () => {
    const early = await step('ann', 'start', '2.1')
    expect(early.statusCode).toBe(409)
    expect(codesOf(early)).toEqual(['EARLIER_STAGE_OPEN'])
    expect((await step('ann', 'start', '1.2')).statusCode).toBe(200)
    expect((await step('ann', 'pause', '1.2')).statusCode).toBe(200)
    expect(stepOf(await checklist('ann', jobId), '1.2').state).toBe('paused')
    expect((await step('ann', 'resume', '1.2')).statusCode).toBe(200)
    const stale = await act('ann', jobId, 'complete', { workPackageId: wp, stepId: '1.2', version: 1 })
    expect(stale.statusCode).toBe(409)
    expect(stale.json<{ error: { code: string } }>().error.code).toBe('STALE_VERSION')
    expect((await step('ann', 'complete', '1.2')).statusCode).toBe(200)
    expect(codesOf(await step('ann', 'skip', '1.3'))).toEqual(['REASON_REQUIRED'])
    expect((await step('ann', 'skip', '1.3', { reason: 'Synthetic: no furniture in the room' })).statusCode).toBe(200)
  })

  it('[T47] each record carries its worker; evidence is required; reopening keeps it; the stage opens', async () => {
    // Cara starts work too, then both work the first stage.
    const visit = await t.db
      .selectFrom('work.visits')
      .select('id')
      .where('job_id', '=', jobId)
      .executeTakeFirstOrThrow()
    const version = await prepare('cara', visit.id, jobId, { photos: false })
    expect((await start('cara', visit.id, version)).statusCode).toBe(201)
    const stage1 = (await checklist('ann', jobId)).packages[0]?.stages[0]?.steps ?? []
    for (const [i, s] of stage1.entries())
      if (s.state === 'not_started')
        expect((await step(i % 2 ? 'cara' : 'ann', 'complete', s.stepId)).statusCode).toBe(200)
    let v = await checklist('ann', jobId)
    expect(v.packages[0]?.stages[1]?.open).toBe(true)
    expect(stepOf(v, '1.2')).toMatchObject({ state: 'completed', completedBy: { id: ids.ann } })
    expect(stepOf(v, '1.5')).toMatchObject({ state: 'completed', completedBy: { id: ids.cara } })
    // 2.3 asks for a note; 2.12 for a photo of this job and work package.
    expect(codesOf(await step('cara', 'complete', '2.3'))).toEqual(['EVIDENCE_MISSING'])
    expect((await step('cara', 'complete', '2.3', { note: 'Synthetic: walls dry and sound' })).statusCode).toBe(200)
    const photo = v.photos.find((f) => f.workPackageId === wp)
    if (!photo) throw new Error('the before photo of prepare()')
    expect(codesOf(await step('ann', 'complete', '2.12', { photoIds: [randomUUID()] }))).toEqual([
      'NOT_A_PHOTO_OF_THE_WORK_PACKAGE',
    ])
    expect((await step('ann', 'complete', '2.12', { photoIds: [photo.id] })).statusCode).toBe(200)
    // Reopening needs a reason and keeps the earlier evidence; the history keeps every change with its worker.
    expect(codesOf(await step('ann', 'reopen', '2.3'))).toEqual(['REASON_REQUIRED'])
    expect((await step('ann', 'reopen', '2.3', { reason: 'Synthetic: recheck after priming' })).statusCode).toBe(200)
    v = await checklist('ann', jobId)
    expect(stepOf(v, '2.3')).toMatchObject({ state: 'in_progress', note: 'Synthetic: walls dry and sound' })
    const history = await t.db
      .selectFrom('work.checklist_step_events as e')
      .innerJoin('work.checklist_steps as s', 's.id', 'e.step_row_id')
      .select(['e.event', 'e.worker_id', 'e.note', 'e.reason'])
      .where('s.work_package_id', '=', wp)
      .where('s.step_id', '=', '2.3')
      .orderBy('e.seq')
      .execute()
    expect(history.map((h) => [h.event, h.worker_id])).toEqual([
      ['complete', ids.cara],
      ['reopen', ids.ann],
    ])
    expect(history[1]?.reason).toBe('Synthetic: recheck after priming')
    // A skipped required step is counted for the reviewer and blocks completion.
    expect(v.packages[0]?.summary).toMatchObject({ requiredSkipped: 1, complete: false })
    // Nothing is deleted or rewritten.
    await expect(sql`DELETE FROM work.checklist_step_events`.execute(t.db)).rejects.toThrow()
    await expect(sql`DELETE FROM work.checklist_steps WHERE work_package_id = ${wp}`.execute(t.db)).rejects.toThrow()
  })

  it('[HH-WORK-05] a handoff note keeps the history; the next worker continues where it stopped', async () => {
    const res = await staffWrite('ann', `/api/v1/staff/jobs/${jobId}/checklist/handoffs`, {
      note: 'Synthetic: stage 2 done except the priming check',
      toWorkerId: ids.cara,
    })
    expect(res.statusCode, res.body).toBe(201)
    expect(
      codesOf(
        await staffWrite('ann', `/api/v1/staff/jobs/${jobId}/checklist/handoffs`, {
          note: 'Synthetic',
          toWorkerId: ids.ann,
        }),
      ),
    ).toEqual(['HANDOFF_TO_SELF'])
    const v = await checklist('cara', jobId)
    expect(v.handoffs).toMatchObject([{ from: { id: ids.ann }, to: { id: ids.cara } }])
    expect(stepOf(v, '2.3').state).toBe('in_progress')
    expect((await step('cara', 'complete', '2.3')).statusCode).toBe(200)
  })

  it('[RULE-SAFETY-GATES] an open safety hold stops the checklist, on the server and in the database', async () => {
    await criticalHold(p, jobId, 'ann')
    const v = await checklist('ann', jobId)
    expect(v.blockers).toContain('HOLD_OPEN')
    expect(v.packages[0]?.stages.flatMap((s) => s.steps).every((s) => s.actions.length === 0)).toBe(true)
    const refused = await step('ann', 'complete', '2.1')
    expect(refused.statusCode).toBe(409)
    expect(codesOf(refused)).toEqual(['HOLD_OPEN'])
    await expect(
      sql`UPDATE work.checklist_steps SET state = 'in_progress', completed_by = NULL, completed_at = NULL, version = version + 1
          WHERE work_package_id = ${wp} AND step_id = '2.3'`.execute(t.db),
    ).rejects.toThrow(/no hold is open/)
  })
})

// --- TSK-0115: checklist steps saved offline ----------------------------------------------------------------------------

describe('[HH-OFF-08][HH-OFF-05][HH-OFF-06][RULE-SAFETY-GATES] checklist steps saved offline, once the Owner turns them on', () => {
  let p: Project
  let jobId: string
  let wp: string
  let visitId: string
  type Synced = { clientId: string; state: string; outcome: string; detail: string | null; ingested: boolean }
  const upload = (who: Person, step: Record<string, unknown>) =>
    staffWrite(who, '/api/v1/staff/field-events', {
      clientId: randomUUID(),
      type: 'checklist_step',
      visitId,
      deviceRecordedAt: new Date().toISOString(),
      step: { workPackageId: wp, ...step },
    })
  const setActions = (who: Person, actions: string[], version: number) =>
    app.inject({
      method: 'PUT',
      url: '/api/v1/staff/settings/offline-actions',
      payload: { actions, reason: 'Synthetic: the offline controls were walked on staging' },
      headers: {
        cookie: cookies[who],
        'x-csrf-token': csrf[who],
        'idempotency-key': key(),
        'if-match': `"${version}"`,
      },
    })
  const stepRow = (stepId: string) =>
    t.db
      .selectFrom('work.checklist_steps')
      .select(['state', 'version', 'note'])
      .where('work_package_id', '=', wp)
      .where('step_id', '=', stepId)
      .executeTakeFirst()

  it('[HH-OFF-08] nothing is on until the Owner turns it on: the view offers none and an upload is refused', async () => {
    p = await project()
    jobId = await approve(p)
    visitId = await fixtureVisit(p, jobId, ['ann'])
    const version = await prepare('ann', visitId, jobId)
    expect((await start('ann', visitId, version)).statusCode).toBe(201)
    const view = (await staffGet('ann', `/api/v1/staff/jobs/${jobId}/checklist`)).json<
      View & { offline: { events: string[]; visitId: string | null } }
    >()
    expect(view.offline).toEqual({ events: [], visitId })
    wp = view.packages[0]?.workPackageId as string
    const setting = await staffGet('owner', '/api/v1/staff/settings/offline-actions')
    expect(setting.statusCode, setting.body).toBe(200)
    expect(setting.json()).toMatchObject({ version: 1, actions: [], available: ['checklist_step'], reason: null })
    for (const who of ['office', 'ann'] as const)
      expect((await staffGet(who, '/api/v1/staff/settings/offline-actions')).statusCode).toBe(403)
    const refused = await upload('ann', { stepId: '1.2', event: 'start', version: 0 })
    expect(refused.statusCode).toBe(409)
    expect(codesOf(refused)).toEqual(['OFFLINE_ACTION_NOT_ENABLED'])
    expect(await stepRow('1.2')).toBeUndefined()
    // The database accepts the switch only from the Owner, naming only the available actions.
    await expect(
      sql`INSERT INTO platform.policy_version (key, version, state, value, source_ids, changed_by, change_reason)
          VALUES ('field.offline_actions', 9, 'configured', '{"actions": ["checklist_step"]}', ARRAY['HH-OFF-08'],
                  ${ids.office}, 'x')`.execute(t.db),
    ).rejects.toThrow(/only the Owner/)
    await expect(
      sql`INSERT INTO platform.policy_version (key, version, state, value, source_ids, changed_by, change_reason)
          VALUES ('field.offline_actions', 9, 'configured', '{"actions": ["start_work"]}', ARRAY['HH-OFF-08'],
                  ${ids.owner}, 'x')`.execute(t.db),
    ).rejects.toThrow(/each available action/)
  })

  it('[HH-OFF-08] the Owner turns checklist steps on with a reason; Office cannot', async () => {
    expect((await setActions('office', ['checklist_step'], 1)).statusCode).toBe(403)
    expect((await setActions('owner', ['checklist_step'], 7)).statusCode).toBe(409)
    const on = await setActions('owner', ['checklist_step'], 1)
    expect(on.statusCode, on.body).toBe(200)
    expect(on.json()).toMatchObject({
      version: 2,
      actions: ['checklist_step'],
      reason: 'Synthetic: the offline controls were walked on staging',
    })
    const view = (await staffGet('ann', `/api/v1/staff/jobs/${jobId}/checklist`)).json<{
      offline: { events: string[] }
    }>()
    expect(view.offline.events).toEqual(['start', 'pause', 'resume', 'complete'])
  })

  it('[HH-OFF-05] a step saved offline is applied once, as the online route applies it', async () => {
    const body = {
      clientId: randomUUID(),
      type: 'checklist_step',
      visitId,
      deviceRecordedAt: new Date().toISOString(),
      step: { workPackageId: wp, stepId: '1.2', event: 'start', version: 0 },
    }
    const first = await staffWrite('ann', '/api/v1/staff/field-events', body)
    expect(first.statusCode, first.body).toBe(200)
    expect(first.json<Synced>()).toMatchObject({ state: 'synchronized', outcome: 'applied', ingested: true })
    const again = await staffWrite('ann', '/api/v1/staff/field-events', { ...body, attempt: 2 })
    expect(again.json<Synced>()).toMatchObject({ state: 'synchronized', outcome: 'applied', ingested: false })
    expect(await stepRow('1.2')).toMatchObject({ state: 'in_progress', version: 1 })
    // The same UUID for another step is the phone's error, never a second event.
    const reused = await staffWrite('ann', '/api/v1/staff/field-events', {
      ...body,
      step: { ...body.step, stepId: '1.3' },
    })
    expect(reused.statusCode).toBe(409)
    expect(codesOf(reused)).toEqual(['CLIENT_ID_REUSED'])
    // A checklist_step event names its step.
    const bare = { clientId: randomUUID(), type: body.type, visitId, deviceRecordedAt: body.deviceRecordedAt }
    expect(codesOf(await staffWrite('ann', '/api/v1/staff/field-events', bare))).toEqual(['STEP_REQUIRED'])
    const done = await upload('ann', { stepId: '1.2', event: 'complete', version: 1, note: 'Synthetic: done offline' })
    expect(done.json<Synced>()).toMatchObject({ state: 'synchronized', outcome: 'applied' })
    expect(await stepRow('1.2')).toMatchObject({ state: 'completed', version: 2, note: 'Synthetic: done offline' })
    const history = await t.db
      .selectFrom('work.checklist_step_events as e')
      .innerJoin('work.checklist_steps as s', 's.id', 'e.step_row_id')
      .select(['e.event', 'e.worker_id'])
      .where('s.work_package_id', '=', wp)
      .where('s.step_id', '=', '1.2')
      .orderBy('e.seq')
      .execute()
    expect(history).toEqual([
      { event: 'start', worker_id: ids.ann },
      { event: 'complete', worker_id: ids.ann },
    ])
  })

  it('[HH-OFF-06][RULE-SAFETY-GATES] what the server refuses now is kept for the Owner’s review, never applied', async () => {
    // The stage order holds offline too.
    const early = await upload('ann', { stepId: '2.1', event: 'start', version: 0 })
    expect(early.json<Synced>()).toMatchObject({
      state: 'needs_review',
      outcome: 'conflict',
      detail: 'EARLIER_STAGE_OPEN',
    })
    expect(await stepRow('2.1')).toBeUndefined()
    // A version moved since the phone saw it (a tap online): never last-write-wins.
    expect((await act('ann', jobId, 'start', { workPackageId: wp, stepId: '1.3', version: 0 })).statusCode).toBe(200)
    const stale = await upload('ann', { stepId: '1.3', event: 'complete', version: 0 })
    expect(stale.json<Synced>()).toMatchObject({ outcome: 'conflict', detail: 'STALE_VERSION' })
    expect(await stepRow('1.3')).toMatchObject({ state: 'in_progress', version: 1 })
    // A worker not assigned to the visit when the phone recorded it.
    const ben = await upload('ben', { stepId: '1.3', event: 'pause', version: 1 })
    expect(ben.json<Synced>()).toMatchObject({ outcome: 'not_assigned', detail: 'NOT_ASSIGNED_THEN' })
    // A hold raised while the phone was offline: the step waits for the hold, whatever the phone saved.
    await criticalHold(p, jobId, 'office')
    const held = await upload('ann', { stepId: '1.3', event: 'complete', version: 1 })
    const out = held.json<Synced>()
    expect(out).toMatchObject({ state: 'needs_review', outcome: 'conflict', detail: 'HOLD_OPEN' })
    expect(await stepRow('1.3')).toMatchObject({ state: 'in_progress', version: 1 })
    // The Owner reads the step the phone saved and records what was done; the step stays as it is.
    const view = await staffGet('owner', `/api/v1/staff/field-events/${out.clientId}`)
    expect(view.statusCode, view.body).toBe(200)
    expect(view.json()).toMatchObject({
      type: 'checklist_step',
      outcome: 'conflict',
      detail: 'HOLD_OPEN',
      step: { workPackageId: wp, stepId: '1.3', event: 'complete', version: 1, note: null, photoIds: [] },
      actions: { review: true },
    })
    const reviewed = await staffWrite('owner', `/api/v1/staff/field-events/${out.clientId}/review`, {
      note: 'Synthetic: the worker records it again once the hold is released',
    })
    expect(reviewed.statusCode, reviewed.body).toBe(200)
    expect(await stepRow('1.3')).toMatchObject({ state: 'in_progress', version: 1 })
  })

  it('[HH-OFF-08] turned off again, the next upload is refused; the database refuses one applied past the server', async () => {
    const off = await setActions('owner', [], 2)
    expect(off.statusCode, off.body).toBe(200)
    expect(off.json()).toMatchObject({ version: 3, actions: [] })
    expect(codesOf(await upload('ann', { stepId: '1.5', event: 'start', version: 0 }))).toEqual([
      'OFFLINE_ACTION_NOT_ENABLED',
    ])
    const row = await t.db
      .selectFrom('work.field_events')
      .selectAll()
      .where('type', '=', 'checklist_step')
      .where('outcome', '=', 'applied')
      .executeTakeFirstOrThrow()
    await expect(
      t.db
        .insertInto('work.field_events')
        .values({
          ...row,
          client_id: randomUUID(),
          payload: JSON.stringify(row.payload),
          attachment_refs: JSON.stringify(row.attachment_refs),
        })
        .execute(),
    ).rejects.toThrow(/not turned on/)
  })
})
