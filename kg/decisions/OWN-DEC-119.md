---
id: OWN-DEC-119
type: decision
title: Scheduling board with server-side reservations
status: active
area: scheduling
links:
  related: ["[[OWN-DEC-82]]", "[[OWN-DEC-99]]", "[[OWN-DEC-104]]", "[[OWN-DEC-105]]", "[[OWN-DEC-123]]", "[[HH-SCH-01]]", "[[HH-SCH-03]]", "[[HH-SCH-04]]", "[[HH-SCH-05]]", "[[HH-SCH-06]]", "[[HH-SCH-07]]", "[[HH-DATA-04]]", "[[OWN-DEC-194]]", "[[OWN-DEC-195]]"]
  uses: ["[[FACT-AUTOMATIC-MESSAGES]]", "[[FACT-DEPOSIT-RULE]]", "[[ENT-Visit]]"]
  constrained_by: ["[[RULE-SAFETY-GATES]]"]
source: "owner-answers-verbatim 2026-10-12T19:31:46.613Z [S5 Schedule]; decision-briefs 2026-10-12T19:32:10"
---
Partly replaced by [[OWN-DEC-194]], [[OWN-DEC-195]] (2026-10-21): one active offer per visit, replaced only with a reason and a customer notice; reschedules record their initiator.

Owner, 2026-10-12, staff journey S5, scheduling board.

Question asked:
> Staff S5 - Scheduling board: the Office/Dispatcher sees a day/week board per worker with visits (estimate visits and work visits), arrival windows, travel time between addresses and capacity. They offer windows to customers, confirm reservations, reassign workers, and handle reschedule/cancel requests. A visit can't be confirmed for a worker who is already booked, or on a job with an unpaid required deposit, a safety hold, or a 'Hold' readiness note. Changing a confirmed visit notifies the customer automatically. OK?

Owner wording:
> Yes, with these refinements:
>
> - Provide day/week views by worker, plus a simple mobile list. Distinguish estimate visits from work visits.
> - Show arrival windows, expected work duration, travel/setup buffers, assigned workers, and capacity. Allow staff-entered travel estimates; do not invent precise travel times.
> - Reserve every worker needed for a visit. A two-person job occupies both workers.
> - Prevent overlapping bookings on the server, including simultaneous confirmations by different staff. Recheck capacity when customers select proposed windows.
> - Apply the required-deposit gate to work visits, not free estimate visits. A verified deposit or recorded owner waiver satisfies it.
> - Block confirmation for unresolved critical safety holds or explicit blocking readiness holds. Ordinary notes and nonblocking warnings must not accidentally prevent scheduling.
> - Reschedule/reassign only after validating the new resources. Preserve the previous booking history and record the actor and reason.
> - Notify customers automatically after a change is committed—not merely requested. Notify affected workers and refresh their job packets and access.
> - Keep the current appointment intact if a proposed change fails. Expose delivery failures without duplicating reservations or notices.
> - Support forms/buttons as alternatives to dragging calendar entries.
>
> Implement, test, and publish on private staging using test notifications.

Effect:
- Day and week views by worker plus a simple mobile list; estimate visits look different from work visits. Forms and buttons are available as alternatives to dragging.
- Shown: arrival windows, expected duration, travel/setup buffers, assigned workers and capacity. Travel estimates are staff-entered; precise travel times are never invented (no maps API).
- Every worker a visit needs is reserved (a two-person job occupies both). Overlaps are prevented on the server, including simultaneous confirmations by different staff, and capacity is rechecked when a customer picks a window. One reservation mechanism serves estimate and work visits ([[OWN-DEC-99]], [[OWN-DEC-105]]).
- The required-deposit gate applies to work visits only ([[OWN-DEC-104]]); a verified deposit or a recorded owner waiver satisfies it.
- Confirmation is blocked only by unresolved critical safety holds or explicit blocking readiness holds (the job-level Hold/Ready of [[OWN-DEC-82]]); ordinary notes and non-blocking warnings never block scheduling.
- Reschedule/reassign validates the new resources first, keeps the previous booking history and records actor and reason. A failed change leaves the current appointment intact.
- The customer is notified automatically only after a change is committed ([[FACT-AUTOMATIC-MESSAGES]]); affected workers are notified and their job packets and access refreshed (the old worker loses the packet and access codes).
- Delivery failures are exposed without duplicate reservations or notices. Worker availability comes from [[OWN-DEC-123]].

Links: uses [[FACT-AUTOMATIC-MESSAGES]], [[FACT-DEPOSIT-RULE]], [[ENT-Visit]]; constrained by [[RULE-SAFETY-GATES]].
