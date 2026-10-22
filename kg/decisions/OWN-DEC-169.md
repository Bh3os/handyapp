---
id: OWN-DEC-169
type: decision
title: "After acceptance every contractual change is a change order; the accepted estimate is immutable"
status: active
area: approval
links:
  related: ["[[OWN-DEC-108]]", "[[OWN-DEC-118]]", "[[OWN-DEC-145]]", "[[HH-CHG-01]]", "[[HH-PORT-05]]", "[[HH-EST-04]]"]
source: "owner answers 2026-10-21 R5-Q4"
---
Owner answer (round 5, question 4), option chosen "Always a change order (Recommended)":

> Implement the following HandyHub contract-change policy:
>
> 1. Once a customer approves an estimate, the approved estimate must become immutable. Never overwrite or revise the accepted version.
> 2. Every subsequent change affecting the approved scope of work, price, materials, or contractual schedule must be documented through a Change Order.
> 3. Each Change Order must contain: Unique change-order number; Original job and approved estimate references; Clear description of the proposed change; Reason for the change; Added or removed work; Itemized price adjustments, including credits where applicable; Updated project total; Any deposit or payment adjustments; Potential scheduling impact; Customer approval requirements; Publication and expiration timestamps.
> 4. Require explicit customer approval before performing changed work or applying additional charges.
> 5. Use the previously established **7-day validity period** for published change orders.
> 6. Prevent approval of expired, withdrawn, or superseded proposals.
> 7. Once approved, preserve an immutable copy of the change order and the customer's acceptance record.
> 8. Update the job's current authorized scope, pricing, and schedule based on the original approved estimate plus all subsequently approved change orders.
> 9. Never alter the original accepted estimate or its approval receipt.
> 10. Support multiple change orders per job, with complete version history and audit records.
> 11. Allow negative change orders to document removed work or customer credits.
> 12. Do not automatically cancel the original job if a proposed change order is rejected or expires. Preserve the existing agreement and escalate any resulting feasibility or safety issues for review.
> 13. Distinguish routine appointment rescheduling from contractual schedule changes. A normal appointment change should use the scheduling workflow unless it changes contractual obligations.
> 14. For clerical errors discovered after acceptance, preserve the original document and use a documented correction or change-order process rather than silently editing historical records.
> 15. Ensure the customer can access the original approved estimate, every approved change order, and the current authorized project total through the secure portal.
> 16. Require appropriate additional verification for sensitive approvals, preserve acceptance evidence, and prevent duplicate approval events.
> 17. Test the full workflow in staging, including approval, rejection, expiration, multiple changes, price increases, credits, and historical document preservation.
>
> **Important:** Estimate revisions are allowed before customer acceptance. After acceptance, all contractual changes must use the Change Order workflow.

Effect:
- Once accepted, an estimate version never changes; Revise stays refused for an estimate with an accepted version (the PROPOSED refusal ESTIMATE_ACCEPTED is now decided). Revisions before acceptance remain allowed.
- Every change to the approved scope, price, materials or contractual schedule is a change order with the contents of item 3 ([[HH-CHG-01]]) and the 7-day validity ([[OWN-DEC-168]]); explicit customer approval comes before changed work or extra charges; an approved change order is kept as an immutable copy with its acceptance record.
- The job's current authorized scope, price and schedule are the original accepted estimate plus every approved change order; the original estimate and its approval receipt are never altered; a job may have several change orders with full history.
- Negative change orders document removed work or credits. Reading (PROPOSED, consistent with [[OWN-DEC-145]]): the credit is the change order's negative price adjustment shown in its totals; its lines stay above $0.00.
- A rejected or expired change order never cancels the job; resulting feasibility or safety issues are escalated for review. Routine appointment rescheduling uses the scheduling workflow unless it changes contractual obligations. Clerical errors found after acceptance use a documented correction or a change order, never a silent edit.
- The customer sees the original approved estimate, every approved change order and the current authorized total in the portal; sensitive approvals ask for fresh verification; duplicate approvals are prevented.
- Answers [[OQ-REVISE-ACCEPTED-ESTIMATE]]. Built by [[TSK-0081]] and [[TSK-0082]].
