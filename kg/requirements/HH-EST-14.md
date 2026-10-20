---
id: HH-EST-14
type: requirement
title: "Unanswered-estimate reminder drafts and their stop rules"
status: active
priority: P0
area: estimates
links:
  decided_by: ["[[OWN-DEC-78]]", "[[OWN-DEC-65]]"]
  depends_on: ["[[HH-COM-05]]"]
  uses: ["[[ENT-Message]]", "[[ENT-EstimateVersion]]", "[[FACT-REMINDER-CADENCES]]"]
  tested_by: ["[[T65]]"]
  part_of: ["[[C05]]", "[[S01]]"]
source: "OWN-DEC-78 (new behaviour; guide 21.2 Estimate reminder)"
---
- The system prepares a first and a final reminder draft for a published estimate the customer has not answered, at the estimate cadence in [[FACT-REMINDER-CADENCES]], measured from publishing.
- Drafts are never sent automatically. Staff release each one; drafts waiting for release appear in the staff action queue.
- Each reminder links to the secure project workspace, where the customer can approve, ask a question, request changes or request another service. It contains no amounts and no private details. Wording is a neutral template with no promises, prices or warranties.
- Stop rules, checked when the draft is created and again at release and send time: no reminder after acceptance, decline, expiry, withdrawal or supersession of the version, or after any customer response (message, question or change request). A stopped draft is cancelled with its reason.
- Channel preferences are respected; a failed delivery is a staff issue, never a customer non-response.
