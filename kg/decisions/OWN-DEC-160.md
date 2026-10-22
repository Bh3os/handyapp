---
id: OWN-DEC-160
type: decision
title: "Guest access links last 24 hours; registered customers get a permanent dashboard; verified guest-to-account claiming"
status: active
area: portal
links:
  uses: ["[[FACT-SESSION-TIMINGS]]"]
  related: ["[[OWN-DEC-97]]", "[[OWN-DEC-63]]", "[[OWN-DEC-71]]", "[[OWN-DEC-141]]", "[[HH-ID-14]]"]
source: "owner answers 2026-10-21 R3-Q3"
---
Owner answer (round 3, question 3), option chosen "24 hours for secure access-link expiration" with a permanent customer project-access experience:

> Choose **24 hours for secure access-link expiration**, but implement a permanent customer project-access experience.
>
> I want HandyHub customers to retain access to their projects throughout the project lifecycle and to have access to their project history after completion.
>
> Implement the following:
>
> **1. Guest customers**
> - Customers can continue without creating an account.
> - Provide secure project access through a link that expires after 24 hours.
> - Allow customers to request a replacement link whenever their project remains accessible, subject to appropriate verification and abuse prevention.
> - Expiration of an access link must never delete or close the project.
> - Guests can view their authorized project details, appointments, estimates, invoices, receipts, and communications using a valid authenticated session or access link.
>
> **2. Registered customers**
> - Provide a permanent customer dashboard accessible through secure account authentication.
> - Display all projects associated with the customer's verified identity.
> - Organize projects into Active, Completed, and Cancelled/Archived sections.
> - Customers can view their project history without requesting a new project-access link each time.
> - Preserve historical estimate versions, accepted estimates, approved change orders, invoices, receipts, and available documents.
> - Support easy navigation between projects and creation of new service requests.
> - Require additional verification for sensitive actions when appropriate.
>
> **3. Guest-to-account conversion**
> - Allow guest customers to create an account at any time.
> - Securely associate existing guest projects with their verified account.
> - Never automatically link projects based only on an unverified name, phone number, or email match.
> - Prevent unauthorized project claiming or cross-customer access.
>
> **4. Completed projects**
> - Move projects to Project History after authorized completion.
> - Keep completed projects accessible according to HandyHub's approved retention and privacy policies.
> - Maintain legally required business records separately from customer-facing account access.
> - Allow customers to download available historical documents.
> - Never delete required business records merely because a guest link expires.
> - Respect account-deletion requests and applicable retention obligations.
>
> **5. Security**
> - Keep email-based access links short-lived, revocable, and project-scoped.
> - Use secure sessions for authenticated customers.
> - Require appropriate authorization checks for every project and document request.
> - Never expose project data through predictable reference numbers.
> - Protect account recovery and project-claiming workflows.
> - Maintain access logs and prevent unauthorized data disclosure.
>
> **6. Customer experience**
> - Create a professional customer dashboard consistent with HandyHub's premium home-improvement branding.
> - Make the experience mobile-friendly and available in English and Spanish.
> - Clearly distinguish active projects from completed project history.
> - Make it easy to return to old projects, review documents, contact support, and request new services.
>
> Implement, test, and publish this functionality to private staging. Use test customers and projects, and do not enable access to real customer data until security testing passes.

Effect:
- Guest project links expire 24 hours after issue ([[FACT-SESSION-TIMINGS]]); the PROPOSED `access.grants` value of 24 hours is now decided. A replacement link can be requested whenever the project is still accessible, with verification and abuse prevention ([[HH-ID-09]]). A link's expiry never closes or deletes a project or any business record.
- Registered customers get a permanent dashboard behind account sign-in with every project linked to their verified identity, in three sections: Active, Completed (Project History) and Cancelled/Archived; the history of estimate versions, accepted estimates, approved change orders, invoices, receipts and documents; navigation between projects; and a new-request action. Sensitive actions ask for fresh verification ([[HH-ID-07]]).
- A guest can create an account at any time; existing guest projects attach only through verified contact ownership, never on an unverified name, phone or email match ([[HH-ID-02]], [[HH-ID-03]]).
- Completed projects move to Project History and stay accessible under the retention and privacy policies; legally required business records are kept separately from customer access; deletion requests are respected ([[OWN-DEC-71]]).
- Email links are short-lived, revocable and project-scoped; every project and document request is authorized; reference numbers never expose data; claiming and recovery are protected; access is logged.
- Language: English only. The "English and Spanish" of item 6 is replaced by the later answer [[OWN-DEC-162]].
- Answers [[OQ-ACCESS-LINK-LIFETIME]]. Built by [[TSK-0124]].
