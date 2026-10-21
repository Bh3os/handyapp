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
  'review_match',
  'link_message',
  'open_conversation',
] as const
export type QueueAction = (typeof QUEUE_ACTIONS)[number]

/** Staff app screens a deep link may open (packages/policy NAV_ITEMS ids). */
export type QueueScreen = 'requests' | 'schedule' | 'inbox' | 'cases' | 'payments' | 'customers'

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
    reasons: ['start_work_exception_requested'],
    action: 'decide',
    screen: 'schedule',
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
  return `/${type.screen}/${encodeURIComponent(subjectId)}`
}

/** Sort rank of a band; an item past its due time ranks as time-sensitive (overdue) at the least. */
export function bandRank(band: QueueBand, dueAt: Date | null, now: Date): number {
  const rank = QUEUE_BANDS.indexOf(band) + 1
  const overdue = QUEUE_BANDS.indexOf('time_sensitive') + 1
  return dueAt !== null && dueAt.getTime() <= now.getTime() ? Math.min(rank, overdue) : rank
}
