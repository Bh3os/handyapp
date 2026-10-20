---
id: HH-OFF-06
type: requirement
title: "Reconnect revalidates identity and assignment; conflicts go to review"
status: active
priority: P0
area: field
links:
  decided_by: ["[[OWN-DEC-121]]", "[[OWN-DEC-123]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[ENT-FieldEvent]]", "[[ENT-StaffUser]]"]
  tested_by: ["[[T51]]", "[[T27]]"]
  part_of: ["[[S07]]"]
source: "guide 17.2 HH-OFF-06"
---
- On reconnect the server revalidates the worker's account, session and assignment, against the state when each event was recorded and now.
- Safe observations (notes, photos, checklist entries, timestamps) are appended.
- Conflicting state edits are flagged for review, never silently overwritten. Financial, scope, scheduling and critical safety data never use last-write-wins.
- A disabled or unassigned worker cannot sync new writes as if still authorized; their pending evidence is quarantined for Owner review through a controlled recovery path, never silently applied or discarded.
- Schedule changes and reassignments show to the worker when connectivity returns.
