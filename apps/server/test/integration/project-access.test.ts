// Project access grants and the access link landing against PostgreSQL 16 and the provider fakes (TSK-0034; HH-ID-04,
// HH-ID-05, HH-INT-21, HH-ID-03, HH-ID-08, HH-DATA-01, HH-PORT-01, T01, T17, T19, T20, RULE-SERVER-AUTHZ). Every visitor,
// address, number, code, link and template text here is synthetic (RULE-SYNTHETIC-DATA); nothing reaches a real
// provider.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadServiceSeed, syncServices, withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import { PRIVACY_NOTICE, SMS_DISCLOSURE } from '@handyhub/domain/legal'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import {
  accessLinkAutomation,
  accessToken,
  ACCESS_REQUESTED_EVENT,
  issueGrant,
  revokeProjectGrants,
} from '../../src/modules/access/index.js'
import { codeDeliveryAutomation, readCodeKey, type CodeKeySettings } from '../../src/modules/identity/index.js'
import { hashToken } from '../../src/modules/identity/tokens.js'
import { releaseTemplateVersion } from '../../src/modules/notifications/index.js'
import { queueAutomations } from '../../src/modules/queue/index.js'
import { createAutomationRegistry, type Automation } from '../../src/platform/automation.js'
import { createWorker, rerunJob } from '../../src/platform/jobs.js'
import { outbox } from '../../src/platform/outbox.js'
import { createProviders } from '../../src/providers/index.js'
import { readProviderSettings } from '../../src/providers/settings.js'
import { testConfig } from '../fixtures/env.js'
import { bodyOf } from '../fixtures/message-text.js'

const KEY: CodeKeySettings = readCodeKey({ HANDYHUB_ENV: 'ci', CODE_HASH_KEY: 'synthetic-access-link-key-'.repeat(2) })
const PUBLIC = 'http://public.example.test'
const COOKIE = '__Host-hh_customer'

let t: TestDatabase
let app: FastifyInstance
let siteDir = ''
const providers = createProviders(readProviderSettings({ HANDYHUB_ENV: 'ci' }))
const fast = (a: Automation): Automation => ({ ...a, retry: { maxAttempts: 2, baseDelayMs: 1, maxDelayMs: 1 } })
const worker = (codeKey: CodeKeySettings = KEY) =>
  createWorker({
    db: t.db,
    registry: createAutomationRegistry([
      ...queueAutomations(),
      codeDeliveryAutomation({ providers, codeKey: KEY }),
      fast(
        accessLinkAutomation({
          providers: { ...providers, linkHosts: ['public.example.test'] },
          codeKey,
          publicSiteUrl: PUBLIC,
        }),
      ),
    ]),
  })
async function drain(w = worker()) {
  for (let i = 0; i < 20; i++) {
    const r = await w.runOnce()
    if (r.dispatched + r.succeeded + r.retried + r.failed + r.cancelled === 0) break
  }
}

beforeAll(async () => {
  t = await createTestDatabase()
  await syncServices(t.db, loadServiceSeed())
  siteDir = mkdtempSync(join(tmpdir(), 'site-access-'))
  writeFileSync(join(siteDir, 'access.html'), '<!doctype html><title>t</title><h1>Synthetic access page</h1>')
  writeFileSync(join(siteDir, '404.html'), '<!doctype html><title>t</title><h1>Synthetic not found</h1>')
  app = await buildApp({
    config: { ...testConfig({ TRUST_PROXY_HOPS: '1' }), siteDir },
    api: { db: t.db, codeKey: KEY },
  })
})
afterAll(async () => {
  await app?.close()
  await t?.drop()
  if (siteDir) rmSync(siteDir, { recursive: true, force: true })
})

let ip = 60
const nextIp = () => `198.51.100.${++ip}`
let n = 0
const future = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10)
function body(email: string, over: Record<string, unknown> = {}) {
  return {
    formVersion: 'test-1',
    privacyNoticeVersion: PRIVACY_NOTICE.documentId,
    services: [{ serviceId: 'SVC-DW-01' }],
    notSure: false,
    description: 'Synthetic access project: a loose cabinet hinge.',
    property: { street: '100 Synthetic Way', city: 'Testville', state: 'KY', zip: '40000', propertyType: 'house' },
    timing: { preferredDate: future, flexible: false, needHelpToday: false, windows: ['any_time'] },
    estimatePreference: 'let_handyhub_decide',
    contact: { fullName: 'Test Customer', email, phone: '(502) 555-0147', preferredChannel: 'email' },
    smsOptIn: false,
    marketingOptIn: false,
    ...over,
  }
}
const withTexts = (email: string, phone: string) => ({
  smsOptIn: true,
  smsDisclosureVersion: SMS_DISCLOSURE.documentId,
  contact: { fullName: 'Test Customer', email, phone, preferredChannel: 'text' },
})

type Sent = {
  reference: string
  requestId: string
  projectId: string
  contactId: string
  cap: string
  key: string
  grantId: string
  token: string
}
async function submitted(email: string, over: Record<string, unknown> = {}, on = app): Promise<Sent> {
  const key = `synthetic-access-${++n}-0001`
  const res = await on.inject({
    method: 'POST',
    url: '/api/v1/public/requests',
    headers: { 'idempotency-key': key, 'x-forwarded-for': nextIp() },
    payload: body(email, over),
  })
  expect(res.statusCode).toBe(201)
  const reference = res.json<{ reference: string }>().reference
  const r = await t.db
    .selectFrom('intake.requests')
    .select(['id', 'project_id', 'contact_id'])
    .where('reference', '=', reference)
    .executeTakeFirstOrThrow()
  const grant = await t.db
    .selectFrom('identity.project_access_grants')
    .select(['id', 'nonce'])
    .where('request_id', '=', r.id)
    .executeTakeFirst()
  return {
    reference,
    requestId: r.id,
    projectId: r.project_id,
    contactId: r.contact_id,
    cap: String(res.headers['receipt-capability'] ?? ''),
    key,
    grantId: grant?.id ?? '',
    token: grant && KEY.state === 'configured' ? accessToken(KEY.key, grant.id, grant.nonce) : '',
  }
}

// Each test calls from its own synthetic address (RFC 5737), so per-address code limits never cross tests.
let client = ''
let clients = 0
beforeEach(() => {
  client = `203.0.113.${100 + ++clients}`
})
const post = (path: string, payload: Record<string, unknown>, cookie?: string) =>
  app.inject({
    method: 'POST',
    url: `/api/v1/public/access${path}`,
    headers: { 'x-forwarded-for': client, ...(cookie ? { cookie } : {}) },
    payload,
  })
const get = (url: string, cookie?: string) =>
  app.inject({ method: 'GET', url, headers: { 'x-forwarded-for': client, ...(cookie ? { cookie } : {}) } })
const cookieOf = (res: { headers: Record<string, unknown> }) => {
  const set = String(res.headers['set-cookie'] ?? '')
  expect(set).toMatch(new RegExp(`^${COOKIE}=[A-Za-z0-9_-]{43}; Path=/; Max-Age=\\d+; Secure; HttpOnly; SameSite=Lax$`))
  return set.split(';')[0] as string
}
const lastText = (destination: string) =>
  [...(providers.fakes.email?.sent ?? []), ...(providers.fakes.sms?.sent ?? [])]
    .filter((m) => m.to === destination)
    .at(-1)?.text ?? ''
/** Runs the worker, then returns the code last delivered to a destination (access links may arrive in between). */
async function deliveredCode(destination: string): Promise<string> {
  await drain()
  const codes = [...(providers.fakes.email?.sent ?? []), ...(providers.fakes.sms?.sent ?? [])]
    .filter((m) => m.to === destination)
    .flatMap((m) => /verification code is (\d{6})\b/.exec(m.text)?.[1] ?? [])
  const code = codes.at(-1)
  if (!code) throw new Error(`no code was delivered to ${destination}`)
  return code
}
const wrong = (code: string) => String((Number(code) + 1) % 1_000_000).padStart(6, '0')
/** Open, send a code by email and enter it: the guest's session cookie for the grant's project. */
async function exchange(s: Sent, email: string): Promise<string> {
  expect((await post('/open', { token: s.token })).statusCode).toBe(200)
  expect((await post('/codes', { token: s.token, channel: 'email' })).statusCode).toBe(202)
  const code = await deliveredCode(email)
  const res = await post('/exchange', { token: s.token, channel: 'email', code })
  expect(res.statusCode).toBe(200)
  expect(res.json()).toEqual({ project: { reference: s.reference } })
  return cookieOf(res)
}
/** What a GET could have changed: the grant, codes, sessions and audit events. */
const footprint = async (s: Sent) => ({
  grant: await t.db
    .selectFrom('identity.project_access_grants')
    .select(['last_verified_at', 'revoked_at'])
    .where('id', '=', s.grantId)
    .executeTakeFirstOrThrow(),
  codes: (
    await t.db
      .selectFrom('identity.verification_codes')
      .select('id')
      .where('subject_ref', 'like', `grant:${s.grantId}:%`)
      .execute()
  ).length,
  sessions: (
    await t.db.selectFrom('identity.customer_sessions').select('id').where('grant_id', '=', s.grantId).execute()
  ).length,
  audits: (
    await t.db
      .selectFrom('platform.audit_events')
      .select('id')
      .where('target_type', '=', 'project_access_grant')
      .where('target_id', '=', s.grantId)
      .execute()
  ).length,
  contact: await t.db
    .selectFrom('crm.contacts')
    .select(['email_verification', 'phone_verification'])
    .where('id', '=', s.contactId)
    .executeTakeFirstOrThrow(),
})
const accessDeliveries = (grantId: string) =>
  t.db
    .selectFrom('platform.message_deliveries')
    .selectAll()
    .where('message_key', '=', 'project.access_link')
    .where('subject_key', '=', `grant:${grantId}`)
    .orderBy('seq')
    .execute()

describe('the grant is created with the request (TSK-0034, HH-INT-21, HH-ID-04, T01)', () => {
  it('[T01][HH-INT-21][HH-ID-04] one request, one project and one single-project grant: hashed, expiring, revocable, never in the response', async () => {
    const s = await submitted('grant-1@example.test')
    expect(
      await t.db.selectFrom('intake.requests').select('id').where('reference', '=', s.reference).execute(),
    ).toHaveLength(1)
    expect(await t.db.selectFrom('crm.projects').select('id').where('id', '=', s.projectId).execute()).toHaveLength(1)
    const grants = await t.db
      .selectFrom('identity.project_access_grants')
      .selectAll()
      .where('project_id', '=', s.projectId)
      .execute()
    expect(grants).toHaveLength(1)
    const [g] = grants
    if (!g) throw new Error('no grant')
    expect([g.contact_id, g.request_id, g.scope, g.issued_reason, g.revoked_at, g.last_verified_at]).toEqual([
      s.contactId,
      s.requestId,
      'guest_project',
      'submission',
      null,
      null,
    ])
    // PROPOSED lifetime: access.grants.linkHours, 24 hours (HH-ID-06).
    expect((g.expires_at.getTime() - g.created_at.getTime()) / 3_600_000).toBe(24)
    // Only the token's hash is stored; the token is 256 bits and appears in no response, outbox event or audit row.
    expect(s.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(g.token_hash).toBe(hashToken(s.token))
    expect(JSON.stringify(g)).not.toContain(s.token)
    const stored = await t.db
      .selectFrom('platform.idempotency_keys')
      .select('response_body')
      .where('idempotency_key', '=', s.key)
      .executeTakeFirstOrThrow()
    expect(JSON.stringify(stored.response_body)).not.toContain(s.token)
    const events = await t.db.selectFrom('platform.outbox_events').select('payload').execute()
    expect(JSON.stringify(events)).not.toContain(s.token)
    const audits = await t.db.selectFrom('platform.audit_events').select(['summary']).execute()
    expect(JSON.stringify(audits)).not.toContain(s.token)
  })

  it('[HH-DATA-01][HH-ID-04] the database keeps what a grant names, refuses a contact of another customer and never undoes a revocation', async () => {
    const a = await submitted('grant-guard-a@example.test')
    const b = await submitted('grant-guard-b@example.test')
    await expect(
      sql`UPDATE identity.project_access_grants SET project_id = ${b.projectId} WHERE id = ${a.grantId}`.execute(t.db),
    ).rejects.toThrow(/keeps what it names/)
    await expect(
      sql`INSERT INTO identity.project_access_grants (id, project_id, contact_id, request_id, scope, issued_reason, nonce,
          token_hash, expires_at) VALUES (gen_random_uuid(), ${a.projectId}, ${b.contactId}, ${a.requestId},
          'guest_project', 'submission', ${'0'.repeat(32)}, ${'1'.repeat(64)}, now() + interval '1 hour')`.execute(
        t.db,
      ),
    ).rejects.toThrow(/contact of its project/)
    await expect(sql`DELETE FROM identity.project_access_grants WHERE id = ${a.grantId}`.execute(t.db)).rejects.toThrow(
      /never deleted/,
    )
    await withTx(t.db, (tx) => revokeProjectGrants(tx, { projectId: a.projectId, reason: 'staff_revoked', by: 'test' }))
    await expect(
      sql`UPDATE identity.project_access_grants SET revoked_at = NULL, revoke_reason = NULL, revoked_by = NULL
          WHERE id = ${a.grantId}`.execute(t.db),
    ).rejects.toThrow(/stays revoked/)
  })

  it('[HH-INT-21][HH-ID-04] without the code key no grant is issued; the request is saved and no link is sent', async () => {
    const plain = await buildApp({ config: testConfig({ TRUST_PROXY_HOPS: '1' }), api: { db: t.db } })
    try {
      const s = await submitted('grant-no-key@example.test', {}, plain)
      expect(s.grantId).toBe('')
      await drain()
      expect(
        await t.db
          .selectFrom('platform.message_deliveries')
          .select('id')
          .where('message_key', '=', 'project.access_link')
          .where('record_id', '=', s.projectId)
          .execute(),
      ).toEqual([])
    } finally {
      await plain.close()
    }
  })
})

describe('the access instructions send automatically (TSK-0034, HH-INT-21, HH-COM-06, OWN-DEC-97, T01)', () => {
  it('[HH-INT-21][HH-COM-06][HH-COM-13] the email wording is not wired yet and texts have none: each destination records why, staff get a delivery issue, the grant stays', async () => {
    const email = 'link-unconfigured@example.test'
    const s = await submitted(email, withTexts(email, '(502) 555-0148'))
    await drain()
    const rows = await accessDeliveries(s.grantId)
    expect(rows.map((d) => [d.channel, d.state, d.error_code, d.release, d.record_type, d.record_id])).toEqual([
      // TSK-0119: the owner's secure_access_link email wording is released; TSK-0120 wires its values.
      ['email', 'failed', 'template_values_not_wired', 'automatic', 'project', s.projectId],
      ['sms', 'failed', 'template_not_configured', 'automatic', 'project', s.projectId],
    ])
    for (const d of rows) {
      const items = await t.db
        .selectFrom('ops.queue_items')
        .select(['reason', 'reference', 'project_id'])
        .where('type', '=', 'delivery_failed')
        .where('subject_id', '=', d.id)
        .execute()
      expect(items).toEqual([{ reason: 'delivery_not_configured', reference: s.reference, project_id: s.projectId }])
    }
    expect(lastText(email)).toBe('')
    // The rendered link is never stored with the delivery.
    expect(JSON.stringify(rows)).not.toContain(s.token)
  })

  describe('with a synthetic template released in this test database only', () => {
    beforeAll(async () => {
      await withTx(t.db, async (tx) => {
        await releaseTemplateVersion(tx, {
          messageKey: 'project.access_link',
          channel: 'email',
          locale: 'en',
          subject: 'Synthetic test access',
          body: 'SYNTHETIC TEST TEMPLATE {accessLink}',
          translationReview: 'source',
          sourceIds: ['TSK-0034'],
          releasedBy: 'test',
        })
        await releaseTemplateVersion(tx, {
          messageKey: 'project.access_link',
          channel: 'sms',
          locale: 'en',
          subject: null,
          body: 'SYNTHETIC TEST TEMPLATE {accessLink}',
          translationReview: 'source',
          sourceIds: ['TSK-0034'],
          releasedBy: 'test',
        })
      })
    })

    it('[T01][HH-INT-21][HH-ID-08] one link per destination, to /access with the token in the fragment; replays send nothing more', async () => {
      const email = 'link-once@example.test'
      const s = await submitted(email)
      await drain()
      // The event is dispatched again and the job replayed: the delivery was handed over, so nothing more is sent.
      const job = await t.db
        .selectFrom('platform.jobs')
        .select('id')
        .where('automation', '=', 'notify.project.access_link')
        .where('target_id', '=', s.requestId)
        .executeTakeFirstOrThrow()
      await withTx(t.db, (tx) => rerunJob(tx, { jobId: job.id, key: 'replay', requestId: 'test-replay' }))
      await drain()
      const sent = (providers.fakes.email?.sent ?? []).filter((m) => m.to === email)
      expect(sent.map((m) => bodyOf(m.text))).toEqual([`SYNTHETIC TEST TEMPLATE ${PUBLIC}/access#${s.token}`])
      // No phone text without this request's SMS opt-in.
      const rows = await accessDeliveries(s.grantId)
      expect(rows.map((d) => [d.channel, d.error_code, d.provider_message_id !== null])).toEqual([
        ['email', null, true],
      ])
    })

    it('[HH-INT-21] with the SMS opt-in the link goes by text too; a revoked grant sends nothing', async () => {
      const email = 'link-texts@example.test'
      const s = await submitted(email, withTexts(email, '(502) 555-0149'))
      await drain()
      expect(lastText('+15025550149')).toBe(`SYNTHETIC TEST TEMPLATE ${PUBLIC}/access#${s.token}`)
      const r = await submitted('link-revoked@example.test')
      await withTx(t.db, (tx) =>
        revokeProjectGrants(tx, { projectId: r.projectId, reason: 'staff_revoked', by: 'test' }),
      )
      await drain()
      expect(await accessDeliveries(r.grantId)).toEqual([])
      expect(lastText('link-revoked@example.test')).toBe('')
    })

    it('[HH-INT-21] a reissue event names its grant (project.access_requested, TSK-0035 emits it)', async () => {
      const s = await submitted('link-reissue@example.test')
      await drain()
      await withTx(t.db, (tx) =>
        outbox.add(tx, {
          type: ACCESS_REQUESTED_EVENT,
          aggregate: { type: 'project_access_grant', id: s.grantId },
          idempotencyKey: `${ACCESS_REQUESTED_EVENT}:${s.grantId}:test`,
          requestId: 'test-reissue',
        }),
      )
      await drain()
      // The same grant's delivery already went out: one link, not two.
      expect((await accessDeliveries(s.grantId)).map((d) => d.provider_message_id !== null)).toEqual([true])
      expect((providers.fakes.email?.sent ?? []).filter((m) => m.to === 'link-reissue@example.test')).toHaveLength(1)
    })

    it('[HH-INT-21] without the code key at send time no link is made up (template_values_missing)', async () => {
      const s = await submitted('link-no-key@example.test')
      await drain(worker({ state: 'not_configured', missing: ['CODE_HASH_KEY'] }))
      expect((await accessDeliveries(s.grantId)).map((d) => [d.state, d.error_code])).toEqual([
        ['failed', 'template_values_missing'],
      ])
    })
  })
})

describe('a link preview consumes nothing (TSK-0034, HH-ID-05, T17)', () => {
  it('[T17][HH-ID-05][HH-ID-08] GET /access is one static, private, uncached page that reads and changes nothing', async () => {
    const s = await submitted('preview@example.test')
    const before = await footprint(s)
    const pages = [
      await get('/access'),
      await get('/access/'),
      await get(`/access?t=${s.token}`),
      await app.inject({ method: 'GET', url: '/access', headers: { 'user-agent': 'SyntheticLinkPreviewBot/1.0' } }),
    ]
    for (const res of pages) {
      expect(res.statusCode).toBe(200)
      expect(res.body).toContain('Synthetic access page')
      expect(res.body).not.toContain(s.reference)
      expect(res.headers['cache-control']).toBe('no-store')
      expect(res.headers['x-robots-tag']).toBe('noindex, nofollow')
      expect(res.headers['referrer-policy']).toBe('no-referrer')
      expect(res.headers['set-cookie']).toBeUndefined()
    }
    // The token never works in a path, and no API GET takes it.
    expect((await get(`/access/${s.token}`)).statusCode).toBe(404)
    for (const path of ['/open', '/codes', '/exchange'])
      expect((await get(`/api/v1/public/access${path}?token=${s.token}`)).statusCode).toBe(404)
    expect(await footprint(s)).toEqual(before)
  })

  it('[HH-ID-05][T17] Open only names the masked destination: no scope, address or project; no code, no session, nothing consumed', async () => {
    const s = await submitted('open-only@example.test')
    const before = await footprint(s)
    for (let i = 0; i < 3; i++) {
      const res = await post('/open', { token: s.token })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ channels: [{ channel: 'email', destination: 'o***@example.test' }] })
      expect(res.body).not.toContain(s.reference)
      expect(res.body).not.toContain('Synthetic Way')
      expect(res.headers['set-cookie']).toBeUndefined()
    }
    const after = await footprint(s)
    expect({ ...after, audits: before.audits }).toEqual(before)
    // Each Open is audited without the token.
    expect(after.audits).toBe(before.audits + 3)
  })
})

describe('the verified exchange (TSK-0034, HH-ID-05, HH-ID-04)', () => {
  it('[HH-ID-05][HH-INT-13] the code by POST starts one project session; a wrong code is refused and counted', async () => {
    const email = 'exchange-1@example.test'
    const s = await submitted(email)
    expect((await post('/codes', { token: s.token, channel: 'email' })).statusCode).toBe(202)
    const code = await deliveredCode(email)
    const refused = await post('/exchange', { token: s.token, channel: 'email', code: wrong(code) })
    expect(refused.statusCode).toBe(400)
    expect(refused.json().error.fieldErrors).toMatchObject([{ field: 'body.code', code: 'invalid_code' }])
    expect(refused.headers['set-cookie']).toBeUndefined()
    const attempts = await t.db
      .selectFrom('identity.verification_codes')
      .select('attempts')
      .where('subject_ref', '=', `grant:${s.grantId}:email`)
      .executeTakeFirstOrThrow()
    expect(attempts.attempts).toBe(1)

    const ok = await post('/exchange', { token: s.token, channel: 'email', code })
    expect(ok.statusCode).toBe(200)
    const cookie = cookieOf(ok)
    const session = await t.db
      .selectFrom('identity.customer_sessions')
      .selectAll()
      .where('grant_id', '=', s.grantId)
      .executeTakeFirstOrThrow()
    expect([session.via, session.project_ids, session.contact_ref, session.revoked_at]).toEqual([
      'grant',
      [s.projectId],
      s.contactId,
      null,
    ])
    expect(session.token_hash).not.toContain(cookie.split('=')[1] as string)
    const grant = await t.db
      .selectFrom('identity.project_access_grants')
      .select('last_verified_at')
      .where('id', '=', s.grantId)
      .executeTakeFirstOrThrow()
    expect(grant.last_verified_at).not.toBeNull()
    // The code proved the exact email; the phone is untouched (OWN-DEC-96).
    const contact = await t.db
      .selectFrom('crm.contacts')
      .select(['email_verification', 'email_verified_value', 'phone_verification'])
      .where('id', '=', s.contactId)
      .executeTakeFirstOrThrow()
    expect(contact).toEqual({
      email_verification: 'verified',
      email_verified_value: email,
      phone_verification: 'unverified',
    })
    // The code is used: entering it again opens nothing.
    expect((await post('/exchange', { token: s.token, channel: 'email', code })).statusCode).toBe(400)

    expect((await get('/api/v1/customer/access/session', cookie)).json()).toEqual({
      projects: [{ reference: s.reference }],
    })
    const glance = await get(`/api/v1/customer/projects/${s.reference}`, cookie)
    expect(glance.statusCode).toBe(200)
    expect(glance.json()).toEqual({
      reference: s.reference,
      submittedAt: expect.any(String),
      requestState: 'received',
      services: ['Patching & Repair'],
      notSure: false,
    })
    // Audited without token or code.
    const audits = await t.db
      .selectFrom('platform.audit_events')
      .select(['action', 'result', 'reason', 'summary'])
      .where('target_type', '=', 'project_access_grant')
      .where('target_id', '=', s.grantId)
      .orderBy('seq')
      .execute()
    expect(audits.map((a) => [a.action, a.result, a.reason])).toEqual([
      ['project_access.send_code', 'succeeded', null],
      ['project_access.exchange', 'denied', 'invalid_code'],
      ['project_access.exchange', 'succeeded', null],
      ['project_access.exchange', 'denied', 'invalid_code'],
    ])
    expect(JSON.stringify(audits)).not.toContain(s.token)
    expect(JSON.stringify(audits)).not.toContain(code)
  })

  it('[HH-ID-05][HH-INT-22] the phone takes a text code only with this request’s SMS opt-in, and verifies the phone only', async () => {
    const email = 'exchange-phone@example.test'
    const s = await submitted(email, withTexts(email, '(502) 555-0150'))
    const opened = await post('/open', { token: s.token })
    expect(opened.json()).toEqual({
      channels: [
        { channel: 'email', destination: 'e***@example.test' },
        { channel: 'phone', destination: '***0150' },
      ],
    })
    expect((await post('/codes', { token: s.token, channel: 'phone' })).statusCode).toBe(202)
    const code = await deliveredCode('+15025550150')
    cookieOf(await post('/exchange', { token: s.token, channel: 'phone', code }))
    const contact = await t.db
      .selectFrom('crm.contacts')
      .select(['email_verification', 'phone_verification'])
      .where('id', '=', s.contactId)
      .executeTakeFirstOrThrow()
    expect(contact).toEqual({ email_verification: 'unverified', phone_verification: 'verified' })

    const noTexts = await submitted('exchange-no-texts@example.test')
    const refused = await post('/codes', { token: noTexts.token, channel: 'phone' })
    expect(refused.statusCode).toBe(400)
    expect(refused.json().error.fieldErrors).toMatchObject([{ field: 'body.channel', code: 'sms_not_permitted' }])
  })

  it('[HH-ID-04][RULE-SERVER-AUTHZ] a missing, guessed, altered, expired or revoked link, a reference or an ID opens nothing', async () => {
    const s = await submitted('exchange-bad@example.test')
    const hash = hashToken(s.token)
    for (const token of ['', 'A'.repeat(43), `${s.token}x`, s.reference, s.projectId, s.grantId, hash, s.cap]) {
      for (const [path, payload] of [
        ['/open', { token }],
        ['/codes', { token, channel: 'email' }],
        ['/exchange', { token, channel: 'email', code: '123456' }],
      ] as const) {
        const res = await post(path, payload)
        expect([res.statusCode, res.json().error.code], `${path} ${token.slice(0, 8)}`).toEqual(
          token === '' ? [400, 'VALIDATION_FAILED'] : [404, 'NOT_FOUND'],
        )
      }
    }
    // Expired: the same NOT_FOUND (what a grant names, its expiry included, never changes; this one was issued a day ago).
    const old = await submitted('exchange-expired@example.test')
    const expired = await withTx(t.db, (tx) =>
      issueGrant(tx, KEY, {
        projectId: old.projectId,
        contactId: old.contactId,
        requestId: old.requestId,
        reason: 'submission',
        now: new Date(Date.now() - 25 * 3_600_000),
      }),
    )
    expect((await post('/open', { token: expired?.token })).statusCode).toBe(404)
    // Revoked: NOT_FOUND, and its sessions end.
    const r = await submitted('exchange-revoked@example.test')
    const cookie = await exchange(r, 'exchange-revoked@example.test')
    expect((await get(`/api/v1/customer/projects/${r.reference}`, cookie)).statusCode).toBe(200)
    await withTx(t.db, (tx) => revokeProjectGrants(tx, { projectId: r.projectId, reason: 'staff_revoked', by: 'test' }))
    expect((await post('/open', { token: r.token })).statusCode).toBe(404)
    expect((await get(`/api/v1/customer/projects/${r.reference}`, cookie)).statusCode).toBe(401)
  })
})

describe('a grant for project A never opens project B (TSK-0034, HH-ID-04, HH-ID-03, T19, T20)', () => {
  it('[T19][HH-ID-04][HH-PORT-01] A’s session asking for B by reference or ID gets the same NOT_FOUND as a missing project', async () => {
    const a = await submitted('guest-a@example.test')
    const b = await submitted('guest-b@example.test')
    const cookieA = await exchange(a, 'guest-a@example.test')
    expect((await get(`/api/v1/customer/projects/${a.reference}`, cookieA)).statusCode).toBe(200)
    const denied = await get(`/api/v1/customer/projects/${b.reference}`, cookieA)
    const missing = await get('/api/v1/customer/projects/HH-00000000', cookieA)
    const byId = await get(`/api/v1/customer/projects/${b.projectId}`, cookieA)
    for (const res of [denied, missing, byId]) {
      expect(res.statusCode).toBe(404)
      expect(res.json().error.code).toBe('NOT_FOUND')
      expect(res.body).not.toContain(b.reference)
    }
    const strip = (body: string) => body.replace(/"requestId":"[^"]+"/, '')
    expect(strip(denied.body)).toBe(strip(missing.body))
    // A's link with a code sent for B's link, and B's link with A's code, open nothing.
    expect((await post('/codes', { token: b.token, channel: 'email' })).statusCode).toBe(202)
    const codeB = await deliveredCode('guest-b@example.test')
    expect((await post('/exchange', { token: a.token, channel: 'email', code: codeB })).statusCode).toBe(400)
    const session = await t.db
      .selectFrom('identity.customer_sessions')
      .select('project_ids')
      .where('grant_id', '=', a.grantId)
      .where('revoked_at', 'is', null)
      .execute()
    expect(session.map((r) => r.project_ids)).toEqual([[a.projectId]])
    // Without any session the project route asks for sign-in and reveals nothing.
    expect((await get(`/api/v1/customer/projects/${a.reference}`)).statusCode).toBe(401)
  })

  it('[T20][HH-ID-03][HH-INT-21] the same email on two requests: opening one leaves the other unlinked and unverified', async () => {
    const email = 'same-email@example.test'
    const first = await submitted(email)
    const second = await submitted(email)
    expect(first.grantId).not.toBe(second.grantId)
    const before = await footprint(second)
    const cookie = await exchange(first, email)
    expect((await get('/api/v1/customer/access/session', cookie)).json()).toEqual({
      projects: [{ reference: first.reference }],
    })
    expect((await get(`/api/v1/customer/projects/${second.reference}`, cookie)).statusCode).toBe(404)
    // The second request's grant, contact and sessions are exactly as they were.
    expect(await footprint(second)).toEqual(before)
    // Opening the second link replaces the browser's session: still one project at a time.
    const cookie2 = await exchange(second, email)
    expect((await get('/api/v1/customer/access/session', cookie2)).json()).toEqual({
      projects: [{ reference: second.reference }],
    })
    expect((await get('/api/v1/customer/access/session', `${cookie2}; ${cookie}`)).statusCode).toBe(200)
  })
})

describe('the receipt’s verified code opens the project (TSK-0034, HH-INT-21, HH-ID-05, ENT-ProjectAccessGrant)', () => {
  const receipt = (cap: string, path: string, payload: Record<string, unknown>) =>
    app.inject({
      method: 'POST',
      url: `/api/v1/public/request-receipt${path}`,
      headers: { 'receipt-capability': cap, 'x-forwarded-for': client },
      payload,
    })

  it('[HH-INT-21][HH-ID-05] View My Request: verifying on the receipt starts the session for that one project', async () => {
    const email = 'receipt-open@example.test'
    const s = await submitted(email)
    expect((await receipt(s.cap, '/contact/codes', { channel: 'email' })).statusCode).toBe(202)
    const code = await deliveredCode(email)
    const res = await receipt(s.cap, '/contact/verify', { channel: 'email', code })
    expect(res.statusCode).toBe(200)
    expect(res.json().verified).toEqual({ channel: 'email', changed: false, projectAccess: true })
    const cookie = cookieOf(res)
    expect((await get(`/api/v1/customer/projects/${s.reference}`, cookie)).statusCode).toBe(200)
    const session = await t.db
      .selectFrom('identity.customer_sessions')
      .select(['grant_id', 'project_ids'])
      .where('grant_id', '=', s.grantId)
      .executeTakeFirstOrThrow()
    expect(session.project_ids).toEqual([s.projectId])
  })

  it('[HH-ID-04] a verified email change revokes the old link and its sessions and opens the project from a new grant', async () => {
    const email = 'receipt-change-old@example.test'
    const s = await submitted(email, withTexts(email, '(502) 555-0151'))
    // An earlier session from the link, opened by text so the email can still be changed (only while unverified).
    expect((await post('/codes', { token: s.token, channel: 'phone' })).statusCode).toBe(202)
    const phoneCode = await deliveredCode('+15025550151')
    const earlier = cookieOf(await post('/exchange', { token: s.token, channel: 'phone', code: phoneCode }))
    expect(
      (await receipt(s.cap, '/contact/codes', { channel: 'email', destination: 'receipt-change-new@example.test' }))
        .statusCode,
    ).toBe(202)
    const code = await deliveredCode('receipt-change-new@example.test')
    const res = await receipt(s.cap, '/contact/verify', { channel: 'email', code })
    expect(res.json().verified).toEqual({ channel: 'email', changed: true, projectAccess: true })
    const cookie = cookieOf(res)
    const grants = await t.db
      .selectFrom('identity.project_access_grants')
      .select(['id', 'issued_reason', 'revoke_reason', 'revoked_by'])
      .where('project_id', '=', s.projectId)
      .orderBy('created_at')
      .execute()
    expect(grants.map((g) => [g.issued_reason, g.revoke_reason, g.revoked_by])).toEqual([
      ['submission', 'contact_changed', `customer:${s.contactId}`],
      ['contact_change', null, null],
    ])
    expect((await post('/open', { token: s.token })).statusCode).toBe(404)
    expect((await get(`/api/v1/customer/projects/${s.reference}`, earlier)).statusCode).toBe(401)
    expect((await get(`/api/v1/customer/projects/${s.reference}`, cookie)).statusCode).toBe(200)
    // The new grant's link is not sent: only the listed triggers send it (FACT-AUTOMATIC-MESSAGES #3).
    await drain()
    expect(await accessDeliveries(grants[1]?.id as string)).toEqual([])
  })

  it('[HH-INT-21] without a usable grant the receipt still verifies, and no session starts', async () => {
    const email = 'receipt-no-grant@example.test'
    const s = await submitted(email)
    await withTx(t.db, (tx) => revokeProjectGrants(tx, { projectId: s.projectId, reason: 'staff_revoked', by: 'test' }))
    expect((await receipt(s.cap, '/contact/codes', { channel: 'email' })).statusCode).toBe(202)
    const code = await deliveredCode(email)
    const res = await receipt(s.cap, '/contact/verify', { channel: 'email', code })
    expect(res.json().verified).toEqual({ channel: 'email', changed: false, projectAccess: false })
    expect(res.headers['set-cookie']).toBeUndefined()
  })
})
