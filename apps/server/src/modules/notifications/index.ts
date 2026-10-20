// Notifications module (TSK-0047): message types, the automatic-message policy, versioned templates and deliveries.
export { nextContactTime, zonedTimeToUtc } from './contact-hours.js'
export {
  createDraft,
  deliveryIdempotencyKey,
  DraftError,
  NOTIFICATION_RETRY,
  notificationAutomation,
  releaseAutomation,
  releaseDraft,
  releaseTime,
  RetryableDeliveryError,
  type Destination,
  type NotificationAutomationOptions,
  type NotificationProviders,
  type Recipient,
  type RecordCheck,
  type RecordCheckResult,
  type RecordChecks,
  type Resolved,
} from './deliveries.js'
export {
  CONSENT_PURPOSES,
  ConsentError,
  consentDestination,
  currentConsent,
  MARKETING_MESSAGES,
  recordConsent,
  sendPermission,
  type ConsentInput,
  type ConsentPurpose,
  type ConsentSource,
  type ConsentState,
  type PermissionResult,
} from './consent.js'
export {
  deliveryStatusAutomation,
  keywordOf,
  nextState,
  PROPOSED_HELP_REPLY,
  SMS_KEYWORDS,
  type SmsKeyword,
} from './status.js'
export { MESSAGE_TYPES, messageType, type Audience, type Channel, type MessageType } from './message-types.js'
export {
  assertAutomatic,
  automaticPolicy,
  NotAutomaticError,
  NotificationPolicyError,
  type AutomaticPolicy,
} from './policy.js'
export {
  contentLocale,
  currentTemplate,
  messageTypeProblems,
  releaseTemplateVersion,
  renderTemplate,
  TemplateError,
  templateProblems,
  type ContentLocale,
  type ReleasedTemplate,
  type TemplateDraft,
} from './templates.js'
