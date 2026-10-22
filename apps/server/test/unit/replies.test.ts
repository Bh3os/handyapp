// Staff replies and their delivery hours, without a database (TSK-0050, TSK-0122; HH-COM-08, HH-COM-15, FACT-HOURS,
// FACT-TIMEZONE, OWN-DEC-120, OWN-DEC-154, OWN-DEC-207, T65). Configuration values here are synthetic stand-ins for the
// seeded rows. The recipient here has no recorded zone (no contact), so the unknown-zone fallback applies; a known
// zone is read from the database (integration tests).
import type { Db } from '@handyhub/db'
import { describe, expect, it } from 'vitest'
import {
  channelRefusal,
  defaultChannel,
  replyDeliveryHours,
  type ChannelOption,
} from '../../src/modules/inbox/index.js'
import { releaseTime } from '../../src/modules/notifications/index.js'
import type { Config, ConfigEntry, ConfigKey } from '../../src/platform/config/index.js'

function fakeConfig(entries: Partial<Record<ConfigKey, unknown>>): Config {
  const get = <K extends ConfigKey>(key: K): ConfigEntry<K> =>
    (key in entries
      ? {
          state: 'CONFIGURED',
          key,
          value: entries[key],
          version: 1,
          sourceIds: ['TEST'],
          proposed: false,
          effectiveFrom: new Date(0),
        }
      : { state: 'NOT_CONFIGURED', key, version: 1, sourceIds: [`OQ-${key}`] }) as unknown as ConfigEntry<K>
  return { get, entries: () => [] }
}

const SEEDED = {
  'contact.hours': { days: 'every_day', open: '08:00', close: '22:00' },
  'business.timezone': { zone: 'America/Kentucky/Louisville' },
  'messages.delivery_hours': { email: 'any_hour', text: 'recipient_permitted_hours' },
  'sms.unknown_zone_hours': { open: '09:00', close: '21:00', zone: 'America/Kentucky/Louisville' },
}
// No database is read: the recipient has no recorded zone.
const db = {} as Db
const unknown = (messageKey: string, channel: 'email' | 'sms') => ({
  message_key: messageKey,
  channel,
  recipient_kind: 'customer_contact',
  recipient_id: null,
})
// 23:00 EDT on 20 October 2026, and the next 9 AM EDT (13:00 UTC: the unknown-zone fallback opening).
const ELEVEN_PM = new Date('2026-10-21T03:00:00Z')
const NINE_AM = new Date('2026-10-21T13:00:00Z')
const NOON = new Date('2026-10-20T16:00:00Z')

describe('delivery hours for released messages (TSK-0122, HH-COM-15, OWN-DEC-154)', () => {
  it('[HH-COM-15][T65][OWN-DEC-154] at 11 PM an email goes now; a text waits for the next allowed time', async () => {
    const config = fakeConfig(SEEDED)
    expect(await releaseTime(db, config, unknown('staff.reply', 'email'), ELEVEN_PM)).toEqual(ELEVEN_PM)
    expect(await releaseTime(db, config, unknown('reminder.unanswered_question', 'email'), ELEVEN_PM)).toEqual(
      ELEVEN_PM,
    )
    expect(await releaseTime(db, config, unknown('staff.reply', 'sms'), ELEVEN_PM)).toEqual(NINE_AM)
    expect(await releaseTime(db, config, unknown('reminder.appointment', 'sms'), ELEVEN_PM)).toEqual(NINE_AM)
    // A code never waits (OWN-DEC-207); neither does the access link nor the On my way notice (FACT-HOURS).
    for (const key of ['contact.verification_code', 'project.access_link', 'visit.on_the_way'])
      expect(await releaseTime(db, config, unknown(key, 'sms'), ELEVEN_PM), key).toEqual(ELEVEN_PM)
    expect(await releaseTime(db, config, unknown('staff.reply', 'sms'), NOON)).toEqual(NOON)
  })

  it('[HH-COM-15][RULE-NO-INVENTED-FACTS] the rule, the hours or the fallback NOT CONFIGURED: no window is guessed', async () => {
    for (const missing of ['messages.delivery_hours', 'contact.hours', 'sms.unknown_zone_hours'] as const) {
      const config = fakeConfig(Object.fromEntries(Object.entries(SEEDED).filter(([k]) => k !== missing)))
      const hours = await replyDeliveryHours(db, config, null, ELEVEN_PM)
      expect(hours.text.state, missing).toBe('not_configured')
      // The email still goes at once.
      expect(hours.email.sendAt, missing).toEqual(ELEVEN_PM)
    }
  })

  it('[HH-COM-08][OWN-DEC-207] the composer state: email now; a text open or closed in the unknown-zone window', async () => {
    const config = fakeConfig(SEEDED)
    expect(await replyDeliveryHours(db, config, null, NOON)).toEqual({
      email: { sendAt: NOON },
      text: {
        state: 'open',
        open: '09:00',
        close: '21:00',
        zone: 'America/Kentucky/Louisville',
        basis: 'unknown_zone_fallback',
        sendAt: NOON,
      },
    })
    expect(await replyDeliveryHours(db, config, null, ELEVEN_PM)).toMatchObject({
      email: { sendAt: ELEVEN_PM },
      text: { state: 'closed', sendAt: NINE_AM, basis: 'unknown_zone_fallback' },
    })
  })
})

const option = (channel: 'email' | 'sms', over: Partial<ChannelOption> = {}): ChannelOption => ({
  channel,
  destination: channel === 'email' ? 'synthetic@example.test' : '+15025550100',
  preferred: false,
  available: true,
  reason: 'available',
  ...over,
})

describe('the reply channel (TSK-0050, HH-COM-08, OWN-DEC-120)', () => {
  it('[HH-COM-08][OWN-DEC-120] the preferred channel while permitted, otherwise staff choose a permitted one; never a silent switch', () => {
    const both = [option('email', { preferred: true }), option('sms')]
    expect(defaultChannel(both)).toBe('email')
    expect(channelRefusal(both, 'email')).toBeNull()
    expect(channelRefusal(both, 'sms')).toBe('PREFERRED_CHANNEL_AVAILABLE')
    const preferredOff = [option('email'), option('sms', { preferred: true, available: false, reason: 'opted_out' })]
    expect(defaultChannel(preferredOff)).toBeNull()
    expect(channelRefusal(preferredOff, 'email')).toBeNull()
    expect(channelRefusal(preferredOff, 'sms')).toBe('CHANNEL_UNAVAILABLE')
    // A customer who prefers calls: no messaging channel is preferred, staff choose.
    expect(defaultChannel([option('email'), option('sms')])).toBeNull()
    const none = [
      option('email', { available: false, reason: 'unverified' }),
      option('sms', { available: false, reason: 'no_opt_in' }),
    ]
    expect(channelRefusal(none, 'email')).toBe('NO_PERMITTED_CHANNEL')
  })
})
