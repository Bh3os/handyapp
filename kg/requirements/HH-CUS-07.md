---
id: HH-CUS-07
type: requirement
title: Payment-method wording names Square for cards and never mentions a surcharge
status: active
priority: P0
area: site
links:
  decided_by: ["[[OWN-DEC-89]]", "[[OWN-DEC-67]]", "[[OWN-DEC-111]]", "[[OWN-DEC-126]]", "[[OWN-DEC-122]]", "[[OWN-DEC-140]]"]
  constrained_by: ["[[RULE-NO-INVENTED-FACTS]]", "[[RULE-DECIDED-VALUES-ACTIVE]]"]
  uses: ["[[FACT-PAYMENT-METHODS]]", "[[FACT-NO-SURCHARGE]]", "[[FACT-PAYMENT-INSTRUCTIONS]]", "[[INT-Square]]"]
  part_of: ["[[C01]]", "[[C10]]"]
source: "OWN-DEC-89 (amends OWN-DEC-67 wording); OWN-DEC-111, OWN-DEC-126"
---
- Wherever the site or a customer document lists payment methods, the methods come from [[FACT-PAYMENT-METHODS]] and cards are described as taken with Square, for example "credit or debit cards (Square)". Customer invoices may also name Square for card payments. This replaces the earlier rule that kept the card provider unnamed.
- No text anywhere mentions a card surcharge ([[FACT-NO-SURCHARGE]]).
- No same-day service charge exists ([[FACT-PRICING-SAME-DAY-CHARGE]]), so none is described.
- Payment instructions for Zelle, Cash App, Chime and checks come from [[FACT-PAYMENT-INSTRUCTIONS]]. While they are placeholders they carry a "Placeholder — not a payment destination" label, have no copy button and are never presented as usable destinations.
- The copy lint allows "Square" as a payment name; the claims register and tests are updated to match.
