---
id: HH-QA-07
type: requirement
title: "Return work is classified; humans decide coverage and price"
status: active
priority: P0
area: quality
links:
  decided_by: ["[[OWN-DEC-135]]"]
  constrained_by: ["[[RULE-HUMAN-REVIEW]]", "[[RULE-NO-INVENTED-FACTS]]"]
  uses: ["[[ENT-Case]]", "[[ENT-Job]]", "[[FACT-WARRANTY]]"]
  tested_by: ["[[T56]]"]
  part_of: ["[[S10]]"]
source: "guide 19.2 HH-QA-07"
---
- Return work is classified as one of: open punch, workmanship callback, warranty claim, new scope, customer change or damage, product or manufacturer issue, unresolved classification.
- A workmanship problem reported within 90 days of the reviewed completion date is a warranty claim under [[FACT-WARRANTY]] ([[OWN-DEC-135]]): it opens a case with return-visit punch items ([[HH-QA-08]], [[OWN-DEC-124]]).
- Authorized staff (the Owner) decide coverage and pricing under the reviewed policy; warranty coverage is never applied automatically and no exclusions are invented. Legal or financial exposure goes to the Owner for professional review.
