---
id: HH-PORT-06
type: requirement
title: Truthful empty, loading, expired, denied, partial and failure states
status: active
priority: P0
area: portal
links:
  decided_by: ["[[OWN-DEC-106]]"]
  depends_on: ["[[HH-ARC-10]]"]
  constrained_by: ["[[RULE-NO-INVENTED-FACTS]]"]
  uses: ["[[ENT-Project]]", "[[ENT-Message]]", "[[ENT-Payment]]"]
  tested_by: ["[[T71]]"]
  part_of: ["[[C06]]"]
source: "guide 9.2 HH-PORT-06; OWN-DEC-106"
---
- Every workspace section has explicit empty (helpful, explaining what will appear), loading, expired-session, permission-denied, partial-upload, stale-document and network-failure states.
- A failed payment or message is never shown as complete.
- A polling or refresh failure never erases the last confirmed appointment; the section shows its last refreshed time and a stale or error state.
