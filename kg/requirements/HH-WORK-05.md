---
id: HH-WORK-05
type: requirement
title: "Active execution: tasks, evidence, pause, resume, handoff"
status: active
priority: P0
area: field
links:
  decided_by: ["[[OWN-DEC-108]]", "[[OWN-DEC-109]]"]
  uses: ["[[ENT-Task]]", "[[ENT-WorkPackage]]", "[[ENT-Photo]]", "[[ENT-Job]]"]
  tested_by: ["[[T47]]"]
  part_of: ["[[S07]]", "[[C08]]"]
source: "guide 16.2 HH-WORK-05"
---
- Workers work through ordered or parallel tasks with progress notes, measurements, before, during and after photos, material usage, protection, preparation and cleanup steps, pause and resume, handoff and completion submission.
- Job states: `in_progress ↔ paused`; task states `not_started → ready → in_progress → completed`, `in_progress ↔ paused`, `completed → reopened` with reason and audit.
- Reopening a task keeps all its earlier notes, photos and measurements.
- The checklist and completion sequence follow [[HH-WORK-11]] and [[HH-WORK-12]].
