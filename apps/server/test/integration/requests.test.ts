// Request submission against PostgreSQL 16 (TSK-0025; HH-INT-10, HH-INT-11, HH-ID-01, HH-INT-21, T01, T11, T21, T71).
// Every visitor, address and number is synthetic (RULE-SYNTHETIC-DATA).
import { loadServiceSeed, syncServices } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { localDate } from '../../src/modules/requests/submit.js'
import { loadConfig, requireConfigured } from '../../src/platform/config/index.js'
import { testConfig } from '../fixtures/env.js'

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
const future = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10)

function body(over: Record<string, unknown> = {}) {
  return {
    formVersion: 'test-1',
    privacyNoticeVersion: 'draft-test-1',
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
    timing: { preferredDate: future, flexible: false, needHelpToday: false, windows: ['mornings', 'weekends'] },
    estimatePreference: 'let_handyhub_decide',
    contact: {
      fullName: 'Test Customer',
      email: 'customer-1@example.test',
      phone: '(502) 555-0101',
      preferredChannel: 'text',
    },
    smsOptIn: false,
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
    // Today in the business time zone, as the server checks it (the UTC date is a day ahead in the evening).
    const zone = requireConfigured((await loadConfig(t.db)).get('business.timezone')).value.zone
    const today = localDate(new Date(), zone)
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

describe('request form settings (TSK-0026, HH-INT-08)', () => {
  it('[HH-INT-08] serves the configured draft period from FACT-SESSION-TIMINGS', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/public/request-form' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      draftDays: 7,
      maxServices: 5,
      timeZone: 'America/Kentucky/Louisville',
      // TSK-0031: the configured photo limits (FACT-UPLOAD-LIMITS).
      photos: { maxFileBytes: 15 * 1024 * 1024, maxPhotos: 10, types: ['image/jpeg', 'image/png', 'image/webp'] },
    })
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
