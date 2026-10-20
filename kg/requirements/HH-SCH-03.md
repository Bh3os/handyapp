---
id: HH-SCH-03
type: requirement
title: "Real capacity: workers, hours, buffers, equipment, two-person tasks"
status: active
priority: P0
area: scheduling
links:
  decided_by: ["[[OWN-DEC-119]]", "[[OWN-DEC-123]]", "[[OWN-DEC-82]]", "[[OWN-DEC-66]]", "[[OWN-DEC-05]]"]
  uses: ["[[ENT-Reservation]]", "[[ENT-StaffUser]]", "[[ENT-Visit]]", "[[FACT-HOURS]]"]
  tested_by: ["[[T39]]", "[[T38]]"]
  part_of: ["[[S05]]", "[[S09]]"]
source: "guide 14.2 HH-SCH-03; OWN-DEC-82, OWN-DEC-119, OWN-DEC-123"
---
- Capacity is modelled per individual worker: working days and hours set by the Owner, approved time off, existing reservations, required staffing per visit, preparation and cleanup buffers, staff-entered travel estimates, drying or multi-visit dependencies, and equipment reservations.
- Travel times are entered by staff; precise travel times are never invented and no maps API is used.
- A two-person task reserves both workers for the whole window; the initial team of two employees is never shown as two simultaneous crews for it.
- Visits are scheduled only inside the business visit hours ([[FACT-HOURS]]), checked on the server.
- Worker qualifications, licenses and certifications are not tracked at launch. An unresolved requirement is a job-level Hold ([[HH-SCH-06]]).
- When the Owner changes a worker's availability, affected appointments are flagged for review; they are never cancelled silently. Disabling an account flags that worker's upcoming assignments for reassignment.
