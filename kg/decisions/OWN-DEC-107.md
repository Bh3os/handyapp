---
id: OWN-DEC-107
type: decision
title: Appointment reminders, reschedule/cancel requests and "On my way"
status: active
area: scheduling
links:
  related: ["[[OWN-DEC-78]]", "[[OWN-DEC-106]]", "[[OWN-DEC-119]]", "[[OQ-DEPOSIT-REFUND-CANCELLATION]]", "[[HH-PORT-04]]", "[[HH-PORT-07]]", "[[HH-SCH-07]]", "[[HH-SCH-08]]", "[[HH-COM-05]]"]
  uses: ["[[FACT-REMINDER-CADENCES]]", "[[FACT-AUTOMATIC-MESSAGES]]", "[[ENT-Visit]]"]
source: "owner-answers-verbatim 2026-10-12T19:01:14.144Z [7 Appointment]; decision-briefs 2026-10-12T19:01:51"
---
Owner, 2026-10-12, journey Step 7, appointment.

Question asked:
> Step 7 - Appointment: 24 hours before, a reminder with preparation steps is drafted and staff release it (your cadence rule). The customer can 'Request to Reschedule' or 'Cancel' from the project. Both are requests that staff handle; no automatic cancellation, and no fee shown (none configured). On the day, when the worker taps 'On my way' (allowed from 3 hours before), the customer gets an automatic 'Your HandyHub team is on the way' notice with the worker's first name, without live tracking. OK?

Owner wording:
> Yes, with these refinements:
>
> - Prepare the appointment reminder 24 hours before, including the confirmed date/window, address, and approved preparation steps. Staff release it. For appointments confirmed less than 24 hours ahead, prepare it immediately.
> - Recheck the current appointment before sending; suppress outdated, canceled, or duplicate reminders.
> - Label customer actions **“Request to Reschedule”** and **“Request Cancellation.”** Show “Request received—awaiting staff confirmation.” Keep the existing appointment visible until staff confirm the change.
> - Put these requests prominently in the staff queue. Show no cancellation fee because none is configured. Any deposit/refund decision follows owner-approved policy.
> - Allow the assigned worker to tap **“On my way”** normally from three hours before the visit, but only when actually departing for that customer. The time alone must never trigger the notice.
> - Send the on-the-way notice automatically, with assigned workers’ first names and the confirmed arrival window. Do not invent an ETA or show live tracking.
> - Block notices for canceled or superseded visits and prevent duplicates on repeated taps. Record delivery failures for staff.
>
> Implement, test, and publish this on private staging using test notifications.

Effect:
- The reminder draft is prepared 24 hours before (immediately when the appointment is confirmed less than 24 hours ahead) with the confirmed date/window, address and approved preparation steps; staff release it ([[FACT-REMINDER-CADENCES]]).
- Before sending, the current appointment is rechecked; outdated, cancelled and duplicate reminders are suppressed.
- Customer actions are "Request to Reschedule" and "Request Cancellation"; afterwards the customer sees "Request received—awaiting staff confirmation." and the existing appointment stays visible until staff confirm a change.
- These requests are prominent in the staff queue ([[OWN-DEC-115]]). No cancellation fee is shown (none configured); deposit and refund questions go to the owner and no refund terms are invented ([[OQ-DEPOSIT-REFUND-CANCELLATION]]).
- "On my way" can be tapped by the assigned worker from three hours before the visit, only when actually departing for that customer; time alone never triggers it, and it is not available for a visit assigned to someone else.
- The on-the-way notice sends automatically ([[FACT-AUTOMATIC-MESSAGES]]) with the assigned workers' first names and the confirmed arrival window; no invented ETA, no live tracking.
- Notices are blocked for cancelled or superseded visits, repeated taps send once, and delivery failures are recorded for staff.

Links: uses [[FACT-REMINDER-CADENCES]], [[FACT-AUTOMATIC-MESSAGES]], [[ENT-Visit]].
