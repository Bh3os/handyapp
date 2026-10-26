// Organization memberships (TSK-0118; HH-ID-13, HH-ID-03, ROLE-MATRIX customer column, RULE-SERVER-AUTHZ). A member
// of a customer-side organization reaches a project only when the membership's scope names it, and acts on it only as
// far as the membership's privileges go: the customer column's V cells hold for an organization access only for the
// actions listed here (deny by default). Everything else a project's own customer may do (answering questions, the
// project conversation, contact, property and access-code changes, privacy requests) stays with that customer.
// PROPOSED (no owner value, OQ-ORGANIZATION-ACCOUNTS-DETAILS): which actions each privilege covers.
import type { Action } from './matrix.js'

/** The privileges an organization administrator grants a member, beyond reading the projects in scope. */
export const ORGANIZATION_PRIVILEGES = ['approve', 'pay'] as const
export type OrganizationPrivilege = (typeof ORGANIZATION_PRIVILEGES)[number]

/**
 * What an organization access needs for each customer action it may ever take: `member` (any membership whose scope
 * names the project) or one privilege. An action that is not listed is refused to every organization access.
 * - member: the project workspace's reads (Overview, Documents, Photos, Appointments, estimates and change orders).
 * - approve: decisions that commit the customer: approve, decline or ask for changes to an estimate, approve or
 *   reject a change order, choose an offered window, ask to reschedule or cancel a visit.
 * - pay: balances and payments (the Payments tab, invoice documents, deposit amounts and Pay by Card links).
 */
export const ORGANIZATION_ACTIONS: Readonly<Partial<Record<Action, 'member' | OrganizationPrivilege>>> = {
  'request.view': 'member',
  'estimate.approve': 'approve',
  'estimate.decline': 'approve',
  'estimate.request_changes': 'approve',
  'change_order.approve': 'approve',
  'visit.select_window': 'approve',
  'visit.request_reschedule': 'approve',
  'visit.request_cancellation': 'approve',
  'payment.view': 'pay',
}

/** Whether an organization access with these privileges covers `action` (a read when no action is named). */
export function organizationAllows(privileges: readonly OrganizationPrivilege[], action: Action | undefined): boolean {
  const needs = ORGANIZATION_ACTIONS[action ?? 'request.view']
  if (needs === undefined) return false
  return needs === 'member' || privileges.includes(needs)
}
