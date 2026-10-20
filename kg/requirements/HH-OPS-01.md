---
id: HH-OPS-01
type: requirement
title: Role-based action queue as the staff home, with My Day for workers and Owner Decisions for the owner
status: active
priority: P0
area: ops
links:
  decided_by: ["[[OWN-DEC-115]]", "[[OWN-DEC-116]]", "[[OWN-DEC-120]]", "[[OWN-DEC-121]]", "[[OWN-DEC-123]]", "[[OWN-DEC-124]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[FACT-HOURS]]", "[[FACT-TIMEZONE]]", "[[FACT-RESPONSE-TARGET]]"]
  part_of: ["[[S01]]"]
source: "guide 11.1; OWN-DEC-115"
---
The staff home is an action list, not only charts.

Order: safety issues first, then today's appointment changes, then overdue customer responses and other time-sensitive actions, then everything else by due time.

Item types (each module contributes its items):
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

The 1-hour response clock ([[FACT-RESPONSE-TARGET]]) counts only during business hours ([[FACT-HOURS]]) in the business time zone ([[FACT-TIMEZONE]]), pauses outside them, and shows the remaining time or "overdue". It is labeled an internal target, never a customer promise. It stops only when a meaningful staff response is successfully sent or a completed customer conversation is recorded; opening, assigning, drafting or the automatic receipt never stop it, and a failed response delivery stays an action item ([[OWN-DEC-116]]).

Role views:
- Owner and Office/Dispatcher: the full queue within their permissions, with filters by item type and assignee.
- Workers: My Day instead (today's assigned visits in order with arrival window, address, directions link, access notes, preparation, readiness and the next workflow action, [[OWN-DEC-121]]).
- Owner, additionally: Owner Decisions (deposit waivers, administrative Start Work exceptions, refunds, deletion requests, unresolved overdue balances).

Items are idempotent per subject (no duplicates), update or disappear when resolved, and refresh automatically without interrupting open forms ([[HH-ARC-10]]). Sensitive incident and financial details are shown only to permitted roles.
