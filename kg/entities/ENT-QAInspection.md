---
id: ENT-QAInspection
type: entity
title: "Quality review"
status: active
area: quality
links:
  decided_by: ["[[OWN-DEC-64]]"]
source: "guide 22.1 QAInspection/PunchItem; 23 (QA)"
---
The Owner's review of a finished job.

**Fields:** job; reviewer; self-review flag; checklist and evidence reviewed; walkthrough reviewed; results; punch items; times.

**States:** `pending → in_review → passed / punch_required`; `punch_required → pending_recheck → passed`.

**Invariants:** every job is reviewed by the Owner; passing is required before invoice issue and completion.

**Who may change:** the Owner.
