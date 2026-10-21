// The scheduling board against PostgreSQL 16 (TSK-0065; HH-SCH-13, HH-OPS-03, HH-SCH-04, HH-SCH-06, T42, S05,
// ENT-Visit, ENT-Reservation, ENT-StaffUser, OWN-DEC-119, OWN-DEC-123, RULE-SERVER-AUTHZ, RULE-SAFETY-GATES).
// Staff, customers, working hours and names are synthetic (RULE-SYNTHETIC-DATA): the hours below are test fixtures,
// never the business's hours. Nothing reaches a provider.
// - The board is one read: a day or a week by worker, each visit once with the same actions and confirmation blockers
//   as the project's visits; every move or confirmation from it is the existing visit write with its expected version,
//   so a stale edit conflicts with the current values and a failed move keeps the booking exactly as it was.
import { randomUUID } from 'node:crypto'
import { loadServiceSeed, syncServices, withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import { addLocalDays, isoWeekday, localDateOf } from '@handyhub/domain'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { readCodeKey, type CodeKeySettings } from '../../src/modules/identity/index.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import { boardDays } from '../../src/modules/visits/index.js'
import { recordPolicyVersion } from '../../src/platform/config/index.js'
import { FakeObjectStorage } from '../../src/providers/r2/index.js'
import { testConfig } from '../fixtures/env.js'

const ZONE = 'America/Kentucky/Louisville'
const KEY: CodeKeySettings = readCodeKey({
  HANDYHUB_ENV: 'ci',
  CODE_HASH_KEY: ['synthetic', 'board', 'code', 'key', 'for', 'tests', 'only', '0065'].join('-'),
})
const pw = ['synthetic', 'board', 'passphrase', '65'].join(' ')
const SIGNED_IN = ['owner', 'office', 'estimator', 'worker'] as const
type Person = (typeof SIGNED_IN)[number]
const CREW = ['ann', 'ben', 'cal'] as const
type Crew = (typeof CREW)[number]

let t: TestDatabase
let app: FastifyInstance
const cookies = {} as Record<Person, string>
const csrf = {} as Record<Person, string>
const ids = {} as Record<Person | Crew, string>

const today = () => localDateOf(new Date(), ZONE)
/** A local date some days ahead (each test uses its own dates, so their reservations never meet). */
const day = (n: number) => addLocalDays(today(), n)
/** Every weekday 08:00-18:00: a synthetic fixture. */
const WEEK = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, start: '08:00', end: '18:00' }))

async function signIn(p: Person): Promise<[string, string]> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/staff/auth/sign-in',
    headers: { 'x-forwarded-for': '198.51.100.165' },
    payload: { email: `${p}-board@example.test`, password: pw },
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

type Span = { startsAt: string; endsAt: string }
type BoardVisit = {
  id: string
  projectId: string
  projectReference: string
  requestId: string | null
  purpose: string
  state: string
  version: number
  window: { localDate: string; start: string; end: string; timeZone: string }
  expectedDurationMinutes: number | null
  preparationBufferMinutes: number | null
  travelBufferMinutes: number | null
  requiredWorkers: number | null
  reservedRange: Span | null
  team: { worker: { id: string; name: string | null }; role: string | null; kind: string }[]
  openOffer: boolean
  confirmationBlockers: { field: string; code: string }[] | null
  actions: { changeWindow: boolean; confirm: boolean; offerWindows: boolean }
}
type Board = {
  view: 'day' | 'week'
  date: string
  days: string[]
  previous: string
  next: string
  timeZone: string
  timeZoneProposed: boolean
  focusVisitId: string | null
  workers: {
    id: string
    name: string | null
    scheduleVersion: number | null
    days: {
      date: string
      working: Span[]
      free: Span[]
      workingMinutes: number
      freeMinutes: number
      entries: { visitId: string; kind: string; role: string | null; startsAt: string; endsAt: string }[]
    }[]
  }[]
  unassigned: { date: string; visitIds: string[] }[]
  visits: BoardVisit[]
}
type ProjectVisit = {
  id: string
  version: number
  confirmationBlockers: { field: string; code: string }[] | null
  actions: { changeWindow: boolean; confirm: boolean; offerWindows: boolean }
}

async function board(who: Person, query: string): Promise<Board> {
  const res = await staffGet(who, `/api/v1/staff/schedule?${query}`)
  expect(res.statusCode, res.body).toBe(200)
  return res.json<Board>()
}
const lane = (b: Board, crew: Crew) => b.workers.find((w) => w.id === ids[crew]) as Board['workers'][number]
const visitIn = (b: Board, id: string) => b.visits.find((v) => v.id === id) as BoardVisit

beforeAll(async () => {
  t = await createTestDatabase()
  await syncServices(t.db, loadServiceSeed())
  app = await buildApp({
    config: testConfig({ TRUST_PROXY_HOPS: '1' }),
    api: { db: t.db, codeKey: KEY, storage: new FakeObjectStorage() },
  })
  const hash = await hashPassword(pw)
  await withTx(t.db, async (tx) => {
    for (const p of SIGNED_IN) {
      const user = await createStaffUser(tx, {
        email: `${p}-board@example.test`,
        displayName: `Synthetic ${p}`,
        locale: 'en',
        role: p,
        issuedBy: 'test',
      })
      await setPasswordHash(tx, user.id, hash)
      ids[p] = user.id
    }
    for (const c of CREW) {
      const user = await createStaffUser(tx, {
        email: `${c}-crew-board@example.test`,
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
  for (const p of SIGNED_IN) [cookies[p], csrf[p]] = await signIn(p)
  for (const c of CREW) {
    const res = await staffWrite('owner', 'PUT', `/api/v1/staff/workers/${ids[c]}/working-hours`, { periods: WEEK }, 0)
    expect(res.statusCode, res.body).toBe(200)
  }
})
afterAll(async () => {
  await app?.close()
  await t?.drop()
})

const ALL_OK = Object.fromEntries(
  ['coverage', 'service_fit', 'essential_facts', 'urgency', 'site_visit_need', 'staff_equipment', 'risk_flags'].map(
    (c) => [c, { outcome: 'ok' }],
  ),
)
type Project = { requestId: string; projectId: string; reference: string }
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
      description: 'Synthetic board project.',
      answers: [],
      property: {
        street: `${seq} Synthetic Board Way`,
        city: 'Testville',
        state: 'ky',
        zip: '40000',
        propertyType: 'house',
      },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'site_visit',
      contact: {
        fullName: 'Synthetic Board Customer',
        email: `board-${seq}-${randomUUID().slice(0, 8)}@example.test`,
        phone: '(502) 555-0165',
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
  const p = { requestId: row.id, projectId: row.project_id, reference }
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

type Plan = { date: string; start: string; end: string; duration?: number; travel?: number; workers?: number }
async function planVisit(p: Project, plan: Plan): Promise<ProjectVisit> {
  const res = await staffWrite('office', 'POST', `/api/v1/staff/projects/${p.projectId}/visits`, {
    purpose: 'site_estimate',
    localDate: plan.date,
    windowStart: plan.start,
    windowEnd: plan.end,
    expectedDurationMinutes: plan.duration ?? 120,
    travelBufferMinutes: plan.travel ?? 30,
    preparationBufferMinutes: 0,
    requiredWorkers: plan.workers ?? 1,
    equipment: [],
  })
  expect(res.statusCode, res.body).toBe(201)
  const all = res.json<{ visits: ProjectVisit[] }>().visits
  return all[all.length - 1] as ProjectVisit
}
async function confirmed(v: { id: string; version: number }, crew: Crew[]) {
  const res = await staffWrite(
    'office',
    'POST',
    `/api/v1/staff/visits/${v.id}/confirm`,
    { workerIds: crew.map((c) => ids[c]) },
    v.version,
  )
  expect(res.statusCode, res.body).toBe(200)
}
const move = (who: Person, v: { id: string }, version: number, date: string, start: string, end: string) =>
  staffWrite(
    who,
    'POST',
    `/api/v1/staff/visits/${v.id}/window`,
    // TSK-0066: a reschedule of a confirmed visit records its reason.
    { localDate: date, windowStart: start, windowEnd: end, reason: 'Synthetic: moved on the board.' },
    version,
  )
const projectVisit = async (p: Project, id: string) =>
  (await staffGet('office', `/api/v1/staff/projects/${p.projectId}/visits`))
    .json<{ visits: ProjectVisit[] }>()
    .visits.find((v) => v.id === id) as ProjectVisit

describe('[HH-SCH-13] the board: a day and a week by worker', () => {
  it('[HH-SCH-13][T39] a two-person visit is on both workers; the unassigned visit apart; free time left per worker', async () => {
    const date = day(40)
    const a = await siteVisitProject()
    const two = await planVisit(a, { date, start: '09:00', end: '10:00', workers: 2 })
    await confirmed(two, ['ann', 'ben'])
    const b = await siteVisitProject()
    const open = await planVisit(b, { date, start: '13:00', end: '14:00', travel: 15, duration: 60 })

    const d = await board('office', `date=${date}`)
    expect(d.view).toBe('day')
    expect(d.days).toEqual([date])
    expect(d.previous).toBe(addLocalDays(date, -1))
    expect(d.next).toBe(addLocalDays(date, 1))
    expect(d.timeZone).toBe(ZONE)
    // The two-person visit: once in the visits, on both workers' lanes (the lead first), never as two crews.
    const shown = visitIn(d, two.id)
    expect(shown.purpose).toBe('site_estimate')
    expect(shown.state).toBe('confirmed')
    expect(shown.projectReference).toBe(a.reference)
    expect(shown.requestId).toBe(a.requestId)
    expect(shown.window).toMatchObject({ localDate: date, start: '09:00', end: '10:00', timeZone: ZONE })
    expect([shown.expectedDurationMinutes, shown.travelBufferMinutes, shown.preparationBufferMinutes]).toEqual([
      120, 30, 0,
    ])
    expect(shown.team.map((m) => [m.worker.id, m.role, m.kind])).toEqual([
      [ids.ann, 'lead', 'confirmed'],
      [ids.ben, 'member', 'confirmed'],
    ])
    expect(d.visits.filter((v) => v.id === two.id)).toHaveLength(1)
    for (const crew of ['ann', 'ben'] as const) {
      const cell = lane(d, crew).days[0] as Board['workers'][number]['days'][number]
      expect(cell.entries.map((e) => [e.visitId, e.kind])).toEqual([[two.id, 'confirmed']])
      // 08:00-18:00 working; 08:30-12:00 reserved (travel, the window and the expected work): 390 minutes free.
      expect([cell.workingMinutes, cell.freeMinutes]).toEqual([600, 390])
    }
    expect(lane(d, 'cal').days[0]?.freeMinutes).toBe(600)
    // A worker without working hours set has no capacity at all: nothing is assumed.
    const ownerLane = d.workers.find((w) => w.id === ids.owner)
    expect(ownerLane?.scheduleVersion).toBeNull()
    expect([ownerLane?.days[0]?.workingMinutes, ownerLane?.days[0]?.freeMinutes]).toEqual([0, 0])
    // The tentative visit reserves no one: it is listed apart, with Confirm offered as on the project's visits.
    expect(d.unassigned).toEqual([{ date, visitIds: [open.id] }])
    const pending = visitIn(d, open.id)
    expect(pending.team).toEqual([])
    expect(pending.confirmationBlockers).toEqual([])
    expect(pending.actions).toEqual((await projectVisit(b, open.id)).actions)
    expect(pending.actions.confirm).toBe(true)
    expect(shown.actions).toEqual({
      changeWindow: true,
      confirm: false,
      reassign: true,
      cancel: true,
      offerWindows: false,
    })
    expect(shown.actions).toEqual((await projectVisit(a, two.id)).actions)
  })

  it('[HH-SCH-13] the week runs Monday to Sunday (PROPOSED) around the date, with each day per worker', async () => {
    const base = day(47)
    const monday = addLocalDays(base, 1 - isoWeekday(base))
    expect(boardDays(base, 'week')).toEqual([0, 1, 2, 3, 4, 5, 6].map((n) => addLocalDays(monday, n)))
    const p = await siteVisitProject()
    const sunday = addLocalDays(monday, 6)
    const v = await planVisit(p, { date: sunday, start: '15:00', end: '16:00', duration: 60 })
    await confirmed(v, ['cal'])
    const w = await board('office', `date=${base}&view=week`)
    expect(w.days).toEqual(boardDays(base, 'week'))
    expect([w.previous, w.next]).toEqual([addLocalDays(base, -7), addLocalDays(base, 7)])
    const cal = lane(w, 'cal')
    expect(cal.days.map((x) => x.date)).toEqual(w.days)
    expect(cal.days[6]?.entries.map((e) => e.visitId)).toEqual([v.id])
    expect(cal.days.slice(0, 6).every((x) => x.entries.length === 0 && x.freeMinutes === 600)).toBe(true)
    expect(visitIn(w, v.id).state).toBe('confirmed')
  })

  it('[HH-SCH-13][HH-SCH-11] held windows show as holds on the team, never as bookings; the visit offers no move', async () => {
    const date = day(52)
    const p = await siteVisitProject()
    const v = await planVisit(p, { date, start: '09:00', end: '10:00', duration: 60 })
    const offered = await staffWrite(
      'office',
      'POST',
      `/api/v1/staff/visits/${v.id}/offers`,
      {
        windows: [
          { localDate: date, windowStart: '09:00', windowEnd: '10:00' },
          { localDate: date, windowStart: '14:00', windowEnd: '15:00' },
        ],
        workerIds: [ids.cal],
      },
      v.version,
    )
    expect(offered.statusCode, offered.body).toBe(201)
    const d = await board('office', `date=${date}`)
    const cell = lane(d, 'cal').days[0] as Board['workers'][number]['days'][number]
    expect(cell.entries.map((e) => [e.visitId, e.kind])).toEqual([
      [v.id, 'hold'],
      [v.id, 'hold'],
    ])
    const shown = visitIn(d, v.id)
    expect(shown.state).toBe('tentative')
    expect(shown.openOffer).toBe(true)
    expect(shown.actions).toEqual({
      changeWindow: false,
      confirm: false,
      reassign: false,
      cancel: false,
      offerWindows: false,
    })
    expect(shown.actions).toEqual((await projectVisit(p, v.id)).actions)
    expect(d.unassigned[0]?.visitIds).not.toContain(v.id)
  })

  it('[HH-SCH-06][RULE-SAFETY-GATES] a blocking hold shows on the board exactly as on the project, and Confirm is not offered', async () => {
    const date = day(54)
    const p = await siteVisitProject()
    const v = await planVisit(p, { date, start: '09:00', end: '10:00' })
    // Staff flag a potential hazard (a qualification revision): a review hold opens on the project.
    const raised = await staffWrite(
      'office',
      'PUT',
      `/api/v1/staff/requests/${p.requestId}/qualification`,
      {
        checks: {
          ...ALL_OK,
          risk_flags: {
            outcome: 'attention',
            note: 'Synthetic: old paint may contain lead.',
            hazards: ['hazardous_material'],
          },
        },
      },
      1,
    )
    expect(raised.statusCode, raised.body).toBe(200)
    const [hold] = raised.json<{ holdsOpened: string[] }>().holdsOpened
    const d = await board('office', `date=${date}`)
    const shown = visitIn(d, v.id)
    const there = await projectVisit(p, v.id)
    expect(shown.confirmationBlockers).toEqual([{ field: `holds.${hold}`, code: 'REVIEW_HOLD_OPEN' }])
    expect(shown.confirmationBlockers).toEqual(there.confirmationBlockers)
    expect(shown.actions).toEqual(there.actions)
    expect(shown.actions.confirm).toBe(false)
    expect(shown.actions.offerWindows).toBe(false)
    // The server refuses the confirmation itself too: the board offers nothing a write would skip.
    const refused = await staffWrite(
      'office',
      'POST',
      `/api/v1/staff/visits/${v.id}/confirm`,
      { workerIds: [ids.ann] },
      v.version,
    )
    expect(refused.statusCode).toBe(409)
  })

  it('[HH-SCH-13] a visit to open (a queue link) chooses its date; one outside the board is not found', async () => {
    const date = day(57)
    const p = await siteVisitProject()
    const v = await planVisit(p, { date, start: '11:00', end: '12:00' })
    const d = await board('office', `visitId=${v.id}&view=week`)
    expect(d.focusVisitId).toBe(v.id)
    expect(d.date).toBe(date)
    expect(d.days).toContain(date)
    expect(visitIn(d, v.id).window.localDate).toBe(date)
    const missing = await staffGet('office', `/api/v1/staff/schedule?visitId=${randomUUID()}`)
    expect(missing.statusCode).toBe(404)
    const bad = await staffGet('office', '/api/v1/staff/schedule?date=2026-02-30')
    expect(bad.statusCode).toBe(400)
    expect((await staffGet('office', '/api/v1/staff/schedule?view=month')).statusCode).toBe(400)
    expect((await staffGet('office', '/api/v1/staff/schedule?extra=1')).statusCode).toBe(400)
    // Without a date: today in the business zone.
    expect((await board('office', 'view=day')).date).toBe(today())
  })
})

describe('[HH-OPS-03][T42] edits from the board: stale writes conflict, failed changes keep the booking', () => {
  it('[HH-OPS-03][T42][HH-API-04] a move based on the version the board showed conflicts with the current values', async () => {
    const date = day(60)
    const p = await siteVisitProject()
    const v = await planVisit(p, { date, start: '09:00', end: '10:00' })
    const shown = visitIn(await board('office', `date=${date}`), v.id)
    // Someone else moves it first (the Owner, from another screen).
    const first = await move('owner', v, shown.version, date, '10:00', '11:00')
    expect(first.statusCode, first.body).toBe(200)
    // The board's edit, still on the version it showed: refused with the current values, nothing overwritten.
    const stale = await move('office', v, shown.version, addLocalDays(date, 1), '12:00', '13:00')
    expect(stale.statusCode).toBe(409)
    const error = stale.json().error
    expect(error.code).toBe('STALE_VERSION')
    expect(error.current).toEqual({
      version: shown.version + 1,
      values: { state: 'tentative', localDate: date, windowStart: '10:00', windowEnd: '11:00' },
    })
    const after = visitIn(await board('office', `date=${date}`), v.id)
    expect(after.version).toBe(shown.version + 1)
    expect(after.window).toMatchObject({ localDate: date, start: '10:00', end: '11:00' })
    // Redone on the current version, the change is checked again and saved.
    const redo = await move('office', v, after.version, addLocalDays(date, 1), '12:00', '13:00')
    expect(redo.statusCode, redo.body).toBe(200)
    const moved = await board('office', `date=${addLocalDays(date, 1)}`)
    expect(visitIn(moved, v.id).window).toMatchObject({ localDate: addLocalDays(date, 1), start: '12:00' })
    expect((await board('office', `date=${date}`)).visits.map((x) => x.id)).not.toContain(v.id)
  })

  it('[T42][HH-SCH-04] a move of a confirmed visit that fails capacity keeps the booking exactly as it was', async () => {
    const date = day(63)
    const a = await siteVisitProject()
    const busy = await planVisit(a, { date, start: '14:00', end: '15:00' })
    await confirmed(busy, ['ann'])
    const b = await siteVisitProject()
    const mine = await planVisit(b, { date, start: '09:00', end: '10:00' })
    await confirmed(mine, ['ann'])
    const before = await board('office', `date=${date}`)
    const shown = visitIn(before, mine.id)
    const refused = await move('office', mine, shown.version, date, '14:00', '15:00')
    expect(refused.statusCode).toBe(409)
    expect(refused.json().error.code).toBe('CONFLICT')
    const after = await board('office', `date=${date}`)
    expect(visitIn(after, mine.id)).toEqual(shown)
    expect(lane(after, 'ann').days).toEqual(lane(before, 'ann').days)
  })
})

describe('[RULE-SERVER-AUTHZ][HH-SCH-13] who sees the board', () => {
  it('[RULE-SERVER-AUTHZ] Owner and Office see it (Estimator PROPOSED); a Worker and anyone signed out never do', async () => {
    const date = day(66)
    for (const who of ['owner', 'office', 'estimator'] as const)
      expect((await board(who, `date=${date}`)).date).toBe(date)
    expect((await staffGet('worker', `/api/v1/staff/schedule?date=${date}`)).statusCode).toBe(403)
    expect((await app.inject({ method: 'GET', url: `/api/v1/staff/schedule?date=${date}` })).statusCode).toBe(401)
    // The Estimator sees the board but is never offered Confirm (visit.confirm is Owner and Office).
    const p = await siteVisitProject()
    const v = await planVisit(p, { date, start: '09:00', end: '10:00' })
    expect(visitIn(await board('estimator', `date=${date}`), v.id).actions.confirm).toBe(false)
    expect(visitIn(await board('office', `date=${date}`), v.id).actions.confirm).toBe(true)
  })

  it('[FACT-TIMEZONE][RULE-DECIDED-VALUES-ACTIVE] without the business zone the board is NOT CONFIGURED', async () => {
    await recordPolicyVersion(t.db, {
      key: 'business.timezone',
      value: null,
      sourceIds: ['OQ-TIMEZONE-ID'],
      changedBy: 'test',
      reason: 'synthetic: NOT CONFIGURED',
    })
    try {
      const res = await staffGet('office', `/api/v1/staff/schedule?date=${day(68)}`)
      expect(res.statusCode).toBe(503)
      expect(res.json().error.code).toBe('NOT_CONFIGURED')
    } finally {
      await recordPolicyVersion(t.db, {
        key: 'business.timezone',
        value: { zone: ZONE },
        sourceIds: ['FACT-TIMEZONE', 'OQ-TIMEZONE-ID'],
        changedBy: 'test',
        reason: 'synthetic: restore',
        proposed: true,
      })
    }
  })
})
