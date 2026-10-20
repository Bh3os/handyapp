---
id: HH-SVC-03
type: requirement
title: Service-specific questions with units, approximate values and unknown kept as unknown
status: active
priority: P0
area: intake
links:
  decided_by: ["[[OWN-DEC-91]]", "[[OWN-DEC-90]]"]
  depends_on: ["[[HH-SVC-01]]", "[[HH-INT-15]]"]
  constrained_by: ["[[RULE-NO-INVENTED-FACTS]]", "[[RULE-SAFETY-GATES]]"]
  uses: ["[[ENT-Request]]", "[[ENT-ServiceDefinition]]"]
  tested_by: ["[[T06]]"]
  part_of: ["[[C02]]"]
source: "guide 6.2 table, HH-SVC-03; OWN-DEC-91, OWN-DEC-90"
---
The "About the job" step:
- Asks short, service-specific questions for each selected service, rendered from that service's input schema (the extra inputs listed for the service in guide 6.2). Only questions relevant to the selected services appear.
- Groups the questions clearly by service, and asks questions shared by several selected services only once.
- Shows units beside every measurement and accepts approximate values. Measurements are stored as customer-reported and unverified, with their unit.
- Offers "I don't know" wherever an answer may be unknown. Unknown is stored as unknown: never zero, never safe, never approved, and it never blocks submission.
- Has one required project description, plus optional notes for each individual service.
- Keeps the customer's original wording. Staff may classify or summarize it, but the original is retained.
- Never asks for credentials, door or lock codes in the form (for example for HI-05 Door Hardware & Smart Locks).
