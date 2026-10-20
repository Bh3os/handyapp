---
id: HH-PORT-09
type: requirement
title: Project workspace with Overview, Messages, Documents, Photos, Appointments and Payments tabs
status: active
priority: P0
area: portal
links:
  decided_by: ["[[OWN-DEC-106]]", "[[OWN-DEC-97]]"]
  depends_on: ["[[HH-PORT-01]]", "[[HH-ID-10]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]", "[[RULE-LANGUAGES]]"]
  uses: ["[[ENT-Project]]", "[[ENT-CustomerAccount]]"]
  tested_by: ["[[T23]]", "[[T69]]"]
  part_of: ["[[C06]]"]
source: "OWN-DEC-106"
---
The workspace is the customer's central place to manage a project. Tabs:
- **Overview:** plain-language status, one clear next action ([[HH-PORT-02]]), the latest update, the confirmed appointment, and the payment summary.
- **Messages:** the two-way project conversation with permitted attachments, send and upload status, and retry without losing the draft ([[HH-COM-02]]).
- **Documents:** [[HH-PORT-10]].
- **Photos:** [[HH-PORT-11]].
- **Appointments:** estimate visits and work visits with date, arrival window, time zone, property address, purpose and preparation, plus the request actions ([[HH-PORT-04]]). Requests never erase confirmed bookings.
- **Payments:** [[HH-PORT-12]].

Rules:
- Guests reach only their verified project. Account customers switch between their authorized linked projects. Optional registration keeps the existing records without duplicates.
- On phones, Overview comes first with simple tab navigation; empty sections are helpful; drafts are kept when switching tabs.
- The tabs follow the ARIA tabs pattern (keyboard and screen-reader friendly); end-to-end tests include an automated accessibility scan and a phone viewport.
- Customer content is English.
