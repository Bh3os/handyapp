// Cases against PostgreSQL 16 (TSK-0093; HH-QA-06, HH-INC-01, HH-INC-02, HH-INC-04, T24, T48, T54, T56, T67,
// ENT-Case, OWN-DEC-124, OWN-DEC-143, RULE-HUMAN-REVIEW, RULE-SAFETY-GATES, RULE-SERVER-AUTHZ). Staff, customers,
// addresses, reports and notes are synthetic (RULE-SYNTHETIC-DATA).
// - Work visits are fixtures on tomorrow's local date (a confirmed reservation is the assignment, and its access
//   window lasts until the end of the visit's service day), so the suite never depends on the hour or the weekday.
// - The critical safety hold a hazard report writes (TSK-0077) is a fixture written straight to work.holds.
import { randomUUID } from 'node:crypto'
import { createDb, loadServiceSeed, loadSopSeed, syncServices, syncSops, withTx, type Db } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import { CUSTOMER_UPDATE_TEMPLATES, FORBIDDEN_CASE_WORDING, localDateOf, resolveWindow } from '@handyhub/domain'
import { ESTIMATE_TERMS } from '@handyhub/domain/legal'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { startCustomerSession } from '../../src/modules/identity/customer-sessions.js'
import { readCodeKey, type CodeKeySettings } from '../../src/modules/identity/index.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import { caseOpenedNoticeAutomation, projectHasActiveCase } from '../../src/modules/cases/index.js'
import { createAutomationRegistry } from '../../src/platform/automation.js'
import { createWorker } from '../../src/platform/jobs.js'
import { createProviders } from '../../src/providers/index.js'
import { readProviderSettings } from '../../src/providers/settings.js'
import { requestTarget } from '../../src/modules/privacy/targets.js'
import { recordPolicyVersion } from '../../src/platform/config/index.js'
import { FakeObjectStorage } from '../../src/providers/r2/index.js'
import { verifyCountyOf } from '../fixtures/county.js'
import { testConfig } from '../fixtures/env.js'
import { jpeg, png } from '../fixtures/images.js'
import { signInWithMfa } from '../fixtures/staff-mfa.js'
import { verifyPropertyZone } from '../fixtures/zones.js'

const ZONE = 'America/Kentucky/Louisville'
const KEY: CodeKeySettings = readCodeKey({
  HANDYHUB_ENV: 'ci',
  CODE_HASH_KEY: ['synthetic', 'cases', 'code', 'key', 'for', 'tests', 'only', '0093'].join('-'),
})
const pw = ['synthetic', 'cases', 'passphrase', '93'].join(' ')
const PEOPLE = ['owner', 'office', 'estimator', 'ann', 'ben'] as const
type Person = (typeof PEOPLE)[number]

let t: TestDatabase
let wide: Db
let app: FastifyInstance
const cookies = {} as Record<Person, string>
const csrf = {} as Record<Person, string>
const ids = {} as Record<Person, string>

/** Tomorrow's local date (calendar arithmetic on the date, never the clock's hour or weekday). */
function tomorrow(): string {
  const d = new Date(`${localDateOf(new Date(), ZONE)}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

async function signIn(p: Person) {
  const res = await signInWithMfa(app, {
    method: 'POST',
    url: '/api/v1/staff/auth/sign-in',
    headers: { 'x-forwarded-for': '198.51.100.193' },
    payload: { email: `${p}-cases@example.test`, password: pw },
  })
  expect(res.statusCode, res.body).toBe(200)
  const cookie = String(res.headers['set-cookie']).split(';')[0] as string
  const session = await app.inject({ method: 'GET', url: '/api/v1/staff/auth/session', headers: { cookie } })
  cookies[p] = cookie
  csrf[p] = session.json<{ csrfToken: string }>().csrfToken
}

let seq = 0
const key = () => `synthetic-cases-${String(++seq).padStart(6, '0')}-${randomUUID()}`
function send(who: Person, method: 'POST' | 'PUT', url: string, payload: unknown, version?: number) {
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
const post = (who: Person, url: string, payload: unknown, version?: number) => send(who, 'POST', url, payload, version)
const put = (who: Person, url: string, payload: unknown, version: number) => send(who, 'PUT', url, payload, version)
const get = (who: Person, url: string) => app.inject({ method: 'GET', url, headers: { cookie: cookies[who] } })
type Err = { error: { code: string; fieldErrors: { field: string; code: string }[] } }
const codesOf = (res: { json: <T>() => T }) => res.json<Err>().error.fieldErrors.map((f) => f.code)
const upload = (who: Person, url: string, bytes: Buffer, type = 'image/jpeg') =>
  app.inject({
    method: 'POST',
    url,
    payload: bytes,
    headers: { cookie: cookies[who], 'x-csrf-token': csrf[who], 'content-type': type },
  })

beforeAll(async () => {
  t = await createTestDatabase()
  wide = createDb(t.url, { max: 8, applicationName: 'cases-test' })
  await syncServices(t.db, loadServiceSeed())
  await syncSops(t.db, loadSopSeed())
  app = await buildApp({
    config: testConfig({ TRUST_PROXY_HOPS: '1' }),
    api: { db: wide, codeKey: KEY, storage: new FakeObjectStorage() },
  })
  const hash = await hashPassword(pw)
  await withTx(t.db, async (tx) => {
    for (const p of PEOPLE) {
      const user = await createStaffUser(tx, {
        email: `${p}-cases@example.test`,
        displayName: `Synthetic ${p}`,
        locale: p === 'ben' ? 'es' : 'en',
        role: p === 'ann' || p === 'ben' ? 'worker' : p,
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
      description: 'Synthetic cases project.',
      answers: [],
      property: {
        street: `${++seq} Synthetic Case Lane`,
        city: 'Testville',
        state: 'ky',
        zip: '40000',
        propertyType: 'house',
      },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'site_visit',
      contact: {
        fullName: 'Synthetic Case Customer',
        email: `cases-${seq}-${randomUUID().slice(0, 8)}@example.test`,
        phone: '(502) 555-0193',
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
  const moved = await post(
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
async function approve(p: Project): Promise<string> {
  const created = await post('estimator', `/api/v1/staff/projects/${p.projectId}/estimates`, {})
  expect(created.statusCode, created.body).toBe(201)
  const c = created.json<{ number: string; versionId: string }>()
  const v = (await get('estimator', `/api/v1/staff/estimate-versions/${c.versionId}`)).json<{
    rowVersion: number
    workPackages: { id: string }[]
  }>()
  const saved = await put(
    'estimator',
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
  const pub = await post(
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
      'x-forwarded-for': `2001:db8:93:${++ip}::1`,
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
      fullName: 'Synthetic Case Customer',
    },
  })
  expect(res.statusCode, res.body).toBe(201)
  return (
    await t.db.selectFrom('work.jobs').select('id').where('project_id', '=', p.projectId).executeTakeFirstOrThrow()
  ).id
}

let slot = 0
/** A confirmed work visit tomorrow with the team assigned (a confirmed reservation is the assignment). */
async function assign(p: Project, jobId: string, team: Person[]): Promise<string> {
  const date = tomorrow()
  const k = slot++
  const start = `${String(9 + Math.floor(k / 2)).padStart(2, '0')}:${k % 2 ? '30' : '00'}`
  const end = `${String(9 + Math.floor(k / 2)).padStart(2, '0')}:${k % 2 ? '45' : '15'}`
  const w = resolveWindow({ date, start, end, zone: ZONE })
  if (!w.ok) throw new Error('fixture window')
  const window = w.window
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
        expected_duration_minutes: 15,
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
          // The reserved range: the window plus the expected duration.
          ends_at: new Date(window.endsAt.getTime() + 15 * 60_000),
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

async function criticalHold(p: Project, jobId: string, raisedBy: Person) {
  return t.db
    .insertInto('work.holds')
    .values({
      kind: 'critical_safety',
      scope_type: 'job',
      scope_id: jobId,
      project_id: p.projectId,
      category: 'other',
      note: 'Synthetic: unsafe condition reported',
      source: 'hazard_report',
      source_ref: `synthetic-hazard-${++seq}`,
      raised_by: ids[raisedBy],
    })
    .returning(['id', 'state'])
    .executeTakeFirstOrThrow()
}

type CaseView = {
  id: string
  kind: string | null
  state: string
  restricted: boolean
  version: number
  detail: null | {
    reviewer: { id: string } | null
    referrals: unknown[] | null
    followUps: { id: string; version: number; state: string }[]
    customerUpdates: { id: string; version: number; state: string; body: string }[]
    notes: { kind: string; source: string | null; body: string }[]
    history: { event: string; from: string | null; to: string; note: string | null }[]
    hold: { id: string; state: string } | null
    reviewAreas: string[]
    actions: { events: string[]; manage: boolean }
  }
}
const caseOf = async (who: Person, id: string) => {
  const r = await get(who, `/api/v1/staff/cases/${id}`)
  expect(r.statusCode, r.body).toBe(200)
  return r.json<CaseView>()
}
const queue = (subjectId: string) =>
  t.db
    .selectFrom('ops.queue_items')
    .select(['type', 'reason', 'band', 'resolved_at', 'subject_status'])
    .where('subject_id', '=', subjectId)
    .orderBy('type')
    .execute()
const customerCases = async (p: Project) => {
  const r = await app.inject({
    method: 'GET',
    url: `/api/v1/customer/projects/${p.reference}/cases`,
    headers: { cookie: p.cookie },
  })
  expect(r.statusCode, r.body).toBe(200)
  return r
}

const COMPLAINT = (assignedTo: string, extra: Record<string, unknown> = {}) => ({
  category: 'work_quality',
  severity: 'moderate',
  source: 'walkthrough',
  assignedTo,
  dueOn: tomorrow(),
  description: 'Synthetic: the customer says the patch is visible under the light.',
  ...extra,
})
const INJURY = {
  type: 'injury',
  whatHappened: 'Synthetic: a worker cut a finger on a utility knife while scoring drywall.',
  peopleAffected: 'Synthetic worker',
  workAreas: 'Synthetic hallway',
  immediateActions: 'Synthetic: first aid applied, work paused in the hallway.',
  medicalDetail: 'Synthetic: small cut, bandaged.',
}

// --- Complaints ---------------------------------------------------------------------------------------------------

describe('[HH-QA-06][T56] complaint cases: no duplicates, truthful lifecycle, closing needs resolution and re-check', () => {
  it('records a complaint, offers "add to existing case", and closes only with resolution, re-check and no open item', async () => {
    const p = await project()
    const url = `/api/v1/staff/projects/${p.projectId}/complaints`
    // Who a case may be assigned to: active staff by name (the Owner, Office); never to a worker's session.
    const people = await get('office', '/api/v1/staff/cases/assignees')
    expect(people.statusCode).toBe(200)
    expect(people.json<{ staff: { id: string }[] }>().staff.map((s) => s.id)).toContain(ids.ann)
    expect((await get('ann', '/api/v1/staff/cases/assignees')).statusCode).toBe(403)
    // A worker never records a complaint case (ROLE-MATRIX: the Owner and Office).
    expect((await post('ann', url, COMPLAINT(ids.office))).statusCode).toBe(403)
    const first = await post('office', url, COMPLAINT(ids.office))
    expect(first.statusCode, first.body).toBe(201)
    const c = first.json<{ caseId: string; state: string; version: number; kind: string }>()
    expect(c).toMatchObject({ kind: 'complaint', state: 'open', version: 1 })
    // An open complaint of the same category: refused with the open case, so staff add to it instead.
    const dup = await post('office', url, COMPLAINT(ids.office, { source: 'message' }))
    expect(dup.statusCode).toBe(409)
    expect(codesOf(dup)).toEqual(['DUPLICATE_OPEN_CASE'])
    expect(dup.json<{ error: { current: { values: { caseId: string } } } }>().error.current.values.caseId).toBe(
      c.caseId,
    )
    const added = await post('office', `/api/v1/staff/cases/${c.caseId}/notes`, {
      body: 'Synthetic: the customer wrote again about the same patch.',
      source: 'message',
    })
    expect(added.statusCode, added.body).toBe(201)
    // Another category is its own case.
    const other = await post('office', url, COMPLAINT(ids.office, { category: 'schedule' }))
    expect(other.statusCode, other.body).toBe(201)

    // The open case is in the queue for the Owner and Office, assigned, with its status.
    expect(await queue(c.caseId)).toEqual([
      expect.objectContaining({ type: 'case_open', reason: 'complaint_recorded', resolved_at: null }),
    ])
    expect(await projectHasActiveCase(t.db, p.projectId)).toBe(true)

    let v = await caseOf('office', c.caseId)
    expect(v.detail?.notes.map((n) => [n.kind, n.source])).toEqual([
      ['description', null],
      ['addition', 'message'],
    ])
    expect(v.detail?.referrals).toBeNull()
    expect(v.detail?.actions.events).toEqual(['acknowledge', 'investigate'])
    const ack = await post('office', `/api/v1/staff/cases/${c.caseId}/actions/acknowledge`, {}, v.version)
    expect(ack.statusCode, ack.body).toBe(200)
    const inv = await post('office', `/api/v1/staff/cases/${c.caseId}/actions/investigate`, {}, v.version + 1)
    expect(inv.statusCode, inv.body).toBe(200)
    v = await caseOf('office', c.caseId)
    expect(v.state).toBe('investigating')
    // Office does not resolve or close (ENT-Case: the Owner resolves and closes); a wrong version is stale.
    const resolveBody = { resolution: 'Synthetic: the patch was sanded and repainted.', recheckRequired: true }
    expect(
      (await post('office', `/api/v1/staff/cases/${c.caseId}/actions/resolve`, resolveBody, v.version)).statusCode,
    ).toBe(403)
    expect(
      (await post('owner', `/api/v1/staff/cases/${c.caseId}/actions/resolve`, resolveBody, v.version - 1)).statusCode,
    ).toBe(409)
    // A follow-up item for the corrective work.
    const fu = await post('owner', `/api/v1/staff/cases/${c.caseId}/follow-ups`, {
      description: 'Synthetic: repaint the patch',
      assignedTo: ids.ann,
      dueOn: tomorrow(),
    })
    expect(fu.statusCode, fu.body).toBe(201)
    const resolved = await post('owner', `/api/v1/staff/cases/${c.caseId}/actions/resolve`, resolveBody, v.version)
    expect(resolved.statusCode, resolved.body).toBe(200)
    v = await caseOf('owner', c.caseId)
    // Closing waits for the re-check and the open follow-up item.
    const close1 = await post('owner', `/api/v1/staff/cases/${c.caseId}/actions/close`, {}, v.version)
    expect(close1.statusCode).toBe(409)
    expect(codesOf(close1).sort()).toEqual(['FOLLOW_UPS_OPEN', 'RECHECK_REQUIRED'])
    const rc = await post(
      'owner',
      `/api/v1/staff/cases/${c.caseId}/recheck`,
      { note: 'Synthetic: re-checked in daylight.' },
      v.version,
    )
    expect(rc.statusCode, rc.body).toBe(200)
    const f = fu.json<{ followUpId: string; version: number }>()
    const done = await post(
      'office',
      `/api/v1/staff/case-follow-ups/${f.followUpId}/actions/complete`,
      { note: 'Synthetic: repainted.' },
      f.version,
    )
    expect(done.statusCode, done.body).toBe(200)
    v = await caseOf('owner', c.caseId)
    expect((await post('office', `/api/v1/staff/cases/${c.caseId}/actions/close`, {}, v.version)).statusCode).toBe(403)
    const closed = await post('owner', `/api/v1/staff/cases/${c.caseId}/actions/close`, {}, v.version)
    expect(closed.statusCode, closed.body).toBe(200)
    expect(await queue(c.caseId)).toEqual([
      expect.objectContaining({ type: 'case_open', resolved_at: expect.any(Date) }),
    ])
    // Reopening is permitted with a reason; the history keeps every step.
    v = await caseOf('owner', c.caseId)
    expect((await post('owner', `/api/v1/staff/cases/${c.caseId}/actions/reopen`, {}, v.version)).statusCode).toBe(400)
    const reopened = await post(
      'owner',
      `/api/v1/staff/cases/${c.caseId}/actions/reopen`,
      { reason: 'Synthetic: visible again.' },
      v.version,
    )
    expect(reopened.statusCode, reopened.body).toBe(200)
    expect(reopened.json<{ state: string }>().state).toBe('investigating')
    v = await caseOf('owner', c.caseId)
    expect(v.detail?.history.map((h) => h.event)).toEqual([
      'record',
      'acknowledge',
      'investigate',
      'resolve',
      'recheck',
      'close',
      'reopen',
    ])
    // While the reopened complaint is open, a new one of its category is refused again.
    expect(codesOf(await post('office', url, COMPLAINT(ids.office)))).toEqual(['DUPLICATE_OPEN_CASE'])
  })

  it('[HH-PRIV-03][T67] an open case holds the project records from deletion and pauses review requests', async () => {
    const p = await project()
    const res = await post('office', `/api/v1/staff/projects/${p.projectId}/complaints`, COMPLAINT(ids.office))
    expect(res.statusCode, res.body).toBe(201)
    const target = await requestTarget(t.db, p.requestId)
    expect(target.checks).toContainEqual({ check: 'complaints', result: 'found', count: 1 })
    expect(target.checks).toContainEqual({ check: 'disputes', result: 'not_recorded' })
    expect(target.blockers).toContain('hold_found')
    // TSK-0092 reads this at send time: review invitations and satisfaction checks pause while it is true.
    expect(await projectHasActiveCase(t.db, p.projectId)).toBe(true)
  })
})

// --- Incidents ------------------------------------------------------------------------------------------------------

describe('[HH-INC-01][HH-INC-02][HH-INC-04][T54] incident details restricted; the Owner is notified; no fault wording', () => {
  let p: Project
  let jobId: string
  let caseId: string
  let photoId: string

  beforeAll(async () => {
    p = await project()
    jobId = await approve(p)
    await assign(p, jobId, ['ann'])
  })

  it('a worker assigned to the job reports an injury quickly from the job; an unassigned worker cannot', async () => {
    expect((await post('ben', `/api/v1/staff/jobs/${jobId}/incidents`, INJURY)).statusCode).toBe(403)
    const res = await post('ann', `/api/v1/staff/jobs/${jobId}/incidents`, INJURY)
    expect(res.statusCode, res.body).toBe(201)
    const c = res.json<{ caseId: string; kind: string; state: string }>()
    expect(c).toMatchObject({ kind: 'injury', state: 'reported' })
    caseId = c.caseId
    const ph = await upload('ann', `/api/v1/staff/cases/${caseId}/restricted/attachments`, jpeg())
    expect(ph.statusCode, ph.body).toBe(201)
    photoId = ph.json<{ attachmentId: string }>().attachmentId
    // The worker's own reports on the job; nobody else's.
    const mine = await get('ann', `/api/v1/staff/jobs/${jobId}/incident-reports`)
    expect(mine.json<{ reports: { id: string }[] }>().reports.map((r) => r.id)).toEqual([caseId])
    expect((await get('ben', `/api/v1/staff/jobs/${jobId}/incident-reports`)).statusCode).toBe(403)
    const row = await t.db
      .selectFrom('quality.cases')
      .select(['reviewer_id', 'hold_id', 'state'])
      .where('id', '=', caseId)
      .executeTakeFirstOrThrow()
    // The Owner is the responsible reviewer; nothing raised a hold (Stop Work / Report Hazard does that, TSK-0077).
    expect(row).toEqual({ reviewer_id: ids.owner, hold_id: null, state: 'reported' })
  })

  it('the Owner is notified at once: an Owner Decisions item, the open case and the staff notification event', async () => {
    expect(await queue(caseId)).toEqual([
      expect.objectContaining({ type: 'case_open', reason: 'injury_reported', resolved_at: null }),
      expect.objectContaining({
        type: 'incident_notification',
        reason: 'injury_reported',
        band: 'safety',
        resolved_at: null,
      }),
    ])
    const ev = await t.db
      .selectFrom('platform.outbox_events')
      .select(['type', 'payload'])
      .where('aggregate_id', '=', caseId)
      .execute()
    expect(ev.map((e) => e.type)).toEqual(['case.opened'])
    expect(JSON.stringify(ev[0]?.payload)).not.toMatch(/cut|finger|knife|bandage/i)
    // Office sees the queue item only as a case opened (masked reason); the Owner sees the decision.
    const office = await get('office', '/api/v1/staff/queue')
    expect(office.body).not.toMatch(/injury_reported/)
    const owner = await get('owner', '/api/v1/staff/queue/owner-decisions')
    expect(owner.body).toMatch(/injury_reported/)
  })

  it('[FACT-AUTOMATIC-MESSAGES] the staff notification goes to the Owner, never says what happened, NOT CONFIGURED', async () => {
    const providers = createProviders(readProviderSettings({ HANDYHUB_ENV: 'ci' }))
    const worker = createWorker({
      db: t.db,
      registry: createAutomationRegistry([
        caseOpenedNoticeAutomation({
          providers: { email: providers.email, sms: null },
          staffAppUrl: 'https://staff.example.test',
        }),
      ]),
    })
    await worker.runOnce()
    const deliveries = await t.db
      .selectFrom('platform.message_deliveries')
      .select(['message_key', 'audience', 'state', 'error_code', 'recipient_id', 'project_id'])
      .where('subject_key', '=', `case_opened:${caseId}`)
      .execute()
    // No wording is approved for this notice yet: recorded as not configured, never as sent; the queue item is the
    // reliable signal.
    expect(deliveries).toEqual([
      {
        message_key: 'staff_notice.case_opened',
        audience: 'staff',
        state: 'failed',
        error_code: 'template_not_configured',
        recipient_id: ids.owner,
        project_id: p.projectId,
      },
    ])
    expect(providers.fakes.email?.sent ?? []).toEqual([])
  })

  it('only the Owner (audited) and the reporting worker read the details; Office sees existence and status', async () => {
    const owner = await get('owner', `/api/v1/staff/cases/${caseId}/restricted`)
    expect(owner.statusCode, owner.body).toBe(200)
    expect(owner.json<{ report: { whatHappened: string } }>().report.whatHappened).toBe(INJURY.whatHappened)
    const audited = await t.db
      .selectFrom('platform.audit_events')
      .select(['action', 'actor_id'])
      .where('action', '=', 'incident.view_restricted')
      .where('target_id', '=', caseId)
      .execute()
    expect(audited).toEqual([{ action: 'incident.view_restricted', actor_id: ids.owner }])
    expect((await get('ann', `/api/v1/staff/cases/${caseId}/restricted`)).statusCode).toBe(200)
    expect((await get('ann', `/api/v1/staff/cases/${caseId}/restricted/attachments/${photoId}`)).statusCode).toBe(200)
    // Another worker, Office and the Estimator are refused the details, the photo and the case itself.
    for (const who of ['ben', 'office', 'estimator'] as const) {
      expect((await get(who, `/api/v1/staff/cases/${caseId}/restricted`)).statusCode, who).toBe(403)
      expect((await get(who, `/api/v1/staff/cases/${caseId}/restricted/attachments/${photoId}`)).statusCode, who).toBe(
        403,
      )
    }
    expect((await get('ben', `/api/v1/staff/cases/${caseId}`)).statusCode).toBe(403)
    expect((await get('ann', `/api/v1/staff/cases/${caseId}`)).statusCode).toBe(403)
    const office = await caseOf('office', caseId)
    expect(office).toMatchObject({ id: caseId, kind: null, restricted: true, state: 'reported', detail: null })
    expect(JSON.stringify(office)).not.toMatch(/cut|finger|knife|injury|Synthetic ann/i)
    // The photo is never served through the complaint attachment route either.
    expect((await get('owner', `/api/v1/staff/cases/${caseId}/attachments/${photoId}`)).statusCode).toBe(404)
    const list = await get('office', '/api/v1/staff/cases')
    const listed = list.json<{ cases: { id: string; kind: string | null }[] }>().cases.find((x) => x.id === caseId)
    expect(listed).toMatchObject({ kind: null })
    expect(list.body).not.toMatch(/finger/)
    // Office cannot work a restricted case (notes, handling, customer updates, events).
    expect((await post('office', `/api/v1/staff/cases/${caseId}/notes`, { body: 'Synthetic' })).statusCode).toBe(409)
    expect(
      (await post('office', `/api/v1/staff/cases/${caseId}/restricted/notes`, { body: 'Synthetic' })).statusCode,
    ).toBe(403)
    expect(
      (await post('office', `/api/v1/staff/cases/${caseId}/customer-updates`, { kind: 'acknowledgment' })).statusCode,
    ).toBe(403)
    expect(
      (await post('office', `/api/v1/staff/cases/${caseId}/actions/await-action`, {}, office.version)).statusCode,
    ).toBe(403)
    expect(
      (
        await post('office', `/api/v1/staff/cases/${caseId}/referrals`, {
          professional: 'insurer',
          note: 'x',
          referredOn: tomorrow(),
        })
      ).statusCode,
    ).toBe(403)
  })

  it('[T24] the customer sees only the reviewed status: nothing until staff release a neutral update', async () => {
    const none = await customerCases(p)
    expect(none.json()).toEqual({ reference: p.reference, cases: [] })
    const draft = await post('owner', `/api/v1/staff/cases/${caseId}/customer-updates`, { kind: 'acknowledgment' })
    expect(draft.statusCode, draft.body).toBe(201)
    expect((await customerCases(p)).json<{ cases: unknown[] }>().cases).toEqual([])
    // Fault, liability or compensation wording is refused before it can be drafted (HH-INC-04).
    for (const detail of [
      'We admit fault and will pay for the damage.',
      'Our insurance will cover this.',
      'You will be reimbursed.',
    ]) {
      const bad = await post('owner', `/api/v1/staff/cases/${caseId}/customer-updates`, { kind: 'progress', detail })
      expect(bad.statusCode, detail).toBe(400)
      expect(codesOf(bad)).toEqual(['FORBIDDEN_WORDING'])
    }
    const d = draft.json<{ updateId: string; version: number }>()
    const rel = await post('owner', `/api/v1/staff/case-customer-updates/${d.updateId}/actions/release`, {}, d.version)
    expect(rel.statusCode, rel.body).toBe(200)
    const seen = await customerCases(p)
    expect(seen.json()).toEqual({
      reference: p.reference,
      cases: [
        {
          caseNumber: expect.any(Number),
          updates: [
            {
              kind: 'acknowledgment',
              text: CUSTOMER_UPDATE_TEMPLATES.acknowledgment.text,
              releasedAt: expect.any(String),
            },
          ],
        },
      ],
    })
    expect(seen.body).not.toMatch(/injury|cut|finger|reported|Synthetic ann|restricted|reviewer|hold/i)
    // A released update is never changed or withdrawn.
    expect(
      (await post('owner', `/api/v1/staff/case-customer-updates/${d.updateId}/actions/withdraw`, {}, d.version + 1))
        .statusCode,
    ).toBe(409)
    // Every other customer project read leaves the incident out (T24).
    for (const tab of ['overview', 'messages', 'documents', 'photos', 'appointments', 'payments']) {
      const r = await app.inject({
        method: 'GET',
        url: `/api/v1/customer/projects/${p.reference}/${tab}`,
        headers: { cookie: p.cookie },
      })
      expect(r.statusCode, tab).toBe(200)
      expect(r.body, tab).not.toMatch(/finger|knife|bandage|injury/i)
    }
    // Another project's session finds nothing (the same NOT_FOUND).
    const q = await project()
    const cross = await app.inject({
      method: 'GET',
      url: `/api/v1/customer/projects/${p.reference}/cases`,
      headers: { cookie: q.cookie },
    })
    expect(cross.statusCode).toBe(404)
  })

  it('[T48] the safety pause is told only while a hold pauses the work; linking or closing never touches the hold', async () => {
    const noHold = await post('owner', `/api/v1/staff/cases/${caseId}/customer-updates`, { kind: 'safety_pause' })
    expect(noHold.statusCode).toBe(409)
    expect(codesOf(noHold)).toEqual(['NO_ACTIVE_HOLD'])
    const hold = await criticalHold(p, jobId, 'ann')
    let v = await caseOf('owner', caseId)
    expect(
      (await put('office', `/api/v1/staff/cases/${caseId}/hold-link`, { holdId: hold.id }, v.version)).statusCode,
    ).toBe(403)
    const linked = await put('owner', `/api/v1/staff/cases/${caseId}/hold-link`, { holdId: hold.id }, v.version)
    expect(linked.statusCode, linked.body).toBe(200)
    const pause = await post('owner', `/api/v1/staff/cases/${caseId}/customer-updates`, { kind: 'safety_pause' })
    expect(pause.statusCode, pause.body).toBe(201)
    const pu = pause.json<{ updateId: string; version: number }>()
    expect(
      (await post('owner', `/api/v1/staff/case-customer-updates/${pu.updateId}/actions/release`, {}, pu.version))
        .statusCode,
    ).toBe(200)
    const seen = (await customerCases(p)).json<{ cases: { updates: { text: string }[] }[] }>()
    expect(seen.cases[0]?.updates.map((u) => u.text)).toEqual([
      CUSTOMER_UPDATE_TEMPLATES.acknowledgment.text,
      'Work is paused for safety review.',
    ])
    // The Owner triages (becoming the reviewer), records the referral the Owner made, resolves and closes.
    v = await caseOf('owner', caseId)
    expect(v.detail?.reviewAreas).toEqual(['injury', 'insurance'])
    expect(v.detail?.referrals).toEqual([])
    const tri = await post('owner', `/api/v1/staff/cases/${caseId}/actions/triage`, { severity: 'moderate' }, v.version)
    expect(tri.statusCode, tri.body).toBe(200)
    expect((await queue(caseId)).find((q) => q.type === 'incident_notification')?.resolved_at).toEqual(expect.any(Date))
    const ref = await post('owner', `/api/v1/staff/cases/${caseId}/referrals`, {
      professional: 'insurer',
      note: 'Synthetic: the Owner reported it to the insurer.',
      referredOn: tomorrow(),
    })
    expect(ref.statusCode, ref.body).toBe(201)
    v = await caseOf('owner', caseId)
    expect(v.detail?.referrals).toHaveLength(1)
    const sub = await post(
      'owner',
      `/api/v1/staff/cases/${caseId}/actions/submit-resolution`,
      { resolution: 'Synthetic: first aid given; knife guard added to the kit.', recheckRequired: false },
      v.version,
    )
    expect(sub.statusCode, sub.body).toBe(200)
    const closed = await post(
      'owner',
      `/api/v1/staff/cases/${caseId}/actions/close`,
      {},
      sub.json<{ version: number }>().version,
    )
    expect(closed.statusCode, closed.body).toBe(200)
    // The hold is evaluated separately (HH-INC-03): closing the case left it open.
    const h = await t.db.selectFrom('work.holds').select('state').where('id', '=', hold.id).executeTakeFirstOrThrow()
    expect(h.state).toBe('open')
    // A closed case takes no new customer update.
    expect(
      (await post('owner', `/api/v1/staff/cases/${caseId}/customer-updates`, { kind: 'acknowledgment' })).statusCode,
    ).toBe(409)
    expect(await projectHasActiveCase(t.db, p.projectId)).toBe(false)
  })

  it('damage and disputes notify the Owner too; an ordinary incident opens the case without an Owner decision', async () => {
    const q = await project()
    const url = `/api/v1/staff/projects/${q.projectId}/incidents`
    const damage = await post('office', url, {
      type: 'property_damage',
      source: 'call',
      whatHappened: 'Synthetic: a scuff on a door frame.',
    })
    expect(damage.statusCode, damage.body).toBe(201)
    const dispute = await post('owner', url, {
      type: 'dispute',
      source: 'message',
      whatHappened: 'Synthetic: disagreement about the scope.',
    })
    const near = await post('estimator', url, {
      type: 'near_miss',
      source: 'call',
      whatHappened: 'Synthetic: a ladder slipped; nobody hurt.',
    })
    const [a, b, c] = [damage, dispute, near].map((r) => r.json<{ caseId: string; kind: string }>())
    expect([a?.kind, b?.kind, c?.kind]).toEqual(['damage', 'dispute', 'incident'])
    expect((await queue(a?.caseId ?? '')).map((x) => [x.type, x.reason])).toEqual([
      ['case_open', 'damage_reported'],
      ['incident_notification', 'damage_reported'],
    ])
    expect((await queue(c?.caseId ?? '')).map((x) => [x.type, x.reason])).toEqual([['case_open', 'case_opened']])
    // Office reported the damage but reads no more than its status afterwards (OWN-DEC-143).
    expect((await get('office', `/api/v1/staff/cases/${a?.caseId}/restricted`)).statusCode).toBe(403)
    const dv = await caseOf('owner', b?.caseId ?? '')
    expect(dv.detail?.reviewAreas).toEqual(['disputes', 'legal'])
    // The open cases hold the project's records: disputes and investigations found.
    const target = await requestTarget(t.db, q.requestId)
    expect(target.checks).toContainEqual({ check: 'disputes', result: 'found', count: 1 })
    expect(target.checks).toContainEqual({ check: 'investigations', result: 'found', count: 2 })
  })
})

// --- Database backstops ---------------------------------------------------------------------------------------------

describe('[HH-INC-02][RULE-HUMAN-REVIEW] the database keeps cases factual and complete', () => {
  it('refuses a wrong class, a changed report, a non-Owner referral, a changed release and a deletion', async () => {
    const p = await project()
    const res = await post('owner', `/api/v1/staff/projects/${p.projectId}/incidents`, {
      type: 'equipment_failure',
      source: 'call',
      whatHappened: 'Synthetic: a sander stopped working.',
    })
    const { caseId } = res.json<{ caseId: string }>()
    const refused = async (q: Promise<unknown>) => expect(q).rejects.toThrow()
    await refused(
      t.db
        .insertInto('quality.case_notes')
        .values({
          case_id: caseId,
          kind: 'note',
          body: 'x',
          visibility_class: 'internal_operational',
          written_by: ids.owner,
        })
        .execute(),
    )
    await refused(
      t.db
        .updateTable('quality.incident_reports')
        .set({ what_happened: 'changed' })
        .where('case_id', '=', caseId)
        .execute(),
    )
    await refused(
      t.db
        .insertInto('quality.case_referrals')
        .values({
          case_id: caseId,
          professional: 'attorney',
          note: 'x',
          referred_on: tomorrow(),
          recorded_by: ids.office,
        })
        .execute(),
    )
    await refused(t.db.deleteFrom('quality.cases').where('id', '=', caseId).execute())
    await refused(t.db.updateTable('quality.cases').set({ kind: 'complaint' }).where('id', '=', caseId).execute())
    await refused(
      t.db
        .insertInto('quality.cases')
        .values({
          project_id: p.projectId,
          kind: 'complaint',
          category: 'other',
          severity: 'low',
          source: 'call',
          state: 'closed',
          reported_by: ids.office,
          assigned_to: ids.office,
          due_on: tomorrow(),
        })
        .execute(),
    )
    const d = await post('owner', `/api/v1/staff/cases/${caseId}/customer-updates`, {
      kind: 'next_step',
      detail: 'Synthetic: we will call you on Monday.',
    })
    const u = d.json<{ updateId: string; version: number }>()
    await post('owner', `/api/v1/staff/case-customer-updates/${u.updateId}/actions/release`, {}, u.version)
    await refused(
      t.db
        .updateTable('quality.case_customer_updates')
        .set({ body: 'changed', version: 3 })
        .where('id', '=', u.updateId)
        .execute(),
    )
    // Unknown fields are refused: no fault, liability or compensation field exists to send.
    const extra = await post('owner', `/api/v1/staff/projects/${p.projectId}/incidents`, {
      type: 'other',
      whatHappened: 'Synthetic.',
      liability: 'accepted',
    })
    expect(extra.statusCode).toBe(400)
  })

  it('every case template is free of fault, liability and compensation wording (HH-INC-04 template scan)', () => {
    for (const [kind, tpl] of Object.entries(CUSTOMER_UPDATE_TEMPLATES))
      for (const re of FORBIDDEN_CASE_WORDING) expect(re.test(tpl.text), `${kind}: ${re}`).toBe(false)
  })

  it('a photo of the wrong type or a complaint photo on a restricted case is refused', async () => {
    const p = await project()
    const c = (await post('office', `/api/v1/staff/projects/${p.projectId}/complaints`, COMPLAINT(ids.office))).json<{
      caseId: string
    }>()
    const ok = await upload('office', `/api/v1/staff/cases/${c.caseId}/attachments`, png(3), 'image/png')
    expect(ok.statusCode, ok.body).toBe(201)
    const again = await upload('office', `/api/v1/staff/cases/${c.caseId}/attachments`, png(3), 'image/png')
    expect(again.statusCode).toBe(200)
    expect(
      (await upload('office', `/api/v1/staff/cases/${c.caseId}/attachments`, Buffer.from('not an image'))).statusCode,
    ).toBe(415)
    // A complaint has no restricted section.
    expect((await get('owner', `/api/v1/staff/cases/${c.caseId}/restricted`)).statusCode).toBe(404)
    const v = await caseOf('office', c.caseId)
    expect(v.restricted).toBe(false)
    const file = await get(
      'office',
      `/api/v1/staff/cases/${c.caseId}/attachments/${ok.json<{ attachmentId: string }>().attachmentId}`,
    )
    expect(file.statusCode).toBe(200)
    expect(file.headers['content-type']).toBe('image/png')
  })
})
