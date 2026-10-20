---
id: FACT-TIMEZONE
type: fact
title: Business time zone: America/Kentucky/Louisville (Eastern)
status: proposed
area: platform
links:
  related: ["[[OWN-DEC-92]]", "[[OWN-DEC-115]]", "[[OWN-DEC-125]]", "[[OQ-TIMEZONE-ID]]", "[[HH-SCH-02]]", "[[HH-DATA-06]]"]
source: "owner-answers-verbatim 2026-10-05T18:24 [Tech settings]; decision-briefs 2026-10-12T19:46 (OWN-DEC-125)"
---
**Value:** America/Kentucky/Louisville (US Eastern time). Status PROPOSED: the owner accepted "Eastern time for all dates" with the standard technical settings (owner answer 2026-10-05T18:24, "Accept all"), but never named an IANA zone id ([[OQ-TIMEZONE-ID]]). America/Kentucky/Louisville is the zone named in the Owner Dashboard brief ([[OWN-DEC-125]]); the guide proposed America/New_York. Both are US Eastern time.

- Instants are stored in UTC; local schedules, windows, business hours, reminder send times, the 14-day validity and the response clock use this zone ([[HH-SCH-02]], [[HH-DATA-06]]).
- Request dates "start tomorrow, using the property's local time" ([[OWN-DEC-92]]). ASSUMPTION: every county in [[FACT-SERVICE-AREA]] observes Eastern time, so the property zone equals this zone; a property outside it would carry its own zone.
- The zone is configuration, never a literal scattered in code.
