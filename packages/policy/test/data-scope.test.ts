// The record scope an actor reads and writes in (TSK-0037; HH-DATA-01, HH-PORT-01, HH-STAFF-04, RULE-SERVER-AUTHZ).
import { describe, expect, it } from 'vitest'
import { dataScope, NO_SCOPE, scopeIncludesProject, type Actor, type StaffActor } from '../src/index.js'

const now = new Date('2026-10-21T12:00:00Z')
const staff = (roles: StaffActor['roles'], over: Partial<StaffActor> = {}): StaffActor => ({
  kind: 'staff',
  userId: 'staff-1',
  roles,
  capabilities: [],
  status: 'active',
  freshAuth: false,
  ...over,
})
const customer = (projectAccess: Extract<Actor, { kind: 'customer' }>['projectAccess']): Actor => ({
  kind: 'customer',
  contactId: 'contact-1',
  projectAccess,
  freshVerification: false,
})

describe('data scopes (TSK-0037, HH-DATA-01)', () => {
  it('[HH-DATA-01][HH-PORT-01] a customer reaches exactly the live projects of their session, never more', () => {
    const scope = dataScope(
      customer([
        { projectId: 'p-a', via: 'grant' },
        { projectId: 'p-b', via: 'grant', expiresAt: new Date(now.getTime() - 1) },
        { projectId: 'p-c', via: 'account', revokedAt: new Date(now.getTime() - 1) },
        { projectId: 'p-d', via: 'account', expiresAt: new Date(now.getTime() + 60_000) },
        { projectId: 'p-a', via: 'account' },
      ]),
      'request.view',
      now,
    )
    expect(scope).toEqual({ kind: 'projects', projectIds: ['p-a', 'p-d'] })
    expect(scopeIncludesProject(scope, 'p-a')).toBe(true)
    expect(scopeIncludesProject(scope, 'p-b')).toBe(false)
    // An authenticating route (no action) still reaches only the session's projects.
    expect(dataScope(customer([{ projectId: 'p-a', via: 'grant' }]), null, now)).toEqual({
      kind: 'projects',
      projectIds: ['p-a'],
    })
    // An action the customer column does not hold, or holds without a record scope, reaches nothing.
    expect(dataScope(customer([{ projectId: 'p-a', via: 'grant' }]), 'payment.refund', now)).toBe(NO_SCOPE)
    expect(dataScope(customer([{ projectId: 'p-a', via: 'grant' }]), 'request.submit', now)).toBe(NO_SCOPE)
  })

  it('[HH-STAFF-04][HH-TEST-02] staff reach what their widest matrix grant names; deny by default', () => {
    for (const role of ['owner', 'office', 'estimator'] as const)
      expect(dataScope(staff([role]), 'request.view', now)).toEqual({ kind: 'all' })
    expect(dataScope(staff(['worker']), 'request.view', now)).toBe(NO_SCOPE)
    // TSK-0155 (OWN-DEC-211): a worker never replies to a customer; they propose a reply from an assigned job.
    expect(dataScope(staff(['worker']), 'message.reply', now)).toBe(NO_SCOPE)
    expect(dataScope(staff(['worker']), 'message.propose_reply', now)).toEqual({
      kind: 'assigned',
      staffUserId: 'staff-1',
    })
    expect(dataScope(staff(['estimator']), 'message.reply', now)).toEqual({ kind: 'own', staffUserId: 'staff-1' })
    // Several roles: the widest grant counts.
    expect(dataScope(staff(['worker', 'office']), 'message.reply', now)).toEqual({ kind: 'all' })
    // A capability-bound grant needs the capability.
    expect(dataScope(staff(['worker']), 'payment.view', now)).toBe(NO_SCOPE)
    expect(dataScope(staff(['worker'], { capabilities: ['collect'] }), 'payment.view', now).kind).toBe('assigned')
    // Inactive accounts, authenticating routes and protected rows reach nothing.
    expect(dataScope(staff(['owner'], { status: 'disabled' }), 'request.view', now)).toBe(NO_SCOPE)
    expect(dataScope(staff(['owner'], { status: 'invited' }), 'request.view', now)).toBe(NO_SCOPE)
    expect(dataScope(staff(['owner']), null, now)).toBe(NO_SCOPE)
    expect(dataScope(staff(['owner']), 'audit.delete', now)).toBe(NO_SCOPE)
    expect(dataScope(staff(['owner']), 'hold.override_critical', now)).toBe(NO_SCOPE)
    expect(scopeIncludesProject(dataScope(staff(['owner']), 'request.view', now), 'any-project')).toBe(true)
  })

  it('[RULE-AI-WAVE2][HH-DATA-01] guests and the disabled AI module reach no record; a scope cannot be altered', () => {
    expect(dataScope({ kind: 'guest' }, 'request.view', now)).toBe(NO_SCOPE)
    expect(dataScope({ kind: 'ai' }, 'request.view', now)).toBe(NO_SCOPE)
    const scope = dataScope(customer([{ projectId: 'p-a', via: 'grant' }]), 'request.view', now)
    expect(Object.isFrozen(scope)).toBe(true)
    expect(() => {
      ;(scope as { kind: string }).kind = 'all'
    }).toThrow(TypeError)
    expect(() => (scope as unknown as { projectIds: string[] }).projectIds.push('p-b')).toThrow(TypeError)
  })
})
