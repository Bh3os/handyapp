---
id: INT-Square
type: integration
title: Square - payment links and Tap to Pay, recorded manually
status: active
area: payments
links:
  decided_by: ["[[OWN-DEC-110]]", "[[OWN-DEC-111]]", "[[OWN-DEC-104]]"]
  constrained_by: ["[[FACT-NO-SURCHARGE]]"]
source: "OWN-DEC-110, OWN-DEC-111"
---
There is no Square API integration.
- **Payment links:** staff paste an invoice-specific Square payment link (https, on a Square domain) on the invoice or the deposit request. The customer opens it from "Pay by Card".
- **In person:** card and digital-wallet payments use Square Tap to Pay on the worker's phone.
- **Recording payments:** authorized staff record every payment manually: invoice, method, amount in cents, date, collector and transaction reference. A redirect back from the payment link, or a customer saying they paid, never marks anything paid.
- **No surcharge:** card payments carry no surcharge.
