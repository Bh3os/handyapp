---
id: HH-CHG-01
type: requirement
title: "Contents of a change-order version"
status: active
priority: P0
area: field
links:
  decided_by: ["[[OWN-DEC-108]]", "[[OWN-DEC-83]]", "[[OWN-DEC-145]]", "[[OWN-DEC-168]]", "[[OWN-DEC-169]]", "[[OWN-DEC-203]]"]
  constrained_by: ["[[RULE-MONEY-CENTS]]", "[[FACT-NO-MINIMUM]]", "[[FACT-TAX-NO-LINE]]"]
  uses: ["[[ENT-ChangeOrder]]", "[[ENT-Job]]"]
  tested_by: ["[[T53]]"]
  part_of: ["[[C08]]"]
source: "guide 18.1 HH-CHG-01"
---
Each change-order version ([[ENT-ChangeOrder]]) links to its job and holds:
- reason and origin (worker proposal, customer request, estimator, emergency follow-up);
- requested or proposed scope, added and removed quantities with units;
- price lines in integer cents, each greater than $0.00 and rounded once half-up ([[OWN-DEC-145]]), the price delta and the revised total; removed scope is never a negative line; no tax line and no minimum;
- schedule impact, affected hazards and resources;
- the evidence photos and measurements;
- drafter, publisher (estimator or Owner) and version number.

States: `draft → reviewed → issued → approved / rejected / expired / superseded / withdrawn`.

**Changed by [[OWN-DEC-168]], [[OWN-DEC-169]] (2026-10-21):** contents also include the original job and approved estimate references, the updated project total, deposit or payment adjustments, approval requirements and publication and expiry timestamps (valid 7 days); negative change orders document removed work or credits as a negative adjustment in the totals (PROPOSED reading).

**Changed by [[OWN-DEC-203]] (2026-10-22):** a credit change order carries explicit credit lines (positive magnitude in cents, negative financial effect) and lowers the updated project total; charge lines stay above $0.00; the result can never be a negative customer charge.
