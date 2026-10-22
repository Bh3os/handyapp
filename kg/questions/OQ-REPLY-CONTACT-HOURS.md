---
id: OQ-REPLY-CONTACT-HOURS
type: question
title: Do staff replies wait for the daily contact hours?
status: superseded
area: messaging
links:
  related: ["[[HH-COM-09]]", "[[HH-COM-08]]", "[[FACT-HOURS]]", "[[OWN-DEC-120]]", "[[OWN-DEC-101]]", "[[OWN-DEC-132]]", "[[TSK-0050]]"]
  superseded_by: ["[[OWN-DEC-154]]"]
source: "TSK-0050 (2026-10-21): FACT-HOURS and the owner's 2026-10-05 answer on texts versus the OWN-DEC-120 question wording"
---
**Answered by [[OWN-DEC-154]] (2026-10-21).**

**Question:** when a staff member presses Send on a reply outside 8 AM–10 PM ([[FACT-HOURS]]), should its email or text wait for 8 AM, or go at once?

- **Who answers:** the owner (TCPA quiet-hours questions for texts also go to the attorney with [[OQ-BIRD-10DLC]]).
- **Known:** [[FACT-HOURS]] holds staff-released customer messages to these hours, and the owner's 2026-10-05 answer limits texts to customers to "8 am-10 pm". The question behind [[OWN-DEC-120]] said replies "send right away when a staff member presses Send (this counts as the staff release)"; the owner's refinement keeps Send as the release without naming the hours. Unanswered-estimate reminders have no hours restriction ([[OWN-DEC-132]]); codes and access links send at once.
- **PROPOSED (in use, configuration `replies.contact_hours` = waits, `proposed: true`, migration 0046):** a reply sent outside the hours is added to the project conversation at once (the customer sees it in the portal), and its email or text waits for the next 8 AM in the business time zone, rechecked at send time. The composer says so before Send. Changing the answer is a new configuration version, not a code change.
