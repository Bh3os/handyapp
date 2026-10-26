// Return work and resuming after an incident against PostgreSQL 16 (TSK-0094; HH-QA-07, HH-QA-08, HH-INC-03, HH-FIN-17,
// T54, T56, ENT-Case, ENT-Visit, ENT-Job, FACT-WARRANTY, OWN-DEC-38, OWN-DEC-124, OWN-DEC-135, RULE-HUMAN-REVIEW,
// RULE-MONEY-CENTS, RULE-SAFETY-GATES, RULE-SERVER-AUTHZ). Staff, customers, addresses, texts, amounts and evidence are
// synthetic (RULE-SYNTHETIC-DATA); the estimate terms version recorded below is a fixture of this throwaway database.
// - Visits are fixtures in the first hours of today's local date (as in hazard-reports.test.ts), so On my way is open
//   at any hour the suite runs; dates come from localDateOf(now, America/Kentucky/Louisville), never a weekday.
// - A job reaches "Awaiting quality review" only through the worker's whole checklist and Finished (completion.test.ts
//   walks it); here the state alone is set with the database's triggers off for that one statement, and the review is
//   opened the way Finished opens it (as quality-review.test.ts does). The Owner's review itself is the real route.
// - The reviewed completion date is moved back a number of days with the triggers off for that one statement, in this
//   throwaway database only, to place a report inside or after the 90-day warranty window (local dates, never 24-hour
//   arithmetic). A second project is moved to the first project's customer the same way (a merge is TSK-0046's).
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
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { startCustomerSession } from '../../src/modules/identity/customer-sessions.js'
import { readCodeKey, type CodeKeySettings } from '../../src/modules/identity/index.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import { openQualityReview } from '../../src/modules/quality/index.js'
import { recordPolicyVersion } from '../../src/platform/config/index.js'
import { FakeObjectStorage } from '../../src/providers/r2/index.js'
import { verifyCountyOf } from '../fixtures/county.js'
import { testConfig } from '../fixtures/env.js'
import { png } from '../fixtures/images.js'
import { signInWithMfa } from '../fixtures/staff-mfa.js'
import { verifyPropertyZone } from '../fixtures/zones.js'

const ZONE = 'America/Kentucky/Louisville'
const KEY: CodeKeySettings = readCodeKey({
  HANDYHUB_ENV: 'ci',
  CODE_HASH_KEY: ['synthetic', 'return', 'work', 'code', 'key', 'for', 'tests', 'only', '0102'].join('-'),
})
const pw = ['synthetic', 'return', 'work', 'passphrase', '94'].join(' ')
const PEOPLE = ['owner', 'office', 'estimator', 'ann', 'ben'] as const
type Person = (typeof PEOPLE)[number]

let t: TestDatabase
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
    headers: { 'x-forwarded-for': '198.51.100.194' },
    payload: { email: `${p}-return@example.test`, password: pw },
  })
  expect(res.statusCode, res.body).toBe(200)
  const cookie = String(res.headers['set-cookie']).split(';')[0] as string
  const session = await app.inject({ method: 'GET', url: '/api/v1/staff/auth/session', headers: { cookie } })
  cookies[p] = cookie
  csrf[p] = session.json<{ csrfToken: string }>().csrfToken
}

let seq = 0
const key = () => `synthetic-return-${String(++seq).padStart(6, '0')}-${randomUUID()}`
function staffWrite(who: Person, url: string, payload: unknown, version?: number, method: 'POST' | 'PUT' = 'POST') {
  return app.inject({
    method,
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
  wide = createDb(t.url, { max: 8, applicationName: 'return-work-test' })
  await syncServices(t.db, loadServiceSeed())
  await syncSops(t.db, loadSopSeed())
  await syncLoadouts(t.db, loadLoadoutSeed())
  app = await buildApp({
    config: testConfig({ TRUST_PROXY_HOPS: '1' }),
    api: { db: wide, codeKey: KEY, storage: new FakeObjectStorage() },
  })
  const hash = await hashPassword(pw)
  await withTx(t.db, async (tx) => {
    for (const p of PEOPLE) {
      const role = p === 'ann' || p === 'ben' ? 'worker' : p
      const user = await createStaffUser(tx, {
        email: `${p}-return@example.test`,
        displayName: `Synthetic ${p}`,
        locale: 'en',
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
let ip = 40

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
      description: 'Synthetic return-work project.',
      answers: [],
      property: {
        street: `${++seq} Synthetic Return Lane`,
        city: 'Testville',
        state: 'ky',
        zip: '40000',
        propertyType: 'house',
      },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'site_visit',
      contact: {
        fullName: 'Synthetic Return Customer',
        email: `return-${seq}-${randomUUID().slice(0, 8)}@example.test`,
        phone: '(502) 555-0177',
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
      'x-forwarded-for': `2001:db8:77:${++ip}::1`,
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
      fullName: 'Synthetic Return Customer',
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
async function fixtureVisit(
  p: Project,
  jobId: string,
  team: Person[],
  purpose: 'service' | 'return_work' = 'service',
): Promise<string> {
  const window = fixtureWindow(today(), team)
  return withTx(t.db, async (tx) => {
    const v = await tx
      .insertInto('work.visits')
      .values({
        purpose,
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
    // TSK-0145 (OWN-DEC-193 A4): a return visit of a completed job rests on a recorded follow-up authorization.
    if (purpose === 'return_work')
      await tx
        .insertInto('work.follow_up_authorizations')
        .values({
          visit_id: v.id,
          job_id: jobId,
          project_id: p.projectId,
          basis: 'punch_list',
          note: 'Synthetic: the return visit of the warranty claim.',
          authorized_by: ids.office,
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
  mode: 'start' | 'resume'
  pausedAt: string | null
  visitPurpose: string
  emergency: { call911: string }
  actions: { start: boolean; resume: boolean; recordSiteCheck: boolean; requestException: string[] }
}
async function gate(who: Person, visitId: string): Promise<Gate> {
  const res = await staffGet(who, `/api/v1/staff/visits/${visitId}/start-gate`)
  expect(res.statusCode, res.body).toBe(200)
  return res.json<Gate>()
}
const missingOf = (g: Gate) => g.items.flatMap((i) => i.missing.filter((m) => !m.exceptionId).map((m) => m.code))
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
const start = (who: Person, visitId: string, packetVersion: number) =>
  staffWrite(who, `/api/v1/staff/visits/${visitId}/start`, { packetVersion })
const resume = (who: Person, visitId: string, packetVersion: number) =>
  staffWrite(who, `/api/v1/staff/visits/${visitId}/resume`, { packetVersion })
const jobState = async (jobId: string) =>
  (await t.db.selectFrom('work.jobs').select('operational_state').where('id', '=', jobId).executeTakeFirstOrThrow())
    .operational_state
// --- Stop Work, release and resume ----------------------------------------------------------------------------------

type HazardAnswer = {
  reportId: string
  holdId: string
  holdState: string
  jobState: string
  jobPaused: boolean
  affectedWorkPackageIds: string[]
  hazard: string
  reviewer: string
  guidance: string[]
  resolveOnSite: boolean
  emergency: { call911: string }
}
const stopWork = (who: Person, jobId: string, body: Record<string, unknown> = {}, idem?: string) =>
  app.inject({
    method: 'POST',
    url: `/api/v1/staff/jobs/${jobId}/hazard-reports`,
    payload: body,
    headers: { cookie: cookies[who], 'x-csrf-token': csrf[who], 'idempotency-key': idem ?? key() },
  })
const holdOf = (id: string) => t.db.selectFrom('work.holds').selectAll().where('id', '=', id).executeTakeFirstOrThrow()
const packagesOf = (jobId: string) =>
  t.db.selectFrom('work.work_packages').select(['id', 'state']).where('job_id', '=', jobId).execute()
const releaseHold = async (holdId: string, by: Person = 'owner') => {
  const h = await holdOf(holdId)
  const r1 = await staffWrite(by, `/api/v1/staff/critical-holds/${holdId}/actions/start-review`, {}, h.version)
  expect(r1.statusCode, r1.body).toBe(200)
  const r2 = await staffWrite(
    by,
    `/api/v1/staff/critical-holds/${holdId}/actions/resolve`,
    {
      resolutionNote: 'Synthetic: the wiring was made safe by the qualified person.',
      evidence: 'Synthetic: the electrician visit reference',
      reviewer: 'Synthetic Electrician',
      reviewerQualification: 'Synthetic: licensed electrician',
    },
    h.version + 1,
  )
  expect(r2.statusCode, r2.body).toBe(200)
}

/** The caller's checklist blockers on a job (TSK-0075; TSK-0094 adds RESUME_REQUIRED). */
async function checklistBlockers(who: Person, jobId: string): Promise<string[]> {
  const res = await staffGet(who, `/api/v1/staff/jobs/${jobId}/checklist`)
  expect(res.statusCode, res.body).toBe(200)
  return res.json<{ blockers: string[] }>().blockers
}

// --- Return-work helpers -----------------------------------------------------------------------------------------------

/**
 * A started job moved to "Awaiting quality review" (the triggers off for that one statement, see the header), then
 * the Owner's real review: started and passed with every area OK, so the job becomes operationally complete.
 */
async function reviewedComplete(jobId: string) {
  await withTx(t.db, async (tx) => {
    await sql`SET LOCAL session_replication_role = replica`.execute(tx)
    await sql`UPDATE work.jobs SET operational_state = 'ready_for_qa', version = version + 1 WHERE id = ${jobId}`.execute(
      tx,
    )
  })
  await withTx(t.db, (tx) => openQualityReview(tx, jobId))
  const started = await staffWrite('owner', `/api/v1/staff/jobs/${jobId}/quality-review/actions/start`, {})
  expect(started.statusCode, started.body).toBe(200)
  const decided = await staffWrite(
    'owner',
    `/api/v1/staff/jobs/${jobId}/quality-review/actions/decide`,
    { results: { scope: 'ok', checklist: 'ok', evidence: 'ok', walkthrough: 'ok' } },
    started.json<{ version: number }>().version,
  )
  expect(decided.statusCode, decided.body).toBe(200)
  expect(await jobState(jobId)).toBe('operationally_complete')
}
/** Moves the reviewed completion back `days` local days (the triggers off for that one statement, see the header). */
async function reviewedDaysAgo(jobId: string, days: number) {
  const passedOn = addLocalDays(today(), -days)
  await withTx(t.db, async (tx) => {
    await sql`SET LOCAL session_replication_role = replica`.execute(tx)
    await sql`UPDATE quality.reviews SET passed_at = (${passedOn}::date + time '12:00') AT TIME ZONE ${ZONE}
              WHERE job_id = ${jobId}`.execute(tx)
  })
  return passedOn
}
const complaint = async (p: Project, jobId: string) => {
  const res = await staffWrite('office', `/api/v1/staff/projects/${p.projectId}/complaints`, {
    category: 'work_quality',
    severity: 'moderate',
    source: 'call',
    assignedTo: ids.office,
    dueOn: addLocalDays(today(), 3),
    description: 'Synthetic: the customer says a seam of the patch opened.',
    jobId,
  })
  expect(res.statusCode, res.body).toBe(201)
  return res.json<{ caseId: string; version: number }>()
}
type ReturnView = {
  caseState: string
  originalJob: { jobId: string; state: string } | null
  warranty: {
    reviewedCompletionOn: string | null
    lastDayOn: string | null
    reportedOn: string
    within: boolean | null
    days: number
  } | null
  returnWork: {
    id: string
    version: number
    classification: string
    window: { reviewedCompletionOn: string | null; reportedOn: string | null; within: boolean | null }
    decision: { coverage: string; price: string } | null
    returnJob: { jobId: string } | null
    visits: { visitId: string; state: string }[]
    items: { id: string; state: string; version: number; actions: { recheck: boolean } }[]
    costs: { id: string; amountCents: number; voided: unknown }[]
    totals: { costCents: number; laborMinutes: number; laborCost: string }
    history: { event: string }[]
  } | null
  actions: Record<string, boolean>
}
async function returnView(who: Person, caseId: string): Promise<ReturnView> {
  const res = await staffGet(who, `/api/v1/staff/cases/${caseId}/return-work`)
  expect(res.statusCode, res.body).toBe(200)
  return res.json<ReturnView>()
}
const classify = (who: Person, caseId: string, version: number, classification: string, note?: string) =>
  staffWrite(
    who,
    `/api/v1/staff/cases/${caseId}/return-work`,
    { classification, ...(note ? { note } : {}) },
    version,
    'PUT',
  )
const itemBody = () => ({
  area: 'Hallway patch',
  description: 'Synthetic: re-tape and finish the opened seam.',
  requiredEvidence: 'Synthetic: a note of what was done',
  assignedTo: ids.ann,
  dueOn: addLocalDays(today(), 2),
})

// --- Resuming after an incident ----------------------------------------------------------------------------------------

describe('[HH-INC-03][T54][RULE-SAFETY-GATES] resuming after an incident needs the resolution, a new review and the gate', () => {
  let p: Project
  let jobId: string
  let visitId: string
  let holdId: string

  beforeAll(async () => {
    p = await project()
    jobId = await approve(p)
    visitId = await fixtureVisit(p, jobId, ['ann', 'ben'])
    for (const who of ['ann', 'ben'] as const) {
      const v = await prepare(who, visitId, jobId)
      const s = await start(who, visitId, v)
      expect(s.statusCode, s.body).toBe(201)
    }
    expect(await jobState(jobId)).toBe('in_progress')
    const stop = await stopWork('ann', jobId, { hazard: 'live_wiring', visitId })
    expect(stop.statusCode, stop.body).toBe(201)
    const a = stop.json<HazardAnswer>()
    expect(a).toMatchObject({ jobPaused: true, jobState: 'paused', holdState: 'open' })
    holdId = a.holdId
  })

  it('[HH-INC-03] resume without the resolution is refused and recorded; the job stays paused', async () => {
    const g = await gate('ann', visitId)
    expect(g.mode).toBe('resume')
    expect(g.pausedAt).not.toBeNull()
    expect(missingOf(g)).toContain('CRITICAL_HOLD_OPEN')
    expect(g.actions).toMatchObject({ start: false, resume: false, recordSiteCheck: true })
    const refused = await resume('ann', visitId, g.packet?.version ?? 1)
    expect(refused.statusCode, refused.body).toBe(409)
    expect(codesOf(refused)).toContain('CRITICAL_HOLD_OPEN')
    expect(await jobState(jobId)).toBe('paused')
    const ev = await t.db
      .selectFrom('work.start_gate_evaluations')
      .select(['outcome', 'purpose'])
      .where('visit_id', '=', visitId)
      .where('staff_user_id', '=', ids.ann)
      .orderBy('evaluated_at', 'desc')
      .executeTakeFirstOrThrow()
    expect(ev).toEqual({ outcome: 'blocked', purpose: 'resume' })
    // Start Work is no way around it: the worker already started on this visit, and a paused job does not start.
    expect(codesOf(await start('ann', visitId, g.packet?.version ?? 1))).toEqual(
      expect.arrayContaining(['ALREADY_STARTED', 'JOB_NOT_STARTABLE', 'CRITICAL_HOLD_OPEN']),
    )
    // The database refuses a resumption without its passing evaluation, whatever path writes.
    await expect(
      t.db
        .insertInto('work.work_resumptions')
        .values({
          job_id: jobId,
          project_id: p.projectId,
          visit_id: visitId,
          staff_user_id: ids.ann,
          evaluation_id: randomUUID(),
          packet_version: 1,
          acknowledgment_id: randomUUID(),
          job_state_before: 'paused',
          paused_at: new Date(),
        })
        .execute(),
    ).rejects.toThrow()
  })

  it('[OWN-DEC-38] the reporter cannot release the hold they raised; the Owner releases it with evidence', async () => {
    const h = await holdOf(holdId)
    const own = await staffWrite('ann', `/api/v1/staff/critical-holds/${holdId}/actions/start-review`, {}, h.version)
    expect(own.statusCode).toBe(403)
    await releaseHold(holdId)
    expect((await holdOf(holdId)).state).toBe('resolved')
    // Releasing the hold resumes nothing by itself.
    expect(await jobState(jobId)).toBe('paused')
    // TSK-0150 (OWN-DEC-199): the paused job, its safety hold released, is "Update pending" for the customer: never
    // "Work in progress" nor an appointment step, and nothing is asked of them.
    const overview = await app.inject({
      method: 'GET',
      url: `/api/v1/customer/projects/${p.reference}/overview`,
      headers: { cookie: p.cookie },
    })
    expect(overview.statusCode, overview.body).toBe(200)
    expect(overview.json()).toMatchObject({
      status: { situation: 'update_pending', waitingOn: 'handyhub', nextAction: 'none' },
    })
  })

  it('[HH-INC-03] after the release: a renewed site check and the packet version the release made, reviewed', async () => {
    const g = await gate('ann', visitId)
    expect(g.mode).toBe('resume')
    const missing = missingOf(g)
    expect(missing).not.toContain('CRITICAL_HOLD_OPEN')
    // The site check from before the pause no longer counts; the hold's release made a new packet version.
    expect(missing).toEqual(expect.arrayContaining(['SITE_CHECK_MISSING', 'HAZARDS_NOT_REVIEWED']))
    expect(missing.some((c) => c.startsWith('PACKET_'))).toBe(true)
    const refused = await resume('ann', visitId, g.packet?.version ?? 1)
    expect(refused.statusCode).toBe(409)
    expect(await jobState(jobId)).toBe('paused')
  })

  it('[HH-INC-03] each worker resumes through the gate; the job and its blocked work resume with the first', async () => {
    expect((await siteCheck('ann', visitId)).statusCode).toBe(201)
    const version = await review('ann', jobId)
    const g = await gate('ann', visitId)
    expect(missingOf(g)).toEqual([])
    expect(g.actions).toMatchObject({ start: false, resume: true })
    const ok = await resume('ann', visitId, version)
    expect(ok.statusCode, ok.body).toBe(201)
    expect(ok.json()).toMatchObject({ resumed: true, jobState: 'in_progress', jobStateBefore: 'paused', startId: null })
    expect(await jobState(jobId)).toBe('in_progress')
    expect((await packagesOf(jobId)).every((x) => x.state === 'in_progress')).toBe(true)
    // Once per pause.
    expect(codesOf(await resume('ann', visitId, version))).toContain('RESUME_NOT_NEEDED')
    expect(await checklistBlockers('ann', jobId)).not.toContain('RESUME_REQUIRED')

    // Ben started before the pause: he works again only after his own renewed checks and review.
    expect(await checklistBlockers('ben', jobId)).toContain('RESUME_REQUIRED')
    expect((await gate('ben', visitId)).mode).toBe('resume')
    expect((await siteCheck('ben', visitId)).statusCode).toBe(201)
    const benVersion = await review('ben', jobId)
    const benOk = await resume('ben', visitId, benVersion)
    expect(benOk.statusCode, benOk.body).toBe(201)
    expect(benOk.json()).toMatchObject({ jobStateBefore: 'in_progress', workPackagesResumed: [] })
    expect(await checklistBlockers('ben', jobId)).not.toContain('RESUME_REQUIRED')
    expect((await gate('ben', visitId)).mode).toBe('start')
    const rows = await t.db
      .selectFrom('work.work_resumptions')
      .select(['staff_user_id', 'job_state_before'])
      .where('job_id', '=', jobId)
      .orderBy('resumed_at')
      .execute()
    expect(rows).toEqual([
      { staff_user_id: ids.ann, job_state_before: 'paused' },
      { staff_user_id: ids.ben, job_state_before: 'in_progress' },
    ])
  })
})

// --- Return work ---------------------------------------------------------------------------------------------------------

describe('[HH-QA-07][HH-QA-08][T56][FACT-WARRANTY] a warranty claim opens linked return work; the original job is unchanged', () => {
  let p: Project
  let jobId: string
  let caseId: string
  let returnWorkId: string
  let returnVisitId: string
  let itemId: string
  let before: Awaited<ReturnType<typeof snapshot>>

  async function snapshot() {
    return {
      job: await t.db
        .selectFrom('work.jobs')
        .select('operational_state')
        .where('id', '=', jobId)
        .executeTakeFirstOrThrow(),
      review: await t.db
        .selectFrom('quality.reviews')
        .select(['state', 'passed_at', 'version'])
        .where('job_id', '=', jobId)
        .executeTakeFirstOrThrow(),
      packages: await packagesOf(jobId),
    }
  }

  beforeAll(async () => {
    p = await project()
    jobId = await approve(p)
    const visitId = await fixtureVisit(p, jobId, ['ann'])
    const v = await prepare('ann', visitId, jobId)
    expect((await start('ann', visitId, v)).statusCode).toBe(201)
    await reviewedComplete(jobId)
    await reviewedDaysAgo(jobId, 30)
    before = await snapshot()
    caseId = (await complaint(p, jobId)).caseId
  })

  it('[HH-QA-07][FACT-WARRANTY] a workmanship problem a month after the reviewed completion is a warranty claim', async () => {
    const v = await returnView('office', caseId)
    expect(v.returnWork).toBeNull()
    expect(v.warranty).toMatchObject({ within: true, days: 90, reportedOn: today() })
    expect(v.warranty?.lastDayOn).toBe(addLocalDays(v.warranty?.reviewedCompletionOn ?? today(), 90))
    expect(v.actions).toMatchObject({ classify: true, decide: false })
    // Open punch work exists only before the review passed.
    expect(codesOf(await classify('office', caseId, 0, 'open_punch'))).toEqual(['REVIEW_ALREADY_PASSED'])
    const res = await classify('office', caseId, 0, 'workmanship_callback', 'Synthetic: seam opened at the patch.')
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json()).toMatchObject({ classification: 'warranty_claim', version: 1 })
    returnWorkId = res.json<{ returnWorkId: string }>().returnWorkId
    const after = await returnView('office', caseId)
    expect(after.returnWork).toMatchObject({ classification: 'warranty_claim', decision: null })
    // Coverage is never applied: only the Owner decides it.
    expect(after.actions).toMatchObject({ decide: false })
    const officeDecides = await staffWrite(
      'office',
      `/api/v1/staff/return-work/${returnWorkId}/actions/decide`,
      { coverage: 'covered', price: 'no_charge', note: 'Synthetic' },
      1,
    )
    expect(officeDecides.statusCode).toBe(403)
  })

  it('[HH-QA-08] a linked return visit with its own items; its start moves nothing on the original job', async () => {
    // Planned through the return work: a tentative return_work visit of the same job.
    const planned = await staffWrite('office', `/api/v1/staff/return-work/${returnWorkId}/return-visits`, {
      localDate: addLocalDays(today(), 2),
      windowStart: '09:00',
      windowEnd: '11:00',
    })
    expect(planned.statusCode, planned.body).toBe(201)
    const plannedVisit = await t.db
      .selectFrom('work.visits')
      .select(['purpose', 'job_id', 'state'])
      .where('id', '=', planned.json<{ visitId: string }>().visitId)
      .executeTakeFirstOrThrow()
    expect(plannedVisit).toEqual({ purpose: 'return_work', job_id: jobId, state: 'tentative' })
    // A confirmed return visit today (a fixture, as every visit here), linked.
    returnVisitId = await fixtureVisit(p, jobId, ['ann'], 'return_work')
    const link = () =>
      staffWrite('office', `/api/v1/staff/return-work/${returnWorkId}/return-visits/link`, { visitId: returnVisitId })
    const linked = await link()
    expect(linked.statusCode, linked.body).toBe(201)
    expect(codesOf(await link())).toEqual(['VISIT_ALREADY_LINKED'])

    const item = await staffWrite('owner', `/api/v1/staff/return-work/${returnWorkId}/items`, itemBody())
    expect(item.statusCode, item.body).toBe(201)
    itemId = item.json<{ itemId: string }>().itemId
    expect((await staffWrite('office', `/api/v1/staff/return-work/${returnWorkId}/items`, itemBody())).statusCode).toBe(
      403,
    )

    // Before the return visit is started, the correction waits for it.
    type Own = { items: { id: string; version: number; actions: { correct: boolean } }[] }
    const own = (await staffGet('ann', `/api/v1/staff/jobs/${jobId}/return-work-items`)).json<Own>()
    expect(own.items).toEqual([expect.objectContaining({ id: itemId, actions: { correct: false } })])

    // The return visit passes the same Start Work gate; the original job stays operationally complete.
    const version = await prepare('ann', returnVisitId, jobId)
    const g = await gate('ann', returnVisitId)
    expect(g).toMatchObject({ mode: 'start', visitPurpose: 'return_work' })
    expect(missingOf(g)).toEqual([])
    const s = await start('ann', returnVisitId, version)
    expect(s.statusCode, s.body).toBe(201)
    expect(s.json()).toMatchObject({ jobState: 'operationally_complete', workPackagesStarted: [] })
    const after = await snapshot()
    expect(after).toEqual(before)

    const ready = (await staffGet('ann', `/api/v1/staff/jobs/${jobId}/return-work-items`)).json<Own>()
    expect(ready.items[0]?.actions.correct).toBe(true)
    const corrected = await staffWrite(
      'ann',
      `/api/v1/staff/return-work-items/${itemId}/actions/correct`,
      { note: 'Synthetic: re-taped, mudded and sanded the seam.' },
      ready.items[0]?.version,
    )
    expect(corrected.statusCode, corrected.body).toBe(200)
    expect(corrected.json()).toMatchObject({ state: 'corrected' })
    const stored = await t.db
      .selectFrom('quality.return_work_items')
      .select(['corrected_on_visit', 'corrected_by'])
      .where('id', '=', itemId)
      .executeTakeFirstOrThrow()
    expect(stored).toEqual({ corrected_on_visit: returnVisitId, corrected_by: ids.ann })
  })

  it('[HH-FIN-17][RULE-MONEY-CENTS] return-work costs are recorded apart, in cents', async () => {
    const cost = await staffWrite('office', `/api/v1/staff/return-work/${returnWorkId}/costs`, {
      kind: 'materials',
      amountCents: 2599,
      note: 'Synthetic: joint compound and tape',
    })
    expect(cost.statusCode, cost.body).toBe(201)
    const wrong = await staffWrite('office', `/api/v1/staff/return-work/${returnWorkId}/costs`, {
      kind: 'rental',
      amountCents: 1000,
      note: 'Synthetic: entered on the wrong case',
    })
    const wrongId = wrong.json<{ costId: string }>().costId
    const voidIt = () =>
      staffWrite('office', `/api/v1/staff/return-work-costs/${wrongId}/actions/void`, { reason: 'Synthetic' })
    expect((await voidIt()).statusCode).toBe(200)
    expect(codesOf(await voidIt())).toEqual(['COST_VOIDED'])
    const fraction = await staffWrite('office', `/api/v1/staff/return-work/${returnWorkId}/costs`, {
      kind: 'materials',
      amountCents: 12.5,
      note: 'Synthetic',
    })
    expect(fraction.statusCode).toBe(400)
    const v = await returnView('owner', caseId)
    expect(v.returnWork?.totals).toMatchObject({ costCents: 2599, laborCost: 'incomplete' })
    expect(v.returnWork?.costs.map((k) => [k.amountCents, k.voided !== null])).toEqual([
      [2599, false],
      [1000, true],
    ])
  })

  it('[HH-QA-07][RULE-HUMAN-REVIEW] the case closes only after the Owner decided and every item passed', async () => {
    // The Owner re-checks; the corrector never does.
    const v = await returnView('owner', caseId)
    const item = v.returnWork?.items.find((i) => i.id === itemId)
    expect(item).toMatchObject({ state: 'corrected', actions: { recheck: true } })
    const passed = await staffWrite(
      'owner',
      `/api/v1/staff/return-work-items/${itemId}/actions/recheck`,
      { passed: true, note: 'Synthetic: the seam is flat and finished.' },
      item?.version,
    )
    expect(passed.statusCode, passed.body).toBe(200)
    expect(passed.json()).toMatchObject({ state: 'rechecked' })

    const c = (await staffGet('owner', `/api/v1/staff/cases/${caseId}`)).json<{ version: number }>()
    const ack = await staffWrite('office', `/api/v1/staff/cases/${caseId}/actions/acknowledge`, {}, c.version)
    expect(ack.statusCode, ack.body).toBe(200)
    const resolved = await staffWrite(
      'owner',
      `/api/v1/staff/cases/${caseId}/actions/resolve`,
      { resolution: 'Synthetic: the seam was corrected on the return visit.', recheckRequired: false },
      ack.json<{ version: number }>().version,
    )
    expect(resolved.statusCode, resolved.body).toBe(200)
    const closeV = resolved.json<{ version: number }>().version
    expect(codesOf(await staffWrite('owner', `/api/v1/staff/cases/${caseId}/actions/close`, {}, closeV))).toEqual([
      'RETURN_WORK_UNDECIDED',
    ])
    const rw = (await returnView('owner', caseId)).returnWork
    const decided = await staffWrite(
      'owner',
      `/api/v1/staff/return-work/${returnWorkId}/actions/decide`,
      { coverage: 'covered', price: 'no_charge', note: 'Synthetic: the Owner decided after reading the case.' },
      rw?.version,
    )
    expect(decided.statusCode, decided.body).toBe(200)
    const closed = await staffWrite('owner', `/api/v1/staff/cases/${caseId}/actions/close`, {}, closeV)
    expect(closed.statusCode, closed.body).toBe(200)
    const final = await returnView('owner', caseId)
    expect(final.returnWork?.decision).toMatchObject({ coverage: 'covered', price: 'no_charge' })
    expect(final.returnWork?.history.map((h) => h.event)).toEqual([
      'classified',
      'visit_linked',
      'visit_linked',
      'item_added',
      'item_corrected',
      'cost_recorded',
      'cost_recorded',
      'cost_voided',
      'item_rechecked',
      'decided',
    ])
    expect(final.actions).toMatchObject({ classify: false, addItem: false, addCost: false })
    // The original job's completion record is still the one the Owner reviewed.
    expect(await snapshot()).toEqual(before)
  })
})

describe('[HH-QA-07][HH-QA-08][FACT-WARRANTY] after the 90 days a workmanship problem is a callback; a return job is linked', () => {
  let p: Project
  let jobId: string
  let caseId: string

  beforeAll(async () => {
    p = await project()
    jobId = await approve(p)
    const visitId = await fixtureVisit(p, jobId, ['ben'])
    const v = await prepare('ben', visitId, jobId)
    expect((await start('ben', visitId, v)).statusCode).toBe(201)
    await reviewedComplete(jobId)
    await reviewedDaysAgo(jobId, 91)
    caseId = (await complaint(p, jobId)).caseId
  })

  it('[FACT-WARRANTY] the 91st day after the reviewed completion is outside the warranty window', async () => {
    const v = await returnView('office', caseId)
    expect(v.warranty).toMatchObject({ within: false })
    const res = await classify('office', caseId, 0, 'warranty_claim')
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json()).toMatchObject({ classification: 'workmanship_callback' })
    // Reclassified (If-Match: the version shown); the history keeps both.
    const again = await classify('office', caseId, 1, 'new_scope', 'Synthetic: the customer wants a second wall.')
    expect(again.json()).toMatchObject({ classification: 'new_scope', version: 2 })
    expect((await classify('office', caseId, 1, 'unresolved')).statusCode).toBe(409)
  })

  it('[HH-QA-08] the return job is a job of another project of the same customer, never the original job', async () => {
    const rw = (await returnView('office', caseId)).returnWork
    if (!rw) throw new Error('classified above')
    const url = `/api/v1/staff/return-work/${rw.id}/return-job`
    expect(codesOf(await staffWrite('office', url, { jobId }, rw.version, 'PUT'))).toEqual(['NOT_A_RETURN_JOB'])
    // A project of another customer is refused too.
    const other = await project()
    const otherJob = await approve(other)
    expect(codesOf(await staffWrite('office', url, { jobId: otherJob }, rw.version, 'PUT'))).toEqual([
      'NOT_A_RETURN_JOB',
    ])
    // The same customer's new project (moved to this customer, see the header) is the linked return job.
    const own = await t.db
      .selectFrom('crm.projects')
      .select('customer_id')
      .where('id', '=', p.projectId)
      .executeTakeFirstOrThrow()
    await withTx(t.db, async (tx) => {
      await sql`SET LOCAL session_replication_role = replica`.execute(tx)
      await sql`UPDATE crm.projects SET customer_id = ${own.customer_id} WHERE id = ${other.projectId}`.execute(tx)
    })
    const linked = await staffWrite('office', url, { jobId: otherJob }, rw.version, 'PUT')
    expect(linked.statusCode, linked.body).toBe(200)
    const v = await returnView('office', caseId)
    expect(v.returnWork?.returnJob).toMatchObject({ jobId: otherJob })
    expect(v.originalJob).toMatchObject({ jobId, state: 'operationally_complete' })
  })

  it('[HH-QA-07] a workmanship problem before the review passed is a punch item of the review, not return work', async () => {
    const q = await project()
    const qJob = await approve(q)
    const c = await complaint(q, qJob)
    expect(codesOf(await classify('office', c.caseId, 0, 'workmanship_callback'))).toEqual(['REVIEW_NOT_PASSED'])
    // Only those who see the case detail read its return work: a worker reads nothing.
    expect((await staffGet('ann', `/api/v1/staff/cases/${c.caseId}/return-work`)).statusCode).toBe(403)
  })
})
