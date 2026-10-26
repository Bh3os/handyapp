---
id: HH-LEAD-06
type: requirement
title: Reminders for unanswered staff questions, Closed—no response, and reopening
status: active
priority: P0
area: intake
links:
  decided_by: ["[[OWN-DEC-101]]", "[[OWN-DEC-78]]", "[[OWN-DEC-153]]", "[[OWN-DEC-197]]"]
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

**Changed by [[OWN-DEC-153]], [[OWN-DEC-197]] (2026-10-21):** one automatic reminder 3 days after the notice was delivered; closing for no response checks the reminder's actual delivery and the absence of work, appointments and payments; after the reopen period staff may reopen with authorization or the customer is guided to a new request.

**Built by [[TSK-0148]] (2026-10-26):** "Closed—no response" ([[OWN-DEC-197]] E4, [[OWN-DEC-208]]) needs the reminder of every unanswered question actually sent (a delivery the provider reported sent or delivered and that still stands; queued, scheduled or handed over never counts) and the configured 24 hours since the latest such send. It is refused when a reminder failed to deliver (the request's reminder queue item asks the responsible staff member to follow up), when the customer responded since that send or a response waits for staff review, and when work was accepted, an appointment exists or a payment was recorded. E5: staff with `request.reopen` reopen a "Closed—no response" request for review with a written reason, within or after the reopen period, restoring nothing else; after the period the customer is pointed to a new request. PROPOSED details: [[OQ-QUESTION-AMENDMENT-DETAILS]].
