---
id: HH-STAFF-08
type: requirement
title: Automatic, immutable audit log with redaction, role-based visibility and retention
status: active
priority: P0
area: staff
links:
  decided_by: ["[[OWN-DEC-123]]", "[[OWN-DEC-70]]"]
  depends_on: ["[[HH-SEC-06]]", "[[HH-PRIV-01]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[ENT-AuditEvent]]", "[[FACT-RETENTION-SCHEDULE]]"]
  tested_by: ["[[T74]]"]
  part_of: ["[[S09]]"]
source: "OWN-DEC-123"
---
- Important actions are recorded automatically: sign-ins and failed sign-ins, approvals, payment entries and corrections, customer merges and relinks, role changes, safety events, and the other events in [[HH-SEC-06]]. Each entry records who, when, the affected record and the relevant changes (a diff).
- Audit entries cannot be edited or deleted through the app or the API; a correction creates a new entry.
- Passwords, tokens, access codes and sensitive message contents never appear in logs or audit diffs (redaction, with a test).
- The Owner sees the full audit log. Office staff see their own audit actions, plus the operational history their role needs on the records they can access.
- Audit records follow the retention schedule ([[FACT-RETENTION-SCHEDULE]]) through the owner deletion-review queue; they are not kept forever and never deleted automatically.
