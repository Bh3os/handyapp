---
id: HH-QA-05
type: requirement
title: "Share only approved photos and approved care notes"
status: active
priority: P0
area: quality
links:
  decided_by: ["[[OWN-DEC-81]]", "[[OWN-DEC-109]]", "[[OWN-DEC-106]]"]
  depends_on: ["[[HH-DATA-07]]", "[[HH-PRIV-02]]"]
  constrained_by: ["[[RULE-NO-INVENTED-FACTS]]"]
  uses: ["[[ENT-Photo]]", "[[ENT-CareInstruction]]", "[[ENT-Document]]"]
  tested_by: ["[[T57]]"]
  part_of: ["[[C09]]", "[[C06]]"]
source: "guide 19.1 HH-QA-05; OWN-DEC-81, OWN-DEC-109"
---
- At handoff staff share selected before/after photos with the customer through an audited share action; every other photo stays internal and inaccessible to the customer.
- Care instructions are versioned per service ([[ENT-CareInstruction]]): drafts are PROPOSED, and only the Owner approves a version (fresh sign-in, reason; approver and time recorded). Customers see only the approved version for the services on their completed job; with no approved version, nothing is shown.
- Product-dependent lines (drying, curing, cleaning or waiting times) are filled only from the manufacturer guidance stored on the job's product records. When it is missing, the line is omitted from the customer view and flagged to staff as "product guidance missing". No time, temperature or chemical claim is ever invented.
- The approved version used is recorded and included in the customer's completion summary (Documents).
- Customer sharing never grants marketing permission ([[HH-PRIV-02]]).
- No warranty duration or guarantee is stated by the platform.
