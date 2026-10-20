---
id: ENT-Message
type: entity
title: "Message and notification delivery"
status: active
area: messaging
links:
  decided_by: ["[[OWN-DEC-120]]", "[[OWN-DEC-65]]", "[[OWN-DEC-95]]", "[[OWN-DEC-129]]"]
  uses: ["[[INT-Bird]]", "[[INT-Resend]]"]
source: "guide 22.1 Message/Delivery; 23 (Notification)"
---
A project conversation message, an outbound notification or reminder draft, or an inbound email or text.

**Fields:** thread and audience (customer or internal); author or template version; channel; destination; language (customer: English); idempotency key; release actor (for staff-released drafts); provider message ID; delivery state and attempts; error summary; linking state for inbound (matched, Needs Linking).

**States:** drafts `draft → released / cancelled`; outbound `queued → sending → sent → delivered` (where observable), failures `→ retry` or `permanent_failure`.

**Invariants:** only listed automatic messages send without release ([[FACT-AUTOMATIC-MESSAGES]]); state, suppression and consent rechecked at send time; never contains access codes, card data, amounts in invoice or estimate notices, or incident details; sent messages immutable; one send per idempotency key.

**Who may change:** staff per role; the customer writes in the project thread.
