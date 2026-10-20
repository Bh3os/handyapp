---
id: HH-SEC-06
type: requirement
title: Automatic, append-only audit of important actions with owner and office visibility rules
status: active
priority: P0
area: security
links:
  decided_by: ["[[OWN-DEC-123]]", "[[OWN-DEC-114]]", "[[OWN-DEC-117]]", "[[OWN-DEC-118]]", "[[OWN-DEC-70]]", "[[OWN-DEC-142]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[ENT-AuditEvent]]", "[[FACT-RETENTION-SCHEDULE]]"]
  tested_by: ["[[T28]]", "[[T64]]", "[[T74]]"]
  part_of: ["[[S09]]"]
source: "guide 25.3; OWN-DEC-123"
---
Audited automatically (each module emits its events):
- sign-ins, failed sign-ins, password resets, MFA enrolment and reset, account disable and session revocation ([[OWN-DEC-114]]);
- role grants and changes, invitations, working-hours and availability changes, offboarding;
- identity linking, customer merges, record-link corrections and their reversal ([[OWN-DEC-117]]);
- contact and property access changes; every reveal of a protected access secret;
- estimate creation, revision, publication and acceptance, with creator, reviser and publisher ([[OWN-DEC-118]]); change-order approvals;
- appointment confirmations, reschedules, reassignments, cancellations and customer requests;
- gate exceptions, work start, stop and holds, hold resolution, safety events, critical SOP publication;
- customer sharing, QA release, invoice issue;
- payment entries, refunds, credits, write-offs and payment corrections, reconciliation;
- exports, deletions and archive actions (the deletion log keeps actor, time, record reference and reason, never the deleted content, [[OWN-DEC-70]]);
- policy and configuration changes.

Each entry records actor, action, affected record, time, versions, reason, request correlation ID and a safe change summary (diff).

Rules ([[OWN-DEC-123]]):
- Entries cannot be edited or deleted through the app; a correction is a new entry. Tamper protection keeps the log append-only.
- Passwords, tokens, access codes, raw secrets and sensitive message contents never appear in audit diffs or logs; they are redacted, and a test checks it.
- The Owner sees the full audit log. Office staff see their own audit actions, plus the operational timeline of records their role may access. Estimators and Workers see no audit-log screen; they see only the record timelines their role allows (PROPOSED default from least privilege; the owner has not stated it).
- Audit records are kept 7 years ([[FACT-RETENTION-SCHEDULE]], [[OWN-DEC-142]]), then go to the owner's deletion-review queue; records under a case or legal hold are kept until the hold ends. They are never deleted automatically.
