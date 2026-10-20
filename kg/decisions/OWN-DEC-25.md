---
id: OWN-DEC-25
type: decision
title: Free hosting for development and early staging; no paid production infrastructure yet
status: active
area: ops
links:
  related: ["[[HH-NFR-01]]"]
  uses: ["[[INT-Render]]"]
  constrained_by: ["[[RULE-SYNTHETIC-DATA]]"]
source: "vault-own-decisions.md OWN-DEC-25; owner start-decision brief item 3 (2026-10-04)"
---
Owner wording (project chat, 2026-10-04): "use free hosting for development and early staging where practical. A public development/staging environment may use free managed services. Do not create paid production infrastructure yet. Before production, select the final hosting provider, US region, backup strategy, and production data location."

Effect:
- Development and early staging run on free managed services where practical; no paid production infrastructure is created.
- Staging keeps the staging rules: synthetic and disposable data, not indexed, protected access, provider hostnames, host-only cookies.
- Free tiers may sleep, pause or expire; nothing on staging depends on keeping its data.

Partly replaced by [[OWN-DEC-73]]: the whole staging environment is behind an access gate. [[OWN-DEC-130]]: the existing Render staging service is reused for the new repository.

Open:
- Final production hosting provider, US region, backup strategy and data location: [[OQ-PRODUCTION-HOSTING]].
