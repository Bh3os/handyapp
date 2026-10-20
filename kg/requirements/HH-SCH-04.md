---
id: HH-SCH-04
type: requirement
title: "Double-booking prevented at the database boundary"
status: active
priority: P0
area: scheduling
links:
  decided_by: ["[[OWN-DEC-119]]", "[[OWN-DEC-99]]", "[[OWN-DEC-105]]"]
  depends_on: ["[[HH-DATA-04]]"]
  uses: ["[[ENT-Reservation]]", "[[ENT-Visit]]"]
  tested_by: ["[[T38]]", "[[T39]]", "[[T42]]"]
  part_of: ["[[S05]]", "[[C07]]"]
source: "guide 14.2 HH-SCH-04; OWN-DEC-119"
---
- Overlap prevention is enforced in the database (an exclusion constraint on worker and equipment time ranges, or row locks per worker and item), never only in the calendar screen.
- Every confirmation, reschedule, reassignment and customer window selection checks overlapping reservations for every required worker and equipment item, and current eligibility (availability, no blocking hold), in the same transaction.
- Concurrent confirmations of the same last capacity (by different staff, or by two customers selecting windows) produce exactly one success and one conflict. The conflict response offers alternatives and changes nothing.
- One reservation mechanism serves estimate visits and work visits.
