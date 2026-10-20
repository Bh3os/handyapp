---
id: HH-COM-07
type: requirement
title: Unified inbox with reliable matching and a private Needs Linking list
status: active
priority: P0
area: messaging
links:
  decided_by: ["[[OWN-DEC-120]]", "[[OWN-DEC-129]]"]
  depends_on: ["[[HH-COM-10]]", "[[HH-OPS-01]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[ENT-Message]]", "[[ENT-Contact]]", "[[ENT-Project]]", "[[ENT-AuditEvent]]", "[[INT-Bird]]", "[[INT-Resend]]"]
  tested_by: ["[[T68]]", "[[T21]]"]
  part_of: ["[[S06]]"]
source: "OWN-DEC-120"
---
- One staff inbox holds project messages and supported inbound and outbound email and texts, each linked to the correct customer and project.
- Matching uses reliable conversation references and contact records, never names alone:
  - email: a per-project reply-to token (plus-addressing or a unique reply token), or In-Reply-To/References headers matching sent message IDs, then a verified contact email;
  - text: the verified phone number plus the latest open conversation.
- If several projects could match, the message goes to **Needs Linking** for staff review.
- Unmatched messages are private to authorized office staff; other roles are refused.
- Linking corrections are recorded in the audit log; the original message is kept unchanged.
- The inbox contributes "Needs Linking", "customer replied" and "delivery failed" items to the action queue ([[HH-OPS-01]]).
