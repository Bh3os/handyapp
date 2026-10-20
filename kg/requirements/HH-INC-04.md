---
id: HH-INC-04
type: requirement
title: "Owner notified of damage, injury and disputes; no fault or compensation language"
status: active
priority: P0
area: safety
links:
  decided_by: ["[[OWN-DEC-124]]"]
  constrained_by: ["[[RULE-HUMAN-REVIEW]]"]
  uses: ["[[ENT-Case]]", "[[ENT-Message]]", "[[ROLE-OWNER]]"]
  tested_by: ["[[T54]]", "[[T56]]"]
  part_of: ["[[S10]]", "[[S01]]"]
source: "OWN-DEC-124 (new behaviour; no guide id)"
---
- Property damage, injury and disputes notify the Owner promptly: an Owner Decisions queue item plus a staff notification.
- The Owner handles every insurer, attorney or other professional referral; the referral is recorded as an Owner action (human-review boundary: insurance, legal, injury).
- The system never decides fault, admits liability or promises compensation. No template contains such wording (checked by a template scan); customer acknowledgments use plain, neutral acknowledgment, progress and next-step text with no invented legal phrasing.
