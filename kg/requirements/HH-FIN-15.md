---
id: HH-FIN-15
type: requirement
title: "Reconciliation queue for unmatched and uncertain money"
status: active
priority: P0
area: payments
links:
  decided_by: ["[[OWN-DEC-111]]"]
  uses: ["[[ENT-Payment]]", "[[ENT-Refund]]", "[[ROLE-OWNER]]"]
  tested_by: ["[[T61]]", "[[T63]]"]
  part_of: ["[[S01]]", "[[S11]]"]
source: "guide 20.5 HH-FIN-15"
---
- A reconciliation queue lists unmatched payments, amount or currency mismatches, pending and returned checks, disputes, duplicate entries, Square payments with a reference that does not match, and uncertain charge or refund outcomes.
- The Owner (or Office for routine matching) resolves each with evidence; the resolution is recorded and audited.
