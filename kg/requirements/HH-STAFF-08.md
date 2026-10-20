---
id: HH-STAFF-08
type: requirement
title: "Audit-log screen in staff management"
status: active
priority: P0
area: staff
links:
  decided_by: ["[[OWN-DEC-123]]", "[[OWN-DEC-70]]", "[[OWN-DEC-142]]"]
  depends_on: ["[[HH-SEC-06]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[ENT-AuditEvent]]"]
  tested_by: ["[[T74]]"]
  part_of: ["[[S09]]"]
source: "OWN-DEC-123"
---
Staff management ([[S09]]) has the audit-log screen: the Owner browses every entry, Office staff their own actions, each showing who, when, the affected record and the change summary.

What is audited, the entry contents, immutability, redaction, role visibility and the 7-year retention are defined only in [[HH-SEC-06]] (entity [[ENT-AuditEvent]]).
