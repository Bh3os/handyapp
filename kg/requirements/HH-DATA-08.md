---
id: HH-DATA-08
type: requirement
title: Critical packet changes invalidate readiness; new workers review personally; removed assignments lose access
status: active
priority: P0
area: field
links:
  decided_by: ["[[OWN-DEC-119]]", "[[OWN-DEC-121]]", "[[OWN-DEC-123]]"]
  constrained_by: ["[[RULE-SAFETY-GATES]]"]
  uses: ["[[ENT-Job]]", "[[ENT-Visit]]", "[[ENT-StaffUser]]"]
  tested_by: ["[[T44]]", "[[T27]]", "[[T51]]"]
  part_of: ["[[S07]]"]
source: "guide 22.2; OWN-DEC-119, OWN-DEC-121, OWN-DEC-123"
---
- A critical change to a job packet (scope, approved change order, hazard, SOP version, site access, assignment) invalidates the readiness and acknowledgments of the affected staff and tasks. They must review the new packet before the Start Work gate passes again.
- A newly assigned worker always gives their own review and acknowledgment; nobody inherits another worker's acknowledgment.
- When an assignment is removed (reassignment, availability change, disabled account), the server immediately revokes the old worker's access to that job's packet and access codes, and the packet is removed from their phone when it next connects ([[OWN-DEC-121]]).

**Built by [[TSK-0147]] (2026-10-26):** the hazard and restriction details of the property and what the authorized site contact may authorize join the critical changes that end every assigned worker's acknowledgment ([[OQ-PACKET-REREVIEW-DETAILS]]).
