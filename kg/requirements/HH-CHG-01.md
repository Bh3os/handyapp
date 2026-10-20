---
id: HH-CHG-01
type: requirement
title: "Contents of a change-order version"
status: active
priority: P0
area: field
links:
  decided_by: ["[[OWN-DEC-108]]", "[[OWN-DEC-83]]"]
  constrained_by: ["[[RULE-MONEY-CENTS]]", "[[FACT-NO-MINIMUM]]", "[[FACT-TAX-NO-LINE]]"]
  uses: ["[[ENT-ChangeOrder]]", "[[ENT-Job]]"]
  tested_by: ["[[T53]]"]
  part_of: ["[[C08]]"]
source: "guide 18.1 HH-CHG-01"
---
Each change-order version ([[ENT-ChangeOrder]]) links to its job and holds:
- reason and origin (worker proposal, customer request, estimator, emergency follow-up);
- requested or proposed scope, added and removed quantities with units;
- price delta in integer cents, rounded once per line half-up, and the revised total; no tax line and no minimum;
- schedule impact, affected hazards and resources;
- the evidence photos and measurements;
- drafter, publisher (estimator or Owner) and version number.

States: `draft → reviewed → issued → approved / rejected / expired / superseded / withdrawn`.
