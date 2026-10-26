---
id: HH-CRM-03
type: requirement
title: Access codes in a protected store with narrow, audited, visit-bound access
status: active
priority: P0
area: records
links:
  decided_by: ["[[OWN-DEC-117]]", "[[OWN-DEC-121]]", "[[OWN-DEC-70]]", "[[OWN-DEC-171]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]", "[[RULE-SAFETY-GATES]]"]
  uses: ["[[ENT-AccessInstructionSecret]]", "[[ENT-Property]]", "[[ENT-Visit]]", "[[ENT-AuditEvent]]", "[[FACT-RETENTION-SCHEDULE]]"]
  tested_by: ["[[T28]]", "[[T49]]"]
  part_of: ["[[S03]]", "[[S07]]"]
source: "guide 12.1 HH-CRM-03; OWN-DEC-117, OWN-DEC-121, OWN-DEC-70"
---
- Access codes and other access secrets live in a dedicated protected table, separate from notes and property fields. Access is role-limited; values are masked by default and every reveal is audited.
- A worker sees a code only when assigned to the visit, on the visit date, after an online permission check. Codes are never in offline downloads; the displayed copy is removed after the visit and on reassignment.
- Codes are never copied into ordinary notes, emails, texts, public work orders, analytics, logs or exports to roles that may not see them.
- Codes are removed when no longer needed for authorized access ([[FACT-RETENTION-SCHEDULE]]).

**Changed by [[OWN-DEC-171]] (2026-10-21):** codes show only on the visit day after an explicit audited action; access ends with the property's local service day; Owner extensions expire automatically ([[HH-PKT-08]]). Built by [[TSK-0128]]: the visit date is read in the property's zone, and a worker sees no code entry before the day ([[OQ-WORKER-ACCESS-DETAILS]]).
