// The automatic reminder cadences without a database (TSK-0121; HH-EST-14, HH-LEAD-06, HH-COM-11, OWN-DEC-153,
// OWN-DEC-159, OWN-DEC-208, FACT-REMINDER-CADENCES, RULE-DECIDED-VALUES-ACTIVE, T41). Configuration values are synthetic
// stand-ins for the rows migration 0075 seeds; every instant is fixed.
import { describe, expect, it } from 'vitest'
import { reminderCadence, reminderDueAt } from '../../src/modules/estimates/index.js'
import { questionCadence } from '../../src/modules/questions/index.js'
import { parseValue, type Config, type ConfigEntry, type ConfigKey } from '../../src/platform/config/index.js'

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
          version: 2,
          sourceIds: ['TEST'],
          proposed: false,
          effectiveFrom: new Date(0),
        }
      : { state: 'NOT_CONFIGURED', key, version: 1, sourceIds: [`OQ-${key}`] }) as unknown as ConfigEntry<K>
  return { get, entries: () => [] }
}
const H = 3_600_000

describe('[FACT-REMINDER-CADENCES][OWN-DEC-153] the decided cadences are configuration', () => {
  it('the shape takes the automatic estimate, question and appointment reminders; the others stay staff-released', () => {
    expect(parseValue('reminders.cadences', CADENCES)).toEqual(CADENCES)
    // No 24-hour estimate draft and no first/final question drafts any more: the old fields are refused.
    expect(() =>
      parseValue('reminders.cadences', {
        ...CADENCES,
        unansweredEstimate: { firstHours: 24, finalHours: 72, contactHoursOnly: false },
      }),
    ).toThrow(/unknown field|missing/)
    expect(() =>
      parseValue('reminders.cadences', { ...CADENCES, appointment: { hoursBefore: 24, release: 'staff' } }),
    ).toThrow(/automatic/)
  })

  it('[HH-EST-14] one estimate reminder 72 hours after the successful delivery', () => {
    const c = reminderCadence(fakeConfig({ 'reminders.cadences': CADENCES }))
    expect(c).toEqual({ state: 'CONFIGURED', version: 2, proposed: false, afterDeliveryHours: 72 })
    if (c.state !== 'CONFIGURED') return
    const delivered = new Date('2026-10-20T14:00:00Z')
    expect(reminderDueAt(delivered, c)).toEqual(new Date(delivered.getTime() + 72 * H))
    expect(reminderCadence(fakeConfig({}))).toEqual({ state: 'NOT_CONFIGURED', version: 1 })
  })

  it('[HH-LEAD-06][OWN-DEC-208] one question reminder 72 hours after the notice; closing 24 hours after it was sent', () => {
    expect(questionCadence(fakeConfig({ 'reminders.cadences': CADENCES }))).toEqual({
      afterDeliveryHours: 72,
      closeAfterReminderHours: 24,
    })
    expect(questionCadence(fakeConfig({}))).toBeNull()
  })

  it('[T41][OWN-DEC-159] 3 days are 72 elapsed hours across a DST change, Eastern or Central alike', () => {
    const c = reminderCadence(fakeConfig({ 'reminders.cadences': CADENCES }))
    if (c.state !== 'CONFIGURED') throw new Error('configured above')
    // Delivered 10:00 AM EDT on Friday 30 October 2026; due 72 hours later, 9:00 AM EST on Monday 2 November.
    expect(reminderDueAt(new Date('2026-10-30T14:00:00Z'), c)).toEqual(new Date('2026-11-02T14:00:00Z'))
    // Delivered 10:00 AM CST on Friday 6 March 2026; due 72 hours later, 11:00 AM CDT on Monday 9 March.
    expect(reminderDueAt(new Date('2026-03-06T16:00:00Z'), c)).toEqual(new Date('2026-03-09T16:00:00Z'))
  })
})
