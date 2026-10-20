---
id: HH-QA-08
type: requirement
title: "Linked return visit or job, never a hidden reopening"
status: active
priority: P0
area: quality
links:
  decided_by: ["[[OWN-DEC-113]]", "[[OWN-DEC-124]]"]
  uses: ["[[ENT-Job]]", "[[ENT-Visit]]", "[[ENT-Case]]"]
  tested_by: ["[[T56]]", "[[T67]]"]
  part_of: ["[[S10]]", "[[C11]]"]
source: "guide 19.2 HH-QA-08"
---
- Return work creates a linked return visit (purpose `return_work`) or job with its own current scope and readiness. It never reopens the original job in a way that overwrites its completion evidence or costs.
- Return-work labor and material costs are captured separately so rework is visible ([[HH-FIN-17]]).
- Automated and staff-released review requests are suppressed while a complaint or return issue is unresolved ([[HH-QA-10]]).
