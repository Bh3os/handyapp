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
    'appointment_reminder',
    'delivery_failed',
    'case_open',
    'estimate_to_write',
    'estimate_response',
    'window_offer_response',
    'estimate_reminder',
    'candidate_match',
    'inbox_needs_linking',
    'customer_replied',
    'question_replied',
    'question_reminder',
    'deposit_due',
    'visit_flagged',
    'loadout_shortage',
    // TSK-0123: a property whose time zone is unknown.
    'property_time_zone',
    'deposit_waiver',
    'start_work_exception',
    'refund_request',
    'cancellation_outcome',
    'deletion_request',
    'invoice_overdue_decision',
    'cancellation_review',
    'visit_cancellation_review',
    // TSK-0130: an estimate version waiting for the Owner's approval before publishing.
    'estimate_publication_approval',
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
    'window_other_times_requested',
    'window_offer_expired',
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
    'assignee_disabled',
    'availability_changed',
    'equipment_retired',
    'work_cancellation_requested',
    'critical_shortage',
    // TSK-0067: an appointment reminder draft waiting for release.
    'appointment_reminder',
    // TSK-0130: why a document waits for the Owner's approval before publishing.
    'threshold_not_configured',
    'over_threshold',
    'options_over_threshold',
    'change_order_adjustment',
    'revised_project_value',
    'combined_project_total',
    'adjustment_over_threshold',
    'negative_margin',
    'discretionary_discount',
    'discretionary_credit',
    'refund',
    'undocumented_correction',
    // TSK-0123: the property's time zone is unknown.
    'time_zone_unknown',
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
    'offer_windows',
    'release_reminder',
    'review_match',
    'link_message',
    'open_conversation',
    'review_deposit',
    'reassign_visit',
    'review_shortage',
    'verify_time_zone',
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
    'owner_approval.threshold',
    'owner_approval.discretionary_credit',
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
    'coverage.verification_source',
    'request.window_hours',
    'estimate.visit_fee',
    'legal.privacy_notice',
    'legal.sms_terms',
    'legal.website_terms',
    'legal.sms_disclosure',
    'legal.estimate_terms',
    'retention.audit_log',
    'retention.requests_not_converted',
    'retention.unaccepted_estimates',
    'retention.customer_profiles',
    'retention.accepted_agreements',
    'retention.financial_records',
    'retention.job_records',
    'retention.safety_records',
    'scheduling.window_offers',
    'visit.on_my_way',
    'geo.county_time_zones',
    'sms.unknown_zone_hours',
    'ai.module',
  ],
  /** A property's time-zone state and what it rests on (TSK-0123; @handyhub/domain zones.ts). */
  zoneStatus: ['unknown', 'derived', 'verified'],
  zoneBasis: [
    'zip_counties',
    'verified_county',
    'no_zip_rule',
    'zip_outside_area',
    'zip_boundary',
    'county_map_not_configured',
    'county_not_mapped',
    'counties_disagree',
    'assumption_withdrawn',
  ],
  /** The supported US zone families (OWN-DEC-159: Eastern and Central). */
  zoneFamily: ['eastern', 'central'],
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
  /** Why a ZIP has its coverage outcome (TSK-0127, OWN-DEC-179; @handyhub/domain COVERAGE_REASONS, PROPOSED codes). */
  coverageReason: [
    'dataset_one_county',
    'dataset_several_counties',
    'mailing_zip',
    'source_inside',
    'source_partly_inside',
    'source_outside',
    'source_missing',
    'not_listed',
    'not_configured',
    'lookup_failed',
  ],
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
    // TSK-0119: released wording whose values are not wired yet; a value that is not acceptable (a link host).
    'template_values_not_wired',
    'template_values_invalid',
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
    // TSK-0130 (HH-EST-16): the Owner's approval before publishing.
    'OWNER_APPROVAL_REQUIRED',
    'OWNER_APPROVAL_PENDING',
    'OWNER_APPROVAL_REJECTED',
    'OWNER_APPROVAL_NOT_REQUIRED',
    'TOTALS_INCOMPLETE',
    'VERSION_NOT_EDITABLE',
    'APPROVAL_NOT_PENDING',
    'COMMENT_REQUIRED',
    'OWNER_MFA_REQUIRED',
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
  /** TSK-0119 (HH-COM-14, OWN-DEC-152 section 7): the message lifecycle (apps/server/src/modules/notifications/lifecycle.ts). */
  messageLifecycle: [
    'DRAFT',
    'PENDING_APPROVAL',
    'APPROVED',
    'SCHEDULED',
    'QUEUED',
    'SENDING',
    'PROVIDER_ACCEPTED',
    'DELIVERED',
    'FAILED',
    'CANCELLED',
    'EXPIRED',
    'SUPPRESSED',
  ],
  /** TSK-0119 (OWN-DEC-152 section 3.6): message classification (notifications/message-types.ts). */
  messageCategory: ['authentication', 'account_security', 'transactional', 'internal', 'marketing'],
  /** TSK-0119: who releases a message (automatic by messages.automatic, staff, or the Owner). */
  messageRelease: ['automatic', 'staff', 'owner'],
  /** TSK-0119 (HH-COM-13): whether a released template can send today (notifications/templates.ts). */
  messageReadiness: ['ready', 'not_configured', 'not_wired'],
  /** TSK-0119: the staff view's message groups (notifications/lifecycle.ts LIFECYCLE_GROUPS). */
  messageGroup: ['waiting', 'sent', 'failed', 'stopped'],
  /** Visit purposes (TSK-0061, ENT-Visit; migration 0049): the Estimate visit and the three work visits. */
  visitPurpose: ['site_estimate', 'service', 'follow_up', 'return_work'],
  /** Visit states (ENT-Visit): tentative -> confirmed -> en_route -> arrived -> completed; expired, canceled, no_access. */
  visitState: ['tentative', 'confirmed', 'en_route', 'arrived', 'completed', 'expired', 'canceled', 'no_access'],
  /** TSK-0070 (HH-WORK-06): how one Arrived or Finished value stands (@handyhub/domain STAMP_STATUSES). */
  stampStatus: ['recorded', 'corrected', 'pending', 'missing'],
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
    // TSK-0059's deposit gate, registered in WORK_VISIT_GATES (apps/server/src/modules/visits/gates.ts).
    'DEPOSIT_REQUIRED',
    'DEPOSIT_REQUIREMENT_MISSING',
    'PROPERTY_ZONE_UNKNOWN',
    'BUSINESS_TIMEZONE_NOT_CONFIGURED',
    'FORBIDDEN',
    'NOT_FOUND',
    'VALIDATION_FAILED',
    'CONFLICT',
    'NOT_CONFIGURED',
    'INTERNAL',
    'UNAVAILABLE',
    // TSK-0062: confirming a visit and moving a confirmed one (apps/server/src/modules/visits/visits.ts confirmVisit,
    // apps/server/src/modules/capacity/resources.ts evaluate).
    'VISIT_NOT_TENTATIVE',
    'DURATION_NOT_ENTERED',
    'WORKERS_NOT_ENTERED',
    'WORKER_COUNT_MISMATCH',
    'WORKER_REPEATED',
    'EQUIPMENT_NOT_ASSIGNED',
    'EQUIPMENT_REPEATED',
    'OUTSIDE_VISIT_HOURS',
    'VISIT_HOURS_NOT_CONFIGURED',
    'WORKER_UNKNOWN',
    'WORKER_NOT_ACTIVE',
    'WORKER_NOT_ELIGIBLE',
    'WORKING_HOURS_NOT_SET',
    'OUTSIDE_WORKING_HOURS',
    'TIME_OFF',
    'WORKER_BOOKED',
    'EQUIPMENT_UNKNOWN',
    'EQUIPMENT_RETIRED',
    'EQUIPMENT_BOOKED',
    'CAPACITY_TAKEN',
    'STALE_VERSION',
    // TSK-0063: offering windows and withdrawing an offer (apps/server/src/modules/visits/offers.ts).
    'OFFER_OPEN',
    'WINDOW_OFFERS_NOT_CONFIGURED',
    'OFFER_WINDOW_COUNT',
    'OFFER_WINDOWS_OVERLAP',
    'REASON_REQUIRED',
    'OFFER_SELECTED',
    'OFFER_EXPIRED',
    'OFFER_WITHDRAWN',
    'OFFER_OTHER_TIMES_REQUESTED',
    // TSK-0064: the confirmation preconditions (apps/server/src/modules/visits/preconditions.ts).
    'APPROVAL_NOT_ACTIVE',
    'SCOPE_NOT_ACCEPTED',
    'REVIEW_HOLD_OPEN',
    'JOB_ON_HOLD',
    'CRITICAL_HOLD_OPEN',
    // TSK-0127 (final owner amendments 2026-10-22): the address and county check before a first confirmation.
    'COUNTY_NOT_VERIFIED',
    'COUNTY_OUTSIDE_AREA',
    'ADDRESS_VERSION_CHANGED',
    // TSK-0066: reschedule, reassign, cancel and the customer's change requests (apps/server/src/modules/visits/changes.ts).
    'INITIATOR_REQUIRED',
    'CAUSE_REQUIRED',
    'CAUSE_NOT_APPLICABLE',
    'REQUEST_IS_CUSTOMER',
    'REQUEST_NOT_FOR_VISIT',
    'REQUEST_CONFIRMED',
    'REQUEST_DECLINED',
    'REQUEST_CLOSED',
    'VISIT_NOT_CONFIRMED',
    'TEAM_UNCHANGED',
    'OWNER_CANCELS_WORK',
    'CANCELLATION_RULES_NOT_CONFIGURED',
  ],
  /** The outcome of a final cancellation under FACT-CANCELLATION-RULES (TSK-0066; @handyhub/domain/cancellation). */
  cancellationOutcome: [
    'full_refund_no_charge',
    'late_cancellation',
    'work_started',
    'customer_chooses',
    'owner_review',
  ],
  /** Who initiated a change of a booked visit (TSK-0066). */
  changeInitiator: ['customer', 'handyhub'],
  /** Why HandyHub cancels or moves a visit (TSK-0066; OWN-DEC-134 names weather, a safety stop and a sick worker). */
  handyhubCause: ['weather', 'safety_stop', 'sick_worker', 'other'],
  /** The customer's change requests of a confirmed visit (TSK-0066; HH-PORT-04, OWN-DEC-107). */
  changeRequestKind: ['reschedule', 'cancellation'],
  /** Window offer states (TSK-0063; @handyhub/domain/window-offer, migration 0053). */
  windowOfferState: ['open', 'selected', 'other_times_requested', 'withdrawn', 'expired'],
  /** What happened to one automatic notice's delivery (migration 0008 message_deliveries.state). */
  noticeState: ['draft', 'queued', 'sent', 'delivered', 'failed', 'suppressed', 'cancelled'],
  /**
   * Why the server refused a working-hours, time-off or equipment change (TSK-0062;
   * apps/server/src/modules/capacity/availability.ts, @handyhub/domain/capacity HoursProblem), and the error codes
   * shown when no field is named.
   */
  availabilityProblem: [
    'WEEKDAY_INVALID',
    'TIME_INVALID',
    'DATE_INVALID',
    'PERIOD_ORDER',
    'PERIOD_OVERLAP',
    'TIME_OFF_ORDER',
    'TIME_OFF_IN_PAST',
    'TIME_OFF_TOO_LONG',
    'TIME_OFF_WITHDRAWN',
    'ACCOUNT_DISABLED',
    'EQUIPMENT_NAME_TAKEN',
    'EQUIPMENT_RETIRED',
    'BUSINESS_TIMEZONE_NOT_CONFIGURED',
    'required',
    'STALE_VERSION',
    'FORBIDDEN',
    'NOT_FOUND',
    'VALIDATION_FAILED',
    'CONFLICT',
    'NOT_CONFIGURED',
    'INTERNAL',
    'UNAVAILABLE',
  ],
  /** Staff roles a person can be granted (OWN-DEC-114 role list; ROLE-MATRIX columns; TSK-0097). */
  staffRole: ['owner', 'office', 'estimator', 'worker'],
  /** Named capabilities the Owner grants per person (ENT-RoleGrant; TSK-0097). */
  staffCapability: ['collect'],
  /** Staff account states (ENT-StaffUser: invited, active, disabled). */
  staffStatus: ['invited', 'active', 'disabled'],
  /**
   * The areas of audit actions (TSK-0098; HH-SEC-06): the part of an action code before its first dot, as the
   * modules record them. An area not listed here is shown by its code.
   */
  auditArea: [
    'access_code',
    'account_offer',
    'appointment_reminder',
    'approval_receipt',
    'automation',
    'check',
    'contact_verification',
    'coverage',
    'customer',
    'customer_account',
    'customer_session',
    'deposit',
    'equipment',
    'estimate',
    'estimate_document',
    'estimate_reminder',
    'hold',
    'inbox',
    'incident',
    'job_hold',
    'job_packet',
    'loadout',
    'message',
    'notification',
    'payment',
    'photo',
    'portal',
    'project_access',
    'property',
    'publication_approval',
    'question',
    'queue',
    'request',
    'privacy',
    'request_draft',
    'retention',
    'security',
    'sms',
    'sop',
    'staff',
    'staff_link',
    'visit',
  ],
  /** Retention schedule categories (TSK-0099; apps/server/src/modules/retention/schedule.ts, FACT-RETENTION-SCHEDULE). */
  retentionCategory: [
    'requests_not_converted',
    'unaccepted_estimates',
    'customer_profiles',
    'accepted_agreements',
    'financial_records',
    'job_records',
    'safety_records',
    'audit_log',
    'access_codes',
    'sessions_and_links',
    'regulated_employee_records',
    'not_scheduled',
  ],
  /** The categories with a period, which deletion-review entries carry (privacy.retention_reviews.category). */
  retentionPeriodCategory: [
    'requests_not_converted',
    'unaccepted_estimates',
    'customer_profiles',
    'accepted_agreements',
    'financial_records',
    'job_records',
    'safety_records',
    'audit_log',
  ],
  /** The rule of a category without a period (FACT-RETENTION-SCHEDULE; not_scheduled: OQ-RETENTION-UNSCHEDULED). */
  retentionNoPeriod: ['access_codes', 'sessions_and_links', 'regulated_employee_records', 'not_scheduled'],
  /** What starts a period (the `after` field of the retention.* values; audit records: when recorded). */
  retentionStart: [
    'request_closed',
    'estimate_expired_or_closed',
    'last_completed_service',
    'final_job_closeout',
    'tax_return_filed_or_tax_paid',
    'job_closeout',
    'closure',
    'recorded',
  ],
  /** Whether the daily review finds a category's records yet (TSK-0099 ScanState). */
  retentionScan: ['scanned', 'start_not_recorded', 'no_period'],
  /** The hold checks of a deletion-review entry (ENT-RetentionReview "holds found"). */
  retentionHoldCheck: [
    'open_holds',
    'complaints',
    'warranties',
    'disputes',
    'claims',
    'investigations',
    'unfiled_tax_returns',
    'legal_holds',
    'insurance_holds',
  ],
  retentionHoldResult: ['found', 'none_found', 'not_applicable', 'not_recorded'],
  /** The record types the review opens entries for. */
  retentionRecordType: ['request', 'estimate', 'audit_event'],
  /** TSK-0100: an entry's status from the Owner's latest decision (privacy.retention_decisions). */
  retentionEntryState: ['pending', 'archived', 'kept', 'deleted'],
  /** TSK-0100: the checks of a deletion (apps/server/src/modules/privacy/targets.ts DELETION_CHECKS). */
  deletionCheck: [
    'open_holds',
    'complaints',
    'warranties',
    'disputes',
    'claims',
    'investigations',
    'unfiled_tax_returns',
    'legal_holds',
    'insurance_holds',
    'signed_approvals',
    'approval_receipts',
    'jobs',
    'deposit_records',
    'issued_invoices',
    'payments',
  ],
  /** TSK-0100: why a deletion is blocked (targets.ts BLOCKERS). */
  deletionBlocker: [
    'hold_found',
    'protected_evidence',
    'record_active',
    'erasure_not_available',
    'audit_append_only',
    'record_missing',
    'already_deleted',
  ],
  /** TSK-0100: what goes with a deleted record or stays (the confirmation and the log's counts). */
  deletionKind: [
    'estimate_versions',
    'estimate_lines',
    'estimate_line_costs',
    'estimate_internals',
    'estimate_documents',
    'customer_responses',
    'saved_selections',
    'reminder_drafts',
    'stored_files',
    'project_and_request',
    'message_records',
    'audit_entries',
    'sign_in_values',
    'sessions',
    'project_links',
    'access_links',
  ],
  /** TSK-0100: where a deletion decision came from (privacy.deletions.source). */
  deletionSource: ['retention_review', 'privacy_request', 'restore_reapply'],
  /** TSK-0100: the record types the deletion log names. */
  deletionRecordType: ['estimate', 'customer_account'],
  /** TSK-0100: privacy request kinds and states (ENT-PrivacyRequest). */
  privacyRequestKind: ['export', 'correction', 'deletion'],
  privacyRequestState: ['received', 'under_review', 'completed', 'partially_completed', 'declined'],
  /** TSK-0100: the record kinds of a privacy request's scoped search (privacy/plan.ts PLAN_CATEGORIES). */
  privacyCategory: [
    'login_account',
    'access_links',
    'account_preferences',
    'unaccepted_estimates',
    'accepted_agreements',
    'requests',
    'photos',
    'job_records',
    'safety_records',
    'customer_profile',
    'consent_records',
    'audit_log',
    'privacy_requests',
    'third_party_contacts',
    'financial_records',
  ],
  privacyDisposition: ['delete', 'retain', 'exclude', 'none_stored', 'not_recorded'],
  privacyReason: [
    'protected_evidence',
    'retention_period',
    'hold',
    'active_record',
    'needed_by_retained',
    'erasure_not_available',
    'consent_evidence',
    'third_party',
    'request_record',
  ],
  /** TSK-0100: why the server refused a privacy or deletion decision, and the error codes shown when no field is named. */
  privacyProblem: [
    'CHECK_NOT_CONFIRMED',
    'RECORD_CHANGED',
    'KEEP_UNTIL_INVALID',
    'ALREADY_DECIDED',
    'REVIEW_NOT_STARTED',
    'REVIEW_ALREADY_STARTED',
    'PRIVACY_REQUEST_OPEN',
    'required',
    'FRESH_AUTH_REQUIRED',
    'STALE_VERSION',
    'FORBIDDEN',
    'NOT_FOUND',
    'VALIDATION_FAILED',
    'CONFLICT',
    'NOT_CONFIGURED',
    'INTERNAL',
    'UNAVAILABLE',
  ],
  /** The result of an audited action (ENT-AuditEvent; platform.audit_events.result). */
  auditResult: ['succeeded', 'denied', 'failed'],
  /** Who performed an audited action, when it was not a staff member (ENT-AuditEvent; actor_kind). */
  auditActorKind: ['staff', 'customer', 'guest', 'system'],
  /**
   * Why the server refused a staff-management change (TSK-0097; apps/server/src/modules/staff/members.ts), and the
   * error codes shown when no field is named.
   */
  staffProblem: [
    'ACCOUNT_DISABLED',
    'ACCOUNT_NOT_DISABLED',
    'GRANT_EXISTS',
    'GRANT_NOT_LIVE',
    'CAPABILITY_NEEDS_WORKER',
    'LAST_ROLE',
    'LAST_OWNER',
    'OWN_ACCOUNT',
    'required',
    'FORBIDDEN',
    'FRESH_AUTH_REQUIRED',
    'NOT_FOUND',
    'VALIDATION_FAILED',
    'CONFLICT',
    'INTERNAL',
    'UNAVAILABLE',
  ],
  /** Why an upcoming reservation was flagged for review (TSK-0062, OWN-DEC-123; migration 0052 reservation_flags). */
  reservationFlag: ['working_hours_changed', 'time_off_recorded', 'account_disabled', 'equipment_retired'],
  /** Why a reservation ended (ENT-Reservation; migration 0052). */
  reservationEnd: [
    'rescheduled',
    'reassigned',
    'released',
    'hold_expired',
    'hold_released',
    'visit_expired',
    'visit_canceled',
    'visit_no_access',
  ],
  /** Reservation kinds (ENT-Reservation): a hold of an offered window (OWN-DEC-144) or a confirmed reservation. */
  reservationKind: ['hold', 'confirmed'],
  /** A worker's role on a visit (ENT-Reservation). */
  reservationRole: ['lead', 'member'],
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
  hazardCategory: [
    'hazardous_material',
    'licensed_trade',
    'structural',
    'permit_licensing',
    'other',
    'critical_resource',
  ],
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
    'customer_message',
    'question_replied',
    'conversation_recorded',
    'project_not_open',
    'dismissed',
    'replaced_by_final',
    'sms_opted_out',
    'sms_no_opt_in',
    'template_not_configured',
    'channel_not_configured',
    'template_values_missing',
    'template_values_not_wired',
    'template_values_invalid',
    'record_changed',
    // TSK-0067 (HH-COM-11): why an appointment reminder is not drafted or sent
    // (apps/server/src/modules/visits/reminders.ts APPOINTMENT_REMINDER_STOP_REASONS).
    'visit_canceled',
    'visit_rescheduled',
    'visit_en_route',
    'visit_arrived',
    'visit_completed',
    'visit_no_access',
    'visit_not_confirmed',
    'visit_started',
    'already_reminded',
    'details_changed',
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
  /** ENT-Hold kinds (TSK-0069 packet; the domain's HOLD_KINDS). */
  holdKind: ['review', 'job_requirement', 'critical_safety', 'task_block'],
  /** Where a job scope snapshot version comes from (ENT-JobScopeSnapshot). */
  scopeSource: ['approval', 'change_order'],
  /** The customer-facing lists of an accepted scope, as a packet shows them (TSK-0069). */
  scopeText: ['assumptions', 'exclusions', 'customerResponsibilities', 'dependencies', 'scheduleAssumptions'],
  /** The sections of a job packet (TSK-0069, HH-PKT-01; @handyhub/domain PACKET_SECTIONS). */
  packetSection: [
    'identity',
    'schedule',
    'assignment',
    'site_access',
    'occupants',
    'scope',
    'evidence',
    'sop',
    'holds',
    'resources',
    'dependencies',
  ],
  /**
   * TSK-0130 (HH-EST-16, OWN-DEC-173): why publishing waits for the Owner, an approval record's state, the builder's
   * status, how an approval came about and why it stopped counting (@handyhub/domain publication-approval.ts).
   */
  publicationApprovalReason: [
    'threshold_not_configured',
    'over_threshold',
    'options_over_threshold',
    'change_order_adjustment',
    'revised_project_value',
    'combined_project_total',
    'adjustment_over_threshold',
    'negative_margin',
    'discretionary_discount',
    'discretionary_credit',
    'refund',
    'undocumented_correction',
  ],
  publicationApprovalState: ['pending', 'approved', 'rejected', 'invalidated'],
  publicationApprovalStatus: ['closed', 'incomplete', 'not_required', 'required', 'pending', 'approved', 'rejected'],
  publicationApprovalBasis: ['request', 'owner_publication'],
  publicationInvalidation: ['content_changed', 'not_required'],
  /** Where a worker's own packet acknowledgment stands, and why one stopped counting (TSK-0072). */
  acknowledgmentState: ['acknowledged', 'required', 'invalidated', 'not_assigned'],
  acknowledgmentInvalidation: ['critical_change', 'assignment_removed', 'account_disabled'],
  /** What a worker states about a loadout item, and the Owner's approved substitute (TSK-0071, HH-PKT-05). */
  loadoutStatus: ['loaded', 'missing', 'damaged', 'substitute_approved'],
  /** Required and nice-to-have loadout items (HH-PKT-05). */
  loadoutCriticality: ['required', 'nice_to_have'],
  /** A work package's loadout readiness (TSK-0071; @handyhub/domain LOADOUT_READINESS). */
  loadoutReadiness: ['ready', 'not_confirmed', 'blocked', 'not_configured'],
  /** What an approved substitute affects (HH-PKT-06). */
  substituteImpact: ['safety', 'appearance', 'specification', 'price', 'warranty'],
  /** How a task block is resolved (TSK-0071, PROPOSED). */
  taskBlockResolution: ['item_provided', 'substitute_approved'],
  /** Why a loadout statement or a task block resolution was refused (TSK-0071). */
  loadoutProblem: [
    'ITEM_NOT_CONFIRMED_LOADED',
    'SUBSTITUTE_REQUIRED',
    'IMPACTS_REQUIRED',
    'CHANGE_ORDER_REQUIRED',
    'UNKNOWN_ITEM',
    'NOT_CONFIGURED',
    'INVALID_TRANSITION',
    'REASON_REQUIRED',
    'REVIEWER_REQUIRED',
  ],
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
