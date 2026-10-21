// Provider webhooks (TSK-0013; ENT-WebhookReceipt, INT-Bird, INT-Resend, HH-ARC-09, HH-COM-10).
// - Verification follows Standard Webhooks, which both Bird (webhook-id / webhook-timestamp / webhook-signature) and
//   Resend (the same scheme under svix-* header names) use: HMAC-SHA256 over `{id}.{timestamp}.{raw body}`, keyed with
//   the endpoint secret minus its `whsec_` prefix, base64-decoded; the signature header may hold several space-
//   separated `v1,<base64>` entries (secret rotation). The raw bytes are verified before anything parses them, and a
//   timestamp more than 5 minutes from now (either way) is refused, so a captured delivery cannot be replayed later.
// - A verified delivery is stored once in platform.webhook_receipts (unique delivery ID, and unique provider message
//   ID per event type) together with a `webhook.received` outbox event in the same transaction; the status and
//   inbound handlers of later tasks consume those events. A duplicate is acknowledged with 200 and has no effect.
// - While a provider's signing secret is unset its endpoint answers 503 "inbound not configured".
// - TSK-0049 (HH-COM-10): each endpoint is rate-limited per client network before anything else runs (PROPOSED
//   engineering default WEBHOOK_RATE_LIMIT; a limited call answers 429 with Retry-After, and the provider retries).
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { withTx, type Db, type Tx } from '@handyhub/db'
import type { FastifyInstance } from 'fastify'
import { RateLimiter } from '../api/rate-limit.js'
import { outbox } from '../platform/outbox.js'
import { birdMessageId } from './bird/index.js'
import { resendMessageId } from './resend/index.js'
import type { Secret } from './types.js'

export const WEBHOOK_TOLERANCE_SECONDS = 300
/**
 * PROPOSED engineering default (no owner decision sets it): 600 deliveries a minute per provider and client network,
 * well above two staff members' traffic and still a ceiling for a flood of forged calls.
 */
export const WEBHOOK_RATE_LIMIT = { limit: 600, windowSeconds: 60 } as const
export type WebhookProvider = 'bird' | 'resend'

export type WebhookRejection =
  'missing_headers' | 'invalid_timestamp' | 'timestamp_out_of_tolerance' | 'invalid_signature' | 'invalid_secret'

export class WebhookVerificationError extends Error {
  override name = 'WebhookVerificationError'
  constructor(readonly reason: WebhookRejection) {
    super(`webhook rejected: ${reason}`)
  }
}

type Headers = Record<string, string | string[] | undefined>

function header(headers: Headers, name: string): string | undefined {
  const v = headers[name]
  return Array.isArray(v) ? v[0] : v
}

export function signingKey(secret: string): Buffer {
  const key = Buffer.from(secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret, 'base64')
  if (key.length < 16) throw new WebhookVerificationError('invalid_secret')
  return key
}

/** The Standard Webhooks signature of a delivery, as sent in the signature header (`v1,<base64>`). */
export function signWebhook(secret: string, id: string, timestamp: number, rawBody: Buffer | string): string {
  const mac = createHmac('sha256', signingKey(secret)).update(`${id}.${timestamp}.`).update(rawBody).digest('base64')
  return `v1,${mac}`
}

/** Verifies one delivery; returns its delivery ID and timestamp, or throws WebhookVerificationError. */
export function verifyStandardWebhook(input: {
  secret: string
  headers: Headers
  rawBody: Buffer
  nowSeconds?: number
  toleranceSeconds?: number
}): { deliveryId: string; timestamp: number } {
  const h = input.headers
  const id = header(h, 'webhook-id') ?? header(h, 'svix-id')
  const ts = header(h, 'webhook-timestamp') ?? header(h, 'svix-timestamp')
  const sig = header(h, 'webhook-signature') ?? header(h, 'svix-signature')
  if (!id || !ts || !sig || id.length > 200 || sig.length > 4096) throw new WebhookVerificationError('missing_headers')
  if (!/^\d{1,12}$/.test(ts)) throw new WebhookVerificationError('invalid_timestamp')
  const timestamp = Number(ts)
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000)
  if (Math.abs(now - timestamp) > (input.toleranceSeconds ?? WEBHOOK_TOLERANCE_SECONDS))
    throw new WebhookVerificationError('timestamp_out_of_tolerance')
  const expected = Buffer.from(signWebhook(input.secret, id, timestamp, input.rawBody).slice(3), 'base64')
  const ok = sig.split(' ').some((part) => {
    if (!part.startsWith('v1,')) return false
    const given = Buffer.from(part.slice(3), 'base64')
    return given.length === expected.length && timingSafeEqual(given, expected)
  })
  if (!ok) throw new WebhookVerificationError('invalid_signature')
  return { deliveryId: id, timestamp }
}

export type WebhookReceiptInput = {
  provider: WebhookProvider
  deliveryId: string
  eventType: string
  providerMessageId: string | null
  eventOccurredAt: Date | null
  payload: Record<string, unknown>
  rawBody: Buffer
}

/** Stores a verified delivery once and announces it through the outbox. A repeat returns the first receipt. */
export async function recordWebhookReceipt(
  tx: Tx,
  r: WebhookReceiptInput,
): Promise<{ id: string; duplicate: boolean }> {
  const inserted = await tx
    .insertInto('platform.webhook_receipts')
    .values({
      provider: r.provider,
      delivery_id: r.deliveryId,
      event_type: r.eventType,
      provider_message_id: r.providerMessageId,
      event_occurred_at: r.eventOccurredAt,
      signature_verified: true,
      payload: JSON.stringify(r.payload),
      payload_sha256: createHash('sha256').update(r.rawBody).digest('hex'),
    })
    .onConflict((oc) => oc.doNothing())
    .returning('id')
    .executeTakeFirst()
  if (!inserted) {
    let q = tx.selectFrom('platform.webhook_receipts').select('id').where('provider', '=', r.provider)
    q = q.where((eb) =>
      r.providerMessageId === null
        ? eb('delivery_id', '=', r.deliveryId)
        : eb.or([
            eb('delivery_id', '=', r.deliveryId),
            eb.and([eb('provider_message_id', '=', r.providerMessageId), eb('event_type', '=', r.eventType)]),
          ]),
    )
    const existing = await q.executeTakeFirstOrThrow()
    return { id: existing.id, duplicate: true }
  }
  await outbox.add(tx, {
    type: 'webhook.received',
    aggregate: { type: 'webhook_receipt', id: inserted.id },
    payload: { provider: r.provider, eventType: r.eventType, providerMessageId: r.providerMessageId },
    idempotencyKey: `webhook.received:${r.provider}:${inserted.id}`,
  })
  return { id: inserted.id, duplicate: false }
}

export type WebhookRouteOptions = {
  db: Db
  secrets: { bird: Secret | null; resend: Secret | null }
  /** Seconds since the epoch; tests pin it. */
  nowSeconds?: () => number
  /** Default WEBHOOK_RATE_LIMIT; tests lower it. */
  rateLimit?: { limit: number; windowSeconds: number }
  /** Proxies in front of the service (TRUST_PROXY_HOPS), for the client network the limit counts. */
  trustProxyHops?: number
}

const MESSAGE_ID: Record<WebhookProvider, (p: Record<string, unknown>) => string | null> = {
  bird: birdMessageId,
  resend: resendMessageId,
}

/** POST /webhooks/bird and /webhooks/resend, with the raw body kept for verification (64 KiB at most). */
export async function registerWebhookRoutes(app: FastifyInstance, options: WebhookRouteOptions): Promise<void> {
  const limiter = new RateLimiter(options.db, options.trustProxyHops ?? 0)
  const rule = options.rateLimit ?? WEBHOOK_RATE_LIMIT
  await app.register(async (scope) => {
    scope.addContentTypeParser('application/json', { parseAs: 'buffer', bodyLimit: 65_536 }, (_req, body, done) =>
      done(null, body),
    )
    for (const provider of ['bird', 'resend'] as const) {
      scope.post(`/webhooks/${provider}`, async (req, reply) => {
        const limited = await limiter.consume(
          { bucket: `webhook_${provider}`, limit: rule.limit, windowSeconds: rule.windowSeconds },
          limiter.callerKey(req, { kind: 'guest' }),
        )
        if (!limited.allowed) {
          req.log.warn({ provider, reason: 'rate_limited' }, 'webhook rejected')
          return reply
            .code(429)
            .header('retry-after', String(limited.retryAfterSeconds))
            .send({ error: 'rate_limited' })
        }
        const secret = options.secrets[provider]
        if (!secret) return reply.code(503).send({ error: 'inbound_not_configured' })
        const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0)
        let deliveryId: string
        try {
          deliveryId = verifyStandardWebhook({
            secret: secret.reveal(),
            headers: req.headers,
            rawBody,
            ...(options.nowSeconds ? { nowSeconds: options.nowSeconds() } : {}),
          }).deliveryId
        } catch (err) {
          const reason = err instanceof WebhookVerificationError ? err.reason : 'invalid_signature'
          req.log.warn({ provider, reason }, 'webhook rejected')
          return reply.code(401).send({ error: 'invalid_webhook' })
        }
        let payload: Record<string, unknown>
        try {
          const parsed: unknown = JSON.parse(rawBody.toString('utf8'))
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object')
          payload = parsed as Record<string, unknown>
        } catch {
          req.log.warn({ provider, reason: 'invalid_body' }, 'webhook rejected')
          return reply.code(400).send({ error: 'invalid_body' })
        }
        const type = typeof payload['type'] === 'string' ? payload['type'] : ''
        if (!/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/.test(type)) return reply.code(400).send({ error: 'invalid_body' })
        const occurred = typeof payload['created_at'] === 'string' ? payload['created_at'] : payload['timestamp']
        const occurredAt =
          typeof occurred === 'string' && !Number.isNaN(Date.parse(occurred)) ? new Date(occurred) : null
        const receipt = await withTx(options.db, (tx) =>
          recordWebhookReceipt(tx, {
            provider,
            deliveryId,
            eventType: type,
            providerMessageId: MESSAGE_ID[provider](payload),
            eventOccurredAt: occurredAt,
            payload,
            rawBody,
          }),
        )
        req.log.info(
          { provider, eventType: type, receipt: receipt.id, duplicate: receipt.duplicate },
          'webhook received',
        )
        return reply.code(200).send({ status: receipt.duplicate ? 'duplicate' : 'accepted' })
      })
    }
  })
}
