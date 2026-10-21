---
id: HH-CHG-02
type: requirement
title: "Workers draft, authorized staff publish, the identified customer approves the exact version"
status: active
priority: P0
area: approval
links:
  decided_by: ["[[OWN-DEC-108]]", "[[OWN-DEC-118]]", "[[OWN-DEC-103]]", "[[OWN-DEC-96]]", "[[OWN-DEC-168]]", "[[OWN-DEC-173]]"]
  depends_on: ["[[HH-ID-07]]"]
  constrained_by: ["[[RULE-SERVER-AUTHZ]]"]
  uses: ["[[ENT-ChangeOrder]]", "[[ENT-Approval]]", "[[ENT-Contact]]", "[[ENT-Message]]"]
  tested_by: ["[[T53]]", "[[T33]]"]
  part_of: ["[[C08]]", "[[S04]]"]
source: "guide 18.1 HH-CHG-02; OWN-DEC-108"
---
- An assigned worker drafts a change order with scope, price in cents, reason and evidence photos or measurements. A draft binds nothing.
- An Estimator or the Owner reviews pricing and eligibility and publishes the customer-facing version; publishing sends the customer a notice linking to it in the workspace.
- The customer approves only the exact current version, through one of two paths:
  - verified project access, with the same rules as estimate approval (terms checkbox unchecked by default, full name, explicit approve action, server recheck, idempotency; [[HH-EST-06]], [[HH-EST-07]]);
  - a customer-specific in-person approval on the worker's phone, where the customer is identified: a one-time code sent to their verified contact, or a staff-verified identity that is recorded.
- A signature alone never identifies the authorized customer and is refused as approval.
- Approval records the version, total, approver identity and method, verified contact and server timestamp. Offline approval is impossible ([[HH-OFF-04]]).
- A worker's or customer's request is recorded but is never approval.

**Changed by [[OWN-DEC-168]], [[OWN-DEC-173]] (2026-10-21):** publishing needs the Owner's approval when the adjustment or revised total exceeds $2,500.00; expired, withdrawn, rejected and superseded change orders cannot be approved.
