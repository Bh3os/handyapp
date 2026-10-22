---
id: OWN-DEC-178
type: decision
title: "Phone verification: a separate SMS opt-in for verification codes offered on the receipt"
status: active
area: identity
links:
  uses: ["[[FACT-SESSION-TIMINGS]]", "[[INT-Bird]]"]
  related: ["[[OWN-DEC-96]]", "[[OWN-DEC-147]]", "[[HH-INT-13]]", "[[HH-INT-22]]"]
source: "owner answers 2026-10-21 R8-Q1"
---
Owner answer (round 8, question 1), option chosen "Offer opt-in on the receipt (Recommended)":

> Implement an optional phone-verification flow on HandyHub's request receipt page.
>
> Requirements:
>
> 1. If the customer has not opted into SMS, offer a separate, unchecked checkbox allowing them to consent to SMS verification codes.
> 2. Display all required SMS disclosures, including HandyHub's identity, message purpose, message frequency, potential charges, STOP/HELP instructions, and links to the Privacy Policy and Terms of Service.
> 3. Do not send an SMS verification code until the required consent has been recorded.
> 4. Keep verification-code consent separate from marketing consent. Never automatically enroll customers in promotional messages.
> 5. Record the phone number, consent purpose, disclosure version, timestamp, and relevant consent evidence securely.
> 6. Send a time-limited, single-use verification code through the approved SMS provider.
> 7. Apply rate limits, retry limits, code expiration, and abuse protection.
> 8. Mark the phone number as verified only after successful code validation.
> 9. If the customer declines SMS consent, leave the phone unverified and allow email verification without blocking the service request.
> 10. Respect SMS opt-outs and prevent unauthorized sending.
> 11. Add the receipt-page opt-in mechanism to the A2P 10DLC registration documentation.
> 12. Keep live SMS disabled until the applicable registration and provider requirements are satisfied.
> 13. Test consent, verification, expired codes, incorrect codes, opt-outs, rate limiting, and email fallback in private staging.
>
> Do not treat a verified phone number as automatic permission to send unrelated SMS messages.
>
> Use the existing HandyHub messaging system rather than creating a separate verification service.

Effect:
- Option (b) of [[OQ-PHONE-VERIFY-SMS-OPT-IN]]: when the customer has no SMS opt-in, the receipt offers a separate, unchecked checkbox for SMS verification codes with the required disclosures (business identity, purpose, frequency, possible charges, STOP and HELP, links to the Privacy Policy and Terms), worded as in [[OWN-DEC-190]] (opt-in point B).
- No code is texted before that consent is recorded; it is separate from marketing consent and never enrolls the customer in promotions. The record holds the phone number, purpose, disclosure version, time and evidence ([[ENT-ConsentPreference]]).
- The code is time-limited and single-use, sent through the approved provider ([[INT-Bird]]) with rate, retry, expiry and abuse limits ([[FACT-SESSION-TIMINGS]]); the phone is verified only after a correct code.
- Declining leaves the phone unverified, offers email verification and never blocks the request. Opt-outs are honoured; a verified phone is never permission for unrelated texts.
- The receipt opt-in is added to the A2P 10DLC documentation; live texting stays off until registration is approved. The existing messaging system is reused.
- Reading: the receipt checkbox applies to the number being verified; changing the phone on the receipt is still not offered (staff correct it).
- Answers [[OQ-PHONE-VERIFY-SMS-OPT-IN]]. Built by [[TSK-0134]].
