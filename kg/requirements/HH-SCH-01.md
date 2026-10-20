---
id: HH-SCH-01
type: requirement
title: "Visit model: preference, scheduling task, tentative and confirmed are separate"
status: active
priority: P0
area: scheduling
links:
  decided_by: ["[[OWN-DEC-99]]", "[[OWN-DEC-105]]", "[[OWN-DEC-56]]", "[[OWN-DEC-144]]"]
  uses: ["[[ENT-Visit]]", "[[ENT-SchedulingTask]]", "[[ENT-Reservation]]", "[[ENT-Project]]", "[[ENT-Job]]"]
  tested_by: ["[[T37]]", "[[T09]]"]
  part_of: ["[[S05]]", "[[C07]]", "[[C04]]"]
source: "guide 14.1 HH-SCH-01; 23 (Visit, Scheduling task); OWN-DEC-99, OWN-DEC-105"
---
Four things are kept separate: the customer's timing preference (from the request), the staff scheduling task, a tentative visit, and a confirmed appointment. A preference is never shown as a booking.

A visit ([[ENT-Visit]]) has:
- purpose: `site_estimate` (shown as "Estimate visit"), `service` (work visit), `follow_up`, or `return_work`;
- a link to its project (estimate visits) or job (all other purposes);
- local date, arrival window, IANA time zone and UTC instants;
- expected work duration, preparation and travel buffers;
- required staffing (number of workers) and equipment; assigned workers;
- state and version, with the full history of every window it had.

An estimate visit belongs to the existing project. It creates no job and implies no price approval. One job may have several visits (multi-day work, drying waits, return work).

Visit states: `tentative → confirmed → en_route → arrived → completed`; `tentative → expired` (an offered visit holds capacity for 24 hours, [[HH-SCH-11]]); a confirmed visit may become `canceled` or `no_access`. A reschedule adds history and a new committed version; it never erases the old one.
