---
id: HH-INT-04
type: requirement
title: Optional request photos with a warning about private items
status: active
priority: P0
area: intake
links:
  decided_by: ["[[OWN-DEC-91]]", "[[OWN-DEC-62]]"]
  depends_on: ["[[HH-INT-06]]", "[[HH-INT-07]]", "[[HH-LEAD-03]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[ENT-Photo]]", "[[ENT-Request]]", "[[INT-R2]]"]
  tested_by: ["[[T13]]"]
  part_of: ["[[C02]]"]
source: "guide 7.2 HH-INT-04; OWN-DEC-91, OWN-DEC-62"
---
- Photos are optional; a request can be sent without any. Staff can later ask for missing photos through a published question ([[HH-LEAD-03]]).
- The upload area shows exactly: "Please don't upload payment cards, IDs, passwords, or unrelated personal information."
- Limits, validation and processing are in [[HH-INT-06]]; per-file states and recovery in [[HH-INT-07]].
