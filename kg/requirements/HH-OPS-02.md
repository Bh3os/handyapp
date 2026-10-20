---
id: HH-OPS-02
type: requirement
title: Queue items with reference, status, owner, age, reason, one action and deep link; role-scoped search and masking
status: active
priority: P0
area: ops
links:
  decided_by: ["[[OWN-DEC-115]]"]
  depends_on: ["[[HH-OPS-01]]", "[[HH-API-05]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  tested_by: ["[[T26]]", "[[T68]]"]
  part_of: ["[[S01]]"]
source: "guide 11.1; OWN-DEC-115"
---
- Each queue item shows: the project or customer reference, current status, the assigned staff member, age or due time, the reason, one clear action button, and a deep link to the record.
- Search, filters and pagination apply the caller's role and record scope on the server.
- Restricted fields (access codes, incident details, financial details, internal notes) are removed or masked in list and search results exactly as on detail screens.
