---
id: HH-ID-11
type: requirement
title: Customer account sessions, recovery and safe contact changes
status: active
priority: P0
area: identity
links:
  decided_by: ["[[OWN-DEC-96]]", "[[OWN-DEC-117]]"]
  depends_on: ["[[HH-ID-10]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[ENT-CustomerAccount]]", "[[ENT-Contact]]", "[[ENT-AuditEvent]]"]
  tested_by: ["[[T22]]"]
  part_of: ["[[C06]]", "[[C11]]"]
source: "guide 8.3 HH-ID-11; OWN-DEC-96, OWN-DEC-117"
---
- Account sessions have Sign Out, server-side revocation, inactivity and absolute expiry, and recovery through a verified contact.
- A sensitive contact change sends a notice to the old contact value. An email change verifies both the new contact and authority over the old account, or uses a documented, audited recovery process.
- After a contact change or recovery, sessions are renewed or revoked as designed, and the old contact keeps no unintended access.
