// Staff replies and the daily contact hours, without a database (TSK-0050; HH-COM-08, HH-COM-09, FACT-HOURS,
// FACT-TIMEZONE, OWN-DEC-120, OWN-DEC-132, T65). Configuration values here are synthetic stand-ins for the seeded rows.
import { describe, expect, it } from 'vitest'
import { channelRefusal, defaultChannel, replyContactHours, type ChannelOption } from '../../src/modules/inbox/index.js'
import { heldToContactHours, releaseTime } from '../../src/modules/notifications/index.js'
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

const CADENCES = {
  unansweredEstimate: { firstHours: 24, finalHours: 72, contactHoursOnly: false },
  unansweredQuestion: { firstHours: 24, finalHours: 48, closeAfterFinalHours: 24, contactHoursOnly: true },
  appointment: { hoursBefore: 24, contactHoursOnly: true },
  satisfaction: { daysAfterCompletion: 2, contactHoursOnly: true },
  unpaidInvoice: { firstHours: 24, finalHours: 72, contactHoursOnly: true },
  repeatService: { schedule: 'customer_agreed', contactHoursOnly: true },
}
const SEEDED = {
  'contact.hours': { days: 'every_day', open: '08:00', close: '22:00' },
  'business.timezone': { zone: 'America/Kentucky/Louisville' },
  'reminders.cadences': CADENCES,
  'replies.contact_hours': { contactHoursOnly: true },
}
// 23:00 EDT on 20 October 2026, and the next 8 AM (12:00 UTC).
const ELEVEN_PM = new Date('2026-10-21T03:00:00Z')
const EIGHT_AM = new Date('2026-10-21T12:00:00Z')
const NOON = new Date('2026-10-20T16:00:00Z')

describe('daily contact hours for released messages (TSK-0050, HH-COM-09)', () => {
  it('[HH-COM-09][T65][OWN-DEC-132] at 11 PM a reply and a question reminder wait for 8 AM; an estimate reminder and others go now', () => {
    const config = fakeConfig(SEEDED)
    expect(releaseTime(config, 'staff.reply', ELEVEN_PM)).toEqual(EIGHT_AM)
    expect(releaseTime(config, 'reminder.unanswered_question', ELEVEN_PM)).toEqual(EIGHT_AM)
    expect(releaseTime(config, 'reminder.unanswered_estimate', ELEVEN_PM)).toEqual(ELEVEN_PM)
    // Not a staff-released reminder or reply: never held here.
    expect(releaseTime(config, 'contact.verification_code', ELEVEN_PM)).toEqual(ELEVEN_PM)
    expect(releaseTime(config, 'staff.reply', NOON)).toEqual(NOON)
    expect(heldToContactHours(config, 'staff.reply')).toBe(true)
    expect(heldToContactHours(config, 'reminder.unanswered_estimate')).toBe(false)
  })

  it('[HH-COM-09][RULE-NO-INVENTED-FACTS] the reply rule, the hours or the zone NOT CONFIGURED: no window is guessed', () => {
    for (const missing of ['replies.contact_hours', 'contact.hours', 'business.timezone'] as const) {
      const config = fakeConfig(Object.fromEntries(Object.entries(SEEDED).filter(([k]) => k !== missing)))
      expect(releaseTime(config, 'staff.reply', ELEVEN_PM), missing).toEqual(ELEVEN_PM)
      expect(replyContactHours(config, ELEVEN_PM).state, missing).toBe('not_configured')
    }
    expect(heldToContactHours(fakeConfig({}), 'staff.reply')).toBe('not_configured')
    // Replies released from the rule: they go at once even outside the hours, and the state says so.
    const off = fakeConfig({ ...SEEDED, 'replies.contact_hours': { contactHoursOnly: false } })
    expect(releaseTime(off, 'staff.reply', ELEVEN_PM)).toEqual(ELEVEN_PM)
    expect(replyContactHours(off, ELEVEN_PM)).toMatchObject({ state: 'closed', applies: false })
  })

  it('[HH-COM-09] the composer state: open or closed now, the hours and zone, and when the email or text would go', () => {
    const config = fakeConfig(SEEDED)
    expect(replyContactHours(config, NOON)).toEqual({
      state: 'open',
      applies: true,
      open: '08:00',
      close: '22:00',
      zone: 'America/Kentucky/Louisville',
      sendAt: NOON,
    })
    expect(replyContactHours(config, ELEVEN_PM)).toMatchObject({ state: 'closed', sendAt: EIGHT_AM })
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
