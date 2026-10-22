---
id: OWN-DEC-209
type: decision
title: "Seven more automatic message templates approved (28 in all): verification code, question notice, estimate ready, invoice ready, not a fit, appointment changed, on the way"
status: active
area: messaging
links:
  constrained_by: ["[[RULE-NO-INVENTED-FACTS]]", "[[RULE-LANGUAGES]]"]
  uses: ["[[FACT-AUTOMATIC-MESSAGES]]", "[[ENT-Message]]", "[[ENT-OutboxEvent]]", "[[INT-Resend]]", "[[INT-Bird]]"]
  related: ["[[OWN-DEC-151]]", "[[OWN-DEC-152]]", "[[OWN-DEC-158]]", "[[OWN-DEC-150]]", "[[OWN-DEC-98]]", "[[OWN-DEC-102]]", "[[OWN-DEC-110]]", "[[OWN-DEC-100]]", "[[OWN-DEC-119]]", "[[OWN-DEC-107]]", "[[OWN-DEC-190]]", "[[OWN-DEC-162]]", "[[OQ-MESSAGES-OUTSIDE-THE-21]]", "[[HH-COM-13]]", "[[HH-COM-14]]", "[[TSK-0119]]", "[[TSK-0120]]"]
source: "owner answers 2026-10-22 R13-Q2; retained in R14"
---
Owner answer (round 13, question 2, "Seven more messages (verification code, question notice, estimate ready, invoice ready, not a fit, appointment changed, on the way)"), verbatim:

> Choose **Write them, approved**.
>
> I authorize you to finalize all seven additional HandyHub message templates without requiring separate Owner approval for each one.
>
> Follow the exact style, tone, branding, and privacy requirements established for the existing 21 templates.
>
> ### Requirements
> 1. Use the subject format **"HandyHub | [Message Purpose]"** for email.
> 2. Use a professional, natural, friendly American English tone.
> 3. Use **"Hi {customerFirstName},"** when a verified first name is available, otherwise **"Hi there,"**.
> 4. Sign standard emails **"The HandyHub Team"**.
> 5. Include the appropriate project or request reference number when useful.
> 6. Do not expose property addresses, prices, deposits, private job details, or internal staff information in message bodies.
> 7. Use authenticated secure portal links for sensitive documents or actions.
> 8. For verification codes, deliver the actual code only through the intended verified or authorized channel; never include project financial information.
> 9. Do not send a message until the corresponding event has actually occurred.
> 10. Prevent duplicate messages using reliable event handling and idempotency.
> 11. Respect the established customer notification preferences and SMS consent requirements.
> 12. Apply SMS quiet hours to nonurgent text messages.
> 13. Keep live SMS disabled until A2P 10DLC registration and required provider approvals are complete.
> 14. Keep customer-facing messages in English only.
> 15. Do not include marketing or promotional content in transactional messages.
>
> ### Message-specific requirements
> **Verification code:** Send only after a legitimate verification request. Use short-lived, single-use codes with rate limits. Never log the code.
> **Question notice:** Send only after an authorized staff member publishes the question.
> **Estimate ready:** Send only when the approved estimate version has been officially published.
> **Invoice ready:** Send only when the invoice has been officially issued. The customer should view the invoice securely in the portal.
> **Not a fit:** Send only after the request is formally declined by authorized staff. Use respectful, neutral language. Never imply a legal or safety conclusion that has not been verified.
> **Appointment changed:** Send only after the revised appointment is confirmed. Do not describe unconfirmed options as booked appointments.
> **On the way:** Send only when an assigned worker triggers the appropriate status for a confirmed visit. Avoid exposing worker location or other private information.
>
> ### Final implementation
> - Add the seven messages to the existing message registry.
> - Reuse existing templates and messaging infrastructure.
> - Avoid creating duplicate notifications where an existing template covers the same event.
> - Preserve the previously approved distinctions between automatic transactional notifications and staff-released personalized messages.
> - Test all templates, personalization variables, triggering conditions, secure links, and duplicate-prevention behavior.
> - Publish all seven validated templates to protected staging.
> - Mark their content as Owner-approved, but do not mark their delivery workflows as verified until tests pass.
> - Keep templates configurable by the Owner for future edits.
>
> Proceed with implementation and testing now without additional routine content approval requests.

Retained in round 14 (2026-10-22): "Seven additional professional HandyHub message templates".

Effect:
- Seven templates join the 21 of [[OWN-DEC-151]] in the one message registry, 28 in all: verification code ([[OWN-DEC-150]]), question notice ([[OWN-DEC-98]]), estimate ready ([[OWN-DEC-102]]), invoice ready ([[OWN-DEC-110]]), not a fit ([[OWN-DEC-100]]), appointment changed ([[OWN-DEC-119]]) and on the way ([[OWN-DEC-107]]). They reuse the existing message keys and infrastructure; where one of the 21 already covers an event, no second notification is created.
- The owner gave no wording: the implementing task writes each subject and body in the style, tone, branding and privacy rules of the 21 ("HandyHub | [Message Purpose]" subjects, "Hi {customerFirstName}," or "Hi there,", signed "The HandyHub Team", reference numbers where useful, no addresses, prices, deposits, private job details or internal staff information, authenticated portal links, no marketing), English only ([[OWN-DEC-162]]). Under the owner's authorization the content counts as Owner-approved once written; it states no business fact that the graph does not already hold ([[RULE-NO-INVENTED-FACTS]]). The Owner can edit each template later (a new template version).
- Each sends only after its event actually happened: a legitimate verification request (short-lived, single-use, rate-limited code, never logged, sent only through the intended verified or authorized channel, never with project financial information); an authorized staff member publishing the question; the approved estimate version officially published; the invoice officially issued (viewed in the portal); the request formally declined by authorized staff (respectful, neutral wording, no unverified legal or safety conclusion); the revised appointment confirmed (unconfirmed options never described as booked); the assigned worker triggering On my way for a confirmed visit (no worker location or private information).
- Idempotent events prevent duplicates; customer preferences and SMS consent apply; quiet hours apply to non-urgent texts; live texts stay off until A2P 10DLC approval ([[OWN-DEC-190]]). The split between automatic transactional notices and staff-released personalized messages stays ([[OWN-DEC-152]]).
- Delivery workflows are not marked verified until their tests pass; the templates are published to protected staging.
- Answers items 1 and 2 of [[OQ-MESSAGES-OUTSIDE-THE-21]]. Built by [[TSK-0119]] (templates, registry, tests) and [[TSK-0120]] (automatic delivery).
