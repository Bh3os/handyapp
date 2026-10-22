// Holds (TSK-0043; ENT-Hold, HH-LEAD-04, HH-WORK-02, HH-SCH-06, OWN-DEC-38, OWN-DEC-82, OWN-DEC-137,
// RULE-SAFETY-GATES, RULE-HUMAN-REVIEW).
//
//   open -> under_review -> resolved
//   open / under_review -> canceled_as_error
//
// - A hold blocks while it is open or under review. Only a recorded resolution (a note saying how it was resolved and
//   who assessed it) or a cancellation as entered in error ends it; no checkbox, timer, acknowledgment, AI output or
//   generic override does (HH-WORK-02). A later qualification that no longer lists a hazard never clears its hold.
// - Nobody releases a critical safety hold they raised (OWN-DEC-38). The Owner may set Ready on any job-level Hold /
//   Ready note and, PROPOSED, resolve any intake review hold, including one the Owner raised (OWN-DEC-137).
// - Intake review holds (HH-LEAD-04) are raised by staff when a potential hazard or restricted scope is found; the
//   uncertainty stays visible and nobody, AI included, declares the site safe.
//
// The kinds and states are ENT-Hold's. PROPOSED: the hazard categories (from the human-review areas of
// RULE-HUMAN-REVIEW) and that a review hold is resolved only after a review was started.
import { defineMachine, type Guard } from './engine.js'
import { reasonGiven } from './guards.js'

export const HOLD_STATES = ['open', 'under_review', 'resolved', 'canceled_as_error'] as const
export type HoldState = (typeof HOLD_STATES)[number]

/** The states in which a hold blocks what it guards. */
export const BLOCKING_HOLD_STATES = ['open', 'under_review'] as const satisfies readonly HoldState[]

/**
 * ENT-Hold kinds. This task writes `review` holds only; the job-level Hold / Ready (`job_requirement`), critical safety
 * holds and task blocks are added by the scheduling and field-work tasks to the same table.
 */
export const HOLD_KINDS = ['review', 'job_requirement', 'critical_safety', 'task_block'] as const

/**
 * The kinds of hold that block Start Work of the whole job while they block (TSK-0073; HH-WORK-01 items 5 and 6): the
 * same kinds that block confirmation. A task block blocks Start Work of its own work package (HH-PKT-06), read through
 * the loadout. Migration 0076 checks the same kinds in the database.
 */
export const START_BLOCKING_HOLD_KINDS = [
  'review',
  'job_requirement',
  'critical_safety',
] as const satisfies readonly HoldKind[]

/** TSK-0074: the categories of a job-level Hold / Ready note (an unresolved requirement, OWN-DEC-82; PROPOSED). */
export const JOB_HOLD_CATEGORIES = [
  'permit_licensing',
  'licensed_trade',
  'structural',
  'hazardous_material',
  'site_condition',
  'other',
] as const
export type JobHoldCategory = (typeof JOB_HOLD_CATEGORIES)[number]
export type HoldKind = (typeof HOLD_KINDS)[number]

/**
 * The kinds of hold that block confirming a visit while they block (TSK-0064; HH-SCH-06, T40): an unresolved critical
 * safety hold and an explicit blocking job-level Hold. PROPOSED (OQ-CONFIRMATION-PRECONDITIONS): an intake review hold
 * blocks too, since the potential hazard or restricted scope it names is unresolved. Task blocks (critical resource
 * shortages) never block a planning appointment (HH-PKT-06). Migration 0057 counts the same kinds.
 */
export const CONFIRMATION_BLOCKING_HOLD_KINDS = [
  'review',
  'job_requirement',
  'critical_safety',
] as const satisfies readonly HoldKind[]

/**
 * PROPOSED: what a potential hazard or restricted scope found at intake is about, from the human-review areas of
 * RULE-HUMAN-REVIEW. HandyHub never performs licensed gas, electrical, plumbing, HVAC or structural work and never
 * removes hazardous materials; these categories name who must review, never what HandyHub will do.
 */
export const HAZARD_CATEGORIES = [
  'hazardous_material',
  'licensed_trade',
  'structural',
  'permit_licensing',
  'other',
] as const
export type HazardCategory = (typeof HAZARD_CATEGORIES)[number]

export type HoldFacts = {
  readonly kind?: HoldKind
  /** Who raised the hold, and who is acting now (staff user ids). */
  readonly raisedBy?: string
  readonly actorId?: string
  /** How the hold was resolved. */
  readonly resolutionNote?: string
  /** Who assessed it (name and, where the hazard needs one, their qualification). */
  readonly reviewer?: string
  /** Why the hold was entered in error. */
  readonly reason?: string
  /** TSK-0074 (HH-WORK-02): a critical safety hold's resolution evidence and the reviewer's qualification. */
  readonly evidence?: string
  readonly reviewerQualification?: string
}

type G = Guard<HoldFacts>

const resolution: G = (f) => reasonGiven(f.resolutionNote, 'A note saying how it was resolved')
const reviewer: G = (f) =>
  typeof f.reviewer === 'string' && f.reviewer.trim() !== ''
    ? null
    : { code: 'REVIEWER_REQUIRED', message: 'Name who reviewed it.' }
const cancelReason: G = (f) => reasonGiven(f.reason, 'The reason it was entered in error')
/** Nobody releases a critical safety hold they raised (OWN-DEC-38); never relaxed for a sole administrator. */
const notOwnCritical: G = (f) => {
  if (f.kind === undefined || f.raisedBy === undefined || f.actorId === undefined)
    return { code: 'FACTS_MISSING', message: 'The server must check: kind, raisedBy, actorId.' }
  return f.kind === 'critical_safety' && f.raisedBy === f.actorId
    ? { code: 'OWN_CRITICAL_HOLD', message: 'Nobody releases a critical safety hold they raised.' }
    : null
}

/**
 * TSK-0074 (HH-WORK-02): a critical safety hold is released only with recorded resolution evidence and the reviewer who
 * assessed it, with their qualification (a qualified person where the hazard needs one; the software records it, it
 * does not judge competence, RULE-HUMAN-REVIEW).
 */
const criticalEvidence: G = (f) => {
  if (f.kind !== 'critical_safety') return null
  if (typeof f.evidence !== 'string' || f.evidence.trim() === '')
    return { code: 'EVIDENCE_REQUIRED', message: 'Record the resolution evidence.' }
  if (typeof f.reviewerQualification !== 'string' || f.reviewerQualification.trim() === '')
    return { code: 'QUALIFICATION_REQUIRED', message: "State the reviewer's qualification." }
  return null
}

export const HOLD_MACHINE = defineMachine({
  entity: 'hold',
  dimension: 'lifecycle',
  states: HOLD_STATES,
  initial: 'open',
  final: ['resolved', 'canceled_as_error'],
  proposed: true,
  transitions: [
    { event: 'start_review', from: ['open'], to: 'under_review', actors: ['staff'] },
    {
      event: 'resolve',
      from: ['under_review'],
      to: 'resolved',
      actors: ['staff'],
      guards: [resolution, reviewer, criticalEvidence, notOwnCritical],
      effects: ['queue.hold_item_sync'],
    },
    {
      event: 'cancel_as_error',
      from: ['open', 'under_review'],
      to: 'canceled_as_error',
      actors: ['staff'],
      guards: [cancelReason, notOwnCritical],
      effects: ['queue.hold_item_sync'],
    },
  ],
})

export function isBlockingHold(state: string): boolean {
  return (BLOCKING_HOLD_STATES as readonly string[]).includes(state)
}
