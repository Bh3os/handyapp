---
id: HH-COM-01
type: requirement
title: Customer conversations linked to project and actor; internal conversations separate
status: active
priority: P0
area: messaging
links:
  decided_by: ["[[OWN-DEC-120]]", "[[OWN-DEC-116]]", "[[OWN-DEC-129]]"]
  depends_on: ["[[HH-COM-07]]", "[[HH-COM-10]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[ENT-Message]]", "[[ENT-Project]]", "[[ENT-Customer]]", "[[INT-Bird]]", "[[INT-Resend]]"]
  tested_by: ["[[T24]]", "[[T66]]"]
  part_of: ["[[S06]]", "[[C06]]"]
source: "guide 21.1 HH-COM-01; OWN-DEC-120, OWN-DEC-116"
---
- Every meaningful customer conversation — project messages, outbound and inbound email and texts — is linked to the correct customer, project and actor. Inbound email and texts arrive through real integrations ([[HH-COM-10]]) and are matched as in [[HH-COM-07]].
- Internal operational conversations and notes are separate from customer messages and never reach the customer.
- Free-text notes and messages never become binding scope or price changes; those need a published estimate or change order and customer approval.
- Phone calls can be logged with a summary, source, author, time and outcome; a completed logged call counts as a recorded customer conversation for the response clock ([[HH-LEAD-05]]).
