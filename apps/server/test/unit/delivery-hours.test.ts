// Delivery hours without a database (TSK-0122; HH-COM-15, HH-COM-09, OWN-DEC-154, OWN-DEC-207, OWN-DEC-159, FACT-HOURS,
// T65, T41). Every instant is fixed, so nothing depends on when the suite runs. The windows are the seeded values:
// contact.hours 08:00–22:00 in the recipient's zone, sms.unknown_zone_hours 09:00–21:00 America/Kentucky/Louisville.
import { recipientZone, textHours } from '@handyhub/domain'
import { describe, expect, it } from 'vitest'
import {
  heldToTextHours,
  insideTextWindow,
  messageType,
  NOT_CONFIGURED_ERRORS,
  nextTextTime,
  WAITING_TEXT_HOURS,
} from '../../src/modules/notifications/index.js'
import { deliveryAuditAction } from '../../src/modules/notifications/deliveries.js'

const PERMITTED = { open: '08:00', close: '22:00' }
const FALLBACK = { open: '09:00', close: '21:00', zone: 'America/Kentucky/Louisville' }
const EASTERN = textHours(recipientZone('America/Kentucky/Louisville'), PERMITTED, FALLBACK)
const CENTRAL = textHours(recipientZone('America/Chicago'), PERMITTED, FALLBACK)
const UNKNOWN = textHours(recipientZone(null), PERMITTED, FALLBACK)

const at = (iso: string) => new Date(iso)

describe('[HH-COM-15][HH-COM-09][OWN-DEC-154] a non-urgent text goes only inside the recipient’s permitted local hours', () => {
  it('Eastern (EDT, UTC-4): 7:59 AM waits for 8:00 AM; 8:00 AM and 9:59 PM go; 10:01 PM waits for 8:00 AM next day', () => {
    expect(EASTERN).toMatchObject({ zone: 'America/Kentucky/Louisville', basis: 'recipient_zone' })
    expect(nextTextTime(at('2026-10-21T11:59:00Z'), EASTERN)).toEqual(at('2026-10-21T12:00:00Z'))
    expect(insideTextWindow(at('2026-10-21T12:00:00Z'), EASTERN)).toBe(true)
    expect(insideTextWindow(at('2026-10-22T01:59:00Z'), EASTERN)).toBe(true)
    expect(nextTextTime(at('2026-10-22T02:01:00Z'), EASTERN)).toEqual(at('2026-10-22T12:00:00Z'))
  })

  it('Central (CDT, UTC-5): the same local times, one hour later in UTC', () => {
    expect(CENTRAL).toMatchObject({ zone: 'America/Chicago', basis: 'recipient_zone' })
    expect(nextTextTime(at('2026-10-21T12:59:00Z'), CENTRAL)).toEqual(at('2026-10-21T13:00:00Z'))
    expect(insideTextWindow(at('2026-10-21T13:00:00Z'), CENTRAL)).toBe(true)
    expect(insideTextWindow(at('2026-10-22T02:59:00Z'), CENTRAL)).toBe(true)
    expect(nextTextTime(at('2026-10-22T03:01:00Z'), CENTRAL)).toEqual(at('2026-10-22T13:00:00Z'))
    // 8:30 AM Eastern is 7:30 AM Central: a Central recipient's text still waits.
    expect(nextTextTime(at('2026-10-21T12:30:00Z'), CENTRAL)).toEqual(at('2026-10-21T13:00:00Z'))
  })

  it('[T41][OWN-DEC-159] across DST: the next opening is 8:00 AM local on the far side of the change', () => {
    // Fall back (1 November 2026, 2 AM): 10:01 PM EDT on 31 October waits for 8:00 AM EST (13:00 UTC).
    expect(nextTextTime(at('2026-11-01T02:01:00Z'), EASTERN)).toEqual(at('2026-11-01T13:00:00Z'))
    // ... and 7:59 AM EST on 1 November waits one minute.
    expect(nextTextTime(at('2026-11-01T12:59:00Z'), EASTERN)).toEqual(at('2026-11-01T13:00:00Z'))
    // Spring forward (8 March 2026, 2 AM): 10:01 PM CST on 7 March (Central) waits for 8:00 AM CDT (13:00 UTC).
    expect(nextTextTime(at('2026-03-08T04:01:00Z'), CENTRAL)).toEqual(at('2026-03-08T13:00:00Z'))
    // 9:59 PM EST on 7 March (Eastern) still goes; 10:01 PM waits for 8:00 AM EDT (12:00 UTC).
    expect(insideTextWindow(at('2026-03-08T02:59:00Z'), EASTERN)).toBe(true)
    expect(nextTextTime(at('2026-03-08T03:01:00Z'), EASTERN)).toEqual(at('2026-03-08T12:00:00Z'))
  })
})

describe('[OWN-DEC-207][HH-COM-15] an unknown recipient zone: 9 AM–9 PM Eastern, never assumed 10 PM Eastern', () => {
  it('8:59 AM waits for 9:00 AM; 9:00 AM and 8:59 PM go; 9:01 PM waits for 9:00 AM next day (EDT)', () => {
    expect(UNKNOWN).toMatchObject({ ...FALLBACK, basis: 'unknown_zone_fallback' })
    expect(nextTextTime(at('2026-10-21T12:59:00Z'), UNKNOWN)).toEqual(at('2026-10-21T13:00:00Z'))
    expect(insideTextWindow(at('2026-10-21T13:00:00Z'), UNKNOWN)).toBe(true)
    expect(insideTextWindow(at('2026-10-22T00:59:00Z'), UNKNOWN)).toBe(true)
    expect(nextTextTime(at('2026-10-22T01:01:00Z'), UNKNOWN)).toEqual(at('2026-10-22T13:00:00Z'))
    // 9:30 PM Eastern would be inside a known zone's 8 AM–10 PM, but not inside the fallback.
    expect(insideTextWindow(at('2026-10-22T01:30:00Z'), EASTERN)).toBe(true)
    expect(insideTextWindow(at('2026-10-22T01:30:00Z'), UNKNOWN)).toBe(false)
  })

  it('in winter (EST, UTC-5) the fallback is still 9 AM–9 PM Eastern local time', () => {
    expect(nextTextTime(at('2026-12-01T13:59:00Z'), UNKNOWN)).toEqual(at('2026-12-01T14:00:00Z'))
    expect(nextTextTime(at('2026-12-02T02:01:00Z'), UNKNOWN)).toEqual(at('2026-12-02T14:00:00Z'))
  })
})

describe('[HH-COM-15][OWN-DEC-207][FACT-HOURS] what never waits', () => {
  it('a code (authentication), account notices, the access link and On my way never wait; staff notices neither', () => {
    expect(heldToTextHours(messageType('contact.verification_code'))).toBe(false)
    expect(heldToTextHours(messageType('project.access_link'))).toBe(false)
    expect(heldToTextHours(messageType('visit.on_the_way'))).toBe(false)
    expect(heldToTextHours(messageType('staff_notice.customer_reply'))).toBe(false)
  })

  it('reminders, notices and replies wait for the permitted hours by text', () => {
    for (const key of [
      'reminder.unanswered_estimate',
      'reminder.unanswered_question',
      'reminder.appointment',
      'staff.reply',
      'question.notice',
      'estimate.ready',
    ])
      expect(heldToTextHours(messageType(key)), key).toBe(true)
  })

  it('a waiting text is audited as held; texts kept off and missing hours are not-configured failures', () => {
    expect(
      deliveryAuditAction({ state: 'queued', errorCode: WAITING_TEXT_HOURS, heldUntil: at('2026-10-21T12:00:00Z') }),
    ).toBe('notification.held')
    expect(NOT_CONFIGURED_ERRORS.has('sms_disabled')).toBe(true)
    expect(NOT_CONFIGURED_ERRORS.has('text_hours_not_configured')).toBe(true)
  })
})
