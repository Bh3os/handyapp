---
id: ENT-Customer
type: entity
title: "Customer"
status: active
area: records
links:
  decided_by: ["[[OWN-DEC-117]]", "[[OWN-DEC-45]]"]
source: "guide 22.1 Customer; vault 05 section 5.2; OWN-DEC-117"
---
The person or organization HandyHub works for and bills.

**Fields:** stable ID; display name; contacts ([[ENT-Contact]]); authorized properties ([[ENT-Property]]); projects; customer-facing language (English); payment term agreed for existing customers; lifecycle status (active, inactive, merged into); provenance; activity history.

**Invariants:** never auto-merged by email, phone, name or address; a merge links a survivor and keeps original IDs, history, approvals and financial evidence; access is rechecked after a merge or relink.

**Who may change:** Office and Owner edit and merge with a reason and preview; the Owner reverses; the customer edits their own contact details through verified access.
