---
id: ENT-PunchItem
type: entity
title: "Punch item"
status: active
area: quality
links:
  decided_by: ["[[OWN-DEC-64]]"]
source: "guide 19.1 HH-QA-04"
---
A specific problem found at review or walkthrough.

**Fields:** job; task or area; description; severity (minor, major); assigned owner; due date; state (open, corrected, rechecked); evidence before and after; re-check result.

**Invariants:** survives invoicing; the job cannot close until all pass re-check; a major item blocks the final invoice.

**Who may change:** the Owner creates and re-checks; assigned staff correct.
