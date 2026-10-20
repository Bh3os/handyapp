---
id: ENT-StartGateEvaluation
type: entity
title: "Start-gate evaluation"
status: active
area: safety
links:
  decided_by: ["[[OWN-DEC-121]]"]
  constrained_by: ["[[RULE-SAFETY-GATES]]"]
source: "guide 16.1; vault 05 StartGateEvaluation"
---
The immutable record of one Start Work attempt.

**Fields:** job, visit, worker; packet version; result per prerequisite of [[HH-WORK-01]] with missing items and resolution owner; outcome (`ready`, `needs_attention`, `blocked`, `requires_review`); approved exceptions used; time; resulting start event.

**Invariants:** a start needs a passing evaluation inside the start transaction; online only.

**Who may change:** created by the server.
