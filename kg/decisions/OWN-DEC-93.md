---
id: OWN-DEC-93
type: decision
title: Contact and send: name, email and phone required; one request per send
status: active
area: intake
links:
  related: ["[[OWN-DEC-61]]", "[[OWN-DEC-72]]", "[[OWN-DEC-94]]", "[[HH-INT-03]]", "[[HH-INT-08]]", "[[HH-INT-09]]", "[[HH-INT-10]]", "[[HH-INT-11]]", "[[HH-PRIV-02]]"]
source: "owner-answers-verbatim 2026-10-12T18:31:16.913Z [2.4 Send]; decision-briefs 2026-10-12T18:31:38"
---
Owner, 2026-10-12, journey Step 2.4, contact and send.

Question asked:
> Step 2.4 - Contact and send: name, email AND phone required; how they prefer we contact them; remote or site-visit estimate preference; a review page with 'Edit' for each part, the privacy notice link (its version is saved with the request); Send. Pressing Send twice still creates one request; errors show next to each field and nothing typed is lost; a half-filled form is kept if they leave the page. OK?

Owner wording:
> Yes, with these refinements:
>
> - Require name, email, and phone. Prefill verified account details when available and let customers correct them.
> - Offer preferred contact by email, phone call, or text. Keep marketing permission separate.
> - Offer Online Estimate, Site Visit, or “Let HandyHub decide.” Explain that staff confirm the appropriate approach after review.
> - Show a final summary of services, answers, photos, full property address, timing, and contact details. Each section has an Edit action that preserves everything else.
> - Link the privacy notice and save the exact version presented with the request.
> - Use “Send Estimate Request.” Double taps and retries after a connection failure must create only one request.
> - Show field-specific errors and retain all entered details and successful uploads.
> - Temporarily save unfinished text drafts in the same browser. Offer Resume and Clear Draft, expire old drafts, and clear them after successful submission. Do not retain passwords, verification codes, or payment information.
> - After successful submission, show the request reference and next steps. Explain that the request is received, not a confirmed appointment. Contact verification must not require creating an account.
>
> Implement, test, and publish this on private staging using test email/text destinations.

Effect:
- Name, email and phone are all required ([[OWN-DEC-61]]); verified account details are prefilled and editable.
- Preferred contact: email, phone call or text. Marketing permission is a separate choice with its own consent record ([[HH-PRIV-02]]).
- Estimate preference: Online Estimate, Site Visit or "Let HandyHub decide", with the note that staff confirm the approach after review ([[OWN-DEC-99]]).
- A final summary shows services, answers, photos, full address, timing and contact details; each section has Edit, which keeps everything else.
- The privacy notice is linked and the exact version shown is saved with the request ([[OWN-DEC-72]]).
- The button reads "Send Estimate Request". Double taps and retries after a connection failure create exactly one request (idempotency key and one database transaction).
- Errors appear next to each field; all entries and successful uploads are kept.
- Unfinished text is saved as a draft in the same browser with Resume and Clear Draft; old drafts expire and the draft is cleared after a successful send. Passwords, verification codes and payment information are never stored in it.
- After a successful send the receipt shows the reference and next steps ([[OWN-DEC-94]]) and says the request is received, not a confirmed appointment. Contact verification never requires an account ([[OWN-DEC-96]]).
