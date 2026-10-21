// What a staff member may see listed (TSK-0041; HH-OPS-01, HH-OPS-02, HH-STAFF-04, RULE-SERVER-AUTHZ). Lists such as
// the action queue show an item only to a role that holds the item's action in the permission matrix, and only in the
// record scope the role holds it in. Seeing an item listed is not doing it: the fresh sign-in, the written reason and
// the record conditions of the action are checked by decide() when the person acts, so they are not read here.
// Deny by default: an unknown action, a protected row (safety gates, append-only audit) or a missing grant lists
// nothing.
import type { Action, Scope } from './matrix.js'
import { rowFor } from './matrix.js'
import type { Capability, StaffRole } from './roles.js'
import { STAFF_ROLES } from './roles.js'

/** The record scopes in which one of these roles holds `action`; empty when none does. */
export function heldScopes(
  roles: readonly string[],
  capabilities: readonly string[],
  action: Action | string,
): Scope[] {
  const row = rowFor(action)
  if (!row || row.denyReason) return []
  const known = roles.filter((r): r is StaffRole => (STAFF_ROLES as readonly string[]).includes(r))
  const caps = capabilities as readonly Capability[]
  const scopes = new Set<Scope>()
  for (const role of known) {
    const rule = row.cells[role].rules[action as Action]
    if (!rule) continue
    if (rule.capability !== undefined && !caps.includes(rule.capability)) continue
    scopes.add(rule.scope)
  }
  return [...scopes]
}

/**
 * How a staff member may see records listed under `action`: `all` (scope any), `own` (only records that belong to
 * them, scope own_staff) or `none`. Assignment- and customer-scoped grants are reached from the record itself, never
 * from a top-level list.
 */
export function listingScope(
  roles: readonly string[],
  capabilities: readonly string[],
  action: Action | string,
): 'all' | 'own' | 'none' {
  const scopes = heldScopes(roles, capabilities, action)
  if (scopes.includes('any')) return 'all'
  if (scopes.includes('own_staff')) return 'own'
  return 'none'
}
