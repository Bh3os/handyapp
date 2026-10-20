---
id: HH-OPS-01
type: requirement
title: Role-based action queue as the staff home, with My Day for workers and Owner Decisions for the owner
status: active
priority: P0
area: ops
links:
  decided_by: ["[[OWN-DEC-115]]", "[[OWN-DEC-116]]", "[[OWN-DEC-120]]", "[[OWN-DEC-121]]", "[[OWN-DEC-123]]", "[[OWN-DEC-124]]", "[[OWN-DEC-101]]", "[[OWN-DEC-107]]", "[[OWN-DEC-134]]"]
  depends_on: ["[[HH-LEAD-05]]", "[[HH-OFF-09]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[ENT-QueueItem]]", "[[FACT-RESPONSE-TARGET]]"]
  part_of: ["[[S01]]"]
  related: ["[[HH-STAFF-06]]"]
source: "guide 11.1; OWN-DEC-115"
---
The staff home is an action list, not only charts.

Order: safety issues first, then today's appointment changes, then overdue customer responses and other time-sensitive actions, then everything else by due time.

Item types (an extensible registry: each module contributes item providers keyed by subject):
- new requests (with the 1-hour response clock) and unverified contacts;
- customer replies, inbox items needing linking, message drafts awaiting release ([[OWN-DEC-120]]);
- overdue follow-ups and unanswered-question reminders;
- pending estimates and accepted work not yet scheduled;
- reschedule and cancellation requests;
- deposits and checks to verify;
- tomorrow's readiness and blocked jobs; safety holds;
- quality reviews, punch items and cases ([[OWN-DEC-124]]);
- unpaid and overdue invoices;
- failed messages, delivery failures and integration failures;
- upcoming assignments of a disabled account, to reassign ([[OWN-DEC-123]]); appointments flagged by an availability change.

New-request items show the remaining time or "overdue" of the first-response clock, whose counting and stop rules are [[HH-LEAD-05]]; it is labelled an internal target, never a customer promise.

Role views:
- Owner and Office/Dispatcher: the full queue within their permissions, with filters by item type and assignee.
- Workers: My Day instead ([[HH-OFF-09]]).
- Owner, additionally: Owner Decisions (deposit waivers, administrative Start Work exceptions, refunds and cancellation outcomes, deletion requests, "Overdue—owner decision" invoices ([[HH-FIN-19]]), damage, injury and dispute notifications ([[HH-INC-04]])).

Items are idempotent per subject (no duplicates), update or disappear when resolved, and refresh automatically without interrupting open forms: no remount, focus and input preserved (for example a "N new items — refresh" badge or in-place updates outside the edited item, [[HH-ARC-10]]). Item fields, search and masking are [[HH-OPS-02]].
