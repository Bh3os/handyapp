// Staff qualification of a request and the four request actions (TSK-0042; HH-LEAD-02, HH-LEAD-08, HH-SVC-04,
// OWN-DEC-99, OWN-DEC-100, OWN-DEC-116).
//
// - Qualification is recorded by staff, never classified by AI (RULE-AI-WAVE2): one outcome per check of HH-LEAD-02.
// - The four actions name the request event each one sends. Not a Fit picks its event from the reason category.
//
// PROPOSED (not owner-decided): the three outcomes of a check, that both estimating routes need every check
// answered first, and the category-to-state mapping of Not a Fit. The checks and the categories themselves are
// decided (HH-LEAD-02, OWN-DEC-100).
import type { Problem } from './engine.js'
import { HAZARD_CATEGORIES, type HazardCategory } from './hold.js'
import type { NotAFitCategory } from './request.js'

/** The checks of HH-LEAD-02, in the order staff work through them. */
export const QUALIFICATION_CHECKS = [
  'coverage',
  'service_fit',
  'essential_facts',
  'urgency',
  'site_visit_need',
  'staff_equipment',
  'risk_flags',
] as const
export type QualificationCheck = (typeof QUALIFICATION_CHECKS)[number]

/** PROPOSED outcomes: checked and fine, checked with something to note, or not checked yet. */
export const QUALIFICATION_OUTCOMES = ['ok', 'attention', 'not_checked'] as const
export type QualificationOutcome = (typeof QUALIFICATION_OUTCOMES)[number]

export type QualificationEntry = {
  readonly outcome: QualificationOutcome
  readonly note?: string | null
  /** Risk flags only: what the potential hazard or restricted scope is about (TSK-0043, HH-LEAD-04). */
  readonly hazards?: readonly HazardCategory[] | null
}
export type Qualification = Readonly<Partial<Record<QualificationCheck, QualificationEntry>>>

/** The checks still missing an outcome; empty when the request is fully qualified. */
export function unqualifiedChecks(q: Qualification | null | undefined): QualificationCheck[] {
  return QUALIFICATION_CHECKS.filter((c) => {
    const outcome = q?.[c]?.outcome
    return outcome === undefined || outcome === 'not_checked'
  })
}

/** The four actions of the request screen (OWN-DEC-116). */
export const REQUEST_ACTIONS = [
  'ask_question',
  'prepare_online_estimate',
  'arrange_estimate_visit',
  'not_a_fit',
] as const
export type RequestAction = (typeof REQUEST_ACTIONS)[number]

/** The request event each estimating and question action sends (the request.lifecycle machine). */
export const ACTION_EVENTS = {
  ask_question: 'request_information',
  prepare_online_estimate: 'mark_ready_for_estimate',
  arrange_estimate_visit: 'require_site_visit',
} as const

/**
 * PROPOSED: the event a Not a Fit decision sends, by reason category. Coverage ends as "not served", work outside our
 * scope as "outside scope", and a specialist assessment or another documented reason as "declined". All three are
 * the same staff decision with the same customer text (OWN-DEC-100).
 */
export const NOT_A_FIT_EVENTS = {
  coverage: 'mark_not_served',
  outside_scope: 'mark_outside_scope',
  specialist_assessment: 'decline_not_a_fit',
  other: 'decline_not_a_fit',
} as const satisfies Record<NotAFitCategory, string>

/**
 * The hazard flag (TSK-0043; HH-LEAD-04, HH-LEAD-02 "relevant risk flags"): risk flags marked "needs attention" name
 * the potential hazards or restricted scope found, each of which becomes a review hold. PROPOSED: a flagged risk needs
 * at least one category and a note saying what was seen; categories belong to the risk flags only.
 */
export function flaggedHazards(q: Qualification | null | undefined): HazardCategory[] {
  const entry = q?.risk_flags
  if (entry?.outcome !== 'attention') return []
  return HAZARD_CATEGORIES.filter((c) => entry.hazards?.includes(c))
}

/** The hazards a new qualification revision flags that the previous one did not: each opens a review hold. */
export function newlyFlaggedHazards(
  previous: Qualification | null | undefined,
  current: Qualification | null | undefined,
): HazardCategory[] {
  const before = new Set(flaggedHazards(previous))
  return flaggedHazards(current).filter((c) => !before.has(c))
}

/** What is wrong with a qualification's hazard flag; empty when it can be saved. */
export function qualificationProblems(q: Qualification): Problem[] {
  const problems: Problem[] = []
  for (const check of QUALIFICATION_CHECKS) {
    const entry = q[check]
    if (check !== 'risk_flags' && entry?.hazards && entry.hazards.length > 0)
      problems.push({ code: 'HAZARDS_ONLY_ON_RISK_FLAGS', message: 'Hazard categories belong to the risk flags.' })
  }
  const risk = q.risk_flags
  if (risk?.outcome === 'attention') {
    if (!risk.hazards || risk.hazards.length === 0)
      problems.push({ code: 'HAZARD_CATEGORY_REQUIRED', message: 'Name what the potential hazard is about.' })
    if (!risk.note || risk.note.trim() === '')
      problems.push({ code: 'HAZARD_NOTE_REQUIRED', message: 'Say what was seen.' })
  } else if (risk?.hazards && risk.hazards.length > 0) {
    problems.push({
      code: 'HAZARDS_NEED_ATTENTION',
      message: 'Mark the risk flags as needing attention to flag a hazard.',
    })
  }
  return problems
}
