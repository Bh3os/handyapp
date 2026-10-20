---
id: ENT-OutboxEvent
type: entity
title: "Outbox event"
status: active
area: platform
source: "guide 22.1 OutboxEvent; HH-ARC-08"
---
A durable event written in the same transaction as a business change.

**Fields:** type; aggregate ID and version; minimal payload; idempotency key; processing state (pending, processing, done, failed, dead-lettered); attempts; error.

**Invariants:** created with the mutation; consumers are idempotent; a send failure never rolls back the business change; permanent failures are visible to staff. A critical hold never goes through the outbox.

**Who may change:** the server only.
