// Contact verification of a saved request (TSK-0033; HH-INT-13, HH-ID-03, HH-ID-06, HH-INT-11, HH-INT-22, ENT-Contact,
// OWN-DEC-96, OWN-DEC-141, OWN-DEC-150, RULE-SERVER-AUTHZ).
// The one-time codes are TSK-0016's (identity/codes.ts): hashed, expiring after the configured 10 minutes, with the
// configured attempt, resend and per-address limits, delivered as the automatic message contact.verification_code in
// the owner's wording. This file ties them to the request's own contact:
// - Email and phone are verified separately, each for its exact current value (the code's subject is
//   `contact:<id>:email` or `contact:<id>:phone`; the contact row records which value its "verified" proved).
//   Verifying one never marks the other.
// - States per channel: unverified → pending (a code was sent) → verified; pending → expired (the code ran out or was
//   replaced) or failed (its attempts are used up). The stored state follows each observed transition; the shown state
//   is also derived from the latest code, so a code that simply ran out shows as expired to the customer and to staff.
// - Change Contact (email): the code goes to the new value and the contact keeps its current value until that code is
//   entered; only then does the email change, already verified. A verified channel is not changed here (later changes
//   go through the workspace with re-verification, ROLE-MATRIX "Edit contact or property details": V own (re-verify)).
// - The phone is verified by text only. No text goes to a number without a current SMS opt-in (HH-INT-22), so the
//   phone can be verified here only when this request gave the opt-in for it; a changed number has no opt-in, so the
//   phone is not changed here (OQ-PHONE-VERIFY-SMS-OPT-IN). Whether texts are possible is read from this request's own
//   answer, never from consent records other requests left for the same number, which would reveal them (HH-ID-03).
// - Nothing here looks at other customers, contacts, projects or accounts with the same email or phone: the request's
//   contact is its own record (TSK-0025), its verification proves that value for that contact only, and it links
//   nothing (HH-ID-03; linking is staff review, HH-ID-02, HH-CRM-04).
import type { Db, Tx } from '@handyhub/db'
import { currentConsent } from '../notifications/index.js'
import {
  issueCode,
  maskForCustomer,
  normaliseDestination,
  verifyCode,
  type CodeKeySettings,
} from '../identity/index.js'

export const CONTACT_CHANNELS = ['email', 'phone'] as const
export type ContactChannel = (typeof CONTACT_CHANNELS)[number]
export const VERIFICATION_STATES = ['unverified', 'pending', 'verified', 'expired', 'failed'] as const
export type VerificationState = (typeof VERIFICATION_STATES)[number]
export type ChangeState = 'pending' | 'expired' | 'failed'

export type ChannelStatus = {
  /** The current value, masked (HH-INT-13 "masked destination"). */
  destination: string
  state: VerificationState
  /** Whether a code can be sent on this channel (the phone needs this request's SMS opt-in). */
  available: boolean
  /** An email change waiting for its code: the new value, masked, and the state of its code. */
  change: { destination: string; state: ChangeState } | null
}
export type ContactStatus = { email: ChannelStatus; phone: ChannelStatus }

export type SendProblem = 'already_verified' | 'sms_not_permitted' | 'invalid_destination' | 'change_not_available'
export type SendResult =
  | { status: 'sent'; channel: ContactChannel; sentTo: string; expiresAt: Date; change: boolean }
  | { status: 'refused'; problem: SendProblem }
  | { status: 'rate_limited'; retryAfterSeconds: number }
  | { status: 'not_configured'; missing: string[] }

export type VerifyOutcome = { ok: true; channel: ContactChannel; changed: boolean } | { ok: false }

const PURPOSE = 'contact_verification' as const
const codeChannel = (c: ContactChannel) => (c === 'email' ? 'email' : 'sms') as 'email' | 'sms'
export const subjectRef = (contactId: string, channel: ContactChannel) => `contact:${contactId}:${channel}`

type CodeRow = {
  destination: string
  consumed_at: Date | null
  superseded_at: Date | null
  expires_at: Date
  attempts: number
  max_attempts: number
}

/** A code's own state: used, still usable, out of attempts, or expired (ran out or replaced by a newer code). */
export function codeState(row: CodeRow, now: Date): 'used' | 'pending' | 'failed' | 'expired' {
  if (row.consumed_at) return 'used'
  if (row.attempts >= row.max_attempts) return 'failed'
  if (row.superseded_at || row.expires_at.getTime() <= now.getTime()) return 'expired'
  return 'pending'
}

/** The state to show for the current value: the stored state, brought up to date by its latest code. */
export function effectiveState(
  stored: VerificationState,
  latestToCurrent: CodeRow | undefined,
  now: Date,
): VerificationState {
  if (stored === 'verified') return 'verified'
  if (!latestToCurrent) return stored === 'pending' ? 'expired' : stored
  const s = codeState(latestToCurrent, now)
  return s === 'used' ? stored : s
}

type ContactRow = {
  contact_id: string
  email: string
  phone_e164: string
  email_verification: string
  phone_verification: string
  sms_opt_in: boolean
}

const currentValue = (c: ContactRow, channel: ContactChannel) =>
  channel === 'email' ? (normaliseDestination('email', c.email) ?? c.email.toLowerCase()) : c.phone_e164
const storedState = (c: ContactRow, channel: ContactChannel) =>
  (channel === 'email' ? c.email_verification : c.phone_verification) as VerificationState

async function contactOf(db: Db | Tx, requestId: string, lock: boolean): Promise<ContactRow | undefined> {
  const request = await db
    .selectFrom('intake.requests')
    .select(['contact_id', 'sms_opt_in'])
    .where('id', '=', requestId)
    .executeTakeFirst()
  if (!request) return undefined
  const q = db
    .selectFrom('crm.contacts')
    .select(['id as contact_id', 'email', 'phone_e164', 'email_verification', 'phone_verification'])
    .where('id', '=', request.contact_id)
  const contact = await (lock ? q.forUpdate() : q).executeTakeFirst()
  return contact ? { ...contact, sms_opt_in: request.sms_opt_in } : undefined
}

const CODE_COLUMNS = ['destination', 'consumed_at', 'superseded_at', 'expires_at', 'attempts', 'max_attempts'] as const

async function latestCode(db: Db | Tx, subject: string, destination?: string): Promise<CodeRow | undefined> {
  let q = db
    .selectFrom('identity.verification_codes')
    .select([...CODE_COLUMNS])
    .where('purpose', '=', PURPOSE)
    .where('subject_ref', '=', subject)
  if (destination !== undefined) q = q.where('destination', '=', destination)
  return q.orderBy('created_at', 'desc').limit(1).executeTakeFirst()
}

/** Texts reach the phone only with this request's own SMS opt-in, still current (no STOP since). */
async function textAvailable(db: Db | Tx, c: ContactRow): Promise<boolean> {
  return c.sms_opt_in && (await currentConsent(db, 'sms', c.phone_e164, 'transactional_sms')) === 'granted'
}

async function channelStatus(db: Db | Tx, c: ContactRow, channel: ContactChannel, now: Date): Promise<ChannelStatus> {
  const subject = subjectRef(c.contact_id, channel)
  const current = currentValue(c, channel)
  const toCurrent = await latestCode(db, subject, current)
  const latest = await latestCode(db, subject)
  const state = effectiveState(storedState(c, channel), toCurrent, now)
  const pendingChange = latest && latest.destination !== current ? codeState(latest, now) : null
  return {
    destination: maskForCustomer(codeChannel(channel), current),
    state,
    available: channel === 'email' ? true : await textAvailable(db, c),
    change:
      state !== 'verified' && pendingChange && pendingChange !== 'used' && latest
        ? { destination: maskForCustomer(codeChannel(channel), latest.destination), state: pendingChange }
        : null,
  }
}

/** The receipt's view of the request's own contact; null when the request does not exist. */
export async function contactStatus(
  db: Db | Tx,
  requestId: string,
  now: Date = new Date(),
): Promise<ContactStatus | null> {
  const c = await contactOf(db, requestId, false)
  if (!c) return null
  return { email: await channelStatus(db, c, 'email', now), phone: await channelStatus(db, c, 'phone', now) }
}

/** The shown verification state of a contact's two channels, for staff (HH-LEAD-01 badges). */
export async function contactBadges(
  db: Db | Tx,
  contact: { id: string; email: string; phone_e164: string; email_verification: string; phone_verification: string },
  now: Date = new Date(),
): Promise<{ email: VerificationState; phone: VerificationState }> {
  const c: ContactRow = { ...contact, contact_id: contact.id, sms_opt_in: false }
  const out = {} as Record<ContactChannel, VerificationState>
  for (const channel of CONTACT_CHANNELS)
    out[channel] = effectiveState(
      storedState(c, channel),
      await latestCode(db, subjectRef(c.contact_id, channel), currentValue(c, channel)),
      now,
    )
  return out
}

async function setState(
  tx: Tx,
  contactId: string,
  channel: ContactChannel,
  state: VerificationState,
  verifiedValue?: string,
): Promise<void> {
  await tx
    .updateTable('crm.contacts')
    .set((eb) => ({
      ...(channel === 'email'
        ? { email_verification: state, ...(verifiedValue ? { email_verified_value: verifiedValue } : {}) }
        : { phone_verification: state, ...(verifiedValue ? { phone_verified_value: verifiedValue } : {}) }),
      version: eb('version', '+', 1),
    }))
    .where('id', '=', contactId)
    .execute()
}

/** Every other open code of the subject stops working (a newer code, or a finished verification, replaces them). */
async function supersedeOthers(tx: Tx, subject: string, keep: string | null, now: Date): Promise<void> {
  let q = tx
    .updateTable('identity.verification_codes')
    .set({ superseded_at: now })
    .where('purpose', '=', PURPOSE)
    .where('subject_ref', '=', subject)
    .where('consumed_at', 'is', null)
    .where('superseded_at', 'is', null)
  if (keep) q = q.where('destination', '<>', keep)
  await q.execute()
}

export type SendInput = {
  requestId: string
  channel: ContactChannel
  /** Change Contact: the new email value. Absent or equal to the current value: a code for the current value. */
  destination?: string
  clientIp?: string
  /** The HTTP request ID, kept with the code (never the code itself). */
  httpRequestId: string
  now?: Date
}

/** Sends (or resends) a code for the request's own contact, inside the route's transaction. */
export async function sendContactCode(tx: Tx, key: CodeKeySettings, input: SendInput): Promise<SendResult> {
  const now = input.now ?? new Date()
  const c = await contactOf(tx, input.requestId, true)
  if (!c) throw new Error('the request of a live receipt capability always exists')
  const current = currentValue(c, input.channel)
  if (storedState(c, input.channel) === 'verified') return { status: 'refused', problem: 'already_verified' }
  let target = current
  if (input.destination !== undefined) {
    const normalised = normaliseDestination(codeChannel(input.channel), input.destination)
    if (!normalised) return { status: 'refused', problem: 'invalid_destination' }
    if (normalised !== current && input.channel === 'phone')
      return { status: 'refused', problem: 'change_not_available' }
    // The contact record holds at most 254 characters (crm.contacts.email).
    if (normalised.length > 254) return { status: 'refused', problem: 'invalid_destination' }
    target = normalised
  }
  if (input.channel === 'phone' && !(await textAvailable(tx, c)))
    return { status: 'refused', problem: 'sms_not_permitted' }

  const subject = subjectRef(c.contact_id, input.channel)
  const issued = await issueCode(tx, key, {
    purpose: PURPOSE,
    channel: codeChannel(input.channel),
    destination: target,
    subjectRef: subject,
    ...(input.clientIp ? { clientIp: input.clientIp } : {}),
    requestId: input.httpRequestId,
    now,
  })
  if (issued.status === 'invalid_destination') return { status: 'refused', problem: 'invalid_destination' }
  if (issued.status !== 'issued') return issued
  // One live code per channel: a code for another value of this channel stops working.
  await supersedeOthers(tx, subject, target, now)
  if (target === current && storedState(c, input.channel) !== 'pending')
    await setState(tx, c.contact_id, input.channel, 'pending')
  return {
    status: 'sent',
    channel: input.channel,
    sentTo: issued.maskedDestination,
    expiresAt: issued.expiresAt,
    change: target !== current,
  }
}

export type VerifyInput = {
  requestId: string
  channel: ContactChannel
  code: string
  clientIp?: string
  now?: Date
}

/**
 * Checks a code for the request's own contact, inside the route's transaction. The attempt is counted whatever the
 * outcome, so the caller commits the transaction before answering a refusal. Every failure is the same neutral
 * outcome; the state shown afterwards (pending, expired or failed) is the customer's own.
 */
export async function verifyContactCode(tx: Tx, key: CodeKeySettings, input: VerifyInput): Promise<VerifyOutcome> {
  const now = input.now ?? new Date()
  const c = await contactOf(tx, input.requestId, true)
  if (!c) throw new Error('the request of a live receipt capability always exists')
  const subject = subjectRef(c.contact_id, input.channel)
  const current = currentValue(c, input.channel)
  // The code the customer asked for last: the current value, or the new email of a change.
  const latest = await latestCode(tx, subject)
  const destination = latest?.destination ?? current
  const result = await verifyCode(tx, key, {
    purpose: PURPOSE,
    destination,
    subjectRef: subject,
    code: input.code,
    ...(input.clientIp ? { clientIp: input.clientIp } : {}),
    now,
  })
  const stored = storedState(c, input.channel)
  if (!result.ok) {
    // An attempt on the current value's code that ran out or used up its attempts moves the stored state with it.
    const after = destination === current ? await latestCode(tx, subject, current) : undefined
    const state = after ? codeState(after, now) : null
    if (stored !== 'verified' && (state === 'expired' || state === 'failed') && state !== stored)
      await setState(tx, c.contact_id, input.channel, state)
    return { ok: false }
  }
  const changed = result.destination !== current
  // A phone code proves only the number it went to; if that is no longer the contact's number, nothing is verified.
  if (changed && input.channel === 'phone') return { ok: false }
  if (changed) {
    // Change Contact completes only now: the new email replaces the old one, already verified (OWN-DEC-96).
    await tx
      .updateTable('crm.contacts')
      .set((eb) => ({
        email: result.destination,
        email_verification: 'verified',
        email_verified_value: result.destination,
        version: eb('version', '+', 1),
      }))
      .where('id', '=', c.contact_id)
      .execute()
  } else {
    await setState(tx, c.contact_id, input.channel, 'verified', result.destination)
  }
  await supersedeOthers(tx, subject, null, now)
  return { ok: true, channel: input.channel, changed }
}
