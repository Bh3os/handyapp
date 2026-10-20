---
id: HH-TEST-03
type: requirement
title: Tests for races, stale versions, duplicates, provider reordering, interruptions, zones, packet and language changes; real evidence
status: active
priority: P0
area: platform
links:
  tested_by: ["[[T11]]", "[[T34]]", "[[T38]]", "[[T41]]", "[[T44]]", "[[T51]]", "[[T65]]", "[[T70]]"]
source: "guide 27.1"
---
- Tests cover: concurrent requests (races), stale versions, double submits, provider duplicates and reordering (Bird and Resend webhooks), network interruption, partial success, clock and time-zone boundaries (DST), critical packet changes and staff language changes.
- Evidence records the actual commands, environment and results. A passing statement is never written without a run that produced it; known pre-existing failures are listed separately.
