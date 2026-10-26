// The decided preferred-window hours against PostgreSQL 16 (TSK-0139; OWN-DEC-170, FACT-WINDOW-HOURS, HH-INT-02,
// OWN-DEC-159, T09, T41, ENT-Request, RULE-DECIDED-VALUES-ACTIVE, RULE-SERVER-AUTHZ). Staff, customers, requests,
// addresses and counties are synthetic (RULE-SYNTHETIC-DATA): the county named when a zone is verified is a test
// input in this throwaway database, never a statement about which real county uses which zone.
// - Dates are found from now and from the zones themselves (the next weekend day, the next clock changes at least two
//   days ahead), so nothing depends on the time of day, today's date or this machine's zone.
import { randomUUID } from 'node:crypto'
import { loadServiceSeed, syncServices, withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import { addLocalDays, localDateOf, offsetChanges } from '@handyhub/domain'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { readCodeKey, type CodeKeySettings } from '../../src/modules/identity/index.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import { loadConfig, recordPolicyVersion } from '../../src/platform/config/index.js'
import { FakeObjectStorage } from '../../src/providers/r2/index.js'
import { testConfig } from '../fixtures/env.js'
import { signInWithMfa } from '../fixtures/staff-mfa.js'

const EASTERN = 'America/Kentucky/Louisville'
const CENTRAL = 'America/Chicago'
const MIN = 60_000
const DAY = 24 * 60 * MIN
const DECIDED = {
  mornings: { start: '08:00', end: '12:00' },
  afternoons: { start: '12:00', end: '17:00' },
  evenings: { start: '17:00', end: '22:00' },
}
const KEY: CodeKeySettings = readCodeKey({
  HANDYHUB_ENV: 'ci',
  CODE_HASH_KEY: ['synthetic', 'window', 'hours', 'policy', 'code', 'key', 'for', 'tests', '0139'].join('-'),
})
const pw = ['synthetic', 'window', 'hours', 'passphrase', '139'].join(' ')
const PEOPLE = ['office', 'worker'] as const
type Person = (typeof PEOPLE)[number]

/** The first clock change of `zone` of each direction at least two days from now, as its local date and new offset. */
function changesOf(zone: string) {
  const from = new Date(Date.now() + 2 * DAY)
  const changes = offsetChanges(zone, from, new Date(from.getTime() + 400 * DAY))
  const fall = changes.find((c) => c.offsetAfter < c.offsetBefore)
  const spring = changes.find((c) => c.offsetAfter > c.offsetBefore)
  if (!fall || !spring) throw new Error(`${zone} must observe daylight saving time for these tests`)
  return [fall, spring].map((c) => ({ date: localDateOf(c.at, zone), offset: c.offsetAfter }))
}
/** The UTC instant of a wall-clock time at a given offset (minutes east of UTC). */
const wallUtc = (date: string, time: string, offsetMinutes: number) =>
  new Date(Date.parse(`${date}T${time}:00Z`) - offsetMinutes * MIN).toISOString()
/** The first Saturday at least three days ahead, in the business zone (and so in both supported zones). */
function nextSaturday(): string {
  let d = addLocalDays(localDateOf(new Date(), EASTERN), 3)
  while (new Date(`${d}T12:00:00Z`).getUTCDay() !== 6) d = addLocalDays(d, 1)
  return d
}

let t: TestDatabase
let app: FastifyInstance
const cookies = {} as Record<Person, string>
const csrf = {} as Record<Person, string>

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
        email: `${p}-windows@example.test`,
        displayName: `Synthetic ${p}`,
        locale: 'en',
        role: p,
        issuedBy: 'test',
      })
      await setPasswordHash(tx, user.id, hash)
    }
  })
  for (const p of PEOPLE) {
    const res = await signInWithMfa(app, {
      method: 'POST',
      url: '/api/v1/staff/auth/sign-in',
      headers: { 'x-forwarded-for': '198.51.100.139' },
      payload: { email: `${p}-windows@example.test`, password: pw },
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
const staffGet = (who: Person, url: string) => app.inject({ method: 'GET', url, headers: { cookie: cookies[who] } })

type Timing = { preferredDate?: string; flexible: boolean; needHelpToday: boolean; windows: string[] }
let ip = 10
async function submit(timing: Timing, state = 'ky') {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/public/requests',
    headers: { 'idempotency-key': key('submit'), 'x-forwarded-for': `198.51.100.${++ip}` },
    payload: {
      formVersion: 'test-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-01' }],
      notSure: false,
      description: 'Synthetic window-hours project.',
      answers: [],
      property: {
        street: `${seq} Synthetic Window Lane`,
        city: 'Testville',
        state,
        zip: '40000',
        propertyType: 'house',
      },
      timing,
      estimatePreference: 'site_visit',
      contact: {
        fullName: 'Synthetic Window Customer',
        email: `windows-${seq}-${randomUUID().slice(0, 8)}@example.test`,
        phone: '(502) 555-0139',
        preferredChannel: 'email',
      },
      smsOptIn: false,
      marketingOptIn: false,
    },
  })
  expect(res.statusCode, res.body).toBe(201)
  const { reference } = res.json<{ reference: string }>()
  return t.db
    .selectFrom('intake.requests')
    .select(['id', 'property_id', 'time_windows', 'time_window_hours'])
    .where('reference', '=', reference)
    .executeTakeFirstOrThrow()
}

type Preferred = {
  timeZone: string | null
  family: string | null
  windows: { code: string; start: string | null; end: string | null; startsAt: string | null; endsAt: string | null }[]
}
async function preferred(requestId: string): Promise<Preferred> {
  const res = await staffGet('office', `/api/v1/staff/requests/${requestId}`)
  expect(res.statusCode, res.body).toBe(200)
  return res.json<{ preferredWindows: Preferred }>().preferredWindows
}
async function verifyZone(propertyId: string, zone: string) {
  const view = await staffGet('office', `/api/v1/staff/properties/${propertyId}`)
  expect(view.statusCode, view.body).toBe(200)
  const res = await app.inject({
    method: 'PUT',
    url: `/api/v1/staff/properties/${propertyId}/time-zone`,
    payload: { timeZone: zone, county: 'Synthetic', reason: 'Synthetic: county read from the verified address' },
    headers: {
      cookie: cookies.office,
      'x-csrf-token': csrf.office,
      'idempotency-key': key('zone'),
      'if-match': `"${view.json<{ version: number }>().version}"`,
    },
  })
  expect(res.statusCode, res.body).toBe(200)
}

describe('[OWN-DEC-170][FACT-WINDOW-HOURS][RULE-DECIDED-VALUES-ACTIVE] request.window_hours is decided', () => {
  it('[OWN-DEC-170] version 2 is active, configured with 8–12, 12–5 and 5–10, citing the decision; v1 superseded', async () => {
    const config = await loadConfig(t.db)
    expect(config.get('request.window_hours')).toMatchObject({
      state: 'CONFIGURED',
      proposed: false,
      version: 2,
      value: DECIDED,
    })
    const rows = await t.db
      .selectFrom('platform.policy_version')
      .select(['version', 'status', 'state', 'source_ids'])
      .where('key', '=', 'request.window_hours')
      .orderBy('version')
      .execute()
    expect(rows.map((r) => [r.version, r.status, r.state])).toEqual([
      [1, 'superseded', 'not_configured'],
      [2, 'active', 'configured'],
    ])
    expect(rows[1]?.source_ids).toEqual(['FACT-WINDOW-HOURS', 'OWN-DEC-170', 'HH-INT-02'])
  })
})

describe('[HH-INT-02][OWN-DEC-170] the request keeps the hours the form offered', () => {
  it('[T09][OWN-DEC-170] Weekends with Mornings on a Saturday keeps the Mornings hours; the snapshot never changes', async () => {
    const r = await submit({
      preferredDate: nextSaturday(),
      flexible: false,
      needHelpToday: false,
      windows: ['mornings', 'weekends'],
    })
    expect(r.time_windows).toEqual(['mornings', 'weekends'])
    expect(r.time_window_hours).toEqual({ mornings: DECIDED.mornings })
    await expect(
      t.db
        .updateTable('intake.requests')
        .set({ time_window_hours: JSON.stringify({ mornings: { start: '09:00', end: '12:00' } }) })
        .where('id', '=', r.id)
        .execute(),
    ).rejects.toThrow(/ORIGINAL_SUBMISSION/)
    // Any time has no hours of its own.
    const any = await submit({ flexible: true, needHelpToday: false, windows: ['any_time'] })
    expect(any.time_window_hours).toEqual({})
  })

  it('[ENT-Request] the database refuses hours for a window not chosen, or out of order', async () => {
    const ok = (hours: unknown, windows: string[]) =>
      sql<{ ok: boolean }>`SELECT intake.window_hours_ok(${JSON.stringify(hours)}::jsonb, ${windows}::text[]) AS ok`
        .execute(t.db)
        .then((x) => x.rows[0]?.ok)
    expect(await ok({ mornings: DECIDED.mornings }, ['mornings', 'weekends'])).toBe(true)
    expect(await ok({ evenings: DECIDED.evenings }, ['mornings'])).toBe(false)
    expect(await ok({ weekends: { start: '08:00', end: '12:00' } }, ['weekends'])).toBe(false)
    expect(await ok({ mornings: { start: '12:00', end: '08:00' } }, ['mornings'])).toBe(false)
    expect(await ok({ mornings: { start: '8:00', end: '12:00' } }, ['mornings'])).toBe(false)
  })

  it('[OWN-DEC-170] a later change of the configured hours leaves an earlier request as it was', async () => {
    const r = await submit({ flexible: true, needHelpToday: false, windows: ['evenings'] })
    await recordPolicyVersion(t.db, {
      key: 'request.window_hours',
      value: { ...DECIDED, evenings: { start: '18:00', end: '22:00' } },
      sourceIds: ['TEST-SYNTHETIC'],
      changedBy: 'test:synthetic',
      reason: 'synthetic change for a test',
    })
    try {
      expect((await preferred(r.id)).windows).toEqual([
        { code: 'evenings', start: '17:00', end: '22:00', startsAt: null, endsAt: null },
      ])
    } finally {
      await recordPolicyVersion(t.db, {
        key: 'request.window_hours',
        value: DECIDED,
        sourceIds: ['FACT-WINDOW-HOURS', 'OWN-DEC-170'],
        changedBy: 'test:synthetic',
        reason: 'back to the decided value',
      })
    }
  })
})

describe('[OWN-DEC-159][T41] staff read the hours in the property zone', () => {
  it('[OWN-DEC-159][RULE-NO-INVENTED-FACTS] an unknown zone is named unknown, and no instants are given', async () => {
    const r = await submit({
      preferredDate: nextSaturday(),
      flexible: false,
      needHelpToday: false,
      windows: ['mornings'],
    })
    expect(await preferred(r.id)).toEqual({
      timeZone: null,
      family: null,
      windows: [{ code: 'mornings', start: '08:00', end: '12:00', startsAt: null, endsAt: null }],
    })
  })

  it.each([
    ['Eastern', EASTERN, 'ky', 'eastern'],
    ['Central', CENTRAL, 'in', 'central'],
  ])(
    '[T41] %s: Mornings and Evenings on both clock-change days take that day’s offset',
    async (_name, zone, state, family) => {
      for (const change of changesOf(zone)) {
        // The US changes fall on a Sunday, so Weekends agrees with the date.
        const r = await submit(
          {
            preferredDate: change.date,
            flexible: false,
            needHelpToday: false,
            windows: ['mornings', 'evenings', 'weekends'],
          },
          state,
        )
        await verifyZone(r.property_id, zone)
        expect(await preferred(r.id)).toEqual({
          timeZone: zone,
          family,
          windows: [
            {
              code: 'mornings',
              start: '08:00',
              end: '12:00',
              startsAt: wallUtc(change.date, '08:00', change.offset),
              endsAt: wallUtc(change.date, '12:00', change.offset),
            },
            {
              code: 'evenings',
              start: '17:00',
              end: '22:00',
              startsAt: wallUtc(change.date, '17:00', change.offset),
              endsAt: wallUtc(change.date, '22:00', change.offset),
            },
            { code: 'weekends', start: null, end: null, startsAt: null, endsAt: null },
          ],
        })
      }
    },
  )

  it('[RULE-SERVER-AUTHZ] a worker cannot read the request record', async () => {
    const r = await submit({ flexible: true, needHelpToday: false, windows: ['afternoons'] })
    const res = await staffGet('worker', `/api/v1/staff/requests/${r.id}`)
    expect([403, 404]).toContain(res.statusCode)
    expect(res.body).not.toContain('afternoons')
  })
})
