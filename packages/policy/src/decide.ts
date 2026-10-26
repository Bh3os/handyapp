// The policy decision point (RULE-SERVER-AUTHZ; HH-STAFF-03, HH-STAFF-04; ROLE-MATRIX). Deny by default: an action
// is allowed only when one of the actor's matrix columns has a rule for it and every requirement of that rule holds.
// The enforcement point on every route calls decide() and turns a deny into the stable error shape (HH-API-03);
// state gates (the Start Work gate, holds, quality review) are checked by the domain after an allow.
import { ACTIONS, type Action, type Condition, MATRIX, type Rule, rowFor } from './matrix.js'
import type { MatrixRole, StaffRole } from './roles.js'
import { type Actor, hasProjectAccess, isAssigned, isOwnRecord, type Resource } from './scope.js'

/** Request facts the rules read; computed by the server for this request. */
export type DecisionContext = {
  readonly now: Date
  /** The request comes from an online client (never an offline replay). */
  readonly online?: boolean
  /** Today's date as YYYY-MM-DD in the business time zone. */
  readonly today?: string
  /** The written reason the user gave, when the action needs one. */
  readonly reason?: string
  /** The staff roles the Owner's publishing policy currently lets publish estimates (OWN-DEC-118). */
  readonly publishingRoles?: readonly StaffRole[]
}

export type DenyReason =
  | 'UNKNOWN_ACTION'
  | 'AI_DISABLED'
  | 'ACCOUNT_NOT_ACTIVE'
  | 'NOT_PERMITTED'
  /** A customer or guest asked for a record outside their scope: answered exactly like a missing object (T19). */
  | 'NOT_FOUND'
  | 'NOT_ASSIGNED'
  | 'NOT_OWN_RECORD'
  | 'CAPABILITY_REQUIRED'
  | 'FRESH_AUTH_REQUIRED'
  | 'REASON_REQUIRED'
  | 'FRESH_VERIFICATION_REQUIRED'
  | 'PUBLISHING_NOT_GRANTED'
  | 'OWN_CRITICAL_HOLD'
  | 'SELF_COLLECTED'
  | 'NOT_OWN_COLLECTION'
  | 'NOT_VISIT_DATE'
  | 'OFFLINE'
  | 'SELF_GRANT'
  | 'MISSING_FACT'
  | 'SAFETY_GATE_NOT_OVERRIDABLE'
  | 'AUDIT_APPEND_ONLY'

export type Allow = {
  readonly effect: 'allow'
  readonly action: Action
  /** The matrix column whose rule allowed it. */
  readonly role: MatrixRole
  /** The action must be written to the audit log. */
  readonly audit: boolean
  /** Field or view limitation the projection must apply. */
  readonly limit?: string
  /** A server gate the action must still pass. */
  readonly gate?: string
  /** The allowing cell is PROPOSED, not owner-decided. */
  readonly proposed: boolean
}

export type Deny = {
  readonly effect: 'deny'
  readonly action: string
  readonly reason: DenyReason
  readonly message: string
}

export type Decision = Allow | Deny

const MESSAGES: Record<DenyReason, string> = {
  UNKNOWN_ACTION: 'This action is not known to the policy.',
  AI_DISABLED: 'The AI module is disabled and holds no permissions.',
  ACCOUNT_NOT_ACTIVE: 'This staff account is not active.',
  NOT_PERMITTED: 'Your role does not allow this action.',
  NOT_FOUND: 'Not found.',
  NOT_ASSIGNED: 'You are not assigned to this job, or its access window is closed.',
  NOT_OWN_RECORD: 'This action is limited to your own records.',
  CAPABILITY_REQUIRED: 'This action needs a permission the Owner grants per person.',
  FRESH_AUTH_REQUIRED: 'Sign in again (password or authenticator code) to do this.',
  REASON_REQUIRED: 'A written reason is required.',
  FRESH_VERIFICATION_REQUIRED: 'Verify your email or phone again to continue.',
  PUBLISHING_NOT_GRANTED: "The Owner's publishing policy does not let your role publish estimates.",
  OWN_CRITICAL_HOLD: 'Nobody releases a critical safety hold they raised.',
  SELF_COLLECTED: 'The person who collected a payment cannot clear or reconcile it.',
  NOT_OWN_COLLECTION: 'You can record only a payment you collected yourself.',
  NOT_VISIT_DATE: 'Access codes are shown only on the visit date.',
  OFFLINE: 'This needs an online connection.',
  SELF_GRANT: 'Nobody grants themselves a role or permission.',
  MISSING_FACT: 'The server is missing a fact this decision needs.',
  SAFETY_GATE_NOT_OVERRIDABLE: 'No role can override the Start Work gate or a critical hold.',
  AUDIT_APPEND_ONLY: 'Audit events are append-only; corrections are new entries.',
}

const deny = (action: string, reason: DenyReason): Deny => ({
  effect: 'deny',
  action,
  reason,
  message: MESSAGES[reason],
})

const KNOWN = new Set<string>(ACTIONS)

/** The matrix columns an actor acts in. */
function columnsOf(actor: Actor): readonly MatrixRole[] {
  switch (actor.kind) {
    case 'staff':
      return actor.roles
    case 'customer':
      return ['customer']
    case 'guest':
      return ['guest']
    case 'ai':
      return []
  }
}

/** Checks one rule; returns null when it allows, or the first unmet requirement. */
function check(
  rule: Rule,
  role: MatrixRole,
  actor: Actor,
  resource: Resource,
  ctx: DecisionContext,
): DenyReason | null {
  switch (rule.scope) {
    case 'any':
      break
    case 'assigned':
      if (!isAssigned(actor, resource, ctx.now)) return 'NOT_ASSIGNED'
      break
    case 'own_staff':
      if (!isOwnRecord(actor, resource)) return 'NOT_OWN_RECORD'
      break
    case 'customer_project':
      if (!hasProjectAccess(actor, resource, ctx.now)) return 'NOT_FOUND'
      break
  }
  if (rule.capability !== undefined && (actor.kind !== 'staff' || !actor.capabilities.includes(rule.capability))) {
    return 'CAPABILITY_REQUIRED'
  }
  for (const c of rule.conditions ?? []) {
    const unmet = condition(c, role, actor, resource, ctx)
    if (unmet) return unmet
  }
  if (rule.fresh && (actor.kind !== 'staff' || !actor.freshAuth)) return 'FRESH_AUTH_REQUIRED'
  if (rule.reason && (ctx.reason === undefined || ctx.reason.trim() === '')) return 'REASON_REQUIRED'
  return null
}

function condition(
  c: Condition,
  role: MatrixRole,
  actor: Actor,
  resource: Resource,
  ctx: DecisionContext,
): DenyReason | null {
  const userId = actor.kind === 'staff' ? actor.userId : undefined
  switch (c) {
    case 'publishing_policy':
      return (ctx.publishingRoles ?? []).includes(role as StaffRole) ? null : 'PUBLISHING_NOT_GRANTED'
    case 'not_raised_by_actor':
      if (resource.raisedByStaffId === undefined) return 'MISSING_FACT'
      return resource.raisedByStaffId === userId ? 'OWN_CRITICAL_HOLD' : null
    case 'not_self_collected':
      if (resource.collectedByStaffId === undefined) return 'MISSING_FACT'
      return resource.collectedByStaffId === userId ? 'SELF_COLLECTED' : null
    case 'own_collection':
      return resource.collectedByStaffId !== undefined && resource.collectedByStaffId === userId
        ? null
        : 'NOT_OWN_COLLECTION'
    case 'visit_date': {
      // TSK-0128 (OWN-DEC-171): the property's local service day, or an Owner extension while it lasts.
      if (resource.extendedUntil !== undefined && ctx.now.getTime() < resource.extendedUntil.getTime()) return null
      const today = resource.visitToday ?? ctx.today
      if (resource.visitDate === undefined || today === undefined) return 'MISSING_FACT'
      return resource.visitDate === today ? null : 'NOT_VISIT_DATE'
    }
    case 'online':
      return ctx.online === true ? null : 'OFFLINE'
    case 'customer_fresh_verification':
      return actor.kind === 'customer' && actor.freshVerification ? null : 'FRESH_VERIFICATION_REQUIRED'
    case 'not_self_subject':
      if (resource.subjectStaffId === undefined) return 'MISSING_FACT'
      return resource.subjectStaffId === userId ? 'SELF_GRANT' : null
  }
}

/**
 * Decides whether `actor` may perform `action` on the record described by `resource`. Deny by default; the first
 * column whose rule is fully met allows. When none allows, the reason of the first rule that applied is returned
 * (so the user learns what is missing); a customer or guest outside their scope gets NOT_FOUND, like a missing object.
 */
export function decide(actor: Actor, action: Action, resource: Resource, ctx: DecisionContext): Decision {
  if (!KNOWN.has(action)) return deny(String(action), 'UNKNOWN_ACTION')
  const row = rowFor(action)
  if (!row) return deny(action, 'UNKNOWN_ACTION')
  if (actor.kind === 'ai') return deny(action, 'AI_DISABLED')
  if (row.denyReason) return deny(action, row.denyReason)
  if (actor.kind === 'staff' && actor.status !== 'active') return deny(action, 'ACCOUNT_NOT_ACTIVE')

  let firstUnmet: DenyReason | null = null
  for (const role of columnsOf(actor)) {
    const rule = row.cells[role].rules[action]
    if (!rule) continue
    const unmet = check(rule, role, actor, resource, ctx)
    if (unmet === null) {
      return {
        effect: 'allow',
        action,
        role,
        audit: Boolean(rule.audit || rule.fresh || rule.reason),
        ...(rule.limit !== undefined ? { limit: rule.limit } : {}),
        ...(rule.gate !== undefined ? { gate: rule.gate } : {}),
        proposed: rule.proposed === true,
      }
    }
    firstUnmet ??= unmet
  }
  if (firstUnmet) return deny(action, firstUnmet)
  return deny(action, actor.kind === 'staff' ? 'NOT_PERMITTED' : 'NOT_FOUND')
}

/** The actions a set of matrix columns can ever be allowed (for menus; the server still decides every request). */
export function actionsFor(roles: readonly MatrixRole[]): Action[] {
  return MATRIX.flatMap((r) => r.actions.filter((a) => roles.some((role) => r.cells[role].rules[a] !== undefined)))
}
