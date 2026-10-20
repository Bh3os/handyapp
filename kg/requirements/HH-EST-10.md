---
id: HH-EST-10
type: requirement
title: "Accepted work is never recalculated"
status: active
priority: P0
area: estimates
links:
  decided_by: ["[[OWN-DEC-105]]", "[[OWN-DEC-118]]"]
  depends_on: ["[[HH-DATA-03]]"]
  uses: ["[[ENT-EstimateVersion]]", "[[ENT-JobScopeSnapshot]]", "[[ENT-ChangeOrder]]", "[[ENT-AuditEvent]]"]
  tested_by: ["[[T35]]", "[[T03]]"]
  part_of: ["[[S04]]"]
source: "guide 13.2 HH-EST-10; OWN-DEC-105"
---
- Later changes to the service catalog, policies or any default never recalculate an accepted version or its job snapshot.
- A material change to scope, price or schedule needs a new approval through a change order ([[HH-CHG-02]]) or, before work is scheduled, a new estimate version with its own approval.
- A controlled correction of an accepted record (for example a typo in a description) writes a superseding correction record with reason, actor and time; the original stays retrievable and is never edited in place.
