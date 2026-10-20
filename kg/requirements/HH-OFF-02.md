---
id: HH-OFF-02
type: requirement
title: "Offline caches exclude access codes, finance and restricted records"
status: active
priority: P0
area: field
links:
  decided_by: ["[[OWN-DEC-121]]", "[[OWN-DEC-40]]"]
  depends_on: ["[[HH-CRM-03]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[ENT-JobPacket]]", "[[ENT-AccessInstructionSecret]]", "[[ENT-AuditEvent]]"]
  tested_by: ["[[T49]]", "[[T28]]"]
  part_of: ["[[S07]]"]
source: "guide 17.1 HH-OFF-02; OWN-DEC-121"
---
- Offline caches never hold access codes, finance exports, unneeded customer history or restricted incident details. Only current assignment data is cached, and it expires and is purged when the assignment or access window ends.
- Access codes are shown only to the assigned worker, on the visit date, after an online permission check; every reveal is audited. They are never in offline downloads. The displayed copy is removed after the visit and on reassignment.
- The service address follows the worker access window: visible from visit confirmation through the service day.
