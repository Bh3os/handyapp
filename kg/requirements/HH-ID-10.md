---
id: HH-ID-10
type: requirement
title: Optional customer accounts with passwordless one-time-code sign-in
status: active
priority: P0
area: identity
links:
  decided_by: ["[[OWN-DEC-63]]", "[[OWN-DEC-87]]", "[[OWN-DEC-97]]", "[[OWN-DEC-106]]", "[[OWN-DEC-114]]"]
  depends_on: ["[[HH-ID-03]]", "[[HH-INT-13]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[ENT-CustomerAccount]]", "[[ENT-AuthIdentity]]", "[[ENT-CustomerIdentityLink]]", "[[INT-Resend]]", "[[INT-Bird]]"]
  tested_by: ["[[T20]]"]
  part_of: ["[[C01]]", "[[C03]]", "[[C06]]", "[[C11]]"]
source: "guide 8.3 HH-ID-10; OWN-DEC-63, OWN-DEC-87, OWN-DEC-97"
---
- Customers who want an account sign in with a one-time code sent to a verified email or phone; there is no customer password. The code system is the hashed, expiring one-time-code system also used for verification.
- Create an Account and Sign in are offered in the request entry choice ([[HH-INT-01]]) and, for guests, on the receipt ([[HH-INT-14]]).
- Enrollment verifies the chosen contact, records the customer's intent to create an account, and attaches only authorized existing grants and records. A guest's verified request and project are linked without duplicates; the original records keep their IDs.
- Account customers can switch between their authorized linked projects ([[HH-PORT-09]]).
- Passkeys are P1. No custom authentication system is built. The staff password login ([[HH-STAFF-01]]) does not affect customer sign-in.
