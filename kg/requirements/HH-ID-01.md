---
id: HH-ID-01
type: requirement
title: Customer and contact records for every request, separate from login identities
status: active
priority: P0
area: identity
links:
  decided_by: ["[[OWN-DEC-116]]", "[[OWN-DEC-117]]", "[[OWN-DEC-97]]"]
  depends_on: ["[[HH-CRM-04]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[ENT-Customer]]", "[[ENT-Contact]]", "[[ENT-AuthIdentity]]", "[[ENT-CustomerIdentityLink]]", "[[ENT-ProjectAccessGrant]]"]
  tested_by: ["[[T20]]", "[[T21]]"]
  part_of: ["[[C03]]", "[[S02]]", "[[S03]]"]
source: "guide 8.1 HH-ID-01; OWN-DEC-116, OWN-DEC-117"
---
- Every genuine request creates or is associated with Customer and Contact records. Login identities (customer accounts) and project access grants are separate entities from the customer record.
- At submission a request is associated with an existing customer only through a verified identity (a signed-in account with verified contacts) or an explicit staff link ([[HH-CRM-04]]). Otherwise a new customer and contact are created; matching details only produce a duplicate suggestion for staff ([[HH-ID-02]]).
- An account can be linked later without duplicating requests, properties, estimates, invoices or jobs; the original records keep their IDs.
