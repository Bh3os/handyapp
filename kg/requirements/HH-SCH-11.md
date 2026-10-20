---
id: HH-SCH-11
type: requirement
title: "One window-offer and reservation mechanism; work-visit windows after approval"
status: active
priority: P0
area: scheduling
links:
  decided_by: ["[[OWN-DEC-99]]", "[[OWN-DEC-105]]", "[[OWN-DEC-119]]", "[[OWN-DEC-144]]"]
  depends_on: ["[[HH-SCH-04]]", "[[HH-SCH-06]]"]
  uses: ["[[ENT-Visit]]", "[[ENT-Reservation]]", "[[ENT-Message]]", "[[FACT-AUTOMATIC-MESSAGES]]", "[[FACT-VISIT-FEE]]", "[[FACT-HOURS]]"]
  tested_by: ["[[T38]]", "[[T37]]"]
  part_of: ["[[C05]]", "[[C07]]", "[[S05]]"]
  related: ["[[HH-LEAD-07]]"]
source: "OWN-DEC-99, OWN-DEC-105 (new behaviour; no guide id)"
---
- One mechanism offers windows and reserves capacity for both estimate visits and work visits. The estimate-visit flow (online or site visit, free estimates, its notices) is [[HH-LEAD-07]]; this node adds the mechanism and work visits.
- Staff offer 2–3 feasible windows computed from the assigned workers' capacity, the expected job duration, travel buffers and required resources. Work-visit windows are offered only after approval and once the deposit gate is satisfied ([[HH-SCH-06]], [[HH-EST-12]]).
- Publishing window options sends a brief automatic notice ([[FACT-AUTOMATIC-MESSAGES]]); retries never duplicate it; failures show to staff.
- The customer selects one window or requests other times without restarting.
- On selection the server rechecks availability and reserves every required worker and resource in one transaction ([[HH-SCH-04]]). The visit is confirmed only after the reservation succeeds; otherwise the customer is offered alternatives. Two customers racing for one slot get one confirmation and one alternative offer.
- The confirmed work visit shows the date, arrival window, property address and preparation instructions, and a confirmation notice sends automatically.
- Offered windows hold the needed workers and resources for 24 hours from the offer ([[OWN-DEC-144]]); a hold is never a confirmed booking ([[HH-SCH-05]]). Selecting a window turns its hold into the confirmed reservation and releases the other offered windows; unselected holds release automatically after 24 hours. Selection still rechecks availability: if the hold has expired and the slot is gone, the customer is offered alternatives.
