---
id: HH-SCH-10
type: requirement
title: "Recurring service series (P1) and repeat-service reminders now"
status: active
priority: P1
area: scheduling
links:
  decided_by: ["[[OWN-DEC-78]]", "[[OWN-DEC-113]]"]
  uses: ["[[ENT-Visit]]", "[[ENT-Customer]]", "[[ENT-Property]]", "[[ENT-Message]]", "[[FACT-REMINDER-CADENCES]]"]
  tested_by: ["[[T67]]"]
  part_of: ["[[C11]]"]
source: "guide 14.3 HH-SCH-10; OWN-DEC-78, OWN-DEC-113"
---
**P1, not built at launch:** recurring cleaning generates dated visits or jobs, each with its own scope and exceptions. Frequency, time zone and DST, pauses, skipped visits, changes, billing and duplicate prevention are defined before any automation. A series is never one endlessly edited job record.

**Built now (P0):**
- Staff record a customer-agreed next-service date or interval on the customer or property, only when the customer agreed to one.
- A repeat-service reminder draft is prepared on that schedule; staff release it.
- The customer can change or stop the reminders from the project workspace.
- "Request This Service Again" follows [[HH-ID-12]] and creates a new request linked to the customer and property.
- Channel permissions, marketing consent and opt-outs are checked before any send.
