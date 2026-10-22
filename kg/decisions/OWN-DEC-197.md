---
id: OWN-DEC-197
type: decision
title: "Rules Review E: 'I'm not sure' beyond measurements; closing for no response checks real delivery; reopening keeps the approved period"
status: active
area: intake
links:
  related: ["[[OWN-DEC-192]]", "[[OWN-DEC-153]]", "[[FACT-REOPEN-PERIOD]]", "[[HH-LEAD-06]]", "[[OQ-QUESTION-HANDLING]]"]
source: "owner answers 2026-10-21 R12 (Rules Review)"
---
Owner answer (round 12, Rules Review), section verbatim:

> E — Staff Questions
> E2: Allow "I'm not sure" or "I don't know" for appropriate questions beyond measurements when the customer cannot reasonably know the answer.
> Do not force customers to guess technical information.
> E4: Closing a request for non-response requires checking the applicable reminder policy, actual delivery state, and absence of accepted work, appointments, or payments. Do not rely solely on a queued-but-unsent reminder.
> Provide staff review for delivery failures.
> E5: Preserve an already approved reopen period if configured. Otherwise, do not impose an invented expiration period. Allow an authorized reopen or clearly guide the customer to submit a new request.
> Approve E1, E3, and E6 as built.

Rules as built, as the owner reviewed them on the Rules Review page (2026-10-21):

- **E2** Only questions marked as measurements offer the customer "I'm not sure".
- **E4** "Closed—no response" is allowed only when the request waits on the customer and the reminder for every open question was actually sent at least 24 hours earlier. It is refused if work was accepted, an appointment exists or money was received.
- **E5** After the reopen period, a reply is refused and the customer is pointed to a new request.

Effect:
- E2: "I'm not sure" or "I don't know" is offered for any appropriate question the customer cannot reasonably answer, not only measurements; customers are never forced to guess technical information.
- E4: "Closed—no response" checks the reminder policy ([[OWN-DEC-153]]), the reminder's actual delivery state and that no work was accepted, no appointment exists and no money was received; a queued but unsent reminder never counts; delivery failures go to staff review.
- E5: the approved reopen period stays (30 days, [[FACT-REOPEN-PERIOD]]); after it, staff may reopen with authorization, or the customer is clearly guided to send a new request. No other expiry is invented.
- Built by [[TSK-0148]].
