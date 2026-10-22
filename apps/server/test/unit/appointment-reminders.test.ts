// Appointment reminders without a database (TSK-0067, TSK-0121; HH-COM-11, HH-COM-15, FACT-REMINDER-CADENCES,
// OWN-DEC-153, OWN-DEC-107, OWN-DEC-159, RULE-DECIDED-VALUES-ACTIVE, T41, T65). Configuration values here are synthetic
// stand-ins for the seeded rows.
import { describe, expect, it } from 'vitest'
import { messageType, templateProblems } from '../../src/modules/notifications/index.js'
import {
  APPOINTMENT_REMINDER_STOP_REASONS,
  appointmentReminderCadence,
  appointmentReminderDueAt,
  appointmentReminderSubject,
  bookedAheadEnough,
} from '../../src/modules/visits/index.js'
import { windowVersionOf } from '../../src/modules/visits/reminders.js'
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
  unansweredEstimate: { afterDeliveryHours: 72, release: 'automatic' },
  unansweredQuestion: { afterDeliveryHours: 72, closeAfterReminderHours: 24, release: 'automatic' },
  appointment: { hoursBefore: 24, release: 'automatic' },
  satisfaction: { daysAfterCompletion: 2, release: 'staff' },
  unpaidInvoice: { firstHours: 24, finalHours: 72, release: 'staff' },
  repeatService: { schedule: 'customer_agreed', release: 'staff' },
}
const SEEDED = {
  'contact.hours': { days: 'every_day', open: '08:00', close: '22:00' },
  'business.timezone': { zone: 'America/Kentucky/Louisville' },
  'reminders.cadences': CADENCES,
}
const H = 3_600_000

describe('appointment reminder cadence (TSK-0067, TSK-0121, HH-COM-11)', () => {
  it('[HH-COM-11][FACT-REMINDER-CADENCES][OWN-DEC-153] automatic, 24 elapsed hours before the arrival window', () => {
    const c = appointmentReminderCadence(fakeConfig(SEEDED))
    expect(c).toEqual({ state: 'CONFIGURED', version: 3, proposed: false, hoursBefore: 24 })
    const starts = new Date('2026-10-30T13:00:00Z')
    expect(appointmentReminderDueAt(starts, 24)).toEqual(new Date(starts.getTime() - 24 * H))
  })

  it('[OWN-DEC-153][T41][OWN-DEC-159] across a DST change it is 24 real hours before, one local hour off', () => {
    // 9:00 AM EST on Sunday 1 November 2026 (the fall-back day): 24 hours before is 10:00 AM EDT on 31 October.
    const fallBack = new Date('2026-11-01T14:00:00Z')
    expect(appointmentReminderDueAt(fallBack, 24)).toEqual(new Date('2026-10-31T14:00:00Z'))
    // 9:00 AM CDT on Sunday 8 March 2026 (spring forward, Central): 24 hours before is 8:00 AM CST on 7 March.
    const springForward = new Date('2026-03-08T14:00:00Z')
    expect(appointmentReminderDueAt(springForward, 24)).toEqual(new Date('2026-03-07T14:00:00Z'))
  })

  it('[OWN-DEC-153] no "24-hour" reminder for a visit booked less than 24 hours ahead', () => {
    const starts = new Date('2026-10-30T13:00:00Z')
    expect(bookedAheadEnough(starts, new Date(starts.getTime() - 25 * H), 24)).toBe(true)
    expect(bookedAheadEnough(starts, new Date(starts.getTime() - 24 * H), 24)).toBe(true)
    expect(bookedAheadEnough(starts, new Date(starts.getTime() - 24 * H + 1), 24)).toBe(false)
    expect(bookedAheadEnough(starts, new Date(starts.getTime() - 10 * H), 24)).toBe(false)
  })

  it('[RULE-DECIDED-VALUES-ACTIVE] NOT CONFIGURED stays NOT CONFIGURED; no interval is made up', () => {
    expect(appointmentReminderCadence(fakeConfig({}))).toEqual({ state: 'NOT_CONFIGURED', version: 1 })
  })
})

describe('appointment reminder subjects and content (TSK-0067)', () => {
  it('[HH-COM-11] one subject per visit and window version, so a rescheduled visit gets a reminder of its own', () => {
    const id = '0f6a3a52-6a1a-4d55-9d4c-7f1e2a3b4c5d'
    expect(appointmentReminderSubject(id, 3)).toBe(`appointment_reminder:${id}:w3`)
    expect(windowVersionOf(appointmentReminderSubject(id, 12))).toBe(12)
    expect(windowVersionOf('estimate_reminder:x:first')).toBeNull()
  })

  it("[HH-COM-11][HH-COM-04][OWN-DEC-158] the message declares the owner wording's values; the address is never rendered", () => {
    const type = messageType('reminder.appointment')
    expect(type).toMatchObject({
      audience: 'customer',
      triggerEvents: ['appointment.reserved', 'estimate_visit.reserved', 'appointment.change_committed'],
      templateId: 'appointment_reminder',
    })
    // TSK-0121: the automatic reminder supplies the owner wording's values, never the address.
    expect([...(type.supplied ?? [])].sort()).toEqual([
      'customerName',
      'date',
      'end',
      'projectLink',
      'start',
      'visitNumber',
      'zone',
    ])
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
