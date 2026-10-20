---
id: HH-COM-09
type: requirement
title: Staff-released reminders send only within the daily contact hours, except estimate reminders
status: active
priority: P0
area: messaging
links:
  decided_by: ["[[OWN-DEC-101]]", "[[OWN-DEC-112]]", "[[OWN-DEC-65]]", "[[OWN-DEC-132]]"]
  depends_on: ["[[HH-COM-05]]"]
  constrained_by: ["[[RULE-DECIDED-VALUES-ACTIVE]]"]
  uses: ["[[FACT-HOURS]]", "[[FACT-TIMEZONE]]", "[[ENT-Message]]"]
  tested_by: ["[[T65]]"]
  part_of: ["[[S06]]", "[[S01]]"]
source: "OWN-DEC-101, OWN-DEC-112"
---
- Released reminder drafts (unanswered questions, unpaid invoices, appointment reminders and the other staff-released reminders of [[FACT-REMINDER-CADENCES]]) are sent only during the daily contact hours ([[FACT-HOURS]]) in the business time zone ([[FACT-TIMEZONE]]). The hours are an active, configurable policy value.
- A reminder released outside those hours is queued and sent when the hours begin, after the send-time recheck ([[HH-COM-05]]).
- One-time codes and access links send immediately because they expire.
- Unanswered-estimate reminders have no contact-hours restriction: a released estimate reminder sends at once, at any hour ([[OWN-DEC-132]], [[HH-EST-14]]).
