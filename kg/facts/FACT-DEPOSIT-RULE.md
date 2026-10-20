---
id: FACT-DEPOSIT-RULE
type: fact
title: Deposit: 20% of the approved total over $1,000.00, rounded to cents
status: active
area: payments
links:
  decided_by: ["[[OWN-DEC-42]]", "[[OWN-DEC-66]]", "[[OWN-DEC-76]]", "[[OWN-DEC-104]]", "[[OWN-DEC-134]]"]
  related: ["[[OWN-DEC-110]]", "[[OWN-DEC-119]]", "[[RULE-MONEY-CENTS]]"]
source: "OWN-DEC-42, 66, 76, 104; owner-answers-verbatim 2026-10-05T17:29 [Deposit rules]"
---
**Value:** when the final approved total is over $1,000.00, the deposit is 20% of that total, rounded half-up to the cent. At $1,000.00 or less, no deposit.

- "Over" means strictly greater: 100000 cents needs no deposit; 100001 cents does ([[OWN-DEC-42]], [[OWN-DEC-104]]).
- The base is the final approved total including the selected options, measured after any discount (owner answer 2026-10-05T17:29, "Over $1,000; after discount").
- In cents: deposit = round_half_up(total_cents × 20 / 100) ([[RULE-MONEY-CENTS]]).
- Due: before confirmed work scheduling; it is paid before materials are bought ([[OWN-DEC-66]]). It never gates free estimate visits ([[OWN-DEC-119]]).
- Satisfied by a verified payment (a check only once cleared) or an owner-only, job-specific waiver with a reason ([[OWN-DEC-76]]); a waiver never marks it paid or reduces the price.
- Credited once toward the final invoice ([[OWN-DEC-110]]).
- Refund on cancellation: [[FACT-CANCELLATION-RULES]] ([[OWN-DEC-134]]). No forfeiture or late-fee terms exist.
