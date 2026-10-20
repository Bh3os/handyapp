---
id: HH-SCH-08
type: requirement
title: "On my way, Arrived and Finished; no invented ETA"
status: active
priority: P0
area: scheduling
links:
  decided_by: ["[[OWN-DEC-107]]", "[[OWN-DEC-69]]"]
  depends_on: ["[[HH-PORT-07]]"]
  uses: ["[[ENT-Visit]]", "[[ENT-TimeStamp]]", "[[ENT-Message]]", "[[FACT-AUTOMATIC-MESSAGES]]"]
  tested_by: ["[[T23]]", "[[T47]]"]
  part_of: ["[[C07]]", "[[S07]]"]
source: "guide 14.3 HH-SCH-08; OWN-DEC-69, OWN-DEC-107"
---
- The worker taps "On my way" when actually departing for an assigned visit; the eligibility window, the automatic notice and its content follow [[HH-PORT-07]]. The tap moves the visit to `en_route`; a tap on a cancelled or superseded visit is refused, and repeated taps are idempotent.
- "Arrived" and "Finished" record a separate timestamp per assigned worker ([[HH-WORK-06]]). "Arrived" moves the visit to `arrived`; it never starts work or bypasses the Start Work gate.
- There is no separate travel timer, no ETA estimate and no location tracking.
