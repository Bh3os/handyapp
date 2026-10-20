---
id: HH-LEAD-07
type: requirement
title: Estimate online or site visit; estimate-visit windows reserved before confirmation
status: active
priority: P0
area: intake
links:
  decided_by: ["[[OWN-DEC-99]]", "[[OWN-DEC-119]]", "[[OWN-DEC-66]]"]
  depends_on: ["[[HH-SCH-01]]", "[[HH-SCH-04]]", "[[HH-COM-06]]"]
  constrained_by: ["[[RULE-NO-INVENTED-FACTS]]", "[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[ENT-Visit]]", "[[ENT-Project]]", "[[FACT-VISIT-FEE]]", "[[FACT-TIMEZONE]]"]
  tested_by: ["[[T37]]", "[[T38]]"]
  part_of: ["[[C04]]", "[[S02]]", "[[S05]]"]
source: "OWN-DEC-99"
---
- Staff choose **"Estimate online"** when the information is sufficient, or **"Site visit needed"** with a short customer-facing explanation. The customer's preference ([[HH-INT-03]]) is shown and considered; staff confirm the approach.
- For a site visit, staff offer 2–3 available windows that account for staff capacity and travel, using the single window and reservation mechanism shared with work visits. The customer selects one in the workspace, or requests another time without restarting the request.
- Availability is rechecked when a window is selected. The appointment is confirmed only after the slot is reserved; otherwise the customer is offered alternatives. Two customers racing for one slot produce one confirmation and one conflict.
- The confirmation creates an appointment of type **"Estimate visit"** linked to the existing project: no work job and no implied price approval. The required-deposit gate never applies to estimate visits.
- The project shows the confirmed date, arrival window, property address, visit purpose and preparation instructions.
- Online and onsite estimates are free ([[FACT-VISIT-FEE]]); no visit fee is displayed or charged unless the owner explicitly changes that policy, and any future fee is disclosed before booking.
- Publishing visit options and confirming the appointment each send a brief automatic notice ([[HH-COM-06]]). Retries never duplicate sends; delivery failures show to staff.
