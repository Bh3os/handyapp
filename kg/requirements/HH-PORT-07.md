---
id: HH-PORT-07
type: requirement
title: On the way notice and arrival updates only when actually recorded; no tracking
status: active
priority: P0
area: portal
links:
  decided_by: ["[[OWN-DEC-107]]"]
  depends_on: ["[[HH-SCH-08]]", "[[HH-COM-06]]"]
  constrained_by: ["[[RULE-NO-INVENTED-FACTS]]", "[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[ENT-Visit]]", "[[ENT-StaffUser]]", "[[INT-Bird]]", "[[INT-Resend]]"]
  tested_by: ["[[T23]]", "[[T65]]"]
  part_of: ["[[C07]]", "[[S07]]"]
source: "guide 9.2 HH-PORT-07; OWN-DEC-107"
---
- The customer sees "On the way" only after an assigned worker explicitly taps **"On my way"** for that visit. The tap is allowed normally from three hours before the visit and only when actually departing for that customer; time alone never triggers it, and a worker cannot tap it for a visit assigned to someone else.
- The on-the-way notice sends automatically ([[HH-COM-06]]) with the assigned workers' first names and the confirmed arrival window. It never contains an invented ETA, and there is no live tracking or GPS at launch.
- Notices are blocked for canceled or superseded visits; repeated taps create no duplicate notices; delivery failures are recorded for staff.
- Any future GPS feature needs a specified consent, purpose, work-hour limits, audience, retention and worker controls before it is built.
