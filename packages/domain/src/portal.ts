// The customer's view of a project's progress (TSK-0038; HH-PORT-02, HH-PORT-03, HH-STATE-01, HH-PORT-07, OWN-DEC-98,
// OWN-DEC-100, OWN-DEC-101, OWN-DEC-105, OWN-DEC-106, OWN-DEC-108, T23, T48).
//
// The customer label is a projection of every state dimension of the project, never one state alone (project.ts):
// the request, the project and, as their tasks build them, the estimate, deposit, visit, job, hold, quality and
// invoice records. This function is pure: the server reads the records under the caller's scope and passes facts.
//
// It answers three things, kept apart so none hides another (HH-PORT-03, guide 23.1):
// - the situation, with the customer label of HH-PORT-03 (the portal holds the English words, by code);
// - who is waiting on whom (HH-PORT-02): HandyHub on the customer, the customer on HandyHub, or nobody (closed);
// - one next action the customer can take, or none while HandyHub has the next step.
// The payment summary is a separate field of the overview and never folded into the situation.
//
// Facts a later task owns are optional and absent until that task reads its records; an absent fact never claims
// anything (no estimate, appointment, hold or invoice is assumed).
import type { ProjectState } from './project.js'
import type { RequestState } from './request.js'

/** The operational situations of HH-PORT-03, in the order of its table. */
export const CUSTOMER_SITUATIONS = [
  'received',
  'more_information',
  'site_visit',
  'estimate_ready',
  'approved',
  'scheduled',
  'on_the_way',
  'work_in_progress',
  'safety_hold',
  'update_pending',
  'completion_review',
  'follow_up_work',
  'work_complete',
  'not_a_fit',
  'canceled',
  'closed_no_response',
] as const
export type CustomerSituation = (typeof CUSTOMER_SITUATIONS)[number]

/** The next actions of HH-PORT-02; `none` while HandyHub has the next step or nothing is left to do. */
export const CUSTOMER_NEXT_ACTIONS = [
  'reply',
  'choose_visit_window',
  'review_estimate',
  'pay_deposit',
  'choose_work_appointment',
  'review_visit',
  'review_change',
  'pay_invoice',
  'contact_support',
  'none',
] as const
export type CustomerNextAction = (typeof CUSTOMER_NEXT_ACTIONS)[number]

/** Who has the next step (HH-PORT-02): HandyHub waits on the customer, or the customer waits on HandyHub. */
export const WAITING_ON = ['customer', 'handyhub', 'nobody'] as const
export type WaitingOn = (typeof WAITING_ON)[number]

/**
 * The step after the label, when it depends on more than the situation (HH-PORT-03 "next step" column):
 * - `visit_windows_pending`: a site visit is needed and no windows are offered yet (HandyHub offers them, TSK-0063);
 * - `deposit_due` / `choose_work_appointment`: the two approval wordings of OWN-DEC-105 / HH-EST-12;
 * - `invoice_due`: the work is complete and an issued invoice has a balance.
 */
export const CUSTOMER_STEPS = [
  'review_details',
  'answer_questions',
  'visit_windows_pending',
  'choose_visit_window',
  'review_estimate',
  'deposit_due',
  'choose_work_appointment',
  'view_appointment',
  'arrival_update',
  'view_updates',
  'safety_review',
  'update_pending',
  'completion_review',
  'follow_up_work',
  'review_care_notes_and_invoice',
  'decision',
  'closed',
] as const
export type CustomerStep = (typeof CUSTOMER_STEPS)[number]

/**
 * What the customer timeline lists today (HH-PORT-03): the request they sent and the staff decisions published to
 * them. Later tasks add their own published events (estimate, visit, hold, completion, invoice).
 */
export const CUSTOMER_TIMELINE_KINDS = ['received', 'more_information', 'site_visit', 'not_a_fit'] as const
export type CustomerTimelineKind = (typeof CUSTOMER_TIMELINE_KINDS)[number]

export type PortalFacts = {
  readonly requestState: RequestState
  readonly projectState: ProjectState
  // The records below are read by the tasks that build them; until then they are absent.
  /** TSK-0063: estimate-visit windows are offered to the customer. */
  readonly visitWindowsOffered?: boolean
  /** TSK-0055: a current published estimate waits for the customer's decision. */
  readonly estimatePublished?: boolean
  /** TSK-0057: an estimate version was approved (the project is approved). */
  readonly estimateApproved?: boolean
  /** TSK-0059: the approved estimate needs a deposit that is not yet recorded (or waived). */
  readonly depositDue?: boolean
  /** TSK-0066 / TSK-0063: work windows are offered for the customer to choose. */
  readonly workWindowsOffered?: boolean
  /** TSK-0061 / TSK-0070: the current visit: confirmed, or an assigned worker recorded "On my way" (HH-PORT-07). */
  readonly visit?: 'confirmed' | 'on_the_way'
  /** TSK-0075: work has started on site. */
  readonly workInProgress?: boolean
  /** TSK-0074 / TSK-0077: a hold on the job; a safety hold shows only the neutral safety wording (T48). */
  readonly hold?: 'safety' | 'other'
  /** TSK-0083 / TSK-0084: quality review, punch items, or operationally complete. */
  readonly completion?: 'quality_review' | 'follow_up' | 'complete'
  /** TSK-0078 / TSK-0083: a visit outcome waits for the customer's review. */
  readonly visitToReview?: boolean
  /** TSK-0082: a published change order waits for the customer's decision. */
  readonly changeToReview?: boolean
  /** TSK-0085: an issued invoice has a balance due. */
  readonly invoiceDue?: boolean
}

export type CustomerStatus = {
  readonly situation: CustomerSituation
  readonly step: CustomerStep
  readonly waitingOn: WaitingOn
  readonly nextAction: CustomerNextAction
}

const NOT_A_FIT_STATES: readonly RequestState[] = ['declined', 'outside_scope', 'not_served']

/** The operational situation: closed first, then a hold, then the furthest stage the records show. */
export function customerSituation(f: PortalFacts): CustomerSituation {
  if (f.requestState === 'closed_no_response') return 'closed_no_response'
  if (NOT_A_FIT_STATES.includes(f.requestState)) return 'not_a_fit'
  if (f.requestState === 'withdrawn' || f.projectState === 'canceled') return 'canceled'
  if (f.hold === 'safety') return 'safety_hold'
  if (f.hold === 'other') return 'update_pending'
  if (f.completion === 'complete' || f.projectState === 'completed') return 'work_complete'
  if (f.completion === 'follow_up') return 'follow_up_work'
  if (f.completion === 'quality_review') return 'completion_review'
  if (f.workInProgress) return 'work_in_progress'
  if (f.visit === 'on_the_way') return 'on_the_way'
  if (f.estimateApproved || f.projectState === 'approved') return f.visit === 'confirmed' ? 'scheduled' : 'approved'
  if (f.estimatePublished || f.requestState === 'estimated') return 'estimate_ready'
  if (f.requestState === 'needs_site_visit') return f.visit === 'confirmed' ? 'scheduled' : 'site_visit'
  if (f.requestState === 'needs_information') return 'more_information'
  // received, reviewing, ready_for_estimate: HandyHub is reviewing the request or preparing the estimate.
  return 'received'
}

/**
 * The status the Overview shows: the situation, its next step, who is waiting and the one next action. A pending
 * change order or visit review outranks the stage's own action, since it holds the work up; a balance due is the
 * action once nothing else is.
 */
export function customerStatus(f: PortalFacts): CustomerStatus {
  const situation = customerSituation(f)
  const theirs = (step: CustomerStep, nextAction: CustomerNextAction): CustomerStatus => ({
    situation,
    step,
    waitingOn: 'customer',
    nextAction,
  })
  const ours = (step: CustomerStep): CustomerStatus => {
    if (f.changeToReview) return theirs(step, 'review_change')
    if (f.visitToReview) return theirs(step, 'review_visit')
    if (f.invoiceDue) return theirs(step, 'pay_invoice')
    return { situation, step, waitingOn: 'handyhub', nextAction: 'none' }
  }
  switch (situation) {
    case 'not_a_fit':
    case 'canceled':
      return { situation, step: 'decision', waitingOn: 'nobody', nextAction: 'none' }
    case 'closed_no_response':
      return { situation, step: 'closed', waitingOn: 'nobody', nextAction: 'none' }
    case 'safety_hold':
      // T48: only the neutral safety wording; the customer is never asked to act on a hazard.
      return { situation, step: 'safety_review', waitingOn: 'handyhub', nextAction: 'none' }
    case 'update_pending':
      return ours('update_pending')
    case 'work_complete':
      return f.invoiceDue
        ? theirs('review_care_notes_and_invoice', 'pay_invoice')
        : f.changeToReview || f.visitToReview
          ? ours('review_care_notes_and_invoice')
          : { situation, step: 'review_care_notes_and_invoice', waitingOn: 'nobody', nextAction: 'none' }
    case 'follow_up_work':
      return ours('follow_up_work')
    case 'completion_review':
      return ours('completion_review')
    case 'work_in_progress':
      return ours('view_updates')
    case 'on_the_way':
      return ours('arrival_update')
    case 'scheduled':
      return ours('view_appointment')
    case 'approved':
      if (f.changeToReview) return theirs(f.depositDue ? 'deposit_due' : 'choose_work_appointment', 'review_change')
      if (f.depositDue) return theirs('deposit_due', 'pay_deposit')
      return f.workWindowsOffered
        ? theirs('choose_work_appointment', 'choose_work_appointment')
        : ours('choose_work_appointment')
    case 'estimate_ready':
      return theirs('review_estimate', 'review_estimate')
    case 'site_visit':
      return f.visitWindowsOffered
        ? theirs('choose_visit_window', 'choose_visit_window')
        : ours('visit_windows_pending')
    case 'more_information':
      return theirs('answer_questions', 'reply')
    case 'received':
      return ours('review_details')
  }
}
