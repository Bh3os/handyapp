---
id: HH-INC-03
type: requirement
title: "Resuming needs documented resolution and renewed checks"
status: active
priority: P0
area: safety
links:
  decided_by: ["[[OWN-DEC-108]]", "[[OWN-DEC-38]]"]
  constrained_by: ["[[RULE-SAFETY-GATES]]", "[[RULE-HUMAN-REVIEW]]"]
  uses: ["[[ENT-Hold]]", "[[ENT-JobPacket]]", "[[ENT-Acknowledgment]]"]
  tested_by: ["[[T54]]"]
  part_of: ["[[C08]]", "[[S10]]"]
source: "guide 18.2 HH-INC-03; OWN-DEC-108"
---
- Resuming affected work needs: the hold resolved with evidence by someone with the authority the hold names (never the person who raised it, [[HH-WORK-02]]); refreshed scope or SOP where needed; a new packet version; each worker's new review; and the Start Work gate passing again online.
- Resolving an app flag is never a certification that the site is safe or a legal conclusion, and the app never says so.

**Built by [[TSK-0094]] (2026-10-25):** after Stop Work / Report Hazard pauses a job, each worker who started before the pause resumes through the Start Work screen (`POST /staff/visits/:visitId/resume`, `work.resume`): every prerequisite again, the open critical hold refusing it until the Owner released it through its own path (never the person who raised it), a site check recorded after the pause, and the packet version the release made viewed and personally acknowledged. The resumption (`work.work_resumptions`, migration 0102) names its passing evaluation; the database moves a paused job back to in progress only with it, and after a pause refuses the checklist, the walkthrough and Finished from a worker who has not resumed. The screen says that releasing a hold in the app is not a certification that the site is safe or a legal conclusion. Details in [[OQ-RETURN-WORK-DETAILS]].
