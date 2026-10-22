---
id: HH-DATA-06
type: requirement
title: UTC instants plus an explicit IANA zone for local schedules; conversions tested
status: active
priority: P0
area: scheduling
links:
  decided_by: ["[[OWN-DEC-92]]", "[[OWN-DEC-115]]", "[[OWN-DEC-125]]", "[[OWN-DEC-159]]"]
  uses: ["[[FACT-TIMEZONE]]", "[[FACT-HOURS]]"]
  tested_by: ["[[T41]]"]
  part_of: ["[[S05]]"]
source: "guide 22.2; OWN-DEC-92, OWN-DEC-115, OWN-DEC-125"
---
- Instants (events, timestamps, deadlines) are stored in UTC.
- Intended local schedules (visits, arrival windows, contact hours, business-hours clocks, recurring agreed dates) store the local date and window plus an explicit IANA zone: the business time zone ([[FACT-TIMEZONE]]) or the property's local zone where they differ.
- Nothing depends on the server's time zone. Business-hours calculations (the 1-hour response clock, contact hours for reminders, [[FACT-HOURS]]) use the configured zone.
- Tests cover conversions, the DST gap and the repeated hour, and "tomorrow" in the property's local time ([[OWN-DEC-92]]), so stored and displayed visit times are unambiguous.

**Changed by [[OWN-DEC-159]] (2026-10-21):** the property's IANA zone is stored; texts use the recipient's zone.
