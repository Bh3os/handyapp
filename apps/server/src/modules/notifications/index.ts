// Notifications module (TSK-0047): message types, the automatic-message policy, versioned templates and deliveries.
// TSK-0032: failed deliveries open a staff retry item; NOTIFICATIONS_MODULE holds the staff Retry route (retry.ts).
export { nextContactTime, zonedTimeToUtc } from './contact-hours.js'
export {
  createDraft,
  deliveryIdempotencyKey,
  DraftError,
  NOT_CONFIGURED_ERRORS,
  NOTIFICATION_RETRY,
  notificationAutomation,
  releaseAutomation,
  releaseDraft,
  releaseTime,
  RetryableDeliveryError,
  type Destination,
  type FailureItem,
  type NotificationAutomationOptions,
  type NotificationProviders,
  type Recipient,
  type RecordCheck,
  type RecordCheckResult,
  type RecordChecks,
  type Resolved,
  type SendResult,
} from './deliveries.js'
export { NOTIFICATIONS_MODULE } from './retry.js'
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
