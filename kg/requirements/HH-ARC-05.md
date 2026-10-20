---
id: HH-ARC-05
type: requirement
title: Separate frontends may share backend modules and data; one place for business policy
status: active
priority: P0
area: platform
links:
  decided_by: ["[[OWN-DEC-130]]"]
  depends_on: ["[[HH-ARC-02]]"]
  constrained_by: ["[[RULE-MONEY-CENTS]]"]
  tested_by: ["[[T23]]"]
  related: ["[[ARCH-STACK]]"]
source: "guide 3.2"
---
- The customer website and the staff website may be separate frontends or deployments. They share the backend modules and the one database ([[HH-ARC-01]]); they never need separate databases.
- Business policy (prices, totals, deposits, eligibility, coverage, transitions) lives in the shared backend once. A frontend may preview a calculation only by calling or reusing that shared code; duplicated frontend logic must never produce a competing result.
- Proposed origins: `handyhub247.com` for customers and `staff.handyhub247.com` for staff. They are deployment options: domain ownership, DNS, certificates and routing must be verified before use. They may start as `/customer`-style and `/staff` surfaces of one application on the Render staging service ([[OWN-DEC-130]]). The choice is recorded in [[ARCH-STACK]].
