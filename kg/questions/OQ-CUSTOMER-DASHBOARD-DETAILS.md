---
id: OQ-CUSTOMER-DASHBOARD-DETAILS
type: question
title: The customer dashboard and project claiming details no decision gives
status: open
area: identity
links:
  related: ["[[OWN-DEC-160]]", "[[OWN-DEC-198]]", "[[HH-ID-14]]", "[[HH-ID-03]]", "[[HH-ID-02]]", "[[ENT-CustomerIdentityLink]]", "[[ENT-Project]]", "[[FACT-SESSION-TIMINGS]]", "[[TSK-0124]]"]
source: "TSK-0124 (2026-10-26): OWN-DEC-160 and OWN-DEC-198 state the rules; the details below are PROPOSED"
---
**Question:** does the owner approve, or change, these PROPOSED details of the permanent customer dashboard and of claiming a guest project into an account?

- **Who answers:** the owner.
- **Decided, in use ([[OWN-DEC-160]], [[OWN-DEC-198]]):** a signed-in customer sees every project linked to their verified identity in Active, Completed (Project History) and Cancelled/Archived, with a new-request action and each project's documents; a guest project joins an account only after the customer proves control of that project's verified contact, never on an unverified name, phone or email match; guest links last 24 hours and their expiry never closes or moves a project; access is logged. The 24-hour link (`access.grants`) and the reissue limit of 3 per project per day (`access.recovery`) are now recorded as decided values (migration 0119).
- **PROPOSED, in use on private staging:**
  - **Which section a project is in.** Active: open, approved, and a cancellation still under the Owner's review. Project History: completed (the Owner's quality review passed), and closed after closeout with a completed job. Cancelled and archived: canceled, and closed without a completed job (Not a fit, withdrawn, Closed—no response).
  - **Where the dashboard is.** The portal's projects page (`/portal/`) is the dashboard for an account; the account page (`/account`) links to it ("Open your dashboard"). A guest link's session sees its one project the same way, in its section, without Add a project.
  - **Documents on the dashboard.** Each project shows how many documents its Documents tab lists (the estimate versions received and the issued invoices) and links to that tab, where the downloads are.
  - **How a project is claimed (Add a project).** Signed in, the customer gives the request reference from the receipt and the email or mobile phone on that request. A one-time code (the owner's code message, [[OWN-DEC-150]]) goes to the request's contact only when a code already verified exactly that value for it (the phone only by text, while texting is available and with its SMS permission); entering it adds that one project. The account's own sign-in email proves nothing about another project, even when it is the same address: a code to the project's contact is always needed. Every request gets the same answer ("If these details match a HandyHub request, we sent a code to the contact on that request."), whether or not anything matched. A project not yet verified on its receipt cannot be claimed this way; the customer verifies it on its receipt or link first, or asks HandyHub for help ([[OQ-ACCOUNT-SECURITY-DETAILS]]).
  - **What a claim never restores.** A project whose link to this account was revoked, or whose newest guest link staff revoked or revoked for an account deletion, is not added by a claim (nothing is sent); staff restore access ([[OWN-DEC-198]] F5).
  - **Limits.** Code requests: 10 per network per hour; entered codes: 30 per network per hour; plus the configured per-code and per-address code limits.
  - **Access logs.** The audit log records each claim request (whether a code went, and for which project), each claim and refused code, and each issue of estimate and invoice download links (staff only; never a reference, contact value, code or link).
  - **Wording.** Customer catalog `portal.projects.section.*`, `portal.projects.documents.*`, `portal.claim.*` and `account.projects.dashboard`; "Project History" is the owner's.
- **Until answered:** the PROPOSED details above are used; each is a small change to the nodes or the code.
