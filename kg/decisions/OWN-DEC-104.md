---
id: OWN-DEC-104
type: decision
title: Deposit: 20% of the approved total over $1,000.00, before work scheduling
status: active
area: payments
links:
  supersedes: ["[[OWN-DEC-08]]"]
  related: ["[[OWN-DEC-42]]", "[[OWN-DEC-66]]", "[[OWN-DEC-76]]", "[[OWN-DEC-110]]", "[[OQ-DEPOSIT-REFUND-CANCELLATION]]", "[[FACT-PRICING-DISCOUNTS]]", "[[HH-FIN-02]]", "[[HH-FIN-07]]", "[[HH-FIN-12]]", "[[HH-SCH-05]]"]
  uses: ["[[FACT-DEPOSIT-RULE]]", "[[FACT-PAYMENT-METHODS]]", "[[FACT-NO-SURCHARGE]]"]
  constrained_by: ["[[RULE-MONEY-CENTS]]"]
source: "owner-answers-verbatim 2026-10-12T18:53:23.426Z [5.3 Deposit]; decision-briefs 2026-10-12T18:53:59"
---
Owner, 2026-10-12, journey Step 5.3, deposit.

Question asked:
> Step 5.3 - Deposit: under your policy, estimates over $1,000 need a 20% deposit. After approval the customer sees 'Deposit due: $X (20%)' and pays by card through Square (no surcharge), or chooses cash, check, Zelle, Cash App or Chime, which staff mark received. Scheduling the work is blocked until the deposit is recorded, unless the owner waives it (owner-only, with a reason). When is the deposit due?

Owner wording:
> For approved estimates over $1,000, require a 20% deposit based on the final approved total, rounded to cents.
>
> Show: “Deposit due: $X. Please pay your deposit so we can confirm your work appointment. Payment does not guarantee a particular date.”
>
> Accept the approved payment methods with no card surcharge. Staff verify and record the payment, method, amount, date, and transaction reference where applicable. A received check remains pending until cleared or the owner approves a waiver.
>
> Keep confirmed work scheduling blocked until the required deposit is satisfied or the owner records a job-specific waiver with a reason. A waiver does not mark the deposit paid or reduce the agreed price.
>
> Credit the deposit toward the final invoice. Do not invent late fees, forfeiture, or refund terms.

Effect:
- Rule: [[FACT-DEPOSIT-RULE]]. Over means strictly greater: $1,000.00 exactly needs no deposit, $1,000.01 does. The base is the final approved total including selected options, after any discount ([[FACT-PRICING-DISCOUNTS]]), rounded half-up to the cent. The rule is policy data, not a literal in code.
- Customer text, exactly: "Deposit due: $X. Please pay your deposit so we can confirm your work appointment. Payment does not guarantee a particular date."
- Completes the deposit policy left open by [[OWN-DEC-08]]. Accepted methods are the decided ones ([[FACT-PAYMENT-METHODS]]) with no card surcharge. Staff verify and record payment, method, amount, date and transaction reference where applicable. A received check stays pending until cleared or an owner waiver is recorded.
- Confirmed work scheduling stays blocked until the deposit is satisfied or the owner records a job-specific waiver with a reason. Only the owner may waive ([[OWN-DEC-76]]); a waiver never marks the deposit paid and never reduces the agreed price. The gate applies to work visits only, never to estimate visits ([[OWN-DEC-119]]).
- The deposit is credited once toward the final invoice ([[OWN-DEC-110]]).
- No late fees, forfeiture or refund terms exist or are invented; deposit refunds remain open ([[OQ-DEPOSIT-REFUND-CANCELLATION]]).

Links: supersedes [[OWN-DEC-08]]; uses [[FACT-DEPOSIT-RULE]], [[FACT-PAYMENT-METHODS]], [[FACT-NO-SURCHARGE]]; constrained by [[RULE-MONEY-CENTS]].
