---
id: HH-FIN-17
type: requirement
title: "Estimated versus actual costs; missing cost is incomplete, never zero"
status: active
priority: P0
area: payments
links:
  decided_by: ["[[OWN-DEC-69]]", "[[OWN-DEC-125]]", "[[OWN-DEC-189]]"]
  depends_on: ["[[HH-DATA-10]]"]
  uses: ["[[ENT-Job]]", "[[ENT-TimeStamp]]"]
  tested_by: ["[[T73]]"]
  part_of: ["[[S11]]"]
source: "guide 20.5 HH-FIN-17"
---
- Jobs capture estimated versus actual materials, approved purchases and rentals, return-work costs and elapsed visit time per worker (Arrived to Finished). No labor cost rate exists, so labor cost and margin show as incomplete.
- Missing cost data is reported as incomplete, never as zero or a misleading final margin.
- Every report states whether it shows estimates, invoiced revenue, cash received, settlement or estimated profit ([[HH-FIN-18]]).

**Changed by [[OWN-DEC-189]] (2026-10-21):** margin is computed against the 30% target once costs, including an Owner-entered labor cost rate, are recorded ([[HH-FIN-20]]).

**Built by [[TSK-0095]] (2026-10-26):** each job shows its cost lines estimated (the internal material and labor costs of the approved estimate version's lines; an approved change order leaves the estimate incomplete) versus actual (cost entries in cents, final only once the Owner confirms the category; elapsed Arrived-to-Finished time per worker); labor and burden cost are NOT CONFIGURED, so the actual total is incomplete; return-work costs are shown apart; a variance only between two final figures; the report names its sources. Details in [[OQ-JOB-COST-DETAILS]].

**Changed by [[TSK-0131]] (2026-10-26):** labor and burden cost come from the rate the Owner enters per worker (NOT CONFIGURED until entered); labor is final once the job is operationally complete and every time is known and rated. Details in [[OQ-JOB-MARGIN-DETAILS]].
