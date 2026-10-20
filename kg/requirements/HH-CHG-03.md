---
id: HH-CHG-03
type: requirement
title: "Approved change updates the work package and invalidates readiness once"
status: active
priority: P0
area: field
links:
  decided_by: ["[[OWN-DEC-108]]", "[[OWN-DEC-105]]"]
  depends_on: ["[[HH-DATA-03]]", "[[HH-DATA-08]]"]
  uses: ["[[ENT-ChangeOrder]]", "[[ENT-JobScopeSnapshot]]", "[[ENT-JobPacket]]", "[[ENT-Acknowledgment]]"]
  tested_by: ["[[T53]]", "[[T44]]"]
  part_of: ["[[C08]]"]
source: "guide 18.1 HH-CHG-03"
---
- An approved change adds a new job scope snapshot version (the previous one plus the change); the original acceptance and every earlier snapshot stay immutable and retrievable.
- Approval publishes one new packet version and invalidates the affected workers' acknowledgments and readiness; applying the same approval twice has no further effect.
- Change-dependent checklist steps unblock only after approval.
- Rejecting, expiring or withdrawing a change never authorizes the extra work.
