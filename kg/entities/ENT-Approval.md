---
id: ENT-Approval
type: entity
title: "Customer approval (acceptance)"
status: active
area: approval
links:
  decided_by: ["[[OWN-DEC-103]]", "[[OWN-DEC-127]]", "[[OWN-DEC-108]]"]
source: "guide 22.1 Acceptance; OWN-DEC-103"
---
The evidence that a verified customer approved one estimate version or one change-order version.

**Fields:** target version (or document version and hash); selected options; approved total; deposit amount; terms version ID and hash; payment-term text and version; privacy-notice version; typed full name; verified contact and access grant; method (portal, in person with one-time code or staff-verified identity); necessary security metadata; server timestamp; idempotency key.

**Invariants:** at most one per version and work package; immutable; never created by a signature alone, a GET request, silence or AI; staging approvals marked TEST.

**Who may change:** created only by the verified customer's action; never edited.
