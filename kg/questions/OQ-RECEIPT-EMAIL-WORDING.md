---
id: OQ-RECEIPT-EMAIL-WORDING
type: question
title: Wording of the automatic receipt email
status: open
area: messaging
links:
  related: ["[[OWN-DEC-95]]", "[[OWN-DEC-94]]", "[[HH-INT-20]]", "[[FACT-AUTOMATIC-MESSAGES]]", "[[TSK-0032]]"]
source: "TSK-0032 (2026-10-21): OWN-DEC-95 gives the receipt email's content, not its text"
---
**Question:** which exact subject and body should the automatic receipt email use? The owner approved what it contains ([[OWN-DEC-95]]: the actual reference, the selected services, a brief summary, next steps, secure instructions for viewing the request, account creation optional, pricing and the appointment confirmed separately, the approved response-hours wording) and the receipt page's sentences ([[OWN-DEC-94]]), but no email subject or body.

- **Who answers:** the owner (approve a wording, as for the code message in [[OWN-DEC-150]]).
- **Known:** the values the software fills in at send time are `{reference}`, `{services}` (registry names), `{summary}` (the customer's own description, shortened) and `{nextSteps}` (the receipt page's "What happens next?" sentences from configuration, then "Your request is received. Pricing and your appointment will be confirmed separately."). There is no secure link yet: the access instructions are the separate automatic access message ([[FACT-AUTOMATIC-MESSAGES]] #3, TSK-0034).
- **PROPOSED wording for the owner to approve or change (not used by the software):** subject "Your HandyHub request is in"; body "Your request is in. Thank you for choosing HandyHub. / Request reference: {reference} / Services: {services} / Your project: {summary} / What happens next? {nextSteps} / To view your request securely, use the separate access message we send you; it asks you to confirm your contact details first. Creating an account is optional."
- **Until answered:** no version of the `request.receipt` template is released. The receipt automation still runs once per saved request and records each delivery as failed with `template_not_configured`; staff see one delivery issue per request with Retry ("A message was not sent: its wording or channel is not configured"), and the request stays saved. Nothing is shown as sent.
