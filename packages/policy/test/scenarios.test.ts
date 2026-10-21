// Acceptance scenarios on the policy decision point (TSK-0006; T26, T64, T19, T28, T68; RULE-SERVER-AUTHZ,
// RULE-SAFETY-GATES, RULE-AI-WAVE2, HH-STAFF-03, HH-FIN-03). All people and ids are synthetic.
import { describe, expect, it } from 'vitest'
import {
  actionsFor,
  type Action,
  type CustomerActor,
  decide,
  type DecisionContext,
  hasProjectAccess,
  isAssigned,
  isOwnRecord,
  type Resource,
  type StaffActor,
  type StaffRole,
} from '../src/index.js'

const NOW = new Date('2026-10-20T15:00:00Z')
const ctx = (extra: Partial<DecisionContext> = {}): DecisionContext => ({
  now: NOW,
  online: true,
  today: '2026-10-20',
  publishingRoles: ['owner', 'estimator'],
  ...extra,
})
const staff = (userId: string, roles: StaffRole[], extra: Partial<StaffActor> = {}): StaffActor => ({
  kind: 'staff',
  userId,
  roles,
  capabilities: [],
  status: 'active',
  freshAuth: false,
  ...extra,
})
const owner = staff('owner-1', ['owner', 'office', 'estimator', 'worker'])
const office = staff('office-1', ['office'])
const estimator = staff('estimator-1', ['estimator'])
const worker = staff('worker-1', ['worker'])
const job: Resource = {
  projectId: 'project-a',
  assignments: [
    { staffUserId: 'worker-1', from: new Date('2026-10-19T00:00:00Z'), to: new Date('2026-10-21T00:00:00Z') },
  ],
  visitDate: '2026-10-20',
}
const customerA: CustomerActor = {
  kind: 'customer',
  contactId: 'contact-a',
  projectAccess: [{ projectId: 'project-a', via: 'grant', expiresAt: new Date('2026-11-01T00:00:00Z') }],
  freshVerification: true,
}
const effect = (d: ReturnType<typeof decide>) => (d.effect === 'allow' ? 'allow' : d.reason)

describe('T26: role and assignment checks deny unrelated access, pricing, refunds and exports', () => {
  it('a worker cannot open the packet of a job they are not assigned to', () => {
    expect(effect(decide(worker, 'job.view_packet', job, ctx()))).toBe('allow')
    expect(effect(decide(worker, 'job.view_packet', { projectId: 'project-b', assignments: [] }, ctx()))).toBe(
      'NOT_ASSIGNED',
    )
  })

  it('workers and office users cannot publish an estimate; estimators can while the policy grants it', () => {
    expect(effect(decide(worker, 'estimate.publish', job, ctx()))).toBe('NOT_PERMITTED')
    expect(effect(decide(office, 'estimate.publish', job, ctx()))).toBe('NOT_PERMITTED')
    expect(effect(decide(estimator, 'estimate.publish', job, ctx()))).toBe('allow')
  })

  it('after the Owner removes the estimator publish permission, the estimator is refused (OWN-DEC-118)', () => {
    expect(effect(decide(estimator, 'estimate.publish', job, ctx({ publishingRoles: ['owner'] })))).toBe(
      'PUBLISHING_NOT_GRANTED',
    )
    expect(effect(decide(owner, 'estimate.publish', job, ctx({ publishingRoles: [] })))).toBe('allow')
  })

  it('an estimator cannot refund and office cannot run a bulk export', () => {
    expect(effect(decide(estimator, 'payment.refund', job, ctx()))).toBe('NOT_PERMITTED')
    expect(effect(decide(office, 'export.bulk', job, ctx({ reason: 'x' })))).toBe('NOT_PERMITTED')
  })

  it('internal cost is limited to the owner and to the estimator on their own estimates', () => {
    expect(effect(decide(estimator, 'estimate.view_internal_cost', { ownerStaffId: 'estimator-1' }, ctx()))).toBe(
      'allow',
    )
    expect(effect(decide(estimator, 'estimate.view_internal_cost', { ownerStaffId: 'owner-1' }, ctx()))).toBe(
      'NOT_OWN_RECORD',
    )
    expect(effect(decide(office, 'estimate.view_internal_cost', {}, ctx()))).toBe('NOT_PERMITTED')
    expect(effect(decide(worker, 'estimate.view_internal_cost', job, ctx()))).toBe('NOT_PERMITTED')
  })
})

describe('T64: only the Owner refunds, writes off, waives, reopens or exports, with fresh sign-in (HH-STAFF-03)', () => {
  const ownerOnly: Action[] = ['payment.refund', 'payment.write_off', 'deposit.waive', 'job.reopen', 'export.bulk']

  it('every non-Owner attempt is refused, even with a fresh sign-in and a reason', () => {
    for (const who of [worker, office, estimator]) {
      for (const a of ownerOnly) {
        const d = decide({ ...who, freshAuth: true }, a, job, ctx({ reason: 'synthetic' }))
        expect(d.effect, `${who.userId} ${a}`).toBe('deny')
      }
    }
  })

  it('the Owner succeeds only with a fresh sign-in and a reason, and each is audited', () => {
    for (const a of ownerOnly) {
      expect(effect(decide(owner, a, job, ctx({ reason: 'synthetic' })))).toBe('FRESH_AUTH_REQUIRED')
      expect(effect(decide({ ...owner, freshAuth: true }, a, job, ctx()))).toBe('REASON_REQUIRED')
      const d = decide({ ...owner, freshAuth: true }, a, job, ctx({ reason: 'synthetic' }))
      expect(d).toMatchObject({ effect: 'allow', role: 'owner', audit: true })
    }
  })

  it('office issues a reviewed invoice, enters the Square link and records a payment, but cannot clear a check (OWN-DEC-138)', () => {
    expect(decide(office, 'invoice.issue', job, ctx())).toMatchObject({
      effect: 'allow',
      gate: 'quality_review_passed',
    })
    expect(effect(decide(office, 'invoice.enter_payment_link', job, ctx()))).toBe('allow')
    expect(effect(decide(office, 'payment.record', job, ctx()))).toBe('allow')
    expect(effect(decide(office, 'check.mark_cleared', { ...job, collectedByStaffId: 'worker-1' }, ctx()))).toBe(
      'NOT_PERMITTED',
    )
    expect(effect(decide(owner, 'check.mark_cleared', { ...job, collectedByStaffId: 'worker-1' }, ctx()))).toBe('allow')
  })

  it('office may only request refunds and cancellation outcomes (PROPOSED)', () => {
    expect(decide(office, 'finance_adjustment.request', job, ctx())).toMatchObject({ effect: 'allow', proposed: true })
    expect(decide(office, 'cancellation_outcome.request', job, ctx())).toMatchObject({ effect: 'allow' })
    expect(
      effect(decide({ ...office, freshAuth: true }, 'cancellation_outcome.apply', job, ctx({ reason: 'x' }))),
    ).toBe('NOT_PERMITTED')
  })
})

describe('HH-FIN-03: financial permissions are separate capabilities', () => {
  const collector = staff('worker-1', ['worker'], { capabilities: ['collect'] })

  it('a worker records their own on-site collection only with the collect capability, on an assigned job', () => {
    const own = { ...job, collectedByStaffId: 'worker-1' }
    expect(effect(decide(worker, 'payment.record', own, ctx()))).toBe('CAPABILITY_REQUIRED')
    expect(decide(collector, 'payment.record', own, ctx())).toMatchObject({ effect: 'allow', proposed: true })
    expect(effect(decide(collector, 'payment.record', { ...job, collectedByStaffId: 'office-1' }, ctx()))).toBe(
      'NOT_OWN_COLLECTION',
    )
    expect(effect(decide(collector, 'payment.record', { ...own, assignments: [] }, ctx()))).toBe('NOT_ASSIGNED')
  })

  it('the collector never clears or reconciles their own collection, even the Owner (OWN-DEC-28, PROPOSED)', () => {
    const ownCash = { ...job, collectedByStaffId: 'owner-1' }
    expect(effect(decide(owner, 'check.mark_cleared', ownCash, ctx()))).toBe('SELF_COLLECTED')
    expect(effect(decide(owner, 'payment.reconcile', ownCash, ctx()))).toBe('SELF_COLLECTED')
    expect(effect(decide(owner, 'check.mark_cleared', job, ctx()))).toBe('MISSING_FACT')
    expect(effect(decide(collector, 'check.mark_cleared', { ...job, collectedByStaffId: 'worker-1' }, ctx()))).toBe(
      'NOT_PERMITTED',
    )
  })
})

describe('T19: guest A cannot reach project B by altered ids', () => {
  const reads: Action[] = ['request.view', 'customer.view', 'payment.view', 'message.reply', 'estimate.approve']

  it('every read and write on project B is answered NOT_FOUND, exactly like a missing object', () => {
    for (const a of reads) {
      expect(effect(decide(customerA, a, { projectId: 'project-a' }, ctx())), a).toBe('allow')
      const d = decide(customerA, a, { projectId: 'project-b' }, ctx())
      expect(d, a).toMatchObject({ effect: 'deny', reason: 'NOT_FOUND', message: 'Not found.' })
    }
  })

  it('a record without a project, an expired or a revoked grant gives no access', () => {
    expect(effect(decide(customerA, 'payment.view', {}, ctx()))).toBe('NOT_FOUND')
    const expired = { ...customerA, projectAccess: [{ projectId: 'project-a', via: 'grant' as const, expiresAt: NOW }] }
    expect(effect(decide(expired, 'payment.view', { projectId: 'project-a' }, ctx()))).toBe('NOT_FOUND')
    const revoked = {
      ...customerA,
      projectAccess: [{ projectId: 'project-a', via: 'grant' as const, revokedAt: new Date('2026-10-20T14:00:00Z') }],
    }
    expect(effect(decide(revoked, 'payment.view', { projectId: 'project-a' }, ctx()))).toBe('NOT_FOUND')
  })

  it('approving needs fresh verification (HH-ID-07)', () => {
    const stale = { ...customerA, freshVerification: false }
    expect(effect(decide(stale, 'estimate.approve', { projectId: 'project-a' }, ctx()))).toBe(
      'FRESH_VERIFICATION_REQUIRED',
    )
    expect(effect(decide(stale, 'change_order.approve', { projectId: 'project-a' }, ctx()))).toBe(
      'FRESH_VERIFICATION_REQUIRED',
    )
  })

  it('a guest without verification sees nothing private but may submit a request', () => {
    expect(effect(decide({ kind: 'guest' }, 'request.submit', {}, ctx()))).toBe('allow')
    expect(effect(decide({ kind: 'guest' }, 'request.view', { projectId: 'project-a' }, ctx()))).toBe('NOT_FOUND')
  })
})

describe('T28: access code reveal is assigned, dated, online and audited', () => {
  it('only the assigned worker, online, on the visit date succeeds, and it is audited', () => {
    expect(decide(worker, 'access_code.reveal', job, ctx())).toMatchObject({ effect: 'allow', audit: true })
    const unassigned = staff('worker-2', ['worker'])
    expect(effect(decide(unassigned, 'access_code.reveal', job, ctx()))).toBe('NOT_ASSIGNED')
    expect(effect(decide(worker, 'access_code.reveal', job, ctx({ today: '2026-10-21' })))).toBe('NOT_VISIT_DATE')
    expect(effect(decide(worker, 'access_code.reveal', job, ctx({ online: false })))).toBe('OFFLINE')
    expect(
      effect(
        decide(worker, 'access_code.reveal', { projectId: 'project-a', assignments: job.assignments ?? [] }, ctx()),
      ),
    ).toBe('MISSING_FACT')
  })
})

describe('T68: scoped views never leak across customers or roles', () => {
  it('worker reads of customers are limited to site facts on assigned jobs; estimator reads to estimating scope', () => {
    expect(decide(worker, 'customer.view', job, ctx())).toMatchObject({ effect: 'allow', limit: 'site_facts' })
    expect(effect(decide(worker, 'customer.view', { projectId: 'project-b' }, ctx()))).toBe('NOT_ASSIGNED')
    expect(decide(estimator, 'customer.view', job, ctx())).toMatchObject({ limit: 'estimating_scope', proposed: true })
  })

  it('restricted incident details: the Owner and the reporting worker only (OWN-DEC-143)', () => {
    const report = { ...job, ownerStaffId: 'worker-1' }
    expect(effect(decide(owner, 'incident.view_restricted', report, ctx()))).toBe('allow')
    expect(effect(decide(worker, 'incident.view_restricted', report, ctx()))).toBe('allow')
    expect(effect(decide(staff('worker-2', ['worker']), 'incident.view_restricted', report, ctx()))).toBe(
      'NOT_OWN_RECORD',
    )
    expect(effect(decide(office, 'incident.view_restricted', report, ctx()))).toBe('NOT_PERMITTED')
    expect(effect(decide(customerA, 'incident.view_restricted', report, ctx()))).toBe('NOT_FOUND')
  })

  it('office sees only their own audit actions; nobody edits or deletes audit events', () => {
    expect(effect(decide(office, 'audit.view', { ownerStaffId: 'office-1' }, ctx()))).toBe('allow')
    expect(effect(decide(office, 'audit.view', { ownerStaffId: 'owner-1' }, ctx()))).toBe('NOT_OWN_RECORD')
    for (const a of ['audit.edit', 'audit.delete'] as const) {
      expect(effect(decide({ ...owner, freshAuth: true }, a, {}, ctx({ reason: 'x' })))).toBe('AUDIT_APPEND_ONLY')
    }
  })
})

describe('RULE-SAFETY-GATES: no role, flag or AI bypasses the gate, stop-work rights or critical holds', () => {
  it('overriding the gate or a critical hold is refused to everyone, the Owner included', () => {
    for (const a of ['work.override_gate', 'hold.override_critical'] as const) {
      expect(effect(decide({ ...owner, freshAuth: true }, a, job, ctx({ reason: 'x' })))).toBe(
        'SAFETY_GATE_NOT_OVERRIDABLE',
      )
      expect(effect(decide(worker, a, job, ctx()))).toBe('SAFETY_GATE_NOT_OVERRIDABLE')
    }
  })

  it('start and resume pass through the Start Work gate on an assigned job and are never allowed offline (T46)', () => {
    expect(decide(worker, 'work.start', job, ctx())).toMatchObject({ effect: 'allow', gate: 'start_work' })
    expect(decide(worker, 'work.resume', job, ctx())).toMatchObject({ effect: 'allow', gate: 'start_work' })
    expect(effect(decide(worker, 'work.start', job, ctx({ online: false })))).toBe('OFFLINE')
    expect(effect(decide(worker, 'work.pause', job, ctx({ online: false })))).toBe('allow')
    // The Owner doing field work is under the same gate and must be assigned too.
    expect(effect(decide(owner, 'work.start', job, ctx()))).toBe('NOT_ASSIGNED')
  })

  it('stop work and hazard reports are never blocked by connectivity, fresh sign-in or reasons', () => {
    for (const a of ['work.stop', 'hazard.report'] as const) {
      expect(decide(worker, a, job, ctx({ online: false }))).toMatchObject({ effect: 'allow', audit: false })
      expect(effect(decide(office, a, job, ctx({ online: false })))).toBe('allow')
    }
  })

  it('nobody releases a critical safety hold they raised, not even the Owner (OWN-DEC-38)', () => {
    expect(effect(decide(owner, 'hold.release_critical', { ...job, raisedByStaffId: 'owner-1' }, ctx()))).toBe(
      'OWN_CRITICAL_HOLD',
    )
    expect(decide(owner, 'hold.release_critical', { ...job, raisedByStaffId: 'worker-1' }, ctx())).toMatchObject({
      effect: 'allow',
      limit: 'evidence_required',
      audit: true,
    })
    expect(effect(decide(owner, 'hold.release_critical', job, ctx()))).toBe('MISSING_FACT')
    expect(effect(decide(worker, 'hold.release_critical', { ...job, raisedByStaffId: 'owner-1' }, ctx()))).toBe(
      'NOT_PERMITTED',
    )
  })

  it('the Owner may set Ready on any job-level Hold / Ready note (OWN-DEC-137)', () => {
    expect(effect(decide(owner, 'job_hold.set_ready', { ...job, raisedByStaffId: 'owner-1' }, ctx()))).toBe('allow')
    expect(effect(decide(office, 'job_hold.set_ready', job, ctx()))).toBe('NOT_PERMITTED')
  })
})

describe('accounts, AI and unknown actions are denied by default (RULE-AI-WAVE2, HH-STAFF-03)', () => {
  it('the AI module holds no permissions', () => {
    for (const a of ['request.view', 'work.stop', 'message.reply'] as const) {
      expect(effect(decide({ kind: 'ai' }, a, job, ctx()))).toBe('AI_DISABLED')
    }
  })

  it('invited and disabled staff accounts are refused everything', () => {
    for (const status of ['invited', 'disabled'] as const) {
      expect(effect(decide({ ...owner, status }, 'request.view', job, ctx()))).toBe('ACCOUNT_NOT_ACTIVE')
    }
  })

  it('an unknown action is refused, and a staff user with no roles has no permission', () => {
    expect(effect(decide(owner, 'request.delete_everything' as Action, job, ctx()))).toBe('UNKNOWN_ACTION')
    expect(effect(decide(staff('nobody', []), 'request.view', job, ctx()))).toBe('NOT_PERMITTED')
  })

  it('nobody grants themselves a role or capability (ENT-RoleGrant)', () => {
    const fresh = { ...owner, freshAuth: true }
    expect(effect(decide(fresh, 'staff.grant_role', { subjectStaffId: 'owner-1' }, ctx({ reason: 'x' })))).toBe(
      'SELF_GRANT',
    )
    expect(effect(decide(fresh, 'staff.grant_role', { subjectStaffId: 'worker-1' }, ctx({ reason: 'x' })))).toBe(
      'allow',
    )
  })

  it('protective actions are never delayed by a fresh sign-in', () => {
    expect(decide(owner, 'staff.disable', {}, ctx())).toMatchObject({ effect: 'allow', audit: true })
    expect(effect(decide(owner, 'staff.revoke_sessions', {}, ctx()))).toBe('allow')
  })

  it('[HH-STAFF-03][HH-STAFF-02] staff management (TSK-0097): ending a grant is never delayed; re-enabling is F', () => {
    expect(effect(decide(owner, 'staff.end_grant', { subjectStaffId: 'worker-1' }, ctx()))).toBe('allow')
    expect(effect(decide(owner, 'staff.view', {}, ctx()))).toBe('allow')
    expect(effect(decide(owner, 'staff.enable', { subjectStaffId: 'worker-1' }, ctx({ reason: 'x' })))).toBe(
      'FRESH_AUTH_REQUIRED',
    )
    const fresh = { ...owner, freshAuth: true }
    expect(effect(decide(fresh, 'staff.enable', { subjectStaffId: 'worker-1' }, ctx()))).toBe('REASON_REQUIRED')
    expect(effect(decide(fresh, 'staff.enable', { subjectStaffId: 'worker-1' }, ctx({ reason: 'x' })))).toBe('allow')
    for (const role of ['office', 'estimator', 'worker'] as const)
      for (const action of ['staff.view', 'staff.end_grant', 'staff.enable', 'staff.grant_role'] as const)
        expect(effect(decide(staff(`${role}-1`, [role]), action, { subjectStaffId: 'worker-1' }, ctx()))).toBe(
          'NOT_PERMITTED',
        )
  })

  it('one person holding several roles gets the union, each capability still explicit (OWN-DEC-28)', () => {
    expect(decide(owner, 'visit.tap_arrived', { ...job, assignments: [] }, ctx())).toMatchObject({
      effect: 'deny',
      reason: 'NOT_ASSIGNED',
    })
    expect(actionsFor(['worker'])).toContain('work.stop')
    expect(actionsFor(['worker'])).not.toContain('payment.refund')
    expect(actionsFor(['customer'])).toContain('estimate.approve')
  })
})

describe('record-scope predicates (TSK-0006, RULE-SERVER-AUTHZ)', () => {
  it('assignment, project grant and ownership', () => {
    expect(isAssigned(worker, job, NOW)).toBe(true)
    expect(isAssigned(worker, job, new Date('2026-10-21T00:00:00Z'))).toBe(false)
    expect(isAssigned(customerA, job, NOW)).toBe(false)
    expect(hasProjectAccess(customerA, { projectId: 'project-a' }, NOW)).toBe(true)
    expect(hasProjectAccess(customerA, { projectId: 'project-b' }, NOW)).toBe(false)
    expect(hasProjectAccess(worker, { projectId: 'project-a' }, NOW)).toBe(false)
    expect(isOwnRecord(estimator, { ownerStaffId: 'estimator-1' })).toBe(true)
    expect(isOwnRecord(estimator, {})).toBe(false)
    expect(isOwnRecord(customerA, { ownerStaffId: 'contact-a' })).toBe(false)
  })
})
