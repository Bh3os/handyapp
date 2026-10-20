---
id: HH-ARC-03
type: requirement
title: Server owns authorization, totals, eligibility, acceptance, capacity, gates, visibility and transitions
status: active
priority: P0
area: platform
links:
  depends_on: ["[[HH-ARC-02]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]", "[[RULE-SAFETY-GATES]]", "[[RULE-MONEY-CENTS]]"]
  tested_by: ["[[T10]]", "[[T24]]", "[[T33]]", "[[T46]]"]
source: "guide 3.1"
---
The server decides, and the browser only presents and collects input, for:
- authorization of every read and write;
- money totals, deposits and balances (recomputed on the server; a client-sent total is only compared, never trusted);
- service eligibility and coverage outcome;
- estimate and change-order acceptance;
- scheduling capacity and conflicts;
- the Start Work gate and holds;
- field visibility (what each audience may receive);
- state transitions.

Hiding a button, a menu item or a route in the frontend is never permission enforcement. A hidden route requested directly is still refused by the server. A manipulated client request (changed price, total, ID, role or state) is rejected server-side with a safe error.
