---
id: HH-LANG-04
type: requirement
title: Spanish safety translations released as "AI-reviewed" only after a separate passing comparison
status: active
priority: P0
area: i18n
links:
  decided_by: ["[[OWN-DEC-79]]", "[[OWN-DEC-74]]", "[[OWN-DEC-17]]"]
  constrained_by: ["[[RULE-LANGUAGES]]", "[[RULE-SAFETY-GATES]]", "[[RULE-NO-INVENTED-FACTS]]", "[[RULE-AI-WAVE2]]"]
  tested_by: ["[[T45]]", "[[T70]]"]
  part_of: ["[[S07]]"]
source: "guide 26.1; OWN-DEC-79 amended (supersedes the human-reviewer requirement)"
---
- Each Spanish version of a critical operational text (SOP steps, hazards, PPE, warnings, stop-work conditions) records its English source version ID, the comparison date, the result per check category and its release status.
- Translation and comparison are separate steps; the comparison is not the pass that produced the translation. Where possible it is a deterministic, testable check: every warning, PPE item, prohibited action and stop-work condition, every number with its unit, and every step in the approved English source has a mapped Spanish counterpart, in the same order.
- The AI translation and comparison are done during development and stored as reviewed data; the product only stores and enforces the recorded result (no runtime AI, [[OWN-DEC-74]]).
- A version that passes is released automatically with the status "AI-reviewed". It is never labelled "human-reviewed" or "safety-certified" in the UI, API or documents.
- A failed check or an ambiguous source instruction keeps only that procedure pending. A worker reading Spanish sees "Spanish safety review pending" (with the Spanish equivalent) and the affected work stays blocked at the Start Work gate; workers reading English are not affected. Missing guidance is never invented and the approved English procedure is never altered.
- A new English source version invalidates the Spanish release until it is re-translated and re-checked.
- A human review record can be added later as a separate, optional status.
- The English competent-review rule ([[OWN-DEC-17]]) and every safety, legal and Start Work hold stay unchanged.
- Original free text (worker notes, customer messages) is kept; a translated summary names its source and never replaces the original evidence.
