---
id: HH-ID-02
type: requirement
title: Matching contacts are candidate matches for staff review, never proof of ownership
status: active
priority: P0
area: identity
links:
  decided_by: ["[[OWN-DEC-116]]", "[[OWN-DEC-117]]"]
  depends_on: ["[[HH-CRM-04]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[ENT-Customer]]", "[[ENT-Contact]]", "[[ENT-Property]]"]
  tested_by: ["[[T21]]"]
  part_of: ["[[S02]]", "[[S03]]"]
source: "guide 8.1 HH-ID-02; OWN-DEC-116, OWN-DEC-117"
---
- A matching email, phone, name or address is a candidate match only. Contact values are normalized conservatively and ownership is proven only by explicit verification.
- Possible duplicate customers and properties are shown to authorized staff only, labelled as suggestions, never as proof of identity.
- Ambiguous or shared contacts go to a staff review queue. Records are never merged automatically, and never by name or address alone.
- A shared household or organization address needs explicit authority before one person can act for the others.
