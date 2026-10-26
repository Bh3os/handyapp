---
id: OQ-SPANISH-SAFETY-DETAILS
type: question
title: The Spanish safety release details no decision gives
status: open
area: i18n
links:
  related: ["[[HH-LANG-04]]", "[[HH-PKT-04]]", "[[OWN-DEC-79]]", "[[OWN-DEC-74]]", "[[OWN-DEC-17]]", "[[OWN-DEC-172]]", "[[ENT-SOPVersion]]", "[[RULE-LANGUAGES]]", "[[RULE-SAFETY-GATES]]", "[[TSK-0103]]", "[[TSK-0129]]"]
source: "TSK-0103 (2026-10-23): OWN-DEC-79 states the rule; the details below are PROPOSED"
---
**Question:** does the owner approve, or change, these PROPOSED details of the Spanish safety release?

- **Who answers:** the owner.
- **Decided, in use:** AI translated the Spanish SOP text during development; a separate comparison against the English version checks warnings, PPE, prohibited actions, measurements and units, step order and stop-work conditions; a version that passes is released as "AI-reviewed", never "human-reviewed" or "safety-certified"; a failed check or an ambiguous source instruction keeps only that procedure pending; a Spanish-reading worker sees "Spanish safety review pending" and is blocked at Start Work; a new English version invalidates the Spanish release ([[OWN-DEC-79]]).
- **PROPOSED, in use on private staging:**
  - The comparison is `tools/compare-safety-es.mjs`, deterministic and run during development; its result is stored with each Spanish version (seed `sops-es.json`, table `catalog.sop_spanish_versions`). Per item it checks: every item and line in the same order and structure; every evidence line, reference code and node link kept verbatim; the HOLD, GATE and FLAG tokens kept; at least as many Spanish counterparts as English terms for warnings, PPE, prohibitions and stop-work words (term lists in the tool); every number kept exactly, with the same unit.
  - All 26 SOP versions passed on 2026-10-23, with no ambiguous instruction flagged, and are released as AI-reviewed.
  - Translated: the six checklist stages and the stop-work, escalation and incident section. Kept in English (shown with an English language mark): the source SOP's open questions (review notes, not instructions) and the vault section headings ("From ...").
  - Machine values stay in English inside the Spanish text: the "Evidence:" lines, reference codes, HOLD, GATE, FLAG and TBD.
  - When a Spanish text is released, the job packet changes, so a Spanish-reading worker views and acknowledges the packet again before Start Work.
  - The latest comparison of an English version decides; a later failed comparison takes the release back.
  - The English competent review ([[OWN-DEC-17]]) is unchanged: in production a pending English version still blocks every worker.
- **Waiting for a later task:** the owner's Spanish escalation instruction ([[OWN-DEC-172]]) and the Call Owner / Call 911 block come with [[TSK-0129]] (the owner's phone number is NOT CONFIGURED).
  - **Built by [[TSK-0129]] (2026-10-24):** the packet states the owner's Spanish instruction word for word (the owner's own wording, not a translation); the other new Spanish staff texts of the escalation block are AI translations, not released as AI-reviewed (the comparison covers SOP texts only). Details in [[OQ-ESCALATION-DETAILS]].
- **Until answered:** the PROPOSED details above are used; each is a small change to the tool, the nodes or the code.
