---
id: HH-COM-02
type: requirement
title: Truthful message delivery states and retries without duplicate sends
status: active
priority: P0
area: messaging
links:
  decided_by: ["[[OWN-DEC-120]]", "[[OWN-DEC-106]]", "[[OWN-DEC-152]]"]
  depends_on: ["[[HH-ARC-09]]"]
  constrained_by: ["[[RULE-NO-INVENTED-FACTS]]"]
  uses: ["[[ENT-Message]]", "[[ENT-OutboxEvent]]", "[[INT-Bird]]", "[[INT-Resend]]"]
  tested_by: ["[[T66]]", "[[T65]]"]
  part_of: ["[[S06]]", "[[C06]]"]
source: "guide 21.1 HH-COM-02, 23 (notification states); OWN-DEC-120, OWN-DEC-106"
---
- Messages show draft, queued, sent, delivered (only where the provider reports it through status webhooks) and failed. "Read" is shown only if actually measured.
- Provider acceptance is never shown as proof the customer read the message.
- Retries use an idempotency key, so a retried message is never sent twice. Reply drafts (staff and customer) are kept across failures and tab switches.
- A failed send is never shown as sent; it becomes a staff exception with a retry action.

**Changed by [[OWN-DEC-152]] (2026-10-21):** the full lifecycle and record of every message is [[HH-COM-14]].
