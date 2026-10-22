// The action queue's item types (TSK-0041; HH-OPS-01, HH-OPS-02, ENT-QueueItem, OWN-DEC-115). An extensible registry:
// each module declares the types its providers open, keyed by subject, and the queue lists, orders and masks them
// without knowing the module. A type names:
// - its section: the staff queue, or the Owner's Owner Decisions;
// - the permission-matrix action whose holders may see it listed (ROLE-MATRIX; the queue never copies a role list);
// - its default urgency band, its reasons and the reasons only some roles may see;
// - its one action and the screen its deep link opens.
// The view actions of the queue section and the screens are PROPOSED mappings (the matrix names who acts, not who
// sees a list); the Owner Decisions types use the owner-only action of each decision as the matrix states it.
// Labels come from the staff catalogs (label families queueItemType, queueReason and queueAction).
import { PUBLICATION_APPROVAL_REASONS } from '@handyhub/domain'
import type { Action } from '@handyhub/policy'

export const QUEUE_SECTIONS = ['queue', 'owner_decisions'] as const
export type QueueSection = (typeof QUEUE_SECTIONS)[number]

/** Urgency bands in order (OWN-DEC-115): safety, today's appointment changes, time-sensitive, everything else. */
export const QUEUE_BANDS = ['safety', 'today_change', 'time_sensitive', 'other'] as const
export type QueueBand = (typeof QUEUE_BANDS)[number]

export const QUEUE_ACTIONS = [
  'review_request',
  'review_hold',
  'review_change',
  'retry_delivery',
  'open_case',
  'decide',
  'write_estimate',
  'review_estimate',
  'offer_windows',
  // TSK-0060 estimate reminders; TSK-0051: also the drafted reminders of an unanswered question (or close the request).
  'release_reminder',
  'review_match',
  'link_message',
  'open_conversation',
  'review_deposit',
  // TSK-0097: reassign a visit flagged by an availability change.
  'reassign_visit',
  // TSK-0071: provide a missing or damaged loadout item, or approve a substitute.
  'review_shortage',
  // TSK-0123: record the zone of a property whose zone is unknown.
  'verify_time_zone',
  // TSK-0074: set Ready on a job-level Hold / Ready note once the requirement it names is resolved.
  'review_job_hold',
] as const
export type QueueAction = (typeof QUEUE_ACTIONS)[number]

/** Staff app screens a deep link may open (packages/policy NAV_ITEMS ids). */
export type QueueScreen =
  | 'requests'
  | 'schedule'
  | 'inbox'
  | 'cases'
  | 'payments'
  | 'customers'
  | 'estimates'
  // TSK-0123: a property record (below the customer records in the menu).
  | 'properties'

export type QueueItemType = {
  readonly id: string
  readonly section: QueueSection
  /** What the item is about; one open item per type and subject. */
  readonly subject: string
  readonly band: QueueBand
  /** Who may see it listed: the roles holding this action (all records, or only their own for own-record grants). */
  readonly view: Action
  readonly reasons: readonly string[]
  /**
   * Reasons that reveal restricted detail (HH-OPS-02): shown only to the roles holding `action`; everyone else sees
   * `generic` and a masked marker, exactly as the record screen masks them.
   */
  readonly restricted?: { readonly action: Action; readonly reasons: readonly string[]; readonly generic: string }
  readonly action: QueueAction
  /** The screen of the record the item's action and deep link open: `/<screen>/<subject id>`. */
  readonly screen: QueueScreen
  /**
   * The record's page below the screen when it is not `/<screen>/<id>` (TSK-0071: a job's loadout, `/loadouts/<job>`,
   * shown under the screen's menu entry).
   */
  readonly path?: string
  /** The item's due time is the first-response clock (HH-LEAD-05): labelled an internal target, never a promise. */
  readonly clock?: 'response_target'
}

export const QUEUE_ITEM_TYPES = [
  // The staff queue (Owner, Office, Estimator by their grants).
  {
    id: 'new_request',
    section: 'queue',
    subject: 'request',
    band: 'time_sensitive',
    view: 'request.view',
    // TSK-0043: past "received" the item stays until a meaningful response stops the clock (OWN-DEC-116).
    reasons: ['new_request', 'new_request_flagged', 'awaiting_first_response'],
    action: 'review_request',
    screen: 'requests',
    clock: 'response_target',
  },
  // A potential hazard or restricted scope found at intake (HH-LEAD-04, TSK-0043): one item per request while any of
  // its review holds is open or under review. A safety issue, so it is in the safety band (OWN-DEC-115).
  {
    id: 'review_hold',
    section: 'queue',
    subject: 'request',
    band: 'safety',
    view: 'request.view',
    reasons: ['review_hold'],
    action: 'review_hold',
    screen: 'requests',
  },
  {
    id: 'safety_hold',
    section: 'queue',
    subject: 'hold',
    band: 'safety',
    view: 'work.stop',
    reasons: ['safety_hold'],
    action: 'review_hold',
    screen: 'schedule',
  },
  // TSK-0066 (HH-PORT-04, OWN-DEC-107): a customer's Request to Reschedule or Request Cancellation, prominently, one item
  // per visit while the request is open; due when the visit's reserved range starts, in the today_change band on the
  // visit's own date (PROPOSED). Resolved when staff confirm or decline it, or by the database when the visit leaves
  // 'confirmed' another way (migration 0059).
  {
    id: 'visit_change_request',
    section: 'queue',
    subject: 'visit',
    band: 'time_sensitive',
    view: 'visit.reschedule',
    reasons: ['reschedule_requested', 'cancellation_requested'],
    action: 'review_change',
    screen: 'schedule',
  },
  // TSK-0067 (HH-COM-11, OWN-DEC-107, S01 "message drafts awaiting release"): a confirmed visit's appointment reminder
  // draft waits for staff release, one item per visit while a draft is waiting; due by the start of the arrival window
  // (PROPOSED). Resolved once the draft is released, dismissed or stopped (a reschedule or cancellation, or the
  // database when the visit leaves 'confirmed' another way, migration 0060). Seen by the roles that manage booked
  // visits; the link opens the visit on the board, whose reminder panel sends or dismisses it.
  // TSK-0121 (OWN-DEC-153): the reminder is automatic; no item of this type is opened any more (migration 0075
  // resolved the open ones). The type stays for the items already recorded.
  {
    id: 'appointment_reminder',
    section: 'queue',
    subject: 'visit',
    band: 'time_sensitive',
    view: 'visit.reschedule',
    reasons: ['appointment_reminder'],
    action: 'release_reminder',
    screen: 'schedule',
  },
  {
    id: 'delivery_failed',
    section: 'queue',
    subject: 'message_delivery',
    band: 'time_sensitive',
    view: 'message.reply',
    // TSK-0032: a message that cannot be sent until its wording or channel is configured says so.
    reasons: ['delivery_failed', 'delivery_not_configured'],
    action: 'retry_delivery',
    screen: 'inbox',
  },
  {
    id: 'case_open',
    section: 'queue',
    subject: 'case',
    band: 'other',
    view: 'case.record_complaint',
    reasons: ['case_opened', 'complaint_recorded', 'damage_reported', 'injury_reported', 'dispute_reported'],
    // Office "sees only that a case exists and its status" (ROLE-MATRIX, incident.view_restricted).
    restricted: {
      action: 'incident.view_restricted',
      reasons: ['complaint_recorded', 'damage_reported', 'injury_reported', 'dispute_reported'],
      generic: 'case_opened',
    },
    action: 'open_case',
    screen: 'cases',
  },
  // Pending estimates (HH-OPS-01 "pending estimates"; TSK-0053): a request ready for an estimate, until its estimate is
  // published (TSK-0055 moves the request on). Seen by the roles that write estimates; the link opens the request,
  // where "Write an Estimate" starts the builder. Band and subject are PROPOSED.
  {
    id: 'estimate_to_write',
    section: 'queue',
    subject: 'request',
    band: 'other',
    view: 'estimate.draft',
    reasons: ['ready_for_estimate', 'estimate_draft'],
    action: 'write_estimate',
    screen: 'requests',
  },
  // The customer's answer to a published estimate (HH-EST-09, TSK-0056): Request Changes, Decline or Request an Updated
  // Estimate. One item per estimate version, opened in the same transaction as the response and resolved when a newer
  // version of the estimate is published. Seen by the roles that revise estimates; the link opens the version, whose
  // lifecycle panel lists the customer's words. Band, view action and resolution are PROPOSED.
  {
    id: 'estimate_response',
    section: 'queue',
    subject: 'estimate_version',
    band: 'time_sensitive',
    view: 'estimate.revise',
    reasons: ['estimate_changes_requested', 'estimate_declined', 'estimate_update_requested'],
    action: 'review_estimate',
    screen: 'estimates',
  },
  // TSK-0063 (HH-SCH-11, OWN-DEC-144): the customer asked for other times, or an offer's hold ended with no window
  // selected; staff offer new windows. One item per request (the request record lists the visits and their offers),
  // opened with the answer or the expiry and resolved when a new offer is made or a window is selected. Band, view
  // action and screen are PROPOSED.
  {
    id: 'window_offer_response',
    section: 'queue',
    subject: 'request',
    band: 'time_sensitive',
    view: 'visit.offer_windows',
    reasons: ['window_other_times_requested', 'window_offer_expired'],
    action: 'offer_windows',
    screen: 'requests',
  },
  // A reminder draft waiting for staff release (S01 "message drafts awaiting release"; HH-EST-14, TSK-0060): one item
  // per estimate version while a first or final unanswered-estimate reminder is a draft; it resolves once the draft is
  // released, dismissed or stopped. Seen by the roles that work on estimates (the link opens the version, whose
  // reminders panel releases or dismisses the draft); band and view action are PROPOSED.
  // TSK-0121 (OWN-DEC-153): the reminder is automatic; no item of this type is opened any more (migration 0075
  // resolved the open ones). The type stays for the items already recorded.
  {
    id: 'estimate_reminder',
    section: 'queue',
    subject: 'estimate_version',
    band: 'time_sensitive',
    view: 'estimate.revise',
    reasons: ['estimate_reminder_first', 'estimate_reminder_final'],
    action: 'release_reminder',
    screen: 'estimates',
  },
  // TSK-0044 (HH-ID-02, T21): customers sharing an email, phone or address wait for staff review; the item opens the
  // customer record with its suggestions. Never merged or linked automatically.
  {
    id: 'candidate_match',
    section: 'queue',
    subject: 'customer',
    band: 'other',
    view: 'customer.view_duplicates',
    reasons: ['possible_duplicate'],
    action: 'review_match',
    screen: 'customers',
  },
  // TSK-0049 (HH-COM-07, OWN-DEC-120): an inbound message that no reliable reference places on exactly one project
  // waits in Needs Linking. Only the holders of message.view_unmatched (Owner, Office) see the item, and the item names
  // no project, reference or sender.
  {
    id: 'inbox_needs_linking',
    section: 'queue',
    subject: 'inbound_message',
    band: 'time_sensitive',
    view: 'message.view_unmatched',
    reasons: ['message_needs_linking'],
    action: 'link_message',
    screen: 'inbox',
  },
  // A customer's email or text matched to a project: one item per conversation until staff mark it handled.
  {
    id: 'customer_replied',
    section: 'queue',
    subject: 'conversation',
    band: 'time_sensitive',
    view: 'message.reply',
    reasons: ['customer_replied'],
    action: 'open_conversation',
    screen: 'inbox',
  },
  // TSK-0051 (HH-LEAD-03, OWN-DEC-98): a customer replied to a question, or the reply reopened a "Closed—no response"
  // request; one item per request until staff review it (or act on the request). Assigned to the responsible staff
  // member, so it is the reply's notice in the queue.
  {
    id: 'question_replied',
    section: 'queue',
    subject: 'request',
    band: 'time_sensitive',
    view: 'request.view',
    reasons: ['question_replied', 'reopened_by_reply'],
    action: 'review_request',
    screen: 'requests',
  },
  // TSK-0051 (HH-LEAD-06, OWN-DEC-101): the reminder drafts of an unanswered question wait for release, prominently;
  // after the final one was actually sent and the configured hours passed, the item says the request may be closed.
  // Seen by the roles that release drafts (ROLE-MATRIX "Reply from a project, release drafts").
  // TSK-0121 (OWN-DEC-153, OWN-DEC-208): the reminder is automatic, so only no_response_close_available is opened now
  // (24 hours after the reminder was actually sent); the draft reasons stay for the items already recorded.
  {
    id: 'question_reminder',
    section: 'queue',
    subject: 'request',
    band: 'time_sensitive',
    view: 'message.release_draft',
    reasons: ['question_reminder_first', 'question_reminder_final', 'no_response_close_available'],
    action: 'release_reminder',
    screen: 'requests',
  },
  // Deposits to collect and checks to verify (S01, HH-FIN-02, HH-FIN-12; TSK-0059): one item per job while its required
  // deposit is still due, opened from the approval's committed event and kept in line in the same transaction as every
  // deposit payment, check clearing and waiver; resolved once verified money covers it or the Owner waives it. Seen by
  // the roles that record payments (the Owner, Office); the link opens the job's deposit. Band and view are PROPOSED.
  {
    id: 'deposit_due',
    section: 'queue',
    subject: 'job',
    band: 'other',
    view: 'payment.record',
    reasons: ['deposit_due', 'deposit_check_pending'],
    action: 'review_deposit',
    screen: 'payments',
  },
  // Appointments flagged by an availability change (HH-OPS-01 "upcoming assignments of a disabled account, to
  // reassign; appointments flagged by an availability change", HH-STAFF-02, HH-STAFF-07, TSK-0097): one item per visit,
  // opened, updated and resolved by the database in the same transaction as the flag and as whatever clears it
  // (migration 0054, ops.sync_visit_flagged_item). Seen by the roles that reassign visits; band (today_change on the
  // visit's own date) and due time (the start of the reserved range) are PROPOSED.
  {
    id: 'visit_flagged',
    section: 'queue',
    subject: 'visit',
    band: 'time_sensitive',
    view: 'visit.reassign',
    reasons: ['assignee_disabled', 'availability_changed', 'equipment_retired'],
    action: 'reassign_visit',
    screen: 'schedule',
  },
  // TSK-0071 (HH-PKT-06): a critical loadout shortage blocks Start Work on its work package until the Owner provides the
  // item or approves a substitute. One item per job while any of its task blocks blocks, opened in the same
  // transaction as the worker's report and resolved with the last block. Seen by the block's owner (job_hold.set_ready:
  // the Owner); band and view are PROPOSED (OQ-LOADOUT-DETAILS).
  {
    id: 'loadout_shortage',
    section: 'queue',
    subject: 'job',
    band: 'time_sensitive',
    view: 'job_hold.set_ready',
    reasons: ['critical_shortage'],
    action: 'review_shortage',
    screen: 'schedule',
    path: 'loadouts',
  },
  // TSK-0074 (HH-WORK-02, OWN-DEC-82, OWN-DEC-137): a job-level Hold / Ready note blocks confirming and starting the
  // job until the Owner sets Ready with a note. One item per job while any of its job-level holds blocks, opened in
  // the same transaction as the hold (set by staff, or raised by a worker's site check that found the site different)
  // and resolved with the last one. Seen by the Owner (job_hold.set_ready); band and view are PROPOSED.
  {
    id: 'job_hold',
    section: 'queue',
    subject: 'job',
    band: 'time_sensitive',
    view: 'job_hold.set_ready',
    reasons: ['job_on_hold', 'site_condition_differs'],
    action: 'review_job_hold',
    screen: 'schedule',
    path: 'start-review',
  },
  // TSK-0123 (OWN-DEC-159 item 13): a property whose zone is unknown while one of its projects is open, flagged for
  // verification; no visit is planned on it until its zone is known. Opened and resolved by the database in the same
  // transaction as the zone or the project changes (migration 0066, ops.sync_property_zone_item). Seen by the roles
  // that edit property records, who verify the zone there. Band and view are PROPOSED.
  {
    id: 'property_time_zone',
    section: 'queue',
    subject: 'property',
    band: 'other',
    view: 'customer.edit',
    reasons: ['time_zone_unknown'],
    action: 'verify_time_zone',
    screen: 'properties',
  },
  // Owner Decisions (HH-OPS-01 "Owner, additionally"): each decision is owner-only in the matrix.
  {
    id: 'deposit_waiver',
    section: 'owner_decisions',
    subject: 'project',
    band: 'other',
    view: 'deposit.waive',
    reasons: ['deposit_waiver_requested'],
    action: 'decide',
    screen: 'payments',
  },
  {
    id: 'start_work_exception',
    section: 'owner_decisions',
    subject: 'job',
    band: 'time_sensitive',
    view: 'work.approve_exception',
    // TSK-0074 (HH-WORK-03): a request to decide; then, every approved exception stays in the Owner's review queue
    // while its follow-up (the pending upload, the reconciliation, the deferred walkthrough) is open.
    reasons: ['start_work_exception_requested', 'start_work_exception_follow_up'],
    action: 'decide',
    screen: 'schedule',
    path: 'start-review',
  },
  // TSK-0086 (HH-FIN-07, T59): money of a job's payments not applied to anything (an overpayment, or a deposit payment
  // beyond the deposit) stays the customer's money for the Owner's credit or refund decision (TSK-0089 decides it).
  // One item per job while any remains; seen by the Owner (payment.credit). Band PROPOSED.
  {
    id: 'unallocated_credit',
    section: 'owner_decisions',
    subject: 'job',
    band: 'other',
    view: 'payment.credit',
    reasons: ['overpayment'],
    action: 'decide',
    screen: 'payments',
  },
  {
    id: 'refund_request',
    section: 'owner_decisions',
    subject: 'finance_request',
    band: 'other',
    view: 'payment.refund',
    reasons: ['refund_requested'],
    action: 'decide',
    screen: 'payments',
  },
  {
    id: 'cancellation_outcome',
    section: 'owner_decisions',
    subject: 'project',
    band: 'other',
    view: 'cancellation_outcome.apply',
    reasons: ['cancellation_outcome_requested'],
    action: 'decide',
    screen: 'payments',
  },
  {
    id: 'deletion_request',
    section: 'owner_decisions',
    subject: 'privacy_request',
    band: 'other',
    view: 'privacy.decide',
    reasons: ['deletion_requested'],
    action: 'decide',
    screen: 'customers',
  },
  {
    id: 'invoice_overdue_decision',
    section: 'owner_decisions',
    subject: 'invoice',
    band: 'time_sensitive',
    view: 'invoice.decide_overdue',
    reasons: ['overdue_owner_decision'],
    action: 'decide',
    screen: 'payments',
  },
  // A Not a Fit decision on a request with accepted work, an appointment or money received goes to the Owner for
  // cancellation and financial review instead of closing (OWN-DEC-100, HH-LEAD-08; TSK-0042).
  {
    id: 'cancellation_review',
    section: 'owner_decisions',
    subject: 'request',
    band: 'time_sensitive',
    view: 'work.cancel_with_financial_review',
    reasons: ['not_a_fit_with_obligations'],
    action: 'decide',
    screen: 'requests',
  },
  // TSK-0066 (HH-SCH-07): a customer's cancellation request of a work visit (accepted, scheduled work) routes to the
  // Owner for cancellation and financial review, beside the visit_change_request item; resolved with it.
  {
    id: 'visit_cancellation_review',
    section: 'owner_decisions',
    subject: 'visit',
    band: 'time_sensitive',
    view: 'work.cancel_with_financial_review',
    reasons: ['work_cancellation_requested'],
    action: 'decide',
    screen: 'schedule',
  },
  // TSK-0130 (HH-EST-16, OWN-DEC-173): an estimate version waiting for the Owner's approval before it is published
  // (over the threshold, the project's documents together over it, or flagged). One item per version while its
  // approval is pending; resolved when the Owner decides, when a change of price or scope invalidates it, or when the
  // Owner publishes it. The link opens the version, whose Owner approval panel shows the details and the decision.
  // Change-order approvals (TSK-0082) add their own type.
  {
    id: 'estimate_publication_approval',
    section: 'owner_decisions',
    subject: 'estimate_version',
    band: 'time_sensitive',
    view: 'estimate.approve_publication',
    reasons: [...PUBLICATION_APPROVAL_REASONS],
    action: 'decide',
    screen: 'estimates',
  },
  {
    id: 'incident_notification',
    section: 'owner_decisions',
    subject: 'case',
    band: 'time_sensitive',
    view: 'incident.view_restricted',
    reasons: ['damage_reported', 'injury_reported', 'dispute_reported'],
    action: 'decide',
    screen: 'cases',
  },
] as const satisfies readonly QueueItemType[]

export type QueueItemTypeId = (typeof QUEUE_ITEM_TYPES)[number]['id']

const BY_ID = new Map<string, QueueItemType>(QUEUE_ITEM_TYPES.map((t) => [t.id, t]))

export function queueItemType(id: string): QueueItemType | undefined {
  return BY_ID.get(id)
}

/** The deep link of an item: the record's screen in the staff app. */
export function deepLink(type: QueueItemType, subjectId: string): string {
  return `/${type.path ?? type.screen}/${encodeURIComponent(subjectId)}`
}

/** Sort rank of a band; an item past its due time ranks as time-sensitive (overdue) at the least. */
export function bandRank(band: QueueBand, dueAt: Date | null, now: Date): number {
  const rank = QUEUE_BANDS.indexOf(band) + 1
  const overdue = QUEUE_BANDS.indexOf('time_sensitive') + 1
  return dueAt !== null && dueAt.getTime() <= now.getTime() ? Math.min(rank, overdue) : rank
}
