---
id: OWN-DEC-32
type: decision
title: Each job is priced individually on its own estimate; no fixed price list
status: active
area: estimates
links:
  related: ["[[HH-EST-01]]", "[[HH-EST-03]]", "[[HH-SVC-04]]"]
  constrained_by: ["[[RULE-MONEY-CENTS]]", "[[RULE-NO-INVENTED-FACTS]]"]
  part_of: ["[[C04]]", "[[C05]]", "[[S04]]"]
source: "vault-own-decisions.md OWN-DEC-32; project chat 2026-10-05 (decision packet item B1)"
---
Owner wording (project chat, 2026-10-05): "each job should priced individually based on the job estimate will be generated after the visit or online if it doesn't require".

Effect:
- There is no fixed price list. The estimator prices each job individually on its own estimate: line prices are entered by staff and the server computes the totals in integer cents.
- The estimate is prepared after a site visit, or online when the job needs no visit.
- The vault `Pricing/` files stay unapproved benchmarks; nothing from them is seeded as a price.
- RISK: each price rests on the estimator's judgment; consistency and margin show only through job costing.

Partly replaced by [[OWN-DEC-102]]: there is no price book at all, so the recorded "Priced per job" price-book items and their activation are not built and no price-book status gates estimates or bookability. [[OWN-DEC-99]]: staff decide whether a job needs a site visit. [[OWN-DEC-122]]: decided values (validity, no tax line) are active without an activation step.

Open:
- The margin basis: [[OQ-MARGIN-BASIS]].
