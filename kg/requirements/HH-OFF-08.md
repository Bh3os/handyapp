---
id: HH-OFF-08
type: requirement
title: "Fuller offline workflows only after controls are proven"
status: active
priority: P1
area: field
links:
  constrained_by: ["[[RULE-SAFETY-GATES]]"]
  part_of: ["[[S07]]"]
source: "guide 17.2 HH-OFF-08"
---
Fuller offline workflows are considered only after threat, conflict, freshness and device controls are proven. Server start and safety gates are never bypassed to make an offline demo look complete.

**Built by [[TSK-0115]] (2026-10-26), off until the Owner turns it on:** each additional offline action is a switch in `field.offline_actions` (nothing on by default; only the Owner, with a reason, after walking the offline controls on staging). The first one is checklist steps (start, pause, resume, complete); uploads are decided again on the server through the online route's checks, and refusals go to the Owner's review. The list and its details are PROPOSED in [[OQ-OFFLINE-ACTIONS-DETAILS]].
