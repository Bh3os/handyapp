---
id: HH-WORK-10
type: requirement
title: "A reassigned worker reviews everything personally before resuming"
status: active
priority: P0
area: field
links:
  depends_on: ["[[HH-DATA-08]]"]
  uses: ["[[ENT-Acknowledgment]]", "[[ENT-JobPacket]]", "[[ENT-Hold]]"]
  tested_by: ["[[T44]]"]
  part_of: ["[[S07]]"]
source: "guide 16.2 HH-WORK-10"
---
- A newly assigned worker must review unresolved tasks, current hazards and holds, approved changes, resources, prior evidence and the current packet version, and acknowledge them personally, before resuming.
- Another worker's acknowledgment is never inherited; nobody acknowledges for another person.
- The removed worker loses access to the job on the next request ([[HH-SCH-07]]).
