---
id: OQ-PHONE-OPT-IN-DETAILS
type: question
title: The receipt's phone-verification opt-in details no decision gives
status: open
area: identity
links:
  related: ["[[OWN-DEC-178]]", "[[OWN-DEC-190]]", "[[OWN-DEC-207]]", "[[HH-INT-13]]", "[[HH-INT-22]]", "[[HH-COM-05]]", "[[HH-COM-12]]", "[[ENT-ConsentPreference]]", "[[OQ-ATTORNEY-PRIVACY]]", "[[TSK-0134]]", "[[TSK-0133]]"]
source: "TSK-0134 (2026-10-26): OWN-DEC-178 and OWN-DEC-190 give the flow and the wording; the details below are PROPOSED"
---
**Question:** does the owner approve, or change, these PROPOSED details of the consent to a one-time verification code by text on the request receipt?

- **Who answers:** the owner; the wording also goes to the attorney with [[OQ-ATTORNEY-PRIVACY]].
- **Decided, in use ([[OWN-DEC-178]], [[OWN-DEC-190]]):** when the request has no current SMS opt-in, the receipt's phone row shows a separate, unchecked checkbox labelled "I agree to receive a one-time SMS verification code from HandyHub at the phone number provided.", with "Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for assistance. Consent is not required to purchase services." beside it and links to the Privacy Policy and the SMS Terms. Agreeing records a consent of its own purpose (verification codes by text: the number, the disclosure version `sms-verification-disclosure-1`, the time and evidence) before any code can be asked for; it is never the SMS opt-in and never marketing. The code uses the existing message, code lifetime and limits. Declining leaves the phone unverified, the email verification works as before and the request is never blocked. Live texts stay off until A2P 10DLC (`sms.live_delivery`).
- **PROPOSED, in use on private staging:**
  - **Separate consent purpose.** The consent is the purpose `sms_verification` with the source `receipt` (migration 0111). It permits the verification code message (`contact.verification_code`) alone; every other text still needs the SMS opt-in, and marketing its own permission. A phone verified this way is not offered for account sign-in codes, which still need the SMS opt-in.
  - **Opt-outs.** STOP, and an opt-out staff record for the customer, withdraw it together with the SMS opt-in; a code already queued is then not sent. Checking the box again on the receipt after a STOP is a new, explicit consent for the code alone and is honoured; START restores the SMS opt-in as before.
  - **Per request and number.** The receipt reads only the consent its own request recorded for the current number, never another request's for the same number; a corrected number needs its own consent. Agreeing again while the consent is current records nothing new. A request whose own SMS opt-in is current is not offered the box.
  - **Evidence.** The request ID and reference, the receipt capability ID and the HTTP request ID; no IP address, browser data or token is kept.
  - **Links.** The Website Terms are linked as well, reading "Terms of Service" of [[OWN-DEC-178]] item 2 as the Website Terms; [[OWN-DEC-190]] names the Privacy Policy and the SMS Terms.
  - **Limits.** The existing code limits apply (lifetime, attempts, resend cooldown, per-number and per-network limits); the consent itself is limited to 30 per network an hour, like code sends.
  - **Live texts off.** The box is offered whatever `sms.live_delivery` says: staging delivers to the log sender and approved test numbers. Before production texting, either the registration is approved or the box should be hidden while live texts are off; until then a production code would fail visibly (`sms_disabled`).
  - **Customer text around the box.** The legend "Verification code by text (optional)", the line above it, the message when the box is not checked and the note after agreeing are written for this build (customer catalog, `request.verify.smsConsent.*`).
  - **A2P 10DLC documentation.** The receipt page is opt-in point B of the registration package ([[TSK-0133]], OWN-DEC-178 item 11); that package lists it with its staging URL and screenshot.
- **Until answered:** the PROPOSED details above are used; each is a small change to the nodes or the code.
