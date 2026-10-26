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

**Evidence as built:** a one-time code to the request's own verified contact, entered on the receipt, in the project's guest-link session ([[TSK-0036]]), or through the account's Add a project claim ([[TSK-0124]], [[HH-ID-14]]).
