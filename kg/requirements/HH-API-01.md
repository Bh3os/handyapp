---
id: HH-API-01
type: requirement
title: Machine-readable API contract with per-operation actor, permission, schemas and behaviour
status: active
priority: P0
area: platform
links:
  depends_on: ["[[HH-ARC-02]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  related: ["[[ARCH-STACK]]"]
source: "guide 24.1"
---
- The API has a machine-readable OpenAPI contract (or the stack's equivalent), regenerated whenever routes change and checked in CI against the implemented routes.
- Each operation specifies: actor, permission, record scope, request and response schemas, validation, side effects, state and version checks, idempotency, rate limits, timeout, pagination, cache behaviour, safe errors, audit, and the test that covers it.
- Response schemas are explicit, so an undeclared field (for example an internal note) cannot leak into a customer response ([[HH-ARC-04]]).
