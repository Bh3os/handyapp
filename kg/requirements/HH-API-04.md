---
id: HH-API-04
type: requirement
title: Expected versions and scoped idempotency keys on critical writes
status: active
priority: P0
area: platform
links:
  decided_by: ["[[OWN-DEC-16]]"]
  depends_on: ["[[HH-API-03]]"]
  tested_by: ["[[T11]]", "[[T34]]", "[[T61]]"]
source: "guide 24.4; OWN-DEC-16"
---
- Every critical write (request submission, approval, visit confirmation or change, start/pause/resume, change approval, payment recording, corrections, sends) carries the record's `expectedVersion` (or an ETag equivalent) and a scoped idempotency key.
- A stale `expectedVersion` is refused with a conflict that shows the current values; nothing is overwritten.
- The idempotency record stores the key, actor and context, operation, payload hash, response reference, lifecycle state and its retention period.
- A retry with the same key and payload returns the original effect (same reference, same job, same receipt). The same key with a different payload is refused as a conflict.
- A crash after commit is recoverable: the stored record lets the retry return the committed result.
- An uncertain external outcome (a send whose result is unknown) is reconciled with the provider, never blindly retried under a new key.
