---
id: OWN-DEC-22
type: decision
title: No production deployment or real-customer contact without the owner's go decision
status: active
area: ops
links:
  related: ["[[HH-AUD-05]]"]
  constrained_by: ["[[RULE-SYNTHETIC-DATA]]"]
source: "vault-own-decisions.md OWN-DEC-22; owner message 2026-10-04 (HANDOFF section 2)"
---
Owner wording (project chat, 2026-10-04): "Do not deploy to production or contact real customers without my explicit go decision."

Effect:
- Only local, CI and staging environments exist until the go decision; they use synthetic data.
- No message reaches a real customer: outside production, email and texts go only to allow-listed test destinations.
- The launch gate ends with the owner's explicit go decision; production releases stay with the owner.

Open:
- The owner's go decision for production: [[OQ-GO-DECISION]].
