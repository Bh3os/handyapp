---
id: OWN-DEC-191
type: decision
title: "Launch in three phases: Owner Acceptance Testing on staging, invited customers, public; staging-only Reset Test Data"
status: active
area: ops
links:
  constrained_by: ["[[RULE-SYNTHETIC-DATA]]", "[[RULE-SERVER-AUTHZ]]"]
  related: ["[[OWN-DEC-22]]", "[[OWN-DEC-181]]", "[[OQ-GO-DECISION]]", "[[HH-OPS-05]]", "[[HH-OPS-06]]", "[[OWN-DEC-212]]"]
source: "owner answers 2026-10-21 R11-Q2"
---
Owner answer (round 11, question 2), option chosen "Invited customers first (Recommended)", with a mandatory Owner Acceptance Testing phase before any real customer is invited:

> Choose **Invited customers first (Recommended)**, but add a mandatory Owner Acceptance Testing phase before inviting any real customers.
>
> I want to personally test the complete HandyHub customer journey and verify that all website and business workflows function correctly before inviting anyone.
>
> Implement the following three-phase launch process.
>
> ## Phase 1 — Owner Acceptance Testing
> 1. Deploy the complete website, customer portal, staff portal, and backend services to protected staging.
> 2. Complete all automated, integration, security, and end-to-end tests.
> 3. Create safe test accounts for Customer, Guest Customer, Staff, Estimator, Office, and Owner roles.
> 4. Prepare a realistic end-to-end customer journey using test data.
> 5. Allow me to personally test the website as a customer, from submitting an estimate request through job completion, payment receipt, and project history.
> 6. Provide a simple testing checklist with direct links to relevant pages, expected outcomes, and instructions.
> 7. Allow me to report bugs and issues directly.
> 8. Fix reported problems and rerun affected tests.
> 9. Do not invite real customers or enable public submissions during this phase.
> 10. Do not use real payments, real customer information, or uncontrolled SMS/email delivery.
>
> ## Staging-Only Reset Test Data Button
> Implement a fully functional **Reset Test Data** feature in the Owner dashboard.
>
> ### Location and accessibility
> - Display the button under **Owner Dashboard → Staging Tools → Test Data Management**.
> - Label it **Reset Test Data**.
> - Make it clearly visible and easy to use.
> - Show an indication that the environment is STAGING / TEST MODE.
> - Make the interface responsive and accessible.
>
> ### Access and environment restrictions
> 1. Only authenticated users with the Owner role may access this feature.
> 2. Enforce authorization on the backend, not only in the interface.
> 3. The feature must operate exclusively in verified staging or isolated testing environments.
> 4. Never expose the reset action or its backend endpoint in production.
> 5. Require an explicit staging-environment configuration check before executing.
> 6. Reject reset operations if the environment cannot be positively identified as staging.
> 7. Do not allow the reset mechanism to connect to production databases, storage buckets, payment accounts, or messaging services.
>
> ### Reset behavior
> When I click **Reset Test Data**, the system should:
> 1. Remove test customer accounts, except designated reusable testing accounts.
> 2. Remove test service requests.
> 3. Remove test estimates and estimate revisions.
> 4. Remove test appointment windows and bookings.
> 5. Remove test jobs, job assignments, and staff visits.
> 6. Remove test change orders.
> 7. Remove test invoices, payments, deposits, and receipts.
> 8. Remove test customer conversations and notifications.
> 9. Remove test attachments, photos, and generated documents.
> 10. Clear pending test email/SMS notifications and scheduled reminders.
> 11. Invalidate test customer sessions and secure project links.
> 12. Remove or reset test workflow states and test-only operational records.
>
> Preserve:
> - Owner and designated reusable test accounts.
> - Role and permission configuration.
> - Service catalog and approved service descriptions.
> - Pricing configuration.
> - Service-area ZIP-code settings.
> - SOPs, hazards, tools, materials, and safety guidance.
> - Email and SMS templates.
> - Application settings.
> - Required database schemas and migrations.
>
> Resetting test data must not remove actual application configuration or cause previously implemented features to stop working.
>
> ### Confirmation and safety
> Before resetting:
> 1. Show a confirmation dialog explaining exactly what will be deleted.
> 2. Require me to type **RESET TEST DATA** to confirm.
> 3. Show the number of test records affected.
> 4. Offer a second action: **Reset & Create Fresh Test Data**.
> 5. Record the reset operation in a protected staging audit trail.
> 6. Prevent concurrent reset requests.
> 7. Safely handle partial failures and report any incomplete cleanup.
> 8. Make repeated resets safe and idempotent.
>
> ### Fresh test data
> When I choose **Reset & Create Fresh Test Data**, automatically generate realistic fictional data for:
> - Guest customers
> - Registered customers
> - New service requests
> - Estimates awaiting approval
> - Approved estimates
> - Estimate-visit appointments
> - Confirmed work appointments
> - Jobs in progress
> - Completed jobs
> - Change orders
> - Test invoices and payments
> - Customer conversations
> - Customer project history
>
> Use clearly labeled fictional test data.
> Never reuse real customer names, addresses, payment details, phone numbers, or emails.
> Use sandbox payment integrations and intercepted/test messaging only.
>
> ### Post-reset validation
> After a reset:
> - Verify that cleanup completed successfully.
> - Confirm preserved configuration remains intact.
> - Check database integrity and relationships.
> - Ensure obsolete test reminders cannot send later.
> - Verify reusable test accounts still work.
> - Confirm that the application is ready for another complete customer journey.
> - Show a reset summary and any errors in the Owner dashboard.
>
> ## Phase 2 — Limited Production Launch
> Only after I explicitly approve the completed Owner Testing phase:
> 1. Deploy the validated release to production.
> 2. Keep customer access invitation-only.
> 3. Allow a small group of invited customers to submit real requests.
> 4. Monitor requests, communications, appointment scheduling, approvals, invoices, and payments.
> 5. Verify that no major errors, unauthorized access, duplicate charges, or broken workflows occur.
> 6. Keep unrestricted public submissions and search indexing disabled until the limited launch passes.
> 7. Keep the Reset Test Data feature completely unavailable in production.
>
> ## Phase 3 — Full Public Launch
> After I approve the invited-customer launch:
> 1. Open the public website and estimate request form.
> 2. Enable appropriate search-engine indexing.
> 3. Activate approved SEO and local service-area pages.
> 4. Verify the live domain, SSL, authentication, forms, and notification systems.
> 5. Enable production SMS only after A2P 10DLC registration and required approvals are complete.
> 6. Monitor production errors, performance, failed communications, and customer support issues.
>
> ## Final Implementation Requirements
> - Do not request additional approval for individual implementation tasks that are already authorized.
> - Do not move to invited production or full public launch without my explicit approval.
> - Maintain strict separation between staging and production.
> - Provide working staging URLs and secure access to test accounts.
> - Prepare a complete Owner Acceptance Testing checklist.
> - Keep manual accessibility testing marked UNVERIFIED until actually completed.
> - Report remaining critical blockers and optional improvements separately.
> - Deploy and verify the staging Reset Test Data feature before handing over the customer journey for my testing.
>
> **My priority is to launch HandyHub ASAP while personally verifying the complete customer experience before any real customers are invited.**
>
> Proceed with implementation, testing, staging deployment, and preparation for Owner Acceptance Testing now.

Effect:
- Phase 1, Owner Acceptance Testing: the complete site, portal, staff app and backend on protected staging; all automated, integration, security and end-to-end tests run; safe test accounts for Customer, Guest Customer, Staff, Estimator, Office and Owner; a realistic test journey and a simple checklist with direct links, expected outcomes and instructions; a direct way for the owner to report issues; fixes with affected tests rerun; no real customers, public submissions, real payments, real customer data or uncontrolled email or text.
- Reset Test Data (Owner Dashboard → Staging Tools → Test Data Management), Owner only, enforced on the server, working only in a positively identified staging or test environment and never exposed in production; it removes the listed test records and preserves the listed configuration; a confirmation dialog explains what goes, shows the counts and needs the typed words RESET TEST DATA; a second action "Reset & Create Fresh Test Data" creates clearly labelled fictional data; protected staging audit, no concurrent resets, partial failures reported, repeatable; post-reset validation and a summary in the Owner Dashboard ([[HH-OPS-05]]).
- Phase 2, limited production: only after the owner explicitly approves phase 1; invitation-only access, a small group of invited customers, monitoring, public submissions and search indexing off, Reset Test Data unavailable.
- Phase 3, public launch: after the owner approves phase 2; public site and request form open, indexing, SEO and service-area pages on, domain, TLS, sign-in, forms and notifications verified; production SMS only after A2P 10DLC approval ([[OWN-DEC-190]]); monitoring.
- Already authorized implementation tasks need no further approvals; moving to phase 2 or 3 needs the owner's explicit approval (production releases stay with the owner, [[OWN-DEC-22]]); staging and production stay strictly separate; manual accessibility testing stays UNVERIFIED ([[OWN-DEC-181]]); critical blockers and optional improvements are reported separately; Reset Test Data is deployed and verified before the journey is handed over.
- Prerequisite: staging runs this repository ([[TSK-0112]]). Each phase decision remains [[OQ-GO-DECISION]]. Built by [[TSK-0141]], [[TSK-0142]] and [[TSK-0111]].

**Retained by [[OWN-DEC-212]] (2026-10-22):** protected staging and Owner Acceptance Testing come before inviting any customer; merges also need security, migration and interaction review beyond CI, and passing CI alone never establishes production readiness.
