---
id: ENT-AuditEvent
type: entity
title: "Audit event"
status: active
area: security
links:
  decided_by: ["[[OWN-DEC-123]]", "[[OWN-DEC-142]]"]
source: "guide 22.1 AuditEvent; HH-SEC-06; vault 27 section 6.4"
---
Append-only record of an important action: sign-ins and failures, role changes, approvals, publishing, payment entries and corrections, refunds and waivers, merges, safety events, access-code reveals, exports, deletions, policy changes.

**Fields:** actor and roles used; action; object type, ID and version; time (UTC with zone); reason; safe change summary; request correlation ID; step-up used; result.

**Invariants:** append-only; immutability, redaction and the 7-year retention per [[HH-SEC-06]].

**Who may change:** written by the server only; read access per [[HH-SEC-06]].

**Changed by [[OWN-DEC-164]] (2026-10-21):** append-only during retention; owner-authorized deletion after 7 years only through [[HH-SEC-08]], with its own protected trail.
