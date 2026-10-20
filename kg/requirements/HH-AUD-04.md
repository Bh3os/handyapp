---
id: HH-AUD-04
type: requirement
title: Vertical slices with real persistence and meaningful behaviour tests; definition of done
status: active
priority: P0
area: platform
links:
  constrained_by: ["[[RULE-SERVER-AUTHZ]]", "[[RULE-MONEY-CENTS]]", "[[RULE-SAFETY-GATES]]", "[[RULE-LANGUAGES]]"]
  tested_by: ["[[T19]]", "[[T33]]", "[[T34]]", "[[T38]]", "[[T59]]"]
  related: ["[[HH-TEST-01]]"]
source: "guide 2.1, 28, 30.4"
---
- Each slice is built end to end: interface, server rules, persistence, notifications and verification. Screens on fake data never count as a finished platform.
- Money, authorization, identity linking, versioned approvals and scheduling concurrency are proven with meaningful behaviour tests, not markup mirrors.
- No arbitrary deadline is placed on authentication, money or safety correctness. Incomplete consequential actions stay disabled with a clear reason or out of navigation.

Slice order and gates (guide 28): 0 audit and decisions (gate T02-T04, T75); 1 shared foundation and staff access (T26-T28, T68, T74); 2 request to staff intake (T01, T05-T16, T30); 3 secure project access and optional account (T16-T24, T66, T68); 4 reviewed estimates and exact acceptance (T02-T03, T31-T36); 5 visits and capacity (T25, T37-T42); 6 worker packet and execution (T40, T43-T52, T70); 7 changes, incidents, quality, return work (T53-T57, T67); 8 invoices and payment integrity (T58-T64, T73); 9 hardening, training and pilot (T01-T75 as applicable, limitations recorded, no placeholder exposed as live). Later P1/P2 work (saved properties, recurrence, inventory, realtime, passkeys, AI drafting, organization memberships) needs justification by actual use; live GPS, route optimization, full offline consequential writes, branches and microservices need separate decisions.

A feature is done only when (guide 30.4):
1. its customer or staff outcome works on real, persistent, shared records;
2. server authorization, visibility, transitions, version and concurrency rules and the relevant invariants are implemented;
3. empty, loading, error, stale, duplicate and recovery states are truthful and usable;
4. customer English and staff EN/ES rules are met; Spanish safety text is released only as "AI-reviewed" after a passing comparison ([[HH-LANG-04]]);
5. no minimum-charge adjustment returns through defaults, templates, calculators or seeds;
6. relevant tests have recorded passing evidence, with existing failures and limitations kept apart;
7. no sensitive data, media or secret leaks through UI, API, search, cache, export, notifications or logs;
8. migrations are validated, history is preserved, operational exceptions are visible, and recovery or rollback is documented;
9. the premium design and unrelated working features keep their behaviour;
10. documentation, traceability and configuration status match what is actually implemented, configured, verified and active.

The platform is ready for a controlled operational release only after a synthetic customer completes the whole request-to-closeout journey and representative customer and staff roles pass the negative permission, finance, schedule, packet, language and recovery tests. Remaining limitations are recorded; zero defects or absolute security are never promised.
