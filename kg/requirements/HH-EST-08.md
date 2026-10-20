---
id: HH-EST-08
type: requirement
title: "Approval creates one job and one scheduling task"
status: active
priority: P0
area: approval
links:
  decided_by: ["[[OWN-DEC-105]]", "[[OWN-DEC-104]]"]
  depends_on: ["[[HH-EST-07]]", "[[HH-AUTO-01]]"]
  uses: ["[[ENT-Job]]", "[[ENT-SchedulingTask]]", "[[ENT-Approval]]", "[[ENT-JobScopeSnapshot]]"]
  tested_by: ["[[T34]]"]
  part_of: ["[[C05]]", "[[S05]]"]
source: "guide 13.2 HH-EST-08; OWN-DEC-105"
---
- In the approval transaction the server creates one job for the approved project ([[ENT-Job]]) and one scheduling task ([[ENT-SchedulingTask]]). Retries never duplicate either.
- The job links the immutable accepted snapshot ([[ENT-JobScopeSnapshot]]): the exact estimate or document version, selected options, scope, exclusions, total and terms version.
- One job may have several visits. Later scope or price changes need an approved change order ([[HH-CHG-02]]); the original approval is never overwritten.
- Approval does not reserve crew capacity, confirm an appointment or satisfy a deposit. The next step shown and the approval receipt follow [[HH-EST-12]].
