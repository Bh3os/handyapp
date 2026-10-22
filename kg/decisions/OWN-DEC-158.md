---
id: OWN-DEC-158
type: decision
title: "Messages may show the customer's first name and reference numbers; never amounts, addresses, codes or tokens"
status: active
area: messaging
links:
  related: ["[[FACT-AUTOMATIC-MESSAGES]]", "[[HH-COM-04]]", "[[HH-COM-13]]"]
source: "owner answers 2026-10-21 R2-Q4"
---
Question asked (round 2, question 4): "Your messages include the customer's name and reference numbers (request, estimate, invoice, receipt). The earlier rule kept all personal details out of emails. Is it OK to show the customer's first name and these reference numbers in the email body?"

Owner answer:

> Choose **Yes, name and numbers**.
>
> Apply the following privacy rules consistently across all HandyHub customer and staff notification templates:
>
> 1. Use the customer's first name only in greetings.
> 2. Include non-sensitive request, estimate, job, visit, invoice, and receipt reference numbers where relevant.
> 3. Never include payment amounts, property addresses, access codes, authentication tokens, private project details, or other sensitive information in email subjects or bodies.
> 4. Keep sensitive information and documents behind authenticated or short-lived secure project links.
> 5. Never expose access tokens in message previews, delivery logs, or analytics.
> 6. Use "Hi there," when the customer's first name is unavailable.
> 7. Ensure reference numbers are non-sensitive identifiers that cannot be used alone to access project information.
> 8. Apply these rules to all existing and future templates.
> 9. Update any previously drafted templates that conflict with these privacy requirements.
> 10. Test all message templates in staging before enabling production delivery.
>
> Preserve the professional HandyHub email style and existing approval requirements.

Effect:
- Subjects and bodies may contain the customer's first name (greeting only) and non-sensitive request, estimate, job, visit, invoice and receipt reference numbers where relevant.
- Never in a subject or body: payment amounts, property addresses, access codes, authentication tokens, private project details or other sensitive information. Those stay behind authenticated or short-lived secure links; tokens never appear in previews, delivery logs or analytics.
- Greeting fallback "Hi there," when the first name is unavailable.
- Reference numbers are non-sensitive identifiers that alone open nothing ([[HH-ID-04]], [[HH-INT-13]]).
- Applies to every existing and future template; conflicting drafts are updated. It replaces the "no private details" rule of [[FACT-AUTOMATIC-MESSAGES]] as far as first names and reference numbers go.
- MESSAGE 10 shows `{serviceName}` only when it can be displayed safely; MESSAGE 19 sends the staff text itself, or a generic new-message notice when the text cannot safely be emailed.
