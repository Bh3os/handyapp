---
id: OWN-DEC-133
type: decision
title: "Separate domains for the customer site and the staff app"
status: active
area: platform
links:
  related: ["[[OWN-DEC-02]]", "[[OWN-DEC-49]]"]
  uses: ["[[FACT-DOMAIN]]"]
source: "owner answers 2026-10-20 (coordinator session)"
---
Owner wording (2026-10-20): Q: "Web addresses: should the public site and the staff app share one domain, or use separate ones?" Answer: "Separate staff subdomain (Recommended)": handyhub247.com for customers (site and portal), staff.handyhub247.com for staff.

Effect:
- Public site and customer portal: handyhub247.com. Staff app: staff.handyhub247.com.
- Each origin has its own session cookies; customer and staff sessions never share a cookie.

Answers [[OQ-DOMAINS]].
