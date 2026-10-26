---
id: HH-FIN-19
type: requirement
title: "Unpaid-balance reminders and 'Overdue—owner decision'"
status: active
priority: P0
area: invoicing
links:
  decided_by: ["[[OWN-DEC-112]]", "[[OWN-DEC-110]]", "[[OWN-DEC-210]]"]
  depends_on: ["[[HH-COM-05]]"]
  constrained_by: ["[[RULE-NO-INVENTED-FACTS]]"]
  uses: ["[[ENT-Invoice]]", "[[ENT-Message]]", "[[FACT-REMINDER-CADENCES]]", "[[FACT-HOURS]]", "[[FACT-TIMEZONE]]", "[[ROLE-OWNER]]", "[[FACT-PAYMENT-DUE]]"]
  tested_by: ["[[T65]]", "[[T59]]"]
  part_of: ["[[C10]]", "[[S01]]"]
source: "OWN-DEC-112 (new behaviour)"
---
- A first and a final payment-reminder draft are prepared after invoice issue at the payment cadence in [[FACT-REMINDER-CADENCES]].
- Staff release them; sending happens only within contact hours in the business time zone ([[FACT-HOURS]], [[FACT-TIMEZONE]]); a draft released outside hours queues until opening.
- Before release the balance and recorded payments are refreshed. Reminders stop when the invoice is paid. A payment pending verification or an open billing dispute flags the draft for staff review instead of sending a routine demand.
- Reminders show no amounts in the email or text body; a partial-payment reminder points to the current remaining balance in the secure workspace.
- After the final reminder is actually sent and the balance remains, the invoice moves to "Overdue—owner decision" in the Owner Decisions queue. A failed delivery is a separate staff issue, never customer non-response.
- No late fees or interest; never collections, never a saved-card charge, never an automatic write-off.

**Changed by [[OWN-DEC-210]] (2026-10-22):** the reminders are automatic emails 3 and 7 calendar days after the invoice due date ([[FACT-PAYMENT-DUE]]), once per invoice and stage, only for an officially issued invoice with an outstanding collectible balance (never drafts, voided, cancelled or paid ones), with the status rechecked just before each send. A recorded payment, partial payments included, suspends the sequence until reconciled and never restarts it automatically; a dispute, payment plan, active refund or credit review or collection hold stops it; revised due dates and payment agreements are respected. Further collection follow-up is released by staff. No sensitive financial details in the body; a portal link and a way to say it is already paid or wrong; no threats. Scheduling, sends, delivery, suppression reasons and failures are logged; SMS reminders stay off until A2P 10DLC and consent.

**Built by [[TSK-0091]] (2026-10-24):** migration 0097. The two reminders are scheduled when the final invoice is issued: one email each, due 3 and 7 calendar days after the due date at 8 AM business time. They are sent by notify.release after the invoice's send-time recheck: issued and final, a balance left, no payment since the due date was set, no dispute, review, plan or hold. Staff record revised due dates, payment plans, collection holds and their end on the invoice (`finance.invoice_collection_steps`) and release follow-up reminders. A payment that suspends the reminders opens "Payment reminders to review" in the staff queue. The second reminder actually sent with a balance left opens "Overdue—owner decision", which the Owner decides. Email only; no amount in either template. PROPOSED details: [[OQ-UNPAID-REMINDER-DETAILS]].
