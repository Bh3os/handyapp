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
- The customer sees "On the way" only after an assigned worker's recorded **"On my way"** tap for that visit; the tap rules are [[HH-SCH-08]].
- The on-the-way notice sends automatically ([[HH-COM-06]]) with the assigned workers' first names and the confirmed arrival window. It never contains an invented ETA, and there is no live tracking or GPS at launch.
- One notice per accepted tap ([[HH-SCH-08]]); none for canceled or superseded visits; delivery failures are recorded for staff.
- Any future GPS feature needs a specified consent, purpose, work-hour limits, audience, retention and worker controls before it is built.

**Limitation (owner input; reviewer: Owner):** The on-the-way notice has no approved wording ([[OQ-ON-THE-WAY-WORDING]]): each delivery is recorded as failed (`template_not_configured`) with a staff Retry, never as sent; the visit still moves on the way.
