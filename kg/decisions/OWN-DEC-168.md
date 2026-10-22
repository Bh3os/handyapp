---
id: OWN-DEC-168
type: decision
title: "Change orders are valid 7 days after publication"
status: active
area: approval
links:
  uses: ["[[FACT-CHANGE-ORDER-VALIDITY]]", "[[FACT-ESTIMATE-VALIDITY]]"]
  related: ["[[OWN-DEC-108]]", "[[HH-CHG-01]]", "[[HH-CHG-02]]"]
source: "owner answers 2026-10-21 R5-Q3"
---
Owner answer (round 5, question 3), option chosen "7 days":

> Implement the following requirements:
>
> 1. Change orders expire 7 calendar days after publication to the customer.
> 2. Calculate expiration using an exact timestamp and the established HandyHub business time-zone policy.
> 3. Clearly display the expiration date and time in the customer's local time zone.
> 4. Require explicit customer approval before implementing any proposed change.
> 5. Prevent approval of expired, withdrawn, rejected, or superseded change orders.
> 6. Allow authorized staff to reissue expired change orders after reviewing current pricing, materials, scheduling, and scope.
> 7. Preserve all previous versions and approval records.
> 8. Allow the owner to authorize a shorter validity period for time-sensitive change orders, with a documented reason and clearly disclosed expiration.
> 9. Never automatically extend or approve a change order.
> 10. If the customer rejects or does not approve the change, preserve the original approved scope and contractual obligations unless another authorized action is required.
> 11. If work is paused awaiting a change-order decision, maintain the appropriate project status and notify authorized staff.
> 12. Do not automatically charge cancellation fees, modify approved pricing, or cancel the original job because a change order expires.
> 13. Prevent duplicate approvals and conflicting versions.
> 14. Test expiration, approval, rejection, reissuance, and version history in staging.
>
> Keep the standard estimate validity at 14 days. Apply the 7-day rule only to change orders.

Effect:
- A published change order expires 7 calendar days after publication to the customer, stored as an exact timestamp under the business time-zone policy and shown in the customer's local zone ([[OWN-DEC-159]]); value [[FACT-CHANGE-ORDER-VALIDITY]].
- Only explicit customer approval implements a change; expired, withdrawn, rejected and superseded change orders cannot be approved; staff may reissue an expired one after reviewing current pricing, materials, schedule and scope; all versions and approvals are kept; duplicate approvals and conflicting versions are prevented.
- The Owner may set a shorter validity for a time-sensitive change order, with a documented reason and a clearly disclosed expiry. Nothing extends or approves a change order automatically.
- A rejected or unapproved change keeps the original approved scope and obligations; work paused for the decision keeps its status and staff are notified; an expiry never charges a fee, reprices approved work or cancels the job.
- Estimates stay valid 14 days ([[FACT-ESTIMATE-VALIDITY]]).
- Answers [[OQ-CHANGE-ORDER-VALIDITY]]. Built by [[TSK-0081]] and [[TSK-0082]].
