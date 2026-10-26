// The unpaid-invoice reminder schedule without a database (TSK-0091; HH-FIN-19, OWN-DEC-210, FACT-REMINDER-CADENCES,
// FACT-PAYMENT-DUE, OWN-DEC-159, RULE-DECIDED-VALUES-ACTIVE). Configuration values are synthetic stand-ins for the
// rows migration 0097 seeds; every instant is fixed.
import { describe, expect, it } from 'vitest'
import {
  activeArrangements,
  dueBasis,
  followUpSubjectKey,
  parseFollowUpSubject,
  parseReminderSubject,
  reminderSubjectKey,
  stageDueAt,
  unpaidReminderCadence,
  type StepRow,
} from '../../src/modules/finance/invoice-reminders.js'
import { parseValue, type Config, type ConfigEntry, type ConfigKey } from '../../src/platform/config/index.js'

const ZONE = 'America/Kentucky/Louisville'
const CADENCES = {
  unansweredEstimate: { afterDeliveryHours: 72, release: 'automatic' },
  unansweredQuestion: { afterDeliveryHours: 72, closeAfterReminderHours: 24, release: 'automatic' },
  appointment: { hoursBefore: 24, release: 'automatic' },
  satisfaction: { daysAfterCompletion: 2, release: 'staff' },
  unpaidInvoice: { firstDaysAfterDue: 3, secondDaysAfterDue: 7, release: 'automatic', followUp: 'staff' },
  repeatService: { schedule: 'customer_agreed', release: 'staff' },
}
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
const step = (over: Partial<StepRow>): StepRow => ({
  id: 'x',
  kind: 'payment_plan',
  due_on: null,
  ends_step_id: null,
  delivery_id: null,
  note: 'Synthetic.',
  recorded_by: 'staff',
  recorded_at: new Date('2030-03-01T15:00:00Z'),
  ...over,
})

describe('[FACT-REMINDER-CADENCES][OWN-DEC-210] the unpaid-invoice schedule', () => {
  it('the cadence shape is automatic 3 and 7 days with a staff-released follow-up; the old hours are refused', () => {
    expect(parseValue('reminders.cadences', CADENCES)).toEqual(CADENCES)
    expect(() =>
      parseValue('reminders.cadences', {
        ...CADENCES,
        unpaidInvoice: { firstHours: 24, finalHours: 72, release: 'staff' },
      }),
    ).toThrow()
    expect(() =>
      parseValue('reminders.cadences', {
        ...CADENCES,
        unpaidInvoice: { ...CADENCES.unpaidInvoice, followUp: 'automatic' },
      }),
    ).toThrow()
  })

  it('counts calendar days in the business zone at the opening of the contact hours; NOT CONFIGURED otherwise', () => {
    const config = fakeConfig({
      'reminders.cadences': CADENCES,
      'contact.hours': { days: 'every_day', open: '08:00', close: '22:00' },
      'business.timezone': { zone: ZONE },
    })
    const c = unpaidReminderCadence(config)
    expect(c).toMatchObject({ state: 'CONFIGURED', days: { 1: 3, 2: 7 }, at: '08:00', zone: ZONE })
    // EDT, then across the November DST change: always 8:00 AM local on the calendar day.
    expect(stageDueAt('2030-10-30', 3, '08:00', ZONE).toISOString()).toBe('2030-11-02T12:00:00.000Z')
    expect(stageDueAt('2030-10-30', 7, '08:00', ZONE).toISOString()).toBe('2030-11-06T13:00:00.000Z')
    // Across a month and a year end.
    expect(stageDueAt('2030-12-29', 3, '08:00', ZONE).toISOString()).toBe('2031-01-01T13:00:00.000Z')
    const all: Partial<Record<ConfigKey, unknown>> = {
      'reminders.cadences': CADENCES,
      'contact.hours': { days: 'every_day', open: '08:00', close: '22:00' },
      'business.timezone': { zone: ZONE },
    }
    for (const missing of Object.keys(all)) {
      const entries = Object.fromEntries(Object.entries(all).filter(([k]) => k !== missing))
      expect(unpaidReminderCadence(fakeConfig(entries)).state, missing).toBe('NOT_CONFIGURED')
    }
  })

  it('the due date: the business date of issue (due on receipt), or the latest revised date', () => {
    // 11:30 PM Eastern on March 1 is already March 2 in UTC: the business date stays March 1.
    const issued = { issued_at: new Date('2030-03-02T04:30:00Z') }
    expect(dueBasis(issued, [], ZONE)).toMatchObject({ dueOn: '2030-03-01', version: 0, revised: false })
    const revised = [
      step({ id: 'a', kind: 'revised_due_date', due_on: '2030-03-10' }),
      step({ id: 'b', kind: 'revised_due_date', due_on: '2030-03-20', recorded_at: new Date('2030-03-05T15:00:00Z') }),
    ]
    expect(dueBasis(issued, revised, ZONE)).toMatchObject({
      dueOn: '2030-03-20',
      version: 2,
      revised: true,
      since: new Date('2030-03-05T15:00:00Z'),
    })
    expect(dueBasis({ issued_at: null }, [], ZONE)).toBeNull()
  })

  it('a plan or a hold is active until its end is recorded', () => {
    const plan = step({ id: 'plan', kind: 'payment_plan' })
    const hold = step({ id: 'hold', kind: 'collection_hold' })
    expect(activeArrangements([plan, hold])).toEqual({ plan, hold })
    expect(
      activeArrangements([plan, hold, step({ id: 'end', kind: 'arrangement_ended', ends_step_id: 'plan' })]),
    ).toEqual({
      plan: null,
      hold,
    })
  })

  it('subjects name the invoice, the stage and the due-date version; follow-ups their step', () => {
    const id = '11111111-1111-4111-8111-111111111111'
    const stepId = '22222222-2222-4222-8222-222222222222'
    expect(parseReminderSubject(reminderSubjectKey(id, 2, 3))).toEqual({ invoiceId: id, stage: 2, dueVersion: 3 })
    expect(parseReminderSubject(`unpaid_invoice_reminder:${id}:s3:d0`)).toBeNull()
    expect(parseFollowUpSubject(followUpSubjectKey(id, stepId))).toEqual({ invoiceId: id, stepId })
    expect(parseFollowUpSubject(reminderSubjectKey(id, 1, 0))).toBeNull()
  })
})
