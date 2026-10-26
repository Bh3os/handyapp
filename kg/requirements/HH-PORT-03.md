---
id: HH-PORT-03
type: requirement
title: Filtered customer timeline with plain-language status labels
status: active
priority: P0
area: portal
links:
  decided_by: ["[[OWN-DEC-106]]", "[[OWN-DEC-64]]", "[[OWN-DEC-108]]", "[[OWN-DEC-100]]", "[[OWN-DEC-101]]", "[[OWN-DEC-199]]"]
  depends_on: ["[[HH-STAFF-05]]"]
  constrained_by: ["[[RULE-LANGUAGES]]", "[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[ENT-Project]]", "[[ENT-Job]]", "[[ENT-Visit]]", "[[ENT-Hold]]"]
  tested_by: ["[[T23]]", "[[T24]]", "[[T48]]"]
  part_of: ["[[C06]]", "[[C08]]", "[[C09]]"]
source: "guide 9.2 HH-PORT-03, 23.1; OWN-DEC-64, OWN-DEC-108, OWN-DEC-100"
---
The Overview and timeline show the latest update and these customer labels, with meaningful timestamps and the next step:

| Operational situation | Customer label and next step |
| --- | --- |
| Received, not yet qualified | Request received · HandyHub will review the details |
| Awaiting customer facts | More information needed · Answer the listed questions ("Waiting on you") |
| Site review required | Site visit needed · Choose a visit window |
| Published current estimate | Estimate ready · Review this estimate |
| Accepted, no confirmed visit | Approved · Scheduling is next |
| Confirmed appointment | Scheduled · View date, window and preparation |
| En route | On the way · Recorded arrival update ([[HH-PORT-07]]) |
| Active work | Work in progress · View shared updates |
| Safety hold | "Work is paused for safety review" |
| Other hold or incident | Update pending · Customer-appropriate explanation and contact |
| Quality review or punch items | Completion review / "Follow-up work" |
| Operationally complete | Work complete · Review care notes and invoice |
| Not a fit or canceled | The decision and reason ([[HH-LEAD-08]]) |
| Closed for no response | "Closed—no response" ([[HH-LEAD-06]]) |

- The payment summary is shown separately, never merged into one status that hides an unpaid balance or unfinished work.
- The timeline never shows risk scores, employee notes, internal photos or confidential incident or hazard details.

**Changed by [[OWN-DEC-199]] (2026-10-21):** wording is approved only after it is checked against behaviour.

**Checked by [[TSK-0150]] (2026-10-26):** a started job is "Work in progress", a job paused after its safety hold was released is "Update pending", and the payment summary names an unpaid invoice balance. Where the table's own words differ from what is built (care notes, preparation, shared updates, Arrived), PROPOSED changes wait in [[OQ-PORTAL-WORDING-DETAILS]].
