---
id: HH-INT-03
type: requirement
title: Estimate approach preference with Let HandyHub decide; estimates are free
status: active
priority: P0
area: intake
links:
  decided_by: ["[[OWN-DEC-93]]", "[[OWN-DEC-99]]", "[[OWN-DEC-66]]"]
  depends_on: ["[[HH-LEAD-07]]"]
  constrained_by: ["[[RULE-NO-INVENTED-FACTS]]", "[[RULE-DECIDED-VALUES-ACTIVE]]"]
  uses: ["[[ENT-Request]]", "[[ENT-Visit]]", "[[FACT-VISIT-FEE]]"]
  tested_by: ["[[T37]]"]
  part_of: ["[[C02]]", "[[C04]]"]
source: "guide 7.1 HH-INT-03; OWN-DEC-93, OWN-DEC-99, OWN-DEC-66"
---
- The contact step offers **Online Estimate**, **Site Visit** or **"Let HandyHub decide"**, and explains that staff confirm the appropriate approach after review.
- The choice is stored on the request and shown to staff. It is a preference only ([[HH-SVC-04]]).
- A site visit is a separate appointment record of type "Estimate visit" with its purpose ([[HH-LEAD-07]]); it is not a work job and implies no price approval.
- Online and onsite estimates are free. No visit fee is displayed or charged ([[FACT-VISIT-FEE]]) unless the owner explicitly changes that policy; any future fee must be disclosed before booking.
