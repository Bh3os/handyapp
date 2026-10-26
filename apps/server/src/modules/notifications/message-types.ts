// Message types (TSK-0047; FACT-AUTOMATIC-MESSAGES, HH-COM-03, HH-COM-04, HH-COM-06). The catalogue of every message
// the software can send: its audience, channels, the committed business events that trigger it, and the variables a
// template may use. Whether a type sends automatically is NOT decided here: that is the configured list
// `messages.automatic` (policy.ts). A type that is not on the list can only be a draft that staff release.
//
// - Customer messages carry no amounts and no private details; they link into verified project access. The only
//   credentials a customer message may carry are its own purpose: the one-time code and the secure access link.
// - Access secrets (gate, lockbox and alarm codes, access instructions), passwords and card data are never a template
//   variable of any type (HH-COM-04, HH-CRM-03).
// - Trigger event names are PROPOSED contracts for the tasks that emit those events.
// - TSK-0119 (HH-COM-13, OWN-DEC-151, OWN-DEC-152, OWN-DEC-158): every variable comes from the one registry
//   (variables.ts). `templateId` is the owner's template ID (OWN-DEC-151 section 4, and the seven messages of
//   OWN-DEC-209, whose wording is listed in OQ-MESSAGES-OUTSIDE-THE-21); `supplied` lists the variables the message's resolver
//   supplies today. A released template that needs a variable outside `supplied` is not wired yet: its delivery is
//   recorded as failed (template_values_not_wired) and staff see it, until the task that wires the message adds the
//   values (TSK-0120 automatic delivery, TSK-0121 reminders, the tasks that build the events). `ownerApproval`: the
//   Owner reviews and releases the message (work paused, OWN-DEC-152 section 3.2).
import { TEMPLATE_VARIABLES, type VariableKind, type VariableName } from './variables.js'

export type { VariableKind } from './variables.js'
export type Audience = 'customer' | 'staff'
export type Channel = 'email' | 'sms'

export type MessageType = {
  key: string
  audience: Audience
  channels: readonly Channel[]
  /** Committed business events that trigger the automatic send; empty for staff-released drafts. */
  triggerEvents: readonly string[]
  variables: Readonly<Record<string, VariableKind>>
  /** Where the content comes from. */
  sourceIds: readonly string[]
  /** The owner's template ID (OWN-DEC-151 section 4 and the 2026-10-22 answer), when the owner worded it. */
  templateId?: string
  /** The variables the message's resolver supplies today; default every declared variable. */
  supplied?: readonly string[]
  /** The Owner reviews and releases it (OWN-DEC-152 section 3.2): a draft of it waits for that approval. */
  ownerApproval?: true
  /** The classification of OWN-DEC-152 section 3.6; default transactional (customer) or internal (staff). */
  category?: MessageCategory
  /**
   * TSK-0122 (FACT-HOURS "not held to these hours"): a text of this type is never held to the recipient's permitted
   * hours: the secure access link expires (OWN-DEC-65) and the On my way notice follows the worker's tap ("Any time",
   * OWN-DEC-107). Codes and account security notices are never held by their category.
   */
  anyHour?: true
}

/**
 * Message classification (OWN-DEC-152 section 3.6): transactional, account security and internal staff notices are
 * kept apart from marketing. `authentication` (the one-time code, owner confirmation 2026-10-22) is time-sensitive:
 * delivery (TSK-0120, TSK-0122) never holds it in reminder queues or quiet hours.
 */
export type MessageCategory = 'authentication' | 'account_security' | 'transactional' | 'internal' | 'marketing'

export function messageCategory(type: MessageType): MessageCategory {
  return type.category ?? (type.audience === 'staff' ? 'internal' : 'transactional')
}

const both: readonly Channel[] = ['email', 'sms']
/** The declared variables, with their kinds from the registry. */
const vars = (...names: VariableName[]): Readonly<Record<string, VariableKind>> =>
  Object.fromEntries(names.map((n) => [n, TEMPLATE_VARIABLES[n].kind]))
const link = { projectLink: 'link' } as const

const TYPES: readonly MessageType[] = [
  // Customer messages that the configured list makes automatic (FACT-AUTOMATIC-MESSAGES).
  {
    key: 'request.receipt',
    templateId: 'request_received',
    audience: 'customer',
    channels: ['email'],
    triggerEvents: ['request.submitted'],
    variables: vars('customerName', 'reference', 'services', 'summary', 'nextSteps', 'projectLink'),
    // TSK-0120: the owner's wording uses the first name and the reference; the receipt carries no link.
    supplied: ['customerName', 'reference', 'services', 'summary', 'nextSteps'],
    sourceIds: ['OWN-DEC-95', 'HH-INT-20', 'OWN-DEC-151'],
  },
  {
    key: 'contact.verification_code',
    templateId: 'verification_code',
    audience: 'customer',
    channels: both,
    triggerEvents: ['contact.verification_code_requested'],
    // codeLifetimeMinutes: the configured code lifetime as text (TSK-0016), so the template never hard-codes it.
    variables: vars('verificationCode', 'codeLifetimeMinutes'),
    category: 'authentication',
    sourceIds: ['OWN-DEC-65', 'OWN-DEC-96', 'OWN-DEC-150', 'OWN-DEC-209'],
  },
  {
    key: 'project.access_link',
    templateId: 'secure_access_link',
    audience: 'customer',
    channels: both,
    triggerEvents: ['request.submitted', 'project.access_requested'],
    variables: vars('customerName', 'secureAccessLink', 'linkExpiration', 'accessLink'),
    anyHour: true,
    sourceIds: ['OWN-DEC-65', 'OWN-DEC-97', 'OWN-DEC-151'],
  },
  {
    key: 'question.notice',
    templateId: 'question_notice',
    audience: 'customer',
    channels: both,
    triggerEvents: ['question.published'],
    variables: vars('customerName', 'reference', 'projectLink'),
    sourceIds: ['OWN-DEC-98', 'OWN-DEC-209'],
  },
  {
    key: 'estimate_visit.options',
    templateId: 'estimate_visit_options',
    audience: 'customer',
    channels: both,
    triggerEvents: ['estimate_visit.windows_published'],
    variables: vars('customerName', 'reference', 'appointmentLink', 'holdExpiration', 'projectLink'),
    sourceIds: ['OWN-DEC-99', 'OWN-DEC-151'],
  },
  {
    key: 'estimate_visit.confirmed',
    templateId: 'estimate_visit_confirmed',
    audience: 'customer',
    channels: both,
    triggerEvents: ['estimate_visit.reserved'],
    variables: vars(
      'customerName',
      'visitDate',
      'startTime',
      'endTime',
      'timeZone',
      'visitNumber',
      'visitWindow',
      'projectLink',
    ),
    sourceIds: ['OWN-DEC-99', 'OWN-DEC-151'],
  },
  {
    key: 'decision.not_a_fit',
    templateId: 'not_a_fit',
    audience: 'customer',
    channels: both,
    triggerEvents: ['decision.not_a_fit_published'],
    variables: vars('customerName', 'reference', 'projectLink'),
    sourceIds: ['OWN-DEC-100', 'OWN-DEC-209'],
  },
  {
    key: 'estimate.ready',
    templateId: 'estimate_ready',
    audience: 'customer',
    channels: both,
    triggerEvents: ['estimate.version_published'],
    variables: vars('customerName', 'estimateNumber', 'projectLink'),
    sourceIds: ['OWN-DEC-102', 'OWN-DEC-209'],
  },
  {
    key: 'estimate.question_answered',
    templateId: 'estimate_follow_up',
    audience: 'customer',
    channels: both,
    triggerEvents: ['estimate_question.answer_released'],
    variables: vars('customerName', 'reference', 'estimateLink'),
    supplied: [],
    sourceIds: ['OWN-DEC-151', 'OWN-DEC-152'],
  },
  {
    key: 'approval.receipt',
    templateId: 'estimate_approval_confirmation',
    audience: 'customer',
    // TSK-0058: by email and, when the customer gave a number, by text (OWN-DEC-105: "yes text and mail").
    channels: both,
    triggerEvents: ['estimate.approved'],
    variables: vars('customerName', 'estimateNumber', 'projectLink'),
    sourceIds: ['OWN-DEC-105', 'OWN-DEC-151', 'OWN-DEC-155'],
  },
  {
    key: 'work_visit.options',
    templateId: 'work_appointment_windows',
    audience: 'customer',
    channels: both,
    triggerEvents: ['work_visit.windows_published'],
    variables: vars('customerName', 'jobNumber', 'appointmentLink', 'holdExpiration'),
    sourceIds: ['OWN-DEC-151', 'OWN-DEC-156'],
  },
  {
    key: 'appointment.confirmed',
    templateId: 'work_appointment_confirmed',
    audience: 'customer',
    channels: both,
    triggerEvents: ['appointment.reserved'],
    variables: vars(
      'customerName',
      'jobNumber',
      'serviceName',
      'visitDate',
      'startTime',
      'endTime',
      'timeZone',
      'visitWindow',
      'projectLink',
    ),
    sourceIds: ['OWN-DEC-105', 'OWN-DEC-151'],
  },
  {
    key: 'appointment.changed',
    templateId: 'appointment_changed',
    audience: 'customer',
    channels: both,
    triggerEvents: ['appointment.change_committed'],
    variables: vars(
      'customerName',
      'visitNumber',
      'visitDate',
      'startTime',
      'endTime',
      'timeZone',
      'visitWindow',
      'projectLink',
    ),
    sourceIds: ['OWN-DEC-119', 'OWN-DEC-209'],
  },
  {
    key: 'visit.cancelled',
    templateId: 'visit_cancelled',
    audience: 'customer',
    channels: both,
    // A committed cancellation is a change of kind 'canceled' (TSK-0066); never a reschedule (OWN-DEC-152 R2-Q2).
    triggerEvents: ['appointment.change_committed'],
    variables: vars('customerName', 'visitNumber'),
    sourceIds: ['OWN-DEC-151', 'OWN-DEC-152'],
  },
  {
    key: 'visit.on_the_way',
    templateId: 'on_the_way',
    audience: 'customer',
    channels: both,
    triggerEvents: ['visit.on_my_way'],
    anyHour: true,
    variables: vars(
      'customerName',
      'visitNumber',
      'workerFirstNames',
      'startTime',
      'endTime',
      'timeZone',
      'arrivalWindow',
      'projectLink',
    ),
    // TSK-0070 supplied the workers' first names and the window; TSK-0120 the rest of the owner wording's values.
    sourceIds: ['OWN-DEC-107', 'OWN-DEC-209'],
  },
  {
    key: 'invoice.deposit',
    templateId: 'deposit_invoice',
    audience: 'customer',
    channels: both,
    triggerEvents: ['invoice.deposit_issued'],
    variables: vars('customerName', 'invoiceNumber', 'jobNumber', 'invoiceLink'),
    // TSK-0085: the deposit invoice's issue supplies every value (the link: the project's Documents tab).
    supplied: ['customerName', 'invoiceNumber', 'jobNumber', 'invoiceLink'],
    sourceIds: ['OWN-DEC-151', 'OWN-DEC-152'],
  },
  {
    key: 'change_order.proposed',
    templateId: 'proposed_change',
    audience: 'customer',
    channels: both,
    triggerEvents: ['change_order.published'],
    variables: vars('customerName', 'jobNumber', 'changeOrderLink'),
    // TSK-0082: issuing a change order supplies every value (the link: the project's Documents tab).
    supplied: ['customerName', 'jobNumber', 'changeOrderLink'],
    sourceIds: ['OWN-DEC-151', 'OWN-DEC-152'],
  },
  {
    key: 'invoice.ready',
    templateId: 'invoice_ready',
    audience: 'customer',
    channels: both,
    triggerEvents: ['invoice.issued'],
    variables: vars('customerName', 'invoiceNumber', 'invoiceLink', 'projectLink'),
    // TSK-0085: the final invoice's issue supplies every value (the invoice link: the project's Documents tab).
    supplied: ['customerName', 'invoiceNumber', 'invoiceLink', 'projectLink'],
    sourceIds: ['OWN-DEC-110', 'OWN-DEC-209'],
  },
  {
    key: 'job.complete',
    templateId: 'job_complete',
    audience: 'customer',
    channels: both,
    // Only the authorized final completion after the walkthrough and punch-list checks, never a worker's Finished.
    triggerEvents: ['job.completion_authorized'],
    variables: vars('customerName', 'jobNumber'),
    supplied: [],
    sourceIds: ['OWN-DEC-151', 'OWN-DEC-152'],
  },
  {
    key: 'payment.receipt',
    templateId: 'payment_receipt',
    audience: 'customer',
    channels: ['email'],
    // TSK-0087 (OWN-DEC-152): each confirmed recorded payment's receipt, once (finance/receipts.ts).
    triggerEvents: ['payment.receipt_issued'],
    variables: vars('customerName', 'invoiceNumber', 'receiptNumber', 'paymentNumber', 'receiptLink', 'projectLink'),
    sourceIds: ['OWN-DEC-111', 'OWN-DEC-110', 'OWN-DEC-151', 'OWN-DEC-152'],
  },
  // TSK-0036 (HH-ID-11): the notice after a customer account's sign-in email changed, to the old and the new verified
  // address. Worded by the owner (account_email_changed, OWN-DEC-151) and automatic (OWN-DEC-152); TSK-0120 wires its
  // values, so changing a sign-in email is available. It carries no link or code.
  {
    key: 'account.contact_changed',
    templateId: 'account_email_changed',
    audience: 'customer',
    channels: both,
    triggerEvents: ['customer_account.contact_changed'],
    variables: vars('customerName', 'changeDate', 'changeTime', 'timeZone', 'supportContact'),
    category: 'account_security',
    sourceIds: ['HH-ID-11', 'OQ-ACCOUNT-CONTACT-NOTICE', 'OWN-DEC-151'],
  },
  // Staff accounts (automatic).
  {
    key: 'staff.invitation',
    audience: 'staff',
    channels: ['email'],
    triggerEvents: ['staff.invited'],
    variables: vars('inviteLink'),
    category: 'account_security',
    sourceIds: ['OWN-DEC-114'],
  },
  {
    key: 'staff.password_reset',
    audience: 'staff',
    channels: ['email'],
    triggerEvents: ['staff.password_reset_requested'],
    variables: vars('resetLink'),
    category: 'account_security',
    sourceIds: ['OWN-DEC-114'],
  },
  // Staff notifications (automatic, internal).
  {
    key: 'staff_notice.customer_reply',
    templateId: 'staff_customer_replied',
    audience: 'staff',
    channels: ['email'],
    // TSK-0120: a question reply, or the first customer message of a conversation since staff last handled it.
    triggerEvents: ['question.customer_replied', 'conversation.customer_replied'],
    variables: vars(
      'staffName',
      'customerName',
      'reference',
      'receivedDateTime',
      'projectStatus',
      'staffProjectLink',
      'appLink',
    ),
    sourceIds: ['OWN-DEC-98', 'OWN-DEC-151'],
  },
  {
    key: 'staff_notice.estimate_changes_requested',
    audience: 'staff',
    channels: ['email'],
    triggerEvents: ['estimate.changes_requested'],
    variables: vars('appLink'),
    sourceIds: ['OWN-DEC-103'],
  },
  {
    key: 'staff_notice.estimate_declined',
    audience: 'staff',
    channels: ['email'],
    triggerEvents: ['estimate.declined'],
    variables: vars('appLink'),
    sourceIds: ['OWN-DEC-103'],
  },
  {
    key: 'staff_notice.case_opened',
    audience: 'staff',
    channels: ['email'],
    triggerEvents: ['case.opened'],
    variables: vars('appLink'),
    sourceIds: ['OWN-DEC-124'],
  },
  {
    key: 'staff_notice.urgent_field_alert',
    audience: 'staff',
    channels: ['sms'],
    triggerEvents: ['field.urgent_alert_raised'],
    variables: vars('appLink'),
    sourceIds: ['FACT-AUTOMATIC-MESSAGES'],
  },
  {
    key: 'staff_notice.schedule_change',
    audience: 'staff',
    channels: ['email'],
    triggerEvents: ['appointment.change_committed'],
    variables: vars('appLink'),
    sourceIds: ['OWN-DEC-119'],
  },
  // Staff-released customer messages (drafts). A staff reply's Send, or a release, is the release action.
  {
    key: 'staff.reply',
    templateId: 'staff_reply_wrapper',
    audience: 'customer',
    channels: both,
    triggerEvents: [],
    variables: vars('customerName', 'reference', 'staffDisplayName', 'staffMessage', 'replyText', 'projectLink'),
    sourceIds: ['OWN-DEC-120', 'OWN-DEC-151'],
  },
  // The Owner reviews and releases the work-paused notice (OWN-DEC-152 section 3.2). TSK-0077: a Stop Work / Report
  // Hazard drafts it after the report commits, with the customer's first name and the job's reference stored on the
  // draft; it is never automatic and never sent until the Owner releases it.
  {
    key: 'job.paused',
    templateId: 'work_paused',
    audience: 'customer',
    channels: both,
    triggerEvents: [],
    variables: vars('customerName', 'jobNumber'),
    supplied: ['customerName', 'jobNumber'],
    ownerApproval: true,
    sourceIds: ['OWN-DEC-151', 'OWN-DEC-152'],
  },
  // TSK-0121 (OWN-DEC-153): the three routine reminders send automatically, in the owner's wording (OWN-DEC-151). Each is
  // scheduled (one delivery per destination, due at its cadence) after the committed events listed here, and sent by
  // the notify.release job at its time, after the send-time recheck of its record:
  // - the unanswered-estimate reminder from the successful delivery of the version's estimate-ready notice;
  // - the unanswered-question reminder from the successful delivery of the question notice;
  // - the appointment reminder from a confirmed visit or a committed reschedule.
  {
    key: 'reminder.unanswered_estimate',
    templateId: 'estimate_reminder',
    audience: 'customer',
    channels: both,
    triggerEvents: ['message.delivery_succeeded'],
    variables: vars('customerName', 'estimateNumber', 'estimateLink', 'projectLink'),
    sourceIds: ['OWN-DEC-153', 'FACT-REMINDER-CADENCES', 'OWN-DEC-151'],
  },
  {
    key: 'reminder.unanswered_question',
    templateId: 'question_reminder',
    audience: 'customer',
    channels: both,
    triggerEvents: ['message.delivery_succeeded'],
    variables: vars('customerName', 'reference', 'projectLink'),
    sourceIds: ['OWN-DEC-153', 'FACT-REMINDER-CADENCES', 'OWN-DEC-151'],
  },
  // The service-quality follow-up (customer_follow_up, OWN-DEC-157): staff-released. TSK-0092 prepares it 48 hours after
  // the Owner's review passed and reads its values when it sends (closeout/follow-ups.ts): the first name, the job
  // number and the secure project link to report a concern (version 2 of the wording, migration 0101).
  {
    key: 'reminder.satisfaction_check',
    templateId: 'customer_follow_up',
    audience: 'customer',
    channels: both,
    triggerEvents: [],
    variables: vars('customerName', 'jobNumber', 'projectLink'),
    sourceIds: ['OWN-DEC-78', 'FACT-REMINDER-CADENCES', 'OWN-DEC-157'],
  },
  // TSK-0091 (OWN-DEC-210): the unpaid-invoice reminder sends automatically, 3 and 7 calendar days after the invoice's
  // due date, by email only (SMS reminders stay off until A2P 10DLC and consent, OWN-DEC-190). It is scheduled after
  // the final invoice is issued (or its due date is revised) and sent by the notify.release job at its time, after the
  // send-time recheck of the invoice. No amount: the first name, the invoice number and the portal link (OWN-DEC-158).
  {
    key: 'reminder.unpaid_invoice',
    templateId: 'unpaid_invoice_reminder',
    audience: 'customer',
    channels: ['email'],
    triggerEvents: ['invoice.issued', 'invoice.due_date_revised'],
    variables: vars('customerName', 'invoiceNumber', 'invoiceLink'),
    sourceIds: ['OWN-DEC-210', 'FACT-REMINDER-CADENCES', 'OWN-DEC-151', 'OWN-DEC-158'],
  },
  // TSK-0091 (OWN-DEC-210 "any further collection follow-up must be reviewed and explicitly released by authorized
  // staff"): the follow-up the Owner or Office releases after the second reminder, or after a payment suspended the
  // reminders. Email only; its values are read from the invoice when it sends.
  {
    key: 'reminder.unpaid_invoice_follow_up',
    templateId: 'unpaid_invoice_follow_up',
    audience: 'customer',
    channels: ['email'],
    triggerEvents: [],
    variables: vars('customerName', 'invoiceNumber', 'invoiceLink'),
    sourceIds: ['OWN-DEC-210', 'FACT-REMINDER-CADENCES', 'OWN-DEC-151', 'OWN-DEC-158'],
  },
  ...(
    [
      ['reminder.repeat_service', 'OWN-DEC-113'],
      ['review.request', 'OWN-DEC-113'],
    ] as const
  ).map(([key, source]): MessageType => ({
    key,
    audience: 'customer',
    channels: both,
    triggerEvents: [],
    variables: link,
    sourceIds: [source, 'FACT-REMINDER-CADENCES'],
    ...(key === 'review.request' ? { category: 'marketing' as const } : {}),
  })),
  // TSK-0067, TSK-0121 (HH-COM-11, OWN-DEC-107, OWN-DEC-153): the appointment reminder, automatic 24 hours before every
  // confirmed visit. TSK-0119 (OWN-DEC-158): the owner's wording (appointment_reminder) uses the date, the window and
  // its zone and the visit reference; the address is never rendered. visitWindow, serviceAddress and preparationSteps
  // were the values of the staff-released drafts of TSK-0067 (kept on those rows); the automatic reminder supplies
  // none of them.
  {
    key: 'reminder.appointment',
    templateId: 'appointment_reminder',
    audience: 'customer',
    channels: both,
    triggerEvents: ['appointment.reserved', 'estimate_visit.reserved', 'appointment.change_committed'],
    variables: vars(
      'customerName',
      'date',
      'start',
      'end',
      'zone',
      'visitNumber',
      'visitWindow',
      'serviceAddress',
      'preparationSteps',
      'projectLink',
    ),
    supplied: ['customerName', 'date', 'start', 'end', 'zone', 'visitNumber', 'projectLink'],
    sourceIds: ['OWN-DEC-107', 'OWN-DEC-153', 'FACT-REMINDER-CADENCES', 'OWN-DEC-151', 'OWN-DEC-158'],
  },
]

export const MESSAGE_TYPES: ReadonlyMap<string, MessageType> = new Map(TYPES.map((t) => [t.key, t]))

export function messageType(key: string): MessageType {
  const t = MESSAGE_TYPES.get(key)
  if (!t) throw new Error(`Unknown message type ${key}`)
  return t
}

/** The variables a message's resolver supplies today (HH-COM-13). */
export function suppliedVariables(type: MessageType): readonly string[] {
  return type.supplied ?? Object.keys(type.variables)
}
