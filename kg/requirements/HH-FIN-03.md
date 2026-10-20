---
id: HH-FIN-03
type: requirement
title: "Financial permissions are separate capabilities"
status: active
priority: P0
area: payments
links:
  decided_by: ["[[OWN-DEC-67]]", "[[OWN-DEC-118]]", "[[OWN-DEC-111]]", "[[OWN-DEC-76]]"]
  depends_on: ["[[HH-STAFF-03]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[ROLE-MATRIX]]", "[[ENT-Payment]]", "[[ENT-Refund]]"]
  tested_by: ["[[T64]]", "[[T26]]"]
  part_of: ["[[S09]]"]
source: "guide 20.1 HH-FIN-03; OWN-DEC-67, OWN-DEC-111, OWN-DEC-118"
---
The server checks each of these as its own capability ([[ROLE-MATRIX]]): proposing price, publishing estimates, issuing invoices, recording collection, marking checks cleared and reconciling, approving credits and refunds, and write-offs.
- Estimators and the Owner publish estimates.
- The Owner and Office staff record verified payments. A worker records a payment they collected on an assigned job only with an explicit collect permission the Owner granted; every payment names its collector.
- Refunds, credits, write-offs and deposit waivers are Owner-only, with a fresh sign-in and a reason.
- PROPOSED DECISION: the person who collected a payment never marks it cleared or reconciles it.
