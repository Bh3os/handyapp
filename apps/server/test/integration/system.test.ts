// The Owner's system health report and configuration view against PostgreSQL 16 (TSK-0101; HH-NFR-02, S08, T12,
// T71, RULE-SERVER-AUTHZ). Jobs, deliveries, callbacks, photos, requests and staff are synthetic
// (RULE-SYNTHETIC-DATA); provider keys are built at runtime so no literal looks like a credential.
import { randomUUID } from 'node:crypto'
import { loadServiceSeed, syncServices, withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import { newRequestQueueAutomation } from '../../src/modules/queue/index.js'
import {
  collectHealth,
  variableStates,
  type ConfigurationView,
  type HealthCheck,
  type HealthReport,
} from '../../src/modules/system/index.js'
import { createAutomationRegistry } from '../../src/platform/automation.js'
import { createWorker } from '../../src/platform/jobs.js'
import { readProviderSettings } from '../../src/providers/settings.js'
import { testConfig } from '../fixtures/env.js'

const pw = (n: number) => ['synthetic', 'system', 'passphrase', 'number', String(n)].join(' ')
const ROLES = ['owner', 'office', 'estimator', 'worker'] as const
type Role = (typeof ROLES)[number]
// Synthetic provider values: their text must never appear in a response.
const SYNTHETIC_KEY = ['re', 'synthetic', 'system', 'key', '0001'].join('_')
const SYNTHETIC_SECRET = ['whsec', 'c3ludGhldGljLXN5c3RlbS1zZWNyZXQ='].join('_')
const SYNTHETIC_DESTINATION = 'system-receipt-customer@example.test'
const SYNTHETIC_TEXT = 'Synthetic inbound text that must stay private'
const ENV = {
  HANDYHUB_ENV: 'ci',
  EMAIL_PROVIDER: 'resend',
  RESEND_API_KEY: SYNTHETIC_KEY,
  EMAIL_FROM: 'synthetic-sender@example.test',
  BIRD_WEBHOOK_SECRET: SYNTHETIC_SECRET,
  TEST_EMAIL_DESTINATIONS: 'system-owner@example.test',
}

let t: TestDatabase
let app: FastifyInstance
const cookies = {} as Record<Role, string>

beforeAll(async () => {
  t = await createTestDatabase()
  await syncServices(t.db, loadServiceSeed())
  app = await buildApp({
    config: testConfig({ TRUST_PROXY_HOPS: '1' }),
    api: { db: t.db, system: { providers: readProviderSettings(ENV), variables: variableStates(ENV) } },
  })
  const hash = await hashPassword(pw(1))
  await withTx(t.db, async (tx) => {
    for (const role of ROLES) {
      const user = await createStaffUser(tx, {
        email: `${role}-system@example.test`,
        displayName: `Synthetic ${role}`,
        locale: 'en',
        role,
        issuedBy: 'test',
      })
      await setPasswordHash(tx, user.id, hash)
    }
  })
  for (const role of ROLES) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/staff/auth/sign-in',
      payload: { email: `${role}-system@example.test`, password: pw(1) },
    })
    expect(res.statusCode).toBe(200)
    cookies[role] = String(res.headers['set-cookie']).split(';')[0] as string
  }
})
afterAll(async () => {
  await app?.close()
  await t?.drop()
})

const get = (role: Role | null, url: string) =>
  app.inject({ method: 'GET', url, headers: role ? { cookie: cookies[role] } : {} })
async function health(): Promise<{ body: HealthReport; text: string }> {
  const res = await get('owner', '/api/v1/staff/system/health')
  expect(res.statusCode).toBe(200)
  return { body: res.json<HealthReport>(), text: res.body }
}
const checkOf = (report: HealthReport, id: string) => report.checks.find((c) => c.id === id) as HealthCheck
const metric = (c: HealthCheck, id: string) => c.metrics.find((m) => m.id === id)?.value

let jobSeq = 0
async function failedJob(automation: string, target?: { type: string; id: string }): Promise<string> {
  const row = await t.db
    .insertInto('platform.jobs')
    .values({
      automation,
      job_key: `${automation}:synthetic-${++jobSeq}`,
      target_type: target?.type ?? null,
      target_id: target?.id ?? null,
      request_id: `req-system-${jobSeq}`,
      state: 'failed',
      attempts: 3,
      max_attempts: 3,
      last_error_class: 'SyntheticProviderTimeout',
      finished_at: new Date(),
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  return row.id
}

describe('the health report shows failures and NOT CONFIGURED values (TSK-0101, HH-NFR-02)', () => {
  it('[HH-NFR-02] a failed job and a NOT CONFIGURED value both appear', async () => {
    const jobId = await failedJob('synthetic.health_probe', { type: 'request', id: randomUUID() })
    const { body } = await health()
    const jobs = checkOf(body, 'jobs')
    expect(jobs.status).toBe('failed')
    expect(metric(jobs, 'failed')).toBe(1)
    expect(body.failedJobs).toContainEqual(
      expect.objectContaining({
        id: jobId,
        automation: 'synthetic.health_probe',
        targetType: 'request',
        attempts: 3,
        maxAttempts: 3,
        errorClass: 'SyntheticProviderTimeout',
      }),
    )
    // The configuration check counts the NOT CONFIGURED values and links to the configuration view.
    const config = checkOf(body, 'configuration')
    expect(config.status).toBe('not_configured')
    expect(metric(config, 'not_configured')).toBeGreaterThan(0)
    expect(config.link).toBe('/settings')

    const res = await get('owner', '/api/v1/staff/system/configuration')
    expect(res.statusCode).toBe(200)
    const view = res.json<ConfigurationView>()
    const help = view.entries.find((e) => e.key === 'sms.help_reply')
    expect(help).toMatchObject({ state: 'NOT_CONFIGURED', version: 1, fields: [], proposed: false })
    expect(help?.sourceIds).toContain('OQ-ATTORNEY-PRIVACY')
    expect(view.entries.filter((e) => e.state === 'NOT_CONFIGURED').length).toBe(metric(config, 'not_configured'))
  })

  it('[HH-NFR-02][S08] the configuration view lists every key with its value, version and source ids', async () => {
    const view = (await get('owner', '/api/v1/staff/system/configuration')).json<ConfigurationView>()
    const zone = view.entries.find((e) => e.key === 'business.timezone')
    expect(zone?.state).toBe('CONFIGURED')
    expect(zone?.version).toBeGreaterThanOrEqual(1)
    expect(zone?.sourceIds.length).toBeGreaterThan(0)
    expect(zone?.fields.map((f) => f.path)).toEqual(['zone'])
    // Money stays integer cents in the view (RULE-MONEY-CENTS).
    const deposit = view.entries.find((e) => e.key === 'deposit.rule')
    if (deposit?.state === 'CONFIGURED') {
      const threshold = deposit.fields.find((f) => f.path === 'thresholdCents')
      expect(Number.isInteger(threshold?.value)).toBe(true)
    }
    expect(view.aiModule).toBe('AI_DISABLED')
    expect(new Set(view.entries.map((e) => e.key)).size).toBe(view.entries.length)
  })

  it('[HH-NFR-02][T71] variables are listed by name and set state only; no secret value reaches either response', async () => {
    const res = await get('owner', '/api/v1/staff/system/configuration')
    const view = res.json<ConfigurationView>()
    expect(view.variables).toContainEqual({ name: 'RESEND_API_KEY', group: 'providers', set: true, secret: true })
    expect(view.variables).toContainEqual({ name: 'BIRD_API_KEY', group: 'providers', set: false, secret: true })
    expect(view.variables).toContainEqual({ name: 'HANDYHUB_ENV', group: 'server', set: true, secret: false })
    const healthText = (await health()).text
    for (const text of [res.body, healthText]) {
      expect(text).not.toContain(SYNTHETIC_KEY)
      expect(text).not.toContain(SYNTHETIC_SECRET)
      expect(text).not.toContain('system-owner@example.test')
    }
  })
})

describe('only the Owner reads system health and configuration (TSK-0101, RULE-SERVER-AUTHZ)', () => {
  it('[RULE-SERVER-AUTHZ][HH-NFR-02] office, estimator and worker are refused on the server; a guest is unauthenticated', async () => {
    for (const url of ['/api/v1/staff/system/health', '/api/v1/staff/system/configuration']) {
      for (const role of ['office', 'estimator', 'worker'] as const) {
        const res = await get(role, url)
        expect(res.statusCode, `${role} ${url}`).toBe(403)
        expect(res.json().error.code).toBe('FORBIDDEN')
        expect(res.body).not.toContain('checks')
      }
      const guest = await get(null, url)
      expect(guest.statusCode).toBe(401)
      expect((await get('owner', url)).statusCode).toBe(200)
    }
  })
})

describe('deliveries and callbacks (TSK-0101, HH-NFR-02, T12)', () => {
  it('[T12][HH-NFR-02][HH-COM-02] a failed receipt email shows as a failed delivery linking to the action queue, without its destination', async () => {
    const before = metric(checkOf((await health()).body, 'deliveries_email'), 'failed') ?? 0
    const row = await t.db
      .insertInto('platform.message_deliveries')
      .values({
        message_key: 'request.receipt',
        channel: 'email',
        audience: 'customer',
        subject_key: `request:${randomUUID()}`,
        release: 'automatic',
        state: 'failed',
        locale: 'en',
        recipient_kind: 'customer_contact',
        destination: SYNTHETIC_DESTINATION,
        channel_permission: 'preferred',
        attempts: 3,
        provider: 'resend',
        error_code: 'provider_rejected',
      })
      .returning('id')
      .executeTakeFirstOrThrow()
    const { body, text } = await health()
    const email = checkOf(body, 'deliveries_email')
    expect(email.status).toBe('failed')
    expect(metric(email, 'failed')).toBe(before + 1)
    expect(email.link).toBe('/')
    expect(body.failedDeliveries).toContainEqual(
      expect.objectContaining({
        id: row.id,
        messageKey: 'request.receipt',
        channel: 'email',
        audience: 'customer',
        errorCode: 'provider_rejected',
      }),
    )
    expect(text).not.toContain(SYNTHETIC_DESTINATION)
    // The fake-free email channel is the configured Resend adapter; SMS is the ci fake.
    expect(body.providers).toEqual([
      { channel: 'email', mode: 'real', provider: 'resend', missing: [] },
      { channel: 'sms', mode: 'fake', provider: null, missing: [] },
      { channel: 'storage', mode: 'fake', provider: null, missing: [] },
    ])
  })

  it('[HH-NFR-02][HH-ARC-09] a callback whose processing failed is listed with its provider and event, never its payload', async () => {
    const receipt = await t.db
      .insertInto('platform.webhook_receipts')
      .values({
        provider: 'bird',
        delivery_id: `msg_synthetic_${randomUUID()}`,
        event_type: 'sms.received',
        signature_verified: true,
        payload: JSON.stringify({ text: SYNTHETIC_TEXT, from: '+15025550142' }),
        payload_sha256: 'a'.repeat(64),
      })
      .returning('id')
      .executeTakeFirstOrThrow()
    const jobId = await failedJob('notify.provider_events', { type: 'webhook_receipt', id: receipt.id })
    const { body, text } = await health()
    const bird = checkOf(body, 'callbacks_bird')
    expect(bird.status).toBe('failed')
    expect(metric(bird, 'received')).toBe(1)
    expect(metric(bird, 'failed')).toBe(1)
    expect(bird.latestAt).not.toBeNull()
    expect(body.failedCallbacks).toContainEqual(
      expect.objectContaining({ jobId, provider: 'bird', eventType: 'sms.received' }),
    )
    // Resend has no webhook secret here: its callbacks are NOT CONFIGURED, naming the variable.
    const resend = checkOf(body, 'callbacks_resend')
    expect(resend).toMatchObject({ status: 'not_configured', missing: ['RESEND_WEBHOOK_SECRET'] })
    expect(body.webhookSecrets).toEqual({ bird: true, resend: false })
    expect(text).not.toContain(SYNTHETIC_TEXT)
    expect(text).not.toContain('+15025550142')
  })
})

describe('uploads, the outbox and request-to-intake integrity (TSK-0101, HH-NFR-02)', () => {
  it('[HH-NFR-02] rejected and stuck photos are listed; a failed processing job fails the uploads check', async () => {
    const capability = randomUUID()
    await t.db
      .insertInto('intake.upload_capabilities')
      .values({
        id: capability,
        token_hash: 'b'.repeat(64),
        scope: 'draft',
        expires_at: new Date(Date.now() + 3_600_000),
      })
      .execute()
    const photo = (state: 'rejected' | 'quarantined', n: number) => ({
      id: randomUUID(),
      capability_id: capability,
      object_key: `drafts/synthetic/${n}`,
      content_type: 'image/png',
      byte_size: 1000 + n,
      sha256: String(n).repeat(64).slice(0, 64),
      state,
      rejection_reason: state === 'rejected' ? 'malformed' : null,
      uploaded_at: new Date(Date.now() - 60 * 60_000),
      uploader_kind: 'customer',
    })
    const rejected = photo('rejected', 1)
    const stuck = photo('quarantined', 2)
    await t.db.insertInto('intake.photos').values([rejected, stuck]).execute()

    const first = await health()
    let body = first.body
    let uploads = checkOf(body, 'uploads')
    expect(uploads.status).toBe('attention')
    expect(metric(uploads, 'rejected')).toBe(1)
    expect(metric(uploads, 'quarantined')).toBe(1)
    expect(metric(uploads, 'stale')).toBe(1)
    expect(body.uploadProblems.map((p) => [p.id, p.state, p.reason])).toEqual(
      expect.arrayContaining([
        [rejected.id, 'rejected', 'malformed'],
        [stuck.id, 'quarantined', null],
      ]),
    )
    expect(first.text).not.toContain('drafts/synthetic')

    await failedJob('photo.process', { type: 'photo', id: stuck.id })
    body = (await health()).body
    uploads = checkOf(body, 'uploads')
    expect(uploads.status).toBe('failed')
    expect(metric(uploads, 'processing_failed')).toBe(1)
  })

  it('[HH-NFR-02][HH-ARC-09] a received request without its intake item is flagged until the worker opens it', async () => {
    const future = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10)
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/public/requests',
      headers: { 'idempotency-key': 'synthetic-system-request-0001', 'x-forwarded-for': '198.51.100.31' },
      payload: {
        formVersion: 'test-1',
        privacyNoticeVersion: 'privacy-notice-1',
        services: [{ serviceId: 'SVC-DW-01' }],
        notSure: false,
        description: 'Synthetic system health description.',
        property: { street: '400 Synthetic Way', city: 'Testville', state: 'ky', zip: '40000', propertyType: 'house' },
        timing: { preferredDate: future, flexible: false, needHelpToday: false, windows: ['mornings'] },
        estimatePreference: 'online',
        contact: {
          fullName: 'System Customer',
          email: 'system-1@example.test',
          phone: '(502) 555-0177',
          preferredChannel: 'email',
        },
        smsOptIn: false,
        marketingOptIn: false,
      },
    })
    expect(res.statusCode).toBe(201)
    const { reference } = res.json<{ reference: string }>()

    // Just submitted: inside the grace period, nothing is flagged yet.
    let report = await collectHealth(t.db)
    expect(report.missingFromIntake.map((m) => m.reference)).not.toContain(reference)
    // An hour on with no worker: the event still waits in the outbox and the request is missing from intake.
    const later = new Date(Date.now() + 60 * 60_000)
    report = await collectHealth(t.db, { now: later })
    expect(report.missingFromIntake.map((m) => m.reference)).toContain(reference)
    const integrity = checkOf(report, 'intake_integrity')
    expect(integrity.status).toBe('failed')
    expect(integrity.link).toBe('/')
    expect(checkOf(report, 'outbox').status).toBe('attention')
    expect(metric(checkOf(report, 'outbox'), 'stale')).toBeGreaterThan(0)

    // The worker dispatches the event and opens the new_request item: the request is in intake again.
    const worker = createWorker({ db: t.db, registry: createAutomationRegistry([newRequestQueueAutomation()]) })
    for (let i = 0; i < 5; i++) await worker.runOnce()
    report = await collectHealth(t.db, { now: later })
    expect(report.missingFromIntake.map((m) => m.reference)).not.toContain(reference)
    expect(checkOf(report, 'intake_integrity').status).toBe('ok')
  })
})

describe('truthful states: what the system cannot observe is never shown as healthy (TSK-0101, T71)', () => {
  it('[T71][HH-NFR-02] backups, the restore drill and scheduling are unknown and error tracking is not configured', async () => {
    const { body } = await health()
    expect(checkOf(body, 'backups')).toMatchObject({
      status: 'unknown',
      note: 'backups_not_observable',
      sourceIds: ['OQ-PRODUCTION-HOSTING', 'INT-Render'],
    })
    expect(checkOf(body, 'restore_drill')).toMatchObject({ status: 'unknown', note: 'no_restore_drill_recorded' })
    expect(checkOf(body, 'scheduling_conflicts')).toMatchObject({ status: 'unknown' })
    expect(checkOf(body, 'error_tracking')).toMatchObject({ status: 'not_configured', note: 'no_error_tracker' })
    expect(checkOf(body, 'database').status).toBe('ok')
    expect(checkOf(body, 'migrations')).toMatchObject({ status: 'ok', metrics: [{ id: 'pending', value: 0 }] })
  })

  it('[T71][HH-NFR-02] with no provider selected (staging defaults), every channel is NOT CONFIGURED with the variables it needs', async () => {
    const report = await collectHealth(t.db, { providers: readProviderSettings({ HANDYHUB_ENV: 'staging' }) })
    expect(report.environment).toBe('staging')
    expect(report.providers.map((p) => [p.channel, p.mode, p.missing])).toEqual([
      ['email', 'not_configured', ['EMAIL_PROVIDER']],
      ['sms', 'not_configured', ['SMS_PROVIDER']],
      ['storage', 'not_configured', ['STORAGE_PROVIDER']],
    ])
    expect(checkOf(report, 'callbacks_resend')).toMatchObject({
      status: 'not_configured',
      missing: ['RESEND_WEBHOOK_SECRET'],
    })
    expect(checkOf(report, 'deliveries_sms')).toMatchObject({ status: 'not_configured', missing: ['SMS_PROVIDER'] })
    // A provider selected but missing its keys names exactly the missing variables.
    const partial = await collectHealth(t.db, {
      providers: readProviderSettings({ HANDYHUB_ENV: 'staging', SMS_PROVIDER: 'bird', STORAGE_PROVIDER: 'r2' }),
    })
    expect(partial.providers.find((p) => p.channel === 'sms')?.missing).toEqual(['BIRD_API_KEY', 'BIRD_SMS_FROM'])
    expect(partial.providers.find((p) => p.channel === 'storage')?.missing).toEqual([
      'R2_ACCOUNT_ID',
      'R2_BUCKET',
      'R2_ACCESS_KEY_ID',
      'R2_SECRET_ACCESS_KEY',
    ])
  })

  it('[T71] a process not given its provider settings reports them as unknown, never as configured', async () => {
    const report = await collectHealth(t.db)
    expect(report.providers.every((p) => p.mode === 'unknown')).toBe(true)
    expect(report.webhookSecrets).toEqual({ bird: null, resend: null })
    expect(report.testDestinations).toBeNull()
    expect(checkOf(report, 'callbacks_bird').status).not.toBe('ok')
    expect(checkOf(report, 'deliveries_sms').note).toBe('provider_unknown')
    // The read changes nothing: no audit event and no job is written by it.
    const { rows } = await sql<{ n: number }>`
      SELECT count(*)::int AS n FROM platform.audit_events WHERE action LIKE 'system.%'`.execute(t.db)
    expect(rows[0]?.n).toBe(0)
  })
})
