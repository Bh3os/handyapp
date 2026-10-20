---
id: HH-BASE-02
type: requirement
title: No minimum job charge anywhere; history not recalculated
status: active
priority: P0
area: estimates
links:
  decided_by: ["[[OWN-DEC-31]]", "[[OWN-DEC-102]]"]
  constrained_by: ["[[RULE-MONEY-CENTS]]", "[[RULE-NO-INVENTED-FACTS]]"]
  uses: ["[[FACT-NO-MINIMUM]]"]
  tested_by: ["[[T02]]", "[[T03]]"]
  part_of: ["[[S04]]", "[[C05]]"]
source: "guide 1.4, 29.1, 30.4; OWN-DEC-31, OWN-DEC-102"
---
HandyHub has no minimum job charge ([[FACT-NO-MINIMUM]]).
- No minimum-charge calculation, rule type, policy option, validation, disclosure text, acknowledgement or automatic top-up exists in estimates, change orders, invoices, the request form, the site, templates, seeds, fixtures, reports or calculators (client or server). No per-item quantity floor either.
- A low-value estimate keeps exactly its calculated, approved price (T02).
- Historical accepted estimates and issued invoices are never recalculated or rewritten because of this rule (T03). If old records carry a minimum adjustment, they keep it as history; only new quotes are affected.
- No later migration, seed or default may reintroduce a minimum (Definition of done item 5).
