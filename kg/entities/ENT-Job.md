---
id: ENT-Job
type: entity
title: "Job"
status: active
area: field
links:
  decided_by: ["[[OWN-DEC-105]]", "[[OWN-DEC-109]]", "[[OWN-DEC-64]]", "[[OWN-DEC-77]]"]
source: "guide 22.1 Job; 23 (Job)"
---
The operational commitment created from one approval.

**Fields:** project; accepted snapshot link ([[ENT-JobScopeSnapshot]]); work packages; visits; assignments; job-level Hold / Ready state and note; deposit requirement; operational state; QA state; financial state; version.

**States:** `pending_preparation → ready → in_progress → ready_for_qa ("Awaiting quality review") → operationally_complete → closed`; `in_progress ↔ paused`; a permitted cancellation path; `closed → reopened` by the Owner only.

**Invariants:** one job per approved project; operational, visit, hold, quality and financial states are separate ("paid" never means complete); start only through the gate; closing needs the conditions of [[HH-QA-09]].

**Who may change:** assigned workers move their job through worker transitions under the gate; the Owner reviews quality, closes and reopens; Office coordinates.
