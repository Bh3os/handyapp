---
id: OQ-ESTIMATE-REMINDER-WORDING
type: question
title: The wording of the unanswered-estimate reminders, and the open details of their drafts
status: open
area: messaging
links:
  related: ["[[HH-EST-14]]", "[[OWN-DEC-78]]", "[[OWN-DEC-132]]", "[[FACT-REMINDER-CADENCES]]", "[[HH-COM-04]]", "[[HH-COM-05]]", "[[OQ-BIRD-10DLC]]", "[[TSK-0060]]"]
source: "TSK-0060 (2026-10-21): HH-EST-14 asks for a neutral reminder template; no owner wording exists for reminder.unanswered_estimate"
---
**Question:** which exact email subject and body (and text-message body) should the first and the final unanswered-estimate reminders use, and does the owner accept the PROPOSED details below?

- **Who answers:** the owner (wording, channel and dismissal rules); the A2P 10DLC campaign description for the reminder texts goes with [[OQ-BIRD-10DLC]] (human review: messaging compliance).
- **Known:** [[HH-EST-14]]: a neutral template that links to the secure project workspace, with no amounts, private details, promises, prices or warranties; [[OWN-DEC-132]]: drafts at +24 hours and +3 days after sending, released any time; [[OWN-DEC-78]]: staff release every draft and every message offers a simple way to approve, ask a question, reschedule or request another service.
- **What the software does now (TSK-0060):** the drafts are prepared at the configured cadence (`reminders.cadences.unansweredEstimate`), listed in the staff queue (`estimate_reminder`) and on the estimate's reminders panel, and stopped by the stop rules at draft, release and send time. No template version of `reminder.unanswered_estimate` is released, so a released reminder is recorded as `template_not_configured` (never as sent) and the panel and System health say so.
- **PROPOSED (not owner-approved), used by the software until answered:**
  - one draft per reminder on the customer's preferred channel: a text when they prefer texts and the SMS opt-in is current, otherwise email (a "call" preference has no message channel);
  - the final draft cancels a first draft nobody released ("replaced by the final reminder"), so the customer never gets both at once;
  - dismissing a draft does not stop the next reminder of the cadence;
  - a conversation with the customer that staff record after publishing stops the reminders, like a customer response;
  - the cadence in effect when a version is published applies to that version;
  - the queue item is seen by the roles that revise estimates (Owner, Estimator) and an Estimator sends or dismisses reminders only for estimates they prepared; Office sends them from the unified inbox once it exists ([[TSK-0050]]);
  - the final (3-day) draft serves as the estimate-expiry reminder ([[FACT-REMINDER-CADENCES]]).
- **PROPOSED wording for the owner to approve or change (not used by the software):** subject "Your HandyHub estimate is waiting for you"; body "Your HandyHub estimate is ready to review in your project: {projectLink}. There you can approve it, ask a question, request changes or ask about another service."
- **Until answered:** drafts, stop rules and the staff screens work; nothing reaches a customer.
