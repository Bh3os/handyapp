---
id: INT-Bird
type: integration
title: Bird - SMS and business phone number
status: active
area: messaging
links:
  decided_by: ["[[OWN-DEC-129]]", "[[OWN-DEC-120]]"]
  constrained_by: ["[[RULE-SYNTHETIC-DATA]]"]
source: "OWN-DEC-129; Bird docs"
---
Bird is used for texts and for the business phone number.

**Outbound SMS**
- Bird sends the automatic notices ([[FACT-AUTOMATIC-MESSAGES]]) and the staff-released texts.
- Each send carries an idempotency key, so a retry never sends twice.
- Delivery statuses come back by webhook: queued, sent, delivered or failed. A failure becomes a staff action item.

**Inbound SMS**
- Bird delivers inbound texts by webhook into the unified inbox ([[OWN-DEC-120]]).
- Webhook verification follows Standard Webhooks (Bird docs, guides/webhooks):
  - Headers: `webhook-id`, `webhook-timestamp` and `webhook-signature`. The signature header holds `v1,<base64 HMAC-SHA256>`, and may hold several signatures separated by spaces.
  - The signature is an HMAC-SHA256 over `{webhook-id}.{webhook-timestamp}.{raw body}`. The key is the endpoint secret with the `whsec_` prefix removed, then base64-decoded.
  - Verify against the raw body, before parsing it.
  - Reject a delivery whose timestamp is more than 5 minutes old.
  - De-duplicate on `webhook-id`: Bird's retries reuse it.
- STOP and HELP keywords update the contact's channel permissions.

**Phone number**
- The business number is bought and configured in Bird, then used as the public phone number ([[FACT-PUBLIC-CONTACT]]).

**Configuration and limits**
- Credentials (the API key and the webhook signing secret) are set by the owner in Render as environment variables.
- Staging sends only to approved test numbers.
- US texting from a 10-digit long code needs A2P 10DLC brand and campaign registration before production use ([[OQ-BIRD-10DLC]]).
