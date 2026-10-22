// Appointment reminders without a database (TSK-0067; HH-COM-11, HH-COM-09, FACT-REMINDER-CADENCES, OWN-DEC-107,
// RULE-DECIDED-VALUES-ACTIVE, T65). Configuration values here are synthetic stand-ins for the seeded rows.
import { describe, expect, it } from 'vitest'
import { messageType, releaseTime, templateProblems } from '../../src/modules/notifications/index.js'
import {
  APPOINTMENT_REMINDER_STOP_REASONS,
  appointmentReminderCadence,
  appointmentReminderDueAt,
  appointmentReminderSubject,
} from '../../src/modules/visits/index.js'
import { addressLine, windowVersionOf } from '../../src/modules/visits/reminders.js'
import { LABEL_FAMILIES } from '@handyhub/i18n'
import type { Config, ConfigEntry, ConfigKey } from '../../src/platform/config/index.js'

function fakeConfig(entries: Partial<Record<ConfigKey, unknown>>): Config {
  const get = <K extends ConfigKey>(key: K): ConfigEntry<K> =>
    (key in entries
      ? {
          state: 'CONFIGURED',
          key,
          value: entries[key],
          version: 3,
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
}
const H = 3_600_000

describe('appointment reminder cadence (TSK-0067, HH-COM-11)', () => {
  it('[HH-COM-11][FACT-REMINDER-CADENCES][OWN-DEC-107] 24 hours before the arrival window; at once when that time has passed', () => {
    const c = appointmentReminderCadence(fakeConfig(SEEDED))
    expect(c).toEqual({ state: 'CONFIGURED', version: 3, proposed: false, hoursBefore: 24, contactHoursOnly: true })
    const starts = new Date('2026-10-30T13:00:00Z')
    expect(appointmentReminderDueAt(starts, 24, new Date('2026-10-21T12:00:00Z'))).toEqual(
      new Date(starts.getTime() - 24 * H),
    )
    // Confirmed 10 hours ahead: the draft is due now.
    const now = new Date(starts.getTime() - 10 * H)
    expect(appointmentReminderDueAt(starts, 24, now)).toEqual(now)
  })

  it('[RULE-DECIDED-VALUES-ACTIVE] NOT CONFIGURED stays NOT CONFIGURED; no interval is made up', () => {
    expect(appointmentReminderCadence(fakeConfig({}))).toEqual({ state: 'NOT_CONFIGURED', version: 1 })
  })

  it('[HH-COM-09][T65] a reminder released at 11 PM waits for 8 AM in the business zone', () => {
    // 23:00 EDT on 20 October 2026, and the next 8 AM (12:00 UTC).
    expect(releaseTime(fakeConfig(SEEDED), 'reminder.appointment', new Date('2026-10-21T03:00:00Z'))).toEqual(
      new Date('2026-10-21T12:00:00Z'),
    )
    const noon = new Date('2026-10-20T16:00:00Z')
    expect(releaseTime(fakeConfig(SEEDED), 'reminder.appointment', noon)).toEqual(noon)
  })
})

describe('appointment reminder subjects and content (TSK-0067)', () => {
  it('[HH-COM-11] one subject per visit and window version, so a rescheduled visit gets a reminder of its own', () => {
    const id = '0f6a3a52-6a1a-4d55-9d4c-7f1e2a3b4c5d'
    expect(appointmentReminderSubject(id, 3)).toBe(`appointment_reminder:${id}:w3`)
    expect(windowVersionOf(appointmentReminderSubject(id, 12))).toBe(12)
    expect(windowVersionOf('estimate_reminder:x:first')).toBeNull()
  })

  it('[HH-COM-11] the address as one line, without an empty unit', () => {
    expect(addressLine({ street: '1 Synthetic Way', unit: null, city: 'Testville', state: 'ky', zip: '40000' })).toBe(
      '1 Synthetic Way, Testville, KY 40000',
    )
    expect(
      addressLine({ street: '1 Synthetic Way', unit: 'Apt 2', city: 'Testville', state: 'KY', zip: '40000' }),
    ).toBe('1 Synthetic Way, Apt 2, Testville, KY 40000')
  })

  it("[HH-COM-11][HH-COM-04][OWN-DEC-158] the message declares the owner wording's values; the address is never rendered", () => {
    const type = messageType('reminder.appointment')
    expect(type).toMatchObject({ audience: 'customer', triggerEvents: [], templateId: 'appointment_reminder' })
    expect(Object.keys(type.variables).sort()).toEqual([
      'customerName',
      'date',
      'end',
      'preparationSteps',
      'projectLink',
      'serviceAddress',
      'start',
      'visitNumber',
      'visitWindow',
      'zone',
    ])
    // The staff-reviewed draft keeps the address; no customer template may show it (OWN-DEC-158, TSK-0119).
    expect(
      templateProblems({
        messageKey: 'reminder.appointment',
        channel: 'sms',
        locale: 'en',
        subject: null,
        body: '{visitWindow} {preparationSteps} {projectLink}',
        translationReview: 'source',
      }),
    ).toEqual([])
    expect(
      templateProblems({
        messageKey: 'reminder.appointment',
        channel: 'sms',
        locale: 'en',
        subject: null,
        body: '{visitWindow} {serviceAddress}',
        translationReview: 'source',
      }).join(),
    ).toMatch(/no customer message shows/)
    expect(
      templateProblems({
        messageKey: 'reminder.appointment',
        channel: 'sms',
        locale: 'en',
        subject: null,
        body: '{depositAmount}',
        translationReview: 'source',
      }).length,
    ).toBeGreaterThan(0)
  })

  it('[HH-COM-11][HH-LANG-03] every stop reason has its staff label', () => {
    const labelled = new Set<string>(LABEL_FAMILIES.reminderReason)
    expect(APPOINTMENT_REMINDER_STOP_REASONS.filter((r) => !labelled.has(r))).toEqual([])
    // The database backstop's reasons (migration 0060: 'visit_' || state) are labelled too.
    for (const s of ['canceled', 'en_route', 'no_access']) expect(labelled.has(`visit_${s}`)).toBe(true)
  })
})
