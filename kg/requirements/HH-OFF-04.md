---
id: HH-OFF-04
type: requirement
title: "Start, approvals, financial and final actions need online authority"
status: active
priority: P0
area: field
links:
  decided_by: ["[[OWN-DEC-121]]"]
  constrained_by: ["[[RULE-SAFETY-GATES]]", "[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[ENT-FieldEvent]]", "[[ENT-StartGateEvaluation]]"]
  tested_by: ["[[T50]]"]
  part_of: ["[[S07]]"]
source: "guide 17.1 HH-OFF-04; OWN-DEC-121"
---
These require an online, authoritative server check at launch:
- a new Start Work (the online readiness check);
- resuming after a critical hold;
- estimate or change-order approval (no offline change-order approval);
- confirming a reschedule;
- every financial mutation;
- role changes;
- final operational closeout and submission for quality review.

Offline use can never bypass a safety hold or approve extra work. Offline drafts are not server-confirmed completion.
