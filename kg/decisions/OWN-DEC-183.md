---
id: OWN-DEC-183
type: decision
title: "The business mailing address is given and is entered in Business settings, not in the repository"
status: active
area: business
links:
  uses: ["[[FACT-BUSINESS-ADDRESS]]"]
  related: ["[[OWN-DEC-126]]", "[[OWN-DEC-48]]"]
source: "owner answers 2026-10-21 R9-Q2"
---
Owner answer (round 9, question 2, the business mailing address): the owner gave a street address. It is personal data and is kept out of this public repository.

Effect:
- The Owner enters the address in the app's Business settings (configuration on staging and production); the software reads it from configuration (`business.mailing_address`). It is never written into the repository, the graph, fixtures, logs or tests.
- It is used where a business address belongs: real estimates and invoices, and the address the Owner enters in the SMS provider's secure registration fields ([[OWN-DEC-190]]). The website still never publishes a street address ([[OWN-DEC-48]]).
- Replaces "no mailing address" in [[OWN-DEC-126]]. Answers [[OQ-MAILING-ADDRESS]]; whether the law requires an address on documents goes to the attorney and CPA packets ([[OWN-DEC-186]]). Built by [[TSK-0144]].
