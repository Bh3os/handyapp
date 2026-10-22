---
id: OWN-DEC-157
type: decision
title: "Service-quality follow-up 48 hours after every completed job, released by staff"
status: active
area: quality
links:
  supersedes: ["[[OWN-DEC-78]]"]
  related: ["[[OWN-DEC-109]]", "[[OWN-DEC-113]]", "[[HH-QA-10]]"]
source: "owner answers 2026-10-21 R2-Q3"
---
Question asked (round 2, question 3): "The "How was your experience?" follow-up: who receives it?"

Owner answer:

> Choose **Every completed job**, with these requirements:
>
> 1. Classify this message as a service-quality follow-up, not a promotional campaign, provided its content and actual purpose qualify under applicable communication rules.
> 2. Send it 48 hours after the job reaches its authorized final completion status.
> 3. Use the owner-approved service-quality follow-up template.
> 4. Do not include promotional offers, discounts, cross-selling, or public review requests.
> 5. Send only once per completed job.
> 6. Suppress it if the customer has requested no optional follow-ups, has an active complaint requiring personal attention, or the job has been reopened.
> 7. Allow authorized staff to review and release the message, as specified in Option 2.
> 8. Provide a secure link for the customer to report concerns or request assistance.
> 9. Maintain delivery and customer-response audit records.
> 10. Keep marketing campaigns separate and send them only to customers with appropriate marketing consent.
>
> Implement and test the complete workflow in staging before enabling production delivery.

Effect:
- MESSAGE 18 (`customer_follow_up`, [[OWN-DEC-151]]) is a service-quality follow-up, not a promotional campaign: no offers, discounts, cross-selling or public review requests. It is the satisfaction check of [[OWN-DEC-109]] and [[HH-QA-10]].
- Every completed job gets it, 48 hours after the job reaches its authorized final completion, once per job; authorized staff review and release it.
- It is suppressed when the customer asked for no optional follow-ups, a complaint needs personal attention, or the job was reopened.
- It carries a secure link for reporting a concern or asking for help; delivery and the customer's response are recorded.
- Review requests and marketing stay separate and need marketing consent ([[OWN-DEC-113]]).
- Built by [[TSK-0092]].
