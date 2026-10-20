---
id: HH-COM-10
type: requirement
title: Real inbound email and text integrations with verified, replay-safe webhooks
status: active
priority: P0
area: messaging
links:
  decided_by: ["[[OWN-DEC-120]]", "[[OWN-DEC-129]]", "[[OWN-DEC-60]]"]
  depends_on: ["[[HH-SEC-03]]", "[[HH-NFR-03]]"]
  constrained_by: ["[[RULE-SYNTHETIC-DATA]]", "[[RULE-NO-INVENTED-FACTS]]"]
  uses: ["[[INT-Bird]]", "[[INT-Resend]]", "[[INT-Render]]", "[[ENT-Message]]", "[[ENT-ConsentPreference]]"]
  tested_by: ["[[T74]]", "[[T71]]"]
  part_of: ["[[S06]]"]
source: "OWN-DEC-120 (Telnyx replaced by Bird per OWN-DEC-129)"
---
- The unified inbox needs real inbound integrations; outbound sending alone is not a working inbox.
  - Texts: the Bird inbound SMS webhook for the business number, with the provider's signature verification.
  - Email: the Resend inbound email webhook with its signature verification; if inbound is unavailable in the version used, a generic inbound-email webhook adapter with HMAC verification, documented for the owner.
- Webhook secrets and keys come from environment variables the owner sets in the host (never in chat or files). While a channel's secrets are unset, the inbox shows that channel as "Inbound not configured" and never pretends messages were received.
- Webhook endpoints are rate-limited, size-limited and replay-protected (timestamp tolerance plus dedupe on the provider message ID). A failed signature check is rejected.
- Delivery-status webhooks update message states ([[HH-COM-02]]).
- Inbound STOP, HELP and START keywords are handled as [[HH-COM-05]] defines.
- Unsupported channels are flagged clearly.
