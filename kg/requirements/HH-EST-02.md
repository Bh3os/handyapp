---
id: HH-EST-02
type: requirement
title: "No minimum charge; each line and total validated"
status: active
priority: P0
area: estimates
links:
  decided_by: ["[[OWN-DEC-31]]", "[[OWN-DEC-102]]"]
  constrained_by: ["[[FACT-NO-MINIMUM]]", "[[RULE-MONEY-CENTS]]"]
  uses: ["[[ENT-EstimateVersion]]"]
  tested_by: ["[[T02]]", "[[T03]]"]
  part_of: ["[[S04]]"]
source: "guide 13.1 HH-EST-02; OWN-DEC-31, OWN-DEC-102"
---
- No minimum job floor, minimum disclosure, minimum validation or automatic top-up applies anywhere: not in estimate totals, invoices, change orders, seeds, migrations, defaults or inherited calculators. No hidden setting can restore one.
- A low-value estimate keeps exactly its calculated price.
- Removing the old minimum never recalculates or rewrites a historical accepted estimate or issued invoice.
- Publishing validates every line and the final total: each line has a description, quantity and unit where applicable, and an amount in integer cents.
- A zero or negative line or total that is not an approved discount line ([[HH-EST-01]]) is refused at publishing with the reason shown. No owner-approved handling for free or negative-priced work exists, so it stays refused; free service never happens by accident.
