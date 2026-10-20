---
id: HH-STAFF-07
type: requirement
title: Owner manages staff, roles and working hours; availability feeds capacity and flags conflicts
status: active
priority: P0
area: staff
links:
  decided_by: ["[[OWN-DEC-123]]", "[[OWN-DEC-114]]", "[[OWN-DEC-05]]"]
  depends_on: ["[[HH-STAFF-01]]", "[[HH-SCH-03]]", "[[HH-SCH-04]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]", "[[RULE-DECIDED-VALUES-ACTIVE]]"]
  uses: ["[[ENT-StaffUser]]", "[[ENT-RoleGrant]]", "[[ENT-Visit]]", "[[ENT-QueueItem]]"]
  tested_by: ["[[T27]]", "[[T38]]"]
  part_of: ["[[S09]]", "[[S05]]"]
source: "OWN-DEC-123"
---
- The Owner creates or invites staff accounts, assigns roles, sets each worker's working days and hours and time off, and disables accounts. No other setup or activation process exists.
- Worker availability (working days and hours, time off) feeds scheduling capacity through the capacity checks and prevents double-booking.
- A change in availability flags the affected appointments for review in the queue. It never silently cancels or moves them.
- Disabling an account follows [[HH-STAFF-02]].
- The initial field team is two employees; the owner is counted as a worker only where the owner is assigned.
