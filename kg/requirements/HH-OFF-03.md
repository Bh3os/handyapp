---
id: HH-OFF-03
type: requirement
title: "Offline drafts, timestamps and stops; honest 'Not yet synchronized'"
status: active
priority: P0
area: field
links:
  decided_by: ["[[OWN-DEC-121]]"]
  constrained_by: ["[[RULE-SAFETY-GATES]]"]
  uses: ["[[ENT-FieldEvent]]", "[[ENT-Photo]]", "[[ENT-TimeStamp]]"]
  tested_by: ["[[T50]]", "[[T70]]"]
  part_of: ["[[S07]]"]
source: "guide 17.1 HH-OFF-03; OWN-DEC-121"
---
- Offline, workers can complete checklist steps, write notes, take before and after photos, record Arrived and Finished timestamps, and record local pause, stop and issue events. Unfinished work survives closing the app.
- A stop shows prominently at once even without a network.
- Each item shows "Saved on this phone", "Pending upload" or "Synced".
- While offline the app says "Not yet synchronized" and explains that the office has not been notified automatically; workers use the independent escalation and emergency contact when needed.
- The job sequence is enforced offline too: safety checks → before photos → operation checklist → after photos → walkthrough → submit for quality review. Pending uploads stay visibly incomplete, and the job cannot be submitted for quality review while required evidence is pending.
