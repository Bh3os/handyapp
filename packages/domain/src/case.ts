// Cases: complaints, incidents, damage, injury and disputes (TSK-0093; HH-QA-06, HH-INC-01, HH-INC-02, HH-INC-04,
// ENT-Case, OWN-DEC-124, OWN-DEC-143, OWN-DEC-135, FACT-WARRANTY, RULE-HUMAN-REVIEW, RULE-NO-INVENTED-FACTS).
//
//   complaint: open -> acknowledged -> investigating -> action_pending -> resolved -> closed   (reopen: resolved and
//              closed -> investigating)
//   incident, damage, injury, dispute: reported -> triaged -> action_pending -> resolution_review -> closed
//
// - A case is a factual, minimal record. Nothing here decides fault, liability, coverage or compensation: those are
//   human-review areas (RULE-HUMAN-REVIEW) routed to the Owner, who handles every insurer, attorney or other
//   professional referral and records it as an Owner action (HH-INC-04). The software never says a professional was
//   contacted unless the Owner recorded the referral.
// - Kinds other than `complaint` keep their details in the restricted incident section (HH-INC-02, OWN-DEC-143): only
//   the Owner and the staff member who reported it read it; Office sees that the case exists and its status.
// - Closing needs a recorded resolution, the re-check when one is required, and no open follow-up item (HH-QA-06,
//   OWN-DEC-124). Resolving a case never releases a work hold (HH-INC-03 evaluates that separately).
// - Customer updates are neutral templates, released by staff after review (HH-INC-02); the only wording added to a
//   template is the staff member's own detail, scanned for fault, liability and compensation wording before it can be
//   drafted or released (HH-INC-04 "no template contains such wording").
//
// PROPOSED (OQ-CASE-DETAILS): the complaint categories and severities (from the planning domain model, 05 Complaint and
// Incident), the mapping of reported incident types to kinds, the review areas per kind, the reopen target, the
// follow-up and re-check rules, and the customer update templates.
import { defineMachine, type Guard } from './engine.js'
import { reasonGiven } from './guards.js'

/** ENT-Case kinds. */
export const CASE_KINDS = ['complaint', 'incident', 'damage', 'injury', 'dispute'] as const
export type CaseKind = (typeof CASE_KINDS)[number]

/** The kinds whose details are in the restricted incident section (HH-INC-02: injury, damage, disputes; incidents). */
export const RESTRICTED_CASE_KINDS = ['incident', 'damage', 'injury', 'dispute'] as const satisfies readonly CaseKind[]
export const isRestrictedKind = (kind: string): boolean => (RESTRICTED_CASE_KINDS as readonly string[]).includes(kind)

/** The kinds that notify the Owner at once (HH-INC-04): an Owner Decisions item plus a staff notification. */
export const OWNER_NOTIFIED_KINDS = ['damage', 'injury', 'dispute'] as const satisfies readonly CaseKind[]
export const notifiesOwner = (kind: string): boolean => (OWNER_NOTIFIED_KINDS as readonly string[]).includes(kind)

/**
 * What a reporter says happened (HH-INC-01 incident types, plus a dispute). The kind follows from it: an injury is an
 * injury case, property damage a damage case, a dispute a dispute case; the others are incident cases (PROPOSED).
 */
export const INCIDENT_TYPES = [
  'injury',
  'near_miss',
  'property_damage',
  'exposure_concern',
  'customer_conflict',
  'equipment_failure',
  'dispute',
  'other',
] as const
export type IncidentType = (typeof INCIDENT_TYPES)[number]

export function kindOfIncident(type: IncidentType): Exclude<CaseKind, 'complaint'> {
  if (type === 'injury') return 'injury'
  if (type === 'property_damage') return 'damage'
  if (type === 'dispute') return 'dispute'
  return 'incident'
}

/**
 * PROPOSED complaint categories (planning domain model 05 Complaint: work quality, conduct, schedule, billing, other).
 * A damage claim is recorded as a damage case instead, so its details are restricted from the start (HH-INC-02).
 */
export const COMPLAINT_CATEGORIES = ['work_quality', 'conduct', 'schedule', 'billing', 'other'] as const
export type ComplaintCategory = (typeof COMPLAINT_CATEGORIES)[number]

/** PROPOSED severities (planning domain model 05; pending the qualified safety professional for incidents). */
export const CASE_SEVERITIES = ['low', 'moderate', 'high', 'critical'] as const
export type CaseSeverity = (typeof CASE_SEVERITIES)[number]

/** Where a case came from (ENT-Case). */
export const CASE_SOURCES = ['walkthrough', 'message', 'call', 'worker_report'] as const
export type CaseSource = (typeof CASE_SOURCES)[number]
export const COMPLAINT_SOURCES = ['walkthrough', 'message', 'call'] as const satisfies readonly CaseSource[]

/**
 * The human-review areas (RULE-HUMAN-REVIEW) a case kind raises, each routed to the Owner as the named reviewer, who
 * decides any professional referral (PROPOSED mapping). The software flags them; it never decides them.
 */
export const REVIEW_AREAS = ['injury', 'insurance', 'disputes', 'legal'] as const
export type ReviewArea = (typeof REVIEW_AREAS)[number]
export function reviewAreasOf(kind: CaseKind): ReviewArea[] {
  switch (kind) {
    case 'injury':
      return ['injury', 'insurance']
    case 'damage':
      return ['insurance']
    case 'dispute':
      return ['disputes', 'legal']
    default:
      return []
  }
}

/** The professionals the Owner may record a referral to (HH-INC-04); recording one is the Owner's own action. */
export const REFERRAL_PROFESSIONALS = ['insurer', 'attorney', 'other_professional'] as const
export type ReferralProfessional = (typeof REFERRAL_PROFESSIONALS)[number]

export const COMPLAINT_STATES = [
  'open',
  'acknowledged',
  'investigating',
  'action_pending',
  'resolved',
  'closed',
] as const
export type ComplaintState = (typeof COMPLAINT_STATES)[number]

export const INCIDENT_STATES = ['reported', 'triaged', 'action_pending', 'resolution_review', 'closed'] as const
export type IncidentState = (typeof INCIDENT_STATES)[number]

export const CASE_STATES = [...new Set([...COMPLAINT_STATES, ...INCIDENT_STATES])] as readonly (
  ComplaintState | IncidentState
)[]
export type CaseState = ComplaintState | IncidentState

/** A case is active (it pauses review and satisfaction requests and holds related records) until it is closed. */
export const isActiveCase = (state: string): boolean => state !== 'closed'

export const FOLLOW_UP_STATES = ['open', 'done', 'canceled'] as const
export type FollowUpState = (typeof FOLLOW_UP_STATES)[number]

export type CaseFacts = {
  /** The resolution recorded with resolve / submit_resolution, or already on the case. */
  readonly resolution?: string | null
  /** Whether a re-check is required, and whether it was recorded. */
  readonly recheckRequired?: boolean
  readonly recheckDone?: boolean
  /** Follow-up items still open. */
  readonly openFollowUps?: number
  /** Why a case is reopened. */
  readonly reason?: string
}

type G = Guard<CaseFacts>
const resolution: G = (f) => reasonGiven(f.resolution ?? undefined, 'A recorded resolution')
const recheck: G = (f) => {
  if (f.recheckRequired === undefined) return { code: 'FACTS_MISSING', message: 'The server must check: recheck.' }
  return f.recheckRequired && !f.recheckDone
    ? { code: 'RECHECK_REQUIRED', message: 'Record the re-check first.' }
    : null
}
const followUps: G = (f) => {
  if (f.openFollowUps === undefined) return { code: 'FACTS_MISSING', message: 'The server must check: follow-ups.' }
  return f.openFollowUps > 0
    ? { code: 'FOLLOW_UPS_OPEN', message: 'Complete or cancel every open follow-up item first.' }
    : null
}
const reopenReason: G = (f) => reasonGiven(f.reason, 'The reason it is reopened')

export const COMPLAINT_CASE_MACHINE = defineMachine({
  entity: 'complaint_case',
  dimension: 'lifecycle',
  states: COMPLAINT_STATES,
  initial: 'open',
  // Reopening is permitted (HH-QA-06), so no state is final.
  final: [],
  proposed: true,
  transitions: [
    { event: 'acknowledge', from: ['open'], to: 'acknowledged', actors: ['staff'] },
    { event: 'investigate', from: ['open', 'acknowledged'], to: 'investigating', actors: ['staff'] },
    { event: 'await_action', from: ['investigating'], to: 'action_pending', actors: ['staff'] },
    {
      event: 'resolve',
      from: ['acknowledged', 'investigating', 'action_pending'],
      to: 'resolved',
      actors: ['staff'],
      guards: [resolution],
    },
    {
      event: 'close',
      from: ['resolved'],
      to: 'closed',
      actors: ['staff'],
      guards: [resolution, recheck, followUps],
      effects: ['queue.case_open_resolve'],
    },
    {
      event: 'reopen',
      from: ['resolved', 'closed'],
      to: 'investigating',
      actors: ['staff'],
      guards: [reopenReason],
      effects: ['queue.case_open_sync'],
    },
  ],
})

export const INCIDENT_CASE_MACHINE = defineMachine({
  entity: 'incident_case',
  dimension: 'lifecycle',
  states: INCIDENT_STATES,
  initial: 'reported',
  final: ['closed'],
  proposed: true,
  transitions: [
    { event: 'triage', from: ['reported'], to: 'triaged', actors: ['staff'], effects: ['queue.incident_resolve'] },
    { event: 'await_action', from: ['triaged'], to: 'action_pending', actors: ['staff'] },
    {
      event: 'submit_resolution',
      from: ['triaged', 'action_pending'],
      to: 'resolution_review',
      actors: ['staff'],
      guards: [resolution],
    },
    { event: 'return_to_action', from: ['resolution_review'], to: 'action_pending', actors: ['staff'] },
    {
      event: 'close',
      from: ['resolution_review'],
      to: 'closed',
      actors: ['staff'],
      guards: [resolution, recheck, followUps],
      effects: ['queue.case_open_resolve'],
    },
  ],
})

export type ComplaintEvent = (typeof COMPLAINT_CASE_MACHINE.transitions)[number]['event']
export type IncidentEvent = (typeof INCIDENT_CASE_MACHINE.transitions)[number]['event']
export const CASE_EVENTS = [
  ...new Set([
    ...COMPLAINT_CASE_MACHINE.transitions.map((t) => t.event),
    ...INCIDENT_CASE_MACHINE.transitions.map((t) => t.event),
  ]),
] as readonly (ComplaintEvent | IncidentEvent)[]
export type CaseEvent = ComplaintEvent | IncidentEvent

/** The machine of a case kind. */
export const caseMachineOf = (kind: CaseKind) => (kind === 'complaint' ? COMPLAINT_CASE_MACHINE : INCIDENT_CASE_MACHINE)
export const initialStateOf = (kind: CaseKind): CaseState => (kind === 'complaint' ? 'open' : 'reported')

// --- Customer updates ----------------------------------------------------------------------------------------------

/**
 * What a customer may be told about a case (HH-INC-02, OWN-DEC-124): an acknowledgment, a progress update, the next
 * step, and, while a hold actually pauses the work, the safety pause. Nothing says resolved, denied, covered or at
 * fault: those are people's decisions (HH-QA-06 "never an automatic denial or resolution").
 */
export const CUSTOMER_UPDATE_KINDS = ['acknowledgment', 'progress', 'next_step', 'safety_pause'] as const
export type CustomerUpdateKind = (typeof CUSTOMER_UPDATE_KINDS)[number]

/** PROPOSED neutral template wording (customer text, English only); the safety pause is HH-INC-02's own sentence. */
export const CUSTOMER_UPDATE_TEMPLATES: Readonly<Record<CustomerUpdateKind, { text: string; detail: boolean }>> = {
  acknowledgment: { text: 'We received your report and recorded it for review.', detail: false },
  progress: { text: 'Progress update:', detail: true },
  next_step: { text: 'Next step:', detail: true },
  safety_pause: { text: 'Work is paused for safety review.', detail: false },
}

export const CUSTOMER_UPDATE_DETAIL_MAX = 500

/** The customer text of an update: the template, then the staff member's detail when the template takes one. */
export function customerUpdateText(kind: CustomerUpdateKind, detail?: string | null): string {
  const t = CUSTOMER_UPDATE_TEMPLATES[kind]
  const d = (detail ?? '').trim()
  return t.detail ? `${t.text} ${d}` : t.text
}

/**
 * Fault, liability, coverage and compensation wording that no case text sent to a customer may contain (HH-INC-04,
 * RULE-HUMAN-REVIEW, RULE-NO-INVENTED-FACTS). The only coverage statement a template may make is the 90-day
 * workmanship warranty of FACT-WARRANTY, and these templates make none; whether a claim is covered is the Owner's.
 */
export const FORBIDDEN_CASE_WORDING: readonly RegExp[] = [
  /\bfault\b/i,
  /\bat fault\b/i,
  /\bblame/i,
  /\bliab(le|ility)\b/i,
  /\bnegligen/i,
  /\badmit/i,
  /\bcompensat/i,
  /\breimburs/i,
  /\brefund/i,
  /\bwe will pay\b/i,
  /\bpay for (the )?(damage|repairs?|medical)/i,
  /\bsettle(ment)?\b/i,
  /\bguarantee/i,
  /\bwarrant(y|ies|ed)\b/i,
  /\bcovered\b/i,
  /\bcoverage\b/i,
  /\binsurance (will|has|covers)/i,
  /\bour insurer\b/i,
  /\bour attorney\b/i,
  /\blegal(ly)? (responsib|obligat)/i,
  /\bdenied\b/i,
  /\bclaim (is )?(approved|denied|rejected)\b/i,
]

/** The forbidden wording found in a text (empty when none). */
export function forbiddenCaseWording(text: string): string[] {
  return FORBIDDEN_CASE_WORDING.flatMap((re) => {
    const m = re.exec(text)
    return m ? [m[0]] : []
  })
}

/** A safety pause may be told only while a hold actually pauses the work (truthful status, HH-QA-06). */
export const safetyPauseTruthful = (holdState: string | null): boolean =>
  holdState === 'open' || holdState === 'under_review'
