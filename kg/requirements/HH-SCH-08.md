---
id: HH-SCH-08
type: requirement
title: "On my way, Arrived and Finished; no invented ETA"
status: active
priority: P0
area: scheduling
links:
  decided_by: ["[[OWN-DEC-107]]", "[[OWN-DEC-69]]"]
  uses: ["[[ENT-Visit]]", "[[ENT-TimeStamp]]"]
  related: ["[[HH-PORT-07]]", "[[HH-COM-11]]"]
  tested_by: ["[[T23]]", "[[T47]]"]
  part_of: ["[[C07]]", "[[S07]]"]
source: "guide 14.3 HH-SCH-08; OWN-DEC-69, OWN-DEC-107"
---
- The assigned worker taps "On my way" when actually departing for that visit. The tap is allowed normally from three hours before the visit; time alone never triggers it, and a worker cannot tap it for a visit assigned to someone else. It moves the visit to `en_route`; a tap on a cancelled or superseded visit is refused, and repeated taps are idempotent. What the customer sees and the notice are [[HH-PORT-07]].
- "Arrived" and "Finished" record a separate timestamp per assigned worker ([[HH-WORK-06]]). "Arrived" moves the visit to `arrived`; it never starts work or bypasses the Start Work gate.
- There is no separate travel timer. The no-ETA and no-tracking rules are in [[HH-PORT-07]]. The appointment reminder before the visit is [[HH-COM-11]].
