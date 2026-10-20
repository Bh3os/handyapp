---
id: HH-WORK-13
type: requirement
title: "Emergencies: stop, keep people away, call; gas and live wiring never touched"
status: active
priority: P0
area: safety
links:
  decided_by: ["[[OWN-DEC-80]]"]
  constrained_by: ["[[RULE-SAFETY-GATES]]", "[[RULE-HUMAN-REVIEW]]"]
  uses: ["[[ENT-Hold]]", "[[ENT-IssueReport]]", "[[ENT-Case]]"]
  tested_by: ["[[T48]]", "[[T54]]"]
  part_of: ["[[C08]]", "[[S07]]"]
source: "OWN-DEC-80 (new behaviour; no guide id)"
---
- When a problem is unsafe, uncertain, outside the worker's authority or cannot be resolved, the app guides the worker to stop the affected work, keep people away and call the Owner. Only approved, safe stabilization steps that the approved SOP lists and that are within the worker's training are offered; they are recorded separately ([[HH-CHG-04]]).
- A suspected gas leak shows: evacuate immediately and contact emergency services or the gas utility from a safe location. Workers never attempt gas repairs.
- Exposed, potentially live wiring is never handled by the worker.
- Both create a critical hold in the same transaction as the report and never offer a resolve-on-site option.
- Emergency action never waits for the Owner or for the app: the emergency contact path works without a network, and the app never suggests waiting.
- The software gives no technical repair procedure for these conditions (human-review boundary: licensed gas and electrical work).
