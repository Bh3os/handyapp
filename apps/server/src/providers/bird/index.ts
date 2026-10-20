// Bird SMS adapter and fake (TSK-0013; INT-Bird, OWN-DEC-129). Written from Bird's API reference
// (POST /v1/sms/messages, guides/sms/sending-sms, api/idempotency, guides/sms/events).
// - BirdSmsSender: free-text send with `from`, `category` and an Idempotency-Key (Bird replays the first response for
//   a repeated key within its window). 2xx with an id = accepted. 429, 5xx (including 503 IdempotencyUnavailable)
//   and 409 request_in_progress are temporary; 409 idempotency_key_reuse and other 4xx (402 balance, 422 invalid)
//   are rejections; a connect failure is temporary; a timeout or dropped connection is "outcome unknown".
// - FakeSmsSender: local and ci only, in memory, same idempotency behaviour.
// - mapBirdStatus / mapBirdEvent: Bird message statuses and sms.* event types onto our delivery states.
import { randomUUID } from 'node:crypto'
import type { SmsSettings } from '../settings.js'
import {
  codePart,
  fetchFailure,
  IDEMPOTENCY_KEY,
  type DeliveryStatus,
  type SendOutcome,
  type SmsMessage,
  type SmsSender,
} from '../types.js'

export const BIRD_TIMEOUT_MS = 12_000

type BirdBody = { id?: unknown; status?: unknown; code?: unknown; error?: unknown }

export class BirdSmsSender implements SmsSender {
  readonly provider = 'bird' as const
  constructor(
    private readonly settings: Extract<SmsSettings, { adapter: 'bird' }>,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs = BIRD_TIMEOUT_MS,
  ) {}

  async send(message: SmsMessage): Promise<SendOutcome> {
    if (!IDEMPOTENCY_KEY.test(message.idempotencyKey)) return { outcome: 'rejected', errorCode: 'invalid_request' }
    let res: Response
    try {
      res = await this.fetchImpl(`${this.settings.apiBaseUrl}/v1/sms/messages`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.settings.apiKey.reveal()}`,
          'content-type': 'application/json',
          accept: 'application/json',
          'idempotency-key': message.idempotencyKey,
        },
        body: JSON.stringify({
          to: message.to,
          from: this.settings.from,
          text: message.text,
          category: message.category,
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
        redirect: 'error',
      })
    } catch (err) {
      return fetchFailure(err)
    }
    const body = (await res.json().catch(() => null)) as BirdBody | null
    if (res.ok) {
      const id = body?.id
      if (typeof id === 'string' && id.length >= 1 && id.length <= 200) {
        const status = typeof body?.status === 'string' ? mapBirdStatus(body.status) : null
        return { outcome: 'accepted', providerMessageId: id, status: status ?? 'queued' }
      }
      return { outcome: 'outcome_unknown', errorCode: 'malformed_response' }
    }
    // Only a fixed error code is kept; descriptions can repeat the number or the text.
    const raw = typeof body?.code === 'string' ? body.code : typeof body?.error === 'string' ? body.error : null
    const providerCode = raw && /^[A-Za-z0-9_]{1,60}$/.test(raw) ? raw : null
    const errorCode = `http_${res.status}${providerCode ? `_${codePart(providerCode)}` : ''}`
    if (res.status === 429 || res.status >= 500 || providerCode === 'request_in_progress')
      return { outcome: 'retryable_error', errorCode }
    return { outcome: 'rejected', errorCode }
  }
}

export type FakeSentSms = SmsMessage & { providerMessageId: string }

/** Local and ci only: records texts, contacts nobody. */
export class FakeSmsSender implements SmsSender {
  readonly provider = 'fake' as const
  readonly sent: FakeSentSms[] = []
  readonly calls: SmsMessage[] = []
  readonly #scripted: (SendOutcome | Error)[] = []

  script(...results: (SendOutcome | Error)[]): void {
    this.#scripted.push(...results)
  }

  async send(message: SmsMessage): Promise<SendOutcome> {
    this.calls.push(message)
    const next = this.#scripted.shift()
    if (next instanceof Error) throw next
    if (next && next.outcome !== 'accepted') return next
    const earlier = this.sent.find((m) => m.idempotencyKey === message.idempotencyKey)
    if (earlier) return { outcome: 'accepted', providerMessageId: earlier.providerMessageId, status: 'queued' }
    const providerMessageId = `fake-sms-${randomUUID()}`
    this.sent.push({ ...message, providerMessageId })
    return { outcome: 'accepted', providerMessageId, status: 'queued' }
  }
}

/** Bird message statuses onto our delivery states; null for inbound (`received`) and unknown statuses. */
export function mapBirdStatus(status: string): DeliveryStatus | null {
  switch (status) {
    case 'scheduled':
    case 'accepted':
      return 'queued'
    case 'sent':
      return 'sent'
    case 'delivered':
      return 'delivered'
    case 'undelivered':
    case 'failed':
    case 'rejected':
    case 'expired':
    case 'canceled':
      return 'failed'
    default:
      return null
  }
}

/** `sms.<status>` event types onto our delivery states (Bird's event types are an open enum: unknown -> null). */
export function mapBirdEvent(type: string): DeliveryStatus | null {
  return type.startsWith('sms.') ? mapBirdStatus(type.slice(4)) : null
}

/** The message ID of a Bird SMS event (`data.sms_id`), if any. */
export function birdMessageId(payload: Record<string, unknown>): string | null {
  const data = payload['data'] as { sms_id?: unknown } | undefined
  return typeof data?.sms_id === 'string' ? data.sms_id : null
}
