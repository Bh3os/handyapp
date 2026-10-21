// How the first-response clock reads, and which messages are a response (TSK-0043; HH-LEAD-05, OWN-DEC-115,
// OWN-DEC-116, FACT-RESPONSE-TARGET). The configured values are passed in as the clock row pins them.
import { describe, expect, it } from 'vitest'
import { responseClockView, type ClockRow } from '../../src/modules/requests/clock-view.js'
import { isMeaningfulResponse, MEANINGFUL_RESPONSE_MESSAGES } from '../../src/modules/requests/response-clock.js'
import { MESSAGE_TYPES } from '../../src/modules/notifications/index.js'

const row = (over: Partial<ClockRow> = {}): ClockRow => ({
  // Wednesday 2026-10-21, 21:40 in Louisville (EDT): 20 minutes before closing.
  started_at: new Date('2026-10-22T01:40:00Z'),
  target_minutes: 60,
  hours_open: '08:00',
  hours_close: '22:00',
  time_zone: 'America/Kentucky/Louisville',
  // 08:40 the next morning.
  due_at: new Date('2026-10-22T12:40:00Z'),
  stopped_at: null,
  stop_kind: null,
  business_minutes: null,
  within_target: null,
  ...over,
})

describe('the clock as staff read it (HH-LEAD-05, OWN-DEC-115)', () => {
  it('[HH-LEAD-05] counts down in business minutes and pauses overnight', () => {
    expect(responseClockView(row(), new Date('2026-10-22T01:50:00Z'))).toMatchObject({
      state: 'running',
      remainingMinutes: 50,
      resumesAt: null,
      timeZone: 'America/Kentucky/Louisville',
    })
    expect(responseClockView(row(), new Date('2026-10-22T05:00:00Z'))).toMatchObject({
      state: 'paused',
      remainingMinutes: 40,
      resumesAt: '2026-10-22T12:00:00.000Z',
    })
    expect(responseClockView(row(), new Date('2026-10-22T13:00:00Z'))).toMatchObject({
      state: 'overdue',
      overdueMinutes: 20,
    })
  })

  it('[HH-LEAD-05][OWN-DEC-125] once answered it shows the business minutes and whether that was within the target', () => {
    const answered = row({
      stopped_at: new Date('2026-10-22T12:10:00Z'),
      stop_kind: 'conversation_recorded',
      business_minutes: 30,
      within_target: true,
    })
    expect(responseClockView(answered, new Date('2026-10-23T00:00:00Z'))).toMatchObject({
      state: 'stopped',
      stopKind: 'conversation_recorded',
      businessMinutes: 30,
      withinTarget: true,
      remainingMinutes: null,
    })
  })

  it('[RULE-NO-INVENTED-FACTS] without configured values there is no deadline and nothing is guessed', () => {
    const none = row({ target_minutes: null, hours_open: null, hours_close: null, time_zone: null, due_at: null })
    expect(responseClockView(none, new Date())).toMatchObject({
      state: 'not_configured',
      dueAt: null,
      remainingMinutes: null,
      overdueMinutes: null,
    })
  })
})

describe('what stops the clock (OWN-DEC-116)', () => {
  it('[OWN-DEC-116] meaningful staff responses only: never the receipt, codes, access links or reminders', () => {
    for (const k of MEANINGFUL_RESPONSE_MESSAGES) expect(MESSAGE_TYPES.get(k)?.audience, k).toBe('customer')
    for (const k of ['staff.reply', 'question.notice', 'estimate_visit.options', 'decision.not_a_fit'])
      expect(isMeaningfulResponse(k), k).toBe(true)
    for (const k of [
      'request.receipt',
      'contact.verification_code',
      'project.access_link',
      'reminder.unanswered_question',
      'staff_notice.customer_reply',
    ])
      expect(isMeaningfulResponse(k), k).toBe(false)
  })
})
