---
id: ENT-Task
type: entity
title: "Task (checklist step instance)"
status: active
area: field
links:
  decided_by: ["[[OWN-DEC-108]]"]
source: "guide 22.1 JobWorkPackage/Task; 23 (Task)"
---
One step of the job checklist taken from an SOP step.

**Fields:** stage (1–6); source SOP step; instruction; expected result; required evidence; mandatory flag; change-dependent flag; status; skip reason; evidence links; completed by and at.

**States:** `not_started → ready → in_progress → completed`; `in_progress ↔ paused`; `completed → reopened` (reason, audit); skipped with reason.

**Invariants:** a mandatory step skipped blocks completion; reopening keeps earlier evidence; history append-only.

**Who may change:** assigned workers; the Owner during review.
