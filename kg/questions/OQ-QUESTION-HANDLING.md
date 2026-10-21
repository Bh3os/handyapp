---
id: OQ-QUESTION-HANDLING
type: question
title: Details of staff questions and customer replies that no decision gives
status: open
area: intake
links:
  related: ["[[HH-LEAD-03]]", "[[HH-LEAD-06]]", "[[OWN-DEC-98]]", "[[OWN-DEC-101]]", "[[FACT-REOPEN-PERIOD]]", "[[HH-PORT-09]]", "[[ROLE-MATRIX]]", "[[TSK-0051]]"]
source: "TSK-0051 (2026-10-21): OWN-DEC-98 and OWN-DEC-101 decide the flow; these details are readings made to build it"
---
**Question:** does the owner confirm, or change, these PROPOSED readings of [[OWN-DEC-98]] and [[OWN-DEC-101]] that the software uses?

- **Who answers:** the owner.
- **PROPOSED in use (TSK-0051):**
  - **Hazard guard:** besides the warning in the composer, staff must confirm "This question does not ask the customer to inspect a hazardous area." before Publish (the server refuses a question without it). The customer reply form also says "Only share what you can see or photograph safely."
  - **Measurement questions:** staff mark a question as a measurement when publishing; only those offer "I'm not sure".
  - **One reply per question:** a reply answers its question; anything more goes in the project's Messages. The request returns to HandyHub's review when the last open question is answered; each reply opens or refreshes one "question answered" queue item, resolved when staff mark the replies reviewed, publish another question or act on the request.
  - **Reminders per question:** each published question has its own two reminder drafts, measured from its own notice's successful send ("sent" or "delivered" reported by the provider; handing the message to the provider is not yet a successful send), and stopped by its own reply. One queue item per request shows the latest drafted stage. A notice that bounces after it was sent no longer counts, so its reminders are not drafted.
  - **Closing:** "Closed—no response" (permission `request.close_no_response`, in the request-handling row of [[ROLE-MATRIX]] with the same cells) needs the request to wait on the customer and the final reminder of every open question actually sent at least 24 hours (configured) earlier; it is refused, never routed, when work was accepted, an appointment exists or money was received.
  - **After the reopen period:** a reply is refused and the customer is pointed to a new request ([[FACT-REOPEN-PERIOD]] leaves this handling open). Only a reply to a question reopens a closed request; a message in the Messages tab needs an open project.
  - **Who may reply:** request states received, reviewing, needs information, needs site visit, ready for estimate and estimated take replies; declined, out of scope, not served and withdrawn do not (the questions stay visible as history).
  - **Messages tab:** the customer writes text only (no attachment is offered there yet); photos go with a question's reply. Limits PROPOSED: 5,000 characters per reply or message, 30 reply-photo uploads and 60 portal messages per client network per hour.
- **Until answered:** the readings above are in use on private staging; each is a small code or configuration change.
