// @handyhub/domain: per-entity state machines and transition policies (HH-STATE-01, HH-STATE-02, HH-DATA-05; TSK-0009).
// This package ships the engine and the Request and Project tables; feature tasks add the tables of their entities
// (estimate version, job dimensions, visit, hold, invoice, payment, case) to MACHINES.
import {
  type EventOf,
  type FactsOf,
  type StateOf,
  transition,
  type TransitionContext,
  type TransitionResult,
} from './engine.js'
import { ESTIMATE_VERSION_MACHINE } from './estimate.js'
import { HOLD_MACHINE } from './hold.js'
import { PROJECT_MACHINE } from './project.js'
import { REQUEST_MACHINE } from './request.js'
import { VISIT_MACHINE } from './visit.js'
import { SOP_VERSION_MACHINE } from './sop.js'
import { WINDOW_OFFER_MACHINE } from './window-offer.js'

export const PACKAGE_NAME = '@handyhub/domain'

export { defineMachine, eventsFrom, MachineDefinitionError, transition } from './engine.js'
export type {
  ActorKind,
  EntityState,
  EventOf,
  FactsOf,
  Guard,
  Machine,
  Problem,
  RefusalCode,
  StateOf,
  Transition,
  TransitionContext,
  TransitionResult,
} from './engine.js'
export { NOT_A_FIT_CATEGORIES, REQUEST_CLOSED_STATES, REQUEST_MACHINE, REQUEST_STATES } from './request.js'
export {
  addressKey,
  DEFAULT_VISIBILITY,
  isRestricted,
  looksLikeCardNumber,
  MATCH_REASONS,
  nameKey,
  normalizeEmail,
  normalizePhone,
  NOTE_VISIBILITIES,
  sortReasons,
  suggests,
  SUGGESTING_REASONS,
  VISIBILITY_CLASSES,
} from './records.js'
export type { MatchReason, NoteVisibility, VisibilityClass } from './records.js'
export type { NotAFitCategory, RequestFacts, RequestState } from './request.js'
export {
  ACCESS_SECRET_KINDS,
  DETAIL_SOURCES,
  looksLikeAccessCode,
  PROPERTY_DETAILS,
  PROPERTY_TEXT_DETAILS,
  sameAddress,
  STAFF_DETAIL_SOURCES,
} from './property.js'
export type { AccessSecretKind, DetailSource, PropertyAddress, PropertyDetail, PropertyTextDetail } from './property.js'
export {
  ACTION_EVENTS,
  flaggedHazards,
  newlyFlaggedHazards,
  NOT_A_FIT_EVENTS,
  QUALIFICATION_CHECKS,
  QUALIFICATION_OUTCOMES,
  qualificationProblems,
  REQUEST_ACTIONS,
  unqualifiedChecks,
} from './qualification.js'
export {
  BLOCKING_HOLD_STATES,
  CONFIRMATION_BLOCKING_HOLD_KINDS,
  HAZARD_CATEGORIES,
  HOLD_KINDS,
  HOLD_MACHINE,
  HOLD_STATES,
  isBlockingHold,
} from './hold.js'
export type { HazardCategory, HoldFacts, HoldKind, HoldState } from './hold.js'
export {
  addBusinessMinutes,
  BusinessHoursError,
  businessMinutesBetween,
  isWithinHours,
  nextOpening,
  readClock,
  zonedParts,
  zonedTimeToUtc,
} from './business-hours.js'
export type { ClockReading, DailyHours } from './business-hours.js'
export type {
  Qualification,
  QualificationCheck,
  QualificationEntry,
  QualificationOutcome,
  RequestAction,
} from './qualification.js'
export { PROJECT_MACHINE, PROJECT_STATES } from './project.js'
export type { ProjectFacts, ProjectState } from './project.js'
export type { ObligationFacts } from './guards.js'
export {
  CUSTOMER_NEXT_ACTIONS,
  CUSTOMER_SITUATIONS,
  CUSTOMER_STEPS,
  CUSTOMER_TIMELINE_KINDS,
  customerSituation,
  customerStatus,
  WAITING_ON,
} from './portal.js'
export type {
  CustomerNextAction,
  CustomerSituation,
  CustomerStatus,
  CustomerStep,
  CustomerTimelineKind,
  PortalFacts,
  WaitingOn,
} from './portal.js'
export {
  acceptanceProblem,
  EDITABLE_ESTIMATE_STATES,
  effectiveEstimateState,
  ESTIMATE_VERSION_MACHINE,
  ESTIMATE_VERSION_STATES,
  estimateValidUntil,
  FINAL_ESTIMATE_STATES,
  isEditableEstimateState,
} from './estimate.js'
export type { EstimateVersionEvent, EstimateVersionFacts, EstimateVersionState } from './estimate.js'
// TSK-0061: the visit model and local schedules in an explicit IANA zone.
export {
  canChangeWindow,
  COMMITTED_VISIT_STATES,
  isWorkVisitPurpose,
  VISIT_MACHINE,
  VISIT_PURPOSES,
  VISIT_STATES,
  WINDOW_CHANGE_STATES,
  WORK_VISIT_PURPOSES,
} from './visit.js'
export type { VisitEvent, VisitFacts, VisitPurpose, VisitState } from './visit.js'
export * from './local-time.js'
export * from './capacity.js'
export {
  holdExpiresAt,
  offerProblems,
  WINDOW_OFFER_MACHINE,
  WINDOW_OFFER_STATES,
  type OfferProblem,
  type WindowOfferEvent,
  type WindowOfferFacts,
  type WindowOfferPolicy,
  type WindowOfferState,
} from './window-offer.js'

export {
  hazardControls,
  itemText,
  SOP_EVIDENCE_KINDS,
  SOP_REVIEW_STATES,
  SOP_STAGES,
  SOP_VERSION_MACHINE,
  sopReadiness,
  tableRows,
} from './sop.js'
export type {
  SopContent,
  SopControl,
  SopEvidenceKind,
  SopItem,
  SopNote,
  SopPinFacts,
  SopReadiness,
  SopReadinessBlocker,
  SopReviewState,
  SopSignOffFacts,
  SopStage,
  SopStageContent,
  SopStep,
} from './sop.js'

/** Every machine, keyed `<entity>.<dimension>`. One key per state dimension, so dimensions never share a state. */
export const MACHINES = {
  'request.lifecycle': REQUEST_MACHINE,
  'project.lifecycle': PROJECT_MACHINE,
  'hold.lifecycle': HOLD_MACHINE,
  'estimate_version.lifecycle': ESTIMATE_VERSION_MACHINE,
  'visit.lifecycle': VISIT_MACHINE,
  'window_offer.lifecycle': WINDOW_OFFER_MACHINE,
  'sop_version.review': SOP_VERSION_MACHINE,
} as const
export type MachineKey = keyof typeof MACHINES
type M<K extends MachineKey> = (typeof MACHINES)[K]

/** A record's current state in one dimension, as the server read it under its row lock. */
export type EntityRef<K extends MachineKey> = {
  readonly machine: K
  readonly state: StateOf<M<K>>
  readonly version: number
}

/**
 * Applies a named event to an entity's dimension. The only way to change a state: there is no function that sets a
 * state directly. Returns the next state and version, or a refusal with a stable code and the unmet requirements.
 */
export function apply<K extends MachineKey>(
  entity: EntityRef<K>,
  event: EventOf<M<K>>,
  context: TransitionContext<FactsOf<M<K>>>,
): TransitionResult<StateOf<M<K>>, EventOf<M<K>>> {
  const machine = MACHINES[entity.machine] as unknown as Parameters<typeof transition>[0]
  if (!machine) {
    return { ok: false, code: 'UNKNOWN_STATE', message: `No machine "${String(entity.machine)}".`, problems: [] }
  }
  return transition(machine, entity, event, context as TransitionContext<unknown>) as TransitionResult<
    StateOf<M<K>>,
    EventOf<M<K>>
  >
}
