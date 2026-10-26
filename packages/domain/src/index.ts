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
import { CHANGE_ORDER_MACHINE } from './change-order.js'
import { SOP_VERSION_MACHINE } from './sop.js'
import { WINDOW_OFFER_MACHINE } from './window-offer.js'
import { GATE_EXCEPTION_MACHINE } from './start-gate.js'
import { COMPLAINT_CASE_MACHINE, INCIDENT_CASE_MACHINE } from './case.js'
import { PUNCH_ITEM_MACHINE, QUALITY_REVIEW_MACHINE } from './quality-review.js'
import { CHECKLIST_STEP_MACHINE } from './checklist.js'
import { JOB_CLOSEOUT_MACHINE } from './closeout.js'

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
  JOB_HOLD_CATEGORIES,
  START_BLOCKING_HOLD_KINDS,
} from './hold.js'
export type { HazardCategory, HoldFacts, HoldKind, HoldState, JobHoldCategory } from './hold.js'
// TSK-0073, TSK-0074: the Start Work gate and its three owner-approved administrative exceptions.
export * from './start-gate.js'
// TSK-0077: Stop Work, Report Hazard and issue reports.
export * from './hazard.js'
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
// TSK-0078: delays, no access, customer absence and the other recorded visit outcomes.
export {
  VISIT_OUTCOME_KINDS,
  VISIT_OUTCOME_NOTE_MAX,
  VISIT_OUTCOME_STATES,
  visitOutcome,
  type VisitOutcomeKind,
  type VisitOutcomeProblem,
} from './visit-outcome.js'
export * from './local-time.js'
// TSK-0136: the internal business-day calendar and the privacy-request dates counted on it.
export * from './business-calendar.js'
export * from './zones.js'
export {
  CANCELLATION_INITIATORS,
  CANCELLATION_OUTCOMES,
  cancellationOutcome,
  HANDYHUB_CAUSES,
  needsOwnerAction,
  type CancellationFacts,
  type CancellationInitiator,
  type CancellationOutcome,
  type CancellationOutcomeKind,
  type CancellationRules,
  type HandyhubCause,
} from './cancellation.js'
export * from './capacity.js'
export {
  ACKNOWLEDGMENT_INVALIDATIONS,
  ACKNOWLEDGMENT_STATES,
  acknowledgmentState,
  changedSections,
  hasCriticalChange,
  OCCUPANT_DETAILS,
  PACKET_SECTIONS,
  PACKET_VISIT_STATES,
  packetChanges,
  SITE_ACCESS_DETAILS,
  type AcknowledgmentFacts,
  type AcknowledgmentInvalidation,
  type AcknowledgmentState,
  type PacketAccessCode,
  type PacketChange,
  type PacketContent,
  type PacketDetail,
  type PacketHold,
  type PacketLine,
  type PacketSection,
  type PacketSopPin,
  type PacketVisit,
  type PacketWorker,
  type PacketLoadout,
} from './packet.js'
// TSK-0071: loadouts, critical shortages and their task blocks.
export * from './loadout.js'
// TSK-0070: My Day, On my way, Arrived and Finished, and the per-worker timestamps.
export {
  correctionProblem,
  everyoneFinished,
  FIELD_TAPS,
  firstName,
  MY_DAY_NEXT,
  MY_DAY_VISIT_STATES,
  myDayActions,
  onMyWayOpensAt,
  STAMP_STATUSES,
  tapDecision,
  TIME_STAMP_KINDS,
  workerTimes,
  type CorrectionProblem,
  type FieldTap,
  type MyDayActions,
  type MyDayFacts,
  type MyDayNext,
  type RecordedStamp,
  type StampCorrection,
  type StampStatus,
  type StampValue,
  type TapRefusal,
  type TimesFacts,
  type TimeStampKind,
  type WorkerTimes,
} from './field-day.js'
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

// TSK-0092: a job's closeout, the Owner's reopen and the follow-ups after completion.
export * from './closeout.js'

/** Every machine, keyed `<entity>.<dimension>`. One key per state dimension, so dimensions never share a state. */
export const MACHINES = {
  'request.lifecycle': REQUEST_MACHINE,
  'project.lifecycle': PROJECT_MACHINE,
  'hold.lifecycle': HOLD_MACHINE,
  'estimate_version.lifecycle': ESTIMATE_VERSION_MACHINE,
  'visit.lifecycle': VISIT_MACHINE,
  'window_offer.lifecycle': WINDOW_OFFER_MACHINE,
  'sop_version.review': SOP_VERSION_MACHINE,
  'gate_exception.lifecycle': GATE_EXCEPTION_MACHINE,
  // TSK-0093: the two case lifecycles of ENT-Case.
  'complaint_case.lifecycle': COMPLAINT_CASE_MACHINE,
  'incident_case.lifecycle': INCIDENT_CASE_MACHINE,
  // TSK-0084: the Owner's quality review and its punch items.
  'quality_review.lifecycle': QUALITY_REVIEW_MACHINE,
  'punch_item.lifecycle': PUNCH_ITEM_MACHINE,
  // TSK-0075: a step of the job checklist.
  'checklist_step.lifecycle': CHECKLIST_STEP_MACHINE,
  // TSK-0081: a change-order version.
  'change_order.lifecycle': CHANGE_ORDER_MACHINE,
  // TSK-0092: a job's closeout and the Owner's reopen.
  'job.closeout': JOB_CLOSEOUT_MACHINE,
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
// TSK-0130 (HH-EST-16, OWN-DEC-173): the Owner approval policy for publishing estimates and, later, change orders.
export {
  evaluateChangeOrderPublication,
  evaluateEstimatePublication,
  marginOf,
  PUBLICATION_APPROVAL_BASES,
  PUBLICATION_APPROVAL_FLAGS,
  PUBLICATION_APPROVAL_REASONS,
  PUBLICATION_APPROVAL_STATES,
  PUBLICATION_INVALIDATION_REASONS,
  PUBLICATION_SUBJECTS,
} from './publication-approval.js'
export type {
  ApprovalThreshold,
  ChangeOrderPublicationFacts,
  CostFacts,
  CreditPolicy,
  EstimatePublicationFacts,
  LinkedDocument,
  Margin,
  PriceAdjustment,
  PublicationApprovalBasis,
  PublicationApprovalFlag,
  PublicationApprovalReason,
  PublicationApprovalState,
  PublicationEvaluation,
  PublicationInvalidationReason,
  PublicationSubject,
} from './publication-approval.js'
// TSK-0125 (HH-EST-15, OWN-DEC-165): discount requests and their staff verification.
export {
  DISCOUNT_CATEGORIES,
  DISCOUNT_RESULT_PROBLEMS,
  DISCOUNT_RESULTS,
  DISCOUNT_STATES,
  discountFailed,
  discountResultProblem,
  discountState,
  isDiscountCategory,
  returningWindowStart,
} from './discount.js'
export type {
  DiscountCategory,
  DiscountResult,
  DiscountResultInput,
  DiscountResultProblem,
  DiscountState,
} from './discount.js'
// TSK-0093 (HH-QA-06, HH-INC-01, HH-INC-02, HH-INC-04, ENT-Case): cases, their lifecycles and customer updates.
export {
  CASE_EVENTS,
  CASE_KINDS,
  CASE_SEVERITIES,
  CASE_SOURCES,
  CASE_STATES,
  caseMachineOf,
  COMPLAINT_CASE_MACHINE,
  COMPLAINT_CATEGORIES,
  COMPLAINT_SOURCES,
  COMPLAINT_STATES,
  CUSTOMER_UPDATE_DETAIL_MAX,
  CUSTOMER_UPDATE_KINDS,
  CUSTOMER_UPDATE_TEMPLATES,
  customerUpdateText,
  FOLLOW_UP_STATES,
  FORBIDDEN_CASE_WORDING,
  forbiddenCaseWording,
  INCIDENT_CASE_MACHINE,
  INCIDENT_STATES,
  INCIDENT_TYPES,
  initialStateOf,
  isActiveCase,
  isRestrictedKind,
  kindOfIncident,
  notifiesOwner,
  OWNER_NOTIFIED_KINDS,
  REFERRAL_PROFESSIONALS,
  RESTRICTED_CASE_KINDS,
  REVIEW_AREAS,
  reviewAreasOf,
  safetyPauseTruthful,
} from './case.js'
export type {
  CaseEvent,
  CaseFacts,
  CaseKind,
  CaseSeverity,
  CaseSource,
  CaseState,
  ComplaintCategory,
  ComplaintEvent,
  ComplaintState,
  CustomerUpdateKind,
  FollowUpState,
  IncidentEvent,
  IncidentState,
  IncidentType,
  ReferralProfessional,
  ReviewArea,
} from './case.js'
// TSK-0084 (HH-QA-02, HH-QA-04, ENT-QAInspection, ENT-PunchItem): the Owner's quality review and punch items.
export * from './quality-review.js'
// TSK-0075 (HH-WORK-11, HH-WORK-05, ENT-Task): the job checklist in six ordered stages.
export * from './checklist.js'
// TSK-0083 (HH-QA-01, HH-QA-03, HH-WORK-12, ENT-Walkthrough): the walkthrough and Finished for quality review.
export * from './completion.js'
export * from './change-order.js'
// TSK-0142: the launch phases and their switches (OWN-DEC-191).
export * from './launch.js'
// TSK-0151 (OWN-DEC-200 H7): what a general Owner override may waive; mandatory restrictions never.
export * from './overrides.js'
// TSK-0129 (HH-PKT-09, OWN-DEC-172): Call Owner and Call 911 in every job packet; the Owner's number format.
export * from './escalation.js'
// TSK-0094 (HH-QA-07, HH-QA-08, HH-INC-03, FACT-WARRANTY): return work, the warranty window and resuming.
export * from './return-work.js'
// TSK-0126 (OWN-DEC-167): the three first-visit site checks, site-contact authority and address pre-validation.
export * from './site-checks.js'
// TSK-0128 (HH-PKT-08, OWN-DEC-171): the visit-day data access of the assigned workers and Owner extensions.
export * from './visit-access.js'
// TSK-0095 (HH-FIN-17, HH-DATA-10): estimated versus actual job costs; report definitions with their source states.
export * from './job-costs.js'
export * from './job-margin.js'
export * from './report-sources.js'
export * from './owner-dashboard.js'
