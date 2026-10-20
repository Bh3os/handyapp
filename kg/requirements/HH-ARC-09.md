---
id: HH-ARC-09
type: requirement
title: Idempotent background consumers with bounded retry, visible failures and reconciliation
status: active
priority: P0
area: platform
links:
  decided_by: ["[[OWN-DEC-129]]", "[[OWN-DEC-120]]"]
  depends_on: ["[[HH-ARC-08]]"]
  uses: ["[[ENT-OutboxEvent]]", "[[ENT-WebhookReceipt]]", "[[INT-Bird]]", "[[INT-Resend]]"]
  tested_by: ["[[T65]]", "[[T66]]", "[[T61]]"]
source: "guide 3.3"
---
- Delivery is at-least-once with idempotent effects; the system never promises "exactly once".
- Consumers deduplicate by event ID (and by provider message ID for inbound webhooks), so a repeated event has no second effect.
- Safe operations are retried with bounded exponential backoff. After the last attempt the event becomes a permanent failure, shown in a dead-letter/exceptions view with its owner and a safe manual retry.
- An uncertain provider outcome (a timeout after a send request to Bird or Resend, for example) is reconciled against the provider's own record before any retry; it is not blindly resent under a new key.
- Before sending, a consumer rechecks the current state, permissions and suppressions ([[HH-AUTO-01]]); an outdated message is cancelled, not sent.
- Queue age, retry counts and failures are observable ([[HH-NFR-02]]).
