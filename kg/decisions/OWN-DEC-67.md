---
id: OWN-DEC-67
type: decision
title: Square on staff phones instead of Stripe, recorded by hand; no card surcharge
status: active
area: payments
links:
  supersedes: ["[[OWN-DEC-36]]"]
  related: ["[[HH-FIN-08]]", "[[HH-FIN-09]]", "[[HH-FIN-10]]", "[[HH-FIN-11]]", "[[HH-FIN-14]]", "[[HH-BASE-05]]"]
  uses: ["[[INT-Square]]", "[[FACT-NO-SURCHARGE]]", "[[FACT-PAYMENT-METHODS]]", "[[ENT-Payment]]"]
  part_of: ["[[C05]]", "[[C10]]"]
source: "vault-own-decisions.md OWN-DEC-67; two-websites-owner-resolutions.md R1; project chat 2026-10-12; amended in the Step 1 review (OWN-DEC-89)"
---
Owner wording (project chat, 2026-10-12): "instead of stripe i will do square and the payments will be done through the staa phone"; "the customer can pay either way he like but for the deposit it will be secure link send to the customer using the built in functionlaity on square app"; "i canceled stripe so we sill not need that". How Square payments reach HandyHub: "Staff record them by hand". Collectors: "Owner and field employees". Surcharge: "my aeeoreny recommended not add for whatever so we will not add the surcharge" (withdrawing the earlier surcharge answers). Website wording: "Keep the card provider unnamed".

Amendment (journey Step 1 review, 2026-10-12): "Approved card wording names Square; no card surcharge applies. Keep any approved same-day service charge separate." ([[OWN-DEC-89]]).

Effect:
- Square replaces Stripe ([[INT-Square]]). Cards are taken with Square on staff phones (Tap to Pay); the customer may pay by any accepted method.
- HandyHub has no payment-provider connection and no Pay button of its own: staff record each Square payment by hand with the Square payment ID, and HandyHub stores no card data.
- A deposit counts as paid only when it is verified in Square with its transaction reference; a customer's statement, screenshot or a payment redirect never marks anything paid.
- The owner and field employees may collect payments, each with an explicit collect permission; every payment names its collector. Refunds stay with the owner.
- No card surcharge of any kind ([[FACT-NO-SURCHARGE]]).
- Guide requirements HH-FIN-08 and HH-FIN-09 (electronic payment inside the software) do not apply; HH-FIN-10 applies.

Partly replaced by [[OWN-DEC-89]]: the website and customer invoices name Square for cards ("credit or debit cards (Square)"), never a surcharge; the provider is no longer kept unnamed. [[OWN-DEC-110]] and [[OWN-DEC-111]]: "Pay by Card" opens an invoice-specific Square payment link that staff enter on the invoice (no Square API); in-person card or wallet payments use Square Tap to Pay on the worker's phone and are recorded manually; whether workers record payments is decided by the permission matrix ([[ROLE-MATRIX]]).
