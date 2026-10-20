---
id: ENT-SchedulingTask
type: entity
title: "Scheduling task"
status: active
area: scheduling
links:
  decided_by: ["[[OWN-DEC-105]]"]
source: "guide 23 (Scheduling task)"
---
The staff work item to schedule a job's visits, created once at approval.

**States:** `open → planning → fulfilled / canceled`; `fulfilled` only after a committed visit.

**Invariants:** one per approved job and work package; never shown to the customer as a booking.

**Who may change:** Office and Owner.
