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

**Built by [[TSK-0094]] (2026-10-25):** staff who work a case classify its return work (`quality.return_work`, migration 0102) into the seven classes; the server reads the warranty window from the local date the Owner's quality review passed and records a workmanship problem as a warranty claim inside the 90 days of [[FACT-WARRANTY]] and as a workmanship callback after them (the database checks the same). Only the Owner records coverage and price, with a note and no amount; nothing applies coverage, and no exclusion exists. A case with return work closes only after that decision. Details in [[OQ-RETURN-WORK-DETAILS]].
