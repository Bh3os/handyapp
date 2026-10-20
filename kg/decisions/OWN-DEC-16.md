---
id: OWN-DEC-16
type: decision
title: Explicit authorization for consequential actions
status: active
area: platform
links:
  related: ["[[HH-AUTO-02]]", "[[HH-API-04]]", "[[HH-COM-05]]"]
  uses: ["[[FACT-AUTOMATIC-MESSAGES]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
source: "vault-own-decisions.md OWN-DEC-16; owner facts L18 (2026-10-02)"
---
Owner wording (owner facts, 2026-10-02): "Preparing drafts is allowed. Sending messages, publishing, spending, refunds, binding commitments and access changes require applicable explicit authorization. Re-read current state before consequential action, reject stale versions, deduplicate effects and report failures without silent overwrite."

Effect:
- Drafts may be prepared freely.
- Sending messages, publishing, spending, refunds, binding commitments and access changes need explicit authorization by a permitted person.
- Every consequential action re-reads the current state, rejects stale versions (expected-version checks), deduplicates its effects (idempotency keys) and reports failures without silently overwriting anything.
- Refund approval is human-only.

Partly replaced by [[OWN-DEC-95]]: the automatic-message exceptions list is the approved auto-send policy; messages on it send without a staff release ([[FACT-AUTOMATIC-MESSAGES]]).
