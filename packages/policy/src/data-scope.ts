// The record scope an actor reads and writes in (TSK-0037; HH-DATA-01, HH-PORT-01, HH-STAFF-04, RULE-SERVER-AUTHZ).
// decide() answers "may this actor do this to this record"; the data layer also needs "which records may this actor
// reach at all", so every query is written inside that scope and an altered ID finds nothing (the same NOT_FOUND as
// a missing record). The scope is computed here, from the same matrix, and only here: a DataScope cannot be written
// as a literal elsewhere (it carries a private brand), so a repository helper that requires one cannot be handed a
// made-up "everything" scope.
import { heldScopes } from './listing.js'
import { type Action, rowFor } from './matrix.js'
import type { Actor } from './scope.js'

declare const BRAND: unique symbol

type Branded<T> = T & { readonly [BRAND]: true }

/**
 * - `all`: a staff role holds the action with no record scope (Y).
 * - `projects`: exactly these projects: a customer's live, verified project accesses (V).
 * - `assigned`: the projects of this staff user's active job assignments (A). No job assignment is recorded yet (the
 *   scheduling tasks add them), so the data layer resolves this scope to no records until they exist.
 * - `own`: only records that belong to this staff user (their estimate, thread or report); project-wide reads reach
 *   nothing through it.
 * - `none`: nothing (a guest, the disabled AI module, an inactive account, or an action the actor does not hold).
 */
type ScopeShape =
  | { readonly kind: 'all' }
  | { readonly kind: 'projects'; readonly projectIds: readonly string[] }
  | { readonly kind: 'assigned'; readonly staffUserId: string }
  | { readonly kind: 'own'; readonly staffUserId: string }
  | { readonly kind: 'none' }
export type DataScope = Branded<ScopeShape>

const make = (s: ScopeShape): DataScope =>
  Object.freeze(s.kind === 'projects' ? { ...s, projectIds: Object.freeze([...s.projectIds]) } : { ...s }) as DataScope
export const NO_SCOPE: DataScope = make({ kind: 'none' })

/**
 * The records `actor` may reach under `action` (deny by default). `action` null is a route that authenticates the
 * caller itself: a customer still reaches only the projects of their session, and staff reach nothing through it.
 * A customer's project accesses count only while unexpired and unrevoked at `now`; a grant is never customer-wide.
 */
export function dataScope(actor: Actor, action: Action | null, now: Date): DataScope {
  switch (actor.kind) {
    case 'ai':
    case 'guest':
      return NO_SCOPE
    case 'customer': {
      if (action !== null) {
        const row = rowFor(action)
        const rule = row && !row.denyReason ? row.cells.customer.rules[action] : undefined
        if (!rule) return NO_SCOPE
        if (rule.scope !== 'customer_project') return NO_SCOPE
      }
      const t = now.getTime()
      const live = actor.projectAccess.filter(
        (g) =>
          (g.revokedAt === undefined || g.revokedAt.getTime() > t) &&
          (g.expiresAt === undefined || g.expiresAt.getTime() > t),
      )
      return make({ kind: 'projects', projectIds: [...new Set(live.map((g) => g.projectId))] })
    }
    case 'staff': {
      if (actor.status !== 'active' || action === null) return NO_SCOPE
      const scopes = new Set(heldScopes(actor.roles, actor.capabilities, action))
      if (scopes.has('any')) return make({ kind: 'all' })
      if (scopes.has('assigned')) return make({ kind: 'assigned', staffUserId: actor.userId })
      if (scopes.has('own_staff')) return make({ kind: 'own', staffUserId: actor.userId })
      return NO_SCOPE
    }
  }
}

/** Whether a project is inside the scope (for records already loaded; queries filter with the same rule). */
export function scopeIncludesProject(scope: DataScope, projectId: string): boolean {
  if (scope.kind === 'all') return true
  if (scope.kind === 'projects') return scope.projectIds.includes(projectId)
  return false
}
