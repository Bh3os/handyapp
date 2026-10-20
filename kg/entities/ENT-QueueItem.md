---
id: ENT-QueueItem
type: entity
title: "Staff action queue item"
status: active
area: staff
links:
  decided_by: ["[[OWN-DEC-115]]"]
source: "OWN-DEC-115"
---
One item in the role-based staff home queue or Owner Decisions.

**Fields:** type; subject record; reason; assigned staff member; age or due time; priority band (safety, today's appointment changes, overdue responses, other); visibility roles; resolved at.

**Invariants:** one item per subject and type (idempotent providers); disappears or updates when resolved; sensitive details only for permitted roles.

**Who may change:** created by module providers; resolved by the underlying action.
