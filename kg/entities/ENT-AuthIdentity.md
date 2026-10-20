---
id: ENT-AuthIdentity
type: entity
title: "Authentication identity"
status: active
area: identity
links:
  decided_by: ["[[OWN-DEC-63]]", "[[OWN-DEC-114]]"]
source: "guide 22.1 AuthIdentity"
---
The sign-in subject behind a staff user ([[ENT-StaffUser]], email and password) or a customer account ([[ENT-CustomerAccount]], passwordless one-time code).

**Fields:** stable unique subject; verified contact references; identity state (active, disabled); credential type.

**Invariants:** staff and customer grants are separate; one identity never gains both kinds of access by itself; a customer identity reaches records only through [[ENT-CustomerIdentityLink]] or [[ENT-ProjectAccessGrant]].

**Who may change:** the identity owner (credential changes, with re-verification); the Owner disables staff identities.
