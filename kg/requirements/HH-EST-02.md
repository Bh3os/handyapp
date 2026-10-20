---
id: HH-EST-02
type: requirement
title: "No minimum charge; every line above $0.00; each line and total validated"
status: active
priority: P0
area: estimates
links:
  decided_by: ["[[OWN-DEC-31]]", "[[OWN-DEC-102]]", "[[OWN-DEC-145]]"]
  constrained_by: ["[[FACT-NO-MINIMUM]]", "[[RULE-MONEY-CENTS]]"]
  uses: ["[[ENT-EstimateVersion]]", "[[FACT-PRICING-DISCOUNTS]]"]
  tested_by: ["[[T02]]", "[[T03]]"]
  part_of: ["[[S04]]"]
source: "guide 13.1 HH-EST-02; OWN-DEC-31, OWN-DEC-102, OWN-DEC-145"
---
- No minimum job floor, minimum disclosure, minimum validation or automatic top-up applies anywhere: not in estimate totals, invoices, change orders, seeds, migrations, defaults or inherited calculators. No hidden setting can restore one.
- A low-value estimate keeps exactly its calculated price.
- Removing the old minimum never recalculates or rewrites a historical accepted estimate or issued invoice.
- Publishing validates every line and the final total: each line has a description, quantity and unit where applicable, and an amount in integer cents.
- Every line must be greater than $0.00: publishing refuses a $0 or negative line, and a total that is not above $0.00, with the reason shown ([[OWN-DEC-145]]). Free service never happens by accident.
- A discount is never a line: it is the separate totals row of [[FACT-PRICING-DISCOUNTS]].
