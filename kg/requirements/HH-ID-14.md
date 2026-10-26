---
id: HH-ID-14
type: requirement
title: "Permanent customer dashboard, Project History and verified project claiming"
status: active
priority: P0
area: identity
links:
  decided_by: ["[[OWN-DEC-160]]", "[[OWN-DEC-198]]"]
  depends_on: ["[[HH-ID-10]]", "[[HH-ID-03]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]", "[[RULE-LANGUAGES]]"]
  uses: ["[[ENT-CustomerAccount]]", "[[ENT-CustomerIdentityLink]]", "[[ENT-Project]]", "[[ENT-ProjectAccessGrant]]", "[[ENT-Document]]"]
  tested_by: ["[[T20]]", "[[T19]]", "[[T22]]"]
  part_of: ["[[C06]]", "[[C11]]"]
source: "OWN-DEC-160 (new behaviour; no guide id)"
---
- A signed-in customer sees every project linked to their verified identity, in three sections: Active, Completed (Project History) and Cancelled/Archived, with navigation between projects and a new-request action.
- Each project keeps its estimate versions, accepted estimate, approved change orders, invoices, receipts and available documents for download, under the retention and privacy rules; legally required business records stay separate from customer access.
- No new access link is needed to return to a project; sensitive actions ask for fresh verification ([[HH-ID-07]]).
- A guest may create an account at any time; a guest project attaches to the account only after the customer proves control of the project's verified contact. Unverified name, phone or email matches never link a project ([[HH-ID-02]], [[HH-ID-03]]).
- Guest links last 24 hours ([[HH-ID-06]]); their expiry never closes or deletes a project; every project and document request is authorized on the server; access is logged.
- English only, mobile-friendly, in the premium design.

**Built by [[TSK-0124]] (2026-10-26):** a signed-in customer adds a guest project with **Add a project**: the request reference and the email or phone on that request, then a one-time code sent only to that request's already verified contact; every code request gets the same answer. Section rules, wording and limits are PROPOSED in [[OQ-CUSTOMER-DASHBOARD-DETAILS]].
