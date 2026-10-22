import { describe, expect, it } from 'vitest'
import type { Config, ConfigEntry, ConfigKey, ConfigValue } from '../../src/platform/config/index.js'
import {
  assertAutomatic,
  automaticPolicy,
  contentLocale,
  deliveryAuditAction,
  deliveryIdempotencyKey,
  isOutcomeUnknown,
  MESSAGE_TYPES,
  messageTypeProblems,
  nextContactTime,
  NotAutomaticError,
  NotificationPolicyError,
  renderTemplate,
  templateProblems,
  type TemplateDraft,
} from '../../src/modules/notifications/index.js'

const LIST: ConfigValue<'messages.automatic'> = {
  customer: [
    'request.receipt',
    'contact.verification_code',
    'project.access_link',
    'question.notice',
    'estimate_visit.options',
    'estimate_visit.confirmed',
    'decision.not_a_fit',
    'estimate.ready',
    'approval.receipt',
    'appointment.confirmed',
    'appointment.changed',
    'visit.on_the_way',
    'invoice.ready',
    'payment.receipt',
  ],
  staffAccount: ['staff.invitation', 'staff.password_reset'],
  staffNotifications: ['staff_notice.customer_reply', 'staff_notice.case_opened'],
}

function configWith(value: ConfigValue<'messages.automatic'> | null): Config {
  const get = <K extends ConfigKey>(key: K): ConfigEntry<K> => {
    if (key === 'messages.automatic' && value)
      return {
        state: 'CONFIGURED',
        key,
        value: value as ConfigValue<K>,
        version: 1,
        sourceIds: ['FACT-AUTOMATIC-MESSAGES'],
        proposed: false,
        effectiveFrom: new Date(0),
      }
    return { state: 'NOT_CONFIGURED', key, version: null, sourceIds: [] }
  }
  return { get, entries: () => [] }
}

describe('automatic-message policy (TSK-0047, HH-COM-06, FACT-AUTOMATIC-MESSAGES)', () => {
  it('an unlisted message cannot send automatically: it is a staff-released draft', () => {
    const policy = automaticPolicy(configWith(LIST))
    for (const k of [
      'staff.reply',
      'reminder.unanswered_estimate',
      'reminder.unpaid_invoice',
      'review.request',
      'staff_notice.estimate_declined',
    ])
      expect(() => assertAutomatic(policy, k), k).toThrow(NotAutomaticError)
    expect(() => assertAutomatic(policy, 'request.receipt')).not.toThrow()
    expect(policy.isAutomatic('payment.receipt')).toBe(true)
  })

  it('sends nothing automatically while the list is NOT CONFIGURED (fail closed)', () => {
    const policy = automaticPolicy(configWith(null))
    expect(policy.state).toBe('NOT_CONFIGURED')
    expect(policy.isAutomatic('request.receipt')).toBe(false)
  })

  it('refuses a list naming an unknown type, a type under the wrong audience, or a draft-only type', () => {
    expect(() => automaticPolicy(configWith({ ...LIST, customer: ['request.receipt', 'marketing.promo'] }))).toThrow(
      NotificationPolicyError,
    )
    expect(() => automaticPolicy(configWith({ ...LIST, staffAccount: ['request.receipt'] }))).toThrow(/wrong audience/)
    // A staff-released draft type has no committed trigger event; the routine reminders do (TSK-0121, OWN-DEC-153).
    expect(() => automaticPolicy(configWith({ ...LIST, customer: ['reminder.satisfaction_check'] }))).toThrow(
      /no committed trigger/,
    )
    expect(automaticPolicy(configWith({ ...LIST, customer: ['reminder.unanswered_estimate'] })).list()).toContain(
      'reminder.unanswered_estimate',
    )
  })
})

describe('templates hold no access secrets or amounts (TSK-0047, HH-COM-04, T74)', () => {
  it('declares no access secret, password, card or amount variable on any message type', () => {
    for (const type of MESSAGE_TYPES.values()) expect(messageTypeProblems(type), type.key).toEqual([])
  })

  const draft = (over: Partial<TemplateDraft>): TemplateDraft => ({
    messageKey: 'question.notice',
    channel: 'sms',
    locale: 'en',
    subject: null,
    body: 'HandyHub has a question about your request. View and reply securely. {projectLink}',
    translationReview: 'source',
    ...over,
  })

  it('accepts the owner-worded question notice', () => {
    expect(templateProblems(draft({}))).toEqual([])
    expect(
      templateProblems(draft({ channel: 'email', subject: 'HandyHub has a question about your request' })),
    ).toEqual([])
  })

  it('refuses access codes, passwords, amounts, undeclared or numeric placeholders and credentials in a subject', () => {
    const bad = (body: string) => templateProblems(draft({ body }))
    expect(bad('Gate code {accessCode}').join()).toMatch(/accessCode/)
    expect(bad('Use {gateCode} {projectLink}').join()).toMatch(/does not declare/)
    expect(bad('Balance {balance} {projectLink}').join()).toMatch(/amount|does not declare/)
    expect(bad('Total {total, number} {projectLink}').join()).toMatch(/number placeholder/)
    expect(bad('Hi {password}').join()).toMatch(/secret|does not declare/)
    expect(
      templateProblems({
        messageKey: 'contact.verification_code',
        channel: 'email',
        locale: 'en',
        subject: 'Code {verificationCode}',
        body: '{verificationCode}',
        translationReview: 'source',
      }).join(),
    ).toMatch(/subject never carries/)
    expect(
      templateProblems({
        messageKey: 'contact.verification_code',
        channel: 'sms',
        locale: 'en',
        subject: null,
        body: 'Your code: {verificationCode}',
        translationReview: 'source',
      }),
    ).toEqual([])
  })

  it('keeps customer templates English and releases Spanish staff text only as AI-reviewed (RULE-LANGUAGES, T04)', () => {
    expect(templateProblems(draft({ locale: 'es', translationReview: 'ai_reviewed' })).join()).toMatch(/English only/)
    const staff = {
      messageKey: 'staff_notice.customer_reply',
      channel: 'email' as const,
      subject: 'S',
      body: '{appLink}',
    }
    expect(templateProblems({ ...staff, locale: 'es', translationReview: 'ai_reviewed' })).toEqual([])
    expect(templateProblems({ ...staff, locale: 'es', translationReview: 'source' }).join()).toMatch(/AI-reviewed/)
    expect(templateProblems(draft({ subject: 'x' })).join()).toMatch(/subject/)
  })

  it('takes the content language from the audience, never from the sender (HH-COM-03, T66)', () => {
    expect(contentLocale('customer', 'es')).toBe('en')
    expect(contentLocale('customer')).toBe('en')
    expect(contentLocale('staff', 'es')).toBe('es')
    expect(contentLocale('staff', 'en')).toBe('en')
  })

  it('renders only declared values and needs every placeholder', () => {
    const t = { ...draft({}), version: 1, audience: 'customer' as const }
    expect(renderTemplate(t, { projectLink: 'https://example.test/p/1' }).body).toBe(
      'HandyHub has a question about your request. View and reply securely. https://example.test/p/1',
    )
    expect(() => renderTemplate(t, {})).toThrow()
    expect(() => renderTemplate(t, { projectLink: 'x', accessCode: '1' })).toThrow(/does not declare/)
  })

  it('derives one stable provider key per delivery tuple (HH-COM-02)', () => {
    const k = deliveryIdempotencyKey('request.receipt', 'email', 'request:1', 'a@example.test')
    expect(k).toBe(deliveryIdempotencyKey('request.receipt', 'email', 'request:1', 'a@example.test'))
    expect(k).not.toBe(deliveryIdempotencyKey('request.receipt', 'email', 'request:2', 'a@example.test'))
    expect(k).toMatch(/^notification\/[0-9a-f]{40}$/)
  })

  it('[HH-SEC-06][HH-ARC-09] audits each delivery as what happened; an unknown provider outcome is never a send', () => {
    expect(deliveryAuditAction({ state: 'queued', errorCode: null })).toBe('notification.sent')
    expect(deliveryAuditAction({ state: 'sent', errorCode: null })).toBe('notification.sent')
    expect(deliveryAuditAction({ state: 'failed', errorCode: 'template_not_configured' })).toBe('notification.failed')
    expect(deliveryAuditAction({ state: 'failed', errorCode: 'http_503' })).toBe('notification.failed')
    expect(deliveryAuditAction({ state: 'failed', errorCode: 'outcome_unknown_timeout' })).toBe(
      'notification.outcome_unknown',
    )
    expect(deliveryAuditAction({ state: 'suppressed', errorCode: 'opted_out' })).toBe('notification.suppressed')
    expect(deliveryAuditAction({ state: 'cancelled', errorCode: 'record_changed' })).toBe('notification.cancelled')
    expect(['outcome_unknown_timeout', 'outcome_unknown_network_error'].map(isOutcomeUnknown)).toEqual([true, true])
    expect(['timeout', 'http_503', 'connect_refused', null, undefined].map(isOutcomeUnknown)).toEqual([
      false,
      false,
      false,
      false,
      false,
    ])
  })
})

describe('daily contact hours (TSK-0047, HH-COM-09, FACT-HOURS)', () => {
  const hours = { open: '08:00', close: '22:00' }
  const zone = 'America/Kentucky/Louisville'
  it('sends inside the hours and waits for the next 8 AM outside them, across DST', () => {
    const noon = new Date('2026-10-20T16:00:00Z') // 12:00 EDT
    expect(nextContactTime(noon, hours, zone)).toEqual(noon)
    expect(nextContactTime(new Date('2026-10-21T03:00:00Z'), hours, zone)).toEqual(new Date('2026-10-21T12:00:00Z')) // 23:00 EDT
    expect(nextContactTime(new Date('2026-10-20T10:30:00Z'), hours, zone)).toEqual(new Date('2026-10-20T12:00:00Z')) // 06:30 EDT
    // 23:00 EDT on Saturday 31 October; clocks fall back on 1 November, so 8 AM is 13:00 UTC.
    expect(nextContactTime(new Date('2026-11-01T03:00:00Z'), hours, zone)).toEqual(new Date('2026-11-01T13:00:00Z'))
  })
})
