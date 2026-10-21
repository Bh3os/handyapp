---
id: OQ-QUESTION-WORDING
type: question
title: Wording of the unanswered-question reminders and the staff reply notification
status: open
area: messaging
links:
  related: ["[[HH-LEAD-06]]", "[[HH-LEAD-03]]", "[[OWN-DEC-98]]", "[[OWN-DEC-101]]", "[[FACT-REMINDER-CADENCES]]", "[[FACT-AUTOMATIC-MESSAGES]]", "[[OQ-STAFF-REPLY-WORDING]]", "[[OQ-BIRD-10DLC]]", "[[TSK-0051]]"]
source: "TSK-0051 (2026-10-21): OWN-DEC-98 gives the question notice's words; OWN-DEC-101 gives the reminders' timing, not their words"
---
**Question:** which email subject, email text and text-message wording should (1) the first and final reminders of an unanswered staff question (`reminder.unanswered_question`) and (2) the staff email that tells the responsible staff member a customer replied (`staff_notice.customer_reply`) use?

- **Who answers:** the owner (approve a wording, as for the code message in [[OWN-DEC-150]]). Texts to customers also wait for the A2P 10DLC registration ([[OQ-BIRD-10DLC]]); quiet hours and TCPA questions go to the attorney with it.
- **Known:** the question notice is the owner's text, "HandyHub has a question about your request. View and reply securely." ([[OWN-DEC-98]], released as template version 1 since migration 0008, with the link to the question). The reminders are staff-released drafts at 24 h and 48 h after the notice's successful send, sent within 8 AM–10 PM ([[OWN-DEC-101]]); customer messages carry no private details and are English ([[FACT-AUTOMATIC-MESSAGES]], [[HH-COM-03]]). The one value a reminder may fill in is `{projectLink}` (the question's page); the staff email may fill in `{appLink}` (the request in the staff app).
- **PROPOSED wording for the owner to approve or change (not used by the software):** reminder email subject "Reminder: HandyHub has a question about your request"; email and text "Reminder: HandyHub has a question about your request. View and reply securely. {projectLink}"; staff email subject "A customer replied to a question", text "A customer replied to a question on a request you are responsible for: {appLink}".
- **Until answered:** no template version of either message is released. Reminder drafts are still prepared and staff still release them; each send is recorded as failed with `template_not_configured` and opens one delivery issue with Retry, nothing is shown as sent, and because no final reminder is actually sent, "Closed—no response" stays unavailable. The staff email is recorded the same way; the "question answered" queue item (assigned to the responsible staff member) carries the reply to staff either way.
