---
id: OWN-DEC-53
type: decision
title: Deploy the rebuilt website and the staff app to staging
status: active
area: ops
links:
  related: ["[[HH-AUD-05]]"]
  uses: ["[[INT-Render]]"]
  constrained_by: ["[[RULE-SYNTHETIC-DATA]]"]
source: "vault-own-decisions.md OWN-DEC-53; project chat 2026-10-06"
---
Owner wording (project chat, 2026-10-06): "No deploy i want see how it works and i want to see how the employees dite works too", then "No i mean i want deploy gor both sites".

Effect:
- Both sites (the public website with the customer portal, and the staff app) are deployed to the single Render staging service `handyhub-staging`.
- Staging only: production, the real domain and opening the production request form stay with the go decision ([[OWN-DEC-22]]).
- Staging keeps its defaults: not indexed, synthetic data, phone placeholder.

Partly replaced by [[OWN-DEC-73]]: the whole staging environment sits behind an access gate. [[OWN-DEC-130]]: the same staging service will point at the new repository `Bh3os/handyapp`.

Open:
- The go decision for production: [[OQ-GO-DECISION]].
