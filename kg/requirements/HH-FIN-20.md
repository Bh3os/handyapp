---
id: HH-FIN-20
type: requirement
title: "Job gross margin with an advisory flag below the target"
status: active
priority: P1
area: payments
links:
  decided_by: ["[[OWN-DEC-189]]"]
  depends_on: ["[[HH-FIN-17]]"]
  constrained_by: ["[[RULE-MONEY-CENTS]]"]
  uses: ["[[FACT-MARGIN-TARGET]]", "[[ENT-Job]]", "[[ENT-Invoice]]", "[[ENT-Payment]]", "[[ENT-ChangeOrder]]", "[[ENT-Refund]]"]
  tested_by: ["[[T73]]"]
  part_of: ["[[S11]]"]
source: "OWN-DEC-189 (new behaviour; no guide id)"
---
- Each job shows price, direct costs, gross profit, gross margin and the variance from its estimated margin; estimated and actual figures are kept apart.
- Net revenue includes approved discounts, change orders, credits and refunds; deposits count only once recognized, never twice. Direct costs: labor (from an Owner-entered cost rate; none exists yet), employee burden where known, materials, subcontractors, rentals, disposal and other directly attributable expenses.
- A job below [[FACT-MARGIN-TARGET]] is flagged on the Owner Dashboard (advisory); the Owner records a reason. Incomplete cost data is labelled incomplete; zero revenue, losses and negative margins compute safely.
- Overhead and business net profit are never mixed into job gross margin.
