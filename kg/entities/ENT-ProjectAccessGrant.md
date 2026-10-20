---
id: ENT-ProjectAccessGrant
type: entity
title: "Project access grant (guest link)"
status: active
area: identity
links:
  decided_by: ["[[OWN-DEC-96]]", "[[OWN-DEC-97]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
source: "guide 22.1 ProjectAccessGrant"
---
A single-project credential for a contact, used by guests and in links.

**Fields:** project; intended contact; scope; hashed high-entropy secret; expiry; revocation time and reason; last verified time.

**Invariants:** project-specific, never customer-wide; useless before the contact is verified; expired links offer a safe way to request new access; revoked on account deletion, contact change or a corrected link.

**Who may change:** the system issues; the customer requests reissue; staff and the Owner revoke.
