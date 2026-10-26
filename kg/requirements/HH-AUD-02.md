---
id: HH-AUD-02
type: requirement
title: Apply the operational documents and the latest owner decisions; record conflicts
status: active
priority: P0
area: platform
links:
  decided_by: ["[[OWN-DEC-01]]", "[[OWN-DEC-31]]", "[[OWN-DEC-45]]", "[[OWN-DEC-130]]"]
  constrained_by: ["[[RULE-NO-INVENTED-FACTS]]", "[[RULE-DECIDED-VALUES-ACTIVE]]"]
  tested_by: ["[[T02]]", "[[T03]]", "[[T04]]"]
source: "guide 2.1, 2.2; OWN-DEC-01"
---
- Operational inputs are the business nodes of the graph (services, SOPs, pricing, inventory, quality checklists, service agreements, facts), taken from the owner's vault files, plus the owner decisions.
- Newer explicit owner decisions govern older documents ([[OWN-DEC-01]]). The guide's own corrections are applied: no minimum charge ([[HH-BASE-02]]) and English-only customer output ([[HH-LANG-01]]).
- A material conflict between sources is never resolved by quietly choosing one: it is recorded as an open question (or a proposed decision for the owner) and the affected behaviour stays at its safe state.
- Work keeps the evidence classes separate: observed implementation, approved business fact, proposed default, assumption, unresolved configuration, and test result. Framework versions and provider APIs are checked against the repository and current official documentation, never assumed.

**Built by [[TSK-0110]] (2026-10-26):** the strict traceability check fails when an operational document (SOP, fact, service) marks an open question, a conflict or an unsourced value without a link to a question node. The conflicts found in the review are recorded, not resolved: [[OQ-SOP-INLINE-FLAGS]], [[OQ-WEBSITE-TERMS-CANCELLATION]], [[OQ-PRIVACY-NOTICE-RETENTION]], [[OQ-AUTOMATIC-MESSAGES-NOT-SENT]].
