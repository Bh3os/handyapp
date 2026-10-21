---
id: HH-QA-10
type: requirement
title: "Satisfaction check and review requests: staff-released, never score-gated"
status: active
priority: P0
area: quality
links:
  decided_by: ["[[OWN-DEC-109]]", "[[OWN-DEC-113]]", "[[OWN-DEC-78]]", "[[OWN-DEC-124]]", "[[OWN-DEC-157]]"]
  depends_on: ["[[HH-COM-05]]"]
  uses: ["[[ENT-Message]]", "[[ENT-Case]]", "[[ENT-Customer]]", "[[FACT-REMINDER-CADENCES]]"]
  tested_by: ["[[T67]]"]
  part_of: ["[[C11]]", "[[S01]]"]
source: "OWN-DEC-109, OWN-DEC-113 (new behaviour; guide 21.2 Follow-up/review)"
---
- A satisfaction-check draft is prepared at the completed-job cadence in [[FACT-REMINDER-CADENCES]] after the Owner's reviewed completion. It is service communication; staff release it.
- It is suppressed while a concern, complaint or return issue on the project is unresolved.
- Review requests are marketing: staff-released, sent only with the customer's channel permission and marketing consent, and never sent automatically.
- The same eligibility applies regardless of the satisfaction answer: no positive-review filtering, no incentives, no pressure. Any logic gating review requests on a score is absent (tested).
- Review invitations pause during an active complaint and are reconsidered after resolution, whatever the outcome.
- Opt-outs and channel restrictions are checked at execution time.

**Changed by [[OWN-DEC-157]] (2026-10-21):** the satisfaction check is the service-quality follow-up (MESSAGE 18) sent 48 hours after authorized final completion, released by staff, with a secure concern link.
