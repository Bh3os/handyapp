---
id: HH-SCH-05
type: requirement
title: "Pending approval, deposit or readiness never creates a false booking"
status: active
priority: P0
area: scheduling
links:
  decided_by: ["[[OWN-DEC-105]]", "[[OWN-DEC-99]]"]
  depends_on: ["[[HH-BASE-05]]"]
  uses: ["[[ENT-SchedulingTask]]", "[[ENT-Visit]]", "[[ENT-Reservation]]"]
  tested_by: ["[[T09]]", "[[T36]]"]
  part_of: ["[[S05]]", "[[C07]]"]
source: "guide 14.2 HH-SCH-05; 23 (Scheduling task)"
---
- Pending estimate approval, deposit or site readiness can create a scheduling task (`open → planning → fulfilled / canceled`), never a confirmed customer booking. A scheduling task becomes `fulfilled` only when a visit is committed.
- Offered windows ([[HH-SCH-11]]) do not hold capacity; availability is rechecked and reserved only when the customer selects one. PROPOSED DECISION: no capacity-holding tentative holds at launch, because their capacity effect is not defined by the owner.
- A tentative visit has an explicit expiry time and moves to `expired` when it passes without confirmation; its effect on capacity is none.
