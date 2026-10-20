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
