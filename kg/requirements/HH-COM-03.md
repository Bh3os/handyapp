---
id: HH-COM-03
type: requirement
title: Customer templates in English; staff notifications in the recipient's staff locale
status: active
priority: P0
area: messaging
links:
  decided_by: ["[[OWN-DEC-45]]", "[[OWN-DEC-79]]"]
  depends_on: ["[[HH-LANG-01]]", "[[HH-LANG-04]]"]
  constrained_by: ["[[RULE-LANGUAGES]]"]
  uses: ["[[ENT-Message]]"]
  tested_by: ["[[T04]]", "[[T66]]"]
  part_of: ["[[S06]]"]
source: "guide 21.1 HH-COM-03; OWN-DEC-45, OWN-DEC-79"
---
- Customer templates are English.
- Staff notifications and the staff interface use the recipient staff member's locale (English or Spanish). Critical operational content uses released EN/ES versions (Spanish released as "AI-reviewed" after the comparison check).
- The destination and content language come from audience policy, never from the sender's interface locale.
