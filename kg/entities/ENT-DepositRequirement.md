---
id: ENT-DepositRequirement
type: entity
title: "Deposit requirement"
status: active
area: payments
links:
  decided_by: ["[[OWN-DEC-104]]", "[[OWN-DEC-76]]"]
source: "vault 06 section 11.1; OWN-DEC-104"
---
The job's deposit obligation computed at approval from [[FACT-DEPOSIT-RULE]].

**Fields:** job; policy version; required flag; amount in cents; allocations; waiver (Owner, reason, time).

**States:** `not_required`; `required → partly_satisfied → satisfied → applied` (credited to the final invoice); `required → waived`; `satisfied → partly_satisfied` when a payment is returned; refund questions route to the Owner (no refund terms exist).

**Invariants:** only cleared or verified money satisfies it; a waiver never marks it paid or reduces the price; it gates work-visit confirmation only.

**Who may change:** computed by the server; waived by the Owner only.
