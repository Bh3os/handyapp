---
id: ENT-AccessInstructionSecret
type: entity
title: "Access instruction secret (access code)"
status: active
area: security
links:
  decided_by: ["[[OWN-DEC-117]]", "[[OWN-DEC-121]]", "[[OWN-DEC-70]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
source: "guide 22.1 AccessInstructionSecret; OWN-DEC-121"
---
A lockbox, gate, alarm or door code or key location for a property or visit.

**Fields:** property and visit; encrypted value; authorized audience; validity; reveal log (who, when); removed at.

**Invariants:** shown only to the assigned worker on the visit date after an online check, and to Office and Owner, every reveal audited; never in messages, exports, offline downloads, caches, logs, analytics or notes; removed when no longer needed for access; displayed copy removed after the visit and on reassignment. Customer device credentials are never stored.

**Who may change:** the customer, Office and Owner enter or remove it; nobody else.
