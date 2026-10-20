---
id: OWN-DEC-95
type: decision
title: Receipt email sends automatically; automatic-message exceptions begin
status: active
area: messaging
links:
  supersedes: ["[[OWN-DEC-41]]"]
  related: ["[[OWN-DEC-65]]", "[[OWN-DEC-94]]", "[[HH-COM-04]]", "[[HH-AUTO-01]]", "[[HH-INT-10]]", "[[HH-INT-12]]"]
  uses: ["[[FACT-AUTOMATIC-MESSAGES]]", "[[FACT-RESPONSE-TARGET]]", "[[INT-Resend]]", "[[INT-Bird]]"]
source: "owner-answers-verbatim 2026-10-12T18:42:00.779Z [3.2 Email]; decision-briefs 2026-10-12T18:43:44"
---
Owner, 2026-10-12, journey Step 3.2, confirmation email.

Question asked:
> Step 3.2 - Confirmation email: a receipt email (reference, summary, next steps) is prepared as a DRAFT and a staff member releases it (your rule: staff release each email). If you prefer, the receipt email could send automatically like codes and links do. Which?

Owner wording:
> Send the confirmation email automatically after the request is successfully saved.
>
> Include the actual request reference, selected services, a brief summary, next steps, and secure instructions for viewing the request. Keep it English and make account creation optional.
>
> Explain that pricing and the appointment are confirmed separately. Use the approved response-hours wording.
>
> Send one receipt per request. Double submissions or retries must not create duplicate requests or emails. If delivery fails, keep the request saved and show staff a delivery issue with a retry action.
>
> Only receipts, verification codes, and access links send automatically. Other customer messages and follow-ups remain drafts for staff release.
>
> On staging, send only to approved test destinations.

Effect:
- Amends the staff-release rule of [[OWN-DEC-65]] (every customer email a staff-released draft) and ends the "no automatic drafts or sends" state of [[OWN-DEC-41]]: the request receipt now sends automatically once the request is saved. Verification codes and access links already sent immediately. Every other customer message stays a staff-released draft unless a later decision adds it to the automatic list ([[FACT-AUTOMATIC-MESSAGES]]).
- Content: the actual reference, selected services, a brief summary, next steps, secure instructions for viewing the request, account creation as optional, pricing and appointment confirmed separately, and the [[FACT-RESPONSE-TARGET]] wording. English.
- Exactly one receipt per request: double submissions and retries create no duplicate request or email (submission idempotency key plus a unique outbox key per request).
- If delivery fails the request stays saved and staff see a delivery issue with a Retry action ([[OWN-DEC-115]]).
- Email goes through [[INT-Resend]]; texts through [[INT-Bird]] ([[OWN-DEC-129]]). On staging only approved test destinations receive messages.
- The decision-briefs summary calls the amended rule "OWN-DEC-77"; in the vault log the staff-release rule is [[OWN-DEC-65]] (with [[OWN-DEC-41]]) and OWN-DEC-77 is the job-reopen rule.

Links: supersedes [[OWN-DEC-41]]; uses [[FACT-AUTOMATIC-MESSAGES]], [[FACT-RESPONSE-TARGET]], [[INT-Resend]], [[INT-Bird]].
