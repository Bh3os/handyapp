---
id: HH-PORT-04
type: requirement
title: Request to Reschedule and Request Cancellation keep the booking until staff confirm
status: active
priority: P0
area: portal
links:
  decided_by: ["[[OWN-DEC-107]]", "[[OWN-DEC-104]]", "[[OWN-DEC-76]]"]
  depends_on: ["[[HH-SCH-07]]", "[[HH-STAFF-06]]"]
  constrained_by: ["[[RULE-NO-INVENTED-FACTS]]", "[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[ENT-Visit]]", "[[ENT-AuditEvent]]"]
  tested_by: ["[[T25]]", "[[T42]]"]
  part_of: ["[[C07]]", "[[S05]]"]
source: "guide 9.2 HH-PORT-04; OWN-DEC-107"
---
- The Appointments tab offers **"Request to Reschedule"** and **"Request Cancellation"** for estimate and work visits. After a request the customer sees "Request received—awaiting staff confirmation."
- A request records the customer's intent (and any reason or preferred times) and appears prominently in the staff queue, where staff confirm or decline it. It is audited.
- The existing confirmed appointment stays visible and in force until staff commit the change; a declined or failed change leaves it intact.
- No cancellation fee is shown (none is configured). Deposit and refund decisions follow owner-approved policy: they are routed to the owner, never automatic, and no refund terms are invented.
- A committed change notifies the customer automatically ([[HH-COM-06]]). If self-service confirmed changes are added later, they use the same authoritative capacity and policy checks as dispatch.
