---
id: OWN-DEC-48
type: decision
title: The street address is never published
status: active
area: site
links:
  related: ["[[HH-CUS-05]]", "[[HH-CRM-02]]"]
  uses: ["[[FACT-BUSINESS-ADDRESS]]", "[[FACT-SERVICE-AREA]]"]
  part_of: ["[[C01]]"]
source: "vault-own-decisions.md OWN-DEC-48; project chat 2026-10-06"
---
Owner wording (project chat, 2026-10-06): "don't publish my adress".

Effect:
- The website and its structured data name only the service area (the eleven counties) and the states, never a street, a city of residence or a ZIP code of the business.
- Tests fail if a street address, a business ZIP code or an address field reaches a public page or the structured data.
- The Google Business Profile is a service-area business with the address hidden (owner step outside the software).

Related: [[OWN-DEC-126]] leaves the mailing address off estimates and invoices because it is not provided.
