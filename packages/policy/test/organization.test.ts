// Organization memberships on the policy decision point (TSK-0118; HH-ID-13, HH-ID-03, RULE-SERVER-AUTHZ). An
// organization access reaches only the project its membership's scope names, and only for the actions its
// privileges cover; everything else stays the project customer's own. All ids are synthetic.
import { describe, expect, it } from 'vitest'
import {
  ACTIONS,
  type Action,
  type CustomerActor,
  dataScope,
  decide,
  hasProjectAccess,
  MATRIX,
  ORGANIZATION_ACTIONS,
  type OrganizationPrivilege,
  type ProjectAccess,
} from '../src/index.js'

const NOW = new Date('2026-10-26T15:00:00Z')
const member = (privileges: OrganizationPrivilege[], extra: Partial<ProjectAccess> = {}): CustomerActor => ({
  kind: 'customer',
  contactId: 'account:member-1',
  projectAccess: [{ projectId: 'p-org', via: 'organization', privileges, ...extra }],
  freshVerification: true,
})
const allowed = (actor: CustomerActor, action: Action, projectId = 'p-org') =>
  decide(actor, action, { projectId }, { now: NOW, online: true }).effect === 'allow'

/** Every action the customer column allows on a project of their own (V). */
const CUSTOMER_PROJECT_ACTIONS = MATRIX.flatMap((r) =>
  r.actions.filter((a) => r.cells.customer.rules[a]?.scope === 'customer_project'),
)

describe('organization memberships (TSK-0118, HH-ID-13)', () => {
  it('[HH-ID-13] the privilege table names only real actions the customer column holds on a project', () => {
    for (const action of Object.keys(ORGANIZATION_ACTIONS)) {
      expect(ACTIONS).toContain(action)
      expect(CUSTOMER_PROJECT_ACTIONS).toContain(action)
    }
  })

  it('[HH-ID-13][RULE-SERVER-AUTHZ] a member reads the project in scope; approve and pay need their privilege', () => {
    const reader = member([])
    expect(allowed(reader, 'request.view')).toBe(true)
    for (const a of ['estimate.approve', 'estimate.decline', 'change_order.approve', 'visit.select_window'] as const)
      expect(allowed(reader, a)).toBe(false)
    expect(allowed(reader, 'payment.view')).toBe(false)

    const approver = member(['approve'])
    expect(allowed(approver, 'estimate.approve')).toBe(true)
    expect(allowed(approver, 'visit.request_cancellation')).toBe(true)
    expect(allowed(approver, 'payment.view')).toBe(false)

    const payer = member(['pay'])
    expect(allowed(payer, 'payment.view')).toBe(true)
    expect(allowed(payer, 'estimate.approve')).toBe(false)
  })

  it('[HH-ID-13][HH-ID-03] what stays the customer’s own is refused to every membership, whatever its privileges', () => {
    const both = member(['approve', 'pay'])
    const own = CUSTOMER_PROJECT_ACTIONS.filter((a) => ORGANIZATION_ACTIONS[a] === undefined)
    expect(own).toEqual(
      expect.arrayContaining([
        'request.reply',
        'customer.edit',
        'access_code.set',
        'message.reply',
        'privacy.request_deletion',
        // TSK-0114: the repeat-service schedule the customer agreed to.
        'service_series.change',
      ]),
    )
    for (const a of own) expect(allowed(both, a)).toBe(false)
    // The same actions on a project of the account's own link stay allowed.
    const owner: CustomerActor = { ...both, projectAccess: [{ projectId: 'p-own', via: 'account' }] }
    expect(allowed(owner, 'request.reply', 'p-own')).toBe(true)
  })

  it('[HH-ID-13] a membership never reaches a project outside its scope, nor after it ends', () => {
    expect(allowed(member(['approve', 'pay']), 'request.view', 'p-other')).toBe(false)
    const ended = member(['approve'], { revokedAt: new Date(NOW.getTime() - 1) })
    expect(allowed(ended, 'request.view')).toBe(false)
    expect(hasProjectAccess(member([]), { projectId: 'p-org' }, NOW)).toBe(true)
    expect(hasProjectAccess(member([]), { projectId: 'p-org' }, NOW, 'payment.view')).toBe(false)
  })

  it('[HH-ID-13][HH-DATA-01] data scopes count an organization access only for the actions it covers', () => {
    const actor: CustomerActor = {
      ...member(['approve']),
      projectAccess: [
        { projectId: 'p-org', via: 'organization', privileges: ['approve'] },
        { projectId: 'p-own', via: 'account' },
      ],
    }
    expect(dataScope(actor, 'request.view', NOW)).toEqual({ kind: 'projects', projectIds: ['p-org', 'p-own'] })
    expect(dataScope(actor, 'estimate.approve', NOW)).toEqual({ kind: 'projects', projectIds: ['p-org', 'p-own'] })
    expect(dataScope(actor, 'payment.view', NOW)).toEqual({ kind: 'projects', projectIds: ['p-own'] })
    expect(dataScope(actor, 'message.reply', NOW)).toEqual({ kind: 'projects', projectIds: ['p-own'] })
    // A route that names no action (the account's own pages) reaches only the account's own projects.
    expect(dataScope(actor, null, NOW)).toEqual({ kind: 'projects', projectIds: ['p-own'] })
  })
})
