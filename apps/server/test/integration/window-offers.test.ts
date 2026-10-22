// Window offers held 24 hours and estimate-visit reservations against PostgreSQL 16 (TSK-0063; HH-SCH-11, HH-LEAD-07,
// HH-SCH-04, HH-SCH-05, T37, T38, ENT-Reservation, ENT-Visit, FACT-AUTOMATIC-MESSAGES, OWN-DEC-99, OWN-DEC-105,
// OWN-DEC-144, RULE-SERVER-AUTHZ). Staff, customers, working hours, windows and names are synthetic
// (RULE-SYNTHETIC-DATA): the hours below are test fixtures, never the business's hours. Nothing reaches a provider.
// - The races run real concurrent transactions: parallel API calls on an app whose pool is wide enough for all of
//   them, and transactions held open on their own connections, so the database (the offer row lock, the exclusion
//   constraints and the guards comparing with its own clock) is what decides.
// - The 24-hour hold cannot be waited for in a test: `age` moves an offer's stored instants (offered, expires and its
//   holds' expiry) back in time in this throwaway database, with the triggers off for that one statement only
//   (session_replication_role), exactly as if the offer had been made earlier. Nothing else is changed that way.
import { randomUUID } from 'node:crypto'
import { createDb, loadServiceSeed, syncServices, withTx, type Db } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import { addLocalDays, localDateOf } from '@handyhub/domain'
import { ESTIMATE_TERMS } from '@handyhub/domain/legal'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { startCustomerSession } from '../../src/modules/identity/customer-sessions.js'
import { readCodeKey, type CodeKeySettings } from '../../src/modules/identity/index.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import { apiModules } from '../../src/modules/index.js'
import { portalModule } from '../../src/modules/portal/index.js'
import { disable } from '../../src/modules/staff/members.js'
import {
  estimateVisitConfirmedAutomation,
  estimateVisitOptionsAutomation,
  visitsModule,
  windowOfferExpiryAutomation,
  type WorkVisitGate,
} from '../../src/modules/visits/index.js'
import { expireOfferIfDue } from '../../src/modules/visits/offers.js'
import { createAutomationRegistry } from '../../src/platform/automation.js'
import { recordPolicyVersion } from '../../src/platform/config/index.js'
import { createWorker } from '../../src/platform/jobs.js'
import { runWithContext } from '../../src/platform/request-context.js'
import { createProviders } from '../../src/providers/index.js'
import { FakeObjectStorage } from '../../src/providers/r2/index.js'
import { readProviderSettings } from '../../src/providers/settings.js'
import { testConfig } from '../fixtures/env.js'

const ZONE = 'America/Kentucky/Louisville'
const KEY: CodeKeySettings = readCodeKey({
  HANDYHUB_ENV: 'ci',
  CODE_HASH_KEY: ['synthetic', 'window', 'offer', 'code', 'key', 'for', 'tests', 'only', '0063'].join('-'),
})
const pw = ['synthetic', 'offer', 'passphrase', '63'].join(' ')
const SIGNED_IN = ['owner', 'office', 'estimator', 'worker'] as const
type Person = (typeof SIGNED_IN)[number]
const CREW = ['ann', 'ben', 'cal'] as const
type Crew = (typeof CREW)[number]

let t: TestDatabase
let wide: Db
let app: FastifyInstance
let gated: FastifyInstance
const cookies = {} as Record<Person, string>
const csrf = {} as Record<Person, string>
const gatedSession = { cookie: '', csrf: '' }
const ids = {} as Record<Person | Crew, string>
const blockedJobs = new Set<string>()
const TEST_GATE: WorkVisitGate = {
  source: 'test',
  unmet: async (_tx, job) => (blockedJobs.has(job.jobId) ? ['SYNTHETIC_GATE_UNMET'] : []),
}

const today = () => localDateOf(new Date(), ZONE)
const day = (n: number) => addLocalDays(today(), n)
/** Every weekday 08:00-20:00: a synthetic fixture. */
const WEEK = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, start: '08:00', end: '20:00' }))

async function signIn(server: FastifyInstance, p: Person): Promise<[string, string]> {
  const res = await server.inject({
    method: 'POST',
    url: '/api/v1/staff/auth/sign-in',
    headers: { 'x-forwarded-for': '198.51.100.163' },
    payload: { email: `${p}-offers@example.test`, password: pw },
  })
  expect(res.statusCode, res.body).toBe(200)
  const cookie = String(res.headers['set-cookie']).split(';')[0] as string
  const session = await server.inject({ method: 'GET', url: '/api/v1/staff/auth/session', headers: { cookie } })
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
const codes = (body: string): [string, string][] =>
  JSON.parse(body).error.fieldErrors.map((f: { field: string; code: string }) => [f.field, f.code])

beforeAll(async () => {
  t = await createTestDatabase()
  wide = createDb(t.url, { max: 16, applicationName: 'offers-test' })
  await syncServices(t.db, loadServiceSeed())
  const config = testConfig({ TRUST_PROXY_HOPS: '1' })
  app = await buildApp({ config, api: { db: wide, codeKey: KEY, storage: new FakeObjectStorage() } })
  // The gated server's visits and portal modules are given only the test gate (no registered deposit gate).
  const modules = apiModules({ secureCookies: false, mfaKey: null, codeKey: KEY, trustProxyHops: 1 }).map((m) =>
    m.name === 'visits'
      ? visitsModule({ workVisitGates: [TEST_GATE] })
      : m.name === 'portal'
        ? portalModule({ codeKey: KEY, trustProxyHops: 1, testMark: true, workVisitGates: [TEST_GATE] })
        : m,
  )
  gated = await buildApp({ config, api: { db: wide, modules } })
  const hash = await hashPassword(pw)
  await withTx(t.db, async (tx) => {
    for (const p of SIGNED_IN) {
      const user = await createStaffUser(tx, {
        email: `${p}-offers@example.test`,
        displayName: `Synthetic ${p}`,
        locale: p === 'office' ? 'es' : 'en',
        role: p,
        issuedBy: 'test',
      })
      await setPasswordHash(tx, user.id, hash)
      ids[p] = user.id
    }
    for (const c of CREW) {
      const user = await createStaffUser(tx, {
        email: `${c}-crew-offers@example.test`,
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
  for (const p of SIGNED_IN) [cookies[p], csrf[p]] = await signIn(app, p)
  ;[gatedSession.cookie, gatedSession.csrf] = await signIn(gated, 'owner')
  for (const c of CREW) {
    const res = await staffWrite('owner', 'PUT', `/api/v1/staff/workers/${ids[c]}/working-hours`, { periods: WEEK }, 0)
    expect(res.statusCode, res.body).toBe(200)
  }
})
afterAll(async () => {
  await app?.close()
  await gated?.close()
  await wide?.destroy()
  await t?.drop()
})

const ALL_OK = Object.fromEntries(
  ['coverage', 'service_fit', 'essential_facts', 'urgency', 'site_visit_need', 'staff_equipment', 'risk_flags'].map(
    (c) => [c, { outcome: 'ok' }],
  ),
)
type Project = {
  requestId: string
  projectId: string
  reference: string
  contactId: string
  grantId: string
  street: string
  cookie: string
}
let ip = 20

/** A qualified synthetic request with "Site visit needed", and a verified customer session for its project. */
async function siteVisitProject(): Promise<Project> {
  const street = `${++seq} Synthetic Offer Lane`
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/public/requests',
    headers: { 'idempotency-key': key('submit'), 'x-forwarded-for': `198.51.100.${++ip}` },
    payload: {
      formVersion: 'test-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-01' }],
      notSure: false,
      description: 'Synthetic window-offer project.',
      answers: [],
      property: { street, city: 'Testville', state: 'ky', zip: '40000', propertyType: 'house' },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'site_visit',
      contact: {
        fullName: 'Synthetic Offer Customer',
        email: `offers-${seq}-${randomUUID().slice(0, 8)}@example.test`,
        phone: '(502) 555-0163',
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
    .select(['id', 'project_id', 'contact_id'])
    .where('reference', '=', reference)
    .executeTakeFirstOrThrow()
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
    { customerExplanation: 'We need to see the synthetic ceiling.', workPackages: ['SVC-DW-01'] },
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
    reference,
    contactId: row.contact_id,
    grantId: grant.id,
    street,
    cookie: `__Host-hh_customer=${s.token}`,
  }
}

/**
 * Approves an estimate for the project through the real approval transaction, so its job, task and deposit
 * requirement exist. One synthetic patch at the given unit price (default $12.50: no deposit required).
 */
async function approve(p: Project, unitPriceCents = 1250): Promise<string> {
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
          description: 'Patch the synthetic ceiling',
          quantity: '1',
          unit: 'patch',
          unitPriceCents,
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
      'x-forwarded-for': `2001:db8:63:${++ip}::1`,
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
      fullName: 'Synthetic Offer Customer',
    },
  })
  expect(res.statusCode, res.body).toBe(201)
  return (
    await t.db.selectFrom('work.jobs').select('id').where('project_id', '=', p.projectId).executeTakeFirstOrThrow()
  ).id
}

type Assignment = {
  id: string
  resource: string
  worker: { id: string; name: string | null } | null
  role: string | null
  kind: string
  startsAt: string
  endsAt: string
  holdExpiresAt: string | null
  endedAt: string | null
  endedReason: string | null
  offerNumber: number | null
  offerPosition: number | null
}
type OfferView = {
  id: string
  number: number
  state: string
  held: boolean
  version: number
  offeredAt: string
  expiresAt: string
  holdHours: number
  preparationInstructions: string | null
  windows: { position: number; window: { localDate: string; start: string; startsAt: string } }[]
  selectedPosition: number | null
  closedReason: string | null
  customerNote: string | null
  noticeKey: string | null
  notices: { messageKey: string; channel: string; state: string; errorCode: string | null }[]
  actions: { withdraw: boolean }
}
type VisitView = {
  id: string
  purpose: string
  state: string
  version: number
  jobId: string | null
  window: { localDate: string; start: string; end: string; startsAt: string; endsAt: string }
  windowVersion: number
  assignments: Assignment[]
  offers: OfferView[]
  notices: { messageKey: string; channel: string; state: string; errorCode: string | null }[]
  actions: { changeWindow: boolean; confirm: boolean; offerWindows: boolean }
}
type Visits = {
  visits: VisitView[]
  schedulingTask: { state: string } | null
  windowOffers: { holdHours: number; minWindows: number; maxWindows: number; proposed: boolean } | null
}

const projectVisits = async (projectId: string, who: Person = 'office') => {
  const res = await staffGet(who, `/api/v1/staff/projects/${projectId}/visits`)
  expect(res.statusCode, res.body).toBe(200)
  return res.json<Visits>()
}
const visitOf = async (projectId: string, visitId: string) =>
  (await projectVisits(projectId)).visits.find((v) => v.id === visitId) as VisitView

type Plan = { date: string; start?: string; end?: string; workers?: number; purpose?: string; duration?: number }
async function planVisit(p: Project, plan: Plan): Promise<VisitView> {
  const res = await staffWrite('office', 'POST', `/api/v1/staff/projects/${p.projectId}/visits`, {
    purpose: plan.purpose ?? 'site_estimate',
    localDate: plan.date,
    windowStart: plan.start ?? '09:00',
    windowEnd: plan.end ?? '10:00',
    expectedDurationMinutes: plan.duration ?? 60,
    travelBufferMinutes: 30,
    preparationBufferMinutes: 0,
    requiredWorkers: plan.workers ?? 1,
    equipment: [],
  })
  expect(res.statusCode, res.body).toBe(201)
  const all = res.json<Visits>().visits
  return all[all.length - 1] as VisitView
}
type Win = { localDate: string; windowStart: string; windowEnd: string }
const win = (date: string, start: string, end: string): Win => ({ localDate: date, windowStart: start, windowEnd: end })
/** Three windows on one day: 09-10, 12-13, 15-16 (each holds 08:30 to two hours after the arrival window ends). */
const threeWindows = (date: string) => [
  win(date, '09:00', '10:00'),
  win(date, '12:00', '13:00'),
  win(date, '15:00', '16:00'),
]

const offer = (
  who: Person,
  v: VisitView,
  windows: Win[],
  workers: Crew[],
  extra: Record<string, unknown> = {},
  server = app,
) =>
  server.inject({
    method: 'POST',
    url: `/api/v1/staff/visits/${v.id}/offers`,
    payload: { windows, workerIds: workers.map((w) => ids[w]), ...extra },
    headers: {
      cookie: server === app ? cookies[who] : gatedSession.cookie,
      'x-csrf-token': server === app ? csrf[who] : gatedSession.csrf,
      'idempotency-key': key('offer'),
      'if-match': `"${v.version}"`,
    },
  })
async function offered(p: Project, v: VisitView, windows: Win[], workers: Crew[], extra = {}) {
  const res = await offer('office', v, windows, workers, extra)
  expect(res.statusCode, res.body).toBe(201)
  const visit = res.json<Visits>().visits.find((x) => x.id === v.id) as VisitView
  return { visit, offer: visit.offers[0] as OfferView }
}

const customerPost = (p: Project, number: number, what: 'select' | 'other-times', payload: object) =>
  app.inject({
    method: 'POST',
    url: `/api/v1/customer/projects/${p.reference}/window-offers/${number}/${what}`,
    payload,
    headers: {
      cookie: p.cookie,
      'idempotency-key': key('customer'),
      'x-forwarded-for': `203.0.113.${(++ip % 200) + 1}`,
    },
  })
const select = (p: Project, number: number, position: number) => customerPost(p, number, 'select', { position })
const appointmentsTab = async (p: Project) => {
  const res = await app.inject({
    method: 'GET',
    url: `/api/v1/customer/projects/${p.reference}/appointments`,
    headers: { cookie: p.cookie },
  })
  expect(res.statusCode, res.body).toBe(200)
  return res.json<{
    state: string
    offers?: { number: number; purpose: string; status: string; expiresAt: string; windows: { position: number }[] }[]
    appointments?: {
      purpose: string
      status: string
      window: { localDate: string; start: string; end: string; timeZone: string }
      address: { street: string; city: string }
      preparationInstructions: string | null
    }[]
  }>()
}
const reservationsOf = (visitId: string) =>
  t.db
    .selectFrom('work.reservations')
    .select(['id', 'staff_user_id', 'kind', 'offer_position', 'ended_reason', 'hold_expires_at', 'starts_at'])
    .where('visit_id', '=', visitId)
    .orderBy('offer_position')
    .orderBy('created_at')
    .execute()
const offerRow = (id: string) =>
  t.db.selectFrom('work.window_offers').selectAll().where('id', '=', id).executeTakeFirstOrThrow()

/** Moves an offer's stored instants back by `seconds` (see the header): as if it had been made that much earlier. */
async function age(offerId: string, seconds: number) {
  await withTx(t.db, async (tx) => {
    await sql`SET LOCAL session_replication_role = replica`.execute(tx)
    await sql`UPDATE work.window_offers SET offered_at = offered_at - make_interval(secs => ${seconds}),
                expires_at = expires_at - make_interval(secs => ${seconds}) WHERE id = ${offerId}`.execute(tx)
    await sql`UPDATE work.reservations SET hold_expires_at = hold_expires_at - make_interval(secs => ${seconds})
               WHERE offer_id = ${offerId} AND kind = 'hold'`.execute(tx)
  })
}
const HOURS_24 = 24 * 3600

describe('[HH-SCH-11][HH-LEAD-07][OWN-DEC-144] staff offer windows held for 24 hours', () => {
  it('[HH-SCH-11][OWN-DEC-99][OWN-DEC-144] 2-3 windows, each holding the whole team until 24 hours after the offer', async () => {
    const p = await siteVisitProject()
    const v = await planVisit(p, { date: day(2) })
    expect(v.actions.offerWindows).toBe(true)
    const listed = await projectVisits(p.projectId)
    expect(listed.windowOffers).toEqual({ holdHours: 24, minWindows: 2, maxWindows: 3, proposed: false })
    const { visit, offer: o } = await offered(p, v, threeWindows(day(2)), ['ann'], {
      preparationInstructions: 'Synthetic: please clear a path to the ceiling.',
    })
    expect(o).toMatchObject({
      number: 1,
      state: 'open',
      held: true,
      holdHours: 24,
      noticeKey: 'estimate_visit.options',
      preparationInstructions: 'Synthetic: please clear a path to the ceiling.',
      actions: { withdraw: true },
    })
    expect(Date.parse(o.expiresAt) - Date.parse(o.offeredAt)).toBe(HOURS_24 * 1000)
    expect(o.windows.map((w) => [w.position, w.window.start])).toEqual([
      [1, '09:00'],
      [2, '12:00'],
      [3, '15:00'],
    ])
    // A hold is not a booking: the visit stays tentative, and it cannot be confirmed or moved by staff meanwhile.
    expect(visit).toMatchObject({
      state: 'tentative',
      actions: { confirm: false, changeWindow: false, offerWindows: false },
    })
    const holds = await reservationsOf(v.id)
    expect(holds.map((h) => [h.offer_position, h.kind, h.staff_user_id])).toEqual([
      [1, 'hold', ids.ann],
      [2, 'hold', ids.ann],
      [3, 'hold', ids.ann],
    ])
    const row = await offerRow(o.id)
    for (const h of holds) expect(new Date(h.hold_expires_at as Date).getTime()).toBe(row.expires_at.getTime())
    // The committed event of the automatic options notice, the scheduled expiry and the audit.
    const events = await t.db
      .selectFrom('platform.outbox_events')
      .select(['type', 'aggregate_id'])
      .where('aggregate_id', '=', o.id)
      .execute()
    expect(events).toEqual([{ type: 'estimate_visit.windows_published', aggregate_id: o.id }])
    const job = await t.db
      .selectFrom('platform.jobs')
      .select(['automation', 'run_at', 'target_id'])
      .where('target_id', '=', o.id)
      .executeTakeFirstOrThrow()
    expect(job).toMatchObject({ automation: 'visit.window_offer_expiry', target_id: o.id })
    expect(new Date(job.run_at).getTime()).toBe(row.expires_at.getTime())
    const audit = await t.db
      .selectFrom('platform.audit_events')
      .select(['action', 'summary'])
      .where('target_id', '=', o.id)
      .execute()
    expect(audit.map((a) => a.action)).toEqual(['visit.offer_windows'])
    expect(audit[0]?.summary).toMatchObject({ holdHours: 24, number: 1, workers: [ids.ann] })
    // One open offer per visit; staff confirmations and window changes go through the offer.
    expect(codes((await offer('office', visit, threeWindows(day(2)), ['ben'])).body)).toEqual([['offer', 'OFFER_OPEN']])
    const confirm = await staffWrite(
      'office',
      'POST',
      `/api/v1/staff/visits/${v.id}/confirm`,
      { workerIds: [ids.ben] },
      visit.version,
    )
    expect(codes(confirm.body)).toEqual([['offer', 'OFFER_OPEN']])
    const move = await staffWrite(
      'office',
      'POST',
      `/api/v1/staff/visits/${v.id}/window`,
      win(day(2), '11:00', '12:00'),
      visit.version,
    )
    expect(codes(move.body)).toEqual([['offer', 'OFFER_OPEN']])
    // The database itself refuses the same.
    await expect(
      sql`UPDATE work.visits SET window_reason = 'x', version = version + 1 WHERE id = ${v.id}`.execute(t.db),
    ).rejects.toThrow()
    await expect(
      sql`UPDATE work.visits SET expected_duration_minutes = 30, version = version + 1 WHERE id = ${v.id}`.execute(
        t.db,
      ),
    ).rejects.toThrow(/changes only through its offer/)
    await expect(
      sql`UPDATE work.window_offers SET expires_at = expires_at + interval '1 day' WHERE id = ${o.id}`.execute(t.db),
    ).rejects.toThrow(/keeps its visit, windows and hold/)
    await expect(sql`DELETE FROM work.window_offers WHERE id = ${o.id}`.execute(t.db)).rejects.toThrow(/never deleted/)
  })

  it('[OWN-DEC-99][HH-SCH-04] the number of windows is the configured policy; their ranges may not overlap', async () => {
    const p = await siteVisitProject()
    const v = await planVisit(p, { date: day(3) })
    const one = await offer('office', v, [win(day(3), '09:00', '10:00')], ['ann'])
    expect(one.statusCode).toBe(400)
    expect(codes(one.body)).toEqual([['body.windows', 'OFFER_WINDOW_COUNT']])
    const four = await offer('office', v, [...threeWindows(day(3)), win(day(3), '18:00', '18:30')], ['ann'])
    expect(codes(four.body)).toEqual([['body.windows', 'OFFER_WINDOW_COUNT']])
    const overlap = await offer('office', v, [win(day(3), '09:00', '10:00'), win(day(3), '10:30', '11:00')], ['ann'])
    expect(codes(overlap.body)).toEqual([['body.windows[1]', 'OFFER_WINDOWS_OVERLAP']])
    const past = await offer('office', v, [win(day(-1), '09:00', '10:00'), win(day(3), '12:00', '13:00')], ['ann'])
    expect(codes(past.body)).toContainEqual(['body.windows[0].localDate', 'WINDOW_IN_PAST'])
    // The team is the visit's: exactly its number of workers.
    expect(codes((await offer('office', v, threeWindows(day(3)), ['ann', 'ben'])).body)).toEqual([
      ['body.workerIds', 'WORKER_COUNT_MISMATCH'],
    ])
    // Nothing was written by any refusal.
    expect(await reservationsOf(v.id)).toEqual([])
    expect(await t.db.selectFrom('work.window_offers').select('id').where('visit_id', '=', v.id).execute()).toEqual([])
    // NOT CONFIGURED while the policy is unset; the decided value restored.
    await recordPolicyVersion(t.db, {
      key: 'scheduling.window_offers',
      value: null,
      sourceIds: ['TEST-SYNTHETIC'],
      changedBy: 'test',
      reason: 'synthetic: unset for the test',
    })
    try {
      const unset = await offer('office', v, threeWindows(day(3)), ['ann'])
      expect(unset.statusCode).toBe(503)
      expect(codes(unset.body)).toEqual([['scheduling.window_offers', 'WINDOW_OFFERS_NOT_CONFIGURED']])
      expect((await visitOf(p.projectId, v.id)).actions.offerWindows).toBe(false)
    } finally {
      await recordPolicyVersion(t.db, {
        key: 'scheduling.window_offers',
        value: { holdHours: 24, minWindows: 2, maxWindows: 3 },
        sourceIds: ['OWN-DEC-144', 'OWN-DEC-99', 'OWN-DEC-105'],
        changedBy: 'test',
        reason: 'synthetic: the decided value again',
      })
    }
    expect((await offer('office', v, threeWindows(day(3)), ['ann'])).statusCode).toBe(201)
  })

  it('[T38][HH-SCH-04] a held window is not offered to another customer nor confirmed for anyone else', async () => {
    const first = await siteVisitProject()
    const second = await siteVisitProject()
    const a = await planVisit(first, { date: day(4) })
    await offered(first, a, threeWindows(day(4)), ['ben'])
    const b = await planVisit(second, { date: day(4) })
    const refused = await offer('office', b, [win(day(4), '12:00', '13:00'), win(day(4), '18:00', '18:30')], ['ben'])
    expect(refused.statusCode, refused.body).toBe(409)
    expect(codes(refused.body)).toEqual([[`windows[0].workers.${ids.ben}`, 'WORKER_BOOKED']])
    // The loser gets alternatives: another free worker for that window.
    const alt = refused.json<{ error: { alternatives: { workers: { id: string }[] } } }>().error.alternatives
    expect(alt.workers.map((w) => w.id)).toContain(ids.cal)
    const c = await planVisit(second, { date: day(4), start: '12:00', end: '13:00' })
    const confirm = await staffWrite(
      'office',
      'POST',
      `/api/v1/staff/visits/${c.id}/confirm`,
      { workerIds: [ids.ben] },
      c.version,
    )
    expect(codes(confirm.body)).toContainEqual([`workers.${ids.ben}`, 'WORKER_BOOKED'])
    // The other customer is offered windows with another worker instead.
    expect(
      (await offer('office', b, [win(day(4), '12:00', '13:00'), win(day(4), '18:00', '18:30')], ['cal'])).statusCode,
    ).toBe(201)
  })

  it('[T38][HH-SCH-04] two staff offering the same last capacity to two customers at once: one offer, one conflict', async () => {
    const one = await siteVisitProject()
    const two = await siteVisitProject()
    const a = await planVisit(one, { date: day(5) })
    const b = await planVisit(two, { date: day(5) })
    const [ra, rb] = await Promise.all([
      offer('office', a, threeWindows(day(5)), ['cal']),
      offer('owner', b, threeWindows(day(5)), ['cal']),
    ])
    expect([ra.statusCode, rb.statusCode].sort()).toEqual([201, 409])
    const loser = ra.statusCode === 409 ? a : b
    expect(await reservationsOf(loser.id)).toEqual([])
    expect(await t.db.selectFrom('work.window_offers').select('id').where('visit_id', '=', loser.id).execute()).toEqual(
      [],
    )
    const holds = await t.db
      .selectFrom('work.reservations')
      .select('visit_id')
      .where('staff_user_id', '=', ids.cal)
      .where('ended_at', 'is', null)
      .where('visit_id', 'in', [a.id, b.id])
      .execute()
    expect(holds).toHaveLength(3)
  })
})

describe('[HH-SCH-11][HH-LEAD-07][T37] the customer selects one window in the portal', () => {
  it('[HH-SCH-11][T37][OWN-DEC-99] selecting confirms the Estimate visit and releases the other windows', async () => {
    const p = await siteVisitProject()
    const v = await planVisit(p, { date: day(6) })
    const { offer: o } = await offered(p, v, threeWindows(day(6)), ['ann'], {
      preparationInstructions: 'Synthetic: keep pets in another room.',
    })
    const tab = await appointmentsTab(p)
    expect(tab.state).toBe('listed')
    expect(tab.offers).toEqual([
      expect.objectContaining({ number: 1, purpose: 'estimate_visit', status: 'open', expiresAt: o.expiresAt }),
    ])
    expect(tab.appointments).toEqual([])
    // The customer view never names a worker, a hold or an internal ID.
    const raw = JSON.stringify(tab)
    for (const secret of [ids.ann, 'Synthetic ann', v.id, o.id, 'hold']) expect(raw).not.toContain(secret)
    // The Overview asks the customer to choose (PortalFacts.visitWindowsOffered).
    const overview = await app.inject({
      method: 'GET',
      url: `/api/v1/customer/projects/${p.reference}/overview`,
      headers: { cookie: p.cookie },
    })
    expect(overview.json().status).toMatchObject({ step: 'choose_visit_window', nextAction: 'choose_visit_window' })
    const before = await reservationsOf(v.id)

    const res = await select(p, 1, 2)
    expect(res.statusCode, res.body).toBe(200)
    const after = res.json<Awaited<ReturnType<typeof appointmentsTab>>>()
    expect(after.offers).toEqual([])
    expect(after.appointments).toEqual([
      {
        number: 1,
        purpose: 'estimate_visit',
        status: 'confirmed',
        window: expect.objectContaining({ localDate: day(6), start: '12:00', end: '13:00', timeZone: ZONE }),
        address: expect.objectContaining({ street: p.street, city: 'Testville' }),
        preparationInstructions: 'Synthetic: keep pets in another room.',
        // TSK-0066: the customer may ask to reschedule or cancel a confirmed appointment.
        request: null,
        actions: { requestReschedule: true, requestCancellation: true },
      },
    ])
    // The selected window's hold became the confirmed reservation (the same row); the others were released.
    const rows = await reservationsOf(v.id)
    expect(rows.map((r) => [r.offer_position, r.kind, r.ended_reason])).toEqual([
      [1, 'hold', 'hold_released'],
      [2, 'confirmed', null],
      [3, 'hold', 'hold_released'],
    ])
    expect(rows.find((r) => r.offer_position === 2)?.id).toBe(before.find((r) => r.offer_position === 2)?.id)
    const visit = await visitOf(p.projectId, v.id)
    expect(visit).toMatchObject({ state: 'confirmed', jobId: null, purpose: 'site_estimate', windowVersion: 2 })
    expect(visit.window).toMatchObject({ localDate: day(6), start: '12:00', end: '13:00' })
    expect(visit.offers[0]).toMatchObject({ state: 'selected', selectedPosition: 2, held: false })
    // T37: an Estimate visit creates no job and approves no price.
    expect(await t.db.selectFrom('work.jobs').select('id').where('project_id', '=', p.projectId).execute()).toEqual([])
    expect(
      (await t.db.selectFrom('crm.projects').select('state').where('id', '=', p.projectId).executeTakeFirstOrThrow())
        .state,
    ).toBe('open')
    // The committed event of the confirmation notice, and the Overview shows the appointment.
    const events = await t.db
      .selectFrom('platform.outbox_events')
      .select('type')
      .where('aggregate_id', '=', v.id)
      .execute()
    expect(events.map((e) => e.type)).toEqual(['estimate_visit.reserved'])
    const o2 = await app.inject({
      method: 'GET',
      url: `/api/v1/customer/projects/${p.reference}/overview`,
      headers: { cookie: p.cookie },
    })
    expect(o2.json()).toMatchObject({
      status: { situation: 'scheduled', step: 'view_appointment' },
      appointment: { purpose: 'estimate_visit', status: 'confirmed', window: { start: '12:00' } },
    })
    // The same customer selecting the same window again (another tab, a retry) gets the same answer; another window
    // is refused, and nothing changes.
    expect((await select(p, 1, 2)).statusCode).toBe(200)
    const other = await select(p, 1, 3)
    expect(other.statusCode).toBe(409)
    expect(codes(other.body)).toEqual([['offer', 'OFFER_SELECTED']])
    expect(await reservationsOf(v.id)).toEqual(rows)
    expect(
      (await t.db.selectFrom('platform.outbox_events').select('type').where('aggregate_id', '=', v.id).execute())
        .length,
    ).toBe(1)
    const audit = await t.db
      .selectFrom('platform.audit_events')
      .select(['action', 'actor_kind'])
      .where('target_id', '=', o.id)
      .orderBy('seq')
      .execute()
    expect(audit.map((a) => a.action)).toEqual(['visit.offer_windows', 'visit.select_window', 'visit.select_window'])
  })

  it('[T38][HH-SCH-04] two tabs selecting different windows at once: exactly one confirmation, nothing partial', async () => {
    const p = await siteVisitProject()
    const v = await planVisit(p, { date: day(7), workers: 2 })
    await offered(p, v, threeWindows(day(7)), ['ann', 'ben'])
    const results = await Promise.all([select(p, 1, 1), select(p, 1, 2), select(p, 1, 3)])
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409, 409])
    for (const r of results.filter((x) => x.statusCode === 409))
      expect(codes(r.body)).toEqual([['offer', 'OFFER_SELECTED']])
    const active = (await reservationsOf(v.id)).filter((r) => r.ended_reason === null)
    expect(active).toHaveLength(2)
    expect(new Set(active.map((r) => r.kind))).toEqual(new Set(['confirmed']))
    expect(new Set(active.map((r) => r.offer_position)).size).toBe(1)
    expect((await visitOf(p.projectId, v.id)).state).toBe('confirmed')
  })

  it('[HH-SCH-04][OWN-DEC-144] selection rechecks availability: a window that can no longer be kept changes nothing', async () => {
    const p = await siteVisitProject()
    const v = await planVisit(p, { date: day(8) })
    const { offer: o } = await offered(p, v, threeWindows(day(8)), ['cal'])
    // Approved time off recorded after the offer touches window 1 (it flags the hold, never cancels it).
    const off = await staffWrite('owner', 'POST', `/api/v1/staff/workers/${ids.cal}/time-off`, {
      startDate: day(8),
      startTime: '08:00',
      endDate: day(8),
      endTime: '11:00',
    })
    expect(off.statusCode, off.body).toBe(201)
    const refused = await select(p, 1, 1)
    expect(refused.statusCode).toBe(409)
    expect(codes(refused.body)).toEqual([['body.position', 'WINDOW_UNAVAILABLE']])
    expect(refused.body).not.toContain(ids.cal)
    expect((await offerRow(o.id)).state).toBe('open')
    expect((await reservationsOf(v.id)).every((r) => r.kind === 'hold' && r.ended_reason === null)).toBe(true)
    // Another offered window is still available.
    expect((await select(p, 1, 3)).statusCode).toBe(200)
    expect((await visitOf(p.projectId, v.id)).window.start).toBe('15:00')
  })

  it('[HH-SCH-11][OWN-DEC-99] the customer asks for other times without restarting: the holds are released', async () => {
    const p = await siteVisitProject()
    const v = await planVisit(p, { date: day(9) })
    const { offer: o } = await offered(p, v, threeWindows(day(9)), ['ann'])
    const res = await customerPost(p, 1, 'other-times', { note: 'Synthetic: evenings after six work better.' })
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json().offers).toEqual([expect.objectContaining({ number: 1, status: 'other_times_requested' })])
    expect((await reservationsOf(v.id)).map((r) => r.ended_reason)).toEqual([
      'hold_released',
      'hold_released',
      'hold_released',
    ])
    const visit = await visitOf(p.projectId, v.id)
    expect(visit).toMatchObject({ state: 'tentative', actions: { offerWindows: true } })
    expect(visit.offers[0]).toMatchObject({
      state: 'other_times_requested',
      customerNote: 'Synthetic: evenings after six work better.',
    })
    // Staff get one queue item; it resolves when new windows are offered.
    const item = () =>
      t.db
        .selectFrom('ops.queue_items')
        .select(['reason', 'resolved_at', 'resolution', 'reference'])
        .where('type', '=', 'window_offer_response')
        .where('subject_id', '=', p.requestId)
        .execute()
    expect(await item()).toEqual([
      { reason: 'window_other_times_requested', resolved_at: null, resolution: null, reference: p.reference },
    ])
    expect(codes((await select(p, 1, 1)).body)).toEqual([['offer', 'OFFER_OTHER_TIMES_REQUESTED']])
    // The customer's words stay on the offer, never in the audit.
    const audit = await t.db
      .selectFrom('platform.audit_events')
      .select('summary')
      .where('target_id', '=', o.id)
      .execute()
    expect(JSON.stringify(audit)).not.toContain('evenings')
    const again = await offer('office', visit, [win(day(9), '18:00', '18:30'), win(day(10), '18:00', '18:30')], ['ann'])
    expect(again.statusCode, again.body).toBe(201)
    expect((await item())[0]).toMatchObject({ resolution: 'new_offer' })
    expect((await appointmentsTab(p)).offers?.map((x) => [x.number, x.status])).toEqual([[2, 'open']])
  })

  it('[HH-SCH-11] staff withdraw an open offer with a reason: every hold is released', async () => {
    const p = await siteVisitProject()
    const v = await planVisit(p, { date: day(11) })
    const { offer: o } = await offered(p, v, threeWindows(day(11)), ['ben'])
    const path = `/api/v1/staff/window-offers/${o.id}/withdraw`
    expect((await staffWrite('worker', 'POST', path, { reason: 'x' }, o.version)).statusCode).toBe(403)
    expect(
      (await staffWrite('office', 'POST', path, { reason: 'Synthetic: crew changed' }, o.version + 1)).json().error
        .code,
    ).toBe('STALE_VERSION')
    expect((await staffWrite('office', 'POST', path, {}, o.version)).statusCode).toBe(400)
    const res = await staffWrite('office', 'POST', path, { reason: 'Synthetic: crew changed' }, o.version)
    expect(res.statusCode, res.body).toBe(200)
    expect((await reservationsOf(v.id)).map((r) => r.ended_reason)).toEqual([
      'hold_released',
      'hold_released',
      'hold_released',
    ])
    expect(codes((await select(p, 1, 1)).body)).toEqual([['offer', 'OFFER_WITHDRAWN']])
    expect(codes((await staffWrite('office', 'POST', path, { reason: 'again' }, o.version + 1)).body)).toEqual([
      ['offer', 'OFFER_WITHDRAWN'],
    ])
    // A withdrawn offer is not shown to the customer.
    expect((await appointmentsTab(p)).state).toBe('none')
  })
})

describe('[OWN-DEC-144][HH-SCH-05][T38] unselected holds release after 24 hours', () => {
  it('[OWN-DEC-144][HH-SCH-05] the expiry frees the capacity, expires the visit and never touches confirmed reservations', async () => {
    const p = await siteVisitProject()
    const other = await siteVisitProject()
    const v = await planVisit(p, { date: day(12) })
    const { offer: o } = await offered(p, v, threeWindows(day(12)), ['ann'])
    // A confirmed booking of another worker at the same time, and a selected offer of ann on another day.
    const booked = await planVisit(other, { date: day(12) })
    expect(
      (
        await staffWrite(
          'office',
          'POST',
          `/api/v1/staff/visits/${booked.id}/confirm`,
          { workerIds: [ids.ben] },
          booked.version,
        )
      ).statusCode,
    ).toBe(200)
    // Not due yet: the expiry refuses to run early (the job retries).
    await expect(withTx(t.db, (tx) => expireOfferIfDue(tx, o.id))).rejects.toThrow(/not due/)
    await expect(
      sql`UPDATE work.window_offers SET state = 'expired', version = version + 1 WHERE id = ${o.id}`.execute(t.db),
    ).rejects.toThrow(/only when its hold has ended/)
    await age(o.id, HOURS_24 + 60)
    // Past the hold time the customer can no longer select, and the database refuses it too.
    expect(codes((await select(p, 1, 1)).body)).toEqual([['offer', 'OFFER_EXPIRED']])
    expect((await appointmentsTab(p)).offers?.map((x) => x.status)).toEqual(['expired'])
    await expect(
      sql`UPDATE work.window_offers SET state = 'selected', selected_position = 1, selected_by_contact = 'x',
            version = version + 1 WHERE id = ${o.id}`.execute(t.db),
    ).rejects.toThrow(/only while it is held/)
    // The scheduled job runs the expiry.
    const registry = createAutomationRegistry([windowOfferExpiryAutomation()])
    await sql`UPDATE platform.jobs SET run_at = now() WHERE target_id = ${o.id}`.execute(t.db)
    await createWorker({ db: t.db, registry }).runOnce()
    expect((await offerRow(o.id)).state).toBe('expired')
    expect((await reservationsOf(v.id)).map((r) => [r.kind, r.ended_reason])).toEqual([
      ['hold', 'hold_expired'],
      ['hold', 'hold_expired'],
      ['hold', 'hold_expired'],
    ])
    expect((await visitOf(p.projectId, v.id)).state).toBe('expired')
    const bookedRows = await reservationsOf(booked.id)
    expect(bookedRows.map((r) => [r.kind, r.ended_reason])).toEqual([['confirmed', null]])
    // A second run (a retry) changes nothing; the freed capacity can be booked by another customer.
    expect(await withTx(t.db, (tx) => expireOfferIfDue(tx, o.id))).toBe('unchanged')
    const next = await planVisit(other, { date: day(12) })
    expect(
      (
        await staffWrite(
          'office',
          'POST',
          `/api/v1/staff/visits/${next.id}/confirm`,
          { workerIds: [ids.ann] },
          next.version,
        )
      ).statusCode,
    ).toBe(200)
    const item = await t.db
      .selectFrom('ops.queue_items')
      .select(['reason', 'resolved_at'])
      .where('type', '=', 'window_offer_response')
      .where('subject_id', '=', p.requestId)
      .executeTakeFirstOrThrow()
    expect(item).toEqual({ reason: 'window_offer_expired', resolved_at: null })
    // Staff offer new windows on a new visit: the customer sees the new offer, no longer the expired one.
    expect((await appointmentsTab(p)).offers?.map((x) => [x.number, x.status])).toEqual([[1, 'expired']])
    const renewed = await planVisit(p, { date: day(18) })
    expect((await offer('office', renewed, threeWindows(day(18)), ['ann'])).statusCode).toBe(201)
    expect((await appointmentsTab(p)).offers?.map((x) => [x.number, x.status])).toEqual([[2, 'open']])
    const audit = await t.db
      .selectFrom('platform.audit_events')
      .select(['action', 'actor_kind'])
      .where('action', '=', 'visit.window_offer_expire')
      .execute()
    expect(audit.length).toBeGreaterThan(0)
  })

  it('[T38][OWN-DEC-144] a selection and the expiry at the same moment: the first to lock the offer wins, never both', async () => {
    const holder = createDb(t.url, { max: 1, applicationName: 'offers-race' })
    try {
      // The selection first: it began while the windows were held and waits for the offer lock; the expiry, begun
      // after the hold time, waits behind it, then finds the offer selected and leaves it (and the booking) alone.
      const p = await siteVisitProject()
      const v = await planVisit(p, { date: day(13) })
      const { offer: o } = await offered(p, v, threeWindows(day(13)), ['ben'])
      await age(o.id, HOURS_24 - 2)
      const first: { selection?: ReturnType<typeof select>; expiry?: Promise<string> } = {}
      await withTx(holder, async (tx) => {
        await sql`SELECT id FROM work.window_offers WHERE id = ${o.id} FOR UPDATE`.execute(tx)
        first.selection = select(p, 1, 1)
        await waitForLocks(1)
        await new Promise((r) => setTimeout(r, 2500))
        first.expiry = withTx(t.db, (other) => expireOfferIfDue(other, o.id))
        await waitForLocks(2)
      })
      const selected = await (first.selection as ReturnType<typeof select>)
      expect(selected.statusCode, selected.body).toBe(200)
      expect(await first.expiry).toBe('unchanged')
      expect((await offerRow(o.id)).state).toBe('selected')
      expect((await visitOf(p.projectId, v.id)).state).toBe('confirmed')
      expect((await reservationsOf(v.id)).filter((r) => r.ended_reason === null).map((r) => r.kind)).toEqual([
        'confirmed',
      ])

      // The expiry first: the selection waits for it, then finds the offer expired and changes nothing.
      const q = await siteVisitProject()
      const w = await planVisit(q, { date: day(14) })
      const { offer: o2 } = await offered(q, w, threeWindows(day(14)), ['ben'])
      await age(o2.id, HOURS_24 + 1)
      const second: { selection?: ReturnType<typeof select> } = {}
      await withTx(holder, async (tx) => {
        expect(await expireOfferIfDue(tx, o2.id)).toBe('expired')
        second.selection = select(q, 1, 1)
        await waitForLocks(1)
      })
      const res = await (second.selection as ReturnType<typeof select>)
      expect(res.statusCode, res.body).toBe(409)
      expect(codes(res.body)).toEqual([['offer', 'OFFER_EXPIRED']])
      expect((await visitOf(q.projectId, w.id)).state).toBe('expired')
      expect((await reservationsOf(w.id)).every((r) => r.ended_reason === 'hold_expired')).toBe(true)
    } finally {
      await holder.destroy()
    }
  })
})

/** Waits until at least `n` sessions of this test's database are blocked on a lock. */
async function waitForLocks(n: number) {
  let waiting = 0
  for (let i = 0; i < 250 && waiting < n; i++) {
    const w = await sql<{ n: string }>`
      SELECT count(*) AS n FROM pg_stat_activity
       WHERE datname = current_database() AND wait_event_type = 'Lock'`.execute(t.db)
    waiting = Number(w.rows[0]?.n)
    if (waiting < n) await new Promise((r) => setTimeout(r, 20))
  }
  expect(waiting).toBeGreaterThanOrEqual(n)
}

describe('[HH-SCH-11][OWN-DEC-105][T37] work visits use the same mechanism after approval', () => {
  it('[HH-SCH-11][T37][OWN-DEC-105] work windows after approval: gates, selection, the job and its scheduling task', async () => {
    const p = await siteVisitProject()
    const jobId = await approve(p)
    const v = await planVisit(p, { date: day(15), purpose: 'service' })
    expect((await offer('estimator', v, threeWindows(day(15)), ['ann'])).statusCode).toBe(403)
    blockedJobs.add(jobId)
    const gatedRes = await offer('owner', v, threeWindows(day(15)), ['ann'], {}, gated)
    expect(gatedRes.statusCode).toBe(409)
    expect(codes(gatedRes.body)).toContainEqual(['job', 'SYNTHETIC_GATE_UNMET'])
    blockedJobs.delete(jobId)
    const { offer: o } = await offered(p, v, threeWindows(day(15)), ['ann'])
    // The automatic list names no notice for work-visit windows (OQ-WORK-WINDOW-OFFER-NOTICE): none is triggered.
    expect(o.noticeKey).toBeNull()
    expect(
      await t.db.selectFrom('platform.outbox_events').select('id').where('aggregate_id', '=', o.id).execute(),
    ).toEqual([])
    const tab = await appointmentsTab(p)
    expect(tab.offers).toEqual([expect.objectContaining({ purpose: 'work_visit', status: 'open' })])
    expect((await select(p, 1, 3)).statusCode).toBe(200)
    const visits = await projectVisits(p.projectId)
    const visit = visits.visits.find((x) => x.id === v.id) as VisitView
    expect(visit).toMatchObject({ state: 'confirmed', jobId, purpose: 'service' })
    expect(visits.schedulingTask).toEqual({ state: 'fulfilled' })
    const events = await t.db
      .selectFrom('platform.outbox_events')
      .select('type')
      .where('aggregate_id', '=', v.id)
      .execute()
    expect(events.map((e) => e.type)).toEqual(['appointment.reserved'])
    expect((await appointmentsTab(p)).appointments?.map((a) => [a.purpose, a.status])).toEqual([
      ['work_visit', 'confirmed'],
    ])
  })
})

describe('[HH-SCH-06][HH-FIN-02][T36] selecting a work-visit window runs the deposit gate', () => {
  it('[HH-SCH-06][HH-FIN-02][T36][RULE-SAFETY-GATES] refused while the deposit is due, on every server; allowed after a recorded payment; estimate visits never wait', async () => {
    const p = await siteVisitProject()
    // One synthetic patch at $1,500.00, so a deposit is required (FACT-DEPOSIT-RULE).
    const jobId = await approve(p, 150_000)
    // The default server refuses to plan or offer a work visit while its deposit is due.
    const plan = {
      purpose: 'service',
      localDate: day(20),
      windowStart: '09:00',
      windowEnd: '10:00',
      expectedDurationMinutes: 60,
      travelBufferMinutes: 30,
      preparationBufferMinutes: 0,
      requiredWorkers: 1,
      equipment: [],
    }
    const refusedPlan = await staffWrite('office', 'POST', `/api/v1/staff/projects/${p.projectId}/visits`, plan)
    expect(refusedPlan.statusCode, refusedPlan.body).toBe(409)
    expect(codes(refusedPlan.body)).toContainEqual(['job', 'DEPOSIT_REQUIRED'])
    // Fixture: planned and offered on the gated server (only the test gate), as if offered before the deposit was
    // required.
    const planned = await gated.inject({
      method: 'POST',
      url: `/api/v1/staff/projects/${p.projectId}/visits`,
      payload: plan,
      headers: { cookie: gatedSession.cookie, 'x-csrf-token': gatedSession.csrf, 'idempotency-key': key('gated') },
    })
    expect(planned.statusCode, planned.body).toBe(201)
    const v = planned.json<Visits>().visits.find((x) => x.purpose === 'service') as VisitView
    const offeredRes = await offer('owner', v, threeWindows(day(20)), ['ben'], {}, gated)
    expect(offeredRes.statusCode, offeredRes.body).toBe(201)
    const o = (offeredRes.json<Visits>().visits.find((x) => x.id === v.id) as VisitView).offers[0] as OfferView
    const selectOn = (server: FastifyInstance) =>
      server.inject({
        method: 'POST',
        url: `/api/v1/customer/projects/${p.reference}/window-offers/1/select`,
        payload: { position: 1 },
        headers: {
          cookie: p.cookie,
          'idempotency-key': key('customer'),
          'x-forwarded-for': `203.0.113.${(++ip % 200) + 1}`,
        },
      })
    // The deposit is unpaid: the selection is refused on the default server and on the gated one alike (no module
    // configuration skips the gate); nothing is selected, confirmed or booked, and the holds stay held.
    for (const server of [app, gated]) {
      const refused = await selectOn(server)
      expect(refused.statusCode, refused.body).toBe(409)
      expect(codes(refused.body)).toEqual([
        ['body.position', 'SCHEDULING_NOT_READY'],
        ['deposit', 'DEPOSIT_REQUIRED'],
      ])
    }
    expect(await offerRow(o.id)).toMatchObject({ state: 'open', selected_position: null })
    expect((await visitOf(p.projectId, v.id)).state).toBe('tentative')
    expect((await reservationsOf(v.id)).map((r) => [r.kind, r.ended_reason])).toEqual(
      o.windows.map(() => ['hold', null]),
    )
    expect(
      await t.db
        .selectFrom('platform.outbox_events')
        .select('type')
        .where('aggregate_id', '=', v.id)
        .where('type', '=', 'appointment.reserved')
        .execute(),
    ).toEqual([])
    // Verified money (20% of $1,500.00 in cash) opens it: the customer's selection confirms the work visit.
    const paid = await staffWrite('office', 'POST', `/api/v1/staff/jobs/${jobId}/deposit/payments`, {
      // The business date (migration 0005's zone), as the server's IN_FUTURE check reads it, not the UTC date.
      receivedOn: localDateOf(new Date(), 'America/Kentucky/Louisville'),
      method: 'cash',
      amountCents: 30_000,
    })
    expect(paid.statusCode, paid.body).toBe(201)
    const ok = await selectOn(app)
    expect(ok.statusCode, ok.body).toBe(200)
    expect((await visitOf(p.projectId, v.id)).state).toBe('confirmed')
    expect(
      (await t.db.selectFrom('platform.outbox_events').select('type').where('aggregate_id', '=', v.id).execute()).map(
        (e) => e.type,
      ),
    ).toEqual(['appointment.reserved'])
    // An estimate visit never waits for a deposit: its selection confirms it with no job and no deposit.
    const open = await siteVisitProject()
    const estimate = await planVisit(open, { date: day(21) })
    await offered(open, estimate, threeWindows(day(21)), ['cal'])
    expect((await select(open, 1, 2)).statusCode).toBe(200)
    expect((await visitOf(open.projectId, estimate.id)).state).toBe('confirmed')
  })
})

describe('[RULE-SERVER-AUTHZ][T19] offers are authorized on the server', () => {
  it('[RULE-SERVER-AUTHZ][T19] another customer, a worker and an unknown offer get nothing', async () => {
    const p = await siteVisitProject()
    const stranger = await siteVisitProject()
    const v = await planVisit(p, { date: day(16) })
    await offered(p, v, threeWindows(day(16)), ['cal'])
    const foreign = await app.inject({
      method: 'POST',
      url: `/api/v1/customer/projects/${p.reference}/window-offers/1/select`,
      payload: { position: 1 },
      headers: { cookie: stranger.cookie, 'idempotency-key': key('x'), 'x-forwarded-for': '203.0.113.9' },
    })
    expect(foreign.statusCode).toBe(404)
    expect((await select(p, 9, 1)).statusCode).toBe(404)
    expect(codes((await select(p, 1, 7)).body)).toEqual([['body.position', 'POSITION_UNKNOWN']])
    const anonymous = await app.inject({
      method: 'POST',
      url: `/api/v1/customer/projects/${p.reference}/window-offers/1/select`,
      payload: { position: 1 },
      headers: { 'idempotency-key': key('x'), 'x-forwarded-for': '203.0.113.10' },
    })
    expect(anonymous.statusCode).toBe(401)
    const worker = await offer('worker', v, threeWindows(day(16)), ['cal'])
    expect(worker.statusCode).toBe(403)
    expect((await offerRow((await visitOf(p.projectId, v.id)).offers[0]?.id as string)).state).toBe('open')
  })
})

describe('[FACT-AUTOMATIC-MESSAGES][OWN-DEC-99] the automatic notices are recorded truthfully', () => {
  it('[FACT-AUTOMATIC-MESSAGES][HH-COM-06][HH-COM-13] options and confirmation notices: email wording released but not wired, texts NOT CONFIGURED; never sent, shown to staff', async () => {
    const providers = createProviders(readProviderSettings({ HANDYHUB_ENV: 'ci' }))
    const registry = createAutomationRegistry([
      estimateVisitOptionsAutomation({ providers: { email: providers.email, sms: providers.sms } }),
      estimateVisitConfirmedAutomation({ providers: { email: providers.email, sms: providers.sms } }),
    ])
    const p = await siteVisitProject()
    const v = await planVisit(p, { date: day(17) })
    const { offer: o } = await offered(p, v, threeWindows(day(17)), ['ann'])
    const worker = createWorker({ db: t.db, registry })
    await worker.runOnce()
    await worker.runOnce()
    const offerNotices = (await visitOf(p.projectId, v.id)).offers[0]?.notices
    expect(offerNotices).toEqual([
      // TSK-0119: the owner's email wording is released; its values are wired by TSK-0120. Texts have no wording yet.
      {
        messageKey: 'estimate_visit.options',
        channel: 'email',
        state: 'failed',
        errorCode: 'template_values_not_wired',
      },
      { messageKey: 'estimate_visit.options', channel: 'sms', state: 'failed', errorCode: 'template_not_configured' },
    ])
    expect(await select(p, 1, 1)).toMatchObject({ statusCode: 200 })
    await worker.runOnce()
    await worker.runOnce()
    const visit = await visitOf(p.projectId, v.id)
    expect(visit.notices.map((n) => [n.messageKey, n.channel, n.state, n.errorCode])).toEqual([
      ['estimate_visit.confirmed', 'email', 'failed', 'template_values_not_wired'],
      ['estimate_visit.confirmed', 'sms', 'failed', 'template_not_configured'],
    ])
    expect(providers.fakes.email?.sent ?? []).toEqual([])
    expect(providers.fakes.sms?.sent ?? []).toEqual([])
    // Staff see the delivery issue as not configured.
    const issues = await t.db
      .selectFrom('ops.queue_items')
      .select('reason')
      .where('type', '=', 'delivery_failed')
      .where('reference', '=', p.reference)
      .execute()
    expect(issues.length).toBeGreaterThan(0)
    expect(new Set(issues.map((i) => i.reason))).toEqual(new Set(['delivery_not_configured']))
    // A replayed event sends nothing twice: still one delivery per channel and subject.
    await worker.runOnce()
    const rows = await t.db
      .selectFrom('platform.message_deliveries')
      .select('id')
      .where('subject_key', 'in', [`window_offer:${o.id}`, `visit:${v.id}`])
      .execute()
    expect(rows).toHaveLength(4)
  })
})

describe('[HH-STAFF-02][HH-STAFF-07][OWN-DEC-123] offboarding a worker whose windows are on offer (TSK-0097, TSK-0063)', () => {
  // PROPOSED: disabling a person never cancels or withdraws an offer by itself (OWN-DEC-123: flagged for review, never
  // cancelled). Their holds are flagged like any upcoming reservation, staff get the visit's review item, and no window
  // that needs them can be selected any more (the selection rechecks the team under the row locks); withdrawing the
  // offer releases the holds and resolves the item, and staff offer new windows with someone else.
  it('[HH-STAFF-02][T38] the holds are flagged, the window cannot be selected, withdrawing resolves the item', async () => {
    const leaving = await withTx(t.db, async (tx) => {
      const user = await createStaffUser(tx, {
        email: `dan-crew-offers-${randomUUID().slice(0, 8)}@example.test`,
        displayName: 'Synthetic dan',
        locale: 'en',
        role: 'worker',
        issuedBy: 'test',
      })
      await sql`UPDATE identity.staff_users SET status = 'active', activated_at = now() WHERE id = ${user.id}`.execute(
        tx,
      )
      return user.id
    })
    const hours = await staffWrite(
      'owner',
      'PUT',
      `/api/v1/staff/workers/${leaving}/working-hours`,
      { periods: WEEK },
      0,
    )
    expect(hours.statusCode, hours.body).toBe(200)
    const p = await siteVisitProject()
    const v = await planVisit(p, { date: day(13) })
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/staff/visits/${v.id}/offers`,
      payload: { windows: threeWindows(day(13)), workerIds: [leaving] },
      headers: {
        cookie: cookies.office,
        'x-csrf-token': csrf.office,
        'idempotency-key': key('offer'),
        'if-match': `"${v.version}"`,
      },
    })
    expect(res.statusCode, res.body).toBe(201)
    const o = (res.json<Visits>().visits.find((x) => x.id === v.id) as VisitView).offers[0] as OfferView

    await runWithContext({ requestId: `test:${randomUUID()}` }, () =>
      withTx(t.db, (tx) => disable(tx, { actorId: ids.owner, staffUserId: leaving, reason: null })),
    )
    // Nothing is cancelled: the offer stays open and its holds stay (flagged for review).
    expect((await offerRow(o.id)).state).toBe('open')
    const holds = await reservationsOf(v.id)
    expect(holds.map((r) => [r.kind, r.ended_reason])).toEqual([
      ['hold', null],
      ['hold', null],
      ['hold', null],
    ])
    const flags = await t.db
      .selectFrom('work.reservation_flags')
      .select(['reservation_id', 'cause'])
      .where('visit_id', '=', v.id)
      .execute()
    expect(new Set(flags.map((f) => f.reservation_id))).toEqual(new Set(holds.map((h) => h.id)))
    expect(new Set(flags.map((f) => f.cause))).toEqual(new Set(['account_disabled']))
    const items = () =>
      t.db
        .selectFrom('ops.queue_items')
        .select(['reason', 'subject_status', 'resolved_at', 'resolution'])
        .where('type', '=', 'visit_flagged')
        .where('subject_id', '=', v.id)
        .execute()
    expect(await items()).toEqual([
      { reason: 'assignee_disabled', subject_status: 'tentative', resolved_at: null, resolution: null },
    ])

    // The customer cannot select a window that needs the disabled person; nothing changes.
    const picked = await select(p, 1, 1)
    expect(picked.statusCode, picked.body).toBe(409)
    expect(codes(picked.body)).toEqual([['body.position', 'WINDOW_UNAVAILABLE']])
    expect((await offerRow(o.id)).state).toBe('open')
    expect((await visitOf(p.projectId, v.id)).state).toBe('tentative')

    // Staff withdraw the offer: every hold is released and the review item resolves; new windows can be offered.
    const withdrawn = await staffWrite(
      'office',
      'POST',
      `/api/v1/staff/window-offers/${o.id}/withdraw`,
      { reason: 'Synthetic: the worker left' },
      o.version,
    )
    expect(withdrawn.statusCode, withdrawn.body).toBe(200)
    expect((await reservationsOf(v.id)).map((r) => r.ended_reason)).toEqual([
      'hold_released',
      'hold_released',
      'hold_released',
    ])
    expect(await items()).toEqual([
      expect.objectContaining({ reason: 'assignee_disabled', resolution: 'flags_cleared' }),
    ])
    expect((await items())[0]?.resolved_at).not.toBeNull()
    const again = await offer('office', await visitOf(p.projectId, v.id), threeWindows(day(13)), ['cal'])
    expect(again.statusCode, again.body).toBe(201)
  })
})
