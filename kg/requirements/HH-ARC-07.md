---
id: HH-ARC-07
type: requirement
title: Rules for a dedicated cross-origin API, if one is used
status: active
priority: P0
area: security
links:
  depends_on: ["[[HH-ARC-06]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  related: ["[[ARCH-STACK]]"]
source: "guide 3.2"
---
Applies only if the architecture in [[ARCH-STACK]] uses an API on a different origin from its frontend. With same-origin gateways ([[HH-ARC-06]]) nothing here is built, and the architecture record says so.

If a cross-origin API is used:
- use one maintained authentication protocol with exact allowlisted origins and explicit credential rules;
- document issuer and audience validation, and the CSRF and session behaviour for that design;
- CORS is not authorization: browsers and integrations still pass per-object permission checks on every request;
- do not mix session patterns (for example cookies on some routes and bearer tokens on others) without a recorded architecture decision.
