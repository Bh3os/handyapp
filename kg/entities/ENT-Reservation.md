---
id: ENT-Reservation
type: entity
title: "Assignment and reservation"
status: active
area: scheduling
links:
  decided_by: ["[[OWN-DEC-119]]", "[[OWN-DEC-123]]", "[[OWN-DEC-144]]"]
source: "guide 22.1 Assignment/Reservation"
---
The link of a worker or equipment item to a visit time range.

**Fields:** worker or equipment; visit; UTC range with zone; role (lead, member); kind (hold for an offered window, or confirmed); hold expiry (24 hours after the offer, [[OWN-DEC-144]]); assigned by; reason; ended at and why.

**Invariants:** no overlapping active reservations or holds for a worker or item (database exclusion constraint or lock); a hold blocks the capacity for others until it is selected, released or expires; selecting a window converts its hold to confirmed and releases the other holds of that offer; a two-person visit reserves both workers; ending an assignment revokes packet and access-code access.

**Who may change:** Office and Owner; a customer's window selection creates one through the same rules.
