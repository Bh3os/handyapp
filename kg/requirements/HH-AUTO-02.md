---
id: HH-AUTO-02
type: requirement
title: Automations never approve, waive, reprice, confirm capacity, decide coverage or refunds, or conclude legal or tax questions
status: active
priority: P0
area: platform
links:
  decided_by: ["[[OWN-DEC-16]]", "[[OWN-DEC-65]]", "[[OWN-DEC-112]]", "[[OWN-DEC-124]]", "[[OWN-DEC-129]]"]
  depends_on: ["[[HH-AUTO-01]]"]
  constrained_by: ["[[RULE-SAFETY-GATES]]", "[[RULE-HUMAN-REVIEW]]", "[[RULE-NO-INVENTED-FACTS]]"]
  uses: ["[[FACT-AUTOMATIC-MESSAGES]]", "[[INT-Bird]]", "[[INT-Resend]]"]
  tested_by: ["[[T67]]", "[[T12]]"]
source: "guide 21.3, 30.3; OWN-DEC-16, OWN-DEC-65"
---
No automation may on its own:
- approve or start unsafe work, release a hold, or waive a qualification or Requirements Hold;
- change an accepted price or scope;
- confirm capacity that was not validated and reserved;
- decide warranty or case coverage, fault, liability or compensation ([[OWN-DEC-124]]);
- authorize a refund, write-off, collection, late fee or saved-card charge ([[OWN-DEC-112]]);
- publish legal or tax conclusions.

External sending follows the owner's actual authorization: only the listed automatic messages send without staff release ([[FACT-AUTOMATIC-MESSAGES]]); everything else waits for staff release ([[OWN-DEC-65]]). Channel permissions and consent are checked at send time. Texts go through Bird and email through Resend ([[OWN-DEC-129]]); on staging, only to approved test destinations.

**Built by [[TSK-0107]] (2026-10-26):** every registered automation is classified by the kind of its one effect (`apps/server/test/unit/automation-audit.test.ts`; a new one fails until it is classified), and at run time, over a whole fictional business, the automations write only their declared effect tables, never approvals, prices, visits, reservations, holds, starts, payments, allocations, refunds, waivers, cases, consent or deletions (`robustness.test.ts`).
