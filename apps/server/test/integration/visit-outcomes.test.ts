// Visit outcomes against PostgreSQL 16 (TSK-0078; HH-SCH-09, HH-WORK-03, HH-PORT-07, ENT-Visit, OWN-DEC-68,
// OWN-DEC-107, RULE-SERVER-AUTHZ). Staff, customers, working hours, addresses and notes are synthetic
// (RULE-SYNTHETIC-DATA); the estimate terms version recorded below is a fixture of this throwaway database. "Today's
// visit" is a fixture written the way the confirmation writes it (the harness of my-day.test.ts).
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
  CODE_HASH_KEY: ['synthetic', 'visit', 'outcome', 'code', 'key', 'for', 'tests', 'only', '0078'].join('-'),
})
const SEAL = ['synthetic', 'visit', 'outcome', 'access', 'code', 'sealing', 'key', 'tests'].join('-')
const pw = ['synthetic', 'visit', 'outcome', 'passphrase', '78'].join(' ')
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
    headers: { 'x-forwarded-for': '198.51.100.170' },
    payload: { email: `${p}-outcome@example.test`, password: pw },
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
  wide = createDb(t.url, { max: 8, applicationName: 'visit-outcomes-test' })
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
        email: `${p}-outcome@example.test`,
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
  outcomes: { outcomeId: string; kind: string; followedUp: boolean }[]
  actions: { onMyWay: boolean; arrived: boolean; finished: boolean; recordOutcome: boolean }
}
const myDay = async (who: Person) => {
  const res = await staffGet(who, '/api/v1/staff/my/day')
  expect(res.statusCode, res.body).toBe(200)
  return res.json<{ visits: Item[] }>().visits
}
const record = (who: Person, visitId: string, kind: string, note = 'Synthetic: what the worker saw') =>
  staffWrite(who, 'POST', `/api/v1/staff/visits/${visitId}/outcomes`, { kind, note })
const visitRow = (id: string) =>
  t.db.selectFrom('work.visits').select(['state', 'version']).where('id', '=', id).executeTakeFirstOrThrow()
const queueItem = (outcomeId: string) =>
  t.db
    .selectFrom('ops.queue_items')
    .select(['type', 'reason', 'band', 'resolved_at', 'resolution', 'reference'])
    .where('subject_type', '=', 'visit_outcome')
    .where('subject_id', '=', outcomeId)
    .executeTakeFirstOrThrow()
const situation = async (p: Project) => {
  const res = await app.inject({
    method: 'GET',
    url: `/api/v1/customer/projects/${p.reference}/overview`,
    headers: { cookie: p.cookie },
  })
  expect(res.statusCode, res.body).toBe(200)
  return res.json<{ status: { situation: string; text: string | null } }>().status
}

describe('[HH-SCH-09] each visit outcome is recorded explicitly, with a staff follow-up; none marks work done', () => {
  it('[HH-SCH-09] delay, customer absent, weather, missing resources, readiness: recorded with a note and a follow-up item; the visit stays booked', async () => {
    const p = await project()
    const jobId = await approve(p)
    const visitId = await fixtureVisit(p, jobId, today(), ['ann'])
    expect((await myDay('ann')).find((v) => v.visitId === visitId)?.actions.recordOutcome).toBe(true)
    for (const kind of ['delay', 'customer_absent', 'weather', 'missing_resources', 'readiness_issue']) {
      const res = await record('ann', visitId, kind)
      expect(res.statusCode, res.body).toBe(201)
      const out = res.json<{ outcomeId: string; visitState: string; visit: Item | null }>()
      expect(out).toMatchObject({ kind, visitState: 'confirmed' })
      expect(out.visit?.outcomes.map((o) => o.kind)).toContain(kind)
      expect(await queueItem(out.outcomeId)).toMatchObject({
        type: 'visit_outcome',
        reason: kind,
        band: 'today_change',
        resolved_at: null,
        reference: p.reference,
      })
    }
    // None of them moved the visit or the job, or completed anything.
    expect((await visitRow(visitId)).state).toBe('confirmed')
    const job = await t.db
      .selectFrom('work.jobs')
      .select('operational_state')
      .where('id', '=', jobId)
      .executeTakeFirstOrThrow()
    expect(job.operational_state).toBe('pending_preparation')
    // The customer sees only "Update pending": no note, no reason, no time.
    const status = await situation(p)
    expect(status.situation).toBe('update_pending')
    expect(JSON.stringify(status)).not.toContain('Synthetic: what the worker saw')
    // The worker's note never reaches the audit summary.
    const audit = await t.db
      .selectFrom('platform.audit_events')
      .select('summary')
      .where('action', '=', 'visit.record_outcome')
      .execute()
    expect(audit.length).toBeGreaterThanOrEqual(5)
    expect(JSON.stringify(audit)).not.toContain('what the worker saw')
  })

  it('[HH-SCH-09] no access on site: the visit ends as no_access, its reservations end, the work is not done', async () => {
    const p = await project()
    const jobId = await approve(p)
    const visitId = await fixtureVisit(p, jobId, today(), ['ann', 'ben'])
    expect((await tap('ann', visitId, 'on-my-way')).statusCode).toBe(200)
    expect((await tap('ann', visitId, 'arrived')).statusCode).toBe(200)
    // Office never records an outcome, and a worker not on this visit is refused.
    expect((await record('office', visitId, 'no_access')).statusCode).toBe(403)
    expect((await record('cy', visitId, 'no_access')).statusCode).toBe(403)
    expect((await record('ann', visitId, 'no_access', '   ')).statusCode).toBe(400)
    const res = await record('ann', visitId, 'no_access', 'Synthetic: gate locked, nobody answered')
    expect(res.statusCode, res.body).toBe(201)
    expect(res.json()).toMatchObject({ kind: 'no_access', visitState: 'no_access', visit: null })
    expect((await visitRow(visitId)).state).toBe('no_access')
    const live = await t.db
      .selectFrom('work.reservations')
      .select(['ended_at', 'ended_reason'])
      .where('visit_id', '=', visitId)
      .execute()
    expect(live.every((r) => r.ended_at !== null && r.ended_reason === 'visit_no_access')).toBe(true)
    const job = await t.db
      .selectFrom('work.jobs')
      .select('operational_state')
      .where('id', '=', jobId)
      .executeTakeFirstOrThrow()
    expect(job.operational_state).toBe('pending_preparation')
    // It left My Day; nothing more is recorded on it, by anyone.
    expect((await myDay('ann')).some((v) => v.visitId === visitId)).toBe(false)
    // Its reservations ended, so nobody is assigned to it any more.
    expect((await tap('ben', visitId, 'finished')).statusCode).toBe(403)
    // Nor by the Owner, who is not on this visit either (the matrix's A cell).
    expect((await record('owner', visitId, 'delay')).statusCode).toBe(403)
    expect((await situation(p)).situation).toBe('update_pending')
  })

  it('[HH-SCH-09] staff follow up once; the item resolves and the customer’s "Update pending" ends', async () => {
    const p = await project()
    const jobId = await approve(p)
    const visitId = await fixtureVisit(p, jobId, today(), ['ann'])
    const recorded = await record('ann', visitId, 'weather', 'Synthetic: heavy storm, unsafe ladder work')
    const { outcomeId } = recorded.json<{ outcomeId: string }>()
    // The worker reads their own outcomes on My Day, not the staff follow-up screen.
    expect((await staffGet('ann', `/api/v1/staff/visit-outcomes/${outcomeId}`)).statusCode).toBe(403)
    const view = await staffGet('office', `/api/v1/staff/visit-outcomes/${outcomeId}`)
    expect(view.statusCode, view.body).toBe(200)
    expect(view.json()).toMatchObject({
      kind: 'weather',
      note: 'Synthetic: heavy storm, unsafe ladder work',
      visitState: 'confirmed',
      visitNow: 'confirmed',
      recordedBy: { id: ids.ann },
      followUp: null,
      actions: { followUp: true },
    })
    expect(
      (await staffWrite('office', 'POST', `/api/v1/staff/visit-outcomes/${outcomeId}/follow-up`, { note: ' ' }))
        .statusCode,
    ).toBe(400)
    const done = await staffWrite('office', 'POST', `/api/v1/staff/visit-outcomes/${outcomeId}/follow-up`, {
      note: 'Synthetic: called the customer, moved to next week',
    })
    expect(done.statusCode, done.body).toBe(200)
    expect(done.json()).toMatchObject({ followUp: { by: { id: ids.office } }, actions: { followUp: false } })
    expect(await queueItem(outcomeId)).toMatchObject({ resolution: 'followed_up' })
    const twice = await staffWrite('owner', 'POST', `/api/v1/staff/visit-outcomes/${outcomeId}/follow-up`, {
      note: 'Synthetic: again',
    })
    expect(twice.statusCode).toBe(409)
    expect(codes(twice.body)).toEqual([['outcome', 'ALREADY_FOLLOWED_UP']])
    expect((await situation(p)).situation).not.toBe('update_pending')
    expect((await myDay('ann')).find((v) => v.visitId === visitId)?.outcomes).toEqual([
      expect.objectContaining({ kind: 'weather', followedUp: true }),
    ])
  })

  it('[HH-SCH-09] the database: no access only with its outcome, outcomes only by the assigned, never edited or deleted', async () => {
    const p = await project()
    const jobId = await approve(p)
    const visitId = await fixtureVisit(p, jobId, today(), ['ann'])
    const v = await visitRow(visitId)
    await expect(
      sql`UPDATE work.visits SET state = 'no_access', version = ${v.version + 1} WHERE id = ${visitId}`.execute(t.db),
    ).rejects.toThrow(/only with the recorded outcome/)
    await expect(
      sql`INSERT INTO work.visit_outcomes (visit_id, project_id, job_id, kind, note, visit_state, recorded_by)
          VALUES (${visitId}, ${p.projectId}, ${jobId}, 'delay', 'Synthetic', 'confirmed', ${ids.cy})`.execute(t.db),
    ).rejects.toThrow(/assigned to the visit or the Owner/)
    const ok = await record('ann', visitId, 'delay')
    const { outcomeId } = ok.json<{ outcomeId: string }>()
    await expect(
      sql`UPDATE work.visit_outcomes SET note = 'changed' WHERE id = ${outcomeId}`.execute(t.db),
    ).rejects.toThrow(/never changes/)
    await expect(sql`DELETE FROM work.visit_outcomes WHERE id = ${outcomeId}`.execute(t.db)).rejects.toThrow(
      /never deleted/,
    )
  })
})
