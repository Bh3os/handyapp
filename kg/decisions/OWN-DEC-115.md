---
id: OWN-DEC-115
type: decision
title: Staff home action queue ordered by urgency; 1-hour target in business hours
status: active
area: staff
links:
  related: ["[[OWN-DEC-35]]", "[[OWN-DEC-68]]", "[[OWN-DEC-112]]", "[[OWN-DEC-116]]", "[[OWN-DEC-121]]", "[[HH-STAFF-04]]", "[[HH-STAFF-05]]", "[[HH-LEAD-01]]"]
  uses: ["[[FACT-RESPONSE-TARGET]]", "[[FACT-HOURS]]", "[[FACT-TIMEZONE]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
source: "owner-answers-verbatim 2026-10-12T19:16:01.591Z [S1 Home]; decision-briefs 2026-10-12T19:16:59"
---
Owner, 2026-10-12, staff journey S1, the staff home.

Question asked:
> Staff S1 - The staff home (action queue): after sign-in, office staff see one list of what needs action now, ordered by urgency: new requests (with the 1-hour response clock, 8 AM–10 PM), unverified contacts, customer replies, drafts waiting for release, reschedule/cancel requests, deposits and checks to verify, delivery failures, safety holds, quality reviews, overdue invoices. Each item has one main button. Workers see 'My day' instead. Owners also see an 'Owner decisions' section (waivers, refunds, deletion requests, overdue invoices). OK?

Owner wording:
> Yes. Make the staff home a clear, role-based action queue:
>
> - Prioritize safety issues, today’s appointment changes, overdue customer responses, and other time-sensitive actions. Then show remaining tasks by due time.
> - Include the listed request, verification, reply, message-draft, scheduling, payment, delivery, quality, and invoice tasks.
> - Each item shows project/customer reference, reason, assigned staff member, age or due time, and one clear action button. Provide filters by task type and assignee.
> - Calculate the 1-hour response target only during 8 AM–10 PM in the configured business time zone. Show remaining time or overdue status; pause outside those hours. It is an internal target, not a guaranteed customer promise.
> - Workers see **My Day:** assigned visits, address/access details, preparation, job readiness, and the next workflow action.
> - Owners also see **Owner Decisions:** deposit waivers, administrative exceptions, refunds, deletion requests, and unresolved overdue balances.
> - Avoid duplicate queue entries. Update or remove items when resolved, and refresh automatically without interrupting open forms.
> - Enforce role permissions on the server; sensitive incident and financial details remain restricted.
>
> Implement, test, and publish on private staging.

Effect:
- Order: safety issues, then today's appointment changes, then overdue customer responses and other time-sensitive actions, then everything else by due time.
- Item types: new requests, unverified contacts, customer replies, message drafts awaiting release, reschedule/cancel requests, deposits and checks to verify, delivery failures, safety holds, quality reviews, overdue invoices, plus those added by other modules (questions, Needs Linking, cases, availability conflicts).
- Each item shows the project/customer reference, reason, assigned staff member, age or due time and one action button; filters by type and assignee.
- The 1-hour response target counts only during 8 AM–10 PM in the business time zone ([[FACT-RESPONSE-TARGET]], [[FACT-TIMEZONE]]), shows remaining time or overdue, pauses outside those hours, and is labelled an internal target, never a customer promise. Its stop rule is in [[OWN-DEC-116]].
- Workers see My Day ([[OWN-DEC-121]]). Owners also see Owner Decisions: deposit waivers, administrative exceptions ([[OWN-DEC-68]]), refunds, deletion requests and unresolved overdue balances ([[OWN-DEC-112]]).
- No duplicate entries (providers keyed by subject); resolved items update or disappear; the list refreshes automatically without interrupting an open form.
- Roles are enforced on the server; sensitive incident and financial details stay restricted ([[RULE-SERVER-AUTHZ]]).

Links: uses [[FACT-RESPONSE-TARGET]], [[FACT-HOURS]], [[FACT-TIMEZONE]]; constrained by [[RULE-SERVER-AUTHZ]].
