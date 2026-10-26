// Notifications module (TSK-0047; TSK-0119: the variable registry, the branded layout, the status model and views;
// TSK-0120: the values automatic messages supply, values.ts): message types, the automatic-message policy, versioned
// templates and deliveries.
// TSK-0032: failed deliveries open a staff retry item; NOTIFICATIONS_MODULE holds the staff Retry route (retry.ts).
// TSK-0122: when each channel may deliver (delivery-hours.ts); TSK-0121: scheduled automatic reminders (deliveries.ts).
export { nextContactTime, zonedTimeToUtc } from './contact-hours.js'
export { recipientTextHours, recipientTimeZone } from './recipient-zone.js'
export {
  deliveryRuleConfigured,
  deliveryTime,
  heldToTextHours,
  insideTextWindow,
  liveTextsEnabled,
  nextTextTime,
  textWindowFor,
  WAITING_TEXT_HOURS,
  type DeliveryTime,
  type TextWindow,
  type TextWindowBasis,
} from './delivery-hours.js'
export {
  createDraft,
  deliveryIdempotencyKey,
  deliveryAuditAction,
  DraftError,
  isOutcomeUnknown,
  NOT_CONFIGURED_ERRORS,
  OUTCOME_UNKNOWN_PREFIX,
  NOTIFICATION_RETRY,
  notificationAutomation,
  releaseAutomation,
  releaseDraft,
  releaseTime,
  cancelWaitingDeliveries,
  scheduleAutomaticDelivery,
  STAFF_REPLY_MESSAGE_KEY,
  type ReleaseFailureItem,
  type ReleaseValues,
  RetryableDeliveryError,
  syncDeliveryFailureOwner,
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
  OPTIONAL_FOLLOW_UPS,
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
  KEYWORD_REPLIES,
  SMS_KEYWORDS,
  type SmsKeyword,
} from './status.js'
export {
  MESSAGE_TYPES,
  messageCategory,
  messageType,
  suppliedVariables,
  type Audience,
  type Channel,
  type MessageCategory,
  type MessageType,
} from './message-types.js'
export {
  footerLines,
  LAYOUT_VERSION,
  MESSAGE_COLOURS,
  parseBody,
  placeholdersOf,
  renderLayout,
  TemplateValueError,
  TemplateValuesError,
  type LayoutContext,
  type Rendered,
} from './layout.js'
export { isIntercepted, LIFECYCLE_GROUPS, lifecycleOf, MESSAGE_LIFECYCLE, type MessageLifecycle } from './lifecycle.js'
export { maskDestination, MESSAGE_VIEW_ROUTES, PREVIEW_CSP } from './message-routes.js'
export {
  firstNameOf,
  isSensitiveVariable,
  linkHostsOf,
  linkProblem,
  SAMPLE_LINK_HOSTS,
  SAMPLE_VALUES,
  TEMPLATE_VARIABLES,
  valueProblem,
  variableSpec,
  type VariableKind,
  type VariableName,
  type VariableSpec,
} from './variables.js'
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
  templateReadiness,
  unwiredVariables,
  type ContentLocale,
  type RenderOptions,
  type ReleasedTemplate,
  type TemplateDraft,
} from './templates.js'
export {
  businessZone,
  contactDestinations,
  dateText,
  estimatePageLink,
  instantText,
  jobNumberOf,
  portalLink,
  present,
  projectDisplayZone,
  staffLink,
  supportContactText,
  timeText,
  valuesFor,
  visitNumberOf,
  visitWindowValues,
  zoneLabel,
} from './values.js'
