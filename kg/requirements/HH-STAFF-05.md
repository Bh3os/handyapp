---
id: HH-STAFF-05
type: requirement
title: Explicit visibility classes for notes and attachments
status: active
priority: P0
area: staff
links:
  decided_by: ["[[OWN-DEC-106]]", "[[OWN-DEC-109]]", "[[OWN-DEC-120]]", "[[OWN-DEC-124]]"]
  depends_on: ["[[HH-DATA-07]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[ENT-Photo]]", "[[ENT-Document]]", "[[ENT-Message]]"]
  tested_by: ["[[T24]]", "[[T57]]"]
  part_of: ["[[S03]]", "[[S06]]", "[[S10]]"]
source: "guide 10.2 HH-STAFF-05; OWN-DEC-106, OWN-DEC-109"
---
- Every note and attachment has exactly one visibility class: `internal_operational`, `restricted_incident`, `restricted_financial` or `customer_shared`. Staff uploads and notes default to internal; sharing with the customer is an explicit action.
- Internal notes are kept separate from customer-visible messages everywhere (request, inbox, records).
- Public marketing use is a separate publication permission, never a synonym for `customer_shared`.
