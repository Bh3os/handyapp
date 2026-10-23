// The values automatic messages supply, without a database (TSK-0120; HH-COM-13, HH-COM-06, OWN-DEC-151,
// OWN-DEC-158, OWN-DEC-159, FACT-PUBLIC-CONTACT, T74). Every value, host and number here is synthetic.
import { describe, expect, it } from 'vitest'
import {
  estimatePageLink,
  instantText,
  jobNumberOf,
  MESSAGE_TYPES,
  portalLink,
  present,
  staffLink,
  suppliedVariables,
  supportContactText,
  visitNumberOf,
  visitWindowValues,
} from '../../src/modules/notifications/index.js'
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

describe('[HH-COM-13][OWN-DEC-158] links and references carry no token', () => {
  it('links open the portal page of the project, a tab of it or one estimate version; none without a site', () => {
    expect(portalLink('https://site.example.test/', 'HH-0000TEST')).toBe(
      'https://site.example.test/portal/p/HH-0000TEST',
    )
    expect(portalLink('https://site.example.test', 'HH-0000TEST', 'appointments')).toBe(
      'https://site.example.test/portal/p/HH-0000TEST/appointments',
    )
    expect(estimatePageLink('https://site.example.test', 'HH-0000TEST', 'HH-0000TEST-E1', 2)).toBe(
      'https://site.example.test/portal/p/HH-0000TEST/documents/HH-0000TEST-E1/2',
    )
    expect(portalLink(undefined, 'HH-0000TEST')).toBeNull()
    expect(staffLink('https://staff.example.test/', '/requests/abc')).toBe('https://staff.example.test/requests/abc')
    expect(staffLink(undefined, 'requests/abc')).toBeNull()
  })

  it('PROPOSED reference formats: a visit is <project>-V<n>; a job is named by its project reference', () => {
    expect(visitNumberOf('HH-0000TEST', 3)).toBe('HH-0000TEST-V3')
    expect(jobNumberOf('HH-0000TEST')).toBe('HH-0000TEST')
  })

  it('a missing value is left out, so the render fails visibly with its name', () => {
    expect(present({ a: 'x', b: null, c: undefined, d: '  ' })).toEqual({ a: 'x' })
  })
})

describe('[OWN-DEC-159][HH-COM-13] dates and windows in the zone of the records', () => {
  it('names the zone in force at the instant: Eastern and Central, across the clock change', () => {
    const summer = new Date('2026-07-02T13:00:00Z')
    const winter = new Date('2026-12-02T14:00:00Z')
    expect(instantText(summer, 'America/Kentucky/Louisville')).toBe('July 2, 2026 at 9:00 AM EDT')
    expect(instantText(winter, 'America/Kentucky/Louisville')).toBe('December 2, 2026 at 9:00 AM EST')
    expect(instantText(winter, 'America/Chicago')).toBe('December 2, 2026 at 8:00 AM CST')
    // The day the clocks go back (November 1, 2026): 1:30 AM happens twice, each named by its own offset.
    expect(instantText(new Date('2026-11-01T05:30:00Z'), 'America/Kentucky/Louisville')).toBe(
      'November 1, 2026 at 1:30 AM EDT',
    )
    expect(instantText(new Date('2026-11-01T06:30:00Z'), 'America/Kentucky/Louisville')).toBe(
      'November 1, 2026 at 1:30 AM EST',
    )
  })

  it('a visit window is its date, start, end and zone in the property zone', () => {
    const window = {
      date: '2026-11-04',
      start: '09:00',
      end: '11:00',
      zone: 'America/Indiana/Tell_City',
      startOffsetMinutes: -360,
      endOffsetMinutes: -360,
      startsAt: new Date('2026-11-04T15:00:00Z'),
      endsAt: new Date('2026-11-04T17:00:00Z'),
    }
    expect(visitWindowValues(window)).toEqual({
      visitDate: 'Wednesday, November 4, 2026',
      startTime: '9:00 AM',
      endTime: '11:00 AM',
      timeZone: 'CST',
      arrivalWindow: '9:00 AM – 11:00 AM (CST)',
      visitWindow: 'Wednesday, November 4, 2026, 9:00 AM – 11:00 AM (CST)',
    })
  })
})

describe('[FACT-PUBLIC-CONTACT] the support contact of the account notice', () => {
  it('is the configured public phone and email, or the labelled placeholders while NOT CONFIGURED', () => {
    expect(supportContactText(fakeConfig({}))).toBe(
      'Phone: Placeholder — not provided yet · Email: Placeholder — not provided yet',
    )
    expect(
      supportContactText(
        fakeConfig({ 'business.public_contact': { phone: '(502) 555-0100', email: 'help@example.test' } }),
      ),
    ).toBe('Phone: (502) 555-0100 · Email: help@example.test')
  })
})

describe('[HH-COM-06][FACT-AUTOMATIC-MESSAGES] which messages are wired', () => {
  it('the events that exist today supply every declared variable; the others stay not wired', () => {
    const wired = [
      'request.receipt',
      'contact.verification_code',
      'project.access_link',
      'question.notice',
      'estimate_visit.options',
      'estimate_visit.confirmed',
      'decision.not_a_fit',
      'estimate.ready',
      'approval.receipt',
      'work_visit.options',
      'appointment.confirmed',
      'appointment.changed',
      'visit.cancelled',
      'visit.on_the_way',
      'account.contact_changed',
      'staff.reply',
      'staff_notice.customer_reply',
      // TSK-0077: the work-paused draft stores both of its values.
      'job.paused',
      // TSK-0085: the invoice-ready and deposit-invoice notices of an issued invoice.
      'invoice.deposit',
      'invoice.ready',
      // TSK-0082: the proposed-change notice of an issued change order.
      'change_order.proposed',
    ]
    for (const key of wired) {
      const type = MESSAGE_TYPES.get(key)
      if (!type) throw new Error(key)
      const supplied = new Set(suppliedVariables(type))
      // The receipt carries no link (OWN-DEC-151 request_received has none).
      const declared = Object.keys(type.variables).filter((v) => !(key === 'request.receipt' && v === 'projectLink'))
      expect(
        declared.filter((v) => !supplied.has(v)),
        key,
      ).toEqual([])
    }
    // No event exists yet for these (TSK-0084, TSK-0087, TSK-0092; the estimate question answer has no record of its
    // own).
    for (const key of [
      'estimate.question_answered',
      'job.complete',
      'payment.receipt',
      'reminder.satisfaction_check',
    ])
      expect(suppliedVariables(MESSAGE_TYPES.get(key) as never), key).toEqual([])
    // Work paused is released by the Owner only and never automatic.
    expect(MESSAGE_TYPES.get('job.paused')).toMatchObject({ ownerApproval: true, triggerEvents: [] })
  })
})
