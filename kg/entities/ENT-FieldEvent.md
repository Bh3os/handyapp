---
id: ENT-FieldEvent
type: entity
title: "Field event (offline sync item)"
status: active
area: field
links:
  decided_by: ["[[OWN-DEC-121]]"]
source: "guide 22.1 FieldEvent; HH-OFF-05"
---
One queued offline or online field action.

**Fields:** client UUID; actor; job and task; base version; type; local time; server received time; payload; attachment references; retry count; state (`pending → syncing → synchronized / failed / needs_review`).

**Invariants:** ingested once per UUID; re-authorized at sync; conflicts go to review; revoked actors' writes are quarantined.

**Who may change:** created by the worker's device; resolved by the Owner when in review.
