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

**Built by [[TSK-0151]] (2026-10-24, migration 0098):** a Worker records an on-site collection only with the Owner's collect grant recording their training (the date it was completed and what it covered); the server and the database refuse a collect grant without it, and collect grants made earlier without a training record were ended. PROPOSED details: [[OQ-STAFF-AMENDMENT-DETAILS]].
