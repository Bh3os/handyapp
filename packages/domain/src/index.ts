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
import { PROJECT_MACHINE } from './project.js'
import { REQUEST_MACHINE } from './request.js'

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
  NOT_A_FIT_EVENTS,
  QUALIFICATION_CHECKS,
  QUALIFICATION_OUTCOMES,
  REQUEST_ACTIONS,
  unqualifiedChecks,
} from './qualification.js'
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

/** Every machine, keyed `<entity>.<dimension>`. One key per state dimension, so dimensions never share a state. */
export const MACHINES = {
  'request.lifecycle': REQUEST_MACHINE,
  'project.lifecycle': PROJECT_MACHINE,
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
