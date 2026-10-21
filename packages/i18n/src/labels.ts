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
    'visit_flagged',
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
    'assignee_disabled',
    'availability_changed',
    'equipment_retired',
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
    'reassign_visit',
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
    'cancellation.rules',
    'contact.hours',
    'business.timezone',
    'reminders.cadences',
    'request.reopen_period',
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
    'retention.audit_log',
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
  ],
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
  ],
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
    'account_offer',
    'automation',
    'contact_verification',
    'coverage',
    'customer_account',
    'customer_session',
    'equipment',
    'estimate',
    'estimate_document',
    'hold',
    'incident',
    'job_hold',
    'message',
    'notification',
    'photo',
    'project_access',
    'queue',
    'request',
    'request_draft',
    'security',
    'sms',
    'staff',
    'staff_link',
    'visit',
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
  hazardCategory: ['hazardous_material', 'licensed_trade', 'structural', 'permit_licensing', 'other'],
  /** Hold states (ENT-Hold). */
  holdState: ['open', 'under_review', 'resolved', 'canceled_as_error'],
  /** The first-response clock as staff read it (TSK-0043, HH-LEAD-05). */
  responseClockState: ['not_configured', 'running', 'paused', 'overdue', 'stopped'],
  /** How the first-response clock was stopped (OWN-DEC-116). */
  responseStop: ['response_sent', 'conversation_recorded'],
  /** Completed customer conversations staff record (TSK-0043, PROPOSED channels). */
  conversationChannel: ['phone', 'in_person'],
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
