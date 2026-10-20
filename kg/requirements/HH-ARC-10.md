---
id: HH-ARC-10
type: requirement
title: Refresh after writes and modest polling with last-refreshed and stale states
status: active
priority: P0
area: platform
links:
  decided_by: ["[[OWN-DEC-115]]", "[[OWN-DEC-59]]", "[[OWN-DEC-122]]"]
  depends_on: ["[[HH-ARC-03]]"]
  tested_by: ["[[T42]]"]
  part_of: ["[[S01]]", "[[C06]]"]
source: "guide 3.3, 26.3; OWN-DEC-115"
---
- After a write, the screens it affects refresh from the server.
- Visible queues and status views poll at a modest interval, 30-60 seconds by default (a configured value, [[OWN-DEC-59]]), and pause while the browser tab is hidden.
- Each such view shows its last-refreshed time, and a clear stale or error state when refreshing fails.
- Automatic refresh never interrupts an open form: no remount, focus and typed input are kept. New items appear in place outside the item being edited, or behind a "N new items — refresh" notice ([[OWN-DEC-115]]).
- Financial and safety actions always fetch the authoritative current state on the server before they commit, whatever the screen showed.
- Realtime subscriptions are P1 and only if justified.
