// Issue and verify one-time codes (TSK-0016; HH-INT-13, HH-ID-06, HH-INT-11, HH-ID-09, OWN-DEC-96, OWN-DEC-141).
//
// issueCode, inside the caller's transaction:
// - reads the code lifetime (session.timings.oneTimeCodeMinutes) and the limits (verification.limits) from
//   configuration; either NOT CONFIGURED, or the code key missing, refuses with `not_configured`;
// - refuses a resend within the cooldown and more codes per destination or per client address per hour than allowed;
// - supersedes the earlier codes for the same purpose, destination and subject, stores the nonce and digest, and
//   writes the `contact.verification_code_requested` outbox event (an automatic message, FACT-AUTOMATIC-MESSAGES #2). The code
//   is derived again by the delivery job; it is never stored, logged or put in the outbox.
//
// verifyCode, inside the caller's transaction (the attempt counts are committed even when the code is wrong):
// - a wrong, expired, superseded, already used or exhausted code, an unknown destination and a client address over its
//   failure limit all give the same neutral result `{ ok: false, reason: 'INVALID_CODE' }`, so the answer never says
//   which, or whether the destination exists;
// - a matching code is consumed once and returns what it proved.
import { randomUUID } from 'node:crypto'
import type { Tx } from '@handyhub/db'
import { sql } from 'kysely'
import { loadConfig, type Config } from '../../platform/config/index.js'
import { outbox } from '../../platform/outbox.js'
import { clientKey, codeDigest, deriveCode, digestsEqual, newNonce, type CodeKeySettings } from './keys.js'

export const CODE_PURPOSES = ['contact_verification', 'project_access', 'account_sign_in'] as const
export type CodePurpose = (typeof CODE_PURPOSES)[number]
export type CodeChannel = 'email' | 'sms'
/** The trigger of the automatic message contact.verification_code (TSK-0047 message types). */
export const CODE_ISSUED_EVENT = 'contact.verification_code_requested'

export type IssueInput = {
  purpose: CodePurpose
  channel: CodeChannel
  destination: string
  /** What the code proves ownership for, as the calling feature names it (for example `contact:<id>`). */
  subjectRef: string
  clientIp?: string
  requestId: string
  now?: Date
}

export type IssueResult =
  | { status: 'issued'; codeId: string; expiresAt: Date; maskedDestination: string }
  | { status: 'rate_limited'; retryAfterSeconds: number }
  | { status: 'invalid_destination' }
  | { status: 'not_configured'; missing: string[] }

export type VerifyInput = {
  purpose: CodePurpose
  destination: string
  subjectRef: string
  code: string
  clientIp?: string
  now?: Date
}

export type VerifyResult =
  | { ok: true; codeId: string; purpose: CodePurpose; channel: CodeChannel; destination: string; verifiedAt: Date }
  | { ok: false; reason: 'INVALID_CODE' }

const NEUTRAL: VerifyResult = { ok: false, reason: 'INVALID_CODE' }
const EMAIL = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/
const E164 = /^\+[1-9]\d{7,14}$/
const HOUR_MS = 3_600_000

/** The destination as stored: e-mail trimmed and lower-cased; a phone number in E.164. Null when not valid. */
export function normaliseDestination(channel: CodeChannel, destination: string): string | null {
  const d = destination.trim()
  if (channel === 'email') return EMAIL.test(d) && d.length <= 320 ? d.toLowerCase() : null
  const phone = d.replace(/[\s().-]/g, '')
  return E164.test(phone) ? phone : null
}

/** For the receipt page (HH-INT-13 "masked destination"): `j***@example.test`, `***0123`. */
export function maskForCustomer(channel: CodeChannel, destination: string): string {
  if (channel === 'email') {
    const at = destination.lastIndexOf('@')
    return at > 0 ? `${destination[0]}***${destination.slice(at)}` : '***'
  }
  return `***${destination.slice(-4)}`
}

type Settings = { lifetimeMinutes: number; limits: NonNullable<ReturnType<typeof limitsOf>> }

function limitsOf(config: Config) {
  const limits = config.get('verification.limits')
  return limits.state === 'CONFIGURED' ? limits.value : null
}

function settingsOf(config: Config): Settings | { missing: string[] } {
  const timings = config.get('session.timings')
  const limits = limitsOf(config)
  const missing = [
    ...(timings.state === 'CONFIGURED' ? [] : ['session.timings']),
    ...(limits ? [] : ['verification.limits']),
  ]
  if (timings.state !== 'CONFIGURED' || !limits) return { missing }
  return { lifetimeMinutes: timings.value.oneTimeCodeMinutes, limits }
}

/** One lock per destination, so concurrent issues and verifications for it are serialised. */
async function lockDestination(tx: Tx, destination: string): Promise<void> {
  await sql`SELECT pg_advisory_xact_lock(hashtext(${`verification_code:${destination}`}))`.execute(tx)
}

export async function issueCode(tx: Tx, key: CodeKeySettings, input: IssueInput): Promise<IssueResult> {
  if (!tx.isTransaction) throw new Error('issueCode runs inside the business transaction (withTx)')
  if (key.state !== 'configured') return { status: 'not_configured', missing: [...key.missing] }
  const settings = settingsOf(await loadConfig(tx))
  if ('missing' in settings) return { status: 'not_configured', missing: settings.missing }
  const destination = normaliseDestination(input.channel, input.destination)
  if (!destination) return { status: 'invalid_destination' }
  const now = input.now ?? new Date()
  const hourAgo = new Date(now.getTime() - HOUR_MS)
  const client = clientKey(key.key, input.clientIp)
  const { limits } = settings
  await lockDestination(tx, destination)

  const last = await tx
    .selectFrom('identity.verification_codes')
    .select('created_at')
    .where('purpose', '=', input.purpose)
    .where('destination', '=', destination)
    .where('subject_ref', '=', input.subjectRef)
    .orderBy('created_at', 'desc')
    .limit(1)
    .executeTakeFirst()
  if (last) {
    const wait = Math.ceil((last.created_at.getTime() + limits.resendCooldownSeconds * 1000 - now.getTime()) / 1000)
    if (wait > 0) return { status: 'rate_limited', retryAfterSeconds: wait }
  }
  const perDestination = await countSince(tx, 'destination', destination, hourAgo)
  if (perDestination >= limits.maxCodesPerDestinationPerHour) return { status: 'rate_limited', retryAfterSeconds: 3600 }
  if (client && (await countSince(tx, 'client_key', client, hourAgo)) >= limits.maxCodesPerClientPerHour)
    return { status: 'rate_limited', retryAfterSeconds: 3600 }

  await tx
    .updateTable('identity.verification_codes')
    .set({ superseded_at: now })
    .where('purpose', '=', input.purpose)
    .where('destination', '=', destination)
    .where('subject_ref', '=', input.subjectRef)
    .where('consumed_at', 'is', null)
    .where('superseded_at', 'is', null)
    .execute()

  const id = randomUUID()
  const nonce = newNonce()
  const expiresAt = new Date(now.getTime() + settings.lifetimeMinutes * 60_000)
  await tx
    .insertInto('identity.verification_codes')
    .values({
      id,
      purpose: input.purpose,
      channel: input.channel,
      destination,
      subject_ref: input.subjectRef,
      nonce,
      code_digest: codeDigest(key.key, id, deriveCode(key.key, id, nonce, limits.codeDigits)),
      client_key: client,
      max_attempts: limits.maxAttemptsPerCode,
      expires_at: expiresAt,
      request_id: input.requestId,
      created_at: now,
    })
    .execute()
  await outbox.add(tx, {
    type: CODE_ISSUED_EVENT,
    aggregate: { type: 'verification_code', id },
    payload: { channel: input.channel, purpose: input.purpose },
    idempotencyKey: `${CODE_ISSUED_EVENT}:${id}`,
    requestId: input.requestId,
  })
  return { status: 'issued', codeId: id, expiresAt, maskedDestination: maskForCustomer(input.channel, destination) }
}

async function countSince(tx: Tx, column: 'destination' | 'client_key', value: string, since: Date): Promise<number> {
  const row = await tx
    .selectFrom('identity.verification_codes')
    .select((eb) => eb.fn.countAll<string>().as('n'))
    .where(column, '=', value)
    .where('created_at', '>', since)
    .executeTakeFirst()
  return Number(row?.n ?? 0)
}

export async function verifyCode(tx: Tx, key: CodeKeySettings, input: VerifyInput): Promise<VerifyResult> {
  if (!tx.isTransaction) throw new Error('verifyCode runs inside the business transaction (withTx)')
  if (key.state !== 'configured') return NEUTRAL
  const now = input.now ?? new Date()
  const client = clientKey(key.key, input.clientIp)
  const limits = limitsOf(await loadConfig(tx))
  if (!limits) return NEUTRAL
  const record = async (codeId: string | null, succeeded: boolean) =>
    tx
      .insertInto('identity.verification_attempts')
      .values({ code_id: codeId, client_key: client, succeeded, created_at: now })
      .execute()

  if (client) {
    const failures = await tx
      .selectFrom('identity.verification_attempts')
      .select((eb) => eb.fn.countAll<string>().as('n'))
      .where('client_key', '=', client)
      .where('succeeded', '=', false)
      .where('created_at', '>', new Date(now.getTime() - HOUR_MS))
      .executeTakeFirst()
    // Over the limit: refused without looking at any code, so guessing gains nothing.
    if (Number(failures?.n ?? 0) >= limits.maxFailedAttemptsPerClientPerHour) {
      await record(null, false)
      return NEUTRAL
    }
  }

  const channel: CodeChannel = input.destination.includes('@') ? 'email' : 'sms'
  const destination = normaliseDestination(channel, input.destination)
  const code = input.code.trim()
  if (!destination || !/^\d{4,10}$/.test(code)) {
    await record(null, false)
    return NEUTRAL
  }
  await lockDestination(tx, destination)
  const row = await tx
    .selectFrom('identity.verification_codes')
    .selectAll()
    .where('purpose', '=', input.purpose)
    .where('destination', '=', destination)
    .where('subject_ref', '=', input.subjectRef)
    .orderBy('created_at', 'desc')
    .limit(1)
    .forUpdate()
    .executeTakeFirst()
  if (!row) {
    await record(null, false)
    return NEUTRAL
  }
  const usable =
    row.consumed_at === null &&
    row.superseded_at === null &&
    row.expires_at.getTime() > now.getTime() &&
    row.attempts < row.max_attempts
  if (!usable) {
    await record(row.id, false)
    return NEUTRAL
  }
  const matches = digestsEqual(codeDigest(key.key, row.id, code), row.code_digest)
  await tx
    .updateTable('identity.verification_codes')
    .set({ attempts: row.attempts + 1, ...(matches ? { consumed_at: now } : {}) })
    .where('id', '=', row.id)
    .execute()
  await record(row.id, matches)
  if (!matches) return NEUTRAL
  return {
    ok: true,
    codeId: row.id,
    purpose: row.purpose as CodePurpose,
    channel: row.channel as CodeChannel,
    destination: row.destination,
    verifiedAt: now,
  }
}
