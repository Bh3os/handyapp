---
id: HH-WORK-06
type: requirement
title: "Arrived and Finished timestamps per worker; no payroll"
status: active
priority: P0
area: field
links:
  decided_by: ["[[OWN-DEC-69]]", "[[OWN-DEC-149]]"]
  constrained_by: ["[[RULE-HUMAN-REVIEW]]"]
  uses: ["[[ENT-TimeStamp]]", "[[ENT-AuditEvent]]", "[[ROLE-OWNER]]"]
  tested_by: ["[[T47]]"]
  part_of: ["[[S07]]", "[[S11]]"]
source: "guide 16.2 HH-WORK-06; OWN-DEC-69"
---
- There is no categorized time tracking: no work, travel, break or waiting timers.
- Each assigned worker's tap on "Arrived" and on "Finished" records a separate timestamp ([[ENT-TimeStamp]]); the elapsed visit duration is linked to that worker and job. Several workers on one job have separate records.
- The Owner may correct a forgotten or wrong timestamp; the original value and the reason are kept.
- A missing timestamp is flagged, never invented.
- Records export for the accountant (CSV). No payroll, overtime, deductions or paystubs are calculated (payroll stays a human-review area).
- "Arrived" never starts work or bypasses the Start Work gate.
- Lone work: there are no interval check-ins; a worker alone records only Arrived and Finished ([[OWN-DEC-149]]). Stop Work and Report Hazard stay available at any time ([[HH-WORK-09]]).
