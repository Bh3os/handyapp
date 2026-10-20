---
id: HH-INT-16
type: requirement
title: Full property address and property type, with ZIP prefilled and rechecked
status: active
priority: P0
area: intake
links:
  decided_by: ["[[OWN-DEC-92]]", "[[OWN-DEC-88]]", "[[OWN-DEC-48]]", "[[OWN-DEC-139]]"]
  depends_on: ["[[HH-CUS-03]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]", "[[RULE-NO-INVENTED-FACTS]]"]
  uses: ["[[ENT-Request]]", "[[ENT-Property]]", "[[ENT-CoverageRule]]", "[[FACT-PROPERTY-TYPES]]"]
  tested_by: ["[[T07]]", "[[T24]]"]
  part_of: ["[[C02]]"]
source: "OWN-DEC-92 (replaces the guide 7.1 'optional address' row)"
---
- The full property address is required: street address, city, state and ZIP. Apartment or unit is optional. Property type is required, chosen from exactly: House; Apartment / condo; Townhouse; Rental / short-term rental ([[FACT-PROPERTY-TYPES]], [[OWN-DEC-139]]).
- The ZIP is prefilled from the coverage check ([[HH-CUS-03]]). The customer can correct it, which rechecks coverage without clearing any other answer.
- The full address is saved with the request, shown to authorized staff on the request, and included in the customer's review summary before submission ([[HH-INT-19]]).
- The address is never displayed publicly and never appears in a URL, a public reference or an ordinary analytics event.
- Outside, boundary or unknown coverage never blocks submission; the request is flagged for staff review with the stored coverage outcome.
