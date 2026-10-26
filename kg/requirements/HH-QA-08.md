---
id: HH-QA-08
type: requirement
title: "Linked return visit or job, never a hidden reopening"
status: active
priority: P0
area: quality
links:
  decided_by: ["[[OWN-DEC-113]]", "[[OWN-DEC-124]]", "[[OWN-DEC-135]]"]
  uses: ["[[ENT-Job]]", "[[ENT-Visit]]", "[[ENT-Case]]", "[[FACT-WARRANTY]]"]
  tested_by: ["[[T56]]", "[[T67]]"]
  part_of: ["[[S10]]", "[[C11]]"]
source: "guide 19.2 HH-QA-08"
---
- Return work, including a warranty claim ([[FACT-WARRANTY]]), creates a linked return visit (purpose `return_work`) or job with its own current scope and readiness; a warranty claim carries its return-visit punch items. It never reopens the original job in a way that overwrites its completion evidence or costs.
- Return-work labor and material costs are captured separately so rework is visible ([[HH-FIN-17]]).
- Automated and staff-released review requests are suppressed while a complaint or return issue is unresolved ([[HH-QA-10]]).

**Built by [[TSK-0094]] (2026-10-25):** return work links return visits (purpose `return_work`, planned from the case or linked) or a return job of another project of the same customer. A return visit passes the same Start Work gate and its start moves neither the original job nor its work packages, so its state, quality review and completion evidence stay as they were; its punch items (`quality.return_work_items`) are corrected on a return visit the worker started and re-checked by the Owner; its costs (`quality.return_work_costs`, cents) and the elapsed time on return visits are shown apart, labor cost incomplete. Review and satisfaction requests read the case, which stays active until closed ([[TSK-0092]]). Details in [[OQ-RETURN-WORK-DETAILS]].
