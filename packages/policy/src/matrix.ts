// The permission matrix as policy data (ROLE-MATRIX; RULE-SERVER-AUTHZ). One row per matrix row, in the matrix's
// order, with every cell's text copied verbatim from the graph node so a test can prove the two never drift apart.
// Each cell also carries its machine rules: which of the row's actions it allows, the record scope, and the extra
// requirements its text names. A cell with no rule for an action denies it (deny by default).
//
// Legend (ROLE-MATRIX): Y allowed; A assigned jobs only, inside the access window; V own verified project only;
// F fresh sign-in plus a written reason; P PROPOSED cell (not owner-decided); — refused.
import type { Capability, MatrixRole } from './roles.js'
import { MATRIX_ROLES } from './roles.js'

/** Every action the policy decides. A matrix row names one or more of them; each belongs to exactly one row. */
export const ACTIONS = [
  // Intake, customers and records
  'request.submit',
  'request.view',
  'request.ask_question',
  'request.choose_estimate_approach',
  'request.not_a_fit',
  'request.assign',
  // PROPOSED (TSK-0042): recording the qualification and internal notes are part of handling a request, so they sit
  // in the handling row with the same cells.
  'request.qualify',
  'request.add_note',
  // PROPOSED (TSK-0043): recording a completed customer conversation (a logged call with its outcome) is part of
  // handling a request, in the same row.
  'request.record_conversation',
  // PROPOSED (TSK-0051): closing an unbooked request "Closed—no response" (OWN-DEC-101) is part of handling it, in the
  // same row.
  'request.close_no_response',
  'request.reply',
  'customer.view',
  'customer.edit',
  'customer.merge',
  'customer.relink',
  'request.correct_link',
  'customer.reverse_link_change',
  'access_code.set',
  'access_code.reveal',
  'customer.view_duplicates',
  // Estimates and approvals
  'estimate.draft',
  'estimate.publish',
  'estimate.change_publishers',
  'estimate.revise',
  'estimate.withdraw',
  'estimate.expire',
  'estimate.record_decline',
  'estimate.view_internal_cost',
  'estimate.approve',
  'estimate.decline',
  'estimate.request_changes',
  'change_order.draft',
  'change_order.publish',
  'change_order.approve',
  'change_order.capture_in_person_approval',
  // Scheduling
  'schedule.view_board',
  'schedule.view_my_day',
  'visit.offer_windows',
  'visit.confirm',
  'visit.reschedule',
  'visit.reassign',
  'visit.cancel',
  'visit.select_window',
  'visit.request_reschedule',
  'visit.request_cancellation',
  'work.cancel_with_financial_review',
  'staff.set_availability',
  'visit.tap_on_my_way',
  'visit.tap_arrived',
  'visit.tap_finished',
  // Field work and safety
  'job.view_packet',
  'work.start',
  'work.pause',
  'work.resume',
  'work.stop',
  'hazard.report',
  'work.request_exception',
  'work.approve_exception',
  'work.override_gate',
  'hold.override_critical',
  'hold.release_critical',
  'job_hold.set',
  'job_hold.set_ready',
  'job.record_checklist_step',
  'job.add_photo',
  'job.add_note',
  'job.record_walkthrough',
  'job.report_issue',
  'visit.correct_timestamps',
  'quality.review',
  'quality.manage_punch_items',
  'quality.self_review',
  'quality.correct_punch_item',
  'job.reopen',
  // Finance
  'invoice.issue',
  'invoice.enter_payment_link',
  'payment.record',
  'check.mark_cleared',
  'check.mark_returned',
  'payment.reconcile',
  'deposit.waive',
  'payment.refund',
  'payment.credit',
  'payment.write_off',
  'invoice.void',
  'payment.correct',
  'finance_adjustment.request',
  'cancellation_outcome.apply',
  'cancellation_outcome.request',
  'payment_reminder.release',
  'invoice.decide_overdue',
  'business_details.edit',
  'payment.view',
  'export.accounting',
  'dashboard.view',
  'dashboard.export_csv',
  // Messages, content and configuration
  'message.reply',
  'message.release_draft',
  'message.link',
  'message.view_unmatched',
  'media.share_with_customer',
  'media.mark_marketing_eligible',
  'care_instructions.approve',
  'service_content.approve',
  'estimate_terms.approve',
  'sop.sign_off_review',
  'policy_values.change',
  // Staff, audit, cases and privacy
  'staff.invite',
  'staff.grant_role',
  'staff.disable',
  'staff.revoke_sessions',
  'staff.start_password_recovery',
  'audit.view',
  'incident.report',
  'case.record_complaint',
  'incident.view_restricted',
  'case.refer_professional',
  'case.close',
  'privacy.request_export',
  'privacy.request_correction',
  'privacy.request_deletion',
  'privacy.decide',
  'records.delete',
  'account.delete',
  'export.bulk',
  'audit.edit',
  'audit.delete',
] as const
export type Action = (typeof ACTIONS)[number]

/**
 * Record scope of a rule:
 * - `any`: no record scope (the role's own function, or creating a new record);
 * - `assigned`: the actor has an active assignment on the record's job inside its access window (A);
 * - `own_staff`: the record belongs to the acting staff user (their estimate, thread, audit actions, incident report);
 * - `customer_project`: the record's project is one the customer is verified for, through an active grant (V).
 */
export type Scope = 'any' | 'assigned' | 'own_staff' | 'customer_project'

/** Extra requirements a cell's text names; each is checked on the server with facts the caller supplies. */
export type Condition =
  /** Estimator publishing: the Owner's publishing policy currently grants the role (OWN-DEC-118). */
  | 'publishing_policy'
  /** Never releases a critical safety hold they raised (OWN-DEC-38). */
  | 'not_raised_by_actor'
  /** The person who collected a payment never marks it cleared or reconciles it (HH-FIN-03, PROPOSED). */
  | 'not_self_collected'
  /** A worker records only their own on-site collection. */
  | 'own_collection'
  /** Access codes: revealed only on the visit date (T28). */
  | 'visit_date'
  /** Online only: never from offline use (T28, T46). */
  | 'online'
  /** Fresh contact verification before approvals and contact changes (HH-ID-07). */
  | 'customer_fresh_verification'
  /** Nobody grants themselves a role or capability (ENT-RoleGrant). */
  | 'not_self_subject'

export type Rule = {
  readonly scope: Scope
  /** F: fresh sign-in (password re-entry, or TOTP when enrolled). */
  readonly fresh?: true
  /** A written reason is required. */
  readonly reason?: true
  readonly capability?: Capability
  readonly conditions?: readonly Condition[]
  /** Field or view limitation the projection must apply (for example only site facts). */
  readonly limit?: string
  /** A server gate the action must still pass after authorization (for example the Start Work gate). */
  readonly gate?: string
  /** Always written to the audit log. */
  readonly audit?: true
  /** The cell is PROPOSED, not owner-decided. */
  readonly proposed?: true
}

export type Cell = { readonly text: string; readonly rules: Readonly<Partial<Record<Action, Rule>>> }

/** Why a whole row is refused to everyone, when it is a protection rather than a missing grant. */
export type RowDenyReason = 'SAFETY_GATE_NOT_OVERRIDABLE' | 'AUDIT_APPEND_ONLY'

export type MatrixRow = {
  readonly section: string
  /** The row's action text, verbatim from the matrix. */
  readonly label: string
  readonly actions: readonly Action[]
  readonly cells: Readonly<Record<MatrixRole, Cell>>
  readonly denyReason?: RowDenyReason
  /** A row that modifies other rows instead of naming actions; `modifies` lists the actions it constrains. */
  readonly modifies?: readonly Action[]
}

type CellSpec = (actions: readonly Action[]) => Cell
type RuleExtra = Omit<Rule, 'scope'>

const P = { proposed: true } as const
const F = { fresh: true, reason: true } as const

/** A refused cell. */
const no =
  (text = '—'): CellSpec =>
  () => ({ text, rules: {} })
/** The same rule for every action of the row. */
const every =
  (text: string, scope: Scope, extra: RuleExtra = {}): CellSpec =>
  (actions) => ({ text, rules: Object.fromEntries(actions.map((a) => [a, { scope, ...extra }])) })
/** Only the listed actions of the row. */
const only =
  (text: string, rules: Partial<Record<Action, Rule>>): CellSpec =>
  () => ({ text, rules })

const Y = (text = 'Y', extra: RuleExtra = {}) => every(text, 'any', extra)
const A = (text = 'A', extra: RuleExtra = {}) => every(text, 'assigned', extra)
const V = (text = 'V', extra: RuleExtra = {}) => every(text, 'customer_project', extra)

function row(
  section: string,
  label: string,
  actions: readonly Action[],
  cells: Partial<Record<MatrixRole, CellSpec>>,
  extra: Pick<MatrixRow, 'denyReason' | 'modifies'> = {},
): MatrixRow {
  const built = Object.fromEntries(MATRIX_ROLES.map((r) => [r, (cells[r] ?? no())(actions)])) as Record<
    MatrixRole,
    Cell
  >
  return { section, label, actions, cells: built, ...extra }
}

const INTAKE = 'Intake, customers and records'
const ESTIMATES = 'Estimates and approvals'
const SCHEDULING = 'Scheduling'
const FIELD = 'Field work and safety'
const FINANCE = 'Finance'
const MESSAGES = 'Messages, content and configuration'
const STAFF = 'Staff, audit, cases and privacy'

const FRESH_CUSTOMER = { conditions: ['customer_fresh_verification'] } as const satisfies RuleExtra
const NOT_SELF_COLLECTED = ['not_self_collected'] as const satisfies readonly Condition[]

export const MATRIX: readonly MatrixRow[] = [
  // Intake, customers and records
  row(INTAKE, 'Submit a request', ['request.submit'], {
    owner: Y(),
    office: Y('Y (manual lead)', { limit: 'manual_lead' }),
    estimator: Y('Y (manual lead)', { limit: 'manual_lead' }),
    customer: Y(),
    guest: Y(),
  }),
  row(INTAKE, 'View intake queue and original requests', ['request.view'], {
    owner: Y(),
    office: Y(),
    estimator: Y('Y (P)', P),
    customer: V('V (own)'),
  }),
  row(
    INTAKE,
    'Ask a question, choose online or site visit, Not a Fit, assign responsible person',
    [
      'request.ask_question',
      'request.choose_estimate_approach',
      'request.not_a_fit',
      'request.assign',
      'request.qualify',
      'request.add_note',
      'request.record_conversation',
      'request.close_no_response',
    ],
    { owner: Y(), office: Y(), estimator: Y('Y (P)', P) },
  ),
  row(INTAKE, 'Reply to a question', ['request.reply'], { customer: V() }),
  row(INTAKE, 'View customer and property records', ['customer.view'], {
    owner: Y(),
    office: Y(),
    estimator: Y('Y estimating scope (P)', { limit: 'estimating_scope', ...P }),
    worker: A('A site facts only', { limit: 'site_facts' }),
    customer: V('V own'),
  }),
  row(INTAKE, 'Edit contact or property details', ['customer.edit'], {
    owner: Y(),
    office: Y('Y (reason)', { reason: true }),
    worker: no('— (site observations only)'),
    customer: V('V own (re-verify)', FRESH_CUSTOMER),
  }),
  row(
    INTAKE,
    'Merge or relink customers, correct a request link',
    ['customer.merge', 'customer.relink', 'request.correct_link'],
    { owner: Y(), office: Y('Y (reason, preview)', { reason: true, limit: 'preview_first' }) },
  ),
  row(INTAKE, 'Reverse a record-link change', ['customer.reverse_link_change'], { owner: Y() }),
  row(INTAKE, 'Enter or remove an access code', ['access_code.set'], {
    owner: Y(),
    office: Y(),
    customer: V('V own'),
  }),
  row(INTAKE, 'Reveal an access code', ['access_code.reveal'], {
    owner: Y('Y (audited)', { audit: true }),
    office: Y('Y (audited, P)', { audit: true, ...P }),
    worker: A('A on the visit date, online, audited', { audit: true, conditions: ['visit_date', 'online'] }),
  }),
  row(INTAKE, 'View duplicate suggestions', ['customer.view_duplicates'], {
    owner: Y(),
    office: Y(),
    estimator: Y('Y (P)', P),
  }),

  // Estimates and approvals
  row(ESTIMATES, 'Write or upload an estimate draft', ['estimate.draft'], { owner: Y(), estimator: Y() }),
  row(ESTIMATES, 'Publish an estimate version', ['estimate.publish'], {
    owner: Y(),
    estimator: Y('Y while the publishing policy grants it', { conditions: ['publishing_policy'] }),
  }),
  row(ESTIMATES, 'Change who may publish', ['estimate.change_publishers'], { owner: Y() }),
  row(
    ESTIMATES,
    'Revise (new version), withdraw, expire, record a decline',
    ['estimate.revise', 'estimate.withdraw', 'estimate.expire', 'estimate.record_decline'],
    {
      owner: Y(),
      office: only('Record decline only (P)', { 'estimate.record_decline': { scope: 'any', ...P } }),
      estimator: Y(),
    },
  ),
  row(ESTIMATES, 'View internal cost, markup and margin', ['estimate.view_internal_cost'], {
    owner: Y(),
    estimator: every('Own estimates (P)', 'own_staff', P),
  }),
  row(
    ESTIMATES,
    'Approve, decline or request changes',
    ['estimate.approve', 'estimate.decline', 'estimate.request_changes'],
    { customer: V('V (fresh verification)', FRESH_CUSTOMER) },
  ),
  row(ESTIMATES, 'Draft a change order', ['change_order.draft'], { owner: Y(), estimator: Y(), worker: A() }),
  row(ESTIMATES, 'Review and publish a change order', ['change_order.publish'], { owner: Y(), estimator: Y() }),
  row(ESTIMATES, 'Approve a change order', ['change_order.approve', 'change_order.capture_in_person_approval'], {
    worker: only('Captures in-person approval with customer identification, never approves', {
      'change_order.capture_in_person_approval': { scope: 'assigned', limit: 'customer_identification_required' },
    }),
    // HH-ID-07: approving a change order needs fresh contact verification, like an estimate approval.
    customer: only('V', { 'change_order.approve': { scope: 'customer_project', ...FRESH_CUSTOMER } }),
  }),

  // Scheduling
  row(SCHEDULING, 'View scheduling board', ['schedule.view_board', 'schedule.view_my_day'], {
    owner: Y(),
    office: Y(),
    estimator: only('View (P)', { 'schedule.view_board': { scope: 'any', ...P } }),
    worker: only('Own My Day only', { 'schedule.view_my_day': { scope: 'any', limit: 'own_assignments' } }),
  }),
  row(
    SCHEDULING,
    'Offer windows; confirm, reschedule, reassign, cancel visits',
    ['visit.offer_windows', 'visit.confirm', 'visit.reschedule', 'visit.reassign', 'visit.cancel'],
    {
      owner: Y(),
      office: Y(),
      estimator: only('Offer estimate-visit windows (P)', {
        'visit.offer_windows': { scope: 'any', limit: 'estimate_visits', ...P },
      }),
    },
  ),
  row(SCHEDULING, 'Select an offered window', ['visit.select_window'], { customer: V() }),
  row(SCHEDULING, 'Request reschedule or cancellation', ['visit.request_reschedule', 'visit.request_cancellation'], {
    customer: V(),
  }),
  row(SCHEDULING, 'Cancel accepted, scheduled or paid work (financial review)', ['work.cancel_with_financial_review'], {
    owner: Y(),
  }),
  row(SCHEDULING, 'Set working days, hours and time off', ['staff.set_availability'], { owner: Y() }),
  row(
    SCHEDULING,
    'Tap On my way, Arrived, Finished',
    ['visit.tap_on_my_way', 'visit.tap_arrived', 'visit.tap_finished'],
    { owner: A(), worker: A() },
  ),

  // Field work and safety
  row(FIELD, 'View job packet', ['job.view_packet'], {
    owner: Y(),
    office: Y(),
    estimator: Y('Estimating scope (P)', { limit: 'estimating_scope', ...P }),
    worker: A(),
  }),
  row(FIELD, 'Start, pause, resume work', ['work.start', 'work.pause', 'work.resume'], {
    owner: only('A, through the gate, never bypassed', startPauseResume()),
    worker: only('A, through the gate', startPauseResume()),
  }),
  row(FIELD, 'Stop Work, Report Hazard', ['work.stop', 'hazard.report'], {
    owner: Y(),
    office: Y(),
    estimator: Y(),
    worker: A('A, always, no permission needed'),
  }),
  row(FIELD, 'Request an administrative Start Work exception', ['work.request_exception'], { worker: A() }),
  row(FIELD, 'Approve an administrative exception', ['work.approve_exception'], { owner: Y() }),
  row(
    FIELD,
    'Override the gate or a critical hold',
    ['work.override_gate', 'hold.override_critical'],
    {},
    { denyReason: 'SAFETY_GATE_NOT_OVERRIDABLE' },
  ),
  row(FIELD, 'Release a critical safety hold (with evidence; never one they raised)', ['hold.release_critical'], {
    owner: Y('Y', { conditions: ['not_raised_by_actor'], limit: 'evidence_required', audit: true }),
  }),
  row(FIELD, 'Set the job-level Hold with a note', ['job_hold.set'], {
    owner: Y(),
    office: Y('Y (P)', P),
    estimator: Y('Y (P)', P),
  }),
  row(
    FIELD,
    'Set Ready on any job-level Hold / Ready note, with a note (including one they set)',
    ['job_hold.set_ready'],
    { owner: Y() },
  ),
  row(
    FIELD,
    'Checklist steps, photos, notes, walkthrough record, issue reports',
    ['job.record_checklist_step', 'job.add_photo', 'job.add_note', 'job.record_walkthrough', 'job.report_issue'],
    { owner: A(), worker: A() },
  ),
  row(FIELD, 'Correct Arrived/Finished timestamps', ['visit.correct_timestamps'], { owner: Y() }),
  row(
    FIELD,
    'Quality review, punch items, self-review',
    ['quality.review', 'quality.manage_punch_items', 'quality.self_review', 'quality.correct_punch_item'],
    {
      // The verifier is never the corrector (OWN-DEC-28): the Owner reviews; assigned workers correct.
      owner: only('Y', {
        'quality.review': { scope: 'any' },
        'quality.manage_punch_items': { scope: 'any' },
        'quality.self_review': { scope: 'any' },
      }),
      worker: only('Correct assigned punch items', { 'quality.correct_punch_item': { scope: 'assigned' } }),
    },
  ),
  row(FIELD, 'Reopen a closed job', ['job.reopen'], { owner: Y('F', F) }),

  // Finance
  row(FINANCE, "Issue an invoice (after the Owner's quality review)", ['invoice.issue'], {
    owner: Y('Y', { gate: 'quality_review_passed' }),
    office: Y('Y', { gate: 'quality_review_passed' }),
  }),
  row(FINANCE, 'Enter the Square payment link', ['invoice.enter_payment_link'], { owner: Y(), office: Y() }),
  row(FINANCE, 'Record a verified payment', ['payment.record'], {
    owner: Y(),
    office: Y(),
    worker: A('A, own on-site collection, with the collect capability (P mapping)', {
      capability: 'collect',
      conditions: ['own_collection'],
      ...P,
    }),
  }),
  row(FINANCE, 'Mark a check cleared', ['check.mark_cleared'], {
    owner: Y('Y', { conditions: NOT_SELF_COLLECTED }),
  }),
  row(FINANCE, 'Mark a check returned; reconcile', ['check.mark_returned', 'payment.reconcile'], {
    owner: only('Y', {
      'check.mark_returned': { scope: 'any' },
      'payment.reconcile': { scope: 'any', conditions: NOT_SELF_COLLECTED },
    }),
    office: only('Y (P)', {
      'check.mark_returned': { scope: 'any', ...P },
      'payment.reconcile': { scope: 'any', conditions: NOT_SELF_COLLECTED, ...P },
    }),
  }),
  row(
    FINANCE,
    '(any of the above for a payment they collected themselves)',
    [],
    { owner: no('— (P)'), office: no('— (P)') },
    // Applied as the `not_self_collected` condition: clearing and reconciling, as HH-FIN-03 words it (PROPOSED).
    { modifies: ['check.mark_cleared', 'payment.reconcile'] },
  ),
  row(FINANCE, 'Waive a required deposit', ['deposit.waive'], { owner: Y('F', F) }),
  row(
    FINANCE,
    'Refund, credit, write-off, void, payment correction',
    [
      'payment.refund',
      'payment.credit',
      'payment.write_off',
      'invoice.void',
      'payment.correct',
      'finance_adjustment.request',
    ],
    {
      owner: only('F', {
        'payment.refund': { scope: 'any', ...F },
        'payment.credit': { scope: 'any', ...F },
        'payment.write_off': { scope: 'any', ...F },
        'invoice.void': { scope: 'any', ...F },
        'payment.correct': { scope: 'any', ...F },
      }),
      office: only('Request only (P)', { 'finance_adjustment.request': { scope: 'any', ...P } }),
    },
  ),
  row(
    FINANCE,
    'Apply a cancellation outcome: deposit refund or the $50.00 late-cancellation amount ([[FACT-CANCELLATION-RULES]])',
    ['cancellation_outcome.apply', 'cancellation_outcome.request'],
    {
      owner: only('F', { 'cancellation_outcome.apply': { scope: 'any', ...F } }),
      office: only('Request only (P)', { 'cancellation_outcome.request': { scope: 'any', ...P } }),
    },
  ),
  row(FINANCE, 'Release payment reminders', ['payment_reminder.release'], { owner: Y(), office: Y() }),
  row(FINANCE, 'Decide "Overdue—owner decision"', ['invoice.decide_overdue'], { owner: Y() }),
  row(FINANCE, 'Business details and payment instructions', ['business_details.edit'], { owner: Y() }),
  row(FINANCE, 'View balances and payments', ['payment.view'], {
    owner: Y(),
    office: Y(),
    worker: A('A, balance on jobs with collect (P)', { capability: 'collect', limit: 'balance_only', ...P }),
    customer: V(),
  }),
  row(FINANCE, 'Accounting exports', ['export.accounting'], { owner: Y('F', F) }),
  row(FINANCE, 'Owner Dashboard and its CSV', ['dashboard.view', 'dashboard.export_csv'], { owner: Y() }),

  // Messages, content and configuration
  row(MESSAGES, 'Reply from a project, release drafts', ['message.reply', 'message.release_draft'], {
    owner: Y(),
    office: Y(),
    estimator: every('Own estimating threads (P)', 'own_staff', { limit: 'estimating_threads', ...P }),
    worker: A('Assigned operational thread (P)', { limit: 'operational_thread', ...P }),
    customer: only('V project thread', { 'message.reply': { scope: 'customer_project' } }),
  }),
  row(MESSAGES, 'Link a Needs Linking message; view unmatched messages', ['message.link', 'message.view_unmatched'], {
    owner: Y(),
    office: Y(),
  }),
  row(MESSAGES, 'Share photos or care notes with the customer', ['media.share_with_customer'], {
    owner: Y(),
    office: Y('Y (P)', P),
  }),
  row(MESSAGES, 'Mark media marketing-eligible (with recorded consent)', ['media.mark_marketing_eligible'], {
    owner: Y('Y', { gate: 'marketing_consent_recorded' }),
  }),
  row(
    MESSAGES,
    'Approve care instructions, service content, estimate terms, SOP review sign-off',
    ['care_instructions.approve', 'service_content.approve', 'estimate_terms.approve', 'sop.sign_off_review'],
    {
      owner: only('Y (care: F)', {
        'care_instructions.approve': { scope: 'any', ...F },
        'service_content.approve': { scope: 'any' },
        'estimate_terms.approve': { scope: 'any' },
        'sop.sign_off_review': { scope: 'any' },
      }),
    },
  ),
  row(MESSAGES, 'Change policy values', ['policy_values.change'], { owner: Y('F', F) }),

  // Staff, audit, cases and privacy
  row(STAFF, 'Invite staff, grant roles or capabilities', ['staff.invite', 'staff.grant_role'], {
    owner: Y('F', { ...F, conditions: ['not_self_subject'] }),
  }),
  row(
    STAFF,
    'Disable account, revoke sessions, start password recovery',
    ['staff.disable', 'staff.revoke_sessions', 'staff.start_password_recovery'],
    // Protective actions are never delayed: no fresh sign-in, no reason prompt.
    { owner: Y('Y (never delayed)', { audit: true }) },
  ),
  row(STAFF, 'View audit log', ['audit.view'], {
    owner: Y('All'),
    office: every('Own actions', 'own_staff'),
  }),
  row(STAFF, 'Report an incident', ['incident.report'], { owner: Y(), office: Y(), estimator: Y(), worker: A() }),
  row(STAFF, 'Record a complaint case', ['case.record_complaint'], {
    owner: Y(),
    office: Y(),
    // The customer raises a complaint by message (message.reply); staff record the case.
    customer: no('Raise via message'),
  }),
  row(STAFF, 'View restricted incident details (injury, damage, disputes)', ['incident.view_restricted'], {
    owner: Y('Y', { audit: true }),
    office: no('— (sees only that a case exists and its status)'),
    worker: every('Own report only', 'own_staff'),
    customer: no('— (acknowledgement, progress, next step)'),
  }),
  row(STAFF, 'Professional referral, case closure', ['case.refer_professional', 'case.close'], { owner: Y() }),
  row(
    STAFF,
    'Request export, correction or deletion',
    ['privacy.request_export', 'privacy.request_correction', 'privacy.request_deletion'],
    { customer: V() },
  ),
  row(
    STAFF,
    'Decide privacy requests; Delete action; delete a login account',
    ['privacy.decide', 'records.delete', 'account.delete'],
    { owner: Y('Y', { audit: true }) },
  ),
  row(STAFF, 'Bulk export', ['export.bulk'], { owner: Y('F', F) }),
  row(STAFF, 'Edit or delete audit events', ['audit.edit', 'audit.delete'], {}, { denyReason: 'AUDIT_APPEND_ONLY' }),
]

function startPauseResume(): Partial<Record<Action, Rule>> {
  // Start and resume pass the server's Start Work gate and need an online check (RULE-SAFETY-GATES, T46); pause is
  // never blocked by connectivity.
  return {
    'work.start': { scope: 'assigned', gate: 'start_work', conditions: ['online'] },
    'work.pause': { scope: 'assigned' },
    'work.resume': { scope: 'assigned', gate: 'start_work', conditions: ['online'] },
  }
}

const BY_ACTION = new Map<Action, MatrixRow>()
for (const r of MATRIX) for (const a of r.actions) BY_ACTION.set(a, r)

/** The matrix row that decides an action, or undefined for an unknown action. */
export function rowFor(action: string): MatrixRow | undefined {
  return BY_ACTION.get(action as Action)
}
