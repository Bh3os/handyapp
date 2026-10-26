---
id: HH-SCH-05
type: requirement
title: "Pending approval, deposit or readiness never creates a false booking"
status: active
priority: P0
area: scheduling
links:
  decided_by: ["[[OWN-DEC-105]]", "[[OWN-DEC-99]]", "[[OWN-DEC-144]]"]
  depends_on: ["[[HH-BASE-05]]"]
  uses: ["[[ENT-SchedulingTask]]", "[[ENT-Visit]]", "[[ENT-Reservation]]"]
  tested_by: ["[[T09]]", "[[T36]]"]
  part_of: ["[[S05]]", "[[C07]]"]
source: "guide 14.2 HH-SCH-05; 23 (Scheduling task)"
---
- Pending estimate approval, deposit or site readiness can create a scheduling task (`open → planning → fulfilled / canceled`), never a confirmed customer booking. A scheduling task becomes `fulfilled` only when a visit is committed.
- Offered windows hold capacity for 24 hours as defined in [[HH-SCH-11]] ([[OWN-DEC-144]]); a hold is never shown or counted as a confirmed booking.
- A tentative (offered) visit expires 24 hours after the offer and moves to `expired` when no window was selected; its capacity hold ends with it.

**Built by [[TSK-0145]] (2026-10-26, migration 0120, [[OWN-DEC-194]] B1):** the 24 hours of an offered visit run from the offer's publication to the customer; a saved draft holds nothing and never expires the visit.
