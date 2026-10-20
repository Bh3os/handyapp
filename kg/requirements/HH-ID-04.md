---
id: HH-ID-04
type: requirement
title: Project access grants are high-entropy, hashed, expiring, revocable and single-project
status: active
priority: P0
area: identity
links:
  decided_by: ["[[OWN-DEC-97]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[ENT-ProjectAccessGrant]]", "[[ENT-Project]]", "[[ENT-Contact]]"]
  tested_by: ["[[T19]]"]
  part_of: ["[[C03]]", "[[C06]]"]
source: "guide 8.2 HH-ID-04; OWN-DEC-97"
---
- Project access credentials are high-entropy, stored only as a hash, expiring and revocable.
- Each grant records the project, the intended verified contact, the permitted actions, creation, expiry and revocation.
- A guest grant covers exactly one project. It never extends to other projects of the same customer or email.
- A public reference (`HH-XXXX`), a database ID or a storage key grants nothing.
