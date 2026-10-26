// Actors, record facts and the record-scope predicates (RULE-SERVER-AUTHZ; HH-STAFF-04; ENT-ProjectAccessGrant).
// The server computes every fact from its own records; nothing here trusts a client-supplied flag.
import type { Capability, StaffRole } from './roles.js'

export type StaffActor = {
  readonly kind: 'staff'
  readonly userId: string
  readonly roles: readonly StaffRole[]
  readonly capabilities: readonly Capability[]
  /** `active` only; an invited or disabled account is refused every operation (ENT-StaffUser). */
  readonly status: 'invited' | 'active' | 'disabled'
  /** The session layer re-authenticated this user freshly (password re-entry, or TOTP when enrolled). */
  readonly freshAuth: boolean
}

/** One verified project access of a customer: a single-project guest link or an account's linked project. */
export type ProjectAccess = {
  readonly projectId: string
  readonly via: 'grant' | 'account'
  readonly expiresAt?: Date
  readonly revokedAt?: Date
}

export type CustomerActor = {
  readonly kind: 'customer'
  readonly contactId: string
  /** Projects this verified contact may reach; a grant is project-specific, never customer-wide. */
  readonly projectAccess: readonly ProjectAccess[]
  /** The contact's verification is fresh enough for an approval or a contact change (HH-ID-07). */
  readonly freshVerification: boolean
}

/** A public visitor or a requester whose contact is not verified yet (ROLE-GUEST). */
export type GuestActor = { readonly kind: 'guest' }

/** The AI module: disabled in wave 1, it holds no permissions (RULE-AI-WAVE2). */
export type AiActor = { readonly kind: 'ai' }

export type Actor = StaffActor | CustomerActor | GuestActor | AiActor

/** One staff assignment on the record's job, with its access window. */
export type Assignment = { readonly staffUserId: string; readonly from: Date; readonly to: Date }

/** What the server knows about the record being acted on. Only the facts a rule needs are read. */
export type Resource = {
  /** The project the record belongs to. */
  readonly projectId?: string
  /** Staff assignments on the record's job (A). */
  readonly assignments?: readonly Assignment[]
  /** The staff user the record belongs to: estimate preparer, thread owner, audit-event actor, incident reporter. */
  readonly ownerStaffId?: string
  /** Who raised the hold (critical hold release). */
  readonly raisedByStaffId?: string
  /** Who collected the payment. */
  readonly collectedByStaffId?: string
  /** The staff user a role or capability grant is for. */
  readonly subjectStaffId?: string
  /** Visit date as YYYY-MM-DD in the business time zone (access-code reveal). */
  readonly visitDate?: string
  /**
   * TSK-0128 (OWN-DEC-171): today's date in the visit's own zone (the property's local service day). When given, the
   * visit_date rule compares the visit date with it instead of the business date.
   */
  readonly visitToday?: string
  /** TSK-0128 (OWN-DEC-171): an Owner extension of the visit-day access is in force until then. */
  readonly extendedUntil?: Date
}

/** Assignment: an active assignment of this staff user on the record's job, inside its access window. */
export function isAssigned(actor: Actor, resource: Resource, now: Date): boolean {
  if (actor.kind !== 'staff') return false
  const t = now.getTime()
  return (resource.assignments ?? []).some(
    (a) => a.staffUserId === actor.userId && a.from.getTime() <= t && t < a.to.getTime(),
  )
}

/** Project grant: the customer holds an unexpired, unrevoked access to the record's project. */
export function hasProjectAccess(actor: Actor, resource: Resource, now: Date): boolean {
  if (actor.kind !== 'customer' || resource.projectId === undefined) return false
  const t = now.getTime()
  return actor.projectAccess.some(
    (g) =>
      g.projectId === resource.projectId &&
      (g.revokedAt === undefined || g.revokedAt.getTime() > t) &&
      (g.expiresAt === undefined || g.expiresAt.getTime() > t),
  )
}

/** Ownership: the record belongs to this staff user. */
export function isOwnRecord(actor: Actor, resource: Resource): boolean {
  return actor.kind === 'staff' && resource.ownerStaffId !== undefined && resource.ownerStaffId === actor.userId
}
