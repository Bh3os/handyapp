---
id: HH-PORT-12
type: requirement
title: Payments tab with approved total, deposit status, recorded payments and balance
status: active
priority: P0
area: portal
links:
  decided_by: ["[[OWN-DEC-106]]", "[[OWN-DEC-104]]", "[[OWN-DEC-110]]", "[[OWN-DEC-111]]", "[[OWN-DEC-67]]"]
  depends_on: ["[[HH-FIN-07]]", "[[HH-FIN-10]]"]
  constrained_by: ["[[RULE-MONEY-CENTS]]", "[[RULE-SERVER-AUTHZ]]", "[[RULE-NO-INVENTED-FACTS]]"]
  uses: ["[[ENT-Payment]]", "[[ENT-Invoice]]", "[[FACT-DEPOSIT-RULE]]", "[[FACT-PAYMENT-METHODS]]", "[[FACT-PAYMENT-INSTRUCTIONS]]", "[[INT-Square]]"]
  tested_by: ["[[T58]]", "[[T59]]", "[[T60]]"]
  part_of: ["[[C05]]", "[[C10]]"]
source: "OWN-DEC-106, OWN-DEC-110, OWN-DEC-111"
---
- The Payments tab shows the approved total, the deposit status, recorded payments, credits, any pending payment, and the remaining balance, all in integer cents from the shared records.
- Payments are recorded manually by authorized staff (Square payments with their payment ID). Nothing is marked paid from a customer claim or a payment-link redirect alone; if a customer "I paid" action exists, it only creates a staff task.
- A received check shows as pending until cleared.
- **Pay by Card** opens the invoice-specific Square payment link that staff entered; other methods show their instructions ([[HH-CUS-07]]).
