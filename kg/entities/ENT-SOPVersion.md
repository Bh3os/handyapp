---
id: ENT-SOPVersion
type: entity
title: "SOP version and checklist"
status: active
area: field
links:
  decided_by: ["[[OWN-DEC-108]]", "[[OWN-DEC-79]]", "[[OWN-DEC-17]]"]
  constrained_by: ["[[RULE-NO-INVENTED-FACTS]]", "[[RULE-SAFETY-GATES]]"]
source: "guide 22.1 SOPVersion; OWN-DEC-79, OWN-DEC-108"
---
One version of a service SOP ([[SOP-HI-01]] and the others) with its six-stage checklist.

**Fields:** service; version; steps (verbatim text, stage, expected result, required evidence, mandatory flag, hold point) with source file and line; English review state (pending competent review, approved); Spanish release record (English source version, check date, per-category results, status AI-reviewed or pending); optional human review record.

**States:** `pending_competent_review → approved → superseded`; Spanish: `pending → ai_reviewed`, invalidated by a new English version.

**Invariants:** steps are never invented; production use needs the reviewer sign-off; Spanish is never labelled human-reviewed or safety-certified; jobs pin exact versions.

**Who may change:** imports from the vault; the Owner records the competent-review sign-off.
