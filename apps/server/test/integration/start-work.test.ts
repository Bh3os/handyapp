// The Start Work gate, hard holds and the three owner-approved exceptions against PostgreSQL 16 (TSK-0073, TSK-0074;
// HH-WORK-01, HH-WORK-02, HH-WORK-03, HH-WORK-04, HH-WORK-12, HH-OFF-04, T40, T45, T46, ENT-StartGateEvaluation,
// ENT-GateException, ENT-Hold, OWN-DEC-38, OWN-DEC-68, OWN-DEC-79, OWN-DEC-82, OWN-DEC-137, OWN-DEC-195, OWN-DEC-196,
// RULE-SAFETY-GATES, RULE-SERVER-AUTHZ). Staff, customers, addresses, notes, evidence and payment references are
// synthetic (RULE-SYNTHETIC-DATA); the estimate terms version recorded below is a fixture of this throwaway database.
// - Visits are fixtures in the first hours of today's local date (as in my-day.test.ts), so On my way is open at any
//   hour the suite runs; dates come from localDateOf(now, America/Kentucky/Louisville), never a weekday.
// - The critical safety hold of a later hazard report (TSK-0077) and a later change order's scope (TSK-0082) are
//   written here as fixtures straight to their tables, as those tasks will write them.
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
  GATE_EXCEPTION_KINDS,
  localClockOf,
  localDateOf,
  offsetMinutesAt,
  resolveLocalTime,
  resolveWindow,
} from '@handyhub/domain'
import { ESTIMATE_TERMS } from '@handyhub/domain/legal'
import { decide, type StaffActor } from '@handyhub/policy'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { startCustomerSession } from '../../src/modules/identity/customer-sessions.js'
import { readCodeKey, type CodeKeySettings } from '../../src/modules/identity/index.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import { cancellationFacts, workMarkers } from '../../src/modules/visits/changes.js'
import { recordPolicyVersion } from '../../src/platform/config/index.js'
import { FakeObjectStorage } from '../../src/providers/r2/index.js'
import { verifyCountyOf } from '../fixtures/county.js'
import { testConfig } from '../fixtures/env.js'
import { jpeg, png } from '../fixtures/images.js'
import { signInWithMfa } from '../fixtures/staff-mfa.js'
import { verifyPropertyZone } from '../fixtures/zones.js'

const ZONE = 'America/Kentucky/Louisville'
const KEY: CodeKeySettings = readCodeKey({
  HANDYHUB_ENV: 'ci',
  CODE_HASH_KEY: ['synthetic', 'start', 'work', 'code', 'key', 'for', 'tests', 'only', '0073'].join('-'),
})
const pw = ['synthetic', 'start', 'work', 'passphrase', '73'].join(' ')
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
    headers: { 'x-forwarded-for': '198.51.100.173' },
    payload: { email: `${p}-start@example.test`, password: pw },
  })
  expect(res.statusCode, res.body).toBe(200)
  const cookie = String(res.headers['set-cookie']).split(';')[0] as string
  const session = await app.inject({ method: 'GET', url: '/api/v1/staff/auth/session', headers: { cookie } })
  cookies[p] = cookie
  csrf[p] = session.json<{ csrfToken: string }>().csrfToken
}

let seq = 0
const key = () => `synthetic-start-${String(++seq).padStart(6, '0')}-${randomUUID()}`
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
  wide = createDb(t.url, { max: 8, applicationName: 'start-work-test' })
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
        email: `${p}-start@example.test`,
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
      'x-forwarded-for': `2001:db8:73:${++ip}::1`,
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

const SLOT_MINUTES = 10
const taken = new Map<string, Set<number>>()
/**
 * The first free 10-minute slot after local midnight of `date` for the team (see my-day.test.ts). One worker has up
 * to eight visits here; at 10 minutes a slot even the twelfth starts within two hours of midnight, so On my way
 * (three hours before the window, OWN-DEC-107) is open whenever the suite runs on that local day, at any hour.
 */
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
const evaluations = (visitId: string) =>
  t.db
    .selectFrom('work.start_gate_evaluations')
    .selectAll()
    .where('visit_id', '=', visitId)
    .orderBy('evaluated_at')
    .execute()

// --- The gate ---------------------------------------------------------------------------------------------------------

describe('[HH-WORK-01][HH-WORK-04][T46] the gate names every missing item; Start rechecks and records everything', () => {
  let p: Project
  let jobId: string
  let visitId: string

  it('[HH-WORK-01] before arrival every prerequisite is listed and each missing item names its resolution owner', async () => {
    p = await project()
    jobId = await approve(p)
    visitId = await fixtureVisit(p, jobId, ['ann'])
    const g = await gate('ann', visitId)
    expect(g.items.map((i) => i.item)).toEqual([
      'assignment',
      'site_identity',
      'scope_acknowledged',
      'sop_language',
      'job_holds',
      'safety_holds',
      'critical_resources',
      'site_condition',
      'before_photos',
      'deposit',
    ])
    expect(g.outcome).toBe('needs_attention')
    expect(g.actions.start).toBe(false)
    expect(g.emergency).toEqual({ call911: 'tel:911' })
    const byCode = Object.fromEntries(g.items.flatMap((i) => i.missing).map((m) => [m.code, m]))
    expect(Object.keys(byCode).sort()).toEqual(
      [
        'ARRIVED_FIRST',
        'SITE_CHECK_MISSING',
        'PACKET_NOT_VIEWED',
        'PACKET_NOT_ACKNOWLEDGED',
        'HAZARDS_NOT_REVIEWED',
        'LOADOUT_NOT_CONFIRMED',
        'SITE_CONDITION_NOT_REVIEWED',
        'BEFORE_PHOTOS_MISSING',
      ].sort(),
    )
    expect(byCode['BEFORE_PHOTOS_MISSING']).toMatchObject({ resolutionOwner: 'worker', severity: 'attention' })
    expect(byCode['BEFORE_PHOTOS_MISSING']?.ref).toBe(g.workPackages[0]?.workPackageId)
    // Pressing Start now is refused with every missing item, and the attempt is recorded.
    const res = await start('ann', visitId, g.packet?.version ?? 1)
    expect(res.statusCode, res.body).toBe(409)
    expect(codesOf(res).sort()).toEqual(Object.keys(byCode).sort())
    const evals = await evaluations(visitId)
    expect(evals).toHaveLength(1)
    expect(evals[0]).toMatchObject({ outcome: 'needs_attention', staff_user_id: ids.ann })
    expect(await jobState(jobId)).toBe('pending_preparation')
  })

  it('[HH-WORK-01] each item clears only through its own record; the gate is then ready', async () => {
    const version = await prepare('ann', visitId, jobId)
    const g = await gate('ann', visitId)
    expect(missingOf(g)).toEqual([])
    expect(g).toMatchObject({ outcome: 'ready', actions: { start: true } })
    expect(g.packet?.version).toBe(version)
  })

  it('[HH-WORK-04][T46] a green preflight never authorizes a later start: a hold raised after it is caught', async () => {
    const g = await gate('ann', visitId)
    expect(g.outcome).toBe('ready')
    const hold = await criticalHold(p, jobId, 'cara')
    const res = await start('ann', visitId, g.packet?.version as number)
    expect(res.statusCode, res.body).toBe(409)
    expect(codesOf(res)).toEqual(
      expect.arrayContaining(['CRITICAL_HOLD_OPEN', 'PACKET_CHANGED_SINCE_VIEWED', 'PACKET_ACKNOWLEDGMENT_ENDED']),
    )
    expect(await jobState(jobId)).toBe('pending_preparation')
    const evals = await evaluations(visitId)
    expect(evals[evals.length - 1]).toMatchObject({ outcome: 'blocked' })
    expect(JSON.stringify(evals[evals.length - 1]?.items)).toContain(hold.id)
    // The Owner releases it with evidence (a hold cara raised), and the worker reviews the packet again.
    const reviewStart = await staffWrite('owner', `/api/v1/staff/critical-holds/${hold.id}/actions/start-review`, {}, 1)
    expect(reviewStart.statusCode, reviewStart.body).toBe(200)
    const released = await staffWrite(
      'owner',
      `/api/v1/staff/critical-holds/${hold.id}/actions/resolve`,
      {
        resolutionNote: 'Synthetic: the electrician made the wiring safe.',
        evidence: 'Synthetic: the service ticket',
        reviewer: 'Synthetic Electrician',
        reviewerQualification: 'Synthetic: licensed electrician',
      },
      2,
    )
    expect(released.statusCode, released.body).toBe(200)
    expect(released.json()).toMatchObject({ state: 'resolved', version: 3 })
    expect(missingOf(await gate('ann', visitId)).sort()).toEqual(
      ['PACKET_ACKNOWLEDGMENT_ENDED', 'PACKET_CHANGED_SINCE_VIEWED'].sort(),
    )
  })

  it('[HH-WORK-04] a packet version newer than the one the briefing showed refuses the start', async () => {
    const version = await review('ann', jobId)
    const res = await start('ann', visitId, version - 1)
    expect(res.statusCode).toBe(409)
    expect(codesOf(res)).toEqual(['PACKET_CHANGED_SINCE_VIEWED'])
  })

  it('[T46][OWN-DEC-195] a passing start records versions, actor, acknowledgment and server time; the job is in progress', async () => {
    // TSK-0140 (OWN-DEC-195 C4, HH-STATE-02): arrived and prepared (site check, before photos), not started: a
    // cancellation now would not be "after work started".
    const prepared = await cancellationFacts(t.db, { id: visitId, purpose: 'service', job_id: jobId })
    expect(prepared.markers.arrived).not.toBeNull()
    expect(prepared.markers.preparation_started).not.toBeNull()
    expect(prepared.markers.contracted_work_started).toBeNull()
    expect(prepared.workStarted).toBe(false)
    const g = await gate('ann', visitId)
    const before = Date.now()
    const res = await start('ann', visitId, g.packet?.version as number)
    expect(res.statusCode, res.body).toBe(201)
    const body = res.json<{
      startId: string
      evaluationId: string
      packetVersion: number
      scopeVersion: number
      sopVersionIds: string[]
      acknowledgmentId: string
      exceptionIds: string[]
      jobStateBefore: string
      jobState: string
      workPackagesStarted: string[]
    }>()
    expect(body).toMatchObject({
      packetVersion: g.packet?.version,
      scopeVersion: 1,
      exceptionIds: [],
      jobStateBefore: 'pending_preparation',
      jobState: 'in_progress',
      workPackagesStarted: g.workPackages.map((w) => w.workPackageId),
    })
    expect(body.sopVersionIds).toHaveLength(1)
    const row = await t.db
      .selectFrom('work.work_starts')
      .selectAll()
      .where('id', '=', body.startId)
      .executeTakeFirstOrThrow()
    expect(row).toMatchObject({ staff_user_id: ids.ann, visit_id: visitId, acknowledgment_id: body.acknowledgmentId })
    expect(row.started_at.getTime()).toBeGreaterThanOrEqual(before - 1000)
    const ack = await t.db
      .selectFrom('work.job_packet_acknowledgments')
      .select(['staff_user_id', 'version'])
      .where('id', '=', body.acknowledgmentId)
      .executeTakeFirstOrThrow()
    expect(ack).toEqual({ staff_user_id: ids.ann, version: g.packet?.version })
    expect(await jobState(jobId)).toBe('in_progress')
    // TSK-0140 (OWN-DEC-195 C4): Start Work is "contracted work started", the only marker that is the start of work.
    const started = await workMarkers(t.db, { id: visitId, job_id: jobId })
    expect(started.contracted_work_started?.getTime()).toBe(row.started_at.getTime())
    expect(started.completed).toBeNull()
    expect((await cancellationFacts(t.db, { id: visitId, purpose: 'service', job_id: jobId })).workStarted).toBe(true)
    const pkgs = await t.db.selectFrom('work.work_packages').select('state').where('job_id', '=', jobId).execute()
    expect(pkgs.map((x) => x.state)).toEqual(['in_progress'])
    const audit = await t.db
      .selectFrom('platform.audit_events')
      .select(['action', 'result'])
      .where('action', '=', 'work.start')
      .where('target_id', 'in', [body.startId, visitId])
      .execute()
    expect(audit.map((a) => a.result).sort()).toEqual(['denied', 'denied', 'denied', 'succeeded'])
    // Started once: a second press names ALREADY_STARTED and changes nothing.
    const again = await start('ann', visitId, g.packet?.version as number)
    expect(again.statusCode).toBe(409)
    expect(codesOf(again)).toContain('ALREADY_STARTED')
  })
})

// --- No role, flag or request shape --------------------------------------------------------------------------------

describe('[RULE-SAFETY-GATES][HH-WORK-02] no role, flag or request shape starts work past a failing gate or a critical hold', () => {
  let p: Project
  let jobId: string
  let visitId: string
  let holdId: string

  it('the Owner, assigned and fully prepared, is refused while a critical hold stands', async () => {
    p = await project()
    jobId = await approve(p)
    visitId = await fixtureVisit(p, jobId, ['owner', 'ann'])
    const hold = await criticalHold(p, jobId, 'owner')
    holdId = hold.id
    const version = await prepare('owner', visitId, jobId)
    const g = await gate('owner', visitId)
    expect(g.outcome).toBe('blocked')
    expect(missingOf(g)).toEqual(['CRITICAL_HOLD_OPEN'])
    const res = await start('owner', visitId, version)
    expect(res.statusCode).toBe(409)
    expect(codesOf(res)).toEqual(['CRITICAL_HOLD_OPEN'])
  })

  it('no override, force or skip field, query flag or fourth exception kind exists', async () => {
    const version = (await gate('owner', visitId)).packet?.version as number
    for (const extra of [{ override: true }, { force: true }, { skipGate: true }, { exceptionIds: [randomUUID()] }]) {
      const res = await start('owner', visitId, version, extra)
      expect(res.statusCode, JSON.stringify(extra)).toBe(400)
    }
    for (const q of ['?override=true', '?force=1', '?offline=1']) {
      const res = await start('owner', visitId, version, {}, q)
      expect(res.statusCode, q).toBe(400)
    }
    const read = await staffGet('owner', `/api/v1/staff/visits/${visitId}/start-gate?override=true`)
    expect(read.statusCode).toBe(400)
    for (const kind of ['safety_override', 'critical_hold', 'owner_override']) {
      const res = await staffWrite('ann', `/api/v1/staff/visits/${visitId}/start-exceptions`, {
        kind,
        reason: 'Synthetic',
        evidence: {},
      })
      expect(res.statusCode, kind).toBe(400)
    }
    // The database refuses a fourth kind too.
    await expect(
      sql`INSERT INTO work.gate_exceptions (job_id, project_id, visit_id, kind, requirement, reason, evidence,
            requested_by, packet_version, expires_at)
          VALUES (${jobId}, ${p.projectId}, ${visitId}, 'safety_hold', 'safety_holds', 'Synthetic', '{}',
            ${ids.ann}, 1, now() + interval '1 hour')`.execute(t.db),
    ).rejects.toThrow(/check/)
  })

  it('every role is refused: Office and an unassigned worker cannot start; the policy never allows an override', async () => {
    const version = (await gate('owner', visitId)).packet?.version as number
    expect((await start('office', visitId, version)).statusCode).toBe(403)
    expect((await start('cara', visitId, version)).statusCode).toBe(403)
    expect((await staffGet('cara', `/api/v1/staff/visits/${visitId}/start-gate`)).statusCode).toBe(403)
    const actor = (roles: StaffActor['roles']): StaffActor => ({
      kind: 'staff',
      userId: ids.owner,
      roles,
      capabilities: ['collect'],
      status: 'active',
      freshAuth: true,
    })
    for (const roles of [
      ['owner'],
      ['office'],
      ['estimator'],
      ['worker'],
      ['owner', 'office', 'estimator', 'worker'],
    ] as const)
      for (const action of ['work.override_gate', 'hold.override_critical'] as const)
        expect(
          decide(actor([...roles]), action, { projectId: p.projectId }, { now: new Date(), online: true }),
        ).toMatchObject({
          effect: 'deny',
          reason: 'SAFETY_GATE_NOT_OVERRIDABLE',
        })
    // The AI module holds no permission.
    expect(decide({ kind: 'ai' } as never, 'work.start', {}, { now: new Date(), online: true }).effect).toBe('deny')
  })

  it('[T54][OWN-DEC-38] nobody releases a critical hold they raised; no checkbox, acknowledgment or other hold route clears it', async () => {
    for (const action of ['start-review', 'cancel'])
      expect(
        (
          await staffWrite(
            'owner',
            `/api/v1/staff/critical-holds/${holdId}/actions/${action}`,
            action === 'cancel' ? { reason: 'Synthetic' } : {},
            1,
          )
        ).statusCode,
      ).toBe(403)
    // A worker, Office and the Estimator hold no release permission.
    for (const who of ['ann', 'office', 'estimator'] as const)
      expect(
        (await staffWrite(who, `/api/v1/staff/critical-holds/${holdId}/actions/start-review`, {}, 1)).statusCode,
      ).toBe(403)
    // The intake review-hold routes, the loadout-block routes and the job-level Ready never reach a critical hold.
    expect((await staffWrite('owner', `/api/v1/staff/holds/${holdId}/actions/start-review`, {}, 1)).statusCode).toBe(
      404,
    )
    expect(
      (await staffWrite('owner', `/api/v1/staff/loadout-blocks/${holdId}/actions/start-review`, {}, 1)).statusCode,
    ).toBe(404)
    expect(
      (await staffWrite('owner', `/api/v1/staff/job-holds/${holdId}/actions/set-ready`, { resolutionNote: 'x' }, 1))
        .statusCode,
    ).toBe(404)
    // Acknowledging the packet, a site check and an exception request change nothing about it.
    await review('owner', jobId)
    expect((await siteCheck('owner', visitId)).statusCode).toBe(201)
    const req = await staffWrite('ann', `/api/v1/staff/visits/${visitId}/start-exceptions`, {
      kind: 'customer_not_present',
      reason: 'Synthetic',
      evidence: { authorization: 'Synthetic', contact: 'Synthetic' },
    })
    expect(req.statusCode).toBe(409)
    const hold = await t.db.selectFrom('work.holds').select('state').where('id', '=', holdId).executeTakeFirstOrThrow()
    expect(hold.state).toBe('open')
    // The database: never resolved or cancelled by its raiser, never resolved without evidence.
    await expect(
      sql`UPDATE work.holds SET state = 'canceled_as_error', version = version + 1, cancel_reason = 'x',
            canceled_by = raised_by, canceled_at = now() WHERE id = ${holdId}`.execute(t.db),
    ).rejects.toThrow(/holds_critical_not_self/)
    await expect(
      sql`UPDATE work.holds SET state = 'under_review', version = version + 1, review_started_by = ${ids.office},
            review_started_at = now() WHERE id = ${holdId}`.execute(t.db),
    ).resolves.toBeDefined()
    await expect(
      sql`UPDATE work.holds SET state = 'resolved', version = version + 1, resolution_note = 'x', reviewer = 'x',
            resolved_by = ${ids.office}, resolved_at = now() WHERE id = ${holdId}`.execute(t.db),
    ).rejects.toThrow(/holds_critical_resolution/)
  })

  it('the database refuses a start without its passing evaluation, and any start while a hard hold blocks', async () => {
    await expect(
      sql`UPDATE work.jobs SET operational_state = 'in_progress', version = version + 1 WHERE id = ${jobId}`.execute(
        t.db,
      ),
    ).rejects.toThrow(/only through the Start Work gate/)
    await expect(
      sql`UPDATE work.work_packages SET state = 'in_progress', version = version + 1 WHERE job_id = ${jobId}`.execute(
        t.db,
      ),
    ).rejects.toThrow(/only through the Start Work gate/)
    // A forged "ready" evaluation in the same transaction still meets the hold backstop.
    const ack = await t.db
      .selectFrom('work.job_packet_acknowledgments')
      .select(['id', 'version'])
      .where('job_id', '=', jobId)
      .where('staff_user_id', '=', ids.owner)
      .orderBy('acknowledged_at', 'desc')
      .executeTakeFirstOrThrow()
    await expect(
      t.db.transaction().execute(async (tx) => {
        const e = await tx
          .insertInto('work.start_gate_evaluations')
          .values({
            job_id: jobId,
            project_id: p.projectId,
            visit_id: visitId,
            staff_user_id: ids.owner,
            outcome: 'ready',
            items: JSON.stringify(Array.from({ length: 10 }, () => ({}))),
            packet_version: ack.version,
            acknowledgment_id: ack.id,
          })
          .returning('id')
          .executeTakeFirstOrThrow()
        await tx
          .insertInto('work.work_starts')
          .values({
            job_id: jobId,
            project_id: p.projectId,
            visit_id: visitId,
            staff_user_id: ids.owner,
            evaluation_id: e.id,
            packet_version: ack.version,
            sop_version_ids: '[]',
            acknowledgment_id: ack.id,
            job_state_before: 'pending_preparation',
          })
          .execute()
      }),
    ).rejects.toThrow(/hold is open on its project/)
    // An evaluation of another transaction never starts work either.
    expect(await jobState(jobId)).toBe('pending_preparation')
  })
})

// --- Locks ----------------------------------------------------------------------------------------------------------

describe('[HH-WORK-04][RULE-SAFETY-GATES] a hazard hold and a start commit strictly one after the other', () => {
  it('a start that waits for a hold being written under the job lock sees it and is refused', async () => {
    const p = await project()
    const jobId = await approve(p)
    const visitId = await fixtureVisit(p, jobId, ['cara'])
    const version = await prepare('cara', visitId, jobId)
    expect((await gate('cara', visitId)).outcome).toBe('ready')
    let release!: () => void
    const held = new Promise<void>((r) => (release = r))
    let inserted!: () => void
    const insertDone = new Promise<void>((r) => (inserted = r))
    const writer = wide.transaction().execute(async (tx) => {
      await criticalHold(p, jobId, 'ann', tx as unknown as Db)
      inserted()
      await held
    })
    await insertDone
    const pending = start('cara', visitId, version)
    // The start waits on the job lock the hold's insert holds; nothing is committed meanwhile.
    await new Promise((r) => setTimeout(r, 300))
    expect(await jobState(jobId)).toBe('pending_preparation')
    release()
    await writer
    const res = await pending
    expect(res.statusCode, res.body).toBe(409)
    expect(codesOf(res)).toContain('CRITICAL_HOLD_OPEN')
    expect(await jobState(jobId)).toBe('pending_preparation')
  })
})

// --- Job-level Hold / Ready ------------------------------------------------------------------------------------------

describe('[HH-WORK-02][T40][OWN-DEC-82][OWN-DEC-137] the job-level Hold blocks confirmation and start until the Owner sets Ready', () => {
  it('Office sets a Hold with a note; nobody starts or confirms; the Owner sets Ready on one the Owner set too', async () => {
    const p = await project()
    const jobId = await approve(p)
    const visitId = await fixtureVisit(p, jobId, ['ann'])
    const set = await staffWrite('office', `/api/v1/staff/jobs/${jobId}/job-holds`, {
      category: 'permit_licensing',
      note: 'Synthetic: the owner checks whether a permit is needed.',
    })
    expect(set.statusCode, set.body).toBe(201)
    const hold = set.json<{ holdId: string; version: number }>()
    const own = await staffWrite('owner', `/api/v1/staff/jobs/${jobId}/job-holds`, {
      category: 'other',
      note: 'Synthetic: the owner confirms the customer-supplied paint.',
    })
    expect(own.statusCode).toBe(201)
    // A worker cannot set a Hold, and only the Owner sets Ready.
    expect(
      (await staffWrite('ann', `/api/v1/staff/jobs/${jobId}/job-holds`, { category: 'other', note: 'x' })).statusCode,
    ).toBe(403)
    expect(
      (
        await staffWrite(
          'office',
          `/api/v1/staff/job-holds/${hold.holdId}/actions/set-ready`,
          { resolutionNote: 'x' },
          1,
        )
      ).statusCode,
    ).toBe(403)
    const version = await prepare('ann', visitId, jobId)
    const g = await gate('ann', visitId)
    expect(g.outcome).toBe('blocked')
    expect(missingOf(g)).toEqual(['JOB_ON_HOLD', 'JOB_ON_HOLD'])
    expect((await start('ann', visitId, version)).statusCode).toBe(409)
    // Another visit of the job cannot be confirmed either (migration 0057 counts job-level holds).
    await expect(fixtureVisit(p, jobId, ['cara'])).rejects.toThrow(/blocking hold/)
    const queue = await t.db
      .selectFrom('ops.queue_items')
      .select(['reason', 'resolved_at'])
      .where('type', '=', 'job_hold')
      .where('subject_id', '=', jobId)
      .execute()
    expect(queue).toEqual([{ reason: 'job_on_hold', resolved_at: null }])
    // The review screen lists both with the Owner's Ready action; Office sees them without it.
    const screen = (await staffGet('owner', `/api/v1/staff/jobs/${jobId}/start-review`)).json<{
      holds: { holdId: string; actions: { setReady: boolean } }[]
    }>()
    expect(screen.holds.map((h) => h.actions.setReady)).toEqual([true, true])
    const officeView = (await staffGet('office', `/api/v1/staff/jobs/${jobId}/start-review`)).json<{
      holds: { actions: { setReady: boolean } }[]
      exceptions: unknown[]
    }>()
    expect(officeView.holds.map((h) => h.actions.setReady)).toEqual([false, false])
    expect(officeView.exceptions).toEqual([])
    // Ready needs a note; the Owner sets Ready on both, including the one the Owner set (OWN-DEC-137).
    expect(
      (await staffWrite('owner', `/api/v1/staff/job-holds/${hold.holdId}/actions/set-ready`, {}, 1)).statusCode,
    ).toBe(400)
    for (const h of [hold, own.json<{ holdId: string; version: number }>()]) {
      const ready = await staffWrite(
        'owner',
        `/api/v1/staff/job-holds/${h.holdId}/actions/set-ready`,
        { resolutionNote: 'Synthetic: resolved by phone with the customer.' },
        1,
      )
      expect(ready.statusCode, ready.body).toBe(200)
      expect(ready.json()).toMatchObject({ state: 'resolved', version: 3 })
    }
    const after = await t.db
      .selectFrom('ops.queue_items')
      .select('resolution')
      .where('type', '=', 'job_hold')
      .where('subject_id', '=', jobId)
      .executeTakeFirstOrThrow()
    expect(after.resolution).toBe('set_ready')
    const v2 = await review('ann', jobId)
    const res = await start('ann', visitId, v2)
    expect(res.statusCode, res.body).toBe(201)
  })

  it('[HH-WORK-12] a site that differs from the packet raises a job-level Hold; Start waits for the Owner', async () => {
    const p = await project()
    const jobId = await approve(p)
    const visitId = await fixtureVisit(p, jobId, ['ann'])
    await tap('ann', visitId, 'on-my-way')
    await tap('ann', visitId, 'arrived')
    expect((await siteCheck('ann', visitId, { siteCondition: 'differs' })).statusCode).toBe(409)
    const diff = await siteCheck('ann', visitId, {
      siteCondition: 'differs',
      note: 'Synthetic: the damaged area is twice the size in the photos.',
    })
    expect(diff.statusCode, diff.body).toBe(201)
    const holdId = diff.json<{ holdId: string }>().holdId
    await loadAll('ann', jobId)
    for (const wp of (await gate('ann', visitId)).workPackages) await photo('ann', visitId, wp.workPackageId)
    await review('ann', jobId)
    const g = await gate('ann', visitId)
    expect(missingOf(g).sort()).toEqual(['JOB_ON_HOLD', 'SITE_CONDITION_DIFFERS'])
    expect(g.outcome).toBe('blocked')
    const ready = await staffWrite(
      'owner',
      `/api/v1/staff/job-holds/${holdId}/actions/set-ready`,
      { resolutionNote: 'Synthetic: the owner assessed it; the approved scope still covers it.' },
      1,
    )
    expect(ready.statusCode, ready.body).toBe(200)
    const version = await review('ann', jobId)
    expect(missingOf(await gate('ann', visitId))).toEqual([])
    expect((await start('ann', visitId, version)).statusCode).toBe(201)
  })
})

// --- Resources and language -----------------------------------------------------------------------------------------

describe('[T45][HH-PKT-04][HH-PKT-06] a critical shortage or an unreleased Spanish safety text blocks start; nothing clears it', () => {
  it('the Spanish-reading worker sees "Spanish safety review pending"; the English-reading teammate is unaffected', async () => {
    const p = await project()
    const jobId = await approve(p)
    const visitId = await fixtureVisit(p, jobId, ['ann', 'ben'])
    await prepare('ann', visitId, jobId)
    await prepare('ben', visitId, jobId)
    await review('ann', jobId)
    const ben = await gate('ben', visitId)
    expect(ben.outcome).toBe('requires_review')
    expect(missingOf(ben)).toEqual(['SPANISH_SAFETY_REVIEW_PENDING'])
    expect(ben.items.find((i) => i.item === 'sop_language')?.missing[0]).toMatchObject({
      resolutionOwner: 'owner',
      exceptable: null,
    })
    const v = (await gate('ann', visitId)).packet?.version as number
    expect((await start('ben', visitId, v)).statusCode).toBe(409)
    // No exception covers it: none is offered, and every kind is refused for it.
    expect(ben.actions.requestException).toEqual([])
    for (const kind of GATE_EXCEPTION_KINDS) {
      const evidence =
        kind === 'customer_not_present'
          ? { authorization: 'Synthetic', contact: 'Synthetic' }
          : kind === 'before_photo_upload_failed'
            ? { workPackageIds: [ben.workPackages[0]?.workPackageId], photosOnDevice: 2, failure: 'Synthetic' }
            : { provider: 'square', transactionReference: 'SYN-T45', amountCents: 100 }
      const res = await staffWrite('ben', `/api/v1/staff/visits/${visitId}/start-exceptions`, {
        kind,
        reason: 'Synthetic',
        evidence,
      })
      expect(res.statusCode, kind).toBe(409)
    }
    expect((await gate('ann', visitId)).outcome).toBe('ready')
    expect((await start('ann', visitId, v)).statusCode).toBe(201)
  })

  it('[HH-LANG-04][T70] once the Spanish text is released as AI-reviewed, the Spanish-reading worker reviews the updated packet and starts', async () => {
    const p = await project()
    const jobId = await approve(p)
    const visitId = await fixtureVisit(p, jobId, ['ben'])
    await prepare('ben', visitId, jobId)
    expect(missingOf(await gate('ben', visitId))).toEqual(['SPANISH_SAFETY_REVIEW_PENDING'])
    // The comparison of the pinned English version passes (synthetic Spanish lines: the English structure).
    const wp = await t.db
      .selectFrom('work.work_packages as w')
      .innerJoin('catalog.sop_versions as v', 'v.id', 'w.sop_version_id')
      .select(['v.id', 'v.sop_id', 'v.content', 'v.content_sha256'])
      .where('w.job_id', '=', jobId)
      .executeTakeFirstOrThrow()
    const pass = { warnings: 'pass', ppe: 'pass', prohibited_actions: 'pass', measurements_units: 'pass' }
    const results = { ...pass, step_order: 'pass', stop_work: 'pass' }
    const content = wp.content as { stages: unknown[]; stopWork: unknown[] }
    await t.db
      .insertInto('catalog.sop_spanish_versions')
      .values({
        sop_version_id: wp.id,
        sop_id: wp.sop_id,
        english_content_sha256: wp.content_sha256,
        title: 'SOP sintético',
        content: JSON.stringify({ stages: content.stages, stopWork: content.stopWork }),
        content_sha256: 'e'.repeat(64),
        translation_sha256: 'f'.repeat(64),
        comparison_tool: 'compare-safety-es@1',
        checked_on: '2026-10-23',
        results: JSON.stringify(results),
        release_status: 'ai_reviewed',
      })
      .execute()
    // The packet now says the Spanish text is released: it changed, so the worker reviews it again before starting.
    const before = await gate('ben', visitId)
    expect(missingOf(before)).not.toContain('SPANISH_SAFETY_REVIEW_PENDING')
    expect(missingOf(before).some((c) => c.startsWith('PACKET_'))).toBe(true)
    const v = await review('ben', jobId)
    expect((await gate('ben', visitId)).outcome).toBe('ready')
    expect((await start('ben', visitId, v)).statusCode).toBe(201)
  })

  it('a critical loadout shortage blocks start for every role until the Owner resolves it', async () => {
    const p = await project()
    const jobId = await approve(p)
    const visitId = await fixtureVisit(p, jobId, ['cara'])
    const version = await prepare('cara', visitId, jobId)
    const lo = (await staffGet('cara', `/api/v1/staff/jobs/${jobId}/loadout`)).json<{
      packages: { workPackageId: string; groups: { items: { key: string }[] }[] }[]
    }>()
    const pkg = lo.packages[0] as (typeof lo.packages)[number]
    const item = pkg.groups.flatMap((g) => g.items)[0]?.key as string
    const missing = await staffWrite('cara', `/api/v1/staff/jobs/${jobId}/loadout/checks`, {
      workPackageId: pkg.workPackageId,
      items: [{ key: item, status: 'missing', note: 'Synthetic: left at the shop' }],
    })
    expect(missing.statusCode).toBe(201)
    const g = await gate('cara', visitId)
    expect(missingOf(g)).toEqual(expect.arrayContaining(['LOADOUT_BLOCKED']))
    expect(g.outcome).toBe('blocked')
    expect((await start('cara', visitId, version)).statusCode).toBe(409)
  })
})

// --- The three exceptions -------------------------------------------------------------------------------------------

describe('[HH-WORK-03][OWN-DEC-68] the three exceptions: requested by the worker, approved by the Owner, one visit only', () => {
  it('customer not present: the site check still comes first; only the Owner approves, with a fresh sign-in', async () => {
    const p = await project()
    const jobId = await approve(p)
    const visitId = await fixtureVisit(p, jobId, ['ann'])
    await tap('ann', visitId, 'on-my-way')
    await tap('ann', visitId, 'arrived')
    const ask = () =>
      staffWrite('ann', `/api/v1/staff/visits/${visitId}/start-exceptions`, {
        kind: 'customer_not_present',
        reason: 'Synthetic: the customer is at work.',
        evidence: {
          authorization: 'Synthetic: the customer wrote that we may let ourselves in.',
          contact: 'Synthetic: the customer by phone',
        },
      })
    let res = await ask()
    expect(res.statusCode).toBe(409)
    expect(codesOf(res).sort()).toEqual(['ACCESS_INSTRUCTIONS_MISSING', 'SITE_CHECK_FIRST'])
    await t.db
      .insertInto('crm.property_details')
      .values({
        property_id: p.propertyId,
        detail: 'access_notes',
        value: 'Synthetic: the side gate',
        source: 'office_record',
        confirmed_at: new Date(),
        confirmed_by: ids.office,
      })
      .execute()
    expect((await siteCheck('ann', visitId, { customerPresent: false })).statusCode).toBe(201)
    await loadAll('ann', jobId)
    for (const wp of (await gate('ann', visitId)).workPackages) await photo('ann', visitId, wp.workPackageId)
    const version = await review('ann', jobId)
    const g = await gate('ann', visitId)
    expect(missingOf(g)).toEqual(['CUSTOMER_NOT_PRESENT'])
    expect(g.actions.requestException).toEqual(['customer_not_present'])
    // The Owner never requests one (the matrix: an assigned worker only).
    expect(
      (
        await staffWrite('owner', `/api/v1/staff/visits/${visitId}/start-exceptions`, {
          kind: 'customer_not_present',
          reason: 'Synthetic',
          evidence: { authorization: 'Synthetic', contact: 'Synthetic' },
        })
      ).statusCode,
    ).toBe(403)
    res = await ask()
    expect(res.statusCode, res.body).toBe(201)
    const exc = res.json<{ exceptionId: string; version: number }>()
    expect((await ask()).statusCode).toBe(409)
    const item = await t.db
      .selectFrom('ops.queue_items')
      .select(['reason', 'resolved_at'])
      .where('type', '=', 'start_work_exception')
      .where('subject_id', '=', jobId)
      .executeTakeFirstOrThrow()
    expect(item).toEqual({ reason: 'start_work_exception_requested', resolved_at: null })
    // A requested exception covers nothing.
    expect((await start('ann', visitId, version)).statusCode).toBe(409)
    // Only the Owner decides: a worker and Office are refused; the follow-up owner and deadline are required.
    const approveBody = { followUpOwnerId: ids.owner, followUpDue: today() }
    for (const who of ['ann', 'office'] as const)
      expect(
        (await staffWrite(who, `/api/v1/staff/start-exceptions/${exc.exceptionId}/actions/approve`, approveBody, 1))
          .statusCode,
      ).toBe(403)
    expect(
      (await staffWrite('owner', `/api/v1/staff/start-exceptions/${exc.exceptionId}/actions/approve`, {}, 1))
        .statusCode,
    ).toBe(400)
    // A stale sign-in is refused with FRESH_AUTH_REQUIRED.
    await t.db
      .updateTable('identity.staff_sessions')
      .set({ authenticated_at: new Date(Date.now() - 60 * 60_000) })
      .where('staff_user_id', '=', ids.owner)
      .where('revoked_at', 'is', null)
      .execute()
    const stale = await staffWrite(
      'owner',
      `/api/v1/staff/start-exceptions/${exc.exceptionId}/actions/approve`,
      approveBody,
      1,
    )
    expect(stale.json<Err>().error.code).toBe('FRESH_AUTH_REQUIRED')
    await signIn('owner')
    const ok = await staffWrite(
      'owner',
      `/api/v1/staff/start-exceptions/${exc.exceptionId}/actions/approve`,
      approveBody,
      1,
    )
    expect(ok.statusCode, ok.body).toBe(200)
    expect(ok.json()).toMatchObject({ state: 'approved', version: 2 })
    const g2 = await gate('ann', visitId)
    expect(g2.outcome).toBe('ready')
    expect(g2.items.find((i) => i.item === 'site_identity')?.state).toBe('excepted')
    const started = await start('ann', visitId, g2.packet?.version as number)
    expect(started.statusCode, started.body).toBe(201)
    expect(started.json()).toMatchObject({ exceptionIds: [exc.exceptionId] })
    // Still in the Owner's review queue: the deferred walkthrough is open until the visit is completed.
    const follow = await t.db
      .selectFrom('ops.queue_items')
      .select(['reason', 'resolved_at'])
      .where('type', '=', 'start_work_exception')
      .where('subject_id', '=', jobId)
      .where('resolved_at', 'is', null)
      .executeTakeFirstOrThrow()
    expect(follow.reason).toBe('start_work_exception_follow_up')
    // The database: only the Owner decides, never the requester; a decision is kept.
    await expect(
      sql`UPDATE work.gate_exceptions SET decision_note = 'x', version = version + 1 WHERE id = ${exc.exceptionId}`.execute(
        t.db,
      ),
    ).rejects.toThrow()
  })

  it('before photos captured but the upload failed: covers only the named packages; the upload stays open until done', async () => {
    const p = await project()
    const jobId = await approve(p)
    const visitId = await fixtureVisit(p, jobId, ['ann'])
    const version = await prepare('ann', visitId, jobId, { photos: false })
    const g = await gate('ann', visitId)
    const wp = g.workPackages[0]?.workPackageId as string
    expect(missingOf(g)).toEqual(['BEFORE_PHOTOS_MISSING'])
    const res = await staffWrite('ann', `/api/v1/staff/visits/${visitId}/start-exceptions`, {
      kind: 'before_photo_upload_failed',
      reason: 'Synthetic: no signal in the basement.',
      evidence: { workPackageIds: [wp], photosOnDevice: 4, failure: 'Synthetic: upload timed out' },
    })
    expect(res.statusCode, res.body).toBe(201)
    const exc = res.json<{ exceptionId: string }>()
    const ok = await staffWrite(
      'owner',
      `/api/v1/staff/start-exceptions/${exc.exceptionId}/actions/approve`,
      { followUpOwnerId: ids.ann, followUpDue: today(), note: 'Synthetic: upload tonight' },
      1,
    )
    expect(ok.statusCode, ok.body).toBe(200)
    const started = await start('ann', visitId, version)
    expect(started.statusCode, started.body).toBe(201)
    const queueOpen = () =>
      t.db
        .selectFrom('ops.queue_items')
        .select('reason')
        .where('type', '=', 'start_work_exception')
        .where('subject_id', '=', jobId)
        .where('resolved_at', 'is', null)
        .execute()
    expect(await queueOpen()).toEqual([{ reason: 'start_work_exception_follow_up' }])
    const review = (await staffGet('owner', `/api/v1/staff/jobs/${jobId}/start-review`)).json<{
      exceptions: { id: string; followUp: string; evidence: { photosOnDevice: number } }[]
    }>()
    expect(review.exceptions[0]).toMatchObject({
      id: exc.exceptionId,
      followUp: 'open',
      evidence: { photosOnDevice: 4 },
    })
    // The photos sync later: the follow-up is resolved and the queue item with it.
    expect((await photo('ann', visitId, wp)).statusCode).toBe(201)
    expect(await queueOpen()).toEqual([])
    // A wrong type or broken image is refused.
    const bad = await app.inject({
      method: 'POST',
      url: `/api/v1/staff/visits/${visitId}/before-photos?workPackageId=${wp}`,
      payload: Buffer.from('not an image'),
      headers: { cookie: cookies.ann, 'x-csrf-token': csrf.ann, 'content-type': 'image/jpeg' },
    })
    expect(bad.statusCode).toBe(415)
    const other = await app.inject({
      method: 'POST',
      url: `/api/v1/staff/visits/${visitId}/before-photos?workPackageId=${wp}`,
      payload: jpeg(),
      headers: { cookie: cookies.cara, 'x-csrf-token': csrf.cara, 'content-type': 'image/jpeg' },
    })
    expect(other.statusCode).toBe(403)
  })

  it('deposit paid, bookkeeping pending: the Owner verifies it in the provider; an unpaid deposit stays blocking', async () => {
    const p = await project()
    const jobId = await approve(p, 150_000)
    const visitId = await fixtureVisit(p, jobId, ['ann'])
    const version = await prepare('ann', visitId, jobId)
    const g = await gate('ann', visitId)
    expect(missingOf(g)).toEqual(['DEPOSIT_REQUIRED'])
    expect(g.items.find((i) => i.item === 'deposit')?.missing[0]).toMatchObject({
      severity: 'blocked',
      exceptable: 'deposit_bookkeeping_pending',
    })
    const ask = (amountCents: number) =>
      staffWrite('ann', `/api/v1/staff/visits/${visitId}/start-exceptions`, {
        kind: 'deposit_bookkeeping_pending',
        reason: 'Synthetic: the customer paid by card link this morning.',
        evidence: { provider: 'square', transactionReference: 'SYN-SQ-0073', amountCents },
      })
    const low = await ask(100)
    expect(codesOf(low)).toEqual(['AMOUNT_BELOW_DEPOSIT'])
    expect(
      (
        await staffWrite('ann', `/api/v1/staff/visits/${visitId}/start-exceptions`, {
          kind: 'deposit_bookkeeping_pending',
          reason: 'Synthetic',
          evidence: { provider: 'screenshot', transactionReference: 'SYN', amountCents: 30_000 },
        })
      ).statusCode,
    ).toBe(400)
    const res = await ask(30_000)
    expect(res.statusCode, res.body).toBe(201)
    const exc = res.json<{ exceptionId: string }>()
    const url = `/api/v1/staff/start-exceptions/${exc.exceptionId}/actions/approve`
    const unverified = await staffWrite('owner', url, { followUpOwnerId: ids.office, followUpDue: today() }, 1)
    expect(unverified.statusCode).toBe(409)
    expect(codesOf(unverified)).toEqual(['PROVIDER_VERIFICATION_REQUIRED'])
    const ok = await staffWrite(
      'owner',
      url,
      { followUpOwnerId: ids.office, followUpDue: today(), providerVerified: true },
      1,
    )
    expect(ok.statusCode, ok.body).toBe(200)
    const started = await start('ann', visitId, version)
    expect(started.statusCode, started.body).toBe(201)
    expect(started.json()).toMatchObject({ exceptionIds: [exc.exceptionId] })
  })

  it('a relevant change ends an approved exception, and it never carries over to another visit', async () => {
    const p = await project()
    const jobId = await approve(p)
    const visitId = await fixtureVisit(p, jobId, ['ben'])
    await prepare('ben', visitId, jobId, { photos: false })
    const wp = (await gate('ben', visitId)).workPackages[0]?.workPackageId as string
    const res = await staffWrite('ben', `/api/v1/staff/visits/${visitId}/start-exceptions`, {
      kind: 'before_photo_upload_failed',
      reason: 'Synthetic',
      evidence: { workPackageIds: [wp], photosOnDevice: 1, failure: 'Synthetic' },
    })
    expect(res.statusCode, res.body).toBe(201)
    const exc = res.json<{ exceptionId: string }>()
    const ok = await staffWrite(
      'owner',
      `/api/v1/staff/start-exceptions/${exc.exceptionId}/actions/approve`,
      { followUpOwnerId: ids.ben, followUpDue: today() },
      1,
    )
    expect(ok.statusCode, ok.body).toBe(200)
    const other = await fixtureVisit(p, jobId, ['cara'])
    // A job-level Hold (a site-condition change) ends it.
    const set = await staffWrite('office', `/api/v1/staff/jobs/${jobId}/job-holds`, {
      category: 'site_condition',
      note: 'Synthetic: water damage found next door.',
    })
    expect(set.statusCode).toBe(201)
    const g = await gate('ben', visitId)
    expect(g.exceptions[0]).toMatchObject({ id: exc.exceptionId, state: 'invalidated', ending: 'site_changed' })
    expect(missingOf(g)).toEqual(expect.arrayContaining(['BEFORE_PHOTOS_MISSING']))
    // Another visit of the same job finds no exception of its own.
    expect((await gate('cara', other)).exceptions).toEqual([])
    // Deciding it again is refused: it ended.
    const again = await staffWrite(
      'owner',
      `/api/v1/staff/start-exceptions/${exc.exceptionId}/actions/decline`,
      { reason: 'Synthetic' },
      2,
    )
    expect(again.statusCode).toBe(409)
  })
})
