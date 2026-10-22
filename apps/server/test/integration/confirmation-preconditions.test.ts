// Confirmation preconditions, the deposit gate and blocking holds against PostgreSQL 16 (TSK-0064; HH-SCH-06,
// HH-SCH-05, HH-FIN-02, T09, T36, T40, ENT-Hold, ENT-Visit, ENT-DepositRequirement, ENT-SchedulingTask, OWN-DEC-82,
// OWN-DEC-104, OWN-DEC-137, RULE-SAFETY-GATES, RULE-SERVER-AUTHZ). Staff, customers, working hours, holds, notes and
// names are synthetic (RULE-SYNTHETIC-DATA): the hours below are test fixtures, never the business's hours, and the
// estimate terms version recorded below is a fixture of this throwaway database, never the owner's sign-off.
// - Every confirmation path is exercised: a staff confirmation, the customer's selection of an offered window and the
//   reschedule of a confirmed visit. Each refusal names every unmet precondition at once and changes nothing.
// - A review hold is raised the way staff raise it (a qualification revision whose risk flags name a hazard) and
//   released only through the hold actions (the Owner resolves it after a review, or cancels it as entered in error).
// - "As if planned earlier": a work visit whose deposit is due cannot be planned on the default server, so it is
//   planned on a server whose only work-visit gate is a test gate, exactly as the TSK-0059 tests do.
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
import { visitsModule, type WorkVisitGate } from '../../src/modules/visits/index.js'
import { recordPolicyVersion } from '../../src/platform/config/index.js'
import { FakeObjectStorage } from '../../src/providers/r2/index.js'
import { verifyCountyOf } from '../fixtures/county.js'
import { testConfig } from '../fixtures/env.js'

const ZONE = 'America/Kentucky/Louisville'
const KEY: CodeKeySettings = readCodeKey({
  HANDYHUB_ENV: 'ci',
  CODE_HASH_KEY: ['synthetic', 'confirmation', 'code', 'key', 'for', 'tests', 'only', '0064'].join('-'),
})
const pw = ['synthetic', 'confirmation', 'passphrase', '64'].join(' ')
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
    headers: { 'x-forwarded-for': '198.51.100.164' },
    payload: { email: `${p}-confirmation@example.test`, password: pw },
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
  wide = createDb(t.url, { max: 8, applicationName: 'confirmation-test' })
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
        email: `${p}-confirmation@example.test`,
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
        email: `${c}-crew-confirmation@example.test`,
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

/**
 * A qualified synthetic request with "Site visit needed", and a verified customer session for its project. Unless
 * told otherwise, staff have recorded the address and county check (TSK-0127) that every first confirmation needs.
 */
async function siteVisitProject(opts: { zip?: string; countyVerified?: boolean } = {}): Promise<Project> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/public/requests',
    headers: { 'idempotency-key': key('submit'), 'x-forwarded-for': `198.51.100.${++ip}` },
    payload: {
      formVersion: 'test-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-01' }],
      notSure: false,
      description: 'Synthetic confirmation project.',
      answers: [],
      property: {
        street: `${++seq} Synthetic Confirmation Row`,
        city: 'Testville',
        state: 'ky',
        zip: opts.zip ?? '40000',
        propertyType: 'house',
      },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'site_visit',
      contact: {
        fullName: 'Synthetic Confirmation Customer',
        email: `confirmation-${seq}-${randomUUID().slice(0, 8)}@example.test`,
        phone: '(502) 555-0164',
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
    { customerExplanation: 'We need to see the synthetic wall.', workPackages: ['SVC-DW-01'] },
    1,
  )
  expect(moved.statusCode, moved.body).toBe(200)
  if (opts.countyVerified ?? true) await verifyCountyOf(t.db, row.project_id, { verifiedBy: ids.office })
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
      'x-forwarded-for': `2001:db8:64:${++ip}::1`,
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
      fullName: 'Synthetic Confirmation Customer',
    },
  })
  expect(res.statusCode, res.body).toBe(201)
  return (
    await t.db.selectFrom('work.jobs').select('id').where('project_id', '=', p.projectId).executeTakeFirstOrThrow()
  ).id
}

type Blocker = { field: string; code: string }
type VisitView = {
  id: string
  purpose: string
  state: string
  version: number
  windowVersion: number
  confirmationBlockers: Blocker[] | null
  offers: { id: string; number: number; state: string }[]
  assignments: { kind: string; endedAt: string | null }[]
  actions: { changeWindow: boolean; confirm: boolean; offerWindows: boolean }
}
type Visits = { visits: VisitView[]; schedulingTask: { state: string } | null }
const projectVisits = async (projectId: string, who: Person = 'office') => {
  const res = await staffGet(who, `/api/v1/staff/projects/${projectId}/visits`)
  expect(res.statusCode, res.body).toBe(200)
  return res.json<Visits>()
}
const visitOf = async (projectId: string, visitId: string) =>
  (await projectVisits(projectId)).visits.find((v) => v.id === visitId) as VisitView

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
const win = (date: string, start: string, end: string) => ({ localDate: date, windowStart: start, windowEnd: end })
async function offerWindows(v: VisitView, date: string, worker: Crew, on: 'app' | 'gated' = 'app') {
  const url = `/api/v1/staff/visits/${v.id}/offers`
  const payload = { windows: [win(date, '09:00', '10:00'), win(date, '13:00', '14:00')], workerIds: [ids[worker]] }
  return on === 'app' ? staffWrite('office', 'POST', url, payload, v.version) : gatedWrite(url, payload, v.version)
}
const select = (p: Project, number: number, position: number) =>
  app.inject({
    method: 'POST',
    url: `/api/v1/customer/projects/${p.reference}/window-offers/${number}/select`,
    payload: { position },
    headers: {
      cookie: p.cookie,
      'idempotency-key': key('customer'),
      'x-forwarded-for': `203.0.113.${(++ip % 200) + 1}`,
    },
  })
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

/** Staff flag a potential hazard on the request (a qualification revision): one review hold per new category. */
async function raiseHold(p: Project, hazards: string[], note: string): Promise<string[]> {
  const res = await staffWrite(
    'office',
    'PUT',
    `/api/v1/staff/requests/${p.requestId}/qualification`,
    { checks: { ...ALL_OK, risk_flags: { outcome: 'attention', note, hazards } } },
    p.qualification,
  )
  expect(res.statusCode, res.body).toBe(200)
  p.qualification += 1
  return res.json<{ holdsOpened: string[] }>().holdsOpened
}
const holdAction = (id: string, what: string) => `/api/v1/staff/holds/${id}/actions/${what}`
/** The Owner resolves a hold after a review, with how it was resolved and who reviewed it. */
async function resolveHold(id: string) {
  expect((await staffWrite('office', 'POST', holdAction(id, 'start-review'), {}, 1)).statusCode).toBe(200)
  const resolved = await staffWrite(
    'owner',
    'POST',
    holdAction(id, 'resolve'),
    { resolutionNote: 'Synthetic: the requirement was confirmed resolved.', reviewer: 'Synthetic Reviewer' },
    2,
  )
  expect(resolved.statusCode, resolved.body).toBe(200)
}

describe('[HH-CUS-03][HH-SCH-06][OWN-DEC-179][OWN-DEC-167] a ZIP check is screening: staff verify the address and county before a first confirmation (TSK-0127, final owner amendments 2026-10-22)', () => {
  const property = async (p: Project) =>
    t.db
      .selectFrom('crm.projects as pj')
      .innerJoin('crm.properties as pr', 'pr.id', 'pj.property_id')
      .select(['pr.id', 'pr.version', 'pr.address_version', 'pr.coverage_result', 'pr.coverage_reason'])
      .where('pj.id', '=', p.projectId)
      .executeTakeFirstOrThrow()
  const verify = (who: Person, pr: { id: string; version: number; address_version: number }, body: object) =>
    staffWrite(
      who,
      'POST',
      `/api/v1/staff/properties/${pr.id}/county-verification`,
      { addressVersion: pr.address_version, addressChecked: true, ...body },
      pr.version,
    )

  it('[HH-CUS-03][OWN-DEC-179] EDGE and UNKNOWN requests are accepted and routed to staff verification', async () => {
    // 40241: a ZIP of the owner's dataset tied to two service counties (EDGE); 40201: a PO Box ZIP (UNKNOWN); 40000:
    // a ZIP the dataset does not list (UNKNOWN). Each request is saved, received, and waits for staff.
    for (const [zip, outcome, reason] of [
      ['40241', 'boundary', 'dataset_several_counties'],
      ['40201', 'unknown', 'mailing_zip'],
      ['40000', 'unknown', 'not_listed'],
    ] as const) {
      const p = await siteVisitProject({ zip, countyVerified: false })
      expect(await property(p), zip).toMatchObject({ coverage_result: outcome, coverage_reason: reason })
      const req = await staffGet('office', `/api/v1/staff/requests/${p.requestId}`)
      expect(req.statusCode, req.body).toBe(200)
      expect(req.json().coverage, zip).toMatchObject({
        result: outcome,
        reason,
        code: outcome === 'boundary' ? 'EDGE' : 'UNKNOWN',
      })
    }
  })

  it('[HH-SCH-06][OWN-DEC-167][RULE-SAFETY-GATES] a SERVED ZIP alone never confirms: the first visit waits for the recorded address and county check', async () => {
    // 40202: a Standard ZIP of the owner's dataset in one service county (SERVED by ZIP only).
    const p = await siteVisitProject({ zip: '40202', countyVerified: false })
    expect(await property(p)).toMatchObject({ coverage_result: 'in_coverage', coverage_reason: 'dataset_one_county' })
    const v = await planVisit(p, 'site_estimate', day(12))
    const listed = await visitOf(p.projectId, v.id)
    expect(listed.confirmationBlockers).toEqual([{ field: 'coverage', code: 'COUNTY_NOT_VERIFIED' }])
    expect(listed.actions).toMatchObject({ confirm: false, offerWindows: false })
    for (const who of ['owner', 'office'] as const) {
      const refused = await confirm(who, v)
      expect(refused.statusCode, refused.body).toBe(409)
      expect(codes(refused.body)).toEqual([['coverage', 'COUNTY_NOT_VERIFIED']])
    }
    // No times are offered either (the selection could not confirm them).
    const notOffered = await offerWindows(v, day(12), 'ben')
    expect(notOffered.statusCode, notOffered.body).toBe(409)
    expect(codes(notOffered.body)).toContainEqual(['coverage', 'COUNTY_NOT_VERIFIED'])
    // The database refuses the confirmation itself, whatever writes it.
    await expect(
      sql`UPDATE work.visits SET state = 'confirmed', version = version + 1 WHERE id = ${v.id}`.execute(t.db),
    ).rejects.toThrow(/verify the property address and county/)
    expect((await visitOf(p.projectId, v.id)).state).toBe('tentative')
    // OWN-DEC-206: a SERVED ZIP whose verified address lies in a county outside the area is not eligible.
    const pr = await property(p)
    const outside = await verify('office', pr, { state: 'IN', county: 'Synthetic' })
    expect(outside.json()).toMatchObject({ inArea: false })
    expect(codes((await confirm('office', v)).body)).toEqual([['coverage', 'COUNTY_OUTSIDE_AREA']])
    await expect(
      sql`UPDATE work.visits SET state = 'confirmed', version = version + 1 WHERE id = ${v.id}`.execute(t.db),
    ).rejects.toThrow(/outside the service area/)
    expect((await visitOf(p.projectId, v.id)).state).toBe('tentative')
  })

  it('[RULE-SERVER-AUTHZ][OWN-DEC-167] only the confirming roles record the check, for the current address version, with the address checked', async () => {
    const p = await siteVisitProject({ zip: '40202', countyVerified: false })
    const pr = await property(p)
    for (const who of ['estimator', 'worker'] as const)
      expect((await verify(who, pr, { state: 'KY', county: 'Jefferson' })).statusCode, who).toBe(403)
    const unchecked = await staffWrite(
      'office',
      'POST',
      `/api/v1/staff/properties/${pr.id}/county-verification`,
      { addressVersion: pr.address_version, addressChecked: false, state: 'KY', county: 'Jefferson' },
      pr.version,
    )
    expect(unchecked.statusCode).toBe(400)
    const stale = await verify(
      'office',
      { ...pr, address_version: pr.address_version + 1 },
      { state: 'KY', county: 'Jefferson' },
    )
    expect(stale.statusCode, stale.body).toBe(409)
    expect(codes(stale.body)).toEqual([['body.addressVersion', 'ADDRESS_VERSION_CHANGED']])
    expect(
      (await verify('office', { ...pr, version: pr.version + 1 }, { state: 'KY', county: 'Jefferson' })).statusCode,
    ).toBe(409)
    const ok = await verify('office', pr, { state: 'ky', county: ' jefferson county ', note: 'Synthetic: checked.' })
    expect(ok.statusCode, ok.body).toBe(200)
    expect(ok.json()).toMatchObject({
      inArea: true,
      state: 'KY',
      county: 'Jefferson',
      addressVersion: pr.address_version,
    })
    const audited = await t.db
      .selectFrom('platform.audit_events')
      .select(['action', 'actor_id', 'summary'])
      .where('action', '=', 'property.verify_county')
      .where('target_id', '=', pr.id)
      .executeTakeFirstOrThrow()
    expect(audited).toMatchObject({
      actor_id: ids.office,
      summary: { addressVersion: pr.address_version, state: 'KY', county: 'Jefferson', inArea: true },
    })
    const view = (await staffGet('office', `/api/v1/staff/properties/${pr.id}`)).json()
    expect(view.countyVerification).toMatchObject({ state: 'KY', county: 'Jefferson', inArea: true })
    expect(view.actions.verifyCounty).toBe(true)
  })

  it('[HH-SCH-06][OWN-DEC-167] once verified inside the area the first visit confirms and records the verified county; a county outside the area needs the Owner’s exception', async () => {
    // EDGE by ZIP; the address check decides.
    const p = await siteVisitProject({ zip: '40241', countyVerified: false })
    const pr = await property(p)
    const v = await planVisit(p, 'site_estimate', day(13))
    const outside = await verify('office', pr, { state: 'KY', county: 'Synthetic' })
    expect(outside.json()).toMatchObject({ inArea: false })
    expect((await visitOf(p.projectId, v.id)).confirmationBlockers).toEqual([
      { field: 'coverage', code: 'COUNTY_OUTSIDE_AREA' },
    ])
    expect(codes((await confirm('office', v)).body)).toEqual([['coverage', 'COUNTY_OUTSIDE_AREA']])
    // A new verification is a new row; the newest of the current address version counts.
    const inside = await verify('office', pr, { state: 'KY', county: 'Oldham' })
    expect(inside.json()).toMatchObject({ inArea: true, county: 'Oldham' })
    const ready = await visitOf(p.projectId, v.id)
    expect(ready.confirmationBlockers).toEqual([])
    expect((await confirm('office', ready)).statusCode).toBe(200)
    const visit = await t.db
      .selectFrom('work.visits as v')
      .innerJoin('crm.property_county_verifications as c', 'c.id', 'v.county_verification_id')
      .select(['v.state', 'c.county', 'c.state as countyState', 'c.verified_by'])
      .where('v.id', '=', v.id)
      .executeTakeFirstOrThrow()
    expect(visit).toEqual({ state: 'confirmed', county: 'Oldham', countyState: 'KY', verified_by: ids.office })
    const shown = (await staffGet('office', `/api/v1/staff/projects/${p.projectId}/visits`)).json()
    expect(shown.coverage).toMatchObject({
      result: 'boundary',
      code: 'EDGE',
      countyVerification: { county: 'Oldham', inArea: true, verifiedBy: { id: ids.office } },
    })
    await expect(sql`DELETE FROM crm.property_county_verifications`.execute(t.db)).rejects.toThrow(/APPEND_ONLY/)
  })

  it('[OWN-DEC-167] a changed address needs a new check before the next first confirmation', async () => {
    const p = await siteVisitProject({ zip: '40202' })
    const pr = await property(p)
    const moved = await staffWrite(
      'owner',
      'PUT',
      `/api/v1/staff/properties/${pr.id}/address`,
      {
        street: `${++seq} Synthetic Moved Row`,
        city: 'Testville',
        state: 'KY',
        zip: '40202',
        source: 'customer_call',
        reason: 'Synthetic: the customer corrected the street.',
      },
      pr.version,
    )
    expect(moved.statusCode, moved.body).toBe(200)
    const v = await planVisit(p, 'site_estimate', day(14))
    expect((await visitOf(p.projectId, v.id)).confirmationBlockers).toEqual([
      { field: 'coverage', code: 'COUNTY_NOT_VERIFIED' },
    ])
  })
})

describe('[HH-SCH-06][HH-FIN-02][T36] an unpaid deposit blocks confirmation with its reason', () => {
  it('[HH-SCH-06][HH-FIN-02][HH-SCH-05][T36][RULE-SAFETY-GATES] staff confirmation names the deposit and every other unmet item at once; nothing looks booked', async () => {
    const p = await siteVisitProject()
    // One synthetic patch at $1,500.00, so a deposit of $300.00 is required (FACT-DEPOSIT-RULE).
    const jobId = await approve(p, 150_000)
    const v = await planVisit(p, 'service', day(10), 'gated')
    // The staff view lists the deposit as what stops the confirmation, and offers no Confirm.
    const listed = await visitOf(p.projectId, v.id)
    expect(listed.confirmationBlockers).toEqual([{ field: 'deposit', code: 'DEPOSIT_REQUIRED' }])
    expect(listed.actions.confirm).toBe(false)
    // The server refuses it, by any role and on a server whose module gates omit the deposit gate, naming the deposit
    // and the capacity problem of a worker without working hours in the same refusal.
    for (const who of ['owner', 'office'] as const) {
      const refused = await confirm(who, v, 'dee')
      expect(refused.statusCode, refused.body).toBe(409)
      expect(codes(refused.body)).toEqual([
        ['deposit', 'DEPOSIT_REQUIRED'],
        [`workers.${ids.dee}`, 'WORKING_HOURS_NOT_SET'],
      ])
    }
    const viaGated = await gatedWrite(`/api/v1/staff/visits/${v.id}/confirm`, { workerIds: [ids.ann] }, v.version)
    expect(viaGated.statusCode, viaGated.body).toBe(409)
    expect(codes(viaGated.body)).toEqual([['deposit', 'DEPOSIT_REQUIRED']])
    // Pending deposit never looks booked (HH-SCH-05): the visit stays tentative and reserves no one, the scheduling
    // task is not fulfilled, and the customer sees no appointment, only the deposit step.
    const after = await projectVisits(p.projectId)
    expect(after.visits.find((x) => x.id === v.id)).toMatchObject({ state: 'tentative', version: v.version })
    expect(after.visits.find((x) => x.id === v.id)?.assignments).toEqual([])
    expect(after.schedulingTask?.state).toBe('planning')
    expect((await customerGet(p, 'appointments')).appointments ?? []).toEqual([])
    expect((await customerGet(p, 'overview')).status).toMatchObject({ step: 'deposit_due', nextAction: 'pay_deposit' })
    // Verified money satisfies it: nothing blocks, Confirm is offered and the confirmation books the visit.
    await pay(jobId)
    const ready = await visitOf(p.projectId, v.id)
    expect(ready.confirmationBlockers).toEqual([])
    expect(ready.actions.confirm).toBe(true)
    expect((await confirm('office', ready)).statusCode).toBe(200)
    expect((await projectVisits(p.projectId)).schedulingTask?.state).toBe('fulfilled')
  })

  it('[HH-SCH-06][HH-FIN-02][T36] the customer selection is refused while the deposit is due, telling only that', async () => {
    const p = await siteVisitProject()
    const jobId = await approve(p, 150_000)
    const v = await planVisit(p, 'service', day(11), 'gated')
    // The default server offers no times for a work visit whose deposit is due.
    const notOffered = await offerWindows(v, day(11), 'ben')
    expect(notOffered.statusCode, notOffered.body).toBe(409)
    expect(codes(notOffered.body)).toContainEqual(['job', 'DEPOSIT_REQUIRED'])
    expect((await offerWindows(v, day(11), 'ben', 'gated')).statusCode).toBe(201)
    const refused = await select(p, 1, 1)
    expect(refused.statusCode, refused.body).toBe(409)
    expect(codes(refused.body)).toEqual([
      ['body.position', 'SCHEDULING_NOT_READY'],
      ['deposit', 'DEPOSIT_REQUIRED'],
    ])
    expect((await visitOf(p.projectId, v.id)).state).toBe('tentative')
    expect((await customerGet(p, 'appointments')).appointments ?? []).toEqual([])
    await pay(jobId)
    expect((await select(p, 1, 1)).statusCode).toBe(200)
    expect((await visitOf(p.projectId, v.id)).state).toBe('confirmed')
  })
})

describe('[HH-SCH-06][T40] an open hold blocks confirmation with its reason', () => {
  it('[HH-SCH-06][T40][RULE-SAFETY-GATES][OWN-DEC-82] a hold about an unresolved permit requirement blocks every role until the Owner resolves it; planning still works', async () => {
    const p = await siteVisitProject()
    await approve(p)
    // Planning a tentative visit is not a booking: a hold never blocks it.
    const v = await planVisit(p, 'service', day(12))
    const [hold] = await raiseHold(p, ['permit_licensing'], 'Synthetic: a permit requirement is not resolved yet.')
    if (!hold) throw new Error('hold opened')
    const listed = await visitOf(p.projectId, v.id)
    expect(listed.confirmationBlockers).toEqual([{ field: `holds.${hold}`, code: 'REVIEW_HOLD_OPEN' }])
    expect(listed.actions).toMatchObject({ confirm: false, offerWindows: false })
    // No role confirms it; the refusal names the hold.
    for (const who of ['owner', 'office'] as const) {
      const refused = await confirm(who, v)
      expect(refused.statusCode, refused.body).toBe(409)
      expect(codes(refused.body)).toEqual([[`holds.${hold}`, 'REVIEW_HOLD_OPEN']])
    }
    expect((await confirm('worker', v)).statusCode).toBe(403)
    // No times are offered while it blocks (PROPOSED).
    const notOffered = await offerWindows(v, day(12), 'ann')
    expect(notOffered.statusCode).toBe(409)
    expect(codes(notOffered.body)).toEqual([[`holds.${hold}`, 'REVIEW_HOLD_OPEN']])
    // The database refuses it too, whatever code path writes it (migration 0057).
    await expect(
      sql`UPDATE work.visits SET state = 'confirmed', version = version + 1 WHERE id = ${v.id}`.execute(t.db),
    ).rejects.toThrow(/blocking hold/)
    // Under review it still blocks; once the Owner resolves it, the visit is confirmed.
    expect((await staffWrite('office', 'POST', holdAction(hold, 'start-review'), {}, 1)).statusCode).toBe(200)
    expect(codes((await confirm('owner', v)).body)).toEqual([[`holds.${hold}`, 'REVIEW_HOLD_OPEN']])
    const resolved = await staffWrite(
      'owner',
      'POST',
      holdAction(hold, 'resolve'),
      { resolutionNote: 'Synthetic: the permit requirement was confirmed resolved.', reviewer: 'Synthetic Reviewer' },
      2,
    )
    expect(resolved.statusCode, resolved.body).toBe(200)
    expect((await visitOf(p.projectId, v.id)).confirmationBlockers).toEqual([])
    expect((await confirm('office', v)).statusCode).toBe(200)
  })

  it('[HH-SCH-06][T40][RULE-SAFETY-GATES] the customer selection is refused while a hold blocks, naming no hold; an unpaid deposit and the hold are named together', async () => {
    const p = await siteVisitProject()
    const jobId = await approve(p, 150_000)
    const v = await planVisit(p, 'service', day(13), 'gated')
    expect((await offerWindows(v, day(13), 'cal', 'gated')).statusCode).toBe(201)
    const [hold] = await raiseHold(p, ['licensed_trade'], 'Synthetic: the scope includes licensed trade work.')
    if (!hold) throw new Error('hold opened')
    // Staff see both reasons at once; the customer is told only that the time cannot be confirmed yet, and the deposit.
    const listed = await visitOf(p.projectId, v.id)
    expect(listed.confirmationBlockers).toEqual([
      { field: 'deposit', code: 'DEPOSIT_REQUIRED' },
      { field: `holds.${hold}`, code: 'REVIEW_HOLD_OPEN' },
    ])
    const both = await select(p, 1, 2)
    expect(both.statusCode).toBe(409)
    expect(codes(both.body)).toEqual([
      ['body.position', 'SCHEDULING_NOT_READY'],
      ['deposit', 'DEPOSIT_REQUIRED'],
    ])
    expect(both.body).not.toContain(hold)
    expect(both.body).not.toContain('licensed')
    await pay(jobId)
    const held = await select(p, 1, 2)
    expect(held.statusCode).toBe(409)
    expect(codes(held.body)).toEqual([['body.position', 'SCHEDULING_NOT_READY']])
    // Nothing changed: the offer is still open and the visit tentative.
    const still = await visitOf(p.projectId, v.id)
    expect(still.state).toBe('tentative')
    expect(still.offers[0]?.state).toBe('open')
    await resolveHold(hold)
    expect((await select(p, 1, 2)).statusCode).toBe(200)
    expect((await visitOf(p.projectId, v.id)).state).toBe('confirmed')
  })

  it('[HH-SCH-06][T40] a resolved or cancelled hold and an ordinary note never block; an estimate visit waits for an open hold (PROPOSED)', async () => {
    const p = await siteVisitProject()
    const estimate = await planVisit(p, 'site_estimate', day(14))
    // An ordinary qualification note and a request note are not holds.
    const noted = await staffWrite(
      'office',
      'PUT',
      `/api/v1/staff/requests/${p.requestId}/qualification`,
      { checks: { ...ALL_OK, risk_flags: { outcome: 'ok', note: 'Synthetic: a friendly dog lives here.' } } },
      p.qualification,
    )
    expect(noted.statusCode, noted.body).toBe(200)
    p.qualification += 1
    expect((await visitOf(p.projectId, estimate.id)).confirmationBlockers).toEqual([])
    const [hold] = await raiseHold(p, ['structural'], 'Synthetic: a sagging beam was mentioned.')
    if (!hold) throw new Error('hold opened')
    expect(codes((await confirm('office', estimate)).body)).toEqual([[`holds.${hold}`, 'REVIEW_HOLD_OPEN']])
    // Entered in error: the Owner cancels it with the reason; it no longer blocks.
    const canceled = await staffWrite(
      'owner',
      'POST',
      holdAction(hold, 'cancel'),
      { reason: 'Synthetic: flagged on the wrong request.' },
      1,
    )
    expect(canceled.statusCode, canceled.body).toBe(200)
    expect((await visitOf(p.projectId, estimate.id)).confirmationBlockers).toEqual([])
    expect((await confirm('office', estimate)).statusCode).toBe(200)
  })

  it('[HH-SCH-06][T40][RULE-SAFETY-GATES] a confirmed visit is not moved while a hold blocks; the booking stays as it was', async () => {
    const p = await siteVisitProject()
    await approve(p)
    const v = await planVisit(p, 'service', day(15))
    const confirmed = await confirm('office', v)
    expect(confirmed.statusCode, confirmed.body).toBe(200)
    const booked = confirmed.json<Visits>().visits.find((x) => x.id === v.id) as VisitView
    const [hold] = await raiseHold(p, ['hazardous_material'], 'Synthetic: old paint may contain lead.')
    if (!hold) throw new Error('hold opened')
    const moved = await staffWrite(
      'office',
      'POST',
      `/api/v1/staff/visits/${v.id}/window`,
      { ...win(day(15), '13:00', '14:00'), reason: 'Synthetic: a reschedule (TSK-0066).' },
      booked.version,
    )
    expect(moved.statusCode, moved.body).toBe(409)
    expect(codes(moved.body)).toEqual([[`holds.${hold}`, 'REVIEW_HOLD_OPEN']])
    const kept = await visitOf(p.projectId, v.id)
    expect(kept).toMatchObject({ state: 'confirmed', version: booked.version, windowVersion: booked.windowVersion })
    expect(kept.confirmationBlockers).toBeNull()
  })
})

describe('[HH-SCH-06] the approval is a precondition of a work visit', () => {
  it('[HH-SCH-06][HH-SCH-05] a work visit whose project left the approved state is not confirmed by staff or the customer', async () => {
    const p = await siteVisitProject()
    await approve(p)
    const staffVisit = await planVisit(p, 'service', day(16))
    const offered = await planVisit(p, 'follow_up', day(17))
    expect((await offerWindows(offered, day(17), 'ben')).statusCode).toBe(201)
    // Fixture: the project goes to the Owner's cancellation review (its own action belongs to the cancellation task).
    await sql`UPDATE crm.projects SET state = 'cancellation_review' WHERE id = ${p.projectId}`.execute(t.db)
    const listed = await visitOf(p.projectId, staffVisit.id)
    expect(listed.confirmationBlockers).toEqual([{ field: 'approval', code: 'APPROVAL_NOT_ACTIVE' }])
    const refused = await confirm('owner', staffVisit)
    expect(refused.statusCode, refused.body).toBe(409)
    expect(codes(refused.body)).toEqual([['approval', 'APPROVAL_NOT_ACTIVE']])
    const selected = await select(p, 1, 1)
    expect(selected.statusCode, selected.body).toBe(409)
    expect(codes(selected.body)).toEqual([['body.position', 'SCHEDULING_NOT_READY']])
    // The Owner keeps the project: the approval is active again and the visit is confirmed.
    await sql`UPDATE crm.projects SET state = 'approved' WHERE id = ${p.projectId}`.execute(t.db)
    expect((await confirm('office', staffVisit)).statusCode).toBe(200)
    expect((await select(p, 1, 1)).statusCode).toBe(200)
  })
})

describe('[T09][HH-SCH-05] preferences and pending items never become a booking', () => {
  it('[T09][HH-SCH-05] the request preference creates no visit; a tentative visit with an open hold is not shown to the customer', async () => {
    const p = await siteVisitProject()
    expect((await projectVisits(p.projectId)).visits).toEqual([])
    const v = await planVisit(p, 'site_estimate', day(18))
    await raiseHold(p, ['other'], 'Synthetic: something to check first.')
    expect((await visitOf(p.projectId, v.id)).actions.confirm).toBe(false)
    const tab = await customerGet(p, 'appointments')
    expect(tab.appointments ?? []).toEqual([])
    expect(tab.offers ?? []).toEqual([])
  })
})

describe('[HH-SCH-06][HH-STAFF-02][HH-STAFF-07] a disabled assignee is never confirmed (with TSK-0097)', () => {
  it('[HH-SCH-06][HH-STAFF-02][HH-STAFF-07][T27][T38] windows held for a disabled worker are not selectable; a booking flagged for reassignment is not moved to them; others still confirm', async () => {
    // A synthetic worker of this test only, with the fixture hours: disabling them changes no other test.
    const eli = await withTx(t.db, async (tx) => {
      const user = await createStaffUser(tx, {
        email: 'eli-crew-confirmation@example.test',
        displayName: 'Synthetic eli',
        locale: 'en',
        role: 'worker',
        issuedBy: 'test',
      })
      await sql`UPDATE identity.staff_users SET status = 'active', activated_at = now() WHERE id = ${user.id}`.execute(
        tx,
      )
      return user.id
    })
    const hours = await staffWrite('owner', 'PUT', `/api/v1/staff/workers/${eli}/working-hours`, { periods: WEEK }, 0)
    expect(hours.statusCode, hours.body).toBe(200)
    // One confirmed Estimate visit of eli, and the windows of another project's visit held for eli.
    const bookedProject = await siteVisitProject()
    const planned = await planVisit(bookedProject, 'site_estimate', day(21))
    const booked = await staffWrite(
      'office',
      'POST',
      `/api/v1/staff/visits/${planned.id}/confirm`,
      { workerIds: [eli] },
      planned.version,
    )
    expect(booked.statusCode, booked.body).toBe(200)
    const bookedView = await visitOf(bookedProject.projectId, planned.id)
    const offeredProject = await siteVisitProject()
    const offered = await planVisit(offeredProject, 'site_estimate', day(22))
    const offer = await staffWrite(
      'office',
      'POST',
      `/api/v1/staff/visits/${offered.id}/offers`,
      { windows: [win(day(22), '09:00', '10:00'), win(day(22), '13:00', '14:00')], workerIds: [eli] },
      offered.version,
    )
    expect(offer.statusCode, offer.body).toBe(201)

    // Offboarding (TSK-0097): both visits are flagged for reassignment, nothing is cancelled.
    const disabled = await staffWrite('owner', 'POST', `/api/v1/staff/members/${eli}/disable`, {
      reason: 'Synthetic: left the team',
    })
    expect(disabled.statusCode, disabled.body).toBe(200)
    const flaggedItem = async (p: Project) => {
      const res = await staffGet('office', `/api/v1/staff/queue?type=visit_flagged&reference=${p.reference}`)
      expect(res.statusCode, res.body).toBe(200)
      return res.json<{ items: { subjectId: string; reason: string }[] }>().items
    }
    expect(await flaggedItem(bookedProject)).toEqual([
      expect.objectContaining({ subjectId: planned.id, reason: 'assignee_disabled' }),
    ])
    expect(await flaggedItem(offeredProject)).toEqual([
      expect.objectContaining({ subjectId: offered.id, reason: 'assignee_disabled' }),
    ])

    // The customer cannot select a window held for the disabled worker: the visit stays tentative and unbooked.
    const selected = await select(offeredProject, 1, 1)
    expect(selected.statusCode, selected.body).toBe(409)
    expect(codes(selected.body)).toEqual([['body.position', 'WINDOW_UNAVAILABLE']])
    const stillOffered = await visitOf(offeredProject.projectId, offered.id)
    expect(stillOffered.state).toBe('tentative')
    expect(stillOffered.assignments.filter((a) => a.kind === 'confirmed')).toEqual([])
    expect((await customerGet(offeredProject, 'appointments')).appointments ?? []).toEqual([])

    // The flagged booking is not moved while it is still the disabled worker's: it waits for its reassignment.
    const moved = await staffWrite(
      'office',
      'POST',
      `/api/v1/staff/visits/${planned.id}/window`,
      { ...win(day(21), '13:00', '14:00'), reason: 'Synthetic: a reschedule (TSK-0066).' },
      bookedView.version,
    )
    expect(moved.statusCode, moved.body).toBe(409)
    expect(codes(moved.body)).toContainEqual([`workers.${eli}`, 'WORKER_NOT_ACTIVE'])
    expect(await visitOf(bookedProject.projectId, planned.id)).toMatchObject({
      state: 'confirmed',
      version: bookedView.version,
      windowVersion: bookedView.windowVersion,
    })
    expect(await flaggedItem(bookedProject)).toHaveLength(1)

    // The visit's own preconditions all hold (the team is chosen when confirming): it is not confirmed to the
    // disabled worker, and it is to an active one.
    const next = await planVisit(bookedProject, 'site_estimate', day(23))
    expect(next.confirmationBlockers).toEqual([])
    const toEli = await staffWrite(
      'office',
      'POST',
      `/api/v1/staff/visits/${next.id}/confirm`,
      { workerIds: [eli] },
      next.version,
    )
    expect(toEli.statusCode, toEli.body).toBe(409)
    expect(codes(toEli.body)).toContainEqual([`workers.${eli}`, 'WORKER_NOT_ACTIVE'])
    expect((await visitOf(bookedProject.projectId, next.id)).state).toBe('tentative')
    expect((await confirm('office', next, 'cal')).statusCode).toBe(200)
  })
})
