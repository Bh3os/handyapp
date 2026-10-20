---
id: HH-FIN-09
type: requirement
title: "Only a staff-recorded verified payment changes a balance"
status: active
priority: P0
area: payments
links:
  decided_by: ["[[OWN-DEC-67]]", "[[OWN-DEC-111]]", "[[OWN-DEC-106]]"]
  depends_on: ["[[HH-BASE-05]]"]
  uses: ["[[ENT-Payment]]", "[[ENT-PaymentAllocation]]", "[[INT-Square]]"]
  tested_by: ["[[T60]]", "[[T61]]"]
  part_of: ["[[C10]]", "[[S01]]"]
source: "guide 20.3 HH-FIN-09 (rewritten by OWN-DEC-67, OWN-DEC-111)"
---
- There are no provider callbacks at launch. A redirect back from a payment link, a customer's claim or a screenshot never marks anything paid. A customer "I paid" action, if present, only creates a staff verification item.
- Authorized staff record each payment manually after verifying it: invoice, method, amount in cents, date, collector and transaction reference where applicable (the Square payment ID for card payments).
- The same method and reference cannot be recorded twice; a duplicate entry is refused and shown to staff.
- An uncertain outcome stays unrecorded and appears in the reconciliation queue ([[HH-FIN-15]]).
