---
id: HH-SCH-13
type: requirement
title: "Scheduling board: day and week by worker, mobile list"
status: active
priority: P0
area: scheduling
links:
  decided_by: ["[[OWN-DEC-119]]"]
  depends_on: ["[[HH-A11Y-02]]"]
  uses: ["[[ENT-Visit]]", "[[ENT-Reservation]]", "[[ENT-StaffUser]]", "[[ROLE-OFFICE]]"]
  tested_by: ["[[T42]]", "[[T69]]"]
  part_of: ["[[S05]]"]
source: "OWN-DEC-119 (new behaviour; guide 11.1 Schedule module)"
---
- Office/Dispatcher and Owner see day and week views by worker, plus a simple list on phones.
- Estimate visits are visually distinct from work visits.
- Each entry shows arrival window, expected work duration, travel and setup buffers, assigned workers and remaining capacity.
- Every drag action has an accessible form or button alternative.
- Board actions (offer windows, confirm, reassign, handle reschedule or cancel requests) use the same server rules as everywhere else ([[HH-SCH-04]], [[HH-SCH-06]], [[HH-SCH-07]]).
