---
id: HH-SCH-09
type: requirement
title: "Delays, no access and customer absence have explicit outcomes"
status: active
priority: P0
area: scheduling
links:
  decided_by: ["[[OWN-DEC-68]]", "[[OWN-DEC-107]]"]
  uses: ["[[ENT-Visit]]", "[[ENT-Job]]", "[[ENT-Message]]"]
  tested_by: ["[[T48]]", "[[T55]]"]
  part_of: ["[[C07]]", "[[S07]]", "[[S01]]"]
source: "guide 14.3 HH-SCH-09"
---
- The worker records an explicit outcome for: delay, no access, customer absent, weather, missing resources, or a readiness issue. Each outcome creates an owner action item in the staff queue with the responsible person.
- No access moves the visit to `no_access`; it never marks work complete.
- Customer absence allows starting only under the "customer not present" administrative exception ([[HH-WORK-03]]); otherwise the work does not start.
- Customer updates about a delay use the recorded window or a staff-approved update, never an invented arrival time.
