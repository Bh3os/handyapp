// Provider adapters against their fakes and PostgreSQL 16 (TSK-0013; HH-AUD-05, ENT-WebhookReceipt, INT-Bird,
// INT-Resend, RULE-SYNTHETIC-DATA). Nothing here reaches a real provider.
import { withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { boot } from '../../src/boot.js'
import { createAutomationRegistry, type Automation } from '../../src/platform/automation.js'
import { createWorker } from '../../src/platform/jobs.js'
import { createLogger } from '../../src/platform/logger.js'
import { outbox } from '../../src/platform/outbox.js'
import { FakeEmailSender } from '../../src/providers/resend/index.js'
import { FakeSmsSender } from '../../src/providers/bird/index.js'
import { destinationPolicy, guardEmail, guardSms } from '../../src/providers/destinations.js'
import { createProviders } from '../../src/providers/index.js'
import { readProviderSettings } from '../../src/providers/settings.js'
import { signWebhook } from '../../src/providers/webhooks.js'
import { GATE_USERS } from '../fixtures/env.js'

// Synthetic signing secret built at runtime (RULE-SYNTHETIC-DATA).
const birdSecret = ['whsec', Buffer.from('synthetic-bird-signing-key-01234').toString('base64')].join('_')

let t: TestDatabase
let app: FastifyInstance
let base: string
beforeAll(async () => {
  t = await createTestDatabase()
  const started = await boot(
    {
      HANDYHUB_ENV: 'staging',
      DATABASE_URL: t.url,
      ACCESS_GATE_USERS: GATE_USERS,
      BIRD_WEBHOOK_SECRET: birdSecret,
      PORT: '0',
    },
    { worker: false },
  )
  app = started.app
  base = started.address
})
afterAll(async () => {
  await app?.close()
  await t?.drop()
})

let n = 0
function delivery(body: object, over: { id?: string; ts?: number; secret?: string; sign?: boolean } = {}) {
  const raw = JSON.stringify(body)
  const id = over.id ?? `msg_test_${++n}`
  const ts = over.ts ?? Math.floor(Date.now() / 1000)
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'webhook-id': id,
    'webhook-timestamp': String(ts),
  }
  if (over.sign !== false) headers['webhook-signature'] = signWebhook(over.secret ?? birdSecret, id, ts, raw)
  return { method: 'POST', headers, body: raw }
}
const delivered = (smsId: string) => ({
  type: 'sms.delivered',
  timestamp: '2026-10-20T12:00:00Z',
  data: { sms_id: smsId, to: '+15025550100', from: '+15025550199', tags: null, metadata: null },
})
const receipts = () => t.db.selectFrom('platform.webhook_receipts').selectAll().orderBy('seq').execute()
const webhookEvents = () =>
  t.db.selectFrom('platform.outbox_events').selectAll().where('type', '=', 'webhook.received').execute()

describe('webhook receipts (TSK-0013, ENT-WebhookReceipt, INT-Bird)', () => {
  it('stores a signed delivery once, past the staging gate, with a webhook.received outbox event', async () => {
    const res = await fetch(`${base}/webhooks/bird`, delivery(delivered('sms_test_a'), { id: 'msg_first' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'accepted' })
    const [r] = await receipts()
    expect(r).toMatchObject({
      provider: 'bird',
      delivery_id: 'msg_first',
      event_type: 'sms.delivered',
      provider_message_id: 'sms_test_a',
      signature_verified: true,
      state: 'received',
    })
    expect(r?.event_occurred_at).toEqual(new Date('2026-10-20T12:00:00Z'))
    expect(await webhookEvents()).toEqual([
      expect.objectContaining({
        aggregate_type: 'webhook_receipt',
        aggregate_id: r?.id,
        payload: { provider: 'bird', eventType: 'sms.delivered', providerMessageId: 'sms_test_a' },
      }),
    ])
  })

  it('acknowledges a replayed delivery and a repeated provider event without a second receipt', async () => {
    const before = (await receipts()).length
    const replay = await fetch(`${base}/webhooks/bird`, delivery(delivered('sms_test_a'), { id: 'msg_first' }))
    expect(replay.status).toBe(200)
    expect(await replay.json()).toEqual({ status: 'duplicate' })
    const sameEvent = await fetch(`${base}/webhooks/bird`, delivery(delivered('sms_test_a'), { id: 'msg_other_id' }))
    expect(await sameEvent.json()).toEqual({ status: 'duplicate' })
    expect(await receipts()).toHaveLength(before)
    expect(await webhookEvents()).toHaveLength(before)
  })

  it('rejects unsigned, wrongly signed, tampered and stale deliveries and stores nothing', async () => {
    const before = (await receipts()).length
    const unsigned = await fetch(`${base}/webhooks/bird`, delivery(delivered('sms_test_b'), { sign: false }))
    const other = ['whsec', Buffer.from('another-synthetic-key-0987654321').toString('base64')].join('_')
    const wrong = await fetch(`${base}/webhooks/bird`, delivery(delivered('sms_test_b'), { secret: other }))
    const tampered = delivery(delivered('sms_test_b'))
    tampered.body = tampered.body.replace('sms_test_b', 'sms_test_c')
    const changed = await fetch(`${base}/webhooks/bird`, tampered)
    const stale = await fetch(
      `${base}/webhooks/bird`,
      delivery(delivered('sms_test_b'), { ts: Math.floor(Date.now() / 1000) - 301 }),
    )
    expect([unsigned.status, wrong.status, changed.status, stale.status]).toEqual([401, 401, 401, 401])
    expect(await receipts()).toHaveLength(before)
  })

  it('answers "inbound not configured" while a provider has no signing secret', async () => {
    const res = await fetch(
      `${base}/webhooks/resend`,
      delivery({ type: 'email.delivered', data: { email_id: 'em_1' } }),
    )
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'inbound_not_configured' })
  })

  it('keeps every other route behind the staging gate', async () => {
    expect((await fetch(`${base}/webhooks/bird`, { method: 'GET' })).status).toBe(401)
    expect((await fetch(`${base}/webhooks/birds`, delivery(delivered('x')))).status).toBe(401)
  })
})

describe('sends only to approved test destinations (TSK-0013, HH-AUD-05)', () => {
  it('suppresses a send outside the allowlist before the provider is called, and logs it masked', async () => {
    const lines: string[] = []
    const log = createLogger({ level: 'info' }, { write: (s: string) => lines.push(s) })
    const fake = new FakeSmsSender()
    const email = new FakeEmailSender()
    const policy = destinationPolicy({
      environment: 'staging',
      testDestinations: { emails: ['owner.test@example.com'], phones: ['+15025550199'] },
    })
    const sms = guardSms(fake, policy, log)
    const mail = guardEmail(email, policy, log)
    expect(
      await sms.send({ to: '+15025551234', text: 'Synthetic', category: 'transactional', idempotencyKey: 'k-sms-1' }),
    ).toEqual({
      outcome: 'suppressed',
      reason: 'not_on_test_allowlist',
    })
    expect(
      await mail.send({ to: 'someone@example.test', subject: 's', text: 't', idempotencyKey: 'k-mail-1' }),
    ).toMatchObject({ outcome: 'suppressed' })
    expect(fake.calls).toEqual([])
    expect(email.calls).toEqual([])
    expect(lines.join('')).not.toContain('5025551234')
    expect(lines.join('')).not.toContain('someone@')
    expect(lines.join('')).toContain('send suppressed')
    expect(
      await sms.send({ to: '+15025550199', text: 'Synthetic', category: 'transactional', idempotencyKey: 'k-sms-2' }),
    ).toMatchObject({ outcome: 'accepted' })
    expect(fake.sent).toHaveLength(1)
  })

  it('sends once for a duplicate send key, also when a queued job retries after a failure', async () => {
    const providers = createProviders(readProviderSettings({ HANDYHUB_ENV: 'ci' }))
    const sms = providers.sms
    const fakeSms = providers.fakes.sms
    if (!sms || !fakeSms) throw new Error('ci uses the fake SMS sender')
    const first = await sms.send({
      to: '+15025550101',
      text: 'Synthetic',
      category: 'transactional',
      idempotencyKey: 'dup-key-1',
    })
    const second = await sms.send({
      to: '+15025550101',
      text: 'Synthetic',
      category: 'transactional',
      idempotencyKey: 'dup-key-1',
    })
    expect(second).toEqual(first)
    expect(fakeSms.sent).toHaveLength(1)

    // A consumer that sends, then fails before its job commits: the retry reuses the job key, so one text goes out.
    const notify: Automation = {
      name: 'synthetic_notice.send',
      trigger: { kind: 'event', eventTypes: ['request.submitted'] },
      identity: 'system.synthetic_notice',
      inputs: { description: 'request id', version: 1 },
      idempotency: 'job key passed to Bird as the Idempotency-Key',
      effect: 'one text to the synthetic number',
      retry: { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 1 },
      timeoutMs: 5000,
      exceptionOwner: 'office',
      audit: { action: 'synthetic_notice.sent' },
      handle: async (ctx) => {
        const out = await sms.send({
          to: '+15025550102',
          text: 'Synthetic',
          category: 'transactional',
          idempotencyKey: ctx.idempotencyKey,
        })
        if (out.outcome !== 'accepted') throw new Error(out.outcome)
        if (ctx.job.attempt === 1) throw Object.assign(new Error('crash after send'), { name: 'SyntheticCrash' })
        return undefined
      },
    }
    await withTx(t.db, (tx) =>
      outbox.add(tx, {
        type: 'request.submitted',
        aggregate: { type: 'request', id: 'r-sms' },
        idempotencyKey: 'request.submitted:r-sms',
        requestId: 'req-providers-1',
      }),
    )
    const worker = createWorker({ db: t.db, registry: createAutomationRegistry([notify]) })
    await worker.runOnce()
    await new Promise((r) => setTimeout(r, 15))
    expect(await worker.runOnce()).toMatchObject({ succeeded: 1 })
    expect(fakeSms.calls.filter((c) => c.to === '+15025550102')).toHaveLength(2)
    expect(fakeSms.sent.filter((c) => c.to === '+15025550102')).toHaveLength(1)
  })
})
