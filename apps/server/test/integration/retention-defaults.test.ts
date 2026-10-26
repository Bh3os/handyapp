// The provisional retention defaults against PostgreSQL 16 (TSK-0138; HH-PRIV-01, HH-DATA-09, HH-STAFF-02, T27,
// ENT-RetentionReview, FACT-RETENTION-SCHEDULE, OWN-DEC-177, OQ-RETENTION-REVIEW, OQ-RETENTION-DEFAULTS-DETAILS,
// RULE-HUMAN-REVIEW). Staff, customers, destinations and links are synthetic (RULE-SYNTHETIC-DATA); nothing reaches a
// provider. Time passing is a later scan clock: each clock is a fixed instant, or the period end the database computes
// from a recorded instant, so no test depends on the time of day or a daylight-saving change.
import { randomUUID } from 'node:crypto'
import { loadServiceSeed, syncServices, withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import { recordConsent } from '../../src/modules/notifications/consent.js'
import { runRetentionScan } from '../../src/modules/retention/index.js'
import { ConfigShapeError, loadConfig, parseValue } from '../../src/platform/config/index.js'
import { FakeObjectStorage } from '../../src/providers/r2/index.js'
import { testConfig } from '../fixtures/env.js'
import { signInWithMfa } from '../fixtures/staff-mfa.js'

const pw = (n: number) => ['synthetic', 'retention', 'defaults', 'passphrase', String(n)].join(' ')
const PEOPLE = ['owner', 'office', 'leaver', 'reporter'] as const
type Person = (typeof PEOPLE)[number]
const ROLE: Record<Person, 'owner' | 'office' | 'worker'> = {
  owner: 'owner',
  office: 'office',
  leaver: 'worker',
  reporter: 'worker',
}
const email = (p: Person) => `${p}-retention-defaults@example.test`
const ZONE = 'America/Kentucky/Louisville'

let t: TestDatabase
let app: FastifyInstance
const ids = {} as Record<Person, string>
const cookies = {} as Record<Person, string>
const csrf = {} as Record<Person, string>

let seq = 0
const key = (what: string) => `synthetic-retention-defaults-${what}-${String(++seq).padStart(6, '0')}`
const get = (who: Person, url: string) =>
  app.inject({ method: 'GET', url: `/api/v1${url}`, headers: { cookie: cookies[who] } })
const write = (who: Person, url: string, payload: unknown) =>
  app.inject({
    method: 'POST',
    url: `/api/v1${url}`,
    payload: payload as object,
    headers: {
      cookie: cookies[who],
      'x-csrf-token': csrf[who],
      'idempotency-key': key('write'),
      'x-forwarded-for': '198.51.100.187',
    },
  })

beforeAll(async () => {
  t = await createTestDatabase()
  await syncServices(t.db, loadServiceSeed())
  app = await buildApp({
    config: testConfig({ TRUST_PROXY_HOPS: '1' }),
    api: { db: t.db, storage: new FakeObjectStorage() },
  })
  const hash = await hashPassword(pw(1))
  await withTx(t.db, async (tx) => {
    for (const p of PEOPLE) {
      const user = await createStaffUser(tx, {
        email: email(p),
        displayName: `Synthetic defaults ${p}`,
        locale: 'en',
        role: ROLE[p],
        issuedBy: 'test',
      })
      await setPasswordHash(tx, user.id, hash)
      ids[p] = user.id
    }
  })
  for (const p of PEOPLE) {
    const res = await signInWithMfa(app, {
      method: 'POST',
      url: '/api/v1/staff/auth/sign-in',
      headers: { 'x-forwarded-for': '198.51.100.187' },
      payload: { email: email(p), password: pw(1) },
    })
    expect(res.statusCode, res.body).toBe(200)
    cookies[p] = String(res.headers['set-cookie']).split(';')[0] as string
    csrf[p] = res.json().csrfToken as string
  }
})
afterAll(async () => {
  await app?.close()
  await t?.drop()
})

const scan = (now: Date) => withTx(t.db, (tx) => runRetentionScan(tx, { now, requestId: `req-${key('scan')}` }))
const entriesFor = (recordId: string) =>
  t.db.selectFrom('privacy.retention_reviews').selectAll().where('record_id', '=', recordId).orderBy('seq').execute()
const count = async (table: string, column: string, id: string) =>
  Number(
    (
      await sql<{
        n: string
      }>`SELECT count(*)::text AS n FROM ${sql.table(table)} WHERE ${sql.ref(column)}::text = ${id}`.execute(t.db)
    ).rows[0]?.n,
  )
/** A recorded instant plus calendar years in the business time zone, as the database computes it. */
async function zonedYearsAfter(instant: Date, years: number): Promise<Date> {
  const { rows } = await sql<{ end: Date }>`
    SELECT ((${instant}::timestamptz AT TIME ZONE ${ZONE}) + make_interval(years => ${years})) AT TIME ZONE ${ZONE}
      AS end`.execute(t.db)
  return new Date((rows[0] as { end: Date }).end)
}
const before = (d: Date) => new Date(d.getTime() - 1)
/** A recorded instant keeps microseconds, a JavaScript Date only milliseconds: the first clock at or past it. */
const atOrAfter = (d: Date) => new Date(d.getTime() + 1)

/** A synthetic request through the public API: its contact's email and phone are then on file. */
async function newRequest() {
  const n = ++seq
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/public/requests',
    headers: { 'idempotency-key': key('submit'), 'x-forwarded-for': `198.51.100.${100 + (n % 50)}` },
    payload: {
      formVersion: 'test-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-01' }],
      notSure: false,
      description: 'Synthetic retention defaults project.',
      answers: [],
      property: { street: `${n} Synthetic Lane`, city: 'Testville', state: 'ky', zip: '40000', propertyType: 'house' },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'site_visit',
      contact: {
        fullName: `Synthetic Defaults Customer ${n}`,
        email: `defaults-customer-${n}@example.test`,
        phone: '(502) 555-0142',
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
    .select(['id', 'project_id'])
    .where('reference', '=', reference)
    .executeTakeFirstOrThrow()
  return { id: row.id, projectId: row.project_id, email: `defaults-customer-${n}@example.test` }
}

type Preview = { target: { record: { type: string }; exists: boolean; blockers: string[]; checks: unknown[] } }

describe('the provisional defaults as configuration (TSK-0138, OWN-DEC-177, RULE-DECIDED-VALUES-ACTIVE)', () => {
  it('[HH-PRIV-01][HH-DATA-09] the five defaults are seeded active, citing the decision and the open review', async () => {
    const config = await loadConfig(t.db)
    const expected = {
      'retention.staff_accounts': { years: 7, after: 'staff_departure', automaticDeletion: false },
      'retention.consent_records': { years: 5, after: 'last_relevant_use', automaticDeletion: false },
      'retention.settings_history': { keep: 'while_retained_records_depend_on_it', automaticDeletion: false },
      'retention.technical_logs': { days: 90, after: 'logged', securityEvidenceKeptLonger: true },
      'retention.sessions_and_links': { days: 30, after: 'expired_or_ended', automaticDeletion: false },
    } as const
    for (const [k, value] of Object.entries(expected)) {
      const entry = config.get(k as keyof typeof expected)
      expect(entry.state, k).toBe('CONFIGURED')
      if (entry.state !== 'CONFIGURED') continue
      expect(entry.value, k).toMatchObject(value)
      expect(entry.proposed, k).toBe(false)
      expect(entry.sourceIds, k).toEqual(['OWN-DEC-177', 'FACT-RETENTION-SCHEDULE', 'OQ-RETENTION-REVIEW'])
    }
    // No shape accepts an automatic deletion or a shorter review threshold.
    const staff = {
      years: 7,
      after: 'staff_departure',
      afterPeriod: 'owner_deletion_review',
      automaticDeletion: false,
      holdsKeepRecords: true,
    }
    for (const bad of [
      { ...staff, years: 6 },
      { ...staff, automaticDeletion: true },
      { ...staff, afterPeriod: 'delete' },
    ])
      expect(() => parseValue('retention.staff_accounts', bad)).toThrow(ConfigShapeError)
    expect(() =>
      parseValue('retention.settings_history', {
        keep: 'while_retained_records_depend_on_it',
        immutableWhileReferenced: true,
        unreferencedAfter: 'owner_deletion_review',
        automaticDeletion: true,
        holdsKeepRecords: true,
      }),
    ).toThrow(ConfigShapeError)
  })

  it('[HH-PRIV-01] the Owner sees each default with its period, what starts it and whether the review lists it', async () => {
    const res = await get('owner', '/staff/retention')
    expect(res.statusCode, res.body).toBe(200)
    const categories = res.json<{ categories: { id: string }[] }>().categories
    const of = (id: string) => categories.find((c) => c.id === id)
    expect(of('staff_accounts')).toMatchObject({ scan: 'scanned', years: 7, days: null, after: 'staff_departure' })
    expect(of('consent_records')).toMatchObject({ scan: 'scanned', years: 5, after: 'last_relevant_use' })
    expect(of('sessions_and_links')).toMatchObject({
      scan: 'scanned',
      years: null,
      days: 30,
      after: 'expired_or_ended',
    })
    expect(of('technical_logs')).toMatchObject({ scan: 'not_stored', state: 'CONFIGURED', days: 90, after: 'logged' })
    expect(of('settings_history')).toMatchObject({
      scan: 'while_referenced',
      state: 'CONFIGURED',
      years: null,
      days: null,
      after: null,
    })
    // The kinds OWN-DEC-177 leaves without a period stay NOT CONFIGURED.
    expect(of('not_scheduled')).toMatchObject({ configKey: null, state: null, years: null })
    expect((await get('office', '/staff/retention')).statusCode).toBe(403)
  })
})

describe('staff accounts: 7 years after departure (TSK-0138, OWN-DEC-177, HH-STAFF-02)', () => {
  it('[HH-PRIV-01][HH-DATA-09][HH-STAFF-02][T27] offboarding ends access at once; the account enters the review 7 years later, kept', async () => {
    const off = await write('owner', `/staff/members/${ids.leaver}/disable`, { reason: 'Synthetic offboarding.' })
    expect(off.statusCode, off.body).toBe(200)
    expect(off.json()).toMatchObject({ member: { status: 'disabled', liveSessions: 0, passwordSet: false } })
    // T27: the next server call of the still-open session fails.
    expect((await get('leaver', '/staff/auth/session')).statusCode).toBe(401)

    const u = await t.db
      .selectFrom('identity.staff_users')
      .select(['disabled_at', 'email', 'status'])
      .where('id', '=', ids.leaver)
      .executeTakeFirstOrThrow()
    const ends = await zonedYearsAfter(u.disabled_at as Date, 7)
    await scan(before(ends))
    expect(await entriesFor(ids.leaver)).toEqual([])

    await scan(atOrAfter(ends))
    const [entry, ...others] = await entriesFor(ids.leaver)
    expect(others).toEqual([])
    expect(entry).toMatchObject({
      category: 'staff_accounts',
      record_type: 'staff_account',
      record_ref: ids.leaver.slice(0, 8),
      project_id: null,
      policy_key: 'retention.staff_accounts',
      period_years: 7,
      period_days: null,
      holds_found: false,
      opened_by: 'system.retention',
    })
    expect(new Date(entry?.retention_started_at as Date).toISOString()).toBe(
      new Date(u.disabled_at as Date).toISOString(),
    )
    expect(new Date(entry?.period_ends_at as Date).toISOString()).toBe(ends.toISOString())
    expect(entry?.hold_checks).toContainEqual({ check: 'open_holds', result: 'not_applicable' })
    expect(entry?.hold_checks).toContainEqual({ check: 'legal_holds', result: 'not_recorded' })
    // The entry names no personal content; nothing was deleted or changed.
    expect(JSON.stringify(entry)).not.toContain(u.email)
    expect(
      await t.db
        .selectFrom('identity.staff_users')
        .select(['email', 'status'])
        .where('id', '=', ids.leaver)
        .executeTakeFirstOrThrow(),
    ).toEqual({ email: u.email, status: 'disabled' })
    expect(await count('identity.staff_status_changes', 'staff_user_id', ids.leaver)).toBe(1)
    expect(await count('identity.staff_sessions', 'staff_user_id', ids.leaver)).toBeGreaterThan(0)

    // A repeated run opens nothing twice.
    await scan(atOrAfter(ends))
    expect(await entriesFor(ids.leaver)).toHaveLength(1)

    // Archival: Delete is not performed for this kind (no irreversible deletion before the CPA and attorney confirm);
    // the Owner archives the entry and the account stays exactly as it is.
    const preview = await get('owner', `/staff/retention-reviews/${entry?.id}/deletion`)
    expect(preview.statusCode, preview.body).toBe(200)
    expect(preview.json<Preview>().target).toMatchObject({
      record: { type: 'staff_account' },
      exists: true,
      blockers: ['erasure_not_available'],
    })
    const refused = await write('owner', `/staff/retention-reviews/${entry?.id}/delete`, {
      reason: 'Synthetic: past its period.',
      confirmedChecks: [],
    })
    expect(refused.statusCode).toBe(409)
    expect(refused.json<{ error: { fieldErrors: { code: string }[] } }>().error.fieldErrors.map((f) => f.code)).toEqual(
      ['ERASURE_NOT_AVAILABLE'],
    )
    const archived = await write('owner', `/staff/retention-reviews/${entry?.id}/archive`, {
      reason: 'Synthetic: keep the departed account as it is.',
    })
    expect(archived.statusCode, archived.body).toBe(200)
    const listed = await get('owner', '/staff/retention-reviews?category=staff_accounts&status=archived')
    expect(listed.json<{ items: { id: string; years: number | null; days: number | null }[] }>().items).toContainEqual(
      expect.objectContaining({ id: entry?.id, years: 7, days: null }),
    )
    expect(await count('identity.staff_users', 'id', ids.leaver)).toBe(1)
  })

  it('[HH-PRIV-01][HH-DATA-09][HH-STAFF-02] an open case the person reported is a hold; a re-enabled account is in use', async () => {
    const r = await newRequest()
    await t.db
      .insertInto('quality.cases')
      .values({
        project_id: r.projectId,
        kind: 'incident',
        incident_type: 'near_miss',
        source: 'worker_report',
        state: 'reported',
        reported_by: ids.reporter,
        reviewer_id: ids.owner,
      })
      .execute()
    expect((await write('owner', `/staff/members/${ids.reporter}/disable`, { reason: 'Synthetic.' })).statusCode).toBe(
      200,
    )
    const u = await t.db
      .selectFrom('identity.staff_users')
      .select('disabled_at')
      .where('id', '=', ids.reporter)
      .executeTakeFirstOrThrow()
    const ends = await zonedYearsAfter(u.disabled_at as Date, 7)
    await scan(atOrAfter(ends))
    const [entry] = await entriesFor(ids.reporter)
    expect(entry).toMatchObject({ category: 'staff_accounts', holds_found: true })
    expect(entry?.hold_checks).toContainEqual({ check: 'investigations', result: 'found', count: 1 })
    const preview = (await get('owner', `/staff/retention-reviews/${entry?.id}/deletion`)).json<Preview>()
    expect(preview.target.blockers.sort()).toEqual(['erasure_not_available', 'hold_found'])

    // Enabled again: the account is in use, and its earlier entry says so.
    const enabled = await write('owner', `/staff/members/${ids.reporter}/enable`, { reason: 'Synthetic: rehired.' })
    expect(enabled.statusCode, enabled.body).toBe(200)
    const again = (await get('owner', `/staff/retention-reviews/${entry?.id}/deletion`)).json<Preview>()
    expect(again.target.blockers).toContain('record_active')
    await scan(new Date(ends.getTime() + 1000))
    expect(await entriesFor(ids.reporter)).toHaveLength(1)
  })
})

describe('consent records: 5 years after the last relevant use (TSK-0138, OWN-DEC-177, ENT-ConsentPreference)', () => {
  const consent = (destination: string, granted: boolean, at: string, purpose = 'transactional_sms' as const) =>
    withTx(t.db, (tx) =>
      recordConsent(tx, {
        purpose,
        channel: 'sms',
        destination,
        granted,
        source: granted ? 'portal' : 'sms_keyword',
        recordedBy: 'system:test',
        ...(granted ? { disclosureVersion: 'test-sms-disclosure' } : { evidence: { keyword: 'STOP' } }),
        at: new Date(at),
      }),
    )
  const latestId = async (destination: string) =>
    (
      await t.db
        .selectFrom('platform.consent_records')
        .select('id')
        .where('destination', '=', destination)
        .orderBy('seq', 'desc')
        .executeTakeFirstOrThrow()
    ).id

  it('[HH-PRIV-01][HH-DATA-09] a withdrawal starts the period; the history is reviewed, never deleted, then archived', async () => {
    const phone = '+15025550188'
    await consent(phone, true, '2026-03-01T15:00:00.000Z')
    // The withdrawal lands just after the 2026 spring-forward: 03:30 local daylight time.
    await consent(phone, false, '2026-03-08T07:30:00.000Z')
    const id = await latestId(phone)
    // Five calendar years in the business time zone: 2031-03-08 03:30 local, which is standard time then.
    const ends = new Date('2031-03-08T08:30:00.000Z')
    await scan(before(ends))
    expect(await entriesFor(id)).toEqual([])
    await scan(ends)
    const [entry] = await entriesFor(id)
    expect(entry).toMatchObject({
      category: 'consent_records',
      record_type: 'consent_history',
      policy_key: 'retention.consent_records',
      period_years: 5,
      record_count: 2,
      holds_found: false,
    })
    expect(entry?.record_ref).toMatch(/^Consent #\d+ transactional_sms by sms, withdrawn$/)
    expect(new Date(entry?.retention_started_at as Date).toISOString()).toBe('2026-03-08T07:30:00.000Z')
    expect(new Date(entry?.period_ends_at as Date).toISOString()).toBe(ends.toISOString())
    expect(JSON.stringify(entry)).not.toContain('5550188')
    expect(await count('platform.consent_records', 'destination', phone)).toBe(2)

    const archived = await write('owner', `/staff/retention-reviews/${entry?.id}/archive`, {
      reason: 'Synthetic: keep the withdrawal evidence.',
    })
    expect(archived.statusCode, archived.body).toBe(200)
    expect(archived.json()).toMatchObject({ status: { state: 'archived' } })
    expect(await count('platform.consent_records', 'destination', phone)).toBe(2)
  })

  it('[HH-PRIV-01] never while the permission is granted again, or while the destination is on file', async () => {
    const regranted = '+15025550177'
    await consent(regranted, true, '2026-03-01T15:00:00.000Z')
    await consent(regranted, false, '2026-03-02T15:00:00.000Z')
    await consent(regranted, true, '2026-03-03T15:00:00.000Z')
    const r = await newRequest()
    await withTx(t.db, (tx) =>
      recordConsent(tx, {
        purpose: 'marketing',
        channel: 'email',
        destination: r.email,
        granted: false,
        source: 'portal',
        recordedBy: 'system:test',
        at: new Date('2026-03-04T15:00:00.000Z'),
      }),
    )
    await scan(new Date('2032-06-01T12:00:00.000Z'))
    expect(await entriesFor(await latestId(regranted))).toEqual([])
    // The withdrawal still stops marketing to a contact on file: it is in use, so not due.
    expect(await entriesFor(await latestId(r.email))).toEqual([])
  })
})

describe('expired sessions and access links: 30 days after they ended (TSK-0138, OWN-DEC-177)', () => {
  it('[HH-PRIV-01][HH-DATA-09] the links that ended in one month make one entry 30 days after it; nothing is deleted', async () => {
    const link = (createdAt: string, expiresAt: string, consumedAt: string | null) =>
      t.db
        .insertInto('identity.staff_links')
        .values({
          staff_user_id: ids.office,
          purpose: 'reset',
          token_hash: Buffer.from(randomUUID()).toString('hex').slice(0, 64).padEnd(64, '0'),
          issued_by: 'test',
          delivered_at: createdAt,
          created_at: createdAt,
          expires_at: expiresAt,
          consumed_at: consumedAt,
        })
        .returning('id')
        .executeTakeFirstOrThrow()
    // One expired unused in January 2025; one used in January although it would have expired in February; one that
    // ended in February.
    await link('2025-01-10T12:00:00.000Z', '2025-01-11T12:00:00.000Z', null)
    await link('2025-01-30T12:00:00.000Z', '2025-02-02T12:00:00.000Z', '2025-01-31T12:00:00.000Z')
    await link('2025-02-10T12:00:00.000Z', '2025-02-11T12:00:00.000Z', null)
    const rows = () => t.db.selectFrom('identity.staff_links').select('id').where('issued_by', '=', 'test').execute()
    expect(await rows()).toHaveLength(3)
    const batch = () =>
      t.db
        .selectFrom('privacy.retention_reviews')
        .selectAll()
        .where('record_type', '=', 'expired_staff_links')
        .where('record_ref', 'like', '2025-%')
        .orderBy('seq')
        .execute()

    // January ends at local midnight (05:00 UTC); 30 calendar days later is 3 March, still standard time.
    const ends = new Date('2025-03-03T05:00:00.000Z')
    await scan(before(ends))
    expect(await batch()).toEqual([])
    await scan(ends)
    const [entry, ...others] = await batch()
    expect(others).toEqual([])
    expect(entry).toMatchObject({
      category: 'sessions_and_links',
      record_ref: '2025-01 (2)',
      project_id: null,
      policy_key: 'retention.sessions_and_links',
      period_years: null,
      period_days: 30,
      record_count: 2,
      holds_found: false,
    })
    expect(new Date(entry?.retention_started_at as Date).toISOString()).toBe('2025-01-01T05:00:00.000Z')
    expect(new Date(entry?.period_ends_at as Date).toISOString()).toBe(ends.toISOString())
    // A repeated run opens nothing twice; February follows once its 30 days have passed.
    await scan(ends)
    expect(await batch()).toHaveLength(1)
    await scan(new Date('2025-03-31T04:00:00.000Z'))
    expect((await batch()).map((b) => b.record_ref)).toEqual(['2025-01 (2)', '2025-02 (1)'])
    // Nothing was deleted or changed; Delete is not performed for this kind.
    expect(await rows()).toHaveLength(3)
    const preview = (await get('owner', `/staff/retention-reviews/${entry?.id}/deletion`)).json<Preview>()
    expect(preview.target).toMatchObject({
      record: { type: 'expired_staff_links' },
      blockers: ['erasure_not_available'],
    })
    const listed = await get('owner', '/staff/retention-reviews?category=sessions_and_links')
    expect(listed.json<{ items: { id: string; days: number | null; count: number | null }[] }>().items).toContainEqual(
      expect.objectContaining({ id: entry?.id, days: 30, count: 2 }),
    )
  })
})
