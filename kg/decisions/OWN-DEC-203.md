---
id: OWN-DEC-203
type: decision
title: "Credit change orders reduce the effective contract total: positive-magnitude credit lines with a negative financial effect; charge lines stay nonnegative"
status: active
area: approval
links:
  constrained_by: ["[[RULE-MONEY-CENTS]]"]
  uses: ["[[ENT-ChangeOrder]]", "[[ENT-Invoice]]"]
  related: ["[[OWN-DEC-169]]", "[[OWN-DEC-145]]", "[[OWN-DEC-165]]", "[[OWN-DEC-173]]", "[[OQ-READINGS-2026-10-21]]", "[[HH-CHG-01]]", "[[TSK-0081]]", "[[TSK-0082]]", "[[TSK-0085]]", "[[TSK-0089]]"]
source: "owner answers 2026-10-22 R14 item 4"
---
Final confirmation, with amendment, of reading 4 of [[OQ-READINGS-2026-10-21]] (negative change orders, [[OWN-DEC-169]] item 11).

Owner answer (round 14, 2026-10-22), verbatim:
> Confirm all 13 readings, subject to the following final amendments.
> Item 4 — Credit change orders
> A credit change order must reduce the effective contractual total, not increase it.
> Keep standard charge lines nonnegative if that is the existing data-model convention, but represent credit lines explicitly as credits or reductions with a positive magnitude and a negative financial effect.
> Ensure invoices, deposits, discounts, taxes where applicable, outstanding balances, refunds, and reports correctly account for the reduction.
> Preserve the original approved document and the adjustment history.
> Never create a negative customer charge by mistake.

Effect:
- A credit change order lowers the job's effective contractual total (the accepted estimate plus approved change orders, [[OWN-DEC-169]]); it can never raise it.
- Standard charge lines keep the existing convention of [[OWN-DEC-145]]: every charge line is greater than $0.00. A credit is its own line kind (credit or reduction), stored as a positive magnitude in integer cents with a negative financial effect, so no stored amount is negative ([[RULE-MONEY-CENTS]]). Replaces the PROPOSED reading "a credit is the change order's negative price adjustment in its totals".
- Invoices, deposits, discounts, tax where applicable, outstanding balances, refunds and reports all compute from the reduced total. No tax is charged today ([[FACT-TAX-NO-LINE]]); "where applicable" adds no tax treatment.
- The original accepted estimate, every approved change order and the adjustment history are preserved unchanged.
- A credit never produces a negative customer charge. PROPOSED: a reduction larger than what remains to be charged is refused on the server and routed to staff (any money already paid is handled through the Owner-only refund or credit path, [[OWN-DEC-173]] item 10).
- Built by [[TSK-0081]] and [[TSK-0082]]; invoice and payment effects with [[TSK-0085]] and [[TSK-0089]].
