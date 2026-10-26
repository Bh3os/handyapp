---
id: OQ-UNPAID-REMINDER-DETAILS
type: question
title: The unpaid-invoice reminder details no decision gives
status: open
area: invoicing
links:
  related: ["[[HH-FIN-19]]", "[[OWN-DEC-210]]", "[[OWN-DEC-112]]", "[[OWN-DEC-151]]", "[[OWN-DEC-158]]", "[[FACT-REMINDER-CADENCES]]", "[[FACT-PAYMENT-DUE]]", "[[FACT-HOURS]]", "[[ROLE-MATRIX]]", "[[TSK-0091]]", "[[OQ-MESSAGES-OUTSIDE-THE-21]]", "[[OQ-PAYMENT-EXCEPTION-DETAILS]]"]
source: "TSK-0091 (2026-10-24): OWN-DEC-210 and HH-FIN-19 state the rules; the details below are PROPOSED"
---
**Question:** does the owner approve, or change, these PROPOSED details of the unpaid-invoice reminders and the "Overdue—owner decision" item?

- **Who answers:** the owner.
- **Decided, in use:** two automatic reminder emails, 3 and 7 calendar days after the invoice's due date, each once per invoice and stage, only for an issued invoice with a collectible balance, rechecked right before each send. Any recorded payment, partial or pending, suspends them and they never restart by themselves. A dispute, a payment plan, a refund or credit review or a collection hold stops them. Revised due dates are respected. Further follow-up is released by staff. No amounts, threats, late fees or interest; never collections, a saved-card charge or an automatic write-off. Scheduling, sends, delivery status, suppressions and failures are logged. SMS reminders stay off until A2P 10DLC. After the second reminder is actually sent and the balance remains, the invoice waits in Owner Decisions as "Overdue—owner decision" ([[OWN-DEC-210]], [[OWN-DEC-112]], [[HH-FIN-19]]).
- **PROPOSED, in use on private staging:**
  - **Time of day.** Each reminder is due at the opening of the daily contact hours (8 AM, `contact.hours`) in the business time zone, on the 3rd and 7th calendar day after the due date. Emails send at any hour, so no other time rule applies.
  - **Due date.** Due on receipt means the business date (America/Kentucky/Louisville) the invoice was issued. A revised due date is the latest one staff recorded.
  - **Which invoices.** Final invoices only. A deposit invoice follows the deposit gate and its "deposits to collect" queue item, so it gets no automatic reminder.
  - **Disputes.** These stop the reminders: an open payment dispute ([[OQ-PAYMENT-EXCEPTION-DETAILS]]), an open dispute case on the project, or an open complaint in the billing category. Other complaints do not.
  - **Reviews.** These stop the reminders: any refund, credit or write-off request waiting for the Owner, or a refund that needs review.
  - **Suspension and the next step.** A payment recorded on the invoice since its due date was set suspends the reminders. A payment recorded before a revised due date does not count against that date. While a reminder is still to come and the balance remains, a staff queue item, "Payment reminders to review", asks the Owner or Office to confirm the next step. They can release a follow-up reminder, record a revised due date (the reminders not yet sent count from it), or record a payment plan or a collection hold. The item resolves when any of these is recorded after the payment, or when nothing is left to collect.
  - **Payment plans and holds.** The Owner or Office records a payment plan, a collection hold, or the end of one, each with a note of up to 2,000 characters. One of each can be active at a time. Ending one restarts nothing; a revised due date does.
  - **Revised due dates.** Recorded by the Owner or Office with a note. The date may be from today up to 365 days ahead. A reminder already sent is never sent again; the reminders not yet sent move to the new date.
  - **Follow-up reminders.** Released by the Owner or Office (`payment_reminder.release`). Allowed after the second reminder was sent, or after a payment suspended the reminders, while no plan, hold, dispute or review stops them. One follow-up at a time. Sent at once by email and rechecked just before it goes; a payment recorded after the release cancels it.
  - **Owner decision.** The Owner records "keep following up" with a note, and the item resolves. A payment plan, collection hold or revised due date recorded after the second reminder resolves it too, as does a write-off or payment that leaves nothing to collect. A second reminder that turns out not delivered (a bounce) also resolves it, because a failed delivery is a staff delivery issue, never customer non-response.
  - **Invoices issued before this change.** Each gets its reminders planned once; a reminder whose time has already passed is not sent late.
  - **Wording.** Written in the style of the 21 owner templates, under the owner's authorization in [[OWN-DEC-210]] ("Do not require additional Owner approval for routine reminders that meet these rules"); the Owner may edit either as a new template version. Template `unpaid_invoice_reminder` (both automatic reminders):
    - Subject: "HandyHub | Reminder About Invoice #{invoiceNumber}"
    - Body: "Hi {customerName}, / This is a friendly reminder that your HandyHub invoice #{invoiceNumber} is still open in our records. / You can review the invoice and the available payment options securely using the link below: / {invoiceLink} / If you have already paid, thank you, and please disregard this reminder. If you believe the invoice is incorrect or have any questions, simply reply to this email or contact our team, and we'll be happy to help. / Thank you for choosing HandyHub! / The HandyHub Team"
  - Template `unpaid_invoice_follow_up` (staff-released follow-up):
    - Subject: "HandyHub | Following Up on Invoice #{invoiceNumber}"
    - Body: "Hi {customerName}, / We're following up on your HandyHub invoice #{invoiceNumber}, which is still open in our records. / You can review the invoice, its current balance and the available payment options securely using the link below: / {invoiceLink} / If you have already paid, or if you believe the invoice is incorrect, please reply to this email or contact our team so we can review it with you. / Thank you for choosing HandyHub! / The HandyHub Team"
  - **Link.** `{invoiceLink}` opens the project's Documents tab in the portal, as the invoice-ready notice does.
- **Until answered:** the PROPOSED details above are used; each is a small change to the nodes or the code.
