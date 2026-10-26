---
id: HH-SCH-10
type: requirement
title: "Recurring service series (P1) and repeat-service reminders now"
status: active
priority: P1
area: scheduling
links:
  decided_by: ["[[OWN-DEC-78]]", "[[OWN-DEC-113]]", "[[OWN-DEC-148]]"]
  uses: ["[[ENT-Visit]]", "[[ENT-Customer]]", "[[ENT-Property]]", "[[ENT-Message]]", "[[FACT-REMINDER-CADENCES]]", "[[FACT-CANCELLATION-RULES]]"]
  tested_by: ["[[T67]]"]
  part_of: ["[[C11]]"]
source: "guide 14.3 HH-SCH-10; OWN-DEC-78, OWN-DEC-113"
---
**P1, not built at launch:** recurring cleaning generates dated visits or jobs, each with its own scope and exceptions. Frequency, time zone and DST, pauses, skipped visits, changes, billing and duplicate prevention are defined before any automation. A series is never one endlessly edited job record.

**Built now (P0):**
- Staff record a customer-agreed next-service date or interval on the customer or property, only when the customer agreed to one.
- A repeat-service reminder draft is prepared on that schedule; staff release it.
- The customer can change or stop the recurring schedule and its reminders from the project workspace. A change applies to visits more than 24 hours away; a visit within 24 hours follows the cancellation rules ([[FACT-CANCELLATION-RULES]], [[OWN-DEC-148]]). The same 24-hour rule applies to the P1 series.
- "Request This Service Again" follows [[HH-ID-12]] and creates a new request linked to the customer and property.
- Channel permissions, marketing consent and opt-outs are checked before any send.

**Built by [[TSK-0113]] (2026-10-26):** "Request This Service Again" creates a new request with its own records, like every submission, linked to the earlier project (and through it to that customer and property); staff merge or relink records through the reviewed merge ([[HH-CRM-04]]). PROPOSED details in [[OQ-SAVED-PROPERTIES-DETAILS]]. The schedule and its reminders stay with [[TSK-0114]].
