// The time-zone policy against PostgreSQL 16 (TSK-0123; OWN-DEC-159, FACT-TIMEZONE, HH-SCH-02, HH-DATA-06, HH-COM-15,
// T41, ENT-Property, RULE-SERVER-AUTHZ, RULE-NO-INVENTED-FACTS). Staff, customers, requests, ZIP codes, counties and
// county lists are synthetic (RULE-SYNTHETIC-DATA): the 999xx ZIPs do not exist, and the county list recorded here is
// a test configuration in this throwaway database, never a statement about which real county uses which zone.
// - The daylight-saving dates are found from each zone itself (the next fall-back and spring-forward after now), so the
//   windows are always in the future and nothing depends on this machine's zone.
// - No estimate terms version is recorded by the migrations (OQ-TERMS-OWNER-APPROVAL); to publish an estimate this test
//   records a synthetic "approved" terms version in this test database only, as the approval tests do.
import { randomUUID } from 'node:crypto'
import { loadServiceSeed, syncServices, withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import { addLocalDays, localClockOf, localDateOf, offsetChanges } from '@handyhub/domain'
import { ESTIMATE_TERMS } from '@handyhub/domain/legal'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { startCustomerSession } from '../../src/modules/identity/customer-sessions.js'
import { readCodeKey, type CodeKeySettings } from '../../src/modules/identity/index.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import { recipientTextHours, recipientTimeZone } from '../../src/modules/notifications/index.js'
import { appointmentReminderDueAt } from '../../src/modules/visits/reminders.js'
import { loadConfig, recordPolicyVersion, type ConfigKey } from '../../src/platform/config/index.js'
import { FakeObjectStorage } from '../../src/providers/r2/index.js'
import { DATASET_ZIPS, SYNTHETIC_ZIPS } from '../fixtures/coverage.js'
import { testConfig } from '../fixtures/env.js'

const EASTERN = 'America/Kentucky/Louisville'
const CENTRAL = 'America/Chicago'
const MIN = 60_000
const DAY = 24 * 60 * MIN
const KEY: CodeKeySettings = readCodeKey({
  HANDYHUB_ENV: 'ci',
  CODE_HASH_KEY: ['synthetic', 'time', 'zone', 'policy', 'code', 'key', 'for', 'tests', '0123'].join('-'),
})
const pw = ['synthetic', 'time', 'zone', 'passphrase', '123'].join(' ')
const PEOPLE = ['owner', 'office', 'estimator', 'worker'] as const
type Person = (typeof PEOPLE)[number]

/** The next clock changes of a zone after now, in local terms (gap: half an hour in; repeated: half an hour in). */
function dstOf(zone: string) {
  const changes = offsetChanges(zone, new Date(), new Date(Date.now() + 400 * DAY))
  const fall = changes.find((c) => c.offsetAfter < c.offsetBefore)
  const spring = changes.find((c) => c.offsetAfter > c.offsetBefore)
  if (!fall || !spring) throw new Error(`${zone} must observe daylight saving time for these tests`)
  const clock = (ms: number) => new Date(ms).toISOString().slice(11, 16)
  return {
    fall,
    spring,
    fallDate: localDateOf(fall.at, zone),
    repeated: localClockOf(new Date(fall.at.getTime() - 30 * MIN), zone),
    springDate: localDateOf(spring.at, zone),
    gap: clock(spring.at.getTime() + spring.offsetBefore * MIN + 30 * MIN),
    gapFrom: clock(spring.at.getTime() + spring.offsetBefore * MIN),
    gapTo: clock(spring.at.getTime() + spring.offsetAfter * MIN),
  }
}
const wallUtc = (date: string, time: string, offsetMinutes: number) =>
  new Date(Date.parse(`${date}T${time}:00Z`) - offsetMinutes * MIN).toISOString()

let t: TestDatabase
let app: FastifyInstance
const cookies = {} as Record<Person, string>
const csrf = {} as Record<Person, string>

async function setConfig(key: ConfigKey, value: unknown) {
  await recordPolicyVersion(t.db, {
    key,
    value: value as never,
    sourceIds: ['TEST-SYNTHETIC'],
    changedBy: 'test',
    reason: 'synthetic test configuration',
  })
}

beforeAll(async () => {
  t = await createTestDatabase()
  await syncServices(t.db, loadServiceSeed())
  app = await buildApp({
    config: testConfig({ TRUST_PROXY_HOPS: '1' }),
    api: { db: t.db, codeKey: KEY, storage: new FakeObjectStorage() },
  })
  const hash = await hashPassword(pw)
  await withTx(t.db, async (tx) => {
    for (const p of PEOPLE) {
      const user = await createStaffUser(tx, {
        email: `${p}-zones@example.test`,
        displayName: `Synthetic ${p}`,
        locale: p === 'office' ? 'es' : 'en',
        role: p,
        issuedBy: 'test',
      })
      await setPasswordHash(tx, user.id, hash)
    }
  })
  for (const p of PEOPLE) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/staff/auth/sign-in',
      headers: { 'x-forwarded-for': '198.51.100.123' },
      payload: { email: `${p}-zones@example.test`, password: pw },
    })
    expect(res.statusCode, res.body).toBe(200)
    cookies[p] = String(res.headers['set-cookie']).split(';')[0] as string
    const session = await app.inject({
      method: 'GET',
      url: '/api/v1/staff/auth/session',
      headers: { cookie: cookies[p] },
    })
    csrf[p] = session.json<{ csrfToken: string }>().csrfToken
  }
})
afterAll(async () => {
  await app?.close()
  await t?.drop()
})

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
const fieldCodes = (body: string) =>
  JSON.parse(body).error.fieldErrors.map((f: { field: string; code: string }) => [f.field, f.code])

type Project = {
  requestId: string
  projectId: string
  propertyId: string
  reference: string
  contactId: string
  customerId: string
  grantId: string
}
let ip = 10
async function submit(zip = '40000', state = 'ky'): Promise<Project> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/public/requests',
    headers: { 'idempotency-key': key('submit'), 'x-forwarded-for': `198.51.100.${++ip}` },
    payload: {
      formVersion: 'test-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-01' }],
      notSure: false,
      description: 'Synthetic time-zone project.',
      answers: [],
      property: { street: `${seq} Synthetic Zone Lane`, city: 'Testville', state, zip, propertyType: 'house' },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'site_visit',
      contact: {
        fullName: 'Synthetic Zone Customer',
        email: `zones-${seq}-${randomUUID().slice(0, 8)}@example.test`,
        phone: '(502) 555-0123',
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
    .select(['id', 'project_id', 'property_id', 'contact_id', 'customer_id'])
    .where('reference', '=', reference)
    .executeTakeFirstOrThrow()
  const grant = await t.db
    .selectFrom('identity.project_access_grants')
    .select('id')
    .where('request_id', '=', row.id)
    .executeTakeFirstOrThrow()
  return {
    requestId: row.id,
    projectId: row.project_id,
    propertyId: row.property_id,
    reference,
    contactId: row.contact_id,
    customerId: row.customer_id,
    grantId: grant.id,
  }
}

type ZoneView = {
  version: number
  timeZone: string | null
  zone: {
    zone: string | null
    status: string
    basis: string
    family: string | null
    counties: string[]
    version: number
  }
  zoneHistory: {
    version: number
    zone: string | null
    status: string
    basis: string
    previousZone: string | null
    reason: string | null
  }[]
  actions: { verifyTimeZone: boolean }
}
const property = async (id: string, who: Person = 'office') => {
  const res = await staffGet(who, `/api/v1/staff/properties/${id}`)
  expect(res.statusCode, res.body).toBe(200)
  return res.json<ZoneView>()
}
async function verify(p: Project, zone: string, county = 'Synthetic', who: Person = 'office') {
  const v = await property(p.propertyId)
  return staffWrite(
    who,
    'PUT',
    `/api/v1/staff/properties/${p.propertyId}/time-zone`,
    { timeZone: zone, county, reason: 'Synthetic: county read from the verified address' },
    v.version,
  )
}
const queueItem = (propertyId: string) =>
  t.db
    .selectFrom('ops.queue_items')
    .select(['type', 'reason', 'band', 'resolved_at', 'resolution', 'project_id', 'reference'])
    .where('type', '=', 'property_time_zone')
    .where('subject_id', '=', propertyId)
    .orderBy('opened_at')
    .execute()

type Win = {
  localDate: string
  start: string
  end: string
  timeZone: string
  startOffset: string
  startsAt: string
  endsAt: string
}
type Visits = {
  timeZone: string | null
  businessTimeZone: { zone: string; proposed: boolean } | null
  actions: { planEstimateVisit: boolean }
  visits: { id: string; version: number; window: Win; history: { window: Win }[] }[]
}
const visits = async (projectId: string) => {
  const res = await staffGet('office', `/api/v1/staff/projects/${projectId}/visits`)
  expect(res.statusCode, res.body).toBe(200)
  return res.json<Visits>()
}
const plan = (projectId: string, body: Record<string, unknown>) =>
  staffWrite('office', 'POST', `/api/v1/staff/projects/${projectId}/visits`, { purpose: 'site_estimate', ...body })

describe('[OWN-DEC-159][FACT-TIMEZONE] the business zone is decided; county list NOT CONFIGURED', () => {
  it('[OWN-DEC-159][RULE-DECIDED-VALUES-ACTIVE] business.timezone is America/Kentucky/Louisville, no longer PROPOSED', async () => {
    const config = await loadConfig(t.db)
    expect(config.get('business.timezone')).toMatchObject({
      state: 'CONFIGURED',
      proposed: false,
      version: 2,
      value: { zone: EASTERN },
    })
    const rows = await t.db
      .selectFrom('platform.policy_version')
      .select(['version', 'status', 'source_ids', 'proposed'])
      .where('key', '=', 'business.timezone')
      .orderBy('version')
      .execute()
    expect(rows.map((r) => [r.version, r.status, r.proposed])).toEqual([
      [1, 'superseded', true],
      [2, 'active', false],
    ])
    expect(rows[1]?.source_ids).toContain('OWN-DEC-159')
  })

  it('[RULE-NO-INVENTED-FACTS][OQ-COUNTY-TIME-ZONES] no county zone is written; the unknown-zone text window is 9–9 Eastern', async () => {
    const config = await loadConfig(t.db)
    expect(config.get('geo.county_time_zones').state).toBe('NOT_CONFIGURED')
    expect(config.get('sms.unknown_zone_hours')).toMatchObject({
      state: 'CONFIGURED',
      value: { open: '09:00', close: '21:00', zone: EASTERN },
    })
  })
})

describe('[OWN-DEC-159][HH-SCH-02] an unknown property zone is flagged, never assumed Eastern', () => {
  it('[OWN-DEC-159] a new property has no zone, the queue flags it, and no visit is planned on it', async () => {
    const p = await submit()
    const view = await property(p.propertyId)
    expect(view.timeZone).toBeNull()
    expect(view.zone).toMatchObject({ zone: null, status: 'unknown', basis: 'no_zip_rule', family: null, version: 1 })
    expect(view.zoneHistory).toEqual([
      expect.objectContaining({ version: 1, zone: null, status: 'unknown', basis: 'no_zip_rule', previousZone: null }),
    ])
    expect(await queueItem(p.propertyId)).toEqual([
      expect.objectContaining({
        reason: 'time_zone_unknown',
        band: 'other',
        resolved_at: null,
        project_id: p.projectId,
      }),
    ])
    // The office queue lists it, as a property record to open.
    const queue = await staffGet('office', '/api/v1/staff/queue?type=property_time_zone')
    expect(queue.statusCode, queue.body).toBe(200)
    const items = queue.json<{ items: { reference: string; action: string; link: string }[] }>().items
    expect(items.find((i) => i.reference === p.reference)).toMatchObject({
      action: 'verify_time_zone',
      link: `/properties/${p.propertyId}`,
    })
    const v = await visits(p.projectId)
    expect(v).toMatchObject({ timeZone: null, actions: { planEstimateVisit: false } })
    const date = addLocalDays(localDateOf(new Date(), EASTERN), 3)
    const res = await plan(p.projectId, { localDate: date, windowStart: '09:00', windowEnd: '11:00' })
    expect(res.statusCode).toBe(409)
    expect(fieldCodes(res.body)).toEqual([['property.timeZone', 'PROPERTY_ZONE_UNKNOWN']])
    expect(await t.db.selectFrom('work.visits').select('id').where('project_id', '=', p.projectId).execute()).toEqual(
      [],
    )
  })

  it('[RULE-SERVER-AUTHZ][OWN-DEC-159] only supported zones, by the roles that edit the property, with the current version', async () => {
    const p = await submit()
    const v = await property(p.propertyId)
    const url = `/api/v1/staff/properties/${p.propertyId}/time-zone`
    const body = { timeZone: CENTRAL, county: 'Synthetic', reason: 'Synthetic reason' }
    expect((await staffWrite('worker', 'PUT', url, body, v.version)).statusCode).toBe(403)
    expect((await staffWrite('estimator', 'PUT', url, body, v.version)).statusCode).toBe(403)
    expect((await staffWrite('office', 'PUT', url, body, v.version + 5)).statusCode).toBe(409)
    for (const zone of ['America/Phoenix', 'Europe/London', 'UTC/Synthetic']) {
      const bad = await staffWrite('office', 'PUT', url, { ...body, timeZone: zone }, v.version)
      expect(bad.statusCode, zone).toBe(400)
      expect(fieldCodes(bad.body)).toEqual([['body.timeZone', 'ZONE_NOT_SUPPORTED']])
    }
    // An offset or abbreviation is not an IANA zone id at all.
    expect((await staffWrite('office', 'PUT', url, { ...body, timeZone: '-06:00' }, v.version)).statusCode).toBe(400)
    expect((await staffWrite('office', 'PUT', url, { ...body, reason: ' ' }, v.version)).statusCode).toBe(400)
    expect((await property(p.propertyId)).zone.status).toBe('unknown')
    // The database refuses a zone it does not know and a skipped history, whoever writes it.
    await expect(
      t.db
        .updateTable('crm.properties')
        .set({
          time_zone: 'Synthetic/Nowhere',
          time_zone_status: 'verified',
          time_zone_basis: 'verified_county',
          time_zone_version: 2,
        })
        .where('id', '=', p.propertyId)
        .execute(),
    ).rejects.toThrow()
    await expect(
      t.db
        .updateTable('crm.properties')
        .set({
          time_zone: CENTRAL,
          time_zone_status: 'verified',
          time_zone_basis: 'verified_county',
          time_zone_version: 2,
        })
        .where('id', '=', p.propertyId)
        .execute(),
    ).rejects.toThrow(/ZONE_HISTORY/)
    await expect(
      t.db.deleteFrom('crm.property_time_zones').where('property_id', '=', p.propertyId).execute(),
    ).rejects.toThrow()
  })
})

describe('[OWN-DEC-159][T41] Central and Eastern properties, DST gaps and repeated hours', () => {
  let central: Project
  let eastern: Project
  beforeAll(async () => {
    central = await submit('40000', 'in')
    eastern = await submit()
  })

  it('[OWN-DEC-159] Office verifies a Central zone from the county: history, audit and the queue flag resolved', async () => {
    const res = await verify(central, CENTRAL, 'Synthetic County')
    expect(res.statusCode, res.body).toBe(200)
    const view = await property(central.propertyId)
    expect(view.zone).toEqual({
      zone: CENTRAL,
      status: 'verified',
      basis: 'verified_county',
      family: 'central',
      counties: ['IN:Synthetic'],
      version: 2,
    })
    expect(view.zoneHistory.map((h) => [h.version, h.zone, h.status, h.previousZone])).toEqual([
      [2, CENTRAL, 'verified', null],
      [1, null, 'unknown', null],
    ])
    expect(view.zoneHistory[0]?.reason).toBe('Synthetic: county read from the verified address')
    const audit = await t.db
      .selectFrom('platform.audit_events')
      .select(['action', 'summary', 'reason'])
      .where('action', '=', 'property.verify_time_zone')
      .where('target_id', '=', central.propertyId)
      .execute()
    expect(audit).toEqual([
      expect.objectContaining({
        reason: 'Synthetic: county read from the verified address',
        summary: expect.objectContaining({ changed: true, to: { zone: CENTRAL, status: 'verified' } }),
      }),
    ])
    expect(await queueItem(central.propertyId)).toEqual([
      expect.objectContaining({ resolution: 'zone_verified', resolved_at: expect.any(Date) }),
    ])
    // The same verification again changes nothing.
    expect((await verify(central, CENTRAL, 'Synthetic')).statusCode).toBe(200)
    expect((await property(central.propertyId)).zone.version).toBe(2)
    expect((await verify(eastern, EASTERN)).statusCode).toBe(200)
  })

  it('[T41][HH-SCH-02] the Central spring-forward gap is refused; the same local 09:00 is an hour apart in the two zones', async () => {
    const d = dstOf(CENTRAL)
    const gap = await plan(central.projectId, { localDate: d.springDate, windowStart: d.gap, windowEnd: '05:00' })
    expect(gap.statusCode).toBe(400)
    expect(fieldCodes(gap.body)).toEqual([['body.windowStart', 'LOCAL_TIME_GAP']])
    const date = addLocalDays(localDateOf(new Date(), EASTERN), 3)
    const c = await plan(central.projectId, { localDate: date, windowStart: '09:00', windowEnd: '11:00' })
    const e = await plan(eastern.projectId, { localDate: date, windowStart: '09:00', windowEnd: '11:00' })
    expect(c.statusCode, c.body).toBe(201)
    expect(e.statusCode, e.body).toBe(201)
    const cw = (await visits(central.projectId)).visits[0]?.window as Win
    const ew = (await visits(eastern.projectId)).visits[0]?.window as Win
    expect(cw).toMatchObject({ localDate: date, start: '09:00', timeZone: CENTRAL })
    expect(ew).toMatchObject({ localDate: date, start: '09:00', timeZone: EASTERN })
    expect(Date.parse(cw.startsAt) - Date.parse(ew.startsAt)).toBe(60 * MIN)
  })

  it('[T41] a Central repeated hour needs its offset and is stored with it; a move across the change keeps local times', async () => {
    const d = dstOf(CENTRAL)
    const body = { localDate: d.fallDate, windowStart: d.repeated, windowEnd: '03:00' }
    const ask = await plan(central.projectId, body)
    expect(fieldCodes(ask.body)).toEqual([['body.startOffset', 'LOCAL_TIME_REPEATED']])
    const later = `-0${Math.abs(d.fall.offsetAfter) / 60}:00`
    const res = await plan(central.projectId, { ...body, startOffset: later })
    expect(res.statusCode, res.body).toBe(201)
    const row = await t.db
      .selectFrom('work.visits')
      .select(['starts_at', 'start_offset_minutes', 'time_zone'])
      .where('project_id', '=', central.projectId)
      .where('local_date', '=', d.fallDate)
      .executeTakeFirstOrThrow()
    expect(row.time_zone).toBe(CENTRAL)
    expect(row.start_offset_minutes).toBe(d.fall.offsetAfter)
    expect(new Date(row.starts_at).toISOString()).toBe(wallUtc(d.fallDate, d.repeated, d.fall.offsetAfter))
    // A visit planned the day before the fall-back, moved to the day after: same local times, an hour later in UTC.
    const before = addLocalDays(d.fallDate, -1)
    const after = addLocalDays(d.fallDate, 1)
    const planned = await plan(central.projectId, { localDate: before, windowStart: '09:00', windowEnd: '11:00' })
    expect(planned.statusCode, planned.body).toBe(201)
    const { id, version } = (await visits(central.projectId)).visits.find((x) => x.window.localDate === before) as {
      id: string
      version: number
    }
    const moved = await staffWrite(
      'office',
      'POST',
      `/api/v1/staff/visits/${id}/window`,
      { localDate: after, windowStart: '09:00', windowEnd: '11:00', reason: 'Synthetic move across the change' },
      version,
    )
    expect(moved.statusCode, moved.body).toBe(200)
    const v = (await visits(central.projectId)).visits.find((x) => x.id === id)
    expect(v?.window).toMatchObject({ localDate: after, start: '09:00', timeZone: CENTRAL })
    expect(v?.window.startsAt).toBe(wallUtc(after, '09:00', d.fall.offsetAfter))
    expect(v?.history.at(-1)?.window.startsAt).toBe(wallUtc(before, '09:00', d.fall.offsetBefore))
  })

  it('[OWN-DEC-159] a 24-hour reminder delay is elapsed time in a Central property across spring-forward', () => {
    const d = dstOf(CENTRAL)
    const visitStart = new Date(wallUtc(addLocalDays(d.springDate, 0), '10:00', d.spring.offsetAfter))
    const due = appointmentReminderDueAt(visitStart, 24, new Date(visitStart.getTime() - 3 * DAY))
    expect(visitStart.getTime() - due.getTime()).toBe(24 * 60 * MIN)
    expect(localClockOf(due, CENTRAL)).toBe('09:00')
  })
})

describe('[OWN-DEC-159] a zone derived from the ZIP code’s counties, and reset when the address changes', () => {
  // TSK-0127: migration 0067 activates the rule set of the owner's ZIP dataset (OWN-DEC-179), so these tests use its
  // rules (DATASET_ZIPS) rather than importing a synthetic file; a synthetic 999xx ZIP has no rule.

  it('[RULE-NO-INVENTED-FACTS] with no county list nothing is derived', async () => {
    const p = await submit(DATASET_ZIPS.served)
    expect((await property(p.propertyId)).zone).toMatchObject({ status: 'unknown', basis: 'county_map_not_configured' })
  })

  it('[OWN-DEC-159] every county mapped to one zone derives it; a boundary, mailing or unlisted county stays unknown', async () => {
    // A synthetic test configuration: one county of the dataset, mapped for this test only.
    await setConfig('geo.county_time_zones', { counties: [{ state: 'KY', county: 'Jefferson', zone: EASTERN }] })
    const derived = await submit(DATASET_ZIPS.served)
    const view = await property(derived.propertyId)
    expect(view.zone).toEqual({
      zone: EASTERN,
      status: 'derived',
      basis: 'zip_counties',
      family: 'eastern',
      counties: ['KY:Jefferson'],
      version: 1,
    })
    expect(await queueItem(derived.propertyId)).toEqual([])
    const boundary = await submit(DATASET_ZIPS.severalCounties)
    expect((await property(boundary.propertyId)).zone).toMatchObject({ status: 'unknown', basis: 'zip_boundary' })
    const unlisted = await submit(DATASET_ZIPS.servedIndiana, 'in')
    expect((await property(unlisted.propertyId)).zone).toMatchObject({ status: 'unknown', basis: 'county_not_mapped' })
    // TSK-0127 (OWN-DEC-179 rule 8): a PO Box ZIP of a mapped county is a mailing ZIP; it never proves where the
    // property is, so no zone is derived from its county.
    const mailing = await submit(DATASET_ZIPS.poBox)
    expect((await property(mailing.propertyId)).zone).toMatchObject({
      status: 'unknown',
      basis: 'no_zip_rule',
      zone: null,
    })
    const outside = await submit(SYNTHETIC_ZIPS.outside)
    expect((await property(outside.propertyId)).zone).toMatchObject({ status: 'unknown', basis: 'no_zip_rule' })
    // The list naming the county with another zone refuses a verification that disagrees with it.
    const v = await property(derived.propertyId)
    const res = await staffWrite(
      'office',
      'PUT',
      `/api/v1/staff/properties/${derived.propertyId}/time-zone`,
      { timeZone: CENTRAL, county: 'Jefferson County', reason: 'Synthetic' },
      v.version,
    )
    expect(res.statusCode).toBe(400)
    expect(fieldCodes(res.body)).toEqual([['body.timeZone', 'ZONE_COUNTY_MISMATCH']])
    expect(await queueItem(boundary.propertyId)).toEqual([expect.objectContaining({ resolved_at: null })])
  })

  it('[OWN-DEC-159][HH-CRM-02] an address change derives the zone again: a verified zone no longer holds', async () => {
    const p = await submit(SYNTHETIC_ZIPS.unlisted)
    expect((await verify(p, EASTERN, 'Synthetic')).statusCode).toBe(200)
    const before = await property(p.propertyId)
    const moved = await staffWrite(
      'owner',
      'PUT',
      `/api/v1/staff/properties/${p.propertyId}/address`,
      {
        street: '9 Synthetic Moved Lane',
        city: 'Testville',
        state: 'KY',
        zip: DATASET_ZIPS.severalCounties,
        source: 'customer_call',
        reason: 'Synthetic: the customer gave a new address',
      },
      before.version,
    )
    expect(moved.statusCode, moved.body).toBe(200)
    const after = await property(p.propertyId)
    expect(after.zone).toMatchObject({ zone: null, status: 'unknown', basis: 'zip_boundary', version: 3 })
    expect(after.zoneHistory.map((h) => [h.version, h.status, h.previousZone])).toEqual([
      [3, 'unknown', EASTERN],
      [2, 'verified', null],
      [1, 'unknown', null],
    ])
    // Flagged again (a new item: the resolved one is history).
    const items = await queueItem(p.propertyId)
    expect(items.map((i) => i.resolution)).toEqual(['zone_verified', null])
  })
})

describe('[HH-COM-15][OWN-DEC-159] a text recipient’s own zone', () => {
  it('[HH-COM-15] unknown by default (never the property’s zone): the 9 AM–9 PM Eastern fallback window applies', async () => {
    const p = await submit('40000', 'in')
    expect((await verify(p, CENTRAL)).statusCode).toBe(200)
    expect(await recipientTimeZone(t.db, p.contactId)).toEqual({ state: 'unknown' })
    expect(await recipientTextHours(t.db, p.contactId, await loadConfig(t.db))).toEqual({
      recipient: { state: 'unknown' },
      window: { open: '09:00', close: '21:00', zone: EASTERN, basis: 'unknown_zone_fallback' },
    })
    const customer = await staffGet('office', `/api/v1/staff/customers/${p.customerId}`)
    expect(customer.json<{ contacts: { timeZone: unknown }[] }>().contacts[0]?.timeZone).toEqual({
      state: 'unknown',
      zone: null,
      family: null,
    })
  })

  it('[HH-COM-15][RULE-SERVER-AUTHZ] staff record the contact’s zone with a reason; it then sets the text window', async () => {
    const p = await submit()
    const url = `/api/v1/staff/customers/${p.customerId}/contacts/${p.contactId}/time-zone`
    const version = async () =>
      (await staffGet('office', `/api/v1/staff/customers/${p.customerId}`)).json<{ contacts: { version: number }[] }>()
        .contacts[0]?.version as number
    const body = { timeZone: CENTRAL, reason: 'Synthetic: the customer said they live in Central time' }
    expect((await staffWrite('worker', 'PUT', url, body, await version())).statusCode).toBe(403)
    const bad = await staffWrite('office', 'PUT', url, { ...body, timeZone: 'America/Denver' }, await version())
    expect(fieldCodes(bad.body)).toEqual([['body.timeZone', 'ZONE_NOT_SUPPORTED']])
    const ok = await staffWrite('office', 'PUT', url, body, await version())
    expect(ok.statusCode, ok.body).toBe(200)
    expect(await recipientTimeZone(t.db, p.contactId)).toEqual({ state: 'known', zone: CENTRAL, family: 'central' })
    expect((await recipientTextHours(t.db, p.contactId, await loadConfig(t.db)))?.window).toEqual({
      open: '08:00',
      close: '22:00',
      zone: CENTRAL,
      basis: 'recipient_zone',
    })
    const change = await t.db
      .selectFrom('crm.record_changes')
      .select(['fields', 'previous', 'current', 'reason'])
      .where('record_id', '=', p.contactId)
      .executeTakeFirstOrThrow()
    expect(change).toEqual({
      fields: ['timeZone'],
      previous: { timeZone: null },
      current: { timeZone: CENTRAL },
      reason: body.reason,
    })
    const cleared = await staffWrite(
      'office',
      'PUT',
      url,
      { timeZone: null, reason: 'Synthetic: not sure' },
      await version(),
    )
    expect(cleared.statusCode).toBe(200)
    expect(await recipientTimeZone(t.db, p.contactId)).toEqual({ state: 'unknown' })
  })
})

describe('[OWN-DEC-159][FACT-ESTIMATE-VALIDITY] estimate validity: business time computed, property zone shown', () => {
  async function publish(p: Project) {
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
            description: 'Patch the synthetic hole',
            quantity: '1',
            unit: 'patch',
            unitPriceCents: 1250,
          },
        ],
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
    const s = await withTx(t.db, (tx) =>
      startCustomerSession(tx, {
        contactRef: p.contactId,
        via: 'grant',
        projectIds: [p.projectId],
        verifiedAt: new Date(),
        grantId: p.grantId,
      }),
    )
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/customer/projects/${p.reference}/estimates/${c.number}/versions/1`,
      headers: { cookie: `__Host-hh_customer=${s.token}` },
    })
    expect(res.statusCode, res.body).toBe(200)
    return res.json<{ validUntil: string; validUntilZone: { zone: string; business: boolean } | null }>()
  }

  it('[OWN-DEC-159][HH-DATA-06] the expiry is the end of a business-time day, shown in the property’s zone or as business time', async () => {
    await setConfig('legal.estimate_terms', {
      documentId: ESTIMATE_TERMS.documentId,
      status: 'approved',
      attorneyReviewed: true,
      preparedOn: ESTIMATE_TERMS.preparedOn,
      contentSha256: ESTIMATE_TERMS.contentSha256,
    })
    const centralProject = await submit('40000', 'in')
    expect((await verify(centralProject, CENTRAL)).statusCode).toBe(200)
    const shown = await publish(centralProject)
    expect(shown.validUntilZone).toEqual({ zone: CENTRAL, business: false })
    // Business time: the last millisecond of a day in America/Kentucky/Louisville (23:59 there, 22:59 in Central).
    const end = new Date(Date.parse(shown.validUntil) + 1)
    expect(localClockOf(end, EASTERN)).toBe('00:00')
    expect(localClockOf(new Date(shown.validUntil), CENTRAL)).toBe('22:59')
    const unknown = await submit()
    expect((await publish(unknown)).validUntilZone).toEqual({ zone: EASTERN, business: true })
  })
})
