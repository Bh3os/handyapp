// Table-driven suite generated from the policy matrix (TSK-0006; ROLE-MATRIX, RULE-SERVER-AUTHZ, HH-STAFF-04, T26,
// T68). For every row, column and action: the actor that meets every requirement is allowed exactly when the cell
// has a rule; each requirement removed on its own gives its own deny reason; unrelated records are refused.
import { describe, expect, it } from 'vitest'
import {
  type Actor,
  type Condition,
  decide,
  type DecisionContext,
  type DenyReason,
  MATRIX,
  MATRIX_ROLES,
  type MatrixRole,
  type Resource,
  type Rule,
  type StaffActor,
  type StaffRole,
} from '../src/index.js'

const NOW = new Date('2026-10-20T15:00:00Z')
const PAST = new Date('2026-10-20T12:00:00Z')
const FUTURE = new Date('2026-10-20T23:00:00Z')
const ME = 'staff-synthetic-actor'
const OTHER = 'staff-synthetic-other'

function actorFor(role: MatrixRole, rule?: Rule): Actor {
  if (role === 'customer') {
    return {
      kind: 'customer',
      contactId: 'contact-synthetic-1',
      projectAccess: [{ projectId: 'project-a', via: 'grant', expiresAt: FUTURE }],
      freshVerification: true,
    }
  }
  if (role === 'guest') return { kind: 'guest' }
  return {
    kind: 'staff',
    userId: ME,
    roles: [role],
    capabilities: rule?.capability ? [rule.capability] : [],
    status: 'active',
    freshAuth: true,
  }
}

function resourceFor(rule?: Rule): Resource {
  return {
    projectId: 'project-a',
    assignments: [{ staffUserId: ME, from: PAST, to: FUTURE }],
    ownerStaffId: ME,
    raisedByStaffId: OTHER,
    collectedByStaffId: rule?.conditions?.includes('own_collection') ? ME : OTHER,
    subjectStaffId: OTHER,
    visitDate: '2026-10-20',
  }
}

function contextFor(role: MatrixRole): DecisionContext {
  return {
    now: NOW,
    online: true,
    today: '2026-10-20',
    reason: 'Synthetic reason for the test',
    publishingRoles: role === 'customer' || role === 'guest' ? [] : [role as StaffRole],
  }
}

/** Each single requirement removed, with the deny reason it must produce. */
function breakages(rule: Rule): Array<{
  what: string
  actor?: (a: Actor) => Actor
  resource?: Partial<Resource>
  ctx?: Partial<DecisionContext>
  reason: DenyReason
}> {
  const out: ReturnType<typeof breakages> = []
  if (rule.scope === 'assigned') {
    out.push({
      what: 'unassigned job',
      resource: { assignments: [{ staffUserId: OTHER, from: PAST, to: FUTURE }] },
      reason: 'NOT_ASSIGNED',
    })
    out.push({
      what: 'closed access window',
      resource: { assignments: [{ staffUserId: ME, from: PAST, to: NOW }] },
      reason: 'NOT_ASSIGNED',
    })
    out.push({ what: 'no assignment', resource: { assignments: [] }, reason: 'NOT_ASSIGNED' })
  }
  if (rule.scope === 'own_staff') {
    out.push({ what: "another person's record", resource: { ownerStaffId: OTHER }, reason: 'NOT_OWN_RECORD' })
  }
  if (rule.scope === 'customer_project') {
    out.push({ what: 'another project (altered id)', resource: { projectId: 'project-b' }, reason: 'NOT_FOUND' })
    const grant = (g: object) => (a: Actor) =>
      a.kind === 'customer' ? { ...a, projectAccess: [{ projectId: 'project-a', via: 'grant' as const, ...g }] } : a
    out.push({ what: 'expired grant', actor: grant({ expiresAt: NOW }), reason: 'NOT_FOUND' })
    out.push({ what: 'revoked grant', actor: grant({ revokedAt: PAST }), reason: 'NOT_FOUND' })
  }
  if (rule.capability) {
    out.push({
      what: 'capability not granted',
      actor: (a) => ({ ...(a as StaffActor), capabilities: [] }),
      reason: 'CAPABILITY_REQUIRED',
    })
  }
  const byCondition: Record<Condition, ReturnType<typeof breakages>[number]> = {
    publishing_policy: {
      what: 'publishing policy withdrawn',
      ctx: { publishingRoles: [] },
      reason: 'PUBLISHING_NOT_GRANTED',
    },
    not_raised_by_actor: {
      what: 'hold raised by the actor',
      resource: { raisedByStaffId: ME },
      reason: 'OWN_CRITICAL_HOLD',
    },
    not_self_collected: {
      what: 'payment collected by the actor',
      resource: { collectedByStaffId: ME },
      reason: 'SELF_COLLECTED',
    },
    own_collection: {
      what: "someone else's collection",
      resource: { collectedByStaffId: OTHER },
      reason: 'NOT_OWN_COLLECTION',
    },
    visit_date: { what: 'another day', ctx: { today: '2026-10-21' }, reason: 'NOT_VISIT_DATE' },
    online: { what: 'offline', ctx: { online: false }, reason: 'OFFLINE' },
    customer_fresh_verification: {
      what: 'stale verification',
      actor: (a) => (a.kind === 'customer' ? { ...a, freshVerification: false } : a),
      reason: 'FRESH_VERIFICATION_REQUIRED',
    },
    not_self_subject: { what: 'granting themselves', resource: { subjectStaffId: ME }, reason: 'SELF_GRANT' },
  }
  for (const c of rule.conditions ?? []) out.push(byCondition[c])
  if (rule.fresh) {
    out.push({
      what: 'no fresh sign-in',
      actor: (a) => ({ ...(a as StaffActor), freshAuth: false }),
      reason: 'FRESH_AUTH_REQUIRED',
    })
  }
  if (rule.reason) {
    out.push({ what: 'no reason', ctx: { reason: '' }, reason: 'REASON_REQUIRED' })
    out.push({ what: 'blank reason', ctx: { reason: '   ' }, reason: 'REASON_REQUIRED' })
  }
  return out
}

describe('generated matrix suite: every row, role and action (TSK-0006, ROLE-MATRIX, HH-STAFF-04, T26, T68)', () => {
  for (const row of MATRIX) {
    describe(`${row.section}: ${row.label}`, () => {
      if (row.modifies) {
        it('applies as the not_self_collected condition on the rows it modifies', () => {
          for (const action of row.modifies ?? []) {
            const target = MATRIX.find((r) => r.actions.includes(action))
            for (const role of MATRIX_ROLES) {
              const rule = target?.cells[role].rules[action]
              if (rule) expect(rule.conditions, `${role} ${action}`).toContain('not_self_collected')
            }
          }
        })
      }
      for (const role of MATRIX_ROLES) {
        for (const action of row.actions) {
          const rule = row.cells[role].rules[action]
          const title = `${role} ${rule ? 'may' : 'may not'} ${action} (cell "${row.cells[role].text}")`
          it(title, () => {
            const d = decide(actorFor(role, rule), action, resourceFor(rule), contextFor(role))
            if (!rule) {
              expect(d.effect).toBe('deny')
              if (d.effect === 'deny' && row.denyReason) expect(d.reason).toBe(row.denyReason)
              return
            }
            expect(d).toMatchObject({ effect: 'allow', action, role, proposed: rule.proposed === true })
            if (d.effect === 'allow') {
              expect(d.audit).toBe(Boolean(rule.audit || rule.fresh || rule.reason))
              expect(d.limit).toBe(rule.limit)
              expect(d.gate).toBe(rule.gate)
            }
            for (const b of breakages(rule)) {
              const actor = (b.actor ?? ((a: Actor) => a))(actorFor(role, rule))
              const denied = decide(
                actor,
                action,
                { ...resourceFor(rule), ...b.resource },
                { ...contextFor(role), ...b.ctx },
              )
              expect(denied, b.what).toMatchObject({ effect: 'deny', reason: b.reason })
            }
          })
        }
      }
    })
  }
})

describe('every role is refused what the matrix does not give it (TSK-0006, T26)', () => {
  it('a staff user holding a role is denied each action that role has no rule for', () => {
    for (const role of ['owner', 'office', 'estimator', 'worker'] as const) {
      for (const row of MATRIX) {
        for (const action of row.actions) {
          if (row.cells[role].rules[action]) continue
          const d = decide(actorFor(role), action, resourceFor(), contextFor(role))
          expect(d.effect, `${role} ${action}`).toBe('deny')
        }
      }
    }
  })

  it('customers and guests are answered as if the record did not exist (T19)', () => {
    for (const role of ['customer', 'guest'] as const) {
      for (const row of MATRIX.filter((r) => !r.denyReason)) {
        for (const action of row.actions) {
          if (row.cells[role].rules[action]) continue
          expect(decide(actorFor(role), action, resourceFor(), contextFor(role))).toMatchObject({
            effect: 'deny',
            reason: 'NOT_FOUND',
          })
        }
      }
    }
  })
})
