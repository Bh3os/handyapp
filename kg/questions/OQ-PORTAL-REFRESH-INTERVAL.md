---
id: OQ-PORTAL-REFRESH-INTERVAL
type: question
title: How often an open customer project page refreshes itself
status: open
area: portal
links:
  related: ["[[HH-ARC-10]]", "[[OWN-DEC-59]]", "[[TSK-0038]]"]
source: "TSK-0038 (2026-10-21): HH-ARC-10 gives 30-60 seconds by default as a configured value; no decision picks the number"
---
**Question:** which refresh interval should an open customer project page use?

- **Who answers:** the owner (or accept the engineering default).
- **Known:** [[HH-ARC-10]] asks for modest polling, 30-60 seconds by default, as a configured value, paused while the tab is hidden; [[OWN-DEC-59]] keeps the guide's engineering defaults configurable.
- **Until answered (TSK-0038):** the configuration key `portal.refresh` holds `pollSeconds: 30`, marked PROPOSED (`proposed = true`, migration 0036). The page also refreshes when it becomes visible again and when the customer presses Refresh; while the key is NOT CONFIGURED it refreshes only then.
