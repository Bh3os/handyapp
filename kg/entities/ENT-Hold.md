---
id: ENT-Hold
type: entity
title: "Hold (safety hold and job-level Hold / Ready)"
status: active
area: safety
links:
  decided_by: ["[[OWN-DEC-82]]", "[[OWN-DEC-38]]", "[[OWN-DEC-80]]", "[[OWN-DEC-137]]"]
  constrained_by: ["[[RULE-SAFETY-GATES]]"]
source: "guide 22.1 Hazard/Hold; 23 (Hold); OWN-DEC-38, OWN-DEC-82"
---
A recorded block on a job, visit, work package or task.

**Kinds:** critical safety hold (hazard report, gas leak, live wiring, hazardous material, structural, licensed-trade scope); job-level Hold / Ready with a note for unresolved requirements; task blocks for critical resource shortages.

**Fields:** kind; scope; type and severity; note; raised by and at; release requirement; resolution evidence, reviewer and time.

**States:** `open → under_review → resolved / canceled_as_error`.

**Invariants:** a critical hold is written in the same transaction as the hazard report under the job lock; no role, flag, checkbox, timer or AI overrides it; nobody releases a critical safety hold they raised; a job on Hold cannot be confirmed or started until the Owner sets Ready with a note, which the Owner may do on any job-level Hold / Ready note, including one the Owner set ([[OWN-DEC-137]]).

**Who may change:** any assigned worker raises safety holds; staff set the job-level Hold; the Owner sets Ready; release per [[HH-WORK-02]].
