---
id: HH-OPS-04
type: requirement
title: Staff language switch keeps drafts, packet position and unsynced notes; locale stored per staff identity
status: active
priority: P0
area: i18n
links:
  decided_by: ["[[OWN-DEC-121]]"]
  constrained_by: ["[[RULE-LANGUAGES]]"]
  uses: ["[[ENT-StaffUser]]"]
  tested_by: ["[[T70]]", "[[T66]]"]
  part_of: ["[[S07]]"]
source: "guide 11.1"
---
- A staff member can switch between English and Spanish at any time without losing form drafts, their position in a job packet, or unsynced offline field work.
- The chosen locale is stored on the server per staff identity and follows the person across devices.
- Neither the staff locale nor the browser locale changes the language of customer messages or documents ([[HH-LANG-03]]).
