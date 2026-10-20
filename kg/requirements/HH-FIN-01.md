---
id: HH-FIN-01
type: requirement
title: "Exact USD amounts; decided financial policies are active data"
status: active
priority: P0
area: payments
links:
  decided_by: ["[[OWN-DEC-83]]", "[[OWN-DEC-31]]", "[[OWN-DEC-104]]", "[[OWN-DEC-122]]", "[[OWN-DEC-128]]"]
  constrained_by: ["[[RULE-MONEY-CENTS]]", "[[RULE-DECIDED-VALUES-ACTIVE]]", "[[RULE-HUMAN-REVIEW]]", "[[FACT-TAX-NO-LINE]]", "[[FACT-NO-MINIMUM]]", "[[FACT-NO-SURCHARGE]]"]
  uses: ["[[ENT-PolicyVersion]]", "[[FACT-DEPOSIT-RULE]]", "[[FACT-PAYMENT-DUE]]"]
  tested_by: ["[[T58]]", "[[T02]]"]
  part_of: ["[[C10]]", "[[S08]]"]
source: "guide 20.1 HH-FIN-01; OWN-DEC-83, OWN-DEC-104, OWN-DEC-122"
---
- Every amount is integer cents with currency USD; quantities have an explicit scale; each line is rounded once half-up to the cent and totals equal the sum of displayed lines. No floating-point money anywhere.
- No minimum floor and no card surcharge exist.
- Tax: no tax line and no automatic tax on estimates or invoices ([[FACT-TAX-NO-LINE]]). This is a software setting, not a determination that any service is tax-exempt; documents never claim exemption, and tax treatment stays with the accountant.
- The deposit rule and payment term are active policy versions ([[FACT-DEPOSIT-RULE]], [[FACT-PAYMENT-DUE]]). No cancellation, late-fee, interest, forfeiture or refund terms exist and none are invented.
