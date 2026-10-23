// The sync queue against PostgreSQL 16 (TSK-0080; HH-OFF-05, HH-OFF-06, HH-OFF-07, T27, T51, ENT-FieldEvent,
// OWN-DEC-121, RULE-SERVER-AUTHZ). Staff, customers, working hours, addresses and notes are synthetic
// (RULE-SYNTHETIC-DATA); the estimate terms version recorded below is a fixture of this throwaway database. "Today's
// visit" is a fixture written the way the confirmation writes it (the harness of visit-outcomes.test.ts).
import { randomUUID } from 'node:crypto'
import { createDb, loadServiceSeed, loadSopSeed, syncServices, syncSops, withTx, type Db } from '@handyhub/db'
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
import { verifyPropertyZone } from '../fixtures/zones.js'
import { signInWithMfa } from '../fixtures/staff-mfa.js'

const ZONE = 'America/Kentucky/Louisville'
const KEY: CodeKeySettings = readCodeKey({
  HANDYHUB_ENV: 'ci',
  CODE_HASH_KEY: ['synthetic', 'visit', 'sync', 'code', 'key', 'for', 'tests', 'only', '0080'].join('-'),
})
const SEAL = ['synthetic', 'field', 'sync', 'access', 'code', 'sealing', 'key', 'tests'].join('-')
const pw = ['synthetic', 'field', 'sync', 'passphrase', '80'].join(' ')
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
const WEEK = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, start: '08:00', end: '20:00' }))

async function signIn(p: Person): Promise<[string, string]> {
  const res = await signInWithMfa(app, {
    method: 'POST',
    url: '/api/v1/staff/auth/sign-in',
    headers: { 'x-forwarded-for': '198.51.100.180' },
    payload: { email: `${p}-sync@example.test`, password: pw },
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
const codes = (body: string) =>
  (JSON.parse(body) as { error: { fieldErrors: { field: string; code: string }[] } }).error.fieldErrors.map((f) => [
    f.field,
    f.code,
  ])

beforeAll(async () => {
  t = await createTestDatabase()
  wide = createDb(t.url, { max: 8, applicationName: 'field-sync-test' })
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
        email: `${p}-sync@example.test`,
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
          // Assigned two hours ago: the phone's events of the last minutes were recorded while assigned.
          created_at: new Date(Date.now() - 2 * 3600_000),
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

type Sent = {
  clientId: string
  type: 'tap_on_my_way' | 'tap_arrived' | 'tap_finished'
  visitId: string
  deviceRecordedAt: string
  actorId?: string
  baseVersion?: number
  attempt?: number
}
type Result = {
  clientId: string
  state: string
  outcome: string
  detail: string | null
  visitId: string
  receivedAt: string
  ingested: boolean
}
/** One event as the phone sends it: its own UUID as the Idempotency-Key, or a fresh key (a retry the key missed). */
function sync(who: Person, event: Sent, freshKey = false) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/staff/field-events',
    payload: event,
    headers: {
      cookie: cookies[who],
      'x-csrf-token': csrf[who],
      'idempotency-key': freshKey ? key('retry') : event.clientId,
    },
  })
}
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()
const event = (type: Sent['type'], visitId: string, extra: Partial<Sent> = {}): Sent => ({
  clientId: randomUUID(),
  type,
  visitId,
  deviceRecordedAt: ago(5),
  ...extra,
})
const visitRow = (id: string) =>
  t.db.selectFrom('work.visits').select(['state', 'version']).where('id', '=', id).executeTakeFirstOrThrow()
const fieldEvents = (visitId: string) =>
  t.db.selectFrom('work.field_events').selectAll().where('visit_id', '=', visitId).execute()
const reviewItem = (clientId: string) =>
  t.db
    .selectFrom('ops.queue_items')
    .select(['type', 'reason', 'resolved_at', 'resolution', 'reference'])
    .where('subject_type', '=', 'field_event')
    .where('subject_id', '=', clientId)
    .executeTakeFirst()

describe('[HH-OFF-05][T51] each event is ingested once by its client UUID', () => {
  it('[HH-OFF-05][T51] On my way and Arrived resent several times record one departure, one timestamp, one event', async () => {
    const p = await project()
    const jobId = await approve(p)
    const visitId = await fixtureVisit(p, jobId, today(), ['ann'])
    const base = (await visitRow(visitId)).version
    const away = event('tap_on_my_way', visitId, { deviceRecordedAt: ago(20), baseVersion: base })
    const first = await sync('ann', away)
    expect(first.statusCode, first.body).toBe(200)
    expect(first.json<Result>()).toMatchObject({
      clientId: away.clientId,
      state: 'synchronized',
      outcome: 'applied',
      detail: null,
      ingested: true,
    })
    // The same event again: the request's key replays; a fresh key (the phone lost the answer) finds the UUID.
    for (const fresh of [false, true, true]) {
      const again = await sync('ann', fresh ? { ...away, attempt: 2 } : away, fresh)
      expect(again.statusCode, again.body).toBe(200)
      expect(again.json<Result>()).toMatchObject({ clientId: away.clientId, state: 'synchronized', outcome: 'applied' })
    }
    const arrived = event('tap_arrived', visitId, { deviceRecordedAt: ago(10) })
    const both = await Promise.all([sync('ann', arrived, true), sync('ann', arrived, true)])
    for (const r of both) expect(r.statusCode, r.body).toBe(200)
    expect(both.map((r) => r.json<Result>().ingested).sort()).toEqual([false, true])
    expect(await visitRow(visitId)).toMatchObject({ state: 'arrived' })
    const departures = await t.db
      .selectFrom('work.visit_departures')
      .selectAll()
      .where('visit_id', '=', visitId)
      .execute()
    expect(departures).toHaveLength(1)
    expect(departures[0]?.device_recorded_at?.toISOString()).toBe(away.deviceRecordedAt)
    const stamps = await t.db.selectFrom('work.time_stamps').selectAll().where('visit_id', '=', visitId).execute()
    expect(stamps.map((s) => [s.kind, s.device_recorded_at?.toISOString()])).toEqual([
      ['arrived', arrived.deviceRecordedAt],
    ])
    const rows = await fieldEvents(visitId)
    expect(rows.map((r) => [r.client_id, r.state, r.outcome, r.attempts]).sort()).toEqual(
      [
        [away.clientId, 'synchronized', 'applied', 1],
        [arrived.clientId, 'synchronized', 'applied', 1],
      ].sort(),
    )
    // A tap the server already has (online before the phone's copy arrived) is synchronized, not recorded again.
    const twice = await sync('ann', event('tap_arrived', visitId))
    expect(twice.json<Result>()).toMatchObject({ state: 'synchronized', outcome: 'already_recorded', ingested: true })
    expect(
      await t.db.selectFrom('work.time_stamps').select('id').where('visit_id', '=', visitId).execute(),
    ).toHaveLength(1)
    const audit = await t.db
      .selectFrom('platform.audit_events')
      .select('summary')
      .where('action', '=', 'field_event.sync')
      .where('target_id', '=', visitId)
      .execute()
    // Each upload that reached the handler is audited; three recorded an event, the resent ones nothing.
    expect(audit.map((a) => (a.summary as { ingested: boolean }).ingested).sort()).toEqual([
      false,
      false,
      false,
      true,
      true,
      true,
    ])
  })

  it('[HH-OFF-05] the same UUID for a different event is refused, and nothing else is recorded', async () => {
    const p = await project()
    const jobId = await approve(p)
    const visitId = await fixtureVisit(p, jobId, today(), ['ann'])
    const away = event('tap_on_my_way', visitId)
    expect((await sync('ann', away)).statusCode).toBe(200)
    const reused = await sync('ann', { ...away, type: 'tap_arrived' }, true)
    expect(reused.statusCode, reused.body).toBe(409)
    expect(codes(reused.body)).toEqual([['body.clientId', 'CLIENT_ID_REUSED']])
    expect(await fieldEvents(visitId)).toHaveLength(1)
  })
})

describe('[HH-OFF-06][T51][T27] reconnect revalidates; conflicts and unauthorized writes go to the Owner', () => {
  it('[HH-OFF-06][T51] a worker reassigned away while offline: the event is kept for review, never applied', async () => {
    const p = await project()
    const jobId = await approve(p)
    const visitId = await fixtureVisit(p, jobId, today(), ['ann'])
    const offline = event('tap_on_my_way', visitId, { deviceRecordedAt: ago(1) })
    // The office reassigns the visit to Benito, the way the reassignment writes it.
    await withTx(t.db, async (tx) => {
      const r = await tx
        .updateTable('work.reservations')
        .set({ ended_at: new Date(), ended_reason: 'reassigned', ended_by: ids.office })
        .where('visit_id', '=', visitId)
        .where('staff_user_id', '=', ids.ann)
        .returningAll()
        .executeTakeFirstOrThrow()
      await tx
        .insertInto('work.reservations')
        .values({
          visit_id: visitId,
          resource: 'worker',
          staff_user_id: ids.ben,
          role: 'lead',
          kind: 'confirmed',
          starts_at: r.starts_at,
          ends_at: r.ends_at,
          time_zone: ZONE,
          assigned_by: ids.office,
        })
        .execute()
    })
    const res = await sync('ann', offline)
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json<Result>()).toMatchObject({
      state: 'needs_review',
      outcome: 'not_assigned',
      detail: 'NOT_ASSIGNED_NOW',
      ingested: true,
    })
    expect(await visitRow(visitId)).toMatchObject({ state: 'confirmed' })
    expect(
      await t.db.selectFrom('work.visit_departures').select('id').where('visit_id', '=', visitId).execute(),
    ).toEqual([])
    expect(await reviewItem(offline.clientId)).toMatchObject({
      type: 'field_event_review',
      reason: 'sync_not_assigned',
      resolved_at: null,
      reference: p.reference,
    })
    // An event the phone dated before the worker was ever assigned is not theirs to record either.
    const visit2 = await fixtureVisit(p, jobId, today(), ['ann'])
    const early = await sync('ann', event('tap_on_my_way', visit2, { deviceRecordedAt: ago(24 * 60) }))
    expect(early.json<Result>()).toMatchObject({
      state: 'needs_review',
      outcome: 'not_assigned',
      detail: 'NOT_ASSIGNED_THEN',
    })
  })

  it('[HH-OFF-06][T51] a visit canceled while the worker was offline: a conflict for review, never last-write-wins', async () => {
    const p = await project()
    const jobId = await approve(p)
    const visitId = await fixtureVisit(p, jobId, today(), ['ann'])
    const offline = event('tap_on_my_way', visitId, { deviceRecordedAt: ago(2) })
    const v = await visitRow(visitId)
    await t.db
      .updateTable('work.visits')
      .set({ state: 'canceled', version: v.version + 1 })
      .where('id', '=', visitId)
      .execute()
    const res = await sync('ann', offline)
    expect(res.json<Result>()).toMatchObject({ state: 'needs_review', outcome: 'conflict', detail: 'VISIT_NOT_ACTIVE' })
    expect(await visitRow(visitId)).toMatchObject({ state: 'canceled', version: v.version + 1 })
    expect(await reviewItem(offline.clientId)).toMatchObject({ reason: 'sync_conflict', resolved_at: null })
    // A tap the visit's state refuses (Finished before Arrived) is a conflict too, and records nothing.
    const visit2 = await fixtureVisit(p, jobId, today(), ['ann'])
    const finished = await sync('ann', event('tap_finished', visit2))
    expect(finished.json<Result>()).toMatchObject({ outcome: 'conflict', detail: 'ARRIVED_FIRST' })
    expect(await t.db.selectFrom('work.time_stamps').select('id').where('visit_id', '=', visit2).execute()).toEqual([])
  })

  it('[HH-OFF-06] the Owner reads an event in review and records the review once; others may not', async () => {
    const p = await project()
    const jobId = await approve(p)
    const visitId = await fixtureVisit(p, jobId, today(), ['ann'])
    const offline = event('tap_arrived', visitId)
    expect((await sync('ann', offline)).json<Result>()).toMatchObject({
      outcome: 'conflict',
      detail: 'ON_MY_WAY_FIRST',
    })
    const url = `/api/v1/staff/field-events/${offline.clientId}`
    for (const who of ['ann', 'office'] as const) expect((await staffGet(who, url)).statusCode).toBe(403)
    const view = await staffGet('owner', url)
    expect(view.statusCode, view.body).toBe(200)
    expect(view.json()).toMatchObject({
      clientId: offline.clientId,
      type: 'tap_arrived',
      visitId,
      reference: p.reference,
      recordedBy: { id: ids.ann, name: NAMES.ann },
      uploadedBy: { id: ids.ann, name: NAMES.ann },
      deviceRecordedAt: offline.deviceRecordedAt,
      state: 'needs_review',
      outcome: 'conflict',
      detail: 'ON_MY_WAY_FIRST',
      review: null,
      actions: { review: true },
    })
    expect((await staffWrite('office', 'POST', `${url}/review`, { note: 'Synthetic.' })).statusCode).toBe(403)
    const done = await staffWrite('owner', 'POST', `${url}/review`, {
      note: ' Synthetic: asked Annabel; nothing to apply. ',
    })
    expect(done.statusCode, done.body).toBe(200)
    expect(done.json()).toMatchObject({
      state: 'reviewed',
      review: { by: { id: ids.owner }, note: 'Synthetic: asked Annabel; nothing to apply.' },
      actions: { review: false },
    })
    expect(await reviewItem(offline.clientId)).toMatchObject({ resolution: 'reviewed' })
    const again = await staffWrite('owner', 'POST', `${url}/review`, { note: 'Synthetic.' })
    expect(again.statusCode).toBe(409)
    expect(codes(again.body)).toEqual([['fieldEvent', 'ALREADY_REVIEWED']])
    // A synchronized event is not in review.
    const fine = event('tap_on_my_way', visitId)
    expect((await sync('ann', fine)).json<Result>()).toMatchObject({ outcome: 'applied' })
    const notInReview = await staffWrite('owner', 'POST', `/api/v1/staff/field-events/${fine.clientId}/review`, {
      note: 'Synthetic.',
    })
    expect(codes(notInReview.body)).toEqual([['fieldEvent', 'NOT_IN_REVIEW']])
  })

  it('[T27][HH-OFF-06] a disabled worker cannot sync; the Owner uploads their phone’s evidence for review only', async () => {
    const p = await project()
    const jobId = await approve(p)
    const visitId = await fixtureVisit(p, jobId, today(), ['cy'])
    const pending = event('tap_on_my_way', visitId, { deviceRecordedAt: ago(3) })
    // Someone else's events: a worker may not upload them.
    const other = await sync('ann', { ...pending, actorId: ids.cy })
    expect(other.statusCode, other.body).toBe(403)
    const disabled = await staffWrite('owner', 'POST', `/api/v1/staff/members/${ids.cy}/disable`, {
      reason: 'Synthetic offboarding.',
    })
    expect(disabled.statusCode, disabled.body).toBe(200)
    const refused = await sync('cy', pending)
    expect(refused.statusCode).toBe(401)
    expect(await fieldEvents(visitId)).toEqual([])
    const recovered = await sync('owner', { ...pending, actorId: ids.cy })
    expect(recovered.statusCode, recovered.body).toBe(200)
    expect(recovered.json<Result>()).toMatchObject({ state: 'needs_review', outcome: 'recovered', detail: null })
    expect(
      await t.db.selectFrom('work.visit_departures').select('id').where('visit_id', '=', visitId).execute(),
    ).toEqual([])
    const [row] = await fieldEvents(visitId)
    expect(row).toMatchObject({ actor_id: ids.cy, uploaded_by: ids.owner, state: 'needs_review' })
    expect(await reviewItem(pending.clientId)).toMatchObject({ reason: 'sync_recovered', resolved_at: null })
  })
})

describe('[HH-OFF-05] the database keeps field events as received', () => {
  it('[HH-OFF-05] an event never changes, is never deleted, and is reviewed only from review', async () => {
    const p = await project()
    const jobId = await approve(p)
    const visitId = await fixtureVisit(p, jobId, today(), ['ann'])
    const e = event('tap_on_my_way', visitId)
    expect((await sync('ann', e)).json<Result>()).toMatchObject({ outcome: 'applied' })
    const where = sql`client_id = ${e.clientId}`
    await expect(sql`UPDATE work.field_events SET attempts = 9 WHERE ${where}`.execute(t.db)).rejects.toThrow(
      /never changes/,
    )
    await expect(
      sql`UPDATE work.field_events SET state = 'reviewed', reviewed_by = ${ids.owner}, reviewed_at = now(),
          review_note = 'x' WHERE ${where}`.execute(t.db),
    ).rejects.toThrow(/only a field event in review/)
    await expect(sql`DELETE FROM work.field_events WHERE ${where}`.execute(t.db)).rejects.toThrow(/never deleted/)
  })
})
