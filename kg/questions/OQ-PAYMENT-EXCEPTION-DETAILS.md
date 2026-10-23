---
id: OQ-PAYMENT-EXCEPTION-DETAILS
type: question
title: The returned-check, failed-payment, dispute and correction details no decision gives
status: open
area: payments
links:
  related: ["[[HH-FIN-13]]", "[[HH-FIN-14]]", "[[HH-FIN-19]]", "[[T63]]", "[[T64]]", "[[OWN-DEC-138]]", "[[ROLE-MATRIX]]", "[[TSK-0089]]", "[[TSK-0091]]"]
source: "TSK-0089 part 1 (2026-10-23): HH-FIN-13 and HH-FIN-14 state the rules; the details below are PROPOSED"
---
**Question:** does the owner approve, or change, these PROPOSED details of returned checks, failed and disputed payments and payment corrections?

- **Who answers:** the owner.
- **Decided, in use:** a returned check or a failed or disputed payment never edits or deletes the payment. An adjustment record and a reversing allocation are appended, the balance reopens, the receipt shows voided and a deposit it satisfied reverts to required. Staff and the customer see the current payment state and balance. An open billing dispute routes to the Owner and pauses routine payment reminders. A payment correction needs the Owner, a fresh sign-in and a reason, and is a new record, never an edit ([[HH-FIN-13]], [[HH-FIN-14]]).
- **PROPOSED, in use on private staging:**
  - **Who records what.** The Owner or Office records a check returned by the bank (the matrix row "Mark a check returned; reconcile"); a reason is required. Everything else needs the Owner with a fresh sign-in and a reason (payment correction): a card or digital payment that failed, a dispute opened, won or lost, and a void.
  - **Evidence.** Each record takes optional evidence of up to 500 characters (the bank notice, the Square dispute ID) and a reason of up to 2,000 characters.
  - **Which payments.** A check may be returned once it is received, deposited or already cleared. A payment that is not a check may fail, or be disputed, while it is recorded or reconciled.
  - **Open disputes.** While a dispute is open the disputed money still counts toward Paid and the deposit. It changes only when the dispute is lost; won changes no money. Meanwhile the payment cannot be reconciled, voided or marked failed. One "Disputed payment" item per job is in Owner Decisions while any of its disputes is open. The customer sees the payment as "Disputed".
  - **Deposit already credited.** A deposit already credited to the final invoice stays applied when one of its payments is returned or voided. The final invoice's deposit credit follows the deposit's verified money, so that invoice's balance reopens instead.
  - **Corrections.** A correction voids the wrong payment and, when given the right amount, records the right payment in the same step, naming the one it corrects. The new payment goes toward the deposit while it is still due, otherwise the issued final invoice. Unless changed, it keeps the voided payment's method, date, reference, payer, memo and collector. It gets its own receipt. A voided payment no longer holds its method and reference, so the right one can reuse them.
  - **Customer view.** A voided payment stays listed for the customer as "Voided", with its receipt shown voided.
- **Until answered:** the PROPOSED details above are used; each is a small change to the nodes or the code.
