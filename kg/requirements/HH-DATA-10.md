---
id: HH-DATA-10
type: requirement
title: Reports and exports define their source states; no mixed "cash"; unknown cost marked incomplete
status: active
priority: P0
area: ops
links:
  decided_by: ["[[OWN-DEC-125]]"]
  constrained_by: ["[[RULE-MONEY-CENTS]]"]
  uses: ["[[ENT-Invoice]]", "[[ENT-Payment]]"]
  tested_by: ["[[T73]]"]
  part_of: ["[[S11]]"]
source: "guide 22.2; OWN-DEC-125"
---
- Every report, dashboard figure and export states which records and states it includes.
- Pending checks, failed charges, estimates, invoices, fees and payouts are never added together as "cash". Invoiced amounts are distinct from money received; deposits are never counted twice; overdue balances are shown separately ([[OWN-DEC-125]]).
- Unknown or missing data (for example missing cost inputs) shows as "unavailable" or "incomplete", never as zero.
- Estimate counts count revisions under their estimate, without inflating totals.
- CSV exports use clear column names, match the on-screen totals for the same filters, and are safe against CSV injection (cells starting with `=`, `+`, `-` or `@` are neutralized).
