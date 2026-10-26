---
id: OQ-10DLC-PACKAGE-DETAILS
type: question
title: The A2P 10DLC registration package details no decision gives
status: open
area: messaging
links:
  related: ["[[OWN-DEC-190]]", "[[OWN-DEC-178]]", "[[OWN-DEC-129]]", "[[OQ-BIRD-10DLC]]", "[[HH-COM-12]]", "[[HH-INT-22]]", "[[INT-Bird]]", "[[FACT-PUBLIC-CONTACT]]", "[[FACT-LEGAL-ENTITY]]", "[[OQ-ATTORNEY-PRIVACY]]", "[[OQ-LEGAL-ENTITY-NAME]]", "[[OQ-PHONE-OPT-IN-DETAILS]]", "[[TSK-0133]]"]
source: "TSK-0133 (2026-10-26): OWN-DEC-190 asks for the complete package; the choices below are PROPOSED. Bird field lists read from Bird's registry requirement forms and its guide 10DLC registration on 2026-10-26."
---
**Question:** does the owner approve, or change, these PROPOSED details of the A2P 10DLC registration package (`docs/10dlc/registration.md`) and of the consent texts built with it?

- **Who answers:** the owner. The consent wording and the SMS Terms also go to the attorney ([[OQ-ATTORNEY-PRIVACY]], attorney packet A-12).
- **Decided, in use ([[OWN-DEC-190]]):** the request form's SMS opt-in is opt-in point A, word for word: the label and the disclosure beside it, with links to the Privacy Policy and the SMS Terms (legal text `sms-disclosure-2`, migration 0126). The receipt is opt-in point B ([[OWN-DEC-178]], `sms-verification-disclosure-1`). The STOP, START and HELP replies are the owner's samples (`KEYWORD_REPLIES`). The HELP reply needs the real support contact, so `sms.help_reply` stays NOT CONFIGURED ([[FACT-PUBLIC-CONTACT]]). Nothing was submitted to Bird, no fee was paid, and live texts stay off.
- **PROPOSED, in the package:**
  - **One campaign.** One `mixed` campaign with the sub-use-cases `two_factor_authentication`, `account_notification` and `customer_care`, on the one business number ([[OWN-DEC-129]]). Alternative: a `two_factor_authentication` campaign and an `account_notification` campaign. That needs two numbers and two sets of fees. Bird fixes the use case at registration.
  - **Industry.** `construction`. Bird's list has no home-services entry.
  - **Texts written for the form.** The campaign name "HandyHub service texts", the campaign description and the message-flow text.
  - **Samples.** The four released text templates (verification code, estimate ready, question notice, invoice ready), filled in with the registry's preview values and the production origin. The owner's other samples belong to messages that are email only (request received) or have no released text wording yet (appointment options, confirmation and reminder). They are not submitted until text versions in the owner-sample wording are released. Should those versions be released before submission?
  - **Keyword lists.** Bird takes at most five words per list. Opt-out: STOP, STOPALL, UNSUBSCRIBE, CANCEL, END. Help: HELP, INFO. Opt-in: START. The app also honours QUIT, OPTOUT, REVOKE and UNSTOP.
  - **Attachments.** The two opt-in screenshots, and a PDF of the SMS Terms.
- **PROPOSED, in the consent texts (migration 0126):**
  - **Support contact beside the request-form box.** The opt-in keeps version 1's "Support contact:" line and the configured public contact (a placeholder now), because [[HH-INT-22]] asks for the support contact beside the box. The receipt's box (point B) has no such line.
  - **SMS Terms version 2 (`sms-terms-2`).** A sentence on the receipt's separate consent to a one-time verification code. A message list that follows the message registry: the three routine reminders are now automatic, and the deposit invoice, proposed change, job complete, visit cancelled, work-appointment options, estimate answer and sign-in email notices are added. The email-only messages are dropped: the request receipt, the payment receipt and the unpaid-invoice reminders. A sentence on the Owner-released work-paused notice is added.
- **Open points the package found:**
  - **No confirmation text after a web opt-in.** The app sends no text when the box is checked. The owner's opt-in confirmation sample is used as Bird's START reply only. Should a confirmation text also follow the checkbox once live texts are on?
  - **Privacy policy.** `privacy-notice-1` says texts are sent only after the SMS box on the request form. Since [[OWN-DEC-178]], the receipt's consent also allows the verification code. The next privacy version should say so (with the rows HANDOFF lists for it).
  - **Staff alert texts.** Urgent field alerts to the Owner (`staff_notice.urgent_field_alert`) are texts from the same Bird number, outside the customer campaign. Should the campaign description mention them, or should they use another sender?
- **Until answered:** the PROPOSED details above stay in the package and on staging. Nothing is submitted until the Owner enters the registration in Bird ([[OQ-BIRD-10DLC]]).
