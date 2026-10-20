---
id: HH-OFF-05
type: requirement
title: "Sync queue with client IDs and idempotent ingestion"
status: active
priority: P0
area: field
links:
  decided_by: ["[[OWN-DEC-121]]"]
  uses: ["[[ENT-FieldEvent]]", "[[ENT-Photo]]"]
  tested_by: ["[[T51]]"]
  part_of: ["[[S07]]"]
source: "guide 17.2 HH-OFF-05"
---
- Each queued event ([[ENT-FieldEvent]]) holds a client-generated UUID, actor, job and task, base version, event type, local recorded time, server received time, payload, attachment references, retry count and state.
- Sync retries automatically. The server consumes events idempotently by client UUID, so retries never create duplicate photos, timestamps, notes or checklist entries.
