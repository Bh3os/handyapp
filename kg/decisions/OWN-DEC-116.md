---
id: OWN-DEC-116
type: decision
title: New request handling; what stops the response clock
status: active
area: intake
links:
  related: ["[[OWN-DEC-98]]", "[[OWN-DEC-99]]", "[[OWN-DEC-100]]", "[[OWN-DEC-102]]", "[[OWN-DEC-115]]", "[[OWN-DEC-117]]", "[[HH-LEAD-01]]", "[[HH-LEAD-02]]", "[[HH-ID-01]]", "[[HH-ID-02]]", "[[HH-CRM-04]]"]
  uses: ["[[FACT-RESPONSE-TARGET]]", "[[ENT-Request]]"]
source: "owner-answers-verbatim 2026-10-12T19:16:01.591Z [S2 Request]; decision-briefs 2026-10-12T19:16:59"
---
Owner, 2026-10-12, staff journey S2, handling a new request.

Question asked:
> Staff S2 - Handling a new request: staff open it and see everything the customer sent, the coverage result, the contact verification badge and possible duplicates (same contact or address, shown to staff only). They then (a) link it to an existing customer/property or create new ones, (b) assign an owner of the request, (c) choose: ask a question, estimate online, site visit needed, or not a fit. The first staff response stops the 1-hour clock. OK?

Owner wording:
> Yes, with these refinements:
>
> - Show the original request: selected services, answers, description, full address, timing preferences, photos/upload status, coverage result, and separate email/phone verification badges.
> - Show possible duplicate customers/properties to authorized staff only. Matching contact details or an address is a suggestion—not proof of identity.
> - Let staff link verified matching records or create new ones. Preserve the original request/project and history; never automatically merge records or grant access to earlier projects.
> - Assign one responsible staff member, with reassignment recorded.
> - Offer clear actions: **Ask a Question, Prepare Online Estimate, Arrange Estimate Visit, or Not a Fit.** Keep internal notes separate from customer-visible messages.
> - Stop the 1-hour response clock only after a meaningful staff response is successfully sent or a completed customer conversation is recorded. Opening, assigning, drafting, or sending the automatic receipt does not stop it.
> - Failed response delivery remains an action item. Show the next step, responsible person, and follow-up due time.
> - Preserve decisions, messages, links, and timestamps in the project history.
>
> Implement, test, and publish on private staging.

Effect:
- The request view shows the original submission: services, answers, description, full address, timing preferences, photos with upload status, coverage result and separate email/phone verification badges.
- Possible duplicate customers or properties show to authorized staff only, labelled as suggestions, never as proof of identity.
- Staff link verified matching records or create new ones; the original request, project and history are kept; records are never merged automatically and linking never grants access to earlier projects ([[OWN-DEC-117]]).
- Exactly one responsible staff member; reassignments are recorded.
- Actions: Ask a Question ([[OWN-DEC-98]]), Prepare Online Estimate ([[OWN-DEC-102]]), Arrange Estimate Visit ([[OWN-DEC-99]]), Not a Fit ([[OWN-DEC-100]]). Internal notes are separate from customer-visible messages.
- The 1-hour clock ([[FACT-RESPONSE-TARGET]]) stops only when a meaningful staff response is successfully sent or a completed customer conversation is recorded (for example a logged call with an outcome). Opening, assigning, drafting or the automatic receipt never stop it; a failed delivery stays an action item.
- The next step, responsible person and follow-up due time are shown; decisions, messages, links and timestamps stay in project history.

Links: uses [[FACT-RESPONSE-TARGET]], [[ENT-Request]].
