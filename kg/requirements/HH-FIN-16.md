---
id: HH-FIN-16
type: requirement
title: "Accountant-ready exports under permission"
status: active
priority: P0
area: payments
links:
  decided_by: ["[[OWN-DEC-69]]"]
  constrained_by: ["[[RULE-HUMAN-REVIEW]]"]
  uses: ["[[ENT-Invoice]]", "[[ENT-Payment]]", "[[ENT-TimeStamp]]", "[[ROLE-OWNER]]"]
  tested_by: ["[[T64]]", "[[T73]]"]
  part_of: ["[[S11]]"]
source: "guide 20.5 HH-FIN-16"
---
- The Owner exports CSV files of invoices, payment allocations, tenders and refunds, deposits, Square fees and payout references recorded by hand, Arrived/Finished timestamps and job-cost inputs.
- Exports require a fresh sign-in and are audited; cells starting with `=`, `+`, `-` or `@` are prefixed so they cannot run as formulas.
- The export never claims to replace an accounting system or the accountant's tax review.
