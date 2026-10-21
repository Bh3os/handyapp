// Resend email adapter and fake (TSK-0013; INT-Resend, OWN-DEC-60, OWN-DEC-129). Adapted from Bh3os/handyhub-app
// (apps/server/src/platform/email/transport.ts).
// - ResendEmailSender: POST {base}/emails with Bearer authentication and an Idempotency-Key, so a retry with the same
//   key cannot send twice. 200 with an id = accepted. 429, 5xx and 409 concurrent_idempotent_requests are temporary;
//   other 4xx are rejections; a connect failure is temporary; a timeout or dropped connection is "outcome unknown".
//   The sender (EMAIL_FROM) and reply-to belong to the configuration, never to a caller.
// - FakeEmailSender: local and ci only. Contacts nobody, keeps messages in memory, and like the provider answers a
//   repeated idempotency key with the first result instead of sending again.
// - mapResendEvent: Resend webhook event types onto our delivery states.
import { randomUUID } from 'node:crypto'
import type { EmailSettings } from '../settings.js'
import {
  codePart,
  fetchFailure,
  IDEMPOTENCY_KEY,
  TAG_PART,
  type DeliveryStatus,
  type EmailMessage,
  type EmailSender,
  type SendOutcome,
} from '../types.js'

export const RESEND_TIMEOUT_MS = 12_000

export class ResendEmailSender implements EmailSender {
  readonly provider = 'resend' as const
  constructor(
    private readonly settings: Extract<EmailSettings, { adapter: 'resend' }>,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs = RESEND_TIMEOUT_MS,
  ) {}

  async send(message: EmailMessage): Promise<SendOutcome> {
    if (!IDEMPOTENCY_KEY.test(message.idempotencyKey)) return { outcome: 'rejected', errorCode: 'invalid_request' }
    if (message.tags?.some((t) => !TAG_PART.test(t.name) || !TAG_PART.test(t.value)))
      return { outcome: 'rejected', errorCode: 'invalid_request' }
    let res: Response
    try {
      res = await this.fetchImpl(`${this.settings.apiBaseUrl}/emails`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.settings.apiKey.reveal()}`,
          'content-type': 'application/json',
          accept: 'application/json',
          'idempotency-key': message.idempotencyKey,
        },
        body: JSON.stringify({
          from: this.settings.from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          ...(message.html ? { html: message.html } : {}),
          ...((message.replyTo ?? this.settings.replyTo) ? { reply_to: message.replyTo ?? this.settings.replyTo } : {}),
          ...(message.tags?.length ? { tags: message.tags } : {}),
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
        redirect: 'error',
      })
    } catch (err) {
      return fetchFailure(err)
    }
    if (res.ok) {
      const data = (await res.json().catch(() => null)) as { id?: unknown } | null
      const id = data?.id
      if (typeof id === 'string' && id.length >= 1 && id.length <= 200)
        return { outcome: 'accepted', providerMessageId: id, status: 'queued' }
      // Accepted by status code but without the reference that proves it: never claimed as sent.
      return { outcome: 'outcome_unknown', errorCode: 'malformed_response' }
    }
    // Error bodies are {statusCode, name, message}; only the fixed name is kept (the message can repeat an address).
    const body = (await res.json().catch(() => null)) as { name?: unknown } | null
    const providerName = typeof body?.name === 'string' && /^[a-z_]{1,40}$/.test(body.name) ? body.name : null
    const errorCode = `http_${res.status}${providerName ? `_${codePart(providerName)}` : ''}`
    if (res.status === 429 || res.status >= 500 || providerName === 'concurrent_idempotent_requests')
      return { outcome: 'retryable_error', errorCode }
    return { outcome: 'rejected', errorCode }
  }
}

export type FakeSentEmail = EmailMessage & { providerMessageId: string }

/** Local and ci only: records messages, contacts nobody. */
export class FakeEmailSender implements EmailSender {
  readonly provider = 'fake' as const
  readonly sent: FakeSentEmail[] = []
  /** Every hand-over, including scripted failures. */
  readonly calls: EmailMessage[] = []
  readonly #scripted: (SendOutcome | Error)[] = []

  /** Test hook: the next answers, in order (an Error is thrown, as a crashed call would). */
  script(...results: (SendOutcome | Error)[]): void {
    this.#scripted.push(...results)
  }

  async send(message: EmailMessage): Promise<SendOutcome> {
    this.calls.push(message)
    const next = this.#scripted.shift()
    if (next instanceof Error) throw next
    if (next && next.outcome !== 'accepted') return next
    const earlier = this.sent.find((m) => m.idempotencyKey === message.idempotencyKey)
    if (earlier) return { outcome: 'accepted', providerMessageId: earlier.providerMessageId, status: 'queued' }
    const providerMessageId = `fake-email-${randomUUID()}`
    this.sent.push({ ...message, providerMessageId })
    return { outcome: 'accepted', providerMessageId, status: 'queued' }
  }
}

/**
 * Resend webhook event types onto our delivery states; null for events that are not a delivery state (opened,
 * clicked, received, complained). The raw type stays on the webhook receipt.
 */
export function mapResendEvent(type: string): DeliveryStatus | null {
  switch (type) {
    case 'email.scheduled':
      return 'queued'
    case 'email.sent':
    case 'email.delivery_delayed':
      return 'sent'
    case 'email.delivered':
      return 'delivered'
    case 'email.bounced':
    case 'email.failed':
    case 'email.suppressed':
      return 'failed'
    default:
      return null
  }
}

/** The message ID of a Resend event (`data.email_id`), if any. */
export function resendMessageId(payload: Record<string, unknown>): string | null {
  const data = payload['data'] as { email_id?: unknown } | undefined
  return typeof data?.email_id === 'string' ? data.email_id : null
}
