---
id: ENT-Reservation
type: entity
title: "Assignment and reservation"
status: active
area: scheduling
links:
  decided_by: ["[[OWN-DEC-119]]", "[[OWN-DEC-123]]"]
source: "guide 22.1 Assignment/Reservation"
---
The link of a worker or equipment item to a visit time range.

**Fields:** worker or equipment; visit; UTC range with zone; role (lead, member); assigned by; reason; ended at and why.

**Invariants:** no overlapping active reservations for a worker or item (database exclusion constraint or lock); a two-person visit reserves both workers; ending an assignment revokes packet and access-code access.

**Who may change:** Office and Owner; a customer's window selection creates one through the same rules.
