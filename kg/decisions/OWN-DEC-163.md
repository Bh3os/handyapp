---
id: OWN-DEC-163
type: decision
title: "Estimate visits are never charged, even when cancelled late"
status: active
area: scheduling
links:
  uses: ["[[FACT-CANCELLATION-RULES]]", "[[FACT-VISIT-FEE]]"]
  related: ["[[OWN-DEC-99]]", "[[OWN-DEC-86]]", "[[OWN-DEC-208]]"]
source: "owner answers 2026-10-21 R4-Q2"
---
Owner answer (round 4, question 2), option chosen "No fee for estimate visits (Recommended)":

> Implement the following HandyHub cancellation policy:
>
> 1. All online estimates and on-site estimate visits are free.
> 2. Never charge a cancellation fee for an estimate visit, regardless of how close to the appointment the customer cancels.
> 3. The $50 late-cancellation policy applies only to confirmed WORK visits, subject to the customer's accepted terms and applicable law.
> 4. Clearly distinguish ESTIMATE visits from WORK visits throughout the scheduling, invoicing, and cancellation systems.
> 5. Never automatically generate a cancellation invoice or deduct money for a cancelled estimate visit.
> 6. Record cancellations and no-shows internally for operational purposes.
> 7. If a customer repeatedly cancels at short notice or fails to attend, flag future estimate bookings for owner review rather than automatically charging a fee or blocking the customer.
> 8. Automatically release staff availability when an estimate visit is cancelled.
> 9. Cancel outstanding reminders and send the approved cancellation confirmation.
> 10. Maintain accurate cancellation records without unfairly penalizing customers for legitimate emergencies.
>
> Ensure the customer-facing website continues to advertise **"Free estimates, online or in person."**
>
> Implement and test these rules in staging.

Effect:
- Online estimates and on-site estimate visits are free; an estimate visit never carries a cancellation fee, whatever the notice, and no cancellation invoice or deduction is ever generated for one.
- The $50.00 late-cancellation rule applies only to confirmed work visits ([[OWN-DEC-161]]).
- Estimate and work visits stay distinct in scheduling, invoicing and cancellation.
- Cancellations and no-shows are recorded; repeated short-notice cancellations or no-shows flag the customer's future estimate bookings for owner review, never a charge or a block; legitimate emergencies are not penalized.
- A cancelled estimate visit releases staff availability, cancels its reminders and sends the cancellation confirmation (MESSAGE 12, [[OWN-DEC-152]]).
- The site keeps saying estimates are free. Reading: the existing approved wording "Free estimates—online or at your property." ([[OWN-DEC-86]]) is the statement the owner quotes as "Free estimates, online or in person."; no copy change.
- Answers case 2 of [[OQ-LATE-CANCELLATION-EDGES]]. Built by [[TSK-0140]].

**Confirmed by [[OWN-DEC-208]] (2026-10-22):** the free-estimates wording reading is final: the existing "Free estimates—online or at your property." stays.
