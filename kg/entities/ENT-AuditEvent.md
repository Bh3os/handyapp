---
id: ENT-AuditEvent
type: entity
title: "Audit event"
status: active
area: security
links:
  decided_by: ["[[OWN-DEC-123]]"]
source: "guide 22.1 AuditEvent; HH-SEC-06; vault 27 section 6.4"
---
Append-only record of an important action: sign-ins and failures, role changes, approvals, publishing, payment entries and corrections, refunds and waivers, merges, safety events, access-code reveals, exports, deletions, policy changes.

**Fields:** actor and roles used; action; object type, ID and version; time (UTC with zone); reason; safe change summary; request correlation ID; step-up used; result.

**Invariants:** no edit or delete through the app; corrections are new events; passwords, tokens, access codes and sensitive message contents are redacted; retention follows [[FACT-RETENTION-SCHEDULE]].

**Who may change:** written by the server; the Owner reads all, Office reads their own actions.
