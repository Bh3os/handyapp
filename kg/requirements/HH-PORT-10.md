---
id: HH-PORT-10
type: requirement
title: Documents tab distinguishes current, approved, expired and superseded versions
status: active
priority: P0
area: portal
links:
  decided_by: ["[[OWN-DEC-106]]", "[[OWN-DEC-105]]", "[[OWN-DEC-113]]", "[[OWN-DEC-126]]", "[[OWN-DEC-127]]"]
  depends_on: ["[[HH-PORT-01]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]", "[[RULE-LANGUAGES]]", "[[RULE-SYNTHETIC-DATA]]"]
  uses: ["[[ENT-Document]]", "[[ENT-EstimateVersion]]", "[[ENT-Invoice]]", "[[ENT-ChangeOrder]]", "[[FACT-BUSINESS-NAME]]", "[[INT-R2]]"]
  tested_by: ["[[T32]]", "[[T58]]"]
  part_of: ["[[C06]]", "[[C10]]", "[[C11]]"]
source: "OWN-DEC-106, OWN-DEC-105, OWN-DEC-113, OWN-DEC-126"
---
- The Documents tab lists estimate revisions, the approved estimate and its terms, the approval receipt (PDF), change orders, invoices, receipts and care notes.
- Each document clearly shows whether it is current, approved, expired or superseded.
- The customer can view and download retained, customer-visible documents through verified access at any time, including after completion. Downloads use short-lived authorized links issued after record and visibility checks.
- On staging every estimate, approval receipt, invoice and receipt carries "TEST — not a real invoice or estimate".
