---
id: OWN-DEC-42
type: decision
title: "Deposit: 20% on estimates over $1,000"
status: active
area: payments
links:
  supersedes: ["[[OWN-DEC-08]]"]
  related: ["[[HH-FIN-02]]", "[[HH-EST-01]]"]
  uses: ["[[FACT-DEPOSIT-RULE]]"]
  constrained_by: ["[[RULE-MONEY-CENTS]]"]
  part_of: ["[[C05]]"]
source: "vault-own-decisions.md OWN-DEC-42; project chat 2026-10-05 (decision packet item B3)"
---
Owner wording (project chat, 2026-10-05): "the estimates over 1000 requires 20 % deposit". Follow-up in-chat answer the same day to "exactly $1,000.00? measured before or after a discount?": "Over $1,000; after discount (Recommended)".

Effect:
- An estimate whose total is over $1,000.00 (strictly greater, measured after any discount) requires a deposit of 20% of that total; at or below $1,000.00 no deposit is required ([[FACT-DEPOSIT-RULE]]).
- The amount is computed on the server in integer cents with half-up rounding once, from the policy data, never a hard-coded literal.

Partly replaced by [[OWN-DEC-66]]: the deposit is paid before materials are bought. [[OWN-DEC-104]]: the base is the final approved total including selected options; checks stay pending until cleared; only the owner may waive ([[OWN-DEC-76]]); the deposit is credited to the final invoice; no late fee, forfeiture or refund term is invented. [[OWN-DEC-122]]: the rule is active configuration, with no Business-settings activation step.

Open:
- Refundability, forfeiture and the deposit wording: [[OQ-ATTORNEY-TERMS]].
- Whether the threshold and the deposit include sales tax, and the deposit's own tax treatment: [[OQ-TAX-CPA]].
