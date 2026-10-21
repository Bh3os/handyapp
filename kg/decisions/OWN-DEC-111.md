---
id: OWN-DEC-111
type: decision
title: Payments recorded manually; Paid at $0.00 sends the receipt automatically
status: active
area: payments
links:
  supersedes: ["[[OWN-DEC-36]]"]
  related: ["[[OWN-DEC-67]]", "[[OWN-DEC-110]]", "[[HH-FIN-06]]", "[[HH-FIN-07]]", "[[HH-FIN-10]]", "[[HH-FIN-11]]", "[[HH-FIN-12]]", "[[HH-FIN-15]]", "[[HH-BASE-05]]", "[[OWN-DEC-152]]"]
  uses: ["[[FACT-PAYMENT-DUE]]", "[[FACT-PAYMENT-METHODS]]", "[[FACT-NO-SURCHARGE]]", "[[FACT-AUTOMATIC-MESSAGES]]", "[[INT-Square]]", "[[ENT-Payment]]"]
  constrained_by: ["[[RULE-MONEY-CENTS]]"]
source: "owner-answers-verbatim 2026-10-12T19:09:51.058Z [10.2 Due]; decision-briefs 2026-10-12T19:10:30"
---
Partly replaced by [[OWN-DEC-152]] (2026-10-21): a payment receipt sends for each confirmed recorded payment (partial payments say so), not only at $0.00.

Owner, 2026-10-12, journey Step 10.2, payment.

Question asked:
> Step 10.2 - Payment: the customer pays the balance by card through a Square payment link (no surcharge), or by cash, check, Zelle, Cash App or Chime. Staff record every payment manually (method, amount, date, reference); a check stays pending until cleared. When the balance reaches $0.00, the invoice shows 'Paid' and a receipt sends automatically. Partial payments show the remaining balance. When is the balance due?

Owner wording:
> The balance is due on receipt of the invoice after the required quality review. Disclose this before approval for new projects; honor existing agreed payment terms.
>
> Accept:
> - Card through an invoice-specific Square payment link.
> - In-person card or digital-wallet payment using Square Tap to Pay on the worker’s phone.
> - Cash, check, Zelle, Cash App, or Chime, where activated.
>
> No card surcharge applies. Authorized staff verify and manually record each payment: invoice, method, amount, date, collector, and transaction reference where applicable. A customer claim or payment-link redirect alone does not mark it paid.
>
> Checks remain pending until cleared. Partial payments show the confirmed amount paid, any pending payment, and the remaining balance. Prevent duplicate entries and double-crediting deposits.
>
> When confirmed payments and approved credits reduce the balance to $0.00, mark the invoice Paid and send the receipt automatically. Do not wait for Square’s bank payout to recognize a verified successful customer payment.
>
> Implement and test on private staging without real charges.

Effect:
- Balance due on receipt of the invoice after the required quality review ([[FACT-PAYMENT-DUE]]); disclosed before approval for new projects; existing agreed terms honoured.
- Replaces the method list of [[OWN-DEC-36]] (Stripe cancelled, Square added, per [[OWN-DEC-67]]). Methods ([[FACT-PAYMENT-METHODS]]): invoice-specific Square payment link; Square Tap to Pay on the worker's phone (recorded as a method, no integration); cash, check, Zelle, Cash App or Chime. No card surcharge ([[FACT-NO-SURCHARGE]]).
- Authorized staff verify and record each payment: invoice, method, amount in cents, date, collector and transaction reference where applicable. A customer claim or a payment-link redirect never marks anything paid. Owner and field employees may collect ([[OWN-DEC-67]]).
- Checks stay pending until cleared. Partial payments show the confirmed amount, any pending payment and the remaining balance. No duplicate entries (same reference and method) and no double-crediting of deposits.
- When confirmed payments plus approved credits bring the balance to $0.00 the invoice is marked Paid and the receipt sends automatically ([[FACT-AUTOMATIC-MESSAGES]]); recognition never waits for Square's bank payout.

Links: supersedes [[OWN-DEC-36]]; uses [[FACT-PAYMENT-DUE]], [[FACT-PAYMENT-METHODS]], [[FACT-NO-SURCHARGE]], [[FACT-AUTOMATIC-MESSAGES]], [[INT-Square]], [[ENT-Payment]]; constrained by [[RULE-MONEY-CENTS]].
