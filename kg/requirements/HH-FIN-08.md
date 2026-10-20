---
id: HH-FIN-08
type: requirement
title: "Card payments happen in Square, outside HandyHub"
status: active
priority: P0
area: payments
links:
  decided_by: ["[[OWN-DEC-67]]", "[[OWN-DEC-110]]", "[[OWN-DEC-111]]", "[[OWN-DEC-89]]", "[[OWN-DEC-138]]"]
  uses: ["[[INT-Square]]", "[[ENT-Invoice]]", "[[FACT-NO-SURCHARGE]]"]
  tested_by: ["[[T60]]", "[[T61]]"]
  part_of: ["[[C10]]"]
source: "guide 20.3 HH-FIN-08 (rewritten by OWN-DEC-67, OWN-DEC-110, OWN-DEC-111)"
---
The guide's hosted-checkout integration does not apply: HandyHub is not connected to Square ([[INT-Square]]).
- Card payments use an invoice-specific (or deposit-specific) Square payment link that Office or the Owner create in Square and enter on the invoice ([[OWN-DEC-138]]), or Square Tap to Pay on the worker's phone.
- The link field accepts only an https URL on a Square domain; anything else is refused.
- "Pay by Card" appears only when a valid link is on the invoice and a balance remains; it opens that link.
- HandyHub never receives, stores or types card data. No card surcharge applies.
- If the link fails or the outcome is uncertain, the invoice stays unchanged and the balance stays due until staff record a verified payment ([[HH-FIN-09]]).
