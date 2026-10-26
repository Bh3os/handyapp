---
id: HH-PRIV-07
type: requirement
title: "Privacy request acknowledgment, target and deadline tracking"
status: active
priority: P1
area: privacy
links:
  decided_by: ["[[OWN-DEC-175]]", "[[OWN-DEC-201]]", "[[OWN-DEC-205]]"]
  depends_on: ["[[HH-PRIV-03]]"]
  constrained_by: ["[[RULE-HUMAN-REVIEW]]"]
  uses: ["[[FACT-PRIVACY-REQUEST-TARGETS]]", "[[ENT-PrivacyRequest]]", "[[ENT-QueueItem]]", "[[ENT-Message]]", "[[FACT-BUSINESS-CALENDAR]]"]
  part_of: ["[[C11]]", "[[S11]]"]
  related: ["[[OQ-PRIVACY-DEADLINE-DETAILS]]"]
source: "OWN-DEC-175 (new behaviour; no guide id)"
---
- Registered customers and guests submit access, export, correction and deletion requests without creating an account.
- Each request records its receipt time, the automatic acknowledgment, the substantive acknowledgment due date (3 business days), the internal target date (30 days) and, separately, the applicable legal deadline once the attorney defines it ([[FACT-PRIVACY-REQUEST-TARGETS]]).
- Nothing is rejected or closed automatically when a date passes; an extension is an Owner decision with a recorded reason and a customer notice.
- The Owner Dashboard lists pending requests with their dates and overdue alerts.
- Identity is verified in proportion to the request's risk before any disclosure, correction, export or deletion ([[OWN-DEC-201]]).

**Changed by [[OWN-DEC-205]] (2026-10-22):** the 3-business-day date is computed on [[FACT-BUSINESS-CALENDAR]] (Monday to Friday, federal holidays and observed dates excluded, configurable); the legal deadline field stays separate and is never derived from it.

**Built by [[TSK-0136]] (2026-10-25):** the dates are counted once at receipt in the business time zone and kept with the calendar and target versions used; the acknowledgment and any extension are shown in the portal (no message wording yet, [[OQ-MESSAGES-OUTSIDE-THE-21]]); the legal deadline is recorded by the Owner, never computed; pending requests with their dates and overdue alerts are listed for the Owner on the Privacy requests screen and in Owner Decisions until the Owner Dashboard tile ([[TSK-0096]]). PROPOSED details: [[OQ-PRIVACY-DEADLINE-DETAILS]].
