---
id: ENT-DepositRequirement
type: entity
title: "Deposit requirement"
status: active
area: payments
links:
  decided_by: ["[[OWN-DEC-104]]", "[[OWN-DEC-76]]", "[[OWN-DEC-134]]", "[[OWN-DEC-145]]"]
source: "vault 06 section 11.1; OWN-DEC-104"
---
The job's deposit obligation computed at approval from [[FACT-DEPOSIT-RULE]].

**Fields:** job; policy version; required flag; amount in cents, computed on the total after any discount ([[FACT-PRICING-DISCOUNTS]]); allocations; waiver (Owner, reason, time).

**States:** `not_required`; `required → partly_satisfied → satisfied → applied` (credited to the final invoice); `required → waived`; `satisfied → partly_satisfied` when a payment is returned; on cancellation the deposit is refunded by [[FACT-CANCELLATION-RULES]] (in full, or less the $50.00 kept under 24 hours), recorded by the Owner ([[ENT-Refund]]).

**Invariants:** only cleared or verified money satisfies it; a waiver never marks it paid or reduces the price; it gates work-visit confirmation only.

**Who may change:** computed by the server; waived by the Owner only.
