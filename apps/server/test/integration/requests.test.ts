// Request submission against PostgreSQL 16 (TSK-0025; HH-INT-10, HH-INT-11, HH-ID-01, HH-INT-21, T01, T11, T21, T71).
// Every visitor, address and number is synthetic (RULE-SYNTHETIC-DATA).
import { loadServiceSeed, syncServices, withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import type { SubmitBody } from '../../src/modules/requests/schema.js'
import { localDate, submitRequest } from '../../src/modules/requests/submit.js'
import { recordPolicyVersion } from '../../src/platform/config/index.js'
import { testConfig } from '../fixtures/env.js'
import { PRIVACY_NOTICE, SMS_DISCLOSURE } from '@handyhub/domain/legal'

let t: TestDatabase
let app: FastifyInstance
beforeAll(async () => {
  t = await createTestDatabase()
  await syncServices(t.db, loadServiceSeed())
  app = await buildApp({ config: testConfig({ TRUST_PROXY_HOPS: '1' }), api: { db: t.db } })
})
afterAll(async () => {
  await app?.close()
  await t?.drop()
})

let ip = 10
const nextIp = () => `198.51.100.${++ip}`
// The fixture prefers Mornings and Weekends, so its date is a Saturday (Weekends must agree with the date, HH-INT-02).
const saturday = (() => {
  const d = new Date(Date.now() + 10 * 86_400_000)
  d.setUTCDate(d.getUTCDate() + ((6 - d.getUTCDay() + 7) % 7))
  return d.toISOString().slice(0, 10)
})()
const weekday = (() => {
  const d = new Date(Date.now() + 10 * 86_400_000)
  d.setUTCDate(d.getUTCDate() + ((3 - d.getUTCDay() + 7) % 7))
  return d.toISOString().slice(0, 10)
})()

function body(over: Record<string, unknown> = {}) {
  return {
    formVersion: 'test-1',
    privacyNoticeVersion: PRIVACY_NOTICE.documentId,
    services: [{ serviceId: 'SVC-DW-01', notes: 'Synthetic note' }, { serviceId: 'SVC-PT-01' }],
    notSure: false,
    description: 'Synthetic project description.',
    answers: [
      {
        serviceId: 'SVC-DW-01',
        question: 'damage_size_count_cause',
        kind: 'text',
        text: 'About six inches, synthetic',
      },
      { serviceId: 'SVC-PT-01', question: 'colors', kind: 'unknown' },
      { serviceId: 'SVC-PT-01', question: 'occupancy', kind: 'text', text: 'One synthetic cat' },
    ],
    property: { street: '100 Synthetic Way', city: 'Testville', state: 'ky', zip: '40000', propertyType: 'house' },
    timing: { preferredDate: saturday, flexible: false, needHelpToday: false, windows: ['mornings', 'weekends'] },
    estimatePreference: 'let_handyhub_decide',
    contact: {
      fullName: 'Test Customer',
      email: 'customer-1@example.test',
      phone: '(502) 555-0101',
      preferredChannel: 'text',
    },
    // Text as the preferred method needs the SMS opt-in with the disclosure shown (TSK-0029, HH-INT-22).
    smsOptIn: true,
    smsDisclosureVersion: SMS_DISCLOSURE.documentId,
    marketingOptIn: false,
    ...over,
  }
}

const submit = (payload: unknown, key: string, from = '198.51.100.1') =>
  app.inject({
    method: 'POST',
    url: '/api/v1/public/requests',
    headers: { 'idempotency-key': key, 'x-forwarded-for': from },
    payload: payload as Record<string, unknown>,
  })
const fields = (res: { json: () => { error: { fieldErrors: { field: string; code: string }[] } } }) =>
  res.json().error.fieldErrors.map((f) => [f.field, f.code])
const count = async (table: string) =>
  Number((await sql<{ n: string }>`SELECT count(*) AS n FROM ${sql.raw(table)}`.execute(t.db)).rows[0]?.n)

describe('submission creates one request and its records (TSK-0025, HH-INT-10, HH-ID-01, HH-INT-21, T01)', () => {
  it('[T01][HH-INT-21] creates a customer, contact, property, open project and received request with one event', async () => {
    const res = await submit(body(), 'synthetic-key-first-0001', nextIp())
    expect(res.statusCode).toBe(201)
    const out = res.json<{ status: string; reference: string; submittedAt: string }>()
    expect(out.status).toBe('received')
    expect(out.reference).toMatch(/^HH-[0-9A-HJKMNP-TV-Z]{8}$/)
    const r = await t.db
      .selectFrom('intake.requests')
      .selectAll()
      .where('reference', '=', out.reference)
      .executeTakeFirstOrThrow()
    expect(r).toMatchObject({
      state: 'received',
      coverage_result: 'unknown',
      spam_suspected: false,
      source: 'public_form',
      preferred_channel: 'text',
    })
    expect(r.time_windows).toEqual(['mornings', 'weekends'])
    const project = await t.db
      .selectFrom('crm.projects')
      .selectAll()
      .where('id', '=', r.project_id)
      .executeTakeFirstOrThrow()
    expect(project).toMatchObject({
      reference: out.reference,
      state: 'open',
      payment_term: 'due_on_receipt',
      customer_id: r.customer_id,
    })
    const contact = await t.db
      .selectFrom('crm.contacts')
      .selectAll()
      .where('id', '=', r.contact_id)
      .executeTakeFirstOrThrow()
    expect(contact).toMatchObject({
      phone_e164: '+15025550101',
      email_verification: 'unverified',
      phone_verification: 'unverified',
    })
    const property = await t.db
      .selectFrom('crm.properties')
      .selectAll()
      .where('id', '=', r.property_id)
      .executeTakeFirstOrThrow()
    expect(property).toMatchObject({
      state: 'KY',
      property_type: 'house',
      coverage_result: 'unknown',
      time_zone: 'America/Kentucky/Louisville',
    })
    const services = await t.db
      .selectFrom('intake.request_services')
      .selectAll()
      .where('request_id', '=', r.id)
      .orderBy('position')
      .execute()
    expect(services.map((s) => [s.position, s.service_id])).toEqual([
      [1, 'SVC-DW-01'],
      [2, 'SVC-PT-01'],
    ])
    const answers = await t.db
      .selectFrom('intake.request_answers')
      .selectAll()
      .where('request_id', '=', r.id)
      .orderBy('question_key')
      .execute()
    expect(answers.map((a) => [a.question_key, a.value_kind, a.value_number, a.unit, a.approximate])).toEqual([
      ['colors', 'unknown', null, null, false],
      ['damage_size_count_cause', 'text', null, null, false],
      ['occupancy', 'text', null, null, false],
    ])
    const events = await t.db
      .selectFrom('platform.outbox_events')
      .selectAll()
      .where('aggregate_id', '=', r.id)
      .execute()
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ type: 'request.submitted', idempotency_key: `request.submitted:${r.id}` })
    expect(events[0]?.payload).toEqual({
      requestId: r.id,
      projectId: r.project_id,
      reference: out.reference,
      spamSuspected: false,
    })
    const audited = await t.db.selectFrom('platform.audit_events').selectAll().where('target_id', '=', r.id).execute()
    expect(audited.map((a) => [a.action, a.actor_kind])).toEqual([['request.submit', 'guest']])
    expect(JSON.stringify([events, audited])).not.toMatch(/customer-1@|5550101|Synthetic Way/)
  })

  it('[T11][HH-INT-10] double taps and a retry return the same single request; a changed body is a 409 and writes nothing', async () => {
    const from = nextIp()
    const before = await count('intake.requests')
    const [a, b] = await Promise.all([
      submit(body(), 'synthetic-key-double-0001', from),
      submit(body(), 'synthetic-key-double-0001', from),
    ])
    const retry = await submit(body(), 'synthetic-key-double-0001', from)
    expect([a.statusCode, b.statusCode, retry.statusCode]).toEqual([201, 201, 201])
    expect(new Set([a, b, retry].map((r) => r.json().reference)).size).toBe(1)
    expect(retry.headers['idempotent-replayed']).toBe('true')
    expect(await count('intake.requests')).toBe(before + 1)
    const changed = await submit(
      body({ description: 'A different synthetic description.' }),
      'synthetic-key-double-0001',
      from,
    )
    expect(changed.statusCode).toBe(409)
    expect(changed.json().error.code).toBe('IDEMPOTENCY_CONFLICT')
    // The conflict names the request the key created, so a browser whose answer was lost gets it back (TSK-0030).
    expect(changed.json().error.existing).toEqual({ reference: a.json().reference })
    expect(await count('intake.requests')).toBe(before + 1)
    expect(await count('crm.customers')).toBe(before + 1)
    expect(
      Number(
        (
          await sql<{
            n: string
          }>`SELECT count(*) AS n FROM platform.outbox_events WHERE type = 'request.submitted'`.execute(t.db)
        ).rows[0]?.n,
      ),
    ).toBe(before + 1)
  })

  it('[T11][HH-INT-10] a key whose idempotency record expired is a 409 naming its request, never a 500 or a second request (TSK-0030)', async () => {
    const from = nextIp()
    const key = 'synthetic-key-expired-0001'
    const first = await submit(body(), key, from)
    expect(first.statusCode).toBe(201)
    const reference = first.json().reference as string
    // The record outlived (24 hours) while the browser draft keeps its key for 7 days (FACT-SESSION-TIMINGS).
    await sql`UPDATE platform.idempotency_keys
      SET created_at = now() - interval '2 days', expires_at = now() - interval '1 day'
      WHERE idempotency_key = ${key}`.execute(t.db)
    const before = await Promise.all(['intake.requests', 'crm.customers', 'platform.outbox_events'].map(count))
    for (const again of [body(), body({ description: 'A changed synthetic description.' })]) {
      const res = await submit(again, key, from)
      expect(res.statusCode).toBe(409)
      expect(res.json().error).toMatchObject({
        code: 'IDEMPOTENCY_CONFLICT',
        retryable: false,
        existing: { reference },
      })
    }
    expect(await Promise.all(['intake.requests', 'crm.customers', 'platform.outbox_events'].map(count))).toEqual(before)
    const rows = await t.db
      .selectFrom('intake.requests')
      .select('reference')
      .where('idempotency_key', '=', key)
      .execute()
    expect(rows).toEqual([{ reference }])
  })

  it('[HH-INT-10] two submissions racing with one key outside the advisory lock: one request, the other a conflict (TSK-0030)', async () => {
    // Two callers in different idempotency scopes do not share the framework's lock; the unique key decides.
    // Built from parts so the secret scanner does not read a synthetic key as a credential.
    const key = ['synthetic', 'key', 'race', '0001'].join('-')
    const payload = body() as SubmitBody
    const before = await count('intake.requests')
    let release = () => {}
    const held = new Promise<void>((resolve) => (release = resolve))
    let inserted = false
    const first = withTx(t.db, async (tx) => {
      const out = await submitRequest(tx, payload, { idempotencyKey: key, requestId: 'synthetic-race-0001' })
      inserted = true
      await held
      return out
    })
    while (!inserted) await new Promise((r) => setTimeout(r, 10))
    const second = withTx(t.db, (tx) =>
      submitRequest(tx, payload, { idempotencyKey: key, requestId: 'synthetic-race-0002' }),
    )
    let settled = false
    void second.catch(() => null).finally(() => (settled = true))
    // The second waits on the first's uncommitted row; then the first commits.
    const waiting = async () =>
      Number(
        (
          await sql<{ n: string }>`SELECT count(*) AS n FROM pg_stat_activity
            WHERE datname = current_database() AND wait_event_type = 'Lock'`.execute(t.db)
        ).rows[0]?.n,
      )
    while (!settled && (await waiting()) === 0) await new Promise((r) => setTimeout(r, 10))
    release()
    const won = await first
    await expect(second).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT', status: 409 })
    expect(await count('intake.requests')).toBe(before + 1)
    const rows = await t.db
      .selectFrom('intake.requests')
      .select('reference')
      .where('idempotency_key', '=', key)
      .execute()
    expect(rows).toEqual([{ reference: won.reference }])
  })

  it('[HH-ID-01][T21] never matches an earlier customer by email or phone, and reveals nothing about one', async () => {
    const first = await submit(body(), 'synthetic-key-match-0001', nextIp())
    const second = await submit(body(), 'synthetic-key-match-0002', nextIp())
    expect(Object.keys(second.json()).sort()).toEqual(['reference', 'status', 'submittedAt'])
    const rows = await t.db
      .selectFrom('intake.requests')
      .select(['customer_id', 'contact_id', 'property_id', 'project_id'])
      .where('reference', 'in', [first.json().reference, second.json().reference])
      .execute()
    expect(rows).toHaveLength(2)
    for (const k of ['customer_id', 'contact_id', 'property_id', 'project_id'] as const)
      expect(rows[0]?.[k]).not.toBe(rows[1]?.[k])
  })

  it('[HH-INT-10] keeps the original submission unchanged; only the state moves', async () => {
    const res = await submit(body(), 'synthetic-key-original-0001', nextIp())
    const ref = res.json().reference as string
    await expect(
      sql`UPDATE intake.requests SET description = 'edited' WHERE reference = ${ref}`.execute(t.db),
    ).rejects.toThrow(/ORIGINAL_SUBMISSION/)
    await expect(sql`DELETE FROM intake.requests WHERE reference = ${ref}`.execute(t.db)).rejects.toThrow(/APPEND_ONLY/)
    await sql`UPDATE intake.requests SET state = 'reviewing', state_version = 2 WHERE reference = ${ref}`.execute(t.db)
    const stored = await t.db
      .selectFrom('intake.requests')
      .select(['state', 'original_submission'])
      .where('reference', '=', ref)
      .executeTakeFirstOrThrow()
    expect(stored.state).toBe('reviewing')
    expect(stored.original_submission).toMatchObject({ description: 'Synthetic project description.' })
  })
})

describe('validation keeps every field and reports each problem (TSK-0025, HH-INT-09)', () => {
  it('reports field errors and writes nothing', async () => {
    const before = await count('intake.requests')
    // Today in the business time zone (the rule's own zone); a UTC date is already tomorrow there in the evening.
    const today = localDate(new Date(), 'America/Kentucky/Louisville')
    const res = await submit(
      body({
        services: [{ serviceId: 'SVC-DW-01' }, { serviceId: 'SVC-ZZ-99' }],
        timing: { preferredDate: today, flexible: false, needHelpToday: true, windows: ['any_time', 'mornings'] },
        contact: {
          fullName: 'Test Customer',
          email: 'customer-2@example.test',
          phone: '555 1234',
          preferredChannel: 'email',
        },
        answers: [
          { serviceId: 'SVC-HI-01', question: 'size', kind: 'number' },
          { serviceId: 'SVC-DW-01', question: 'ceiling_height', kind: 'unknown' },
          { serviceId: 'SVC-DW-01', question: 'moisture', kind: 'number', number: 3, unit: 'in' },
        ],
      }),
      'synthetic-key-invalid-0001',
      nextIp(),
    )
    expect(res.statusCode).toBe(400)
    const fields = res
      .json()
      .error.fieldErrors.map((f: { field: string }) => f.field)
      .sort()
    expect(fields).toEqual(
      expect.arrayContaining([
        'body.services.1.serviceId',
        'body.timing.preferredDate',
        'body.timing.windows',
        'body.contact.phone',
        'body.answers.0.serviceId',
        'body.answers.0.number',
        // TSK-0027: only the service's own questions, and no number until a question has a unit.
        'body.answers.1.question',
        'body.answers.2.kind',
      ]),
    )
    expect(res.json().error.message).toMatch(/[A-Za-z]/)
    expect(await count('intake.requests')).toBe(before)
  })

  it('requires name, email and phone, at most 5 services, and a description when not sure', async () => {
    const missing = await submit(
      body({ contact: { fullName: 'Test Customer', email: 'c@example.test', preferredChannel: 'email' } }),
      'synthetic-key-invalid-0002',
      nextIp(),
    )
    expect(missing.json().error.fieldErrors.map((f: { field: string }) => f.field)).toContain('body.contact.phone')
    const six = ['SVC-DW-01', 'SVC-DW-02', 'SVC-PT-01', 'SVC-PT-02', 'SVC-HI-01', 'SVC-HI-02'].map((serviceId) => ({
      serviceId,
    }))
    expect((await submit(body({ services: six }), 'synthetic-key-invalid-0003', nextIp())).statusCode).toBe(400)
    const notSure = await submit(
      body({ services: [], notSure: true, description: undefined }),
      'synthetic-key-invalid-0004',
      nextIp(),
    )
    expect(notSure.json().error.fieldErrors.map((f: { field: string }) => f.field)).toContain('body.description')
    const ok = await submit(
      body({
        services: [],
        notSure: true,
        answers: [],
        timing: { flexible: true, needHelpToday: false, windows: ['any_time'] },
      }),
      'synthetic-key-notsure-0005',
      nextIp(),
    )
    expect(ok.statusCode).toBe(201)
  })
})

describe('rate limits and quiet spam controls (TSK-0025, HH-INT-11)', () => {
  it('[HH-INT-11] answers the sixth submission from one network within the hour with a neutral 429', async () => {
    const from = nextIp()
    for (let i = 1; i <= 5; i++) expect((await submit(body(), `synthetic-key-rate-000${i}`, from)).statusCode).toBe(201)
    const limited = await submit(body(), 'synthetic-key-rate-0006', from)
    expect(limited.statusCode).toBe(429)
    expect(limited.json().error).toMatchObject({ code: 'RATE_LIMITED', retryable: true, fieldErrors: [] })
    expect(limited.json().error.message).toBe('Too many attempts. Wait a moment and try again.')
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0)
    expect((await submit(body(), 'synthetic-key-rate-0007', nextIp())).statusCode).toBe(201)
    const counters = await t.db.selectFrom('platform.rate_counters').select('key_hash').execute()
    expect(JSON.stringify(counters)).not.toContain('198.51.100')
  })

  it('[HH-INT-11] accepts a honeypot or too-fast submission quietly and flags it for review', async () => {
    const res = await submit(
      body({ website: 'https://spam.example', startedAt: Date.now() }),
      'synthetic-key-spam-0001',
      nextIp(),
    )
    expect(res.statusCode).toBe(201)
    const r = await t.db
      .selectFrom('intake.requests')
      .select(['spam_suspected', 'spam_signals', 'original_submission'])
      .where('reference', '=', res.json().reference)
      .executeTakeFirstOrThrow()
    expect(r.spam_suspected).toBe(true)
    expect(r.spam_signals).toEqual(expect.arrayContaining(['honeypot_filled', 'filled_too_fast']))
    expect(r.original_submission).not.toHaveProperty('website')
  })
})

describe('services and their questions for the form (TSK-0027, HH-INT-15, HH-SVC-03)', () => {
  it('[HH-SVC-03][OWN-DEC-84] lists only services the public site may show, with the registry questions and no credential question', async () => {
    const none = await app.inject({ method: 'GET', url: '/api/v1/public/services' })
    expect(none.json()).toEqual({ services: [] })
    await sql`UPDATE catalog.services SET public_status = 'staging' WHERE id IN ('SVC-DW-01', 'SVC-HI-05')`.execute(
      t.db,
    )
    try {
      const res = await app.inject({ method: 'GET', url: '/api/v1/public/services' })
      const services = res.json().services as {
        id: string
        name: string
        questions: { key: string; label: string }[]
      }[]
      expect(services.map((s) => s.id)).toEqual(['SVC-DW-01', 'SVC-HI-05'])
      expect(services[0]?.questions).toEqual([
        { key: 'damage_size_count_cause', label: 'Damage size/count/cause' },
        { key: 'moisture', label: 'moisture' },
        { key: 'texture', label: 'texture' },
        { key: 'painting_inclusion', label: 'painting inclusion' },
      ])
      const hi05 = services[1]?.questions.map((q) => q.label) ?? []
      expect(hi05).not.toContain('no credentials in form')
      expect(hi05.join(' ')).not.toMatch(/code|password|credential/i)
    } finally {
      await sql`UPDATE catalog.services SET public_status = 'draft' WHERE id IN ('SVC-DW-01', 'SVC-HI-05')`.execute(
        t.db,
      )
    }
  })
})

describe('property, timing and estimate preferences (TSK-0028, HH-INT-16, HH-INT-17, HH-INT-02, HH-INT-03)', () => {
  it('[HH-INT-02][T09] a weekday date with Weekends is refused beside the windows and writes nothing', async () => {
    const before = await count('intake.requests')
    const res = await submit(
      body({ timing: { preferredDate: weekday, flexible: false, needHelpToday: false, windows: ['weekends'] } }),
      'synthetic-key-timing-0001',
      nextIp(),
    )
    expect(res.statusCode).toBe(400)
    expect(fields(res)).toEqual([['body.timing.windows', 'weekendDate']])
    expect(await count('intake.requests')).toBe(before)
    const flexible = await submit(
      body({ timing: { flexible: true, needHelpToday: false, windows: ['afternoons', 'weekends'] } }),
      'synthetic-key-timing-0002',
      nextIp(),
    )
    expect(flexible.statusCode).toBe(201)
  })

  it('[HH-INT-17][T09][T37] flexible, Need help today and a site-visit wish are stored as preferences only', async () => {
    const res = await submit(
      body({
        property: {
          street: '200 Synthetic Lane',
          unit: 'Unit 4',
          city: 'Testville',
          state: 'IN',
          zip: '47000',
          propertyType: 'rental_short_term',
        },
        timing: { flexible: true, needHelpToday: true, windows: ['any_time'] },
        estimatePreference: 'site_visit',
      }),
      'synthetic-key-timing-0003',
      nextIp(),
    )
    expect(res.statusCode).toBe(201)
    const r = await t.db
      .selectFrom('intake.requests')
      .selectAll()
      .where('reference', '=', res.json<{ reference: string }>().reference)
      .executeTakeFirstOrThrow()
    expect(r).toMatchObject({
      preferred_date: null,
      flexible: true,
      need_help_today: true,
      time_windows: ['any_time'],
      estimate_preference: 'site_visit',
      state: 'received',
    })
    const property = await t.db
      .selectFrom('crm.properties')
      .selectAll()
      .where('id', '=', r.property_id)
      .executeTakeFirstOrThrow()
    expect(property).toMatchObject({
      street: '200 Synthetic Lane',
      unit: 'Unit 4',
      state: 'IN',
      zip: '47000',
      property_type: 'rental_short_term',
    })
    // Nothing but the request event: no visit, appointment, reservation or confirmation is created (HH-SCH-01).
    const events = await t.db
      .selectFrom('platform.outbox_events')
      .select('type')
      .where('aggregate_id', '=', r.id)
      .execute()
    expect(events.map((e) => e.type)).toEqual(['request.submitted'])
    const tables = await sql<{ name: string }>`
      SELECT table_schema || '.' || table_name AS name FROM information_schema.tables
      WHERE table_name ~ '(visit|appointment|reservation|booking)'`.execute(t.db)
    for (const { name } of tables.rows) expect(await count(name), name).toBe(0)
  })

  it('[T24][HH-INT-16] the receipt carries only status, reference and time: no address, preference or internal data', async () => {
    const res = await submit(body(), 'synthetic-key-timing-0004', nextIp())
    expect(res.statusCode).toBe(201)
    expect(Object.keys(res.json()).sort()).toEqual(['reference', 'status', 'submittedAt'])
    expect(res.body).not.toMatch(/Synthetic Way|40000|Testville|mornings|let_handyhub_decide|customer-1@|coverage/i)
  })

  it('[HH-INT-16][T07] the browser cannot send a coverage outcome; the server looks the ZIP up itself', async () => {
    const res = await submit(
      body({ property: { ...body().property, coverage: 'in_coverage' } }),
      'synthetic-key-timing-0005',
      nextIp(),
    )
    expect(res.statusCode).toBe(400)
    expect(fields(res)).toEqual([['body.property.coverage', 'additionalProperties']])
  })
})

describe('request form settings (TSK-0026, HH-INT-08)', () => {
  it('[HH-INT-08][HH-INT-02][HH-INT-03] serves the draft period, visit hours, windows and the visit-fee policy', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/public/request-form' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      draftDays: 7,
      maxServices: 5,
      timeZone: 'America/Kentucky/Louisville',
      // TSK-0031: the configured photo limits (FACT-UPLOAD-LIMITS).
      photos: { maxFileBytes: 15 * 1024 * 1024, maxPhotos: 10, types: ['image/jpeg', 'image/png', 'image/webp'] },
      // TSK-0028: FACT-HOURS; the five windows without hours (request.window_hours is NOT CONFIGURED,
      // OQ-WINDOW-HOURS); estimates are free (FACT-VISIT-FEE).
      visitHours: { open: '08:00', close: '22:00' },
      windows: [
        { code: 'mornings' },
        { code: 'afternoons' },
        { code: 'evenings' },
        { code: 'weekends' },
        { code: 'any_time' },
      ],
      freeEstimates: true,
      // TSK-0032 (HH-INT-12): the response target the receipt states with the visit hours (FACT-RESPONSE-TARGET).
      responseMinutes: 60,
    })
  })

  it('[HH-INT-12] a response target that is NOT CONFIGURED is null, so the receipt states no response time', async () => {
    await recordPolicyVersion(t.db, {
      key: 'response.target',
      value: null,
      sourceIds: ['FACT-RESPONSE-TARGET'],
      changedBy: 'test:synthetic',
      reason: 'synthetic NOT CONFIGURED for a test',
    })
    try {
      expect(
        (await app.inject({ method: 'GET', url: '/api/v1/public/request-form' })).json().responseMinutes,
      ).toBeNull()
    } finally {
      await recordPolicyVersion(t.db, {
        key: 'response.target',
        value: { minutes: 60, countedWithin: 'contact_hours' },
        sourceIds: ['FACT-RESPONSE-TARGET'],
        changedBy: 'test:synthetic',
        reason: 'back to the decided value',
      })
    }
  })

  it('[HH-INT-02] configured window hours are served, and a window outside the visit hours is neither offered nor accepted', async () => {
    // Synthetic hours, recorded only in this test database and reset afterwards: the owner has given none.
    await recordPolicyVersion(t.db, {
      key: 'request.window_hours',
      value: {
        mornings: { start: '08:00', end: '12:00' },
        afternoons: { start: '12:00', end: '17:00' },
        evenings: { start: '17:00', end: '23:00' },
      },
      sourceIds: ['HH-INT-02'],
      changedBy: 'test:synthetic',
      reason: 'synthetic window hours for a test',
    })
    try {
      const res = await app.inject({ method: 'GET', url: '/api/v1/public/request-form' })
      expect(res.json().windows).toEqual([
        { code: 'mornings', start: '08:00', end: '12:00' },
        { code: 'afternoons', start: '12:00', end: '17:00' },
        { code: 'weekends' },
        { code: 'any_time' },
      ])
      const evenings = await submit(
        body({ timing: { flexible: true, needHelpToday: false, windows: ['evenings'] } }),
        'synthetic-key-timing-0006',
        nextIp(),
      )
      expect(evenings.statusCode).toBe(400)
      expect(fields(evenings)).toEqual([['body.timing.windows', 'enum']])
    } finally {
      await recordPolicyVersion(t.db, {
        key: 'request.window_hours',
        value: null,
        sourceIds: ['OQ-WINDOW-HOURS'],
        changedBy: 'test:synthetic',
        reason: 'back to NOT CONFIGURED',
      })
    }
  })
})

describe('truthful outage state (TSK-0025, T71)', () => {
  it('[T71] answers a retryable UNAVAILABLE, never a false receipt, when the database is not there', async () => {
    const down = await buildApp({ config: testConfig() })
    const res = await down.inject({
      method: 'POST',
      url: '/api/v1/public/requests',
      headers: { 'idempotency-key': 'synthetic-key-down-0001' },
      payload: body(),
    })
    await down.close()
    expect(res.statusCode).toBe(503)
    expect(res.json().error).toMatchObject({ code: 'UNAVAILABLE', retryable: true })
  })
})
