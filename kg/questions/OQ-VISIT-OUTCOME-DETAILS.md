---
id: OQ-VISIT-OUTCOME-DETAILS
type: question
title: The visit-outcome details no decision gives
status: open
area: scheduling
links:
  related: ["[[HH-SCH-09]]", "[[HH-WORK-03]]", "[[HH-PORT-07]]", "[[ENT-Visit]]", "[[OWN-DEC-68]]", "[[OWN-DEC-107]]", "[[TSK-0078]]", "[[ROLE-MATRIX]]"]
source: "TSK-0078 (2026-10-23): HH-SCH-09 states the rules; the details below are PROPOSED"
---
**Question:** does the owner approve, or change, these PROPOSED details of visit outcomes?

- **Who answers:** the owner.
- **Decided, in use:** the worker records an explicit outcome for a delay, no access, customer absent, weather, missing resources or a readiness issue. Each creates a staff action item with the responsible person. No access moves the visit to `no_access` and never marks work complete. Customer absence starts work only under the Owner-approved "customer not present" exception. A delay is told to the customer from the recorded window or a staff-approved update, never an invented arrival time ([[HH-SCH-09]], [[HH-WORK-03]]).
- **PROPOSED, in use on private staging:**
  - Who records: a worker assigned to the visit (the Owner too, when assigned). This is the permission-matrix row "Tap On my way, Arrived, Finished"; the matrix names no separate outcome action.
  - When: while the visit is confirmed, on the way or arrived. "No access" is also possible once the worker is on the way or has arrived (they reached the property and could not get in). It is refused once work started on the visit: that is an issue report or Stop Work.
  - Every outcome needs a note (at most 2,000 characters). The note is for staff only and is never sent to the customer.
  - Only "no access" changes the visit. The others leave it as it is; staff then reschedule, cancel or contact the customer through the existing visit routes.
  - The follow-up item is seen by the Owner and Office (those who reschedule visits). It is in the "today's appointment changes" band on the visit's own date, and assigned to the request's responsible staff member when there is one. Staff close it by writing what was done (once).
  - The customer's Overview shows "Update pending" while a follow-up is open. No reason, note, worker name or time is shown, and no message is sent automatically (none of the 21 owner templates covers it).
- **Until answered:** the PROPOSED details above are used; each is a small change to the nodes or the code.
