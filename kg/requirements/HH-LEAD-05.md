---
id: HH-LEAD-05
type: requirement
title: First-response clock counted only in business hours and stopped only by a meaningful response
status: active
priority: P0
area: intake
links:
  decided_by: ["[[OWN-DEC-115]]", "[[OWN-DEC-116]]", "[[OWN-DEC-35]]", "[[OWN-DEC-125]]"]
  depends_on: ["[[HH-LEAD-01]]"]
  constrained_by: ["[[RULE-NO-INVENTED-FACTS]]", "[[RULE-DECIDED-VALUES-ACTIVE]]"]
  uses: ["[[ENT-Request]]", "[[ENT-Message]]", "[[FACT-RESPONSE-TARGET]]", "[[FACT-HOURS]]", "[[FACT-TIMEZONE]]"]
  part_of: ["[[S01]]", "[[S02]]", "[[S11]]"]
source: "OWN-DEC-115, OWN-DEC-116"
---
- Every new request has a first-response clock against the response target ([[FACT-RESPONSE-TARGET]]). It counts only during the daily hours ([[FACT-HOURS]]) in the configured business time zone ([[FACT-TIMEZONE]]) and pauses outside them; a request received outside hours starts counting when the hours begin.
- The queue item shows the remaining time or overdue status ([[HH-OPS-01]]). The target is labelled internal and is never presented as a customer guarantee.
- The clock stops only when a meaningful staff response is successfully sent (for example a reply, a published question, visit options or a published decision whose delivery succeeded) or a completed customer conversation is recorded (for example a logged phone call with an outcome).
- Opening, assigning, drafting and the automatic receipt never stop it. A failed response delivery leaves the clock running and stays an action item.
- The owner dashboard reports time to first meaningful response and the share answered within the target from these same records.
