---
id: OQ-PAYMENT-LINK-DETAILS
type: question
title: The invoice payment-link and Payments-tab details no decision gives
status: open
area: finance
links:
  related: ["[[HH-FIN-08]]", "[[HH-FIN-09]]", "[[HH-FIN-10]]", "[[HH-PORT-12]]", "[[INT-Square]]", "[[FACT-PAYMENT-INSTRUCTIONS]]", "[[OQ-PAYMENT-HANDLES]]", "[[OWN-DEC-138]]", "[[TSK-0087]]"]
source: "TSK-0087 part 1 (2026-10-23): HH-FIN-08 to HH-FIN-10 and HH-PORT-12 state the rules; the details below are PROPOSED"
---
**Question:** does the owner approve, or change, these PROPOSED details of invoice payment links and the customer's Payments tab?

- **Who answers:** the owner.
- **Decided, in use:** card payments happen in Square through a link staff create there and paste on the invoice: https on a Square domain only. "Pay by Card" appears only with a valid link and a balance. A redirect back from the link, or a customer's claim, never marks anything paid: only a staff-recorded verified payment does. The same method and reference are never recorded twice. Payment handles stay labelled placeholders ([[HH-FIN-08]], [[HH-FIN-09]], [[HH-FIN-10]], [[HH-PORT-12]], [[OWN-DEC-182]]).
- **PROPOSED, in use on private staging:**
  - Who pastes a link: the Owner or Office (the matrix row "Enter payment link"). A link goes on an issued final invoice that still has a balance. A deposit invoice uses the deposit's own link (TSK-0059).
  - A new link replaces the shown one; every link stays recorded with who pasted it and when. The audit keeps only the link's host.
  - The Square domains are the PROPOSED list `payment.square_link_hosts` (square.link, checkout.square.site, squareup.com).
  - The Payments tab shows: the approved total (the current approved scope), the deposit (due with what is received and pending, or received), each issued invoice with its total, credits, paid, pending (a check until cleared) and balance, the recorded payments (date, method, amount; confirmed, pending until cleared or returned; never who recorded them or the reference), the totals, and how to pay for each active method.
  - "How to pay" names Square for cards and never mentions a surcharge. Each placeholder handle shows "Placeholder — not a payment destination", with no copy button.
  - There is no customer "I paid" action at launch (HH-FIN-09 allows one only as a staff verification item).
- **Until answered:** the PROPOSED details above are used; each is a small change to the nodes or the code.
