---
id: OQ-VISIT-CHANGE-DETAILS
type: question
title: The reschedule, reassign, cancel and change-request details no decision gives
status: open
area: scheduling
links:
  related: ["[[HH-SCH-07]]", "[[HH-PORT-04]]", "[[OWN-DEC-107]]", "[[OWN-DEC-119]]", "[[OWN-DEC-134]]", "[[FACT-CANCELLATION-RULES]]", "[[FACT-AUTOMATIC-MESSAGES]]", "[[HH-FIN-14]]", "[[HH-OFF-07]]", "[[TSK-0066]]", "[[TSK-0069]]", "[[TSK-0070]]", "[[TSK-0089]]"]
source: "TSK-0066 (2026-10-21): HH-SCH-07 and HH-PORT-04 state the rules; the details below are PROPOSED or wait for later tasks"
---
**Question:** does the owner approve, or change, these PROPOSED details of changing a booked visit?

- **Who answers:** the owner; the customer-facing wording of the cancellation rules with the attorney ([[OQ-ATTORNEY-TERMS]]).
- **Decided, in use:** a reschedule, reassignment or cancellation carries the version shown, checks the new window or team first (every confirmation precondition, the deposit gate, the holds and the capacity, in one transaction), keeps the previous booking as history and records the actor and reason; a refused change leaves the appointment as it was. A customer's "Request to Reschedule" or "Request Cancellation" never changes the booking; the customer sees "Request received—awaiting staff confirmation." The customer's "Appointment changed" notice (#11) sends only after a committed reschedule or reassignment, once per change; affected workers get the staff notice. The outcome of a cancellation follows [[FACT-CANCELLATION-RULES]] from the active `cancellation.rules`, and every refund, kept or invoiced amount is the Owner's action, never automatic ([[HH-FIN-14]]).
- **PROPOSED, in use on private staging:**
  - A reason is required for every reschedule of a confirmed visit, every reassignment, cancellation and declined request. Who initiated a reschedule (the customer, or HandyHub with its cause: weather, safety stop, sick worker, other) is optional; for a cancellation it is required.
  - The notice of a customer's cancellation is measured from the time of the customer's request (or, when staff record a cancellation for the customer, from that moment) to the start of the arrival window.
  - Work has started when the job is past preparation (in progress, paused, ready for QA or later) or one of its work visits arrived or completed. The Start Work records of [[TSK-0073]] will refine this.
  - Only a verified deposit counts; an uncleared check is shown apart and never counted.
  - Cancelling a work visit, and confirming or declining a customer's cancellation request of one, is the Owner's (work.cancel_with_financial_review); Office cancels estimate visits. A customer's cancellation request of a work visit also opens the Owner Decisions item "Work cancellation (Owner review)".
  - A reassignment keeps the window, may change the lead, and runs every confirmation precondition like a reschedule; dragging an entry onto another worker's lane on the visit's own day only opens Reassign with that swap.
  - One open request per visit; a second request of the same kind answers the open one. A request closes by itself when the visit leaves "confirmed" any other way.
  - "Appointment changed" (#11) applies to estimate visits as well as work visits. A cancellation is not on the automatic list, so the customer is not messaged automatically; the portal shows the appointment as canceled and staff write to the customer when needed.
  - A canceled visit leaves the job's scheduling task as it is; staff plan a new visit.
  - Customer-facing labels beyond the owner's ("Request to Reschedule", "Request Cancellation", "Request received—awaiting staff confirmation.") are PROPOSED (OQ-PORTAL-WORDING): for example "HandyHub could not make the change you asked for. Your appointment stays as shown."
- **Waiting for later tasks:** job packets and the worker's offline copy do not exist yet ([[TSK-0069]], [[TSK-0079]]), and no worker route reads assignments yet ([[TSK-0070]]): workers reach no packet or access code today. Those tasks read the visit's active confirmed reservations, so a worker removed by a reassignment loses the packet and access codes on the next request, and the packet leaves the phone on the next sync ([[HH-OFF-07]]). Applying a refund or the late-cancellation amount is [[TSK-0089]].
- **Until answered:** the PROPOSED details above are used; each is a small code or catalog change.
