---
id: HH-TEST-03
type: requirement
title: Tests for races, stale versions, duplicates, provider reordering, interruptions, zones, packet and language changes; real evidence
status: active
priority: P0
area: platform
links:
  tested_by: ["[[T11]]", "[[T34]]", "[[T38]]", "[[T41]]", "[[T44]]", "[[T51]]", "[[T65]]", "[[T70]]", "[[T12]]", "[[T46]]", "[[T59]]", "[[T67]]"]
source: "guide 27.1"
---
- Tests cover: concurrent requests (races), stale versions, double submits, provider duplicates and reordering (Bird and Resend webhooks), network interruption, partial success, clock and time-zone boundaries (DST), critical packet changes and staff language changes.
- Evidence records the actual commands, environment and results. A passing statement is never written without a run that produced it; known pre-existing failures are listed separately.

**Built by [[TSK-0107]] (2026-10-26):** the cross-cutting suite `apps/server/test/integration/robustness.test.ts`: writes that fail half-way (fault injected at the outbox insert), a database connection ended mid-write, a client retry while the first write runs, a race of four writes on one version, and every automation over a whole fictional business under crashes, lost provider answers, two workers, out-of-order and repeated provider callbacks, replayed events and second runs. Its commands, environment and results are in the task's notes.
