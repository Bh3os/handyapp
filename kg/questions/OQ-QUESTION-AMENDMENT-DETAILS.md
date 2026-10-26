---
id: OQ-QUESTION-AMENDMENT-DETAILS
type: question
title: The "I'm not sure", no-response closing and staff reopening details no decision gives
status: open
area: intake
links:
  related: ["[[OWN-DEC-197]]", "[[OWN-DEC-208]]", "[[HH-LEAD-03]]", "[[HH-LEAD-06]]", "[[ENT-Question]]", "[[FACT-REOPEN-PERIOD]]", "[[FACT-REMINDER-CADENCES]]", "[[ROLE-MATRIX]]", "[[TSK-0148]]", "[[TSK-0121]]"]
source: "TSK-0148 (2026-10-26): OWN-DEC-197 E2, E4, E5 and OWN-DEC-208 reading 3 state the rules; the details below are PROPOSED"
---
**Question:** does the owner approve, or change, these PROPOSED details of "I'm not sure", closing for no response and reopening?

- **Who answers:** the owner.
- **Decided, in use:** "I'm not sure" or "I don't know" may be offered for any appropriate question; customers are never forced to guess technical information (E2). "Closed—no response" is available 24 hours after the single question reminder was actually sent; never when that reminder failed to deliver (staff follow-up instead), the customer replied, an appointment exists, work was accepted or a payment was recorded; a queued but unsent reminder never counts (E4, [[OWN-DEC-208]]). The 30-day reopen period stays ([[FACT-REOPEN-PERIOD]]); after it, staff may reopen with authorization, or the customer is guided to a new request (E5).
- **PROPOSED, in use on private staging:**
  - **Who marks "I'm not sure".** Staff tick "The customer may answer “I'm not sure” or “I don't know”" when publishing; it is off by default for a general question. A measurement always offers it. The choice is part of the published question and never changes.
  - **Customer wording.** The customer's option keeps the approved label "I'm not sure" for every question; no separate "I don't know" label was added. The owner may ask for "I'm not sure / I don't know".
  - **Actually sent.** A reminder counts while one of its deliveries (email or text) is sent or delivered as the provider reports it. The 24 hours run from the earliest such send that still stands. If an email bounces and a text reaches the customer later, the text's send is the one that counts. Handed to the provider but not reported sent is not sent.
  - **Several open questions.** Every unanswered question's reminder must have been actually sent; the 24 hours run from the latest of those sends.
  - **Failed reminder.** When every delivery of a reminder failed or was suppressed (at send time, or a bounce reported later), closing is refused ("The reminder was not delivered: follow up with the customer instead of closing.") and the request's reminder queue item reads "The question reminder was not delivered: follow up with the customer", assigned to the responsible staff member. The item resolves when a reminder delivery is reported sent (after a Retry, for example), when the customer replies, or when the request closes. A failed delivery with Retry keeps its own delivery issue as before.
  - **"The customer replied".** Closing is refused while either applies: (1) since the counted reminder send, the customer replied to any question of the request or wrote a message placed on the project (portal, text or email); (2) a customer reply or message is still waiting for staff review (its "question replied" or "customer replied" queue item is open). Marking the replies reviewed clears (2) but not (1). Publishing a new question starts that question's own reminder, which then has to be sent and waited for.
  - **Work, appointments and payments.** Unchanged from [[TSK-0121]]: an accepted estimate version, a visit that is not cancelled or expired (a tentative one counts), or any payment staff recorded (a returned or voided one still counts) refuses closing and sends the decision to the Owner.
  - **Staff reopening.** Permission `request.reopen` sits in the request-handling row of [[ROLE-MATRIX]] with the same cells as closing: the Owner and Office, and the Estimator (that cell is itself PROPOSED); never a Worker. A written reason is required (up to 2,000 characters), kept staff-only in the request's decision history as "Reopened by staff"; the customer timeline does not show it. Staff may reopen a "Closed—no response" request within the reopen period too, not only after it.
  - **What reopening does.** The request returns to review ("Reviewing") and its project reopens. Nothing else is restored: no expired estimate or appointment, and no reminder is sent again. The customer can answer the questions that were still open. No message goes to the customer, because no wording is approved for one.
  - **Customer after the period.** The page says "This request is closed. To continue, send a new request." with a "Send a new request" link, also when the period ends while the customer is writing the reply; the draft stays on the page.
  - **The 30 days.** Counted as 30 × 24 hours from the moment the request was closed, as built in [[TSK-0051]].
- **Until answered:** the PROPOSED details above are used; each is a small change to the nodes or the code.
