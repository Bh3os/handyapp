---
id: FACT-BUSINESS-CALENDAR
type: fact
title: "Internal business-day calendar: Monday to Friday, excluding the 11 US federal holidays and their observed dates (configurable)"
status: active
area: platform
links:
  decided_by: ["[[OWN-DEC-205]]"]
  uses: ["[[FACT-TIMEZONE]]"]
  related: ["[[FACT-PRIVACY-REQUEST-TARGETS]]"]
source: "OWN-DEC-205; owner answers 2026-10-22 R14 item 6"
---
**Value:** a business day is Monday to Friday in the business time zone ([[FACT-TIMEZONE]]), except the 11 US federal public holidays, on their observed dates. Configurable by the Owner as a versioned, audited calendar.

- The 11 holidays (5 U.S.C. 6103): New Year's Day, Birthday of Martin Luther King Jr., Washington's Birthday, Memorial Day, Juneteenth National Independence Day, Independence Day, Labor Day, Columbus Day, Veterans Day, Thanksgiving Day, Christmas Day.
- Observed dates follow the federal rule: a holiday on a Saturday is observed the Friday before, one on a Sunday the Monday after.
- Internal use only (service targets such as the substantive privacy acknowledgment of [[FACT-PRIVACY-REQUEST-TARGETS]]). It never overrides a statutory deadline or a jurisdiction-specific legal definition of a business day; legal deadlines are tracked separately.
