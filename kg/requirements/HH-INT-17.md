---
id: HH-INT-17
type: requirement
title: Preferred date or I'm flexible, and an optional Need help today request
status: active
priority: P0
area: intake
links:
  decided_by: ["[[OWN-DEC-92]]", "[[OWN-DEC-56]]", "[[OWN-DEC-66]]", "[[OWN-DEC-122]]"]
  depends_on: ["[[HH-INT-02]]"]
  constrained_by: ["[[RULE-NO-INVENTED-FACTS]]", "[[RULE-DECIDED-VALUES-ACTIVE]]"]
  uses: ["[[ENT-Request]]", "[[FACT-TIMEZONE]]"]
  tested_by: ["[[T09]]", "[[T41]]"]
  part_of: ["[[C02]]"]
source: "OWN-DEC-92, OWN-DEC-56"
---
- The customer chooses a preferred date or **"I'm flexible."** Standard dates start tomorrow, computed in the property's local time zone ([[FACT-TIMEZONE]]).
- **"Need help today?"** is an optional flag: a request for staff review, never a guaranteed or confirmed appointment. It is stored with the request and shown to staff.
- A same-day service charge is shown only when an approved same-day charge policy exists. The amount is never invented; same-day service is offered only when there is an opening, and any approved extra charge appears on the estimate.
- Preferred date, flexible flag, windows ([[HH-INT-02]]) and the need-help-today flag are kept when the customer navigates back.
