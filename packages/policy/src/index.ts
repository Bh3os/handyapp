// @handyhub/policy: the one place authorization decisions are made (RULE-SERVER-AUTHZ; TSK-0006). Server-only: the
// package resolves to a module that throws in browser bundles, and lint refuses imports from the frontends.
export const PACKAGE_NAME = '@handyhub/policy'

export { CAPABILITIES, MATRIX_ROLES, ROLE_HEADINGS, STAFF_ROLES } from './roles.js'
export type { Capability, MatrixRole, StaffRole } from './roles.js'
export { ACTIONS, MATRIX, rowFor } from './matrix.js'
export type { Action, Cell, Condition, MatrixRow, RowDenyReason, Rule, Scope } from './matrix.js'
export { hasProjectAccess, isAssigned, isOwnRecord } from './scope.js'
export type {
  Actor,
  AiActor,
  Assignment,
  CustomerActor,
  GuestActor,
  ProjectAccess,
  Resource,
  StaffActor,
} from './scope.js'
export { actionsFor, decide } from './decide.js'
export type { Allow, Decision, DecisionContext, Deny, DenyReason } from './decide.js'
