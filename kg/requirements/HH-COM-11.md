---
id: HH-COM-11
type: requirement
title: Appointment reminder drafted 24 hours before, staff-released and rechecked
status: active
priority: P0
area: messaging
links:
  decided_by: ["[[OWN-DEC-107]]", "[[OWN-DEC-78]]"]
  depends_on: ["[[HH-COM-05]]", "[[HH-COM-06]]"]
  constrained_by: ["[[RULE-DECIDED-VALUES-ACTIVE]]"]
  uses: ["[[ENT-Visit]]", "[[ENT-Message]]", "[[FACT-REMINDER-CADENCES]]"]
  tested_by: ["[[T65]]"]
  part_of: ["[[C07]]", "[[S06]]"]
source: "OWN-DEC-107, OWN-DEC-78"
---
- For each confirmed estimate or work visit, a reminder draft is prepared at the appointment-reminder interval in [[FACT-REMINDER-CADENCES]] (24 hours before). It contains the confirmed date and arrival window, the address and the approved preparation steps.
- If the appointment is confirmed less than that interval ahead, the draft is prepared immediately.
- Staff release the reminder. Before sending, the current appointment is rechecked; outdated, canceled and duplicate reminders are suppressed ([[HH-COM-05]]).
