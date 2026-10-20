---
id: HH-FIN-19
type: requirement
title: "Unpaid-balance reminders and 'Overdue—owner decision'"
status: active
priority: P0
area: invoicing
links:
  decided_by: ["[[OWN-DEC-112]]", "[[OWN-DEC-110]]"]
  depends_on: ["[[HH-COM-05]]"]
  constrained_by: ["[[RULE-NO-INVENTED-FACTS]]"]
  uses: ["[[ENT-Invoice]]", "[[ENT-Message]]", "[[FACT-REMINDER-CADENCES]]", "[[FACT-HOURS]]", "[[FACT-TIMEZONE]]", "[[ROLE-OWNER]]"]
  tested_by: ["[[T65]]", "[[T59]]"]
  part_of: ["[[C10]]", "[[S01]]"]
source: "OWN-DEC-112 (new behaviour; replaces the 3/7-day proposal)"
---
- A first and a final payment-reminder draft are prepared after invoice issue at the payment cadence in [[FACT-REMINDER-CADENCES]].
- Staff release them; sending happens only within contact hours in the business time zone ([[FACT-HOURS]], [[FACT-TIMEZONE]]); a draft released outside hours queues until opening.
- Before release the balance and recorded payments are refreshed. Reminders stop when the invoice is paid. A payment pending verification or an open billing dispute flags the draft for staff review instead of sending a routine demand.
- Reminders show no amounts in the email or text body; a partial-payment reminder points to the current remaining balance in the secure workspace.
- After the final reminder is actually sent and the balance remains, the invoice moves to "Overdue—owner decision" in the Owner Decisions queue. A failed delivery is a separate staff issue, never customer non-response.
- No late fees or interest; never collections, never a saved-card charge, never an automatic write-off.
