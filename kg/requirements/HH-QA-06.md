---
id: HH-QA-06
type: requirement
title: "Complaint cases with a truthful status for the customer"
status: active
priority: P0
area: quality
links:
  decided_by: ["[[OWN-DEC-124]]"]
  constrained_by: ["[[RULE-HUMAN-REVIEW]]"]
  uses: ["[[ENT-Case]]", "[[ENT-Photo]]", "[[ENT-Project]]"]
  tested_by: ["[[T56]]", "[[T67]]"]
  part_of: ["[[S10]]", "[[C11]]"]
source: "guide 19.2 HH-QA-06; 23 (Complaint); OWN-DEC-124"
---
- A complaint from a walkthrough, a message or a call becomes a case ([[ENT-Case]]) linked to the project and job, with category, severity, assigned person, due date, notes, supporting photos, acknowledgment state, follow-up actions and outcome.
- Duplicates are avoided: when an open case exists for the same project and category, staff are offered "add to existing case".
- States: `open → acknowledged → investigating → action_pending → resolved → closed`, with a permitted reopening.
- Corrective work is tracked through assigned follow-up items. Closing requires a recorded resolution and any necessary re-check; history is kept.
- The customer sees a truthful case status, never an automatic denial or resolution.
- While the case is open, review invitations and satisfaction checks for that project are paused ([[HH-QA-10]]); records relevant to it are kept from deletion ([[HH-PRIV-03]]).
