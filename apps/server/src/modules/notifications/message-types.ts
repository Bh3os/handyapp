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

export type Audience = 'customer' | 'staff'
export type Channel = 'email' | 'sms'

/** text: short safe text; link: a project or app link; credential: the code or access link that is the message. */
export type VariableKind = 'text' | 'link' | 'credential' | 'datetime'

export type MessageType = {
  key: string
  audience: Audience
  channels: readonly Channel[]
  /** Committed business events that trigger the automatic send; empty for staff-released drafts. */
  triggerEvents: readonly string[]
  variables: Readonly<Record<string, VariableKind>>
  /** Where the content comes from. */
  sourceIds: readonly string[]
}

const both: readonly Channel[] = ['email', 'sms']
const link = { projectLink: 'link' } as const

const TYPES: readonly MessageType[] = [
  // Customer messages that the configured list makes automatic (FACT-AUTOMATIC-MESSAGES rows 1-14).
  {
    key: 'request.receipt',
    audience: 'customer',
    channels: ['email'],
    triggerEvents: ['request.submitted'],
    variables: { reference: 'text', services: 'text', summary: 'text', nextSteps: 'text', ...link },
    sourceIds: ['OWN-DEC-95', 'HH-INT-20'],
  },
  {
    key: 'contact.verification_code',
    audience: 'customer',
    channels: both,
    triggerEvents: ['contact.verification_code_requested'],
    // codeLifetimeMinutes: the configured code lifetime as text (TSK-0016), so the template never hard-codes it.
    variables: { verificationCode: 'credential', codeLifetimeMinutes: 'text' },
    sourceIds: ['OWN-DEC-65', 'OWN-DEC-96'],
  },
  {
    key: 'project.access_link',
    audience: 'customer',
    channels: both,
    triggerEvents: ['request.submitted', 'project.access_requested'],
    variables: { accessLink: 'credential' },
    sourceIds: ['OWN-DEC-65', 'OWN-DEC-97'],
  },
  {
    key: 'question.notice',
    audience: 'customer',
    channels: both,
    triggerEvents: ['question.published'],
    variables: link,
    sourceIds: ['OWN-DEC-98'],
  },
  {
    key: 'estimate_visit.options',
    audience: 'customer',
    channels: both,
    triggerEvents: ['estimate_visit.windows_published'],
    variables: link,
    sourceIds: ['OWN-DEC-99'],
  },
  {
    key: 'estimate_visit.confirmed',
    audience: 'customer',
    channels: both,
    triggerEvents: ['estimate_visit.reserved'],
    variables: { visitWindow: 'datetime', ...link },
    sourceIds: ['OWN-DEC-99'],
  },
  {
    key: 'decision.not_a_fit',
    audience: 'customer',
    channels: both,
    triggerEvents: ['decision.not_a_fit_published'],
    variables: link,
    sourceIds: ['OWN-DEC-100'],
  },
  {
    key: 'estimate.ready',
    audience: 'customer',
    channels: both,
    triggerEvents: ['estimate.version_published'],
    variables: link,
    sourceIds: ['OWN-DEC-102'],
  },
  {
    key: 'approval.receipt',
    audience: 'customer',
    channels: ['email'],
    triggerEvents: ['estimate.approved'],
    variables: link,
    sourceIds: ['OWN-DEC-105'],
  },
  {
    key: 'appointment.confirmed',
    audience: 'customer',
    channels: both,
    triggerEvents: ['appointment.reserved'],
    variables: { visitWindow: 'datetime', ...link },
    sourceIds: ['OWN-DEC-105'],
  },
  {
    key: 'appointment.changed',
    audience: 'customer',
    channels: both,
    triggerEvents: ['appointment.change_committed'],
    variables: { visitWindow: 'datetime', ...link },
    sourceIds: ['OWN-DEC-119'],
  },
  {
    key: 'visit.on_the_way',
    audience: 'customer',
    channels: both,
    triggerEvents: ['visit.on_my_way'],
    variables: { workerFirstNames: 'text', arrivalWindow: 'datetime', ...link },
    sourceIds: ['OWN-DEC-107'],
  },
  {
    key: 'invoice.ready',
    audience: 'customer',
    channels: both,
    triggerEvents: ['invoice.issued'],
    variables: link,
    sourceIds: ['OWN-DEC-110'],
  },
  {
    key: 'payment.receipt',
    audience: 'customer',
    channels: ['email'],
    triggerEvents: ['invoice.paid', 'payment.receipt_sent'],
    variables: link,
    sourceIds: ['OWN-DEC-111', 'OWN-DEC-110'],
  },
  // TSK-0036 (HH-ID-11): the notice to the old value after a customer account's sign-in email changed. It is NOT on
  // the owner's automatic list and has no approved wording (OQ-ACCOUNT-CONTACT-NOTICE): until both exist, changing a
  // sign-in email answers NOT CONFIGURED. It carries no link, code or detail of the account.
  {
    key: 'account.contact_changed',
    audience: 'customer',
    channels: both,
    triggerEvents: ['customer_account.contact_changed'],
    variables: {},
    sourceIds: ['HH-ID-11', 'OQ-ACCOUNT-CONTACT-NOTICE'],
  },
  // Staff accounts (automatic).
  {
    key: 'staff.invitation',
    audience: 'staff',
    channels: ['email'],
    triggerEvents: ['staff.invited'],
    variables: { inviteLink: 'credential' },
    sourceIds: ['OWN-DEC-114'],
  },
  {
    key: 'staff.password_reset',
    audience: 'staff',
    channels: ['email'],
    triggerEvents: ['staff.password_reset_requested'],
    variables: { resetLink: 'credential' },
    sourceIds: ['OWN-DEC-114'],
  },
  // Staff notifications (automatic, internal).
  {
    key: 'staff_notice.customer_reply',
    audience: 'staff',
    channels: ['email'],
    triggerEvents: ['question.customer_replied'],
    variables: { appLink: 'link' },
    sourceIds: ['OWN-DEC-98'],
  },
  {
    key: 'staff_notice.estimate_changes_requested',
    audience: 'staff',
    channels: ['email'],
    triggerEvents: ['estimate.changes_requested'],
    variables: { appLink: 'link' },
    sourceIds: ['OWN-DEC-103'],
  },
  {
    key: 'staff_notice.estimate_declined',
    audience: 'staff',
    channels: ['email'],
    triggerEvents: ['estimate.declined'],
    variables: { appLink: 'link' },
    sourceIds: ['OWN-DEC-103'],
  },
  {
    key: 'staff_notice.case_opened',
    audience: 'staff',
    channels: ['email'],
    triggerEvents: ['case.opened'],
    variables: { appLink: 'link' },
    sourceIds: ['OWN-DEC-124'],
  },
  {
    key: 'staff_notice.urgent_field_alert',
    audience: 'staff',
    channels: ['sms'],
    triggerEvents: ['field.urgent_alert_raised'],
    variables: { appLink: 'link' },
    sourceIds: ['FACT-AUTOMATIC-MESSAGES'],
  },
  {
    key: 'staff_notice.schedule_change',
    audience: 'staff',
    channels: ['email'],
    triggerEvents: ['appointment.change_committed'],
    variables: { appLink: 'link' },
    sourceIds: ['OWN-DEC-119'],
  },
  // Staff-released customer messages (drafts). A staff reply's Send, or a release, is the release action.
  {
    key: 'staff.reply',
    audience: 'customer',
    channels: both,
    triggerEvents: [],
    variables: { replyText: 'text', ...link },
    sourceIds: ['OWN-DEC-120'],
  },
  ...(
    [
      ['reminder.unanswered_estimate', 'OWN-DEC-132'],
      ['reminder.unanswered_question', 'OWN-DEC-101'],
      ['reminder.appointment', 'OWN-DEC-107'],
      ['reminder.satisfaction_check', 'OWN-DEC-78'],
      ['reminder.unpaid_invoice', 'OWN-DEC-112'],
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
  })),
]

export const MESSAGE_TYPES: ReadonlyMap<string, MessageType> = new Map(TYPES.map((t) => [t.key, t]))

export function messageType(key: string): MessageType {
  const t = MESSAGE_TYPES.get(key)
  if (!t) throw new Error(`Unknown message type ${key}`)
  return t
}
