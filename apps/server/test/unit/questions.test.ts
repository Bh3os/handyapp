// Staff questions: the delivery subjects, the question link and the cadence reads (TSK-0051; HH-LEAD-03, HH-LEAD-06,
// HH-COM-06, OWN-DEC-98, OWN-DEC-101). Pure functions; synthetic IDs only (RULE-SYNTHETIC-DATA).
import { describe, expect, it } from 'vitest'
import { MESSAGE_TYPES } from '../../src/modules/notifications/index.js'
import {
  noticeSubject,
  questionLink,
  QUESTION_NOTICE,
  QUESTION_REMINDER,
  REPLY_STAFF_NOTICE,
  reminderSubject,
  subjectOf,
} from '../../src/modules/questions/index.js'
import { QUEUE_ITEM_TYPES } from '../../src/modules/queue/index.js'

const ID = '0f9c2a4e-1b2c-4d3e-8f00-123456789abc'

describe('question deliveries (TSK-0051, HH-COM-06, OWN-DEC-98)', () => {
  it('[HH-COM-06][HH-LEAD-03] one notice subject per question and one per reminder stage; nothing else parses', () => {
    expect(noticeSubject(ID)).toBe(`question:${ID}`)
    expect(subjectOf(noticeSubject(ID))).toEqual({ questionId: ID, stage: null })
    expect(subjectOf(reminderSubject(ID, 'first'))).toEqual({ questionId: ID, stage: 'first' })
    expect(subjectOf(reminderSubject(ID, 'final'))).toEqual({ questionId: ID, stage: 'final' })
    for (const bad of [`question:${ID}:third`, `reply:${ID}`, 'question:not-a-uuid', `question:${ID}:first:x`])
      expect(subjectOf(bad)).toBeNull()
  })

  it('[HH-LEAD-03][HH-ID-04] the link opens the question in the portal, through the project page; no URL, no link', () => {
    expect(questionLink('https://www.example.test/', 'HH-7K2M9Q4D', ID)).toBe(
      `https://www.example.test/portal/p/HH-7K2M9Q4D#question-${ID}`,
    )
    expect(questionLink(undefined, 'HH-7K2M9Q4D', ID)).toBeNull()
  })

  it('[HH-COM-06][HH-LEAD-06][OWN-DEC-153] the notice and the reminder are automatic; the staff notice is internal', () => {
    expect(MESSAGE_TYPES.get(QUESTION_NOTICE)).toMatchObject({
      audience: 'customer',
      triggerEvents: ['question.published'],
    })
    // TSK-0121: the reminder is scheduled from the notice's successful delivery.
    expect(MESSAGE_TYPES.get(QUESTION_REMINDER)).toMatchObject({
      audience: 'customer',
      triggerEvents: ['message.delivery_succeeded'],
    })
    expect(MESSAGE_TYPES.get(REPLY_STAFF_NOTICE)).toMatchObject({
      audience: 'staff',
      // TSK-0120: also the first customer message of a conversation since staff last handled it.
      triggerEvents: ['question.customer_replied', 'conversation.customer_replied'],
    })
    // The reminder drafts are prominent: a time-sensitive queue item, released by the roles that release drafts.
    expect(QUEUE_ITEM_TYPES.find((q) => q.id === 'question_reminder')).toMatchObject({
      band: 'time_sensitive',
      view: 'message.release_draft',
      screen: 'requests',
    })
  })
})
