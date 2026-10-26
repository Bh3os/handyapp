# Attorney review checklist: privacy policy, SMS terms, website terms

Goes with the drafts of TSK-0024 (HH-PRIV-04, HH-COM-12, OWN-DEC-72, OWN-DEC-147). The documents are shown on staging marked "Draft - not reviewed by an attorney". Production needs the reviewed pages, verified practices and the owner's documented approval (OQ-ATTORNEY-PRIVACY). Legal wording is a human-review boundary (RULE-HUMAN-REVIEW): the software never certifies Kentucky or Indiana compliance.

| Document | Page | Version (document ID) | Wording source |
| --- | --- | --- | --- |
| Privacy Policy (with the SMS section) | `/privacy` | 1 (`privacy-notice-1`) | `packages/domain/src/legal.ts` + `legal.privacy.*`, `legal.common.*` in `packages/i18n/src/catalogs/customer.en.json` |
| SMS Terms | `/sms-terms` | 2 (`sms-terms-2`, TSK-0133; version 1 `sms-terms-1` superseded) | `legal.sms.*`, `legal.common.*` |
| Website Terms | `/terms` | 1 (`website-terms-1`) | `legal.terms.*`, `legal.common.*` |

Each version is a policy version (`legal.privacy_notice`, `legal.sms_terms`, `legal.website_terms`, migration 0021) with the SHA-256 of its exact wording. Any wording change is a new version; requests keep the privacy policy version they were sent with.

**Reviewer:** an attorney licensed in Kentucky and/or Indiana; then the owner's documented approval. Owner and attorney items are marked.

## 1. Whole documents (OQ-ATTORNEY-PRIVACY)
- [ ] Are the three drafts adequate for Kentucky and Indiana, and do they describe the services actually used (Render hosting, Cloudflare R2 storage, Bird texts and phone number, Resend email, Square payments outside the software; staff sign in through the app's own login)?
- [ ] Do the Kentucky and Indiana consumer data privacy laws apply to HandyHub (thresholds), and if so, what must the privacy policy add? Nothing about them is stated today.
- [ ] Is a statement about children's information needed? None is made.
- [ ] Is the sentence "This website does not use advertising cookies or third-party tracking." acceptable as a commitment, and is a separate cookie notice needed for the sign-in cookie and the browser draft?

## 2. Name and entity (OQ-LEGAL-ENTITY-NAME, OQ-BIRD-10DLC; owner and attorney)
- [ ] The pages and the footer say: "HandyHub is the brand name of ODD JOBS & MORE LLC, a Kentucky limited liability company." The DBA "HandyHub" is not filed (FACT-LEGAL-ENTITY). Is this wording acceptable, or must the assumed name be filed first?
- [ ] Estimates and invoices print "Handyhub LLC" (OWN-DEC-126). The legal pages do not mention that name. How does it relate to ODD JOBS & MORE LLC? RISK: a mismatch with the A2P 10DLC registration may fail campaign vetting (HH-COM-12).

## 3. SMS terms and the SMS section (OWN-DEC-147, OQ-BIRD-10DLC)
- [ ] Program name "HandyHub Service Texts" (PROPOSED by Claude; the graph names no program).
- [ ] The no-sharing sentence: "Mobile numbers and SMS opt-in data are never shared with or sold to third parties for marketing purposes." (privacy SMS section and SMS terms, word for word).
- [ ] The message list follows FACT-AUTOMATIC-MESSAGES and FACT-REMINDER-CADENCES, as the message registry may text them (version 2: one automatic estimate and one question reminder; the email-only messages are not listed). The frequency statement states only those cadences ("varies with your request and project").
- [ ] Version 2 adds the receipt's separate consent to a one-time verification code (OWN-DEC-178). The request form's checkbox and its disclosure are the owner's wording of OWN-DEC-190 (`sms-disclosure-2`). The A2P 10DLC package is `docs/10dlc/registration.md` (attorney packet A-12).
- [ ] "Message and data rates may apply.", "Reply STOP to opt out.", "Reply HELP for help.", "Reply START to receive texts again."
- [ ] Carrier disclaimers (for example "carriers are not liable for delayed or undelivered messages") are not included: the graph has no such decision. Needed?
- [ ] Whether a STOP confirmation text is sent is not stated (depends on the Bird keyword setup).
- [ ] **Owner:** the HELP reply text is NOT CONFIGURED (`sms.help_reply`, TSK-0048); Bird answers HELP with its own keyword rule until the owner sets it.
- [ ] **Owner:** the support contact (public phone and email) shows "Placeholder — not provided yet" (FACT-PUBLIC-CONTACT, OWN-DEC-131). RISK: campaign vetting needs a working support contact.

## 4. Privacy policy retention (OQ-RETENTION-REVIEW; CPA and attorney)
- [ ] The periods are the owner's decided schedule (FACT-RETENTION-SCHEDULE, OWN-DEC-70, OWN-DEC-142). The page shows "Pending CPA and attorney review". Do they meet tax, legal and employment-record minimums for Kentucky and Indiana?
- [ ] The schedule for regulated employee medical or exposure records is not on the customer page (it concerns staff); it needs its own reviewed schedule.

## 5. Website terms (OQ-ATTORNEY-TERMS)
- [ ] Cancellation, rescheduling and deposit refunds (FACT-CANCELLATION-RULES, OWN-DEC-134): wording shown with "Pending attorney review".
- [ ] 90-day workmanship warranty (FACT-WARRANTY, OWN-DEC-135): wording and any exclusions shown with "Pending attorney review"; no exclusion is invented.
- [ ] Topics deliberately left out because the owner has not decided them (OWN-DEC-127): governing law, venue, dispute resolution or arbitration, limitation of liability, indemnity, late fees or interest, forfeiture, damage-claim procedure, licensing or insurance statements. The page says so under "Topics not covered yet". Should any be added, and in what wording?
- [ ] Is an assent sentence ("by using this website ...") wanted? None is written.
- [ ] The estimate terms v1.0 (OWN-DEC-127) are a separate document shown with each estimate; check the two do not conflict.

## 6. Before production (OQ-GO-DECISION, TSK-0111)
- [ ] Reviewed wording published as new versions (status approved, `attorneyReviewed: true`), which removes the draft banner.
- [ ] Owner's documented approval of each version.
- [ ] Practices verified against the running system (vendors, retention queue, consent records, STOP/HELP/START through Bird).
