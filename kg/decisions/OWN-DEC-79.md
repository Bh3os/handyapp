---
id: OWN-DEC-79
type: decision
title: Spanish staff content translated and checked by AI; safety translations released as "AI-reviewed" after a separate comparison
status: active
area: i18n
links:
  supersedes: ["[[OWN-DEC-10]]"]
  related: ["[[HH-LANG-02]]", "[[HH-LANG-04]]", "[[HH-PKT-04]]", "[[HH-OPS-04]]"]
  tested_by: ["[[T45]]", "[[T70]]"]
  constrained_by: ["[[RULE-LANGUAGES]]", "[[RULE-SAFETY-GATES]]", "[[RULE-NO-INVENTED-FACTS]]"]
  part_of: ["[[S07]]"]
source: "vault-own-decisions.md OWN-DEC-79; owner-answers-verbatim.md 2026-10-12T16:41 and 16:57; decision-briefs.md (OWN-DEC-79 as amended)"
---
Owner wording, first answer (project chat, 2026-10-12): "Have the AI translate and check all Spanish staff content now. For safety procedures, compare it against the approved English version and check terminology, warnings, prohibited actions, PPE, measurements, step order, and stop-work conditions. Correct errors and flag ambiguous source instructions without inventing guidance. AI checking alone must not mark a safety translation as approved. A competent bilingual reviewer must approve the safety-critical version, with reviewer, date, and version recorded. Until then, a worker relying on Spanish sees "Spanish safety review pending" and the affected work remains blocked. Keep unrelated development moving and complete all translation/checking work now."

Amendment, which governs (asked who would approve the Spanish safety translations, the same day): "Remove the mandatory bilingual human-review step. Have AI complete all Spanish translations and run a separate comparison against the approved English source. Check warnings, PPE, prohibited actions, measurements, step order, and stop-work conditions. Automatically release translations that pass, recording the source version, review date, and status "AI-reviewed." Do not label them human-reviewed or safety-certified. Flag failed checks or ambiguous instructions and keep only the affected procedure pending. Do not invent missing guidance or alter the approved procedure. Existing safety, legal, and job-start holds remain unchanged. Complete this workflow and its tests now."

Effect:
- AI translates all Spanish staff content (screens, alerts, packets, offline messages, errors) with consistent terminology; ICU placeholders and plurals stay exact. Customer output stays English.
- For each safety procedure, a separate comparison step (not the pass that produced the translation) checks the Spanish against the current approved English version: warnings, PPE, prohibited actions, measurements and units, step order and stop-work conditions. The comparison is a deterministic, testable check where possible.
- A Spanish safety version that passes is released automatically with status "AI-reviewed", recording the English source version, the check date and the result per category.
- It is never labelled "human-reviewed" or "safety-certified" anywhere (screens, API, documents).
- A failed check or an ambiguous source instruction keeps only that procedure pending: Spanish-reading workers see "Spanish safety review pending" and the affected work stays blocked for them.
- A new English version invalidates the Spanish release until it is re-translated and re-checked.
- Missing guidance is never invented and the approved English procedure is never altered.
- A human review record can still be added later as an optional, separate status.
- English competent review and every safety, legal and Start Work hold stay unchanged. Because the product has no runtime AI ([[OWN-DEC-74]]), the translation and comparison are done during development and stored as reviewed data; the product stores and enforces the recorded result.
- RISK: without a qualified human reviewer, a translation error in a safety procedure could reach a worker; mitigated by the separate comparison, the honest label and per-procedure blocking.
