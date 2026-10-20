---
id: HH-FIN-13
type: requirement
title: "Returned checks and failed or disputed payments keep evidence"
status: active
priority: P0
area: payments
links:
  decided_by: ["[[OWN-DEC-111]]", "[[OWN-DEC-112]]"]
  uses: ["[[ENT-Payment]]", "[[ENT-PaymentAllocation]]", "[[ENT-DepositRequirement]]", "[[ENT-Case]]"]
  tested_by: ["[[T63]]"]
  part_of: ["[[C10]]"]
source: "guide 20.4 HH-FIN-13"
---
- A returned check or a failed or disputed payment never edits or deletes the payment. An adjustment record and a reversing allocation are appended; the balance reopens; the receipt shows as voided; a deposit it satisfied reverts to required.
- Staff and the customer then see the accurate current payment state and balance.
- An open billing dispute pauses routine payment reminders ([[HH-FIN-19]]) and routes to the Owner.
