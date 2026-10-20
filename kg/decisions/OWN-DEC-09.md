---
id: OWN-DEC-09
type: decision
title: Electronic invoices with cash and check; no payment provider
status: active
area: payments
links:
  related: ["[[HH-FIN-04]]", "[[HH-FIN-10]]", "[[HH-FIN-11]]", "[[HH-FIN-12]]"]
  uses: ["[[FACT-PAYMENT-METHODS]]", "[[ENT-Invoice]]", "[[ENT-Payment]]"]
  part_of: ["[[C10]]"]
source: "vault-own-decisions.md OWN-DEC-09; owner facts L10 (2026-10-02)"
---
Owner wording (owner facts, 2026-10-02): "Electronic invoices with cash/check acceptance. Payment provider not selected. Received checks are not cleared money."

Effect:
- Invoices are electronic.
- A received check is recorded as pending, never as cleared money; payment states keep Deposited separate from Cleared.
- Card storage and card-on-file billing are out of scope.

Partly replaced by [[OWN-DEC-67]] and [[OWN-DEC-111]]: cards are taken with Square (invoice-specific Square link or Tap to Pay on a staff phone) and recorded by hand, and the accepted methods also include Zelle, Cash App and Chime. The software still has no payment-provider connection. [[OWN-DEC-110]]: the invoice carries the Square link that staff enter.
