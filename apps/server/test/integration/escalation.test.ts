// The escalation procedure in every job packet against PostgreSQL 16 (TSK-0129; HH-PKT-09, HH-WORK-13,
// FACT-SVC-ESCALATION-PATH, ENT-StaffUser, ENT-AuditEvent, OWN-DEC-172, OWN-DEC-208, RULE-SAFETY-GATES,
// RULE-SERVER-AUTHZ, RULE-NO-INVENTED-FACTS). Staff, customers, addresses and texts are synthetic; the Owner's number
// is a synthetic 555-01XX number (RULE-SYNTHETIC-DATA); the estimate terms version recorded below is a fixture of this
// throwaway database.
// - Visits are fixtures in the first hours of today's local date (as in hazard-reports.test.ts); dates come from
//   localDateOf(now, America/Kentucky/Louisville), never a weekday.
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
import { localClockOf, localDateOf, offsetMinutesAt, resolveLocalTime, resolveWindow } from '@handyhub/domain'
import { ESTIMATE_TERMS } from '@handyhub/domain/legal'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { startCustomerSession } from '../../src/modules/identity/customer-sessions.js'
import { readCodeKey, type CodeKeySettings } from '../../src/modules/identity/index.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import { recordPolicyVersion } from '../../src/platform/config/index.js'
import { FakeObjectStorage } from '../../src/providers/r2/index.js'
import { verifyCountyOf } from '../fixtures/county.js'
import { testConfig } from '../fixtures/env.js'
import { signInWithMfa } from '../fixtures/staff-mfa.js'
import { verifyPropertyZone } from '../fixtures/zones.js'

const ZONE = 'America/Kentucky/Louisville'
const KEY: CodeKeySettings = readCodeKey({
  HANDYHUB_ENV: 'ci',
  CODE_HASH_KEY: ['synthetic', 'escalation', 'code', 'key', 'for', 'tests', 'only', '0129'].join('-'),
})
const pw = ['synthetic', 'escalation', 'passphrase', '129'].join(' ')
const PEOPLE = ['owner', 'office', 'estimator', 'ann', 'ben', 'cara'] as const
type Person = (typeof PEOPLE)[number]
/** A synthetic number from the 555-01XX range reserved for fiction. */
const SYNTHETIC_PHONE = '(502) 555-0142'
const SYNTHETIC_E164 = '+15025550142'

let t: TestDatabase
let wide: Db
let app: FastifyInstance
const cookies = {} as Record<Person, string>
const csrf = {} as Record<Person, string>
const ids = {} as Record<Person, string>
let staleOwner: { cookie: string; csrf: string }
const today = () => localDateOf(new Date(), ZONE)

async function signIn(p: Person) {
  const res = await signInWithMfa(app, {
    method: 'POST',
    url: '/api/v1/staff/auth/sign-in',
    headers: { 'x-forwarded-for': '198.51.100.129' },
    payload: { email: `${p}-escalation@example.test`, password: pw },
  })
  expect(res.statusCode, res.body).toBe(200)
  const cookie = String(res.headers['set-cookie']).split(';')[0] as string
  const session = await app.inject({ method: 'GET', url: '/api/v1/staff/auth/session', headers: { cookie } })
  return { cookie, csrf: session.json<{ csrfToken: string }>().csrfToken }
}

let seq = 0
const key = () => `synthetic-escalation-${String(++seq).padStart(6, '0')}-${randomUUID()}`
function staffWrite(who: Person, url: string, payload: unknown, version?: number) {
  return app.inject({
    method: 'POST',
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

beforeAll(async () => {
  t = await createTestDatabase()
  wide = createDb(t.url, { max: 8, applicationName: 'escalation-test' })
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
      const role = p === 'ann' || p === 'ben' || p === 'cara' ? 'worker' : p
      const user = await createStaffUser(tx, {
        email: `${p}-escalation@example.test`,
        displayName: `Synthetic ${p}`,
        locale: p === 'ben' ? 'es' : 'en',
        role,
        issuedBy: 'test',
      })
      await setPasswordHash(tx, user.id, hash)
      ids[p] = user.id
    }
  })
  for (const p of PEOPLE) ({ cookie: cookies[p], csrf: csrf[p] } = await signIn(p))
  // A second Owner session whose password entry is older than the fresh-sign-in window.
  staleOwner = await signIn('owner')
  await sql`UPDATE identity.staff_sessions SET authenticated_at = now() - interval '30 minutes'
            WHERE id = (SELECT id FROM identity.staff_sessions WHERE staff_user_id = ${ids.owner}
                        ORDER BY created_at DESC LIMIT 1)`.execute(t.db)
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
      description: 'Synthetic escalation project.',
      answers: [],
      property: {
        street: `${++seq} Synthetic Escalation Lane`,
        city: 'Testville',
        state: 'ky',
        zip: '40000',
        propertyType: 'house',
      },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'site_visit',
      contact: {
        fullName: 'Synthetic Escalation Customer',
        email: `escalation-${seq}-${randomUUID().slice(0, 8)}@example.test`,
        phone: '(502) 555-0129',
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
async function approve(p: Project): Promise<string> {
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
          unitPriceCents: 1250,
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
      'x-forwarded-for': `2001:db8:129:${++ip}::1`,
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
      fullName: 'Synthetic Escalation Customer',
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
async function fixtureVisit(p: Project, jobId: string, team: Person[]): Promise<string> {
  const window = fixtureWindow(today(), team)
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
    await tx
      .updateTable('work.visits')
      .set({ state: 'confirmed', version: v.version + 1 })
      .where('id', '=', v.id)
      .execute()
    return v.id
  })
}
/** A job with a confirmed visit today for Ann (lead) and Ben. */
async function jobWithVisit() {
  const p = await project()
  const jobId = await approve(p)
  const visitId = await fixtureVisit(p, jobId, ['ann', 'ben'])
  return { p, jobId, visitId }
}

// --- Escalation helpers ----------------------------------------------------------------------------------------------

const PHONE_URL = '/api/v1/staff/profile/escalation-phone'
function putPhone(who: Person | { cookie: string; csrf: string }, phone: string | null, version?: number) {
  const s = typeof who === 'string' ? { cookie: cookies[who], csrf: csrf[who] } : who
  return app.inject({
    method: 'PUT',
    url: PHONE_URL,
    payload: { phone },
    headers: {
      cookie: s.cookie,
      'x-csrf-token': s.csrf,
      'idempotency-key': key(),
      ...(version === undefined ? {} : { 'if-match': `"${version}"` }),
    },
  })
}
const ownPhone = async () => {
  const res = await staffGet('owner', PHONE_URL)
  expect(res.statusCode, res.body).toBe(200)
  return res.json<{ state: string; phone: string | null; display: string | null; version: number }>()
}
type Contact = { state: 'configured'; phone: string; display: string; tel: string } | { state: 'not_configured' }
type Call = {
  clientId: string
  jobId: string
  action: string
  alreadyRecorded: boolean
  workStaysPaused: boolean
  owner: Contact
  emergency: { call911: string }
}
const recordCall = (who: Person, jobId: string, body: Record<string, unknown>) =>
  staffWrite(who, `/api/v1/staff/jobs/${jobId}/escalation-calls`, {
    clientId: randomUUID(),
    deviceRecordedAt: new Date().toISOString(),
    ...body,
  })
async function packetContact(who: Person, jobId: string) {
  const res = await staffGet(who, `/api/v1/staff/jobs/${jobId}/packet`)
  expect(res.statusCode, res.body).toBe(200)
  return res.json<{ packet: { version: number }; communication: { escalationContact: Contact; emergency: unknown } }>()
}
async function reportsEscalation(who: Person, jobId: string) {
  const res = await staffGet(who, `/api/v1/staff/jobs/${jobId}/issue-reports`)
  expect(res.statusCode, res.body).toBe(200)
  return res.json<{
    emergency: { call911: string }
    escalation: { owner: Contact; calls: { clientId: string; action: string; recordedBy: { id: string } }[] }
  }>()
}
const CONFIGURED: Contact = {
  state: 'configured',
  phone: SYNTHETIC_E164,
  display: SYNTHETIC_PHONE,
  tel: `tel:${SYNTHETIC_E164}`,
}

// --- Tests -----------------------------------------------------------------------------------------------------------

describe("[HH-PKT-09][OWN-DEC-172] the Owner's escalation number (TSK-0129)", () => {
  it('[RULE-NO-INVENTED-FACTS] NOT CONFIGURED until the Owner enters it; the packet and Stop Work never wait for it', async () => {
    expect(await ownPhone()).toMatchObject({ state: 'NOT_CONFIGURED', phone: null, version: 0 })
    const { jobId } = await jobWithVisit()
    const packet = await packetContact('ann', jobId)
    expect(packet.communication.escalationContact).toEqual({ state: 'not_configured' })
    expect(packet.communication.emergency).toEqual({ call911: 'tel:911' })
    const view = await reportsEscalation('ann', jobId)
    expect(view.escalation.owner).toEqual({ state: 'not_configured' })
    expect(view.emergency.call911).toBe('tel:911')
    // Call 911 is recorded while the Owner's number is missing.
    const res = await recordCall('ann', jobId, { action: 'call_911' })
    expect(res.statusCode, res.body).toBe(201)
    expect(res.json<Call>()).toMatchObject({ action: 'call_911', owner: { state: 'not_configured' } })
  })

  it('[RULE-SERVER-AUTHZ] only the Owner, on their own profile, with a fresh sign-in and the version shown', async () => {
    for (const p of ['office', 'estimator', 'ann'] as const) {
      expect((await staffGet(p, PHONE_URL)).statusCode, p).toBe(403)
      const res = await putPhone(p, SYNTHETIC_PHONE, 0)
      expect(res.statusCode, p).toBe(403)
      expect(res.json<Err>().error.code).toBe('FORBIDDEN')
    }
    const stale = await putPhone(staleOwner, SYNTHETIC_PHONE, 0)
    expect(stale.statusCode).toBe(403)
    expect(stale.json<Err>().error.code).toBe('FRESH_AUTH_REQUIRED')
    expect((await putPhone('owner', SYNTHETIC_PHONE)).statusCode).toBe(428)
    expect((await putPhone('owner', SYNTHETIC_PHONE, 3)).json<Err>().error.code).toBe('STALE_VERSION')
    for (const bad of ['555-0142', '+44 20 7946 0958', 'call the office']) {
      const res = await putPhone('owner', bad, 0)
      expect(res.statusCode, bad).toBe(400)
      expect(res.json<Err>().error.fieldErrors).toMatchObject([{ field: 'body.phone', code: 'invalidPhone' }])
    }
    expect(await ownPhone()).toMatchObject({ state: 'NOT_CONFIGURED', version: 0 })
    // The database holds a number only on an Owner account.
    await expect(
      t.db
        .insertInto('identity.staff_escalation_phones')
        .values({ staff_user_id: ids.ann, phone: SYNTHETIC_E164 })
        .execute(),
    ).rejects.toThrow(/only an Owner account holds the escalation number/)
  })

  it('entered as typed, stored as +1 and ten digits, read by every packet at once with no new version; audited without the number', async () => {
    const { jobId } = await jobWithVisit()
    const before = await packetContact('ann', jobId)
    const res = await putPhone('owner', SYNTHETIC_PHONE, 0)
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json()).toMatchObject({
      state: 'CONFIGURED',
      phone: SYNTHETIC_E164,
      display: SYNTHETIC_PHONE,
      version: 1,
    })
    const after = await packetContact('ben', jobId)
    expect(after.communication.escalationContact).toEqual(CONFIGURED)
    expect(after.packet.version).toBe(before.packet.version)
    expect((await reportsEscalation('office', jobId)).escalation.owner).toEqual(CONFIGURED)
    const audit = await t.db
      .selectFrom('platform.audit_events')
      .select(['target_id', 'summary', 'step_up_used'])
      .where('action', '=', 'staff.set_escalation_phone')
      .executeTakeFirstOrThrow()
    expect(audit.target_id).toBe(ids.owner)
    expect(audit.step_up_used).toBe(true)
    expect(JSON.stringify(audit.summary)).not.toMatch(/555|0142/)
    expect(audit.summary).toMatchObject({ from: 'NOT_CONFIGURED', to: 'CONFIGURED', previousVersion: 0 })
  })
})

describe('[HH-PKT-09][HH-WORK-13] recorded Call Owner, Call 911 and Owner-unreachable taps (TSK-0129)', () => {
  it('every assigned worker, Office and the Owner record a tap once per phone UUID; nobody else', async () => {
    const { jobId, visitId } = await jobWithVisit()
    const clientId = randomUUID()
    const body = { clientId, action: 'call_owner', visitId, deviceRecordedAt: new Date().toISOString() }
    const first = await staffWrite('ann', `/api/v1/staff/jobs/${jobId}/escalation-calls`, body)
    expect(first.statusCode, first.body).toBe(201)
    expect(first.json<Call>()).toMatchObject({
      action: 'call_owner',
      alreadyRecorded: false,
      emergency: { call911: 'tel:911' },
    })
    // Resent from an offline phone with a new key: the same record.
    const again = await staffWrite('ann', `/api/v1/staff/jobs/${jobId}/escalation-calls`, body)
    expect(again.statusCode, again.body).toBe(200)
    expect(again.json<Call>().alreadyRecorded).toBe(true)
    const someoneElse = await staffWrite('ben', `/api/v1/staff/jobs/${jobId}/escalation-calls`, body)
    expect(someoneElse.statusCode).toBe(409)
    expect(someoneElse.json<Err>().error.fieldErrors[0]?.code).toBe('ESCALATION_CALL_EXISTS')
    expect((await recordCall('cara', jobId, { action: 'call_911' })).statusCode).toBe(403)
    for (const who of ['office', 'owner', 'ben'] as const)
      expect((await recordCall(who, jobId, { action: 'call_911' })).statusCode, who).toBe(201)
    const rows = await t.db.selectFrom('work.escalation_calls').selectAll().where('job_id', '=', jobId).execute()
    expect(rows).toHaveLength(4)
    expect(rows.find((r) => r.client_id === clientId)).toMatchObject({ actor_id: ids.ann, visit_id: visitId })
    // The Owner sees every tap; a worker their own.
    expect((await reportsEscalation('owner', jobId)).escalation.calls).toHaveLength(4)
    const mine = (await reportsEscalation('ann', jobId)).escalation.calls
    expect(mine.map((c) => c.recordedBy.id)).toEqual([ids.ann])
    // A visit or report the server cannot place on the job is left out, never refused.
    const other = await jobWithVisit()
    const stray = await recordCall('ann', jobId, { action: 'call_911', visitId: other.visitId, reportId: randomUUID() })
    expect(stray.statusCode, stray.body).toBe(201)
    const row = await t.db
      .selectFrom('work.escalation_calls')
      .selectAll()
      .where('client_id', '=', stray.json<Call>().clientId)
      .executeTakeFirstOrThrow()
    expect(row).toMatchObject({ visit_id: null, report_id: null })
    // Recorded, audited and never changed.
    expect(
      await t.db
        .selectFrom('platform.audit_events')
        .select('id')
        .where('action', '=', 'hazard.record_escalation_call')
        .where('target_id', '=', clientId)
        .where(sql<boolean>`summary->>'alreadyRecorded' = 'false'`)
        .execute(),
    ).toHaveLength(1)
    await expect(sql`UPDATE work.escalation_calls SET action = 'call_911'`.execute(t.db)).rejects.toThrow(/APPEND_ONLY/)
    await expect(sql`DELETE FROM work.escalation_calls`.execute(t.db)).rejects.toThrow(/APPEND_ONLY/)
  })

  it('[OWN-DEC-208] Owner unreachable: the affected work stays paused and the gate stays blocked; Call 911 is never gated', async () => {
    const { jobId, visitId } = await jobWithVisit()
    const stop = await staffWrite('ann', `/api/v1/staff/jobs/${jobId}/hazard-reports`, {
      hazard: 'structural',
      visitId,
    })
    expect(stop.statusCode, stop.body).toBe(201)
    const { reportId, holdId } = stop.json<{ reportId: string; holdId: string }>()
    const unreachable = await recordCall('ann', jobId, { action: 'owner_unreachable', visitId, reportId })
    expect(unreachable.statusCode, unreachable.body).toBe(201)
    expect(unreachable.json<Call>()).toMatchObject({ action: 'owner_unreachable', workStaysPaused: true })
    const row = await t.db
      .selectFrom('work.escalation_calls')
      .selectAll()
      .where('client_id', '=', unreachable.json<Call>().clientId)
      .executeTakeFirstOrThrow()
    expect(row).toMatchObject({ report_id: reportId, visit_id: visitId })
    // Nothing resumed: the critical hold is open and Start Work stays blocked.
    expect(
      (await t.db.selectFrom('work.holds').select('state').where('id', '=', holdId).executeTakeFirstOrThrow()).state,
    ).toBe('open')
    const gate = await staffGet('ann', `/api/v1/staff/visits/${visitId}/start-gate`)
    expect(gate.statusCode, gate.body).toBe(200)
    expect(gate.json<{ outcome: string; emergency: { call911: string } }>()).toMatchObject({
      outcome: 'blocked',
      emergency: { call911: 'tel:911' },
    })
    // With the Owner unreachable, Call 911 is still recorded at once, whatever the Owner's number.
    const emergency = await recordCall('ann', jobId, { action: 'call_911', visitId, reportId })
    expect(emergency.statusCode, emergency.body).toBe(201)
    expect(emergency.json<Call>().emergency.call911).toBe('tel:911')
  })

  it('clearing the number makes Call Owner NOT CONFIGURED again; Call 911 is unaffected', async () => {
    const { jobId } = await jobWithVisit()
    const current = await ownPhone()
    const cleared = await putPhone('owner', null, current.version)
    expect(cleared.statusCode, cleared.body).toBe(200)
    expect(cleared.json()).toMatchObject({ state: 'NOT_CONFIGURED', phone: null, version: current.version + 1 })
    expect((await packetContact('ann', jobId)).communication.escalationContact).toEqual({ state: 'not_configured' })
    const res = await recordCall('ann', jobId, { action: 'call_911' })
    expect(res.json<Call>()).toMatchObject({ owner: { state: 'not_configured' }, emergency: { call911: 'tel:911' } })
    // A cleared number is kept as a row without a number, never deleted.
    await expect(sql`DELETE FROM identity.staff_escalation_phones`.execute(t.db)).rejects.toThrow(/never deleted/)
  })
})
