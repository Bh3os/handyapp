---
id: HH-FIN-02
type: requirement
title: "Deposit rule, the work-scheduling gate and owner-only waiver"
status: active
priority: P0
area: payments
links:
  decided_by: ["[[OWN-DEC-104]]", "[[OWN-DEC-76]]", "[[OWN-DEC-42]]", "[[OWN-DEC-66]]", "[[OWN-DEC-119]]", "[[OWN-DEC-68]]"]
  constrained_by: ["[[RULE-MONEY-CENTS]]", "[[RULE-NO-INVENTED-FACTS]]"]
  uses: ["[[ENT-DepositRequirement]]", "[[ENT-Payment]]", "[[ENT-Invoice]]", "[[ENT-AuditEvent]]", "[[FACT-DEPOSIT-RULE]]", "[[FACT-PAYMENT-METHODS]]", "[[ROLE-OWNER]]"]
  tested_by: ["[[T36]]", "[[T59]]", "[[T64]]"]
  part_of: ["[[C05]]", "[[S05]]", "[[S01]]"]
source: "guide 20.1 HH-FIN-02; OWN-DEC-42, 66, 76, 104, 119"
---
- At approval the server evaluates the active deposit rule ([[FACT-DEPOSIT-RULE]]) on the final approved total including selected options and pins the result on the job ([[ENT-DepositRequirement]]): required with an amount in cents (half-up), or not required. Not every job needs a deposit; the boundary is exact (the rule's "over" is strictly greater than).
- The customer sees: "Deposit due: $X. Please pay your deposit so we can confirm your work appointment. Payment does not guarantee a particular date."
- The deposit is paid before materials are bought. It blocks confirming work visits only, never estimate visits ([[HH-SCH-06]]).
- Accepted methods are the approved ones ([[FACT-PAYMENT-METHODS]]), with no card surcharge. Staff verify and record each deposit payment: method, amount, date and transaction reference where applicable ([[HH-FIN-09]]).
- The deposit is satisfied only by verified money: a received check stays pending until cleared and does not satisfy it. At Start Work only, a Square-verified deposit with bookkeeping pending may use the administrative exception ([[HH-WORK-03]]).
- Only the Owner may waive a required deposit: a job-specific waiver with a fresh sign-in and a written reason, audited. Any other role, including another administrator, is refused. A waiver never marks the deposit paid and never reduces the agreed price.
- The deposit is credited toward the final invoice exactly once ([[HH-FIN-05]]).
- No late fees, forfeiture or refund terms exist; a refund question on a deposit routes to the Owner.
