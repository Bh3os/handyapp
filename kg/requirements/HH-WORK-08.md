---
id: HH-WORK-08
type: requirement
title: "Report an issue; resolve on site only within training and scope"
status: active
priority: P0
area: field
links:
  decided_by: ["[[OWN-DEC-80]]", "[[OWN-DEC-124]]"]
  constrained_by: ["[[RULE-SAFETY-GATES]]", "[[RULE-HUMAN-REVIEW]]"]
  uses: ["[[ENT-IssueReport]]", "[[ENT-Hold]]", "[[ENT-Photo]]", "[[ENT-Case]]"]
  tested_by: ["[[T48]]", "[[T54]]"]
  part_of: ["[[C08]]", "[[S07]]"]
source: "guide 16.2 HH-WORK-08; OWN-DEC-80"
---
- Issue categories: unsafe or unexpected condition, scope mismatch, hidden damage, missing or wrong material, missing equipment, access problem, customer change, weather, product defect, incident.
- Each report ([[ENT-IssueReport]]) captures the affected task, severity, description, photos only when safe to take, time, and the next owner.
- A worker may resolve a problem without waiting for the Owner only when the fix is within their training, qualifications, the approved scope and the approved SOP, and no unresolved safety hold exists. A resolved problem records what happened, the steps taken, materials used and how the result was checked, with photos only when safe, and notifies the Owner.
- A problem that is unsafe, uncertain, outside the worker's authority or not resolvable follows the emergency and stop-work path ([[HH-WORK-13]], [[HH-WORK-09]]).
- An incident becomes a restricted case ([[HH-INC-01]]); extra scope becomes a change-order draft ([[HH-CHG-02]]).
