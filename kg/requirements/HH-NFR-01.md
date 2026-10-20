---
id: HH-NFR-01
type: requirement
title: Performance and recovery budgets measured, real capability recorded, no unsupported guarantees
status: active
priority: P0
area: platform
links:
  decided_by: ["[[OWN-DEC-59]]", "[[OWN-DEC-25]]", "[[OWN-DEC-130]]"]
  constrained_by: ["[[RULE-NO-INVENTED-FACTS]]"]
  uses: ["[[INT-Render]]"]
  tested_by: ["[[T72]]"]
source: "guide 26.3, 29.4"
---
Engineering targets to validate (proposals, not measured results or customer promises; configurable values, [[OWN-DEC-59]]):

| Area | Proposed target | Verification |
| --- | --- | --- |
| Public and customer pages | LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1 at field p75, mobile and desktop, once enough real samples exist | Lab proxy first, then consent- and privacy-appropriate field measurement; lab is never reported as field |
| Staff key reads | p95 ≤ 800 ms excluding third-party calls, on representative staging | Dataset: 10,000 jobs, 20 concurrent active users, paginated queries |
| Core writes | p95 ≤ 1.5 s excluding provider waiting | Submission, acceptance, schedule and start tests; external work queued |
| Uploads | Bounded file and memory use; retry keeps the request and completed files | Real phone images, slow and interrupted network, safe processing |
| Update visibility | Refresh after write; queues poll every 30-60 s ([[HH-ARC-10]]) | Last-sync and stale indicators; authoritative checks on actions |
| Recovery | RPO ≤ 15 min, RTO ≤ 4 h for core records, if the infrastructure supports it | Restore drill checks database, media and identity references and reconciliation |
| Availability | 99.5% monthly for the core service (internal target) | Monitoring and recovery evidence; never a marketed SLA |

- If the hosting ([[INT-Render]], free or low-cost tiers, [[OWN-DEC-25]]) cannot meet a recovery or latency target, the actual capability and the accepted trade-off are recorded before launch.
- Nothing customer-facing advertises uptime, speed or recovery guarantees.
- Pages avoid large hero assets, unbounded galleries, unnecessary map loads and heavy third-party scripts, while keeping the premium design.
- Backups include the relational records and the private media (references and bytes) through documented, supported mechanisms. A successful backup notification is not proof of restore: restore drills record the restored version and time, integrity results, elapsed time, missing data and external transactions to reconcile.
