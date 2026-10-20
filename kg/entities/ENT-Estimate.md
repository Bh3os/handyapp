---
id: ENT-Estimate
type: entity
title: "Estimate"
status: active
area: estimates
links:
  decided_by: ["[[OWN-DEC-102]]", "[[OWN-DEC-118]]"]
source: "guide 22.1 Estimate"
---
The container of estimate versions ([[ENT-EstimateVersion]]) for a project.

**Fields:** estimate number; project; current version; overall state derived from the versions.

**Invariants:** revisions count under one estimate in reports; at most one effective approval.

**Who may change:** Estimator and Owner.
