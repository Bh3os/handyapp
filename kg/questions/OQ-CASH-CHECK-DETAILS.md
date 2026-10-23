---
id: OQ-CASH-CHECK-DETAILS
type: question
title: The cash, check-deposit and reconciliation details no decision gives
status: open
area: payments
links:
  related: ["[[HH-FIN-11]]", "[[HH-FIN-12]]", "[[T62]]", "[[OWN-DEC-138]]", "[[OWN-DEC-200]]", "[[ROLE-MATRIX]]", "[[TSK-0088]]"]
source: "TSK-0088 part 1 (2026-10-23): HH-FIN-11 and HH-FIN-12 state the rules; the details below are PROPOSED"
---
**Question:** does the owner approve, or change, these PROPOSED details of cash records, checks and reconciliation?

- **Who answers:** the owner.
- **Decided, in use:** a cash payment keeps its collector, time, amount, invoice and receipt number; its receipt goes at once. A check moves received → deposited → cleared, stays pending until cleared, never counts toward Paid or a deposit before that, and only the Owner clears it, never one they collected. Checks to verify are in the staff action queue. A worker collects cash only with the Owner's explicit grant ([[HH-FIN-11]], [[HH-FIN-12]], [[OWN-DEC-138]], [[OWN-DEC-200]]).
- **PROPOSED, in use on private staging:**
  - Marking a check deposited is part of reconciliation (the matrix row "Mark a check returned; reconcile"): the Owner or Office, never for a check they collected themselves. A deposited check stays pending.
  - Reconciling a payment that is not a check (cash, card, Zelle, Cash App, Chime) is a separate later step by the Owner or Office, never for a payment they collected. It changes no balance and sends nothing; a check is cleared instead.
  - Any payment may carry an optional memo (up to 500 characters), kept as written and never shown to the customer.
  - Checks to verify: one "Checks to clear" queue item per job while any of its checks is pending, seen by the Owner (who alone clears checks), resolved when the last one clears.
- **Until answered:** the PROPOSED details above are used; each is a small change to the nodes or the code.
