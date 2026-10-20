---
id: OWN-DEC-96
type: decision
title: Contact verification after submission, email and phone tracked separately
status: active
area: identity
links:
  related: ["[[OWN-DEC-63]]", "[[OWN-DEC-97]]", "[[HH-INT-13]]", "[[HH-ID-02]]", "[[HH-ID-03]]", "[[HH-ID-06]]", "[[HH-ID-07]]", "[[HH-INT-11]]"]
  uses: ["[[FACT-AUTOMATIC-MESSAGES]]"]
source: "owner-answers-verbatim 2026-10-12T18:42:00.779Z [3.3 Verify]; decision-briefs 2026-10-12T18:43:44"
---
Owner, 2026-10-12, journey Step 3.3, verifying the contact.

Question asked:
> Step 3.3 - Verifying the contact: the request is marked 'contact unverified' until the customer proves the email or phone is theirs (one-time code from the receipt page, email or text). No account is needed. Staff see the badge; unverified requests still get reviewed. OK?

Owner wording:
> Yes. Accept and save the request immediately, marked “Contact unverified.” Staff can review it while verification is pending.
>
> - Let guests verify by a one-time code sent to their submitted email or phone, without creating an account.
> - Track email and phone verification separately. Verifying one must not mark both verified.
> - On the receipt page, show the masked destination, code entry, Resend, and Change Contact options. Changing a contact requires verification of the new value.
> - Make codes expire, limit attempts/resends, and preserve the request if delivery fails or the customer leaves.
> - Use verified contact ownership before granting private project access or allowing estimate/change-order approval. A reference number alone grants no access.
> - Never reveal previous projects merely because someone submits a matching email or phone.
>
> Codes send automatically; staging uses approved test destinations. Implement, test, and publish this flow on private staging.

Effect:
- The request is accepted and saved at once with the state "Contact unverified"; staff can review it while verification is pending.
- A guest verifies with a one-time code sent automatically to the submitted email or phone, without an account. Email and phone verification are separate flags; verifying one never marks both.
- The receipt shows the masked destination, code entry, Resend and Change Contact; a changed contact needs its own verification.
- Codes expire and attempts and resends are limited (launch defaults per [[HH-ID-06]], [[OQ-SESSION-EXPIRY]]); the request is kept if delivery fails or the customer leaves.
- Verified contact ownership is required before private project access and before approving an estimate or change order ([[OWN-DEC-103]], [[OWN-DEC-108]]). A reference number alone grants no access, and a matching email or phone never reveals earlier projects.

Links: uses [[FACT-AUTOMATIC-MESSAGES]].
