// Visit confirmation and window-offer amendments against PostgreSQL 16 (TSK-0145; OWN-DEC-193 A1, A2, A4; OWN-DEC-194
// B1, B3, B4; OWN-DEC-208; HH-SCH-06, HH-SCH-11, HH-SCH-05, T37, T38, T40, ENT-Hold, ENT-Visit, ENT-Reservation,
// RULE-SAFETY-GATES, RULE-SERVER-AUTHZ). Staff, customers, working hours, windows and names are synthetic
// (RULE-SYNTHETIC-DATA): the hours below are test fixtures, never the business's hours. Nothing reaches a provider.
// - `age` moves a draft's or an offer's stored instants back in time in this throwaway database, with the triggers off
//   for that one statement only (session_replication_role), exactly as if it had been saved or published earlier.
// - `completeJob` moves a job to operationally complete the same way: the Owner's quality review is TSK-0081's subject.
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
import { estimateVisitOptionsAutomation } from '../../src/modules/visits/index.js'
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

/** TSK-0120: the synthetic public site the portal links point at. */
const SITE = 'https://site.example.test'

const ZONE = 'America/Kentucky/Louisville'
const KEY: CodeKeySettings = readCodeKey({
  HANDYHUB_ENV: 'ci',
  CODE_HASH_KEY: ['synthetic', 'visit', 'amendment', 'code', 'key', 'for', 'tests', 'only', '0145'].join('-'),
})
const pw = ['synthetic', 'amendment', 'passphrase', '145'].join(' ')
const SIGNED_IN = ['owner', 'office', 'estimator', 'worker'] as const
type Person = (typeof SIGNED_IN)[number]
const CREW = ['ann', 'ben', 'cal'] as const
type Crew = (typeof CREW)[number]

let t: TestDatabase
let wide: Db
let app: FastifyInstance
const cookies = {} as Record<Person, string>
const csrf = {} as Record<Person, string>
const ids = {} as Record<Person | Crew, string>

const today = () => localDateOf(new Date(), ZONE)
const day = (n: number) => addLocalDays(today(), n)
/** Every weekday 08:00-20:00: a synthetic fixture. */
const WEEK = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, start: '08:00', end: '20:00' }))

async function signIn(server: FastifyInstance, p: Person): Promise<[string, string]> {
  const res = await signInWithMfa(server, {
    method: 'POST',
    url: '/api/v1/staff/auth/sign-in',
    headers: { 'x-forwarded-for': '198.51.100.145' },
    payload: { email: `${p}-amendments@example.test`, password: pw },
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
  const hash = await hashPassword(pw)
  await withTx(t.db, async (tx) => {
    for (const p of SIGNED_IN) {
      const user = await createStaffUser(tx, {
        email: `${p}-amendments@example.test`,
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
        email: `${c}-crew-amendments@example.test`,
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
  for (const c of CREW) {
    const res = await staffWrite('owner', 'PUT', `/api/v1/staff/workers/${ids[c]}/working-hours`, { periods: WEEK }, 0)
    expect(res.statusCode, res.body).toBe(200)
  }
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
  const street = `${++seq} Synthetic Amendment Lane`
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
  number: number | null
  state: string
  held: boolean
  version: number
  offeredAt: string
  publishedAt: string | null
  expiresAt: string | null
  holdHours: number
  preparationInstructions: string | null
  windows: { position: number; window: { localDate: string; start: string; startsAt: string } }[]
  selectedPosition: number | null
  closedReason: string | null
  replacedByNumber: number | null
  customerNote: string | null
  noticeKey: string | null
  notices: { messageKey: string; channel: string; state: string; errorCode: string | null }[]
  actions: { withdraw: boolean; publish: boolean; discard: boolean }
}
type Authorizations = {
  inspection: { qualifiedPerson: string; safetyConditions: string; holdIds: string[] } | null
  followUp: { basis: string; note: string; returnWorkId: string | null } | null
  jobCompleted: boolean
  actions: { authorizeInspection: boolean; authorizeFollowUp: boolean }
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
  confirmationBlockers: { field: string; code: string }[] | null
  authorizations: Authorizations
  actions: { changeWindow: boolean; confirm: boolean; offerWindows: boolean; replaceOffer: boolean }
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

const offer = (who: Person, v: VisitView, windows: Win[], workers: Crew[], extra: Record<string, unknown> = {}) =>
  app.inject({
    method: 'POST',
    url: `/api/v1/staff/visits/${v.id}/offers`,
    payload: { windows, workerIds: workers.map((w) => ids[w]), ...extra },
    headers: {
      cookie: cookies[who],
      'x-csrf-token': csrf[who],
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
                published_at = published_at - make_interval(secs => ${seconds}),
                expires_at = expires_at - make_interval(secs => ${seconds}) WHERE id = ${offerId}`.execute(tx)
    await sql`UPDATE work.reservations SET hold_expires_at = hold_expires_at - make_interval(secs => ${seconds})
               WHERE offer_id = ${offerId} AND kind = 'hold'`.execute(tx)
  })
}
const HOURS_24 = 24 * 3600

const quals = new Map<string, number>()
/** Staff flag a potential hazard on the request (a qualification revision): one review hold per new category. */
async function raiseHold(p: Project, hazards: string[], note: string): Promise<string[]> {
  const version = quals.get(p.requestId) ?? 1
  const res = await staffWrite(
    'office',
    'PUT',
    `/api/v1/staff/requests/${p.requestId}/qualification`,
    {
      checks: { ...ALL_OK, risk_flags: { outcome: 'attention', note, hazards } },
    },
    version,
  )
  expect(res.statusCode, res.body).toBe(200)
  quals.set(p.requestId, version + 1)
  return res.json<{ holdsOpened: string[] }>().holdsOpened
}
const confirm = (who: Person, v: VisitView, workers: Crew[]) =>
  staffWrite(who, 'POST', `/api/v1/staff/visits/${v.id}/confirm`, { workerIds: workers.map((w) => ids[w]) }, v.version)
const publish = (who: Person, o: OfferView, body: object = {}) =>
  staffWrite(who, 'POST', `/api/v1/staff/window-offers/${o.id}/publish`, body, o.version)
const discard = (who: Person, o: OfferView) =>
  staffWrite(who, 'POST', `/api/v1/staff/window-offers/${o.id}/discard`, {}, o.version)
const INSPECTION = {
  qualifiedPerson: 'Synthetic Inspector',
  qualification: 'Synthetic: licensed structural engineer (test fixture)',
  safetyConditions: 'Synthetic: no one enters the crawl space; visual inspection from the doorway only.',
  reason: 'Synthetic: the Owner needs the hazard evaluated before any work is considered.',
}
const inspect = (who: Person, v: VisitView, body: object = INSPECTION) =>
  staffWrite(who, 'POST', `/api/v1/staff/visits/${v.id}/inspection-authorization`, body, v.version)
const authorizeFollowUp = (who: Person, v: VisitView, body: object) =>
  staffWrite(who, 'POST', `/api/v1/staff/visits/${v.id}/follow-up-authorization`, body, v.version)
const outboxOf = (aggregateId: string) =>
  t.db.selectFrom('platform.outbox_events').select(['type']).where('aggregate_id', '=', aggregateId).execute()

/** Moves a job to operationally complete in this throwaway database (see the header). */
async function completeJob(jobId: string) {
  await withTx(t.db, async (tx) => {
    await sql`SET LOCAL session_replication_role = replica`.execute(tx)
    await sql`UPDATE work.jobs SET operational_state = 'operationally_complete', version = version + 1
               WHERE id = ${jobId}`.execute(tx)
  })
}

describe('[HH-SCH-06][OWN-DEC-193] A2: estimate visits need no approved job; work visits need their approval', () => {
  it('[OWN-DEC-193][T37] estimate-visit windows are published with no job and no approval; work visits wait for the approval', async () => {
    const p = await siteVisitProject()
    expect(await t.db.selectFrom('work.jobs').select('id').where('project_id', '=', p.projectId).execute()).toEqual([])
    const v = await planVisit(p, { date: day(3) })
    expect(v.confirmationBlockers).toEqual([])
    expect(v.actions.offerWindows).toBe(true)
    const { offer: o } = await offered(p, v, threeWindows(day(3)), ['ann'])
    expect(o).toMatchObject({ state: 'open', number: 1, noticeKey: 'estimate_visit.options' })
    // A work visit has no job before an estimate is approved, so it is never planned or offered.
    const work = await staffWrite('office', 'POST', `/api/v1/staff/projects/${p.projectId}/visits`, {
      purpose: 'service',
      localDate: day(4),
      windowStart: '09:00',
      windowEnd: '10:00',
      expectedDurationMinutes: 60,
      travelBufferMinutes: 30,
      preparationBufferMinutes: 0,
      requiredWorkers: 1,
      equipment: [],
    })
    expect(codes(work.body)).toEqual([['project', 'NO_JOB']])
    // After the approval the work visit's own conditions hold, and its windows are published.
    await approve(p)
    const wv = await planVisit(p, { date: day(4), purpose: 'service' })
    expect(wv.confirmationBlockers).toEqual([])
    const { offer: wo } = await offered(p, wv, threeWindows(day(4)), ['ann'])
    expect(wo).toMatchObject({ state: 'open', number: 2, noticeKey: 'work_visit.options' })
  })
})

describe('[HH-SCH-06][OWN-DEC-193][OWN-DEC-208][RULE-SAFETY-GATES] A1: holds stay mandatory; the Owner-authorized hazard-evaluation inspection', () => {
  it('[OWN-DEC-208][T40] only the Owner authorizes the inspection; the hold stays open and blocks every other visit', async () => {
    const p = await siteVisitProject()
    const v = await planVisit(p, { date: day(5) })
    const other = await planVisit(p, { date: day(6) })
    // Nothing to authorize while no intake review hold is open.
    expect(v.authorizations.actions.authorizeInspection).toBe(false)
    expect(codes((await inspect('owner', v)).body)).toEqual([['holds', 'NO_REVIEW_HOLD']])
    const [hold] = await raiseHold(p, ['structural'], 'Synthetic: a sagging beam was mentioned.')
    const blocked = (await projectVisits(p.projectId, 'owner')).visits.find((x) => x.id === v.id) as VisitView
    expect(blocked.confirmationBlockers).toEqual([{ field: `holds.${hold}`, code: 'REVIEW_HOLD_OPEN' }])
    expect(blocked.actions.offerWindows).toBe(false)
    expect(codes((await offer('office', blocked, threeWindows(day(5)), ['ann'])).body)).toEqual([
      [`holds.${hold}`, 'REVIEW_HOLD_OPEN'],
    ])
    // Only the Owner authorizes it, naming the qualified person, the safety conditions and a reason.
    expect(blocked.authorizations.actions.authorizeInspection).toBe(true)
    expect((await visitOf(p.projectId, v.id)).authorizations.actions).toMatchObject({ authorizeInspection: false })
    expect((await inspect('office', blocked)).statusCode).toBe(403)
    const missing = await inspect('owner', blocked, { ...INSPECTION, safetyConditions: ' ', qualification: ' ' })
    expect(missing.statusCode).toBe(400)
    expect(codes(missing.body)).toEqual([
      ['body.qualification', 'REQUIRED'],
      ['body.safetyConditions', 'REQUIRED'],
    ])
    expect((await inspect('owner', blocked, { ...INSPECTION, reason: ' ' })).statusCode).toBe(400)
    const ok = await inspect('owner', blocked)
    expect(ok.statusCode, ok.body).toBe(200)
    const shown = ok.json<Visits>().visits.find((x) => x.id === v.id) as VisitView
    expect(shown.authorizations.inspection).toMatchObject({
      qualifiedPerson: 'Synthetic Inspector',
      safetyConditions: INSPECTION.safetyConditions,
      holdIds: [hold],
    })
    expect(codes((await inspect('owner', shown)).body)).toEqual([['inspection', 'INSPECTION_AUTHORIZED']])
    // The inspection visit is no longer blocked by the hold it evaluates; the other visit still is.
    expect(shown.confirmationBlockers).toEqual([])
    const otherNow = ok.json<Visits>().visits.find((x) => x.id === other.id) as VisitView
    expect(otherNow.confirmationBlockers).toEqual([{ field: `holds.${hold}`, code: 'REVIEW_HOLD_OPEN' }])
    expect(codes((await confirm('owner', otherNow, ['ben'])).body)).toEqual([[`holds.${hold}`, 'REVIEW_HOLD_OPEN']])
    // The database refuses a direct confirmation of the other visit too (0120's visit_blocking_holds).
    await expect(
      sql`SELECT work.visit_blocking_holds(${other.id}::uuid, ${p.projectId}::uuid) AS n`.execute(t.db),
    ).resolves.toMatchObject({ rows: [{ n: 1 }] })
    await expect(
      sql`SELECT work.visit_blocking_holds(${v.id}::uuid, ${p.projectId}::uuid) AS n`.execute(t.db),
    ).resolves.toMatchObject({ rows: [{ n: 0 }] })
    const confirmed = await confirm('office', shown, ['ann'])
    expect(confirmed.statusCode, confirmed.body).toBe(200)
    // The hold stays open: HandyHub's inspection evaluates it, nothing releases it.
    expect(
      await t.db
        .selectFrom('work.holds')
        .select('state')
        .where('id', '=', hold as string)
        .executeTakeFirstOrThrow(),
    ).toEqual({ state: 'open' })
    const [audit] = await t.db
      .selectFrom('platform.audit_events')
      .select(['action', 'actor_id', 'reason', 'summary'])
      .where('action', '=', 'visit.authorize_inspection')
      .where('target_id', '=', v.id)
      .execute()
    expect(audit).toMatchObject({ actor_id: ids.owner, reason: INSPECTION.reason })
    expect(JSON.stringify(audit?.summary)).not.toContain('Synthetic Inspector')
  })

  it('[OWN-DEC-208][RULE-SAFETY-GATES] a later review hold blocks the inspection again; a work visit is never an inspection', async () => {
    const p = await siteVisitProject()
    const v = await planVisit(p, { date: day(7) })
    const [first] = await raiseHold(p, ['hazardous_material'], 'Synthetic: old paint may contain lead.')
    expect((await inspect('owner', await visitOf(p.projectId, v.id))).statusCode).toBe(200)
    const [later] = await raiseHold(p, ['licensed_trade'], 'Synthetic: the scope includes licensed trade work.')
    const now = await visitOf(p.projectId, v.id)
    expect(now.confirmationBlockers).toEqual([{ field: `holds.${later}`, code: 'REVIEW_HOLD_OPEN' }])
    expect(now.authorizations.inspection?.holdIds).toEqual([first])
    expect(codes((await offer('office', now, threeWindows(day(7)), ['ann'])).body)).toEqual([
      [`holds.${later}`, 'REVIEW_HOLD_OPEN'],
    ])
    // The database refuses an inspection authorization by anyone but a live Owner, and on a work visit.
    await expect(
      sql`INSERT INTO work.hazard_inspection_authorizations
            (visit_id, project_id, qualified_person, qualification, safety_conditions, reason, authorized_by)
          VALUES (${v.id}, ${p.projectId}, 'x', 'x', 'x', 'x', ${ids.office})`.execute(t.db),
    ).rejects.toThrow(/only the Owner/)
    // A work visit is ordinary service work, never the inspection (an approved project with no hold open here).
    const q = await siteVisitProject()
    await approve(q)
    const wv = await planVisit(q, { date: day(8), purpose: 'service' })
    expect(codes((await inspect('owner', wv)).body)).toEqual([
      ['visit.purpose', 'NOT_A_SITE_VISIT'],
      ['holds', 'NO_REVIEW_HOLD'],
    ])
  })
})

describe('[HH-SCH-06][OWN-DEC-193] A4: follow-up visits on a completed job need a recorded authorization', () => {
  it('[OWN-DEC-193] a follow-up visit is offered and confirmed only with its recorded basis', async () => {
    const p = await siteVisitProject()
    const jobId = await approve(p)
    const before = await planVisit(p, { date: day(9), purpose: 'follow_up' })
    // While the job is in progress no authorization is needed (or recorded).
    expect(before.authorizations).toMatchObject({ jobCompleted: false, actions: { authorizeFollowUp: false } })
    expect(codes((await authorizeFollowUp('owner', before, { basis: 'punch_list', note: 'x' })).body)).toEqual([
      ['job', 'JOB_NOT_COMPLETE'],
    ])
    await completeJob(jobId)
    const v = await visitOf(p.projectId, before.id)
    expect(v.authorizations).toMatchObject({ jobCompleted: true, actions: { authorizeFollowUp: true } })
    expect(v.confirmationBlockers).toEqual([{ field: 'followUp', code: 'FOLLOW_UP_NOT_AUTHORIZED' }])
    expect(v.actions.offerWindows).toBe(false)
    expect(codes((await offer('office', v, threeWindows(day(9)), ['ann'])).body)).toEqual([
      ['followUp', 'FOLLOW_UP_NOT_AUTHORIZED'],
    ])
    expect(codes((await confirm('owner', v, ['ann'])).body)).toEqual([['followUp', 'FOLLOW_UP_NOT_AUTHORIZED']])
    // The database refuses the confirmation too.
    await expect(
      sql`UPDATE work.visits SET state = 'confirmed', version = version + 1 WHERE id = ${v.id}`.execute(t.db),
    ).rejects.toThrow()
    // Who may record it, and with what.
    expect((await authorizeFollowUp('estimator', v, { basis: 'punch_list', note: 'x' })).statusCode).toBe(403)
    expect(codes((await authorizeFollowUp('office', v, { basis: 'warranty', note: 'Synthetic' })).body)).toEqual([
      ['body.returnWorkId', 'RETURN_WORK_REQUIRED'],
    ])
    expect(
      codes((await authorizeFollowUp('office', v, { basis: 'warranty', note: 'x', returnWorkId: randomUUID() })).body),
    ).toEqual([['body.returnWorkId', 'RETURN_WORK_UNKNOWN']])
    const ok = await authorizeFollowUp('office', v, {
      basis: 'punch_list',
      note: 'Synthetic: the open punch item from the walkthrough.',
    })
    expect(ok.statusCode, ok.body).toBe(200)
    const shown = ok.json<Visits>().visits.find((x) => x.id === v.id) as VisitView
    expect(shown.authorizations.followUp).toMatchObject({ basis: 'punch_list', returnWorkId: null })
    expect(shown.confirmationBlockers).toEqual([])
    expect(codes((await authorizeFollowUp('owner', shown, { basis: 'punch_list', note: 'x' })).body)).toEqual([
      ['followUp', 'FOLLOW_UP_AUTHORIZED'],
    ])
    const confirmed = await confirm('office', shown, ['ann'])
    expect(confirmed.statusCode, confirmed.body).toBe(200)
  })
})

describe('[HH-SCH-11][OWN-DEC-194][OWN-DEC-144] B1: the 24 hours start at publication, never at a saved draft', () => {
  it('[OWN-DEC-194] a draft holds nothing, starts no clock and is invisible to the customer; publishing starts the 24 hours', async () => {
    const p = await siteVisitProject()
    const v = await planVisit(p, { date: day(10) })
    const saved = await offer('office', v, threeWindows(day(10)), ['ben'], {
      draft: true,
      preparationInstructions: 'Synthetic: clear a path to the ceiling.',
    })
    expect(saved.statusCode, saved.body).toBe(201)
    const visit = saved.json<Visits>().visits.find((x) => x.id === v.id) as VisitView
    const d = visit.offers[0] as OfferView
    expect(d).toMatchObject({
      state: 'draft',
      number: null,
      publishedAt: null,
      expiresAt: null,
      held: false,
      actions: { withdraw: false, publish: true, discard: true },
    })
    expect(visit.state).toBe('tentative')
    expect(await reservationsOf(v.id)).toEqual([])
    expect(await outboxOf(d.id)).toEqual([])
    expect(await t.db.selectFrom('platform.jobs').select('id').where('target_id', '=', d.id).execute()).toEqual([])
    expect((await appointmentsTab(p)).state).toBe('none')
    // One draft per visit.
    expect(codes((await offer('office', visit, threeWindows(day(10)), ['ben'], { draft: true })).body)).toEqual([
      ['offer', 'OFFER_DRAFT_EXISTS'],
    ])
    // The draft waits 30 hours: still no clock, nothing expires.
    await age(d.id, 30 * 3600)
    const published = await publish('office', d)
    expect(published.statusCode, published.body).toBe(200)
    const row = await offerRow(d.id)
    expect(row.state).toBe('open')
    expect(row.number).toBe(1)
    const publishedAt = (row.published_at as Date).getTime()
    expect((row.expires_at as Date).getTime() - publishedAt).toBe(HOURS_24 * 1000)
    expect(publishedAt - row.offered_at.getTime()).toBeGreaterThanOrEqual(30 * 3600 * 1000)
    expect(Math.abs(publishedAt - Date.now())).toBeLessThan(60_000)
    const holds = await reservationsOf(v.id)
    expect(holds.map((h) => [h.offer_position, h.kind, h.staff_user_id])).toEqual([
      [1, 'hold', ids.ben],
      [2, 'hold', ids.ben],
      [3, 'hold', ids.ben],
    ])
    for (const h of holds)
      expect(new Date(h.hold_expires_at as Date).getTime()).toBe((row.expires_at as Date).getTime())
    expect(await outboxOf(d.id)).toEqual([{ type: 'estimate_visit.windows_published' }])
    const tab = await appointmentsTab(p)
    expect(tab.offers?.map((o) => [o.number, o.status, o.expiresAt])).toEqual([
      [1, 'open', (row.expires_at as Date).toISOString()],
    ])
    // Publishing again is refused: a published offer is withdrawn or replaced, never published twice.
    expect(codes((await publish('office', { ...d, version: d.version + 1 })).body)).toEqual([['offer', 'OFFER_OPEN']])
  })

  it('[OWN-DEC-194] a discarded draft is kept as history and never published', async () => {
    const p = await siteVisitProject()
    const v = await planVisit(p, { date: day(11) })
    const saved = await offer('office', v, threeWindows(day(11)), ['cal'], { draft: true })
    const d = (saved.json<Visits>().visits.find((x) => x.id === v.id) as VisitView).offers[0] as OfferView
    expect((await discard('worker', d)).statusCode).toBe(403)
    const res = await discard('office', d)
    expect(res.statusCode, res.body).toBe(200)
    expect((res.json<Visits>().visits.find((x) => x.id === v.id) as VisitView).offers[0]).toMatchObject({
      state: 'discarded',
      number: null,
      actions: { publish: false, discard: false },
    })
    expect(codes((await publish('office', { ...d, version: d.version + 1 })).body)).toEqual([
      ['offer', 'OFFER_DISCARDED'],
    ])
    expect(await reservationsOf(v.id)).toEqual([])
    // A new offer takes the project's first number: the discarded draft never had one.
    const { offer: o } = await offered(p, await visitOf(p.projectId, v.id), threeWindows(day(11)), ['cal'])
    expect(o.number).toBe(1)
  })

  it('[OWN-DEC-194] a draft whose visit planning changed is not published as it was', async () => {
    const p = await siteVisitProject()
    const v = await planVisit(p, { date: day(12) })
    const saved = await offer('office', v, threeWindows(day(12)), ['ann'], { draft: true })
    const d = (saved.json<Visits>().visits.find((x) => x.id === v.id) as VisitView).offers[0] as OfferView
    await sql`UPDATE work.visits SET expected_duration_minutes = 90, version = version + 1 WHERE id = ${v.id}`.execute(
      t.db,
    )
    expect(codes((await publish('office', d)).body)).toEqual([
      ['windows[0]', 'OFFER_DRAFT_STALE'],
      ['windows[1]', 'OFFER_DRAFT_STALE'],
      ['windows[2]', 'OFFER_DRAFT_STALE'],
    ])
    expect((await offerRow(d.id)).state).toBe('draft')
  })
})

describe('[HH-SCH-11][OWN-DEC-194][T38] B3, B4: one active offer per visit, replaced or withdrawn only with a reason', () => {
  it('[OWN-DEC-194][T38] a replacement needs a reason, keeps the capacity protected and notifies the customer once', async () => {
    const providers = createProviders(readProviderSettings({ HANDYHUB_ENV: 'ci' }))
    const worker = createWorker({
      db: t.db,
      registry: createAutomationRegistry([
        estimateVisitOptionsAutomation({
          providers: { email: providers.email, sms: providers.sms },
          publicSiteUrl: SITE,
        }),
      ]),
    })
    const ours = (p: Project) => (providers.fakes.email?.sent ?? []).filter((m) => m.text.includes(p.reference))
    const p = await siteVisitProject()
    const v = await planVisit(p, { date: day(13) })
    const { visit, offer: first } = await offered(p, v, threeWindows(day(13)), ['ann'])
    for (let i = 0; i < 2; i++) await worker.runOnce()
    expect(ours(p)).toHaveLength(1)
    expect(visit.actions).toMatchObject({ offerWindows: false, replaceOffer: true })
    // A second offer without a reason is refused: one active offer per visit.
    const later = [win(day(13), '10:00', '11:00'), win(day(13), '13:00', '14:00')]
    expect(codes((await offer('office', visit, later, ['ann'])).body)).toEqual([['offer', 'OFFER_OPEN']])
    // The same windows overlapping inside one offer are refused (B4).
    expect(
      codes(
        (await offer('office', visit, [win(day(13), '10:00', '11:00'), win(day(13), '11:00', '12:00')], ['ann'])).body,
      ),
    ).toEqual([['body.windows[1]', 'OFFER_WINDOWS_OVERLAP']])
    // Replaced with a reason: the old holds are released and the same team holds the new windows (B3).
    const res = await offer('office', visit, later, ['ann'], { replaceReason: 'Synthetic: the crew changed' })
    expect(res.statusCode, res.body).toBe(201)
    const after = res.json<Visits>().visits.find((x) => x.id === v.id) as VisitView
    expect(after.offers.map((o) => [o.number, o.state, o.replacedByNumber, o.closedReason])).toEqual([
      [2, 'open', null, null],
      [1, 'replaced', 2, 'Synthetic: the crew changed'],
    ])
    const holds = await reservationsOf(v.id)
    expect(holds.filter((h) => h.ended_reason === null).map((h) => h.offer_position)).toEqual([1, 2])
    expect(holds.filter((h) => h.ended_reason === 'hold_released')).toHaveLength(3)
    const second = after.offers[0] as OfferView
    expect(await outboxOf(second.id)).toEqual([{ type: 'estimate_visit.windows_published' }])
    expect(await outboxOf(first.id)).toEqual([{ type: 'estimate_visit.windows_published' }])
    // The customer sees only the new offer and gets its notice once; the replaced offer sends nothing more.
    expect((await appointmentsTab(p)).offers?.map((o) => [o.number, o.status])).toEqual([[2, 'open']])
    for (let i = 0; i < 3; i++) await worker.runOnce()
    expect(ours(p)).toHaveLength(2)
    expect(codes((await select(p, 1, 1)).body)).toEqual([['offer', 'OFFER_REPLACED']])
    const [audit] = await t.db
      .selectFrom('platform.audit_events')
      .select(['reason', 'summary'])
      .where('action', '=', 'visit.offer_windows')
      .where('target_id', '=', second.id)
      .execute()
    expect(audit).toMatchObject({ reason: 'Synthetic: the crew changed' })
    // No silent change: the database refuses an edit of a published offer, a replacement without its successor.
    await expect(
      sql`UPDATE work.window_offers SET preparation_instructions = 'x', version = version + 1
           WHERE id = ${second.id}`.execute(t.db),
    ).rejects.toThrow(/keeps its visit/)
    await expect(
      sql`UPDATE work.window_offers SET state = 'replaced', version = version + 1, closed_by = ${ids.office},
             closed_reason = 'x', replaced_by = ${first.id} WHERE id = ${second.id}`.execute(t.db),
    ).rejects.toThrow()
  })

  it('[OWN-DEC-194] a draft published over the open offer replaces it only with a reason', async () => {
    const p = await siteVisitProject()
    const v = await planVisit(p, { date: day(14) })
    const { visit } = await offered(p, v, threeWindows(day(14)), ['ben'])
    const saved = await offer(
      'office',
      visit,
      [win(day(14), '10:00', '11:00'), win(day(14), '14:00', '15:00')],
      ['ben'],
      {
        draft: true,
      },
    )
    expect(saved.statusCode, saved.body).toBe(201)
    const d = (saved.json<Visits>().visits.find((x) => x.id === v.id) as VisitView).offers.find(
      (o) => o.state === 'draft',
    ) as OfferView
    expect(codes((await publish('office', d)).body)).toEqual([['offer', 'OFFER_OPEN']])
    const ok = await publish('office', d, { replaceReason: 'Synthetic: the customer called' })
    expect(ok.statusCode, ok.body).toBe(200)
    expect(
      (ok.json<Visits>().visits.find((x) => x.id === v.id) as VisitView).offers.map((o) => [o.number, o.state]),
    ).toEqual([
      [2, 'open'],
      [1, 'replaced'],
    ])
  })

  it('[OWN-DEC-194] a withdrawal needs a reason and asks staff to offer new times', async () => {
    const p = await siteVisitProject()
    const v = await planVisit(p, { date: day(15) })
    const { offer: o } = await offered(p, v, threeWindows(day(15)), ['cal'])
    const path = `/api/v1/staff/window-offers/${o.id}/withdraw`
    expect((await staffWrite('office', 'POST', path, {}, o.version)).statusCode).toBe(400)
    expect(
      (await staffWrite('office', 'POST', path, { reason: 'Synthetic: crew changed' }, o.version)).statusCode,
    ).toBe(200)
    const item = () =>
      t.db
        .selectFrom('ops.queue_items')
        .select(['reason', 'resolved_at', 'resolution'])
        .where('type', '=', 'window_offer_response')
        .where('subject_id', '=', p.requestId)
        .execute()
    expect(await item()).toEqual([{ reason: 'window_offer_withdrawn', resolved_at: null, resolution: null }])
    expect((await appointmentsTab(p)).state).toBe('none')
    await offered(p, await visitOf(p.projectId, v.id), threeWindows(day(15)), ['cal'])
    expect(await item()).toMatchObject([{ reason: 'window_offer_withdrawn', resolution: 'new_offer' }])
  })
})
