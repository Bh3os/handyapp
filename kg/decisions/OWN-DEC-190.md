---
id: OWN-DEC-190
type: decision
title: "A2P 10DLC: prepare the complete registration now; SMS consent at the request form and on the receipt"
status: active
area: messaging
links:
  constrained_by: ["[[RULE-NO-INVENTED-FACTS]]", "[[RULE-HUMAN-REVIEW]]"]
  uses: ["[[FACT-LEGAL-ENTITY]]", "[[INT-Bird]]", "[[FACT-PUBLIC-CONTACT]]", "[[FACT-DOMAIN]]"]
  related: ["[[OWN-DEC-147]]", "[[OWN-DEC-129]]", "[[HH-COM-12]]", "[[HH-INT-22]]", "[[OQ-BIRD-10DLC]]"]
source: "owner answers 2026-10-21 R11-Q1"
---
Owner answer (round 11, question 1), option chosen "Other — Prepare the complete A2P 10DLC registration for immediate submission.":

> I want to resolve this now, not postpone SMS implementation.
>
> You are authorized to prepare the complete registration package, implement the required website consent flows, and finish all technically possible setup steps without requesting additional routine approvals.
>
> ### 1. Business identity
> Use the verified legal business details:
> - Legal entity: ODD JOBS & MORE LLC
> - Customer-facing brand: HandyHub
> - Website: https://handyhub247.com
> - Business type: LLC / privately held business
> - Service area: Kentucky and Indiana
> - Messaging purpose: Transactional customer service, appointment notifications, project updates, and phone verification
>
> Use the legal EIN, registered address, and authorized contact details from the secure business configuration if available.
>
> Do not invent missing legal information or expose the EIN in source code, logs, or documentation.
>
> ### 2. Verify the SMS provider
> The question references Bird, but previous HandyHub requirements referenced Telnyx.
> Inspect the existing application and provider configuration. Determine which SMS provider is actually integrated and intended for production.
> Use one confirmed provider and avoid creating duplicate messaging infrastructures.
> Prepare the registration through the confirmed provider's current supported process.
>
> ### 3. Campaign registration
> Prepare the complete registration details, including:
> - Legal brand identity
> - Business contact information
> - Campaign description
> - Appropriate campaign use case
> - Message flow
> - Opt-in methods
> - Opt-out and HELP behavior
> - Sample SMS messages
> - Privacy Policy and Terms of Service URLs
> - Required evidence of customer consent
>
> Do not assume every message type belongs in a single campaign. Verify provider requirements, particularly for one-time verification codes versus recurring service notifications.
> Do not register marketing messages unless a separate compliant marketing-consent process has been approved.
>
> ### 4. Customer opt-in points
> Implement optional, unchecked SMS consent checkboxes at:
>
> **A. Estimate request form**
> Suggested consent wording:
> "I agree to receive text messages from HandyHub about my service requests, estimates, appointments, and project updates at the phone number provided."
>
> **B. Request receipt page**
> Suggested verification-specific consent wording:
> "I agree to receive a one-time SMS verification code from HandyHub at the phone number provided."
>
> Include the required disclosures immediately beside each checkbox:
> "Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for assistance. Consent is not required to purchase services."
>
> Include working links to the Privacy Policy and SMS Terms and Conditions.
> Keep verification consent, ongoing transactional-message consent, and marketing consent separate.
> Record consent evidence securely.
>
> ### 5. Sample SMS messages
> Prepare and adapt these samples to the actual registered use case:
> **Request received** "HandyHub: We received request {reference}. We'll review it and contact you with next steps. Reply STOP to opt out."
> **Phone verification** "HandyHub: Your verification code is {code}. It expires in {minutes} minutes. Do not share this code."
> **Estimate ready** "HandyHub: Your estimate {estimateNumber} is ready. Sign in to your secure project portal to review it. Reply STOP to opt out."
> **Appointment options** "HandyHub: Appointment options are ready for project {reference}. Visit your secure project portal to choose a time."
> **Appointment confirmation** "HandyHub: Your appointment is confirmed for {date}, arrival window {start}-{end} {zone}. Reply HELP for support."
> **Appointment reminder** "HandyHub: Reminder: your appointment is tomorrow, {date}, with arrival between {start} and {end} {zone}."
> **Project update** "HandyHub: There's an update about project {reference}. Please open your secure project portal for details."
> **Opt-out confirmation** "HandyHub: You've opted out of text messages. No further SMS notifications will be sent for this program."
> **Help response** "HandyHub: For assistance, contact {verifiedSupportContact}. Reply STOP to opt out."
> **Opt-in confirmation** "HandyHub: You're subscribed to service SMS updates. Message frequency varies. Message and data rates may apply. Reply HELP for help or STOP to opt out."
> Adapt each sample to provider length, disclosures, permitted links, approved use cases, and actual messaging behavior.
>
> ### 6. Technical implementation
> - Integrate with the existing messaging architecture.
> - Implement verified SMS consent records.
> - Support STOP and HELP handling.
> - Apply the established customer-local SMS quiet-hours rules.
> - Keep transactional email delivery independent of SMS.
> - Queue messages safely and prevent duplicates.
> - Maintain delivery status and audit records.
> - Protect authentication codes and access tokens.
> - Apply SMS rate limits and OTP expiration rules.
> - Verify provider webhook signatures.
> - Use test credentials and test recipients in staging.
>
> ### 7. Registration readiness
> Before submission, verify that:
> - The business legal identity is accurate.
> - The customer-facing HandyHub brand is clearly connected to the LLC.
> - Opt-in checkboxes are implemented and functional.
> - Privacy Policy and Terms links work.
> - The disclosures match the campaign.
> - Consent evidence can be demonstrated through screenshots or URLs.
> - All mandatory provider fields are completed.
> - Sample messages match real product behavior.
> - The chosen campaign category is appropriate.
> - No prohibited or unsupported messages are included.
>
> ### 8. Complete the task now
> Implement, test, and deploy all registration prerequisites to private staging.
> Prepare a submission-ready Brand and Campaign registration package using actual verified information.
> If secure provider integration supports submission and the necessary information and authorization are available, prepare the submission using that supported workflow. Do not incur registration fees or submit legally binding business representations without my explicit confirmation.
> If the EIN or other mandatory identity details are missing, identify the exact secure provider fields I must complete myself.
> Do not hold up unrelated website development while waiting for carrier approval.
> Keep live SMS disabled until registration and number association are approved.
>
> ### Final deliverables
> 1. Verified SMS provider. 2. Completed Brand registration details. 3. Completed Campaign registration details. 4. Final consent wording and implemented opt-in URLs. 5. Sample messages. 6. Screenshots or other required consent evidence. 7. Test results. 8. Registration status. 9. Exact remaining steps, if any, for submitting and enabling live SMS.
>
> My goal is to complete all the preparation and technical work immediately, leaving only unavoidable identity verification, payment authorization, and external carrier approval.

Effect:
- Claude prepares the complete Brand and Campaign registration package now, implements the website consent flows and finishes every technically possible step without routine approval requests; unrelated development is not held up.
- Identity: ODD JOBS & MORE LLC with the brand HandyHub ([[FACT-LEGAL-ENTITY]]), an LLC, privately held, serving Kentucky and Indiana, for transactional customer service, appointment notifications, project updates and phone verification. The EIN, registered address and authorized contact come from the secure business configuration or are typed by the Owner into the provider's secure fields; they are never in source, logs or documentation. Missing values are listed as the exact provider fields the Owner completes.
- Website: https://handyhub247.com. RISK: the domain is not purchased yet ([[OWN-DEC-184]]); carrier vetting checks a working website, so submission waits for it.
- Provider: Bird is the integrated and intended provider ([[OWN-DEC-129]], [[INT-Bird]]); the Telnyx references come from the earlier vault and are superseded; one provider only. The registration follows Bird's current supported process, including whether one-time codes and recurring service notifications need separate campaigns. No marketing campaign is registered.
- Opt-in points, each an optional unchecked checkbox: (A) the request form, "I agree to receive text messages from HandyHub about my service requests, estimates, appointments, and project updates at the phone number provided."; (B) the receipt page, "I agree to receive a one-time SMS verification code from HandyHub at the phone number provided." ([[OWN-DEC-178]]). Beside each: "Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for assistance. Consent is not required to purchase services.", with working links to the Privacy Policy and the SMS Terms and Conditions. Verification consent, ongoing transactional consent and marketing consent stay separate; consent evidence is recorded securely. The wording still gets attorney review ([[OQ-ATTORNEY-PRIVACY]]).
- The ten sample texts of section 5 are the SMS wording, adapted to provider length, disclosures and real behaviour. `{verifiedSupportContact}` needs the real support contact; RISK: it is still a placeholder ([[FACT-PUBLIC-CONTACT]]).
- Technical: existing messaging architecture, consent records, STOP and HELP, customer-local quiet hours ([[OWN-DEC-154]]), email independent of SMS, safe queueing without duplicates, delivery status and audit, protected codes and tokens, SMS rate limits and code expiry, verified provider webhooks, test credentials and recipients on staging.
- No registration fee is incurred and no legally binding business representation is submitted without the owner's explicit confirmation. Live SMS stays off until the registration and number association are approved.
- Partly replaces [[OWN-DEC-147]] (consent wording and opt-in points). [[OQ-BIRD-10DLC]] stays open until submission and approval. Built by [[TSK-0133]] and [[TSK-0134]].
