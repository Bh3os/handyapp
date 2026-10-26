# Review packet: attorney (Kentucky and Indiana)

Prepared 2026-10-22 by TSK-0143 for OWN-DEC-186. Status: waiting for review. Nothing in this packet is a legal conclusion; every item is a question for you.

## 1. Who this is for
An attorney licensed in Kentucky and/or Indiana (OWN-DEC-72, RULE-HUMAN-REVIEW: legal and licensing are human-review boundaries). After your answers, the owner records a documented approval of each reviewed document version. Questions that are also the CPA's (retention, mailing address, subcontractors) are marked; the CPA gets the same questions in [cpa.md](cpa.md).

## 2. What HandyHub is (from the knowledge graph)
- FACT: HandyHub is the customer-facing brand of ODD JOBS & MORE LLC, a Kentucky limited liability company; the assumed name "HandyHub" is not filed (FACT-LEGAL-ENTITY, OWN-DEC-147). Estimates and invoices print the name "Handyhub LLC" (FACT-BUSINESS-NAME, OWN-DEC-126); how that name relates to the LLC is open (OQ-LEGAL-ENTITY-NAME).
- FACT: a residential home-services business with 26 services in four categories: cleaning (7), drywall (4), painting (4) and home improvement (11) (OWN-DEC-04, OWN-DEC-33). Customers: homeowners, renters, landlords and short-term rental hosts; residential only at launch (FACT-CUSTOMERS-SERVED).
- FACT: service area, eleven whole counties (FACT-SERVICE-AREA, OWN-DEC-37, OWN-DEC-179): Kentucky: Jefferson (Louisville), Oldham, Bullitt, Shelby, Meade; Indiana: Clark, Floyd, Harrison, Scott, Washington, Jefferson.
- FACT: initially two employees; the owner holds every office role and also works in the field; subcontractors later, paid outside the app (OWN-DEC-05, OWN-DEC-28, OWN-DEC-188).
- FACT: visits every day, 8 AM–10 PM, by appointment, never 24/7 (FACT-HOURS). Business time zone America/Kentucky/Louisville; appointments in the property's Eastern or Central zone (OWN-DEC-159).
- FACT: HandyHub never performs licensed gas, electrical, plumbing, HVAC or structural work and never removes hazardous materials (RULE-HUMAN-REVIEW, FACT-SVC-EXCLUDED-SCOPE).
- FACT: the software is a public website with a customer portal and a staff app. Vendors as implemented (OWN-DEC-72, OWN-DEC-114, OWN-DEC-129): Render (hosting and database), Cloudflare R2 (photo and document storage), Bird (texts and the business phone number), Resend (email), Square (card payments taken outside the software through payment links and Tap to Pay; staff record each payment by hand, FACT-PAYMENT-METHODS). Staff sign in through the app's own login.
- FACT: today everything runs on private staging behind an access gate with synthetic data only. The launch has three phases, each started only by the owner: Owner Acceptance Testing on staging, invited customers, public (OWN-DEC-191, OQ-GO-DECISION). The domain handyhub247.com is not purchased yet (OWN-DEC-184).

## 3. Materials to review
| Material | On staging (owner sends the link and a tester sign-in) | In the repository (github.com/Bh3os/handyapp) |
| --- | --- | --- |
| Privacy Policy with its SMS section, version 1, document ID `privacy-notice-1`, draft | `/privacy` | `packages/domain/src/legal.ts` (`PRIVACY_NOTICE`) and the `legal.privacy.*`, `legal.common.*` keys of `packages/i18n/src/catalogs/customer.en.json` |
| SMS Terms, version 1, `sms-terms-1`, draft | `/sms-terms` | `legal.ts` (`SMS_TERMS`), `legal.sms.*` keys |
| Website Terms, version 1, `website-terms-1`, draft | `/terms` | `legal.ts` (`WEBSITE_TERMS`), `legal.terms.*` keys |
| SMS disclosure beside the request-form checkbox, version 1, `sms-disclosure-1`, draft | request form `/request` | `legal.ts` (`SMS_DISCLOSURE`), `legal.smsDisclosure.*` keys |
| Estimate terms v1.0, `estimate-terms-1` (approved by the owner for real use, OWN-DEC-187; not attorney-reviewed) | `/portal/terms/estimate-terms-1` | `legal.ts` (`ESTIMATE_TERMS`), `legal.estimateTerms.*` keys |
| The attorney checklist for the three public documents (reused here, not repeated) | — | [docs/legal-review-checklist.md](../legal-review-checklist.md) |
| Retention schedule and the table-to-category mapping | Staff app, Retention reviews | [docs/data-inventory.md](../data-inventory.md); node FACT-RETENTION-SCHEDULE |

Every staging page shows the banner "Draft - not reviewed by an attorney" while its version is not marked attorney-reviewed. Each version is stored with the SHA-256 of its exact wording; a request keeps the privacy-policy version it was sent with.

## 4. Questions
Each question names the open node or decision it unblocks, quotes the current draft or rule, and states its launch gate (see the [README](README.md) for PRODUCTION / FEATURE / NONE STATED).

### A-01 Privacy Policy, SMS Terms and Website Terms as a whole
- **Question:** are the three drafts adequate for Kentucky and Indiana, and do they describe the services actually used? Work through sections 1, 3 and 5 of [docs/legal-review-checklist.md](../legal-review-checklist.md): applicability of the Kentucky and Indiana consumer data privacy laws to HandyHub and what the policy must add if they apply (nothing about them is stated today); whether a statement about children's information is needed (none is made); whether "This website does not use advertising cookies or third-party tracking." is acceptable as a commitment and whether a cookie notice is needed for the sign-in cookie; the carrier disclaimer (not included); whether an assent sentence is wanted (none is written).
- **Unblocks:** OQ-ATTORNEY-PRIVACY, OWN-DEC-72, HH-PRIV-04, HH-COM-12.
- **Current rule (OQ-ATTORNEY-PRIVACY):** "Until answered: production release is blocked; staging takes synthetic data only."
- **Launch gate:** PRODUCTION.

### A-02 Topics deliberately left out of the Website Terms and the estimate terms
- **Question:** should any of the clauses removed from the earlier estimate-terms drafts (v0.2/v0.3) be added to the estimate terms or the website terms, and in what wording: warranty or guarantee wording beyond A-05, limitation of liability, indemnity, governing law, venue, arbitration or other dispute resolution, late fees or interest, refund or forfeiture, damage-claim procedure, licensing or insurance statements?
- **Unblocks:** OQ-ATTORNEY-TERMS, OWN-DEC-127, HH-EST-13.
- **Current draft (website terms, `legal.terms.notCovered.text`):** "These draft terms do not yet include clauses on topics the owner has not decided, such as governing law, dispute resolution or limitation of liability. Whether any are needed is waiting for attorney review." Estimate terms v1.0 contain none of these clauses; a negative-list test enforces it (OWN-DEC-127). Payment terms state no late fees or interest (FACT-PAYMENT-DUE, OWN-DEC-112).
- **Also check:** the estimate terms v1.0 (shown with every estimate) and the website terms must not conflict (checklist 5).
- **Launch gate:** NONE STATED for v1.0, which the owner approved for real approvals (OWN-DEC-187). Any clause you add needs a new terms version and the owner's approval.

### A-03 Cancellation and late-cancellation fee: enforceability in Kentucky and Indiana
- **Question:** may HandyHub keep or invoice the late-cancellation amount described below for a confirmed work visit, in Kentucky and in Indiana; which "legally protected cancellation rights" apply to its customers (the owner's rule 5 refers to them without naming them); what must be disclosed, where and when, for the amount to be "disclosed and accepted in advance"; and what wording should the customer see?
- **Unblocks:** OWN-DEC-161 (enforcement), FACT-CANCELLATION-RULES, OWN-DEC-134, OWN-DEC-163, OWN-DEC-195, HH-EST-13 (the next terms version), TSK-0140.
- **Current decided rule (OWN-DEC-161, owner's wording):**
  > 1. For customer cancellations with less than 24 hours' notice, the standard cancellation fee is capped at $50.
  > 2. If the customer paid a deposit smaller than $50, retain only that deposit and do not invoice the difference.
  > 3. If the deposit is $50 or more, retain no more than $50 and refund the remaining deposit, subject to other lawful, separately authorized charges.
  > 4. If no deposit was paid, retain the existing $50 invoice rule only where it is legally permitted and was disclosed and accepted in advance.
  > 5. Never apply cancellation fees or retain deposits when the customer is exercising a legally protected cancellation right.
  > 6. Do not automatically penalize customers for cancellations caused by HandyHub, unsafe conditions, emergencies, or circumstances requiring owner review.
  > 7. Show the cancellation policy clearly before the customer approves an estimate or pays a deposit.
  >
  > Keep cancellation-fee enforcement subject to attorney approval for Kentucky and Indiana.
- **Other decided rules (FACT-CANCELLATION-RULES):** rescheduling is always free; a final cancellation 24 hours or more before the visit, before work starts, gets a full deposit refund and no charge; after work started the customer pays for work done plus materials; if HandyHub cancels or moves a visit the customer chooses a free reschedule or a full refund; estimate visits are never charged (OWN-DEC-163); arrival alone is not the start of contracted work (OWN-DEC-195); refunds and waivers are the owner's.
- **RISK:** the published draft Website Terms v1 (`legal.terms.cancellation.late`) predate OWN-DEC-161 and OWN-DEC-163: "Cancelling less than {cancellationNoticeHours} hours before the visit, including when no one can let us in and you then cancel: {lateCancellation} is kept from your deposit and the rest is refunded; without a deposit, the {lateCancellation} is invoiced. Materials already bought do not add to it." It does not yet say that a deposit under $50.00 is kept without invoicing the difference, that only work visits are affected, or the conditions of rules 4 to 6. The page shows "The wording of these rules is waiting for attorney review." A new version with your wording is needed.
- **Launch gate:** FEATURE. Until approved, no late-cancellation amount is enforced; the rules run on staging only.

### A-04 Mailing address on estimates and invoices (also for the CPA)
- **Question:** does Kentucky or Indiana law require a business address on estimates, approval receipts or invoices?
- **Unblocks:** OWN-DEC-183 (answered the address itself; the legal requirement was sent here), FACT-BUSINESS-ADDRESS.
- **Current rule:** the owner gave an address; the owner enters it in Business settings (`business.mailing_address`); it is never in the repository and the website never publishes a street address (OWN-DEC-183, OWN-DEC-48). Until entered it is NOT CONFIGURED and documents omit the line.
- **Launch gate:** NONE STATED.

### A-05 The 90-day workmanship warranty: wording and exclusions
- **Question:** what wording should state the 90-day workmanship warranty, and which exclusions, if any, should it carry? No exclusion has been decided or invented.
- **Unblocks:** OWN-DEC-135, FACT-WARRANTY, HH-EST-13.
- **Current draft (website terms, `legal.terms.warranty.text`):** "HandyHub gives a 90-day workmanship warranty, counted from the reviewed completion date." followed by "The wording of the warranty and any exclusions are waiting for attorney review." Estimate terms v1.0 contain no warranty; it goes into the next terms version (OWN-DEC-187).
- **Launch gate:** FEATURE (the next estimate-terms version that carries the warranty and the cancellation rules).

### A-06 Legal entity and the name on documents
- **Question:** (a) is the sentence "HandyHub is the brand name of ODD JOBS & MORE LLC, a Kentucky limited liability company." acceptable on the website, the legal pages and the A2P 10DLC registration while the assumed name "HandyHub" is not filed, or must it be filed first? (b) Is "Handyhub LLC" a name the business may print on estimates and invoices, does it need to be filed for the LLC, or should documents print ODD JOBS & MORE LLC?
- **Unblocks:** OQ-LEGAL-ENTITY-NAME, FACT-LEGAL-ENTITY, FACT-BUSINESS-NAME, OWN-DEC-126, OWN-DEC-147, OWN-DEC-190.
- **Current rule:** documents show "Handyhub LLC"; nothing claims a registration status (OQ-LEGAL-ENTITY-NAME). RISK: a mismatch between the document name and the 10DLC registration may fail campaign vetting (checklist 2).
- **Launch gate:** NONE STATED as a production prerequisite; it feeds A2P 10DLC (A-12), which gates production texting.

### A-07 Registration to do business in Indiana
- **Question:** before HandyHub takes jobs in its six Indiana counties, does ODD JOBS & MORE LLC need to register in Indiana, and are there other state or local registrations to complete first?
- **Unblocks:** OQ-INDIANA-REGISTRATION, FACT-SERVICE-AREA.
- **Current state:** owner answer 2026-10-05: "not registered but as soon as the website start working and I started to get jobs there I will register it". The software does not decide it; Indiana requests are accepted for staff review like any other, and coverage never confirms a booking.
- **Launch gate:** NONE STATED in the software. RECOMMENDATION: answer before the first real Indiana job.

### A-08 Licenses, certifications and permits per service and municipality
- **Question:** which of the 26 services (list in [insurance.md](insurance.md) section 4), in which Kentucky and Indiana municipalities of the service area, need a license, certification or permit before work starts, and who must hold it?
- **Unblocks:** OQ-PERMITS-LICENSING, OWN-DEC-18, OWN-DEC-82.
- **Current rule:** no license, certification or training-tracking module exists; the owner checks requirements outside the software and uses a job-level "Hold / Ready" control with a note; an unresolved requirement is a blocking Hold on the affected job; nothing claims a license (OWN-DEC-82). No statewide trade permission is assumed (OWN-DEC-18). Screening limits already decided, which are not legal determinations: no paint-disturbing work in homes built before 1978 on HI-09, DW-01, DW-02, DW-03, PT-01 to PT-04, and popcorn removal only in homes built in 1981 or later (FACT-SVC-HOME-AGE-LIMITS).
- **Launch gate:** FEATURE (per job: a job with an unresolved requirement stays on Hold).

### A-09 "Work we don't do" wording on the website
- **Question:** is the wording of the limits each service page and "How estimates work" show acceptable: the service's own limits, the home-age limits, and the licensed-trade (line-voltage electrical, gas, plumbing, HVAC), asbestos and lead, mold and structural limits? Should a customer who is turned away see more than "We're not able to take on this project" (no referral to named companies is made)?
- **Unblocks:** OWN-DEC-51, FACT-SVC-EXCLUDED-SCOPE, OWN-DEC-100. The safety reviewer gets the same item (safety.md S-09).
- **Launch gate:** NONE STATED (OWN-DEC-51 asks for the review "before launch").

### A-10 Privacy requests: Kentucky and Indiana obligations
- **Question:** what do Kentucky and Indiana law require of HandyHub for requests to access, export, correct or delete personal data: legal deadlines and permitted extensions, the notice period for an extension, identity verification, the content of an access or export response (including whether information in audit records or staff notes must be disclosed), permitted refusals or partial responses, and the outcome notice? Is the internal process below adequate?
- **Unblocks:** OWN-DEC-175 (item 13 "Require attorney review of the applicable Kentucky and Indiana privacy obligations before production activation"), OWN-DEC-201 (I1, I2), FACT-PRIVACY-REQUEST-TARGETS, HH-PRIV-03, TSK-0136, TSK-0152.
- **Current decided process (OWN-DEC-175, OWN-DEC-201):** access, export, correction and deletion requests from registered customers and guests; automatic acknowledgment on submission and a substantive acknowledgment within 3 business days; internal target 30 calendar days, tracked separately from the legal deadline, nothing closed automatically; identity verified before anything is disclosed, corrected, exported or deleted (at least a fresh one-time code in the same session, with secure alternatives where needed); an export holds the requester's own data, with protected third-party information and legitimately restricted internal records excluded or redacted, "Do not categorically exclude information solely because it originates in an audit log; evaluate disclosure rights and exceptions."; deletion separates the account from records that must be kept, and a request is never denied only because records must be retained (partial response with an explanation). The owner's words: "The 30-day period is HandyHub's internal customer-service commitment, not a representation that every applicable law requires completion within 30 days."
- **Launch gate:** PRODUCTION (privacy requests are part of OQ-ATTORNEY-PRIVACY; OWN-DEC-175 requires the review "before production activation").

### A-11 Erasing a request that never became a job: the reference-only remainder
- **Question:** after 2 years, is it acceptable to delete the personal content of a request that never became a job and keep only "Request reference number, if non-identifying", creation date, closure date, final request status and non-identifying retention metadata? Is any longer retention required for such requests or their consent records?
- **Unblocks:** OWN-DEC-176 ("whether a reference-only remainder is acceptable goes to the attorney packet"), HH-PRIV-08, TSK-0137.
- **Current decided rule (OWN-DEC-176):** deleted when no other valid retention applies: name, email, phone, property address, job descriptions and answers, photos and attachments, internal notes, customer and staff conversations, unnecessary metadata with personal information, temporary files and access tokens; identifiable consent evidence that must remain moves to a separate restricted compliance record with its own deadline.
- **Launch gate:** FEATURE (irreversible deletion stays off until confirmed, OWN-DEC-177 section 7).

### A-12 SMS consent wording, the SMS program and A2P 10DLC
- **Question:** is the decided consent wording below adequate for the A2P 10DLC registration and for Kentucky and Indiana law, and are the SMS Terms and the privacy policy's SMS section consistent with it? Review: the two checkbox statements and the disclosure, the program name, the no-sharing sentence, the message list and frequency statement, the STOP, HELP and START texts, and the ten sample messages of OWN-DEC-190 section 5.
- **Unblocks:** OWN-DEC-190, OWN-DEC-178, OWN-DEC-147, HH-COM-12, HH-INT-22, OQ-BIRD-10DLC, TSK-0133, TSK-0134.
- **Decided wording to be implemented (OWN-DEC-190):**
  - Request form, optional unchecked checkbox: "I agree to receive text messages from HandyHub about my service requests, estimates, appointments, and project updates at the phone number provided."
  - Request receipt page, optional unchecked checkbox (OWN-DEC-178): "I agree to receive a one-time SMS verification code from HandyHub at the phone number provided."
  - Beside each: "Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for assistance. Consent is not required to purchase services." with links to the Privacy Policy and the SMS Terms. Verification consent, ongoing transactional consent and marketing consent stay separate. No marketing campaign is registered.
- **Current drafts in the repository (TSK-0133, 2026-10-26):** the request form shows the OWN-DEC-190 wording above (`sms-disclosure-2`), with the support contact line and the links. The receipt shows point B (`sms-verification-disclosure-1`). The SMS Terms `sms-terms-2` keep the program name "Program name: HandyHub Service Texts." (PROPOSED by Claude; the graph names no program). They also keep the no-sharing sentence "Mobile numbers and SMS opt-in data are never shared with or sold to third parties for marketing purposes.". They list the messages that may be texted and both opt-in points. The registration package with the sample messages is `docs/10dlc/registration.md`; its PROPOSED choices are in OQ-10DLC-PACKAGE-DETAILS. The superseded request-form text `sms-disclosure-1` read "I agree to receive HandyHub Service Texts at the phone number above."
- **Owner items, not for you:** the HELP reply text is NOT CONFIGURED; the public support contact is still a placeholder (FACT-PUBLIC-CONTACT), and `{verifiedSupportContact}` in the HELP sample needs it. RISK: campaign vetting needs a working support contact and website (OWN-DEC-184).
- **Launch gate:** PRODUCTION for texting: live SMS stays off until the registration and number association are approved (OWN-DEC-190, OWN-DEC-191 Phase 3). The wording is also part of A-01 (OQ-ATTORNEY-PRIVACY).

### A-13 Text-message hours and quiet-hours rules
- **Question:** do the sending hours below satisfy the federal and state rules that apply to HandyHub's transactional texts (the graph sends "quiet hours and TCPA questions" to the attorney with OQ-BIRD-10DLC)? Is any message type below sent at a time it should not be?
- **Unblocks:** OWN-DEC-154, FACT-HOURS, OQ-BIRD-10DLC.
- **Current decided rules:** a non-urgent text outside the permitted hours is queued and sent at the next allowed time, "normally 8 AM in the customer's local time zone", Eastern or Central from the verified location, and rechecked before it goes (still relevant, not delivered, no opt-out) (OWN-DEC-154, OWN-DEC-159). Not held to the hours: one-time codes and access links send immediately (OWN-DEC-65); the "On my way" notice follows the worker's tap; emails and released staff replies go at any hour (FACT-HOURS). Critical safety communication uses the approved escalation procedure, "never an automatic quiet-hours bypass" (OWN-DEC-154, OWN-DEC-172).
- **Launch gate:** PRODUCTION for texting (with A-12).

### A-14 Retention periods: legal and employment minimums (also for the CPA)
- **Question:** do the periods below meet the legal, contractual, insurance and employment-record minimums for Kentucky and Indiana? What is the separate schedule for regulated employee medical or exposure records? Which periods apply to the kinds that have none yet?
- **Unblocks:** OQ-RETENTION-REVIEW, OWN-DEC-70, OWN-DEC-142, OWN-DEC-177, OWN-DEC-201 (I5), FACT-RETENTION-SCHEDULE, TSK-0138.
- **Current schedule (FACT-RETENTION-SCHEDULE, configurable; nothing is deleted automatically):** requests that never become jobs 2 years after closure; unaccepted estimates 2 years after expiration or closure; customer and property profiles while active, then 7 years after the last completed service; accepted estimates, work authorizations, contracts and change orders 10 years after final job closeout; invoices, payments, receipts, refunds and reconciliation 7 years after the relevant tax return is filed or the tax is paid, whichever is later; job photos, operational messages, checklists and arrival/finish timestamps 7 years after job closeout; ordinary safety acknowledgments and incident records 10 years after closure; regulated employee medical or exposure records excluded from routine deletion; property access codes removed when no longer needed; audit records 7 years as a review threshold. Provisional (OWN-DEC-177): staff accounts 7 years after departure; consent records 5 years after the last relevant use; settings and content history while retained records depend on them; technical logs 90 days; expired sessions and access links minimal metadata up to 30 days.
- **Still without a period, NOT CONFIGURED (OWN-DEC-177):** the access-code reveal log, action-queue items, unlinked inbound messages and their linking corrections, technical records other than logs (background jobs, outbox events, idempotency keys, unlinked webhook receipts), the deletion-review entries themselves, and the copies vendors keep (Bird, Resend, Cloudflare R2, Render backups).
- **Also review:** the table-to-category mapping in [docs/data-inventory.md](../data-inventory.md) ("Do not approve destructive production deletion based solely on an unreviewed table mapping", OWN-DEC-201 I5). RISK: the published privacy policy v1 says "Audit records: 7 years." and does not list the provisional rows of OWN-DEC-177; a new version follows your answer.
- **Launch gate:** FEATURE: "No irreversible automatic deletion until the CPA and the attorney confirm" (OWN-DEC-177).

### A-15 Deleting audit records after 7 years
- **Question:** is it acceptable for the owner to delete eligible audit records after 7 years through the dedicated retention workflow below, and are the pre-deletion checks complete?
- **Unblocks:** OWN-DEC-164, OWN-DEC-142, HH-SEC-08, TSK-0135.
- **Current decided rule (OWN-DEC-164):** audit entries stay append-only and tamper-evident during retention and nobody, the owner included, edits one; 7 years is a review threshold, not a deletion date; deletion only on the owner's explicit authorization after confirming no legal hold or litigation, active investigation, unresolved dispute, tax, accounting or contractual requirement, or security incident covers the record; archiving when keeping is justified; every deletion is written to a separate protected retention-operation trail with hash chaining; "Ensure the retention process follows the approved privacy policy and any applicable legal requirements."
- **Launch gate:** FEATURE (the deletion step stays unavailable until confirmed).

### A-16 Subcontractor agreement and worker classification (with the CPA)
- **Question:** what must the subcontractor agreement contain (its wording is open), and what decides whether a person is engaged as an employee or as a subcontractor? The graph names hiring and classification a human-review boundary (OWN-DEC-05).
- **Unblocks:** OQ-SUBCONTRACTOR-POLICY, OWN-DEC-05, OWN-DEC-188.
- **Known owner answers (2026-10-05):** subcontractors get their own sign-in as workers, show proof of their own insurance before their first job, need an agreement and a W-9 on file and never see job prices; they are paid outside the app (OWN-DEC-188). The hiring trigger and the agreement wording are open.
- **Current rule:** subcontractor features follow the worker role only; no subcontractor-specific workflow is built.
- **Launch gate:** NONE STATED. RECOMMENDATION: answer before the first subcontractor job.

### A-17 Export of the requester's data: exceptions
- **Question:** which exceptions allow HandyHub to leave information out of an export or access response (other people's contact details, staff-only notes and handling, staff details, audit entries), and must the export include anything more (for example internal notes about the person, or the photos themselves rather than their count)?
- **Unblocks:** OWN-DEC-201 (I2), OQ-ATTORNEY-PRIVACY, HH-PRIV-05, TSK-0152.
- **Current behaviour (OQ-PRIVACY-REQUESTS, now superseded by OWN-DEC-192, OWN-DEC-201, OWN-DEC-175):** "a JSON file of the requester's own data" (name, contact and sign-in values, properties, requests as submitted, estimate versions received, approvals, consent records, privacy requests, their reschedule and cancellation requests, photo counts); excluded and named: other contacts of the same customer, staff-only notes and handling, staff details and audit entries. OWN-DEC-201 I2 changes the audit-entry exclusion into an evaluation of disclosure rights and exceptions.
- **Launch gate:** PRODUCTION (part of A-10).

### A-18 Customer account deletion versus business records
- **Question:** is the separation below lawful in both states, including keeping retained records with only the identifying information they need, and never anonymizing signed approvals or issued financial documents?
- **Unblocks:** OWN-DEC-71, OWN-DEC-113, HH-PRIV-03, OQ-ATTORNEY-PRIVACY.
- **Current decided rule (OWN-DEC-71):** the login account is deleted separately from business records; sign-in, sessions and project-access links are revoked; eligible personal data and preferences are deleted; invoices and payments (7 years), accepted estimates and authorizations (10 years) and incident records (10 years) are retained; "Do not rewrite signed approvals or issued financial documents to anonymize them"; a hold blocks deletion of affected records but access can still be disabled.
- **Launch gate:** PRODUCTION (part of A-10).

## 5. Sign-off
Fill one row per item. "Changed" means you supply the replacement wording or rule (attach it). Leave a row blank if it is not your area.

| Item | Approved as written / Changed / Not my area | Reviewer | Date |
| --- | --- | --- | --- |
| A-01 Privacy Policy `privacy-notice-1` | | | |
| A-01 SMS Terms `sms-terms-1` | | | |
| A-01 Website Terms `website-terms-1` | | | |
| A-02 Clauses left out (estimate and website terms) | | | |
| A-03 Late-cancellation enforcement, Kentucky | | | |
| A-03 Late-cancellation enforcement, Indiana | | | |
| A-03 Cancellation wording for the next terms version | | | |
| A-04 Mailing address on documents | | | |
| A-05 Warranty wording and exclusions | | | |
| A-06 Entity sentence and "Handyhub LLC" | | | |
| A-07 Indiana registration | | | |
| A-08 Licenses and permits per service and municipality | | | |
| A-09 "Work we don't do" wording | | | |
| A-10 Privacy-request obligations | | | |
| A-11 Reference-only remainder | | | |
| A-12 SMS consent wording (request form) | | | |
| A-12 SMS consent wording (receipt page) | | | |
| A-12 SMS disclosure, program name, sample messages | | | |
| A-13 Text-message hours | | | |
| A-14 Retention periods (legal and employment) | | | |
| A-14 Schedule for regulated employee medical or exposure records | | | |
| A-14 Periods for the unscheduled kinds | | | |
| A-15 Audit-record deletion after 7 years | | | |
| A-16 Subcontractor agreement and classification | | | |
| A-17 Export exceptions | | | |
| A-18 Account deletion versus business records | | | |

## 6. What is NOT claimed
- No statement anywhere says HandyHub complies with Kentucky or Indiana law; the software never certifies compliance (OWN-DEC-03, docs/legal-review-checklist.md).
- No license, certification, permit or registration is claimed, including in Indiana (OQ-PERMITS-LICENSING, OQ-INDIANA-REGISTRATION).
- No insurance is claimed or implied; terms v1.0 contain no insurance statement (OQ-INSURANCE-EVIDENCE).
- No warranty is published beyond the decided 90-day workmanship warranty, whose wording waits for you; no exclusion, guarantee, limitation of liability, indemnity, arbitration, venue, late fee, interest, forfeiture or damage-claim procedure is written (OWN-DEC-127, FACT-WARRANTY).
- No tax treatment is claimed; no document states or implies tax exemption (FACT-TAX-NO-LINE).
- The 30-day privacy target is an internal commitment, not a statement of the law (OWN-DEC-175).
- Nobody, staff or software, decides fault, admits liability or promises compensation (OWN-DEC-124).

## 7. Launch gates of this packet
| Gate | Items |
| --- | --- |
| PRODUCTION | A-01, A-10, A-17, A-18 (OQ-ATTORNEY-PRIVACY); A-12 and A-13 for production texting |
| FEATURE | A-03 (late-cancellation enforcement), A-05 (next terms version), A-08 (per-job Hold), A-11, A-14, A-15 (irreversible deletion) |
| NONE STATED | A-02, A-04, A-06, A-07, A-09, A-16 |
