---
id: HH-INT-09
type: requirement
title: Client and server validation with field errors that keep everything entered
status: active
priority: P0
area: intake
links:
  decided_by: ["[[OWN-DEC-93]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[ENT-Request]]"]
  tested_by: ["[[T10]]", "[[T69]]"]
  part_of: ["[[C02]]"]
source: "guide 7.3 HH-INT-09; OWN-DEC-93"
---
- Every field is validated on the client and independently on the server; manipulated client data is rejected server-side.
- Errors appear next to each field, plus an accessible error summary that receives focus. All entered details and successful uploads are kept.
- Contact data is normalized conservatively; units, service IDs and enums are validated; free text has bounded length.
- Customer text is never rewritten to fit a service; any staff classification keeps the original.
