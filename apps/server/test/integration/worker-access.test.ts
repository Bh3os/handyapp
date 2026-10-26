// The assigned workers' visit-day data access and the Owner's extensions against PostgreSQL 16 (TSK-0128; HH-PKT-08,
// HH-CRM-03, HH-OFF-02, HH-DATA-08, T28, T27, T44, ENT-Visit, ENT-Reservation, ENT-AccessInstructionSecret,
// ENT-AuditEvent, OWN-DEC-171, OWN-DEC-159, RULE-SERVER-AUTHZ). Staff, customers, addresses, phone numbers, notes and the
// access code are synthetic (RULE-SYNTHETIC-DATA); the working hours are test fixtures, never the business's hours.
// - "Today's visit" is a fixture written the way the confirmation writes it (a covering reservation, then the state),
//   because the API only plans visits in the future; later visits are planned and confirmed through the API.
// - Nothing here depends on the time of day the suite runs at: today is the property's own local date when the test
//   runs, and the boundaries (before, during and after the day, Eastern and Central, both clock changes, local
//   midnight) are checked with fixed instants on fixture visits dated years ahead, through the same server function
//   the routes use and against the SQL bounds the data scopes use.
import { randomUUID } from 'node:crypto'
import { createDb, loadServiceSeed, loadSopSeed, syncServices, syncSops, withTx, type Db } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import {
  addLocalDays,
  localClockOf,
  localDateOf,
  localDayStart,
  offsetMinutesAt,
  resolveLocalTime,
  resolveWindow,
  serviceDayOf,
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
import { DAY_ENDS, DAY_STARTS, workerVisitAccess } from '../../src/modules/packets/access-window.js'
import { renderPacketPdf } from '../../src/modules/packets/pdf.js'
import type { PacketView } from '../../src/modules/packets/view.js'
import { recordPolicyVersion } from '../../src/platform/config/index.js'
import { FakeObjectStorage } from '../../src/providers/r2/index.js'
import { verifyCountyOf } from '../fixtures/county.js'
import { pdfText } from '../fixtures/documents.js'
import { testConfig } from '../fixtures/env.js'
import { verifyPropertyZone } from '../fixtures/zones.js'
import { signInWithMfa } from '../fixtures/staff-mfa.js'

const EASTERN = 'America/Kentucky/Louisville'
const CENTRAL = 'America/Chicago'
const KEY: CodeKeySettings = readCodeKey({
  HANDYHUB_ENV: 'ci',
  CODE_HASH_KEY: ['synthetic', 'worker', 'access', 'code', 'key', 'for', 'tests', 'only', '0128'].join('-'),
})
const SEAL = ['synthetic', 'worker', 'access', 'code', 'sealing', 'key', 'tests'].join('-')
const pw = ['synthetic', 'worker', 'access', 'passphrase', '128'].join(' ')
/** The access code of this test, built at runtime so no literal looks like a credential. */
const CODE = ['7', '3', '1', '9', '5'].join('')
/** The site contact's synthetic phone (555 numbers are reserved for fiction). */
const SITE_PHONE = ['(502)', '555-0128'].join(' ')
const SIGNED_IN = ['owner', 'office', 'ann', 'ben', 'cy', 'dee'] as const
type Person = (typeof SIGNED_IN)[number]
const WORKERS = ['ann', 'ben', 'cy', 'dee'] as const
const NAMES: Record<Person, string> = {
  owner: 'Synthetic Owner',
  office: 'Synthetic Office',
  ann: 'Annabel Synthetic',
  ben: 'Benito Synthetic',
  cy: 'Cyrus Synthetic',
  dee: 'Delia Synthetic',
}

let t: TestDatabase
let wide: Db
let app: FastifyInstance
const cookies = {} as Record<Person, string>
const csrf = {} as Record<Person, string>
const ids = {} as Record<Person, string>

const todayIn = (zone: string) => localDateOf(new Date(), zone)
const dayIn = (zone: string, n: number) => addLocalDays(todayIn(zone), n)
const WEEK = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, start: '08:00', end: '20:00' }))

async function signIn(p: Person): Promise<[string, string]> {
  const res = await signInWithMfa(app, {
    method: 'POST',
    url: '/api/v1/staff/auth/sign-in',
    headers: { 'x-forwarded-for': '198.51.100.128' },
    payload: { email: `${p}-access@example.test`, password: pw },
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
  wide = createDb(t.url, { max: 8, applicationName: 'worker-access-test' })
  await syncServices(t.db, loadServiceSeed())
  await syncSops(t.db, loadSopSeed())
  app = await buildApp({
    config: testConfig({ TRUST_PROXY_HOPS: '1', ACCESS_CODE_ENCRYPTION_KEY: SEAL }),
    api: { db: wide, codeKey: KEY, storage: new FakeObjectStorage() },
  })
  const hash = await hashPassword(pw)
  await withTx(t.db, async (tx) => {
    for (const p of SIGNED_IN) {
      const role = (WORKERS as readonly string[]).includes(p) ? 'worker' : (p as 'owner' | 'office')
      const user = await createStaffUser(tx, {
        email: `${p}-access@example.test`,
        displayName: NAMES[p],
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
type Project = {
  projectId: string
  propertyId: string
  reference: string
  cookie: string
  street: string
  zone: string
}
let ip = 40

/**
 * A qualified synthetic request with one DW-01 work package in the given zone, a verified customer session, a site
 * contact with a phone and an access code on the property.
 */
async function project(zone = EASTERN): Promise<Project> {
  const street = `${++seq} Synthetic Access Lane`
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/public/requests',
    headers: { 'idempotency-key': key('submit'), 'x-forwarded-for': `198.51.100.${++ip}` },
    payload: {
      formVersion: 'test-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-01' }],
      notSure: false,
      description: 'Synthetic worker access project.',
      answers: [],
      property: { street, city: 'Testville', state: 'ky', zip: '40000', propertyType: 'house' },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'site_visit',
      contact: {
        fullName: 'Rosalind Synthetic-Customer',
        email: `access-${seq}-${randomUUID().slice(0, 8)}@example.test`,
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
  await verifyPropertyZone(t.db, { projectId: row.project_id }, zone)
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
  const property = (await staffGet('office', `/api/v1/staff/properties/${row.property_id}`)).json<{
    version: number
  }>()
  const contact = await staffWrite(
    'office',
    'PUT',
    `/api/v1/staff/properties/${row.property_id}/details/site_contact`,
    { value: `Synthetic neighbour, ${SITE_PHONE}`, source: 'customer_call', reason: 'Synthetic: the customer called' },
    property.version,
  )
  expect(contact.statusCode, contact.body).toBe(200)
  const coded = await staffWrite('office', 'POST', `/api/v1/staff/properties/${row.property_id}/access-codes`, {
    kind: 'lockbox',
    label: 'Synthetic box',
    value: CODE,
    source: 'customer_call',
    reason: 'Synthetic: given by phone',
  })
  expect(coded.statusCode, coded.body).toBe(201)
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
    projectId: row.project_id,
    propertyId: row.property_id,
    reference,
    cookie: `__Host-hh_customer=${s.token}`,
    street,
    zone,
  }
}

/** Approves one synthetic patch ($12.50: no deposit) through the real approval transaction; returns the job. */
async function approve(p: Project): Promise<string> {
  const created = await staffWrite('owner', 'POST', `/api/v1/staff/projects/${p.projectId}/estimates`, {})
  expect(created.statusCode, created.body).toBe(201)
  const c = created.json<{ number: string; versionId: string }>()
  const v = (await staffGet('owner', `/api/v1/staff/estimate-versions/${c.versionId}`)).json<{
    rowVersion: number
    workPackages: { id: string }[]
  }>()
  const saved = await staffWrite(
    'owner',
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
      texts: {},
    },
    v.rowVersion,
  )
  expect(saved.statusCode, saved.body).toBe(200)
  const pub = await staffWrite(
    'owner',
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
      'x-forwarded-for': `2001:db8:128:${++ip}::1`,
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
      fullName: 'Rosalind Synthetic-Customer',
    },
  })
  expect(res.statusCode, res.body).toBe(201)
  return (
    await t.db.selectFrom('work.jobs').select('id').where('project_id', '=', p.projectId).executeTakeFirstOrThrow()
  ).id
}

/** A work visit planned by Office for a future date and confirmed with one worker. */
async function bookedVisit(p: Project, date: string, worker: Person): Promise<{ id: string; version: number }> {
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
  const all = planned.json<{ visits: { id: string; version: number }[] }>().visits
  const v = all[all.length - 1] as { id: string; version: number }
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
const currentVisit = (id: string) =>
  t.db.selectFrom('work.visits').select(['id', 'version']).where('id', '=', id).executeTakeFirstOrThrow()

const SLOT_MINUTES = 10
const taken = new Map<string, Set<number>>()
/** The first free 10-minute slot after local midnight of `date` for the team (see my-day.test.ts). */
function fixtureWindow(date: string, zone: string, team: Person[]) {
  const midnight = resolveLocalTime(date, '00:00', zone)
  if (midnight.kind !== 'unique') throw new Error('fixture midnight')
  for (let k = 0; k < 48; k++) {
    if (team.some((who) => taken.get(`${date}|${who}`)?.has(k))) continue
    const startsAt = new Date(midnight.at.instant.getTime() + k * SLOT_MINUTES * 60_000)
    const endsAt = new Date(startsAt.getTime() + (SLOT_MINUTES / 2) * 60_000)
    if (localDateOf(startsAt, zone) !== date) break
    const w = resolveWindow({
      date,
      start: localClockOf(startsAt, zone),
      end: localClockOf(endsAt, zone),
      zone,
      startOffsetMinutes: offsetMinutesAt(startsAt, zone),
      endOffsetMinutes: offsetMinutesAt(endsAt, zone),
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
/** A confirmed work visit on `date` (in the project's zone) for the team, written as the confirmation writes it. */
async function fixtureVisit(p: Project, jobId: string, date: string, team: Person[]): Promise<string> {
  const window = fixtureWindow(date, p.zone, team)
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
        time_zone: p.zone,
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
          time_zone: p.zone,
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

type Packet = {
  site: {
    address: { street: string } | null
    directionsUrl: string | null
    serviceArea: { city: string; state: string } | null
    details: { detail: string; value: string | null }[]
    accessCodes: { id: string; kind: string }[]
  }
  communication: { siteContact: { value: string | null } | null }
  customer: { firstName: string | null }
  access: { mode: string; basis: string | null; endsAt: string | null; opensAt: string | null }
  actions: { revealAccessCodes: boolean }
}
const packet = async (who: Person, jobId: string) => {
  const res = await staffGet(who, `/api/v1/staff/jobs/${jobId}/packet`)
  expect(res.statusCode, res.body).toBe(200)
  return res.json<Packet>()
}
const codeIdOf = async (p: Project) =>
  (
    await t.db
      .selectFrom('crm.access_instruction_secrets')
      .select('id')
      .where('property_id', '=', p.propertyId)
      .executeTakeFirstOrThrow()
  ).id
const reveal = (who: Person, p: Project, codeId: string) =>
  staffWrite(who, 'POST', `/api/v1/staff/properties/${p.propertyId}/access-codes/${codeId}/reveal`, {})
const workerAccess = async (who: Person, visitId: string) => {
  const res = await staffGet(who, `/api/v1/staff/visits/${visitId}/worker-access`)
  expect(res.statusCode, res.body).toBe(200)
  return res.json<{
    workers: { staffUserId: string; open: boolean; basis: string | null; opensAt: string | null }[]
    extensions: { id: string; staffUserId: string; state: string; reason: string; endReason: string | null }[]
    actions: { extend: boolean }
    serviceDay: { startsAt: string; endsAt: string } | null
  }>()
}
const extend = (who: Person, visitId: string, worker: Person, expiresAt: Date, reason = 'Synthetic: late finish') =>
  staffWrite(who, 'POST', `/api/v1/staff/visits/${visitId}/worker-access/extensions`, {
    staffUserId: ids[worker],
    expiresAt: expiresAt.toISOString(),
    reason,
  })
const errorCodes = (body: string) =>
  (JSON.parse(body) as { error: { fieldErrors: { field: string; code: string }[] } }).error.fieldErrors.map((f) => [
    f.field,
    f.code,
  ])
/** Nothing of the visit-day data in an answer: no street, no site-contact phone, no code, no customer name. */
function expectNoVisitDayData(text: string, p: Project) {
  expect(text).not.toContain(p.street)
  expect(text).not.toContain('555-0128')
  expect(text).not.toContain(CODE)
  expect(text).not.toContain('Rosalind')
  expect(text).not.toContain('Synthetic box')
}

describe('[HH-PKT-08][OWN-DEC-171] before, during and after the visit day (Eastern and Central)', () => {
  it('[HH-PKT-08][T28][HH-CRM-03] on the visit day: first name, address, site contact and the audited code reveal', async () => {
    const p = await project()
    const jobId = await approve(p)
    const visitId = await fixtureVisit(p, jobId, todayIn(EASTERN), ['ann'])
    const seen = await packet('ann', jobId)
    expect(seen.access).toMatchObject({ mode: 'visit_day', basis: 'visit_day', opensAt: null })
    expect(new Date(seen.access.endsAt ?? '').getTime()).toBe(localDayStart(dayIn(EASTERN, 1), EASTERN)?.getTime())
    expect(seen.customer).toEqual({ firstName: 'Rosalind' })
    expect(seen.site.address?.street).toBe(p.street)
    expect(seen.site.directionsUrl).toMatch(/^https:\/\/www\.google\.com\/maps\/dir\//)
    expect(seen.communication.siteContact?.value).toContain(SITE_PHONE)
    expect(seen.site.accessCodes.map((c) => c.kind)).toEqual(['lockbox'])
    expect(seen.actions.revealAccessCodes).toBe(true)
    // First name only: never the full name, the customer's own phone or email.
    expect(JSON.stringify(seen)).not.toMatch(/Synthetic-Customer|555-0129|@example\.test/)
    expect(JSON.stringify(seen)).not.toContain(CODE)

    const codeId = await codeIdOf(p)
    const shown = await reveal('ann', p, codeId)
    expect(shown.statusCode, shown.body).toBe(200)
    expect(shown.json<{ value: string }>().value).toBe(CODE)
    const audited = await t.db
      .selectFrom('platform.audit_events')
      .select(['actor_id', 'target_id', 'summary'])
      .where('action', '=', 'access_code.reveal')
      .where('actor_id', '=', ids.ann)
      .execute()
    expect(audited).toHaveLength(1)
    expect(JSON.stringify(audited)).not.toContain(CODE)

    // The property record stays the office's: a worker reads the site facts in the packet, never the record with its
    // customers, requests and history.
    expect((await staffGet('ann', `/api/v1/staff/properties/${p.propertyId}`)).statusCode).toBe(403)
    // My Day shows the same.
    const day = await staffGet('ann', '/api/v1/staff/my/day')
    const item = day
      .json<{ visits: { visitId: string; customer: unknown; visitDay: unknown; address: unknown }[] }>()
      .visits.find((v) => v.visitId === visitId)
    expect(item).toMatchObject({
      customer: { firstName: 'Rosalind' },
      visitDay: { open: true, basis: 'visit_day' },
      address: { street: p.street },
    })
  })

  it('[HH-PKT-08][T28][T49] before the visit day: job, window and safety only, the general service area, nothing else', async () => {
    const p = await project()
    const jobId = await approve(p)
    const v = await bookedVisit(p, dayIn(EASTERN, 3), 'ann')
    const res = await staffGet('ann', `/api/v1/staff/jobs/${jobId}/packet`)
    expect(res.statusCode, res.body).toBe(200)
    const seen = res.json<Packet & { visits: { visitId: string; localDate: string }[]; sop: unknown }>()
    expect(seen.access).toEqual({
      mode: 'closed',
      basis: null,
      endsAt: null,
      opensAt: localDayStart(dayIn(EASTERN, 3), EASTERN)?.toISOString(),
    })
    expect(seen.visits.map((x) => [x.visitId, x.localDate])).toEqual([[v.id, dayIn(EASTERN, 3)]])
    expect(seen.site).toMatchObject({
      address: null,
      directionsUrl: null,
      serviceArea: { city: 'Testville', state: 'KY' },
      details: [],
      accessCodes: [],
    })
    expect(seen.communication.siteContact).toBeNull()
    expect(seen.customer).toEqual({ firstName: null })
    expect(seen.actions.revealAccessCodes).toBe(false)
    expectNoVisitDayData(res.body, p)
    // The print copy follows the same projection.
    const pdf = await staffGet('ann', `/api/v1/staff/jobs/${jobId}/packet/pdf`)
    expect(pdf.statusCode).toBe(200)
    // Its text, laid out without compression from the same view the worker was answered.
    const printed = pdfText(
      await renderPacketPdf(
        {
          view: res.json() as PacketView,
          locale: 'en',
          printedAt: new Date(),
          timeZone: EASTERN,
          visitDayClosed: true,
        },
        { compress: false },
      ),
    ).join(' ')
    expectNoVisitDayData(printed, p)
    expect(printed).toContain('Shown on the visit day only. Service area: Testville, KY')
    // Direct API requests: the code, the property record and its address are refused or not found.
    expect((await reveal('ann', p, await codeIdOf(p))).statusCode).toBe(403)
    expect((await staffGet('ann', `/api/v1/staff/properties/${p.propertyId}`)).statusCode).toBe(403)
    // The Owner and Office see the full packet whatever the day.
    const full = await packet('office', jobId)
    expect(full.access.mode).toBe('full')
    expect(full.site.address?.street).toBe(p.street)
    // The worker-access view says when it opens.
    const access = await workerAccess('office', v.id)
    expect(access.workers).toEqual([
      expect.objectContaining({ staffUserId: ids.ann, open: false, opensAt: seen.access.opensAt }),
    ])
    expect(access.actions.extend).toBe(false)
  })

  it('[HH-PKT-08] after the visit day: the job is no longer reached and nothing is shown', async () => {
    const p = await project()
    const jobId = await approve(p)
    const visitId = await fixtureVisit(p, jobId, dayIn(EASTERN, -1), ['ann'])
    expect((await staffGet('ann', `/api/v1/staff/jobs/${jobId}/packet`)).statusCode).toBe(403)
    expect((await reveal('ann', p, await codeIdOf(p))).statusCode).toBe(403)
    expect((await staffGet('ann', `/api/v1/staff/properties/${p.propertyId}`)).statusCode).toBe(403)
    const mine = await staffGet('ann', '/api/v1/staff/my/job-packets')
    expect(mine.json<{ packets: { jobId: string }[] }>().packets.map((x) => x.jobId)).not.toContain(jobId)
    expect((await workerAccess('owner', visitId)).workers).toEqual([
      expect.objectContaining({ staffUserId: ids.ann, open: false, opensAt: null }),
    ])
  })

  it('[HH-PKT-08][OWN-DEC-159] a Central property opens on its own local day', async () => {
    const p = await project(CENTRAL)
    const jobId = await approve(p)
    const visitId = await fixtureVisit(p, jobId, todayIn(CENTRAL), ['ben'])
    const seen = await packet('ben', jobId)
    expect(seen.access.mode).toBe('visit_day')
    expect(new Date(seen.access.endsAt ?? '').getTime()).toBe(localDayStart(dayIn(CENTRAL, 1), CENTRAL)?.getTime())
    expect(seen.site.address?.street).toBe(p.street)
    expect((await reveal('ben', p, await codeIdOf(p))).statusCode).toBe(200)
    expect((await workerAccess('owner', visitId)).serviceDay).toEqual({
      startsAt: localDayStart(todayIn(CENTRAL), CENTRAL)?.toISOString(),
      endsAt: localDayStart(dayIn(CENTRAL, 1), CENTRAL)?.toISOString(),
    })
  })

  it('[HH-PKT-08][OWN-DEC-159] fixed instants: Eastern and Central boundaries, local midnight and both clock changes', async () => {
    const east = await project(EASTERN)
    const eastJob = await approve(east)
    const central = await project(CENTRAL)
    const centralJob = await approve(central)
    // Dates years ahead, so these fixtures are never anyone's "today": the 2030 November change (a 25-hour day) and
    // the 2031 March change (a 23-hour day).
    const fall = '2030-11-03'
    const spring = '2031-03-09'
    const e1 = await fixtureVisit(east, eastJob, fall, ['dee'])
    const c1 = await fixtureVisit(central, centralJob, fall, ['dee'])
    const e2 = await fixtureVisit(east, eastJob, spring, ['dee'])
    const c2 = await fixtureVisit(central, centralJob, spring, ['dee'])
    const at = async (visitId: string, iso: string) => {
      const [a] = await workerVisitAccess(t.db, ids.dee, { visitIds: [visitId] }, new Date(iso))
      return a?.access.open ?? null
    }
    // Fall: Louisville midnight 04:00Z, the next 05:00Z; Chicago an hour later each.
    expect(await at(e1, '2030-11-03T03:59:59Z')).toBe(false)
    expect(await at(e1, '2030-11-03T04:00:00Z')).toBe(true)
    expect(await at(e1, '2030-11-04T04:59:59Z')).toBe(true)
    expect(await at(e1, '2030-11-04T05:00:00Z')).toBe(false)
    expect(await at(c1, '2030-11-03T04:30:00Z')).toBe(false)
    expect(await at(c1, '2030-11-04T05:30:00Z')).toBe(true)
    expect(await at(c1, '2030-11-04T06:00:00Z')).toBe(false)
    // Spring: Louisville midnight 05:00Z, the next 04:00Z (23 hours); Chicago 06:00Z to 05:00Z.
    expect(await at(e2, '2031-03-09T04:59:59Z')).toBe(false)
    expect(await at(e2, '2031-03-10T03:59:59Z')).toBe(true)
    expect(await at(e2, '2031-03-10T04:00:00Z')).toBe(false)
    expect(await at(c2, '2031-03-10T04:30:00Z')).toBe(true)
    expect(await at(c2, '2031-03-10T05:00:00Z')).toBe(false)
    // The SQL bounds the data scopes use agree with the domain rule on every one of these days.
    const rows = await t.db
      .selectFrom('work.visits as v')
      .select(['v.id', 'v.local_date', 'v.time_zone', DAY_STARTS.as('starts'), DAY_ENDS.as('ends')])
      .where('v.id', 'in', [e1, c1, e2, c2])
      .execute()
    expect(rows).toHaveLength(4)
    for (const r of rows) {
      const d = serviceDayOf(r.local_date, r.time_zone)
      expect([new Date(r.starts).toISOString(), new Date(r.ends).toISOString()], r.id).toEqual([
        d?.startsAt.toISOString(),
        d?.endsAt.toISOString(),
      ])
    }
  })
})

describe('[HH-PKT-08][HH-DATA-08][OWN-DEC-171] access ends at once with the assignment', () => {
  it('[HH-DATA-08][T44] reassignment: the removed worker is refused on the next request, the new one is not', async () => {
    const p = await project()
    const jobId = await approve(p)
    let v = await bookedVisit(p, dayIn(EASTERN, 4), 'ann')
    // An Owner extension gives Ann the visit-day data now; the reassignment ends it with her assignment.
    const granted = await extend('owner', v.id, 'ann', new Date(Date.now() + 2 * 3_600_000))
    expect(granted.statusCode, granted.body).toBe(201)
    expect((await packet('ann', jobId)).access).toMatchObject({ mode: 'visit_day', basis: 'extension' })
    v = await currentVisit(v.id)
    const swapped = await staffWrite(
      'office',
      'POST',
      `/api/v1/staff/visits/${v.id}/reassign`,
      { workerIds: [ids.ben], reason: 'Synthetic: Ann is needed elsewhere' },
      v.version,
    )
    expect(swapped.statusCode, swapped.body).toBe(200)
    expect((await staffGet('ann', `/api/v1/staff/jobs/${jobId}/packet`)).statusCode).toBe(403)
    expect((await reveal('ann', p, await codeIdOf(p))).statusCode).toBe(403)
    expect((await staffGet('ann', `/api/v1/staff/properties/${p.propertyId}`)).statusCode).toBe(403)
    // Ben reaches the packet before the day without the visit-day data; nobody inherits Ann's extension.
    const ben = await packet('ben', jobId)
    expect(ben.access.mode).toBe('closed')
    expect(ben.site.address).toBeNull()
    const view = await workerAccess('owner', v.id)
    expect(view.extensions).toEqual([expect.objectContaining({ staffUserId: ids.ann, state: 'lapsed' })])
  })

  it('[HH-PKT-08] reschedule: the access moves to the new date; an extension does not carry over', async () => {
    const p = await project()
    const jobId = await approve(p)
    let v = await bookedVisit(p, dayIn(EASTERN, 5), 'ann')
    expect((await extend('owner', v.id, 'ann', new Date(Date.now() + 3_600_000))).statusCode).toBe(201)
    v = await currentVisit(v.id)
    const moved = await staffWrite(
      'office',
      'POST',
      `/api/v1/staff/visits/${v.id}/window`,
      {
        localDate: dayIn(EASTERN, 6),
        windowStart: '09:00',
        windowEnd: '10:00',
        reason: 'Synthetic: asked to move',
        initiator: 'customer',
      },
      v.version,
    )
    expect(moved.statusCode, moved.body).toBe(200)
    const seen = await packet('ann', jobId)
    expect(seen.access).toEqual({
      mode: 'closed',
      basis: null,
      endsAt: null,
      opensAt: localDayStart(dayIn(EASTERN, 6), EASTERN)?.toISOString(),
    })
    expect(seen.site.address).toBeNull()
    expect((await workerAccess('owner', v.id)).extensions.map((x) => x.state)).toEqual(['lapsed'])
  })

  it('[HH-PKT-08] cancellation: the visit-day data and the code go at once', async () => {
    const p = await project()
    const jobId = await approve(p)
    const visitId = await fixtureVisit(p, jobId, todayIn(EASTERN), ['cy'])
    expect((await packet('cy', jobId)).site.address?.street).toBe(p.street)
    const v = await currentVisit(visitId)
    const cancelled = await staffWrite(
      'owner',
      'POST',
      `/api/v1/staff/visits/${visitId}/cancel`,
      { reason: 'Synthetic: weather', initiator: 'handyhub', handyhubCause: 'weather' },
      v.version,
    )
    expect(cancelled.statusCode, cancelled.body).toBe(200)
    expect((await staffGet('cy', `/api/v1/staff/jobs/${jobId}/packet`)).statusCode).toBe(403)
    expect((await reveal('cy', p, await codeIdOf(p))).statusCode).toBe(403)
    expect((await staffGet('cy', `/api/v1/staff/properties/${p.propertyId}`)).statusCode).toBe(403)
    // And no extension can be granted on a visit that is no longer live.
    const refused = await extend('owner', visitId, 'cy', new Date(Date.now() + 3_600_000))
    expect(refused.statusCode).toBe(409)
    expect(errorCodes(refused.body)).toEqual([['state', 'VISIT_NOT_LIVE']])
  })

  it('[T27][HH-STAFF-02] offboarding and expired sessions: the next call is refused', async () => {
    const p = await project()
    const jobId = await approve(p)
    const visitId = await fixtureVisit(p, jobId, todayIn(EASTERN), ['dee'])
    expect((await packet('dee', jobId)).site.address?.street).toBe(p.street)
    // An idle session past its limit is refused before anything is read.
    await sql`UPDATE identity.staff_sessions SET last_seen_at = now() - interval '31 minutes'
              WHERE staff_user_id = ${ids.dee}::uuid AND revoked_at IS NULL`.execute(t.db)
    const idle = await staffGet('dee', `/api/v1/staff/jobs/${jobId}/packet`)
    expect(idle.statusCode).toBe(401)
    expectNoVisitDayData(idle.body, p)
    ;[cookies.dee, csrf.dee] = await signIn('dee')
    expect((await packet('dee', jobId)).site.address?.street).toBe(p.street)
    // Offboarding revokes the open session: the next call fails and shows nothing.
    const off = await staffWrite('owner', 'POST', `/api/v1/staff/members/${ids.dee}/disable`, {
      reason: 'Synthetic: left the team',
    })
    expect(off.statusCode, off.body).toBe(200)
    for (const url of [`/api/v1/staff/jobs/${jobId}/packet`, '/api/v1/staff/my/day']) {
      const res = await staffGet('dee', url)
      expect(res.statusCode, url).toBe(401)
      expectNoVisitDayData(res.body, p)
    }
    // And the Owner cannot extend the access of a disabled account.
    const refused = await extend('owner', visitId, 'dee', new Date(Date.now() + 3_600_000))
    expect(refused.statusCode).toBe(409)
    expect(errorCodes(refused.body)).toEqual([['body.staffUserId', 'NOT_ASSIGNED']])
  })

  it('[RULE-SERVER-AUTHZ] another worker, a customer session and a guest reach none of it', async () => {
    const p = await project()
    const jobId = await approve(p)
    await fixtureVisit(p, jobId, todayIn(EASTERN), ['ann'])
    for (const res of [
      await staffGet('ben', `/api/v1/staff/jobs/${jobId}/packet`),
      await reveal('ben', p, await codeIdOf(p)),
      await staffGet('ben', `/api/v1/staff/properties/${p.propertyId}`),
    ]) {
      expect([403, 404]).toContain(res.statusCode)
      expectNoVisitDayData(res.body, p)
    }
    const customer = await app.inject({
      method: 'GET',
      url: `/api/v1/staff/jobs/${jobId}/packet`,
      headers: { cookie: p.cookie },
    })
    expect(customer.statusCode).toBe(401)
    const guest = await app.inject({ method: 'GET', url: `/api/v1/staff/properties/${p.propertyId}` })
    expect(guest.statusCode).toBe(401)
  })
})

describe('[HH-PKT-08][OWN-DEC-171] Owner extensions: a reason, an automatic expiry, the Owner only', () => {
  it('only the Owner extends, with a reason and an expiry ahead of at most 24 hours; audited, never a code', async () => {
    const p = await project()
    const jobId = await approve(p)
    const v = await bookedVisit(p, dayIn(EASTERN, 7), 'cy')
    const soon = new Date(Date.now() + 3_600_000)
    expect((await extend('office', v.id, 'cy', soon)).statusCode).toBe(403)
    expect((await extend('cy', v.id, 'cy', soon)).statusCode).toBe(403)
    const past = await extend('owner', v.id, 'cy', new Date(Date.now() - 1_000))
    expect(errorCodes(past.body)).toEqual([['body.expiresAt', 'EXPIRY_IN_PAST']])
    const far = await extend('owner', v.id, 'cy', new Date(Date.now() + 25 * 3_600_000))
    expect(errorCodes(far.body)).toEqual([['body.expiresAt', 'EXPIRY_TOO_FAR']])
    const blank = await extend('owner', v.id, 'cy', soon, '   ')
    expect(blank.statusCode).toBe(400)
    const other = await extend('owner', v.id, 'ben', soon)
    expect(errorCodes(other.body)).toEqual([['body.staffUserId', 'NOT_ASSIGNED']])
    expect((await packet('cy', jobId)).access.mode).toBe('closed')

    const ok = await extend('owner', v.id, 'cy', soon, 'Synthetic: the customer asked for an early start')
    expect(ok.statusCode, ok.body).toBe(201)
    const seen = await packet('cy', jobId)
    expect(seen.access).toMatchObject({ mode: 'visit_day', basis: 'extension' })
    expect(seen.access.endsAt).toBe(soon.toISOString())
    expect(seen.site.address?.street).toBe(p.street)
    expect(seen.customer.firstName).toBe('Rosalind')
    // The Reveal button is offered by the same rule the reveal is decided with.
    expect(seen.actions.revealAccessCodes).toBe(true)
    expect((await reveal('cy', p, await codeIdOf(p))).statusCode).toBe(200)
    const events = await t.db
      .selectFrom('platform.audit_events')
      .select(['action', 'actor_id', 'target_id', 'reason', 'summary'])
      .where('action', '=', 'visit.extend_worker_access')
      .where('target_id', '=', v.id)
      .execute()
    expect(events).toEqual([
      expect.objectContaining({
        actor_id: ids.owner,
        reason: 'Synthetic: the customer asked for an early start',
      }),
    ])
    expectNoVisitDayData(JSON.stringify(events), p)
    // The database keeps the rule too: nobody but a live Owner records one, and none is ever deleted.
    const row = await t.db
      .selectFrom('work.visit_access_extensions')
      .selectAll()
      .where('visit_id', '=', v.id)
      .executeTakeFirstOrThrow()
    await expect(t.db.deleteFrom('work.visit_access_extensions').where('id', '=', row.id).execute()).rejects.toThrow(
      /never deleted/,
    )
    await expect(
      t.db
        .updateTable('work.visit_access_extensions')
        .set({ expires_at: new Date(Date.now() + 20 * 3_600_000) })
        .where('id', '=', row.id)
        .execute(),
    ).rejects.toThrow(/never changes/)
    await expect(
      t.db
        .insertInto('work.visit_access_extensions')
        .values({ ...row, id: randomUUID(), granted_by: ids.office, ended_at: null })
        .execute(),
    ).rejects.toThrow(/only the Owner/)

    // The Owner ends it early, with a reason: the access falls back to the visit day at once.
    const ended = await staffWrite('owner', 'POST', `/api/v1/staff/visit-access-extensions/${row.id}/end`, {
      reason: 'Synthetic: no longer needed',
    })
    expect(ended.statusCode, ended.body).toBe(200)
    expect((await packet('cy', jobId)).access.mode).toBe('closed')
    expect((await reveal('cy', p, await codeIdOf(p))).statusCode).toBe(403)
    const again = await staffWrite('owner', 'POST', `/api/v1/staff/visit-access-extensions/${row.id}/end`, {
      reason: 'Synthetic: twice',
    })
    expect(errorCodes(again.body)).toEqual([['state', 'EXTENSION_NOT_ACTIVE']])
    expect((await workerAccess('owner', v.id)).extensions).toEqual([
      expect.objectContaining({ state: 'ended', endReason: 'Synthetic: no longer needed' }),
    ])
  })

  it('an extension expires on its own: the next request after its expiry shows nothing', async () => {
    const p = await project()
    const jobId = await approve(p)
    const v = await bookedVisit(p, dayIn(EASTERN, 8), 'ben')
    const expiresAt = new Date(Date.now() + 2_500)
    expect((await extend('owner', v.id, 'ben', expiresAt)).statusCode).toBe(201)
    expect((await packet('ben', jobId)).site.address?.street).toBe(p.street)
    while (Date.now() <= expiresAt.getTime() + 50) await new Promise((r) => setTimeout(r, 100))
    const after = await staffGet('ben', `/api/v1/staff/jobs/${jobId}/packet`)
    expect(after.statusCode, after.body).toBe(200)
    expect(after.json<Packet>().access.mode).toBe('closed')
    expectNoVisitDayData(after.body, p)
    expect((await reveal('ben', p, await codeIdOf(p))).statusCode).toBe(403)
    expect((await workerAccess('owner', v.id)).extensions.map((x) => x.state)).toEqual(['expired'])
  })
})
