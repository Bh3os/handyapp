---
id: HH-FIN-12
type: requirement
title: "Checks stay pending until cleared"
status: active
priority: P0
area: payments
links:
  decided_by: ["[[OWN-DEC-104]]", "[[OWN-DEC-111]]", "[[OWN-DEC-09]]"]
  uses: ["[[ENT-Payment]]", "[[ENT-DepositRequirement]]"]
  tested_by: ["[[T62]]", "[[T59]]"]
  part_of: ["[[C10]]", "[[S01]]"]
source: "guide 20.4 HH-FIN-12; 23 (Check tender)"
---
- A check records the minimal reference (check number) and payer name, collector, amount, received date and invoice.
- Check states: `received → deposited → cleared`; `received / deposited → returned / voided`.
- A check is never marked cleared on physical receipt. Until cleared it shows as pending in the workspace and staff screens, does not count toward Paid and does not satisfy a deposit (unless the Owner waives the deposit).
- Full bank account details and check images are not stored.
- Checks to verify appear in the staff action queue.
