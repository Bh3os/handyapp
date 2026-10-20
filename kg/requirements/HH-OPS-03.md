---
id: HH-OPS-03
type: requirement
title: Concurrent edits show conflicts and current values; stale writes never overwrite schedule, scope, money or safety
status: active
priority: P0
area: ops
links:
  decided_by: ["[[OWN-DEC-119]]", "[[OWN-DEC-121]]"]
  depends_on: ["[[HH-API-04]]"]
  constrained_by: ["[[RULE-SAFETY-GATES]]"]
  tested_by: ["[[T42]]", "[[T51]]"]
  part_of: ["[[S05]]"]
source: "guide 11.1; OWN-DEC-119, OWN-DEC-121"
---
- When an edit is based on an outdated version, the user sees a conflict with the current values and can review and redo the change.
- Notes may be appended from a stale view where that is safe (they add, never replace).
- Stale schedule, scope, financial or safety writes never overwrite newer state. A failed scheduling change leaves the current appointment intact ([[OWN-DEC-119]]); offline changes that conflict are flagged for review, never silently overwritten ([[OWN-DEC-121]]).
