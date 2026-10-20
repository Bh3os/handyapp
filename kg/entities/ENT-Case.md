---
id: ENT-Case
type: entity
title: "Case (complaint, incident, damage, injury, dispute, return work)"
status: active
area: quality
links:
  decided_by: ["[[OWN-DEC-124]]", "[[OWN-DEC-135]]"]
  constrained_by: ["[[RULE-HUMAN-REVIEW]]"]
  uses: ["[[FACT-WARRANTY]]"]
source: "guide 22.1 Incident, Complaint/ReturnWork; OWN-DEC-124"
---
One tracked issue linked to a project and job.

**Fields:** kind (complaint, incident, damage, injury, dispute); category; severity; source (walkthrough, message, call, worker report); assigned person; due date; notes; photos; restricted incident section; return-work classification (including warranty claim, [[FACT-WARRANTY]]); linked return visit or job; follow-up items; owner referrals; resolution; re-check.

**States:** complaint `open → acknowledged → investigating → action_pending → resolved → closed` (reopenable); incident `reported → triaged → action_pending → resolution_review → closed`.

**Invariants:** no duplicate open case for the same project and category; never decides fault, liability or compensation; restricted details only to authorized roles; while open it pauses review and satisfaction requests and holds related records from deletion.

**Who may change:** workers report incidents; Office records complaints; the Owner triages, refers, resolves and closes.
