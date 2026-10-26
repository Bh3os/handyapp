// Automation audit (TSK-0107; HH-AUTO-02, HH-AUTO-01, RULE-HUMAN-REVIEW, RULE-SAFETY-GATES, FACT-AUTOMATIC-MESSAGES).
// Every automation the server registers is listed here with the kind of its one declared effect. None of the kinds
// approves, waives, reprices, confirms capacity, decides coverage or a refund, or releases a hold: those stay with
// people. A new automation fails this test until it is classified here, so its effect is reviewed against HH-AUTO-02;
// robustness.test.ts checks at run time that the automations write only their effect tables.
import { describe, expect, it } from 'vitest'
import { buildAutomations } from '../../src/automations.js'
import { codeDeliveryAutomation, readCodeKey } from '../../src/modules/identity/index.js'
import { createProviders } from '../../src/providers/index.js'
import { readProviderSettings } from '../../src/providers/settings.js'

/** What an automation may do on its own. */
const KINDS = {
  /** Sends an owner-authorized automatic message, a staff notice or a message staff released (send-time rechecks). */
  message: 'message',
  /** Records a provider's delivery status, or the customer's own STOP, START or a provider suppression. */
  delivery_status: 'delivery_status',
  /** Marks a quarantined upload ready or rejected after checking the stored file. */
  file_check: 'file_check',
  /** Ends what a configured or owner-decided period ends (an estimate's validity, an offer's 24-hour hold). */
  expiry: 'expiry',
  /** Schedules a later job of an automatic reminder. */
  schedule: 'schedule',
  /** Prepares a draft that people release or issue; never sends or issues it. */
  draft: 'draft',
  /** Renders and stores the document of something people already decided (an approval, an issued invoice). */
  document: 'document',
  /** Opens, updates or resolves a staff queue item, review entry or suggestion; never decides it. */
  staff_queue: 'staff_queue',
  /** Records what a sent message did (the response clock, a question notice's delivery). */
  record: 'record',
  /** Removes the stored files of a record the Owner deleted. */
  erasure: 'erasure',
} as const
type Kind = keyof typeof KINDS

const EFFECTS: Record<string, Kind> = {
  'appointment.reminder_plan': 'schedule',
  'appointment.reminder_schedule': 'schedule',
  'approval_receipt.issue': 'document',
  'change_order.validity_expiry': 'expiry',
  'closeout.follow_up_prepare': 'draft',
  'estimate.reminder_plan': 'schedule',
  'estimate.reminder_schedule': 'schedule',
  'estimate.validity_expiry': 'expiry',
  'estimate_document.process': 'file_check',
  'field_photo.process': 'file_check',
  'hazard.customer_notice_draft': 'draft',
  'inbox.intake': 'staff_queue',
  'invoice.prepare_draft': 'draft',
  'invoice.reminder_outcome': 'staff_queue',
  'invoice.reminder_plan': 'schedule',
  'invoice.reminder_schedule': 'schedule',
  'invoice_document.issue': 'document',
  'notify.account.contact_changed': 'message',
  'notify.appointment.changed': 'message',
  'notify.appointment.confirmed': 'message',
  'notify.approval.receipt': 'message',
  'notify.change_order.proposed': 'message',
  'notify.contact.verification_code': 'message',
  'notify.decision.not_a_fit': 'message',
  'notify.estimate.ready': 'message',
  'notify.estimate_visit.confirmed': 'message',
  'notify.estimate_visit.options': 'message',
  'notify.invoice.deposit': 'message',
  'notify.invoice.ready': 'message',
  'notify.payment.receipt': 'message',
  'notify.project.access_link': 'message',
  'notify.provider_events': 'delivery_status',
  'notify.question.notice': 'message',
  'notify.release': 'message',
  'notify.request.receipt': 'message',
  'notify.staff_notice.case_opened': 'message',
  'notify.staff_notice.customer_reply': 'message',
  'notify.staff_notice.estimate_changes_requested': 'message',
  'notify.staff_notice.estimate_declined': 'message',
  'notify.staff_notice.schedule_change': 'message',
  'notify.visit.cancelled': 'message',
  'notify.visit.on_the_way': 'message',
  'notify.work_visit.options': 'message',
  'photo.process': 'file_check',
  'privacy.object_erasure': 'erasure',
  'privacy.request_deadlines': 'staff_queue',
  'questions.close_available': 'staff_queue',
  'questions.delivery_outcome': 'record',
  'questions.reminder_outcome': 'staff_queue',
  'questions.reminder_plan': 'schedule',
  'queue.deposit_due': 'staff_queue',
  'queue.estimate_to_write': 'staff_queue',
  'queue.new_request': 'staff_queue',
  'records.candidate_matches': 'staff_queue',
  'repeat_service.reminder_prepare': 'draft',
  'requests.response_clock': 'record',
  'retention.review_scan': 'staff_queue',
  'staff_link.email': 'message',
  'visit.window_offer_expiry': 'expiry',
}

/** Decisions people make (HH-AUTO-02): no declared effect may say it does one. */
const DECIDES =
  /\b(approves?|waives?|reprices?|refunds?|writes? off|charges?|confirms? (capacity|the visit|a visit)|decides?|releases? (a|the) hold|merges?|deletes?)\b/i

/** A declared effect without its "never ..." clauses, which state what the automation does not do. */
const does = (effect: string) => effect.split(/;\s*never\b/i)[0] as string

function registered() {
  const providers = createProviders(readProviderSettings({ HANDYHUB_ENV: 'ci' }))
  return [
    ...buildAutomations({ providers, staffAppUrl: 'http://staff.example.test' }),
    codeDeliveryAutomation({ providers, codeKey: readCodeKey({ HANDYHUB_ENV: 'ci' }) }),
  ]
}

describe('[HH-AUTO-02][HH-AUTO-01] every registered automation has one reviewed effect; none decides for people', () => {
  it('each registered automation is classified, and nothing classified is missing', () => {
    expect(
      registered()
        .map((a) => a.name)
        .sort(),
    ).toEqual(Object.keys(EFFECTS).sort())
    // Every kind is one some automation has; no other kind exists.
    expect(new Set(Object.values(EFFECTS))).toEqual(new Set(Object.keys(KINDS)))
  })

  it('no declared effect approves, waives, reprices, refunds, charges, confirms capacity or releases a hold', () => {
    for (const a of registered()) {
      expect(does(a.effect), a.name).not.toMatch(DECIDES)
    }
  })

  it('only message automations send, and each of them retries a failed attempt', () => {
    for (const a of registered()) {
      if (/\bsends?\b/.test(does(a.effect))) expect(EFFECTS[a.name], a.name).toBe('message')
      if (EFFECTS[a.name] === 'message') expect(a.retry.maxAttempts, a.name).toBeGreaterThan(1)
    }
  })
})
