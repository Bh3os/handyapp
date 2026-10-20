---
id: HH-STATE-02
type: requirement
title: Invalid transitions rejected with a useful reason; closeout and cancellation cannot bypass obligations
status: active
priority: P0
area: platform
links:
  decided_by: ["[[OWN-DEC-64]]", "[[OWN-DEC-100]]", "[[OWN-DEC-124]]"]
  depends_on: ["[[HH-STATE-01]]", "[[HH-API-03]]"]
  constrained_by: ["[[RULE-SAFETY-GATES]]"]
  tested_by: ["[[T32]]", "[[T55]]", "[[T56]]"]
source: "guide 23; OWN-DEC-64, OWN-DEC-100, OWN-DEC-124"
---
- A transition that is not allowed from the current state, by this actor, or with unmet prerequisites is refused with a stable error code and a plain reason that names what is missing ([[HH-API-03]]). Nothing changes.
- Drafts and entered input are kept where that is safe, so the user can fix the cause and retry.
- Closing or cancelling never bypasses an unresolved obligation:
  - approval: no work or invoice beyond the approved scope and approved change orders;
  - payment: open balances, pending checks and payment exceptions stay tracked;
  - quality: a job cannot close until every punch item is corrected and re-checked ([[OWN-DEC-64]]);
  - safety: open holds and incidents keep their records and block affected work;
  - cases: a case closes only with a recorded resolution ([[OWN-DEC-124]]).
- If work was accepted, an appointment exists or money was received, declining or cancelling routes to the owner for cancellation and financial review instead of simply closing ([[OWN-DEC-100]]).
