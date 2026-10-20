---
id: OWN-DEC-103
type: decision
title: Estimate approval: verified access, unchecked terms box, full name, server recheck
status: active
area: approval
links:
  related: ["[[OWN-DEC-96]]", "[[OWN-DEC-105]]", "[[OWN-DEC-127]]", "[[HH-EST-06]]", "[[HH-EST-07]]", "[[HH-EST-08]]", "[[HH-EST-09]]", "[[HH-ID-07]]", "[[HH-BASE-05]]"]
  uses: ["[[FACT-ESTIMATE-VALIDITY]]", "[[FACT-DEPOSIT-RULE]]", "[[FACT-PAYMENT-DUE]]", "[[ENT-Approval]]"]
source: "owner-answers-verbatim 2026-10-12T18:53:23.426Z [5.2 Approve]; decision-briefs 2026-10-12T18:53:59"
---
Owner, 2026-10-12, journey Step 5.2, approving.

Question asked:
> Step 5.2 - Approving: the customer must have a verified contact. They tick 'I have read and accept the estimate terms', type their full name as a signature, and press 'Approve Estimate'. We record the exact estimate version, terms version, name, time and device details. Optional lines (options) are chosen before approving. If the estimate has expired or been revised, approval is refused and they're asked to review the newer version. They can also 'Request Changes' (a message to staff) or 'Decline' with an optional reason. OK?

Owner wording:
> Yes, with these refinements:
>
> - Require verified project access. If verification has expired, offer a new code without losing selected options.
> - Show the complete written or uploaded estimate, readable terms, selected options, final total, and applicable deposit before approval.
> - Keep “I have read and accept the estimate terms” unchecked by default. Require the customer’s full name and an explicit “Approve Estimate” action.
> - Record the exact estimate/document revision, terms version, selected options, approved total, name, verified contact, and server timestamp. Collect only necessary security metadata—not invasive device fingerprinting.
> - Recheck validity, revision, options, and total on the server. Reject expired or superseded estimates. Show the current version when available; otherwise offer “Request an Updated Estimate.”
> - Double clicks or retries must create only one approval and one job/scheduling task.
> - Keep Request Changes and Decline available, with an optional decline reason. Notify staff and preserve the history.
> - After approval, show “Estimate approved—scheduling is next.” Approval does not confirm an appointment or mark a deposit paid.
>
> Implement and test both written and uploaded estimates on private staging, using clearly labeled test-only terms.

Effect:
- Approval requires verified project access ([[OWN-DEC-96]]); if verification expired a new code is offered and the selected options are kept (client and server side).
- Before approval the customer sees the complete written or uploaded estimate, the readable terms ([[OWN-DEC-127]]), selected options, final total, any deposit ([[FACT-DEPOSIT-RULE]]) and the payment term ([[FACT-PAYMENT-DUE]]).
- "I have read and accept the estimate terms" starts unchecked; the full name and an explicit "Approve Estimate" press are required.
- Recorded: exact estimate/document revision, terms version and hash, payment-terms text and version, selected options, approved total, name, verified contact and server timestamp. Only necessary security metadata (for example IP and user agent); no invasive device fingerprinting.
- The server rechecks validity, revision, options and total. Expired or superseded estimates are rejected: the current version is shown when there is one, otherwise "Request an Updated Estimate".
- Double clicks and retries create exactly one approval and one job/scheduling task (idempotency key and unique constraints, tested under concurrency).
- "Request Changes" and "Decline" (optional reason) stay available; staff are notified and history is kept.
- After approval: "Estimate approved—scheduling is next." Approval never confirms an appointment or marks a deposit paid. Staging approvals use clearly labelled test-only terms.

Links: uses [[FACT-ESTIMATE-VALIDITY]], [[FACT-DEPOSIT-RULE]], [[FACT-PAYMENT-DUE]], [[ENT-Approval]].
