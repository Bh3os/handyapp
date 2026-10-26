// Return work and resuming after an incident (TSK-0094; HH-QA-07, HH-QA-08, HH-INC-03, HH-FIN-17, T54, T56,
// ENT-Case, ENT-Visit, ENT-Job, FACT-WARRANTY, OWN-DEC-124, OWN-DEC-135, OWN-DEC-38, RULE-HUMAN-REVIEW,
// RULE-NO-INVENTED-FACTS, RULE-MONEY-CENTS, RULE-SAFETY-GATES).
// - Return work is classified by people into one of HH-QA-07's seven classes. The one rule the software applies is the
//   decided one: a workmanship problem reported within 90 days of the reviewed completion date is a warranty claim
//   (FACT-WARRANTY, OWN-DEC-135), so a workmanship class is recorded as `warranty_claim` inside the window and as
//   `workmanship_callback` after it. Whether a claim is covered, and whether the work is charged, are the Owner's
//   decisions; nothing here applies coverage, an exclusion or a price (RULE-HUMAN-REVIEW, RULE-NO-INVENTED-FACTS).
// - The work itself is a linked return visit (purpose `return_work`) or a linked job, never the original job reopened:
//   a return visit starts through the same Start Work gate, but its start moves neither the job nor its work packages
//   (HH-QA-08), and its punch items, costs and time are recorded apart from the original job's.
// - Resuming after an incident: the job paused by Stop Work / Report Hazard resumes only through the Start Work gate
//   again, per worker, after the hold is released through its own path (HH-INC-03, OWN-DEC-38).
// PROPOSED (OQ-RETURN-WORK-DETAILS): the decision values, the cost kinds, the job states a return visit may start in,
// the inclusive last day of the window, and what a resumption checks again.
import { addLocalDays, isLocalDate } from './local-time.js'

/** HH-QA-07's classes of return work. */
export const RETURN_WORK_CLASSES = [
  'open_punch',
  'workmanship_callback',
  'warranty_claim',
  'new_scope',
  'customer_change_or_damage',
  'product_issue',
  'unresolved',
] as const
export type ReturnWorkClass = (typeof RETURN_WORK_CLASSES)[number]

/** The two classes of a workmanship problem: which one applies follows from the warranty window. */
export const WORKMANSHIP_CLASSES = [
  'workmanship_callback',
  'warranty_claim',
] as const satisfies readonly ReturnWorkClass[]

/** FACT-WARRANTY: 90 days of workmanship warranty from the reviewed completion date (OWN-DEC-135). */
export const WARRANTY_DAYS = 90

export type WarrantyWindow = {
  /** The local date the Owner's quality review passed (null: not reviewed and passed yet). */
  readonly reviewedCompletionOn: string | null
  /** The last local date inside the window (PROPOSED: the 90th day after the reviewed completion date, inclusive). */
  readonly lastDayOn: string | null
  /** The local date the problem was reported. */
  readonly reportedOn: string
  /** Reported inside the window; null when there is no reviewed completion date. */
  readonly within: boolean | null
}

/** The warranty window of a report: local dates in the business zone, never a 24-hour count. */
export function warrantyWindow(reviewedCompletionOn: string | null, reportedOn: string): WarrantyWindow {
  if (!isLocalDate(reportedOn)) throw new Error(`reportedOn is not a local date: ${reportedOn}`)
  if (reviewedCompletionOn === null) return { reviewedCompletionOn: null, lastDayOn: null, reportedOn, within: null }
  const lastDayOn = addLocalDays(reviewedCompletionOn, WARRANTY_DAYS)
  return {
    reviewedCompletionOn,
    lastDayOn,
    reportedOn,
    within: reportedOn >= reviewedCompletionOn && reportedOn <= lastDayOn,
  }
}

export type ClassificationProblem =
  /** A workmanship problem on a job whose quality review has not passed: it is an open punch item of that review. */
  | 'REVIEW_NOT_PASSED'
  /** Open punch work exists only while the job's quality review has not passed. */
  | 'REVIEW_ALREADY_PASSED'

/**
 * The class recorded for what staff chose. A workmanship class becomes `warranty_claim` inside the window and
 * `workmanship_callback` after it; every other class is recorded as chosen. Classifying never decides coverage.
 */
export function classifyReturnWork(
  chosen: ReturnWorkClass,
  facts: { readonly window: WarrantyWindow; readonly reviewPassed: boolean },
): { ok: true; classification: ReturnWorkClass } | { ok: false; code: ClassificationProblem } {
  if ((WORKMANSHIP_CLASSES as readonly string[]).includes(chosen)) {
    if (!facts.reviewPassed || facts.window.within === null) return { ok: false, code: 'REVIEW_NOT_PASSED' }
    return { ok: true, classification: facts.window.within ? 'warranty_claim' : 'workmanship_callback' }
  }
  if (chosen === 'open_punch' && facts.reviewPassed) return { ok: false, code: 'REVIEW_ALREADY_PASSED' }
  return { ok: true, classification: chosen }
}

/** The Owner's coverage decision (PROPOSED values); undecided until the Owner records one. */
export const COVERAGE_DECISIONS = ['covered', 'not_covered'] as const
export type CoverageDecision = (typeof COVERAGE_DECISIONS)[number]

/**
 * The Owner's price decision (PROPOSED values). `chargeable` records no amount: the work is priced through a new
 * estimate or a change order, never here (RULE-NO-INVENTED-FACTS, RULE-MONEY-CENTS).
 */
export const PRICE_DECISIONS = ['no_charge', 'chargeable'] as const
export type PriceDecision = (typeof PRICE_DECISIONS)[number]

/** Costs of return work, captured apart from the original job's (HH-FIN-17; PROPOSED kinds). Integer cents. */
export const RETURN_COST_KINDS = ['materials', 'purchase', 'rental', 'other'] as const
export type ReturnCostKind = (typeof RETURN_COST_KINDS)[number]
/** PROPOSED: the largest single return-work cost entry, in cents ($100,000.00). */
export const RETURN_COST_MAX_CENTS = 10_000_000

/**
 * The job states a return visit may start in (PROPOSED): after the worker's Finished (open punch work while the review
 * waits) and after the reviewed completion, closed included. Starting one never moves the job (HH-QA-08).
 */
export const RETURN_VISIT_JOB_STATES = ['ready_for_qa', 'operationally_complete', 'closed'] as const

// --- Resuming after an incident --------------------------------------------------------------------------------------

/**
 * Whether a worker must resume (rather than start) on a job: they started work on it before, and since the latest
 * pause by a hazard report they have not started or resumed again. A paused job has no current worker at all.
 */
export function resumeNeeded(facts: {
  readonly jobState: string
  readonly startedOnJob: boolean
  /** The latest pause by a hazard report (null: never paused). */
  readonly pausedAt: Date | null
  /** The worker's latest start or resumption on the job. */
  readonly lastActiveAt: Date | null
}): boolean {
  if (!facts.startedOnJob || facts.pausedAt === null) return false
  if (facts.jobState !== 'paused' && facts.jobState !== 'in_progress') return false
  return facts.lastActiveAt === null || facts.lastActiveAt.getTime() <= facts.pausedAt.getTime()
}
