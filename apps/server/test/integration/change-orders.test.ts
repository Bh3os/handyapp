// Change orders: worker proposals and staff drafts against PostgreSQL 16 (TSK-0081; HH-CHG-01, HH-WORK-07, T53,
// ENT-ChangeOrder, ENT-JobScopeSnapshot, OWN-DEC-203, RULE-MONEY-CENTS, RULE-SERVER-AUTHZ). Staff, customers, prices and
// notes are synthetic (RULE-SYNTHETIC-DATA); the estimate terms version recorded below is a fixture of this throwaway
// database. The job is prepared and started through the real Start Work gate (the harness of checklist.test.ts).
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
  CODE_HASH_KEY: ['synthetic', 'start', 'work', 'code', 'key', 'for', 'tests', 'only', '0081'].join('-'),
})
const pw = ['synthetic', 'start', 'work', 'passphrase', '81'].join(' ')
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
    headers: { 'x-forwarded-for': '198.51.100.181' },
    payload: { email: `${p}-co@example.test`, password: pw },
  })
  expect(res.statusCode, res.body).toBe(200)
  const cookie = String(res.headers['set-cookie']).split(';')[0] as string
  const session = await app.inject({ method: 'GET', url: '/api/v1/staff/auth/session', headers: { cookie } })
  cookies[p] = cookie
  csrf[p] = session.json<{ csrfToken: string }>().csrfToken
}

let seq = 0
const key = () => `synthetic-co-${String(++seq).padStart(6, '0')}-${randomUUID()}`
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
  wide = createDb(t.url, { max: 8, applicationName: 'change-orders-test' })
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
        email: `${p}-co@example.test`,
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

// --- Change orders ---------------------------------------------------------------------------------------------------

type Line = {
  kind: 'charge' | 'credit'
  description: string
  workPackageId?: string | null
  quantity?: string | null
  unit?: string | null
  unitPriceCents?: number | null
}
type Version = {
  versionId: string
  version: number
  state: string
  affectedSteps: { workPackageId: string; stepId: string }[]
  base: { snapshotId: string; totalCents: number }
  chargesCents: number | null
  creditsCents: number | null
  revisedTotalCents: number | null
  lines: (Line & { amountCents: number | null })[]
  draftedBy: { id: string }
  reviewedBy: { id: string } | null
  withdrawReason: string | null
  rowVersion: number
}
type Order = {
  changeOrderId: string
  number: number
  reference: string
  origin: string
  current: Version
  ownerApproval: {
    required: boolean
    reasons: string[]
    latest: { approvalId: string; state: string; rowVersion: number } | null
  } | null
  actions: {
    edit: boolean
    review: boolean
    reopen: boolean
    withdraw: boolean
    issue?: boolean
    requestOwnerApproval?: boolean
    revise?: boolean
    decideOwnerApproval?: boolean
  }
}
type View = {
  approved: { snapshotVersion: number; totalCents: number } | null
  paidCents: number
  packages: { id: string; code: string; steps: { id: string }[] }[]
  photos: { id: string }[]
  changeOrders: Order[]
  actions: { create: boolean; chooseOrigin: boolean }
}
const view = async (who: Person, jobId: string) => {
  const res = await staffGet(who, `/api/v1/staff/jobs/${jobId}/change-orders`)
  expect(res.statusCode, res.body).toBe(200)
  return res.json<View>()
}
const orderOf = async (who: Person, jobId: string, n: number) =>
  (await view(who, jobId)).changeOrders.find((o) => o.number === n) as Order
const draft = (lines: Line[], extra: Record<string, unknown> = {}) => ({
  reason: 'Synthetic: rot found behind the trim',
  scope: 'Synthetic: replace the rotten trim board and repaint it',
  lines,
  ...extra,
})
const event = (who: Person, id: string, name: string, version: number, body: Record<string, unknown> = {}) =>
  staffWrite(who, `/api/v1/staff/change-orders/${id}/actions/${name}`, body, version)
const edit = (who: Person, id: string, version: number, body: Record<string, unknown>) =>
  staffWrite(who, `/api/v1/staff/change-orders/${id}/draft`, body, version, 'PUT')
const snapshots = async (jobId: string) =>
  t.db
    .selectFrom('work.job_scope_snapshots')
    .select(['id', 'version', 'total_cents', 'content_sha256'])
    .where('job_id', '=', jobId)
    .orderBy('version')
    .execute()
const packet = async (jobId: string) =>
  (await staffGet('owner', `/api/v1/staff/jobs/${jobId}/packet`)).json<{
    packet: { version: number; contentSha256: string }
  }>().packet
type ChecklistStep = { stepId: string; version: number; actions: string[]; waitsForChangeOrders: number[] }
const checklistStep = async (who: Person, jobId: string, stepId: string) => {
  const res = await staffGet(who, `/api/v1/staff/jobs/${jobId}/checklist`)
  expect(res.statusCode, res.body).toBe(200)
  return res
    .json<{ packages: { stages: { steps: ChecklistStep[] }[] }[] }>()
    .packages[0]?.stages.flatMap((s) => s.steps)
    .find((s) => s.stepId === stepId) as ChecklistStep
}

describe('[HH-CHG-01][HH-WORK-07][T53] change orders: worker proposals and staff drafts', () => {
  let p: Project
  let jobId: string
  let wp: string
  let first: string
  let snapBefore: Awaited<ReturnType<typeof snapshots>>
  let packetBefore: { version: number; contentSha256: string }

  it('[T53][HH-CHG-02] an assigned worker proposes a change with evidence; it binds nothing', async () => {
    p = await project()
    jobId = await approve(p, 80_000)
    const visitId = await fixtureVisit(p, jobId, ['ann', 'cara'])
    const version = await prepare('ann', visitId, jobId)
    expect((await start('ann', visitId, version)).statusCode).toBe(201)
    snapBefore = await snapshots(jobId)
    packetBefore = await packet(jobId)
    const before = await view('ann', jobId)
    wp = before.packages[0]?.id as string
    expect(before.approved?.totalCents).toBe(Number(snapBefore[0]?.total_cents))
    expect(before.actions).toEqual({ create: true, chooseOrigin: false })
    // A worker's draft is always their proposal.
    const origin = await staffWrite('ann', `/api/v1/staff/jobs/${jobId}/change-orders`, {
      ...draft([
        { kind: 'charge', description: 'Synthetic trim board', quantity: '2', unit: 'ea', unitPriceCents: 5_000 },
      ]),
      origin: 'estimator',
    })
    expect(origin.statusCode).toBe(400)
    expect(codesOf(origin)).toEqual(['WORKER_PROPOSAL_ONLY'])
    const res = await staffWrite(
      'ann',
      `/api/v1/staff/jobs/${jobId}/change-orders`,
      draft(
        [{ kind: 'charge', description: 'Synthetic trim board', quantity: '2', unit: 'ea', unitPriceCents: 5_000 }],
        {
          photoIds: [before.photos[0]?.id],
          measurements: 'Synthetic: 4 ft of trim affected',
          hazards: 'Synthetic: none seen',
          affectedSteps: [{ workPackageId: wp, stepId: '1.2' }],
        },
      ),
    )
    expect(res.statusCode, res.body).toBe(201)
    expect(res.json()).toMatchObject({ number: 1, reference: `${p.reference}-C1`, origin: 'worker_proposal' })
    first = res.json<{ changeOrderId: string }>().changeOrderId
    const order = await orderOf('ann', jobId, 1)
    expect(order.current).toMatchObject({
      state: 'draft',
      version: 1,
      chargesCents: 10_000,
      creditsCents: 0,
      revisedTotalCents: Number(snapBefore[0]?.total_cents) + 10_000,
      base: { snapshotId: snapBefore[0]?.id },
    })
    expect(order.actions).toMatchObject({ edit: true, review: false, reopen: false, withdraw: true })
    // Nothing binds: the scope snapshots, the packet and the approved total are unchanged.
    expect(await snapshots(jobId)).toEqual(snapBefore)
    expect(await packet(jobId)).toEqual(packetBefore)
    expect((await view('owner', jobId)).approved?.totalCents).toBe(Number(snapBefore[0]?.total_cents))
  })

  it('[RULE-SERVER-AUTHZ] Office reads but never drafts; another worker never edits or reviews the proposal', async () => {
    expect((await view('office', jobId)).actions.create).toBe(false)
    const office = await staffWrite('office', `/api/v1/staff/jobs/${jobId}/change-orders`, draft([]))
    expect(office.statusCode).toBe(403)
    const order = await orderOf('cara', jobId, 1)
    expect(order.actions).toMatchObject({ edit: false, review: false, reopen: false, withdraw: false })
    expect(
      (await edit('cara', first, order.current.rowVersion, draft([{ kind: 'charge', description: 'Synthetic' }])))
        .statusCode,
    ).toBe(403)
    expect((await event('cara', first, 'review', order.current.rowVersion)).statusCode).toBe(403)
    expect((await event('ann', first, 'review', order.current.rowVersion)).statusCode).toBe(403)
    // A worker never reaches a job they are not assigned to.
    expect((await staffGet('ben', `/api/v1/staff/jobs/${jobId}/change-orders`)).statusCode).toBe(403)
  })

  it('[HH-WORK-07] a step the open change names waits; unaffected steps continue', async () => {
    const waiting = await checklistStep('ann', jobId, '1.2')
    expect(waiting.waitsForChangeOrders).toEqual([1])
    expect(waiting.actions).toEqual(['skip'])
    const refused = await staffWrite('ann', `/api/v1/staff/jobs/${jobId}/checklist/steps/start`, {
      workPackageId: wp,
      stepId: '1.2',
      version: waiting.version,
    })
    expect(refused.statusCode).toBe(409)
    expect(codesOf(refused)).toEqual(['WAITS_FOR_CHANGE_ORDER'])
    const other = await checklistStep('ann', jobId, '1.3')
    expect(other.waitsForChangeOrders).toEqual([])
    expect(
      (
        await staffWrite('ann', `/api/v1/staff/jobs/${jobId}/checklist/steps/start`, {
          workPackageId: wp,
          stepId: '1.3',
          version: other.version,
        })
      ).statusCode,
    ).toBe(200)
  })

  it('[HH-CHG-01] the estimator edits and reviews it: every line priced; reviewed is not edited; reopened', async () => {
    let order = await orderOf('estimator', jobId, 1)
    expect(order.actions).toMatchObject({ edit: true, review: true, reopen: false, withdraw: true })
    // An incomplete line is kept in the draft and refused at review.
    const incomplete = await edit(
      'estimator',
      first,
      order.current.rowVersion,
      draft(
        [
          { kind: 'charge', description: 'Synthetic trim board', quantity: '2', unit: 'ea', unitPriceCents: 5_000 },
          { kind: 'charge', description: 'Synthetic paint touch-up', workPackageId: wp, quantity: null, unit: 'hr' },
        ],
        { affectedSteps: [{ workPackageId: wp, stepId: '1.2' }], scheduleImpact: 'Synthetic: half a day more' },
      ),
    )
    expect(incomplete.statusCode, incomplete.body).toBe(200)
    order = await orderOf('estimator', jobId, 1)
    expect(order.current).toMatchObject({ chargesCents: null, revisedTotalCents: null })
    const notPriced = await event('estimator', first, 'review', order.current.rowVersion)
    expect(notPriced.statusCode).toBe(409)
    expect(codesOf(notPriced)).toEqual(['QUANTITY_UNKNOWN', 'UNIT_PRICE_MISSING'])
    // A stale If-Match is refused.
    const stale = await edit('estimator', first, order.current.rowVersion - 1, draft([]))
    expect(stale.json<Err>().error.code).toBe('STALE_VERSION')
    const priced = await edit(
      'estimator',
      first,
      order.current.rowVersion,
      draft(
        [
          { kind: 'charge', description: 'Synthetic trim board', quantity: '2', unit: 'ea', unitPriceCents: 5_000 },
          {
            kind: 'charge',
            description: 'Synthetic paint touch-up',
            workPackageId: wp,
            quantity: '1.5',
            unit: 'hr',
            unitPriceCents: 4_999,
          },
        ],
        { affectedSteps: [{ workPackageId: wp, stepId: '1.2' }] },
      ),
    )
    expect(priced.statusCode, priced.body).toBe(200)
    order = await orderOf('estimator', jobId, 1)
    // 1.5 x $49.99 = $74.985, rounded once half-up to $74.99.
    expect(order.current.lines.map((l) => l.amountCents)).toEqual([10_000, 7_499])
    expect(order.current.chargesCents).toBe(17_499)
    const reviewed = await event('estimator', first, 'review', order.current.rowVersion)
    expect(reviewed.statusCode, reviewed.body).toBe(200)
    order = await orderOf('estimator', jobId, 1)
    expect(order.current).toMatchObject({ state: 'reviewed', reviewedBy: { id: ids.estimator } })
    expect(order.actions).toMatchObject({ edit: false, review: false, reopen: true, withdraw: true })
    const locked = await edit('estimator', first, order.current.rowVersion, draft([]))
    expect(codesOf(locked)).toEqual(['NOT_A_DRAFT'])
    // The worker can no longer withdraw it once reviewed; the estimator reopens it.
    expect((await event('ann', first, 'withdraw', order.current.rowVersion, { reason: 'Synthetic' })).statusCode).toBe(
      403,
    )
    expect((await event('estimator', first, 'reopen', order.current.rowVersion)).statusCode).toBe(200)
    order = await orderOf('estimator', jobId, 1)
    expect(order.current).toMatchObject({ state: 'draft', reviewedBy: null })
    // Still nothing binds.
    expect(await snapshots(jobId)).toEqual(snapBefore)
    expect(await packet(jobId)).toEqual(packetBefore)
  })

  it('[HH-WORK-07] withdrawing with a reason releases the steps it named', async () => {
    const order = await orderOf('ann', jobId, 1)
    expect(codesOf(await event('ann', first, 'withdraw', order.current.rowVersion))).toEqual(['REASON_REQUIRED'])
    const done = await event('ann', first, 'withdraw', order.current.rowVersion, {
      reason: 'Synthetic: the customer will handle the trim',
    })
    expect(done.statusCode, done.body).toBe(200)
    expect((await orderOf('ann', jobId, 1)).current).toMatchObject({
      state: 'withdrawn',
      withdrawReason: 'Synthetic: the customer will handle the trim',
    })
    const step = await checklistStep('ann', jobId, '1.2')
    expect(step.waitsForChangeOrders).toEqual([])
    expect(step.actions).toContain('start')
  })

  it('[OWN-DEC-203] a credit lowers the revised total; one larger than the remaining charge is refused', async () => {
    const base = Number(snapBefore[0]?.total_cents)
    const credit = await staffWrite('estimator', `/api/v1/staff/jobs/${jobId}/change-orders`, {
      ...draft([
        {
          kind: 'credit',
          description: 'Synthetic: one wall removed from scope',
          quantity: '1',
          unitPriceCents: 30_000,
        },
      ]),
      origin: 'customer_request',
    })
    expect(credit.statusCode, credit.body).toBe(201)
    expect(credit.json()).toMatchObject({ number: 2, origin: 'customer_request' })
    let order = await orderOf('estimator', jobId, 2)
    expect(order.current).toMatchObject({ chargesCents: 0, creditsCents: 30_000, revisedTotalCents: base - 30_000 })
    expect(order.current.lines[0]).toMatchObject({ kind: 'credit', amountCents: 30_000 })
    expect((await event('estimator', order.changeOrderId, 'review', order.current.rowVersion)).statusCode).toBe(200)
    // A credit of the whole remaining charge would make the total $0.00: kept as a draft, refused at review.
    const tooBig = await staffWrite('owner', `/api/v1/staff/jobs/${jobId}/change-orders`, {
      ...draft([{ kind: 'credit', description: 'Synthetic: everything removed', quantity: '1', unitPriceCents: base }]),
      origin: 'estimator',
    })
    expect(tooBig.statusCode, tooBig.body).toBe(201)
    order = await orderOf('owner', jobId, 3)
    expect(order.current).toMatchObject({ creditsCents: null, revisedTotalCents: null })
    const refused = await event('owner', order.changeOrderId, 'review', order.current.rowVersion)
    expect(refused.statusCode).toBe(409)
    expect(codesOf(refused)).toEqual(['CREDIT_EXCEEDS_REMAINING_CHARGE'])
    // The original approved scope and its total are preserved.
    expect(await snapshots(jobId)).toEqual(snapBefore)
  })

  it('the database keeps a reviewed version as reviewed, its lines unchanged, and nothing deleted', async () => {
    const order = await orderOf('estimator', jobId, 2)
    const v = order.current.versionId
    await expect(
      sql`UPDATE work.change_order_versions SET scope = 'Synthetic', row_version = row_version + 1 WHERE id = ${v}`.execute(
        t.db,
      ),
    ).rejects.toThrow(/only a draft/)
    await expect(
      sql`UPDATE work.change_order_lines SET description = 'Synthetic' WHERE version_id = ${v}`.execute(t.db),
    ).rejects.toThrow(/only on a draft/)
    await expect(sql`DELETE FROM work.change_order_versions WHERE id = ${v}`.execute(t.db)).rejects.toThrow(
      /never deleted/,
    )
    await expect(sql`DELETE FROM work.change_orders WHERE id = ${order.changeOrderId}`.execute(t.db)).rejects.toThrow(
      /APPEND_ONLY/,
    )
    // A reviewed version's totals must equal its lines; a credit is never stored as a negative amount.
    const d = (await orderOf('owner', jobId, 3)).current
    await expect(
      sql`UPDATE work.change_order_versions SET state = 'reviewed', reviewed_by = ${ids.owner}, reviewed_at = now(),
            charges_cents = 0, credits_cents = 1, revised_total_cents = base_total_cents - 1,
            row_version = row_version + 1 WHERE id = ${d.versionId}`.execute(t.db),
    ).rejects.toThrow(/totals equal to its lines/)
    await expect(
      sql`INSERT INTO work.change_order_lines (version_id, position, kind, description, quantity_milli,
            unit_price_cents, amount_cents) VALUES (${d.versionId}, 9, 'credit', 'Synthetic', 1000, -100, -100)`.execute(
        t.db,
      ),
    ).rejects.toThrow()
  })
})

// --- Publication (TSK-0082 part 1) -----------------------------------------------------------------------------------

describe('[HH-CHG-02][OWN-DEC-168][OWN-DEC-173] publishing a change order: Owner approval, validity, revise', () => {
  let p: Project
  let jobId: string
  /** A change order drafted and reviewed by the estimator; returns its id and current row version. */
  const reviewed = async (lines: Line[], who: Person = 'estimator') => {
    const res = await staffWrite(who, `/api/v1/staff/jobs/${jobId}/change-orders`, {
      ...draft(lines),
      origin: 'estimator',
    })
    expect(res.statusCode, res.body).toBe(201)
    const { changeOrderId, rowVersion, number } = res.json<{
      changeOrderId: string
      rowVersion: number
      number: number
    }>()
    const r = await event(who, changeOrderId, 'review', rowVersion)
    expect(r.statusCode, r.body).toBe(200)
    return { id: changeOrderId, number, rowVersion: rowVersion + 1 }
  }
  const issue = (who: Person, id: string, version: number, body: Record<string, unknown> = {}) =>
    staffWrite(who, `/api/v1/staff/change-orders/${id}/actions/issue`, body, version)
  const versionRow = async (id: string) =>
    t.db
      .selectFrom('work.change_order_versions')
      .selectAll()
      .where('change_order_id', '=', id)
      .orderBy('version', 'desc')
      .limit(1)
      .executeTakeFirstOrThrow()

  it('[HH-CHG-02] an estimator issues a reviewed change order: valid 7 days, notice queued, still binds nothing', async () => {
    p = await project()
    jobId = await approve(p, 80_000)
    const before = { snapshots: await snapshots(jobId), packet: await packet(jobId) }
    const co = await reviewed([
      { kind: 'charge', description: 'Synthetic extra board', quantity: '1', unitPriceCents: 9_000 },
    ])
    expect((await orderOf('estimator', jobId, co.number)).actions).toMatchObject({
      issue: true,
      requestOwnerApproval: false,
    })
    expect((await orderOf('estimator', jobId, co.number)).ownerApproval).toMatchObject({ required: false })
    // A worker or Office never publishes.
    expect((await issue('office', co.id, co.rowVersion)).statusCode).toBe(403)
    const res = await issue('estimator', co.id, co.rowVersion)
    expect(res.statusCode, res.body).toBe(200)
    const out = res.json<{ state: string; validUntil: string; ownerApproval: unknown; reference: string }>()
    expect(out).toMatchObject({ state: 'issued', ownerApproval: null, reference: `${p.reference}-C${co.number}` })
    // Seven calendar days, to the end of the day in the business time zone.
    const days = (new Date(out.validUntil).getTime() - Date.now()) / 86_400_000
    expect(days).toBeGreaterThan(7)
    expect(days).toBeLessThanOrEqual(8)
    const row = await versionRow(co.id)
    expect(row).toMatchObject({ state: 'issued', issued_by: ids.estimator })
    expect(row.content_sha256).toMatch(/^[0-9a-f]{64}$/)
    // The proposed-change notice and the expiry job are written with it.
    const events = await t.db
      .selectFrom('platform.outbox_events')
      .select(['type', 'idempotency_key'])
      .where('type', '=', 'change_order.published')
      .where('aggregate_id', '=', row.id)
      .execute()
    expect(events).toHaveLength(1)
    const jobs = await t.db
      .selectFrom('platform.jobs')
      .select(['automation', 'run_at'])
      .where('target_id', '=', row.id)
      .execute()
    expect(jobs.map((j) => j.automation)).toContain('change_order.validity_expiry')
    // Issued is not approved: the scope, the packet and the approved total stay as they were.
    expect(await snapshots(jobId)).toEqual(before.snapshots)
    expect(await packet(jobId)).toEqual(before.packet)
    const issued = await orderOf('estimator', jobId, co.number)
    expect(issued.current.state).toBe('issued')
    expect(issued.actions).toMatchObject({ edit: false, issue: false, revise: true, withdraw: true })
  })

  it('[OWN-DEC-173][OWN-DEC-204] over the threshold or with a credit, only with the Owner’s approval', async () => {
    // A credit is a discretionary credit while no materiality is configured: the estimator asks the Owner.
    const credit = await reviewed([
      { kind: 'credit', description: 'Synthetic: goodwill credit', quantity: '1', unitPriceCents: 5_000 },
    ])
    let order = await orderOf('estimator', jobId, credit.number)
    expect(order.ownerApproval).toMatchObject({ required: true, reasons: ['discretionary_credit'] })
    const refused = await issue('estimator', credit.id, credit.rowVersion)
    expect(refused.statusCode).toBe(409)
    expect(codesOf(refused)).toContain('OWNER_APPROVAL_REQUIRED')
    const asked = await staffWrite(
      'estimator',
      `/api/v1/staff/change-orders/${credit.id}/owner-approval`,
      {},
      credit.rowVersion,
    )
    expect(asked.statusCode, asked.body).toBe(200)
    const approvalId = asked.json<{ approvalId: string }>().approvalId
    order = await orderOf('owner', jobId, credit.number)
    expect(order.ownerApproval?.latest).toMatchObject({ approvalId, state: 'pending' })
    expect(order.actions.decideOwnerApproval).toBe(true)
    expect(codesOf(await issue('estimator', credit.id, credit.rowVersion))).toContain('OWNER_APPROVAL_PENDING')
    const decided = await staffWrite(
      'owner',
      `/api/v1/staff/publication-approvals/${approvalId}/decision`,
      { decision: 'approve', comment: 'Synthetic: goodwill credit is fine' },
      order.ownerApproval?.latest?.rowVersion,
    )
    expect(decided.statusCode, decided.body).toBe(200)
    const issued = await issue('estimator', credit.id, credit.rowVersion)
    expect(issued.statusCode, issued.body).toBe(200)
    expect(issued.json()).toMatchObject({ state: 'issued', ownerApproval: { approvalId, basis: 'request' } })
    // Over $2,500.00 the Owner's own publication is the approval.
    const big = await reviewed([
      { kind: 'charge', description: 'Synthetic: new room', quantity: '1', unitPriceCents: 250_001 },
    ])
    expect((await orderOf('owner', jobId, big.number)).ownerApproval?.reasons).toContain('change_order_adjustment')
    const owner = await issue('owner', big.id, big.rowVersion)
    expect(owner.statusCode, owner.body).toBe(200)
    expect(owner.json()).toMatchObject({ ownerApproval: { basis: 'owner_publication' } })
  })

  it('[OWN-DEC-168] only the Owner sets a shorter validity, with a reason; never a longer one', async () => {
    const co = await reviewed([
      { kind: 'charge', description: 'Synthetic: urgent', quantity: '1', unitPriceCents: 1_000 },
    ])
    const estimator = await issue('estimator', co.id, co.rowVersion, { validityDays: 2, validityReason: 'Synthetic' })
    expect(estimator.statusCode).toBe(403)
    expect(codesOf(await issue('owner', co.id, co.rowVersion, { validityDays: 2 }))).toEqual(['REASON_REQUIRED'])
    expect((await issue('owner', co.id, co.rowVersion, { validityDays: 9, validityReason: 'x' })).statusCode).toBe(400)
    const short = await issue('owner', co.id, co.rowVersion, {
      validityDays: 2,
      validityReason: 'Synthetic: material price holds two days',
    })
    expect(short.statusCode, short.body).toBe(200)
    const days = (new Date(short.json<{ validUntil: string }>().validUntil).getTime() - Date.now()) / 86_400_000
    expect(days).toBeLessThanOrEqual(3)
    expect(await versionRow(co.id)).toMatchObject({ validity_days: 2 })
  })

  it('[OWN-DEC-168] an issued version expires at its end, is shown expired before the job runs, and is reissued', async () => {
    const co = await reviewed([
      { kind: 'charge', description: 'Synthetic: shelf', quantity: '1', unitPriceCents: 2_000 },
    ])
    // The project's other open change orders together are over the threshold now (the splitting check): the Owner
    // issues it, and the Owner's publication is the approval.
    expect((await issue('owner', co.id, co.rowVersion)).statusCode).toBe(200)
    const row = await versionRow(co.id)
    // The job refuses to expire it early.
    const { expireIfDue } = await import('../../src/modules/change-orders/publish.js')
    await expect(withTx(t.db, (tx) => expireIfDue(tx, row.id))).rejects.toThrow(/not due/)
    // Its validity ended (moved into the past for the test, bypassing the guard that keeps it unchanged).
    await withTx(t.db, async (tx) => {
      await sql`SET LOCAL session_replication_role = replica`.execute(tx)
      await sql`UPDATE work.change_order_versions SET issued_at = now() - interval '9 days',
                  valid_until = now() - interval '1 day' WHERE id = ${row.id}`.execute(tx)
    })
    expect((await orderOf('estimator', jobId, co.number)).current.state).toBe('expired')
    expect(await withTx(t.db, (tx) => expireIfDue(tx, row.id))).toBe('expired')
    let expired = await orderOf('estimator', jobId, co.number)
    expect(expired.actions).toMatchObject({ revise: true, issue: false, withdraw: false })
    // Reissued after review: version 2 as a draft with the same lines; version 1 stays expired.
    const again = await staffWrite(
      'estimator',
      `/api/v1/staff/change-orders/${co.id}/actions/revise`,
      {},
      expired.current.rowVersion,
    )
    expect(again.statusCode, again.body).toBe(200)
    expired = await orderOf('estimator', jobId, co.number)
    expect(expired.current).toMatchObject({ version: 2, state: 'draft', chargesCents: 2_000 })
    expect((expired as unknown as { history: { version: number; state: string }[] }).history).toEqual([
      expect.objectContaining({ version: 1, state: 'expired' }),
    ])
  })

  it('[HH-CHG-02] revising an issued version supersedes it; the database keeps issued versions as issued', async () => {
    const co = await reviewed([
      { kind: 'charge', description: 'Synthetic: door', quantity: '1', unitPriceCents: 3_000 },
    ])
    // The project's other open change orders together are over the threshold now (the splitting check): the Owner
    // issues it, and the Owner's publication is the approval.
    expect((await issue('owner', co.id, co.rowVersion)).statusCode).toBe(200)
    const issued = await versionRow(co.id)
    await expect(
      sql`UPDATE work.change_order_versions SET valid_until = valid_until + interval '30 days',
            row_version = row_version + 1 WHERE id = ${issued.id}`.execute(t.db),
    ).rejects.toThrow(/never changes/)
    const res = await staffWrite(
      'estimator',
      `/api/v1/staff/change-orders/${co.id}/actions/revise`,
      {},
      issued.row_version,
    )
    expect(res.statusCode, res.body).toBe(200)
    const old = await t.db
      .selectFrom('work.change_order_versions')
      .select(['state', 'superseded_at'])
      .where('id', '=', issued.id)
      .executeTakeFirstOrThrow()
    expect(old.state).toBe('superseded')
    expect(old.superseded_at).not.toBeNull()
    // The database refuses issuing with a credit and no used Owner approval.
    const credit = await reviewed([
      { kind: 'credit', description: 'Synthetic credit', quantity: '1', unitPriceCents: 100 },
    ])
    const v = await versionRow(credit.id)
    await expect(
      sql`UPDATE work.change_order_versions SET state = 'issued', issued_by = ${ids.estimator}, issued_at = now(),
            content_sha256 = ${'a'.repeat(64)}, valid_until = now() + interval '7 days',
            row_version = row_version + 1 WHERE id = ${v.id}`.execute(t.db),
    ).rejects.toThrow(/Owner's approval/)
  })
})
