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
  related: ["[[OQ-DASHBOARD-DETAILS]]"]
source: "guide 20.5 HH-FIN-16"
---
- The Owner exports CSV files of invoices, payment allocations, tenders and refunds, deposits, Square fees and payout references recorded by hand, Arrived/Finished timestamps and job-cost inputs.
- Exports require a fresh sign-in and are audited; cells starting with `=`, `+`, `-` or `@` are prefixed so they cannot run as formulas.
- The export never claims to replace an accounting system or the accountant's tax review.

**Built by [[TSK-0096]] (2026-10-26):** the dashboard's "Files for the accountant" (`POST /staff/accounting/exports`, `export.accounting`: the Owner with a fresh sign-in and a reason, audited with dataset, period and row count): invoices with their ledger, payments (tenders), payment allocations, refunds/credits/write-offs as recorded, deposits, Square fees, payouts, job-cost entries and the Arrived/Finished file of [[TSK-0070]]; exact dollars from integer cents, formula-safe cells, and the screen says the files replace neither an accounting system nor the accountant's tax review. Revenue recognition, tax treatment and write-off presentation stay NOT CONFIGURED. PROPOSED details: [[OQ-DASHBOARD-DETAILS]].
