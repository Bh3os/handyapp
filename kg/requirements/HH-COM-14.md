---
id: HH-COM-14
type: requirement
title: "Message lifecycle states and complete delivery records"
status: active
priority: P0
area: messaging
links:
  decided_by: ["[[OWN-DEC-152]]", "[[OWN-DEC-154]]"]
  depends_on: ["[[HH-COM-02]]", "[[HH-ARC-09]]"]
  uses: ["[[ENT-Message]]", "[[ENT-OutboxEvent]]"]
  tested_by: ["[[T66]]", "[[T65]]"]
  part_of: ["[[S06]]"]
source: "OWN-DEC-152 (specification section 7), OWN-DEC-154"
---
- Each outgoing message moves through DRAFT, PENDING_APPROVAL, APPROVED, SCHEDULED, QUEUED, SENDING, PROVIDER_ACCEPTED, DELIVERED, FAILED, CANCELLED, EXPIRED and SUPPRESSED (existing equivalent states are reused). Template approval is a separate state from delivery; provider acceptance is never shown as delivery, and "read" only where it is actually measured ([[HH-COM-02]]).
- Each message records: message ID, template ID and version, triggering event ID, related request, project or job, recipient and channel, the approval or release identity, created, scheduled and sent times, provider message ID, delivery status, failure reason, retry history, suppression reason and the consent or preference decision applied.
- One idempotency key per message; bounded exponential retry; messages that exhaust retries go to a failed state that authorized staff see and may retry; nothing is discarded silently.
- Staff see whether a message is delivered, scheduled or failed, with queued and sent times.
- On staging, a message intercepted by a test provider or only previewed is never recorded as delivered.
- Records follow the retention schedule ([[FACT-RETENTION-SCHEDULE]]).
