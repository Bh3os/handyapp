// Visit outcomes: delays, no access, customer absence and the other reasons a visit does not go as planned (TSK-0078;
// HH-SCH-09, HH-WORK-03, HH-PORT-07, ENT-Visit, OWN-DEC-68, OWN-DEC-107).
// - The worker records one explicit outcome with a note; each opens a staff follow-up item. Only "no access" changes
//   the visit (to no_access, a final state that releases its reservations); it is refused once work started on the
//   visit. No outcome ever marks work done or completes a visit.
// - Customer absent does not start work: Start Work still needs the customer present, or the Owner-approved "customer
//   not present" exception (HH-WORK-03).
// - A delay never carries an arrival time: the customer is told by staff, from the recorded window or a staff-approved
//   update (HH-SCH-09).

export const VISIT_OUTCOME_KINDS = [
  'delay',
  'no_access',
  'customer_absent',
  'weather',
  'missing_resources',
  'readiness_issue',
] as const
export type VisitOutcomeKind = (typeof VISIT_OUTCOME_KINDS)[number]

/** The visit states an outcome is recorded in: booked and not yet finished. */
export const VISIT_OUTCOME_STATES = ['confirmed', 'en_route', 'arrived'] as const

/** PROPOSED: at most 2000 characters for the worker's note and the follow-up note (no owner value). */
export const VISIT_OUTCOME_NOTE_MAX = 2000

export type VisitOutcomeProblem = 'VISIT_NOT_OPEN' | 'WORK_STARTED' | 'NOTE_REQUIRED' | 'NOTE_TOO_LONG'

/**
 * Whether an outcome may be recorded now, and what it does to the visit: no_access moves it to no_access; every other
 * kind leaves it as it is.
 */
export function visitOutcome(f: {
  kind: VisitOutcomeKind
  visitState: string
  workStarted: boolean
  note: string
}): { ok: true; visitTo: 'no_access' | null } | { ok: false; problem: VisitOutcomeProblem } {
  if (!(VISIT_OUTCOME_STATES as readonly string[]).includes(f.visitState))
    return { ok: false, problem: 'VISIT_NOT_OPEN' }
  const note = f.note.trim()
  if (!note) return { ok: false, problem: 'NOTE_REQUIRED' }
  if (note.length > VISIT_OUTCOME_NOTE_MAX) return { ok: false, problem: 'NOTE_TOO_LONG' }
  if (f.kind === 'no_access') {
    // Work under way means the site was reached: that is an issue report or Stop Work, never "no access".
    if (f.workStarted) return { ok: false, problem: 'WORK_STARTED' }
    return { ok: true, visitTo: 'no_access' }
  }
  return { ok: true, visitTo: null }
}
