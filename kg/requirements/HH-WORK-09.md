---
id: HH-WORK-09
type: requirement
title: "Stop Work and Report Hazard always available; no permission needed"
status: active
priority: P0
area: safety
links:
  decided_by: ["[[OWN-DEC-108]]", "[[OWN-DEC-80]]", "[[OWN-DEC-124]]"]
  constrained_by: ["[[RULE-SAFETY-GATES]]"]
  uses: ["[[ENT-Hold]]", "[[ENT-IssueReport]]", "[[ENT-Job]]", "[[ENT-Message]]"]
  tested_by: ["[[T48]]"]
  part_of: ["[[C08]]", "[[S07]]", "[[S01]]"]
source: "guide 16.2 HH-WORK-09; 07 ARC-037; OWN-DEC-108"
---
- Stop Work and Report Hazard are available on every screen of an active job, to every assigned worker, online or offline. Stopping needs nobody's permission.
- A critical hazard report creates its critical hold in the same database transaction as the report, under the job lock, never through the outbox. The affected work stops, the job moves to `paused` with the hold, and the existing escalation runs: a top-priority staff queue item and Owner notification.
- The customer sees only "Work is paused for safety review." Restricted incident details stay internal.
- Offline, the stop shows immediately on the device, marked "Not yet synchronized" ([[HH-OFF-03]]).
- Resuming needs a documented resolution, updated instructions where needed and renewed safety checks: the Start Work gate must pass again ([[HH-INC-03]]).
