---
id: HH-SCH-07
type: requirement
title: "Reschedule, reassign and cancel with history; notify after commit"
status: active
priority: P0
area: scheduling
links:
  decided_by: ["[[OWN-DEC-119]]", "[[OWN-DEC-107]]", "[[OWN-DEC-100]]"]
  depends_on: ["[[HH-API-04]]", "[[HH-PORT-04]]"]
  uses: ["[[ENT-Visit]]", "[[ENT-Reservation]]", "[[ENT-JobPacket]]", "[[ENT-AccessInstructionSecret]]", "[[ENT-Message]]", "[[ENT-AuditEvent]]", "[[FACT-AUTOMATIC-MESSAGES]]"]
  tested_by: ["[[T42]]", "[[T25]]", "[[T65]]"]
  part_of: ["[[S05]]", "[[C07]]"]
source: "guide 14.2 HH-SCH-07; OWN-DEC-107, OWN-DEC-119"
---
- Reschedule, reassignment and cancellation carry the current version (a stale version is refused), validate the new workers and resources before anything changes, keep the previous booking in history and record the actor and reason.
- If the proposed change fails, the current appointment stays exactly as it was.
- The customer is notified automatically only after the change is committed, never when it is merely requested ([[FACT-AUTOMATIC-MESSAGES]]). Notifications reference the committed current appointment only. One notice per change; retries never duplicate it.
- Affected workers are notified and their job packets refreshed. A worker removed from a visit loses server access to that visit's packet and access codes on the next request, and the packet is removed from their phone on next sync ([[HH-OFF-07]]).
- A failed message delivery creates a staff exception with a retry action; it never rolls back a valid schedule.
- Customer reschedule and cancellation requests follow [[HH-PORT-04]]; when staff confirm one, it runs through the rules above. No cancellation fee exists; any deposit or refund decision routes to the Owner.
- Cancelling work that was accepted, scheduled or paid routes to the Owner for cancellation and financial review.
