---
id: ENT-ChangeOrder
type: entity
title: "Change order version"
status: active
area: field
links:
  decided_by: ["[[OWN-DEC-108]]"]
  constrained_by: ["[[RULE-MONEY-CENTS]]"]
source: "guide 22.1 ChangeOrderRevision; 23 (Change revision)"
---
A versioned delta to approved scope, price or time; fields per [[HH-CHG-01]].

**States:** `draft → reviewed → issued → approved / rejected / expired / superseded / withdrawn`.

**Invariants:** a draft or request binds nothing; approval binds the exact version and adds one scope snapshot; issued versions are immutable.

**Who may change:** workers draft; Estimator and Owner review and issue; the identified customer approves or rejects.
