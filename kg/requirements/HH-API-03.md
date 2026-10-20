---
id: HH-API-03
type: requirement
title: Stable safe error shape and consistent status codes
status: active
priority: P0
area: platform
links:
  depends_on: ["[[HH-API-01]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  tested_by: ["[[T10]]", "[[T19]]", "[[T18]]"]
source: "guide 24.4"
---
Every error uses one envelope:

```json
{
  "error": {
    "code": "REVISION_SUPERSEDED",
    "message": "This estimate has been updated. Review the current version before approving.",
    "fieldErrors": [],
    "requestId": "safe-correlation-reference",
    "retryable": false
  }
}
```

- `code` is stable and machine-readable; `message` is safe, plain and in the audience's language (English for customers, the staff member's locale for staff); `fieldErrors` names each invalid field; `requestId` correlates with logs; `retryable` says whether the same request may be retried.
- Status codes are consistent: validation failure, unauthenticated, unauthorized or neutral not-found (whichever avoids revealing that a record exists), stale version or conflict (for example `STALE_VERSION`, `IDEMPOTENCY_CONFLICT`), rate limit, transient server failure.
- Errors never contain stack traces, database queries, secrets, or any sign that a record the caller may not see exists.
