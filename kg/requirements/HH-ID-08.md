---
id: HH-ID-08
type: requirement
title: Access secrets never leak through URLs, analytics, caches or logs
status: active
priority: P0
area: identity
links:
  constrained_by: ["[[RULE-SERVER-AUTHZ]]", "[[RULE-SYNTHETIC-DATA]]"]
  depends_on: ["[[HH-SEC-04]]"]
  uses: ["[[ENT-ProjectAccessGrant]]"]
  tested_by: ["[[T74]]"]
  part_of: ["[[C03]]", "[[C06]]"]
source: "guide 8.2 HH-ID-08"
---
- After an exchange, secrets are removed from the address bar and history where feasible.
- Access pages are excluded from analytics, referrer leakage (strict referrer policy), third-party embeds and shared caches.
- Raw tokens and codes are never logged or put in audit diffs.
- Only maintained identity and cryptography primitives are used; no invented cryptography.
