---
id: HH-PORT-04
type: requirement
title: Request to Reschedule and Request Cancellation keep the booking until staff confirm
status: active
priority: P0
area: portal
links:
  decided_by: ["[[OWN-DEC-107]]", "[[OWN-DEC-104]]", "[[OWN-DEC-76]]", "[[OWN-DEC-134]]"]
  depends_on: ["[[HH-SCH-07]]", "[[HH-OPS-01]]"]
  constrained_by: ["[[RULE-NO-INVENTED-FACTS]]", "[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[ENT-Visit]]", "[[ENT-AuditEvent]]", "[[FACT-CANCELLATION-RULES]]"]
  tested_by: ["[[T25]]", "[[T42]]"]
  part_of: ["[[C07]]", "[[S05]]"]
source: "guide 9.2 HH-PORT-04; OWN-DEC-107"
---
- The Appointments tab offers **"Request to Reschedule"** and **"Request Cancellation"** for estimate and work visits. After a request the customer sees "Request received—awaiting staff confirmation."
- A request records the customer's intent (and any reason or preferred times) and appears prominently in the staff queue, where staff confirm or decline it. It is audited.
- The existing confirmed appointment stays visible and in force until staff commit the change; a declined or failed change leaves it intact.
- Rescheduling is always free. A confirmed cancellation follows [[FACT-CANCELLATION-RULES]] ([[OWN-DEC-134]]): staff see the applicable outcome (notice before the visit, whether work started, any deposit paid), and refunds or the $50.00 late-cancellation amount are Owner actions ([[HH-FIN-14]]), never automatic. Customer-facing wording of the rules comes from the estimate terms after attorney review ([[OQ-ATTORNEY-TERMS]]); no other fee or refund term is shown or invented.
- A committed change notifies the customer automatically ([[HH-COM-06]]). If self-service confirmed changes are added later, they use the same authoritative capacity and policy checks as dispatch.
