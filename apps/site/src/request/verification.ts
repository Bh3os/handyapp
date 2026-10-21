// Contact verification on the receipt (TSK-0033; HH-INT-13, HH-ID-03, HH-INT-14, OWN-DEC-94, OWN-DEC-96,
// RULE-SERVER-AUTHZ, RULE-LANGUAGES). Pure functions and the API calls, shared by the React panel and its unit tests.
// - Every call carries the receipt capability this tab got with the saved request (Receipt-Capability); the server
//   answers only about the request's own contact. A reference number is never sent.
// - The server says what each channel's state is; this file only turns its answers into the customer's words. Every
//   wrong, expired or used code gets the same message, so the page never says which.
import { customerTranslator, type CustomerKey } from '@handyhub/i18n'
import type { StatusTone } from '@handyhub/ui'

const t = (key: CustomerKey, values?: Record<string, string | number>) => customerTranslator().t(key, values)

export const CHANNELS = ['email', 'phone'] as const
export type Channel = (typeof CHANNELS)[number]
export type VerificationState = 'unverified' | 'pending' | 'verified' | 'expired' | 'failed'
export type ChannelStatus = {
  destination: string
  state: VerificationState
  available: boolean
  change: { destination: string; state: 'pending' | 'expired' | 'failed' } | null
}
export type ContactStatus = Record<Channel, ChannelStatus>

/** The capability token as the server issues it (43 base64url characters). */
export const CAPABILITY_PATTERN = /^[A-Za-z0-9_-]{43}$/
export const CAPABILITY_HEADER = 'receipt-capability'

export const STATE_LABEL: Record<VerificationState, CustomerKey> = {
  unverified: 'request.verify.state.unverified',
  pending: 'request.verify.state.pending',
  verified: 'request.verify.state.verified',
  expired: 'request.verify.state.expired',
  failed: 'request.verify.state.failed',
}
export const STATE_TONE: Record<VerificationState, StatusTone> = {
  unverified: 'neutral',
  pending: 'info',
  verified: 'success',
  expired: 'warning',
  failed: 'warning',
}
export const CHANNEL_LABEL: Record<Channel, CustomerKey> = {
  email: 'request.verify.email',
  phone: 'request.verify.phone',
}

/** A message for the customer: the catalog key and its values. */
export type Notice = { key: CustomerKey; values?: Record<string, string | number> }
export const noticeText = (n: Notice) => t(n.key, n.values)

type ErrorBody = { error?: { code?: string; fieldErrors?: { field?: string; code?: string }[] } } | null

/** The server's refusal in the customer's words (never which of several code failures it was). */
export function problemNotice(status: number, body: ErrorBody, retryAfter: string | null): Notice {
  const field = body?.error?.fieldErrors?.[0]?.code
  if (field === 'invalid_code') return { key: 'request.verify.error.invalidCode' }
  if (field === 'already_verified') return { key: 'request.verify.error.alreadyVerified' }
  if (field === 'sms_not_permitted') return { key: 'request.verify.phoneNoTexts' }
  if (field === 'invalid_destination' || field === 'format' || field === 'minLength' || field === 'maxLength')
    return { key: 'request.verify.error.invalidEmail' }
  if (field === 'change_not_available') return { key: 'request.verify.error.failed' }
  if (status === 429) {
    const seconds = Number(retryAfter)
    return Number.isInteger(seconds) && seconds > 0 && seconds <= 120
      ? { key: 'request.verify.error.wait', values: { seconds } }
      : { key: 'request.verify.error.tooMany' }
  }
  if (status === 503 && body?.error?.code === 'NOT_CONFIGURED') return { key: 'request.verify.error.notConfigured' }
  if (status === 404) return { key: 'request.verify.unavailable' }
  return { key: 'request.verify.error.failed' }
}

/** Minutes until a code expires, as the server set it (never a number written into the page). */
export function minutesLeft(expiresAt: string, now: number = Date.now()): number {
  const ms = Date.parse(expiresAt) - now
  return Number.isFinite(ms) ? Math.max(1, Math.round(ms / 60_000)) : 1
}

/** The optional account offer comes after the receipt and a verified contact, unless the guest declined it. */
export function offerAccount(status: ContactStatus | null, declined: boolean): boolean {
  return !declined && status !== null && (status.email.state === 'verified' || status.phone.state === 'verified')
}

const isState = (s: unknown): s is VerificationState =>
  s === 'unverified' || s === 'pending' || s === 'verified' || s === 'expired' || s === 'failed'

/** Reads the server's status defensively; anything else is no status. */
export function parseStatus(raw: unknown): ContactStatus | null {
  if (typeof raw !== 'object' || raw === null) return null
  const out = {} as ContactStatus
  for (const channel of CHANNELS) {
    const c = (raw as Record<string, unknown>)[channel] as Record<string, unknown> | undefined
    if (!c || typeof c.destination !== 'string' || !isState(c.state) || typeof c.available !== 'boolean') return null
    const change = c.change as Record<string, unknown> | null
    if (change !== null && (typeof change !== 'object' || typeof change.destination !== 'string')) return null
    out[channel] = {
      destination: c.destination,
      state: c.state,
      available: c.available,
      change:
        change && (change.state === 'pending' || change.state === 'expired' || change.state === 'failed')
          ? { destination: change.destination as string, state: change.state }
          : null,
    }
  }
  return out
}

export type Fetch = typeof fetch
export type CallResult<T> = { ok: true; data: T } | { ok: false; notice: Notice }

const BASE = '/api/v1/public/request-receipt'

async function call<T>(
  fetchImpl: Fetch,
  capability: string,
  path: string,
  init: { method: 'GET' | 'POST'; body?: unknown },
  read: (data: unknown) => T | null,
): Promise<CallResult<T>> {
  let res: Response
  try {
    res = await fetchImpl(`${BASE}${path}`, {
      method: init.method,
      headers: {
        accept: 'application/json',
        [CAPABILITY_HEADER]: capability,
        ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    })
  } catch {
    return { ok: false, notice: { key: 'request.verify.error.failed' } }
  }
  const data = res.status === 204 ? null : ((await res.json().catch(() => null)) as unknown)
  if (res.ok) {
    const parsed = read(data)
    if (parsed !== null) return { ok: true, data: parsed }
    return { ok: false, notice: { key: 'request.verify.error.failed' } }
  }
  return { ok: false, notice: problemNotice(res.status, data as ErrorBody, res.headers.get('retry-after')) }
}

const contactOf = (data: unknown) => parseStatus((data as { contact?: unknown } | null)?.contact ?? null)

export const api = {
  status: (f: Fetch, cap: string) => call(f, cap, '/contact', { method: 'GET' }, parseStatus),
  send: (f: Fetch, cap: string, channel: Channel, destination?: string) =>
    call(
      f,
      cap,
      '/contact/codes',
      { method: 'POST', body: { channel, ...(destination !== undefined ? { destination } : {}) } },
      (data) => {
        const contact = contactOf(data)
        const sent = (data as { sent?: { destination?: unknown; expiresAt?: unknown; change?: unknown } }).sent
        return contact && typeof sent?.destination === 'string' && typeof sent.expiresAt === 'string'
          ? { contact, sentTo: sent.destination, expiresAt: sent.expiresAt, change: sent.change === true }
          : null
      },
    ),
  verify: (f: Fetch, cap: string, channel: Channel, code: string) =>
    call(f, cap, '/contact/verify', { method: 'POST', body: { channel, code: code.trim() } }, (data) => {
      const contact = contactOf(data)
      const verified = (data as { verified?: { changed?: unknown } }).verified
      return contact && verified ? { contact, changed: verified.changed === true } : null
    }),
  decline: (f: Fetch, cap: string) =>
    call(f, cap, '/account-offer/decline', { method: 'POST', body: {} }, () => true as const),
}
