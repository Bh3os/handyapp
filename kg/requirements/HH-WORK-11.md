---
id: HH-WORK-11
type: requirement
title: "Job-specific SOP checklist in six ordered stages"
status: active
priority: P0
area: field
links:
  decided_by: ["[[OWN-DEC-108]]"]
  depends_on: ["[[HH-PKT-03]]"]
  constrained_by: ["[[RULE-NO-INVENTED-FACTS]]", "[[RULE-SAFETY-GATES]]"]
  uses: ["[[ENT-Task]]", "[[ENT-SOPVersion]]", "[[ENT-WorkPackage]]", "[[ENT-Photo]]"]
  tested_by: ["[[T47]]", "[[T43]]"]
  part_of: ["[[C08]]", "[[S07]]"]
source: "OWN-DEC-108 (new behaviour; no guide id)"
---
- Before starting, the worker sees the approved scope, site information, hazards, safety checklist, tools and materials. Start Work stays blocked until the required checks pass and no critical hold remains.
- After the safety checks and Start Work, the ordered checklist for the job's selected services opens, built from their SOP versions ([[HH-PKT-03]]):
  1. site preparation and property protection;
  2. setup and required measurements and checks;
  3. service-specific work steps;
  4. quality checks at the appropriate stages;
  5. cleanup and waste handling;
  6. final checks, completion photos and customer walkthrough.
- Each step shows what to do, the expected result and any required photo, measurement or note. Workers check off steps; progress saves on the server and in the offline packet and resumes where the worker stopped.
- A required step cannot be silently skipped. Skipping needs a reason, is visible to the reviewer, and blocks completion when the step is mandatory.
- Steps that depend on a pending change order are blocked until it is approved; the others continue.
- Checklist history is append-only.
