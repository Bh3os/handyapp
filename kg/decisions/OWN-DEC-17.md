---
id: OWN-DEC-17
type: decision
title: No active field SOP until competent review; unknown is not safe
status: active
area: safety
links:
  related: ["[[HH-PKT-03]]", "[[HH-WORK-01]]", "[[HH-WORK-02]]"]
  constrained_by: ["[[RULE-SAFETY-GATES]]", "[[RULE-HUMAN-REVIEW]]"]
  part_of: ["[[S07]]"]
source: "vault-own-decisions.md OWN-DEC-17; owner facts L20 (2026-10-02)"
---
Owner wording (owner facts, 2026-10-02): "No active field SOP until competent review of task-specific manufacturer instructions, hazards, qualifications, applicable requirements, emergency arrangements and Spanish translation. Unknown is not safe; acknowledgment cannot bypass critical holds."

Effect:
- No field SOP becomes active for real work before competent review of the task-specific manufacturer instructions, hazards, qualifications, applicable requirements, emergency arrangements and the Spanish translation.
- An unknown condition is treated as unsafe: gate checks fail closed.
- No acknowledgment, checkbox or role overrides a critical hold.
- Briefings show only approved, versioned SOP content; SOP text is never invented (`SOP-*` nodes keep the vault steps verbatim).

Partly replaced by [[OWN-DEC-79]]: the Spanish translation is released as "AI-reviewed" after a separate comparison, not by a human reviewer. [[OWN-DEC-108]]: on private staging the checklist may run on pending-review SOP versions with a visible "Pending competent review" banner; production still needs the reviewer sign-off.

Open:
- Competent review of each SOP and its hazard templates: [[OQ-SAFETY-REVIEW]].
