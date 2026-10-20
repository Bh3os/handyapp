---
id: HH-INT-10
type: requirement
title: Idempotent submission creates exactly one request and one receipt
status: active
priority: P0
area: intake
links:
  decided_by: ["[[OWN-DEC-93]]", "[[OWN-DEC-95]]"]
  depends_on: ["[[HH-ARC-08]]", "[[HH-API-04]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[ENT-Request]]", "[[ENT-Project]]", "[[ENT-OutboxEvent]]"]
  tested_by: ["[[T11]]", "[[T71]]"]
  part_of: ["[[C02]]"]
source: "guide 7.3 HH-INT-10; OWN-DEC-93, OWN-DEC-95"
---
- "Send Estimate Request" carries a scoped idempotency key. The request, its project ([[HH-INT-21]]) and the receipt outbox event are written in one database transaction.
- Double taps and retries after a connection failure or timeout return the same single request and reference.
- Reusing a key with different content is rejected as an explicit conflict.
- The receipt outbox event has a unique key per request, so retries never send a second receipt email ([[HH-INT-20]]).
- Success is shown only after the commit. An uncertain outcome (for example a timeout) shows a retry and status-recovery route, never a false success or a false failure.
