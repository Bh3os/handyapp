---
id: HH-BASE-04
type: requirement
title: No invented availability, response times, biographies, reviews, credentials, prices, trades, branches or 24/7 staffing
status: active
priority: P0
area: business
links:
  decided_by: ["[[OWN-DEC-11]]", "[[OWN-DEC-35]]", "[[OWN-DEC-66]]", "[[OWN-DEC-86]]", "[[OWN-DEC-115]]", "[[OWN-DEC-131]]"]
  constrained_by: ["[[RULE-NO-INVENTED-FACTS]]", "[[RULE-HUMAN-REVIEW]]"]
  uses: ["[[FACT-HOURS]]", "[[FACT-RESPONSE-TARGET]]", "[[FACT-PUBLIC-CONTACT]]", "[[FACT-SERVICE-AREA]]"]
  tested_by: ["[[T31]]", "[[T08]]"]
source: "guide 1.4; OWN-DEC-11, OWN-DEC-35, OWN-DEC-66, OWN-DEC-115"
---
Neither website, no template and no seed may show or imply anything that is not in a fact or decision node ([[RULE-NO-INVENTED-FACTS]]). In particular:
- **Availability:** only the configured visit hours ([[FACT-HOURS]]); never 24/7 staffing, never a booking slot that has not been reserved.
- **Response times:** only the owner's wording around the internal target ([[FACT-RESPONSE-TARGET]]): customers read "We aim to respond within one hour during our daily hours, 8 AM–10 PM" ([[OWN-DEC-94]]); the word "guaranteed" is not used ([[OWN-DEC-35]]). Staff see the 1-hour clock labeled as an internal target ([[OWN-DEC-115]]).
- **People and proof:** no staff biographies, reviews, testimonials, portfolio, certifications or credentials unless real, verified and permitted ([[OWN-DEC-11]]).
- **Prices and trades:** no prices, rates or price ranges outside an estimate; no claim of licensed-trade eligibility (gas, electrical, plumbing, HVAC, structural, hazardous materials stay human-review boundaries, [[RULE-HUMAN-REVIEW]]).
- **Branches and area:** no branches or locations beyond the approved service area ([[FACT-SERVICE-AREA]]); no county page without authentic local content ([[OWN-DEC-57]]).
- **Contact details:** the public phone and the public email are both labelled placeholders until the owner supplies real values ([[FACT-PUBLIC-CONTACT]]).
