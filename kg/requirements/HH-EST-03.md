---
id: HH-EST-03
type: requirement
title: "Exact money arithmetic; internal costs never reach the customer"
status: active
priority: P0
area: estimates
links:
  decided_by: ["[[OWN-DEC-83]]", "[[OWN-DEC-102]]", "[[OWN-DEC-145]]"]
  constrained_by: ["[[RULE-MONEY-CENTS]]", "[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[ENT-EstimateVersion]]", "[[ENT-PolicyVersion]]", "[[FACT-PRICING-DISCOUNTS]]"]
  tested_by: ["[[T31]]", "[[T24]]"]
  part_of: ["[[S04]]"]
source: "guide 13.1 HH-EST-03; OWN-DEC-83, OWN-DEC-102"
---
- The server computes every line amount and total with deterministic integer-cent arithmetic: quantity times unit price, rounded once per line half-up to the cent; the subtotal equals the sum of the displayed rounded lines. A discount ([[FACT-PRICING-DISCOUNTS]]) is computed on the subtotal in integer cents, half-up, and shown as its own row before the total; the total is the subtotal minus that row, and the deposit is computed on that total. There is no hidden rounding adjustment. Client-supplied totals are ignored and recomputed.
- Each published version pins the policy versions it used: deposit rule, estimate validity, tax mode, payment term and terms version ([[ENT-PolicyVersion]]). Later policy changes never recalculate it.
- Internal cost, wages, markup assumptions, margin and confidential estimator notes are stored apart from customer-facing fields. They never appear in the customer portal, customer documents, notifications, exports for customers, or any customer API response, including by direct ID access.
