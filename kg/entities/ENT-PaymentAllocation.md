---
id: ENT-PaymentAllocation
type: entity
title: "Payment allocation and credit application"
status: active
area: payments
links:
  decided_by: ["[[OWN-DEC-111]]", "[[OWN-DEC-104]]"]
source: "guide 22.1 PaymentAllocation"
---
The application of a payment or credit to an invoice or a deposit requirement.

**Fields:** payment or credit; target; amount; consumes (deposit allocation applied to the final invoice); allocated by and at; reversed by.

**Invariants:** transactional prevention of over-allocation and double credit; reversed by a new allocation, never edited.

**Who may change:** created with payment recording; reversals Owner-only.
