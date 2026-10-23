// Personal packet acknowledgments and readiness invalidation against PostgreSQL 16 (TSK-0072; HH-DATA-08, HH-WORK-10,
// HH-PKT-02, HH-CHG-03, HH-STAFF-02, HH-OFF-06, T27, T44, T51, ENT-Acknowledgment, ENT-JobPacket, ENT-Hold,
// ENT-StaffUser, ENT-Visit, OWN-DEC-121, OWN-DEC-123, RULE-SAFETY-GATES, RULE-SERVER-AUTHZ). Staff, customers, working
// hours, addresses and notes are synthetic (RULE-SYNTHETIC-DATA): the hours are test fixtures, never the business's
// hours, and the estimate terms version recorded below is a fixture of this throwaway database.
// - The approved scope change of a later change order (TSK-0082) and the hazard hold of a later hazard report
//   (TSK-0077) are written here as fixtures straight to their tables, as those tasks will write them.
import { randomUUID } from 'node:crypto'
import { createDb, loadServiceSeed, loadSopSeed, syncServices, syncSops, withTx, type Db } from '@handyhub/db'
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
import { packetAcknowledgment, refreshJobPacket } from '../../src/modules/packets/index.js'
import { recordPolicyVersion } from '../../src/platform/config/index.js'
import { FakeObjectStorage } from '../../src/providers/r2/index.js'
import { insertChangeOrderSnapshot } from '../fixtures/change-order-snapshot.js'
import { verifyCountyOf } from '../fixtures/county.js'
import { testConfig } from '../fixtures/env.js'
import { verifyPropertyZone } from '../fixtures/zones.js'
import { signInWithMfa } from '../fixtures/staff-mfa.js'

const ZONE = 'America/Kentucky/Louisville'
const KEY: CodeKeySettings = readCodeKey({
  HANDYHUB_ENV: 'ci',
  CODE_HASH_KEY: ['synthetic', 'packet', 'acks', 'code', 'key', 'for', 'tests', 'only', '0072'].join('-'),
})
const pw = ['synthetic', 'acknowledgments', 'passphrase', '72'].join(' ')
const SIGNED_IN = ['owner', 'office', 'estimator', 'ann', 'ben', 'cara'] as const
type Person = (typeof SIGNED_IN)[number]
const WORKERS: readonly Person[] = ['ann', 'ben', 'cara']

let t: TestDatabase
let wide: Db
let app: FastifyInstance
const cookies = {} as Record<Person, string>
const csrf = {} as Record<Person, string>
const ids = {} as Record<Person, string>

const today = () => localDateOf(new Date(), ZONE)
const day = (n: number) => addLocalDays(today(), n)
const WEEK = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, start: '08:00', end: '20:00' }))

async function signIn(p: Person): Promise<[string, string]> {
  const res = await signInWithMfa(app, {
    method: 'POST',
    url: '/api/v1/staff/auth/sign-in',
    headers: { 'x-forwarded-for': '198.51.100.172' },
    payload: { email: `${p}-acks@example.test`, password: pw },
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

beforeAll(async () => {
  t = await createTestDatabase()
  wide = createDb(t.url, { max: 8, applicationName: 'packet-acknowledgments-test' })
  await syncServices(t.db, loadServiceSeed())
  await syncSops(t.db, loadSopSeed())
  app = await buildApp({
    config: testConfig({ TRUST_PROXY_HOPS: '1' }),
    api: { db: wide, codeKey: KEY, storage: new FakeObjectStorage() },
  })
  const hash = await hashPassword(pw)
  await withTx(t.db, async (tx) => {
    for (const p of SIGNED_IN) {
      const role = p === 'ann' || p === 'ben' || p === 'cara' ? 'worker' : p
      const user = await createStaffUser(tx, {
        email: `${p}-acks@example.test`,
        displayName: `Synthetic ${p}`,
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
let ip = 40

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
      description: 'Synthetic acknowledgment project.',
      answers: [],
      property: {
        street: `${++seq} Synthetic Review Lane`,
        city: 'Testville',
        state: 'ky',
        zip: '40000',
        propertyType: 'house',
      },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'site_visit',
      contact: {
        fullName: 'Synthetic Review Customer',
        email: `acks-${seq}-${randomUUID().slice(0, 8)}@example.test`,
        phone: '(502) 555-0172',
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
      'x-forwarded-for': `2001:db8:72:${++ip}::1`,
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
      fullName: 'Synthetic Review Customer',
    },
  })
  expect(res.statusCode, res.body).toBe(201)
  return (
    await t.db.selectFrom('work.jobs').select('id').where('project_id', '=', p.projectId).executeTakeFirstOrThrow()
  ).id
}

type Visit = { id: string; version: number; number: number }
/** A work visit planned by Office and confirmed with one worker. */
async function bookedVisit(p: Project, date: string, worker: Person): Promise<Visit> {
  const planned = await staffWrite('office', 'POST', `/api/v1/staff/projects/${p.projectId}/visits`, {
    purpose: 'service',
    localDate: date,
    windowStart: '09:00',
    windowEnd: '10:00',
    expectedDurationMinutes: 60,
    travelBufferMinutes: 30,
    preparationBufferMinutes: 0,
    requiredWorkers: 1,
    equipment: [],
  })
  expect(planned.statusCode, planned.body).toBe(201)
  const all = planned.json<{ visits: Visit[] }>().visits
  const v = all[all.length - 1] as Visit
  const res = await staffWrite(
    'office',
    'POST',
    `/api/v1/staff/visits/${v.id}/confirm`,
    { workerIds: [ids[worker]] },
    v.version,
  )
  expect(res.statusCode, res.body).toBe(200)
  return currentVisit(v.id)
}
const currentVisit = (id: string): Promise<Visit> =>
  t.db.selectFrom('work.visits').select(['id', 'version', 'number']).where('id', '=', id).executeTakeFirstOrThrow()

async function reassign(visitId: string, to: Person) {
  const v = await currentVisit(visitId)
  const res = await staffWrite(
    'office',
    'POST',
    `/api/v1/staff/visits/${v.id}/reassign`,
    { workerIds: [ids[to]], reason: 'Synthetic: a crew change' },
    v.version,
  )
  expect(res.statusCode, res.body).toBe(200)
}

/** The accepted scope plus one change-order line, as TSK-0082's approval will write the next snapshot version. */
async function scopeChange(jobId: string) {
  const v1 = await t.db
    .selectFrom('work.job_scope_snapshots')
    .selectAll()
    .where('job_id', '=', jobId)
    .orderBy('version', 'desc')
    .executeTakeFirstOrThrow()
  await insertChangeOrderSnapshot(t.db, {
    job_id: jobId,
    version: v1.version + 1,
    lines: JSON.stringify([
      ...(v1.lines as unknown[]),
      {
        position: 2,
        kind: 'base',
        description: 'Synthetic: prime the patch',
        quantity: '1',
        unit: 'coat',
        unitPriceCents: 500,
        amountCents: 500,
      },
    ]),
    texts: JSON.stringify(v1.texts),
    exclusions: v1.exclusions,
    selected_options: v1.selected_options,
    subtotal_cents: '1750',
    discount_cents: '0',
    total_cents: '1750',
    terms_document_id: v1.terms_document_id,
    terms_sha256: v1.terms_sha256,
    content_sha256: 'a'.repeat(64),
  })
}

/** A hazard hold on the request, as the hazard report of TSK-0077 will write it. */
async function hazardHold(p: Project) {
  await t.db
    .insertInto('work.holds')
    .values({
      kind: 'review',
      scope_type: 'request',
      scope_id: p.requestId,
      project_id: p.projectId,
      request_id: p.requestId,
      category: 'structural',
      note: 'Synthetic: a sagging joist above the patch',
      source: 'qualification',
      source_ref: `synthetic-hazard-${++seq}`,
      raised_by: ids.owner,
    })
    .execute()
}

type Change = { section: string; code: string; critical: boolean }
type Mine = {
  state: string
  assigned: boolean
  acknowledgment: { version: number; acknowledgedAt: string } | null
  invalidation: { reason: string; version: number | null; invalidatedAt: string } | null
  changesSince: Change[]
}
type TeamRow = { staffUserId: string; name: string | null; state: string; version: number | null }
type PacketBody = {
  packet: { version: number; contentSha256: string; critical: boolean }
  holds: { state: string }[]
  dependencies: { blockingHolds: number }
  acknowledgments: { mine: Mine; team: TeamRow[] }
  actions: { revealAccessCodes: boolean; acknowledge: boolean }
}
const packet = async (who: Person, jobId: string) => {
  const res = await staffGet(who, `/api/v1/staff/jobs/${jobId}/packet`)
  expect(res.statusCode, res.body).toBe(200)
  return res.json<PacketBody>()
}
const ack = (who: Person, jobId: string, body: { version: number; contentSha256: string }) =>
  staffWrite(who, 'POST', `/api/v1/staff/jobs/${jobId}/packet/acknowledgments`, body)
async function acknowledgeCurrent(who: Person, jobId: string) {
  const p = await packet(who, jobId)
  const res = await ack(who, jobId, { version: p.packet.version, contentSha256: p.packet.contentSha256 })
  expect(res.statusCode, res.body).toBe(201)
  return p.packet.version
}
const invalidations = (jobId: string) =>
  t.db
    .selectFrom('work.job_packet_acknowledgment_invalidations as i')
    .innerJoin('work.job_packet_acknowledgments as a', 'a.id', 'i.acknowledgment_id')
    .select(['i.staff_user_id', 'i.reason', 'i.version', 'a.version as acknowledged_version'])
    .where('i.job_id', '=', jobId)
    .orderBy('i.invalidated_at')
    .orderBy('a.acknowledged_at')
    .execute()
const codesOf = (changes: Change[]) => changes.map((c) => [c.section, c.code, c.critical])

describe('[HH-DATA-08][HH-WORK-10] personal packet acknowledgments and readiness invalidation', () => {
  let p: Project
  let jobId: string
  let visit: Visit

  it('[HH-WORK-10][T44] only the assigned worker acknowledges, personally, the exact latest version; once while it stands', async () => {
    p = await project()
    jobId = await approve(p)
    visit = await bookedVisit(p, day(5), 'ann')
    const first = await packet('ann', jobId)
    expect(first.acknowledgments.mine).toEqual({
      state: 'required',
      assigned: true,
      acknowledgment: null,
      invalidation: null,
      changesSince: [],
    })
    expect(first.actions.acknowledge).toBe(true)
    expect(first.acknowledgments.team).toEqual([
      {
        staffUserId: ids.ann,
        name: 'Synthetic ann',
        state: 'required',
        version: null,
        acknowledgedAt: null,
        invalidation: null,
      },
    ])
    // The Office reads the team's state but is not assigned: nothing to acknowledge, and refused if it tries.
    const office = await packet('office', jobId)
    expect(office.acknowledgments.mine.state).toBe('not_assigned')
    expect(office.actions.acknowledge).toBe(false)
    const body = { version: first.packet.version, contentSha256: first.packet.contentSha256 }
    const refused = await ack('office', jobId, body)
    expect(refused.statusCode, refused.body).toBe(409)
    expect(refused.json<{ error: { fieldErrors: { code: string }[] } }>().error.fieldErrors[0]?.code).toBe(
      'NOT_ASSIGNED',
    )
    // A worker not on the job reaches nothing; nobody acknowledges for another person (no ID is taken from a client).
    expect((await ack('ben', jobId, body)).statusCode).toBe(403)
    expect(
      (
        await staffWrite('ann', 'POST', `/api/v1/staff/jobs/${jobId}/packet/acknowledgments`, {
          ...body,
          staffUserId: ids.ben,
        })
      ).statusCode,
    ).toBe(400)
    // The digest of content the worker did not read, or an older version, is refused: review the new version.
    const stale = await ack('ann', jobId, { ...body, contentSha256: 'b'.repeat(64) })
    expect(stale.statusCode).toBe(409)
    expect(stale.json<{ error: { fieldErrors: { code: string }[] } }>().error.fieldErrors[0]?.code).toBe(
      'PACKET_CHANGED',
    )

    const done = await ack('ann', jobId, body)
    expect(done.statusCode, done.body).toBe(201)
    expect(done.json()).toMatchObject({ version: first.packet.version, created: true, state: 'acknowledged' })
    const again = await ack('ann', jobId, body)
    expect(again.statusCode, again.body).toBe(200)
    expect(again.json()).toMatchObject({
      created: false,
      acknowledgmentId: done.json<{ acknowledgmentId: string }>().acknowledgmentId,
    })
    const rows = await t.db
      .selectFrom('work.job_packet_acknowledgments')
      .select(['staff_user_id', 'version', 'kind', 'scope_version', 'sop_version_ids', 'content_sha256'])
      .where('job_id', '=', jobId)
      .execute()
    expect(rows).toEqual([
      {
        staff_user_id: ids.ann,
        version: first.packet.version,
        kind: 'packet',
        scope_version: 1,
        sop_version_ids: [expect.any(String)],
        content_sha256: first.packet.contentSha256,
      },
    ])
    const after = await packet('ann', jobId)
    expect(after.acknowledgments.mine).toMatchObject({
      state: 'acknowledged',
      acknowledgment: { version: first.packet.version },
      invalidation: null,
    })
    expect(after.actions.acknowledge).toBe(false)
    expect((await packetAcknowledgment(t.db, jobId, ids.ann))?.satisfied).toBe(true)
    // Audited (both calls), and the acknowledged version is the "since you reviewed" base.
    const audited = await t.db
      .selectFrom('platform.audit_events')
      .select(['actor_id', 'target_id', 'target_version'])
      .where('action', '=', 'job_packet.acknowledge')
      .execute()
    expect(audited).toEqual([
      { actor_id: ids.ann, target_id: jobId, target_version: first.packet.version },
      { actor_id: ids.ann, target_id: jobId, target_version: first.packet.version },
    ])
    const views = await t.db
      .selectFrom('work.job_packet_views')
      .select('version')
      .where('job_id', '=', jobId)
      .where('staff_user_id', '=', ids.ann)
      .execute()
    expect(views).toEqual([{ version: first.packet.version }])
  })

  it('[HH-PKT-02][T44] a non-critical change (a moved window, the same worker) keeps the acknowledgment', async () => {
    const v = await currentVisit(visit.id)
    const moved = await staffWrite(
      'office',
      'POST',
      `/api/v1/staff/visits/${v.id}/window`,
      { localDate: day(6), windowStart: '09:00', windowEnd: '10:00', reason: 'Synthetic: the customer asked' },
      v.version,
    )
    expect(moved.statusCode, moved.body).toBe(200)
    const after = await packet('ann', jobId)
    expect(after.packet.critical).toBe(false)
    expect(after.acknowledgments.mine.state).toBe('acknowledged')
    expect(codesOf(after.acknowledgments.mine.changesSince)).toEqual([['schedule', 'window_changed', false]])
    // The reschedule ended and re-created Ann's reservation in one transaction: she never left the job.
    expect(await invalidations(jobId)).toEqual([])
  })

  it('[HH-WORK-10][HH-DATA-08][T44][T51] a reassigned job: the removed worker loses access and her acknowledgment; the new worker reviews personally', async () => {
    await reassign(visit.id, 'ben')
    // Ann's last reservation on the job ended: her acknowledgment ended in the same transaction.
    expect((await invalidations(jobId)).at(-1)).toMatchObject({ staff_user_id: ids.ann, reason: 'assignment_removed' })
    // She is refused on the next request, a new acknowledgment included (T51: a removed worker's write is refused).
    expect((await staffGet('ann', `/api/v1/staff/jobs/${jobId}/packet`)).statusCode).toBe(403)
    const latest = await refreshJobPacket(t.db, jobId)
    if (!latest) throw new Error('packet')
    expect((await ack('ann', jobId, { version: latest.version, contentSha256: latest.contentSha256 })).statusCode).toBe(
      403,
    )
    // Ben inherits nothing: required, until he acknowledges himself.
    const benSees = await packet('ben', jobId)
    expect(benSees.acknowledgments.mine).toMatchObject({ state: 'required', acknowledgment: null })
    expect(benSees.acknowledgments.team).toMatchObject([{ staffUserId: ids.ben, state: 'required' }])
    expect((await packetAcknowledgment(t.db, jobId, ids.ben))?.satisfied).toBe(false)
    const mine = (await staffGet('ben', '/api/v1/staff/my/job-packets')).json<{
      packets: { jobId: string; acknowledgment: string; acknowledgedVersion: number | null }[]
    }>()
    expect(mine.packets).toMatchObject([{ jobId, acknowledgment: 'required', acknowledgedVersion: null }])
    await acknowledgeCurrent('ben', jobId)
    expect((await packet('ben', jobId)).acknowledgments.mine.state).toBe('acknowledged')
    expect((await packetAcknowledgment(t.db, jobId, ids.ben))?.satisfied).toBe(true)

    // Back to Ann: her earlier acknowledgment does not come back, and Ben's ends with his assignment.
    await reassign(visit.id, 'ann')
    const annAgain = await packet('ann', jobId)
    expect(annAgain.acknowledgments.mine.state).toBe('invalidated')
    expect(annAgain.acknowledgments.team).toMatchObject([{ staffUserId: ids.ann, state: 'invalidated' }])
    expect((await invalidations(jobId)).at(-1)).toMatchObject({ staff_user_id: ids.ben, reason: 'assignment_removed' })
    expect((await packetAcknowledgment(t.db, jobId, ids.ann))?.satisfied).toBe(false)
    await acknowledgeCurrent('ann', jobId)
    expect((await packet('ann', jobId)).acknowledgments.mine.state).toBe('acknowledged')
  })

  it('[HH-DATA-08][HH-CHG-03][RULE-SAFETY-GATES][T44] a hazard and an approved change clear the acknowledgment once; it releases no hold', async () => {
    const acknowledged = (await packet('ann', jobId)).acknowledgments.mine.acknowledgment?.version as number
    await hazardHold(p)
    await scopeChange(jobId)
    const after = await packet('ann', jobId)
    expect(after.packet.critical).toBe(true)
    expect(after.acknowledgments.mine).toMatchObject({
      state: 'invalidated',
      acknowledgment: { version: acknowledged },
      invalidation: { reason: 'critical_change', version: after.packet.version },
    })
    expect(codesOf(after.acknowledgments.mine.changesSince)).toEqual(
      expect.arrayContaining([
        ['scope', 'scope_version', true],
        ['scope', 'line_added', true],
        ['holds', 'hold_added', true],
      ]),
    )
    expect(after.actions.acknowledge).toBe(true)
    // The old acknowledgment no longer satisfies the review; reading and refreshing again changes nothing (once).
    expect((await packetAcknowledgment(t.db, jobId, ids.ann))?.satisfied).toBe(false)
    await refreshJobPacket(t.db, jobId)
    await packet('office', jobId)
    expect((await invalidations(jobId)).filter((i) => i.reason === 'critical_change')).toEqual([
      {
        staff_user_id: ids.ann,
        reason: 'critical_change',
        version: after.packet.version,
        acknowledged_version: acknowledged,
      },
    ])
    // Acknowledging the new version stands again, and the hold stays open and blocking: nothing is released.
    await acknowledgeCurrent('ann', jobId)
    const again = await packet('ann', jobId)
    expect(again.acknowledgments.mine.state).toBe('acknowledged')
    expect(again.dependencies.blockingHolds).toBe(1)
    expect(again.holds.map((h) => h.state)).toEqual(['open'])
    const hold = await t.db
      .selectFrom('work.holds')
      .select('state')
      .where('project_id', '=', p.projectId)
      .executeTakeFirstOrThrow()
    expect(hold.state).toBe('open')
  })

  it('[HH-STAFF-02][T27] offboarding ends the person’s acknowledgments in the disabling transaction; the session is refused', async () => {
    const p2 = await project()
    const job2 = await approve(p2)
    await bookedVisit(p2, day(8), 'cara')
    await acknowledgeCurrent('cara', job2)
    const before = await packet('cara', job2)
    const off = await staffWrite('owner', 'POST', `/api/v1/staff/members/${ids.cara}/disable`, {
      reason: 'Synthetic: left the team',
    })
    expect(off.statusCode, off.body).toBe(200)
    expect(await invalidations(job2)).toEqual([
      {
        staff_user_id: ids.cara,
        reason: 'account_disabled',
        version: null,
        acknowledged_version: before.packet.version,
      },
    ])
    // The still-open session cannot read or acknowledge anything.
    expect((await staffGet('cara', `/api/v1/staff/jobs/${job2}/packet`)).statusCode).toBe(401)
    expect(
      (await ack('cara', job2, { version: before.packet.version, contentSha256: before.packet.contentSha256 }))
        .statusCode,
    ).toBe(401)
    // The upcoming assignment is flagged, not cancelled: the Office sees it and that no acknowledgment stands.
    const office = await packet('office', job2)
    expect(office.acknowledgments.team).toMatchObject([{ staffUserId: ids.cara, state: 'invalidated' }])
    expect((await packetAcknowledgment(t.db, job2, ids.cara))?.satisfied).toBe(false)
  })

  it('[HH-DATA-08][T51] the database refuses an acknowledgment for anyone not assigned, of an older version, or a change to one', async () => {
    const latest = await refreshJobPacket(t.db, jobId)
    if (!latest) throw new Error('packet')
    const insert = (staffUserId: string, version = latest.version, sha = latest.contentSha256, id = latest.id) =>
      t.db
        .insertInto('work.job_packet_acknowledgments')
        .values({
          packet_id: id,
          job_id: jobId,
          version,
          staff_user_id: staffUserId,
          kind: 'packet',
          content_sha256: sha,
          scope_version: null,
          sop_version_ids: '[]',
          request_id: 'synthetic-request',
        })
        .execute()
    await expect(insert(ids.office)).rejects.toThrow(/assigned to the job/)
    await expect(insert(ids.ben)).rejects.toThrow(/assigned to the job/)
    await expect(insert(ids.cara)).rejects.toThrow(/active account/)
    await expect(insert(ids.ann)).rejects.toThrow(/already acknowledged/)
    await expect(insert(ids.ann, latest.version, 'c'.repeat(64))).rejects.toThrow(/names the content/)
    const older = await t.db
      .selectFrom('work.job_packets')
      .select(['id', 'version', 'content_sha256'])
      .where('job_id', '=', jobId)
      .where('version', '=', 1)
      .executeTakeFirstOrThrow()
    await expect(insert(ids.ann, older.version, older.content_sha256, older.id)).rejects.toThrow(
      /latest packet version/,
    )
    await expect(sql`UPDATE work.job_packet_acknowledgments SET version = 1`.execute(t.db)).rejects.toThrow(
      /APPEND_ONLY/,
    )
    await expect(sql`DELETE FROM work.job_packet_acknowledgments`.execute(t.db)).rejects.toThrow(/APPEND_ONLY/)
    await expect(sql`DELETE FROM work.job_packet_acknowledgment_invalidations`.execute(t.db)).rejects.toThrow(
      /APPEND_ONLY/,
    )
    // An end is recorded once: a second one for the same acknowledgment is refused.
    const ended = await t.db
      .selectFrom('work.job_packet_acknowledgment_invalidations')
      .select(['acknowledgment_id', 'job_id', 'staff_user_id'])
      .executeTakeFirstOrThrow()
    await expect(
      t.db
        .insertInto('work.job_packet_acknowledgment_invalidations')
        .values({ ...ended, reason: 'account_disabled' })
        .execute(),
    ).rejects.toThrow(/duplicate key/)
  })
})
