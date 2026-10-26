---
id: HH-LANG-02
type: requirement
title: Full English/Spanish coverage of staff screens through translation keys with ICU messages
status: active
priority: P0
area: i18n
links:
  decided_by: ["[[OWN-DEC-79]]", "[[OWN-DEC-117]]"]
  constrained_by: ["[[RULE-LANGUAGES]]"]
  tested_by: ["[[T70]]"]
  part_of: ["[[S07]]"]
source: "guide 26.1; OWN-DEC-79 amended"
---
- Staff English and Spanish cover: menus, forms, field validation, state labels, queues, the job briefing, hazards and PPE, tools and materials, SOP steps, hold reasons, incident and QA forms, timers and actions, sync and error feedback, help, staff alerts and staff notifications.
- All strings come from translation keys with ICU interpolation and pluralization; no duplicated localized strings scattered in code. A parity test fails when a key exists in one language only.
- A glossary keeps terms consistent (for example hold, stop work, punch item, walkthrough, deposit, estimate, PPE).
- Spanish UI strings are AI-translated and AI-checked; they carry the status "AI-reviewed", never "human-reviewed" ([[OWN-DEC-79]]). Safety content follows [[HH-LANG-04]].

**Built by [[TSK-0102]] (2026-10-26):** the glossary is `packages/i18n/src/glossary.ts`; the repository test fails on a missing key, a placeholder mismatch, a message left in English, a glossary term rendered another way and a Spanish safety message without a current comparison record ([[OQ-SPANISH-CATALOG-DETAILS]]).

