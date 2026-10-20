---
id: HH-CHG-04
type: requirement
title: "Stop only affected tasks; emergency stabilization recorded separately"
status: active
priority: P0
area: safety
links:
  decided_by: ["[[OWN-DEC-80]]", "[[OWN-DEC-108]]"]
  constrained_by: ["[[RULE-SAFETY-GATES]]"]
  uses: ["[[ENT-Hold]]", "[[ENT-Task]]", "[[ENT-IssueReport]]"]
  tested_by: ["[[T48]]", "[[T54]]"]
  part_of: ["[[C08]]"]
source: "guide 18.1 HH-CHG-04; OWN-DEC-80"
---
- A hold or pending change stops only the affected tasks when they can be separated safely; unrelated, safe, approved work may continue under competent judgment.
- The app never recommends continuing through a hazard to keep the schedule.
- Emergency stabilization is offered only as the make-safe steps the approved SOP lists, within the worker's training ([[HH-WORK-13]]). It is recorded separately from change orders (trigger, actions, why necessary, evidence, Owner and customer notification times, follow-up) and escalated to the Owner.
