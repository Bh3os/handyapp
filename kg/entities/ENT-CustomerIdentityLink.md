---
id: ENT-CustomerIdentityLink
type: entity
title: "Customer identity link"
status: active
area: identity
links:
  decided_by: ["[[OWN-DEC-97]]", "[[OWN-DEC-117]]"]
source: "guide 22.1 CustomerIdentityLink"
---
The evidenced link between an auth identity and a customer or contact.

**Fields:** identity; customer and contact; authority (owner, representative and its scope); evidence; grant state (pending review, active, revoked); decided by and at.

**Invariants:** never created from a matching name or email alone; ambiguity goes to staff review; a relink or correction rechecks and revokes affected access.

**Who may change:** created through verified enrollment; Office staff correct links with a reason; the Owner reverses link changes.
