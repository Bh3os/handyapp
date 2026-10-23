// Completion against PostgreSQL 16: the walkthrough and the worker's Finished (TSK-0083; HH-QA-01, HH-QA-03, HH-WORK-12,
// T55, ENT-Walkthrough, FACT-SVC-PHOTO-MINIMUM, OWN-DEC-75, OWN-DEC-109, RULE-SAFETY-GATES, RULE-SERVER-AUTHZ). Staff,
// customers, notes and comments are synthetic (RULE-SYNTHETIC-DATA); the estimate terms version recorded below is a
// fixture of this throwaway database. Each job is prepared and started through the real Start Work gate and its whole
// checklist is worked through the checklist routes (the harness of checklist.test.ts, on PT-01 jobs).
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
  CODE_HASH_KEY: ['synthetic', 'start', 'work', 'code', 'key', 'for', 'tests', 'only', '0083'].join('-'),
})
const pw = ['synthetic', 'start', 'work', 'passphrase', '83'].join(' ')
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
    headers: { 'x-forwarded-for': '198.51.100.183' },
    payload: { email: `${p}-completion@example.test`, password: pw },
  })
  expect(res.statusCode, res.body).toBe(200)
  const cookie = String(res.headers['set-cookie']).split(';')[0] as string
  const session = await app.inject({ method: 'GET', url: '/api/v1/staff/auth/session', headers: { cookie } })
  cookies[p] = cookie
  csrf[p] = session.json<{ csrfToken: string }>().csrfToken
}

let seq = 0
const key = () => `synthetic-completion-${String(++seq).padStart(6, '0')}-${randomUUID()}`
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
  wide = createDb(t.url, { max: 8, applicationName: 'completion-test' })
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
        email: `${p}-completion@example.test`,
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
      'x-forwarded-for': `2001:db8:83:${++ip}::1`,
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
// --- Completion -------------------------------------------------------------------------------------------------------

type ChecklistView = {
  packages: {
    workPackageId: string
    stages: {
      steps: { stepId: string; state: string; version: number; evidence: string[] }[]
    }[]
  }[]
  photos: { id: string; workPackageId: string; phase: string }[]
}
type Completion = {
  jobState: string
  packages: { code: string; checklistComplete: boolean; beforePhotos: number; afterPhotos: number }[]
  problems: { code: string; workPackage?: string }[]
  submission: { walkthrough: { outcome: string; participantName: string | null; caseNumber: number | null } } | null
  actions: { submit: boolean }
}
const completion = async (who: Person, jobId: string) => {
  const res = await staffGet(who, `/api/v1/staff/jobs/${jobId}/completion`)
  expect(res.statusCode, res.body).toBe(200)
  return res.json<Completion>()
}
const submit = (who: Person, jobId: string, body: Record<string, unknown>) =>
  staffWrite(who, `/api/v1/staff/jobs/${jobId}/completion`, body)
const afterPhoto = (who: Person, visitId: string, workPackageId: string) =>
  app.inject({
    method: 'POST',
    url: `/api/v1/staff/visits/${visitId}/field-photos?workPackageId=${workPackageId}&phase=after`,
    payload: png(++variant),
    headers: { cookie: cookies[who], 'x-csrf-token': csrf[who], 'content-type': 'image/png' },
  })

/** A started PT-01 job (Ann alone). */
async function startedJob() {
  const p = await project()
  const jobId = await approve(p)
  const visitId = await fixtureVisit(p, jobId, ['ann'])
  const version = await prepare('ann', visitId, jobId)
  const res = await start('ann', visitId, version)
  expect(res.statusCode, res.body).toBe(201)
  return { p, jobId, visitId }
}

/** Works every step of the checklist in order, with the evidence each asks for; `skip` is skipped with a reason. */
async function workChecklist(jobId: string, skip?: string) {
  for (;;) {
    const v = (await staffGet('ann', `/api/v1/staff/jobs/${jobId}/checklist`)).json<ChecklistView>()
    const pkg = v.packages[0]
    if (!pkg) throw new Error('no work package')
    const next = pkg.stages.flatMap((s) => s.steps).find((s) => s.state === 'not_started' || s.state === 'in_progress')
    if (!next) return
    const photo = v.photos.find((f) => f.workPackageId === pkg.workPackageId)
    const event = next.stepId === skip ? 'skip' : 'complete'
    const res = await staffWrite('ann', `/api/v1/staff/jobs/${jobId}/checklist/steps/${event}`, {
      workPackageId: pkg.workPackageId,
      stepId: next.stepId,
      version: next.version,
      ...(event === 'skip' ? { reason: 'Synthetic: not possible on this wall' } : {}),
      ...(event === 'complete' && next.evidence.includes('note') ? { note: 'Synthetic note' } : {}),
      ...(event === 'complete' && next.evidence.includes('measurement') ? { measurement: '12 ft' } : {}),
      ...(event === 'complete' && next.evidence.includes('photo') && photo ? { photoIds: [photo.id] } : {}),
    })
    expect(res.statusCode, res.body).toBe(200)
  }
}

describe('[HH-WORK-12][HH-QA-01][HH-QA-03][T55] Finished submits the job for the Owner’s quality review', () => {
  it('[HH-QA-01][T55] missing evidence blocks Finished and each problem is named; nothing moves', async () => {
    const { p, jobId, visitId } = await startedJob()
    let c = await completion('ann', jobId)
    expect(c.problems.map((x) => x.code)).toEqual(['CHECKLIST_INCOMPLETE', 'AFTER_PHOTO_MISSING'])
    expect(c.actions.submit).toBe(false)
    const refused = await submit('ann', jobId, { outcome: 'customer_unavailable' })
    expect(refused.statusCode).toBe(409)
    expect(codesOf(refused)).toEqual(['CHECKLIST_INCOMPLETE', 'AFTER_PHOTO_MISSING'])
    // A required step skipped (with its reason) still blocks Finished.
    const pkg = (await staffGet('ann', `/api/v1/staff/jobs/${jobId}/checklist`)).json<ChecklistView>().packages[0]
    const last = pkg?.stages.at(-1)?.steps.at(-1)?.stepId as string
    await workChecklist(jobId, last)
    expect((await afterPhoto('ann', visitId, pkg?.workPackageId as string)).statusCode).toBe(201)
    c = await completion('ann', jobId)
    expect(c.problems.map((x) => x.code)).toEqual(['CHECKLIST_INCOMPLETE'])
    expect(await jobState(jobId)).toBe('in_progress')
    // The database refuses the state without a completion, whatever path writes.
    await expect(
      sql`UPDATE work.jobs SET operational_state = 'ready_for_qa', version = version + 1 WHERE id = ${jobId}`.execute(
        t.db,
      ),
    ).rejects.toThrow(/completion/)
    // RULE-SAFETY-GATES: an open safety hold blocks Finished too.
    await criticalHold(p, jobId, 'ann')
    expect((await completion('ann', jobId)).problems.map((x) => x.code)).toContain('HOLD_OPEN')
  })

  it('[HH-QA-03][OWN-DEC-75] customer unavailable names nobody, is never acceptance; the job awaits the Owner', async () => {
    const { p, jobId, visitId } = await startedJob()
    const wp = (await staffGet('ann', `/api/v1/staff/jobs/${jobId}/checklist`)).json<ChecklistView>().packages[0]
      ?.workPackageId as string
    expect((await afterPhoto('ann', visitId, wp)).statusCode).toBe(201)
    await workChecklist(jobId)
    expect((await completion('ann', jobId)).actions.submit).toBe(true)
    // Office and the Estimator never submit; the walkthrough's own rules are checked first.
    for (const who of ['office', 'estimator'] as const)
      expect((await submit(who, jobId, { outcome: 'customer_unavailable' })).statusCode).toBe(403)
    const named = await submit('ann', jobId, {
      outcome: 'customer_unavailable',
      participantName: 'Synthetic Neighbour',
      participantRole: 'customer',
    })
    expect(named.statusCode).toBe(400)
    expect(codesOf(named)).toEqual(['NO_PARTICIPANT_WHEN_UNAVAILABLE'])
    expect(codesOf(await submit('ann', jobId, { outcome: 'accepted' }))).toEqual([
      'PARTICIPANT_REQUIRED',
      'PARTICIPANT_ROLE_REQUIRED',
    ])
    const res = await submit('ann', jobId, { outcome: 'customer_unavailable' })
    expect(res.statusCode, res.body).toBe(201)
    expect(res.json()).toMatchObject({ jobState: 'ready_for_qa', reviewState: 'pending', caseNumber: null })
    expect(await jobState(jobId)).toBe('ready_for_qa')
    const c = await completion('ann', jobId)
    expect(c.submission?.walkthrough).toMatchObject({ outcome: 'customer_unavailable', participantName: null })
    expect(c.problems.map((x) => x.code)).toContain('ALREADY_SUBMITTED')
    expect((await submit('ann', jobId, { outcome: 'customer_unavailable' })).statusCode).toBe(409)
    // The Owner's review opened with its Owner Decisions item; the work packages are complete.
    const item = await t.db
      .selectFrom('ops.queue_items')
      .select(['reason', 'resolved_at'])
      .where('type', '=', 'quality_review')
      .where('subject_id', '=', jobId)
      .executeTakeFirstOrThrow()
    expect(item).toMatchObject({ reason: 'awaiting_quality_review', resolved_at: null })
    const wps = await t.db.selectFrom('work.work_packages').select('state').where('job_id', '=', jobId).execute()
    expect(wps.map((w) => w.state)).toEqual(['complete'])
    // The customer sees the completion review, never acceptance.
    const overview = await app.inject({
      method: 'GET',
      url: `/api/v1/customer/projects/${p.reference}/overview`,
      headers: { cookie: p.cookie },
    })
    expect(overview.json<{ status: { situation: string } }>().status.situation).toBe('completion_review')
    // The walkthrough is never changed afterwards.
    await expect(
      sql`UPDATE work.walkthroughs SET outcome = 'accepted' WHERE job_id = ${jobId}`.execute(t.db),
    ).rejects.toThrow()
  })

  it('[HH-QA-03] a concern opens a dispute case for the Owner and still goes to the review', async () => {
    const { jobId, visitId } = await startedJob()
    const wp = (await staffGet('ann', `/api/v1/staff/jobs/${jobId}/checklist`)).json<ChecklistView>().packages[0]
      ?.workPackageId as string
    expect((await afterPhoto('ann', visitId, wp)).statusCode).toBe(201)
    await workChecklist(jobId)
    expect(
      codesOf(
        await submit('ann', jobId, {
          outcome: 'disputed',
          participantName: 'Synthetic Customer',
          participantRole: 'customer',
        }),
      ),
    ).toEqual(['COMMENTS_REQUIRED'])
    const res = await submit('ann', jobId, {
      outcome: 'disputed',
      participantName: 'Synthetic Customer',
      participantRole: 'customer',
      comments: 'Synthetic: the customer is unhappy with the colour match',
    })
    expect(res.statusCode, res.body).toBe(201)
    const out = res.json<{ caseNumber: number }>()
    expect(out.caseNumber).toBeGreaterThan(0)
    const k = await t.db
      .selectFrom('quality.cases')
      .select(['kind', 'source', 'job_id'])
      .where('number', '=', out.caseNumber)
      .executeTakeFirstOrThrow()
    expect(k).toEqual({ kind: 'dispute', source: 'walkthrough', job_id: jobId })
    const decision = await t.db
      .selectFrom('ops.queue_items')
      .select('reason')
      .where('type', '=', 'incident_notification')
      .where('resolved_at', 'is', null)
      .execute()
    expect(decision.map((d) => d.reason)).toContain('dispute_reported')
    expect(await jobState(jobId)).toBe('ready_for_qa')
  })
})
