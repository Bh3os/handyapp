---
id: ENT-WebhookReceipt
type: entity
title: "Webhook receipt"
status: active
area: platform
links:
  decided_by: ["[[OWN-DEC-120]]", "[[OWN-DEC-129]]"]
  uses: ["[[INT-Bird]]", "[[INT-Resend]]"]
source: "guide 22.1 WebhookReceipt"
---
An authenticated inbound provider event (Bird SMS, Resend email and delivery-status events). Square has no webhooks.

**Fields:** provider; provider event ID; signature verification result; received time; processing state; linked message.

**Invariants:** provider event ID unique; signature and timestamp verified, replays rejected; never overwrites record state arbitrarily; while secrets are unset the channel shows "Inbound not configured".

**Who may change:** the server only.
