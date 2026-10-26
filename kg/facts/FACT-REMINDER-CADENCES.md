---
id: FACT-REMINDER-CADENCES
type: fact
title: Reminder cadences (all staff-released drafts)
status: active
area: messaging
links:
  decided_by: ["[[OWN-DEC-78]]", "[[OWN-DEC-101]]", "[[OWN-DEC-107]]", "[[OWN-DEC-109]]", "[[OWN-DEC-112]]", "[[OWN-DEC-113]]", "[[OWN-DEC-132]]", "[[OWN-DEC-153]]", "[[OWN-DEC-157]]", "[[OWN-DEC-210]]"]
  related: ["[[OWN-DEC-124]]", "[[HH-COM-05]]", "[[OWN-DEC-208]]"]
source: "OWN-DEC-78, 101, 107, 109, 112, 113, 132; owner-answers-verbatim 2026-10-05T18:11 [Reminders]"
---
**Changed by [[OWN-DEC-210]] (2026-10-22):** unpaid invoice: two automatic reminder emails, 3 and 7 calendar days after the invoice due date, once each; suspended by any recorded payment until reconciled, stopped by a dispute, payment plan, refund or credit review or collection hold; further collection follow-up released by staff. Replaces the "Unpaid invoice" row below once [[TSK-0091]] ships the new configuration.

**Changed by [[OWN-DEC-153]], [[OWN-DEC-157]] (2026-10-21):** routine reminders send automatically; the table below is the earlier configuration until [[TSK-0121]] ships the new version.
- Unanswered estimate: one automatic reminder 3 days after the estimate version was successfully delivered, while pending; no 24-hour reminder.
- Unanswered staff question: one automatic reminder 3 days after the notice was delivered, while unanswered; "Closed—no response" 24 hours after it was actually sent (PROPOSED reading, [[OQ-READINGS-2026-10-21]]).
- Confirmed appointment: automatic, 24 hours before; none for a visit booked less than 24 hours ahead.
- Service-quality follow-up (the satisfaction check): 48 hours after authorized final completion, released by staff ([[OWN-DEC-157]]).
- Unpaid invoice and repeat service: unchanged, staff-released ([[OQ-MESSAGES-OUTSIDE-THE-21]]).
- Emails send at any hour; texts within the recipient's local permitted hours ([[OWN-DEC-154]]).

**Value:** the system prepares these drafts; staff release each one. A released draft sends only within [[FACT-HOURS]] ([[FACT-TIMEZONE]]), except unanswered-estimate reminders, which have no contact-hours restriction ([[OWN-DEC-132]]).

| Reminder | First draft | Final draft | Stops or is suppressed when | Decision |
| --- | --- | --- | --- | --- |
| Unanswered estimate (any hour) | 24 h after sending | 3 days after sending | accepted, declined, expired, or the customer responds | [[OWN-DEC-78]], [[OWN-DEC-132]] |
| Unanswered staff question | 24 h after the notice was successfully sent | 48 h after that send | the customer replies; staff may close "Closed—no response" 24 h after the final was actually sent | [[OWN-DEC-101]] |
| Confirmed appointment (with preparation steps) | 24 h before the visit; immediately when confirmed less than 24 h ahead | — | the appointment is outdated, cancelled or already reminded | [[OWN-DEC-78]], [[OWN-DEC-107]] |
| Satisfaction check | 2 days after the reviewed completion | — | a concern or case is unresolved | [[OWN-DEC-78]], [[OWN-DEC-109]], [[OWN-DEC-124]] |
| Unpaid invoice | 24 h after issue | 3 days after issue | paid; a pending payment or open billing dispute flags staff review instead; after the final is actually sent the invoice goes to "Overdue—owner decision" | [[OWN-DEC-112]] |
| Repeat service | on the customer-agreed schedule only | — | the customer changes or stops it | [[OWN-DEC-78]], [[OWN-DEC-113]] |

- Failed delivery never counts as customer non-response; measured clocks start at a successful send ([[OWN-DEC-101]], [[OWN-DEC-112]]).
- Every draft is rechecked before release (current state, balance, permissions, marketing consent, opt-outs) ([[HH-COM-05]]).
- Every message offers a simple way to approve, ask questions, reschedule or request another service ([[OWN-DEC-78]]).
- Review requests have no cadence: staff-released, same eligibility whatever the satisfaction score, paused during an active complaint ([[OWN-DEC-113]]).
- Promotional follow-ups are held during unresolved complaints and need marketing consent.
- The day-before visit reminder and an estimate-expiry reminder were approved on 2026-10-05 ("Both reminders"); PROPOSED: the final (3-day) unanswered-estimate draft serves as the expiry reminder; the owner may ask for a separate one nearer the 14-day expiry ([[FACT-ESTIMATE-VALIDITY]]).

**Confirmed by [[OWN-DEC-208]] (2026-10-22):** the "Closed—no response" reading is final (no longer PROPOSED): "Closed—no response" is available 24 hours after the single question reminder was actually sent; not if that reminder failed to deliver (staff follow-up instead), the customer replied, an appointment exists, work was accepted or a payment was recorded.

**Built by [[TSK-0121]] (2026-10-22):** `reminders.cadences` version 2 (migration 0075) is the configuration above as changed by [[OWN-DEC-153]] and [[OWN-DEC-157]]: one automatic estimate reminder 72 hours after the version was successfully delivered; one automatic question reminder 72 hours after the notice was delivered, "Closed—no response" 24 hours after it was actually sent; the automatic appointment reminder 24 hours before. The satisfaction check, unpaid-invoice and repeat-service values are unchanged and staff-released. When each channel may deliver is [[TSK-0122]]'s `messages.delivery_hours`.

**Built by [[TSK-0091]] (2026-10-24):** `reminders.cadences` version 3 (migration 0097) replaces the "Unpaid invoice" row as changed by [[OWN-DEC-210]]: `unpaidInvoice` is two automatic reminders, 3 and 7 calendar days after the invoice's due date, each once per invoice and stage, with any further follow-up released by staff. PROPOSED: each is due at the opening of the contact hours in the business time zone ([[OQ-UNPAID-REMINDER-DETAILS]]).

**Built by [[TSK-0092]] (2026-10-25):** the service-quality follow-up (satisfaction check) uses `reminders.cadences.satisfaction.daysAfterCompletion` (2) as 48 elapsed hours after the Owner's review passed; the draft is released by staff ([[OQ-CLOSEOUT-DETAILS]]).
