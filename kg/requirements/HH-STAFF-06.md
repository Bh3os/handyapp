---
id: HH-STAFF-06
type: requirement
title: Role-based staff home action queue with urgency ordering and Owner Decisions
status: active
priority: P0
area: staff
links:
  decided_by: ["[[OWN-DEC-115]]", "[[OWN-DEC-101]]", "[[OWN-DEC-107]]", "[[OWN-DEC-120]]", "[[OWN-DEC-123]]"]
  depends_on: ["[[HH-OPS-01]]", "[[HH-OPS-02]]", "[[HH-LEAD-05]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]", "[[RULE-LANGUAGES]]"]
  uses: ["[[ENT-QueueItem]]", "[[ENT-StaffUser]]", "[[FACT-HOURS]]", "[[FACT-TIMEZONE]]", "[[FACT-RESPONSE-TARGET]]"]
  part_of: ["[[S01]]"]
source: "OWN-DEC-115 (extends HH-OPS-01 and HH-OPS-02)"
---
After sign-in, office staff see one role-based list of what needs action now. It extends the action-queue home of [[HH-OPS-01]].

Ordering:
1. Safety issues.
2. Today's appointment changes.
3. Overdue customer responses and other time-sensitive actions.
4. All remaining tasks by due time.

Item types: new requests, unverified contacts, customer replies, message drafts awaiting release (including reminder drafts), reschedule and cancellation requests, deposits and checks to verify, delivery failures, safety holds, quality reviews, overdue invoices, inbox items needing linking, flagged assignments of disabled staff, and items contributed by other modules. The queue is an extensible registry: each module contributes item providers keyed by subject.

Each item shows the project or customer reference, the reason, the assigned staff member, age or due time, and one clear action button. Filters by task type and assignee.

Response target: new-request items show remaining time or overdue status for the first-response target ([[HH-LEAD-05]]). It is labelled as an internal target, never a customer promise.

Roles:
- Workers see **My Day** instead (assigned visits, address and access details, preparation, readiness, next workflow action).
- Owners also see **Owner Decisions**: deposit waivers, Start Work administrative exceptions, refunds, deletion requests and unresolved overdue balances.
- Sensitive incident and financial details stay restricted to permitted roles; the server enforces the role on every item.

Behaviour:
- No duplicate entries for the same subject. Items update or disappear when resolved.
- The list refreshes automatically without interrupting open forms: no remount, focus and input preserved (for example a "N new items — refresh" badge or in-place updates outside the edited item).
