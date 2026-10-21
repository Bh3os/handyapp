---
id: OQ-VISIT-NOTICE-WORDING
type: question
title: Wording of the automatic visit-options and visit-confirmed notices
status: open
area: messaging
links:
  related: ["[[FACT-AUTOMATIC-MESSAGES]]", "[[OWN-DEC-99]]", "[[OWN-DEC-105]]", "[[HH-SCH-11]]", "[[HH-LEAD-07]]", "[[TSK-0063]]"]
source: "TSK-0063 (2026-10-21): FACT-AUTOMATIC-MESSAGES #5, #6 and #10 name when the notices send, not their text"
---
**Question:** which exact subject and body should the automatic "Estimate-visit options available" (#5), "Estimate visit confirmed" (#6) and "Work appointment confirmed" (#10) notices use, by email and by text? The owner decided that they send automatically ([[OWN-DEC-99]], [[OWN-DEC-105]]: "a brief automatic notice") but gave no wording.

- **Who answers:** the owner (approve a wording, as for the question notice of [[OWN-DEC-98]]).
- **Known:** each notice carries no private detail and no amount and links into verified project access ([[FACT-AUTOMATIC-MESSAGES]]); the confirmed notices may use `{visitWindow}` (the date and arrival window in the property's zone, filled at send time). The secure project link is not supplied to these notices yet, as for the other automatic notices.
- **Until answered:** no template version of `estimate_visit.options`, `estimate_visit.confirmed` or `appointment.confirmed` is released. The automations still run once per published offer or reserved visit and record each delivery as failed with `template_not_configured`; staff see the delivery issue ("A message was not sent: its wording or channel is not configured") and the notice's state on the visit. Nothing is shown as sent.
