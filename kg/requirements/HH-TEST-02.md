---
id: HH-TEST-02
type: requirement
title: Unauthorized-access tests through direct API calls and altered IDs for every actor pair
status: active
priority: P0
area: security
links:
  decided_by: ["[[OWN-DEC-114]]", "[[OWN-DEC-67]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  tested_by: ["[[T19]]", "[[T26]]", "[[T27]]", "[[T64]]", "[[T68]]"]
source: "guide 27.1"
---
Access is tested through direct API calls with altered IDs, not only through the UI, for:
- customer A against customer B;
- guest A against guest B (single-project links);
- assigned against unassigned worker;
- a disabled worker with a previously valid session;
- roles with limited finance permissions (for example a Worker with only the collect permission, or Office/Dispatcher, against refunds, write-offs and exports, which are owner-only, [[OWN-DEC-67]]);
- each staff role of [[OWN-DEC-114]] (Owner, Office/Dispatcher, Estimator, Worker) on sample critical routes;
- the automation identity (background jobs act only within their declared scope).

Each case asserts the neutral refusal and that nothing changed.

**Built by [[TSK-0108]] (2026-10-26):** `apps/server/test/integration/authz-routes.test.ts` reads every route from the booted server's own route table (a route outside the contracts fails it) and calls each one as no session, a customer session, each staff role and two roles together, a disabled account's earlier session, a signed-out session, a session waiting for its second factor and the AI module, then checks the exact decision with its reason on every route that reads no record, a stale sign-in included. `authz-records.test.ts` takes two customers' projects to approved jobs with visits today and calls every customer route and every staff route on both: a link, an account and organization members (each privilege) of A against B, the assigned workers against the unassigned one (with and without the collect grant), every other role on A's records, a stale customer verification, own audit events, B's IDs in A's answers and shared-cache headers. Each refusal checks that nothing was written. The automation identity is not an API caller: its scope stays with each declared automation (`platform/automation.ts`). PROPOSED details: [[OQ-AUTHZ-SUITE-DETAILS]].
