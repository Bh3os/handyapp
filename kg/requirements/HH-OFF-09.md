---
id: HH-OFF-09
type: requirement
title: "Worker My Day: today's visits in order with the next action"
status: active
priority: P0
area: field
links:
  decided_by: ["[[OWN-DEC-121]]", "[[OWN-DEC-115]]", "[[OWN-DEC-40]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[ENT-Visit]]", "[[ENT-JobPacket]]", "[[ROLE-WORKER]]"]
  tested_by: ["[[T43]]", "[[T49]]"]
  part_of: ["[[S07]]"]
source: "OWN-DEC-121, OWN-DEC-115 (new behaviour; guide 11.1 Today module)"
---
- Workers sign in to My Day instead of the office action queue. It lists today's assigned visits in order, each with arrival window, address, a plain directions link that opens a maps app with the address (no maps API), access notes (never codes), preparation, readiness state and one clear next action.
- Pending-sync items and readiness blockers are visible.
- The list is built on the server from current assignments only; tentative assignments show no address.
