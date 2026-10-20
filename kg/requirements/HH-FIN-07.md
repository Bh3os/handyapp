---
id: HH-FIN-07
type: requirement
title: "No over-allocation or double credit; Paid only at $0.00"
status: active
priority: P0
area: payments
links:
  decided_by: ["[[OWN-DEC-111]]", "[[OWN-DEC-104]]"]
  depends_on: ["[[HH-DATA-04]]"]
  uses: ["[[ENT-PaymentAllocation]]", "[[ENT-Invoice]]", "[[ENT-Payment]]", "[[ENT-Message]]", "[[FACT-AUTOMATIC-MESSAGES]]"]
  tested_by: ["[[T59]]"]
  part_of: ["[[C10]]"]
source: "guide 20.2 HH-FIN-07; OWN-DEC-111"
---
- Allocations run in transactions that prevent over-allocation and double credit.
- The invoice and workspace show distinctly: amount invoiced, credits, confirmed paid, pending payments (for example an uncleared check) and remaining balance.
- When confirmed payments plus approved credits bring the balance to $0.00, the invoice becomes Paid and the receipt sends automatically ([[FACT-AUTOMATIC-MESSAGES]]). Pending payments never count.
- Invoice states: `draft → issued → partially_paid / paid`; controlled `voided` and a credit or correction flow; "overdue" is a condition of due term and balance ([[HH-FIN-19]]).
- An overpayment stays as an unallocated customer credit and goes to an Owner credit or refund decision; it never becomes a negative invoice balance.
