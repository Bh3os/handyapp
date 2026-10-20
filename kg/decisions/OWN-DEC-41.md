---
id: OWN-DEC-41
type: decision
title: Notification outbox merged with automatic drafts off until the roles amendment is approved
status: superseded
area: messaging
links:
  superseded_by: ["[[OWN-DEC-65]]", "[[OWN-DEC-78]]", "[[OWN-DEC-95]]"]
  related: ["[[HH-COM-04]]", "[[HH-COM-05]]", "[[HH-ARC-08]]"]
  uses: ["[[FACT-AUTOMATIC-MESSAGES]]"]
source: "vault-own-decisions.md OWN-DEC-41; owner answer 2026-10-05"
---
Owner wording (in-chat question, 2026-10-05, about system-made draft messages from events such as request received, visit scheduled or cancelled): "Merge, drafts off (Recommended)".

Recorded approach (2026-10-05): the outbox was merged; no message was drafted automatically from requests or visits; a message left draft only when staff released it, and a released message was kept, not sent, because no provider existed.

Superseded by later decisions:
- [[OWN-DEC-65]]: staff release each customer email; one-time codes and secure links send immediately.
- [[OWN-DEC-78]]: the system prepares reminder drafts for staff release.
- [[OWN-DEC-95]]: receipts and the other messages on the automatic-message exceptions list send automatically ([[FACT-AUTOMATIC-MESSAGES]]).
- Providers now exist: email through Resend ([[OWN-DEC-60]]), texts through Bird ([[OWN-DEC-129]]).
