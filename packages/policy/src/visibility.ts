// Who reads each visibility class (TSK-0044; HH-STAFF-05, HH-STAFF-04, HH-DATA-07, OWN-DEC-143, ROLE-MATRIX). Reading
// the record a note or attachment sits on is decided by its route; inside it, each item's class is checked here, from
// the same matrix:
// - internal_operational: every staff member who may read the record; never a customer.
// - restricted_incident: the matrix row "View restricted incident details" (the Owner, audited; the reporting worker
//   for their own report, OWN-DEC-143). Office sees only that such an item exists.
// - restricted_financial (PROPOSED mapping): the matrix row "View internal cost, markup and margin" (the Owner; an
//   Estimator only for their own records).
// - customer_shared: staff who read the record, and the customer of the record's project.
// Deny by default: a guest or the disabled AI module reads no class, and an unknown class is read by nobody.
import { decide } from './decide.js'
import type { Action } from './matrix.js'
import type { Actor, Resource } from './scope.js'

export type VisibilityCode = 'internal_operational' | 'restricted_incident' | 'restricted_financial' | 'customer_shared'

/** The matrix action behind each restricted class. */
export const RESTRICTED_READ_ACTION: Readonly<Record<'restricted_incident' | 'restricted_financial', Action>> = {
  restricted_incident: 'incident.view_restricted',
  restricted_financial: 'estimate.view_internal_cost',
}

export type VisibilityRead = { readonly allowed: boolean; readonly audit: boolean }
const NO: VisibilityRead = Object.freeze({ allowed: false, audit: false })
const YES: VisibilityRead = Object.freeze({ allowed: true, audit: false })

/**
 * Whether `actor`, already allowed to read the record, may read one item of class `visibility` on it. `item` names
 * the item's project and the staff member it belongs to (its author or reporter). `audit` says the read must be
 * written to the audit log (the matrix cell is audited).
 */
export function readsVisibility(
  actor: Actor,
  visibility: string,
  item: Pick<Resource, 'projectId' | 'ownerStaffId'>,
  now: Date,
): VisibilityRead {
  switch (actor.kind) {
    case 'ai':
    case 'guest':
      return NO
    case 'customer':
      return visibility === 'customer_shared' ? YES : NO
    case 'staff': {
      if (actor.status !== 'active') return NO
      if (visibility === 'internal_operational' || visibility === 'customer_shared') return YES
      if (visibility !== 'restricted_incident' && visibility !== 'restricted_financial') return NO
      const d = decide(actor, RESTRICTED_READ_ACTION[visibility], item, { now, online: true })
      return d.effect === 'allow' ? { allowed: true, audit: d.audit } : NO
    }
  }
}
