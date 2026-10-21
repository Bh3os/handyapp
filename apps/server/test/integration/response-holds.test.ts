// The first-response clock and intake review holds against PostgreSQL 16 and the provider fakes (TSK-0043;
// HH-LEAD-04, HH-LEAD-05, OWN-DEC-115, OWN-DEC-116, OWN-DEC-125, FACT-RESPONSE-TARGET, FACT-HOURS, FACT-TIMEZONE, T40,
// RULE-SAFETY-GATES, RULE-HUMAN-REVIEW). Staff, customers, requests and destinations are synthetic
// (RULE-SYNTHETIC-DATA).
import { loadServiceSeed, syncServices, withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import { addBusinessMinutes, businessMinutesBetween } from '@handyhub/domain'
import { PRIVACY_NOTICE } from '@handyhub/domain/legal'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import { deliveryStatusAutomation, notificationAutomation } from '../../src/modules/notifications/index.js'
import { newRequestQueueAutomation } from '../../src/modules/queue/index.js'
import { responseClockAutomation, responseReport } from '../../src/modules/requests/response-clock.js'
import { createAutomationRegistry, type Automation } from '../../src/platform/automation.js'
import { recordPolicyVersion } from '../../src/platform/config/index.js'
import { createWorker } from '../../src/platform/jobs.js'
import { outbox } from '../../src/platform/outbox.js'
import { runWithContext } from '../../src/platform/request-context.js'
import { createProviders } from '../../src/providers/index.js'
import { readProviderSettings } from '../../src/providers/settings.js'
import { recordWebhookReceipt } from '../../src/providers/webhooks.js'
import { testConfig } from '../fixtures/env.js'

const pw = (n: number) => ['synthetic', 'clock', 'passphrase', 'number', String(n)].join(' ')
const PEOPLE = ['owner', 'office', 'estimator', 'worker'] as const
type Person = (typeof PEOPLE)[number]
const ZONE = 'America/Kentucky/Louisville'
const HOURS = { open: '08:00', close: '22:00' }

let t: TestDatabase
let app: FastifyInstance
const ids = {} as Record<Person, string>
const cookies = {} as Record<Person, string>
const csrf = {} as Record<Person, string>
const startedAt = new Date()

beforeAll(async () => {
  t = await createTestDatabase()
  await syncServices(t.db, loadServiceSeed())
  app = await buildApp({ config: testConfig({ TRUST_PROXY_HOPS: '1' }), api: { db: t.db } })
  const hash = await hashPassword(pw(1))
  await withTx(t.db, async (tx) => {
    for (const p of PEOPLE) {
      const user = await createStaffUser(tx, {
        email: `${p}-clock@example.test`,
        displayName: `Synthetic ${p}`,
        locale: 'en',
        role: p,
        issuedBy: 'test',
      })
      await setPasswordHash(tx, user.id, hash)
      ids[p] = user.id
    }
  })
  for (const p of PEOPLE) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/staff/auth/sign-in',
      payload: { email: `${p}-clock@example.test`, password: pw(1) },
    })
    expect(res.statusCode).toBe(200)
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
const key = (what: string) => `synthetic-${what}-${String(++seq).padStart(6, '0')}`
const future = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10)
let ip = 1

async function newRequest() {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/public/requests',
    headers: { 'idempotency-key': key('submit'), 'x-forwarded-for': `198.51.100.${++ip}` },
    payload: {
      formVersion: 'test-1',
      privacyNoticeVersion: PRIVACY_NOTICE.documentId,
      services: [{ serviceId: 'SVC-DW-01' }],
      notSure: false,
      description: 'Synthetic clock description.',
      property: { street: '300 Synthetic Way', city: 'Testville', state: 'ky', zip: '40000', propertyType: 'house' },
      timing: { preferredDate: future, flexible: false, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'online',
      contact: {
        fullName: 'Synthetic Clock Customer',
        email: `clock-${seq}@example.test`,
        phone: '(502) 555-0102',
        preferredChannel: 'email',
      },
      smsOptIn: false,
      marketingOptIn: false,
    },
  })
  expect(res.statusCode).toBe(201)
  const { reference } = res.json<{ reference: string }>()
  // The customer never sees the internal target (FACT-RESPONSE-TARGET).
  expect(JSON.stringify(res.json())).not.toMatch(/due|target|clock|minute/i)
  const row = await t.db
    .selectFrom('intake.requests')
    .select(['id', 'project_id', 'submitted_at'])
    .where('reference', '=', reference)
    .executeTakeFirstOrThrow()
  return { id: row.id, projectId: row.project_id, reference, submittedAt: row.submitted_at }
}

const get = (who: Person, url: string) => app.inject({ method: 'GET', url, headers: { cookie: cookies[who] } })
function write(who: Person, method: 'POST' | 'PUT', url: string, payload: unknown, version?: number) {
  return app.inject({
    method,
    url,
    payload: payload as object,
    headers: {
      cookie: cookies[who],
      'x-csrf-token': csrf[who],
      'idempotency-key': key('write'),
      ...(version === undefined ? {} : { 'if-match': `"${version}"` }),
    },
  })
}
const codes = (res: { json: () => unknown }) =>
  (res.json() as { error: { fieldErrors: { code: string }[] } }).error.fieldErrors.map((f) => f.code)

type Clock = {
  state: string
  dueAt: string | null
  targetMinutes: number | null
  stoppedAt: string | null
  stopKind: string | null
  businessMinutes: number | null
  withinTarget: boolean | null
  remainingMinutes: number | null
}
type Hold = {
  id: string
  category: string
  state: string
  version: number
  note: string
  actions: Record<string, boolean>
}
type Detail = {
  version: number
  state: string
  responseClock: Clock | null
  conversations: { channel: string; outcome: string }[]
  holds: Hold[]
  estimateBlockedByHolds: boolean
  actions: Record<string, boolean>
  qualification: { revision: number } | null
}
async function detail(who: Person, id: string): Promise<Detail> {
  const res = await get(who, `/api/v1/staff/requests/${id}`)
  expect(res.statusCode).toBe(200)
  return res.json<Detail>()
}
const clockRow = (id: string) =>
  t.db.selectFrom('intake.response_clocks').selectAll().where('request_id', '=', id).executeTakeFirstOrThrow()
const item = (id: string, type = 'new_request') =>
  t.db
    .selectFrom('ops.queue_items')
    .select(['reason', 'resolution', 'due_at', 'band', 'subject_status'])
    .where('subject_id', '=', id)
    .where('type', '=', type)
    .orderBy('opened_at', 'desc')
    .orderBy('updated_at', 'desc')
    .execute()

const OK_CHECKS = {
  coverage: { outcome: 'ok' },
  service_fit: { outcome: 'ok' },
  essential_facts: { outcome: 'ok' },
  urgency: { outcome: 'ok' },
  site_visit_need: { outcome: 'ok' },
  staff_equipment: { outcome: 'ok' },
  risk_flags: { outcome: 'ok' },
}
const qualify = (who: Person, id: string, checks: Record<string, unknown>, revision: number) =>
  write(who, 'PUT', `/api/v1/staff/requests/${id}/qualification`, { checks }, revision)
const flagged = (hazards: string[]) => ({
  ...OK_CHECKS,
  risk_flags: { outcome: 'attention', note: 'Synthetic: the customer mentions old wiring and peeling paint.', hazards },
})
const action = (id: string, name: string) => `/api/v1/staff/requests/${id}/actions/${name}`
const holdAction = (id: string, name: string) => `/api/v1/staff/holds/${id}/actions/${name}`

const fakes = () => {
  const p = createProviders(readProviderSettings({ HANDYHUB_ENV: 'ci' }))
  if (!p.fakes.email || !p.email || !p.sms) throw new Error('ci uses the fakes')
  return { providers: { email: p.email, sms: p.sms }, email: p.fakes.email }
}
const drain = async (automations: Automation[]) => {
  const w = createWorker({ db: t.db, registry: createAutomationRegistry(automations) })
  for (let i = 0; i < 10; i++) {
    const r = await w.runOnce()
    if (r.dispatched + r.succeeded + r.retried + r.failed + r.cancelled === 0) return
    await new Promise((res) => setTimeout(res, 5))
  }
}
const clockWorker = () => drain([responseClockAutomation(), newRequestQueueAutomation()])
let rid = 0

/** Publishes a question about the request through the real notification path (the fake email provider). */
async function publishQuestion(requestId: string, f = fakes()) {
  const automation = notificationAutomation({
    messageKey: 'question.notice',
    providers: f.providers,
    resolve: async () => ({
      subjectKey: `question:${requestId}`,
      record: { type: 'request', id: requestId },
      recipients: [
        {
          kind: 'customer_contact',
          id: 'contact-synthetic-clock',
          destinations: [
            { channel: 'email', destination: `clock-q-${requestId}@example.test`, permission: 'preferred' },
          ],
        },
      ],
      values: { projectLink: 'https://handyhub247.example/p/synthetic' },
    }),
  })
  await withTx(t.db, (tx) =>
    outbox.add(tx, {
      type: 'question.published',
      aggregate: { type: 'question', id: requestId },
      idempotencyKey: `qp:${requestId}`,
      requestId: `req-clock-${++rid}`,
    }),
  )
  await drain([automation])
  return t.db
    .selectFrom('platform.message_deliveries')
    .selectAll()
    .where('subject_key', '=', `question:${requestId}`)
    .executeTakeFirstOrThrow()
}

/** A verified Resend status event for a delivery, then the status consumer. */
async function providerEvent(providerMessageId: string, type: string, at: Date) {
  await runWithContext({ requestId: `req-clock-${++rid}` }, () =>
    withTx(t.db, (tx) =>
      recordWebhookReceipt(tx, {
        provider: 'resend',
        deliveryId: `evt-clock-${rid}`,
        eventType: type,
        providerMessageId,
        eventOccurredAt: at,
        payload: { type, data: { email_id: providerMessageId } },
        rawBody: Buffer.from(JSON.stringify({ type })),
      }),
    ),
  )
  await drain([deliveryStatusAutomation()])
}

describe('the first-response clock (TSK-0043, HH-LEAD-05, OWN-DEC-115, OWN-DEC-116)', () => {
  it('[HH-LEAD-05][FACT-RESPONSE-TARGET][FACT-HOURS][FACT-TIMEZONE] every request starts its clock with the configured target, hours and zone', async () => {
    const r = await newRequest()
    const clock = await clockRow(r.id)
    expect(clock).toMatchObject({
      started_at: r.submittedAt,
      target_minutes: 60,
      hours_open: '08:00',
      hours_close: '22:00',
      time_zone: ZONE,
      stopped_at: null,
    })
    expect(clock.config_versions).toEqual({ 'response.target': 1, 'contact.hours': 1, 'business.timezone': 1 })
    // One business hour after receipt, counted only in the daily hours of the business time zone.
    expect(clock.due_at).toEqual(addBusinessMinutes(r.submittedAt, 60, HOURS, ZONE))
    await clockWorker()
    const [open] = await item(r.id)
    expect(open).toMatchObject({ reason: 'new_request', resolution: null, due_at: clock.due_at })
    const d = await detail('office', r.id)
    expect(d.responseClock).toMatchObject({ targetMinutes: 60, dueAt: clock.due_at?.toISOString(), stoppedAt: null })
    expect(['running', 'paused', 'overdue']).toContain(d.responseClock?.state)
    // The pinned start and configuration never change, and a clock is never deleted.
    await expect(
      sql`UPDATE intake.response_clocks SET due_at = now() WHERE request_id = ${r.id}`.execute(t.db),
    ).rejects.toThrow(/keeps its start/)
    await expect(sql`DELETE FROM intake.response_clocks WHERE request_id = ${r.id}`.execute(t.db)).rejects.toThrow(
      /never deleted/,
    )
  })

  it('[HH-LEAD-05][OWN-DEC-116] opening, assigning, qualifying, notes, Ask a Question and the automatic receipt never stop it', async () => {
    const r = await newRequest()
    await clockWorker()
    await detail('office', r.id)
    expect(
      (await write('office', 'PUT', `/api/v1/staff/requests/${r.id}/responsible`, { staffUserId: ids.office }, 1))
        .statusCode,
    ).toBe(200)
    expect((await qualify('office', r.id, OK_CHECKS, 0)).statusCode).toBe(200)
    expect(
      (await write('office', 'POST', `/api/v1/staff/requests/${r.id}/notes`, { body: 'Synthetic note' })).statusCode,
    ).toBe(201)
    expect((await write('office', 'POST', action(r.id, 'ask-question'), {}, 2)).statusCode).toBe(200)
    // The automatic receipt reached the customer: not a response.
    const receipt = await t.db
      .insertInto('platform.message_deliveries')
      .values({
        message_key: 'request.receipt',
        channel: 'email',
        audience: 'customer',
        subject_key: `receipt:${r.id}`,
        release: 'automatic',
        state: 'sent',
        locale: 'en',
        record_type: 'request',
        record_id: r.id,
        recipient_kind: 'customer_contact',
        destination: `clock-r-${r.id}@example.test`,
        channel_permission: 'preferred',
      })
      .returning('id')
      .executeTakeFirstOrThrow()
    await withTx(t.db, (tx) =>
      outbox.add(tx, {
        type: 'message.delivery_succeeded',
        aggregate: { type: 'message_delivery', id: receipt.id },
        payload: { at: new Date().toISOString() },
        idempotencyKey: `receipt-sent:${receipt.id}`,
        requestId: `req-clock-${++rid}`,
      }),
    )
    await clockWorker()
    expect((await clockRow(r.id)).stopped_at).toBeNull()
    const [open] = await item(r.id)
    expect(open).toMatchObject({
      reason: 'awaiting_first_response',
      resolution: null,
      subject_status: 'needs_information',
    })
    const events = await t.db
      .selectFrom('intake.response_events')
      .select('kind')
      .where('request_id', '=', r.id)
      .execute()
    expect(events).toEqual([])
  })

  it('[HH-LEAD-05][OWN-DEC-116] a published question whose delivery succeeded stops the clock; a later bounce starts it again', async () => {
    const r = await newRequest()
    await clockWorker()
    const delivery = await publishQuestion(r.id)
    // Handed to the provider is not yet sent: the clock keeps running.
    expect(delivery.state).toBe('queued')
    await clockWorker()
    expect((await clockRow(r.id)).stopped_at).toBeNull()

    const sentAt = new Date(Math.max(Date.now(), r.submittedAt.getTime()) + 1_000)
    await providerEvent(delivery.provider_message_id as string, 'email.sent', sentAt)
    await clockWorker()
    const stopped = await clockRow(r.id)
    const expected = businessMinutesBetween(r.submittedAt, sentAt, HOURS, ZONE)
    expect(stopped).toMatchObject({
      stopped_at: sentAt,
      stop_kind: 'response_sent',
      stop_ref: delivery.id,
      business_minutes: expected,
      within_target: sentAt.getTime() <= (stopped.due_at as Date).getTime(),
    })
    expect((await item(r.id))[0]).toMatchObject({ resolution: 'responded' })
    expect((await detail('owner', r.id)).responseClock).toMatchObject({ state: 'stopped', stopKind: 'response_sent' })
    // Delivered later changes nothing: the response was the send.
    await providerEvent(delivery.provider_message_id as string, 'email.delivered', new Date(sentAt.getTime() + 5_000))
    await clockWorker()
    expect((await clockRow(r.id)).stopped_at).toEqual(sentAt)

    // A delivery that bounces after it was accepted is a failed response: the clock runs again, an action item again.
    const fresh = await newRequest()
    await clockWorker()
    const second = await publishQuestion(fresh.id)
    const at = new Date(Math.max(Date.now(), fresh.submittedAt.getTime()) + 1_000)
    await providerEvent(second.provider_message_id as string, 'email.sent', at)
    await clockWorker()
    expect((await clockRow(fresh.id)).stopped_at).toEqual(at)
    await providerEvent(second.provider_message_id as string, 'email.bounced', new Date(at.getTime() + 2_000))
    await clockWorker()
    expect(await clockRow(fresh.id)).toMatchObject({ stopped_at: null, business_minutes: null, within_target: null })
    const items = await item(fresh.id)
    expect(items.map((i) => i.resolution)).toEqual([null, 'responded'])
    const events = await t.db
      .selectFrom('intake.response_events')
      .select(['kind'])
      .where('request_id', '=', fresh.id)
      .orderBy('seq')
      .execute()
    expect(events.map((e) => e.kind)).toEqual(['response_sent', 'response_failed'])
  })

  it('[HH-LEAD-05][OWN-DEC-116] a failed delivery leaves the clock running and stays an action item', async () => {
    const r = await newRequest()
    await clockWorker()
    const f = fakes()
    f.email.script({ outcome: 'rejected', errorCode: 'synthetic_rejection' })
    const delivery = await publishQuestion(r.id, f)
    expect(delivery.state).toBe('failed')
    await clockWorker()
    expect((await clockRow(r.id)).stopped_at).toBeNull()
    expect((await item(r.id))[0]).toMatchObject({ resolution: null })
    const events = await t.db
      .selectFrom('intake.response_events')
      .select('kind')
      .where('request_id', '=', r.id)
      .execute()
    expect(events).toEqual([{ kind: 'response_failed' }])
  })

  it('[HH-LEAD-05][OWN-DEC-116] a recorded conversation with its outcome stops the clock at the time it happened', async () => {
    const r = await newRequest()
    await clockWorker()
    const url = `/api/v1/staff/requests/${r.id}/conversations`
    const body = { channel: 'phone', outcome: 'Synthetic: talked through the job; photos to follow.' }
    expect((await write('worker', 'POST', url, body)).statusCode).toBe(403)
    expect((await write('office', 'POST', url, { channel: 'phone', outcome: '  ' })).statusCode).toBe(400)
    const early = new Date(r.submittedAt.getTime() - 60_000).toISOString()
    expect((await write('office', 'POST', url, { ...body, occurredAt: early })).statusCode).toBe(400)
    const later = new Date(Date.now() + 3_600_000).toISOString()
    expect((await write('office', 'POST', url, { ...body, occurredAt: later })).statusCode).toBe(400)

    const res = await write('estimator', 'POST', url, body)
    expect(res.statusCode).toBe(201)
    const out = res.json<{ id: string; occurredAt: string; responseClock: Clock }>()
    expect(out.responseClock).toMatchObject({
      state: 'stopped',
      stopKind: 'conversation_recorded',
      stoppedAt: out.occurredAt,
    })
    const clock = await clockRow(r.id)
    expect(clock.business_minutes).toBe(businessMinutesBetween(r.submittedAt, new Date(out.occurredAt), HOURS, ZONE))
    expect((await item(r.id))[0]).toMatchObject({ resolution: 'responded' })
    // A second conversation is history; the first response stays the first.
    expect(
      (await write('office', 'POST', url, { channel: 'in_person', outcome: 'Synthetic: met on site.' })).statusCode,
    ).toBe(201)
    expect((await clockRow(r.id)).stopped_at).toEqual(clock.stopped_at)
    const d = await detail('office', r.id)
    expect(d.conversations.map((c) => c.channel)).toEqual(['phone', 'in_person'])
    // Staff-only records: never edited, and the outcome text is never in the audit log.
    await expect(
      sql`UPDATE intake.request_conversations SET outcome = 'x' WHERE request_id = ${r.id}`.execute(t.db),
    ).rejects.toThrow(/APPEND_ONLY/)
    const audit = await t.db
      .selectFrom('platform.audit_events')
      .select('summary')
      .where('action', '=', 'request.record_conversation')
      .execute()
    expect(JSON.stringify(audit)).not.toContain('photos to follow')
  })

  it('[HH-LEAD-05][RULE-NO-INVENTED-FACTS] while the target is NOT CONFIGURED the clock has no deadline and nothing is guessed', async () => {
    await recordPolicyVersion(t.db, {
      key: 'response.target',
      value: null,
      sourceIds: ['FACT-RESPONSE-TARGET'],
      changedBy: 'test',
      reason: 'Synthetic: the target is withdrawn for this test',
    })
    try {
      const r = await newRequest()
      expect(await clockRow(r.id)).toMatchObject({ target_minutes: null, due_at: null, hours_open: null })
      await clockWorker()
      expect((await item(r.id))[0]).toMatchObject({ due_at: null, resolution: null })
      expect((await detail('office', r.id)).responseClock).toMatchObject({ state: 'not_configured', dueAt: null })
      // A response is still recorded; its time is unavailable, never zero.
      const res = await write('office', 'POST', `/api/v1/staff/requests/${r.id}/conversations`, {
        channel: 'phone',
        outcome: 'Synthetic call',
      })
      expect(res.json<{ responseClock: Clock }>().responseClock).toMatchObject({
        state: 'stopped',
        businessMinutes: null,
        withinTarget: null,
      })
    } finally {
      await recordPolicyVersion(t.db, {
        key: 'response.target',
        value: { minutes: 60, countedWithin: 'contact_hours' },
        sourceIds: ['FACT-RESPONSE-TARGET', 'OWN-DEC-115'],
        changedBy: 'test',
        reason: 'Synthetic: restored',
      })
    }
  })

  it('[OWN-DEC-125][HH-LEAD-05] the Owner’s customer-response figures come from these same records', async () => {
    const from = new Date(startedAt.getTime() - 60_000).toISOString()
    const to = new Date(Date.now() + 60_000).toISOString()
    const url = `/api/v1/staff/reports/first-response?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
    expect((await get('office', url)).statusCode).toBe(403)
    const res = await get('owner', url)
    expect(res.statusCode).toBe(200)
    const body = res.json<Record<string, number | null>>()
    const direct = await responseReport(t.db, { from: new Date(from), to: new Date(to) })
    expect(body).toMatchObject(direct)
    const clocks = await t.db.selectFrom('intake.response_clocks').select(['due_at', 'business_minutes']).execute()
    expect(body['received']).toBe(clocks.length)
    expect(body['notConfigured']).toBe(clocks.filter((c) => c.due_at === null).length)
    expect(body['answered']).toBe(clocks.filter((c) => c.business_minutes !== null).length)
    expect(body['notConfigured']).toBeGreaterThanOrEqual(1)
    // Nothing measured in an empty range: unavailable, never zero.
    const empty = await get(
      'owner',
      '/api/v1/staff/reports/first-response?from=2020-01-01T00:00:00Z&to=2020-01-02T00:00:00Z',
    )
    expect(empty.json()).toMatchObject({
      received: 0,
      withinTargetShareBps: null,
      averageBusinessMinutes: null,
      medianBusinessMinutes: null,
    })
    expect(
      (
        await get(
          'owner',
          `/api/v1/staff/reports/first-response?from=${encodeURIComponent(to)}&to=${encodeURIComponent(from)}`,
        )
      ).statusCode,
    ).toBe(400)
  })
})

describe('review holds (TSK-0043, HH-LEAD-04, T40, RULE-SAFETY-GATES, RULE-HUMAN-REVIEW)', () => {
  it('[HH-LEAD-04][T40][RULE-SAFETY-GATES] a hazard flag creates review holds that block the estimate path until the Owner resolves them', async () => {
    const r = await newRequest()
    await clockWorker()
    const saved = await qualify('office', r.id, flagged(['licensed_trade', 'hazardous_material']), 0)
    expect(saved.statusCode).toBe(200)
    expect(saved.json<{ holdsOpened: string[] }>().holdsOpened).toHaveLength(2)
    let d = await detail('office', r.id)
    expect(d.holds.map((h) => [h.category, h.state])).toEqual([
      ['hazardous_material', 'open'],
      ['licensed_trade', 'open'],
    ])
    expect(d.estimateBlockedByHolds).toBe(true)
    expect(d.actions).toMatchObject({
      prepareOnlineEstimate: false,
      arrangeEstimateVisit: false,
      askQuestion: true,
      notAFit: true,
    })
    // A safety item in the queue, ahead of everything else.
    expect((await item(r.id, 'review_hold'))[0]).toMatchObject({
      reason: 'review_hold',
      band: 'safety',
      resolution: null,
    })

    // The estimate path is refused on the server, whatever the screen offers.
    const online = await write(
      'office',
      'POST',
      action(r.id, 'online-estimate'),
      { workPackages: ['SVC-DW-01'] },
      d.version,
    )
    expect(online.statusCode).toBe(409)
    expect(codes(online)).toEqual(['REVIEW_HOLD_OPEN'])
    const visit = await write(
      'owner',
      'POST',
      action(r.id, 'estimate-visit'),
      { customerExplanation: 'Synthetic: we need to see it.', workPackages: ['SVC-DW-01'] },
      d.version,
    )
    expect(codes(visit)).toEqual(['REVIEW_HOLD_OPEN'])
    // A later qualification without the hazards clears nothing (no checkbox clears a hold, HH-WORK-02).
    const again = await qualify('office', r.id, OK_CHECKS, 1)
    expect(again.json()).toMatchObject({ holdsOpened: [] })
    expect((await detail('office', r.id)).holds.every((h) => h.state === 'open')).toBe(true)

    const [material, trade] = d.holds as [Hold, Hold]
    // Resolving needs a review first, the Owner, a note and the reviewer named.
    const notReviewed = await write(
      'owner',
      'POST',
      holdAction(material.id, 'resolve'),
      { resolutionNote: 'x', reviewer: 'y' },
      1,
    )
    expect(codes(notReviewed)).toEqual(['INVALID_TRANSITION'])
    expect((await write('worker', 'POST', holdAction(material.id, 'start-review'), {}, 1)).statusCode).toBe(403)
    expect((await write('office', 'POST', holdAction(material.id, 'start-review'), {}, 1)).statusCode).toBe(200)
    expect((await write('office', 'POST', holdAction(material.id, 'start-review'), {}, 1)).json()).toMatchObject({
      error: { code: 'STALE_VERSION' },
    })
    const resolution = {
      resolutionNote: 'Synthetic: the owner confirmed no work touches the painted trim.',
      reviewer: 'Synthetic Owner',
    }
    expect((await write('office', 'POST', holdAction(material.id, 'resolve'), resolution, 2)).statusCode).toBe(403)
    expect(
      (await write('owner', 'POST', holdAction(material.id, 'resolve'), { resolutionNote: 'x' }, 2)).statusCode,
    ).toBe(400)
    expect(
      (await write('owner', 'POST', holdAction(material.id, 'resolve'), { ...resolution, reviewer: '  ' }, 2))
        .statusCode,
    ).toBe(400)
    const resolved = await write('owner', 'POST', holdAction(material.id, 'resolve'), resolution, 2)
    expect(resolved.json()).toMatchObject({ state: 'resolved', version: 3 })

    // One hold still blocks.
    d = await detail('office', r.id)
    expect(d.estimateBlockedByHolds).toBe(true)
    expect(
      codes(await write('office', 'POST', action(r.id, 'online-estimate'), { workPackages: ['SVC-DW-01'] }, d.version)),
    ).toEqual(['REVIEW_HOLD_OPEN'])
    // Entered in error: the Owner cancels it with the reason; it stays in the history.
    expect((await write('owner', 'POST', holdAction(trade.id, 'cancel'), {}, 1)).statusCode).toBe(400)
    expect(
      (
        await write('owner', 'POST', holdAction(trade.id, 'cancel'), { reason: 'Synthetic: ticked by mistake.' }, 1)
      ).json(),
    ).toMatchObject({
      state: 'canceled_as_error',
    })

    d = await detail('office', r.id)
    expect(d.estimateBlockedByHolds).toBe(false)
    expect(d.holds.map((h) => h.state)).toEqual(['resolved', 'canceled_as_error'])
    expect((await item(r.id, 'review_hold'))[0]).toMatchObject({ resolution: 'holds_cleared' })
    const ok = await write(
      'office',
      'POST',
      action(r.id, 'online-estimate'),
      { workPackages: ['SVC-DW-01'] },
      d.version,
    )
    expect(ok.statusCode).toBe(200)
    expect(ok.json()).toMatchObject({ state: 'ready_for_estimate' })

    // Holds are history: never deleted, and a resolved hold never changes.
    await expect(sql`DELETE FROM work.holds WHERE id = ${material.id}`.execute(t.db)).rejects.toThrow(/never deleted/)
    await expect(
      sql`UPDATE work.holds SET note = 'x', version = version + 1 WHERE id = ${material.id}`.execute(t.db),
    ).rejects.toThrow(/never changes/)
    // The notes and the reviewer stay on the hold, not in the audit log.
    const audit = await t.db
      .selectFrom('platform.audit_events')
      .select('summary')
      .where('action', 'like', 'hold.%')
      .execute()
    expect(audit.length).toBeGreaterThanOrEqual(3)
    expect(JSON.stringify(audit)).not.toContain('painted trim')
  })

  it('[HH-LEAD-04] a flagged risk names its hazard; Ask a Question and Not a Fit stay open; a closed request keeps its holds', async () => {
    const r = await newRequest()
    const vague = await qualify(
      'office',
      r.id,
      { ...OK_CHECKS, risk_flags: { outcome: 'attention', hazards: ['structural'] } },
      0,
    )
    expect(codes(vague)).toEqual(['HAZARD_NOTE_REQUIRED'])
    expect((await qualify('office', r.id, flagged(['structural']), 0)).statusCode).toBe(200)
    expect((await write('office', 'POST', action(r.id, 'ask-question'), {}, 1)).statusCode).toBe(200)
    const d = await detail('office', r.id)
    const closed = await write(
      'office',
      'POST',
      action(r.id, 'not-a-fit'),
      { category: 'specialist_assessment', customerReason: 'this needs a structural specialist first.' },
      d.version,
    )
    expect(closed.json()).toMatchObject({ state: 'declined', projectState: 'closed' })
    const after = await detail('office', r.id)
    // The uncertainty stays recorded: the hold is still open, never declared safe; it leaves the queue.
    expect(after.holds.map((h) => [h.category, h.state])).toEqual([['structural', 'open']])
    expect((await item(r.id, 'review_hold'))[0]).toMatchObject({ resolution: 'request_closed' })
    // A closed request keeps its source, reason and history (HH-LEAD-04): nothing is deleted.
    await expect(sql`DELETE FROM intake.requests WHERE id = ${r.id}`.execute(t.db)).rejects.toThrow(/APPEND_ONLY/)
    const decision = await t.db
      .selectFrom('intake.request_decisions')
      .select(['reason_category', 'customer_text'])
      .where('request_id', '=', r.id)
      .where('action', '=', 'not_a_fit')
      .executeTakeFirstOrThrow()
    expect(decision.reason_category).toBe('specialist_assessment')
  })
})
