---
id: OQ-PRODUCTION-HOSTING
type: question
title: Production hosting, database and backups
status: open
area: ops
links:
  related: ["[[OWN-DEC-130]]", "[[OQ-GO-DECISION]]", "[[INT-Render]]"]
source: "OWN-DEC-130; owner-answers-verbatim 2026-10-05T16:31 [Budget], 2026-10-05T18:04 [Recovery] [Test DB]"
---
**Question:** which paid production setup (Render service and database plan, backups, recovery targets) is used, within the owner's budget?

- **Who answers:** the owner, from priced options Claude brings ("Claude brings priced options", owner answer 2026-10-05T18:04). The monthly limit given was up to $50/month (owner answer 2026-10-05T16:31).
- **Known:** the free staging database expires 2026-11-03 and is replaced by a new free one with test data recreated (owner answer 2026-10-05T18:04). Staging is the existing Render service ([[OWN-DEC-130]], [[INT-Render]]).
- **Until answered:** no production deployment; no real customer data.
