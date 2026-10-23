// The Owner's quality review and punch items (TSK-0084; HH-QA-02, HH-QA-04, HH-QA-09, ENT-QAInspection, ENT-PunchItem,
// OWN-DEC-64, OWN-DEC-109, OWN-DEC-28, RULE-SAFETY-GATES).
//
//   review:     pending -> in_review -> passed / punch_required;  punch_required -> pending_recheck -> passed
//               (pending_recheck -> punch_required when a re-check fails or a new punch item is found)
//   punch item: open -> corrected -> rechecked;  corrected -> open when the re-check fails
//
// - A worker's Finished sends the job to "Awaiting quality review" (TSK-0083); the Owner reviews every job before it
//   counts as complete, and a job the Owner worked on is marked self-review (OWN-DEC-64).
// - The review looks at four areas (HH-QA-02): the scope, the checklist, the before/after evidence and the walkthrough.
//   Every problem found becomes a punch item with an assigned person, a due date and the required correction evidence.
// - The kind of a punch item decides its severity, in the owner's words (OWN-DEC-64): finish or cleanup issues are
//   minor; defects, incomplete agreed scope, failed functional checks and safety concerns are major.
// - The final invoice follows the review (HH-FIN-05): passed lets the Owner or Office issue; only minor items open lets
//   the Owner issue; a major item not re-checked blocks it. Deposit invoices follow their own terms.
// - A safety concern blocks the affected work through the job's critical safety hold (Stop Work / Report Hazard,
//   TSK-0077), which only its own release path resolves; the item is re-checked only once the hold is resolved.
//
// PROPOSED (OQ-QUALITY-REVIEW-DETAILS): the two area results (ok / problem), the automatic moves of the review as its
// items are corrected and re-checked, who may be assigned (an active worker), the verifier-is-not-the-corrector rule
// outside self-review, and the customer label of each state.
import { defineMachine, type Guard } from './engine.js'
import { reasonGiven } from './guards.js'

export const QUALITY_REVIEW_STATES = ['pending', 'in_review', 'passed', 'punch_required', 'pending_recheck'] as const
export type QualityReviewState = (typeof QUALITY_REVIEW_STATES)[number]

/** The four areas the Owner reviews (HH-QA-02, OWN-DEC-109 step 9). */
export const QUALITY_REVIEW_AREAS = ['scope', 'checklist', 'evidence', 'walkthrough'] as const
export type QualityReviewArea = (typeof QUALITY_REVIEW_AREAS)[number]

export const AREA_RESULTS = ['ok', 'problem'] as const
export type AreaResult = (typeof AREA_RESULTS)[number]
export type AreaResults = Readonly<Record<QualityReviewArea, AreaResult>>

/** Punch item kinds in the owner's words (OWN-DEC-64). */
export const MINOR_PUNCH_KINDS = ['finish', 'cleanup'] as const
export const MAJOR_PUNCH_KINDS = ['defect', 'incomplete_scope', 'failed_check', 'safety_concern'] as const
export const PUNCH_ITEM_KINDS = [...MINOR_PUNCH_KINDS, ...MAJOR_PUNCH_KINDS] as const
export type PunchItemKind = (typeof PUNCH_ITEM_KINDS)[number]
export const PUNCH_SEVERITIES = ['minor', 'major'] as const
export type PunchSeverity = (typeof PUNCH_SEVERITIES)[number]

/** Minor: finish or cleanup issues; every other kind is major (OWN-DEC-64). */
export const severityOf = (kind: PunchItemKind): PunchSeverity =>
  (MINOR_PUNCH_KINDS as readonly string[]).includes(kind) ? 'minor' : 'major'

export const PUNCH_ITEM_STATES = ['open', 'corrected', 'rechecked'] as const
export type PunchItemState = (typeof PUNCH_ITEM_STATES)[number]

/** The final invoice's gate as finance.invoice_quality_gate answers it (migration 0082). */
export const QUALITY_GATES = ['quality_review_not_recorded', 'passed', 'owner_may_issue', 'blocked'] as const
export type QualityGate = (typeof QUALITY_GATES)[number]

/** The gate from the review state and the punch items not yet re-checked (mirrors the database function). */
export function qualityGateOf(
  state: QualityReviewState | null,
  unrechecked: readonly { severity: PunchSeverity }[],
): QualityGate {
  if (state === null || state === 'pending' || state === 'in_review') return 'quality_review_not_recorded'
  if (state === 'passed') return 'passed'
  return unrechecked.some((i) => i.severity === 'major') ? 'blocked' : 'owner_may_issue'
}

/** What the customer sees of the review (HH-PORT-03): completion review, follow-up work, or complete. */
export function customerCompletion(
  jobState: string,
  review: QualityReviewState | null,
): 'quality_review' | 'follow_up' | 'complete' | null {
  if (review === 'passed' || jobState === 'operationally_complete' || jobState === 'closed') return 'complete'
  if (review === 'punch_required' || review === 'pending_recheck') return 'follow_up'
  if (jobState === 'ready_for_qa') return 'quality_review'
  return null
}

export type QualityReviewFacts = {
  /** The area results the decision records (every area). */
  readonly results?: Partial<Record<QualityReviewArea, AreaResult>>
  /** Punch items on the review: all of them, those still open, and those not re-checked. */
  readonly items?: number
  readonly openItems?: number
  readonly unrechecked?: number
}

type G = Guard<QualityReviewFacts>
const missing = (what: string) => ({ code: 'FACTS_MISSING', message: `The server must check: ${what}.` })
const areasRecorded: G = (f) => {
  const absent = QUALITY_REVIEW_AREAS.filter((a) => !f.results?.[a])
  return absent.length
    ? { code: 'AREAS_NOT_REVIEWED', message: `Record a result for every area: ${absent.join(', ')}.` }
    : null
}
const problemsArePunched: G = (f) => {
  if (f.items === undefined) return missing('items')
  const problem = QUALITY_REVIEW_AREAS.some((a) => f.results?.[a] === 'problem')
  return problem && f.items === 0
    ? { code: 'PROBLEM_NEEDS_PUNCH_ITEM', message: 'Every problem found becomes a punch item.' }
    : null
}
const noItems: G = (f) => {
  if (f.items === undefined) return missing('items')
  return f.items > 0
    ? { code: 'PUNCH_ITEMS_FOUND', message: 'Punch items were found: the review asks for punch work.' }
    : null
}
const someItems: G = (f) => {
  if (f.items === undefined) return missing('items')
  return f.items === 0 ? { code: 'NO_PUNCH_ITEMS', message: 'Add the punch items found first.' } : null
}
const noneOpen: G = (f) => {
  if (f.openItems === undefined) return missing('openItems')
  return f.openItems > 0 ? { code: 'PUNCH_ITEMS_OPEN', message: 'Every punch item is corrected first.' } : null
}
const someOpen: G = (f) => {
  if (f.openItems === undefined) return missing('openItems')
  return f.openItems === 0 ? { code: 'NO_OPEN_PUNCH_ITEMS', message: 'No punch item is open.' } : null
}
const allRechecked: G = (f) => {
  if (f.unrechecked === undefined) return missing('unrechecked')
  return f.unrechecked > 0 ? { code: 'RECHECK_PENDING', message: 'Every punch item passes its re-check first.' } : null
}

export const QUALITY_REVIEW_MACHINE = defineMachine({
  entity: 'quality_review',
  dimension: 'lifecycle',
  states: QUALITY_REVIEW_STATES,
  initial: 'pending',
  final: ['passed'],
  proposed: true,
  transitions: [
    { event: 'start', from: ['pending'], to: 'in_review', actors: ['staff'] },
    {
      event: 'pass',
      from: ['in_review'],
      to: 'passed',
      actors: ['staff'],
      guards: [areasRecorded, problemsArePunched, noItems],
      effects: ['job.operationally_complete', 'queue.quality_review_resolve'],
    },
    {
      event: 'require_punch',
      from: ['in_review'],
      to: 'punch_required',
      actors: ['staff'],
      guards: [areasRecorded, someItems],
    },
    {
      event: 'corrections_done',
      from: ['punch_required'],
      to: 'pending_recheck',
      actors: ['system'],
      guards: [noneOpen],
    },
    {
      event: 'punch_reopened',
      from: ['pending_recheck'],
      to: 'punch_required',
      actors: ['staff', 'system'],
      guards: [someOpen],
    },
    {
      event: 'recheck_complete',
      from: ['pending_recheck'],
      to: 'passed',
      actors: ['system'],
      guards: [noneOpen, allRechecked],
      effects: ['job.operationally_complete', 'queue.quality_review_resolve'],
    },
  ],
})
export type QualityReviewEvent = (typeof QUALITY_REVIEW_MACHINE.transitions)[number]['event']

export type PunchItemFacts = {
  readonly note?: string
  /** A safety concern: its hold is resolved (null when the item names no hold). */
  readonly holdResolved?: boolean | null
  /** The re-checker corrected the item, and whether the review is a self-review. */
  readonly recheckerCorrected?: boolean
  readonly selfReview?: boolean
}
type P = Guard<PunchItemFacts>
const noteGiven: P = (f) => reasonGiven(f.note, 'A note')
const holdResolved: P = (f) => {
  if (f.holdResolved === undefined) return { code: 'FACTS_MISSING', message: 'The server must check: hold.' }
  return f.holdResolved === false
    ? { code: 'SAFETY_HOLD_UNRESOLVED', message: 'The safety hold is resolved through its own release first.' }
    : null
}
const notCorrector: P = (f) => {
  if (f.recheckerCorrected === undefined || f.selfReview === undefined)
    return { code: 'FACTS_MISSING', message: 'The server must check: corrector.' }
  return f.recheckerCorrected && !f.selfReview
    ? { code: 'RECHECKER_CORRECTED', message: 'The person who corrected an item does not re-check it.' }
    : null
}

export const PUNCH_ITEM_MACHINE = defineMachine({
  entity: 'punch_item',
  dimension: 'lifecycle',
  states: PUNCH_ITEM_STATES,
  initial: 'open',
  final: ['rechecked'],
  proposed: true,
  transitions: [
    { event: 'correct', from: ['open'], to: 'corrected', actors: ['staff'], guards: [noteGiven] },
    {
      event: 'recheck_pass',
      from: ['corrected'],
      to: 'rechecked',
      actors: ['staff'],
      guards: [noteGiven, holdResolved, notCorrector],
    },
    { event: 'recheck_fail', from: ['corrected'], to: 'open', actors: ['staff'], guards: [noteGiven] },
  ],
})
export type PunchItemEvent = (typeof PUNCH_ITEM_MACHINE.transitions)[number]['event']
