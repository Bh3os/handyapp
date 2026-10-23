---
id: OQ-RECONCILIATION-DETAILS
type: question
title: The reconciliation-queue details no decision gives
status: open
area: payments
links:
  related: ["[[HH-FIN-15]]", "[[HH-FIN-09]]", "[[T61]]", "[[OWN-DEC-111]]", "[[OWN-DEC-138]]", "[[ROLE-MATRIX]]", "[[TSK-0090]]", "[[OQ-PAYMENT-EXCEPTION-DETAILS]]"]
source: "TSK-0090 (2026-10-23): HH-FIN-15 states the rule; the details below are PROPOSED"
---
**Question:** does the owner approve, or change, these PROPOSED details of the reconciliation queue?

- **Who answers:** the owner.
- **Decided, in use:** a reconciliation queue lists unmatched payments, amount or currency mismatches, pending and returned checks, disputes, duplicate entries, Square payments whose reference does not match, and uncertain charge or refund outcomes. The Owner, or Office for routine matching, resolves each with evidence, and the resolution is recorded and audited ([[HH-FIN-15]]). An uncertain outcome stays pending, records nothing and never resolves by itself; a retry in Square recorded once never makes a double entry ([[T61]], [[HH-FIN-09]]).
- **PROPOSED, in use on private staging:**
  - **Reporting.** The Owner or Office reports what they cannot match yet: an uncertain outcome, money received that matches no payment, an amount or currency mismatch, a duplicate entry, or a Square reference that does not match. Each report keeps what was seen: where it was seen (the customer, Square, the bank or our records), the method, amount, currency and reference, the job or payment it concerns, and a description of up to 2,000 characters. It appears in the staff queue as "Money to reconcile". The Payments screen is the reconciliation queue, and a job's payments page has a button to report one for that job.
  - **Resolving.** Each item is resolved once, with evidence of up to 2,000 characters.
    - "Matched to a recorded payment" and "recorded as a verified payment" name the payment: one item per payment, and never a payment returned or voided. This routine matching is open to Office.
    - "Not received", "duplicate", "corrected", "refunded" and "no action needed" are the Owner's.
    - As with reconciling a payment, nobody matches an item to a payment they collected themselves.
  - **Listed from their own records.** Checks still pending, payments returned in the last 30 days, open disputes and refunds still processing or needing review are listed in the same queue. They come from their own records, not as separate items, and the last 50 resolved items are shown with their evidence.
- **Until answered:** the PROPOSED details above are used; each is a small change to the nodes or the code.
