// Staff app navigation by role (TSK-0040; S00 step 4, S01, ROLE-MATRIX). Navigation is derived from the permission
// matrix, never listed per role: an item appears only when one of the actor's roles holds one of its gate actions
// without a record-scope restriction (scope `any`, or `own_staff` for the actor's own records). Record-scoped grants
// (`assigned`, `customer_project`) are reached from the record itself, not from the top-level menu. Anything else is
// absent (deny by default). Menus are a convenience: the server still decides every request (RULE-SERVER-AUTHZ).
import type { Action, Rule } from './matrix.js'
import { rowFor } from './matrix.js'
import type { Capability, StaffRole } from './roles.js'
import { STAFF_ROLES } from './roles.js'

/**
 * The staff app's top-level screens, in menu order, each with the actions that open it (PROPOSED mapping; the journeys
 * name who acts: S01 queue, S07 My Day, S02 requests, S03 records, S04 estimates, S05 board, S06 inbox, C10 payments,
 * S10 cases, S09 staff and audit, S11 dashboard, S08 configuration).
 */
export const NAV_ITEMS = [
  { id: 'queue', gate: ['request.view'] },
  { id: 'my-day', gate: ['schedule.view_my_day'] },
  { id: 'requests', gate: ['request.view'] },
  { id: 'customers', gate: ['customer.view'] },
  { id: 'estimates', gate: ['estimate.draft'] },
  { id: 'schedule', gate: ['schedule.view_board'] },
  { id: 'inbox', gate: ['message.reply'] },
  { id: 'payments', gate: ['payment.view'] },
  { id: 'cases', gate: ['case.record_complaint'] },
  { id: 'staff', gate: ['staff.invite'] },
  { id: 'audit', gate: ['audit.view'] },
  { id: 'dashboard', gate: ['dashboard.view'] },
  { id: 'settings', gate: ['policy_values.change'] },
] as const satisfies readonly { id: string; gate: readonly Action[] }[]
export type NavId = (typeof NAV_ITEMS)[number]['id']
export const NAV_IDS: readonly NavId[] = NAV_ITEMS.map((i) => i.id)

/** What the staff search box may look through (PROPOSED); the search itself is scoped again on the server (HH-OPS-02). */
export const SEARCH_SCOPES = [
  { id: 'requests', gate: ['request.view'] },
  { id: 'customers', gate: ['customer.view'] },
] as const satisfies readonly { id: string; gate: readonly Action[] }[]
export type SearchScope = (typeof SEARCH_SCOPES)[number]['id']

/** The home screen after sign-in (S00 step 4): the action queue, else My Day, else none. */
const HOME_ORDER: readonly NavId[] = ['queue', 'my-day']

export type StaffNavigation = { home: NavId | null; items: NavId[]; search: SearchScope[] }

const TOP_LEVEL = new Set<Rule['scope']>(['any', 'own_staff'])

function opens(
  gate: readonly Action[],
  roles: readonly StaffRole[],
  capabilities: readonly Capability[],
): boolean {
  return gate.some((action) => {
    const row = rowFor(action)
    if (!row || row.denyReason) return false
    return roles.some((role) => {
      const rule = row.cells[role].rules[action]
      if (!rule || !TOP_LEVEL.has(rule.scope)) return false
      return rule.capability === undefined || capabilities.includes(rule.capability)
    })
  })
}

/** The navigation of a staff member with these roles; unknown role names grant nothing. */
export function navigationFor(roles: readonly string[], capabilities: readonly string[] = []): StaffNavigation {
  const known = roles.filter((r): r is StaffRole => (STAFF_ROLES as readonly string[]).includes(r))
  const caps = capabilities as readonly Capability[]
  const items = NAV_ITEMS.filter((i) => opens(i.gate, known, caps)).map((i) => i.id)
  const search = SEARCH_SCOPES.filter((s) => opens(s.gate, known, caps)).map((s) => s.id)
  return { home: HOME_ORDER.find((id) => items.includes(id)) ?? null, items, search }
}
