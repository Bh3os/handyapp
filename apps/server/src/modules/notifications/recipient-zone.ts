// The text recipient's time zone (TSK-0123; OWN-DEC-159 items 5 and 13, HH-COM-15, FACT-HOURS; final owner amendments
// 2026-10-22, reading 8). A text's permitted local hours are the recipient's, from the zone recorded on the contact
// (crm.contacts.time_zone). The property's zone and the business zone are never taken as the recipient's: without a
// recorded zone the answer is unknown (flagged for verification), and a non-urgent text then uses the configured
// fallback window (sms.unknown_zone_hours: 9 AM–9 PM Eastern). Applying the window to deliveries belongs to the
// delivery-hours task (TSK-0122); this only resolves the zone and names the window. Account security codes never ask.
import type { Db, Tx } from '@handyhub/db'
import { recipientZone, textHours, type RecipientZone } from '@handyhub/domain'
import type { Config } from '../../platform/config/index.js'

/** The zone of the contact a text goes to: known (with its Eastern or Central family) or unknown. */
export async function recipientTimeZone(db: Db | Tx, contactId: string): Promise<RecipientZone> {
  const row = await db.selectFrom('crm.contacts').select('time_zone').where('id', '=', contactId).executeTakeFirst()
  return recipientZone(row?.time_zone ?? null)
}

/**
 * The window a non-urgent text to this contact may be sent in, with the zone resolution it rests on; null while the
 * permitted hours (contact.hours) or the unknown-zone fallback (sms.unknown_zone_hours) is NOT CONFIGURED.
 */
export async function recipientTextHours(db: Db | Tx, contactId: string, config: Config) {
  const hours = config.get('contact.hours')
  const fallback = config.get('sms.unknown_zone_hours')
  if (hours.state !== 'CONFIGURED' || fallback.state !== 'CONFIGURED') return null
  const zone = await recipientTimeZone(db, contactId)
  return { recipient: zone, window: textHours(zone, hours.value, fallback.value) }
}
