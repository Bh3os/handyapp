// Who reads each visibility class (TSK-0044; HH-STAFF-05, HH-STAFF-04, OWN-DEC-143, ROLE-MATRIX).
import { describe, expect, it } from 'vitest'
import { readsVisibility, type Actor, type StaffActor } from '../src/index.js'

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
const customer: Actor = { kind: 'customer', contactId: 'c-1', projectAccess: [], freshVerification: false }
const read = (actor: Actor, cls: string, owner?: string) =>
  readsVisibility(actor, cls, owner ? { projectId: 'p-1', ownerStaffId: owner } : { projectId: 'p-1' }, now)

describe('visibility classes (TSK-0044, HH-STAFF-05)', () => {
  it('[HH-STAFF-05] internal_operational is for staff only; a customer reads only customer_shared', () => {
    for (const role of ['owner', 'office', 'estimator', 'worker'] as const)
      expect(read(staff([role]), 'internal_operational').allowed, role).toBe(true)
    expect(read(customer, 'internal_operational').allowed).toBe(false)
    expect(read(customer, 'restricted_incident').allowed).toBe(false)
    expect(read(customer, 'restricted_financial').allowed).toBe(false)
    expect(read(customer, 'customer_shared').allowed).toBe(true)
    expect(read({ kind: 'guest' }, 'customer_shared').allowed).toBe(false)
    expect(read({ kind: 'ai' }, 'internal_operational').allowed).toBe(false)
  })

  it('[HH-STAFF-05][OWN-DEC-143] restricted incident detail: the Owner (audited) and the reporting worker only, never Office', () => {
    expect(read(staff(['owner']), 'restricted_incident')).toEqual({ allowed: true, audit: true })
    expect(read(staff(['office']), 'restricted_incident').allowed).toBe(false)
    expect(read(staff(['estimator']), 'restricted_incident').allowed).toBe(false)
    expect(read(staff(['worker']), 'restricted_incident', 'staff-1').allowed).toBe(true)
    expect(read(staff(['worker']), 'restricted_incident', 'staff-2').allowed).toBe(false)
    expect(read(staff(['worker']), 'restricted_incident').allowed).toBe(false)
  })

  it('[HH-STAFF-05][HH-STAFF-04] restricted financial detail: the Owner; an Estimator only for their own (PROPOSED)', () => {
    expect(read(staff(['owner']), 'restricted_financial').allowed).toBe(true)
    expect(read(staff(['office']), 'restricted_financial').allowed).toBe(false)
    expect(read(staff(['worker']), 'restricted_financial', 'staff-1').allowed).toBe(false)
    expect(read(staff(['estimator']), 'restricted_financial', 'staff-1').allowed).toBe(true)
    expect(read(staff(['estimator']), 'restricted_financial', 'staff-2').allowed).toBe(false)
  })

  it('[HH-STAFF-05] deny by default: an unknown class or an inactive account reads nothing', () => {
    expect(read(staff(['owner']), 'public').allowed).toBe(false)
    expect(read(staff(['owner'], { status: 'disabled' }), 'internal_operational').allowed).toBe(false)
  })
})
