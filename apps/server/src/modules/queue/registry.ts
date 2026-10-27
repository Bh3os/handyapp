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
import { PUBLICATION_APPROVAL_REASONS, VISIT_OUTCOME_KINDS } from '@handyhub/domain'
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
  // TSK-0077: review a worker's issue report (resolved on site, or waiting for the Owner's next step).
  'review_issue',
  // TSK-0084: review a job's quality (start, decide, re-check) or work its punch items.
  'review_quality',
  'review_punch_items',
  // TSK-0078: follow up a recorded visit outcome (reschedule, cancel or contact the customer).
  'follow_up_visit',
  // TSK-0080: review a field event a phone uploaded that was not applied (a conflict, an assignment, a recovery).
  'review_field_event',
  // TSK-0088: deposit or clear a check still pending.
  'clear_check',
  // TSK-0090: match or resolve unmatched or uncertain money.
  'reconcile',
  // TSK-0151: restore or decline each earlier grant of a reactivated account.
  'review_permissions',
  // TSK-0149: help a customer who cannot sign in or get a new project link, after verifying their identity.
  'help_access',
  // TSK-0092: close a job once nothing is left open (or see what still is).
  'close_job',
  // TSK-0155: review a worker's proposed reply (ask for clarification, reject, or write and send the English reply).
  'review_proposal',
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
  // TSK-0151: a staff member's record on the Staff screen.
  | 'staff'
  // TSK-0149: the access help requests sit below the privacy requests (the Owner's customer-account work).
  | 'privacy'

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
  // TSK-0077 (HH-WORK-09, T48): a Stop Work / Report Hazard writes its critical safety hold and this top-priority item
  // in the same transaction, one per hold; resolved when the Owner releases the hold with evidence or cancels it as
  // entered in error (0074). The reason never names what was reported (an injury is restricted, OWN-DEC-143). Seen by
  // the roles that may stop work (the assigned workers of the job, Office, the Estimator, the Owner); the link opens
  // the hold on its job's review page.
  {
    id: 'safety_hold',
    section: 'queue',
    subject: 'hold',
    band: 'safety',
    view: 'work.stop',
    reasons: ['safety_hold'],
    action: 'review_hold',
    screen: 'schedule',
    path: 'safety-holds',
  },
  // TSK-0077 (HH-WORK-08, OWN-DEC-80): a worker's issue report that is not critical notifies the Owner: one item per job
  // while any of its issue reports waits for the Owner's review (a resolution on site, or a problem waiting for the
  // Owner's next step), opened in the report's transaction and resolved with the last review. Seen by the Owner
  // (issue_report.review); band and view are PROPOSED (OQ-STOP-WORK-DETAILS).
  {
    id: 'field_issue',
    section: 'queue',
    subject: 'job',
    band: 'time_sensitive',
    view: 'issue_report.review',
    reasons: ['issue_reported', 'issue_resolved_on_site'],
    action: 'review_issue',
    screen: 'schedule',
    path: 'start-review',
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
  // opened with the answer or the expiry and resolved when a new offer is made or a window is selected. Decided as
  // built (OWN-DEC-192 B2, B6): the item, its time-sensitive band and its view (Estimators see it too). The action
  // and screen are PROPOSED.
  {
    id: 'window_offer_response',
    section: 'queue',
    subject: 'request',
    band: 'time_sensitive',
    view: 'visit.offer_windows',
    // TSK-0145 (OWN-DEC-194 B4): staff withdrew the offered windows (no withdrawal notice has approved wording yet).
    reasons: ['window_other_times_requested', 'window_offer_expired', 'window_offer_withdrawn'],
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
  // TSK-0155 (HH-COM-16, OWN-DEC-211): a worker's proposed customer reply waits for the Owner or Office, who are
  // notified by this item; one item per proposal while it waits for them: opened when the worker submits it (or
  // answers the reviewer's clarification question), resolved when the reviewer asks for clarification (the worker acts
  // next), rejects it or sends the English reply. The reason never quotes the worker's text. Seen by the roles that
  // review proposals; the link opens the proposal's review page. Band PROPOSED.
  {
    id: 'reply_proposal',
    section: 'queue',
    subject: 'reply_proposal',
    band: 'time_sensitive',
    view: 'message.review_proposal',
    reasons: ['reply_proposed', 'clarification_answered'],
    action: 'review_proposal',
    screen: 'inbox',
    path: 'reply-proposals',
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
    // TSK-0148 (OWN-DEC-208): a reminder whose deliveries all failed is staff follow-up, never customer non-response.
    reasons: [
      'question_reminder_first',
      'question_reminder_final',
      'no_response_close_available',
      'question_reminder_failed',
    ],
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
  // TSK-0088 (HH-FIN-12): a job's checks still pending (received, or deposited and waiting to clear), one item per job
  // until the last one clears. Seen by the Owner, who alone marks a check cleared (check.mark_cleared, OWN-DEC-138); the
  // link opens the job's payments. Band PROPOSED.
  {
    id: 'check_to_clear',
    section: 'queue',
    subject: 'job',
    band: 'time_sensitive',
    view: 'check.mark_cleared',
    reasons: ['check_received', 'check_deposited'],
    action: 'clear_check',
    screen: 'payments',
  },
  // TSK-0090 (HH-FIN-15, T61): money staff cannot match yet (an uncertain outcome, unmatched money, a mismatch, a
  // duplicate entry, a reference that does not match), one item per reported item until a person resolves it with
  // evidence. Seen by the Owner and Office (payment.reconcile); the link opens the item. Band PROPOSED.
  {
    id: 'reconciliation_item',
    section: 'queue',
    subject: 'reconciliation_item',
    band: 'time_sensitive',
    view: 'payment.reconcile',
    reasons: [
      'uncertain_outcome',
      'unmatched_payment',
      'amount_mismatch',
      'currency_mismatch',
      'duplicate_entry',
      'reference_mismatch',
    ],
    action: 'reconcile',
    screen: 'payments',
    path: 'reconciliation',
  },
  // TSK-0091 (OWN-DEC-210 "do not automatically restart ... allow staff to confirm the appropriate next reminder or
  // revised arrangement"): a payment suspended an invoice's reminders before the second one was sent and the balance
  // remains. One item per invoice until staff record the next step (a follow-up, a revised due date, a plan or a hold)
  // or the balance is gone. Seen by the Owner and Office (payment_reminder.release). Band PROPOSED.
  {
    id: 'invoice_reminder_review',
    section: 'queue',
    subject: 'invoice',
    band: 'other',
    view: 'payment_reminder.release',
    reasons: ['payment_recorded'],
    action: 'release_reminder',
    screen: 'payments',
    path: 'invoice-reminders',
  },
  // TSK-0092 (HH-QA-10, OWN-DEC-157, OWN-DEC-113): a job's prepared satisfaction check (48 hours after the Owner's
  // review passed) or review request waits for staff release; resolved when it is released or cancelled, and while a
  // case on the project holds it (offered again once every case is closed). Seen by the roles that release drafts; the
  // link opens the job's closeout page. Band PROPOSED.
  {
    id: 'follow_up_release',
    section: 'queue',
    subject: 'job',
    band: 'other',
    view: 'message.release_draft',
    reasons: ['satisfaction_check_ready', 'review_request_ready'],
    action: 'release_reminder',
    screen: 'schedule',
    path: 'closeout',
  },
  // TSK-0114 (HH-SCH-10, OWN-DEC-113): a repeat-service reminder of a project's customer-agreed schedule was prepared on
  // its date and may be released (one item per project while one may). A held draft (an open case) does not list it.
  // Seen by the roles that release drafts; the link opens the project's schedule. Band PROPOSED.
  {
    id: 'repeat_service_release',
    section: 'queue',
    subject: 'project',
    band: 'other',
    view: 'message.release_draft',
    reasons: ['repeat_reminder_ready'],
    action: 'release_reminder',
    screen: 'customers',
    path: 'repeat-service',
  },
  // TSK-0125 (HH-EST-15, OWN-DEC-165): a published estimate carries the requested discount although its verification
  // failed (not verified, or declined by the Owner): it cannot be approved, and the estimator writes the revised
  // estimate the customer approves. One item per request while such a version is published. Seen by the roles that
  // revise estimates; the link opens the request, whose discount panel and estimates show it. Band PROPOSED.
  {
    id: 'discount_revision',
    section: 'queue',
    subject: 'request',
    band: 'other',
    view: 'estimate.revise',
    reasons: ['discount_not_verified'],
    action: 'review_estimate',
    screen: 'requests',
  },
  // TSK-0149 (OWN-DEC-198 F4, F5): a visitor asked for help signing in or getting a new project link (the secure
  // alternative when texts are not available or the reissue limits are reached), one item per help request until the
  // Owner closes it. The reason is what was asked, never whether anything matched. Seen by the Owner
  // (customer_account.assist_recovery); the link opens the request. Band PROPOSED.
  {
    id: 'access_help_request',
    section: 'queue',
    subject: 'access_help_request',
    band: 'time_sensitive',
    view: 'customer_account.assist_recovery',
    reasons: ['sign_in', 'project_link'],
    action: 'help_access',
    screen: 'privacy',
    path: 'access-help',
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
  // TSK-0078 (HH-SCH-09): a worker's recorded visit outcome (delay, no access, customer absent, weather, missing
  // resources, readiness issue), one item per outcome, opened in the outcome's transaction and resolved by the staff
  // follow-up. On the visit's own date it is in the today_change band; assigned to the request's responsible staff
  // member when there is one. Seen by those who reschedule visits (visit.reschedule: Owner, Office), PROPOSED.
  {
    id: 'visit_outcome',
    section: 'queue',
    subject: 'visit_outcome',
    band: 'time_sensitive',
    view: 'visit.reschedule',
    reasons: [...VISIT_OUTCOME_KINDS],
    action: 'follow_up_visit',
    screen: 'schedule',
    path: 'visit-outcomes',
  },
  // TSK-0080 (HH-OFF-06, T27, T51): a field event a phone uploaded that the server did not apply: it conflicts with the
  // server's newer state, its worker is not (or was not) assigned to the visit, or the Owner uploaded it from another
  // account's phone. One item per event, opened when it is received and resolved by the Owner's review. Seen by the
  // Owner (visit.correct_timestamps: the one who corrects the timestamps an event could not record), PROPOSED.
  {
    id: 'field_event_review',
    section: 'queue',
    subject: 'field_event',
    band: 'time_sensitive',
    view: 'visit.correct_timestamps',
    reasons: ['sync_conflict', 'sync_not_assigned', 'sync_recovered'],
    action: 'review_field_event',
    screen: 'schedule',
    path: 'field-events',
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
  // TSK-0084 (HH-QA-04): a job's punch items not yet re-checked, one item per job, due on the earliest due date and
  // assigned to that item's worker; opened and resolved with the items (open, then corrected and waiting for the
  // re-check). Seen by the Owner (quality.manage_punch_items); the link opens the job's quality review. Band PROPOSED.
  {
    id: 'punch_items',
    section: 'queue',
    subject: 'job',
    band: 'other',
    view: 'quality.manage_punch_items',
    reasons: ['punch_items_open', 'punch_items_corrected'],
    action: 'review_punch_items',
    screen: 'schedule',
    path: 'quality-reviews',
  },
  // Owner Decisions (HH-OPS-01 "Owner, additionally"): each decision is owner-only in the matrix.
  // TSK-0151 (OWN-DEC-200 H1, H3): a reactivated account holds no grant until the Owner restores or declines each
  // earlier one; one item per account while its permission review is open, opened with the re-enabling and resolved
  // when the review closes (reviewed, or the account disabled again). Seen by the Owner (staff.grant_role); the link
  // opens the person on the Staff screen. Band PROPOSED.
  {
    id: 'permission_review',
    section: 'owner_decisions',
    subject: 'staff_user',
    band: 'time_sensitive',
    view: 'staff.grant_role',
    reasons: ['account_reenabled'],
    action: 'review_permissions',
    screen: 'staff',
  },
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
  // TSK-0084 (HH-QA-02, OWN-DEC-64): a job awaiting the Owner's quality review, and again once every punch item is
  // corrected and waits for its re-check. One item per job; resolved when the review passes or asks for punch work.
  // Seen by the Owner (quality.review); the link opens the review. Band PROPOSED.
  {
    id: 'quality_review',
    section: 'owner_decisions',
    subject: 'job',
    band: 'other',
    view: 'quality.review',
    reasons: ['awaiting_quality_review', 'recheck_due'],
    action: 'review_quality',
    screen: 'schedule',
    path: 'quality-reviews',
  },
  // TSK-0092 (HH-QA-09): a job operationally complete (or reopened) waits for the Owner's close; the screen names what is
  // still open (the closeout obligations). Resolved when it closes. Seen by the Owner (job.close). Band PROPOSED.
  {
    id: 'job_closeout',
    section: 'owner_decisions',
    subject: 'job',
    band: 'other',
    view: 'job.close',
    reasons: ['closeout_pending', 'job_reopened'],
    action: 'close_job',
    screen: 'schedule',
    path: 'closeout',
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
  // TSK-0089 (HH-FIN-13): a job whose payment has a dispute opened and not yet won or lost routes to the Owner, who
  // alone records the outcome (payment.correct). One item per job while any dispute is open. Band PROPOSED.
  {
    id: 'payment_dispute',
    section: 'owner_decisions',
    subject: 'job',
    band: 'time_sensitive',
    view: 'payment.correct',
    reasons: ['payment_disputed'],
    action: 'decide',
    screen: 'payments',
  },
  // TSK-0089 (HH-FIN-14): refunds, credits and write-offs Office requested, waiting for the Owner's decision. One item
  // per job while any request is open; the reason is the oldest one's type. Band PROPOSED.
  {
    id: 'refund_request',
    section: 'owner_decisions',
    subject: 'job',
    band: 'other',
    view: 'payment.refund',
    reasons: ['refund_requested', 'credit_requested', 'write_off_requested'],
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
  // TSK-0136 (HH-PRIV-07, OWN-DEC-175 "Display pending privacy requests, deadlines, and overdue alerts"): one item per
  // open privacy request, opened in the submission's transaction and resolved by the Owner's decision. Its due time is
  // the request's next deadline (the end of that date in the business zone: the substantive acknowledgment, then the
  // internal target or the legal deadline); its reason says which date is due or overdue, kept in line by a job at
  // each deadline. Never closes the request. Seen by the Owner (privacy.decide). Band PROPOSED.
  {
    id: 'privacy_request',
    section: 'owner_decisions',
    subject: 'privacy_request',
    band: 'time_sensitive',
    view: 'privacy.decide',
    reasons: [
      'privacy_acknowledgment_due',
      'privacy_acknowledgment_overdue',
      'privacy_completion_due',
      'privacy_completion_overdue',
      'privacy_legal_deadline_overdue',
      'privacy_dates_not_configured',
    ],
    action: 'decide',
    screen: 'privacy',
  },
  // TSK-0091 (OWN-DEC-112, OWN-DEC-210, HH-FIN-19): the second automatic reminder was actually sent and the balance
  // remains. One item per invoice until the Owner decides, an arrangement is recorded or the balance is gone; the link
  // opens the invoice's reminders.
  {
    id: 'invoice_overdue_decision',
    section: 'owner_decisions',
    subject: 'invoice',
    band: 'time_sensitive',
    view: 'invoice.decide_overdue',
    reasons: ['overdue_owner_decision'],
    action: 'decide',
    screen: 'payments',
    path: 'invoice-reminders',
  },
  // TSK-0125 (HH-EST-15, OWN-DEC-165): a requested discount the standard process cannot verify (for example no proof
  // available) waits for the Owner's review, one item per request until the Owner approves or declines it. The reason
  // names nothing about the customer's documents. Seen by the Owner (discount.decide). Band PROPOSED.
  {
    id: 'discount_owner_review',
    section: 'owner_decisions',
    subject: 'request',
    band: 'other',
    view: 'discount.decide',
    reasons: ['discount_owner_review'],
    action: 'decide',
    screen: 'requests',
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
  // TSK-0140 (OWN-DEC-163 7): an estimate visit booked for a customer with repeated short-notice cancellations or
  // no-shows (cancellation.repeat_review), for the Owner's review: never a charge or a block. Resolved when the visit
  // is no longer booked (migration 0115). View and band PROPOSED.
  {
    id: 'cancellation_pattern_review',
    section: 'owner_decisions',
    subject: 'visit',
    band: 'other',
    view: 'work.cancel_with_financial_review',
    reasons: ['repeat_short_notice_cancellations'],
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
  // TSK-0082 (HH-CHG-02, OWN-DEC-173, OWN-DEC-204): a change-order version waiting for the Owner's approval before it
  // is issued to the customer. One item per version while its approval is pending; resolved like the estimate one.
  // The link opens the job's change orders through the version (/change-order-versions/<id>).
  {
    id: 'change_order_publication_approval',
    section: 'owner_decisions',
    subject: 'change_order_version',
    band: 'time_sensitive',
    view: 'estimate.approve_publication',
    reasons: [...PUBLICATION_APPROVAL_REASONS],
    action: 'decide',
    screen: 'schedule',
    path: 'change-order-versions',
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
