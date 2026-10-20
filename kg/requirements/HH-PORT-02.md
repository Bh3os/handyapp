---
id: HH-PORT-02
type: requirement
title: One clear next action, distinguishing waiting on the customer from waiting on HandyHub
status: active
priority: P0
area: portal
links:
  decided_by: ["[[OWN-DEC-106]]", "[[OWN-DEC-98]]", "[[OWN-DEC-103]]", "[[OWN-DEC-105]]"]
  depends_on: ["[[HH-PORT-09]]"]
  constrained_by: ["[[RULE-LANGUAGES]]"]
  uses: ["[[ENT-Project]]"]
  tested_by: ["[[T23]]"]
  part_of: ["[[C06]]"]
source: "guide 9.2 HH-PORT-02; OWN-DEC-106, OWN-DEC-98, OWN-DEC-105"
---
- The Overview shows exactly one clear next action: answer a question ("Waiting on you" with **Reply**), choose an estimate-visit window, review the estimate, pay the deposit, choose a work appointment, review a visit, review a change, pay the invoice, or contact support.
- It always says whether HandyHub is waiting on the customer or the customer is waiting on HandyHub.
- The next-step wording after approval comes from the approval rules (for example "Estimate approved—pay your deposit to proceed with scheduling." or "Estimate approved—choose your work appointment.").
