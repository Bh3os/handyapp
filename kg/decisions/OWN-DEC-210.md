---
id: OWN-DEC-210
type: decision
title: "Unpaid invoices: automatic reminders 3 and 7 calendar days after the due date, once each; stop on payment, dispute, payment plan, refund or credit review, or collection hold"
status: active
area: invoicing
links:
  constrained_by: ["[[RULE-NO-INVENTED-FACTS]]", "[[RULE-HUMAN-REVIEW]]"]
  uses: ["[[FACT-REMINDER-CADENCES]]", "[[FACT-PAYMENT-DUE]]", "[[FACT-AUTOMATIC-MESSAGES]]", "[[ENT-Invoice]]", "[[ENT-Message]]", "[[INT-Resend]]"]
  related: ["[[OWN-DEC-112]]", "[[OWN-DEC-153]]", "[[OWN-DEC-110]]", "[[OWN-DEC-151]]", "[[OWN-DEC-158]]", "[[OWN-DEC-190]]", "[[OWN-DEC-191]]", "[[OQ-MESSAGES-OUTSIDE-THE-21]]", "[[HH-FIN-19]]", "[[TSK-0091]]", "[[TSK-0142]]"]
source: "owner answers 2026-10-22 R13-Q3; retained in R14"
---
Owner answer (round 13, question 3, "Unpaid-invoice reminders: Automatic, 3 and 7 days"), verbatim:

> Choose **Automatic, 3 and 7 days (Recommended)**, with additional financial and customer-service safeguards.
>
> I authorize automatic unpaid-invoice reminders for HandyHub under the following conditions.
>
> ### Reminder schedule
> 1. Send the first reminder 3 calendar days after the invoice due date.
> 2. Send the second reminder 7 calendar days after the invoice due date.
> 3. Send each reminder only once per invoice and reminder stage.
> 4. Any further collection follow-up must be reviewed and explicitly released by authorized staff.
>
> ### Financial safeguards
> - Send reminders only for officially issued invoices with an outstanding collectible balance.
> - Do not send reminders for drafts, voided invoices, cancelled invoices, or fully paid invoices.
> - Immediately suspend the existing reminder sequence when a payment is recorded, including partial payments, until the remaining balance and payment status are reconciled.
> - Do not automatically restart the original reminder schedule after a partial payment. Allow staff to confirm the appropriate next reminder or revised arrangement.
> - Stop automatic reminders when an invoice is formally disputed, placed on a payment plan, subject to an active refund/credit review, or otherwise placed on collection hold.
> - Respect revised due dates and documented payment agreements.
> - Verify the current invoice status immediately before sending each reminder.
> - Prevent duplicate notifications using idempotent event processing.
>
> ### Customer communication
> - Follow the established **HandyHub | ...** email subject convention.
> - Use "Hi {customerFirstName}," or "Hi there," when the name is unavailable.
> - Use a polite, professional, nonthreatening tone.
> - Sign emails "The HandyHub Team".
> - Do not include sensitive financial details in the email body.
> - Direct customers to the secure portal to view their invoice and available payment options.
> - Include an appropriate way to contact HandyHub if payment was already made or the invoice is incorrect.
> - Do not add late fees, interest, or collection penalties without separately verified legal and contractual authorization.
> - Do not threaten legal action, credit reporting, or collections.
>
> ### Delivery requirements
> - Use the existing transactional email infrastructure.
> - Log reminder scheduling, sending, delivery status, suppression reasons, and failures.
> - Respect the established customer notification preferences and channel rules.
> - Do not require SMS to deliver email reminders.
> - Keep SMS reminders disabled until A2P 10DLC registration and the applicable consent requirements are satisfied.
>
> ### Testing
> Test: Unpaid invoice at day 3. Unpaid invoice at day 7. Payment before reminder dispatch. Partial payment. Disputed invoice. Approved payment plan. Revised due date. Voided invoice. Duplicate scheduled events. Failed delivery and retry behavior.
>
> Publish the verified implementation to private staging and include these scenarios in Owner Acceptance Testing.
>
> Do not require additional Owner approval for routine reminders that meet these rules.

Retained in round 14 (2026-10-22): "Automatic overdue-invoice reminders at 3 and 7 days, with payment, dispute, and payment-plan safeguards".

Effect:
- Partly replaces [[OWN-DEC-112]]: the staff-released drafts at 24 hours and 3 days after issue become two automatic reminder emails, 3 and 7 calendar days after the invoice's due date ([[FACT-PAYMENT-DUE]]: due on receipt for new projects, or the term already agreed), each sent at most once per invoice and stage. Any further collection follow-up is reviewed and released by authorized staff. Kept from [[OWN-DEC-112]]: no late fees or interest, no automatic collections, saved-card charges or write-offs, and the "Overdue—owner decision" item after the final reminder is actually sent.
- Only officially issued invoices with an outstanding collectible balance qualify; never drafts, voided, cancelled or fully paid invoices. The invoice status is rechecked immediately before each send.
- A recorded payment, partial payments included, suspends the sequence at once until the balance and payment status are reconciled; it never restarts automatically after a partial payment: staff confirm the next reminder or a revised arrangement.
- Automatic reminders stop when the invoice is formally disputed, on a payment plan, under an active refund or credit review, or on any other collection hold. Revised due dates and documented payment agreements are respected.
- Content: "HandyHub | ..." subject, "Hi {customerFirstName}," or "Hi there,", a polite, non-threatening tone, signed "The HandyHub Team"; no sensitive financial details in the body; a link to the secure portal for the invoice and payment options; a way to tell HandyHub the invoice is already paid or incorrect. No late fees, interest or penalties without separately verified legal and contractual authorization; no threat of legal action, credit reporting or collections. The wording is written in the style of [[OWN-DEC-151]] by the implementing task, under the owner's authorization ("Do not require additional Owner approval for routine reminders that meet these rules").
- Delivery: the existing transactional email; scheduling, sending, delivery status, suppression reasons and failures are logged; preferences and channel rules apply; email never waits for SMS; SMS reminders stay off until A2P 10DLC and consent are in place ([[OWN-DEC-190]]). Idempotent events prevent duplicates.
- Tests: day 3, day 7, payment before dispatch, partial payment, disputed invoice, approved payment plan, revised due date, voided invoice, duplicate scheduled events, failed delivery and retry. The scenarios are part of Owner Acceptance Testing on private staging ([[OWN-DEC-191]]).
- Answers item 3 of [[OQ-MESSAGES-OUTSIDE-THE-21]]. Built by [[TSK-0091]]; the acceptance checklist with [[TSK-0142]].
