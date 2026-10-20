---
id: ENT-IssueReport
type: entity
title: "Issue report and stabilization record"
status: active
area: field
links:
  decided_by: ["[[OWN-DEC-80]]"]
source: "guide 16.2 HH-WORK-08; 18.1 HH-CHG-04"
---
A worker's report of a problem found during work, and any emergency stabilization record.

**Fields:** category (see [[HH-WORK-08]]); affected task; severity; description; safe photos; time; next owner; on-site resolution (what happened, steps, materials, how checked); stabilization (trigger, actions, why, notifications, follow-up); linked hold, case or change order.

**Invariants:** append-only; critical categories create a hold in the same transaction; gas leak and live wiring never offer on-site resolution.

**Who may change:** assigned workers create; Owner reviews.
