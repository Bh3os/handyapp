---
id: HH-FIN-11
type: requirement
title: "Cash collection recorded with collector, receipt and reconciliation state"
status: active
priority: P0
area: payments
links:
  decided_by: ["[[OWN-DEC-67]]", "[[OWN-DEC-111]]", "[[OWN-DEC-200]]"]
  uses: ["[[ENT-Payment]]", "[[ENT-Message]]", "[[FACT-AUTOMATIC-MESSAGES]]"]
  tested_by: ["[[T62]]"]
  part_of: ["[[C10]]", "[[S07]]"]
source: "guide 20.4 HH-FIN-11"
---
- A cash payment records amount in cents and currency, collector, received time, job and invoice, receipt number, optional memo and reconciliation state.
- Staff controls record a verified on-site payment and send the receipt immediately.
- Recording the receipt is separate from the later bank deposit and reconciliation; the collector cannot edit or reverse the payment after submitting it.

**Changed by [[OWN-DEC-200]] (2026-10-21):** only a Worker with an explicit Owner grant recording their training may collect cash.
