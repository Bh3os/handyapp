// Field photos, sharing with the customer and photo publication permissions against PostgreSQL 16 and the fake object
// storage (TSK-0076; HH-QA-05, HH-PORT-11, HH-PRIV-02, HH-DATA-07, HH-STAFF-05, HH-SEC-05, T24, T57, T68, ENT-Photo,
// ENT-ConsentPreference, OWN-DEC-106, OWN-DEC-109, RULE-SERVER-AUTHZ). Staff, customers, addresses, images and evidence
// references are synthetic (RULE-SYNTHETIC-DATA); the estimate terms and the photo publication notice versions recorded
// below are fixtures of this throwaway database, never the owner's.
// - Visits are fixtures in the first hours of today's local date (as in start-work.test.ts), so On my way is open at
//   any hour the suite runs; dates come from localDateOf(now, America/Kentucky/Louisville), never a weekday.
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
import { fieldPhotoProcessAutomation } from '../../src/modules/field-photos/index.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { startCustomerSession } from '../../src/modules/identity/customer-sessions.js'
import { readCodeKey, type CodeKeySettings } from '../../src/modules/identity/index.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
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
  CODE_HASH_KEY: ['synthetic', 'start', 'work', 'code', 'key', 'for', 'tests', 'only', '0076'].join('-'),
})
const pw = ['synthetic', 'field', 'photo', 'passphrase', '76'].join(' ')
const PEOPLE = ['owner', 'office', 'estimator', 'ann', 'ben', 'cara'] as const
type Person = (typeof PEOPLE)[number]

let t: TestDatabase
const storage = new FakeObjectStorage()
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
    headers: { 'x-forwarded-for': '198.51.100.176' },
    payload: { email: `${p}-photos@example.test`, password: pw },
  })
  expect(res.statusCode, res.body).toBe(200)
  const cookie = String(res.headers['set-cookie']).split(';')[0] as string
  const session = await app.inject({ method: 'GET', url: '/api/v1/staff/auth/session', headers: { cookie } })
  cookies[p] = cookie
  csrf[p] = session.json<{ csrfToken: string }>().csrfToken
}

let seq = 0
const key = () => `synthetic-photos-${String(++seq).padStart(6, '0')}-${randomUUID()}`
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
  wide = createDb(t.url, { max: 8, applicationName: 'field-photos-test' })
  await syncServices(t.db, loadServiceSeed())
  await syncSops(t.db, loadSopSeed())
  await syncLoadouts(t.db, loadLoadoutSeed())
  app = await buildApp({
    config: testConfig({ TRUST_PROXY_HOPS: '1' }),
    api: { db: wide, codeKey: KEY, storage },
  })
  const hash = await hashPassword(pw)
  await withTx(t.db, async (tx) => {
    for (const p of PEOPLE) {
      const role = p === 'ann' || p === 'ben' || p === 'cara' ? 'worker' : p
      const user = await createStaffUser(tx, {
        email: `${p}-photos@example.test`,
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
      description: 'Synthetic field photo project.',
      answers: [],
      property: {
        street: `${++seq} Synthetic Photo Lane`,
        city: 'Testville',
        state: 'ky',
        zip: '40000',
        propertyType: 'house',
      },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'site_visit',
      contact: {
        fullName: 'Synthetic Photo Customer',
        email: `photos-${seq}-${randomUUID().slice(0, 8)}@example.test`,
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
      'x-forwarded-for': `2001:db8:76:${++ip}::1`,
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
      fullName: 'Synthetic Photo Customer',
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
// --- Field photo helpers ---------------------------------------------------------------------------------------------

type StaffPhoto = {
  id: string
  workPackageId: string
  phase: 'before' | 'after'
  areaLabel: string | null
  pairOf: string | null
  state: string
  visibility: string
  version: number
  url: string | null
  publication: { channel: string; granted: boolean; noticeVersion: string | null }[]
  actions: { share: boolean; stopSharing: boolean; recordPublication: boolean }
}
type JobPhotos = {
  photos: StaffPhoto[]
  workPackages: { workPackageId: string; serviceCode: string }[]
  uploadVisits: { visitId: string; after: boolean }[]
  publicationNotice: string | null
}
type Tab = {
  photos: { received: number; processing: number; failed: number }
  yours: unknown[]
  shared: {
    service: string
    before: { id: string; url: string | null } | null
    after: { id: string; url: string | null } | null
  }[]
  linkSeconds: number
}
let shot = 1000
function fieldPhoto(who: Person, visitId: string, q: Record<string, string>) {
  return app.inject({
    method: 'POST',
    url: `/api/v1/staff/visits/${visitId}/field-photos?${new URLSearchParams(q).toString()}`,
    payload: png(++shot),
    headers: { cookie: cookies[who], 'x-csrf-token': csrf[who], 'content-type': 'image/png' },
  })
}
async function jobPhotos(who: Person, jobId: string): Promise<JobPhotos> {
  const res = await staffGet(who, `/api/v1/staff/jobs/${jobId}/photos`)
  expect(res.statusCode, res.body).toBe(200)
  return res.json<JobPhotos>()
}
const byId = (v: JobPhotos, id: string) => v.photos.find((p) => p.id === id) as StaffPhoto
async function processPhotos() {
  const w = createWorker({ db: t.db, registry: createAutomationRegistry([fieldPhotoProcessAutomation(storage)]) })
  for (let i = 0; i < 20; i++) {
    const r = await w.runOnce()
    if (r.dispatched + r.succeeded + r.retried + r.failed + r.cancelled === 0) return
  }
}
const customerGet = (cookie: string | undefined, url: string) =>
  app.inject({ method: 'GET', url: `/api/v1${url}`, headers: cookie ? { cookie } : {} })
const share = (who: Person, photoId: string, version: number, stop = false) =>
  staffWrite(who, `/api/v1/staff/field-photos/${photoId}/actions/${stop ? 'stop-sharing' : 'share'}`, {}, version)
const publish = (who: Person, photoId: string, body: Record<string, unknown>) =>
  staffWrite(who, `/api/v1/staff/field-photos/${photoId}/publication-permissions`, {
    purpose: 'marketing',
    channel: 'website',
    evidenceKind: 'signed_form',
    evidenceReference: 'Synthetic: signed release form on file',
    ...body,
  })
const strip = (body: string) => body.replace(/"requestId":"[^"]+"/, '')
const NOTICE = 'photo-publication-notice-test-1'

describe('[TSK-0076] field photos: documentation, customer sharing and marketing publication are separate', () => {
  let p: Project
  let other: Project
  let jobId: string
  let visitId: string
  let wp: string
  let before: string
  let after: string
  let internalAfter: string

  it('[HH-PRIV-02][HH-STAFF-05][ENT-Photo] before and after photos are internal documentation, quarantined until processed', async () => {
    p = await project()
    other = await project()
    jobId = await approve(p)
    visitId = await fixtureVisit(p, jobId, ['ann'])
    const version = await prepare('ann', visitId, jobId)
    wp = (await gate('ann', visitId)).workPackages[0]?.workPackageId as string
    // After photos follow the worker's own Start Work (OWN-DEC-109 step 6).
    const early = await fieldPhoto('ann', visitId, { workPackageId: wp, phase: 'after' })
    expect(early.statusCode, early.body).toBe(409)
    expect(codesOf(early)).toEqual(['START_WORK_FIRST'])
    const started = await start('ann', visitId, version)
    expect(started.statusCode, started.body).toBe(201)

    const listed = await jobPhotos('ann', jobId)
    expect(listed.photos).toHaveLength(1)
    before = listed.photos[0]?.id as string
    expect(listed.photos[0]).toMatchObject({ phase: 'before', visibility: 'internal_operational', pairOf: null })
    expect(listed.uploadVisits).toEqual([{ visitId, visitNumber: expect.any(Number), after: true }])

    const paired = await fieldPhoto('ann', visitId, {
      workPackageId: wp,
      phase: 'after',
      areaLabel: 'Synthetic: hallway wall, left of the door',
      pairOf: before,
    })
    expect(paired.statusCode, paired.body).toBe(201)
    after = paired.json<{ photoId: string }>().photoId
    const lone = await fieldPhoto('ann', visitId, { workPackageId: wp, phase: 'after' })
    expect(lone.statusCode, lone.body).toBe(201)
    internalAfter = lone.json<{ photoId: string }>().photoId
    // A pair is a before photo of the same work package; before photos have no pair.
    const badPair = await fieldPhoto('ann', visitId, { workPackageId: wp, phase: 'after', pairOf: internalAfter })
    expect(badPair.statusCode).toBe(400)
    expect(codesOf(badPair)).toEqual(['unknown_pair'])
    expect(codesOf(await fieldPhoto('ann', visitId, { workPackageId: wp, phase: 'before', pairOf: before }))).toEqual([
      'pair_after_only',
    ])

    const office = await jobPhotos('office', jobId)
    expect(byId(office, after)).toMatchObject({
      phase: 'after',
      pairOf: before,
      areaLabel: 'Synthetic: hallway wall, left of the door',
      state: 'quarantined',
      visibility: 'internal_operational',
      url: null,
      publication: [],
      actions: { share: false, stopSharing: false },
    })
    // Office does not take photos: no upload visit for them.
    expect(office.uploadVisits).toEqual([])
    const early2 = await share('office', after, byId(office, after).version)
    expect(early2.statusCode, early2.body).toBe(409)
    expect(codesOf(early2)).toEqual(['PHOTO_NOT_READY'])

    await processPhotos()
    const ready = await jobPhotos('office', jobId)
    for (const id of [before, after, internalAfter]) {
      const photo = byId(ready, id)
      expect(photo).toMatchObject({ state: 'ready', visibility: 'internal_operational', actions: { share: true } })
      expect(storage.resolveSignedUrl(photo.url as string)).toMatchObject({ ok: true, method: 'GET' })
    }
    // The before-photo requirement of the gate still counts the before photo only.
    expect((await gate('ann', visitId)).workPackages[0]?.beforePhotos).toBe(1)
  })

  it('[HH-PORT-11][HH-QA-05][HH-DATA-07][T57][T24] the customer reaches only what staff shared; internal photos are not found by URL or ID', async () => {
    const tab = async (cookie = p.cookie) => {
      const res = await customerGet(cookie, `/customer/projects/${p.reference}/photos`)
      expect(res.statusCode, res.body).toBe(200)
      return res
    }
    const empty = await tab()
    expect(empty.json<Tab>().shared).toEqual([])
    for (const id of [before, after, internalAfter]) expect(empty.body).not.toContain(id)
    // Direct access to an internal photo is the same NOT_FOUND as an unknown ID (OWN-DEC-106).
    const internal = await customerGet(p.cookie, `/customer/projects/${p.reference}/photos/${after}`)
    const unknown = await customerGet(p.cookie, `/customer/projects/${p.reference}/photos/${randomUUID()}`)
    expect(internal.statusCode).toBe(404)
    expect(strip(internal.body)).toBe(strip(unknown.body))
    expect((await customerGet(p.cookie, `/customer/projects/${p.reference}/photos/not-an-id`)).statusCode).toBe(404)

    // Only Owner or Office share (media.share_with_customer); a worker cannot.
    const v = await jobPhotos('office', jobId)
    expect((await share('ann', before, byId(v, before).version)).statusCode).toBe(403)
    expect((await share('office', before, byId(v, before).version + 7)).statusCode).toBe(409)
    for (const id of [before, after]) {
      const res = await share('office', id, byId(v, id).version)
      expect(res.statusCode, res.body).toBe(200)
      expect(res.json()).toMatchObject({ photoId: id, shared: true })
    }
    const again = await share('office', before, byId(v, before).version + 1)
    expect(codesOf(again)).toEqual(['PHOTO_ALREADY_SHARED'])

    const shown = await tab()
    const body = shown.json<Tab>()
    expect(body.shared).toHaveLength(1)
    expect(body.shared[0]).toMatchObject({ service: 'Patching & Repair', before: { id: before }, after: { id: after } })
    expect(body.linkSeconds).toBe(300)
    for (const link of [body.shared[0]?.before?.url, body.shared[0]?.after?.url]) {
      const grant = storage.resolveSignedUrl(link as string)
      expect(grant).toMatchObject({ ok: true, method: 'GET' })
      expect(Number(new URL(link as string).searchParams.get('expires')) - Date.now() / 1000).toBeLessThanOrEqual(300)
    }
    // Never the unshared photo, the worker's label, a staff name, a visibility class or marketing state. (A signed URL
    // names its own object; knowing a key grants nothing without the signature, HH-SEC-05.)
    for (const secret of [internalAfter, 'hallway', 'Synthetic ann', 'internal_operational', 'customer_shared'])
      expect(shown.body).not.toContain(secret)
    expect(shown.body).not.toMatch(/publication|marketing/i)

    const opened = await customerGet(p.cookie, `/customer/projects/${p.reference}/photos/${after}`)
    expect(opened.statusCode, opened.body).toBe(200)
    expect(opened.headers['cache-control']).toContain('no-store')
    const link = opened.json<{ id: string; url: string; expiresInSeconds: number }>()
    expect(link).toMatchObject({ id: after, expiresInSeconds: 300 })
    expect(storage.resolveSignedUrl(link.url)).toEqual({ ok: true, method: 'GET', key: `jobs/after-photos/${after}` })
    expect((await customerGet(p.cookie, `/customer/projects/${p.reference}/photos/${internalAfter}`)).statusCode).toBe(
      404,
    )

    // Another customer: not through their own project, not through this one; no session: 401.
    expect((await customerGet(other.cookie, `/customer/projects/${other.reference}/photos/${after}`)).statusCode).toBe(
      404,
    )
    expect((await customerGet(other.cookie, `/customer/projects/${p.reference}/photos/${after}`)).statusCode).toBe(404)
    const theirs = await customerGet(other.cookie, `/customer/projects/${other.reference}/photos`)
    expect(theirs.json<Tab>().shared).toEqual([])
    expect(theirs.body).not.toContain(after)
    expect((await customerGet(undefined, `/customer/projects/${p.reference}/photos/${after}`)).statusCode).toBe(401)
    // Staff routes are never reachable with a customer session.
    expect((await customerGet(p.cookie, `/staff/jobs/${jobId}/photos`)).statusCode).toBe(401)

    // Sharing never grants marketing use.
    const staffView = await jobPhotos('owner', jobId)
    expect(byId(staffView, after)).toMatchObject({ visibility: 'customer_shared', publication: [] })

    // Stop sharing (PROPOSED): the customer loses it at once; the other photo of the pair stays.
    const stopped = await share('office', before, byId(staffView, before).version, true)
    expect(stopped.statusCode, stopped.body).toBe(200)
    expect((await customerGet(p.cookie, `/customer/projects/${p.reference}/photos/${before}`)).statusCode).toBe(404)
    expect((await tab()).json<Tab>().shared).toEqual([
      { service: 'Patching & Repair', before: null, after: expect.objectContaining({ id: after }) },
    ])
    const audits = await t.db
      .selectFrom('platform.audit_events')
      .select(['action', 'target_id', 'actor_id'])
      .where('action', 'in', ['media.share_with_customer', 'media.stop_sharing'])
      .where('target_id', 'in', [before, after])
      .orderBy('seq')
      .execute()
    expect(audits).toEqual([
      { action: 'media.share_with_customer', target_id: before, actor_id: ids.office },
      { action: 'media.share_with_customer', target_id: after, actor_id: ids.office },
      { action: 'media.stop_sharing', target_id: before, actor_id: ids.office },
    ])
  })

  it('[HH-PRIV-02][HH-QA-05][T57] marketing use needs its own recorded permission, only from the Owner, under the notice', async () => {
    const granted = { granted: true, noticeVersion: NOTICE }
    // Office shares, but never marks for marketing (media.mark_marketing_eligible: the Owner only).
    expect((await publish('office', after, granted)).statusCode).toBe(403)
    // The publication notice is NOT CONFIGURED (migration 0080): nothing is recorded.
    const none = await publish('owner', after, granted)
    expect(none.statusCode, none.body).toBe(503)
    expect(none.json<{ error: { code: string } }>().error.code).toBe('NOT_CONFIGURED')
    expect(codesOf(none)).toEqual(['PUBLICATION_NOTICE_NOT_CONFIGURED'])
    expect((await jobPhotos('owner', jobId)).publicationNotice).toBeNull()

    await recordPolicyVersion(t.db, {
      key: 'media.publication_notice',
      value: { documentId: NOTICE },
      sourceIds: ['TEST-SYNTHETIC'],
      changedBy: 'test',
      reason: 'synthetic test configuration',
    })
    expect((await jobPhotos('owner', jobId)).publicationNotice).toBe(NOTICE)
    const wrong = await publish('owner', after, { granted: true, noticeVersion: 'photo-publication-notice-test-0' })
    expect(wrong.statusCode).toBe(400)
    expect(codesOf(wrong)).toEqual(['NOTICE_VERSION_NOT_CURRENT'])
    expect((await publish('owner', after, { ...granted, evidenceReference: ' ' })).statusCode).toBe(400)
    expect((await publish('owner', after, { granted: true })).statusCode).toBe(400)
    expect((await publish('owner', after, { ...granted, channel: 'social' })).statusCode).toBe(400)

    const rec = await publish('owner', after, granted)
    expect(rec.statusCode, rec.body).toBe(201)
    expect(rec.json()).toMatchObject({ photoId: after, channel: 'website', granted: true, marketingEligible: true })
    expect(codesOf(await publish('owner', after, granted))).toEqual(['PUBLICATION_ALREADY_GRANTED'])
    // The internal photo can carry a permission too, and stays internal: publication never shares.
    expect((await publish('owner', internalAfter, granted)).statusCode).toBe(201)
    const v = await jobPhotos('owner', jobId)
    expect(byId(v, after).publication).toEqual([
      expect.objectContaining({ channel: 'website', granted: true, noticeVersion: NOTICE }),
    ])
    expect(byId(v, internalAfter).visibility).toBe('internal_operational')
    expect((await customerGet(p.cookie, `/customer/projects/${p.reference}/photos/${internalAfter}`)).statusCode).toBe(
      404,
    )
    expect(byId(v, before).publication).toEqual([])

    // The customer's withdrawal stops new use at once.
    const withdrawn = await publish('owner', after, { granted: false, evidenceKind: 'email' })
    expect(withdrawn.statusCode, withdrawn.body).toBe(201)
    expect(withdrawn.json()).toMatchObject({ granted: false, marketingEligible: false })
    expect(byId(await jobPhotos('owner', jobId), after).publication).toEqual([
      expect.objectContaining({ channel: 'website', granted: false, noticeVersion: null }),
    ])
    expect(codesOf(await publish('owner', after, { granted: false }))).toEqual(['PUBLICATION_NOT_GRANTED'])
    // Withdrawal leaves the customer's own view unchanged (still shared).
    expect((await customerGet(p.cookie, `/customer/projects/${p.reference}/photos/${after}`)).statusCode).toBe(200)

    const rows = await t.db
      .selectFrom('work.photo_publication_permissions')
      .select(['photo_id', 'granted', 'notice_version', 'recorded_by', 'customer_id'])
      .where('project_id', '=', p.projectId)
      .orderBy('seq')
      .execute()
    const customer = await t.db
      .selectFrom('crm.projects')
      .select('customer_id')
      .where('id', '=', p.projectId)
      .executeTakeFirstOrThrow()
    expect(rows).toEqual([
      {
        photo_id: after,
        granted: true,
        notice_version: NOTICE,
        recorded_by: ids.owner,
        customer_id: customer.customer_id,
      },
      {
        photo_id: internalAfter,
        granted: true,
        notice_version: NOTICE,
        recorded_by: ids.owner,
        customer_id: customer.customer_id,
      },
      {
        photo_id: after,
        granted: false,
        notice_version: null,
        recorded_by: ids.owner,
        customer_id: customer.customer_id,
      },
    ])
    const audit = await t.db
      .selectFrom('platform.audit_events')
      .select('summary')
      .where('action', '=', 'media.publication_permission')
      .execute()
    expect(audit).toHaveLength(3)
    expect(JSON.stringify(audit)).not.toContain('signed release')
  })

  it('[HH-DATA-07][RULE-SERVER-AUTHZ] the database refuses what the routes refuse', async () => {
    const fails = async (q: Promise<unknown>, pattern: RegExp) => {
      await expect(q).rejects.toThrow(pattern)
    }
    const row = await t.db
      .selectFrom('work.field_photos')
      .select('version')
      .where('id', '=', internalAfter)
      .executeTakeFirstOrThrow()
    // A worker never shares; nothing shares a photo without who and when.
    await fails(
      t.db
        .updateTable('work.field_photos')
        .set({
          visibility: 'customer_shared',
          visibility_changed_by: ids.ann,
          visibility_changed_at: new Date(),
          version: row.version + 1,
        })
        .where('id', '=', internalAfter)
        .execute(),
      /Owner or Office/,
    )
    await fails(
      t.db
        .updateTable('work.field_photos')
        .set({ object_key: 'jobs/after-photos/replaced', version: row.version + 1 })
        .where('id', '=', internalAfter)
        .execute(),
      /PHOTO_ORIGINAL/,
    )
    await fails(t.db.deleteFrom('work.field_photos').where('id', '=', internalAfter).execute(), /PHOTO_KEPT/)
    // A restricted class is never shared.
    await fails(
      t.db
        .updateTable('work.field_photos')
        .set({ visibility: 'restricted_incident', version: row.version + 1 })
        .where('id', '=', internalAfter)
        .execute(),
      /only an internal photo/,
    )
    // Only the Owner records a publication permission; records are append-only.
    const customer = await t.db
      .selectFrom('crm.projects')
      .select('customer_id')
      .where('id', '=', p.projectId)
      .executeTakeFirstOrThrow()
    await fails(
      t.db
        .insertInto('work.photo_publication_permissions')
        .values({
          photo_id: after,
          project_id: p.projectId,
          customer_id: customer.customer_id,
          purpose: 'marketing',
          channel: 'website',
          granted: true,
          notice_version: NOTICE,
          evidence_kind: 'email',
          evidence_reference: 'Synthetic',
          recorded_by: ids.office,
        })
        .execute(),
      /only the Owner/,
    )
    await fails(
      sql`UPDATE work.photo_publication_permissions SET granted = true WHERE photo_id = ${after}`.execute(t.db),
      /APPEND_ONLY/,
    )
  })

  it('[T68][HH-STAFF-04][RULE-SERVER-AUTHZ] staff outside the job read nothing; the Estimator reads estimating scope only', async () => {
    // cara is a worker without an assignment on this job: no read, no upload.
    expect((await staffGet('cara', `/api/v1/staff/jobs/${jobId}/photos`)).statusCode).toBe(403)
    expect((await fieldPhoto('cara', visitId, { workPackageId: wp, phase: 'after' })).statusCode).toBe(403)
    expect((await staffGet('estimator', `/api/v1/staff/jobs/${jobId}/photos`)).statusCode).toBe(403)
    expect((await staffGet('owner', `/api/v1/staff/jobs/${randomUUID()}/photos`)).statusCode).toBe(404)
    const missing = await share('office', randomUUID(), 1)
    expect(missing.statusCode).toBe(404)
    // A photo of another project's job is never reached through this job.
    const otherJob = await approve(other)
    expect((await jobPhotos('owner', otherJob)).photos).toEqual([])
  })
})
