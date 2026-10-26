---
id: HH-SCH-07
type: requirement
title: "Reschedule, reassign and cancel with history; notify after commit"
status: active
priority: P0
area: scheduling
links:
  decided_by: ["[[OWN-DEC-119]]", "[[OWN-DEC-107]]", "[[OWN-DEC-100]]", "[[OWN-DEC-134]]", "[[OWN-DEC-152]]", "[[OWN-DEC-195]]"]
  depends_on: ["[[HH-API-04]]", "[[HH-PORT-04]]"]
  uses: ["[[ENT-Visit]]", "[[ENT-Reservation]]", "[[ENT-JobPacket]]", "[[ENT-AccessInstructionSecret]]", "[[ENT-Message]]", "[[ENT-AuditEvent]]", "[[FACT-AUTOMATIC-MESSAGES]]", "[[FACT-CANCELLATION-RULES]]"]
  tested_by: ["[[T42]]", "[[T25]]", "[[T65]]"]
  part_of: ["[[S05]]", "[[C07]]"]
source: "guide 14.2 HH-SCH-07; OWN-DEC-107, OWN-DEC-119"
---
- Reschedule, reassignment and cancellation carry the current version (a stale version is refused), validate the new workers and resources before anything changes, keep the previous booking in history and record the actor and reason.
- If the proposed change fails, the current appointment stays exactly as it was.
- The customer is notified automatically only after the change is committed, never when it is merely requested ([[FACT-AUTOMATIC-MESSAGES]]). Notifications reference the committed current appointment only. One notice per change; retries never duplicate it.
- Affected workers are notified and their job packets refreshed. A worker removed from a visit loses server access to that visit's packet and access codes on the next request, and the packet is removed from their phone on next sync ([[HH-OFF-07]]).
- A failed message delivery creates a staff exception with a retry action; it never rolls back a valid schedule.
- Customer reschedule and cancellation requests follow [[HH-PORT-04]]; when staff confirm one, it runs through the rules above. Rescheduling is always free; cancellation charges and deposit refunds follow [[FACT-CANCELLATION-RULES]] and are Owner actions ([[HH-FIN-14]]).
- Cancelling work that was accepted, scheduled or paid routes to the Owner for cancellation and financial review.
- When HandyHub cancels or moves a visit (weather, safety stop, sick worker), the customer chooses a free reschedule or a full refund ([[OWN-DEC-134]]).

**Changed by [[OWN-DEC-152]], [[OWN-DEC-195]] (2026-10-21):** a committed cancellation sends the automatic visit-cancelled notice; reschedules record their initiator; Office processes routine work-visit cancellations within policy.

**Built by [[TSK-0140]] (2026-10-26, migration 0115):** a reschedule of a confirmed visit is refused without who started it (INITIATOR_REQUIRED; a customer's request is the customer's). Office cancels a work visit when the customer asked and the outcome is one the rules decide (`work.cancel_routine`); HandyHub's own cancellation of a work visit, one after contracted work started and any exception stay the Owner's, and a customer's cancellation request opens the Owner's financial-review item only when it is not routine. Only Start Work is "work started"; the four markers are shown apart. Estimate bookings of a customer with repeated short-notice cancellations or no-shows open an Owner review item once `cancellation.repeat_review` is set (NOT CONFIGURED). PROPOSED details: [[OQ-CANCELLATION-RULES-DETAILS]].
