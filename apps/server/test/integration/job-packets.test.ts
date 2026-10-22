// Versioned job packets, freshness, what changed since review and the safe export against PostgreSQL 16 (TSK-0069;
// HH-PKT-01, HH-PKT-02, HH-PKT-07, HH-DATA-08, HH-OFF-02, HH-SCH-07, T28, T43, T44, T49, ENT-JobPacket,
// ENT-AccessInstructionSecret, ENT-AuditEvent, OWN-DEC-40, OWN-DEC-121, RULE-SERVER-AUTHZ, RULE-SAFETY-GATES). Staff,
// customers, working hours, addresses, notes and the access code are synthetic (RULE-SYNTHETIC-DATA): the hours are
// test fixtures, never the business's hours, and the estimate terms version recorded below is a fixture of this
// throwaway database.
// - The approved scope change of a later change order (TSK-0082) and the hazard hold of a later hazard report
//   (TSK-0077) are written here as fixtures straight to their tables, as those tasks will write them.
// - "Today's visit" is a fixture too: a confirmed work visit early today, written the way the confirmation writes it
//   (a covering reservation, then the state), because the API only plans visits in the future and an access code is
//   revealed only on the visit date (T28).
import { randomUUID } from 'node:crypto'
import { createDb, loadServiceSeed, loadSopSeed, syncServices, syncSops, withTx, type Db } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import { addLocalDays, localDateOf, packetChanges, resolveWindow, type PacketContent } from '@handyhub/domain'
import { ESTIMATE_TERMS } from '@handyhub/domain/legal'
import { decide, type StaffActor } from '@handyhub/policy'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { startCustomerSession } from '../../src/modules/identity/customer-sessions.js'
import { readCodeKey, type CodeKeySettings } from '../../src/modules/identity/index.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import { customerPlan, reapplyDeletions } from '../../src/modules/privacy/index.js'
import {
  packetPdfModel,
  propertyVisitFacts,
  refreshJobPacket,
  renderPacketPdf,
} from '../../src/modules/packets/index.js'
import { packetView } from '../../src/modules/packets/view.js'
import { recordPolicyVersion } from '../../src/platform/config/index.js'
import { FakeObjectStorage } from '../../src/providers/r2/index.js'
import { pdfText } from '../fixtures/documents.js'
import { verifyCountyOf } from '../fixtures/county.js'
import { testConfig } from '../fixtures/env.js'
import { verifyPropertyZone } from '../fixtures/zones.js'
import { signInWithMfa } from '../fixtures/staff-mfa.js'

const ZONE = 'America/Kentucky/Louisville'
const KEY: CodeKeySettings = readCodeKey({
  HANDYHUB_ENV: 'ci',
  CODE_HASH_KEY: ['synthetic', 'packets', 'code', 'key', 'for', 'tests', 'only', '0069'].join('-'),
})
const SEAL = ['synthetic', 'packet', 'access', 'code', 'sealing', 'key', 'tests', 'only'].join('-')
const pw = ['synthetic', 'packets', 'passphrase', '69'].join(' ')
/** The access code of this test, built at runtime so no literal looks like a credential. */
const CODE = ['4', '7', '1', '9', '3'].join('')
const SIGNED_IN = ['owner', 'office', 'estimator', 'ann', 'ben'] as const
type Person = (typeof SIGNED_IN)[number]

let t: TestDatabase
let wide: Db
let app: FastifyInstance
const cookies = {} as Record<Person, string>
const csrf = {} as Record<Person, string>
const ids = {} as Record<Person, string>
const actors = {} as Record<Person, StaffActor>

const today = () => localDateOf(new Date(), ZONE)
const day = (n: number) => addLocalDays(today(), n)
const WEEK = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, start: '08:00', end: '20:00' }))

async function signIn(p: Person): Promise<[string, string]> {
  const res = await signInWithMfa(app, {
    method: 'POST',
    url: '/api/v1/staff/auth/sign-in',
    headers: { 'x-forwarded-for': '198.51.100.169' },
    payload: { email: `${p}-packets@example.test`, password: pw },
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
  wide = createDb(t.url, { max: 8, applicationName: 'job-packets-test' })
  await syncServices(t.db, loadServiceSeed())
  await syncSops(t.db, loadSopSeed())
  app = await buildApp({
    config: testConfig({ TRUST_PROXY_HOPS: '1', ACCESS_CODE_ENCRYPTION_KEY: SEAL }),
    api: { db: wide, codeKey: KEY, storage: new FakeObjectStorage() },
  })
  const hash = await hashPassword(pw)
  await withTx(t.db, async (tx) => {
    for (const p of SIGNED_IN) {
      const role = p === 'ann' || p === 'ben' ? 'worker' : p
      const user = await createStaffUser(tx, {
        email: `${p}-packets@example.test`,
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
  for (const p of SIGNED_IN)
    actors[p] = {
      kind: 'staff',
      userId: ids[p],
      roles: [p === 'ann' || p === 'ben' ? 'worker' : p],
      capabilities: [],
      status: 'active',
      freshAuth: false,
    }
  for (const c of ['ann', 'ben'] as const) {
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
      description: 'Synthetic packet project.',
      answers: [],
      property: {
        street: `${++seq} Synthetic Packet Lane`,
        city: 'Testville',
        state: 'ky',
        zip: '40000',
        propertyType: 'house',
      },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'site_visit',
      contact: {
        fullName: 'Synthetic Packet Customer',
        email: `packets-${seq}-${randomUUID().slice(0, 8)}@example.test`,
        phone: '(502) 555-0169',
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
      'x-forwarded-for': `2001:db8:69:${++ip}::1`,
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
      fullName: 'Synthetic Packet Customer',
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
async function currentVisit(id: string): Promise<Visit> {
  return t.db
    .selectFrom('work.visits')
    .select(['id', 'version', 'number'])
    .where('id', '=', id)
    .executeTakeFirstOrThrow()
}

/** Today's confirmed work visit for one worker, early today (see the header): reservation first, then the state. */
async function todaysVisit(p: Project, jobId: string, worker: Person): Promise<string> {
  const w = resolveWindow({ date: today(), start: '00:05', end: '00:35', zone: ZONE })
  if (!w.ok) throw new Error('fixture window')
  return withTx(t.db, async (tx) => {
    const v = await tx
      .insertInto('work.visits')
      .values({
        purpose: 'service',
        project_id: p.projectId,
        job_id: jobId,
        property_id: p.propertyId,
        local_date: w.window.date,
        window_start: w.window.start,
        window_end: w.window.end,
        time_zone: ZONE,
        start_offset_minutes: w.window.startOffsetMinutes,
        end_offset_minutes: w.window.endOffsetMinutes,
        starts_at: w.window.startsAt,
        ends_at: w.window.endsAt,
        window_set_by: ids.office,
        expected_duration_minutes: 30,
        preparation_buffer_minutes: 0,
        travel_buffer_minutes: 0,
        required_workers: 1,
        created_by: ids.office,
      })
      .returning(['id', 'version', 'ends_at'])
      .executeTakeFirstOrThrow()
    await tx
      .insertInto('work.reservations')
      .values({
        visit_id: v.id,
        resource: 'worker',
        staff_user_id: ids[worker],
        role: 'lead',
        kind: 'confirmed',
        starts_at: w.window.startsAt,
        ends_at: new Date(w.window.endsAt.getTime() + 30 * 60_000),
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

type Change = { section: string; code: string; critical: boolean; ref: string | null; from: unknown; to: unknown }
type PacketBody = {
  job: { id: string; projectReference: string }
  packet: { version: number; critical: boolean; changes: Change[] }
  freshness: {
    firstGeneratedAt: string
    lastUpdatedAt: string
    checkedAt: string
    latestVersion: number
    current: boolean
  }
  review: { lastViewed: { version: number } | null; fromVersion: number | null; changes: Change[]; critical: boolean }
  services: { serviceCode: string }[]
  visits: { visitId: string; number: number; team: { staffUserId: string; role: string }[] }[]
  site: {
    address: { street: string } | null
    directionsUrl: string | null
    details: { detail: string; value: string | null; source: string; confirmedAt: string }[]
    accessCodes: { id: string; kind: string; label: string | null }[]
  }
  occupants: unknown[]
  scope: { version: number; source: string; lines: Record<string, unknown>[]; texts: { exclusions: string[] } }
  evidence: { photos: unknown[] }
  sop: {
    packages: { serviceCode: string; state: string; sopId: string | null }[]
    preWork: unknown[]
    completion: unknown[]
  }
  holds: { category: string; note: string; state: string }[]
  dependencies: { deposit: { state: string } | null; blockingHolds: number }
  materials: { state: string; packages: unknown[] }
  careNotes: { state: string }
  communication: { escalationContact: { state: string }; stopWork: { items: unknown[] }[] }
  actions: { revealAccessCodes: boolean }
}
const packet = async (who: Person, jobId: string, status = 200) => {
  const res = await staffGet(who, `/api/v1/staff/jobs/${jobId}/packet`)
  expect(res.statusCode, res.body).toBe(status)
  return res.json<PacketBody>()
}
const viewed = (who: Person, jobId: string, version: number) =>
  staffWrite(who, 'POST', `/api/v1/staff/jobs/${jobId}/packet/views`, { version })
const reveal = (who: Person, propertyId: string, codeId: string) =>
  app.inject({
    method: 'POST',
    url: `/api/v1/staff/properties/${propertyId}/access-codes/${codeId}/reveal`,
    payload: {},
    headers: { cookie: cookies[who], 'x-csrf-token': csrf[who] },
  })
const codesOf = (changes: Change[]) => changes.map((c) => [c.section, c.code, c.critical])

/** The accepted scope plus one change-order line, as TSK-0082's approval will write the next snapshot version. */
async function scopeChange(jobId: string) {
  const v1 = await t.db
    .selectFrom('work.job_scope_snapshots')
    .selectAll()
    .where('job_id', '=', jobId)
    .where('version', '=', 1)
    .executeTakeFirstOrThrow()
  const lines = [
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
  ]
  await t.db
    .insertInto('work.job_scope_snapshots')
    .values({
      job_id: jobId,
      version: 2,
      source: 'change_order',
      lines: JSON.stringify(lines),
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
    .execute()
}

describe('[HH-PKT-01][HH-PKT-02][HH-PKT-07] the versioned job packet', () => {
  let p: Project
  let jobId: string
  let v1: Visit
  let codeId: string

  it('[HH-PKT-01][T43] every section from stored records: version, freshness, sources, the pinned SOP; no price, nothing invented', async () => {
    p = await project()
    jobId = await approve(p)
    v1 = await bookedVisit(p, day(5), 'ann')
    const first = await packet('owner', jobId)
    expect(first.packet).toMatchObject({ version: 1, critical: false, changes: [] })
    expect(first.freshness).toMatchObject({ latestVersion: 1, current: true })
    expect(first.freshness.firstGeneratedAt).toBe(first.freshness.lastUpdatedAt)
    expect(first.review).toEqual({ lastViewed: null, fromVersion: null, changes: [], critical: false })
    expect(first.services.map((s) => s.serviceCode)).toEqual(['DW-01'])
    expect(first.visits).toMatchObject([
      { visitId: v1.id, number: v1.number, team: [{ staffUserId: ids.ann, role: 'lead' }] },
    ])
    expect(first.site.address?.street).toMatch(/Synthetic Packet Lane$/)
    expect(first.site.directionsUrl).toContain(encodeURIComponent('Synthetic Packet Lane'))
    expect(first.scope).toMatchObject({
      version: 1,
      source: 'approval',
      texts: { exclusions: ['Synthetic: moving furniture'] },
    })
    // The scope keeps description, quantity and unit: never a price.
    expect(first.scope.lines).toEqual([
      {
        position: 1,
        kind: 'base',
        serviceCode: 'DW-01',
        description: 'Patch the synthetic wall',
        quantity: '1',
        unit: 'patch',
      },
    ])
    expect(JSON.stringify(first)).not.toMatch(/cents|1250|12\.50/i)
    expect(first.sop.packages).toMatchObject([{ serviceCode: 'DW-01', state: 'pinned', sopId: 'SOP-DW-01' }])
    expect(first.communication.stopWork[0]?.items.length).toBeGreaterThan(0)
    expect(first.holds).toEqual([])
    expect(first.dependencies).toMatchObject({ deposit: { state: 'not_required' }, blockingHolds: 0 })
    // What no record holds is said, never filled in.
    // TSK-0071: no loadout list is loaded in this database, so each package's list says NOT CONFIGURED.
    expect(first.materials).toEqual({
      state: 'not_recorded',
      packages: [expect.objectContaining({ serviceCode: 'DW-01', state: 'not_configured', items: [] })],
    })
    expect(first.careNotes).toEqual({ state: 'none_approved' })
    expect(first.communication.escalationContact).toEqual({ state: 'not_configured' })
    expect(first.site.details).toEqual([])
    // Reading again without a change keeps the version.
    expect((await packet('office', jobId)).packet.version).toBe(1)
    const rows = await t.db.selectFrom('work.job_packets').select('version').where('job_id', '=', jobId).execute()
    expect(rows).toEqual([{ version: 1 }])
  })

  it('[HH-PKT-02][HH-PKT-07][T28] a site-access change is a critical new version; the packet names the code, never holds it', async () => {
    const prop = await t.db
      .selectFrom('crm.properties')
      .select('version')
      .where('id', '=', p.propertyId)
      .executeTakeFirstOrThrow()
    const detail = await staffWrite(
      'office',
      'PUT',
      `/api/v1/staff/properties/${p.propertyId}/details/parking_loading`,
      {
        value: 'Synthetic: park on the left of the drive',
        source: 'customer_call',
        reason: 'Synthetic: the customer called',
      },
      prop.version,
    )
    expect(detail.statusCode, detail.body).toBe(200)
    const added = await app.inject({
      method: 'POST',
      url: `/api/v1/staff/properties/${p.propertyId}/access-codes`,
      payload: {
        kind: 'lockbox',
        label: 'Side gate box',
        value: CODE,
        source: 'customer_call',
        reason: 'Synthetic: given by phone',
      },
      headers: { cookie: cookies.office, 'x-csrf-token': csrf.office },
    })
    expect(added.statusCode, added.body).toBe(201)
    codeId = added.json<{ id: string }>().id
    const second = await packet('owner', jobId)
    expect(second.packet.version).toBe(2)
    expect(second.packet.critical).toBe(true)
    expect(codesOf(second.packet.changes)).toEqual([
      ['site_access', 'detail_recorded', true],
      ['site_access', 'access_code_added', true],
    ])
    expect(second.site.details).toMatchObject([
      { detail: 'parking_loading', value: 'Synthetic: park on the left of the drive', source: 'customer_call' },
    ])
    expect(second.site.accessCodes).toEqual([
      { id: codeId, kind: 'lockbox', label: 'Side gate box', confirmedAt: expect.any(String) },
    ])
    // The code is nowhere: not in the response, not in any stored packet version.
    expect(JSON.stringify(second)).not.toContain(CODE)
    const stored = await t.db.selectFrom('work.job_packets').select('content').where('job_id', '=', jobId).execute()
    expect(JSON.stringify(stored)).not.toContain(CODE)
    expect(JSON.stringify(stored)).not.toMatch(/sealed/i)
  })

  it('[HH-PKT-02][T44] a scope change creates a new version with "What changed since you reviewed this?" for the worker', async () => {
    const seen = await packet('ann', jobId)
    expect(seen.packet.version).toBe(2)
    expect(seen.review.lastViewed).toBeNull()
    const rec = await viewed('ann', jobId, 2)
    expect(rec.statusCode, rec.body).toBe(200)
    expect((await packet('ann', jobId)).review).toMatchObject({ lastViewed: { version: 2 }, changes: [] })

    await scopeChange(jobId)
    const after = await packet('ann', jobId)
    expect(after.packet.version).toBe(3)
    expect(after.freshness).toMatchObject({ latestVersion: 3, current: true })
    expect(after.scope).toMatchObject({ version: 2, source: 'change_order' })
    expect(after.review).toMatchObject({ lastViewed: { version: 2 }, fromVersion: 2, critical: true })
    expect(codesOf(after.review.changes)).toEqual([
      ['scope', 'scope_version', true],
      ['scope', 'line_added', true],
    ])
    expect(after.review.changes[1]?.ref).toBe('Synthetic: prime the patch')
    expect(JSON.stringify(after)).not.toMatch(/cents|1750/i)

    const versions = await staffGet('ann', `/api/v1/staff/jobs/${jobId}/packet/versions`)
    expect(versions.statusCode, versions.body).toBe(200)
    expect(
      versions
        .json<{ versions: { version: number; critical: boolean }[] }>()
        .versions.map((v) => [v.version, v.critical]),
    ).toEqual([
      [3, true],
      [2, true],
      [1, false],
    ])
    // The view is audited; recording an unknown version is refused.
    const audit = await t.db
      .selectFrom('platform.audit_events')
      .select(['actor_id', 'target_id', 'target_version'])
      .where('action', '=', 'job_packet.view')
      .execute()
    expect(audit).toEqual([{ actor_id: ids.ann, target_id: jobId, target_version: 2 }])
    expect((await viewed('ann', jobId, 9)).statusCode).toBe(400)
  })

  it('[HH-PKT-01][T28][OWN-DEC-40] only assigned workers reach the packet; an access code is revealed on the visit date only', async () => {
    // Ben is not assigned; Ann is, but her visit is in five days.
    expect((await staffGet('ben', `/api/v1/staff/jobs/${jobId}/packet`)).statusCode).toBe(403)
    expect((await reveal('ben', p.propertyId, codeId)).statusCode).toBe(403)
    expect((await reveal('ann', p.propertyId, codeId)).statusCode).toBe(403)
    expect((await packet('ann', jobId)).actions.revealAccessCodes).toBe(false)
    expect((await packet('owner', jobId)).actions.revealAccessCodes).toBe(true)
    // The policy's facts: assigned, inside the window, refused on any other date than the visit's.
    const facts = await propertyVisitFacts(t.db, p.propertyId, actors.ann)
    expect(facts.visitDate).toBe(day(5))
    const ctx = { now: new Date(), online: true }
    expect(decide(actors.ann, 'access_code.reveal', facts, { ...ctx, today: day(5) }).effect).toBe('allow')
    expect(decide(actors.ann, 'access_code.reveal', facts, { ...ctx, today: day(4) })).toMatchObject({
      reason: 'NOT_VISIT_DATE',
    })
    expect(decide(actors.ann, 'access_code.reveal', facts, { ...ctx, today: day(5), online: false })).toMatchObject({
      reason: 'OFFLINE',
    })
    const benFacts = await propertyVisitFacts(t.db, p.propertyId, actors.ben)
    expect(decide(actors.ben, 'access_code.reveal', benFacts, { ...ctx, today: day(5) })).toMatchObject({
      reason: 'NOT_ASSIGNED',
    })
    // A customer session reaches no staff packet.
    expect(
      (await app.inject({ method: 'GET', url: `/api/v1/staff/jobs/${jobId}/packet`, headers: { cookie: p.cookie } }))
        .statusCode,
    ).toBe(401)
  })

  it('[HH-PKT-02][HH-SCH-07][T44] a reschedule refreshes the packet; a reassignment is critical, the removed worker loses it, nobody inherits a review', async () => {
    const moved = await staffWrite(
      'office',
      'POST',
      `/api/v1/staff/visits/${v1.id}/window`,
      { localDate: day(6), windowStart: '09:00', windowEnd: '10:00', reason: 'Synthetic: the customer asked' },
      v1.version,
    )
    expect(moved.statusCode, moved.body).toBe(200)
    const rescheduled = await packet('ann', jobId)
    expect(rescheduled.packet.version).toBe(4)
    expect(codesOf(rescheduled.packet.changes)).toEqual([['schedule', 'window_changed', false]])
    expect(rescheduled.packet.critical).toBe(false)
    expect((await viewed('ann', jobId, 4)).statusCode).toBe(200)

    v1 = await currentVisit(v1.id)
    const swapped = await staffWrite(
      'office',
      'POST',
      `/api/v1/staff/visits/${v1.id}/reassign`,
      { workerIds: [ids.ben], reason: 'Synthetic: Ann is needed elsewhere' },
      v1.version,
    )
    expect(swapped.statusCode, swapped.body).toBe(200)
    // Ann's reservation ended: she is refused on the very next request, and her list is empty.
    expect((await staffGet('ann', `/api/v1/staff/jobs/${jobId}/packet`)).statusCode).toBe(403)
    expect((await staffGet('ann', `/api/v1/staff/jobs/${jobId}/packet/pdf`)).statusCode).toBe(403)
    expect(
      (await staffWrite('ann', 'POST', `/api/v1/staff/jobs/${jobId}/packet/views`, { version: 4 })).statusCode,
    ).toBe(403)
    expect((await staffGet('ann', '/api/v1/staff/my/job-packets')).json()).toEqual({ packets: [] })
    // Ben gets the new version, marked critical, and has reviewed nothing: Ann's views are not his.
    const benSees = await packet('ben', jobId)
    expect(benSees.packet).toMatchObject({ version: 5, critical: true })
    expect(codesOf(benSees.packet.changes)).toEqual([
      ['assignment', 'worker_added', true],
      ['assignment', 'worker_removed', true],
    ])
    expect(benSees.review).toEqual({ lastViewed: null, fromVersion: null, changes: [], critical: false })
    const mine = (await staffGet('ben', '/api/v1/staff/my/job-packets')).json<{
      packets: { jobId: string; version: number; lastViewedVersion: number | null; changedSinceViewed: boolean }[]
    }>()
    expect(mine.packets).toMatchObject([{ jobId, version: 5, lastViewedVersion: null, changedSinceViewed: false }])
  })

  it('[HH-PKT-07][T28][T49] on the visit date the code is revealed online and audited; the PDF and print never hold it and every export is audited', async () => {
    await todaysVisit(p, jobId, 'ann')
    const annSees = await packet('ann', jobId)
    expect(annSees.packet.version).toBe(6)
    expect(annSees.actions.revealAccessCodes).toBe(true)
    // Ann's last view was version 4: the changes since then, not since the version before.
    expect(annSees.review.fromVersion).toBe(4)
    expect(codesOf(annSees.review.changes)).toEqual(
      expect.arrayContaining([
        ['schedule', 'visit_added', false],
        ['assignment', 'worker_added', true],
        ['assignment', 'worker_removed', true],
      ]),
    )
    const shown = await reveal('ann', p.propertyId, codeId)
    expect(shown.statusCode, shown.body).toBe(200)
    expect(shown.json<{ value: string }>().value).toBe(CODE)
    expect(shown.headers['cache-control']).toBe('no-store')
    const reveals = await t.db
      .selectFrom('crm.access_code_reveals')
      .select('staff_id')
      .where('secret_id', '=', codeId)
      .execute()
    expect(reveals).toEqual([{ staff_id: ids.ann }])

    // The PDF: recorded and audited with who, when and which version; never the code.
    const pdf = await staffGet('ann', `/api/v1/staff/jobs/${jobId}/packet/pdf`)
    expect(pdf.statusCode, pdf.body).toBe(200)
    expect(pdf.headers['content-type']).toBe('application/pdf')
    expect(pdf.headers['cache-control']).toBe('no-store')
    expect(pdf.rawPayload.subarray(0, 5).toString()).toBe('%PDF-')
    expect(pdf.rawPayload.includes(Buffer.from(CODE))).toBe(false)
    // An older version prints as stale.
    const old = await staffWrite('ann', 'POST', `/api/v1/staff/jobs/${jobId}/packet/exports`, {
      version: 3,
      format: 'print',
    })
    expect(old.statusCode, old.body).toBe(201)
    expect(old.json()).toMatchObject({ version: 3, latestVersion: 6, current: false, format: 'print' })
    // The PDF of an older version, asked by its number; an unknown version is not found.
    const oldPdf = await staffGet('ann', `/api/v1/staff/jobs/${jobId}/packet/pdf?version=2`)
    expect(oldPdf.statusCode, oldPdf.body).toBe(200)
    expect(oldPdf.headers['content-disposition']).toContain('-v2.pdf')
    expect((await staffGet('ann', `/api/v1/staff/jobs/${jobId}/packet/pdf?version=99`)).statusCode).toBe(404)
    const exports = await t.db
      .selectFrom('work.job_packet_exports')
      .select(['version', 'latest_version', 'format', 'staff_user_id'])
      .where('job_id', '=', jobId)
      .orderBy('exported_at')
      .execute()
    expect(exports).toEqual([
      { version: 6, latest_version: 6, format: 'pdf', staff_user_id: ids.ann },
      { version: 3, latest_version: 6, format: 'print', staff_user_id: ids.ann },
      { version: 2, latest_version: 6, format: 'pdf', staff_user_id: ids.ann },
    ])
    const audited = await t.db
      .selectFrom('platform.audit_events')
      .select(['actor_id', 'target_id', 'target_version', 'summary'])
      .where('action', '=', 'job_packet.export')
      .orderBy('seq')
      .execute()
    expect(audited.map((a) => [a.actor_id, a.target_id, a.target_version])).toEqual([
      [ids.ann, jobId, 6],
      [ids.ann, jobId, 3],
      [ids.ann, jobId, 2],
    ])
    // The code is in no audit entry, packet version, export or log-like record.
    const everything = await t.db.selectFrom('platform.audit_events').select(['summary', 'reason']).execute()
    expect(JSON.stringify(everything)).not.toContain(CODE)

    // The PDF's content, laid out without compression: the freshness warning and the version, no code or label.
    const row = await refreshJobPacket(t.db, jobId)
    if (!row) throw new Error('packet')
    const view = await packetView(t.db, {
      row,
      latestVersion: row.version,
      firstGeneratedAt: new Date(),
      viewed: null,
      storage: null,
      now: new Date(),
    })
    const model = packetPdfModel({ view, locale: 'en', printedAt: new Date(), timeZone: ZONE })
    expect(model.mark).toMatch(/^Printed .+; check the app for changes\. Packet version 6\.$/)
    const text = JSON.stringify(model)
    expect(text).not.toContain(CODE)
    expect(text).not.toContain('Side gate box')
    expect(text).toContain('never printed; revealed in the app, online, on the visit date')
    const raw = pdfText(
      await renderPacketPdf({ view, locale: 'es', printedAt: new Date(), timeZone: ZONE }, { compress: false }),
    )
    expect(raw.some((l) => l.startsWith('Impreso ') && l.includes('revise la aplicación'))).toBe(true)
    expect(raw.some((l) => l.includes('Paquete de trabajo'))).toBe(true)
    expect(raw.some((l) => l.includes(CODE) || l.includes('Side gate box'))).toBe(false)
  })

  it('[HH-PKT-02][RULE-SAFETY-GATES] a hazard hold is a critical change; the packet shows it and releases nothing', async () => {
    const before = await packet('ann', jobId)
    expect((await viewed('ann', jobId, before.packet.version)).statusCode).toBe(200)
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
        source_ref: 'synthetic-hazard',
        raised_by: ids.owner,
      })
      .execute()
    const after = await packet('ann', jobId)
    expect(after.packet.version).toBe(before.packet.version + 1)
    expect(after.review.critical).toBe(true)
    expect(codesOf(after.review.changes)).toEqual([['holds', 'hold_added', true]])
    expect(after.holds).toMatchObject([
      { category: 'structural', state: 'open', note: 'Synthetic: a sagging joist above the patch' },
    ])
    expect(after.dependencies.blockingHolds).toBe(1)
    const hold = await t.db
      .selectFrom('work.holds')
      .select('state')
      .where('project_id', '=', p.projectId)
      .executeTakeFirstOrThrow()
    expect(hold.state).toBe('open')
  })

  it('[HH-PKT-02] versions, views and exports are append-only; a version follows the latest and changes the content', async () => {
    await expect(
      sql`UPDATE work.job_packets SET critical = NOT critical WHERE job_id = ${jobId}`.execute(t.db),
    ).rejects.toThrow()
    await expect(sql`DELETE FROM work.job_packets WHERE job_id = ${jobId}`.execute(t.db)).rejects.toThrow()
    await expect(sql`DELETE FROM work.job_packet_views WHERE job_id = ${jobId}`.execute(t.db)).rejects.toThrow()
    await expect(
      sql`UPDATE work.job_packet_exports SET format = 'pdf' WHERE job_id = ${jobId}`.execute(t.db),
    ).rejects.toThrow()
    const latest = await t.db
      .selectFrom('work.job_packets')
      .select(['version', 'content', 'content_sha256', 'project_id'])
      .where('job_id', '=', jobId)
      .orderBy('version', 'desc')
      .executeTakeFirstOrThrow()
    const insert = (version: number, sha: string, content: unknown = latest.content) =>
      t.db
        .insertInto('work.job_packets')
        .values({
          job_id: jobId,
          project_id: latest.project_id,
          version,
          content: JSON.stringify(content),
          content_sha256: sha,
          changes: '[]',
          critical: false,
        })
        .execute()
    await expect(insert(latest.version + 2, 'b'.repeat(64))).rejects.toThrow(/follows the latest/)
    await expect(insert(latest.version + 1, latest.content_sha256)).rejects.toThrow(/changes the content/)
    await expect(
      insert(latest.version + 1, 'c'.repeat(64), { ...(latest.content as object), sealedValue: 'x' }),
    ).rejects.toThrow(/job_packets_no_secret/)
  })

  it('[HH-PKT-02] packetChanges is the diff the routes store (domain and server agree)', async () => {
    const rows = await t.db
      .selectFrom('work.job_packets')
      .select(['version', 'content', 'changes'])
      .where('job_id', '=', jobId)
      .orderBy('version')
      .execute()
    for (let i = 1; i < rows.length; i++)
      expect(
        packetChanges(rows[i - 1]?.content as unknown as PacketContent, rows[i]?.content as unknown as PacketContent),
      ).toEqual(rows[i]?.changes)
  })
})

describe('[HH-PRIV-03][HH-PKT-02] job packets in a privacy request (TSK-0100 x TSK-0069)', () => {
  it("[HH-PRIV-03][HH-PKT-02] the search keeps the packet versions, views and exports with the job records; deleting the project's estimate never accepted leaves them", async () => {
    const p = await project()
    // An estimate published and withdrawn on the same project (never accepted, nothing blocks its deletion).
    const created = await staffWrite('estimator', 'POST', `/api/v1/staff/projects/${p.projectId}/estimates`, {})
    expect(created.statusCode, created.body).toBe(201)
    const lost = created.json<{ estimateId: string; number: string; versionId: string }>()
    const draft = (await staffGet('estimator', `/api/v1/staff/estimate-versions/${lost.versionId}`)).json<{
      rowVersion: number
      workPackages: { id: string }[]
    }>()
    const saved = await staffWrite(
      'estimator',
      'PUT',
      `/api/v1/staff/estimate-versions/${lost.versionId}/draft`,
      {
        lines: [
          {
            kind: 'base',
            workPackageId: draft.workPackages[0]?.id,
            description: 'Synthetic: the withdrawn patch',
            quantity: '1',
            unit: 'patch',
            unitPriceCents: 900,
          },
        ],
        texts: {},
      },
      draft.rowVersion,
    )
    expect(saved.statusCode, saved.body).toBe(200)
    const published = await staffWrite(
      'estimator',
      'POST',
      `/api/v1/staff/estimate-versions/${lost.versionId}/publish`,
      {},
      saved.json<{ rowVersion: number }>().rowVersion,
    )
    expect(published.statusCode, published.body).toBe(200)
    const withdrawn = await staffWrite(
      'estimator',
      'POST',
      `/api/v1/staff/estimate-versions/${lost.versionId}/withdraw`,
      { reason: 'Synthetic: sent by mistake.' },
      published.json<{ rowVersion: number }>().rowVersion,
    )
    expect(withdrawn.statusCode, withdrawn.body).toBe(200)

    const job = await approve(p)
    await bookedVisit(p, day(9), 'ann')
    const first = await packet('ann', job)
    expect((await viewed('ann', job, first.packet.version)).statusCode).toBe(200)
    const exported = await staffWrite('ann', 'POST', `/api/v1/staff/jobs/${job}/packet/exports`, {
      version: first.packet.version,
      format: 'print',
    })
    expect(exported.statusCode, exported.body).toBe(201)
    const count = async (table: 'work.job_packets' | 'work.job_packet_views' | 'work.job_packet_exports') =>
      Number(
        (
          await t.db
            .selectFrom(table)
            .select(sql<string>`count(*)::text`.as('n'))
            .where('job_id', '=', job)
            .executeTakeFirstOrThrow()
        ).n,
      )
    const rows = async () => [
      await count('work.job_packets'),
      await count('work.job_packet_views'),
      await count('work.job_packet_exports'),
    ]
    const before = await rows()
    expect(before).toEqual([first.packet.version, 1, 1])

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
    const visits = await t.db.selectFrom('work.visits').select('id').where('project_id', '=', p.projectId).execute()
    const changes = Number(
      (
        await t.db
          .selectFrom('work.visit_changes')
          .select(sql<string>`count(*)::text`.as('n'))
          .where('project_id', '=', p.projectId)
          .executeTakeFirstOrThrow()
      ).n,
    )
    // The job, its visit and change history, and every packet version, view and export: retained job records.
    expect(plan.items).toContainEqual(
      expect.objectContaining({
        category: 'job_records',
        disposition: 'retain',
        count: 1 + visits.length + changes + before.reduce((a, b) => a + b, 0),
        reason: 'active_record',
      }),
    )
    // The audit entries of the packet (they name the job) are counted with the rest.
    const jobAudits = await t.db
      .selectFrom('platform.audit_events')
      .select('action')
      .where('target_id', '=', job)
      .execute()
    expect(jobAudits.map((a) => a.action)).toContain('job_packet.export')
    const audits = plan.items.find((i) => i.category === 'audit_log')
    expect(audits?.count ?? 0).toBeGreaterThanOrEqual(jobAudits.length)
    // The estimate never accepted is deletable; the accepted one is protected evidence.
    expect(plan.deletable.estimates).toEqual([expect.objectContaining({ id: lost.estimateId })])

    // Deleting it (the same erasure as Confirm Delete) leaves every packet record and the packet as it was.
    const done = await withTx(t.db, (tx) =>
      reapplyDeletions(
        tx,
        [
          {
            id: randomUUID(),
            recordType: 'estimate',
            recordId: lost.estimateId,
            recordRef: lost.number,
            reason: 'Synthetic: never accepted.',
            decidedAt: new Date().toISOString(),
          },
        ],
        { requestId: `req-${key('erase')}` },
      ),
    )
    expect(done).toEqual([expect.objectContaining({ outcome: 'reapplied', blockers: [] })])
    expect(
      await t.db.selectFrom('estimating.estimates').select('id').where('id', '=', lost.estimateId).execute(),
    ).toEqual([])
    expect(await rows()).toEqual(before)
    const after = await packet('ann', job)
    expect(after.packet.version).toBe(first.packet.version)
    expect(after.review.lastViewed?.version).toBe(first.packet.version)
  })
})
