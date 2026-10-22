---
id: OQ-STAFF-REPLY-WORDING
type: question
title: Wording around a staff reply sent by email or text
status: superseded
area: messaging
links:
  related: ["[[HH-COM-08]]", "[[OWN-DEC-120]]", "[[FACT-AUTOMATIC-MESSAGES]]", "[[OQ-ACCESS-LINK-WORDING]]", "[[OQ-RECEIPT-EMAIL-WORDING]]", "[[TSK-0050]]"]
  superseded_by: ["[[OWN-DEC-151]]"]
source: "TSK-0050 (2026-10-21): OWN-DEC-120 decides that Send is the release of a staff reply, not the email subject or the text around the reply"
---
**Answered by [[OWN-DEC-151]] (2026-10-21).**

**Question:** which email subject (and any line around the staff member's own text) and which text-message form should a staff reply (`staff.reply`, sent from the project when staff press Send) use?

- **Who answers:** the owner (approve a wording, as for the code message in [[OWN-DEC-150]]).
- **Known:** [[OWN-DEC-120]] makes Send the release, with the customer's preferred permitted channel; [[FACT-AUTOMATIC-MESSAGES]] keeps amounts and private details out of message bodies; customer templates are English ([[HH-COM-03]]). The one value filled in at send time is `{replyText}`, the staff member's text exactly as written. A customer email of a project replies to the project's reply address (TSK-0049), so the customer can answer by email.
- **PROPOSED wording for the owner to approve or change (not used by the software):** email subject "Message from HandyHub about your project"; email body "{replyText}" followed by "You can reply to this email."; text "HandyHub: {replyText}".
- **Until answered:** no version of the `staff.reply` template is released. Pressing Send still adds the reply to the project conversation (the customer reads it in the portal's Messages tab), and its email or text is recorded as failed with `template_not_configured`, which opens one delivery issue with Retry; nothing is shown as sent, and the first-response clock keeps running ([[HH-LEAD-05]]). The composer says so before Send.
