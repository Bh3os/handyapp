---
id: OQ-PAYMENT-LINK-DETAILS
type: question
title: The invoice payment-link, Payments-tab and payment-receipt details no decision gives
status: open
area: finance
links:
  related: ["[[HH-FIN-08]]", "[[HH-FIN-09]]", "[[HH-FIN-10]]", "[[HH-PORT-12]]", "[[INT-Square]]", "[[FACT-PAYMENT-INSTRUCTIONS]]", "[[OQ-PAYMENT-HANDLES]]", "[[OWN-DEC-138]]", "[[TSK-0087]]", "[[HH-FIN-11]]", "[[FACT-AUTOMATIC-MESSAGES]]", "[[OWN-DEC-152]]"]
source: "TSK-0087 (2026-10-23): HH-FIN-08 to HH-FIN-10 and HH-PORT-12 state the rules; the details below are PROPOSED"
---
**Question:** does the owner approve, or change, these PROPOSED details of invoice payment links, the customer's Payments tab and payment receipts?

- **Who answers:** the owner.
- **Decided, in use:** card payments happen in Square through a link staff create there and paste on the invoice: https on a Square domain only. "Pay by Card" appears only with a valid link and a balance. A redirect back from the link, or a customer's claim, never marks anything paid: only a staff-recorded verified payment does. The same method and reference are never recorded twice. Payment handles stay labelled placeholders ([[HH-FIN-08]], [[HH-FIN-09]], [[HH-FIN-10]], [[HH-PORT-12]], [[OWN-DEC-182]]).
- **PROPOSED, in use on private staging:**
  - Who pastes a link: the Owner or Office (the matrix row "Enter payment link"). A link goes on an issued final invoice that still has a balance. A deposit invoice uses the deposit's own link (TSK-0059).
  - A new link replaces the shown one; every link stays recorded with who pasted it and when. The audit keeps only the link's host.
  - The Square domains are the PROPOSED list `payment.square_link_hosts` (square.link, checkout.square.site, squareup.com).
  - The Payments tab shows: the approved total (the current approved scope), the deposit (due with what is received and pending, or received), each issued invoice with its total, credits, paid, pending (a check until cleared) and balance, the recorded payments (date, method, amount; confirmed, pending until cleared or returned; never who recorded them or the reference), the totals, and how to pay for each active method.
  - "How to pay" names Square for cards and never mentions a surcharge. Each placeholder handle shows "Placeholder — not a payment destination", with no copy button.
  - There is no customer "I paid" action at launch (HH-FIN-09 allows one only as a staff verification item).
- **PROPOSED payment-receipt details, in use on private staging:**
  - A receipt is created for each confirmed recorded payment: at once for cash, card, Zelle, Cash App and Chime; for a check only when the Owner clears it. Never when a payment is started, never for a pending payment, and once per payment.
  - Receipts are numbered per project: receipt `<reference>-R<n>` with payment number `<reference>-P<n>`. A receipt never changes.
  - The automatic receipt message (the owner's `payment_receipt` wording, email only) sends once per receipt. Its receipt link opens the project's Payments tab, where each receipt is listed. A partial payment says so there, with what was still due after it (the owner's message wording has no partial line).
  - The owner's wording names an invoice. A deposit paid before any deposit invoice is issued gets its receipt on the Payments tab, and no message is sent for it.
- **Until answered:** the PROPOSED details above are used; each is a small change to the nodes or the code.
