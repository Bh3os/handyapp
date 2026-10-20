---
id: ENT-Visit
type: entity
title: "Visit (appointment)"
status: active
area: scheduling
links:
  decided_by: ["[[OWN-DEC-99]]", "[[OWN-DEC-105]]", "[[OWN-DEC-107]]", "[[OWN-DEC-119]]"]
source: "guide 22.1 Visit; 23 (Visit)"
---
One scheduled occurrence of on-site work or an estimate visit. Fields per [[HH-SCH-01]].

**States:** `tentative → confirmed → en_route → arrived → completed`; `tentative → expired`; `confirmed → canceled / no_access`.

**Invariants:** every window it had is kept as history; one current committed version; confirmation needs a database-level reservation ([[ENT-Reservation]]) and the preconditions of [[HH-SCH-06]]; customer requests never change it; a canceled or superseded visit sends no notices.

**Who may change:** Office and Owner confirm, reschedule, reassign and cancel; the assigned worker records On my way, Arrived, Finished and outcomes; the customer selects an offered window.
