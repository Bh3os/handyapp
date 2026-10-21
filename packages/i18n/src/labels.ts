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
    'safety_hold',
    'visit_change_request',
    'delivery_failed',
    'case_open',
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
    'safety_hold',
    'reschedule_requested',
    'cancellation_requested',
    'delivery_failed',
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
  ],
  /** The one action button of a queue item (HH-OPS-02); it opens the record's screen. */
  queueAction: ['review_request', 'review_hold', 'review_change', 'retry_delivery', 'open_case', 'decide'],
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
  ],
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
