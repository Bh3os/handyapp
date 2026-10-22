---
id: OWN-DEC-161
type: decision
title: "Late cancellation of a work visit: a deposit under $50.00 is kept and nothing more is invoiced"
status: active
area: payments
links:
  constrained_by: ["[[RULE-MONEY-CENTS]]", "[[RULE-HUMAN-REVIEW]]"]
  uses: ["[[FACT-CANCELLATION-RULES]]"]
  related: ["[[OWN-DEC-134]]", "[[HH-FIN-14]]"]
source: "owner answers 2026-10-21 R3-Q4"
---
Owner answer (round 3, question 4), option chosen "Keep it, nothing more", subject to applicable cancellation rights and the customer's accepted contract terms:

> Implement the following rules:
>
> 1. For customer cancellations with less than 24 hours' notice, the standard cancellation fee is capped at $50.
> 2. If the customer paid a deposit smaller than $50, retain only that deposit and do not invoice the difference.
> 3. If the deposit is $50 or more, retain no more than $50 and refund the remaining deposit, subject to other lawful, separately authorized charges.
> 4. If no deposit was paid, retain the existing $50 invoice rule only where it is legally permitted and was disclosed and accepted in advance.
> 5. Never apply cancellation fees or retain deposits when the customer is exercising a legally protected cancellation right.
> 6. Do not automatically penalize customers for cancellations caused by HandyHub, unsafe conditions, emergencies, or circumstances requiring owner review.
> 7. Show the cancellation policy clearly before the customer approves an estimate or pays a deposit.
> 8. Allow the owner to waive or reduce cancellation fees with a documented reason.
> 9. Provide a clear cancellation breakdown and maintain accurate refund, accounting, and audit records.
> 10. Do not automatically collect additional funds or issue disputed charges.
>
> Implement and test these rules in staging. Keep cancellation-fee enforcement subject to attorney approval for Kentucky and Indiana.

Effect:
- Applies to final cancellations of confirmed work visits with less than 24 hours notice ([[OWN-DEC-163]]: never estimate visits), subject to the customer's accepted terms and the law.
- The fee is capped at $50.00 (5000 cents). A deposit under $50.00: only that deposit is kept and the difference is never invoiced. A deposit of $50.00 or more: at most $50.00 is kept and the rest is refunded (other lawful, separately authorized charges aside). No deposit: the $50.00 invoice only where it is legally permitted and was disclosed and accepted in advance.
- Never applied when the customer exercises a legally protected cancellation right, nor for cancellations caused by HandyHub, unsafe conditions, emergencies, or circumstances needing owner review.
- The policy is shown before the customer approves an estimate or pays a deposit (the next terms version, [[HH-EST-13]]); the Owner may waive or reduce the fee with a documented reason; the customer gets a clear breakdown; refund, accounting and audit records are kept; nothing extra is collected automatically and no disputed charge is issued.
- Enforcement waits for attorney approval for Kentucky and Indiana ([[OQ-ATTORNEY-TERMS]]).
- Answers case 1 of [[OQ-LATE-CANCELLATION-EDGES]]. Updates [[FACT-CANCELLATION-RULES]]. Built by [[TSK-0140]]; applying refunds stays [[TSK-0089]].
