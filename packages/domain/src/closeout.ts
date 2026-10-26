// A job's closeout, the Owner's reopen and the follow-ups after completion (TSK-0092; HH-QA-09, HH-QA-10, HH-STATE-02,
// HH-DATA-05, OWN-DEC-77, OWN-DEC-157, OWN-DEC-113, OWN-DEC-124, ENT-Job). Pure: no database.
//
// The closeout dimension of a job (PROPOSED model; the earlier operational states belong to their own tasks):
//   operationally_complete -> closed    the Owner closes it once nothing is left open (every obligation below)
//   closed -> reopened                  the Owner reopens it to correct a mistake, with a fresh sign-in and a reason
//   reopened -> closed                  the Owner closes it again, on the same conditions
// Operational completion and the money are separate (HH-DATA-05): "paid" never closes a job and closing never marks
// anything paid. A refusal names every obligation still open (HH-STATE-02), so the Owner can resolve them all.
import { defineMachine, type Guard, type Problem } from './engine.js'
import { reasonGiven } from './guards.js'

export const CLOSEOUT_STATES = ['operationally_complete', 'closed', 'reopened'] as const
export type CloseoutState = (typeof CLOSEOUT_STATES)[number]

/**
 * What closing needs (HH-QA-09, HH-STATE-02), each an obligation a refusal names, in this order:
 * - quality: the Owner's review passed and every punch item passed its re-check; every work package complete;
 * - work: no visit still planned or under way; no issued change order waiting for the customer's decision;
 * - safety: no open hold on the project;
 * - money: the final invoice issued; its balance paid or explicitly tracked (a payment plan, a collection hold or the
 *   Owner's overdue decision, PROPOSED); no other invoice still open; no pending check, open payment dispute, refund,
 *   credit or write-off under review, or money not yet applied;
 * - cases: no open case on the project (a case closes only with its recorded resolution, OWN-DEC-124).
 */
export const CLOSEOUT_OBLIGATIONS = [
  'QUALITY_REVIEW_NOT_PASSED',
  'PUNCH_ITEMS_OPEN',
  'WORK_PACKAGES_OPEN',
  'VISITS_OPEN',
  'CHANGE_ORDERS_PENDING',
  'HOLDS_OPEN',
  'FINAL_INVOICE_NOT_ISSUED',
  'BALANCE_NOT_TRACKED',
  'INVOICES_OPEN',
  'PENDING_CHECKS',
  'PAYMENT_DISPUTE_OPEN',
  'ADJUSTMENT_UNDER_REVIEW',
  'UNALLOCATED_MONEY',
  'OPEN_CASES',
] as const
export type CloseoutObligation = (typeof CLOSEOUT_OBLIGATIONS)[number]

/** How the money stood when the job closed: the final invoice paid, or its balance explicitly tracked. */
export const FINANCIAL_BASES = ['paid', 'payment_plan', 'collection_hold', 'overdue_decided'] as const
export type FinancialBasis = (typeof FINANCIAL_BASES)[number]

/** The facts the server reads for closing, every one from its own records. */
export type CloseoutFacts = {
  readonly reviewPassed?: boolean
  readonly punchItemsNotRechecked?: number
  readonly workPackagesOpen?: number
  readonly visitsOpen?: number
  readonly changeOrdersPending?: number
  readonly holdsOpen?: number
  /** The final invoice is issued (not a draft, not voided without a reissue). */
  readonly finalInvoiceIssued?: boolean
  /** The financial basis the balance gives, or null while it is open and not tracked. */
  readonly financialBasis?: FinancialBasis | null
  readonly otherInvoicesOpen?: number
  readonly pendingChecks?: number
  readonly paymentDisputeOpen?: boolean
  readonly adjustmentsUnderReview?: number
  readonly unallocatedMoney?: boolean
  readonly openCases?: number
  /** A reopen: the Owner's written reason. */
  readonly reason?: string
}

type G = Guard<CloseoutFacts>

const MESSAGES: Record<CloseoutObligation, string> = {
  QUALITY_REVIEW_NOT_PASSED: "The Owner's quality review must pass first.",
  PUNCH_ITEMS_OPEN: 'Every punch item must pass its re-check.',
  WORK_PACKAGES_OPEN: 'Every work package must be complete.',
  VISITS_OPEN: 'No visit may still be planned or under way.',
  CHANGE_ORDERS_PENDING: "No change order may still wait for the customer's decision.",
  HOLDS_OPEN: 'Every hold on the project must be resolved.',
  FINAL_INVOICE_NOT_ISSUED: 'The final invoice must be issued.',
  BALANCE_NOT_TRACKED:
    'The balance must be paid, or tracked by a payment plan, a collection hold or the overdue decision.',
  INVOICES_OPEN: 'Every other invoice must be paid or voided.',
  PENDING_CHECKS: 'Every check must have cleared.',
  PAYMENT_DISPUTE_OPEN: 'No payment dispute may be open.',
  ADJUSTMENT_UNDER_REVIEW: 'No refund, credit or write-off may still be under review.',
  UNALLOCATED_MONEY: "Money not yet applied must have the Owner's credit or refund decision.",
  OPEN_CASES: 'Every case on the project must be resolved and closed.',
}
const problem = (code: CloseoutObligation): Problem => ({ code, message: MESSAGES[code] })
const missing = (name: string): Problem => ({ code: 'FACTS_MISSING', message: `The server must check: ${name}.` })
/** A count fact: missing is refused (never assumed zero); above zero is the obligation. */
const none =
  (name: keyof CloseoutFacts, code: CloseoutObligation): G =>
  (f) => {
    const v = f[name]
    if (v === undefined) return missing(name)
    return v === true || (typeof v === 'number' && v > 0) ? problem(code) : null
  }
const truthy =
  (name: keyof CloseoutFacts, code: CloseoutObligation): G =>
  (f) => {
    const v = f[name]
    if (v === undefined) return missing(name)
    return v === true ? null : problem(code)
  }
const tracked: G = (f) => {
  if (f.financialBasis === undefined) return missing('financialBasis')
  // An unissued final invoice is named by its own obligation.
  if (f.finalInvoiceIssued === false) return null
  return f.financialBasis === null ? problem('BALANCE_NOT_TRACKED') : null
}

const CLOSE_GUARDS: readonly G[] = [
  truthy('reviewPassed', 'QUALITY_REVIEW_NOT_PASSED'),
  none('punchItemsNotRechecked', 'PUNCH_ITEMS_OPEN'),
  none('workPackagesOpen', 'WORK_PACKAGES_OPEN'),
  none('visitsOpen', 'VISITS_OPEN'),
  none('changeOrdersPending', 'CHANGE_ORDERS_PENDING'),
  none('holdsOpen', 'HOLDS_OPEN'),
  truthy('finalInvoiceIssued', 'FINAL_INVOICE_NOT_ISSUED'),
  tracked,
  none('otherInvoicesOpen', 'INVOICES_OPEN'),
  none('pendingChecks', 'PENDING_CHECKS'),
  none('paymentDisputeOpen', 'PAYMENT_DISPUTE_OPEN'),
  none('adjustmentsUnderReview', 'ADJUSTMENT_UNDER_REVIEW'),
  none('unallocatedMoney', 'UNALLOCATED_MONEY'),
  none('openCases', 'OPEN_CASES'),
]

/** Every obligation still open, in the order of CLOSEOUT_OBLIGATIONS (empty: the job may close). */
export function closeoutObligations(f: CloseoutFacts, now: Date = new Date()): Problem[] {
  return CLOSE_GUARDS.map((g) => g(f, now)).filter((p): p is Problem => p !== null)
}

const reopenReason: G = (f) => reasonGiven(f.reason, 'The reason the job is reopened')

export const JOB_CLOSEOUT_MACHINE = defineMachine({
  entity: 'job',
  dimension: 'closeout',
  proposed: true,
  states: CLOSEOUT_STATES,
  initial: 'operationally_complete',
  final: [],
  transitions: [
    {
      event: 'close',
      from: ['operationally_complete', 'reopened'],
      to: 'closed',
      actors: ['staff'],
      guards: CLOSE_GUARDS,
      effects: ['queue.job_closeout_resolve'],
    },
    {
      event: 'reopen',
      from: ['closed'],
      to: 'reopened',
      actors: ['staff'],
      guards: [reopenReason],
      effects: ['follow_up.suppress', 'queue.job_closeout_open'],
    },
  ],
})
export type JobCloseoutEvent = (typeof JOB_CLOSEOUT_MACHINE.transitions)[number]['event']

// ------------------------------------------------------------------------------------------------ the follow-ups

/** The customer's answer to the service-quality follow-up, as staff record it (PROPOSED scale). */
export const SATISFACTION_ANSWERS = ['positive', 'mixed', 'negative'] as const
export type SatisfactionAnswer = (typeof SATISFACTION_ANSWERS)[number]

/**
 * Why a follow-up (the satisfaction check or a review request) is not prepared or not released now. `case_active`
 * pauses it (the draft is kept and reconsidered once every case is closed, OWN-DEC-113); the others stop it.
 */
export const FOLLOW_UP_BLOCKS = [
  'job_not_complete',
  'job_reopened',
  'case_active',
  'follow_ups_opted_out',
  'no_marketing_consent',
  'no_email_address',
  'already_prepared',
  'template_not_configured',
] as const
export type FollowUpBlock = (typeof FOLLOW_UP_BLOCKS)[number]

/**
 * The facts of a follow-up's eligibility. There is deliberately no satisfaction answer here: the same eligibility
 * applies whatever the customer answered (OWN-DEC-113, HH-QA-10: no positive-review filtering).
 */
export type FollowUpFacts = {
  /** The job's operational state. */
  readonly jobState: string
  /** The job was ever reopened (OWN-DEC-157 item 6: suppressed for good, PROPOSED). */
  readonly everReopened: boolean
  readonly activeCases: number
  /** The customer asked for no optional follow-ups on the channel (service communication withdrawn). */
  readonly optedOut: boolean
  /** A review request: the customer's current marketing permission on the channel. */
  readonly marketingConsent?: boolean
  readonly hasEmail: boolean
}

/** Why a follow-up of this kind may not go now (null: it may). Checked in this order; the first reason is given. */
export function followUpBlock(kind: 'satisfaction' | 'review', f: FollowUpFacts): FollowUpBlock | null {
  if (f.everReopened || f.jobState === 'reopened') return 'job_reopened'
  if (f.jobState !== 'operationally_complete' && f.jobState !== 'closed') return 'job_not_complete'
  if (!f.hasEmail) return 'no_email_address'
  if (f.optedOut) return 'follow_ups_opted_out'
  if (kind === 'review' && f.marketingConsent !== true) return 'no_marketing_consent'
  if (f.activeCases > 0) return 'case_active'
  return null
}

/** When the satisfaction check is prepared: `days` whole days (24 hours each) after the review passed (OWN-DEC-157). */
export function followUpDueAt(passedAt: Date, days: number): Date {
  return new Date(passedAt.getTime() + days * 24 * 3_600_000)
}
