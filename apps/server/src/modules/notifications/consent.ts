// Consent and communication preferences (TSK-0048; ENT-ConsentPreference, HH-COM-05, HH-INT-22, HH-COM-12,
// OWN-DEC-147). Append-only records per destination and purpose; the latest record is the current state.
// - Transactional texts need a current SMS opt-in: having a phone number is never consent to text.
// - Marketing is a separate purpose on each channel; it never follows from the SMS opt-in or from service messages.
// - STOP withdraws the SMS opt-in (and marketing texts) at once; START records a new SMS opt-in, never marketing.
import type { Db, Tx } from '@handyhub/db'
import type { Channel } from './message-types.js'

export const CONSENT_PURPOSES = ['service_communication', 'transactional_sms', 'marketing'] as const
export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number]
export type ConsentSource = 'request_form' | 'portal' | 'sms_keyword' | 'provider_suppression' | 'staff_recorded'
export type ConsentState = 'granted' | 'withdrawn' | 'none'

export type ConsentInput = {
  purpose: ConsentPurpose
  channel: Channel
  destination: string
  granted: boolean
  source: ConsentSource
  /** Who recorded it: a staff user ID, `customer:<contact>`, or `system:<process>`. */
  recordedBy: string
  subject?: { kind: 'customer_contact' | 'staff_user'; id: string }
  /** The SMS disclosure text version the customer saw (request form or portal). */
  disclosureVersion?: string
  /** Safe evidence only, for example { webhookReceiptId, keyword }; never message text. */
  evidence?: Record<string, string | number | boolean | null>
  at?: Date
}

export class ConsentError extends Error {
  override name = 'ConsentError'
}

const E164 = /^\+[1-9]\d{7,14}$/

/** Destinations as consent stores them: E.164 numbers, lower-case e-mail. */
export function consentDestination(channel: Channel, destination: string): string {
  const d = destination.trim()
  if (channel === 'sms') {
    const phone = d.replace(/[\s().-]/g, '')
    if (!E164.test(phone)) throw new ConsentError('an SMS consent needs an E.164 number')
    return phone
  }
  return d.toLowerCase()
}

export async function recordConsent(tx: Tx, c: ConsentInput): Promise<void> {
  if (c.purpose === 'transactional_sms' && c.channel !== 'sms')
    throw new ConsentError('the SMS opt-in is an SMS consent')
  if (c.granted && c.source === 'request_form' && !c.disclosureVersion)
    throw new ConsentError('an opt-in from the request form records the disclosure version the customer saw')
  await tx
    .insertInto('platform.consent_records')
    .values({
      purpose: c.purpose,
      channel: c.channel,
      destination: consentDestination(c.channel, c.destination),
      subject_kind: c.subject?.kind ?? null,
      subject_id: c.subject?.id ?? null,
      granted: c.granted,
      disclosure_version: c.disclosureVersion ?? null,
      source: c.source,
      evidence: JSON.stringify(c.evidence ?? {}),
      recorded_by: c.recordedBy,
      ...(c.at ? { recorded_at: c.at } : {}),
    })
    .execute()
}

/** The current state of one purpose for a destination: the latest record, or 'none'. */
export async function currentConsent(
  db: Db | Tx,
  channel: Channel,
  destination: string,
  purpose: ConsentPurpose,
): Promise<ConsentState> {
  let d: string
  try {
    d = consentDestination(channel, destination)
  } catch {
    return 'none'
  }
  const row = await db
    .selectFrom('platform.consent_records')
    .select('granted')
    .where('destination', '=', d)
    .where('channel', '=', channel)
    .where('purpose', '=', purpose)
    .orderBy('seq', 'desc')
    .limit(1)
    .executeTakeFirst()
  return row === undefined ? 'none' : row.granted ? 'granted' : 'withdrawn'
}

/** Message types that are marketing and need the separate marketing permission (HH-COM-05, T67). */
export const MARKETING_MESSAGES: ReadonlySet<string> = new Set(['review.request'])

export type PermissionResult = { allowed: true } | { allowed: false; reason: string }

/**
 * Send-time permission for one destination (HH-COM-05):
 * - every text needs no SMS withdrawal on file (a STOP is honoured for staff numbers too);
 * - a text to a customer needs a current SMS opt-in;
 * - a marketing message needs the current marketing permission on its channel as well.
 */
export async function sendPermission(
  db: Db | Tx,
  input: { channel: Channel; destination: string; audience: 'customer' | 'staff'; messageKey: string },
): Promise<PermissionResult> {
  if (input.channel === 'sms') {
    const sms = await currentConsent(db, 'sms', input.destination, 'transactional_sms')
    if (sms === 'withdrawn') return { allowed: false, reason: 'sms_opted_out' }
    if (input.audience === 'customer' && sms !== 'granted') return { allowed: false, reason: 'sms_no_opt_in' }
  }
  if (MARKETING_MESSAGES.has(input.messageKey)) {
    const marketing = await currentConsent(db, input.channel, input.destination, 'marketing')
    if (marketing !== 'granted') return { allowed: false, reason: 'no_marketing_consent' }
  }
  return { allowed: true }
}
