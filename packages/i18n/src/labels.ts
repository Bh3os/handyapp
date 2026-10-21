// Label families: canonical codes that records store, and the catalog keys that label them at render time
// (HH-LANG-03). A record keeps the code; only the label changes with the staff locale. Every family is declared here
// so the catalog checker knows its keys are used and can report a code that has no label.

export const LABEL_FAMILIES = {
  /** Job operational states (ENT-Job). The state machine itself is built with the domain package. */
  jobState: [
    'pending_preparation',
    'ready',
    'in_progress',
    'paused',
    'ready_for_qa',
    'operationally_complete',
    'closed',
    'reopened',
  ],
  /** Service categories (HH-SVC-01; the four categories of OWN-DEC-33). */
  serviceCategory: ['cleaning', 'drywall', 'home_improvement', 'painting'],
  /**
   * The 26 service codes (HH-SVC-01: stable, never renamed or reused). Records store the code; the staff label comes from
   * the catalogs. packages/db/seed/services.json is generated from the SVC-* nodes and checked against this list.
   */
  service: [
    'CL-01',
    'CL-02',
    'CL-03',
    'CL-04',
    'CL-05',
    'CL-06',
    'CL-07',
    'DW-01',
    'DW-02',
    'DW-03',
    'DW-04',
    'HI-01',
    'HI-02',
    'HI-03',
    'HI-04',
    'HI-05',
    'HI-06',
    'HI-07',
    'HI-08',
    'HI-09',
    'HI-10',
    'HI-11',
    'PT-01',
    'PT-02',
    'PT-03',
    'PT-04',
  ],
  /** Request lifecycle states (ENT-Request; the request.lifecycle machine of @handyhub/domain). */
  requestState: [
    'received',
    'reviewing',
    'needs_information',
    'needs_site_visit',
    'ready_for_estimate',
    'estimated',
    'declined',
    'outside_scope',
    'not_served',
    'withdrawn',
    'closed_no_response',
  ],
  /**
   * Staff action queue item types (TSK-0041; HH-OPS-01, ENT-QueueItem). The server's queue registry
   * (apps/server/src/modules/queue/registry.ts) declares the same ids, checked by its unit test.
   */
  queueItemType: [
    'new_request',
    'review_hold',
    'safety_hold',
    'visit_change_request',
    'delivery_failed',
    'case_open',
    'estimate_to_write',
    'estimate_response',
    'estimate_reminder',
    'candidate_match',
    'inbox_needs_linking',
    'customer_replied',
    'question_replied',
    'question_reminder',
    'deposit_due',
    'deposit_waiver',
    'start_work_exception',
    'refund_request',
    'cancellation_outcome',
    'deletion_request',
    'invoice_overdue_decision',
    'cancellation_review',
    'incident_notification',
  ],
  /** Why a queue item needs action (HH-OPS-02 "reason"). */
  queueReason: [
    'new_request',
    'new_request_flagged',
    'awaiting_first_response',
    'review_hold',
    'safety_hold',
    'reschedule_requested',
    'cancellation_requested',
    'delivery_failed',
    'delivery_not_configured',
    'case_opened',
    'complaint_recorded',
    'damage_reported',
    'injury_reported',
    'dispute_reported',
    'deposit_waiver_requested',
    'deposit_due',
    'deposit_check_pending',
    'start_work_exception_requested',
    'refund_requested',
    'cancellation_outcome_requested',
    'deletion_requested',
    'overdue_owner_decision',
    'not_a_fit_with_obligations',
    'ready_for_estimate',
    'estimate_draft',
    'estimate_changes_requested',
    'estimate_declined',
    'estimate_update_requested',
    'estimate_reminder_first',
    'estimate_reminder_final',
    'possible_duplicate',
    'message_needs_linking',
    'customer_replied',
    'question_replied',
    'reopened_by_reply',
    'question_reminder_first',
    'question_reminder_final',
    'no_response_close_available',
  ],
  /** The one action button of a queue item (HH-OPS-02); it opens the record's screen. */
  queueAction: [
    'review_request',
    'review_hold',
    'review_change',
    'retry_delivery',
    'open_case',
    'decide',
    'write_estimate',
    'review_estimate',
    'release_reminder',
    'review_match',
    'link_message',
    'open_conversation',
    'review_deposit',
  ],
  /**
   * System health (TSK-0101; HH-NFR-02): the checks, their states, metrics and notes, as the server's health report
   * (apps/server/src/modules/system/health.ts) declares them, checked by its unit test.
   */
  healthCheck: [
    'database',
    'migrations',
    'jobs',
    'outbox',
    'deliveries_email',
    'deliveries_sms',
    'callbacks_bird',
    'callbacks_resend',
    'uploads',
    'intake_integrity',
    'configuration',
    'scheduling_conflicts',
    'error_tracking',
    'backups',
    'restore_drill',
  ],
  healthStatus: ['ok', 'attention', 'failed', 'not_configured', 'unknown'],
  healthMetric: [
    'pending',
    'queued',
    'running',
    'retrying',
    'overdue',
    'interrupted',
    'failed',
    'stale',
    'received',
    'processing_failed',
    'quarantined',
    'rejected',
    'missing',
    'configured',
    'not_configured',
    'proposed',
  ],
  healthNote: [
    'migrations_unreadable',
    'provider_unknown',
    'fake_provider',
    'rejected_callbacks_in_logs',
    'no_scheduling_records',
    'no_error_tracker',
    'backups_not_observable',
    'no_restore_drill_recorded',
  ],
  providerChannel: ['email', 'sms', 'storage'],
  providerMode: ['real', 'fake', 'not_configured', 'unknown'],
  /** Why the server rejected a request photo (apps/server/src/modules/photos/content.ts ContentProblem). */
  photoRejection: ['unsupported_type', 'type_mismatch', 'malformed', 'trailing_data', 'unsafe_content'],
  /** The configuration keys (TSK-0007, TSK-0101; apps/server/src/platform/config/keys.ts CONFIG_KEYS). */
  configKey: [
    'deposit.rule',
    'discount.rule',
    'discount.eligibility_verification',
    'tax.mode',
    'estimate.validity',
    'estimate.publishing_roles',
    'payment.term_default',
    'payment.methods',
    'payment.instructions',
    'payment.square_link_hosts',
    'cancellation.rules',
    'contact.hours',
    'business.timezone',
    'reminders.cadences',
    'request.reopen_period',
    'replies.contact_hours',
    'response.target',
    'session.timings',
    'uploads.limits',
    'business.name',
    'business.mailing_address',
    'business.public_contact',
    'verification.limits',
    'access.grants',
    'access.recovery',
    'portal.refresh',
    'messages.automatic',
    'sms.help_reply',
    'coverage.area',
    'request.window_hours',
    'estimate.visit_fee',
    'legal.privacy_notice',
    'legal.sms_terms',
    'legal.website_terms',
    'legal.sms_disclosure',
    'legal.estimate_terms',
    'ai.module',
  ],
  /** Staff qualification of a request (TSK-0042; HH-LEAD-02). */
  qualificationCheck: [
    'coverage',
    'service_fit',
    'essential_facts',
    'urgency',
    'site_visit_need',
    'staff_equipment',
    'risk_flags',
  ],
  qualificationOutcome: ['ok', 'attention', 'not_checked'],
  /** Not a Fit reason categories (OWN-DEC-100). */
  notAFitCategory: ['coverage', 'outside_scope', 'specialist_assessment', 'other'],
  /** The next step a request shows (TSK-0042, PROPOSED codes). */
  requestNextStep: [
    'qualify_and_choose',
    'waiting_on_customer',
    'offer_visit_windows',
    'prepare_estimate',
    'estimate_published',
    'owner_review',
    'closed',
  ],
  /** The four request actions and the Owner routing of Not a Fit (OWN-DEC-116, OWN-DEC-100). */
  requestDecision: [
    'ask_question',
    'prepare_online_estimate',
    'arrange_estimate_visit',
    'not_a_fit',
    'not_a_fit_owner_review',
    // TSK-0051 (OWN-DEC-101).
    'close_no_response',
  ],
  /** Project lifecycle states (the project.lifecycle machine, PROPOSED). */
  projectState: ['open', 'approved', 'completed', 'closed', 'cancellation_review', 'canceled'],
  /** Contact verification states, email and phone separately (OWN-DEC-96). */
  verificationState: ['unverified', 'pending', 'verified', 'expired', 'failed'],
  /** ZIP coverage outcomes (OWN-DEC-88). */
  coverageResult: ['in_coverage', 'boundary', 'out_of_coverage', 'unknown'],
  estimatePreference: ['online', 'site_visit', 'let_handyhub_decide'],
  contactChannel: ['email', 'call', 'text'],
  /** FACT-PROPERTY-TYPES (OWN-DEC-139). */
  propertyType: ['house', 'apartment_condo', 'townhouse', 'rental_short_term'],
  timeWindow: ['mornings', 'afternoons', 'evenings', 'weekends', 'any_time'],
  photoState: ['quarantined', 'ready', 'rejected'],
  /** Customer records (TSK-0044; ENT-Customer, HH-CRM-01). */
  customerStatus: ['active', 'inactive', 'merged'],
  customerProvenance: ['request_submission', 'staff_entry'],
  /** Visibility classes of notes and attachments (HH-STAFF-05; @handyhub/domain VISIBILITY_CLASSES). */
  visibilityClass: ['internal_operational', 'restricted_incident', 'restricted_financial', 'customer_shared'],
  /** What two customers share in a duplicate suggestion (HH-ID-02; @handyhub/domain MATCH_REASONS). */
  matchReason: ['email', 'phone', 'address', 'name'],
  candidateStatus: ['open', 'dismissed', 'merged'],
  /** A merge or relink (crm.record_links, TSK-0046): in effect, reversed by the Owner, or replaced by a later relink. */
  recordLinkState: ['current', 'reversed', 'replaced'],
  /** Consent records (ENT-ConsentPreference; apps/server/src/modules/notifications/consent.ts). */
  consentPurpose: ['service_communication', 'transactional_sms', 'marketing'],
  consentChannel: ['email', 'sms'],
  consentSource: ['request_form', 'portal', 'sms_keyword', 'provider_suppression', 'staff_recorded'],
  consentState: ['granted', 'withdrawn', 'none'],
  /** Fields a staff edit of a customer or contact changes (crm.record_changes). */
  recordField: ['displayName', 'fullName', 'email', 'phone', 'preferredChannel'],
  /** Property records (TSK-0045; @handyhub/domain PROPERTY_DETAILS, DETAIL_SOURCES, ACCESS_SECRET_KINDS). */
  propertyDetail: [
    'address',
    'property_type',
    'site_contact',
    'access_windows',
    'access_notes',
    'parking_loading',
    'occupants_pets',
    'restricted_areas',
    'utilities',
    'customer_preparation',
    'site_flags',
  ],
  detailSource: ['request_form', 'customer_call', 'customer_message', 'site_visit', 'office_record'],
  accessSecretKind: ['gate', 'lockbox', 'alarm', 'door', 'key_location', 'other'],
  /** What a crm.property_changes entry records. */
  propertyChange: ['changed', 'cleared', 'confirmed'],
  /** Message delivery states (HH-COM-02; platform.message_deliveries). */
  deliveryState: ['draft', 'queued', 'sent', 'delivered', 'failed', 'suppressed', 'cancelled'],
  /** The unified inbox (TSK-0049; apps/server/src/modules/inbox, comms.messages). */
  messageChannel: ['email', 'sms', 'internal', 'portal'],
  linkState: ['matched', 'needs_linking', 'linked'],
  matchRule: [
    'reply_token',
    'thread_reference',
    'verified_email',
    'verified_phone',
    'latest_conversation',
    'staff',
    'portal_session',
  ],
  needsLinkingReason: [
    'no_match',
    'shared_contact',
    'several_projects',
    'no_open_project',
    'sender_not_on_project',
    'conflicting_references',
    'returned_by_staff',
  ],
  bodyState: ['received', 'html_converted', 'not_retrieved', 'retrieval_failed', 'empty'],
  smsKeyword: ['stop', 'start', 'help'],
  inboundState: ['configured', 'fake', 'not_configured', 'unknown'],
  /** Staff replies (TSK-0050; apps/server/src/modules/inbox/replies.ts): why a channel cannot carry a reply now. */
  replyChannelReason: ['available', 'unverified', 'no_opt_in', 'opted_out'],
  /** Why a delivery was not sent (apps/server/src/modules/notifications/deliveries.ts and the providers' guard). */
  deliveryError: [
    'template_not_configured',
    'channel_not_configured',
    'template_values_missing',
    'sms_no_opt_in',
    'sms_opted_out',
    'record_changed',
    'not_on_test_allowlist',
    'invalid_destination',
  ],
  /** Entries of a customer's activity history (apps/server/src/modules/customers/record.ts). */
  customerTimeline: [
    'request_submitted',
    'request_assigned',
    'request_decision',
    'request_note',
    'customer_note',
    'customer_changed',
    'contact_changed',
    'consent_granted',
    'consent_withdrawn',
    'message',
    'candidate_detected',
    'candidate_reasons_added',
    'candidate_reopened',
    'candidate_dismissed',
    'customer_merged',
    'request_relinked',
    'link_reversed',
    'candidate_merged',
    'candidate_merge_reversed',
  ],
  timelineActor: ['staff', 'customer', 'system'],
  /** Why the server refused a request action (the problem codes of @handyhub/domain and the requests module). */
  requestRefusal: [
    'INVALID_TRANSITION',
    'QUALIFICATION_INCOMPLETE',
    'PROJECT_NOT_OPEN',
    'REASON_REQUIRED',
    'REASON_CATEGORY_REQUIRED',
    'OWNER_REVIEW_REQUIRED',
    'FACTS_MISSING',
    'ACTOR_NOT_ALLOWED',
    'REVIEW_HOLD_OPEN',
    'HAZARD_CATEGORY_REQUIRED',
    'HAZARD_NOTE_REQUIRED',
    'HAZARDS_ONLY_ON_RISK_FLAGS',
    'HAZARDS_NEED_ATTENTION',
    'REVIEWER_REQUIRED',
    'OWN_CRITICAL_HOLD',
    // TSK-0051: publishing a question, releasing its reminders and "Closed—no response".
    'NO_OPEN_QUESTION',
    'FINAL_REMINDER_NOT_SENT',
    'TOO_EARLY',
    'CONFIG_MISSING',
    'QUESTION_ANSWERED',
    'REQUEST_CLOSED',
    'NO_DRAFT',
  ],
  /** Staff questions to the customer (TSK-0051; apps/server/src/modules/questions). */
  questionKind: ['general', 'measurement'],
  questionState: ['published', 'answered'],
  questionNotice: ['pending', 'sent', 'failed'],
  reminderStage: ['first', 'final'],
  // TSK-0051 question reminders use the same reminderState family as TSK-0060's estimate reminders (below).
  /** Estimate version states (ENT-EstimateVersion; migration 0026). */
  estimateState: ['draft', 'in_review', 'published', 'accepted', 'declined', 'expired', 'withdrawn', 'superseded'],
  /** Estimate line kinds: base scope and the options a customer may select (@handyhub/money LINE_KINDS). */
  estimateLineKind: ['base', 'alternate', 'add_on'],
  /** Where a line's quantity came from (HH-EST-01). */
  quantitySource: ['measured_on_site', 'reported_by_customer'],
  /** The categories of the discount rule (FACT-PRICING-DISCOUNTS; config discount.rule). */
  discountCategory: ['military', 'senior', 'returning_customer'],
  /** Payment terms (FACT-PAYMENT-DUE; config payment.term_default). */
  paymentTerm: ['due_on_receipt'],
  /**
   * Why an estimate version is not ready to publish (TSK-0053; apps/server/src/modules/estimates/readiness.ts
   * PUBLISH_PROBLEM_CODES, checked by its unit test).
   */
  estimateProblem: [
    'NOT_CONFIGURED',
    'VERSION_NOT_EDITABLE',
    'NO_LINES',
    'QUANTITY_UNKNOWN',
    'UNIT_PRICE_MISSING',
    'DESCRIPTION_MISSING',
    'LINE_NOT_POSITIVE',
    'NOT_AN_OPTION',
    'TOTAL_NOT_POSITIVE',
    'UNSUPPORTED_CURRENCY',
    'DISCOUNT_NOT_CONFIGURED',
    'DISCOUNT_CATEGORY_UNKNOWN',
    'TOTALS_OUTDATED',
    // TSK-0054: an uploaded version's documents and agree-confirmation (readiness.ts DOCUMENT_PROBLEM_CODES).
    'DOCUMENT_MISSING',
    'DOCUMENT_PROCESSING',
    'DOCUMENT_REJECTED',
    'PDF_REQUIRED',
    'AGREEMENT_NOT_CONFIRMED',
  ],
  /** Field errors of a refused estimate draft save (apps/server/src/modules/estimates/model.ts). */
  estimateFieldError: [
    'INVALID',
    'NOT_POSITIVE',
    'INVALID_QUANTITY',
    'TOO_MANY_DECIMALS',
    'QUANTITY_UNKNOWN',
    'TOO_LONG',
    'TOO_MANY',
    'NOT_INTEGER_CENTS',
    'NEGATIVE_AMOUNT',
    'LINE_NOT_FOUND',
    'WORK_PACKAGE_NOT_FOUND',
    'DISCOUNT_NOT_CONFIGURED',
    'DISCOUNT_CATEGORY_UNKNOWN',
    'LINE_NOT_POSITIVE',
    'TOTAL_NOT_POSITIVE',
    'VERSION_NOT_EDITABLE',
    'PROJECT_NOT_OPEN',
    'AMOUNT_TOO_LARGE',
    'TOTAL_TOO_LARGE',
    // TSK-0054: refused document uploads and agree-confirmations (apps/server/src/modules/estimates/documents.ts).
    'NOT_UPLOADED_METHOD',
    'DOCUMENT_MISSING',
    'PDF_NOT_NEEDED',
    'DOCUMENT_NOT_READY',
    'TOTALS_INCOMPLETE',
  ],
  /**
   * Why the server refused an estimate lifecycle action (TSK-0055; apps/server/src/modules/estimates/lifecycle.ts and
   * the estimate_version.lifecycle machine of @handyhub/domain). Readiness reasons use estimateProblem.
   */
  estimateRefusal: [
    'INVALID_TRANSITION',
    'ACTOR_NOT_ALLOWED',
    'REVIEW_HOLD_OPEN',
    'PROJECT_NOT_OPEN',
    'STORAGE_NOT_CONFIGURED',
    'REASON_REQUIRED',
    'DRAFT_EXISTS',
    'ESTIMATE_ACCEPTED',
    'VERSION_EDITABLE',
    'NO_NEWER_VERSION',
    'FACTS_MISSING',
  ],
  /**
   * The customer's responses to an estimate version (TSK-0056, HH-EST-09; migration 0043,
   * apps/server/src/modules/estimates/responses.ts).
   */
  estimateResponseKind: ['changes_requested', 'declined', 'update_requested'],
  /** Scheduling task states (TSK-0057, ENT-SchedulingTask; migration 0044): open -> planning -> fulfilled / canceled. */
  schedulingTaskState: ['open', 'planning', 'fulfilled', 'canceled'],
  /**
   * TSK-0058: notification delivery channels (platform.message_deliveries); the delivery states and errors are the
   * deliveryState and deliveryError families above.
   */
  deliveryChannel: ['email', 'sms'],
  /** Visit purposes (TSK-0061, ENT-Visit; migration 0049): the Estimate visit and the three work visits. */
  visitPurpose: ['site_estimate', 'service', 'follow_up', 'return_work'],
  /** Visit states (ENT-Visit): tentative -> confirmed -> en_route -> arrived -> completed; expired, canceled, no_access. */
  visitState: ['tentative', 'confirmed', 'en_route', 'arrived', 'completed', 'expired', 'canceled', 'no_access'],
  /**
   * Why the server refused a visit window or plan (TSK-0061; apps/server/src/modules/visits/visits.ts and
   * @handyhub/domain/local-time WindowProblem), and the error codes shown when no field is named.
   */
  visitProblem: [
    'DATE_INVALID',
    'TIME_INVALID',
    'WINDOW_ORDER',
    'LOCAL_TIME_GAP',
    'LOCAL_TIME_REPEATED',
    'OFFSET_INVALID',
    'WINDOW_IN_PAST',
    'WINDOW_UNCHANGED',
    'WINDOW_LOCKED',
    'PROJECT_NOT_OPEN',
    'PROJECT_NOT_ACTIVE',
    'NO_JOB',
    'PROPERTY_ZONE_UNKNOWN',
    'BUSINESS_TIMEZONE_NOT_CONFIGURED',
    'FORBIDDEN',
    'NOT_FOUND',
    'VALIDATION_FAILED',
    'CONFLICT',
    'NOT_CONFIGURED',
    'INTERNAL',
    'UNAVAILABLE',
  ],
  /** How an estimate version was authored (HH-EST-11): written in the staff app, or an uploaded document. */
  authoringMethod: ['written', 'uploaded'],
  /** Estimate document states (TSK-0054; migration 0030, apps/server/src/modules/estimates/documents.ts). */
  estimateDocumentState: ['quarantined', 'ready', 'rejected', 'replaced'],
  /**
   * Why the server refused an estimate document (apps/server/src/modules/estimates/document-content.ts
   * DOCUMENT_PROBLEMS, and an empty upload).
   */
  estimateDocumentRejection: [
    'unsupported_type',
    'type_mismatch',
    'malformed',
    'trailing_data',
    'encrypted',
    'active_content',
    'empty',
  ],
  /** Potential hazards or restricted scope found at intake (TSK-0043, HH-LEAD-04; PROPOSED categories). */
  hazardCategory: ['hazardous_material', 'licensed_trade', 'structural', 'permit_licensing', 'other'],
  /** Hold states (ENT-Hold). */
  holdState: ['open', 'under_review', 'resolved', 'canceled_as_error'],
  /** The first-response clock as staff read it (TSK-0043, HH-LEAD-05). */
  responseClockState: ['not_configured', 'running', 'paused', 'overdue', 'stopped'],
  /** How the first-response clock was stopped (OWN-DEC-116). */
  responseStop: ['response_sent', 'conversation_recorded'],
  /** Completed customer conversations staff record (TSK-0043, PROPOSED channels). */
  conversationChannel: ['phone', 'in_person'],
  /** The two unanswered-estimate reminder drafts (TSK-0060; HH-EST-14, FACT-REMINDER-CADENCES). */
  reminderStep: ['first', 'final'],
  /** A reminder delivery's state (ENT-Message: draft, released and queued, then the delivery's outcome). */
  // TSK-0051: a question reminder is also 'not_scheduled' (its clock starts when the notice is sent) or 'scheduled'.
  reminderState: [
    'not_scheduled',
    'scheduled',
    'draft',
    'queued',
    'sent',
    'delivered',
    'failed',
    'suppressed',
    'cancelled',
  ],
  /**
   * Why a reminder was stopped, dismissed, suppressed or not sent (TSK-0060; HH-EST-14 stop rules, HH-COM-05). The
   * server's reminders module declares the stop reasons (apps/server/src/modules/estimates/reminders.ts).
   */
  reminderReason: [
    'accepted',
    'declined',
    'expired',
    'withdrawn',
    'superseded',
    'not_published',
    'customer_responded',
    'conversation_recorded',
    'project_not_open',
    'dismissed',
    'replaced_by_final',
    'sms_opted_out',
    'sms_no_opt_in',
    'template_not_configured',
    'channel_not_configured',
    'template_values_missing',
    'record_changed',
  ],
  /** Deposit requirement states (ENT-DepositRequirement; TSK-0059). */
  depositState: ['not_required', 'required', 'partly_satisfied', 'satisfied', 'applied', 'waived'],
  /** Accepted payment methods (FACT-PAYMENT-METHODS; config payment.methods). */
  paymentMethod: ['square_payment_link', 'square_tap_to_pay', 'cash', 'check', 'zelle', 'cash_app', 'chime'],
  /** Payment states (ENT-Payment): cash and digital recorded -> reconciled; checks received -> deposited -> cleared. */
  paymentState: ['recorded', 'reconciled', 'received', 'deposited', 'cleared', 'returned', 'voided'],
  /** Why a deposit action was refused (TSK-0059), by the field code the server answers. */
  depositRefusal: [
    'DEPOSIT_NOT_REQUIRED',
    'DEPOSIT_SATISFIED',
    'DEPOSIT_WAIVED',
    'DEPOSIT_APPLIED',
    'DEPOSIT_COVERED',
    'DUPLICATE_PAYMENT',
    'NOT_A_LINK',
    'NOT_HTTPS',
    'NOT_A_SQUARE_LINK',
    'TOO_LONG',
    'NOT_ACCEPTED',
    'INVALID',
    'IN_FUTURE',
    'required',
    'NOT_ACTIVE_STAFF',
    'NOT_A_CHECK',
    'CHECK_CLEARED',
    'CHECK_RETURNED',
    'CHECK_VOIDED',
    'NOT_CONFIGURED',
  ],
  /** The six ordered checklist stages of an SOP version (TSK-0068, HH-WORK-11, OWN-DEC-108). */
  sopStage: ['site_preparation', 'setup_checks', 'work_steps', 'quality_checks', 'cleanup_waste', 'final_checks'],
  /** SOP version review states (ENT-SOPVersion; OWN-DEC-17). */
  sopReviewState: ['pending_competent_review', 'approved', 'superseded'],
  /** The evidence an SOP step's own wording asks for (TSK-0068). */
  sopEvidence: ['photo', 'measurement', 'note'],
  /** The review controls the vault SOPs add next to steps (pending qualified review). */
  sopControl: ['HOLD', 'GATE', 'FLAG'],
  /** What pinned an SOP version on a work package (TSK-0068). */
  sopPinSource: ['approval', 'import'],
  /** Why the Owner's record of a competent-review sign-off was refused (TSK-0068). */
  sopSignOffProblem: ['REVIEWER_REQUIRED', 'QUALIFICATION_REQUIRED', 'REASON_REQUIRED', 'INVALID_TRANSITION'],
} as const satisfies Record<string, readonly string[]>

export type LabelFamily = keyof typeof LABEL_FAMILIES
export type LabelCode<F extends LabelFamily> = (typeof LABEL_FAMILIES)[F][number]

/** The catalog key that labels `code` in `family`. */
export function labelKey(family: LabelFamily, code: string): string {
  return `enum.${family}.${code}`
}

/** Every catalog key that the declared label families need. */
export function labelFamilyKeys(): string[] {
  return Object.entries(LABEL_FAMILIES).flatMap(([family, codes]) =>
    codes.map((code) => labelKey(family as LabelFamily, code)),
  )
}
