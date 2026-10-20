---
id: ENT-Walkthrough
type: entity
title: "Customer walkthrough"
status: active
area: quality
links:
  decided_by: ["[[OWN-DEC-75]]", "[[OWN-DEC-109]]"]
source: "OWN-DEC-75, OWN-DEC-109"
---
The end-of-job walkthrough record.

**Fields:** job; visit; outcome (accepted, accepted with punch items, disputed, customer unavailable); participant identity and authority; worker; time; comments; linked punch items; optional signature.

**Invariants:** unavailable or silence is never acceptance; disputed goes to the Owner; never closes punch items or bypasses review.

**Who may change:** the assigned worker records; nobody edits after.
