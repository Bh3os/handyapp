// Delivery hours (TSK-0122; HH-COM-15, HH-COM-09, HH-COM-05, OWN-DEC-152 sections 3.3 and 3.4, OWN-DEC-154,
// OWN-DEC-207, OWN-DEC-190, FACT-HOURS, FACT-TIMEZONE, RULE-DECIDED-VALUES-ACTIVE).
// - Emails go at once, at any hour: approved transactional emails, automatic reminders and released staff replies
//   (messages.delivery_hours: email any_hour). The portal never waits for either channel.
// - A non-urgent text to a customer goes only inside the permitted daily hours (contact.hours, 8 AM–10 PM) in the
//   recipient's own verified zone (crm.contacts.time_zone, Eastern or Central). When that zone cannot be established
//   the text goes only inside the configured fallback window (sms.unknown_zone_hours, 9 AM–9 PM Eastern), never
//   10 PM Eastern for everyone and never the property's or the business zone as the recipient's. Outside the window it
//   waits for the next allowed time; the delivery records which window applied (text_window), so staff see a text held
//   for an unknown zone as such.
// - Never held: one-time codes (category authentication: they go at once through an available approved channel and
//   never wait in a reminder queue), account security notices, the secure access link and the On my way notice
//   (FACT-HOURS "not held to these hours"), and staff notices.
// - A held text is rechecked when it is due like any send (HH-COM-05): the record, consent and opt-out, the template
//   and the window again; obsolete reminders and expired scheduling notices are cancelled instead of sent.
// - While the rule, the hours or the fallback window is NOT CONFIGURED no window is guessed: such a text is not sent
//   (text_hours_not_configured), and an email still goes at once.
import type { Db, Tx } from '@handyhub/db'
import { textHours, type ZonedHours } from '@handyhub/domain'
import type { Config } from '../../platform/config/index.js'
import { nextContactTime } from './contact-hours.js'
import { messageCategory, messageType, type Channel, type MessageType } from './message-types.js'
import { recipientTimeZone } from './recipient-zone.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The error code a queued text carries while it waits for the recipient's permitted hours (HH-COM-15). */
export const WAITING_TEXT_HOURS = 'waiting_text_hours'

/** Which window a text was held to or sent in; `not_held` for a text that never waits (codes, access links...). */
export type TextWindowBasis = 'recipient_zone' | 'unknown_zone_fallback' | 'not_held'

export type TextWindow = ZonedHours & { readonly basis: 'recipient_zone' | 'unknown_zone_fallback' }

/** Whether a text of this message type waits for the recipient's permitted hours. */
export function heldToTextHours(type: MessageType): boolean {
  if (type.audience !== 'customer') return false
  const category = messageCategory(type)
  if (category === 'authentication' || category === 'account_security') return false
  return type.anyHour !== true
}

/** Whether the decided rule is configured (messages.delivery_hours). */
export function deliveryRuleConfigured(config: Config): boolean {
  return config.get('messages.delivery_hours').state === 'CONFIGURED'
}

/**
 * The window a non-urgent text to this recipient may go in: the permitted hours in the recipient's verified zone, or
 * the unknown-zone fallback. Null while the rule, the hours or the fallback is NOT CONFIGURED.
 */
export async function textWindowFor(
  db: Db | Tx,
  recipient: { kind: string; id: string | null },
  config: Config,
): Promise<TextWindow | null> {
  const hours = config.get('contact.hours')
  const fallback = config.get('sms.unknown_zone_hours')
  if (!deliveryRuleConfigured(config) || hours.state !== 'CONFIGURED' || fallback.state !== 'CONFIGURED') return null
  // A recipient without a contact record (or with an id that is not one) has no recorded zone: unknown.
  const zone =
    recipient.kind === 'customer_contact' && recipient.id && UUID_RE.test(recipient.id)
      ? await recipientTimeZone(db, recipient.id)
      : ({ state: 'unknown' } as const)
  return textHours(zone, hours.value, fallback.value)
}

/** `now` when it is inside the window, otherwise the window's next opening (DST-safe, in the window's zone). */
export function nextTextTime(now: Date, window: ZonedHours): Date {
  return nextContactTime(now, window, window.zone)
}

/** Whether `now` is inside the window. */
export function insideTextWindow(now: Date, window: ZonedHours): boolean {
  return nextTextTime(now, window).getTime() === now.getTime()
}

export type DeliveryTime = {
  /** When the message may go out: now, or the next opening of the text window. */
  at: Date
  /** The text window that applies; null for an email or a text that never waits. */
  window: TextWindow | null
  /** A text that must wait for a window that is NOT CONFIGURED: it is not sent (the send records why). */
  notConfigured: boolean
}

/**
 * When a message to this destination may go out (OWN-DEC-154): an email or a text that never waits at once; any
 * other customer text at the next allowed time in the recipient's window.
 */
export async function deliveryTime(
  db: Db | Tx,
  config: Config,
  input: { messageKey: string; channel: Channel; recipientKind: string; recipientId: string | null; now: Date },
): Promise<DeliveryTime> {
  if (input.channel !== 'sms' || !heldToTextHours(messageType(input.messageKey)))
    return { at: input.now, window: null, notConfigured: false }
  const window = await textWindowFor(db, { kind: input.recipientKind, id: input.recipientId }, config)
  if (!window) return { at: input.now, window: null, notConfigured: true }
  return { at: nextTextTime(input.now, window), window, notConfigured: false }
}

/** Whether live texts may reach a carrier (sms.live_delivery; OWN-DEC-190: off until A2P 10DLC is complete). */
export function liveTextsEnabled(config: Config): boolean {
  const entry = config.get('sms.live_delivery')
  return entry.state === 'CONFIGURED' && entry.value.enabled === true
}
