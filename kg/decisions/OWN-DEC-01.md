---
id: OWN-DEC-01
type: decision
title: Newer explicit decisions take precedence over the owner facts
status: active
area: business
links:
  constrained_by: ["[[RULE-NO-INVENTED-FACTS]]"]
source: "vault-own-decisions.md OWN-DEC-01; owner facts L2 (2026-10-02)"
---
Owner wording (owner facts, 2026-10-02): "Version 1.0. Owner facts recorded 2026-10-02; newer explicit decisions and current authoritative records take precedence."

Effect:
- The owner facts of 2026-10-02 (recorded as OWN-DEC-01 to OWN-DEC-18) apply until a newer explicit owner decision or a current authoritative record replaces them.
- A fact changes only through an explicit, recorded owner decision; informal statements never replace it.
- In this graph a replacement is recorded with `supersedes` on the newer decision and `status: superseded` plus `superseded_by` on the older one. A partial replacement keeps the older node active with a "Partly replaced by" line.
