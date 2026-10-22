// The customer's words for the server's codes (TSK-0038; HH-PORT-02, HH-PORT-03, RULE-LANGUAGES). English only, from
// the customer catalog. Wording sources: the HH-PORT-03 / guide 23.1 labels and steps, "Waiting on you" and Reply
// (OWN-DEC-98), the approval steps (OWN-DEC-105), the safety status (T48) and "Closed—no response" (OWN-DEC-101).
// Everything else here is PROPOSED wording (listed in the TSK-0038 report) until the owner approves it.
import { customerTranslator, type CustomerKey } from '@handyhub/i18n'
import type { NextAction, Situation, Step, TimelineKind, Waiting } from './api'

export const t = (key: CustomerKey, values?: Record<string, string | number>) => customerTranslator().t(key, values)

export const SITUATION_LABEL: Record<Situation, CustomerKey> = {
  received: 'portal.situation.received',
  more_information: 'portal.situation.more_information',
  site_visit: 'portal.situation.site_visit',
  estimate_ready: 'portal.situation.estimate_ready',
  approved: 'portal.situation.approved',
  scheduled: 'portal.situation.scheduled',
  on_the_way: 'portal.situation.on_the_way',
  work_in_progress: 'portal.situation.work_in_progress',
  safety_hold: 'portal.situation.safety_hold',
  update_pending: 'portal.situation.update_pending',
  completion_review: 'portal.situation.completion_review',
  follow_up_work: 'portal.situation.follow_up_work',
  work_complete: 'portal.situation.work_complete',
  not_a_fit: 'portal.situation.not_a_fit',
  canceled: 'portal.situation.canceled',
  closed_no_response: 'portal.situation.closed_no_response',
}

/**
 * The next step under the label. None where the record itself carries the words (the decision and reason), where
 * nothing more may be said (a safety hold shows only its neutral status, T48), or where the customer explanation
 * comes from a reviewed record a later task builds (update pending, completion review, follow-up work).
 */
export const STEP_TEXT: Record<Step, CustomerKey | null> = {
  review_details: 'portal.step.review_details',
  answer_questions: 'portal.step.answer_questions',
  visit_windows_pending: 'portal.step.visit_windows_pending',
  choose_visit_window: 'portal.step.choose_visit_window',
  review_estimate: 'portal.step.review_estimate',
  deposit_due: 'portal.step.deposit_due',
  choose_work_appointment: 'portal.step.choose_work_appointment',
  view_appointment: 'portal.step.view_appointment',
  arrival_update: 'portal.step.arrival_update',
  view_updates: 'portal.step.view_updates',
  safety_review: null,
  update_pending: null,
  completion_review: null,
  follow_up_work: null,
  review_care_notes_and_invoice: 'portal.step.review_care_notes_and_invoice',
  decision: null,
  closed: null,
}

export const WAITING_LABEL: Record<Waiting, CustomerKey> = {
  customer: 'portal.waiting.customer',
  handyhub: 'portal.waiting.handyhub',
  nobody: 'portal.waiting.nobody',
}

export const ACTION_LABEL: Record<Exclude<NextAction, 'none'>, CustomerKey> = {
  reply: 'portal.action.reply',
  choose_visit_window: 'portal.action.choose_visit_window',
  review_estimate: 'portal.action.review_estimate',
  pay_deposit: 'portal.action.pay_deposit',
  choose_work_appointment: 'portal.action.choose_work_appointment',
  review_visit: 'portal.action.review_visit',
  review_change: 'portal.action.review_change',
  pay_invoice: 'portal.action.pay_invoice',
  contact_support: 'portal.action.contact_support',
}

export const TIMELINE_LABEL: Record<TimelineKind, CustomerKey> = {
  received: 'portal.timeline.received',
  more_information: 'portal.timeline.more_information',
  site_visit: 'portal.timeline.site_visit',
  not_a_fit: 'portal.timeline.not_a_fit',
  closed_no_response: 'portal.timeline.closed_no_response',
}

/**
 * A moment in English, named with its zone so a time is never ambiguous: in `zone` when given (TSK-0123: a scheduling
 * option's hold is shown in the property's zone, OWN-DEC-159 item 4), otherwise in the browser's time zone.
 */
export function when(iso: string, zone?: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('en-US', {
    ...(zone ? { timeZone: zone } : {}),
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(d)
}

/** A time of today in English, for the last-refreshed line. */
export function clock(d: Date): string {
  return new Intl.DateTimeFormat('en-US', { timeStyle: 'short' }).format(d)
}
