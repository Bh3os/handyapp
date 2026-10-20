---
id: HH-PKT-03
type: requirement
title: "SOP, hazard and quality versions per work package; no invented procedures"
status: active
priority: P0
area: field
links:
  decided_by: ["[[OWN-DEC-108]]", "[[OWN-DEC-17]]", "[[OWN-DEC-80]]"]
  constrained_by: ["[[RULE-NO-INVENTED-FACTS]]", "[[RULE-HUMAN-REVIEW]]", "[[RULE-SAFETY-GATES]]"]
  uses: ["[[ENT-SOPVersion]]", "[[ENT-WorkPackage]]", "[[ENT-Hold]]"]
  tested_by: ["[[T43]]", "[[T45]]"]
  part_of: ["[[S07]]", "[[S08]]"]
source: "guide 15.1 HH-PKT-03; OWN-DEC-108"
---
- Each work package pins approved SOP, hazard and quality versions. Each task defines prerequisites, required competence, tools, materials and PPE, the instruction or reference, the expected result, required evidence and any hold point.
- SOP steps come only from the established SOP documents in the owner's vault (one per service, [[SOP-HI-01]] and the others), imported verbatim with the source file and line, mapped onto the six checklist stages ([[HH-WORK-11]]). No technical procedure is written or filled in by the software or AI. A stage with no source step shows "No SOP step recorded for this stage — ask the office".
- Uncertain or hazardous work (licensed electrical, plumbing, HVAC, gas, structural, asbestos, lead, mold) gets no procedure; it routes to a hold and escalation.
- Imported SOP versions are "pending competent review". On private staging the checklist may run on them with a "Pending competent review" banner on every step screen. Production use requires the reviewer sign-off and activation path, which stays intact.
- Applicable manufacturer instructions are referenced where they are stored; none are invented.
