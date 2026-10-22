// Staff management against PostgreSQL 16 (TSK-0097; HH-STAFF-02, HH-STAFF-03, HH-STAFF-07, T26, T27, T38, T64,
// ENT-StaffUser, ENT-RoleGrant, ENT-QueueItem, OWN-DEC-114, OWN-DEC-123, RULE-SERVER-AUTHZ). Every account, request,
// address and working-hours set is synthetic (RULE-SYNTHETIC-DATA): the hours are test fixtures, never the business's
// hours. Nothing reaches a provider: links and emails stay in the outbox.
import { randomUUID } from 'node:crypto'
import { createDb, loadServiceSeed, syncServices, withTx, type Db } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import { addLocalDays, localDateOf } from '@handyhub/domain'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import { disable } from '../../src/modules/staff/members.js'
import { runWithContext } from '../../src/platform/request-context.js'
import { verifyCountyOf } from '../fixtures/county.js'
import { testConfig } from '../fixtures/env.js'

const ZONE = 'America/Kentucky/Louisville'
const pw = (n: number) => ['synthetic', 'staff', 'management', 'passphrase', String(n)].join(' ')
const PEOPLE = [
  'owner',
  'owner2',
  'office',
  'office2',
  'office3',
  'office4',
  'estimator',
  'worker',
  'worker2',
  'leaver',
] as const
type Person = (typeof PEOPLE)[number]
const ROLE: Record<Person, 'owner' | 'office' | 'estimator' | 'worker'> = {
  owner: 'owner',
  owner2: 'owner',
  office: 'office',
  office2: 'office',
  office3: 'office',
  office4: 'office',
  estimator: 'estimator',
  worker: 'worker',
  worker2: 'worker',
  leaver: 'worker',
}
const email = (p: Person) => `${p}-management@example.test`
/** Every weekday 08:00-18:00: a synthetic fixture. */
const WEEK = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, start: '08:00', end: '18:00' }))

let t: TestDatabase
let wide: Db
let app: FastifyInstance
const ids = {} as Record<Person, string>
type Auth = { cookie: string; csrf: string }
const auth = {} as Record<Person, Auth>

let seq = 0
const key = (what: string) => `synthetic-${what}-${String(++seq).padStart(6, '0')}-${randomUUID()}`

async function signIn(p: Person, password = pw(1)): Promise<Auth> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/staff/auth/sign-in',
    headers: { 'x-forwarded-for': '198.51.100.197' },
    payload: { email: email(p), password },
  })
  expect(res.statusCode, res.body).toBe(200)
  return { cookie: String(res.headers['set-cookie']).split(';')[0] as string, csrf: res.json().csrfToken as string }
}
const send = (a: Auth, method: 'POST' | 'PUT', url: string, payload: unknown = {}, version?: number) =>
  app.inject({
    method,
    url: `/api/v1${url}`,
    payload: payload as object,
    headers: {
      cookie: a.cookie,
      'x-csrf-token': a.csrf,
      'idempotency-key': key('staff'),
      ...(version === undefined ? {} : { 'if-match': `"${version}"` }),
    },
  })
const get = (a: Auth, url: string) => app.inject({ method: 'GET', url: `/api/v1${url}`, headers: { cookie: a.cookie } })
/** A password re-entry: the session becomes freshly authenticated (and rotates). */
async function fresh(p: Person): Promise<Auth> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/staff/auth/reauth',
    headers: { cookie: auth[p].cookie, 'x-csrf-token': auth[p].csrf, 'x-forwarded-for': '198.51.100.197' },
    payload: { password: pw(1) },
  })
  expect(res.statusCode, res.body).toBe(200)
  auth[p] = { cookie: String(res.headers['set-cookie']).split(';')[0] as string, csrf: res.json().csrfToken as string }
  return auth[p]
}
const stale = (p: Person) =>
  sql`UPDATE identity.staff_sessions SET authenticated_at = now() - interval '6 minutes'
      WHERE revoked_at IS NULL AND staff_user_id = ${ids[p]}`.execute(t.db)
const codes = (body: string): string[] => JSON.parse(body).error.fieldErrors.map((f: { code: string }) => f.code)
const errorCode = (body: string): string => JSON.parse(body).error.code

beforeAll(async () => {
  t = await createTestDatabase()
  // Wide enough that the race below holds its own connections at the same time.
  wide = createDb(t.url, { max: 8, applicationName: 'staff-management-test' })
  await syncServices(t.db, loadServiceSeed())
  app = await buildApp({ config: testConfig({ TRUST_PROXY_HOPS: '1' }), api: { db: wide } })
  await withTx(t.db, async (tx) => {
    for (const p of PEOPLE) {
      const user = await createStaffUser(tx, {
        email: email(p),
        displayName: `Synthetic ${p}`,
        locale: 'en',
        role: ROLE[p],
        issuedBy: 'test',
      })
      await setPasswordHash(tx, user.id, await hashPassword(pw(1)))
      ids[p] = user.id
    }
  })
  for (const p of PEOPLE) auth[p] = await signIn(p)
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
let ip = 10
type Project = { requestId: string; projectId: string; reference: string }

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
      description: 'Synthetic staff management project.',
      answers: [],
      property: {
        street: `${seq} Synthetic Staff Way`,
        city: 'Testville',
        state: 'ky',
        zip: '40000',
        propertyType: 'house',
      },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'site_visit',
      contact: {
        fullName: 'Synthetic Staff Customer',
        email: `staff-mgmt-${seq}-${randomUUID().slice(0, 8)}@example.test`,
        phone: '(502) 555-0197',
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
    .select(['id', 'project_id'])
    .where('reference', '=', reference)
    .executeTakeFirstOrThrow()
  // TSK-0127: staff's address and county check, which a first confirmation needs.
  await verifyCountyOf(t.db, row.project_id)
  const p = { requestId: row.id, projectId: row.project_id, reference }
  const q = await send(auth.owner, 'PUT', `/staff/requests/${p.requestId}/qualification`, { checks: ALL_OK }, 0)
  expect(q.statusCode, q.body).toBe(200)
  const moved = await send(
    auth.owner,
    'POST',
    `/staff/requests/${p.requestId}/actions/estimate-visit`,
    { customerExplanation: 'We need to see the synthetic wall.', workPackages: ['SVC-DW-01'] },
    1,
  )
  expect(moved.statusCode, moved.body).toBe(200)
  return p
}

type VisitView = {
  id: string
  version: number
  state: string
  assignments: { endedAt: string | null; flags: string[] }[]
}
const day = (n: number) => addLocalDays(localDateOf(new Date(), ZONE), n)

async function planVisit(a: Auth, p: Project, date: string) {
  return send(a, 'POST', `/staff/projects/${p.projectId}/visits`, {
    purpose: 'site_estimate',
    localDate: date,
    windowStart: '09:00',
    windowEnd: '10:00',
    expectedDurationMinutes: 60,
    travelBufferMinutes: 30,
    preparationBufferMinutes: 0,
    requiredWorkers: 1,
    equipment: [],
  })
}

/** A confirmed Estimate visit of `who` on a day ahead. */
async function bookedVisit(who: Person, n: number): Promise<{ project: Project; visit: VisitView }> {
  const project = await siteVisitProject()
  const planned = await planVisit(auth.office, project, day(n))
  expect(planned.statusCode, planned.body).toBe(201)
  const visits = planned.json<{ visits: VisitView[] }>().visits
  const v = visits[visits.length - 1] as VisitView
  const res = await send(auth.office, 'POST', `/staff/visits/${v.id}/confirm`, { workerIds: [ids[who]] }, v.version)
  expect(res.statusCode, res.body).toBe(200)
  return { project, visit: v }
}

async function setHours(who: Person) {
  const view = (await get(auth.owner, '/staff/availability')).json<{
    workers: { id: string; schedule: { version: number } | null }[]
  }>()
  const version = view.workers.find((w) => w.id === ids[who])?.schedule?.version ?? 0
  const res = await send(auth.owner, 'PUT', `/staff/workers/${ids[who]}/working-hours`, { periods: WEEK }, version)
  expect(res.statusCode, res.body).toBe(200)
}

type QueueItem = { type: string; subjectId: string; reason: string; band: string; action: string; link: string }
const queueOf = async (a: Auth, reference: string) => {
  const res = await get(a, `/staff/queue?type=visit_flagged&reference=${reference}`)
  return res.statusCode === 200 ? res.json<{ items: QueueItem[] }>().items : res.statusCode
}
const auditOf = (action: string, target: string) =>
  t.db
    .selectFrom('platform.audit_events')
    .select(['action', 'actor_id', 'target_id', 'reason', 'summary', 'step_up_used', 'result'])
    .where('action', '=', action)
    .where('target_id', '=', target)
    .orderBy('seq')
    .execute()

describe('[HH-STAFF-07][RULE-SERVER-AUTHZ] the staff list is the Owner’s', () => {
  it('[HH-STAFF-07][T26] only the Owner sees and manages staff; nothing secret is returned', async () => {
    for (const p of ['office', 'estimator', 'worker'] as const) {
      expect((await get(auth[p], '/staff/members')).statusCode).toBe(403)
      expect((await get(auth[p], `/staff/members/${ids.worker}`)).statusCode).toBe(403)
      for (const path of ['disable', 'password-recovery'])
        expect((await send(auth[p], 'POST', `/staff/members/${ids.worker2}/${path}`, {})).statusCode).toBe(403)
      const end = await send(auth[p], 'POST', `/staff/members/${ids.worker2}/grants/end`, {
        kind: 'role',
        name: 'worker',
      })
      expect(end.statusCode).toBe(403)
      const grant = await send(auth[p], 'POST', `/staff/members/${ids.worker2}/grants`, {
        kind: 'role',
        name: 'office',
        reason: 'Synthetic attempt',
      })
      expect(grant.statusCode, grant.body).toBe(403)
    }
    const res = await get(auth.owner, '/staff/members')
    expect(res.statusCode, res.body).toBe(200)
    const members = res.json<{ members: { id: string; roles: string[]; self: boolean; passwordSet: boolean }[] }>()
      .members
    expect(members.map((m) => m.id).sort()).toEqual(Object.values(ids).sort())
    expect(members.find((m) => m.id === ids.owner)).toMatchObject({ roles: ['owner'], self: true, passwordSet: true })
    expect(res.body).not.toMatch(/argon2|password_hash|token/i)
    const detail = await get(auth.owner, `/staff/members/${ids.worker}`)
    expect(detail.json()).toMatchObject({
      roles: ['worker'],
      grants: [{ kind: 'role', name: 'worker', endedAt: null }],
    })
    expect((await get(auth.owner, `/staff/members/${randomUUID()}`)).statusCode).toBe(404)
  })
})

describe('[HH-STAFF-03] role and capability grants', () => {
  it('[HH-STAFF-03][T64][T26] a grant needs a fresh sign-in and a reason, is audited and applies at once', async () => {
    const path = `/staff/members/${ids.worker}/grants`
    await stale('owner')
    const notFresh = await send(auth.owner, 'POST', path, { kind: 'role', name: 'office', reason: 'Covers the desk' })
    expect(notFresh.statusCode, notFresh.body).toBe(403)
    expect(errorCode(notFresh.body)).toBe('FRESH_AUTH_REQUIRED')
    const owner = await fresh('owner')
    const noReason = await send(owner, 'POST', path, { kind: 'role', name: 'office' })
    expect(noReason.statusCode).toBe(400)
    const blank = await send(owner, 'POST', path, { kind: 'role', name: 'office', reason: '   ' })
    expect(blank.statusCode).toBe(400)
    // The worker cannot see the requests list until the Office role is granted.
    expect((await get(auth.worker, '/staff/requests')).statusCode).toBe(403)
    const granted = await send(owner, 'POST', path, { kind: 'role', name: 'office', reason: 'Covers the desk' })
    expect(granted.statusCode, granted.body).toBe(201)
    expect(granted.json().roles).toEqual(['office', 'worker'])
    expect((await get(auth.worker, '/staff/requests')).statusCode).toBe(200)
    const again = await send(owner, 'POST', path, { kind: 'role', name: 'office', reason: 'Twice' })
    expect(codes(again.body)).toEqual(['GRANT_EXISTS'])
    const [event] = await auditOf('staff.grant_role', ids.worker)
    expect(event).toMatchObject({
      actor_id: ids.owner,
      reason: 'Covers the desk',
      step_up_used: true,
      summary: { change: 'granted', kind: 'role', name: 'office' },
    })
    // Ending is protective: no fresh sign-in needed. The grant is ended, never deleted.
    await stale('owner')
    const ended = await send(auth.owner, 'POST', `${path}/end`, {
      kind: 'role',
      name: 'office',
      reason: 'Desk covered',
    })
    expect(ended.statusCode, ended.body).toBe(200)
    expect(ended.json().roles).toEqual(['worker'])
    expect(ended.json().grants.find((g: { name: string }) => g.name === 'office')).toMatchObject({
      endedBy: { staffUserId: ids.owner, system: false },
    })
    expect((await get(auth.worker, '/staff/requests')).statusCode).toBe(403)
    expect((await auditOf('staff.end_grant', ids.worker))[0]).toMatchObject({ reason: 'Desk covered' })
    const gone = await send(auth.owner, 'POST', `${path}/end`, { kind: 'role', name: 'office' })
    expect(codes(gone.body)).toEqual(['GRANT_NOT_LIVE'])
    await expect(
      sql`DELETE FROM identity.role_grants WHERE staff_user_id = ${ids.worker}`.execute(t.db),
    ).rejects.toThrow(/never edited or deleted/)
  })

  it('[HH-STAFF-03][T26] nobody grants themselves anything; collect is per worker; a person keeps a role', async () => {
    const owner = await fresh('owner')
    const self = await send(owner, 'POST', `/staff/members/${ids.owner}/grants`, {
      kind: 'role',
      name: 'worker',
      reason: 'Self',
    })
    expect(self.statusCode, self.body).toBe(403)
    expect(self.json().error.code).toBe('FORBIDDEN')
    const collectOffice = await send(owner, 'POST', `/staff/members/${ids.office2}/grants`, {
      kind: 'capability',
      name: 'collect',
      reason: 'Synthetic',
    })
    expect(codes(collectOffice.body)).toEqual(['CAPABILITY_NEEDS_WORKER'])
    const collect = await send(owner, 'POST', `/staff/members/${ids.worker2}/grants`, {
      kind: 'capability',
      name: 'collect',
      reason: 'Takes payments on site',
    })
    expect(collect.statusCode, collect.body).toBe(201)
    expect(collect.json().capabilities).toEqual(['collect'])
    const last = await send(owner, 'POST', `/staff/members/${ids.office2}/grants/end`, { kind: 'role', name: 'office' })
    expect(codes(last.body)).toEqual(['LAST_ROLE'])
  })

  it('[HH-STAFF-03][HH-STAFF-02] at least one active Owner always remains, in the API and in the database', async () => {
    // owner2 gives owner a second role, then owner disables owner2: owner is the only active Owner left.
    const second = await fresh('owner2')
    expect(
      (
        await send(second, 'POST', `/staff/members/${ids.owner}/grants`, {
          kind: 'role',
          name: 'estimator',
          reason: 'Also estimates',
        })
      ).statusCode,
    ).toBe(201)
    const off = await send(auth.owner, 'POST', `/staff/members/${ids.owner2}/disable`, { reason: 'Left the business' })
    expect(off.statusCode, off.body).toBe(200)
    const lastOwner = await send(auth.owner, 'POST', `/staff/members/${ids.owner}/grants/end`, {
      kind: 'role',
      name: 'owner',
    })
    expect(codes(lastOwner.body)).toEqual(['LAST_OWNER'])
    const ownAccount = await send(auth.owner, 'POST', `/staff/members/${ids.owner}/disable`, {})
    expect(codes(ownAccount.body)).toEqual(['OWN_ACCOUNT'])
    // The database refuses it on any path, at commit.
    await expect(
      sql`UPDATE identity.staff_users SET status = 'disabled', disabled_at = now() WHERE id = ${ids.owner}`.execute(
        t.db,
      ),
    ).rejects.toThrow(/at least one active Owner/)
    await expect(
      sql`UPDATE identity.role_grants SET ended_at = now(), ended_by = 'test'
          WHERE staff_user_id = ${ids.owner} AND name = 'owner' AND ended_at IS NULL`.execute(t.db),
    ).rejects.toThrow(/at least one active Owner/)
    // Disabling someone who is not an Owner is unaffected.
    expect((await get(auth.owner, `/staff/members/${ids.owner}`)).json().roles).toEqual(['owner', 'estimator'])
  })
})

/**
 * Holds the Owner's disabling transaction of `who` open (not committed), starts `write` as that person (their session
 * still resolves, so the write begins and waits for the account's write lock), then commits the disabling.
 */
async function raceDisable<T>(who: Person, write: () => Promise<T>): Promise<T> {
  let release: () => void = () => {}
  const held = new Promise<void>((r) => (release = r))
  const disabling = runWithContext({ requestId: `test:${randomUUID()}` }, () =>
    withTx(wide, async (tx) => {
      await disable(tx, { actorId: ids.owner, staffUserId: ids[who], reason: null })
      await held
    }),
  )
  // Give the disabling transaction time to take the account's write lock.
  await new Promise((r) => setTimeout(r, 200))
  const pending = write()
  let waited = false
  for (let i = 0; i < 50 && !waited; i++) {
    const row = await sql<{
      n: string
    }>`SELECT count(*) AS n FROM pg_locks WHERE locktype = 'advisory' AND NOT granted`.execute(t.db)
    waited = Number(row.rows[0]?.n) > 0
    if (!waited) await new Promise((r) => setTimeout(r, 50))
  }
  expect(waited).toBe(true)
  release()
  await disabling
  return pending
}

describe('[HH-STAFF-02][T27] offboarding', () => {
  it('[HH-STAFF-02][T27][T38][HH-STAFF-07] disabling ends every session and credential and flags assignments for reassignment', async () => {
    await setHours('leaver')
    const { project, visit } = await bookedVisit('leaver', 5)
    const otherSession = await signIn('leaver')
    // An open reset link (the person asked for one) stops working too.
    await app.inject({
      method: 'POST',
      url: '/api/v1/staff/auth/password/forgot',
      headers: { 'x-forwarded-for': '198.51.100.197' },
      payload: { email: email('leaver') },
    })
    expect((await get(auth.leaver, '/staff/auth/session')).statusCode).toBe(200)

    const res = await send(auth.owner, 'POST', `/staff/members/${ids.leaver}/disable`, { reason: 'Left the team' })
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json()).toMatchObject({ sessionsRevoked: 2, linksInvalidated: 1, upcomingAssignments: 1, flagged: 1 })
    expect(res.json().member).toMatchObject({
      status: 'disabled',
      liveSessions: 0,
      passwordSet: false,
      roles: ['worker'],
      statusHistory: [{ from: 'active', to: 'disabled', reason: 'Left the team', by: { staffUserId: ids.owner } }],
    })

    // T27: the next server call from either open session fails; a write (an offline replay included) is refused.
    for (const a of [auth.leaver, otherSession]) {
      expect((await get(a, '/staff/auth/session')).statusCode).toBe(401)
      expect((await send(a, 'PUT', '/staff/auth/session/locale', { locale: 'es' })).statusCode).toBe(401)
      expect((await planVisit(a, project, day(6))).statusCode).toBe(401)
    }
    const again = await app.inject({
      method: 'POST',
      url: '/api/v1/staff/auth/sign-in',
      headers: { 'x-forwarded-for': '198.51.100.197' },
      payload: { email: email('leaver'), password: pw(1) },
    })
    expect(again.statusCode).toBe(401)
    const links = await t.db
      .selectFrom('identity.staff_links')
      .select(['invalidated_at', 'consumed_at'])
      .where('staff_user_id', '=', ids.leaver)
      .execute()
    expect(links.every((l) => l.invalidated_at !== null || l.consumed_at !== null)).toBe(true)

    // The appointment is never cancelled: still confirmed, the reservation kept and flagged for reassignment.
    const visits = (await get(auth.office, `/staff/projects/${project.projectId}/visits`)).json<{
      visits: VisitView[]
    }>().visits
    const after = visits.find((v) => v.id === visit.id) as VisitView
    expect(after.state).toBe('confirmed')
    expect(after.assignments.find((a) => a.endedAt === null)?.flags).toEqual(['account_disabled'])
    // HH-OPS-01: one queue item per flagged visit, for the roles that reassign visits.
    const items = await queueOf(auth.office, project.reference)
    expect(items).toEqual([
      expect.objectContaining({
        type: 'visit_flagged',
        subjectId: visit.id,
        reason: 'assignee_disabled',
        band: 'time_sensitive',
        action: 'reassign_visit',
        link: `/schedule/${visit.id}`,
      }),
    ])
    expect(await queueOf(auth.estimator, project.reference)).toEqual([])
    expect(await queueOf(auth.worker2, project.reference)).toBe(403)
    // T38: the person is out of future capacity, enforced in the database: a new booking is refused, nothing written.
    const other = await planVisit(auth.office, project, day(6))
    const otherVisit = other.json<{ visits: VisitView[] }>().visits.at(-1) as VisitView
    const refused = await send(
      auth.office,
      'POST',
      `/staff/visits/${otherVisit.id}/confirm`,
      { workerIds: [ids.leaver] },
      otherVisit.version,
    )
    expect(refused.statusCode, refused.body).toBe(409)
    expect(codes(refused.body)).toContain('WORKER_NOT_ACTIVE')
    expect(
      await t.db.selectFrom('work.reservations').select('id').where('visit_id', '=', otherVisit.id).execute(),
    ).toEqual([])
    // The person's history stays.
    const capacity = (await get(auth.office, `/staff/capacity?date=${day(5)}`)).json<{ workers: { id: string }[] }>()
    expect(capacity.workers.map((w) => w.id)).not.toContain(ids.leaver)
    expect(await t.db.selectFrom('identity.staff_users').select('id').where('id', '=', ids.leaver).execute()).toEqual([
      { id: ids.leaver },
    ])
    expect(
      await t.db.selectFrom('platform.audit_events').select('id').where('target_id', '=', ids.leaver).execute(),
    ).not.toEqual([])
    const [event] = await auditOf('staff.disable', ids.leaver)
    expect(event).toMatchObject({
      actor_id: ids.owner,
      reason: 'Left the team',
      summary: { change: 'disabled', sessionsRevoked: 2, flagged: 1 },
    })
    expect(JSON.stringify(event)).not.toMatch(/argon2|example\.test/)
    expect(codes((await send(auth.owner, 'POST', `/staff/members/${ids.leaver}/disable`, {})).body)).toEqual([
      'ACCOUNT_DISABLED',
    ])
    expect(codes((await send(auth.owner, 'POST', `/staff/members/${ids.leaver}/password-recovery`, {})).body)).toEqual([
      'ACCOUNT_DISABLED',
    ])

    // Re-enabling needs a fresh sign-in and a reason; a reset link is emailed and the queue item resolves.
    await stale('owner')
    const notFresh = await send(auth.owner, 'POST', `/staff/members/${ids.leaver}/enable`, { reason: 'Came back' })
    expect(errorCode(notFresh.body)).toBe('FRESH_AUTH_REQUIRED')
    const owner = await fresh('owner')
    const back = await send(owner, 'POST', `/staff/members/${ids.leaver}/enable`, { reason: 'Came back' })
    expect(back.statusCode, back.body).toBe(200)
    expect(back.json()).toMatchObject({ linkSent: 'reset', member: { status: 'active', passwordSet: false } })
    expect(await queueOf(auth.office, project.reference)).toEqual([])
    const resolved = await t.db
      .selectFrom('ops.queue_items')
      .select(['resolution'])
      .where('type', '=', 'visit_flagged')
      .where('subject_id', '=', visit.id)
      .execute()
    expect(resolved).toEqual([{ resolution: 'flags_cleared' }])
    const outbox = await t.db
      .selectFrom('platform.outbox_events')
      .select(['type', 'payload'])
      .where('aggregate_id', '=', ids.leaver)
      .where('type', '=', 'staff_link.issued')
      .orderBy('seq', 'desc')
      .executeTakeFirstOrThrow()
    expect(outbox.payload).toMatchObject({ purpose: 'reset' })
    // The old password never comes back.
    const old = await app.inject({
      method: 'POST',
      url: '/api/v1/staff/auth/sign-in',
      headers: { 'x-forwarded-for': '198.51.100.197' },
      payload: { email: email('leaver'), password: pw(1) },
    })
    expect(old.statusCode).toBe(401)
    expect(codes((await send(owner, 'POST', `/staff/members/${ids.leaver}/enable`, { reason: 'Twice' })).body)).toEqual(
      ['ACCOUNT_NOT_DISABLED'],
    )
  })

  it('[HH-STAFF-02][T27] a write already on its way when the account is disabled cannot commit after it', async () => {
    const project = await siteVisitProject()
    const office2 = auth.office2
    const res = await raceDisable('office2', () => planVisit(office2, project, day(9)))
    expect(res.statusCode, res.body).toBe(401)
    const visits = await t.db
      .selectFrom('work.visits')
      .select('id')
      .where('project_id', '=', project.projectId)
      .execute()
    expect(visits).toEqual([])
  })

  it('[HH-STAFF-02][T27] the same holds for the writes of later modules (an internal message, TSK-0049)', async () => {
    // Every write route re-checks the account and session inside its own transaction (api/register.ts), so the
    // inbox, questions, deposits, SOP and capacity writes are covered like the visits above; one of them, raced.
    const project = await siteVisitProject()
    const office3 = auth.office3
    const body = `Synthetic internal note ${randomUUID().slice(0, 8)}`
    const before = await send(office3, 'POST', `/staff/inbox/projects/${project.projectId}/internal-messages`, {
      body: `${body} (before)`,
    })
    expect(before.statusCode, before.body).toBe(201)
    const res = await raceDisable('office3', () =>
      send(office3, 'POST', `/staff/inbox/projects/${project.projectId}/internal-messages`, { body }),
    )
    expect(res.statusCode, res.body).toBe(401)
    const written = await t.db
      .selectFrom('comms.messages')
      .select('body_text')
      .where('project_id', '=', project.projectId)
      .where('direction', '=', 'internal')
      .execute()
    expect(written.map((m) => m.body_text)).toEqual([`${body} (before)`])
  })

  it('[HH-STAFF-02][T27] and for offering appointment windows (TSK-0063): no offer and no hold commits', async () => {
    await setHours('worker')
    const project = await siteVisitProject()
    const planned = await planVisit(auth.office, project, day(10))
    expect(planned.statusCode, planned.body).toBe(201)
    const v = planned.json<{ visits: VisitView[] }>().visits.at(-1) as VisitView
    const office4 = auth.office4
    const windows = ['09:00', '12:00'].map((start) => ({
      localDate: day(10),
      windowStart: start,
      windowEnd: `${String(Number(start.slice(0, 2)) + 1).padStart(2, '0')}:00`,
    }))
    const res = await raceDisable('office4', () =>
      send(office4, 'POST', `/staff/visits/${v.id}/offers`, { windows, workerIds: [ids.worker] }, v.version),
    )
    expect(res.statusCode, res.body).toBe(401)
    expect(await t.db.selectFrom('work.window_offers').select('id').where('visit_id', '=', v.id).execute()).toEqual([])
    expect(await t.db.selectFrom('work.reservations').select('id').where('visit_id', '=', v.id).execute()).toEqual([])
    // The same offer from an active account is accepted: only the disabling refused it.
    const ok = await send(
      auth.office,
      'POST',
      `/staff/visits/${v.id}/offers`,
      { windows, workerIds: [ids.worker] },
      v.version,
    )
    expect(ok.statusCode, ok.body).toBe(201)
  })
})

describe('[HH-STAFF-07] availability changes flag appointments in the action queue', () => {
  it('[HH-STAFF-07] time off over a booked visit opens its review item; withdrawing it resolves the item', async () => {
    await setHours('worker2')
    const { project, visit } = await bookedVisit('worker2', 7)
    expect(await queueOf(auth.owner, project.reference)).toEqual([])
    const off = await send(auth.owner, 'POST', `/staff/workers/${ids.worker2}/time-off`, {
      startDate: day(7),
      startTime: null,
      endDate: day(7),
      endTime: null,
    })
    expect(off.statusCode, off.body).toBe(201)
    expect(off.json().flagged).toBe(1)
    expect(await queueOf(auth.owner, project.reference)).toEqual([
      expect.objectContaining({ subjectId: visit.id, reason: 'availability_changed' }),
    ])
    const timeOffId = (
      await t.db
        .selectFrom('work.time_off')
        .select('id')
        .where('staff_user_id', '=', ids.worker2)
        .where('withdrawn_at', 'is', null)
        .executeTakeFirstOrThrow()
    ).id
    expect((await send(auth.owner, 'POST', `/staff/time-off/${timeOffId}/withdraw`, {})).statusCode).toBe(200)
    expect(await queueOf(auth.owner, project.reference)).toEqual([])
    // Still booked, never cancelled.
    const visits = (await get(auth.office, `/staff/projects/${project.projectId}/visits`)).json<{
      visits: VisitView[]
    }>().visits
    expect(visits.find((v) => v.id === visit.id)?.state).toBe('confirmed')
  })
})

describe('[HH-STAFF-02] password recovery started by the Owner', () => {
  it('[HH-STAFF-02] the Owner emails a reset link (invite while invited); never sees it; it is audited', async () => {
    const res = await send(auth.owner, 'POST', `/staff/members/${ids.worker}/password-recovery`, {})
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json().linkSent).toBe('reset')
    expect(res.body).not.toMatch(/token/i)
    expect((await auditOf('staff.start_password_recovery', ids.worker))[0]).toMatchObject({
      actor_id: ids.owner,
      summary: { linkSent: 'reset' },
    })
    const invited = await withTx(t.db, (tx) =>
      createStaffUser(tx, {
        email: 'invited-management@example.test',
        displayName: 'Synthetic invited',
        locale: 'es',
        role: 'worker',
        issuedBy: 'test',
      }),
    )
    const inv = await send(auth.owner, 'POST', `/staff/members/${invited.id}/password-recovery`, {})
    expect(inv.json()).toMatchObject({ linkSent: 'invite', member: { status: 'invited', passwordSet: false } })
  })
})
