// Inbound email and texts from the stored webhook receipts (TSK-0049; HH-COM-10, INT-Bird, INT-Resend, OWN-DEC-129).
// Written from the providers' references:
// - Bird `sms.received` (guides/sms/events): `data` carries `sms_id`, the subscriber's number in `from`, the business
//   number in `to`, the body in `text` (absent when the message carried only attachments) and `attachments`.
// - Resend `email.received` (webhooks/emails/received): the webhook carries metadata only (`email_id`, the bare
//   sender address in `from`, `to`, `cc`, `received_for`, `subject`, `message_id` and attachment metadata); the body
//   and headers are read with GET /emails/receiving/{id} (api-reference/emails/retrieve-received-email). That read
//   needs the Resend API key; while e-mail is NOT CONFIGURED the body is recorded as not retrieved, never invented.
// Nothing here logs an address, a subject or a body.
import { codePart, fetchFailure, type Secret } from './types.js'

export const RESEND_INBOUND_TIMEOUT_MS = 12_000

/** Bodies longer than this are kept truncated (PROPOSED engineering limit; the database allows 100 000). */
export const INBOUND_BODY_MAX = 50_000

export type InboundAttachment = { contentType: string; size: number | null }

export type BirdInboundSms = {
  smsId: string
  from: string
  to: string | null
  text: string | null
  attachments: InboundAttachment[]
}

export type ResendInboundEmail = {
  emailId: string
  from: string
  to: string[]
  subject: string | null
  messageId: string | null
  attachments: InboundAttachment[]
}

const E164 = /^\+[1-9]\d{7,14}$/
const EMAIL = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null)

/** The bare, lower-case address of `Name <a@b.example>` or `a@b.example`; null when it is not one address. */
export function bareAddress(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const m = /<([^<>]+)>\s*$/.exec(value)
  const candidate = (m ? (m[1] as string) : value).trim().toLowerCase()
  return candidate.length <= 320 && EMAIL.test(candidate) ? candidate : null
}

function addresses(...values: unknown[]): string[] {
  const out = new Set<string>()
  for (const v of values)
    for (const item of Array.isArray(v) ? v : [v]) {
      const a = bareAddress(item)
      if (a) out.add(a)
    }
  return [...out].slice(0, 50)
}

function attachmentsOf(v: unknown): InboundAttachment[] {
  if (!Array.isArray(v)) return []
  return v.slice(0, 100).map((a) => {
    const o = obj(a)
    const type = str(o['content_type']) ?? str(o['contentType']) ?? str(o['mime_type'])
    const size = o['size']
    return {
      contentType: type && /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(type) ? type.toLowerCase().slice(0, 100) : 'unknown',
      size: typeof size === 'number' && Number.isSafeInteger(size) && size >= 0 ? size : null,
    }
  })
}

/** A Bird `sms.received` event; null when it lacks the message ID or a valid sender number. */
export function parseBirdInboundSms(payload: Record<string, unknown>): BirdInboundSms | null {
  const d = obj(payload['data'])
  const smsId = str(d['sms_id'])
  const from = str(d['from'])
  if (!smsId || smsId.length > 200 || !from || !E164.test(from)) return null
  const to = str(d['to'])
  const text = typeof d['text'] === 'string' ? d['text'] : typeof d['body'] === 'string' ? d['body'] : null
  return { smsId, from, to: to && E164.test(to) ? to : null, text, attachments: attachmentsOf(d['attachments']) }
}

/** A Resend `email.received` event; null when it lacks the email ID or a valid sender address. */
export function parseResendInboundEmail(payload: Record<string, unknown>): ResendInboundEmail | null {
  const d = obj(payload['data'])
  const emailId = str(d['email_id'])
  const from = bareAddress(d['from'])
  if (!emailId || emailId.length > 200 || !from) return null
  const subject = str(d['subject'])
  const messageId = str(d['message_id'])
  return {
    emailId,
    from,
    to: addresses(d['to'], d['cc'], d['received_for']),
    subject: subject ? subject.slice(0, 1000) : null,
    messageId: messageId && messageId.length <= 1000 ? messageId.trim() : null,
    attachments: attachmentsOf(d['attachments']),
  }
}

/** The message IDs of an In-Reply-To or References header value (`<a@b> <c@d>`). */
export function messageIds(value: unknown): string[] {
  if (typeof value !== 'string') return []
  return [...value.matchAll(/<[^<>\s]{1,998}>/g)].map((m) => m[0]).slice(0, 100)
}

export type InboundEmailContent =
  | { outcome: 'ok'; text: string | null; html: string | null; headers: Record<string, string> }
  /** Temporary: retry the read. */
  | { outcome: 'retryable_error'; errorCode: string }
  /** The provider has no such email, or refused the read; a retry would not change it. */
  | { outcome: 'failed'; errorCode: string }

export interface InboundEmailReader {
  readonly provider: 'resend' | 'fake'
  /** Reads the body and headers of a received email. The receipt payload is passed for the fake only. */
  read(emailId: string, payload: Record<string, unknown>): Promise<InboundEmailContent>
}

function headerMap(v: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (Array.isArray(v)) {
    // [{ name, value }] form.
    for (const h of v) {
      const o = obj(h)
      const name = str(o['name'])
      const value = str(o['value'])
      if (name && value) out[name.toLowerCase()] = value.slice(0, 10_000)
    }
    return out
  }
  for (const [k, value] of Object.entries(obj(v)))
    if (typeof value === 'string') out[k.toLowerCase()] = value.slice(0, 10_000)
  return out
}

/** GET {base}/emails/receiving/{id} with the Resend API key. */
export class ResendInboundReader implements InboundEmailReader {
  readonly provider = 'resend' as const
  constructor(
    private readonly settings: { apiKey: Secret; apiBaseUrl: string },
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs = RESEND_INBOUND_TIMEOUT_MS,
  ) {}

  async read(emailId: string): Promise<InboundEmailContent> {
    if (!/^[A-Za-z0-9_-]{1,200}$/.test(emailId)) return { outcome: 'failed', errorCode: 'invalid_request' }
    let res: Response
    try {
      res = await this.fetchImpl(`${this.settings.apiBaseUrl}/emails/receiving/${encodeURIComponent(emailId)}`, {
        method: 'GET',
        headers: { authorization: `Bearer ${this.settings.apiKey.reveal()}`, accept: 'application/json' },
        signal: AbortSignal.timeout(this.timeoutMs),
        redirect: 'error',
      })
    } catch (err) {
      // A read has no side effect, so an unknown outcome is simply retried.
      const failure = fetchFailure(err)
      return { outcome: 'retryable_error', errorCode: 'errorCode' in failure ? failure.errorCode : 'network_error' }
    }
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null
    if (res.ok && body) {
      const text = typeof body['text'] === 'string' ? body['text'] : null
      const html = typeof body['html'] === 'string' ? body['html'] : null
      return { outcome: 'ok', text, html, headers: headerMap(body['headers']) }
    }
    const name = typeof body?.['name'] === 'string' && /^[a-z_]{1,40}$/.test(body['name']) ? body['name'] : null
    const errorCode = `http_${res.status}${name ? `_${codePart(name)}` : ''}`
    if (res.ok || res.status === 429 || res.status >= 500) return { outcome: 'retryable_error', errorCode }
    return { outcome: 'failed', errorCode }
  }
}

/**
 * Local and ci only: reads nothing from anywhere. A synthetic test payload may carry the content the provider would
 * return (`data.text`, `data.html`, `data.headers`); otherwise the email has no body.
 */
export class FakeInboundReader implements InboundEmailReader {
  readonly provider = 'fake' as const
  readonly calls: string[] = []
  readonly #scripted: InboundEmailContent[] = []

  script(...results: InboundEmailContent[]): void {
    this.#scripted.push(...results)
  }

  async read(emailId: string, payload: Record<string, unknown>): Promise<InboundEmailContent> {
    this.calls.push(emailId)
    const next = this.#scripted.shift()
    if (next) return next
    const d = obj(payload['data'])
    return {
      outcome: 'ok',
      text: typeof d['text'] === 'string' ? d['text'] : null,
      html: typeof d['html'] === 'string' ? d['html'] : null,
      headers: headerMap(d['headers']),
    }
  }
}

/** Plain text from an HTML-only email: tags and scripts removed, common entities decoded; never rendered as HTML. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|head)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
