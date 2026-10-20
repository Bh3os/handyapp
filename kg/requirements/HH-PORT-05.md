---
id: HH-PORT-05
type: requirement
title: Accepted scope changes only through a reviewed change order
status: active
priority: P0
area: portal
links:
  decided_by: ["[[OWN-DEC-105]]", "[[OWN-DEC-108]]", "[[OWN-DEC-103]]"]
  depends_on: ["[[HH-CHG-01]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[ENT-ChangeOrder]]", "[[ENT-Property]]", "[[ENT-Approval]]"]
  tested_by: ["[[T35]]", "[[T53]]"]
  part_of: ["[[C06]]", "[[C08]]"]
source: "guide 9.2 HH-PORT-05; OWN-DEC-105, OWN-DEC-108"
---
- The workspace has no generic "edit project" form that can change accepted scope. A customer's change request becomes a staff follow-up; scope or price changes need a change order that staff publish and the customer approves in its exact version. The original approval is never overwritten.
- "Request Changes" on an estimate notifies staff and keeps the history.
- Address changes that affect coverage, travel or readiness need staff review before dispatch.
