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
  ],
  /** The one action button of a queue item (HH-OPS-02); it opens the record's screen. */
  queueAction: ['review_request', 'review_hold', 'review_change', 'retry_delivery', 'open_case', 'decide'],
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
