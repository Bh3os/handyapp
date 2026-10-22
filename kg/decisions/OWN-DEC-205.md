---
id: OWN-DEC-205
type: decision
title: "Business days: Monday to Friday excluding the 11 US federal holidays with observed dates, as the configurable internal calendar; never overrides legal deadlines"
status: active
area: platform
links:
  constrained_by: ["[[RULE-HUMAN-REVIEW]]"]
  uses: ["[[FACT-BUSINESS-CALENDAR]]", "[[FACT-PRIVACY-REQUEST-TARGETS]]", "[[FACT-TIMEZONE]]", "[[ENT-PolicyVersion]]"]
  related: ["[[OWN-DEC-175]]", "[[OQ-READINGS-2026-10-21]]", "[[TSK-0136]]", "[[TSK-0096]]"]
source: "owner answers 2026-10-22 R14 item 6; R13-Q1 correction 2"
---
Final confirmation, with amendment, of reading 6 of [[OQ-READINGS-2026-10-21]] (business days, [[OWN-DEC-175]]).

Owner answer (round 13, question 1), correction 2, verbatim:
> 2. Define business days as Monday through Friday, excluding applicable recognized holidays for deadline calculations. Distinguish internal service targets from statutory deadlines.

Owner answer (round 14, 2026-10-22), verbatim:
> Confirm all 13 readings, subject to the following final amendments.
> Item 6 — Business days
> Approve Monday–Friday, excluding the 11 recognized US federal holidays as the default internal business calendar, including applicable observed dates.
> Keep the calendar configurable.
> Do not use this internal calendar to override statutory deadlines or jurisdiction-specific legal definitions.

Effect:
- The default internal business calendar is Monday to Friday in the business time zone, excluding the 11 US federal holidays on their observed dates ([[FACT-BUSINESS-CALENDAR]]). Replaces the PROPOSED reading "holidays not excluded".
- The calendar is configuration: the Owner can change it, as an audited configuration version ([[ENT-PolicyVersion]]).
- Internal service targets (for example the substantive privacy acknowledgment within 3 business days, [[FACT-PRIVACY-REQUEST-TARGETS]]) use it. Statutory deadlines and jurisdiction-specific legal definitions are tracked separately and are never computed from or shortened by this calendar; their definitions come from attorney review ([[OQ-ATTORNEY-PRIVACY]], [[RULE-HUMAN-REVIEW]]).
- Built by [[TSK-0136]]; the Owner Dashboard deadlines with [[TSK-0096]].
