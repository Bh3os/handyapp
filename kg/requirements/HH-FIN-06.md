---
id: HH-FIN-06
type: requirement
title: "Invoice, payment, allocation, refund, fee and payout are separate records"
status: active
priority: P0
area: payments
links:
  decided_by: ["[[OWN-DEC-111]]"]
  uses: ["[[ENT-Invoice]]", "[[ENT-Payment]]", "[[ENT-PaymentAllocation]]", "[[ENT-Refund]]"]
  tested_by: ["[[T73]]", "[[T59]]"]
  part_of: ["[[C10]]", "[[S11]]"]
source: "guide 20.2 HH-FIN-06; OWN-DEC-111"
---
- Invoices, payments (tender), payment allocations, credits and refunds, provider fees and payouts are separate records.
- A verified successful customer payment is recognized when recorded; it never waits for Square's bank payout. Square fees and payouts, when recorded by hand, are separate from the customer payment.
