---
id: HH-NFR-02
type: requirement
title: Observability of health, errors, queues, integrity, conflicts, callbacks, uploads and backups
status: active
priority: P0
area: ops
links:
  decided_by: ["[[OWN-DEC-115]]", "[[OWN-DEC-125]]", "[[OWN-DEC-73]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[INT-Render]]", "[[INT-Bird]]", "[[INT-Resend]]", "[[INT-R2]]"]
  tested_by: ["[[T12]]", "[[T71]]"]
  part_of: ["[[S01]]", "[[S11]]"]
source: "guide 26.3; OWN-DEC-115, OWN-DEC-125"
---
Observable without exposing secrets or personal data:
- health checks (on staging only a minimal health check is public, with no private data, [[OWN-DEC-73]]);
- structured, redacted logs with a request ID on every request and error;
- error tracking;
- outbox and job queues: age, retries and permanent failures;
- request-to-inbox integrity (every stored request appears in staff intake);
- scheduling conflicts;
- webhook and callback failures (Bird, Resend);
- upload and processing errors (R2);
- backup status and the last restore drill.

Important operational exceptions (delivery failures, permanent failures, callback failures, conflicts) reach the owner and office as action-queue items ([[OWN-DEC-115]]), and the owner dashboard links to them ([[OWN-DEC-125]]).

**Limitation (process requirement; reviewer: Owner):** Backups, the restore-drill schedule and error tracking show as unknown or NOT CONFIGURED on the system page: they belong to the production hosting, which is not set up ([[OQ-GO-DECISION]]).
