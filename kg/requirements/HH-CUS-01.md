---
id: HH-CUS-01
type: requirement
title: Active services in four categories; service CTA preselects the service; Not sure option
status: active
priority: P0
area: site
links:
  decided_by: ["[[OWN-DEC-33]]", "[[OWN-DEC-87]]", "[[OWN-DEC-90]]"]
  depends_on: ["[[HH-SVC-01]]", "[[HH-INT-01]]", "[[HH-INT-15]]"]
  constrained_by: ["[[RULE-NO-INVENTED-FACTS]]", "[[RULE-LANGUAGES]]"]
  uses: ["[[ENT-ServiceDefinition]]"]
  tested_by: ["[[T05]]"]
  part_of: ["[[C01]]"]
source: "guide 5.1 HH-CUS-01; OWN-DEC-33, OWN-DEC-87, OWN-DEC-90"
---
- The public site presents the active services from the service registry ([[HH-SVC-01]]) grouped in the four categories: Home Improvement, Drywall, Painting and Cleaning. All 26 services are in the launch set.
- Every request call to action ("Request an Estimate" / "Request a Free Estimate" in the header, the sticky bar and on each service page) first shows the entry choice ([[HH-INT-01]]). The request form then opens with the page's service preselected by its immutable service ID and its category already open ([[HH-INT-15]]). The preselection survives the guest, create-account and sign-in paths.
- "Not sure what service I need" is always visible. It lets the customer describe the work without selecting a service; staff classify it during review. The site never forces or guesses an inaccurate service.
