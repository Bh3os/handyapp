---
id: HH-FIN-10
type: requirement
title: "Truthful payment instructions; placeholders never look usable"
status: active
priority: P0
area: payments
links:
  decided_by: ["[[OWN-DEC-111]]", "[[OWN-DEC-126]]", "[[OWN-DEC-110]]", "[[OWN-DEC-89]]"]
  constrained_by: ["[[RULE-NO-INVENTED-FACTS]]"]
  uses: ["[[FACT-PAYMENT-METHODS]]", "[[FACT-PAYMENT-INSTRUCTIONS]]", "[[ENT-Invoice]]", "[[INT-Square]]"]
  tested_by: ["[[T60]]", "[[T71]]"]
  part_of: ["[[C10]]"]
source: "guide 20.3 HH-FIN-10; OWN-DEC-110, OWN-DEC-111, OWN-DEC-126"
---
- The invoice and workspace show clear instructions for each active method in [[FACT-PAYMENT-METHODS]]: the Square card link, Tap to Pay in person, cash, check, Zelle, Cash App and Chime where active.
- Account handles come from [[FACT-PAYMENT-INSTRUCTIONS]]. Until the Owner enters real values, each placeholder is shown with a "Placeholder — not a payment destination" badge, without a copy button, and is never presented as a usable payment destination. No handle is invented.
- There is never a nonfunctional Pay button or a claim that a processor is connected.
- Sandbox and live credentials or links are kept separate; staging uses sandbox payments only.
