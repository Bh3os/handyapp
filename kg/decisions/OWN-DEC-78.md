---
id: OWN-DEC-78
type: decision
title: Customer reminder cadence; every reminder is a staff-released draft
status: active
area: messaging
links:
  supersedes: ["[[OWN-DEC-41]]"]
  related: ["[[HH-COM-05]]", "[[HH-SCH-02]]", "[[HH-SCH-10]]", "[[HH-AUTO-01]]", "[[OWN-DEC-132]]"]
  uses: ["[[FACT-REMINDER-CADENCES]]"]
  tested_by: ["[[T65]]", "[[T67]]"]
  part_of: ["[[C05]]", "[[C07]]", "[[C11]]"]
source: "vault-own-decisions.md OWN-DEC-78; owner-answers-verbatim.md 2026-10-12T16:41"
---
Partly replaced by [[OWN-DEC-132]]: unanswered-estimate reminders now +24h and +3 days, no contact-hours restriction (resolves the Open item below).

Owner wording (project chat, 2026-10-12): "Prepare these reminders as drafts for staff to review and release:
- Unanswered estimate: 3 days after sending, then one final follow-up after 7 days.
- Confirmed appointment: 24 hours before the visit, with preparation instructions.
- Completed job: 2 days after completion, ask whether everything is satisfactory.
- Repeat service: use a customer-agreed schedule for recurring cleaning or maintenance.

Every message should offer a simple way to approve, ask questions, reschedule, or request another service.

Stop estimate reminders after acceptance, decline, expiration, or a customer response. Cancel outdated appointment reminders. Hold promotional follow-ups during unresolved complaints, and respect communication preferences and marketing consent.

Do not send automatically; staff release each draft."

Effect:
- The system prepares reminder drafts on the cadences in [[FACT-REMINDER-CADENCES]]; staff release each one. None sends automatically.
- Each reminder offers a simple way to approve, ask a question, reschedule or request another service.
- Estimate reminders stop after acceptance, decline, expiration or any customer response; outdated appointment reminders are cancelled.
- Promotional follow-ups are held during unresolved complaints; communication preferences and marketing consent are respected. State and permission are rechecked at send time.
- Repeat-service reminders use a staff-recorded, customer-agreed next-service date; recurring job series stay a later (P1) feature.

Partly replaced by [[OWN-DEC-101]]: the 3-day and 7-day cadence is replaced by drafts 24 and 48 hours after the successful send, released only between 8 AM and 10 PM. [[OWN-DEC-112]]: unpaid-invoice reminders 24 hours and 3 days after issue. [[OWN-DEC-107]]: the appointment reminder is prepared immediately when a visit is confirmed less than 24 hours ahead. [[OWN-DEC-109]]: the 2-day satisfaction draft is suppressed while a concern is open. [[OWN-DEC-113]]: repeat-service reminders only on a customer-agreed schedule the customer can change or stop. [[OWN-DEC-122]]: the cadence is active configuration, with no activation step.

Open:
- Whether the 24-hour and 48-hour cadence of [[OWN-DEC-101]], scoped to unanswered staff questions, also replaces the 3-day and 7-day cadence for unanswered estimates: [[FACT-REMINDER-CADENCES]].
