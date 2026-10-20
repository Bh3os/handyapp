---
id: HH-PKT-06
type: requirement
title: "Critical shortages block the task; no quiet substitutions"
status: active
priority: P0
area: field
links:
  constrained_by: ["[[RULE-SAFETY-GATES]]"]
  uses: ["[[ENT-Hold]]", "[[ENT-ChangeOrder]]", "[[ENT-WorkPackage]]"]
  tested_by: ["[[T45]]"]
  part_of: ["[[S07]]", "[[C08]]"]
source: "guide 15.2 HH-PKT-06"
---
- A shortage of a critical tool, material, equipment item or PPE creates a task-specific block with an owner and an action; Start Work stays blocked for the affected tasks ([[HH-WORK-01]]).
- A proposed substitute that affects safety, appearance, specification, price or warranty needs the applicable approval; where the customer is affected, that is a change order ([[HH-CHG-02]]).
- A worker cannot quietly swap a critical item; nothing is silently marked equivalent.
