---
id: HH-PRIV-06
type: requirement
title: "Customers download their retained, customer-visible documents"
status: active
priority: P0
area: privacy
links:
  decided_by: ["[[OWN-DEC-113]]", "[[OWN-DEC-106]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[ENT-Document]]", "[[ENT-ProjectAccessGrant]]"]
  tested_by: ["[[T68]]"]
  part_of: ["[[C11]]", "[[C06]]"]
source: "OWN-DEC-113 (new behaviour; no guide id)"
---
- Through verified project access, customers download their retained, customer-visible documents: estimate versions, approved estimate and terms, approval receipt, change orders, invoices, receipts and care notes.
- Downloads use short-lived authorized links issued after record and visibility checks; internal classes never appear.
