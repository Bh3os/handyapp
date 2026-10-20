---
id: OWN-DEC-34
type: decision
title: A sent estimate stays valid for 14 days
status: active
area: estimates
links:
  related: ["[[HH-EST-01]]", "[[HH-EST-07]]"]
  uses: ["[[FACT-ESTIMATE-VALIDITY]]"]
  part_of: ["[[C05]]", "[[S04]]"]
source: "vault-own-decisions.md OWN-DEC-34; project chat 2026-10-05 (decision packet item B9)"
---
Owner wording (project chat, 2026-10-05): "14 day".

Effect:
- Every sent (published) estimate version expires 14 days after it is sent ([[FACT-ESTIMATE-VALIDITY]]).
- An expired estimate cannot be approved.

Partly replaced by [[OWN-DEC-122]]: the 14-day validity is active configuration from the start; no Business-settings entry or activation step blocks sending. [[OWN-DEC-103]]: an expired or superseded estimate is rejected at approval and the customer is offered "Request an Updated Estimate". The owner's 2026-10-05 answer on re-pricing an expired estimate was "Decide each time".

Open:
- How long a sent change order stays valid: [[OQ-CHANGE-ORDER-VALIDITY]].
- The customer-facing validity wording (attorney): [[OQ-ATTORNEY-TERMS]].
- The days are counted in the business time zone: see [[FACT-TIMEZONE]].
