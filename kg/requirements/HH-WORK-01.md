---
id: HH-WORK-01
type: requirement
title: "Server-evaluated Start Work gate with exact missing items"
status: active
priority: P0
area: safety
links:
  decided_by: ["[[OWN-DEC-108]]", "[[OWN-DEC-109]]", "[[OWN-DEC-121]]", "[[OWN-DEC-82]]", "[[OWN-DEC-79]]", "[[OWN-DEC-68]]", "[[OWN-DEC-104]]"]
  constrained_by: ["[[RULE-SAFETY-GATES]]", "[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[ENT-StartGateEvaluation]]", "[[ENT-Job]]", "[[ENT-JobPacket]]", "[[ENT-Hold]]", "[[ENT-Acknowledgment]]", "[[ENT-DepositRequirement]]", "[[ENT-Photo]]"]
  tested_by: ["[[T46]]", "[[T45]]", "[[T40]]"]
  part_of: ["[[S07]]", "[[C08]]"]
source: "guide 16.1 HH-WORK-01 (prerequisites list); OWN-DEC-68, 79, 82, 108, 109, 121"
---
The server evaluates the gate and returns `ready`, `needs_attention`, `blocked` or `requires_review`, with every missing item, the policy and packet versions used, and the resolution owner for each item. The check always runs online; there is no offline start ([[HH-OFF-04]]). Opening My Day or tapping a notification never skips the briefing.

Start Work prerequisites:
1. An active, signed-in worker with a current assignment to this job and visit.
2. The correct property and site identity, and access to it.
3. The current approved scope and change version reviewed and personally acknowledged.
4. The approved SOP checklist and understandable safety guidance available in the worker's language; a Spanish-reading worker needs the "AI-reviewed" Spanish release of each affected procedure ([[HH-PKT-04]]).
5. No blocking job-level Hold; required legal or safety conditions resolved (licenses and permits are checked by the owner outside the software).
6. Hazards and controls reviewed, and no unresolved critical safety hold.
7. Critical PPE, tools, equipment and materials confirmed available ([[HH-PKT-06]]).
8. The actual site condition reviewed and differences assessed (safety checks, step 2 of [[HH-WORK-12]]).
9. Required before-photos captured and uploaded, or the approved upload-failure exception ([[HH-WORK-03]]).
10. Dependencies and financial readiness: the required deposit satisfied, waived by the owner, or covered by the approved "deposit paid but bookkeeping pending" exception.
