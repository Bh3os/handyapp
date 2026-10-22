// My Day, On my way, Arrived and Finished per worker, the Owner's corrections and the accountant's CSV against
// PostgreSQL 16 (TSK-0070; HH-OFF-09, HH-SCH-08, HH-PORT-07, HH-WORK-06, T23, T43, T47, T49, T65, ENT-Visit,
// ENT-TimeStamp, ENT-AuditEvent, FACT-AUTOMATIC-MESSAGES, OWN-DEC-107, OWN-DEC-69, OWN-DEC-121, OWN-DEC-149,
// RULE-SERVER-AUTHZ, RULE-SAFETY-GATES). Staff, customers, working hours, addresses, notes and the access code are
// synthetic (RULE-SYNTHETIC-DATA): the hours are test fixtures, never the business's hours, and the estimate terms
// version recorded below is a fixture of this throwaway database.
// - "Today's visit" is a fixture: a confirmed work visit early today, written the way the confirmation writes it (a
//   covering reservation, then the state), because the API only plans visits in the future. Yesterday's visit, whose
//   taps the fixture writes in one transaction the way the tap routes write them, shows what the Owner sees after a
//   service day ended with a forgotten Finished.
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
import { onTheWayAutomation } from '../../src/modules/field/index.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { startCustomerSession } from '../../src/modules/identity/customer-sessions.js'
import { readCodeKey, type CodeKeySettings } from '../../src/modules/identity/index.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import { customerPlan, reapplyDeletions } from '../../src/modules/privacy/index.js'
import { createAutomationRegistry } from '../../src/platform/automation.js'
import { recordPolicyVersion } from '../../src/platform/config/index.js'
import { createWorker } from '../../src/platform/jobs.js'
import { createProviders } from '../../src/providers/index.js'
import { FakeObjectStorage } from '../../src/providers/r2/index.js'
import { readProviderSettings } from '../../src/providers/settings.js'
import { verifyCountyOf } from '../fixtures/county.js'
import { testConfig } from '../fixtures/env.js'
import { verifyPropertyZone } from '../fixtures/zones.js'
import { signInWithMfa } from '../fixtures/staff-mfa.js'

const ZONE = 'America/Kentucky/Louisville'
const KEY: CodeKeySettings = readCodeKey({
  HANDYHUB_ENV: 'ci',
  CODE_HASH_KEY: ['synthetic', 'my', 'day', 'code', 'key', 'for', 'tests', 'only', '0070'].join('-'),
})
const SEAL = ['synthetic', 'my', 'day', 'access', 'code', 'sealing', 'key', 'tests'].join('-')
const pw = ['synthetic', 'my', 'day', 'passphrase', '70'].join(' ')
/** The access code of this test, built at runtime so no literal looks like a credential. */
const CODE = ['8', '2', '6', '0', '4'].join('')
const SIGNED_IN = ['owner', 'office', 'estimator', 'ann', 'ben', 'cy'] as const
type Person = (typeof SIGNED_IN)[number]
const WORKERS = ['ann', 'ben', 'cy'] as const
const NAMES: Record<Person, string> = {
  owner: 'Synthetic Owner',
  office: 'Synthetic Office',
  estimator: 'Synthetic Estimator',
  ann: 'Annabel Synthetic',
  ben: 'Benito Synthetic',
  cy: 'Cyrus Synthetic',
}

let t: TestDatabase
let wide: Db
let app: FastifyInstance
const cookies = {} as Record<Person, string>
const csrf = {} as Record<Person, string>
const ids = {} as Record<Person, string>

const today = () => localDateOf(new Date(), ZONE)
const day = (n: number) => addLocalDays(today(), n)
const WEEK = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, start: '08:00', end: '20:00' }))

async function signIn(p: Person): Promise<[string, string]> {
  const res = await signInWithMfa(app, {
    method: 'POST',
    url: '/api/v1/staff/auth/sign-in',
    headers: { 'x-forwarded-for': '198.51.100.170' },
    payload: { email: `${p}-myday@example.test`, password: pw },
  })
  expect(res.statusCode, res.body).toBe(200)
  const cookie = String(res.headers['set-cookie']).split(';')[0] as string
  const session = await app.inject({ method: 'GET', url: '/api/v1/staff/auth/session', headers: { cookie } })
  return [cookie, session.json<{ csrfToken: string }>().csrfToken]
}

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
const tap = (who: Person, visitId: string, what: 'on-my-way' | 'arrived' | 'finished', body: object = {}) =>
  staffWrite(who, 'POST', `/api/v1/staff/visits/${visitId}/${what}`, body)
const codes = (body: string) =>
  (JSON.parse(body) as { error: { fieldErrors: { field: string; code: string }[] } }).error.fieldErrors.map((f) => [
    f.field,
    f.code,
  ])

beforeAll(async () => {
  t = await createTestDatabase()
  wide = createDb(t.url, { max: 8, applicationName: 'my-day-test' })
  await syncServices(t.db, loadServiceSeed())
  await syncSops(t.db, loadSopSeed())
  app = await buildApp({
    config: testConfig({ TRUST_PROXY_HOPS: '1', ACCESS_CODE_ENCRYPTION_KEY: SEAL }),
    api: { db: wide, codeKey: KEY, storage: new FakeObjectStorage() },
  })
  const hash = await hashPassword(pw)
  await withTx(t.db, async (tx) => {
    for (const p of SIGNED_IN) {
      const role = (WORKERS as readonly string[]).includes(p) ? 'worker' : (p as 'owner' | 'office' | 'estimator')
      const user = await createStaffUser(tx, {
        email: `${p}-myday@example.test`,
        displayName: NAMES[p],
        locale: p === 'ben' ? 'es' : 'en',
        role,
        issuedBy: 'test',
      })
      await setPasswordHash(tx, user.id, hash)
      ids[p] = user.id
    }
  })
  for (const p of SIGNED_IN) [cookies[p], csrf[p]] = await signIn(p)
  for (const c of WORKERS) {
    const res = await staffWrite('owner', 'PUT', `/api/v1/staff/workers/${ids[c]}/working-hours`, { periods: WEEK }, 0)
    expect(res.statusCode, res.body).toBe(200)
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
})
afterAll(async () => {
  await app?.close()
  await wide?.destroy()
  await t?.drop()
})

const ALL_OK = Object.fromEntries(
  ['coverage', 'service_fit', 'essential_facts', 'urgency', 'site_visit_need', 'staff_equipment', 'risk_flags'].map(
    (c) => [c, { outcome: 'ok' }],
  ),
)
type Project = { requestId: string; projectId: string; propertyId: string; reference: string; cookie: string }
let ip = 30

/** A qualified synthetic request with one DW-01 work package, and a verified customer session for its project. */
async function project(): Promise<Project> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/public/requests',
    headers: { 'idempotency-key': key('submit'), 'x-forwarded-for': `198.51.100.${++ip}` },
    payload: {
      formVersion: 'test-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-01' }],
      notSure: false,
      description: 'Synthetic My Day project.',
      answers: [],
      property: {
        street: `${++seq} Synthetic Day Lane`,
        city: 'Testville',
        state: 'ky',
        zip: '40000',
        propertyType: 'house',
      },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'site_visit',
      contact: {
        fullName: 'Synthetic Day Customer',
        email: `myday-${seq}-${randomUUID().slice(0, 8)}@example.test`,
        phone: '(502) 555-0170',
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
  // TSK-0127: staff's address and county check, which a first confirmation needs.
  await verifyCountyOf(t.db, row.project_id)
  // TSK-0123: the property's zone is unknown until verified; these tests plan visits, so it is verified first.
  await verifyPropertyZone(t.db, { projectId: row.project_id })
  const grant = await t.db
    .selectFrom('identity.project_access_grants')
    .select('id')
    .where('request_id', '=', row.id)
    .executeTakeFirstOrThrow()
  expect(
    (await staffWrite('owner', 'PUT', `/api/v1/staff/requests/${row.id}/qualification`, { checks: ALL_OK }, 0))
      .statusCode,
  ).toBe(200)
  const moved = await staffWrite(
    'owner',
    'POST',
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

/** Approves one synthetic patch ($12.50: no deposit) through the real approval transaction; returns the job. */
async function approve(p: Project): Promise<string> {
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
          description: 'Patch the synthetic wall',
          quantity: '1',
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
  const base = `/api/v1/customer/projects/${p.reference}/estimates/${c.number}/versions/1`
  const d = (await app.inject({ method: 'GET', url: base, headers: { cookie: p.cookie } })).json<{
    approval: { contentDigest: string; selection: { totalCents: number; deposit: { amountCents: number | null } } }
  }>()
  const res = await app.inject({
    method: 'POST',
    url: `${base}/approve`,
    headers: {
      cookie: p.cookie,
      'idempotency-key': key('approve'),
      'x-forwarded-for': `2001:db8:70:${++ip}::1`,
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
      fullName: 'Synthetic Day Customer',
    },
  })
  expect(res.statusCode, res.body).toBe(201)
  return (
    await t.db.selectFrom('work.jobs').select('id').where('project_id', '=', p.projectId).executeTakeFirstOrThrow()
  ).id
}

/** An estimate published and withdrawn on the project: never accepted, so nothing blocks its deletion. */
async function withdrawnEstimate(p: Project): Promise<{ estimateId: string; number: string }> {
  const created = await staffWrite('estimator', 'POST', `/api/v1/staff/projects/${p.projectId}/estimates`, {})
  expect(created.statusCode, created.body).toBe(201)
  const c = created.json<{ estimateId: string; number: string; versionId: string }>()
  const draft = (await staffGet('estimator', `/api/v1/staff/estimate-versions/${c.versionId}`)).json<{
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
          workPackageId: draft.workPackages[0]?.id,
          description: 'Synthetic: the withdrawn patch',
          quantity: '1',
          unit: 'patch',
          unitPriceCents: 900,
        },
      ],
      texts: {},
    },
    draft.rowVersion,
  )
  expect(saved.statusCode, saved.body).toBe(200)
  const published = await staffWrite(
    'estimator',
    'POST',
    `/api/v1/staff/estimate-versions/${c.versionId}/publish`,
    {},
    saved.json<{ rowVersion: number }>().rowVersion,
  )
  expect(published.statusCode, published.body).toBe(200)
  const withdrawn = await staffWrite(
    'estimator',
    'POST',
    `/api/v1/staff/estimate-versions/${c.versionId}/withdraw`,
    { reason: 'Synthetic: sent by mistake.' },
    published.json<{ rowVersion: number }>().rowVersion,
  )
  expect(withdrawn.statusCode, withdrawn.body).toBe(200)
  return { estimateId: c.estimateId, number: c.number }
}

/** A work visit planned by Office for a future date and confirmed with one worker. */
async function bookedVisit(p: Project, date: string, worker: Person): Promise<{ id: string; version: number }> {
  const planned = await staffWrite('office', 'POST', `/api/v1/staff/projects/${p.projectId}/visits`, {
    purpose: 'service',
    localDate: date,
    windowStart: '09:00',
    windowEnd: '10:00',
    expectedDurationMinutes: 60,
    travelBufferMinutes: 30,
    preparationBufferMinutes: 0,
    requiredWorkers: 1,
    equipment: [],
  })
  expect(planned.statusCode, planned.body).toBe(201)
  const all = planned.json<{ visits: { id: string; version: number }[] }>().visits
  const v = all[all.length - 1] as { id: string; version: number }
  const res = await staffWrite(
    'office',
    'POST',
    `/api/v1/staff/visits/${v.id}/confirm`,
    { workerIds: [ids[worker]] },
    v.version,
  )
  expect(res.statusCode, res.body).toBe(200)
  return t.db.selectFrom('work.visits').select(['id', 'version']).where('id', '=', v.id).executeTakeFirstOrThrow()
}

/** A confirmed work visit on `date` early in the day for the given team (lead first), see the header. */
const SLOT_MINUTES = 30
/** Slots taken per local date and worker, so one worker's fixtures never overlap. */
const taken = new Map<string, Set<number>>()
/**
 * The first free 30-minute slot after local midnight of `date` for the whole team: a 15-minute window and its
 * 15-minute covering reservation. Slots count real minutes from midnight (a DST day skips the slot it cannot
 * express), so even the fifth visit of one worker starts within two hours of midnight: On my way (three hours
 * before the window, OWN-DEC-107) is open whenever the suite runs on that local day, at any hour (HH-SCH-08, T47).
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
async function fixtureVisit(p: Project, jobId: string, date: string, team: Person[]): Promise<string> {
  const window = fixtureWindow(date, team)
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

type Item = {
  visitId: string
  state: string
  version: number
  projectReference: string
  assignment: string
  role: string
  team: { name: string | null; role: string }[]
  address: { street: string } | null
  directionsUrl: string | null
  accessNotes: { detail: string; value: string | null }[]
  preparation: { customerPreparation: string | null; instructions: string | null }
  readiness: { packetVersion: number; acknowledgment: string; blockers: { code: string; count: number }[] } | null
  mine: { departedAt: string | null; arrivedAt: string | null; finishedAt: string | null }
  next: string
  onMyWayOpensAt: string | null
  actions: { onMyWay: boolean; arrived: boolean; finished: boolean }
}
const myDay = async (who: Person) => {
  const res = await staffGet(who, '/api/v1/staff/my/day')
  expect(res.statusCode, res.body).toBe(200)
  return res.json<{ onMyWay: { state: string; earliestMinutesBefore: number | null }; visits: Item[] }>()
}
const visitState = (id: string) =>
  t.db.selectFrom('work.visits').select(['state', 'version']).where('id', '=', id).executeTakeFirstOrThrow()

const providers = createProviders(readProviderSettings({ HANDYHUB_ENV: 'ci' }))
async function runNotices() {
  const worker = createWorker({
    db: t.db,
    registry: createAutomationRegistry([
      onTheWayAutomation({
        providers: { email: providers.email, sms: providers.sms },
        publicSiteUrl: 'https://site.example.test',
      }),
    ]),
  })
  for (let i = 0; i < 3; i++) await worker.runOnce()
}
const customerGet = async (p: Project, tab: 'appointments' | 'overview') => {
  const res = await app.inject({
    method: 'GET',
    url: `/api/v1/customer/projects/${p.reference}/${tab}`,
    headers: { cookie: p.cookie },
  })
  expect(res.statusCode, res.body).toBe(200)
  return res.json<{
    appointments?: { status: string }[]
    status?: { situation: string; step: string }
    timeline?: { kind: string; at: string }[]
  }>()
}

describe('[HH-OFF-09][T43] My Day: today’s assigned visits in order with the next action', () => {
  it('[HH-OFF-09][T43][T49][OWN-DEC-40] address, directions, access notes (never a code), preparation, readiness and the next action; nothing for anyone else', async () => {
    const p = await project()
    const jobId = await approve(p)
    const property = (await staffGet('office', `/api/v1/staff/properties/${p.propertyId}`)).json<{ version: number }>()
    const noted = await staffWrite(
      'office',
      'PUT',
      `/api/v1/staff/properties/${p.propertyId}/details/access_notes`,
      { value: 'Synthetic: side gate, ring twice', source: 'customer_call', reason: 'Synthetic: the customer called' },
      property.version,
    )
    expect(noted.statusCode, noted.body).toBe(200)
    const coded = await staffWrite('office', 'POST', `/api/v1/staff/properties/${p.propertyId}/access-codes`, {
      kind: 'lockbox',
      label: 'Synthetic box',
      value: CODE,
      source: 'customer_call',
      reason: 'Synthetic: given by phone',
    })
    expect(coded.statusCode, coded.body).toBe(201)
    const visitId = await fixtureVisit(p, jobId, today(), ['ann'])
    const later = await bookedVisit(p, day(5), 'ann')

    const mine = await myDay('ann')
    expect(mine.onMyWay).toEqual({ state: 'configured', earliestMinutesBefore: 180 })
    const item = mine.visits.find((v) => v.visitId === visitId) as Item
    expect(item).toMatchObject({
      state: 'confirmed',
      projectReference: p.reference,
      assignment: 'confirmed',
      role: 'lead',
      team: [{ name: NAMES.ann, role: 'lead' }],
      address: { street: expect.stringContaining('Synthetic Day Lane') },
      accessNotes: [{ detail: 'access_notes', value: 'Synthetic: side gate, ring twice' }],
      mine: { departedAt: null, arrivedAt: null, finishedAt: null },
      next: 'on_my_way',
      actions: { onMyWay: true, arrived: false, finished: false },
    })
    expect(item.directionsUrl).toMatch(/^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=/)
    // Readiness: what the records show (a packet never viewed, nor acknowledged by this worker, TSK-0072; no loadout
    // list imported in this database, so NOT CONFIGURED, TSK-0071); not the Start Work check.
    expect(item.readiness?.acknowledgment).toBe('required')
    expect(item.readiness?.blockers).toEqual([
      { code: 'packet_not_viewed', count: 1 },
      { code: 'packet_not_acknowledged', count: 1 },
      { code: 'loadout_not_configured', count: 1 },
    ])
    // Only today's visits (the one in five days is not on today's list), and never an access code.
    expect(mine.visits.map((v) => v.visitId)).not.toContain(later.id)
    expect(JSON.stringify(mine)).not.toContain(CODE)
    expect(JSON.stringify(mine)).not.toMatch(/\bETA\b|estimated arrival|minutes away/i)
    // Another worker sees nothing of it; a non-worker without assignments sees an empty day.
    expect((await myDay('ben')).visits).toEqual([])
    expect((await myDay('owner')).visits).toEqual([])
  })

  it('[HH-OFF-09][T49][OWN-DEC-171] the address, directions, access notes and preparation only on the visit’s own local service day: a visit still under way from yesterday shows none', async () => {
    const p = await project()
    const jobId = await approve(p)
    const property = (await staffGet('office', `/api/v1/staff/properties/${p.propertyId}`)).json<{ version: number }>()
    const noted = await staffWrite(
      'office',
      'PUT',
      `/api/v1/staff/properties/${p.propertyId}/details/access_notes`,
      { value: 'Synthetic: back door', source: 'customer_call', reason: 'Synthetic: the customer called' },
      property.version,
    )
    expect(noted.statusCode, noted.body).toBe(200)
    const yesterday = await fixtureVisit(p, jobId, day(-1), ['ann'])
    // Yesterday's taps, written the way the tap routes write them (see the header): on the way, then arrived, never
    // finished, so the visit is still under way and stays on today's list.
    await withTx(t.db, async (tx) => {
      const v = await tx
        .selectFrom('work.visits')
        .select('version')
        .where('id', '=', yesterday)
        .executeTakeFirstOrThrow()
      await tx
        .insertInto('work.visit_departures')
        .values({ visit_id: yesterday, staff_user_id: ids.ann, moved_visit: true })
        .execute()
      await tx
        .updateTable('work.visits')
        .set({ state: 'en_route', version: v.version + 1 })
        .where('id', '=', yesterday)
        .execute()
      await tx
        .insertInto('work.time_stamps')
        .values({
          visit_id: yesterday,
          project_id: p.projectId,
          job_id: jobId,
          staff_user_id: ids.ann,
          kind: 'arrived',
        })
        .execute()
      await tx
        .updateTable('work.visits')
        .set({ state: 'arrived', version: v.version + 2 })
        .where('id', '=', yesterday)
        .execute()
    })
    const todays = await fixtureVisit(p, jobId, today(), ['ann'])

    const mine = await myDay('ann')
    const old = mine.visits.find((v) => v.visitId === yesterday) as Item
    expect(old).toMatchObject({
      state: 'arrived',
      address: null,
      directionsUrl: null,
      accessNotes: [],
      preparation: { customerPreparation: null, instructions: null },
    })
    // The visit of today, same property, same worker: shown.
    const current = mine.visits.find((v) => v.visitId === todays) as Item
    expect(current.address).toMatchObject({ street: expect.stringContaining('Synthetic Day Lane') })
    expect(current.accessNotes).toEqual([
      expect.objectContaining({ detail: 'access_notes', value: 'Synthetic: back door' }),
    ])
    expect(JSON.stringify(old)).not.toContain('Synthetic Day Lane')
    expect(JSON.stringify(old)).not.toContain('Synthetic: back door')
  })
})

describe('[HH-SCH-08][HH-PORT-07][T65] On my way: the assigned worker’s tap, once, with the automatic notice', () => {
  it('[HH-SCH-08][HH-PORT-07][T65][T23][OWN-DEC-107] refused for others and too early; one accepted tap moves the visit, sends one notice and updates the portal', async () => {
    const p = await project()
    const jobId = await approve(p)
    const later = await bookedVisit(p, day(4), 'ann')
    const visitId = await fixtureVisit(p, jobId, today(), ['ann'])

    // Before: the customer sees the confirmed appointment, no on-the-way entry.
    const before = await customerGet(p, 'overview')
    expect(before.timeline?.map((e) => e.kind)).not.toContain('on_the_way')

    // A worker assigned to someone else's visit is refused; so is the Office, which is never assigned.
    expect((await tap('ben', visitId, 'on-my-way')).statusCode).toBe(403)
    expect((await tap('office', visitId, 'on-my-way')).statusCode).toBe(403)
    // Too early: the visit in four days opens three hours before its window; time alone records nothing.
    const early = await tap('ann', later.id, 'on-my-way')
    expect(early.statusCode, early.body).toBe(409)
    expect(codes(early.body)).toEqual([['visit', 'ON_MY_WAY_TOO_EARLY']])
    // Arrived before anyone is on the way (PROPOSED).
    const first = await tap('ann', visitId, 'arrived')
    expect(first.statusCode).toBe(409)
    expect(codes(first.body)).toEqual([['visit', 'ON_MY_WAY_FIRST']])
    expect((await visitState(visitId)).state).toBe('confirmed')

    // The accepted tap: en_route, one event, recorded per worker; a repeat records and sends nothing more.
    const res = await tap('ann', visitId, 'on-my-way', { deviceRecordedAt: new Date().toISOString() })
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json()).toMatchObject({
      recorded: true,
      visit: { state: 'en_route', next: 'arrived', actions: { onMyWay: false, arrived: true, finished: false } },
    })
    const again = await tap('ann', visitId, 'on-my-way')
    expect(again.statusCode).toBe(200)
    expect(again.json()).toMatchObject({ recorded: false, visit: { state: 'en_route' } })
    expect(
      await t.db.selectFrom('work.visit_departures').select(['moved_visit']).where('visit_id', '=', visitId).execute(),
    ).toEqual([{ moved_visit: true }])
    const events = await t.db
      .selectFrom('platform.outbox_events')
      .select(['type', 'aggregate_version'])
      .where('aggregate_id', '=', visitId)
      .where('type', '=', 'visit.on_my_way')
      .execute()
    expect(events).toEqual([{ type: 'visit.on_my_way', aggregate_version: (await visitState(visitId)).version }])
    const audited = await t.db
      .selectFrom('platform.audit_events')
      .select(['action', 'summary'])
      .where('target_id', '=', visitId)
      .where('action', '=', 'visit.tap_on_my_way')
      .orderBy('seq')
      .execute()
    expect(audited.map((a) => (a.summary as { recorded: boolean }).recorded)).toEqual([true, false])

    // The notice: once, by the configured channels (TSK-0120: the owner-authorized email with its values; texts have no
    // wording until A2P 10DLC).
    await runNotices()
    await runNotices()
    const deliveries = await t.db
      .selectFrom('platform.message_deliveries')
      .select(['message_key', 'channel', 'state', 'error_code'])
      .where('subject_key', '=', `visit_on_my_way:${visitId}`)
      .execute()
    expect(deliveries).toEqual([
      { message_key: 'visit.on_the_way', channel: 'email', state: 'queued', error_code: null },
      { message_key: 'visit.on_the_way', channel: 'sms', state: 'failed', error_code: 'template_not_configured' },
    ])
    const notice = (providers.fakes.email?.sent ?? []).filter((m) => m.subject === 'HandyHub | Our Team Is on the Way')
    expect(notice).toHaveLength(1)
    expect(notice[0]?.text).toMatch(/Our team is on the way for your HandyHub visit #HH-[0-9A-Z]{8}-V\d+\./)
    expect(notice[0]?.text).toMatch(/Arrival window: \d{1,2}:\d{2} [AP]M – \d{1,2}:\d{2} [AP]M \((EDT|EST|CDT|CST)\)/)
    expect(notice[0]?.text).not.toMatch(/\bETA\b|minutes away|location/i)

    // The portal: "On the way" only now that it is recorded; no worker name, no ETA.
    const after = await customerGet(p, 'overview')
    expect(after.status).toMatchObject({ situation: 'on_the_way' })
    expect(after.timeline?.[0]?.kind).toBe('on_the_way')
    const appointments = await customerGet(p, 'appointments')
    expect(appointments.appointments?.map((a) => a.status)).toContain('en_route')
    const text = JSON.stringify([after, appointments])
    expect(text).not.toContain('Annabel')
    expect(text).not.toMatch(/\bETA\b|estimated arrival|minutes away/i)

    // A rescheduled-away or reassigned worker is refused on the next tap (the visit in four days, now Ben's).
    const v = await t.db
      .selectFrom('work.visits')
      .select('version')
      .where('id', '=', later.id)
      .executeTakeFirstOrThrow()
    const moved = await staffWrite(
      'office',
      'POST',
      `/api/v1/staff/visits/${later.id}/reassign`,
      { workerIds: [ids.ben], reason: 'Synthetic: Ann is needed elsewhere' },
      v.version,
    )
    expect(moved.statusCode, moved.body).toBe(200)
    expect((await tap('ann', later.id, 'on-my-way')).statusCode).toBe(403)
  })

  it('[HH-SCH-08][RULE-DECIDED-VALUES-ACTIVE] while the On my way rule is NOT CONFIGURED the tap is refused, never assumed', async () => {
    const p = await project()
    const jobId = await approve(p)
    const visitId = await fixtureVisit(p, jobId, today(), ['cy'])
    await recordPolicyVersion(t.db, {
      key: 'visit.on_my_way',
      value: null,
      sourceIds: ['TEST-SYNTHETIC'],
      changedBy: 'test',
      reason: 'synthetic: unset',
    })
    try {
      expect((await myDay('cy')).visits.find((v) => v.visitId === visitId)).toMatchObject({
        next: 'not_configured',
        actions: { onMyWay: false },
      })
      const res = await tap('cy', visitId, 'on-my-way')
      expect(res.statusCode).toBe(503)
      expect(codes(res.body)).toEqual([['visit.on_my_way', 'ON_MY_WAY_NOT_CONFIGURED']])
      expect((await visitState(visitId)).state).toBe('confirmed')
    } finally {
      await recordPolicyVersion(t.db, {
        key: 'visit.on_my_way',
        value: { earliestMinutesBefore: 180 },
        sourceIds: ['OWN-DEC-107', 'HH-SCH-08'],
        changedBy: 'test',
        reason: 'synthetic: restore',
      })
    }
    // A canceled visit ends its reservations: every tap is refused.
    await sql`UPDATE work.visits SET state = 'canceled', version = version + 1 WHERE id = ${visitId}`.execute(t.db)
    expect((await tap('cy', visitId, 'on-my-way')).statusCode).toBe(403)
    expect((await myDay('cy')).visits.map((v) => v.visitId)).not.toContain(visitId)
  })
})

describe('[HH-WORK-06][T47] Arrived and Finished per worker; the Owner corrects, keeping the original', () => {
  it('[HH-WORK-06][T47][OWN-DEC-69][OWN-DEC-149][RULE-SAFETY-GATES] two workers: separate records, Arrived never starts work, the visit completes when both finished', async () => {
    const p = await project()
    const jobId = await approve(p)
    const visitId = await fixtureVisit(p, jobId, today(), ['ann', 'ben'])
    const jobBefore = await t.db
      .selectFrom('work.jobs')
      .select('operational_state')
      .where('id', '=', jobId)
      .executeTakeFirstOrThrow()

    expect((await tap('ann', visitId, 'on-my-way')).statusCode).toBe(200)
    // Ben still at the shop: On my way records his own departure only (no second move, no second event).
    const benLeaves = await tap('ben', visitId, 'on-my-way')
    expect(benLeaves.json()).toMatchObject({ recorded: true, visit: { state: 'en_route', next: 'arrived' } })
    const arrived = await tap('ann', visitId, 'arrived')
    expect(arrived.json()).toMatchObject({ recorded: true, visit: { state: 'arrived', next: 'finished' } })
    // Alone on site, Ann is asked for nothing between Arrived and Finished (OWN-DEC-149).
    const alone = (await myDay('ann')).visits.find((v) => v.visitId === visitId) as Item
    expect(alone.actions).toEqual({ onMyWay: false, arrived: false, finished: true })
    // Arrived starts nothing: the job's state is unchanged (the Start Work gate stays the start route's).
    expect(
      await t.db.selectFrom('work.jobs').select('operational_state').where('id', '=', jobId).executeTakeFirstOrThrow(),
    ).toEqual(jobBefore)
    expect(codes((await tap('ben', visitId, 'finished')).body)).toEqual([['visit', 'ARRIVED_FIRST']])
    expect((await tap('ben', visitId, 'arrived')).statusCode).toBe(200)
    expect((await tap('ann', visitId, 'finished')).json()).toMatchObject({ visit: { state: 'arrived', next: 'done' } })
    const done = await tap('ben', visitId, 'finished')
    expect(done.json()).toMatchObject({ recorded: true, visit: { state: 'completed', next: 'done' } })
    const stamps = await t.db
      .selectFrom('work.time_stamps')
      .select(['staff_user_id', 'kind', 'job_id'])
      .where('visit_id', '=', visitId)
      .orderBy('recorded_at')
      .execute()
    expect(stamps).toEqual([
      { staff_user_id: ids.ann, kind: 'arrived', job_id: jobId },
      { staff_user_id: ids.ben, kind: 'arrived', job_id: jobId },
      { staff_user_id: ids.ann, kind: 'finished', job_id: jobId },
      { staff_user_id: ids.ben, kind: 'finished', job_id: jobId },
    ])
    // The customer's timeline shows On the way and Arrived once each, never per worker.
    const timeline = (await customerGet(p, 'overview')).timeline?.map((e) => e.kind) ?? []
    expect(timeline.filter((k) => k === 'on_the_way')).toHaveLength(1)
    expect(timeline.filter((k) => k === 'arrived')).toHaveLength(1)
    // The Owner's view: both recorded, durations from the server's times, nothing flagged.
    const times = await staffGet('owner', `/api/v1/staff/visits/${visitId}/timestamps`)
    expect(times.statusCode, times.body).toBe(200)
    const body = times.json<{ workers: { staffUserId: string; flagged: boolean; arrived: { status: string } }[] }>()
    expect(body.workers.map((w) => [w.staffUserId, w.arrived.status, w.flagged])).toEqual([
      [ids.ann, 'recorded', false],
      [ids.ben, 'recorded', false],
    ])
    // Only the Owner sees and corrects them.
    expect((await staffGet('office', `/api/v1/staff/visits/${visitId}/timestamps`)).statusCode).toBe(403)
    expect((await staffGet('ann', `/api/v1/staff/visits/${visitId}/timestamps`)).statusCode).toBe(403)
  })

  it('[HH-WORK-06][T47] a forgotten Finished is flagged, never invented; the correction keeps the original and the reason; the CSV has times only', async () => {
    const p = await project()
    const jobId = await approve(p)
    const visitId = await fixtureVisit(p, jobId, day(-1), ['ann', 'ben'])
    // Yesterday's taps, written the way the tap routes write them (see the header): Ben forgot Finished.
    await withTx(t.db, async (tx) => {
      const v = await tx.selectFrom('work.visits').select('version').where('id', '=', visitId).executeTakeFirstOrThrow()
      await tx
        .insertInto('work.visit_departures')
        .values({ visit_id: visitId, staff_user_id: ids.ann, moved_visit: true })
        .execute()
      await tx
        .updateTable('work.visits')
        .set({ state: 'en_route', version: v.version + 1 })
        .where('id', '=', visitId)
        .execute()
      for (const who of ['ann', 'ben'] as const)
        await tx
          .insertInto('work.time_stamps')
          .values({
            visit_id: visitId,
            project_id: p.projectId,
            job_id: jobId,
            staff_user_id: ids[who],
            kind: 'arrived',
          })
          .execute()
      await tx
        .updateTable('work.visits')
        .set({ state: 'arrived', version: v.version + 2 })
        .where('id', '=', visitId)
        .execute()
      await tx
        .insertInto('work.time_stamps')
        .values({ visit_id: visitId, project_id: p.projectId, job_id: jobId, staff_user_id: ids.ann, kind: 'finished' })
        .execute()
    })
    // The service day ended: Ben can no longer tap it; the missing value is flagged.
    expect((await tap('ben', visitId, 'finished')).statusCode).toBe(403)
    const url = `/api/v1/staff/visits/${visitId}/timestamps`
    const flagged = (await staffGet('owner', url)).json<{
      dayEnded: boolean
      workers: {
        staffUserId: string
        flagged: boolean
        durationMinutes: number | null
        arrived: { status: string; at: string; recordedAt: string }
        finished: {
          status: string
          at: string | null
          recordedAt: string | null
          corrections: { reason: string; previousAt: string | null; correctedBy: string | null }[]
        }
      }[]
      actions: { correct: boolean; export: boolean }
    }>()
    expect(flagged.dayEnded).toBe(true)
    expect(flagged.actions).toEqual({ correct: true, export: true })
    const ben = flagged.workers.find((w) => w.staffUserId === ids.ben)
    expect(ben).toMatchObject({ flagged: true, durationMinutes: null, finished: { status: 'missing', at: null } })

    // The Owner's corrections: in the past, Finished after Arrived, each with a reason (Ben tapped Arrived late).
    const now = Date.now()
    const benArrived = await staffWrite('owner', 'POST', `${url}/corrections`, {
      staffUserId: ids.ben,
      kind: 'arrived',
      at: new Date(now - 120 * 60_000).toISOString(),
      reason: 'Synthetic: tapped Arrived late',
    })
    expect(benArrived.statusCode, benArrived.body).toBe(200)
    const bad = await staffWrite('owner', 'POST', `${url}/corrections`, {
      staffUserId: ids.ben,
      kind: 'finished',
      at: new Date(now - 121 * 60_000).toISOString(),
      reason: 'Synthetic: forgot to tap Finished',
    })
    expect(bad.statusCode).toBe(400)
    expect(codes(bad.body)).toEqual([['body.at', 'FINISHED_BEFORE_ARRIVED']])
    const future = await staffWrite('owner', 'POST', `${url}/corrections`, {
      staffUserId: ids.ben,
      kind: 'finished',
      at: new Date(now + 3_600_000).toISOString(),
      reason: 'Synthetic: a future time',
    })
    expect(codes(future.body)).toEqual([['body.at', 'IN_FUTURE']])
    expect(
      (
        await staffWrite('office', 'POST', `${url}/corrections`, {
          staffUserId: ids.ben,
          kind: 'finished',
          at: new Date(now - 30 * 60_000).toISOString(),
          reason: 'Synthetic: not the Office',
        })
      ).statusCode,
    ).toBe(403)
    const fixed = await staffWrite('owner', 'POST', `${url}/corrections`, {
      staffUserId: ids.ben,
      kind: 'finished',
      at: new Date(now - 30 * 60_000).toISOString(),
      reason: 'Synthetic: forgot to tap Finished',
    })
    expect(fixed.statusCode, fixed.body).toBe(200)
    const after = fixed.json<typeof flagged>().workers.find((w) => w.staffUserId === ids.ben)
    expect(after).toMatchObject({
      flagged: false,
      durationMinutes: 90,
      arrived: { status: 'corrected', recordedAt: ben?.arrived.recordedAt },
      finished: {
        status: 'corrected',
        recordedAt: null,
        corrections: [{ reason: 'Synthetic: forgot to tap Finished', previousAt: null, correctedBy: NAMES.owner }],
      },
    })
    // Supplying the last missing Finished completed the visit (PROPOSED); the recorded taps are unchanged.
    expect((await visitState(visitId)).state).toBe('completed')
    // Correcting Ann's recorded Arrived keeps the recorded value beside the corrected one.
    const annRecorded = flagged.workers.find((w) => w.staffUserId === ids.ann)?.arrived.recordedAt as string
    const annFix = await staffWrite('owner', 'POST', `${url}/corrections`, {
      staffUserId: ids.ann,
      kind: 'arrived',
      at: new Date(new Date(annRecorded).getTime() - 5 * 60_000).toISOString(),
      reason: 'Synthetic: tapped after unloading',
    })
    expect(annFix.statusCode, annFix.body).toBe(200)
    const ann = annFix.json<typeof flagged>().workers.find((w) => w.staffUserId === ids.ann)
    expect(ann?.arrived).toMatchObject({ status: 'corrected', recordedAt: annRecorded })
    const audit = await t.db
      .selectFrom('platform.audit_events')
      .select(['reason', 'summary'])
      .where('action', '=', 'visit.correct_timestamp')
      .where('target_id', '=', visitId)
      .orderBy('seq')
      .execute()
    expect(audit.map((a) => a.reason)).toEqual([
      'Synthetic: tapped Arrived late',
      'Synthetic: forgot to tap Finished',
      'Synthetic: tapped after unloading',
    ])

    // The accountant's CSV: the Owner with a fresh sign-in; times and durations only, no pay.
    const range = { from: day(-1), to: day(-1), reason: 'Synthetic: monthly hours for the accountant' }
    expect((await staffWrite('office', 'POST', '/api/v1/staff/timestamps/exports', range)).statusCode).toBe(403)
    const noReason = await staffWrite('owner', 'POST', '/api/v1/staff/timestamps/exports', {
      from: day(-1),
      to: day(-1),
    })
    expect(noReason.statusCode).toBe(400)
    const res = await staffWrite('owner', 'POST', '/api/v1/staff/timestamps/exports', range)
    expect(res.statusCode, res.body).toBe(200)
    const file = res.json<{ filename: string; contentType: string; rows: number; csv: string }>()
    expect(file).toMatchObject({ contentType: 'text/csv', filename: `arrived-finished-${day(-1)}-to-${day(-1)}.csv` })
    const csv = { body: file.csv }
    const lines = csv.body.trim().split('\r\n')
    expect(lines[0]).toBe(
      'visit_date,time_zone,project_reference,visit_number,visit_purpose,worker_name,worker_id,arrived_local,' +
        'arrived_utc,arrived_status,finished_local,finished_utc,finished_status,duration_minutes,corrected',
    )
    const rows = lines.filter((l) => l.includes(p.reference))
    expect(rows).toHaveLength(2)
    expect(rows.find((r) => r.includes(ids.ben))).toMatch(/,corrected,90,yes$/)
    expect(csv.body).not.toMatch(/\$|pay|wage|overtime|deduction/i)
    expect(
      await t.db
        .selectFrom('platform.audit_events')
        .select(['summary', 'reason'])
        .where('action', '=', 'visit.export_timestamps')
        .where('actor_id', '=', ids.owner)
        .execute(),
    ).toEqual([{ summary: expect.objectContaining({ rows: file.rows }), reason: range.reason }])
    const tooLong = await staffWrite('owner', 'POST', '/api/v1/staff/timestamps/exports', {
      ...range,
      from: day(-400),
    })
    expect(codes(tooLong.body)).toEqual([['body.to', 'RANGE_TOO_LONG']])
  })
})

describe('[HH-SCH-08][HH-WORK-06][RULE-SAFETY-GATES] the database keeps the sequence honest', () => {
  it('[HH-SCH-08][HH-WORK-06] no state without its tap, no tap by someone not assigned, nothing edited or deleted', async () => {
    const p = await project()
    const jobId = await approve(p)
    const visitId = await fixtureVisit(p, jobId, today(), ['cy'])
    await expect(
      sql`UPDATE work.visits SET state = 'en_route', version = version + 1 WHERE id = ${visitId}`.execute(t.db),
    ).rejects.toThrow(/on the way only by an assigned worker/)
    await expect(
      sql`INSERT INTO work.visit_departures (visit_id, staff_user_id, moved_visit) VALUES (${visitId}, ${ids.ann}, true)`.execute(
        t.db,
      ),
    ).rejects.toThrow(/only a worker assigned/)
    await expect(
      sql`INSERT INTO work.time_stamps (visit_id, project_id, job_id, staff_user_id, kind)
          VALUES (${visitId}, ${p.projectId}, ${jobId}, ${ids.cy}, 'arrived')`.execute(t.db),
    ).rejects.toThrow(/once the visit is on the way/)
    expect((await tap('cy', visitId, 'on-my-way')).statusCode).toBe(200)
    expect((await tap('cy', visitId, 'arrived')).statusCode).toBe(200)
    await expect(
      sql`UPDATE work.visits SET state = 'completed', version = version + 1 WHERE id = ${visitId}`.execute(t.db),
    ).rejects.toThrow(/completed only with a Finished/)
    await expect(
      sql`UPDATE work.time_stamps SET recorded_at = now() WHERE visit_id = ${visitId}`.execute(t.db),
    ).rejects.toThrow()
    await expect(sql`DELETE FROM work.time_stamps WHERE visit_id = ${visitId}`.execute(t.db)).rejects.toThrow()
    await expect(sql`DELETE FROM work.visit_departures WHERE visit_id = ${visitId}`.execute(t.db)).rejects.toThrow()
  })
})

describe('[HH-DATA-08][HH-PKT-06][HH-OFF-09] the seam of My Day, the packet acknowledgment and the loadout (TSK-0070, TSK-0071, TSK-0072)', () => {
  it('[HH-DATA-08][T44][HH-PKT-06][T45][HH-SCH-08] a loadout shortage is a critical packet change that ends the acknowledgment; My Day says so; the taps never depend on it and release nothing', async () => {
    // The real imported lists (business configuration, not synthetic data), before this job's packet first pins them.
    await syncLoadouts(t.db, loadLoadoutSeed())
    const p = await project()
    const lost = await withdrawnEstimate(p)
    const jobId = await approve(p)
    // Ben's first free early slot of today, so On my way is open whenever the suite runs.
    const visitId = await fixtureVisit(p, jobId, today(), ['ben'])
    const item = async () => {
      const v = (await myDay('ben')).visits.find((x) => x.visitId === visitId)
      if (!v?.readiness) throw new Error('the visit and its readiness are on My Day')
      return v as Item & { readiness: NonNullable<Item['readiness']> }
    }
    const before = await item()
    expect(before.readiness.acknowledgment).toBe('required')
    expect(before.readiness.blockers).toEqual([
      { code: 'packet_not_viewed', count: 1 },
      { code: 'packet_not_acknowledged', count: 1 },
      { code: 'loadout_not_confirmed', count: 1 },
    ])

    // Ben acknowledges the current version himself (which also records his view).
    type Packet = { packet: { version: number; contentSha256: string }; acknowledgments: { mine: { state: string } } }
    const packet = async () => (await staffGet('ben', `/api/v1/staff/jobs/${jobId}/packet`)).json<Packet>()
    const first = await packet()
    const acked = await staffWrite('ben', 'POST', `/api/v1/staff/jobs/${jobId}/packet/acknowledgments`, {
      version: first.packet.version,
      contentSha256: first.packet.contentSha256,
    })
    expect(acked.statusCode, acked.body).toBe(201)
    const ready = await item()
    expect(ready.readiness.acknowledgment).toBe('acknowledged')
    expect(ready.readiness.blockers).toEqual([{ code: 'loadout_not_confirmed', count: 1 }])

    // A required item is missing: the task block and the critical packet version commit together, ending his review.
    const loadout = (await staffGet('ben', `/api/v1/staff/jobs/${jobId}/loadout`)).json<{
      packages: { workPackageId: string; groups: { items: { key: string }[] }[] }[]
    }>()
    const pkg = loadout.packages[0]
    const itemKey = pkg?.groups.flatMap((g) => g.items)[0]?.key
    if (!pkg || !itemKey) throw new Error('the DW-01 loadout lists items')
    const short = await staffWrite('ben', 'POST', `/api/v1/staff/jobs/${jobId}/loadout/checks`, {
      workPackageId: pkg.workPackageId,
      items: [{ key: itemKey, status: 'missing', note: 'Synthetic: left at the shop' }],
    })
    expect(short.statusCode, short.body).toBe(201)
    const after = await packet()
    expect(after.packet.version).toBeGreaterThan(first.packet.version)
    expect(after.acknowledgments.mine.state).toBe('invalidated')
    expect(
      await t.db
        .selectFrom('work.job_packet_acknowledgment_invalidations')
        .select(['reason', 'version'])
        .where('job_id', '=', jobId)
        .execute(),
    ).toEqual([{ reason: 'critical_change', version: after.packet.version }])
    const blocked = await item()
    expect(blocked.readiness.acknowledgment).toBe('invalidated')
    // The task block is listed once, as a loadout shortage, never also as a job-level hold; a blocked package is
    // blocked, not also "not confirmed" (@handyhub/domain loadoutReadiness).
    expect(blocked.readiness.blockers).toEqual([
      { code: 'packet_critical_change', count: 1 },
      { code: 'packet_acknowledgment_ended', count: 1 },
      { code: 'loadout_blocked', count: 1 },
    ])

    // Readiness is not the Start Work check: On my way and Arrived are still the worker's own taps (HH-SCH-08,
    // HH-WORK-06), and they neither restore the acknowledgment nor release the block.
    expect(blocked.actions.onMyWay).toBe(true)
    expect((await tap('ben', visitId, 'on-my-way')).statusCode).toBe(200)
    expect((await tap('ben', visitId, 'arrived')).statusCode).toBe(200)
    expect((await visitState(visitId)).state).toBe('arrived')
    const arrived = await item()
    expect(arrived.readiness.acknowledgment).toBe('invalidated')
    expect(arrived.readiness.blockers.map((b) => b.code)).toContain('loadout_blocked')

    // Reviewing the current version again (the taps made a new, non-critical one: the visit's state) restores the
    // acknowledgment; it never releases the block (RULE-SAFETY-GATES).
    const current = await packet()
    expect(current.packet.version).toBeGreaterThan(after.packet.version)
    const again = await staffWrite('ben', 'POST', `/api/v1/staff/jobs/${jobId}/packet/acknowledgments`, {
      version: current.packet.version,
      contentSha256: current.packet.contentSha256,
    })
    expect(again.statusCode, again.body).toBe(201)
    const reviewed = await item()
    expect(reviewed.readiness.acknowledgment).toBe('acknowledged')
    expect(reviewed.readiness.blockers).toEqual([{ code: 'loadout_blocked', count: 1 }])
    expect(
      (
        await t.db
          .selectFrom('work.holds')
          .select('state')
          .where('kind', '=', 'task_block')
          .where('project_id', '=', p.projectId)
          .executeTakeFirstOrThrow()
      ).state,
    ).toBe('open')

    // TSK-0100: in a privacy request every one of these field records is a retained job record, and deleting the
    // project's estimate never accepted (the same erasure as Confirm Delete) leaves them as they are.
    const count = async (
      table:
        | 'work.visit_departures'
        | 'work.time_stamps'
        | 'work.time_stamp_corrections'
        | 'work.work_package_loadouts'
        | 'work.loadout_checks'
        | 'work.job_packet_acknowledgments'
        | 'work.job_packet_acknowledgment_invalidations',
    ) =>
      Number(
        (
          await sql<{ n: string }>`SELECT count(*)::text AS n FROM ${sql.table(table)} WHERE ${sql.ref(
            table === 'work.visit_departures' || table === 'work.time_stamps' || table === 'work.time_stamp_corrections'
              ? 'visit_id'
              : 'job_id',
          )} = ${table.startsWith('work.visit') || table.startsWith('work.time') ? visitId : jobId}`.execute(t.db)
        ).rows[0]?.n,
      )
    const fieldTables = [
      'work.visit_departures',
      'work.time_stamps',
      'work.time_stamp_corrections',
      'work.work_package_loadouts',
      'work.loadout_checks',
      'work.job_packet_acknowledgments',
      'work.job_packet_acknowledgment_invalidations',
    ] as const
    const fieldRows = async () => {
      const out: number[] = []
      for (const table of fieldTables) out.push(await count(table))
      return out
    }
    const field = await fieldRows()
    // One departure, one Arrived, no correction, one pinned list, one statement, two acknowledgments, one end.
    expect(field).toEqual([1, 1, 0, 1, 1, 2, 1])
    const owner = await t.db
      .selectFrom('intake.requests as r')
      .innerJoin('crm.projects as pr', 'pr.id', 'r.project_id')
      .select(['pr.customer_id', 'r.contact_id'])
      .where('r.id', '=', p.requestId)
      .executeTakeFirstOrThrow()
    const plan = await customerPlan(t.db, {
      customerId: owner.customer_id,
      contactId: owner.contact_id,
      accountIds: [],
    })
    const n = async (q: string) => Number((await sql<{ n: string }>`${sql.raw(q)}`.execute(t.db)).rows[0]?.n)
    const others =
      1 +
      (await n(`SELECT count(*)::text AS n FROM work.visits WHERE project_id = '${p.projectId}'`)) +
      (await n(`SELECT count(*)::text AS n FROM work.visit_changes WHERE project_id = '${p.projectId}'`)) +
      (await n(
        `SELECT ((SELECT count(*) FROM work.job_packets WHERE job_id = '${jobId}')
          + (SELECT count(*) FROM work.job_packet_views WHERE job_id = '${jobId}')
          + (SELECT count(*) FROM work.job_packet_exports WHERE job_id = '${jobId}'))::text AS n`,
      )) +
      (await n(
        `SELECT count(*)::text AS n FROM platform.message_deliveries d JOIN work.visits v ON v.id::text = d.record_id
          WHERE d.record_type = 'visit' AND d.message_key = 'reminder.appointment' AND v.project_id = '${p.projectId}'`,
      ))
    expect(plan.items).toContainEqual(
      expect.objectContaining({
        category: 'job_records',
        disposition: 'retain',
        count: others + field.reduce((a, b) => a + b, 0),
        reason: 'active_record',
      }),
    )
    // The loadout task block is a hold: an open one is a safety record kept for it.
    expect(plan.items).toContainEqual(
      expect.objectContaining({ category: 'safety_records', disposition: 'retain', count: 1, reason: 'hold' }),
    )
    // While the task block is open it is an open hold on the project, which keeps even an estimate never accepted
    // (the open_holds check of TSK-0100, unchanged: PROPOSED in OQ-LOADOUT-DETAILS). The Owner cancels it as entered
    // in error; then the estimate is deletable.
    expect(plan.deletable.estimates).toEqual([])
    const taskBlock = await t.db
      .selectFrom('work.holds')
      .select(['id', 'version'])
      .where('kind', '=', 'task_block')
      .where('project_id', '=', p.projectId)
      .executeTakeFirstOrThrow()
    const canceled = await staffWrite(
      'owner',
      'POST',
      `/api/v1/staff/loadout-blocks/${taskBlock.id}/actions/cancel`,
      { reason: 'Synthetic: it was in the other bag' },
      taskBlock.version,
    )
    expect(canceled.statusCode, canceled.body).toBe(200)
    const cleared = await customerPlan(t.db, {
      customerId: owner.customer_id,
      contactId: owner.contact_id,
      accountIds: [],
    })
    expect(cleared.deletable.estimates).toEqual([expect.objectContaining({ id: lost.estimateId })])
    // The block's end is itself a critical packet change (holds section): Ben's second review ends too.
    const kept = await fieldRows()
    expect(kept).toEqual([1, 1, 0, 1, 1, 2, 2])
    const done = await withTx(t.db, (tx) =>
      reapplyDeletions(
        tx,
        [
          {
            id: randomUUID(),
            recordType: 'estimate',
            recordId: lost.estimateId,
            recordRef: lost.number,
            reason: 'Synthetic: never accepted.',
            decidedAt: new Date().toISOString(),
          },
        ],
        { requestId: `req-${key('erase')}` },
      ),
    )
    expect(done).toEqual([expect.objectContaining({ outcome: 'reapplied', blockers: [] })])
    expect(
      await t.db.selectFrom('estimating.estimates').select('id').where('id', '=', lost.estimateId).execute(),
    ).toEqual([])
    expect(await fieldRows()).toEqual(kept)
  })
})
