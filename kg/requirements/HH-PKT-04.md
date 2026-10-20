---
id: HH-PKT-04
type: requirement
title: "English and Spanish versions share IDs; Spanish safety text released as AI-reviewed"
status: active
priority: P0
area: field
links:
  decided_by: ["[[OWN-DEC-79]]"]
  depends_on: ["[[HH-LANG-04]]"]
  constrained_by: ["[[RULE-LANGUAGES]]", "[[RULE-SAFETY-GATES]]"]
  uses: ["[[ENT-SOPVersion]]", "[[ENT-JobPacket]]", "[[ENT-StaffUser]]"]
  tested_by: ["[[T45]]", "[[T70]]"]
  part_of: ["[[S07]]"]
source: "guide 15.1 HH-PKT-04; OWN-DEC-79 (as amended)"
---
- English and Spanish operational versions share canonical IDs and a version mapping to the English source version.
- A Spanish safety version is released only with the status "AI-reviewed", after a recorded comparison against the current approved English version that is separate from the translation pass. The record holds the English source version, the check date and a result per category: warnings, PPE, prohibited actions, measurements and units, step order, stop-work conditions. The check is deterministic where possible (every such item and every number with its unit has a mapped counterpart; step count and order match).
- It is never labelled human-reviewed or safety-certified anywhere (UI, API, documents). A human review record may be added later as a separate, optional status.
- A failed or ambiguous check keeps only that procedure pending: a worker whose working language is Spanish sees "Spanish safety review pending" (with the Spanish equivalent) and the affected work stays blocked at the Start Work gate. Workers reading English are unaffected.
- A new English version invalidates the Spanish release until it is translated and checked again. Missing guidance is never invented and the approved procedure is never altered.
- Live machine translation never replaces a safety instruction. If a worker cannot understand the available approved content, readiness stays blocked until a suitable briefing exists.
