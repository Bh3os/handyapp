---
id: OWN-DEC-167
type: decision
title: "Three site checks at first-visit confirmation: verified address, authorized site contact, service-area coverage"
status: active
area: scheduling
links:
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[FACT-SERVICE-AREA]]"]
  related: ["[[HH-SCH-06]]", "[[OWN-DEC-179]]", "[[OQ-CONFIRMATION-PRECONDITIONS]]"]
source: "owner answers 2026-10-21 R5-Q2"
---
Owner answer (round 5, question 2), option chosen "Checkboxes at confirm (Recommended)", with automated pre-validation and staff verification:

> Choose **Checkboxes at confirm (Recommended)**, with automated pre-validation and staff verification.
>
> Implement the following requirements for HandyHub:
>
> **1. Verified Property Address**
> - Prepopulate the property address from the customer's approved project details.
> - Include apartment, suite, or unit number when applicable.
> - Validate the address using the existing address-verification system.
> - Require authorized staff to verify the address before confirming the first visit.
> - Record who verified it, when, and which address version was verified.
> - Revalidation is required if the service address materially changes.
>
> **2. Authorized Site Contact**
> - Require a designated site contact before confirming the first visit.
> - Record the contact's name, role, and appropriate contact information.
> - Confirm that the person is authorized to provide property access or coordinate the visit.
> - Allow the customer to designate themselves or another authorized person.
> - Do not assume a site contact has authority to approve financial changes or contractual decisions.
> - Reverify authorization if the designated contact changes.
>
> **3. Service-Area Coverage**
> - Automatically check the verified property address against HandyHub's configured service area.
> - Allow staff to confirm addresses clearly within the supported area.
> - Require explicit owner approval for edge-area exceptions or locations outside standard coverage.
> - Never allow staff to override a mandatory legal, licensing, or safety restriction.
> - Record the coverage result, approver, timestamp, and any exception reason.
>
> **4. Confirmation Rules**
> - Block first-visit confirmation until all three checks are completed.
> - Preserve the existing approval, deposit, safety/legal holds, crew qualifications, and capacity checks.
> - Display missing requirements clearly in the staff dashboard.
> - Persist verification results so employees do not need to repeat unchanged checks for every visit.
> - Recheck affected requirements whenever relevant project information changes.
> - Prevent ordinary staff from bypassing mandatory verification requirements.
> - Record a complete audit trail of verification actions.
>
> **5. Staff Experience**
> - Make the verification process simple and professional.
> - Prepopulate existing information instead of asking staff to enter it again.
> - Provide three clear confirmation checkboxes with relevant information displayed beside each one.
> - Use Spanish translations for the employee-facing workflow.
> - Do not permit blind confirmation without displaying the underlying information.
>
> **6. Testing**
> - Test valid and invalid addresses.
> - Test missing or unauthorized site contacts.
> - Test service-area exceptions.
> - Test changed addresses and contacts.
> - Test blocked confirmations.
> - Test owner-approved exceptions.
> - Test audit records and role permissions.
>
> Implement and test everything in private staging before enabling it in production.

Effect:
- The first visit of a project cannot be confirmed until authorized staff record three checks, each a checkbox with the underlying information beside it (no blind confirmation):
  1. Verified property address: prefilled from the project with any unit number, validated by the existing address verification, recorded with verifier, time and address version; rechecked when the address materially changes.
  2. Authorized site contact: name, role and contact details, authorized to give access or coordinate the visit (the customer or a person they name); never assumed to approve money or contract changes; rechecked when the contact changes.
  3. Service-area coverage of the verified address: SERVED is confirmed by staff with no owner approval ([[OWN-DEC-179]]); an edge or outside location needs the Owner's explicit exception approval; nobody overrides a legal, licensing or safety restriction; result, approver, time and exception reason are recorded.
- The existing approval, deposit, safety and legal hold, qualification and capacity checks stay ([[HH-SCH-06]]); missing items show on the staff dashboard; results persist across visits and are rechecked when the project information they rest on changes; ordinary staff cannot bypass them; every verification is audited; the workflow is in Spanish for Spanish-speaking staff.
- Answers the three "not checked yet" preconditions of [[OQ-CONFIRMATION-PRECONDITIONS]]. Built by [[TSK-0126]].
