---
id: OWN-DEC-112
type: decision
title: Unpaid balance: reminders at 24 h and 3 days, then "Overdue—owner decision"
status: active
area: payments
links:
  related: ["[[OWN-DEC-78]]", "[[OWN-DEC-110]]", "[[OWN-DEC-115]]", "[[HH-COM-05]]", "[[HH-FIN-13]]", "[[HH-FIN-14]]", "[[HH-AUTO-02]]", "[[OWN-DEC-210]]"]
  uses: ["[[FACT-REMINDER-CADENCES]]", "[[FACT-HOURS]]", "[[FACT-TIMEZONE]]"]
source: "owner-answers-verbatim 2026-10-12T19:09:51.058Z [10.3 Unpaid]; decision-briefs 2026-10-12T19:10:30"
---
Partly replaced by [[OWN-DEC-210]] (2026-10-22): the reminders become automatic, 3 and 7 calendar days after the due date (no longer staff-released drafts at 24 hours and 3 days after issue), each once; they stop on payment (partial payments suspend them), dispute, payment plan, refund or credit review and collection hold; further collection follow-up is staff-released. No late fees, interest, automatic collections or write-offs, and the "Overdue—owner decision" item, stay.

Owner, 2026-10-12, journey Step 10.3, unpaid balance.

Question asked:
> Step 10.3 - Unpaid balance: reminder drafts at +3 days and +7 days after issue (staff release them, sent 8 AM–10 PM). No late fees or interest are shown or charged (none approved). After the final reminder, the invoice goes to an owner review queue ('Overdue — owner decision'), and nothing is sent to collections automatically. OK?

Owner wording:
> Use the faster payment-follow-up schedule already selected:
>
> - Prepare the first reminder 24 hours after invoice issue and the final reminder after 3 days. Staff release them during permitted contact hours, within 8 AM–10 PM.
> - Before release, refresh the balance and recorded payments. Stop reminders when paid. If a payment is pending verification or a billing dispute is open, flag it for staff review instead of sending a routine demand.
> - Partial-payment reminders show only the current remaining balance through secure project access.
> - After the final reminder is actually sent, place the unpaid invoice in “Overdue—owner decision.” Failed delivery is a separate staff issue, not customer nonresponse.
> - Charge no late fees or interest. Never send to collections, charge a saved card, or write off the balance automatically.
>
> This replaces the proposed 3-day/7-day schedule. Implement, test, and publish on private staging using test notifications.

Effect:
- Replaces the proposed 3-day/7-day payment-reminder schedule (an AI proposal that applied the [[OWN-DEC-78]] estimate cadence to invoices; it was never an owner decision). Values in [[FACT-REMINDER-CADENCES]].
- First reminder draft 24 hours after the invoice is issued, final reminder after 3 days; staff release them only within 8 AM–10 PM in the business time zone ([[FACT-HOURS]]), queuing anything released outside hours.
- Before release the balance and recorded payments are refreshed; reminders stop when paid. A payment pending verification or an open billing dispute flags the invoice for staff review instead of a routine demand.
- Partial-payment reminders show only the current remaining balance, through secure project access (no amounts in the message body).
- After the final reminder is actually sent the invoice moves to "Overdue—owner decision" in Owner Decisions ([[OWN-DEC-115]]). A failed delivery is a separate staff issue, never customer non-response.
- No late fees or interest; never automatic collections, saved-card charges or write-offs.

Links: uses [[FACT-REMINDER-CADENCES]], [[FACT-HOURS]], [[FACT-TIMEZONE]].
