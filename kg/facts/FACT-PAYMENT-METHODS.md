---
id: FACT-PAYMENT-METHODS
type: fact
title: Accepted payment methods
status: active
area: payments
links:
  decided_by: ["[[OWN-DEC-67]]", "[[OWN-DEC-89]]", "[[OWN-DEC-104]]", "[[OWN-DEC-111]]"]
  uses: ["[[INT-Square]]"]
  related: ["[[OWN-DEC-110]]"]
source: "OWN-DEC-67, 89, 104, 110, 111; owner-answers-verbatim 2026-10-05T19:22 [Check clearing]"
---
**Value:**
- Card through an invoice-specific (or deposit-specific) Square payment link that staff create in the Square app and enter in HandyHub ([[INT-Square]]).
- In-person card or digital wallet with Square Tap to Pay on a staff phone.
- Cash.
- Check.
- Zelle, Cash App and Chime.

Rules:
- No Square API integration and no Pay button that charges; authorized staff record every payment by hand (invoice, method, amount in cents, date, collector, transaction reference). A redirect or a customer claim never marks anything paid ([[OWN-DEC-111]]).
- Collectors: the owner and field employees, with an explicit permission; refunds stay with the owner ([[OWN-DEC-67]]).
- Checks stay pending until cleared (owner answer 2026-10-05T19:22: the bookkeeper marks checks cleared; a collector cannot clear their own).
- No surcharge ([[FACT-NO-SURCHARGE]]). Card wording names Square ([[OWN-DEC-89]]).
- The Zelle, Cash App, Chime and check-payee details are placeholders ([[FACT-PAYMENT-INSTRUCTIONS]]). Stripe is cancelled.
