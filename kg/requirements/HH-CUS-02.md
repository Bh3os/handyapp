---
id: HH-CUS-02
type: requirement
title: Service detail pages with approved scope, estimate approach, safe preparation and FAQs
status: active
priority: P0
area: site
links:
  decided_by: ["[[OWN-DEC-84]]", "[[OWN-DEC-51]]", "[[OWN-DEC-66]]", "[[OWN-DEC-32]]", "[[OWN-DEC-86]]", "[[OWN-DEC-180]]"]
  depends_on: ["[[HH-SVC-01]]", "[[HH-CUS-01]]"]
  constrained_by: ["[[RULE-NO-INVENTED-FACTS]]", "[[RULE-LANGUAGES]]", "[[RULE-HUMAN-REVIEW]]"]
  uses: ["[[ENT-ServiceDefinition]]", "[[FACT-HOURS]]", "[[FACT-SERVICE-AREA]]", "[[FACT-BRAND-IDENTITY]]"]
  tested_by: ["[[T05]]", "[[T75]]"]
  part_of: ["[[C01]]"]
source: "guide 5.1 HH-CUS-02, 6.2; OWN-DEC-84 (amended 2026-10-12), OWN-DEC-51, OWN-DEC-66, OWN-DEC-32"
---
Each of the 26 service pages shows, from that service's node (`SVC-HI-01` … `SVC-CL-07`) and the vault service files only:
- **What's included:** a short description of the included work and the key exclusions.
- **How we estimate:** remote when sufficient details and photos are available; a site visit when inspection or measurements are needed. Estimates are free, online or at the property.
- **Getting ready:** simple, service-specific, safe preparation steps. A page never asks the customer to do hazardous preparation.
- **What we ask about:** the inputs the request form will ask for this service ([[HH-SVC-03]]).
- **Relevant considerations:** for example the home-age limits of [[OWN-DEC-66]] on the services they apply to, and what may need a site visit.
- **Is there anything you don't do?:** the service's own limits, the home-age limits, and the licensed-trade (line-voltage electrical, gas, plumbing, HVAC), asbestos, lead, mold and structural limits. The same text goes into the FAQ structured data.
- **At a glance:** the service area ([[FACT-SERVICE-AREA]]), "priced individually", free estimate, and the visit hours ([[FACT-HOURS]]).
- 3–5 service-specific FAQs with answers, related services, and a request action with the service preselected ([[HH-CUS-01]]).

Rules:
- No prices, rates, guaranteed or estimated durations, completion times, credentials, licences, guarantees or reviews. Uncertain business facts go to a separate flags list and never block other pages.
- Content is versioned with history. On staging (and local/CI) the drafted content is shown directly so the owner reviews it on the site; production shows only versions the owner approved and published. One owner review screen lets the owner edit, approve and publish services individually or as a selected batch. The environment rule is explicit and tested.
- The static build must render the content in the staging environment, so the owner actually sees it after a merge.
- Customer pages are English only; the premium design is kept.

**Changed by [[OWN-DEC-180]] (2026-10-21):** pages that pass the quality review are published in production without per-service owner approval; uncertain claims stay hidden.

**Used by [[TSK-0146]] (2026-10-26):** the reviewed "Getting ready" steps are what the Owner approves, as they are or edited, as a service's default preparation instructions for window offers ([[OWN-DEC-194]] B7); every reviewed page passes the unsafe-instruction rules ([[OQ-PREPARATION-DEFAULT-DETAILS]]).
