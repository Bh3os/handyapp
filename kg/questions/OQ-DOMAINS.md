---
id: OQ-DOMAINS
type: question
title: One origin or two domains for the public site and the staff app
status: superseded
area: platform
links:
  related: ["[[ARCH-STACK]]", "[[OWN-DEC-02]]", "[[OWN-DEC-130]]", "[[HH-ARC-05]]", "[[HH-ARC-06]]", "[[HH-ARC-07]]"]
  superseded_by: ["[[OWN-DEC-133]]"]
source: "guide 3.2; coordinator request 2026-10-20"
---
**Answered by [[OWN-DEC-133]] (2026-10-20).**

**Question:** do the public site with the customer portal and the staff app share one origin on handyhub247.com, or use two domains/subdomains (the guide proposes `handyhub247.com` for customers and `staff.handyhub247.com` for staff, or `/customer` and `/staff` surfaces in one application)?

- **Who answers:** the owner; Claude recommends in [[ARCH-STACK]]. The owner has not decided it.
- **Known:** the domain is handyhub247.com, registered at GoDaddy ([[OWN-DEC-02]]; owner answer 2026-10-05T16:33). Staging is the existing Render service ([[OWN-DEC-130]]). Cookies, gateways and CORS depend on the choice ([[HH-ARC-05]], [[HH-ARC-06]], [[HH-ARC-07]]).
- **Until answered:** whichever layout is used, customer and staff sessions stay separate with host-only cookies, and staff authentication is never inherited from a customer session ([[HH-ARC-06]]).
