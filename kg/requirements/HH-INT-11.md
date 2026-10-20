---
id: HH-INT-11
type: requirement
title: Rate limits and quiet spam controls without forcing accounts
status: active
priority: P0
area: intake
links:
  decided_by: ["[[OWN-DEC-73]]", "[[OWN-DEC-96]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]", "[[RULE-SYNTHETIC-DATA]]"]
  uses: ["[[ENT-Request]]"]
  tested_by: ["[[T18]]"]
  part_of: ["[[C02]]", "[[C03]]"]
source: "guide 7.3 HH-INT-11; OWN-DEC-96, OWN-DEC-73"
---
- Submissions, verification-code attempts and resends, upload capability issuance and repeated abuse are rate-limited on the server.
- Spam controls are quiet; an accessible challenge appears only when needed.
- Legitimate guests are never blocked by requiring a permanent account.
- On staging the whole site is also behind the access gate; the gate is separate from these limits and from customer and staff sign-in.
