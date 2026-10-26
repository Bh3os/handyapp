# A2P 10DLC registration package (Bird)

Prepared by TSK-0133 on 2026-10-26 under OWN-DEC-190 and OWN-DEC-178. This is the Brand and Campaign registration for
HandyHub's business texts, ready for the Owner to enter in Bird.

**Status: prepared, not submitted.** Nothing was sent to Bird, The Campaign Registry or a carrier. No fee was paid and
no business statement was made for HandyHub. Live texts stay off (`sms.live_delivery` is `{"enabled": false}`) until
the registration and the number link are approved (OWN-DEC-190). The Bird field list below comes from Bird's own
registry requirement forms (read-only, read 2026-10-26: brand form for `private_profit`; campaign forms for
`account_notification`, `two_factor_authentication` and `mixed`) and from Bird's guide "10DLC registration"
(bird.com/docs/guides/sms/10dlc).

Rules for this file (RULE-NO-INVENTED-FACTS, OWN-DEC-190):

- The EIN, the registered address and the authorized contact are never written here. The Owner types them into Bird's
  secure fields. Fields with no known value say **NOT CONFIGURED**.
- Text in quotes is either the owner's wording (OWN-DEC-190, OWN-DEC-178, OWN-DEC-150), the live wording of the site
  (the customer catalog), or a released message template. A unit test and an integration test check that each quote
  still matches its source (`apps/server/test/unit/tendlc-package.test.ts`,
  `apps/server/test/integration/tendlc-package.test.ts`).
- Choices no decision makes are marked **PROPOSED**. They are listed for the Owner in `OQ-10DLC-PACKAGE-DETAILS`.

## 1. Blockers before submission

| Blocker | Why it blocks | Node |
| --- | --- | --- |
| The domain handyhub247.com is not purchased | The registry visits the brand website, and the opt-in pages must be live on it | OWN-DEC-184, FACT-DOMAIN |
| The public support phone and email are placeholders | Bird needs a reachable contact phone and email. The HELP reply needs `{verifiedSupportContact}` | FACT-PUBLIC-CONTACT, OWN-DEC-131 |
| "Handyhub LLC" on documents vs ODD JOBS & MORE LLC in the registration | The brand must be clearly connected to one legal name | OQ-LEGAL-ENTITY-NAME |
| Attorney review of the consent wording, the SMS Terms and the privacy policy | The wording is a draft until reviewed (attorney packet A-12, A-13) | OQ-ATTORNEY-PRIVACY |
| The PROPOSED choices in this package | Campaign type, samples and keyword lists are the Owner's to confirm | OQ-10DLC-PACKAGE-DETAILS |

## 2. Provider

Bird is the integrated and intended SMS provider (OWN-DEC-129, INT-Bird). The earlier Telnyx references are superseded
(OWN-DEC-190). There is one provider and one business number. Email stays on Resend and does not depend on SMS.

## 3. Brand

Bird's brand form for a private company, field by field.

| Bird field | Value | Source |
| --- | --- | --- |
| Legal entity type (`business_entity_type`) | `private_profit` (an LLC, privately held) | OWN-DEC-190, FACT-LEGAL-ENTITY |
| Brand name (`business_display_name`) | HandyHub | FACT-LEGAL-ENTITY |
| Legal business name (`legal_entity_name`) | ODD JOBS & MORE LLC. It must match the IRS letter exactly (CP 575 or 147C) | FACT-LEGAL-ENTITY |
| Tax ID (`business_registration_number`) | **NOT CONFIGURED.** The Owner types the EIN into Bird | OWN-DEC-190 |
| Tax ID country (`business_registration_country`) | United States (a Kentucky LLC) | FACT-LEGAL-ENTITY |
| Street address, city, state, postal code, country (`business_address_*`) | **NOT CONFIGURED.** The Owner types the registered address into Bird | OWN-DEC-190 |
| Contact phone (`contact_phone`) | **NOT CONFIGURED** (placeholder) | FACT-PUBLIC-CONTACT |
| Contact email (`contact_email`) | **NOT CONFIGURED** (placeholder) | FACT-PUBLIC-CONTACT |
| Website (`business_website`) | https://handyhub247.com (not purchased yet) | FACT-DOMAIN, OWN-DEC-184 |
| Industry (`vertical`) | **PROPOSED:** `construction`. Bird's list has no home-services entry | OQ-10DLC-PACKAGE-DETAILS |
| Alternative business ID (`alt_business_id`, optional) | **NOT CONFIGURED.** No DUNS or LEI is known | — |

Service area, for the descriptions: Kentucky and Indiana (OWN-DEC-190). Messaging purpose: transactional customer
service, appointment notifications, project updates and phone verification (OWN-DEC-190).

## 4. Campaign

### 4.1 Use case: one campaign or two (checked against Bird)

Bird's use cases include `two_factor_authentication`, `account_notification`, `customer_care` and `mixed`. A `mixed`
campaign takes two to five sub-use-cases. Bird's guide adds three constraints: a use case cannot be changed after
registration; each campaign has its own vetting fee and subscription; and a number links to one campaign. HandyHub
sends two kinds of transactional texts:

- one-time verification codes (`contact.verification_code`), allowed by either opt-in point;
- service notifications about requests, estimates, appointments and project updates, allowed only by opt-in point A.

**PROPOSED:** one `mixed` campaign with the sub-use-cases `two_factor_authentication`, `account_notification` and
`customer_care`, on the one Bird business number (OWN-DEC-129). `customer_care` covers staff replies by text, whose
SMS wording is not released yet, so the use case need not change later. Alternative: two campaigns, a
`two_factor_authentication` campaign for codes and an `account_notification` campaign for notifications. That means
two numbers, two vetting fees and two subscriptions. No marketing campaign is registered (OWN-DEC-190). Review
requests and other marketing need their own consent and are never sent under this campaign.

### 4.2 Campaign fields

| Bird field | Value |
| --- | --- |
| Use case (`use_case_category`) | **PROPOSED:** `mixed` |
| Sub-use-cases (`sub_use_cases`) | **PROPOSED:** `two_factor_authentication`, `account_notification`, `customer_care` |
| Campaign name (`name`, internal) | **PROPOSED:** HandyHub service texts |
| What the campaign is for (`use_case_description`) | See 4.3 (**PROPOSED** text) |
| How recipients opt in (`opt_in_description`) | See 4.4, the message flow (**PROPOSED** text) |
| Sample messages (`message_samples`, 1 to 5) | See 4.5 |
| Supports opt-in, opt-out and HELP (`subscriber_opt_in`, `subscriber_opt_out`, `subscriber_help`) | true, true, true |
| Opt-in keywords (`opt_in_keywords`) | START (**PROPOSED**; the app also honours UNSTOP) |
| Opt-in reply (`opt_in_confirmation_response`) | The owner's text in 4.6 |
| Opt-out keywords (`opt_out_keywords`, up to 5) | **PROPOSED:** STOP, STOPALL, UNSUBSCRIBE, CANCEL, END |
| Opt-out reply (`opt_out_confirmation_response`) | The owner's text in 4.6 |
| Help keywords (`help_keywords`) | HELP, INFO |
| Reply to HELP (`help_response`) | The owner's text in 4.6. **NOT CONFIGURED** until the real support contact exists |
| Contains a link (`embedded_link`) | true: the secure project link on the brand's own domain, never a link shortener |
| Contains a phone number (`embedded_phone`) | false |
| Age-gated content (`age_gated`) | false |
| Direct lending (`direct_lending`) | false |
| Attachments (optional, up to five) | The two opt-in screenshots of section 5, and a PDF of the SMS Terms |

### 4.3 Campaign description (PROPOSED)

> HandyHub, the brand of ODD JOBS & MORE LLC, is a home-services business serving Kentucky and Indiana. It sends
> transactional texts only, to customers who agreed on its website. Texts include one-time verification codes that
> confirm the phone number given with a service request, and notifications about the customer's own service requests,
> estimates, appointments and project updates. Examples: an estimate is ready, HandyHub has a question about a
> request, or an invoice is ready, each with a link to the customer's secure project page. No marketing messages are
> sent under this campaign.

### 4.4 Message flow and opt-in (PROPOSED wording; the quoted texts are live)

> Customers opt in on the HandyHub website at two points; neither box is checked in advance and neither is required
> to send a request or to buy a service. (A) On the estimate request form (https://handyhub247.com/request, contact
> step), an optional checkbox reads "I agree to receive text messages from HandyHub about my service requests,
> estimates, appointments, and project updates at the phone number provided." (B) On the request receipt page
> (https://handyhub247.com/request/received/ followed by the request reference), when the customer has not opted in,
> an optional checkbox reads "I agree to receive a one-time SMS verification code from HandyHub at the phone number
> provided."; it allows the verification code only. Beside each box: "Message frequency varies. Message and data
> rates may apply. Reply STOP to opt out or HELP for assistance. Consent is not required to purchase services.", with
> links to the Privacy Policy (https://handyhub247.com/privacy) and the SMS Terms (https://handyhub247.com/sms-terms).
> Each agreement is stored with the phone number, the purpose, the disclosure version, the time and the source.
> Customers can text START to opt in again after STOP.

### 4.5 Sample messages

The samples are the released text-message templates the app sends today. Each is filled in with the preview values of
the template registry and the production origin, never a real customer's data. Use them as written:

1. "Your HandyHub verification code is 000000. It expires in 10 minutes. If you did not ask for this code, you can ignore this message."
2. "Your HandyHub estimate is ready. https://handyhub247.com/portal/p/HH-0000TEST"
3. "HandyHub has a question about your request. View and reply securely. https://handyhub247.com/portal/p/HH-0000TEST"
4. "Your HandyHub invoice is ready. https://handyhub247.com/portal/p/HH-0000TEST"

The templates (`platform.message_template_versions`, channel `sms`, English):

| Message | Template | Wording source |
| --- | --- | --- |
| `contact.verification_code` | "Your HandyHub verification code is {verificationCode}. It expires in {codeLifetimeMinutes} minutes. If you did not ask for this code, you can ignore this message." | OWN-DEC-150 |
| `estimate.ready` | "Your HandyHub estimate is ready. {projectLink}" | OWN-DEC-102 |
| `question.notice` | "HandyHub has a question about your request. View and reply securely. {projectLink}" | OWN-DEC-98 |
| `invoice.ready` | "Your HandyHub invoice is ready. {projectLink}" | OWN-DEC-110 |

Every other customer message the registry may text has no released text-message wording yet, so it is never sent by
text (NOT CONFIGURED; the email goes alone).

#### The owner's ten samples (OWN-DEC-190 section 5), checked against what the app really does

| Owner sample | Product message | Sent by text today | Use as a campaign sample |
| --- | --- | --- | --- |
| **Request received** "HandyHub: We received request {reference}. We'll review it and contact you with next steps. Reply STOP to opt out." | `request.receipt` | No: email only | No: never texted |
| **Phone verification** "HandyHub: Your verification code is {code}. It expires in {minutes} minutes. Do not share this code." | `contact.verification_code` | Yes, with the OWN-DEC-150 wording above | Sample 1 is the released wording |
| **Estimate ready** "HandyHub: Your estimate {estimateNumber} is ready. Sign in to your secure project portal to review it. Reply STOP to opt out." | `estimate.ready` | Yes, with the OWN-DEC-102 wording above | Sample 2 is the released wording |
| **Appointment options** "HandyHub: Appointment options are ready for project {reference}. Visit your secure project portal to choose a time." | `estimate_visit.options`, `work_visit.options` | No: no text wording released | Not until released |
| **Appointment confirmation** "HandyHub: Your appointment is confirmed for {date}, arrival window {start}-{end} {zone}. Reply HELP for support." | `estimate_visit.confirmed`, `appointment.confirmed` | No: no text wording released | Not until released |
| **Appointment reminder** "HandyHub: Reminder: your appointment is tomorrow, {date}, with arrival between {start} and {end} {zone}." | `reminder.appointment` | No: no text wording released | Not until released |
| **Project update** "HandyHub: There's an update about project {reference}. Please open your secure project portal for details." | the project notices, for example `question.notice`, `invoice.ready` | Yes, as samples 3 and 4 | Samples 3 and 4 are the released wording |
| **Opt-out confirmation** "HandyHub: You've opted out of text messages. No further SMS notifications will be sent for this program." | Bird's STOP reply | Bird sends it once set | Opt-out reply (4.6) |
| **Help response** "HandyHub: For assistance, contact {verifiedSupportContact}. Reply STOP to opt out." | Bird's HELP reply | Not until the support contact exists | HELP reply (4.6) |
| **Opt-in confirmation** "HandyHub: You're subscribed to service SMS updates. Message frequency varies. Message and data rates may apply. Reply HELP for help or STOP to opt out." | Bird's START reply | Bird sends it once set | Opt-in reply (4.6) |

**PROPOSED** (OQ-10DLC-PACKAGE-DETAILS): before submitting, the Owner may release text-message versions in the
owner-sample wording for the messages above that have none. The campaign samples would then use those versions. As it
stands, the samples are the four released texts, because carriers reject samples that differ from what is really sent.

### 4.6 STOP, HELP and START

What the app does (TSK-0048, `apps/server/src/modules/notifications/status.ts`): an inbound text whose whole body is a
keyword updates the consent record at once, with the provider receipt as evidence. Bird answers the keyword with its
keyword-rule reply; the app sends no second reply.

| Keyword | Words the app honours | Effect in the app | Reply (Bird keyword rule and campaign field) |
| --- | --- | --- | --- |
| STOP | STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT, OPTOUT, REVOKE | Withdraws the SMS opt-in, the verification-code consent and marketing texts. A queued text is not sent | "HandyHub: You've opted out of text messages. No further SMS notifications will be sent for this program." |
| HELP | HELP, INFO | No consent change | "HandyHub: For assistance, contact {verifiedSupportContact}. Reply STOP to opt out." **NOT CONFIGURED** until the support contact exists (`sms.help_reply`) |
| START | START, UNSTOP | Records a new SMS opt-in (never marketing) | "HandyHub: You're subscribed to service SMS updates. Message frequency varies. Message and data rates may apply. Reply HELP for help or STOP to opt out." |

Bird's form takes at most five keywords per list. The app honours every word above whatever list is registered.

## 5. Opt-in points: evidence

| | Opt-in point A: request form | Opt-in point B: request receipt |
| --- | --- | --- |
| Production URL | https://handyhub247.com/request (step 4 of 5, Contact) | https://handyhub247.com/request/received/ followed by the request reference |
| Staging URL | https://handyhub-staging.onrender.com/request | https://handyhub-staging.onrender.com/request/received/ followed by the request reference |
| Shown when | Always, on the contact step | When the request has no current SMS opt-in |
| Checkbox | Optional, unchecked by default | Optional, unchecked by default |
| Label | "I agree to receive text messages from HandyHub about my service requests, estimates, appointments, and project updates at the phone number provided." | "I agree to receive a one-time SMS verification code from HandyHub at the phone number provided." |
| Beside it | "Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for assistance. Consent is not required to purchase services." The support contact (a placeholder until set). Links: Privacy Policy, SMS Terms | "Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for assistance. Consent is not required to purchase services." Links: Privacy Policy, SMS Terms, Website Terms |
| Legal text version | `sms-disclosure-2` (`legal.sms_disclosure` version 2) | `sms-verification-disclosure-1` (`legal.sms_verification_disclosure` version 1) |
| Consent recorded | Purpose `transactional_sms`, channel `sms`, source `request_form` | Purpose `sms_verification`, channel `sms`, source `receipt` |
| Allows | Every transactional text (not marketing) | The verification code only |
| Screenshot | [evidence/opt-in-a-request-form.png](evidence/opt-in-a-request-form.png) | [evidence/opt-in-b-receipt.png](evidence/opt-in-b-receipt.png) |

Each consent record (`platform.consent_records`) stores the phone number, the purpose, the channel, the disclosure
version, the time, the source and the evidence (the request ID and reference; on the receipt also the receipt
capability and HTTP request IDs). It never stores an IP address, browser data or a token. Staff see the record with
the request. Marketing permission is a separate checkbox with its own records. Neither box implies the other, and
sending a request is never consent to texts (HH-INT-18, HH-INT-22).

The screenshots were taken from a local build of this branch with synthetic data (`apps/e2e/tests/tendlc-evidence.spec.ts`
with `TENDLC_EVIDENCE_DIR=docs/10dlc/evidence`). After deployment, take them again on staging, and on the production
domain before submission, with the same spec. The e2e spec also checks that the live page shows the quoted wording of
this file.

## 6. Website pages carriers check

| Page | Production URL | Document version | Status |
| --- | --- | --- | --- |
| Privacy Policy (with the SMS section and the no-sharing statement) | https://handyhub247.com/privacy | `privacy-notice-1` | Draft, not reviewed by an attorney |
| SMS Terms | https://handyhub247.com/sms-terms | `sms-terms-2` | Draft, not reviewed by an attorney |
| Website Terms | https://handyhub247.com/terms | `website-terms-1` | Draft, not reviewed by an attorney |

The privacy policy says: "Mobile numbers and SMS opt-in data are never shared with or sold to third parties for
marketing purposes." Every page names the brand and the legal entity the same way: "HandyHub is the brand name of ODD
JOBS & MORE LLC, a Kentucky limited liability company." The footer and the request form link to all three pages.

`sms-terms-2` names the program "HandyHub Service Texts" and lists the customer messages that may be texted. It states
"Message frequency varies", "Message and data rates may apply.", "Reply STOP to opt out.", "Reply HELP for help." and
"Reply START to receive texts again.". It describes both opt-in points and shows the support contact (a placeholder
until set).

## 7. Sending rules that apply to every text

- No text goes to a number without a current consent for it. Having a phone number is never consent (HH-COM-05).
- Texts go only within the recipient's permitted local hours. An unknown zone falls back to 9 AM to 9 PM Eastern for
  non-urgent texts. Authentication codes never wait in that queue (OWN-DEC-154, OWN-DEC-207,
  `messages.delivery_hours`).
- One message per event: retries and double submissions never duplicate it, and each text is rechecked when it sends.
- Codes are time-limited and single-use, with rate, attempt and resend limits (FACT-SESSION-TIMINGS).
- Bird's webhooks are verified before they are used. On staging, texts go only to approved test numbers.

## 8. Readiness checklist (OWN-DEC-190 section 7)

| Check | State |
| --- | --- |
| The legal identity is accurate | Waiting: the legal name on documents (OQ-LEGAL-ENTITY-NAME); the EIN and address entered by the Owner |
| HandyHub is clearly connected to the LLC | Done on every legal page and in the footer |
| The opt-in checkboxes work | Done: A (`sms-disclosure-2`) and B (`sms-verification-disclosure-1`), tested end to end |
| The Privacy Policy and Terms links work | Done from both opt-in points and the footer |
| The disclosures match the campaign | Done: the quotes above are tested against the live texts |
| Consent evidence can be shown | Done: consent records and the screenshots in section 5 |
| Every mandatory provider field is completed | Waiting: the EIN, the address, the support phone and email, and the website |
| The samples match real behaviour | Done: the four released text templates (section 4.5) |
| The campaign category is appropriate | PROPOSED: `mixed` (section 4.1) |
| No prohibited or unsupported message is included | Done: no marketing and no link shorteners; the HELP reply waits for the support contact |

## 9. What the Owner completes, in order

1. Buy handyhub247.com and put the production site on it (OWN-DEC-184).
2. Give the real public support phone and email (FACT-PUBLIC-CONTACT). Staff then enter them in Business settings, and
   the HELP reply (`sms.help_reply`) can be configured.
3. Answer OQ-LEGAL-ENTITY-NAME and OQ-10DLC-PACKAGE-DETAILS. Get the attorney's answer on A-12 and A-13
   (OQ-ATTORNEY-PRIVACY).
4. In Bird (SMS > 10DLC > Register brand): enter the brand fields of section 3, typing the EIN, the registered address
   and the contact details into Bird's fields. Bird shows the fee before you confirm.
5. After the brand is approved, create the campaign with the fields of section 4. Upload the two screenshots. Bird
   shows the vetting fee and the subscription before you confirm.
6. Get the business number in Bird, if it does not exist yet, and link it to the campaign. Turn on the United States
   as an SMS destination.
7. Set the Bird keyword rules for STOP, HELP and START with the replies of section 4.6.
8. When the campaign and the number link are approved, decide to turn on live texts (a new `sms.live_delivery`
   version). That is a separate Owner decision, not part of this package.
