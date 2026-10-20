---
id: INT-Resend
type: integration
title: Resend - email
status: active
area: messaging
links:
  decided_by: ["[[OWN-DEC-129]]", "[[OWN-DEC-95]]", "[[OWN-DEC-120]]"]
  constrained_by: ["[[RULE-SYNTHETIC-DATA]]"]
source: "OWN-DEC-129; old repo notification outbox"
---
Resend sends every email:
- automatic receipts, codes and links;
- automatic notices ([[FACT-AUTOMATIC-MESSAGES]]);
- staff-released messages.

Each email carries a per-project reply token, so replies thread back to the right project ([[OWN-DEC-120]]).

- **Inbound email:** goes through Resend inbound or a signature-verified generic webhook. Signatures are verified and replays rejected.
- **Configuration:** the owner sets the keys in Render. The sender domain must be verified.
- **Staging:** sends only to approved test addresses.
