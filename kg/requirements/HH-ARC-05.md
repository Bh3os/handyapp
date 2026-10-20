---
id: HH-ARC-05
type: requirement
title: Separate frontends may share backend modules and data; one place for business policy
status: active
priority: P0
area: platform
links:
  decided_by: ["[[OWN-DEC-130]]", "[[OWN-DEC-133]]"]
  depends_on: ["[[HH-ARC-02]]"]
  constrained_by: ["[[RULE-MONEY-CENTS]]"]
  uses: ["[[FACT-DOMAIN]]"]
  tested_by: ["[[T23]]"]
  related: ["[[ARCH-STACK]]"]
source: "guide 3.2; OWN-DEC-130, OWN-DEC-133"
---
- The customer website and the staff website may be separate frontends or deployments. They share the backend modules and the one database ([[HH-ARC-01]]); they never need separate databases.
- Business policy (prices, totals, deposits, eligibility, coverage, transitions) lives in the shared backend once. A frontend may preview a calculation only by calling or reusing that shared code; duplicated frontend logic must never produce a competing result.
- Origins ([[OWN-DEC-133]], [[FACT-DOMAIN]]): `handyhub247.com` serves the public site and the customer portal; `staff.handyhub247.com` serves the staff app. Both are served by the one application ([[ARCH-STACK]]). Domain ownership, DNS and certificates are verified before production use ([[OQ-DOMAIN-OWNERSHIP]]); until the domains point at it, the Render staging service ([[OWN-DEC-130]]) may serve the staff app under a `/staff` path with the same separate sessions.
