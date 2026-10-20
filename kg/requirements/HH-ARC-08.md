---
id: HH-ARC-08
type: requirement
title: Business mutation and durable outbox event in the same transaction
status: active
priority: P0
area: platform
links:
  decided_by: ["[[OWN-DEC-95]]", "[[OWN-DEC-129]]", "[[OWN-DEC-60]]"]
  depends_on: ["[[HH-ARC-01]]"]
  uses: ["[[ENT-OutboxEvent]]", "[[INT-Bird]]", "[[INT-Resend]]"]
  tested_by: ["[[T12]]", "[[T65]]"]
source: "guide 3.3; OWN-DEC-95"
---
- Every important business change (request submitted, information requested, estimate published or approved, visit confirmed or changed, worker en route, work stopped, change order issued, QA completed, invoice issued, payment recorded, case opened) is written together with its outbox event in one database transaction. Either both commit or neither does.
- An outbox event holds its type, aggregate ID and version, a minimal payload (no secrets, codes or sensitive content) and its processing state.
- Sending happens afterwards, from the outbox. A failure of Bird, Resend or any other provider never erases or rolls back a valid request, acceptance, assignment or payment record; it becomes a visible delivery failure with a retry action for staff.
- Each customer-facing event has a unique outbox key, so a retried submission or approval never produces a second email or text (for example one receipt per request, [[OWN-DEC-95]]).

Cross-website effect of each event (guide 4.4):

| Event | Staff website | Customer website | Failure handling |
| --- | --- | --- | --- |
| Request submitted | New intake item and project | Receipt reference and next steps | Stored request remains even if the confirmation email fails |
| Information requested | Follow-up task linked to the project | Clear questions and a reply/upload action | Delivery failure becomes a staff exception |
| Estimate published | Sent revision locked against silent changes | Reviewable exact revision | Access may be reissued without republishing the price |
| Estimate approved | Acceptance evidence, job and scheduling task | Approved scope and "scheduling is next" | Retry returns the same acceptance and job |
| Visit confirmed | Committed capacity and assignment | Date, window, preparation | Notification failure never duplicates the booking |
| Visit rescheduled | Prior and new schedule history | Current committed visit and a change notice | Stale requests conflict rather than overwrite |
| Worker en route | Travel status and the arrival update | On-the-way notice with the window | No fabricated GPS or ETA |
| Work stopped | Hold, owner alert, timer and task handling | Appropriate delay and next-step summary | Internal hazard details stay restricted |
| Change order issued | Current proposed revision and approval state | Scope, price and time delta with a review action | An old or stale proposal cannot be accepted |
| QA completed | Quality evidence and invoice readiness | Completion, shared photos, care notes | Punch items stay visible to the right people |
| Invoice issued | Receivable and delivery status | Invoice, deposits and payments, balance | Provider outage gives a pending/retry state |
| Payment verified | Allocation and reconciliation record | Accurate receipt and payment state | Duplicates or reordering never double-credit |
| Complaint or case opened | Linked case with an action owner | Acknowledgment and relevant case updates | No automatic resolution, no lost punch items |
