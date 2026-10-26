---
id: HH-BASE-05
type: requirement
title: Inquiry is not a booking; acceptance is not an appointment; a redirect is not payment; a checkbox is not safety
status: active
priority: P0
area: platform
links:
  decided_by: ["[[OWN-DEC-97]]", "[[OWN-DEC-103]]", "[[OWN-DEC-111]]", "[[OWN-DEC-108]]"]
  constrained_by: ["[[RULE-SAFETY-GATES]]"]
  tested_by: ["[[T09]]", "[[T60]]", "[[T45]]"]
source: "guide 1.4; OWN-DEC-97, OWN-DEC-103, OWN-DEC-111"
---
These states never imply the next one, in data, screens or messages:
- **A request is not a booking.** Submitting a request creates a request and a project record ([[OWN-DEC-97]]), never a job or appointment. Visit preferences are preferences; the receipt says the request is received and pricing and the appointment are confirmed separately.
- **Estimate approval is not an appointment.** Approval creates the job and a scheduling task; the customer reads "scheduling is next" ([[OWN-DEC-103]]). An appointment exists only after staff confirm a reserved visit.
- **A payment redirect or a customer claim is not payment.** Nothing is marked paid from a success page, a payment-link redirect, a screenshot or an "I paid" message; only a payment verified and recorded by authorized staff counts ([[OWN-DEC-111]]). A received check stays pending until cleared.
- **A checked safety box is not proof the site is safe.** Acknowledgments and checklists are evidence of what a worker confirmed; they never clear a critical hold or bypass the Start Work gate ([[RULE-SAFETY-GATES]]).

**Built by [[TSK-0110]] (2026-10-26):** truth checks at the API boundary (a guest can only send a request or authenticate; customers only read money; Start Work is online-only behind its gate), in the customer wording (request text never reads as a booking; a card-page return marks nothing paid) and in behaviour (a customer's "I paid" message opens a staff item and changes no payment or balance, [[T60]]).
