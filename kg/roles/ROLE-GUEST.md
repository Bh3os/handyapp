---
id: ROLE-GUEST
type: role
title: "Guest (public visitor and unverified requester)"
status: active
area: site
links:
  decided_by: ["[[OWN-DEC-87]]", "[[OWN-DEC-96]]", "[[OWN-DEC-97]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  part_of: ["[[ROLE-MATRIX]]"]
source: "guide 7; vault 27 ROLE-001; OWN-DEC-87, 96"
---
An unauthenticated visitor, or a requester whose contact is not yet verified.

- Browses public pages, checks coverage, submits a request without an account (write-only), uploads draft photos through an expiring draft capability, verifies a contact by one-time code, requests new access when a link expired.
- Sees nothing private: a reference number grants no access; a matching email or phone reveals no earlier projects. After verification the person acts as [[ROLE-CUSTOMER]] for that project only.

Full permissions: [[ROLE-MATRIX]].
