---
id: HH-LEAD-06
type: requirement
title: Reminders for unanswered staff questions, Closed—no response, and reopening
status: active
priority: P0
area: intake
links:
  decided_by: ["[[OWN-DEC-101]]", "[[OWN-DEC-78]]"]
  depends_on: ["[[HH-LEAD-03]]", "[[HH-COM-09]]", "[[HH-COM-05]]"]
  constrained_by: ["[[RULE-DECIDED-VALUES-ACTIVE]]", "[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[ENT-Question]]", "[[ENT-Request]]", "[[ENT-Message]]", "[[FACT-REMINDER-CADENCES]]", "[[FACT-REOPEN-PERIOD]]", "[[FACT-HOURS]]"]
  tested_by: ["[[T65]]"]
  part_of: ["[[C04]]", "[[S01]]", "[[S02]]"]
source: "OWN-DEC-101"
---
- For an unanswered published question, a first reminder draft and a final reminder draft are prepared at the unanswered-question intervals in [[FACT-REMINDER-CADENCES]], both measured from the original notice's **successful** send. A failed notice never starts the clock and never counts as customer non-response.
- Staff release each reminder draft; the drafts appear prominently in the action queue. Released reminders send only within the contact hours ([[HH-COM-09]]).
- Reminders stop immediately when the customer replies.
- Staff may close an unbooked request as **"Closed—no response"** only 24 hours after the final reminder was actually sent.
- A customer reply within the reopen period ([[FACT-REOPEN-PERIOD]], an active configurable value) reopens the same request for staff review with its history kept. Reopening does not restore an expired estimate or appointment.
- This rule never automatically cancels accepted, scheduled or paid work.
- The other reminder cadences of [[OWN-DEC-78]] are unchanged by this rule.
