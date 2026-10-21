// Shared provider types (TSK-0013; HH-ARC-09, HH-COM-02). A sender hands one message to its provider and answers
// with what happened. It never throws for a provider answer, and nothing it returns carries the address, the body or
// a credential: only an outcome, the provider message ID and a short error code.
import { inspect } from 'node:util'
import { REDACTED } from '../platform/redact.js'

/** Our delivery states (INT-Bird: queued, sent, delivered or failed); each provider's own words map onto them. */
export type DeliveryStatus = 'queued' | 'sent' | 'delivered' | 'failed'

export type SendOutcome =
  | { outcome: 'accepted'; providerMessageId: string; status: DeliveryStatus }
  /** Never handed to the provider: outside the test allowlist, or not a valid destination. */
  | { outcome: 'suppressed'; reason: 'not_on_test_allowlist' | 'invalid_destination' }
  /** The request did not take effect; retry with the same idempotency key. */
  | { outcome: 'retryable_error'; errorCode: string }
  /** The provider refused it; a retry would fail the same way. */
  | { outcome: 'rejected'; errorCode: string }
  /** The request may have reached the provider; reconcile, or retry only with the same key. */
  | { outcome: 'outcome_unknown'; errorCode: string }

export type EmailMessage = {
  to: string
  subject: string
  text: string
  html?: string
  /** Codes only (ASCII letters, digits, '_' and '-'), never personal data. */
  tags?: { name: string; value: string }[]
  /** The same key on every retry, so the provider never sends twice. */
  idempotencyKey: string
  /**
   * TSK-0049: the project's plus-addressed reply address (its reply token), so a reply threads back to the project.
   * Unset: the configured EMAIL_REPLY_TO, if any.
   */
  replyTo?: string
}

export type SmsMessage = {
  /** E.164, for example +15025550100. */
  to: string
  text: string
  category: 'transactional' | 'authentication' | 'service' | 'marketing'
  idempotencyKey: string
}

export interface EmailSender {
  readonly provider: 'resend' | 'fake'
  send(message: EmailMessage): Promise<SendOutcome>
}

export interface SmsSender {
  readonly provider: 'bird' | 'fake'
  send(message: SmsMessage): Promise<SendOutcome>
}

export const IDEMPOTENCY_KEY = /^[A-Za-z0-9_:./-]{1,256}$/
export const TAG_PART = /^[A-Za-z0-9_-]{1,32}$/

/** A provider word as an error-code part: lower-case letters, digits and underscores only. */
export function codePart(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .slice(0, 40)
}

/** Errors raised before a connection exists: the request never reached the provider, so a retry cannot duplicate. */
export const CONNECT_ERRORS = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'UND_ERR_CONNECT_TIMEOUT',
])

/** Maps a fetch failure: connect errors are retryable; anything after the request may have arrived is unknown. */
export function fetchFailure(err: unknown): SendOutcome {
  const cause = (err as { cause?: { code?: unknown } }).cause
  const code = typeof cause?.code === 'string' ? cause.code : ''
  if (CONNECT_ERRORS.has(code)) return { outcome: 'retryable_error', errorCode: `connect_${codePart(code)}` }
  const name = (err as { name?: unknown }).name
  return { outcome: 'outcome_unknown', errorCode: name === 'TimeoutError' ? 'timeout' : 'network_error' }
}

/** A credential: readable only through reveal(); printing, logging or serialising it shows '[REDACTED]'. */
export class Secret {
  readonly #value: string
  constructor(value: string) {
    this.#value = value
  }
  reveal(): string {
    return this.#value
  }
  toString(): string {
    return REDACTED
  }
  toJSON(): string {
    return REDACTED
  }
  [inspect.custom](): string {
    return REDACTED
  }
}
