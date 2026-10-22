// Reschedule, reassign, cancel and customer change requests against PostgreSQL 16 (TSK-0066; HH-SCH-07, HH-PORT-04,
// HH-OPS-03, HH-API-04, HH-ARC-08, HH-COM-05, HH-FIN-14, T25, T42, T65, ENT-Visit, ENT-Reservation, ENT-AuditEvent,
// FACT-CANCELLATION-RULES, FACT-AUTOMATIC-MESSAGES, OWN-DEC-107, OWN-DEC-119, OWN-DEC-134, RULE-SERVER-AUTHZ). Staff,
// customers, working hours, reasons and names are synthetic (RULE-SYNTHETIC-DATA): the hours below are test fixtures,
// never the business's hours, and the estimate terms version recorded below is a fixture of this throwaway database.
// - A customer's request never changes the booking; staff confirm it through the same writes as any change, which
//   validate first, keep history and notify after commit, once.
// - "As if requested 12 hours before": a request row is written with that request time (a fixture), since the visit
//   hours do not let a test place a visit exactly 12 hours from now.
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
import { customerExport, customerPlan } from '../../src/modules/privacy/index.js'
import { PRIVACY_EXPORT } from '../../src/modules/records/index.js'
import {
  appointmentChangedAutomation,
  scheduleChangeStaffAutomation,
  visitsModule,
  type WorkVisitGate,
} from '../../src/modules/visits/index.js'
import { createAutomationRegistry } from '../../src/platform/automation.js'
import { createWorker } from '../../src/platform/jobs.js'
import { createProviders } from '../../src/providers/index.js'
import { readProviderSettings } from '../../src/providers/settings.js'
import { recordPolicyVersion } from '../../src/platform/config/index.js'
import { FakeObjectStorage } from '../../src/providers/r2/index.js'
import { testConfig } from '../fixtures/env.js'

const ZONE = 'America/Kentucky/Louisville'
const KEY: CodeKeySettings = readCodeKey({
  HANDYHUB_ENV: 'ci',
  CODE_HASH_KEY: ['synthetic', 'changes', 'code', 'key', 'for', 'tests', 'only', '0066'].join('-'),
})
const pw = ['synthetic', 'changes', 'passphrase', '66'].join(' ')
const SIGNED_IN = ['owner', 'office', 'estimator', 'worker'] as const
type Person = (typeof SIGNED_IN)[number]
/** The synthetic field team; dee has no working hours (the capacity case). */
const CREW = ['ann', 'ben', 'cal', 'dee'] as const
type Crew = (typeof CREW)[number]

let t: TestDatabase
let wide: Db
let app: FastifyInstance
let gated: FastifyInstance
const cookies = {} as Record<Person, string>
const csrf = {} as Record<Person, string>
const gatedSession = { cookie: '', csrf: '' }
const ids = {} as Record<Person | Crew, string>
const TEST_GATE: WorkVisitGate = { source: 'test', unmet: async () => [] }

const today = () => localDateOf(new Date(), ZONE)
const day = (n: number) => addLocalDays(today(), n)
/** Every weekday 08:00-20:00: a synthetic fixture. */
const WEEK = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, start: '08:00', end: '20:00' }))

async function signIn(server: FastifyInstance, p: Person): Promise<[string, string]> {
  const res = await server.inject({
    method: 'POST',
    url: '/api/v1/staff/auth/sign-in',
    headers: { 'x-forwarded-for': '198.51.100.166' },
    payload: { email: `${p}-changes@example.test`, password: pw },
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
function gatedWrite(url: string, payload: unknown, version?: number) {
  return gated.inject({
    method: 'POST',
    url,
    payload: payload as object,
    headers: {
      cookie: gatedSession.cookie,
      'x-csrf-token': gatedSession.csrf,
      'idempotency-key': key('gated'),
      ...(version === undefined ? {} : { 'if-match': `"${version}"` }),
    },
  })
}
const staffGet = (who: Person, url: string) => app.inject({ method: 'GET', url, headers: { cookie: cookies[who] } })
const codes = (body: string): [string, string][] =>
  JSON.parse(body).error.fieldErrors.map((f: { field: string; code: string }) => [f.field, f.code])

beforeAll(async () => {
  t = await createTestDatabase()
  wide = createDb(t.url, { max: 8, applicationName: 'visit-changes-test' })
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
        email: `${p}-changes@example.test`,
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
        email: `${c}-crew-changes@example.test`,
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
  for (const c of ['ann', 'ben', 'cal'] as const) {
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
  await gated?.close()
  await wide?.destroy()
  await t?.drop()
})

const ALL_OK = Object.fromEntries(
  ['coverage', 'service_fit', 'essential_facts', 'urgency', 'site_visit_need', 'staff_equipment', 'risk_flags'].map(
    (c) => [c, { outcome: 'ok' }],
  ),
)
type Project = { requestId: string; projectId: string; reference: string; cookie: string; qualification: number }
let ip = 30

/** A qualified synthetic request with "Site visit needed", and a verified customer session for its project. */
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
      description: 'Synthetic changes project.',
      answers: [],
      property: {
        street: `${++seq} Synthetic Changes Row`,
        city: 'Testville',
        state: 'ky',
        zip: '40000',
        propertyType: 'house',
      },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'site_visit',
      contact: {
        fullName: 'Synthetic Changes Customer',
        email: `changes-${seq}-${randomUUID().slice(0, 8)}@example.test`,
        phone: '(502) 555-0166',
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
    cookie: `__Host-hh_customer=${s.token}`,
    qualification: 1,
  }
}

/**
 * Approves an estimate for the project through the real approval transaction, so its job, scheduling task and
 * deposit requirement exist. One synthetic patch at the given unit price (default $12.50: no deposit required).
 */
async function approve(p: Project, unitPriceCents = 1250): Promise<string> {
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
      'x-forwarded-for': `2001:db8:66:${++ip}::1`,
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
      fullName: 'Synthetic Changes Customer',
    },
  })
  expect(res.statusCode, res.body).toBe(201)
  return (
    await t.db.selectFrom('work.jobs').select('id').where('project_id', '=', p.projectId).executeTakeFirstOrThrow()
  ).id
}

type Blocker = { field: string; code: string }
type Outcome = {
  kind: string
  noticeMinutes: number
  keptCents: number | null
  refundCents: number | null
  invoiceCents: number | null
}
type ChangeView = {
  kind: string
  fromVersion: number
  toVersion: number
  fromWorkers: { id: string }[]
  toWorkers: { id: string }[]
  initiator: string | null
  handyhubCause: string | null
  reason: string
  changeRequestId: string | null
  changedBy: { id: string }
  cancellation: { outcome: Outcome; workStarted: boolean; depositPaidCents: number } | null
}
type VisitView = {
  id: string
  number: number
  purpose: string
  state: string
  version: number
  windowVersion: number
  window: { localDate: string; start: string; end: string }
  confirmationBlockers: Blocker[] | null
  offers: { id: string; number: number; state: string }[]
  assignments: { kind: string; endedAt: string | null; endedReason: string | null; worker: { id: string } | null }[]
  history: { windowVersion: number; reason: string | null }[]
  notices: { messageKey: string; channel: string; state: string; errorCode: string | null }[]
  changeRequest: {
    id: string
    kind: string
    version: number
    reason: string | null
    preferredTimes: string | null
    outcome: Outcome | null
    actions: { confirm: boolean; decline: boolean }
  } | null
  cancellationPreview: { depositPaidCents: number; customer: Outcome; handyhub: Outcome } | null
  changes: ChangeView[]
  actions: { changeWindow: boolean; confirm: boolean; reassign: boolean; cancel: boolean; offerWindows: boolean }
}
type Visits = { visits: VisitView[]; schedulingTask: { state: string } | null }
const projectVisits = async (projectId: string, who: Person = 'office') => {
  const res = await staffGet(who, `/api/v1/staff/projects/${projectId}/visits`)
  expect(res.statusCode, res.body).toBe(200)
  return res.json<Visits>()
}
const visitOf = async (projectId: string, visitId: string, who: Person = 'office') =>
  (await projectVisits(projectId, who)).visits.find((v) => v.id === visitId) as VisitView

const PLAN = {
  windowStart: '09:00',
  windowEnd: '10:00',
  expectedDurationMinutes: 60,
  travelBufferMinutes: 30,
  preparationBufferMinutes: 0,
  requiredWorkers: 1,
  equipment: [],
}
/** A tentative visit: on the default server, or on the gated one ("as if planned before the deposit was due"). */
async function planVisit(p: Project, purpose: string, date: string, on: 'app' | 'gated' = 'app'): Promise<VisitView> {
  const url = `/api/v1/staff/projects/${p.projectId}/visits`
  const payload = { ...PLAN, purpose, localDate: date }
  const res = on === 'app' ? await staffWrite('office', 'POST', url, payload) : await gatedWrite(url, payload)
  expect(res.statusCode, res.body).toBe(201)
  const all = res.json<Visits>().visits
  return all[all.length - 1] as VisitView
}
const confirm = (who: Person, v: VisitView, worker: Crew = 'ann') =>
  staffWrite(who, 'POST', `/api/v1/staff/visits/${v.id}/confirm`, { workerIds: [ids[worker]] }, v.version)
const customerGet = async (p: Project, tab: 'appointments' | 'overview') => {
  const res = await app.inject({
    method: 'GET',
    url: `/api/v1/customer/projects/${p.reference}/${tab}`,
    headers: { cookie: p.cookie },
  })
  expect(res.statusCode, res.body).toBe(200)
  return res.json<{
    appointments?: unknown[]
    offers?: { status: string }[]
    status?: { step: string; nextAction: string }
  }>()
}
const pay = async (jobId: string) => {
  const paid = await staffWrite('office', 'POST', `/api/v1/staff/jobs/${jobId}/deposit/payments`, {
    // The business date (migration 0005's zone), as the server's IN_FUTURE check reads it, not the UTC date.
    receivedOn: localDateOf(new Date(), 'America/Kentucky/Louisville'),
    method: 'cash',
    amountCents: 30_000,
  })
  expect(paid.statusCode, paid.body).toBe(201)
}

// --- TSK-0066 helpers --------------------------------------------------------------------------------------------

type Appointment = {
  number: number
  purpose: string
  status: string
  window: { localDate: string; start: string; end: string }
  request: { kind: string; status: string } | null
  actions: { requestReschedule: boolean; requestCancellation: boolean }
}
const appointments = async (p: Project) => ((await customerGet(p, 'appointments')).appointments ?? []) as Appointment[]

function customerRequest(p: Project, number: number, kind: 'reschedule' | 'cancellation', body: object = {}) {
  return app.inject({
    method: 'POST',
    url: `/api/v1/customer/projects/${p.reference}/appointments/${number}/${kind}-request`,
    payload: body,
    headers: {
      cookie: p.cookie,
      'idempotency-key': key('customer-change'),
      'x-forwarded-for': `203.0.113.${(++ip % 200) + 1}`,
    },
  })
}

/** A confirmed visit: planned by Office and confirmed with one worker. */
async function bookedVisit(p: Project, purpose: string, date: string, worker: Crew = 'ann'): Promise<VisitView> {
  const v = await planVisit(p, purpose, date)
  const res = await confirm('office', v, worker)
  expect(res.statusCode, res.body).toBe(200)
  return visitOf(p.projectId, v.id)
}

const move = (who: Person, v: VisitView, body: object, version = v.version) =>
  staffWrite(who, 'POST', `/api/v1/staff/visits/${v.id}/window`, body, version)
const reassign = (who: Person, v: VisitView, body: object, version = v.version) =>
  staffWrite(who, 'POST', `/api/v1/staff/visits/${v.id}/reassign`, body, version)
const cancel = (who: Person, v: VisitView, body: object, version = v.version) =>
  staffWrite(who, 'POST', `/api/v1/staff/visits/${v.id}/cancel`, body, version)
const decline = (who: Person, requestId: string, version: number, body: object) =>
  staffWrite(who, 'POST', `/api/v1/staff/visit-change-requests/${requestId}/decline`, body, version)

const openItems = (type: string, subjectId: string) =>
  t.db
    .selectFrom('ops.queue_items')
    .select(['reason', 'band', 'resolution', 'resolved_at'])
    .where('type', '=', type)
    .where('subject_id', '=', subjectId)
    .orderBy('opened_at')
    .execute()

const providers = createProviders(readProviderSettings({ HANDYHUB_ENV: 'ci' }))
const noticeWorker = () =>
  createWorker({
    db: t.db,
    registry: createAutomationRegistry([
      appointmentChangedAutomation({ providers: { email: providers.email, sms: providers.sms } }),
      scheduleChangeStaffAutomation({ providers: { email: providers.email, sms: null } }),
    ]),
  })
async function runNotices() {
  const worker = noticeWorker()
  for (let i = 0; i < 3; i++) await worker.runOnce()
}
const deliveries = (subjects: string[]) =>
  t.db
    .selectFrom('platform.message_deliveries')
    .select(['message_key', 'channel', 'state', 'error_code', 'subject_key', 'recipient_id'])
    .where('subject_key', 'in', subjects)
    .orderBy('seq')
    .execute()
const changeRows = (visitId: string) =>
  t.db.selectFrom('work.visit_changes').selectAll().where('visit_id', '=', visitId).orderBy('changed_at').execute()

describe('[HH-PORT-04][T25] a customer request keeps the confirmed visit until staff commit', () => {
  it('[HH-PORT-04][T25][HH-SCH-07] Request to Reschedule: awaiting staff; a decline keeps the booking; a confirmation moves it with history and one notice', async () => {
    const p = await siteVisitProject()
    const v = await bookedVisit(p, 'site_estimate', day(10))
    const [before] = await appointments(p)
    expect(before).toMatchObject({
      number: v.number,
      purpose: 'estimate_visit',
      status: 'confirmed',
      request: null,
      actions: { requestReschedule: true, requestCancellation: true },
    })

    // The request: "Request received—awaiting staff confirmation." and the booking unchanged.
    const asked = await customerRequest(p, v.number, 'reschedule', {
      reason: 'Synthetic: a family event.',
      preferredTimes: 'Synthetic: any afternoon next week',
    })
    expect(asked.statusCode, asked.body).toBe(200)
    const [awaiting] = await appointments(p)
    expect(awaiting).toMatchObject({
      status: 'confirmed',
      window: before?.window,
      request: { kind: 'reschedule', status: 'awaiting_confirmation' },
      actions: { requestReschedule: false, requestCancellation: false },
    })
    // The same request again answers the open one; the other kind waits.
    expect((await customerRequest(p, v.number, 'reschedule')).statusCode).toBe(200)
    const other = await customerRequest(p, v.number, 'cancellation')
    expect(other.statusCode).toBe(409)
    expect(codes(other.body)).toEqual([['appointment', 'REQUEST_ALREADY_OPEN']])
    expect(
      await t.db.selectFrom('work.visit_change_requests').select('id').where('visit_id', '=', v.id).execute(),
    ).toHaveLength(1)
    // Prominent in the staff queue; staff see the customer's words and the visit as it was.
    expect(await openItems('visit_change_request', v.id)).toMatchObject([
      { reason: 'reschedule_requested', band: 'time_sensitive', resolved_at: null },
    ])
    const seen = await visitOf(p.projectId, v.id)
    expect(seen).toMatchObject({ state: 'confirmed', version: v.version, windowVersion: 1 })
    expect(seen.changeRequest).toMatchObject({
      kind: 'reschedule',
      reason: 'Synthetic: a family event.',
      preferredTimes: 'Synthetic: any afternoon next week',
      outcome: null,
      actions: { confirm: true, decline: true },
    })
    // The audit names the request, never the customer's words.
    const audit = await t.db
      .selectFrom('platform.audit_events')
      .select(['action', 'summary'])
      .where('action', '=', 'visit.request_reschedule')
      .where('target_id', '=', seen.changeRequest?.id as string)
      .execute()
    expect(audit.length).toBeGreaterThan(0)
    expect(JSON.stringify(audit)).not.toContain('family event')

    // A decline needs the current request version and a reason; the booking stays exactly as it was.
    const r = seen.changeRequest as NonNullable<VisitView['changeRequest']>
    expect((await decline('office', r.id, r.version + 1, { reason: 'Synthetic: no other time.' })).statusCode).toBe(409)
    const noReason = await decline('office', r.id, r.version, { reason: ' ' })
    expect(noReason.statusCode).toBe(400)
    expect(codes(noReason.body)).toEqual([['body.reason', 'REASON_REQUIRED']])
    expect((await decline('worker', r.id, r.version, { reason: 'Synthetic.' })).statusCode).toBe(403)
    const declined = await decline('office', r.id, r.version, { reason: 'Synthetic: no other time this month.' })
    expect(declined.statusCode, declined.body).toBe(200)
    const kept = await visitOf(p.projectId, v.id)
    expect(kept).toMatchObject({ state: 'confirmed', version: v.version, windowVersion: 1, changeRequest: null })
    expect(kept.assignments).toEqual(seen.assignments)
    expect((await appointments(p))[0]).toMatchObject({
      status: 'confirmed',
      window: before?.window,
      request: { kind: 'reschedule', status: 'declined' },
      actions: { requestReschedule: true, requestCancellation: true },
    })
    expect(await openItems('visit_change_request', v.id)).toMatchObject([{ resolution: 'request_declined' }])
    expect((await decline('office', r.id, r.version + 1, { reason: 'Synthetic.' })).statusCode).toBe(409)

    // A second request, confirmed by moving the visit: it runs every rule of a reschedule.
    expect((await customerRequest(p, v.number, 'reschedule')).statusCode).toBe(200)
    const again = (await visitOf(p.projectId, v.id)).changeRequest as NonNullable<VisitView['changeRequest']>
    const window = { localDate: day(11), windowStart: '13:00', windowEnd: '14:00' }
    const unreasoned = await move('office', kept, { ...window, changeRequestId: again.id })
    expect(unreasoned.statusCode).toBe(400)
    expect(codes(unreasoned.body)).toEqual([['body.reason', 'REASON_REQUIRED']])
    const moved = await move('office', kept, {
      ...window,
      reason: 'Synthetic: the customer asked for the 11th.',
      changeRequestId: again.id,
    })
    expect(moved.statusCode, moved.body).toBe(200)
    const after = await visitOf(p.projectId, v.id)
    expect(after).toMatchObject({ state: 'confirmed', version: v.version + 1, windowVersion: 2, changeRequest: null })
    expect(after.window).toMatchObject({ localDate: day(11), start: '13:00', end: '14:00' })
    expect(after.history.map((h) => h.windowVersion).sort()).toEqual([1, 2])
    expect(after.changes).toMatchObject([
      {
        kind: 'rescheduled',
        fromVersion: v.version,
        toVersion: v.version + 1,
        fromWorkers: [{ id: ids.ann }],
        toWorkers: [{ id: ids.ann }],
        initiator: 'customer',
        reason: 'Synthetic: the customer asked for the 11th.',
        changeRequestId: again.id,
        changedBy: { id: ids.office },
        cancellation: null,
      },
    ])
    expect(await openItems('visit_change_request', v.id)).toMatchObject([
      { resolution: 'request_declined' },
      { resolution: 'reschedule_confirmed' },
    ])
    expect((await appointments(p))[0]).toMatchObject({
      status: 'confirmed',
      window: { localDate: day(11), start: '13:00', end: '14:00' },
      request: null,
    })

    // After commit: "Appointment changed" once (wording NOT CONFIGURED: recorded, never sent) and the worker's notice.
    const [change] = await changeRows(v.id)
    await runNotices()
    await runNotices()
    const sent = await deliveries([`visit_change:${change?.id}`])
    expect(
      sent.filter((d) => d.message_key === 'appointment.changed').map((d) => [d.channel, d.state, d.error_code]),
    ).toEqual([
      ['email', 'failed', 'template_not_configured'],
      ['sms', 'failed', 'template_not_configured'],
    ])
    expect(
      sent
        .filter((d) => d.message_key === 'staff_notice.schedule_change')
        .map((d) => [d.recipient_id, d.state, d.error_code]),
    ).toEqual([[ids.ann, 'failed', 'template_not_configured']])
    expect(providers.fakes.email?.sent ?? []).toEqual([])
    expect(providers.fakes.sms?.sent ?? []).toEqual([])
  })

  it("[HH-PORT-04][T25][RULE-SERVER-AUTHZ] only a confirmed appointment of the customer's own project can be asked about", async () => {
    const p = await siteVisitProject()
    const stranger = await siteVisitProject()
    const v = await bookedVisit(p, 'site_estimate', day(12), 'ben')
    const foreign = await app.inject({
      method: 'POST',
      url: `/api/v1/customer/projects/${p.reference}/appointments/${v.number}/cancellation-request`,
      payload: {},
      headers: { cookie: stranger.cookie, 'idempotency-key': key('x'), 'x-forwarded-for': '203.0.113.66' },
    })
    expect(foreign.statusCode).toBe(404)
    expect((await customerRequest(p, v.number + 40, 'cancellation')).statusCode).toBe(404)
    const tentative = await planVisit(p, 'site_estimate', day(14))
    expect((await customerRequest(p, tentative.number, 'reschedule')).statusCode).toBe(404)
    // The database refuses a request for a visit that is not confirmed, whatever path writes it.
    const contact = await t.db
      .selectFrom('intake.requests')
      .select('contact_id')
      .where('id', '=', p.requestId)
      .executeTakeFirstOrThrow()
    await expect(
      sql`INSERT INTO work.visit_change_requests (visit_id, project_id, kind, requested_by_contact)
          VALUES (${tentative.id}, ${p.projectId}, 'reschedule', ${contact.contact_id})`.execute(t.db),
    ).rejects.toThrow(/confirmed visit/)
  })
})

describe("[HH-PORT-04][HH-SCH-07][T25] cancellations follow FACT-CANCELLATION-RULES; refunds are the Owner's", () => {
  /** A work visit with its $300.00 deposit paid in cash, confirmed for `date` 09:00. */
  async function paidWorkVisit(date: string, worker: Crew = 'cal') {
    const p = await siteVisitProject()
    const jobId = await approve(p, 150_000)
    await pay(jobId)
    const v = await bookedVisit(p, 'service', date, worker)
    return { p, jobId, v }
  }
  const payments = (jobId: string) =>
    t.db.selectFrom('finance.payments').select(['amount_cents', 'state']).where('job_id', '=', jobId).execute()

  it('[T25][HH-FIN-14] 48 hours or more before: the whole deposit is refunded by the Owner; Office cannot cancel work', async () => {
    const { p, jobId, v } = await paidWorkVisit(day(6))
    expect(
      (await customerRequest(p, v.number, 'cancellation', { reason: 'Synthetic: plans changed.' })).statusCode,
    ).toBe(200)
    // The request routes to the Owner for cancellation and financial review, beside the staff queue item.
    expect(await openItems('visit_change_request', v.id)).toMatchObject([{ reason: 'cancellation_requested' }])
    expect(await openItems('visit_cancellation_review', v.id)).toMatchObject([
      { reason: 'work_cancellation_requested', resolved_at: null },
    ])
    const seen = await visitOf(p.projectId, v.id)
    expect(seen.state).toBe('confirmed')
    expect(seen.changeRequest?.outcome).toEqual({
      kind: 'full_refund_no_charge',
      noticeMinutes: expect.any(Number),
      keptCents: 0,
      refundCents: 30_000,
      invoiceCents: 0,
    })
    expect((seen.changeRequest?.outcome?.noticeMinutes ?? 0) >= 48 * 60).toBe(true)
    expect(seen.changeRequest?.actions).toEqual({ confirm: false, decline: false })
    expect(seen.actions.cancel).toBe(false)
    const r = seen.changeRequest as NonNullable<VisitView['changeRequest']>
    const office = await cancel('office', seen, { reason: 'Synthetic: as asked.', changeRequestId: r.id })
    expect(office.statusCode).toBe(403)
    expect(codes(office.body)).toEqual([['visit', 'OWNER_CANCELS_WORK']])
    expect((await decline('office', r.id, r.version, { reason: 'Synthetic.' })).statusCode).toBe(403)
    expect((await visitOf(p.projectId, v.id)).state).toBe('confirmed')

    const owner = (await visitOf(p.projectId, v.id, 'owner')) as VisitView
    expect(owner.actions.cancel).toBe(true)
    const done = await cancel('owner', owner, { reason: 'Synthetic: the customer cancelled.', changeRequestId: r.id })
    expect(done.statusCode, done.body).toBe(200)
    const after = await visitOf(p.projectId, v.id)
    expect(after.state).toBe('canceled')
    expect(after.assignments.filter((a) => a.endedAt === null)).toEqual([])
    expect(after.assignments.map((a) => a.endedReason)).toEqual(['visit_canceled'])
    expect(after.changes[0]).toMatchObject({
      kind: 'canceled',
      initiator: 'customer',
      changeRequestId: r.id,
      changedBy: { id: ids.owner },
      toWorkers: [],
      cancellation: {
        outcome: { kind: 'full_refund_no_charge', keptCents: 0, refundCents: 30_000, invoiceCents: 0 },
        workStarted: false,
        depositPaidCents: 30_000,
      },
    })
    // Nothing is refunded automatically: the payment stands and the Owner gets the outcome to apply.
    expect(await payments(jobId)).toEqual([{ amount_cents: '30000', state: 'recorded' }])
    expect(await openItems('cancellation_outcome', p.projectId)).toMatchObject([
      { reason: 'cancellation_outcome_requested', resolved_at: null },
    ])
    expect(await openItems('visit_change_request', v.id)).toMatchObject([{ resolution: 'cancellation_confirmed' }])
    expect(await openItems('visit_cancellation_review', v.id)).toMatchObject([{ resolution: 'cancellation_confirmed' }])
    // The customer sees the appointment canceled, with nothing more to ask.
    expect((await appointments(p))[0]).toMatchObject({
      status: 'canceled',
      request: null,
      actions: { requestReschedule: false, requestCancellation: false },
    })
    expect((await customerRequest(p, v.number, 'reschedule')).statusCode).toBe(409)
  })

  it('[T25][HH-FIN-14] 12 hours before: $50.00 is kept and the rest refunded, both by the Owner', async () => {
    const { p, jobId, v } = await paidWorkVisit(day(4), 'ben')
    const row = await t.db
      .selectFrom('work.visits')
      .select('starts_at')
      .where('id', '=', v.id)
      .executeTakeFirstOrThrow()
    const contact = await t.db
      .selectFrom('intake.requests')
      .select('contact_id')
      .where('id', '=', p.requestId)
      .executeTakeFirstOrThrow()
    // Fixture: as if the customer asked 12 hours before the arrival window.
    const askedAt = new Date(new Date(row.starts_at).getTime() - 12 * 3_600_000)
    await sql`INSERT INTO work.visit_change_requests (visit_id, project_id, kind, requested_by_contact, requested_at)
              VALUES (${v.id}, ${p.projectId}, 'cancellation', ${contact.contact_id}, ${askedAt})`.execute(t.db)
    const owner = await visitOf(p.projectId, v.id, 'owner')
    expect(owner.changeRequest?.outcome).toEqual({
      kind: 'late_cancellation',
      noticeMinutes: 12 * 60,
      keptCents: 5000,
      refundCents: 25_000,
      invoiceCents: 0,
    })
    const r = owner.changeRequest as NonNullable<VisitView['changeRequest']>
    // HandyHub is not the initiator of a customer's request.
    const wrong = await cancel('owner', owner, {
      reason: 'Synthetic.',
      changeRequestId: r.id,
      initiator: 'handyhub',
      handyhubCause: 'weather',
    })
    expect(codes(wrong.body)).toEqual([['body.initiator', 'REQUEST_IS_CUSTOMER']])
    const done = await cancel('owner', owner, { reason: 'Synthetic: late cancellation.', changeRequestId: r.id })
    expect(done.statusCode, done.body).toBe(200)
    const stored = (await changeRows(v.id)).find((c) => c.kind === 'canceled')
    expect(stored).toMatchObject({
      outcome: 'late_cancellation',
      notice_minutes: 720,
      kept_cents: '5000',
      refund_cents: '25000',
      invoice_cents: '0',
      deposit_paid_cents: '30000',
      rules_version: 1,
    })
    expect(await payments(jobId)).toEqual([{ amount_cents: '30000', state: 'recorded' }])
    expect(await openItems('cancellation_outcome', p.projectId)).toMatchObject([{ resolved_at: null }])
    // The change record is history: never edited or deleted.
    await expect(
      sql`UPDATE work.visit_changes SET reason = 'x' WHERE visit_id = ${v.id}`.execute(t.db),
    ).rejects.toThrow()
    await expect(sql`DELETE FROM work.visit_changes WHERE visit_id = ${v.id}`.execute(t.db)).rejects.toThrow()
  })

  it("[T25][OWN-DEC-134] HandyHub moves a visit for weather: free, and staff see the customer's choice of a free reschedule or a full refund", async () => {
    const { p, v } = await paidWorkVisit(day(8), 'ann')
    const owner = await visitOf(p.projectId, v.id, 'owner')
    expect(owner.cancellationPreview).toMatchObject({
      depositPaidCents: 30_000,
      customer: { kind: 'full_refund_no_charge', refundCents: 30_000 },
      handyhub: { kind: 'customer_chooses', keptCents: 0, refundCents: 30_000, invoiceCents: 0 },
    })
    const noCause = await move('owner', owner, {
      localDate: day(9),
      windowStart: '09:00',
      windowEnd: '10:00',
      reason: 'Synthetic: storm forecast.',
      initiator: 'handyhub',
    })
    expect(codes(noCause.body)).toEqual([['body.handyhubCause', 'CAUSE_REQUIRED']])
    const moved = await move('owner', owner, {
      localDate: day(9),
      windowStart: '09:00',
      windowEnd: '10:00',
      reason: 'Synthetic: storm forecast.',
      initiator: 'handyhub',
      handyhubCause: 'weather',
    })
    expect(moved.statusCode, moved.body).toBe(200)
    const after = await visitOf(p.projectId, v.id, 'owner')
    expect(after.changes[0]).toMatchObject({ kind: 'rescheduled', initiator: 'handyhub', handyhubCause: 'weather' })
    // Rescheduling is always free: no money item for the Owner.
    expect(await openItems('cancellation_outcome', p.projectId)).toEqual([])
    expect(after.cancellationPreview?.handyhub.kind).toBe('customer_chooses')
  })

  it('[HH-SCH-07][HH-PORT-04] Office cancels an estimate visit with enough notice: nothing is owed, nothing goes to the Owner', async () => {
    const p = await siteVisitProject()
    const v = await bookedVisit(p, 'site_estimate', day(9), 'ben')
    const noInitiator = await cancel('office', v, { reason: 'Synthetic: the customer called.' })
    expect(codes(noInitiator.body)).toEqual([['body.initiator', 'INITIATOR_REQUIRED']])
    expect((await cancel('worker', v, { reason: 'Synthetic.', initiator: 'customer' })).statusCode).toBe(403)
    const done = await cancel('office', v, { reason: 'Synthetic: the customer called.', initiator: 'customer' })
    expect(done.statusCode, done.body).toBe(200)
    expect((await visitOf(p.projectId, v.id)).changes[0]?.cancellation?.outcome).toMatchObject({
      kind: 'full_refund_no_charge',
      refundCents: 0,
      invoiceCents: 0,
    })
    expect(await openItems('cancellation_outcome', p.projectId)).toEqual([])
    const again = await cancel('office', v, { reason: 'Synthetic.', initiator: 'customer' }, v.version + 1)
    expect(codes(again.body)).toEqual([['state', 'VISIT_NOT_CONFIRMED']])
  })
})

describe('[HH-SCH-07][T42] reschedule and reassignment update everyone; stale writes conflict', () => {
  const lane = async (date: string, worker: Crew) => {
    const res = await staffGet('office', `/api/v1/staff/schedule?date=${date}`)
    expect(res.statusCode, res.body).toBe(200)
    const board = res.json<{ workers: { id: string; days: { entries: { visitId: string }[] }[] }[] }>()
    return (board.workers.find((w) => w.id === ids[worker])?.days[0]?.entries ?? []).map((e) => e.visitId)
  }

  it('[T42][HH-SCH-07][HH-OPS-03][HH-SCH-04] a reassignment checks the new team first, moves the visit between workers and keeps history', async () => {
    const date = day(20)
    const p = await siteVisitProject()
    const v = await bookedVisit(p, 'site_estimate', date, 'ann')
    const q = await siteVisitProject()
    await bookedVisit(q, 'site_estimate', date, 'ben')
    expect(await lane(date, 'ann')).toContain(v.id)

    // Refusals change nothing: no reason, the same team, a stale version, a busy worker, a role without the action.
    const noReason = await reassign('office', v, { workerIds: [ids.cal], reason: '' })
    expect(codes(noReason.body)).toEqual([['body.reason', 'REASON_REQUIRED']])
    const same = await reassign('office', v, { workerIds: [ids.ann], reason: 'Synthetic.' })
    expect(codes(same.body)).toEqual([['body.workerIds', 'TEAM_UNCHANGED']])
    const busy = await reassign('office', v, { workerIds: [ids.ben], reason: 'Synthetic: swap.' })
    expect(busy.statusCode).toBe(409)
    expect(codes(busy.body)).toContainEqual([`workers.${ids.ben}`, 'WORKER_BOOKED'])
    expect(busy.json<{ error: { alternatives: unknown } }>().error.alternatives).toBeTruthy()
    expect((await reassign('estimator', v, { workerIds: [ids.cal], reason: 'Synthetic.' })).statusCode).toBe(403)
    const intact = await visitOf(p.projectId, v.id)
    expect(intact).toMatchObject({ version: v.version, state: 'confirmed', changes: [] })
    expect(intact.assignments).toEqual(v.assignments)

    const done = await reassign('office', v, { workerIds: [ids.cal], reason: 'Synthetic: Ann is needed elsewhere.' })
    expect(done.statusCode, done.body).toBe(200)
    const after = await visitOf(p.projectId, v.id)
    expect(after).toMatchObject({ version: v.version + 1, windowVersion: v.windowVersion, state: 'confirmed' })
    expect(after.assignments.map((a) => [a.worker?.id, a.endedReason])).toEqual([
      [ids.ann, 'reassigned'],
      [ids.cal, null],
    ])
    expect(after.changes).toMatchObject([
      {
        kind: 'reassigned',
        fromWorkers: [{ id: ids.ann }],
        toWorkers: [{ id: ids.cal }],
        reason: 'Synthetic: Ann is needed elsewhere.',
      },
    ])
    // Both workers' lists update.
    expect(await lane(date, 'ann')).not.toContain(v.id)
    expect(await lane(date, 'cal')).toContain(v.id)
    // A second editor with the old version conflicts and changes nothing.
    const stale = await reassign('owner', v, { workerIds: [ids.dee], reason: 'Synthetic.' })
    expect(stale.statusCode).toBe(409)
    expect(stale.json().error.code).toBe('STALE_VERSION')
    expect(stale.json().error.current.version).toBe(after.version)
    expect((await visitOf(p.projectId, v.id)).version).toBe(after.version)

    // After commit: the customer once, and both the old and the new worker.
    const [change] = await changeRows(v.id)
    await runNotices()
    const sent = await deliveries([`visit_change:${change?.id}`])
    expect(sent.filter((d) => d.message_key === 'appointment.changed')).toHaveLength(2)
    expect(
      new Set(sent.filter((d) => d.message_key === 'staff_notice.schedule_change').map((d) => d.recipient_id)),
    ).toEqual(new Set([ids.ann, ids.cal]))
    expect(sent.every((d) => d.state === 'failed' && d.error_code === 'template_not_configured')).toBe(true)
    // The customer's appointment is the same date and window: a reassignment does not move it.
    expect((await appointments(p))[0]).toMatchObject({ status: 'confirmed', window: { localDate: date } })
  })

  it('[T42][T65][HH-COM-05] a change superseded before its notice is sent sends nothing; the newest change sends once', async () => {
    const p = await siteVisitProject()
    const v = await bookedVisit(p, 'site_estimate', day(22), 'ann')
    const first = await move('office', v, {
      localDate: day(23),
      windowStart: '10:00',
      windowEnd: '11:00',
      reason: 'Synthetic: first.',
    })
    expect(first.statusCode, first.body).toBe(200)
    const mid = await visitOf(p.projectId, v.id)
    const second = await reassign('office', mid, { workerIds: [ids.cal], reason: 'Synthetic: second.' })
    expect(second.statusCode, second.body).toBe(200)
    const [a, b] = await changeRows(v.id)
    await runNotices()
    const toCustomer = (rows: Awaited<ReturnType<typeof deliveries>>) =>
      rows.filter((d) => d.message_key === 'appointment.changed')
    expect(toCustomer(await deliveries([`visit_change:${a?.id}`]))).toEqual([])
    expect(toCustomer(await deliveries([`visit_change:${b?.id}`]))).toHaveLength(2)
    // Replaying the worker never duplicates a notice.
    await runNotices()
    expect(toCustomer(await deliveries([`visit_change:${b?.id}`]))).toHaveLength(2)
  })

  it('[HH-SCH-07][HH-STAFF-07][OWN-DEC-123] reassigning a visit flagged by time off resolves its visit_flagged item', async () => {
    const date = day(25)
    const p = await siteVisitProject()
    const v = await bookedVisit(p, 'site_estimate', date, 'cal')
    const off = await staffWrite('owner', 'POST', `/api/v1/staff/workers/${ids.cal}/time-off`, {
      startDate: date,
      endDate: date,
    })
    expect(off.statusCode, off.body).toBe(201)
    expect(await openItems('visit_flagged', v.id)).toMatchObject([{ resolved_at: null }])
    const flagged = await visitOf(p.projectId, v.id)
    expect(flagged.actions.reassign).toBe(true)
    const done = await reassign('office', flagged, { workerIds: [ids.ann], reason: 'Synthetic: Cal is off that day.' })
    expect(done.statusCode, done.body).toBe(200)
    expect(await openItems('visit_flagged', v.id)).toMatchObject([{ resolution: 'flags_cleared' }])
  })

  it('[HH-SCH-07] a reschedule of a confirmed visit records its reason; a tentative visit has no request to confirm', async () => {
    const p = await siteVisitProject()
    const v = await bookedVisit(p, 'site_estimate', day(26), 'ann')
    const res = await move('office', v, { localDate: day(27), windowStart: '09:00', windowEnd: '10:00' })
    expect(res.statusCode).toBe(400)
    expect(codes(res.body)).toEqual([['body.reason', 'REASON_REQUIRED']])
    const tentative = await planVisit(p, 'site_estimate', day(28))
    const bad = await move('office', tentative, {
      localDate: day(29),
      windowStart: '09:00',
      windowEnd: '10:00',
      changeRequestId: randomUUID(),
    })
    expect(codes(bad.body)).toEqual([['body.changeRequestId', 'REQUEST_NOT_FOR_VISIT']])
    // A visit keeps its number.
    await expect(sql`UPDATE work.visits SET number = number + 7 WHERE id = ${v.id}`.execute(t.db)).rejects.toThrow()
  })
})

describe('[HH-PRIV-03][HH-PORT-04] change requests and visit changes in a privacy request (TSK-0100 x TSK-0066)', () => {
  it("[HH-PRIV-03][HH-PORT-04] the search keeps the visits' change history and the requester's own requests; the export holds their words, never staff handling", async () => {
    const p = await siteVisitProject()
    const v = await bookedVisit(p, 'site_estimate', day(16), 'ben')
    const asked = await customerRequest(p, v.number, 'reschedule', {
      reason: 'Synthetic: a privacy family event.',
      preferredTimes: 'Synthetic: any privacy afternoon',
    })
    expect(asked.statusCode, asked.body).toBe(200)
    const r = (await visitOf(p.projectId, v.id)).changeRequest as NonNullable<VisitView['changeRequest']>
    const declined = await decline('office', r.id, r.version, { reason: 'Synthetic: staff-only privacy decline.' })
    expect(declined.statusCode, declined.body).toBe(200)
    const kept = await visitOf(p.projectId, v.id)
    const moved = await move('office', kept, {
      localDate: day(17),
      windowStart: '09:00',
      windowEnd: '10:00',
      reason: 'Synthetic: staff-only privacy move.',
      initiator: 'handyhub',
      handyhubCause: 'weather',
    })
    expect(moved.statusCode, moved.body).toBe(200)
    expect((await customerRequest(p, v.number, 'cancellation')).statusCode).toBe(200)

    const owner = await t.db
      .selectFrom('intake.requests as r')
      .innerJoin('crm.projects as p', 'p.id', 'r.project_id')
      .select(['p.customer_id', 'r.contact_id'])
      .where('r.id', '=', p.requestId)
      .executeTakeFirstOrThrow()
    const plan = await customerPlan(t.db, {
      customerId: owner.customer_id,
      contactId: owner.contact_id,
      accountIds: [],
    })
    // One visit and its one committed change are job records; the two requests are the record of what was asked.
    expect(plan.items).toContainEqual(
      expect.objectContaining({ category: 'job_records', disposition: 'retain', count: 2, reason: 'active_record' }),
    )
    expect(plan.items).toContainEqual(
      expect.objectContaining({ category: 'requests', disposition: 'retain', count: 2, reason: 'request_record' }),
    )
    // Neither is deleted by a deletion request (nothing of theirs names an estimate version).
    expect(plan.items.filter((i) => i.disposition === 'delete' && i.category === 'requests')).toEqual([])

    const data = PRIVACY_EXPORT.project(
      await customerExport(t.db, { customerId: owner.customer_id, contactId: owner.contact_id, accountId: null }),
    )
    expect(data.appointmentRequests).toEqual([
      expect.objectContaining({
        project: p.reference,
        appointment: v.number,
        kind: 'reschedule',
        state: 'declined',
        reason: 'Synthetic: a privacy family event.',
        preferredTimes: 'Synthetic: any privacy afternoon',
        endedAt: expect.any(String),
      }),
      expect.objectContaining({ kind: 'cancellation', state: 'open', reason: null, endedAt: null }),
    ])
    const text = JSON.stringify(data)
    expect(text).not.toContain('staff-only privacy')
  })
})
